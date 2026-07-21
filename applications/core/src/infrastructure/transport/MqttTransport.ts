import * as mqtt from 'mqtt';

// =============================================================================
// Types
// =============================================================================

/**
 * Configuration pour le transport MQTT
 */
export interface MqttTransportConfig {
  host: string;
  port: number;
  clientId: string;
  username: string;
  password: string;
  keepalive: number;
  reconnectDelay: number;
  clean?: boolean;
  /** Topic du LWT (Last Will and Testament). Défaut : `app/{clientId}/status`. */
  willTopic?: string;
}

/**
 * Message MQTT reçu
 */
export interface MqttMessage {
  topic: string;
  payload: Buffer | string;
  qos: number;
  retain: boolean;
}

/**
 * Callback pour les messages entrants
 */
type MessageCallback = (message: MqttMessage) => void;

/**
 * Callback pour les événements de connexion
 */
type ConnectCallback = () => void;

/**
 * Callback pour les événements de déconnexion
 */
type DisconnectCallback = (reason?: string) => void;

/**
 * Callback pour les erreurs
 */
type ErrorCallback = (error: Error) => void;

// =============================================================================
// Constantes
// =============================================================================

const MAX_RECONNECT_DELAY_MS = 60000; // 60 secondes max
const LWT_TOPIC_PREFIX = 'app';
const LWT_PAYLOAD_OFFLINE = 'offline';
const LWT_PAYLOAD_ONLINE = 'online';

/**
 * Client de transport MQTT bas niveau.
 * Gère la connexion, la publication/souscription, et la reconnexion automatique.
 * 
 * NE PAS utiliser directement pour la logique métier :
 * voir les modules d'intégration dans la couche HA.
 */
export class MqttTransport {
  private client: mqtt.MqttClient | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;

  // Callbacks
  private messageCallbacks: MessageCallback[] = [];
  private connectCallbacks: ConnectCallback[] = [];
  private disconnectCallbacks: DisconnectCallback[] = [];
  private errorCallbacks: ErrorCallback[] = [];

  private readonly config: MqttTransportConfig;

  /**
   * @param config - Configuration pour la connexion MQTT
   */
  constructor(config: MqttTransportConfig) {
    this.config = {
      clean: true,
      ...config,
    };
  }

  // ===========================================================================
  // Méthodes publiques
  // ===========================================================================

  /**
   * Établit la connexion MQTT au broker
   */
  connect(): void {
    if (this.isConnected || this.client !== null) {
      return; // Déjà connecté ou en cours de connexion
    }

    this.createMqttClient();
  }

  /**
   * Ferme la connexion MQTT proprement
   */
  disconnect(): void {
    this.clearReconnectTimeout();
    
    if (this.client) {
      // Publier le LWT offline avant de se déconnecter
      this.publishLwt(LWT_PAYLOAD_OFFLINE, true);
      this.client.end();
      this.client = null;
    }
    
    this.isConnected = false;
    this.reconnectAttempts = 0;
  }

  /**
   * Publie un message sur un topic MQTT
   * @param topic - Topic MQTT
   * @param payload - Payload à publier (string ou Buffer)
   * @param qos - Niveau de QoS (0 ou 1 uniquement)
   * @param retain - Flag retain
   */
  publish(topic: string, payload: string | Buffer, qos: 0 | 1 = 0, retain: boolean = false): void {
    if (!this.client || !this.isConnected) {
      throw new Error('Cannot publish: MQTT client is not connected');
    }

    this.client.publish(topic, payload, { qos, retain });
  }

  /**
   * S'abonne à un topic MQTT
   * @param topic - Topic MQTT
   * @param qos - Niveau de QoS (0 ou 1 uniquement)
   */
  subscribe(topic: string, qos: 0 | 1 = 0): void {
    if (!this.client || !this.isConnected) {
      throw new Error('Cannot subscribe: MQTT client is not connected');
    }

    this.client.subscribe(topic, { qos });
  }

  /**
   * Se désabonne d'un topic MQTT
   * @param topic - Topic MQTT
   */
  unsubscribe(topic: string): void {
    if (!this.client || !this.isConnected) {
      return; // Ignorer si non connecté
    }

    this.client.unsubscribe(topic);
  }

  /**
   * S'abonne aux messages entrants
   */
  onMessage(callback: MessageCallback): void {
    this.messageCallbacks.push(callback);
  }

  /**
   * S'abonne aux événements de connexion
   */
  onConnect(callback: ConnectCallback): void {
    this.connectCallbacks.push(callback);
  }

  /**
   * S'abonne aux événements de déconnexion
   */
  onDisconnect(callback: DisconnectCallback): void {
    this.disconnectCallbacks.push(callback);
  }

  /**
   * S'abonne aux erreurs
   */
  onError(callback: ErrorCallback): void {
    this.errorCallbacks.push(callback);
  }

  /**
   * Retourne l'état de la connexion
   */
  getConnected(): boolean {
    return this.isConnected;
  }

  // ===========================================================================
  // Méthodes privées - Connexion et gestion
  // ===========================================================================

