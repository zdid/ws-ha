/**
 * RfxComService
 *
 * Orchestrateur principal de l'application RFXCOM : cycle de vie du transceiver, détection et
 * classification des devices, routage émetteur↔récepteur, intégration MQTT via les événements
 * EventBus du socle (découverte normale, pas Passthrough — voir le plan d'implémentation).
 *
 * Couche : Domaine (Métier) — orchestration uniquement, délègue à DeviceManager/ReceiverManager/
 * RfxComTransceiver/ConfigFileManager.
 */

import * as path from 'node:path';
import type { IEventBus, Logger, IAppConfigProvider, EssentialEntityData } from '../../../core/src/exports';
import { createRfxComError } from '../../../core/src/exports';
import { rfxcomConfigSchema, type RfxComConfig } from './config-schema';
import type { RfxComDevicesConfigFile, ReceiverConfigEntry } from './devices-config-schema';
import type { RfxComRawMessage, RfxComStatus, RfxComDeviceInfo, ReceiverConfig } from './types';
import { DeviceManager } from './devices/DeviceManager';
import { ReceiverManager } from './receivers/ReceiverManager';
import { RfxComTransceiver } from './transceiver/RfxComTransceiver';
import { ConfigFileManager } from './yaml/ConfigFileManager';
import { getDefaultComponent, getDefaultUnit, buildStateDeviceId } from './classification';
import { extractTaxonomy, buildAttributsTaxonomie } from './taxonomy';

const MODULE_NAME = 'rfxcom';

export interface IRfxComService {
  start(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): RfxComStatus;
}

export class RfxComService implements IRfxComService {
  private config: RfxComConfig;
  private devicesConfig: RfxComDevicesConfigFile;
  private configFileManager: ConfigFileManager;
  private deviceManager: DeviceManager;
  private receiverManager: ReceiverManager;
  private transceiver: RfxComTransceiver;

  private lastDiscovery: string | null = null;

  constructor(
    private readonly eventBus: IEventBus,
    private readonly logger: Logger,
    private readonly configProvider: IAppConfigProvider<RfxComConfig>
  ) {
    this.config = this.loadConfig();
    this.configFileManager = new ConfigFileManager(this.resolveDevicesConfigPath(), this.logger);
    this.devicesConfig = { rfxcom_devices: {}, rfxcom_receivers: {} };
    this.deviceManager = new DeviceManager(this.logger);
    this.receiverManager = new ReceiverManager(this.deviceManager, this.logger);
    this.transceiver = new RfxComTransceiver(this.logger);
  }

  private resolveDevicesConfigPath(): string {
    const dataDir = path.join(process.env.PROJECT_ROOT || process.cwd(), 'data');
    return path.join(dataDir, this.config.devicesConfigFile);
  }

  /**
   * Charge la config depuis le provider et applique les valeurs par défaut du schéma (le
   * provider retourne {} si la section 'rfxcom' n'existe pas encore dans config.yaml — première
   * installation, jamais configuré via l'UI).
   */
  private loadConfig(): RfxComConfig {
    return rfxcomConfigSchema.parse(this.configProvider.getAppConfig());
  }

  // ==========================================================================
  // Cycle de vie
  // ==========================================================================

