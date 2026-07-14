// =============================================================================
// IntegrationBridge - Pont entre les modules domaine et HA-integration
//
// Ce pont connecte les services d'intégration HA (comme HaMqttIntegrationService)
// avec les modules domaine (comme RfxComService) via un EventBus.
//
// **Responsabilités :**
// - Recevoir les événements des modules domaine et les transmettre à HA
// - Recevoir les commandes de HA et les transmettre aux modules domaine
// - Gérer la découverte MQTT et la publication d'état
// =============================================================================

import { HaMqttIntegrationService, HaMqttModuleConfig } from './HaMqttIntegrationService';
import { HaMqttDiscoveryEntity, HaMqttStateMessage } from './types/ha-mqtt';
import { EventBus, EntityDiscoveryEvent, EntityStateChangeEvent, DeviceConnectionEvent, CommandReceivedEvent } from '../../infrastructure/EventBus';
import { Logger } from '../../infrastructure/logger/index';

// =============================================================================
// Types
// =============================================================================

/**
 * Configuration pour un module domaine.
 */
export interface DomainModuleConfig {
  moduleName: string; // Nom du module (ex: 'rfxcom')
  entityPrefix?: string; // Préfixe pour les entity_ids HA (ex: 'sensor.rfxcom_')
}

/**
 * Configuration du pont d'intégration.
 */
export interface IntegrationBridgeConfig {
  haMqtt: HaMqttModuleConfig;
  modules: DomainModuleConfig[];
}

// =============================================================================
// IntegrationBridge
// =============================================================================

/**
 * Pont d'intégration entre les modules domaine et HA-integration.
 * 
 * **Utilisation :**
 * ```typescript
 * const bridge = new IntegrationBridge({
 *   haMqtt: {
 *     moduleName: 'integration',
 *     clientId: 'ha-integration-bridge',
 *     cleanSession: false,
 *     keepalive: 60,
 *     reconnectPeriod: 5000
 *   },
 *   modules: [{ moduleName: 'rfxcom' }]
 * });
 * 
 * // Connecter à MQTT
 * await bridge.connect('192.168.1.100', 1883);
 * 
 * // Le pont écoute automatiquement les événements de l'EventBus
 * // et les transmet à HA via MQTT
 * ```
 */
export class IntegrationBridge {
  private haMqttService: HaMqttIntegrationService;
  private eventBus: EventBus;
  private logger: Logger;
  
  // Stockage des entités découvertes par module
  private discoveredEntities: Map<string, Map<string, HaMqttDiscoveryEntity>> = new Map();
  
  // Stockage des états par module
  private entityStates: Map<string, Map<string, HaMqttStateMessage>> = new Map();

  /**
   * @param config - Configuration du pont
   * @param eventBus - EventBus partagé (optionnel, en créé un nouveau si non fourni)
   * @param logger - Logger optionnel
   */
  constructor(
    config: IntegrationBridgeConfig,
    eventBus?: EventBus,
    logger?: Logger
  ) {
    // this.config = config;
    this.eventBus = eventBus || new EventBus();
    this.logger = logger || new Logger({
      level: 'info',
      maxSizeMb: 10,
      maxFiles: 5,
      logDir: '/app/logs',
    });

    this.haMqttService = new HaMqttIntegrationService(
      config.haMqtt,
      this.logger
    );
  }

  /**
   * Initialise le pont et configure les listeners.
   * Doit être appelé avant connect().
   */
  initialize(): void {
    this.logger.info('bridge', 'Initialisation du pont d\'intégration');

    // Configurer les listeners pour les événements domaine
    this.setupDomainEventListeners();

    // Configurer les listeners pour les commandes HA
    this.setupHaCommandListeners();
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
    this.logger.info('bridge', `Connexion MQTT: ${host}:${port}`);
    await this.haMqttService.connect(host, port, username, password);

    // S'abonner à toutes les commandes pour tous les modules
    this.haMqttService.subscribeToAllModuleCommands(1);

    this.logger.info('bridge', 'Pont d\'intégration connecté');
  }

  /**
   * Déconnecte le pont.
   */
  disconnect(): void {
    this.logger.info('bridge', 'Déconnexion du pont d\'intégration');
    this.haMqttService.disconnect();
  }

