import { MqttClient, connect, IClientOptions } from 'mqtt';
import { 
  HaMqttDiscoveryEntity, 
  HaMqttStateMessage,
  HaMqttCommandMessage,
  IntegrationCommandEvent,
  getDiscoveryTopic,
  getStateTopic,
  getCommandTopic,
  getLwtTopic,
  PAYLOAD_ONLINE,
  PAYLOAD_OFFLINE
} from './types/ha-mqtt';
import { Logger } from '../../infrastructure/logger/index';
import { createMqttError, type AppError } from '../../types/errors';

// =============================================================================
// HaMqttIntegrationService - Service MQTT générique pour l'intégration HA
//
// Ce service gère la connexion MQTT, la publication des messages de découverte,
// et la réception des commandes depuis Home Assistant.
//
// **Responsabilités :**
// - Connexion/déconnexion MQTT avec LWT
// - Publication des messages de découverte (config) et d'état (state)
// - Réception et routage des commandes vers les modules métier
// - Gestion des abonnements MQTT
// =============================================================================

/**
 * Callback pour les commandes reçues.
 */
type CommandCallback = (event: IntegrationCommandEvent) => void;

/**
 * Callback pour les changements de statut de connexion.
 */
type ConnectionCallback = (module: string, connected: boolean) => void;

/**
 * Configuration du service MQTT pour un module.
 */
export interface HaMqttModuleConfig {
  moduleName: string;
  clientId: string;
  cleanSession: boolean;
  keepalive: number;
  reconnectPeriod: number; // ms
}

/**
 * Service MQTT pour l'intégration HA.
 *
 * **Utilisation :**
 * ```typescript
 * const service = new HaMqttIntegrationService({
 *   moduleName: 'module-name',
 *   clientId: 'ha-integration-module-name',
 *   cleanSession: false,
 *   keepalive: 60,
 *   reconnectPeriod: 5000
 * });
 * 
 * service.onCommand((event) => {
 *   console.log('Commande reçue:', event.payload);
 * });
 * 
 * await service.connect('192.168.1.100', 1883);
 * service.publishDiscovery('sensor', 'temperature_001', discoveryPayload);
 * service.publishState('sensor', 'temperature_001', { state: '22.5' });
 * service.subscribeToCommands('switch', 'light_001');
 * ```
 */
export class HaMqttIntegrationService {
  private client: MqttClient | null = null;
  private logger: Logger;
  private commandCallbacks: CommandCallback[] = [];
  private connectionCallbacks: ConnectionCallback[] = [];
  private isConnected = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;

  /**
   * @param config - Configuration du module
   * @param logger - Logger (optionnel)
   */
  constructor(
    private readonly config: HaMqttModuleConfig,
    logger?: Logger
  ) {
    this.logger = logger || new Logger({
      level: 'info',
      maxSizeMb: 10,
      maxFiles: 5,
      logDir: '/app/logs',
    });
  }

  /**
   * Établit la connexion MQTT.
   *
   * @param host - Adresse du broker MQTT
   * @param port - Port du broker MQTT
   * @param username - Utilisateur (optionnel)
   * @param password - Mot de passe (optionnel)
   * @returns Promise qui résout quand connecté
   */
  async connect(
    host: string,
    port: number,
    username?: string,
    password?: string
  ): Promise<void> {
    this.logger.info('ha:mqtt', `Connexion MQTT pour module ${this.config.moduleName}...`);

    const options: IClientOptions = {
      clientId: this.config.clientId,
      clean: this.config.cleanSession,
      keepalive: this.config.keepalive,
      reconnectPeriod: this.config.reconnectPeriod,
      connectTimeout: 10000,
      ...(username && password && { username, password }),
      // LWT configuration
      will: {
        topic: getLwtTopic(this.config.moduleName),
        payload: PAYLOAD_OFFLINE,
        qos: 1,
        retain: true,
      },
    };

    return new Promise((resolve, reject) => {
      this.client = connect(`mqtt://${host}:${port}`, options);

      this.client.on('connect', () => {
        this.handleConnect();
        resolve();
      });

      this.client.on('error', (error) => {
        this.handleError(error);
        reject(error);
      });

      this.client.on('close', () => {
        this.handleClose();
      });

      this.client.on('offline', () => {
        this.handleOffline();
      });

      this.client.on('message', (topic, payload) => {
        this.handleMessage(topic, payload);
      });
    });
  }

  /**
   * Gère la connexion MQTT.
   */
  private handleConnect(): void {
    this.isConnected = true;
    this.notifyConnection(true);
    
    // Publier LWT online
    this.publishLwt(true);
    
    this.logger.info('ha:mqtt', `Module ${this.config.moduleName} connecté au broker MQTT`);
  }

  /**
   * Gère une erreur MQTT.
   */
  private handleError(error: Error): void {
    this.logger.error('ha:mqtt', `Erreur MQTT pour ${this.config.moduleName}: ${error.message}`);
    this.isConnected = false;
    this.notifyConnection(false);
    
    // Planifier une reconnexion
    this.scheduleReconnect();
  }

