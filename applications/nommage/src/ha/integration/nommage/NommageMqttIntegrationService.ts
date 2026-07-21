/**
 * NommageMqttIntegrationService
 * 
 * Service d'intégration MQTT pour l'application NOMMAGE.
 * Écoute les messages de découverte MQTT et les transmet via EventBus
 * pour traitement par le service métier.
 * 
 * Couche : HA (Intégration)
 * Rôle : Abstraction MQTT pour les modules de découverte
 */

import type { IEventBus, Logger, IAppConfigProvider } from '../../../../../core/src/exports';
import type { NommageConfig } from '../../../domain/config-schema';
import type { DiscoveryMessage } from '../../../domain/types';
import * as mqtt from 'mqtt';

// ============================================================================
// Interface du service
// ============================================================================

export interface INommageMqttIntegrationService {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  
  // Abonnements
  subscribeToDiscoveryTopics(topics: string[]): Promise<void>;
  unsubscribeFromDiscoveryTopics(): Promise<void>;
  
  // Publication (si nécessaire pour répondre)
  publish(topic: string, payload: unknown, qos?: 0 | 1 | 2, retain?: boolean): Promise<void>;
}

// ============================================================================
// Implémentation
// ============================================================================

export class NommageMqttIntegrationService implements INommageMqttIntegrationService {
  private client: mqtt.MqttClient | null = null;
  private config: NommageConfig;
  private isConnecting: boolean = false;
  
  constructor(
    private eventBus: IEventBus,
    private logger: Logger,
    private configProvider: IAppConfigProvider<NommageConfig>
  ) {
    this.config = this.configProvider.getAppConfig();
  }
  
  // ==========================================================================
  // Connexion MQTT
  // ==========================================================================
  
  async connect(): Promise<void> {
    if (this.client && this.isConnected()) {
      this.logger.info('NommageMqttIntegrationService', 'Déjà connecté à MQTT');
      return;
    }
    
    if (this.isConnecting) {
      this.logger.debug('NommageMqttIntegrationService', 'Connexion MQTT déjà en cours');
      return;
    }
    
    this.isConnecting = true;
    this.config = this.configProvider.getAppConfig();
    
    const mqttConfig = this.config.couples[0]?.mqtt || {};
    const brokerUrl = this.buildBrokerUrl();
    
    this.logger.info('NommageMqttIntegrationService', 
      `Tentative de connexion MQTT à ${brokerUrl}...`);
    
    try {
      const options: mqtt.IClientOptions = {
        clientId: mqttConfig.clientId || 'nommage-app',
        keepalive: mqttConfig.keepalive || 60,
        reconnectPeriod: mqttConfig.reconnectPeriod || 5000,
        clean: mqttConfig.cleanSession || true,
        username: mqttConfig.username,
        password: mqttConfig.password,
        rejectUnauthorized: mqttConfig.rejectUnauthorized || true
      };
      
      this.client = mqtt.connect(brokerUrl, options);
      
      // Gestion des événements de connexion
      this.setupMqttEventHandlers();
      
      // Attendre la connexion
      await new Promise<void>((resolve, reject) => {
        const connectTimeout = setTimeout(() => {
          reject(new Error('Timeout de connexion MQTT'));
        }, 30000);
        
        this.client!.on('connect', () => {
          clearTimeout(connectTimeout);
          this.logger.info('NommageMqttIntegrationService', 
            'Connecté au broker MQTT avec succès');
          this.isConnecting = false;
          resolve();
        });
        
        this.client!.on('error', (err) => {
          clearTimeout(connectTimeout);
          this.isConnecting = false;
          this.logger.error('NommageMqttIntegrationService', 
            `Erreur de connexion MQTT: ${err.message}`);
          reject(err);
        });
      });
      
      // S'abonner aux topics de découverte
      await this.subscribeToDiscoveryTopics(mqttConfig.discoveryTopics);
      
    } catch (error) {
      this.isConnecting = false;
      throw error;
    }
  }
  
  private buildBrokerUrl(): string {
    const mqttConfig = this.config.couples[0]?.mqtt || {};
    const protocol = mqttConfig.useTls ? 'mqtts' : 'mqtt';
    return `${protocol}://${mqttConfig.host}:${mqttConfig.port}`;
  }
  