  async start(): Promise<void> {
    this.logger.info('RfxComService', 'Démarrage du service RFXCOM...');

    this.devicesConfig = this.configFileManager.load();
    this.deviceManager.loadConfigured(this.devicesConfig.rfxcom_devices);
    this.receiverManager.loadReceivers(this.devicesConfig.rfxcom_receivers);

    this.setupSocleEventListeners();
    this.setupSocketEventListeners();

    this.eventBus.emitGeneric('integration:bridge:register', {
      moduleName: MODULE_NAME,
      bridgeInstance: this.config.bridgeInstance
    });

    // ⚠️ Limitation connue : si le transceiver perd le matériel (ex: USB débranché) sans que la
    // connexion MQTT elle-même ne tombe, le LWT ne se déclenche pas automatiquement — IntegrationBridge
    // n'expose pas encore d'événement EventBus pour un flip manuel (MqttTransport.publishStatus()
    // existe côté socle mais n'est atteignable que via une référence directe au service, pas via
    // l'EventBus). Hors périmètre de cette passe, voir le rapport final.
    this.transceiver.onMessage((message) => this.handleRfxMessage(message));
    this.transceiver.onConnectionChange(() => this.emitStatus());

    try {
      await this.transceiver.connect({ port: this.config.port, baudRate: this.config.baudRate });
      this.publishInitialDiscoveries();
    } catch (error) {
      // Conforme implementation-rfxcom_specs §11.1 : échec de connexion = WARNING, pas de crash.
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn('RfxComService', `Transceiver RFXCOM indisponible au démarrage: ${message}`);
      this.eventBus.emitGeneric('rfxcom:error',
        createRfxComError('RFXCOM_CONNECTION_ERROR', message, 'rfxcom:transceiver', { port: this.config.port }));
    }

    this.emitStatus();
    this.emitDevicesList();
    this.emitReceiversList();

    this.logger.info('RfxComService', 'Service RFXCOM démarré');
  }

  async stop(): Promise<void> {
    this.logger.info('RfxComService', 'Arrêt du service RFXCOM...');
    this.transceiver.disconnect();
    this.eventBus.emitGeneric('integration:bridge:unregister', {
      moduleName: MODULE_NAME,
      bridgeInstance: this.config.bridgeInstance
    });
    this.emitStatus();
    this.logger.info('RfxComService', 'Service RFXCOM arrêté');
  }

  // ==========================================================================
  // Écoute des événements du socle (MQTT via IntegrationBridge)
  // ==========================================================================

  private setupSocleEventListeners(): void {
    this.eventBus.onGeneric<{ bridgeInstance: string; deviceId: string; command: Record<string, unknown> }>(
      `integration:${MODULE_NAME}:command`,
      (event) => this.handleHaCommand(event.deviceId, event.command)
    );

    this.eventBus.onGeneric<{ bridgeInstance: string; connected: boolean }>(
      `integration:${MODULE_NAME}:bridge:connection`,
      () => this.emitStatus()
    );
  }

  // ==========================================================================
  // Réception RF433
  // ==========================================================================

  private handleRfxMessage(message: RfxComRawMessage): void {
    const { uniqueId, isNew } = this.deviceManager.handleRawMessage(message);

    if (isNew) {
      this.eventBus.emitGeneric('rfxcom:device:detected', { device: this.deviceManager.getDiscoveredDevices().find((d) => d.uniqueId === uniqueId) });
    }

    const isEmitter = message.type.startsWith('Lighting');
    if (isEmitter) {
      const affectedReceivers = this.receiverManager.handleEmitterMessage(uniqueId);
      for (const receiver of affectedReceivers) {
        this.publishReceiverState(receiver);
      }

      // L'émetteur lui-même (binary_sensor) peut aussi être exposé à HA si transmitToHa
      const emitterDevice = this.deviceManager.getDevice(uniqueId);
      if (emitterDevice?.transmitToHa) {
        this.publishDeviceState(emitterDevice, message);
      }
      return;
    }

    // Capteur / compteur : publie son propre état si paramétré + transmitToHa
    const device = this.deviceManager.getDevice(uniqueId);
    if (device?.transmitToHa) {
      this.publishDeviceState(device, message);
    }
  }

  // ==========================================================================
  // Discovery / State — devices physiques
  // ==========================================================================

  private publishInitialDiscoveries(): void {
    for (const device of this.deviceManager.getConfiguredDevices()) {
      if (device.transmitToHa) {
        this.publishDeviceDiscovery(device);
      }
    }
    for (const receiver of this.receiverManager.getAllReceivers()) {
      if (receiver.config.transmitToHa) {
        this.publishReceiverDiscovery(receiver.config.receiverId);
      }
    }
    this.lastDiscovery = new Date().toISOString();
  }

