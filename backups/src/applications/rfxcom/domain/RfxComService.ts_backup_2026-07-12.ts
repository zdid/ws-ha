// src/applications/rfxcom/domain/RfxComService.ts
// Service principal RFXCOM
// Conforme à specs-fonctionnelles-rfxcom-v5.0.md, specs-implementation-rfxcom-v1.0.md et specs-erreurs-v1.0.md

import type { EventBus } from '../../../application/EventBus';
import type { Logger } from '../../../infrastructure/logger/index';
import type { ConfigService } from '../../../infrastructure/config/ConfigService';
import type {
  RfxComDevice,
  RfxComDeviceType,
  RfxComProtocol,
  RfxComCommand,
  RfxComCommandResult,
  RfxComDeviceDetectedEvent,
  RfxComDevicesListEvent,
  RfxComStatusEvent,
  RfxComSceneWithStatus,
  RfxComSceneTriggeredEvent,
} from './types';
import type {
  RfxComReceiver,
  RfxComScene,
  RfxComAssociation,
  RfxComConfig,
} from './config-schema';
import { RFXCOM_SOCKET_EVENTS } from './socket-events';
import { createRfxComError, createAppError, toAppError, type AppError, type AppErrorCode, type RfxComErrorCode } from '../../../types/errors';

// Import the rfxcom library
import * as rfxcomLib from 'rfxcom';
// Import types from local declaration file
import type { RfxCom, Lighting1, Lighting2, Lighting3, Lighting4, Lighting5, Lighting6, Blinds1, Blinds2, Security1, Transmitter as TransmitterType } from '../../../types/rfxcom';

// Type assertion for rfxcom library to have all the expected classes
const rfxcom = rfxcomLib as typeof rfxcomLib & {
  RfxCom: typeof RfxCom;
  Lighting1: typeof Lighting1;
  Lighting2: typeof Lighting2;
  Lighting3: typeof Lighting3;
  Lighting4: typeof Lighting4;
  Lighting5: typeof Lighting5;
  Lighting6: typeof Lighting6;
  Blinds1: typeof Blinds1;
  Blinds2: typeof Blinds2;
  Security1: typeof Security1;
  Transmitter: typeof TransmitterType;
  // Constants
  lighting1: Record<string, number>;
  lighting2: Record<string, number>;
  lighting3: Record<string, number>;
  lighting4: Record<string, number>;
  lighting5: Record<string, number>;
  lighting6: Record<string, number>;
  blinds1: Record<string, number>;
  blinds2: Record<string, number>;
  blinds3: Record<string, number>;
  security1: Record<string, number>;
};

// Local types for RFXCOM events (from rfxcom.d.ts)
interface RfxComDeviceEvent {
  id: string;
  subtype: number;
  packetType: number;
  deviceStatus?: number;
  rssi?: number;
  battery?: number;
  raw?: Buffer | number[];
}

interface TemperatureEvent extends RfxComDeviceEvent {
  temperature: number;
}

interface HumidityEvent extends RfxComDeviceEvent {
  humidity: number;
}

// Transmitter type
type Transmitter = any;
type RfxComType = any;

/**
 * RfxComService - Service principal pour la gestion de RFXCOM
 * 
 * Responsabilités :
 * - Initialisation et gestion du transceiver RFXCOM
 * - Détection et classification des devices RF433
 * - Gestion des récepteurs
 * - Gestion des scènes
 * - Exécution des commandes
 * - Émission des événements via EventBus
 * 
 * Conforme à specs-implementation-rfxcom-v1.0.md §2
 */
export class RfxComService {
  private eventBus: EventBus;
  private logger: Logger;
  private configService: ConfigService;
  
  // RFXCOM transceiver instance
  private transceiver?: RfxComType;
  
  // État
  private devices: Map<string, RfxComDevice> = new Map();
  private receivers: Map<string, RfxComReceiver> = new Map();
  private scenes: Map<string, RfxComScene> = new Map();
  private associations: Map<string, RfxComAssociation[]> = new Map();
  
  // Statut
  private isConnected: boolean = false;
  private lastDiscovery: string = '';
  private discoveryInProgress: boolean = false;

  /**
   * Crée un nouveau RfxComService
   * @param eventBus - Instance de l'EventBus
   * @param logger - Instance du logger
   * @param configService - Instance de ConfigService
   */
  constructor(
    eventBus: EventBus,
    logger: Logger,
    configService: ConfigService
  ) {
    this.eventBus = eventBus;
    this.logger = logger;
    this.configService = configService;

    // Charger la configuration
    this.loadConfig();
    
    // Configurer les listeners EventBus
    this.setupEventListeners();
  }

  // ======================================================================
  // CONFIGURATION
  // ======================================================================

  /**
   * Charge la configuration RFXCOM
   */
  private loadConfig(): void {
    try {
      const config = this.configService.getConfig();
      const rfxcomConfig = config.rfxcom as RfxComConfig | undefined;
      
      if (rfxcomConfig) {
        // Charger les récepteurs
        for (const receiver of rfxcomConfig.receivers) {
          this.receivers.set(receiver.id, receiver);
        }
        
        // Charger les scènes
        for (const scene of rfxcomConfig.scenes) {
          this.scenes.set(scene.id, scene);
        }
        
        // Charger les associations
        for (const association of rfxcomConfig.associations) {
          if (!this.associations.has(association.deviceId)) {
            this.associations.set(association.deviceId, []);
          }
          this.associations.get(association.deviceId)?.push(association);
        }

        this.logger.info('RfxComService', `Configuration RFXCOM chargée : ${rfxcomConfig.receivers.length} récepteurs, ${rfxcomConfig.scenes.length} scènes`);
      }
    } catch (error) {
      this.logger.error('RfxComService', `Erreur de chargement de la configuration: ${error}`);
    }
  }

  /**
   * Configure les listeners EventBus
   */
  private setupEventListeners(): void {
    // Écouter les demandes de l'UI
    this.eventBus.onGeneric(RFXCOM_SOCKET_EVENTS.RECEIVER_CREATE, (data) => this.handleReceiverCreate(data));
    this.eventBus.onGeneric(RFXCOM_SOCKET_EVENTS.RECEIVER_UPDATE, (data) => this.handleReceiverUpdate(data));
    this.eventBus.onGeneric(RFXCOM_SOCKET_EVENTS.RECEIVER_DELETE, (data) => this.handleReceiverDelete(data));
    this.eventBus.onGeneric(RFXCOM_SOCKET_EVENTS.DEVICES_REFRESH, () => this.handleDevicesRefresh());
    this.eventBus.onGeneric(RFXCOM_SOCKET_EVENTS.COMMAND, (data) => this.handleCommand(data));
    
    // Écouter les demandes pour les scènes
    this.eventBus.onGeneric(RFXCOM_SOCKET_EVENTS.SCENE_EXECUTE, (data) => this.handleSceneExecute(data));
    this.eventBus.onGeneric(RFXCOM_SOCKET_EVENTS.SCENE_CANCEL, (data) => this.handleSceneCancel(data));
    this.eventBus.onGeneric(RFXCOM_SOCKET_EVENTS.SCENES_LIST, () => this.handleScenesList());
    this.eventBus.onGeneric(RFXCOM_SOCKET_EVENTS.SCENE_CREATE, (data) => this.handleSceneCreate(data));
    this.eventBus.onGeneric(RFXCOM_SOCKET_EVENTS.SCENE_UPDATE, (data) => this.handleSceneUpdate(data));
    this.eventBus.onGeneric(RFXCOM_SOCKET_EVENTS.SCENE_DELETE, (data) => this.handleSceneDelete(data));
    
    // Écouter les demandes pour les devices
    this.eventBus.onGeneric(RFXCOM_SOCKET_EVENTS.DEVICE_UPDATE, (data) => this.handleDeviceUpdate(data));
    this.eventBus.onGeneric(RFXCOM_SOCKET_EVENTS.CONFIG_RELOAD, () => this.handleConfigReload());
  }

