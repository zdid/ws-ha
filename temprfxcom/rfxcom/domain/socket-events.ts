// src/applications/rfxcom/domain/socket-events.ts
// Événements Socket.io spécifiques à RFXCOM
// Conforme à specs-presentation-v2.0.md §5.8 et specs-fonctionnelles-rfxcom-v5.0.md

/**
 * Événements Socket.io spécifiques à RFXCOM
 * 
 * Ces événements sont utilisés pour la communication entre le serveur
 * et l'UI pour tout ce qui concerne RFXCOM.
 * 
 * Conforme à specs-presentation-v2.0.md §7.3
 * 
 * Règle : Ces événements sont déclarés dans la couche Métier (domain)
 * et sont relayés par SocketBridge sans que la Présentation ne les
 * connaisse à l'avance.
 */
export const RFXCOM_SOCKET_EVENTS = {
  // ======================================================================
  // Événements Server → Client (Serveur émet, UI écoute)
  // ======================================================================
  
  /** Liste complète des devices RFXCOM détectés */
  DEVICES_LIST: 'rfxcom:devices:list',
  
  /** Liste complète des récepteurs RFXCOM */
  RECEIVERS_LIST: 'rfxcom:receivers:list',
  
  /** Un nouveau device a été détecté */
  DEVICE_DETECTED: 'rfxcom:device:detected',
  
  /** Un récepteur a été créé */
  RECEIVER_CREATED: 'rfxcom:receiver:created',
  
  /** Un récepteur a été mis à jour */
  RECEIVER_UPDATED: 'rfxcom:receiver:updated',
  
  /** Un récepteur a été supprimé */
  RECEIVER_DELETED: 'rfxcom:receiver:deleted',
  
  /** Statut global de RFXCOM */
  STATUS: 'rfxcom:status',
  
  /** Résultat de validation de la configuration RFXCOM */
  CONFIG_VALIDATION: 'rfxcom:config:validation',
  
  /** Liste des scènes RFXCOM */
  SCENES_LIST: 'rfxcom:scenes:list',
  
  /** Une scène a été déclenchée */
  SCENE_TRIGGERED: 'rfxcom:scene:triggered',
  
  /** Résultat d'exécution d'une scène */
  SCENE_EXECUTED: 'rfxcom:scene:executed',
  
  /** État d'un device spécifique */
  DEVICE_STATE: 'rfxcom:device:state',
  
  /** Erreur RFXCOM */
  ERROR: 'rfxcom:error',
  
  // ======================================================================
  // Événements Client → Server (UI émet, Serveur écoute)
  // ======================================================================
  
  /** Créer un nouveau récepteur */
  RECEIVER_CREATE: 'rfxcom:receiver:create',
  
  /** Mettre à jour un récepteur existant */
  RECEIVER_UPDATE: 'rfxcom:receiver:update',
  
  /** Supprimer un récepteur */
  RECEIVER_DELETE: 'rfxcom:receiver:delete',
  
  /** Mettre à jour un device */
  DEVICE_UPDATE: 'rfxcom:device:update',
  
  /** Envoyer une commande RFXCOM */
  COMMAND: 'rfxcom:command',
  
  /** Recharger la configuration */
  CONFIG_RELOAD: 'rfxcom:config:reload',
  
  /** Sauvegarder la configuration RFXCOM */
  CONFIG_SAVE: 'rfxcom:config:save',
  
  /** Rafraîchir la liste des devices */
  DEVICES_REFRESH: 'rfxcom:devices:refresh',
  
  /** Tester un device */
  DEVICE_TEST: 'rfxcom:device:test',
  
  /** Créer une scène */
  SCENE_CREATE: 'rfxcom:scene:create',
  
  /** Mettre à jour une scène */
  SCENE_UPDATE: 'rfxcom:scene:update',
  
  /** Supprimer une scène */
  SCENE_DELETE: 'rfxcom:scene:delete',
  
  /** Déclencher une scène */
  SCENE_TRIGGER: 'rfxcom:scene:trigger',
  
  /** Exécuter une scène */
  SCENE_EXECUTE: 'rfxcom:scene:execute',
  
  /** Annuler une scène */
  SCENE_CANCEL: 'rfxcom:scene:cancel',
} as const;

// Type pour les événements RFXCOM
export type RfxComSocketEvents = typeof RFXCOM_SOCKET_EVENTS;

// Type pour les noms des événements (string union)
export type RfxComSocketEventNames = keyof typeof RFXCOM_SOCKET_EVENTS;
