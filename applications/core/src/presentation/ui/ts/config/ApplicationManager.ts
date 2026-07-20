/**
 * Manager des applications
 * Gère l'activation/désactivation des applications
 */

interface ApplicationStatus {
  activated: string[];
  disabled: string[];
}

interface ApplicationEnableResult {
  appId: string;
  success: boolean;
  error?: string;
}

export class ApplicationManager {
  private applications: ApplicationStatus = { activated: [], disabled: [] };
  private socket: any;
  public loading: boolean = false;
  public error: string | null = null;
  
  constructor(socket: any) {
    this.socket = socket;
    this.setupSocketListeners();
  }
  
  /**
   * Configure les écouteurs Socket.io
   */
  private setupSocketListeners(): void {
    // Demander la liste des applications
    this.socket.emit('app:applications:list');
    
    // Écouter la liste des applications
    this.socket.on('app:applications:list:result', (data: ApplicationStatus) => {
      this.applications = data;
      this.loading = false;
      this.error = null;
      console.log('[ApplicationManager] Liste des applications reçue:', data);
      
      window.dispatchEvent(new CustomEvent('applications:loaded', {
        detail: this.applications
      }));
    });
    
    // Écouter les résultats d'activation
    this.socket.on('app:applications:enable:result', (data: ApplicationEnableResult) => {
      this.loading = false;
      if (data.success) {
        // Rafraîchir la liste
        this.socket.emit('app:applications:list');
        console.log(`[ApplicationManager] Application ${data.appId} activée avec succès`);
      } else {
        this.error = `Erreur lors de l'activation: ${data.error || 'Inconnu'}`;
        console.error(`[ApplicationManager] Erreur activation ${data.appId}:`, data.error);
        
        window.dispatchEvent(new CustomEvent('applications:error', {
          detail: { message: this.error }
        }));
      }
    });
    
    // Écouter les résultats de désactivation
    this.socket.on('app:applications:disable:result', (data: ApplicationEnableResult) => {
      this.loading = false;
      if (data.success) {
        // Rafraîchir la liste
        this.socket.emit('app:applications:list');
        console.log(`[ApplicationManager] Application ${data.appId} désactivée avec succès`);
      } else {
        this.error = `Erreur lors de la désactivation: ${data.error || 'Inconnu'}`;
        console.error(`[ApplicationManager] Erreur désactivation ${data.appId}:`, data.error);
        
        window.dispatchEvent(new CustomEvent('applications:error', {
          detail: { message: this.error }
        }));
      }
    });
  }
  
  /**
   * Retourne la liste des applications
   */
  getApplications(): ApplicationStatus {
    return { ...this.applications };
  }
  
  /**
   * Active une application
   * @param appId ID de l'application à activer
   */
  enableApplication(appId: string): void {
    if (confirm(`Voulez-vous vraiment activer l'application ${appId} ? Un restart sera nécessaire.`)) {
      this.loading = true;
      this.error = null;
      this.socket.emit('app:applications:enable', { appId });
      
      window.dispatchEvent(new CustomEvent('applications:enabling', {
        detail: { appId }
      }));
    }
  }
  
  /**
   * Désactive une application
   * @param appId ID de l'application à désactiver
   */
  disableApplication(appId: string): void {
    if (confirm(`Voulez-vous vraiment désactiver l'application ${appId} ? Un restart sera nécessaire.`)) {
      this.loading = true;
      this.error = null;
      this.socket.emit('app:applications:disable', { appId });
      
      window.dispatchEvent(new CustomEvent('applications:disabling', {
        detail: { appId }
      }));
    }
  }
  
  /**
   * Rafraîchit la liste des applications
   */
  refreshApplications(): void {
    this.loading = true;
    this.socket.emit('app:applications:list');
  }
  
  /**
   * Vérifie si une application est activée
   */
  isActivated(appId: string): boolean {
    return this.applications.activated.includes(appId);
  }
  
  /**
   * Vérifie si une application est désactivée
   */
  isDisabled(appId: string): boolean {
    return this.applications.disabled.includes(appId);
  }
}