  /**
   * Gère la fermeture de la connexion.
   */
  private handleClose(): void {
    if (this.isConnected) {
      this.isConnected = false;
      this.notifyConnection(false);
      this.logger.warn('ha:mqtt', `Module ${this.config.moduleName} : connexion MQTT fermée`);
    }
    
    // Planifier une reconnexion
    this.scheduleReconnect();
  }

  /**
   * Gère le passage hors ligne.
   */
  private handleOffline(): void {
    if (this.isConnected) {
      this.isConnected = false;
      this.notifyConnection(false);
      this.logger.warn('ha:mqtt', `Module ${this.config.moduleName} : MQTT offline`);
    }
    
    // Planifier une reconnexion
    this.scheduleReconnect();
  }

  /**
   * Planifie une reconnexion.
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    
    this.reconnectTimeout = setTimeout(() => {
      this.logger.info('ha:mqtt', `Tentative de reconnexion MQTT pour ${this.config.moduleName}...`);
      if (this.client) {
        this.client.reconnect();
      }
    }, this.config.reconnectPeriod);
  }

  /**
   * Gère un message MQTT entrant.
   */
  private handleMessage(topic: string, payload: Buffer): void {
    if (!this.isConnected) {
      return;
    }

    try {
      const message = payload.toString();
      this.logger.debug('ha:mqtt', `Message reçu sur ${topic}: ${message}`);

      // Vérifier si c'est un topic de commande HA
      // Format: homeassistant/{component}/{object_id}/set
      const topicParts = topic.split('/');
      if (topicParts.length >= 4 && topicParts[0] === 'homeassistant' && topicParts[3] === 'set') {
        const component = topicParts[1];
        const objectId = topicParts[2];
        
        if (!component || !objectId) {
          this.logger.warn('ha:mqtt', `Topic mal formaté: ${topic}`);
          return;
        }
        
        try {
          const commandPayload: HaMqttCommandMessage = JSON.parse(message);
          
          const event: IntegrationCommandEvent = {
            module: this.config.moduleName,
            component,
            objectId,
            payload: commandPayload,
            topic,
          };

          this.notifyCommand(event);
        } catch (e) {
          this.logger.error('ha:mqtt', `Erreur de parsing JSON sur ${topic}: ${e}`);
        }
      }
    } catch (error) {
      this.logger.error('ha:mqtt', `Erreur dans handleMessage: ${error}`);
    }
  }

  /**
   * Publie un message de découverte HA.
   *
   * @param component - Composant HA (ex: 'sensor', 'switch', 'binary_sensor')
   * @param objectId - ID de l'objet (ex: 'temperature_salon')
   * @param entity - Message de découverte HA
   * @param retain - Conserver le message (default: true)
   * @param qos - QoS (default: 1)
   */
  publishDiscovery(
    component: string,
    objectId: string,
    entity: HaMqttDiscoveryEntity,
    retain: boolean = true,
    qos: 0 | 1 | 2 = 1
  ): void {
    if (!this.isConnected || !this.client) {
      this.logger.warn('ha:mqtt', `Impossible de publier : non connecté`);
      return;
    }

    const topic = getDiscoveryTopic(component, objectId);
    const payload = JSON.stringify(entity);

    this.client.publish(topic, payload, { qos, retain }, (error) => {
      if (error) {
        this.logger.error('ha:mqtt', `Erreur publication discovery ${topic}: ${error}`);
      } else {
        this.logger.debug('ha:mqtt', `Discovery publié: ${topic}`);
      }
    });
  }

  /**
   * Publie un message d'état HA.
   *
   * @param component - Composant HA
   * @param objectId - ID de l'objet
   * @param state - Message d'état HA
   * @param retain - Conserver le message (default: true)
   * @param qos - QoS (default: 1)
   */
  publishState(
    component: string,
    objectId: string,
    state: HaMqttStateMessage,
    retain: boolean = true,
    qos: 0 | 1 | 2 = 1
  ): void {
    if (!this.isConnected || !this.client) {
      this.logger.warn('ha:mqtt', `Impossible de publier : non connecté`);
      return;
    }

    const topic = getStateTopic(component, objectId);
    const payload = JSON.stringify(state);

    this.client.publish(topic, payload, { qos, retain }, (error) => {
      if (error) {
        this.logger.error('ha:mqtt', `Erreur publication state ${topic}: ${error}`);
      } else {
        this.logger.debug('ha:mqtt', `État publié: ${topic} = ${payload}`);
      }
    });
  }

