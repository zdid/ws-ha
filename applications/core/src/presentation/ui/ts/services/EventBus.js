/**
 * Bus d'événements pour la communication entre composants
 * Implémentation simple du pattern Observer via Custom Events DOM
 */
export class EventBus {
    /**
     * Retourne l'instance singleton du EventBus
     */
    static getInstance() {
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
    subscribe(event, callback) {
        const wrappedCallback = (e) => {
            callback(e.detail);
        };
        window.addEventListener(event, wrappedCallback);
        // Retourne une fonction pour se désabonner
        return () => {
            window.removeEventListener(event, wrappedCallback);
        };
    }
    /**
     * Émet un événement
     * @param event Nom de l'événement
     * @param data Données à envoyer
     */
    emit(event, data) {
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
    emitAsync(event, data) {
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
    emitDelayed(event, data, delay = 0) {
        setTimeout(() => {
            this.emit(event, data);
        }, delay);
    }
    /**
     * Émet un événement une seule fois (pour les initialisations)
     * @param event Nom de l'événement
     * @param data Données à envoyer
     */
    emitOnce(event, data) {
        const alreadyEmitted = sessionStorage.getItem(`event:${event}`);
        if (!alreadyEmitted) {
            sessionStorage.setItem(`event:${event}`, 'true');
            this.emit(event, data);
        }
    }
}
