/**
 * Événements Socket.io spécifiques à l'application NOMMAGE
 * 
 * Conventions :
 * - Préfixe : 'nommage:'
 * - Format : 'nommage:<section>:<action>'
 */



// ============================================================================
// Événements Server → Client (Backend vers UI)
// ============================================================================

export const NOMMAGE_SOCKET_EVENTS = {
  // --- Statut ---
  STATUS: 'nommage:status',
  STATUS_CHANGED: 'nommage:status:changed',
  
  // --- Messages de découverte ---
  DISCOVERY_MESSAGE_RECEIVED: 'nommage:discovery:received',
  DISCOVERY_MESSAGE_PARSED: 'nommage:discovery:parsed',
  
  // --- Structure taxonomique ---
  TAXONOMY_STRUCTURE: 'nommage:taxonomy:structure',
  TAXONOMY_UPDATED: 'nommage:taxonomy:updated',
  
  // --- Transmission vers HA ---
  TRANSMISSION_SENT: 'nommage:transmission:sent',
  TRANSMISSION_FAILED: 'nommage:transmission:failed',
  
  // --- Erreurs ---
  ERROR: 'nommage:error',
  
  // --- Logs ---
  LOG: 'nommage:log',
  
  // --- Configuration ---
  CONFIG_GET: 'nommage:config:get',
  CONFIG_SAVED: 'nommage:config:saved'
} as const;

// ============================================================================
// Événements Client → Server (UI vers Backend)
// ============================================================================

// Ces événements sont déclenchés depuis l'UI
// Note: Les événements persistants sont automatiquement envoyés aux nouveaux clients

export const NOMMAGE_CLIENT_EVENTS = {
  // --- Demandes ---
  GET_STATUS: 'nommage:status:get',
  GET_TAXONOMY: 'nommage:taxonomy:get',
  GET_DISCOVERY_MESSAGES: 'nommage:discovery:messages:get',
  
  // --- Actions ---
  REFRESH_DISCOVERY: 'nommage:discovery:refresh',
  RETRANSMIT_TO_HA: 'nommage:transmit:retry',
  
  // --- Configuration ---
  SAVE_CONFIG: 'nommage:config:save',
  
  // --- Tests ---
  TEST_PARSING: 'nommage:test:parsing',
  SIMULATE_DISCOVERY: 'nommage:test:simulate-discovery'
} as const;

// ============================================================================
// Combinaison de tous les événements
// ============================================================================

export const NOMMAGE_ALL_EVENTS = {
  ...NOMMAGE_SOCKET_EVENTS,
  ...NOMMAGE_CLIENT_EVENTS
} as const;

// ============================================================================
// Types TypeScript
// ============================================================================

export type NommageSocketEvents = typeof NOMMAGE_SOCKET_EVENTS;
export type NommageClientEvents = typeof NOMMAGE_CLIENT_EVENTS;
export type NommageAllEvents = typeof NOMMAGE_ALL_EVENTS;

// Type pour l'enregistrement des événements persistants
export interface NommageSocketEventsRegistration {
  appId: 'nommage';
  socketEvents: NommageSocketEvents;
  persistentEvents: (keyof NommageSocketEvents)[];
}

// ============================================================================
// Événements persistants (envoyés automatiquement aux nouveaux clients)
// ============================================================================

// Valeurs réelles des événements (pas les clés) : SocketBridge.registerAppSocketEvents() compare
// contre le nom d'événement émis (ex: 'nommage:status'), pas contre la clé de l'objet (ex:
// 'STATUS'). Un décalage clé/valeur ici désactivait silencieusement le rejeu à la reconnexion.
export const NOMMAGE_PERSISTENT_EVENTS: string[] = [
  NOMMAGE_SOCKET_EVENTS.STATUS,           // Statut actuel de l'application
  NOMMAGE_SOCKET_EVENTS.TAXONOMY_STRUCTURE // Structure taxonomique actuelle
];