  private setupMqttEventHandlers(): void {
    if (!this.client) return;
    
    // Message reçu
    this.client.on('message', (topic: string, payload: Buffer) => {
      this.handleIncomingMessage(topic, payload);
    });
    
    // Déconnexion
    this.client.on('close', () => {
      this.logger.warn('NommageMqttIntegrationService', 'Déconnecté du broker MQTT');
      this.emitStatusChange(false);
    });
    
    // Erreur après connexion
    this.client.on('error', (err: Error) => {
      this.logger.error('NommageMqttIntegrationService', 
        `Erreur MQTT: ${err.message}`);
    });
    
    // Reconnexion
    this.client.on('reconnect', () => {
      this.logger.info('NommageMqttIntegrationService', 'Tentative de reconnexion MQTT...');
    });
    
    // Offline
    this.client.on('offline', () => {
      this.logger.warn('NommageMqttIntegrationService', 'Client MQTT hors ligne');
      this.emitStatusChange(false);
    });
    
    // Online
    this.client.on('connect', () => {
      this.emitStatusChange(true);
    });
  }
  
  private emitStatusChange(connected: boolean): void {
    this.eventBus.emit('nommage:mqtt:status', {
      connected,
      timestamp: new Date()
    });
  }
  
  // ==========================================================================
  // Traitement des messages entrants
  // ==========================================================================
  
  private handleIncomingMessage(topic: string, payload: Buffer): void {
    try {
      const message = this.parseMessage(topic, payload);
      
      if (this.config.couples[0]?.logging?.showRawMessages) {
        this.logger.debug('NommageMqttIntegrationService', 
          `Message MQTT reçu - Topic: ${topic}`);
      }
      
      // Vérifier si le topic correspond à nos patterns de découverte
      if (this.isDiscoveryTopic(topic)) {
        this.processDiscoveryMessage(topic, message);
      }
    } catch (error) {
      this.logger.error('NommageMqttIntegrationService', 
        `Erreur lors du traitement du message MQTT: ${error}`);
    }
  }
  
  private parseMessage(topic: string, payload: Buffer): Record<string, unknown> {
    try {
      const payloadString = payload.toString('utf8');
      return JSON.parse(payloadString);
    } catch (error) {
      this.logger.warn('NommageMqttIntegrationService', 
        `Message non-JSON reçu sur ${topic}, traitement comme chaîne brute`);
      return { raw: payload.toString('utf8') };
    }
  }
  
  private isDiscoveryTopic(topic: string): boolean {
    const mqttConfig = this.config.couples[0]?.mqtt || {};
    const topicPrefix = mqttConfig.topicPrefix;
    
    // Vérifier si le topic commence par le préfixe configuré
    if (topicPrefix && !topic.startsWith(topicPrefix)) {
      return false;
    }
    
    // Vérifier si le topic correspond à un des patterns de découverte
    for (const pattern of mqttConfig.discoveryTopics || []) {
      if (this.topicMatchesPattern(topic, pattern)) {
        return true;
      }
    }
    
    return false;
  }
  
  private topicMatchesPattern(topic: string, pattern: string): boolean {
    // Simple wildcard matching (+ = un niveau, # = plusieurs niveaux)
    const topicParts = topic.split('/');
    const patternParts = pattern.split('/');
    
    if (topicParts.length !== patternParts.length) {
      return false;
    }
    
    return patternParts.every((part, index) => {
      if (part === '+') return true; // Un niveau quelconque
      if (part === '#') return true; // Plusieurs niveaux (simplifié)
      return part === topicParts[index];
    });
  }
  