  // ======================================================================
  // DÉMARRAGE/ARRÊT
  // ======================================================================

  /**
   * Démarre le service RFXCOM
   */
  async start(): Promise<void> {
    this.logger.info('RfxComService', 'Démarrage du service RFXCOM...');
    
    try {
      // Initialiser la connexion au transceiver RFXCOM
      await this.initializeTransceiver();
      
      // Démarrer la détection des devices
      this.startDiscovery();
      
      this.logger.info('RfxComService', 'Service RFXCOM démarré');
    } catch (error) {
      this.logger.error('RfxComService', `Échec du démarrage du service RFXCOM: ${error}`);
      this.isConnected = false;
      this.emitStatus();
      throw error;
    }
  }

  /**
   * Initialise la connexion au transceiver RFXCOM
   * Conforme à specs-implementation-rfxcom-v1.0.md §4.2
   */
  private async initializeTransceiver(): Promise<void> {
    try {
      const config = this.configService.getConfig();
      const rfxcomConfig = config.rfxcom as RfxComConfig | undefined;
      
      if (!rfxcomConfig) {
        throw new Error('Configuration RFXCOM non trouvée');
      }

      // Créer l'instance du transceiver RFXCOM
      // Conforme à specs-implementation-rfxcom-v1.0.md §4.2
      this.transceiver = new rfxcom.RfxCom(rfxcomConfig.serialPort, {
        debug: this.logger.getLevel() === 'debug',
        concurrency: 3,
        timeout: 12000,
      });

      // Configurer les écouteurs d'événements du transceiver
      this.setupTransceiverEventListeners();

      // Initialiser le transceiver avec callback
      // Conforme à specs-implementation-rfxcom-v1.0.md §4.2
      await new Promise<void>((resolve, reject) => {
        this.transceiver!.initialise((error?: Error) => {
          if (error) {
            this.logger.error('RfxComService', `Erreur lors de l'initialisation du transceiver: ${error.message}`);
            this.isConnected = false;
            reject(error);
          } else {
            this.logger.info('RfxComService', `Transceiver RFXCOM initialisé sur ${rfxcomConfig.serialPort}`);
            this.isConnected = true;
            this.emitStatus();
            resolve();
          }
        });
      });
    } catch (error) {
      this.logger.error('RfxComService', `Erreur d'initialisation du transceiver: ${error}`);
      this.isConnected = false;
      throw error;
    }
  }

  /**
   * Configure les écouteurs d'événements du transceiver RFXCOM
   * Conforme à specs-implementation-rfxcom-v1.0.md §4.3
   */
  private setupTransceiverEventListeners(): void {
    if (!this.transceiver) return;

    // Écouter les événements de réception de messages bruts
    this.transceiver.on('receive', (data: Buffer | number[]) => {
      this.logger.debug('RfxComService', `Message RFXCOM brut reçu: ${rfxcom.RfxCom.dumpHex(data as number[])}`);
    });

    // Écouter les événements de détection de devices
    this.transceiver.on('device', (event: RfxComDeviceEvent) => {
      this.logger.debug('RfxComService', `Événement device reçu: ${JSON.stringify(event)}`);
      this.handleRfxComDeviceEvent(event);
    });

    // Écouter les événements de connexion
    this.transceiver.on('connect', () => {
      this.logger.info('RfxComService', 'Transceiver RFXCOM connecté');
      this.isConnected = true;
      this.emitStatus();
    });

    // Écouter les événements de déconnexion
    this.transceiver.on('disconnect', (error?: Error) => {
      this.logger.warn('RfxComService', `Transceiver RFXCOM déconnecté: ${error?.message || 'inconnu'}`);
      this.isConnected = false;
      this.emitStatus();
    });

    // Écouter les événements d'erreur
    this.transceiver.on('error', (error: Error) => {
      this.logger.error('RfxComService', `Erreur du transceiver RFXCOM: ${error.message}`);
      this.emitError(createAppError({
        code: 'RFXCOM_TRANSCEIVER_UNAVAILABLE',
        message: error.message,
        module: 'rfxcom:transceiver',
        details: { error: error.message }
      }));
    });

    // Écouter les événements de statut
    this.transceiver.on('status', (status: unknown) => {
      this.logger.debug('RfxComService', `Statut du transceiver: ${JSON.stringify(status)}`);
    });

    // Écouter les événements ready (prêt à recevoir/envoyer des commandes)
    this.transceiver.on('ready', () => {
      this.logger.info('RfxComService', 'Transceiver RFXCOM prêt');
      this.isConnected = true;
      this.emitStatus();
    });

    // Écouter les événements response
    this.transceiver.on('response', (response: string, seqnbr: number, code: number) => {
      this.logger.debug('RfxComService', `Réponse RFXCOM reçue: ${response}, seq=${seqnbr}, code=${code}`);
    });
  }

  /**
   * Arrête le service RFXCOM
   * Conforme à specs-implementation-rfxcom-v1.0.md §11.2
   */
  async stop(): Promise<void> {
    this.logger.info('RfxComService', 'Arrêt du service RFXCOM...');
    
    // Déconnecter le transceiver
    if (this.transceiver) {
      try {
        this.transceiver.close();
        this.logger.info('RfxComService', 'Transceiver RFXCOM déconnecté');
      } catch (error) {
        this.logger.error('RfxComService', `Erreur lors de la déconnexion du transceiver: ${error}`);
      }
      this.transceiver = undefined;
    }
    
    this.isConnected = false;
    this.emitStatus();
    
    this.logger.info('RfxComService', 'Service RFXCOM arrêté');
  }

  // ======================================================================
  // DÉTECTION DES DEVICES
  // ======================================================================

