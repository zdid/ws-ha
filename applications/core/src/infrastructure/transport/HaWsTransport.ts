import WebSocket from 'ws';

// =============================================================================
// Types
// =============================================================================

/**
 * Message WebSocket Home Assistant
 * Structure standard des messages échangés avec HA via WebSocket
 */
export interface HaWsMessage {
  id: number;
  type: string;
  [key: string]: unknown;
}

/**
 * Configuration pour le transport WebSocket HA
 */
export interface HaWsTransportConfig {
  host: string;
  port: number;
  token: string;
  reconnectDelay: number;
}

/**
 * Callback pour les messages entrants
 */
type MessageCallback = (message: HaWsMessage) => void;

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
// État de la connexion
// =============================================================================

const QUEUE_TIMEOUT_MS = 5000; // 5 secondes max pour la file d'attente

/**
 * Client de transport WebSocket bas niveau pour Home Assistant.
 * Gère la connexion, l'authentification, l'envoi/réception de messages,
 * et la reconnexion automatique avec backoff exponentiel.
 * 
 * NE PAS utiliser directement pour la logique métier :
 * voir HaWsClient dans la couche HA.
 */
export class HaWsTransport {
  private ws: WebSocket | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  
  // File d'attente pour les messages à envoyer pendant une déconnexion
  private messageQueue: { message: HaWsMessage; timestamp: number }[] = [];
  private queueTimeout: NodeJS.Timeout | null = null;

  // Callbacks
  private messageCallbacks: MessageCallback[] = [];
  private connectCallbacks: ConnectCallback[] = [];
  private disconnectCallbacks: DisconnectCallback[] = [];
  private errorCallbacks: ErrorCallback[] = [];

  private readonly config: HaWsTransportConfig;

  /**
   * @param config - Configuration pour la connexion WebSocket
   */
  constructor(config: HaWsTransportConfig) {
    this.config = config;
  }

  // ===========================================================================
  // Méthodes publiques
  // ===========================================================================

  /**
   * Établit la connexion WebSocket à Home Assistant
   */
  connect(): void {
    if (this.isConnected || this.ws !== null) {
      return; // Déjà connecté ou en cours de connexion
    }

    this.createWebSocket();
  }

  /**
   * Ferme la connexion WebSocket proprement
   */
  disconnect(): void {
    this.clearReconnectTimeout();
    this.clearQueueTimeout();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.isConnected = false;
    this.reconnectAttempts = 0;
  }

  /**
   * Envoie un message WebSocket.
   * Si déconnecté, met en file d'attente avec timeout de 5s.
   * @param message - Message à envoyer
   */
  send(message: HaWsMessage): void {
    if (this.isConnected && this.ws) {
      try {
        this.ws.send(JSON.stringify(message));
      } catch (error) {
        this.notifyError(error as Error);
      }
    } else {
      // Mettre en file d'attente
      this.messageQueue.push({ message, timestamp: Date.now() });
      this.startQueueTimeout();
    }
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
   * Crée une nouvelle connexion WebSocket
   */
  private createWebSocket(): void {
    const url = `ws://${this.config.host}:${this.config.port}/api/websocket`;
    
    this.ws = new WebSocket(url);

    this.ws.on('open', () => this.handleOpen());
    this.ws.on('message', (data) => this.handleMessage(data));
    this.ws.on('close', (code, reason) => this.handleClose(code, reason));
    this.ws.on('error', (error) => this.handleError(error));
  }

  /**
   * Gère l'ouverture de la connexion WebSocket
   */
  private handleOpen(): void {
    this.isConnected = true;
    this.reconnectAttempts = 0;
    this.clearReconnectTimeout();
    
    // Authentifier immédiatement
    this.authenticate();
    
    // Vider la file d'attente
    this.flushQueue();
    
    // Notifier les callbacks
    this.notifyConnect();
  }

  /**
   * Gère la réception d'un message
   */
  private handleMessage(data: WebSocket.RawData): void {
    try {
      const message: HaWsMessage = JSON.parse(data.toString());
      this.notifyMessage(message);
    } catch (error) {
      this.notifyError(error as Error);
    }
  }

  /**
   * Gère la fermeture de la connexion
   */
  private handleClose(code: number, reason: Buffer): void {
    this.isConnected = false;
    this.clearReconnectTimeout();
    
    const reasonStr = reason.toString();
    this.notifyDisconnect(reasonStr || `Closed with code ${code}`);
    
    // Planifier la reconnexion
    this.scheduleReconnect();
  }

  /**
   * Gère les erreurs de connexion
   */
  private handleError(error: Error): void {
    this.notifyError(error);
  }

  // ===========================================================================
  // Méthodes privées - Authentification
  // ===========================================================================

  /**
   * Envoie le message d'authentification à Home Assistant
   */
  private authenticate(): void {
    if (!this.ws || !this.isConnected) return;

    const authMessage: HaWsMessage = {
      id: 1,
      type: 'auth',
      access_token: this.config.token,
    };
    
    this.ws.send(JSON.stringify(authMessage));
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
      60000
    );
    
    this.reconnectAttempts++;
    
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.createWebSocket();
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
  // Méthodes privées - File d'attente
  // ===========================================================================

  /**
   * Démarre le timeout pour la file d'attente (5 secondes)
   */
  private startQueueTimeout(): void {
    if (this.queueTimeout) return;

    this.queueTimeout = setTimeout(() => {
      if (!this.isConnected && this.messageQueue.length > 0) {
        // Vider la file si pas de reconnexion dans les 5s
        this.messageQueue = [];
        this.queueTimeout = null;
        this.notifyError(new Error('Message queue timeout: connection not restored within 5 seconds'));
      }
    }, QUEUE_TIMEOUT_MS);
  }

  /**
   * Vide la file d'attente en envoyant les messages
   */
  private flushQueue(): void {
    if (!this.isConnected || !this.ws) return;

    while (this.messageQueue.length > 0) {
      const { message } = this.messageQueue.shift()!;
      try {
        this.ws.send(JSON.stringify(message));
      } catch (error) {
        this.notifyError(error as Error);
        // On continue à vider la file même en cas d'erreur
      }
    }

    if (this.messageQueue.length === 0) {
      this.clearQueueTimeout();
    }
  }

  /**
   * Annule le timeout de la file d'attente
   */
  private clearQueueTimeout(): void {
    if (this.queueTimeout) {
      clearTimeout(this.queueTimeout);
      this.queueTimeout = null;
    }
  }

  // ===========================================================================
  // Méthodes privées - Notifications aux callbacks
  // ===========================================================================

  /**
   * Notifie tous les callbacks de message
   */
  private notifyMessage(message: HaWsMessage): void {
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
