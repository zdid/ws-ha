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
import { createRfxComError, getCommandTopic } from '../../../core/src/exports';
import { rfxcomConfigSchema, type RfxComConfig } from './config-schema';
import type { RfxComDevicesConfigFile, ReceiverConfigEntry } from './devices-config-schema';
import type { RfxComRawMessage, RfxComStatus, RfxComDeviceInfo, ReceiverConfig, ReceiverSceneConfig, SceneExecutionResult } from './types';
import { DeviceManager } from './devices/DeviceManager';
import { ReceiverManager } from './receivers/ReceiverManager';
import { SceneManager } from './scenes/SceneManager';
import { SceneExecutor } from './scenes/SceneExecutor';
import { RfxComTransceiver } from './transceiver/RfxComTransceiver';
import { ConfigFileManager } from './yaml/ConfigFileManager';
import { getDefaultComponent, getDefaultUnit, buildStateDeviceId } from './classification';
import { extractTaxonomy, buildAttributsTaxonomie } from './taxonomy';

const MODULE_NAME = 'rfxcom';
/** Préfixe du deviceId d'une scène dans les topics MQTT (fonctionnelles-rfxcom_specs §14.3.4). */
const SCENE_DEVICE_ID_PREFIX = 'scene_';

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
  private sceneManager: SceneManager;
  private sceneExecutor: SceneExecutor;
  private transceiver: RfxComTransceiver;

  private lastDiscovery: string | null = null;
  /** Scènes dont l'exécution séquentielle en cours doit s'arrêter à la prochaine étape. */
  private cancelledScenes: Set<string> = new Set();

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
    this.sceneManager = new SceneManager(this.logger);
    this.sceneExecutor = new SceneExecutor(this.logger);
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
    this.sceneManager.loadScenes(this.devicesConfig.rfxcom_receivers);

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
    this.emitScenesList();

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
    for (const scene of this.sceneManager.getAllScenes()) {
      if (scene.transmitToHa) {
        this.publishSceneDiscovery(scene);
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
  // Discovery / State — scènes
  // ==========================================================================

  /**
   * Publiée comme automatisation HA (déclenchement, pas d'état commandable classique) —
   * fonctionnelles-rfxcom_specs §14.3.4. ⚠️ Simplification connue : le schéma HA canonique du
   * component `device_automation` utilise deux segments d'identifiant dans le topic de découverte
   * (device_id/trigger_id) ; le socle ne construit qu'un objectId unique, comme pour tous les
   * autres components — non vérifié contre une instance HA réelle (seul le broker MQTT l'a été).
   */
  private publishSceneDiscovery(scene: ReceiverSceneConfig): void {
    const taxonomy = extractTaxonomy(scene.name);
    const deviceId = `${SCENE_DEVICE_ID_PREFIX}${scene.receiverId}`;
    const commandTopic = getCommandTopic(MODULE_NAME, this.config.bridgeInstance, deviceId);

    const essential: EssentialEntityData = {
      name: taxonomy.rawQuoi,
      icon: scene.icon ?? 'mdi:script-text-play',
      commandEnabled: true,
      device: {
        identifiers: [`rfxcom_scene_${scene.receiverId}`],
        name: `RFXCOM Scène ${taxonomy.rawQuoi}`,
        manufacturer: 'RFXCOM',
        model: 'Scene'
      },
      extra: {
        automation_type: 'trigger',
        topic: commandTopic,
        payload: '{}',
        attributs_taxonomie: buildAttributsTaxonomie(taxonomy)
      }
    };

    this.eventBus.emitGeneric(`integration:${MODULE_NAME}:discovery`, {
      bridgeInstance: this.config.bridgeInstance,
      component: 'device_automation',
      objectId: `rfxcom_scene_${scene.receiverId}`,
      deviceId,
      essential
    });
  }

  private publishSceneResult(sceneId: string, result: SceneExecutionResult): void {
    this.eventBus.emitGeneric(`integration:${MODULE_NAME}:state`, {
      bridgeInstance: this.config.bridgeInstance,
      deviceId: `${SCENE_DEVICE_ID_PREFIX}${sceneId}`,
      state: {
        state: result.success ? 'completed' : 'failed',
        attributes: {
          executed_commands: result.executedCommands,
          failed_commands: result.failedCommands,
          duration_ms: result.duration
        }
      }
    });
  }

  // ==========================================================================
  // Commandes HA → récepteur → device RFXCOM
  // ==========================================================================

  private handleHaCommand(deviceId: string, payload: Record<string, unknown>): void {
    if (deviceId.startsWith(SCENE_DEVICE_ID_PREFIX)) {
      void this.executeScene(deviceId.slice(SCENE_DEVICE_ID_PREFIX.length));
      return;
    }

    if (!this.receiverManager.getReceiver(deviceId)) {
      this.logger.warn('RfxComService', `Commande reçue pour un récepteur inconnu: ${deviceId}`);
      return;
    }

    const parsed = this.parseHaCommandPayload(payload);
    if (!parsed) {
      this.logger.warn('RfxComService', `Commande non reconnue pour ${deviceId}: ${JSON.stringify(payload)}`);
      return;
    }

    const result = this.applyReceiverCommand(deviceId, parsed.command, parsed.value);
    if (!result.success) {
      this.logger.error('RfxComService', `Échec de la commande ${parsed.command} pour ${deviceId}: ${result.error}`);
      this.eventBus.emitGeneric('rfxcom:error',
        createRfxComError('RFXCOM_COMMAND_FAILED', result.error ?? 'Erreur inconnue', 'rfxcom:command', { deviceId }));
    }
  }

  /**
   * Traduit puis envoie une commande RF433 pour un récepteur donné (switch/light/cover — pas les
   * scènes). Factorisé pour être réutilisé à la fois par handleHaCommand (payload JSON `/set` du
   * socle) et par SceneExecutor (commande/valeur déjà discrètes, une par action de scène).
   */
  private applyReceiverCommand(receiverId: string, command: string, value?: number): { success: boolean; error?: string } {
    const receiver = this.receiverManager.getReceiver(receiverId);
    if (!receiver) {
      return { success: false, error: `Récepteur inconnu: ${receiverId}` };
    }

    const result = receiver.translateHaCommand(command, value);
    if (!result) {
      return { success: false, error: `Commande ${command} non applicable à ${receiverId} (état inchangé ou non supportée)` };
    }

    const primaryDevice = this.deviceManager.getDevice(receiver.config.primaryEmitter);
    if (!primaryDevice || !primaryDevice.commandDeviceId) {
      return { success: false, error: `primaryEmitter ${receiver.config.primaryEmitter} introuvable ou jamais vu en émission` };
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
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  }

  // ==========================================================================
  // Scènes — exécution
  // ==========================================================================

  private async executeScene(sceneId: string): Promise<void> {
    const scene = this.sceneManager.getScene(sceneId);
    if (!scene) {
      this.logger.warn('RfxComService', `Scène inconnue: ${sceneId}`);
      return;
    }

    this.cancelledScenes.delete(sceneId);
    this.eventBus.emitGeneric('rfxcom:scene:status', { sceneId, status: 'scene_executing' });

    const result = await this.sceneExecutor.execute(
      scene,
      (target, command, value) => this.applyReceiverCommand(target, command, value),
      () => this.cancelledScenes.has(sceneId)
    );

    this.cancelledScenes.delete(sceneId);
    this.publishSceneResult(sceneId, result);
    this.eventBus.emitGeneric('rfxcom:scene:executed', result);

    if (!result.success) {
      this.logger.warn('RfxComService',
        `Scène ${sceneId} terminée avec erreurs: ${result.failedCommands} commande(s) en échec sur ${scene.actions.length}`);
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

  private emitScenesList(): void {
    this.eventBus.emitGeneric('rfxcom:scenes:list', { scenes: this.sceneManager.getAllScenes() });
  }

  // ==========================================================================
  // Socket.io (via SocketBridge, EventBus générique)
  // ==========================================================================

  private setupSocketEventListeners(): void {
    this.eventBus.onGeneric('rfxcom:status:get', () => this.emitStatus());
    this.eventBus.onGeneric('rfxcom:devices:list:get', () => this.emitDevicesList());
    this.eventBus.onGeneric('rfxcom:receivers:list:get', () => this.emitReceiversList());
    this.eventBus.onGeneric('rfxcom:scenes:list:get', () => this.emitScenesList());

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
      if (data.config.type === 'scene') {
        this.logger.warn('RfxComService', `Scène reçue sur rfxcom:receiver:create — utiliser rfxcom:scene:create (${data.config.receiverId})`);
        return;
      }
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

    this.eventBus.onGeneric<{ config: ReceiverSceneConfig }>('rfxcom:scene:create', (data) => {
      this.sceneManager.addScene(data.config);
      this.persistDevicesConfig();
      if (data.config.transmitToHa) this.publishSceneDiscovery(data.config);
      this.emitScenesList();
      this.eventBus.emitGeneric('rfxcom:scene:created', { scene: data.config });
    });

    this.eventBus.onGeneric<{ sceneId: string; config: Partial<ReceiverSceneConfig> }>('rfxcom:scene:update', (data) => {
      const existing = this.sceneManager.getScene(data.sceneId);
      if (!existing) {
        this.logger.warn('RfxComService', `Scène inconnue pour mise à jour: ${data.sceneId}`);
        return;
      }
      const updated = { ...existing, ...data.config } as ReceiverSceneConfig;
      this.sceneManager.addScene(updated);
      this.persistDevicesConfig();
      if (updated.transmitToHa) this.publishSceneDiscovery(updated);
      this.emitScenesList();
      this.eventBus.emitGeneric('rfxcom:scene:updated', { scene: updated });
    });

    this.eventBus.onGeneric<{ sceneId: string }>('rfxcom:scene:delete', (data) => {
      this.sceneManager.removeScene(data.sceneId);
      this.persistDevicesConfig();
      this.emitScenesList();
      this.eventBus.emitGeneric('rfxcom:scene:deleted', { sceneId: data.sceneId });
    });

    this.eventBus.onGeneric<{ sceneId: string }>('rfxcom:scene:execute', (data) => {
      void this.executeScene(data.sceneId);
    });

    this.eventBus.onGeneric<{ sceneId: string }>('rfxcom:scene:cancel', (data) => {
      this.cancelledScenes.add(data.sceneId);
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

  /** Sauvegarde l'état courant des devices/récepteurs/scènes dans config-rfxcom-devices-v1.0.yaml. */
  private persistDevicesConfig(): void {
    const receivers: Record<string, ReceiverConfigEntry> = {};
    for (const receiver of this.receiverManager.getAllReceivers()) {
      receivers[receiver.config.receiverId] = receiver.config as ReceiverConfigEntry;
    }
    for (const scene of this.sceneManager.getAllScenes()) {
      receivers[scene.receiverId] = scene as ReceiverConfigEntry;
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