  /**
   * Démarre la détection des devices RFXCOM
   * Conforme à specs-implementation-rfxcom-v1.0.md §5.4
   */
  private startDiscovery(): void {
    if (this.discoveryInProgress) {
      return;
    }

    this.discoveryInProgress = true;
    this.logger.info('RfxComService', 'Détection des devices RFXCOM démarrée...');

    // Les écouteurs sont déjà configurés dans setupTransceiverEventListeners()
    // Le transceiver écoute en continu les événements 'device'

    // Marquer la détection comme terminée après un délai
    setTimeout(() => {
      this.discoveryInProgress = false;
      this.lastDiscovery = new Date().toISOString();
      this.emitStatus();
      this.logger.info('RfxComService', 'Détection des devices RFXCOM en cours (écoute continue)...');
    }, 2000);
  }

  /**
   * Gère les événements de device du transceiver RFXCOM
   * Conforme à specs-implementation-rfxcom-v1.0.md §5.1
   */
  private handleRfxComDeviceEvent(event: RfxComDeviceEvent): void {
    // Mapper l'événement RFXCOM natif vers notre format interne
    const device: Partial<RfxComDevice> = {
      id: `rfxcom_${event.id}_${Date.now()}`,
      deviceId: event.id,
      type: this.mapRfxComProtocolToDeviceType(event.packetType),
      protocol: this.mapPacketTypeToProtocol(event.packetType),
      rssi: event.rssi,
      lastSeen: new Date().toISOString(),
      state: this.extractDeviceStateFromEvent(event)
    };

    // Ajouter des informations spécifiques selon le type de packet
    this.enrichDeviceFromPacketType(device, event);

    // Détecter le device
    this.handleDeviceDetected(device);
  }

  /**
   * Mappe le packetType RFXCOM vers RfxComDeviceType
   * Conforme à specs-implementation-rfxcom-v1.0.md §5.2
   */
  private mapRfxComProtocolToDeviceType(packetType: number): RfxComDeviceType {
    // Mapping basé sur les packet types RFXCOM
    const lightingTypes = [0x10, 0x11, 0x13, 0x14, 0x15, 0x16];
    const switchTypes = [0x12];
    const blindTypes = [0x19, 0x31];
    const sensorTypes = [0x50, 0x51, 0x52, 0x54, 0x55, 0x56, 0x57, 0x40, 0x42];
    const thermostatTypes = [0x40, 0x42, 0x4e, 0x4f];

    if (lightingTypes.includes(packetType)) return 'light';
    if (switchTypes.includes(packetType)) return 'switch';
    if (blindTypes.includes(packetType)) return 'cover';
    if (sensorTypes.includes(packetType)) return 'sensor';
    if (thermostatTypes.includes(packetType)) return 'thermostat';

    return 'sensor';
  }

  /**
   * Mappe le packetType RFXCOM vers RfxComProtocol
   * Conforme à specs-implementation-rfxcom-v1.0.md §7.1
   */
  private mapPacketTypeToProtocol(packetType: number): RfxComProtocol {
    const protocolMap: Record<number, RfxComProtocol> = {
      0x10: 'lighting1',
      0x11: 'lighting2',
      0x13: 'lighting4',
      0x14: 'lighting5',
      0x15: 'lighting6',
      0x12: 'switch1',
      0x19: 'blinds1',
      0x31: 'blinds2',
      0x30: 'blinds3',
      0x50: 'sensor1',
    };
    return protocolMap[packetType] || 'sensor1';
  }

  /**
   * Extrait l'état du device depuis un événement RFXCOM
   */
  private extractDeviceStateFromEvent(event: RfxComDeviceEvent): RfxComDevice['state'] {
    const state: RfxComDevice['state'] = {
      on: false // Valeur par défaut
    };

    // Si c'est un switch/light
    if (event.deviceStatus !== undefined) {
      state.on = event.deviceStatus !== 0;
    }

    // Si c'est un capteur de température
    if ('temperature' in event) {
      state.temperature = (event as unknown as TemperatureEvent).temperature;
    }

    // Si c'est un capteur d'humidité
    if ('humidity' in event) {
      state.humidity = (event as unknown as HumidityEvent).humidity;
    }

    return state;
  }

  /**
   * Enrichit le device avec des informations spécifiques au packet type
   * Conforme à specs-implementation-rfxcom-v1.0.md §5.3
   */
  private enrichDeviceFromPacketType(device: Partial<RfxComDevice>, event: RfxComDeviceEvent): void {
    // Ajouter des informations spécifiques selon le packet type
    switch (event.packetType) {
      case 0x50: // Temperature sensor
        device.quoi = 'Température';
        break;
      case 0x51: // Humidity sensor
        device.quoi = 'Humidité';
        break;
      case 0x52: // Temperature + Humidity
        device.quoi = 'Température/Humidité';
        break;
      case 0x10: // Lighting1
      case 0x11: // Lighting2
      case 0x14: // Lighting5
        device.quoi = 'Lumière';
        break;
      case 0x12: // Switch1
        device.quoi = 'Interrupteur';
        break;
      case 0x19: // Blinds1
        device.quoi = 'Volet';
        break;
      default:
        device.quoi = 'Appareil RF433';
    }
  }

  /**
   * Gère la détection d'un nouveau device
   */
  private handleDeviceDetected(device: Partial<RfxComDevice>): void {
    try {
      const fullDevice: RfxComDevice = {
        id: device.id || `rfxcom_${Date.now()}`,
        name: device.name || 'Device inconnu',
        deviceId: device.deviceId || '',
        sensorId: device.sensorId || '',
        type: device.type || 'sensor',
        protocol: device.protocol || 'sensor1',
        subunitCode: device.subunitCode,
        unitCode: device.unitCode || 0,
        groupCode: device.groupCode,
        houseCode: device.houseCode,
        state: device.state || { on: false },
        signalStrength: device.signalStrength || 0,
        batteryLevel: device.batteryLevel,
        lastSeen: device.lastSeen || new Date().toISOString(),
        rssi: device.rssi || -80,
        quoi: device.quoi,
        ou: device.ou,
        haExposed: device.haExposed !== undefined ? device.haExposed : true,
      };

      // Vérifier si le device existe déjà
      if (this.devices.has(fullDevice.id)) {
        // Mettre à jour le device existant
        const existingDevice = this.devices.get(fullDevice.id)!;
        this.devices.set(fullDevice.id, { ...existingDevice, ...fullDevice });
        
        // Émettre un événement de mise à jour
        this.emitDeviceDetected(fullDevice);
      } else {
        // Ajouter le nouveau device
        this.devices.set(fullDevice.id, fullDevice);
        
        // Émettre l'événement de détection
        this.emitDeviceDetected(fullDevice);
      }

      this.logger.info('RfxComService', `Device détecté: ${fullDevice.name} (${fullDevice.id})`);
    } catch (error) {
      this.logger.error('RfxComService', `Erreur lors de la détection d'un device: ${error}`);
    }
  }

  /**
   * Émet l'événement de détection d'un device
   */
  private emitDeviceDetected(device: RfxComDevice): void {
    const event: RfxComDeviceDetectedEvent = {
      device,
      timestamp: new Date().toISOString()
    };
    this.eventBus.emitGeneric(RFXCOM_SOCKET_EVENTS.DEVICE_DETECTED, event);
  }