  /**
   * Configure les listeners pour les événements des modules domaine.
   */
  private setupDomainEventListeners(): void {
    // Écouter les événements de découverte d'entités
    this.eventBus.on<EntityDiscoveryEvent>('entity:discovered', (event) => {
      this.handleEntityDiscovered(event);
    });

    // Écouter les événements de changement d'état
    this.eventBus.on<EntityStateChangeEvent>('entity:state_changed', (event) => {
      this.handleEntityStateChanged(event);
    });

    // Écouter les événements de suppression d'entités
    this.eventBus.on('entity:removed', (event: any) => {
      this.handleEntityRemoved(event);
    });

    // Écouter les événements de connexion/déconnexion de devices
    this.eventBus.on<DeviceConnectionEvent>('device:connected', (event) => {
      this.handleDeviceConnected(event);
    });

    this.eventBus.on<DeviceConnectionEvent>('device:disconnected', (event) => {
      this.handleDeviceDisconnected(event);
    });

    this.logger.debug('bridge', 'Listeners domaine configurés');
  }

  /**
   * Configure les listeners pour les commandes HA.
   */
  private setupHaCommandListeners(): void {
    this.haMqttService.onCommand((event) => {
      this.handleHaCommand(event);
    });

    this.logger.debug('bridge', 'Listeners commandes HA configurés');
  }

  /**
   * Gère un événement de découverte d'entité.
   */
  private handleEntityDiscovered(event: EntityDiscoveryEvent): void {
    this.logger.info('bridge', `Entité découverte: ${event.data.entityId} (source: ${event.source})`);

    // Créer le message de découverte HA
    const discoveryEntity: HaMqttDiscoveryEntity = {
      name: event.data.name,
      unique_id: event.data.entityId,
      device_class: event.data.deviceClass,
      state_topic: `homeassistant/${event.data.component}/${event.data.entityId}/state`,
      ...(event.data.commandTopic && { command_topic: event.data.commandTopic }),
      unit_of_measurement: event.data.unitOfMeasurement,
      icon: event.data.icon,
      retain: true,
      qos: 1,
    };

    // Publier la découverte
    this.haMqttService.publishDiscovery(
      event.data.component,
      event.data.entityId,
      discoveryEntity,
      true,
      1
    );

    // Stocker l'entité
    if (!this.discoveredEntities.has(event.source)) {
      this.discoveredEntities.set(event.source, new Map());
    }
    this.discoveredEntities.get(event.source)?.set(event.data.entityId, discoveryEntity);

    // Publier l'état initial
    const stateMessage: HaMqttStateMessage = {
      state: String(event.data.state),
      attributes: event.data.attributes,
    };

    this.haMqttService.publishState(
      event.data.component,
      event.data.entityId,
      stateMessage,
      true,
      1
    );

    // Stocker l'état
    if (!this.entityStates.has(event.source)) {
      this.entityStates.set(event.source, new Map());
    }
    this.entityStates.get(event.source)?.set(event.data.entityId, stateMessage);
  }

  /**
   * Gère un événement de changement d'état.
   */
  private handleEntityStateChanged(event: EntityStateChangeEvent): void {
    this.logger.debug('bridge', `État changé: ${event.data.entityId} (source: ${event.source})`);

    // Récupérer le composant depuis l'entité découverte
    const moduleEntities = this.discoveredEntities.get(event.source);
    if (!moduleEntities) {
      this.logger.warn('bridge', `Aucune entité découverte pour le module: ${event.source}`);
      return;
    }

    const entity = moduleEntities.get(event.data.entityId);
    if (!entity) {
      this.logger.warn('bridge', `Entité inconnue: ${event.data.entityId}`);
      return;
    }

    // Publier le nouvel état
    const stateMessage: HaMqttStateMessage = {
      state: String(event.data.state),
      attributes: event.data.attributes,
    };

    // Déterminer le composant à partir du topic d'état
    const component = this.extractComponentFromStateTopic(entity.state_topic);

    this.haMqttService.publishState(
      component,
      event.data.entityId,
      stateMessage,
      true,
      1
    );

    // Mettre à jour l'état stocké
    if (!this.entityStates.has(event.source)) {
      this.entityStates.set(event.source, new Map());
    }
    this.entityStates.get(event.source)?.set(event.data.entityId, stateMessage);
  }