  private publishDeviceDiscovery(device: RfxComDeviceInfo): void {
    const taxonomy = extractTaxonomy(device.name);
    const { component, deviceClass } = getDefaultComponent(device.type, device.subType);
    const deviceId = buildStateDeviceId(device.protocole, device.subType, device.sensorId, device.unitCode);

    const essential: EssentialEntityData = {
      name: taxonomy.rawQuoi,
      deviceClass,
      unitOfMeasurement: getDefaultUnit(device.subType),
      device: {
        identifiers: [device.uniqueId],
        name: `RFXCOM ${device.type} ${device.subType}`,
        manufacturer: 'RFXCOM',
        model: device.protocole.toUpperCase()
      },
      extra: { attributs_taxonomie: buildAttributsTaxonomie(taxonomy) }
    };

    this.eventBus.emitGeneric(`integration:${MODULE_NAME}:discovery`, {
      bridgeInstance: this.config.bridgeInstance,
      component,
      objectId: device.uniqueId,
      deviceId,
      essential
    });
  }

  private publishDeviceState(device: RfxComDeviceInfo, message: RfxComRawMessage): void {
    const deviceId = buildStateDeviceId(device.protocole, device.subType, device.sensorId, device.unitCode);
    const stateValue = this.extractStateValue(device.subType, message);

    this.eventBus.emitGeneric(`integration:${MODULE_NAME}:state`, {
      bridgeInstance: this.config.bridgeInstance,
      deviceId,
      state: {
        state: stateValue,
        attributes: {
          signal_level: message.signalLevel,
          battery_level: message.batteryLevel,
          sensor_id: device.uniqueId,
          device_id: device.uniqueId
        }
      }
    });
  }

  private extractStateValue(subType: string, message: RfxComRawMessage): string | number {
    switch (subType) {
      case 'Temperature': return message.data.temperature as number;
      case 'Humidity': return message.data.humidity as number;
      case 'Current': return message.data.current as number;
      case 'Power': return message.data.power as number;
      case 'Motion':
      case 'Contact':
        return message.data.deviceStatus === 0 ? 'ON' : 'OFF';
      default:
        return typeof message.data.command === 'string' && message.data.command.toLowerCase() === 'on' ? 'ON' : 'OFF';
    }
  }

  // ==========================================================================
  // Discovery / State — récepteurs logiques
  // ==========================================================================

  private publishReceiverDiscovery(receiverId: string): void {
    const receiver = this.receiverManager.getReceiver(receiverId);
    if (!receiver) return;

    const { component, essential } = receiver.getDiscoveryEssential();
    this.eventBus.emitGeneric(`integration:${MODULE_NAME}:discovery`, {
      bridgeInstance: this.config.bridgeInstance,
      component,
      objectId: receiver.config.receiverId,
      deviceId: receiver.config.receiverId,
      essential
    });
  }

  private publishReceiverState(receiver: ReturnType<ReceiverManager['getReceiver']>): void {
    if (!receiver) return;
    this.eventBus.emitGeneric(`integration:${MODULE_NAME}:state`, {
      bridgeInstance: this.config.bridgeInstance,
      deviceId: receiver.config.receiverId,
      state: receiver.getState()
    });
  }

  // ==========================================================================
  // Commandes HA → récepteur → device RFXCOM
  // ==========================================================================