  /**
   * Gère la demande de rafraîchissement de la liste des devices
   */
  private handleDevicesRefresh(): void {
    try {
      const devicesList: RfxComDevicesListEvent = {
        devices: Array.from(this.devices.values()),
        timestamp: new Date().toISOString()
      };
      this.eventBus.emitGeneric(RFXCOM_SOCKET_EVENTS.DEVICES_LIST, devicesList);
      this.logger.debug('RfxComService', `Liste des devices émise: ${devicesList.devices.length} devices`);
    } catch (error) {
      this.logger.error('RfxComService', `Erreur lors du rafraîchissement des devices: ${error}`);
    }
  }

  /**
   * Gère la mise à jour d'un device
   */
  private async handleDeviceUpdate(data: unknown): Promise<void> {
    try {
      const device = data as Partial<RfxComDevice>;
      if (!device.id) {
        throw new Error('ID du device manquant');
      }

      if (!this.devices.has(device.id)) {
        throw new Error(`Device avec ID ${device.id} non trouvé`);
      }

      // Mettre à jour le device
      const existingDevice = this.devices.get(device.id)!;
      this.devices.set(device.id, { ...existingDevice, ...device });

      // Sauvegarder si nécessaire (les devices détectés ne sont pas sauvés dans la config principale)
      // Les devices détectés sont sauvegardés séparément via RfxComConfigService

      // Émettre la liste mise à jour
      this.handleDevicesRefresh();

      this.logger.info('RfxComService', `Device mis à jour: ${device.id}`);
    } catch (error) {
      this.logger.error('RfxComService', `Erreur lors de la mise à jour d'un device: ${error}`);
    }
  }

  /**
   * Gère le rechargement de la configuration
   */
  private handleConfigReload(): void {
    this.logger.info('RfxComService', 'Rechargement de la configuration RFXCOM...');
    this.loadConfig();
    this.emitReceiversList();
    this.handleScenesList();
    this.logger.info('RfxComService', 'Configuration RFXCOM rechargée');
  }

  // ======================================================================
  // GESTION DES RÉCEPTEURS
  // ======================================================================

  /**
   * Gère la création d'un récepteur
   */
  private async handleReceiverCreate(data: unknown): Promise<void> {
    try {
      const receiver = this.validateReceiver(data);
      if (!receiver) {
        throw new Error('Récepteur invalide');
      }

      // Vérifier si le récepteur existe déjà
      if (this.receivers.has(receiver.id)) {
        throw new Error(`Récepteur avec ID ${receiver.id} existe déjà`);
      }

      // Ajouter le récepteur
      this.receivers.set(receiver.id, receiver);
      
      // Sauvegarder la configuration
      await this.saveConfig();
      
      // Émettre l'événement
      this.eventBus.emitGeneric(RFXCOM_SOCKET_EVENTS.RECEIVER_CREATED, {
        receiver,
        timestamp: new Date().toISOString()
      });
      
      // Émettre la liste complète
      this.emitReceiversList();

      this.logger.info('RfxComService', `Récepteur créé: ${receiver.name}`);
    } catch (error) {
      this.logger.error('RfxComService', `Erreur lors de la création d'un récepteur: ${error}`);
      // Émettre une erreur vers l'UI
      this.emitError(createAppError({
        code: 'APP_VALIDATION_FAILED',
        message: String(error),
        module: 'rfxcom:service',
        details: { action: 'receiver_create' }
      }));
    }
  }

  /**
   * Gère la mise à jour d'un récepteur
   */
  private async handleReceiverUpdate(data: unknown): Promise<void> {
    try {
      const receiver = this.validateReceiver(data);
      if (!receiver) {
        throw new Error('Récepteur invalide');
      }

      // Vérifier si le récepteur existe
      if (!this.receivers.has(receiver.id)) {
        throw new Error(`Récepteur avec ID ${receiver.id} non trouvé`);
      }

      // Mettre à jour le récepteur
      this.receivers.set(receiver.id, receiver);
      
      // Sauvegarder la configuration
      await this.saveConfig();
      
      // Émettre l'événement
      this.eventBus.emitGeneric(RFXCOM_SOCKET_EVENTS.RECEIVER_UPDATED, {
        receiver,
        timestamp: new Date().toISOString()
      });
      
      // Émettre la liste complète
      this.emitReceiversList();

      this.logger.info('RfxComService', `Récepteur mis à jour: ${receiver.name}`);
    } catch (error) {
      this.logger.error('RfxComService', `Erreur lors de la mise à jour d'un récepteur: ${error}`);
      this.emitError(createAppError({
        code: 'APP_VALIDATION_FAILED',
        message: String(error),
        module: 'rfxcom:service',
        details: { action: 'receiver_update' }
      }));
    }
  }

  /**
   * Gère la suppression d'un récepteur
   */
  private async handleReceiverDelete(data: unknown): Promise<void> {
    try {
      const { receiverId } = data as { receiverId: string };
      
      if (!receiverId) {
        throw new Error('ID du récepteur manquant');
      }

      // Vérifier si le récepteur existe
      if (!this.receivers.has(receiverId)) {
        throw new Error(`Récepteur avec ID ${receiverId} non trouvé`);
      }

      // Supprimer le récepteur
      this.receivers.delete(receiverId);
      
      // Sauvegarder la configuration
      await this.saveConfig();
      
      // Émettre l'événement
      this.eventBus.emitGeneric(RFXCOM_SOCKET_EVENTS.RECEIVER_DELETED, {
        receiverId: receiverId,
        timestamp: new Date().toISOString()
      });
      
      // Émettre la liste complète
      this.emitReceiversList();

      this.logger.info('RfxComService', `Récepteur supprimé: ${receiverId}`);
    } catch (error) {
      this.logger.error('RfxComService', `Erreur lors de la suppression d'un récepteur: ${error}`);
      this.emitError(createAppError({
        code: 'RFXCOM_RECEIVER_NOT_FOUND',
        message: String(error),
        module: 'rfxcom:service',
        details: { action: 'receiver_delete' }
      }));
    }
  }

  /**
   * Émet la liste complète des récepteurs
   */
  private emitReceiversList(): void {
    const receiversList = {
      receivers: Array.from(this.receivers.values()),
      timestamp: new Date().toISOString()
    };
    this.eventBus.emitGeneric(RFXCOM_SOCKET_EVENTS.RECEIVERS_LIST, receiversList);
  }

  /**
   * Valide un récepteur
   */
  private validateReceiver(data: unknown): RfxComReceiver | null {
    try {
      const receiver = data as RfxComReceiver;
      
      if (!receiver.id || typeof receiver.id !== 'string') {
        return null;
      }
      if (!receiver.name || typeof receiver.name !== 'string') {
        return null;
      }
      if (!receiver.deviceId || typeof receiver.deviceId !== 'string') {
        return null;
      }
      if (!receiver.protocol || typeof receiver.protocol !== 'string') {
        return null;
      }
      if (receiver.unitCode === undefined || typeof receiver.unitCode !== 'number') {
        return null;
      }

      return receiver;
    } catch {
      return null;
    }
  }

