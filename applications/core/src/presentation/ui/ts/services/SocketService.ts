/**
 * Service de gestion de la connexion Socket.io
 * Permet une communication centralisée avec le serveur
 */

// io est disponible globalement via le CDN socket.io
declare const io: any;

export class SocketService {
  private socket: any;
  private _isConnected: boolean = false;
  
  /**
   * Se connecte au serveur Socket.io
   * @param url URL du serveur (par défaut : window.location.origin)
   * @returns Le socket connecté
   */
  connect(url: string = window.location.origin): any {
    this.socket = io(url, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      transports: ['websocket'],
    });
    
    this.setupGlobalListeners();
    return this.socket;
  }
  
  /**
   * Configure les écouteurs d'événements globaux
   */
  private setupGlobalListeners(): void {
    this.socket.on('connect', () => {
      this._isConnected = true;
      console.log('[SocketService] Connecté au serveur');
      window.dispatchEvent(new CustomEvent('socket:connected'));
      if (window.Alpine) window.Alpine.store('ws').connected = true;
    });

    this.socket.on('disconnect', () => {
      this._isConnected = false;
      console.log('[SocketService] Déconnecté du serveur');
      window.dispatchEvent(new CustomEvent('socket:disconnected'));
      if (window.Alpine) window.Alpine.store('ws').connected = false;
    });
    
    this.socket.on('connect_error', (error: Error) => {
      console.error('[SocketService] Erreur de connexion:', error.message);
      window.dispatchEvent(new CustomEvent('socket:error', {
        detail: { message: error.message }
      }));
    });
    
    this.socket.on('reconnect_attempt', () => {
      console.log('[SocketService] Tentative de reconnexion...');
    });
    
    this.socket.on('reconnect', () => {
      console.log('[SocketService] Reconnexion réussie');
      window.dispatchEvent(new CustomEvent('socket:reconnected'));
    });
    
    this.socket.on('reconnect_error', (error: Error) => {
      console.error('[SocketService] Erreur de reconnexion:', error.message);
    });
    
    this.socket.on('reconnect_failed', () => {
      console.error('[SocketService] Échec de reconnexion');
    });
  }
  
  /**
   * Émet un événement vers le serveur
   * @param event Nom de l'événement
   * @param data Données à envoyer
   */
  emit(event: string, data?: any): void {
    if (this.socket && this.socket.connected) {
      this.socket.emit(event, data);
    } else {
      console.warn('[SocketService] Socket non connecté, événement non émis:', event);
      // Essayer de mettre en buffer ou réémettre plus tard
      setTimeout(() => this.emit(event, data), 1000);
    }
  }
  
  /**
   * Écoute un événement du serveur
   * @param event Nom de l'événement
   * @param callback Fonction de callback
   */
  on(event: string, callback: (...args: any[]) => void): void {
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }
  
  /**
   * Supprime un écouteur d'événement
   * @param event Nom de l'événement
   * @param callback Fonction de callback à supprimer
   */
  off(event: string, callback: (...args: any[]) => void): void {
    if (this.socket) {
      this.socket.off(event, callback);
    }
  }
  
  /**
   * Vérifie si le socket est connecté
   */
  isConnected(): boolean {
    return this._isConnected && this.socket?.connected;
  }
  
  /**
   * Retourne le socket brut (pour usage avancé)
   */
  getSocket(): any {
    return this.socket;
  }
  
  /**
   * Déconnecte le socket
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}
