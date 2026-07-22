import { HaWsTransport, HaWsMessage } from '../../infrastructure/transport/HaWsTransport';
import { HaRawEntity, HaStateChangedMessage, HaAreaRegistryUpdatedMessage, HaDeviceRegistryUpdatedMessage, HaEntityRegistryUpdatedMessage } from '../types/ha-entity';
import { HaWsConfig } from '../../infrastructure/config/schema';
import { Logger } from '../../infrastructure/logger/index';

// =============================================================================
// Types pour les messages HA spécifiques
// =============================================================================

/**
 * Réponse à la requête get_states
 */
export interface HaGetStatesResponse extends HaWsMessage {
  type: 'result';
  id: number;
  result: HaRawEntity[];
}

/**
 * Réponse à la requête config/area_registry/list
 */
export interface HaAreaRegistryResponse extends HaWsMessage {
  type: 'result';
  id: number;
  result: {
    areas: Array<{
      area_id: string;
      name: string;
      picture?: string;
    }>;
  };
}

/**
 * Réponse à la requête config/device_registry/list
 */
export interface HaDeviceRegistryResponse extends HaWsMessage {
  type: 'result';
  id: number;
  result: Array<{
    device_id: string;
    config_entries: any[];
    area_id?: string;
    name: string;
    identifiers?: any[];
    manufacturer?: string;
    model?: string;
    via_device_id?: string;
  }>;
}

/**
 * Message de réponse générique
 */
export interface HaGenericResponse extends HaWsMessage {
  type: 'result';
  id: number;
  result: any;
}

/**
 * Message d'erreur HA
 */
export interface HaErrorResponse extends HaWsMessage {
  type: 'error';
  id: number;
  error: {
    code: string;
    message: string;
  };
}

// =============================================================================
// Callbacks pour les événements HA
// =============================================================================

type EntityStateCallback = (entity: HaRawEntity) => void;
type AreaUpdatedCallback = (area: { area_id: string; name: string; picture?: string }) => void;
type DeviceUpdatedCallback = (device: { device_id: string; name: string; area_id?: string }) => void;
type EntityUpdatedCallback = (entity: { entity_id: string; domain: string; device_class?: string; area_id?: string }) => void;
type MessageCallback = (message: HaWsMessage) => void;
type ConnectCallback = () => void;
type DisconnectCallback = (reason?: string) => void;
type ErrorCallback = (error: Error) => void;

// =============================================================================
// HaWsClient - Client WebSocket HA de haut niveau
// =============================================================================

/**
 * Client WebSocket HA de haut niveau.
 * Gère la connexion, l'authentification, et la synchronisation du référentiel HA.
 * 
 * **Responsabilités :**
 * - Connexion et authentification via Long-Lived Access Token
 * - Chargement initial des états, areas, devices
 * - Souscription aux événements temps réel
 * - Émission des événements vers EventBus
 * 
 * **Ne pas confondre avec :**
 * - HaWsTransport (bas niveau, dans Infrastructure)
 * - HaStateRegistry (stockage des états)
 * - HaStructureRegistry (structuration des entités)
 */
export class HaWsClient {
  private transport: HaWsTransport;
  private logger: Logger;
  
  // État de connexion
  private isAuthenticated = false;
  private isReady = false;
  
  // Configuration actuelle pour reconfigure
  private currentConfig: HaWsConfig;
  
  // ID des requêtes
  private nextId = 1;
  private pendingRequests: Map<number, { resolve: (data: any) => void; reject: (error: Error) => void }> = new Map();

  // Callbacks
  private stateCallbacks: EntityStateCallback[] = [];
  private areaCallbacks: AreaUpdatedCallback[] = [];
  private deviceCallbacks: DeviceUpdatedCallback[] = [];
  private entityCallbacks: EntityUpdatedCallback[] = [];
  private messageCallbacks: MessageCallback[] = [];
  private connectCallbacks: ConnectCallback[] = [];
  private disconnectCallbacks: DisconnectCallback[] = [];
  private errorCallbacks: ErrorCallback[] = [];