  // ======================================================================
  // GESTION DES SCÈNES
  // ======================================================================

  /**
   * Gère l'exécution d'une scène
   */
  private async handleSceneExecute(data: unknown): Promise<void> {
    let sceneId: string;
    try {
      const extracted = data as { sceneId: string };
      sceneId = extracted.sceneId;
      
      if (!sceneId) {
        const error = createAppError({
          code: 'RFXCOM_UNSUPPORTED_ACTION',
          message: 'sceneId is required for scene execution',
          module: 'rfxcom:service',
          details: { action: 'scene_execute' }
        });
        this.emitError(error);
        return;
      }

      const scene = this.scenes.get(sceneId);
      if (!scene) {
        const error = createAppError({
          code: 'RFXCOM_UNSUPPORTED_ACTION',
          message: `Scene ${sceneId} not found`,
          module: 'rfxcom:service',
          details: { sceneId }
        });
        this.emitError(error);
        return;
      }

      // Exécuter la scène
      const result = await this.executeScene(sceneId, scene);
      
      // Émettre le résultat
      this.eventBus.emitGeneric(RFXCOM_SOCKET_EVENTS.SCENE_TRIGGERED, {
        scene,
        timestamp: new Date().toISOString(),
        ...result,
      } as RfxComSceneTriggeredEvent);
      
      this.logger.info('RfxComService', `Scène exécutée: ${sceneId} (succès: ${result.success})`);
    } catch (error) {
      const appError = toAppError(error as Error, {
        code: 'RFXCOM_COMMAND_FAILED',
        module: 'rfxcom:service',
        details: { action: 'scene_execute' },
      });
      this.emitError(appError);
    }
  }

