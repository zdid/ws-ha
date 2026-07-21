/**
 * Événements Socket.io spécifiques à l'application RFXCOM
 *
 * Conventions :
 * - Préfixe : 'rfxcom:'
 * - Format : 'rfxcom:<section>:<action>'
 *
 * Conforme à fonctionnelles-rfxcom_specs_v5.6.md §11.3/§12.2 et
 * recepteurs-emetteurs-rfxcom_specs_v5.1.md §11.
 */

// ============================================================================
// Événements Server → Client
// ============================================================================

export const RFXCOM_SOCKET_EVENTS = {
  // --- Statut ---
  STATUS: 'rfxcom:status',

  // --- Devices ---
  DEVICES_LIST: 'rfxcom:devices:list',
  DEVICE_DETECTED: 'rfxcom:device:detected',

  // --- Récepteurs ---
  RECEIVERS_LIST: 'rfxcom:receivers:list',
  RECEIVER_CREATED: 'rfxcom:receiver:created',
  RECEIVER_UPDATED: 'rfxcom:receiver:updated',
  RECEIVER_DELETED: 'rfxcom:receiver:deleted',

  // --- Scan ---
  SCAN_START: 'rfxcom:scan:start',
  SCAN_COMPLETE: 'rfxcom:scan:complete',
  SCAN_FAILED: 'rfxcom:scan:failed',

  // --- Scènes ---
  SCENE_EXECUTED: 'rfxcom:scene:executed',
  SCENE_CREATED: 'rfxcom:scene:created',
  SCENE_UPDATED: 'rfxcom:scene:updated',
  SCENE_DELETED: 'rfxcom:scene:deleted',

  // --- Erreurs ---
  ERROR: 'rfxcom:error',

  // --- Configuration ---
  CONFIG_GET_RESPONSE: 'rfxcom:config:get:response',
  CONFIG_SAVE_RESPONSE: 'rfxcom:config:save:response',
  CONFIG_RESET_RESPONSE: 'rfxcom:config:reset:response'
} as const;

// ============================================================================
// Événements Client → Server
// ============================================================================

export const RFXCOM_CLIENT_EVENTS = {
  // --- Demandes ---
  GET_STATUS: 'rfxcom:status:get',
  GET_DEVICES: 'rfxcom:devices:list:get',
  GET_RECEIVERS: 'rfxcom:receivers:list:get',

  // --- Devices ---
  DEVICES_REFRESH: 'rfxcom:devices:refresh',
  DEVICES_CLEAR_UNCONFIGURED: 'rfxcom:devices:clear-unconfigured',
  DEVICE_SET_NAME: 'rfxcom:device:set_name',
  DEVICE_SET_TRANSMIT: 'rfxcom:device:set_transmit',

  // --- Scan ---
  SCAN_START: 'rfxcom:scan:start',

  // --- Récepteurs ---
  RECEIVER_CREATE: 'rfxcom:receiver:create',
  RECEIVER_UPDATE: 'rfxcom:receiver:update',
  RECEIVER_DELETE: 'rfxcom:receiver:delete',

  // --- Scènes ---
  SCENE_EXECUTE: 'rfxcom:scene:execute',
  SCENE_CANCEL: 'rfxcom:scene:cancel',
  SCENE_CREATE: 'rfxcom:scene:create',
  SCENE_UPDATE: 'rfxcom:scene:update',
  SCENE_DELETE: 'rfxcom:scene:delete',

  // --- Configuration ---
  CONFIG_GET: 'rfxcom:config:get',
  CONFIG_SAVE: 'rfxcom:config:save',
  CONFIG_RESET: 'rfxcom:config:reset'
} as const;

// ============================================================================
// Combinaison / types
// ============================================================================

export const RFXCOM_ALL_EVENTS = {
  ...RFXCOM_SOCKET_EVENTS,
  ...RFXCOM_CLIENT_EVENTS
} as const;

export type RfxComSocketEvents = typeof RFXCOM_SOCKET_EVENTS;
export type RfxComClientEvents = typeof RFXCOM_CLIENT_EVENTS;
export type RfxComAllEvents = typeof RFXCOM_ALL_EVENTS;

// Événements persistants (envoyés automatiquement aux nouveaux clients)
export const RFXCOM_PERSISTENT_EVENTS: (keyof RfxComSocketEvents)[] = [
  'STATUS',
  'DEVICES_LIST',
  'RECEIVERS_LIST'
];