  /**
   * @param config - Configuration WebSocket HA
   * @param transport - Transport bas niveau (optionnel, créé automatiquement)
   * @param logger - Logger pour les logs (optionnel)
   */
  constructor(
    private readonly config: HaWsConfig,
    transport?: HaWsTransport,
    logger?: Logger
  ) {
    // Stocker la config actuelle
    this.currentConfig = config;
    
    this.transport = transport || new HaWsTransport({
      host: config.host,
      port: config.port,
      token: config.token,
      reconnectDelay: config.reconnect_delay,
    });
    
    this.logger = logger || new Logger({
      level: 'info',
      maxSizeMb: 10,
      maxFiles: 5,
      logDir: '/app/logs',
    });

    this.setupTransportListeners();
  }

  // ===========================================================================
  // Méthodes publiques
  // ===========================================================================

  /**
   * Établit la connexion à Home Assistant.
   * Se connecte, s'authentifie, et lance la synchronisation initiale.
   */
  connect(): void {
    this.logger.info('ha:ws', `Connexion à HA WebSocket: ${this.config.host}:${this.config.port}`);
    this.transport.connect();
  }

  /**
   * Ferme la connexion.
   */
  disconnect(): void {
    this.logger.info('ha:ws', 'Déconnexion de HA WebSocket');
    this.transport.disconnect();
    this.isAuthenticated = false;
    this.isReady = false;
  }

  /**
   * Charge le référentiel initial de manière synchrone.
   * Appelle get_states, config/area_registry/list, config/device_registry/list
   * et config/entity_registry/list en parallèle.
   * 
   * @returns Promise qui résout quand tout est chargé
   */
  async loadInitialRegistry(): Promise<{
    entities: HaRawEntity[];
    areas: Array<{ area_id: string; name: string; picture?: string }>;
    devices: Array<{ device_id: string; name: string; area_id?: string }>;
    entityRegistry: Array<{ entity_id: string; domain: string; device_class?: string; area_id?: string }>;
  }> {
    if (!this.isAuthenticated) {
      throw new Error('Cannot load registry: not authenticated. Call connect() first.');
    }

    this.logger.info('ha:ws', 'Chargement du référentiel initial');

    // Envoyer toutes les requêtes en parallèle
    const [
      statesPromise,
      areasPromise,
      devicesPromise,
      entitiesPromise,
    ] = [
      this.sendRequest<HaGetStatesResponse>({ type: 'get_states' }),
      this.sendRequest<HaAreaRegistryResponse>({ type: 'config/area_registry/list' }),
      this.sendRequest<HaDeviceRegistryResponse>({ type: 'config/device_registry/list' }),
      this.sendRequest<HaEntityRegistryUpdatedMessage>({ type: 'config/entity_registry/list' }),
    ];

    // Attendre toutes les réponses
    const [statesResult, areasResult, devicesResult, entitiesResult] = await Promise.all([
      statesPromise,
      areasPromise,
      devicesPromise,
      entitiesPromise,
    ]);

    this.logger.info('ha:ws', `Référentiel chargé: ${statesResult.result.length} entités, ${areasResult.result.areas.length} areas, ${devicesResult.result.length} devices`);
    this.isReady = true;

    return {
      entities: statesResult.result,
      areas: areasResult.result.areas,
      devices: devicesResult.result,
      entityRegistry: entitiesResult.result as any,
    };
  }

  /**
   * Souscrit aux événements temps réel HA.
   */
  subscribeToEvents(): void {
    this.logger.info('ha:ws', 'Souscription aux événements temps réel');
    
    // Souscrire aux événements de changement d'état
    this.sendMessage({ id: this.nextId++, type: 'subscribe_events', event_type: 'state_changed' });
    
    // Souscrire aux événements de registry
    this.sendMessage({ id: this.nextId++, type: 'subscribe_events', event_type: 'area_registry_updated' });
    this.sendMessage({ id: this.nextId++, type: 'subscribe_events', event_type: 'device_registry_updated' });
    this.sendMessage({ id: this.nextId++, type: 'subscribe_events', event_type: 'entity_registry_updated' });
  }