  /**
   * Gère l'annulation d'une scène
   */
  private async handleSceneCancel(data: unknown): Promise<void> {
    let sceneId: string;
    try {
      const extracted = data as { sceneId: string };
      sceneId = extracted.sceneId;
      
      if (!sceneId) {
        const error = createAppError({
          code: 'RFXCOM_UNSUPPORTED_ACTION',
          message: 'sceneId is required for scene cancellation',
          module: 'rfxcom:service',
          details: { action: 'scene_cancel' }
        });
        this.emitError(error);
        return;
      }

      // Annuler la scène (implémentation à compléter)
      const scene = this.scenes.get(sceneId);
      if (!scene) {
        const error = createAppError({
          code: 'RFXCOM_UNSUPPORTED_ACTION',
          message: `Scene ${sceneId} not found`,
          module: 'rfxcom:service',
          details: { sceneId }
        });
        this.emitError(error);
        return;
      }

      // TODO: Implémenter l'annulation d'une scène en cours
      // this.cancelSceneExecution(sceneId);
      
      this.logger.info('RfxComService', `Scène annulée: ${sceneId}`);
      
      // Émettre l'événement d'annulation
      this.eventBus.emitGeneric(RFXCOM_SOCKET_EVENTS.SCENE_CANCEL, {
        sceneId,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      const appError = toAppError(error as Error, {
        code: 'RFXCOM_COMMAND_FAILED',
        module: 'rfxcom:service',
        details: { action: 'scene_cancel' },
      });
      this.emitError(appError);
    }
  }

  /**
   * Gère la demande de liste des scènes
   */
  private handleScenesList(): void {
    try {
      const scenesList = {
        scenes: this.getScenes().map(scene => ({
          ...scene,
          lastTriggered: (scene as RfxComSceneWithStatus).lastTriggered,
          triggerCount: (scene as RfxComSceneWithStatus).triggerCount || 0,
        })),
        timestamp: new Date().toISOString()
      };
      this.eventBus.emitGeneric(RFXCOM_SOCKET_EVENTS.SCENES_LIST, scenesList);
    } catch (error) {
      const appError = toAppError(error as Error, {
        code: 'RFXCOM_COMMAND_FAILED',
        module: 'rfxcom:service',
        details: { action: 'scenes_list' },
      });
      this.emitError(appError);
    }
  }

  /**
   * Gère la création d'une scène
   */
  private async handleSceneCreate(data: unknown): Promise<void> {
    try {
      const scene = this.validateScene(data);
      if (!scene) {
        const error = createAppError({
          code: 'APP_VALIDATION_FAILED',
          message: 'Invalid scene configuration',
          module: 'rfxcom:service',
          details: { field: 'scene', value: data }
        });
        this.emitError(error);
        return;
      }

      // Vérifier si la scène existe déjà
      if (this.scenes.has(scene.id)) {
        const error = createAppError({
          code: 'RFXCOM_UNSUPPORTED_ACTION',
          message: `Scene with ID ${scene.id} already exists`,
          module: 'rfxcom:service',
          details: { sceneId: scene.id }
        });
        this.emitError(error);
        return;
      }

      // Ajouter la scène
      this.scenes.set(scene.id, scene);
      
      // Sauvegarder la configuration
      await this.saveConfig();
      
      // Émettre l'événement
      this.eventBus.emitGeneric(RFXCOM_SOCKET_EVENTS.SCENE_CREATE, {
        scene,
        timestamp: new Date().toISOString()
      });
      
      // Émettre la liste complète
      this.handleScenesList();
      
      this.logger.info('RfxComService', `Scène créée: ${scene.id}`);
    } catch (error) {
      const appError = toAppError(error as Error, {
        code: 'RFXCOM_COMMAND_FAILED',
        module: 'rfxcom:service',
        details: { action: 'scene_create' },
      });
      this.emitError(appError);
    }
  }

  /**
   * Gère la mise à jour d'une scène
   */
  private async handleSceneUpdate(data: unknown): Promise<void> {
    let sceneId: string = '';
    try {
      const extracted = data as { sceneId: string } & Partial<RfxComScene>;
      sceneId = extracted.sceneId;
      const sceneData = extracted;
      delete (sceneData as any).sceneId;
      
      if (!sceneId) {
        const error = createAppError({
          code: 'RFXCOM_UNSUPPORTED_ACTION',
          message: 'sceneId is required for scene update',
          module: 'rfxcom:service',
          details: { action: 'scene_update' }
        });
        this.emitError(error);
        return;
      }

      // Vérifier si la scène existe
      const existingScene = this.scenes.get(sceneId);
      if (!existingScene) {
        const error = createAppError({
          code: 'RFXCOM_UNSUPPORTED_ACTION',
          message: `Scene ${sceneId} not found`,
          module: 'rfxcom:service',
          details: { sceneId }
        });
        this.emitError(error);
        return;
      }

      // Valider les données de mise à jour
      const updatedScene = this.validateScene({ ...existingScene, ...sceneData });
      if (!updatedScene) {
        const error = createAppError({
          code: 'APP_VALIDATION_FAILED',
          message: 'Invalid scene update data',
          module: 'rfxcom:service',
          details: { sceneId, data: sceneData }
        });
        this.emitError(error);
        return;
      }

      // Mettre à jour la scène
      this.scenes.set(sceneId, updatedScene);
      
      // Sauvegarder la configuration
      await this.saveConfig();
      
      // Émettre l'événement
      this.eventBus.emitGeneric(RFXCOM_SOCKET_EVENTS.SCENE_UPDATE, {
        scene: updatedScene,
        timestamp: new Date().toISOString()
      });
      
      // Émettre la liste complète
      this.handleScenesList();
      
      this.logger.info('RfxComService', `Scène mise à jour: ${sceneId}`);
    } catch (error) {
      const appError = toAppError(error as Error, {
        code: 'RFXCOM_COMMAND_FAILED',
        module: 'rfxcom:service',
        details: { action: 'scene_update', sceneId },
      });
      this.emitError(appError);
    }
  }

  /**
   * Gère la suppression d'une scène
   */
  private async handleSceneDelete(data: unknown): Promise<void> {
    let sceneId: string = '';
    try {
      const extracted = data as { sceneId: string };
      sceneId = extracted.sceneId;
      
      if (!sceneId) {
        const error = createAppError({
          code: 'RFXCOM_UNSUPPORTED_ACTION',
          message: 'sceneId is required for scene deletion',
          module: 'rfxcom:service',
          details: { action: 'scene_delete' }
        });
        this.emitError(error);
        return;
      }

      // Vérifier si la scène existe
      if (!this.scenes.has(sceneId)) {
        const error = createAppError({
          code: 'RFXCOM_UNSUPPORTED_ACTION',
          message: `Scene ${sceneId} not found`,
          module: 'rfxcom:service',
          details: { sceneId }
        });
        this.emitError(error);
        return;
      }

      // Supprimer la scène
      const scene = this.scenes.get(sceneId)!;
      this.scenes.delete(sceneId);
      
      // Sauvegarder la configuration
      await this.saveConfig();
      
      // Émettre l'événement
      this.eventBus.emitGeneric(RFXCOM_SOCKET_EVENTS.SCENE_DELETE, {
        sceneId,
        timestamp: new Date().toISOString()
      });
      
      // Émettre la liste complète
      this.handleScenesList();
      
      this.logger.info('RfxComService', `Scène supprimée: ${sceneId}`);
    } catch (error) {
      const appError = toAppError(error as Error, {
        code: 'RFXCOM_COMMAND_FAILED',
        module: 'rfxcom:service',
        details: { action: 'scene_delete', sceneId },
      });
      this.emitError(appError);
    }
  }

  /**
   * Exécute une scène RFXCOM
   */
  private async executeScene(sceneId: string, scene: RfxComScene): Promise<{
    success: boolean;
    executedCommands: number;
    failedCommands: number;
    errors: Array<{ receiverId: string; action: string; error: AppError }>;
    duration: number;
  }> {
    const startTime = Date.now();
    let executedCommands: number = 0;
    let failedCommands: number = 0;
    const errors: Array<{ receiverId: string; action: string; error: AppError }> = [];
    
    try {
      // Mode d'exécution : séquentiel ou parallèle
      const isSequential = scene.type === 'sequential' || !scene.type;
      const delayBetweenCommands = scene.delayBetweenCommands || 500;
      
      if (isSequential) {
        // Exécution séquentielle
        for (const command of scene.commands) {
          try {
            // Convertir la commande de scène en commande RFXCOM
            const rfxComCommand: RfxComCommand = {
              receiverId: command.target,
              action: command.action as RfxComCommand['action'],
              value: typeof command.parameters?.brightness === 'number' ? command.parameters?.brightness : undefined,
              timestamp: new Date().toISOString()
            };
            
            // Exécuter la commande
            await this.executeCommand(rfxComCommand);
            executedCommands++;
            
            // Simuler le délai
            if (delayBetweenCommands > 0) {
              await new Promise(resolve => setTimeout(resolve, delayBetweenCommands));
            }
          } catch (error) {
            const appError = toAppError(error as Error, {
              code: 'RFXCOM_COMMAND_FAILED',
              module: 'rfxcom:service',
              details: { receiverId: command.target, action: command.action },
            });
            errors.push({ receiverId: command.target, action: command.action, error: appError });
            failedCommands++;
          }
        }
      } else {
        // Exécution parallèle
        const commandPromises = scene.commands.map(async (command) => {
          try {
            const rfxComCommand: RfxComCommand = {
              receiverId: command.target,
              action: command.action as RfxComCommand['action'],
              value: typeof command.parameters?.brightness === 'number' ? command.parameters?.brightness : undefined,
              timestamp: new Date().toISOString()
            };
            await this.executeCommand(rfxComCommand);
            executedCommands++;
          } catch (error) {
            const appError = toAppError(error as Error, {
              code: 'RFXCOM_COMMAND_FAILED',
              module: 'rfxcom:service',
              details: { receiverId: command.target, action: command.action },
            });
            errors.push({ receiverId: command.target, action: command.action, error: appError });
            failedCommands++;
          }
        });
        
        await Promise.all(commandPromises);
      }
      
      const duration = Date.now() - startTime;
      const success = errors.length === 0;
      
      return {
        success,
        executedCommands,
        failedCommands,
        errors,
        duration,
      };
    } catch (error) {
      const appError = toAppError(error as Error, {
        code: 'RFXCOM_COMMAND_FAILED',
        module: 'rfxcom:service',
        details: { sceneId },
      });
      return {
        success: false,
        executedCommands: 0,
        failedCommands: 1,
        errors: [{ receiverId: '', action: 'scene_execute', error: appError }],
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Valide une scène
   */
  private validateScene(data: unknown): RfxComScene | null {
    try {
      const scene = data as RfxComScene;
      
      if (!scene.id || typeof scene.id !== 'string') {
        return null;
      }
      if (!scene.name || typeof scene.name !== 'string') {
        return null;
      }
      if (!scene.commands || !Array.isArray(scene.commands)) {
        return null;
      }
      
      // Valider chaque commande de la scène
      for (const command of scene.commands) {
        if (!command.target || typeof command.target !== 'string') {
          return null;
        }
        if (!command.action || typeof command.action !== 'string') {
          return null;
        }
      }
      
      return scene;
    } catch {
      return null;
    }
  }

  // ======================================================================
  // GESTION DES COMMANDES
  // ======================================================================

  /**
   * Gère l'exécution d'une commande
   */
  private async handleCommand(data: unknown): Promise<void> {
    try {
      const command = this.validateCommand(data);
      if (!command) {
        throw new Error('Commande invalide');
      }

      // Vérifier si le récepteur existe
      if (!this.receivers.has(command.receiverId)) {
        throw new Error(`Récepteur avec ID ${command.receiverId} non trouvé`);
      }

      // Exécuter la commande
      const result = await this.executeCommand(command);
      
      // Émettre le résultat
      this.eventBus.emitGeneric(RFXCOM_SOCKET_EVENTS.COMMAND, result);
      
      this.logger.info('RfxComService', `Commande exécutée: ${command.action} sur ${command.receiverId}`);
    } catch (error) {
      this.logger.error('RfxComService', `Erreur lors de l'exécution d'une commande: ${error}`);
      
      // Émettre une erreur
      const command = data as RfxComCommand;
      const result: RfxComCommandResult = {
        command,
        success: false,
        error: String(error),
        timestamp: new Date().toISOString()
      };
      this.eventBus.emitGeneric(RFXCOM_SOCKET_EVENTS.COMMAND, result);
    }
  }

  /**
   * Valide une commande
   */
  private validateCommand(data: unknown): RfxComCommand | null {
    try {
      const command = data as RfxComCommand;
      
      if (!command.receiverId || typeof command.receiverId !== 'string') {
        return null;
      }
      if (!command.action || typeof command.action !== 'string') {
        return null;
      }
      if (!command.timestamp || typeof command.timestamp !== 'string') {
        return null;
      }

      return command;
    } catch {
      return null;
    }
  }

  /**
   * Exécute une commande RFXCOM
   * Conforme à specs-implementation-rfxcom-v1.0.md §6
   */
  private async executeCommand(command: RfxComCommand): Promise<RfxComCommandResult> {
    try {
      const receiver = this.receivers.get(command.receiverId);
      if (!receiver) {
        throw new Error(`Récepteur non trouvé: ${command.receiverId}`);
      }

      if (!this.transceiver) {
        throw new Error('Transceiver RFXCOM non initialisé');
      }

      if (!this.isConnected) {
        throw new Error('Transceiver RFXCOM non connecté');
      }

      // Créer le transmitter approprié en fonction du protocole
      // Conforme à specs-implementation-rfxcom-v1.0.md §6.2
      const transmitter = this.createTransmitterForReceiver(receiver);

      // Envoyer la commande en fonction de l'action
      // Conforme à specs-implementation-rfxcom-v1.0.md §6.3
      switch (command.action) {
        case 'on':
          this.sendOnCommand(transmitter, receiver);
          break;
        case 'off':
          this.sendOffCommand(transmitter, receiver);
          break;
        case 'toggle':
          this.sendToggleCommand(transmitter, receiver);
          break;
        case 'dim':
          this.sendDimCommand(transmitter, receiver, command.value || 50);
          break;
        case 'brighten':
          this.sendBrightenCommand(transmitter, receiver);
          break;
        case 'up':
          this.sendUpCommand(transmitter, receiver);
          break;
        case 'down':
          this.sendDownCommand(transmitter, receiver);
          break;
        case 'stop':
          this.sendStopCommand(transmitter, receiver);
          break;
        default:
          throw new Error(`Action non supportée: ${command.action}`);
      }

      // Attendre une confirmation ou un délai minimal
      await new Promise(resolve => setTimeout(resolve, 200));

      this.logger.info('RfxComService', `Commande envoyée: ${command.action} à ${receiver.name} (${receiver.deviceId})`);

      return {
        command,
        success: true,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('RfxComService', `Erreur lors de l'envoi de la commande: ${error}`);
      return {
        command,
        success: false,
        error: String(error),
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Crée un transmitter approprié pour un récepteur
   * Conforme à specs-implementation-rfxcom-v1.0.md §6.2
   */
  private createTransmitterForReceiver(receiver: RfxComReceiver): unknown {
    if (!this.transceiver) {
      throw new Error('Transceiver non initialisé');
    }

    const protocol = receiver.protocol.toLowerCase();

    // Mapping des protocoles vers les classes de transmitter
    // Conforme à specs-implementation-rfxcom-v1.0.md §7.1
    switch (protocol) {
      case 'lighting1':
        return new rfxcom.Lighting1(this.transceiver, rfxcom.lighting1[receiver.deviceId!] as any);
      case 'lighting2':
        return new rfxcom.Lighting2(this.transceiver, rfxcom.lighting2[receiver.houseCode!] as any);
      case 'lighting4':
        return new rfxcom.Lighting4(this.transceiver, rfxcom.lighting4.PT2262 as any);
      case 'lighting5':
        return new rfxcom.Lighting5(this.transceiver, rfxcom.lighting5.LIGHTWAVERF as any);
      case 'lighting6':
        return new rfxcom.Lighting6(this.transceiver, rfxcom.lighting6.BLYSS as any);
      case 'switch1':
        return new rfxcom.Lighting1(this.transceiver, rfxcom.lighting1.IMPULS as any);
      case 'blinds1':
        return new rfxcom.Blinds1(this.transceiver, rfxcom.blinds1.LINCONL as any);
      case 'blinds2':
        return new rfxcom.Blinds2(this.transceiver, rfxcom.blinds2.SIMU as any);
      case 'blinds3':
        return new rfxcom.Blinds1(this.transceiver, rfxcom.blinds1.ROSSI as any);
      case 'security1':
        return new rfxcom.Security1(this.transceiver, rfxcom.security1.X10 as any);
      default:
        // Pour les protocoles génériques, utiliser Lighting1 par défaut
        this.logger.warn('RfxComService', `Protocole non mappé: ${protocol}, utilisation de Lighting1 par défaut`);
        return new rfxcom.Lighting1(this.transceiver, rfxcom.lighting1.IMPULS as any);
    }
  }

  /**
   * Envoie une commande ON
   * Conforme à specs-implementation-rfxcom-v1.0.md §6.3
   */
  private sendOnCommand(transmitter: any, receiver: RfxComReceiver): void {
    const deviceId = receiver.deviceId;
    const houseCode = receiver.houseCode || 'A';
    const unitCode = receiver.unitCode || 1;

    // Essayer de déterminer le bon subtype
    if (transmitter instanceof rfxcom.Lighting1) {
      transmitter.switchOn(deviceId, 0, unitCode);
    } else if (transmitter instanceof rfxcom.Lighting2) {
      transmitter.switchOn(deviceId, houseCode, unitCode, 100);
    } else if (transmitter instanceof rfxcom.Lighting5) {
      transmitter.switchOn(deviceId);
    } else if (transmitter instanceof rfxcom.Blinds1) {
      transmitter.open(deviceId);
    } else if (transmitter instanceof rfxcom.Security1) {
      transmitter.switchOnLight(deviceId, houseCode, unitCode);
    } else {
      // Méthode générique pour les autres transmitters
      transmitter.switchOn(deviceId, houseCode, unitCode);
    }
  }

  /**
   * Envoie une commande OFF
   */
  private sendOffCommand(transmitter: any, receiver: RfxComReceiver): void {
    const deviceId = receiver.deviceId;
    const houseCode = receiver.houseCode || 'A';
    const unitCode = receiver.unitCode || 1;

    if (transmitter instanceof rfxcom.Lighting1) {
      transmitter.switchOff(deviceId, 0, unitCode);
    } else if (transmitter instanceof rfxcom.Lighting2) {
      transmitter.switchOff(deviceId, houseCode, unitCode);
    } else if (transmitter instanceof rfxcom.Lighting5) {
      transmitter.switchOff(deviceId);
    } else if (transmitter instanceof rfxcom.Blinds1) {
      transmitter.close(deviceId);
    } else if (transmitter instanceof rfxcom.Security1) {
      transmitter.switchOffLight(deviceId, houseCode, unitCode);
    } else {
      transmitter.switchOff(deviceId, houseCode, unitCode);
    }
  }

  /**
   * Envoie une commande TOGGLE
   */
  private sendToggleCommand(transmitter: any, receiver: RfxComReceiver): void {
    // Toggle n'est pas directement supporté par tous les transmitters
    // On va alterner entre ON et OFF en fonction de l'état actuel
    // Pour simplifier, on envoie ON si le dernier état était OFF, et vice versa
    // Cette implémentation est simplifiée - une version complète devrait
    // garder l'état du dernier envoi
    const deviceId = receiver.deviceId;
    const houseCode = receiver.houseCode || 'A';
    const unitCode = receiver.unitCode || 1;

    if (transmitter instanceof rfxcom.Lighting1) {
      transmitter.switchOn(deviceId, 0, unitCode);
    } else if (transmitter instanceof rfxcom.Lighting2) {
      transmitter.switchOn(deviceId, houseCode, unitCode, 100);
    } else if (transmitter instanceof rfxcom.Lighting5) {
      transmitter.switchOn(deviceId);
    } else {
      transmitter.switchOn(deviceId, houseCode, unitCode);
    }
  }

  /**
   * Envoie une commande DIM
   */
  private sendDimCommand(transmitter: any, receiver: RfxComReceiver, level: number): void {
    const deviceId = receiver.deviceId;
    const houseCode = receiver.houseCode || 'A';
    const unitCode = receiver.unitCode || 1;

    // Normaliser le niveau à 0-100
    const normalizedLevel = Math.max(0, Math.min(100, Math.round(level)));

    if (transmitter instanceof rfxcom.Lighting2) {
      transmitter.setLevel(deviceId, houseCode, unitCode, normalizedLevel);
    } else if (transmitter instanceof rfxcom.Lighting5) {
      transmitter.setLevel(deviceId, normalizedLevel);
    } else {
      // Pour les autres, envoyer ON avec un niveau
      if (transmitter instanceof rfxcom.Lighting1) {
        transmitter.switchOn(deviceId, 0, unitCode);
      }
    }
  }

  /**
   * Envoie une commande BRIGHTEN
   */
  private sendBrightenCommand(transmitter: any, receiver: RfxComReceiver): void {
    // Augmenter le niveau de luminosité
    // Cette implémentation est simplifiée
    const deviceId = receiver.deviceId;
    const houseCode = receiver.houseCode || 'A';
    const unitCode = receiver.unitCode || 1;

    if (transmitter instanceof rfxcom.Lighting5) {
      transmitter.setLevel(deviceId, 100);
    }
  }

  /**
   * Envoie une commande UP (pour les volets)
   */
  private sendUpCommand(transmitter: any, receiver: RfxComReceiver): void {
    const deviceId = receiver.deviceId;

    if (transmitter instanceof rfxcom.Blinds1) {
      transmitter.open(deviceId);
    }
  }

  /**
   * Envoie une commande DOWN (pour les volets)
   */
  private sendDownCommand(transmitter: any, receiver: RfxComReceiver): void {
    const deviceId = receiver.deviceId;

    if (transmitter instanceof rfxcom.Blinds1) {
      transmitter.close(deviceId);
    }
  }

  /**
   * Envoie une commande STOP (pour les volets)
   */
  private sendStopCommand(transmitter: any, receiver: RfxComReceiver): void {
    const deviceId = receiver.deviceId;

    if (transmitter instanceof rfxcom.Blinds1) {
      transmitter.stop(deviceId);
    }
  }

  // ======================================================================
  // SAUVEGARDE DE LA CONFIGURATION
  // ======================================================================

  /**
   * Sauvegarde la configuration RFXCOM
   */
  private async saveConfig(): Promise<void> {
    try {
      const currentConfig = this.configService.getConfig();
      
      const rfxcomConfig: RfxComConfig = {
        ...currentConfig.rfxcom as RfxComConfig,
        receivers: Array.from(this.receivers.values()),
        scenes: Array.from(this.scenes.values()),
        associations: Array.from(this.associations.values()).flat(),
        lastUpdated: new Date().toISOString()
      };

      // Sauvegarder via ConfigService
      await this.configService.savePartialConfig('rfxcom', rfxcomConfig);
      
      this.logger.debug('RfxComService', 'Configuration RFXCOM sauvegardée');
    } catch (error) {
      this.logger.error('RfxComService', `Erreur de sauvegarde de la configuration: ${error}`);
      throw error;
    }
  }

  // ======================================================================
  // ÉMISSION DES ÉVÉNEMENTS DE STATUT
  // ======================================================================

  /**
   * Émet le statut actuel de RFXCOM
   */
  private emitStatus(): void {
    const status: RfxComStatusEvent = {
      connected: this.isConnected,
      devicesCount: this.devices.size,
      receiversCount: this.receivers.size,
      lastDiscovery: this.lastDiscovery,
    };
    this.eventBus.emitGeneric(RFXCOM_SOCKET_EVENTS.STATUS, status);
  }

  /**
   * Émet une erreur via EventBus
   */
  private emitError(error: AppError): void {
    // Logguer l'erreur
    const logMethod = error.severity === 'error' ? 'error' : 
                      error.severity === 'warn' ? 'warn' : 
                      error.severity === 'info' ? 'info' : 'debug';
    this.logger[logMethod](error.module, `${error.code}: ${error.message}`);
    
    // Émettre sur EventBus
    this.eventBus.emitGeneric('rfxcom:error', error);
  }

  // ======================================================================
  // GETTERS PUBLIQUES
  // ======================================================================

  /**
   * Récupère la liste des devices
   */
  getDevices(): RfxComDevice[] {
    return Array.from(this.devices.values());
  }

  /**
   * Récupère un device par son ID
   */
  getDevice(deviceId: string): RfxComDevice | undefined {
    return this.devices.get(deviceId);
  }

  /**
   * Récupère la liste des récepteurs
   */
  getReceivers(): RfxComReceiver[] {
    return Array.from(this.receivers.values());
  }

  /**
   * Récupère un récepteur par son ID
   */
  getReceiver(receiverId: string): RfxComReceiver | undefined {
    return this.receivers.get(receiverId);
  }

  /**
   * Récupère la liste des scènes
   */
  getScenes(): RfxComScene[] {
    return Array.from(this.scenes.values());
  }

  /**
   * Récupère une scène par son ID
   */
  getScene(sceneId: string): RfxComScene | undefined {
    return this.scenes.get(sceneId);
  }

  /**
   * Récupère les associations pour un device
   */
  getAssociationsForDevice(deviceId: string): RfxComAssociation[] {
    return this.associations.get(deviceId) || [];
  }

  /**
   * Vérifie si RFXCOM est connecté
   */
  isRfxComConnected(): boolean {
    return this.isConnected;
  }
}
