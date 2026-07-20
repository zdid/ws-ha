/**
 * Bus d'événements pour la communication entre composants
 * Implémentation simple du pattern Observer via Custom Events DOM
 */

export class EventBus {
  private static instance: EventBus;
  
  /**
   * Retourne l'instance singleton du EventBus
   */
  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }
  
  /**
   * S'abonne à un événement
   * @param event Nom de l'événement
   * @param callback Fonction de callback
   * @returns Fonction pour se désabonner
   */
  subscribe(event: string, callback: (data?: any) => void): () => void {
    const wrappedCallback = (e: CustomEvent) => {
      callback(e.detail);
    };
    
    window.addEventListener(event, wrappedCallback as EventListener);
    
    // Retourne une fonction pour se désabonner
    return () => {
      window.removeEventListener(event, wrappedCallback as EventListener);
    };
  }
  
  /**
   * Émet un événement
   * @param event Nom de l'événement
   * @param data Données à envoyer
   */
  emit(event: string, data?: any): void {
    window.dispatchEvent(new CustomEvent(event, {
      detail: data,
      bubbles: true,
      composed: true
    }));
  }
  
  /**
   * Émet un événement de manière asynchrone
   * @param event Nom de l'événement
   * @param data Données à envoyer
   */
  emitAsync(event: string, data?: any): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        this.emit(event, data);
        resolve();
      }, 0);
    });
  }
  
  /**
   * Émet un événement après un délai
   * @param event Nom de l'événement
   * @param data Données à envoyer
   * @param delay Délai en millisecondes
   */
  emitDelayed(event: string, data?: any, delay: number = 0): void {
    setTimeout(() => {
      this.emit(event, data);
    }, delay);
  }
  
  /**
   * Émet un événement une seule fois (pour les initialisations)
   * @param event Nom de l'événement
   * @param data Données à envoyer
   */
  emitOnce(event: string, data?: any): void {
    const alreadyEmitted = sessionStorage.getItem(`event:${event}`);
    if (!alreadyEmitted) {
      sessionStorage.setItem(`event:${event}`, 'true');
      this.emit(event, data);
    }
  }
}