  /**
   * Envoie une commande à Home Assistant (via call_service).
   * @param domain - Domaine de la commande (ex: "light", "switch")
   * @param service - Service à appeler (ex: "turn_on", "turn_off")
   * @param target - Cible de la commande (ex: { entity_id: "light.salon" })
   * @param serviceData - Données du service (optionnel)
   */
  sendCommand(
    domain: string,
    service: string,
    target: { entity_id?: string | string[] },
    serviceData?: Record<string, unknown>
  ): Promise<unknown> {
    if (!this.isAuthenticated) {
      throw new Error('Cannot send command: not authenticated');
    }

    const message = {
      type: 'call_service',
      domain,
      service,
      target,
      service_data: serviceData || {},
    };

    return this.sendRequest(message);
  }

  // ===========================================================================
  // Callbacks pour s'abonner aux événements
  // ===========================================================================

  onStateChanged(callback: EntityStateCallback): void {
    this.stateCallbacks.push(callback);
  }

  onAreaUpdated(callback: AreaUpdatedCallback): void {
    this.areaCallbacks.push(callback);
  }

  onDeviceUpdated(callback: DeviceUpdatedCallback): void {
    this.deviceCallbacks.push(callback);
  }

  onEntityUpdated(callback: EntityUpdatedCallback): void {
    this.entityCallbacks.push(callback);
  }

  onMessage(callback: MessageCallback): void {
    this.messageCallbacks.push(callback);
  }

  onConnect(callback: ConnectCallback): void {
    this.connectCallbacks.push(callback);
  }

  onDisconnect(callback: DisconnectCallback): void {
    this.disconnectCallbacks.push(callback);
  }

  onError(callback: ErrorCallback): void {
    this.errorCallbacks.push(callback);
  }

  // ===========================================================================
  // Méthodes privées - Transport
  // ===========================================================================

  /**
   * Configure les listeners sur le transport bas niveau.
   */
  private setupTransportListeners(): void {
    this.transport.onConnect(() => this.handleTransportConnect());
    this.transport.onDisconnect((reason) => this.handleTransportDisconnect(reason));
    this.transport.onError((error) => this.handleTransportError(error));
    this.transport.onMessage((message) => this.handleMessage(message));
  }

  /**
   * Gère la connexion du transport.
   */
  private handleTransportConnect(): void {
    this.logger.info('ha:ws', 'Connexion WebSocket établie');
    // ⚠️ Ne PAS authentifier ici : le protocole WS de Home Assistant impose que le client
    // attende le message serveur `auth_required` avant d'envoyer `auth` (voir le handler
    // case 'auth_required' ci-dessous). Authentifier immédiatement à la connexion envoyait le
    // jeton hors séquence protocolaire, en plus de l'envoi correct déclenché par auth_required
    // — deux authentifications par connexion, log "Authentification en cours..." dupliqué.
  }

  /**
   * Gère la déconnexion du transport.
   */
  private handleTransportDisconnect(reason?: string): void {
    this.logger.warn('ha:ws', `Déconnexion WebSocket: ${reason || 'inconnu'}`);
    this.isAuthenticated = false;
    this.isReady = false;
    this.notifyDisconnect(reason);
  }

  /**
   * Gère une erreur du transport.
   */
  private handleTransportError(error: Error): void {
    this.logger.error('ha:ws', `Erreur WebSocket: ${error.message}`);
    this.notifyError(error);
  }