  /**
   * Publie le statut LWT.
   *
   * @param online - true = online, false = offline
   */
  publishLwt(online: boolean): void {
    if (!this.client) {
      return;
    }

    const topic = getLwtTopic(this.config.moduleName);
    const payload = online ? PAYLOAD_ONLINE : PAYLOAD_OFFLINE;

    this.client.publish(topic, payload, { qos: 1, retain: true }, (error) => {
      if (error) {
        this.logger.error('ha:mqtt', `Erreur publication LWT: ${error}`);
      } else {
        this.logger.debug('ha:mqtt', `LWT publié: ${topic} = ${payload}`);
      }
    });
  }

  /**
   * Abonne à un topic de commande HA.
   *
   * @param component - Composant HA
   * @param objectId - ID de l'objet
   * @param qos - QoS (default: 1)
   */
  subscribeToCommands(
    component: string,
    objectId: string,
    qos: 0 | 1 | 2 = 1
  ): void {
    if (!this.isConnected || !this.client) {
      this.logger.warn('ha:mqtt', `Impossible de s'abonner : non connecté`);
      return;
    }

    const topic = getCommandTopic(component, objectId);

    this.client.subscribe(topic, { qos }, (error) => {
      if (error) {
        this.logger.error('ha:mqtt', `Erreur abonnement ${topic}: ${error}`);
      } else {
        this.logger.debug('ha:mqtt', `Abonné à: ${topic}`);
      }
    });
  }

  /**
   * Se désabonne d'un topic.
   *
   * @param component - Composant HA
   * @param objectId - ID de l'objet
   */
  unsubscribeFromCommands(component: string, objectId: string): void {
    if (!this.isConnected || !this.client) {
      return;
    }

    const topic = getCommandTopic(component, objectId);

    this.client.unsubscribe(topic, (error) => {
      if (error) {
        this.logger.error('ha:mqtt', `Erreur désabonnement ${topic}: ${error}`);
      } else {
        this.logger.debug('ha:mqtt', `Désabonné de: ${topic}`);
      }
    });
  }

  /**
   * S'abonne à tous les topics de commande d'un module.
   * Utilise un wildcard pour recevoir toutes les commandes du module.
   */
  subscribeToAllModuleCommands(qos: 0 | 1 | 2 = 1): void {
    if (!this.isConnected || !this.client) {
      return;
    }

    const topic = `homeassistant/+/+/set`;

    this.client.subscribe(topic, { qos }, (error) => {
      if (error) {
        this.logger.error('ha:mqtt', `Erreur abonnement wildcard: ${error}`);
      } else {
        this.logger.info('ha:mqtt', `Abonné à toutes les commandes: ${topic}`);
      }
    });
  }

  /**
   * S'abonne aux événements de découverte depuis les modules métier.
   * NOTE: À implémenter avec EventBus dans l'application.
   *
   * @param callback - Callback pour les événements de découverte
   */
  onDiscovery(_callback: (event: any) => void): void {
    // Implementation via EventBus in application layer
  }

  /**
   * S'abonne aux événements de changement d'état depuis les modules métier.
   * NOTE: À implémenter avec EventBus dans l'application.
   *
   * @param callback - Callback pour les événements d'état
   */
  onStateChange(_callback: (event: any) => void): void {
    // Implementation via EventBus in application layer
  }

  /**
   * S'abonne aux commandes reçues de HA.
   *
   * @param callback - Callback pour les commandes
   */
  onCommand(callback: CommandCallback): void {
    this.commandCallbacks.push(callback);
  }

  /**
   * Notifie les callbacks de commande.
   */
  private notifyCommand(event: IntegrationCommandEvent): void {
    for (const callback of this.commandCallbacks) {
      try {
        callback(event);
      } catch (error) {
        this.logger.error('ha:mqtt', `Erreur dans callback de commande: ${error}`);
      }
    }
  }

  /**
   * S'abonne aux changements de connexion.
   *
   * @param callback - Callback pour les changements de connexion
   */
  onConnectionChange(callback: ConnectionCallback): void {
    this.connectionCallbacks.push(callback);
  }

  /**
   * Notifie les callbacks de connexion.
   */
  private notifyConnection(connected: boolean): void {
    for (const callback of this.connectionCallbacks) {
      try {
        callback(this.config.moduleName, connected);
      } catch (error) {
        this.logger.error('ha:mqtt', `Erreur dans callback de connexion: ${error}`);
      }
    }
  }

  /**
   * Ferme la connexion MQTT.
   */
  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.client) {
      // Publier LWT offline avant de se déconnecter
      this.publishLwt(false);
      
      this.client.end();
      this.client = null;
      this.isConnected = false;
      this.notifyConnection(false);
      this.logger.info('ha:mqtt', `Module ${this.config.moduleName} déconnecté du broker MQTT`);
    }
  }

  /**
   * Vérifie si le client est connecté.
   */
  isConnectedToMqtt(): boolean {
    return this.isConnected && this.client !== null;
  }

  /**
   * Récupère le client MQTT.
   */
  getMqttClient(): MqttClient | null {
    return this.client;
  }

  /**
   * Récupère la configuration du module.
   */
  getConfig(): HaMqttModuleConfig {
    return { ...this.config };
  }
}