  private handleHaCommand(deviceId: string, payload: Record<string, unknown>): void {
    const receiver = this.receiverManager.getReceiver(deviceId);
    if (!receiver) {
      this.logger.warn('RfxComService', `Commande reçue pour un récepteur inconnu: ${deviceId}`);
      return;
    }

    const parsed = this.parseHaCommandPayload(payload);
    if (!parsed) {
      this.logger.warn('RfxComService', `Commande non reconnue pour ${deviceId}: ${JSON.stringify(payload)}`);
      return;
    }

    const result = receiver.translateHaCommand(parsed.command, parsed.value);
    if (!result) {
      this.logger.debug('RfxComService', `Commande ${parsed.command} ignorée pour ${deviceId} (état inchangé ou non supportée)`);
      return;
    }

    const primaryDevice = this.deviceManager.getDevice(receiver.config.primaryEmitter);
    if (!primaryDevice || !primaryDevice.commandDeviceId) {
      this.logger.error('RfxComService',
        `primaryEmitter ${receiver.config.primaryEmitter} introuvable ou jamais vu en émission pour ${deviceId}`);
      return;
    }

    try {
      this.transceiver.sendCommand(
        primaryDevice.protocole,
        primaryDevice.subType,
        primaryDevice.commandDeviceId,
        result.action as 'on' | 'off' | 'set_level' | 'open' | 'close' | 'stop',
        result.value
      );
      this.publishReceiverState(receiver);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('RfxComService', `Échec d'envoi de la commande RF433 pour ${deviceId}: ${message}`);
      this.eventBus.emitGeneric('rfxcom:error',
        createRfxComError('RFXCOM_COMMAND_FAILED', message, 'rfxcom:command', { deviceId }));
    }
  }

  /** Traduit le payload JSON générique `/set` du socle (state/brightness/position) en commande interne. */
  private parseHaCommandPayload(payload: Record<string, unknown>): { command: string; value?: number } | null {
    if (typeof payload.position === 'number') {
      return { command: 'set_position', value: payload.position };
    }
    if (payload.state === 'OPEN') return { command: 'open' };
    if (payload.state === 'CLOSE') return { command: 'close' };
    if (payload.state === 'STOP') return { command: 'stop' };
    if (typeof payload.brightness === 'number' && payload.state === 'ON') {
      return { command: 'set_level', value: Math.round(((payload.brightness as number) / 255) * 100) };
    }
    if (payload.state === 'ON') return { command: 'turn_on' };
    if (payload.state === 'OFF') return { command: 'turn_off' };
    return null;
  }

  // ==========================================================================
  // Statut / événements persistants
  // ==========================================================================

  getStatus(): RfxComStatus {
    return {
      connected: this.transceiver.isConnected(),
      devicesCount: this.deviceManager.getConfiguredDevices().length,
      receiversCount: this.receiverManager.getAllReceivers().length,
      lastDiscovery: this.lastDiscovery,
      scanInProgress: false
    };
  }

  private emitStatus(): void {
    this.eventBus.emitGeneric('rfxcom:status', this.getStatus());
  }

  private emitDevicesList(): void {
    this.eventBus.emitGeneric('rfxcom:devices:list', {
      configured: this.deviceManager.getConfiguredDevices(),
      discovered: this.deviceManager.getDiscoveredDevices()
    });
  }

  private emitReceiversList(): void {
    this.eventBus.emitGeneric('rfxcom:receivers:list', { receivers: this.receiverManager.getAllReceivers().map((r) => r.config) });
  }

  // ==========================================================================
  // Socket.io (via SocketBridge, EventBus générique)
  // ==========================================================================