  /**
   * Gère un message entrant.
   */
  private handleMessage(message: HaWsMessage): void {
    this.notifyMessage(message);
    
    // Traiter les réponses aux requêtes
    if (message.type === 'result' && this.pendingRequests.has(message.id)) {
      const { resolve } = this.pendingRequests.get(message.id)!;
      this.pendingRequests.delete(message.id);
      resolve(message.result);
      return;
    }

    // Traiter les erreurs
    if (message.type === 'error' && this.pendingRequests.has(message.id)) {
      const { reject } = this.pendingRequests.get(message.id)!;
      this.pendingRequests.delete(message.id);
      const errorMessage = (message as any).error?.message || 'Unknown error';
      reject(new Error(errorMessage));
      return;
    }

    // Traiter les événements
    switch (message.type) {
      case 'state_changed':
        this.handleStateChanged(message as HaStateChangedMessage);
        break;
      case 'area_registry_updated':
        this.handleAreaRegistryUpdated(message as HaAreaRegistryUpdatedMessage);
        break;
      case 'device_registry_updated':
        this.handleDeviceRegistryUpdated(message as HaDeviceRegistryUpdatedMessage);
        break;
      case 'entity_registry_updated':
        this.handleEntityRegistryUpdated(message as HaEntityRegistryUpdatedMessage);
        break;
      case 'auth_required':
        this.authenticate();
        break;
      case 'auth_ok':
        this.isAuthenticated = true;
        this.logger.info('ha:ws', 'Authentification réussie');
        this.notifyConnect();
        break;
      case 'auth_invalid':
        this.logger.error('ha:ws', 'Token HA invalide');
        this.notifyError(new Error('Invalid HA token'));
        break;
    }
  }

  /**
   * Envoie un message via le transport.
   */
  private sendMessage(message: HaWsMessage): void {
    this.transport.send(message);
  }