  private processDiscoveryMessage(topic: string, payload: Record<string, unknown>): void {
    // Extraire le nom brut du payload (selon différentes conventions)
    let rawName: string;
    
    // Convention 1: Champ 'name' dans le payload
    if (typeof payload.name === 'string') {
      rawName = payload.name;
    }
    // Convention 2: Champ 'raw_name' 
    else if (typeof payload.raw_name === 'string') {
      rawName = payload.raw_name;
    }
    // Convention 3: Champ 'device' > 'name'
    else if (typeof payload === 'object' && payload && 
             typeof (payload as { device?: { name?: string } }).device?.name === 'string') {
      rawName = (payload as { device: { name: string } }).device.name;
    }
    // Convention 4: Prendre tout le payload comme chaîne
    else {
      rawName = JSON.stringify(payload);
    }
    
    const discoveryMessage: DiscoveryMessage = {
      rawName,
      rawQuoi: '',
      slugQuoi: '',
      rawLieux: '',
      lieuxSegments: [],
      topic,
      payload,
      timestamp: new Date()
    };
    
    // Émettre le message brut vers le service métier pour parsing
    this.eventBus.emit('nommage:discovery:raw', discoveryMessage);
    
    if (this.config.couples[0]?.logging?.showRawMessages) {
      this.logger.debug('NommageMqttIntegrationService', 
        `Message de découverte brut: ${rawName}`);
    }
  }
  
  // ==========================================================================
  // Abonnements MQTT
  // ==========================================================================
  
  async subscribeToDiscoveryTopics(topics: string[]): Promise<void> {
    if (!this.client || !this.isConnected()) {
      await this.connect();
    }
    
    if (!this.client) {
      throw new Error('Client MQTT non initialisé');
    }
    
    const qos = (this.config.couples[0]?.mqtt?.qos || 1) as 0 | 1 | 2;
    
    for (const topic of topics) {
      try {
        await new Promise<void>((resolve, reject) => {
          this.client!.subscribe(topic, { qos: qos as 0 | 1 | 2 }, (err) => {
            if (err) {
              this.logger.error('NommageMqttIntegrationService', 
                `Erreur d'abonnement à ${topic}: ${err.message}`);
              reject(err);
            } else {
              this.logger.info('NommageMqttIntegrationService', 
                `Abonné à ${topic} (QoS: ${qos})`);
              resolve();
            }
          });
        });
      } catch (error) {
        this.logger.error('NommageMqttIntegrationService', 
          `Échec de l'abonnement à ${topic}: ${error}`);
        throw error;
      }
    }
  }
  
  async unsubscribeFromDiscoveryTopics(): Promise<void> {
    if (!this.client || !this.isConnected()) {
      return;
    }
    
    const mqttConfig = this.config.couples[0]?.mqtt || {};
    
    for (const topic of mqttConfig.discoveryTopics || []) {
      await new Promise<void>((resolve) => {
        this.client!.unsubscribe(topic, {}, () => {
          this.logger.info('NommageMqttIntegrationService', 
            `Désabonné de ${topic}`);
          resolve();
        });
      });
    }
  }
  
  // ==========================================================================
  // Publication MQTT (si nécessaire)
  // ==========================================================================
  
  async publish(
    topic: string,
    payload: unknown,
    qos: 0 | 1 | 2 = 1,
    retain: boolean = true
  ): Promise<void> {
    if (!this.client || !this.isConnected()) {
      throw new Error('Non connecté à MQTT');
    }
    
    const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
    
    return new Promise<void>((resolve, reject) => {
      this.client!.publish(topic, payloadString, { qos, retain }, (err) => {
        if (err) {
          this.logger.error('NommageMqttIntegrationService', 
            `Erreur de publication sur ${topic}: ${err.message}`);
          reject(err);
        } else {
          this.logger.debug('NommageMqttIntegrationService', 
            `Message publié sur ${topic}`);
          resolve();
        }
      });
    });
  }
  
  // ==========================================================================
  // Gestion de la connexion
  // ==========================================================================
  
  async disconnect(): Promise<void> {
    if (!this.client) {
      return;
    }
    
    return new Promise<void>((resolve) => {
      this.client!.end(true, {}, () => {
        this.client = null;
        this.logger.info('NommageMqttIntegrationService', 'Déconnecté de MQTT');
        this.emitStatusChange(false);
        resolve();
      });
    });
  }
  
  isConnected(): boolean {
    return this.client !== null && this.client.connected;
  }
  
  // ==========================================================================
  // Factory
  // ==========================================================================
  
  static create(
    eventBus: IEventBus,
    logger: Logger,
    configProvider: IAppConfigProvider<NommageConfig>
  ): NommageMqttIntegrationService {
    return new NommageMqttIntegrationService(eventBus, logger, configProvider);
  }
}