  /**
   * Crée un nouveau client MQTT et configure les événements
   */
  private createMqttClient(): void {
    const url = `mqtt://${this.config.host}:${this.config.port}`;

    const options: mqtt.IClientOptions = {
      clientId: this.config.clientId,
      clean: this.config.clean,
      keepalive: this.config.keepalive,
      reconnectPeriod: this.config.reconnectDelay * 1000,
      username: this.config.username || undefined,
      password: this.config.password || undefined,
      // Configuration du LWT (Last Will and Testament)
      will: {
        topic: this.getWillTopic(),
        payload: LWT_PAYLOAD_OFFLINE,
        retain: true,
        qos: 1,
      },
    };

    this.client = mqtt.connect(url, options);

    this.client.on('connect', () => this.handleConnect());
    this.client.on('message', (topic, payload, packet) => this.handleMessage(topic, payload, packet));
    this.client.on('close', () => this.handleClose());
    this.client.on('error', (error) => this.handleError(error));
    this.client.on('offline', () => this.handleOffline());
    this.client.on('end', () => this.handleEnd());
  }

  /**
   * Gère la connexion réussie
   */
  private handleConnect(): void {
    this.isConnected = true;
    this.reconnectAttempts = 0;
    this.clearReconnectTimeout();

    // Publier le LWT online
    this.publishLwt(LWT_PAYLOAD_ONLINE, true);

    // Notifier les callbacks
    this.notifyConnect();
  }

  /**
   * Gère la réception d'un message
   */
  private handleMessage(topic: string, payload: Buffer, packet: any): void {
    const message: MqttMessage = {
      topic,
      payload,
      qos: (packet as { qos?: number }).qos || 0,
      retain: (packet as { retain?: boolean }).retain || false,
    };

    this.notifyMessage(message);
  }

  /**
   * Gère la fermeture de la connexion
   */
  private handleClose(): void {
    this.isConnected = false;
    this.clearReconnectTimeout();
    this.notifyDisconnect('Connection closed by broker');
    this.scheduleReconnect();
  }

  /**
   * Gère les erreurs de connexion
   */
  private handleError(error: Error): void {
    this.notifyError(error);
  }

  /**
   * Gère le passage en mode offline
   */
  private handleOffline(): void {
    this.isConnected = false;
    this.notifyDisconnect('Client went offline');
  }

  /**
   * Gère la fin de la connexion (appelée par .end())
   */
  private handleEnd(): void {
    this.isConnected = false;
    this.notifyDisconnect('Connection ended');
  }

  // ===========================================================================
  // Méthodes privées - LWT (Last Will and Testament)
  // ===========================================================================

  /**
   * Publie le LWT (Last Will and Testament)
   * @param payload - Payload à publier ('online' ou 'offline')
   * @param retain - Flag retain (toujours true pour LWT)
   */
  private publishLwt(payload: string, retain: boolean = true): void {
    if (!this.client || !this.isConnected) return;

    this.client.publish(this.getWillTopic(), payload, { qos: 1, retain });
  }

  /**
   * Topic du LWT, configurable via `config.willTopic` (défaut : `app/{clientId}/status`).
   */
  private getWillTopic(): string {
    return this.config.willTopic ?? `${LWT_TOPIC_PREFIX}/${this.config.clientId}/status`;
  }

  /**
   * Flip manuel du statut retained online/offline, sans fermer la connexion.
   * Utile quand l'application détecte elle-même la perte d'un matériel en aval
   * (ex: port série débranché) sans que la connexion MQTT elle-même ne tombe —
   * dans ce cas le LWT natif (déclenché uniquement à la perte de connexion) ne suffit pas.
   * @param online - true pour publier "online", false pour "offline"
   */
  publishStatus(online: boolean): void {
    this.publishLwt(online ? LWT_PAYLOAD_ONLINE : LWT_PAYLOAD_OFFLINE, true);
  }

  // ===========================================================================
  // Méthodes privées - Reconnexion
  // ===========================================================================

  /**
   * Planifie une reconnexion avec backoff exponentiel (max 60s)
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimeout) return; // Déjà planifiée

    // Calcul du délai : min(2^attempts * 1000, 60000)
    const delay = Math.min(
      Math.pow(2, this.reconnectAttempts) * 1000,
      MAX_RECONNECT_DELAY_MS
    );

    this.reconnectAttempts++;

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.createMqttClient();
    }, delay);
  }

  /**
   * Annule la reconnexion planifiée
   */
  private clearReconnectTimeout(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  // ===========================================================================
  // Méthodes privées - Notifications aux callbacks
  // ===========================================================================

  /**
   * Notifie tous les callbacks de message
   */
  private notifyMessage(message: MqttMessage): void {
    for (const callback of this.messageCallbacks) {
      try {
        callback(message);
      } catch {
        // Ignorer les erreurs dans les callbacks
      }
    }
  }

  /**
   * Notifie tous les callbacks de connexion
   */
  private notifyConnect(): void {
    for (const callback of this.connectCallbacks) {
      try {
        callback();
      } catch {
        // Ignorer les erreurs dans les callbacks
      }
    }
  }

  /**
   * Notifie tous les callbacks de déconnexion
   */
  private notifyDisconnect(reason: string): void {
    for (const callback of this.disconnectCallbacks) {
      try {
        callback(reason);
      } catch {
        // Ignorer les erreurs dans les callbacks
      }
    }
  }

  /**
   * Notifie tous les callbacks d'erreur
   */
  private notifyError(error: Error): void {
    for (const callback of this.errorCallbacks) {
      try {
        callback(error);
      } catch {
        // Ignorer les erreurs dans les callbacks
      }
    }
  }
}