  /**
   * Envoie une requête et retourne une Promise pour la réponse.
   */
  private sendRequest<T extends HaWsMessage>(message: Omit<HaWsMessage, 'id'>): Promise<T> {
    const id = this.nextId++;
    const request = { id, ...message } as HaWsMessage;
    
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.sendMessage(request);
      
      // Timeout après 10 secondes
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${id} timed out`));
        }
      }, 10000);
    });
  }

  /**
   * Envoie le message d'authentification.
   */
  private authenticate(): void {
    this.logger.info('ha:ws', 'Authentification en cours...');
    this.sendMessage({
      id: this.nextId++,
      type: 'auth',
      access_token: this.config.token,
    });
  }

  // ===========================================================================
  // Gestion des événements HA
  // ===========================================================================

  /**
   * Gère un événement state_changed.
   */
  private handleStateChanged(message: HaStateChangedMessage): void {
    const newState = message.data.new_state;
    this.notifyStateChanged(newState);
  }

  /**
   * Gère un événement area_registry_updated.
   */
  private handleAreaRegistryUpdated(message: HaAreaRegistryUpdatedMessage): void {
    if (message.data.action === 'delete') {
      return; // Pas de data pour delete
    }
    const area = {
      area_id: message.data.area_id,
      name: message.data.area?.name || '',
      picture: message.data.area?.picture,
    };
    this.notifyAreaUpdated(area);
  }

  /**
   * Gère un événement device_registry_updated.
   */
  private handleDeviceRegistryUpdated(message: HaDeviceRegistryUpdatedMessage): void {
    if (message.data.action === 'delete') {
      return; // Pas de data pour delete
    }
    const device = {
      device_id: message.data.device_id,
      name: message.data.device?.name || '',
      area_id: message.data.device?.area_id,
    };
    this.notifyDeviceUpdated(device);
  }

  /**
   * Gère un événement entity_registry_updated.
   */
  private handleEntityRegistryUpdated(message: HaEntityRegistryUpdatedMessage): void {
    if (message.data.action === 'delete') {
      return; // Pas de data pour delete
    }
    const entity = {
      entity_id: message.data.entity_id,
      domain: message.data.entity?.domain || '',
      device_class: message.data.entity?.device_class,
      area_id: message.data.entity?.area_id,
    };
    this.notifyEntityUpdated(entity);
  }

  // ===========================================================================
  // Notifications aux callbacks
  // ===========================================================================

  private notifyStateChanged(entity: HaRawEntity): void {
    for (const callback of this.stateCallbacks) {
      try {
        callback(entity);
      } catch (error) {
        this.logger.error('ha:ws', `Erreur dans callback state_changed: ${error}`);
      }
    }
  }

  private notifyAreaUpdated(area: { area_id: string; name: string; picture?: string }): void {
    for (const callback of this.areaCallbacks) {
      try {
        callback(area);
      } catch (error) {
        this.logger.error('ha:ws', `Erreur dans callback area_updated: ${error}`);
      }
    }
  }

  private notifyDeviceUpdated(device: { device_id: string; name: string; area_id?: string }): void {
    for (const callback of this.deviceCallbacks) {
      try {
        callback(device);
      } catch (error) {
        this.logger.error('ha:ws', `Erreur dans callback device_updated: ${error}`);
      }
    }
  }

  private notifyEntityUpdated(entity: { entity_id: string; domain: string; device_class?: string; area_id?: string }): void {
    for (const callback of this.entityCallbacks) {
      try {
        callback(entity);
      } catch (error) {
        this.logger.error('ha:ws', `Erreur dans callback entity_updated: ${error}`);
      }
    }
  }

  private notifyMessage(message: HaWsMessage): void {
    for (const callback of this.messageCallbacks) {
      try {
        callback(message);
      } catch (error) {
        this.logger.error('ha:ws', `Erreur dans callback message: ${error}`);
      }
    }
  }

  private notifyConnect(): void {
    for (const callback of this.connectCallbacks) {
      try {
        callback();
      } catch (error) {
        this.logger.error('ha:ws', `Erreur dans callback connect: ${error}`);
      }
    }
  }

  private notifyDisconnect(reason?: string): void {
    for (const callback of this.disconnectCallbacks) {
      try {
        callback(reason);
      } catch (error) {
        this.logger.error('ha:ws', `Erreur dans callback disconnect: ${error}`);
      }
    }
  }

  private notifyError(error: Error): void {
    for (const callback of this.errorCallbacks) {
      try {
        callback(error);
      } catch (error) {
        this.logger.error('ha:ws', `Erreur dans callback error: ${error}`);
      }
    }
  }

  // ===========================================================================
  // Getters
  // ===========================================================================

  getIsAuthenticated(): boolean {
    return this.isAuthenticated;
  }

  getIsReady(): boolean {
    return this.isReady;
  }

  /**
   * Compare deux configurations WebSocket
   */
  private areConfigsEqual(c1: HaWsConfig, c2: HaWsConfig): boolean {
    return (
      c1.host === c2.host &&
      c1.port === c2.port &&
      c1.token === c2.token &&
      c1.reconnect_delay === c2.reconnect_delay
    );
  }

  /**
   * Reconfigure la connexion WebSocket avec une nouvelle configuration.
   * - Si déconnecté : connecte avec la nouvelle config
   * - Si connecté : compare, déconnecte et reconnecte si la config a changé
   */
  reconfigure(newConfig: HaWsConfig): void {
    // Si déconnecté, juste connecter avec la nouvelle config
    if (!this.getIsAuthenticated()) {
      this.logger.info('ha:ws', 'Reconfiguration WebSocket (déconnecté) - Connexion avec nouvelle config');
      this.currentConfig = newConfig;
      // Recréer le transport avec la nouvelle config
      this.transport = new HaWsTransport({
        host: newConfig.host,
        port: newConfig.port,
        token: newConfig.token,
        reconnectDelay: newConfig.reconnect_delay,
      });
      this.setupTransportListeners();
      this.connect();
      return;
    }

    // Si connecté, comparer avec l'ancienne config
    if (!this.areConfigsEqual(this.currentConfig, newConfig)) {
      this.logger.info('ha:ws', 'Reconfiguration WebSocket - Config changée, reconnexion...');
      this.currentConfig = newConfig;
      this.disconnect();
      // Recréer le transport avec la nouvelle config
      this.transport = new HaWsTransport({
        host: newConfig.host,
        port: newConfig.port,
        token: newConfig.token,
        reconnectDelay: newConfig.reconnect_delay,
      });
      this.setupTransportListeners();
      this.connect();
    } else {
      this.logger.debug('ha:ws', 'Reconfiguration WebSocket - Config inchangée, aucune action');
    }
  }
}