  /**
   * Gère un événement de suppression d'entité.
   */
  private handleEntityRemoved(event: { data: { entityId: string }; source: string }): void {
    this.logger.info('bridge', `Entité supprimée: ${event.data.entityId} (source: ${event.source})`);

    // Supprimer de la découverte (publier un message vide ou supprimer le topic)
    // Pour MQTT HA, on ne peut pas vraiment supprimer, mais on peut publier un message vide
    const moduleEntities = this.discoveredEntities.get(event.source);
    if (moduleEntities) {
      const entity = moduleEntities.get(event.data.entityId);
      if (entity) {
        // Publier un message vide pour supprimer la découverte
        const component = this.extractComponentFromStateTopic(entity.state_topic);
        // Pour supprimer une entité, publier un message vide avec retain=false
        this.haMqttService.publishDiscovery(
          component,
          event.data.entityId,
          { name: '', unique_id: '', state_topic: '' } as unknown as HaMqttDiscoveryEntity,
          false,
          1
        );
      }
    }

    // Supprimer de la mapa
    this.discoveredEntities.get(event.source)?.delete(event.data.entityId);
    this.entityStates.get(event.source)?.delete(event.data.entityId);
  }

  /**
   * Gère un événement de connexion de device.
   */
  private handleDeviceConnected(event: DeviceConnectionEvent): void {
    this.logger.info('bridge', `Device connecté: ${event.data.deviceId} (source: ${event.source})`);
    // Pour l'instant, on ne fait rien de spécial, mais on pourrait publier un LWT
  }

  /**
   * Gère un événement de déconnexion de device.
   */
  private handleDeviceDisconnected(event: DeviceConnectionEvent): void {
    this.logger.info('bridge', `Device déconnecté: ${event.data.deviceId} (source: ${event.source})`);
    // Pour l'instant, on ne fait rien de spécial
  }

  /**
   * Gère une commande reçue de HA.
   */
  private handleHaCommand(event: any): void {
    // event est de type IntegrationCommandEvent
    this.logger.info('bridge', `Commande reçue: ${event.topic}`);
    this.logger.debug('bridge', `Commande détails: ${JSON.stringify(event.payload)}`);

    // Extraire le module cible du topic
    // Format: homeassistant/{component}/{object_id}/set
    const topicParts = event.topic.split('/');
    if (topicParts.length < 4 || topicParts[3] !== 'set') {
      this.logger.warn('bridge', `Topic de commande invalide: ${event.topic}`);
      return;
    }

    // const component = topicParts[1];
    const objectId = topicParts[2];

    // Déterminer le module cible
    // Pour l'instant, on cherche quel module a une entité avec cet object_id
    let targetModule: string | null = null;
    
    for (const [module, entities] of this.discoveredEntities) {
      if (entities.has(objectId)) {
        targetModule = module;
        break;
      }
    }

    if (!targetModule) {
      this.logger.warn('bridge', `Aucun module trouvé pour l'entité: ${objectId}`);
      return;
    }

    // Émettre un événement de commande vers le module domaine
    const commandEvent: CommandReceivedEvent = {
      type: 'command:received',
      source: 'ha-mqtt',
      timestamp: new Date(),
      data: {
        module: targetModule,
        entityId: objectId,
        command: (event.payload?.state as string | undefined) || 'unknown',
        payload: event.payload,
      },
    };

    this.eventBus.emit(commandEvent);
    this.logger.info('bridge', `Commande transmise au module: ${targetModule}`);
  }

  /**
   * Extrait le composant HA à partir d'un topic d'état.
   * @param topic - Topic d'état (ex: 'homeassistant/sensor/temp_001/state')
   * @returns Composant HA (ex: 'sensor')
   */
  private extractComponentFromStateTopic(topic: string): string {
    const parts = topic.split('/');
    if (parts.length >= 2 && parts[1]) {
      return parts[1];
    }
    return 'unknown';
  }

  /**
   * Récupère l'EventBus pour permettre aux modules de s'y abonner.
   */
  getEventBus(): EventBus {
    return this.eventBus;
  }

  /**
   * Récupère le service HA MQTT.
   */
  getHaMqttService(): HaMqttIntegrationService {
    return this.haMqttService;
  }

  /**
   * Vérifie si le pont est connecté.
   */
  isConnected(): boolean {
    return this.haMqttService.isConnectedToMqtt();
  }
}