  private setupSocketEventListeners(): void {
    this.eventBus.onGeneric('rfxcom:status:get', () => this.emitStatus());
    this.eventBus.onGeneric('rfxcom:devices:list:get', () => this.emitDevicesList());
    this.eventBus.onGeneric('rfxcom:receivers:list:get', () => this.emitReceiversList());

    this.eventBus.onGeneric('rfxcom:devices:refresh', () => this.emitDevicesList());

    this.eventBus.onGeneric('rfxcom:devices:clear-unconfigured', () => {
      const count = this.deviceManager.clearUnconfigured();
      this.logger.info('RfxComService', `${count} device(s) auto-découvert(s) effacé(s)`);
      this.emitDevicesList();
    });

    this.eventBus.onGeneric<{ uniqueId: string; name: string }>('rfxcom:device:set_name', (data) => {
      const device = this.deviceManager.setDeviceName(data.uniqueId, data.name);
      this.persistDevicesConfig();
      if (device.transmitToHa) this.publishDeviceDiscovery(device);
      this.emitDevicesList();
    });

    this.eventBus.onGeneric<{ uniqueId: string; transmitToHa: boolean }>('rfxcom:device:set_transmit', (data) => {
      const device = this.deviceManager.setTransmitToHa(data.uniqueId, data.transmitToHa);
      if (!device) {
        this.logger.warn('RfxComService', `Device inconnu pour set_transmit: ${data.uniqueId}`);
        return;
      }
      this.persistDevicesConfig();
      if (device.transmitToHa) this.publishDeviceDiscovery(device);
      this.emitDevicesList();
    });

    this.eventBus.onGeneric<{ config: ReceiverConfig }>('rfxcom:receiver:create', (data) => {
      this.receiverManager.addReceiver(data.config);
      this.persistDevicesConfig();
      if (data.config.transmitToHa) this.publishReceiverDiscovery(data.config.receiverId);
      this.emitReceiversList();
      this.eventBus.emitGeneric('rfxcom:receiver:created', { receiver: data.config });
    });

    this.eventBus.onGeneric<{ receiverId: string; config: Partial<ReceiverConfig> }>('rfxcom:receiver:update', (data) => {
      const existing = this.receiverManager.getReceiver(data.receiverId);
      if (!existing) {
        this.logger.warn('RfxComService', `Récepteur inconnu pour mise à jour: ${data.receiverId}`);
        return;
      }
      const updated = { ...existing.config, ...data.config } as ReceiverConfig;
      this.receiverManager.removeReceiver(data.receiverId);
      this.receiverManager.addReceiver(updated);
      this.persistDevicesConfig();
      if (updated.transmitToHa) this.publishReceiverDiscovery(updated.receiverId);
      this.emitReceiversList();
      this.eventBus.emitGeneric('rfxcom:receiver:updated', { receiver: updated });
    });

    this.eventBus.onGeneric<{ receiverId: string }>('rfxcom:receiver:delete', (data) => {
      this.receiverManager.removeReceiver(data.receiverId);
      this.persistDevicesConfig();
      this.emitReceiversList();
      this.eventBus.emitGeneric('rfxcom:receiver:deleted', { receiverId: data.receiverId });
    });

    this.eventBus.onGeneric('rfxcom:config:get', () => {
      this.eventBus.emitGeneric('rfxcom:config:get:response', this.config);
    });

    this.eventBus.onGeneric<Partial<RfxComConfig>>('rfxcom:config:save', async (partial) => {
      const result = await this.configProvider.savePartialConfig(partial as RfxComConfig);
      this.config = this.loadConfig();
      this.eventBus.emitGeneric('rfxcom:config:save:response', { success: true, config: this.config });
      void result;
    });
  }

  /** Sauvegarde l'état courant des devices/récepteurs dans config-rfxcom-devices-v1.0.yaml. */
  private persistDevicesConfig(): void {
    const receivers: Record<string, ReceiverConfigEntry> = {};
    for (const receiver of this.receiverManager.getAllReceivers()) {
      receivers[receiver.config.receiverId] = receiver.config as ReceiverConfigEntry;
    }
    const result = this.configFileManager.save({
      rfxcom_devices: this.deviceManager.getConfiguredDevicesRecord(),
      rfxcom_receivers: receivers
    });
    if (!result.success) {
      this.logger.error('RfxComService', `Échec de sauvegarde de la configuration RFXCOM: ${result.error}`);
    }
  }

  static create(
    eventBus: IEventBus,
    logger: Logger,
    configProvider: IAppConfigProvider<RfxComConfig>
  ): RfxComService {
    return new RfxComService(eventBus, logger, configProvider);
  }
}
