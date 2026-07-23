/**
 * Événements Socket.io spécifiques à l'application EVOO7
 *
 * Conventions :
 * - Préfixe : 'evoo7:'
 * - Format : 'evoo7:<section>:<action>'
 */

// ============================================================================
// Événements Server → Client
// ============================================================================

export const EVOO7_SOCKET_EVENTS = {
  // --- Statut ---
  STATUS: 'evoo7:status',

  // --- Données ---
  DONNEES_LIST: 'evoo7:donnees:list',
  DONNEE_UPDATED: 'evoo7:donnee:updated',

  // --- Erreurs ---
  ERROR: 'evoo7:error',

  // --- Configuration ---
  CONFIG_GET_RESPONSE: 'evoo7:config:get:response',
  CONFIG_SAVE_RESPONSE: 'evoo7:config:save:response'
} as const;

// ============================================================================
// Événements Client → Server
// ============================================================================

export const EVOO7_CLIENT_EVENTS = {
  // --- Demandes ---
  GET_STATUS: 'evoo7:status:get',
  GET_DONNEES: 'evoo7:donnees:list:get',

  // --- Données ---
  DONNEE_SET_SELECTION: 'evoo7:donnee:set_selection',
  DONNEE_SET_TOPIC: 'evoo7:donnee:set_topic',

  // --- Configuration ---
  CONFIG_GET: 'evoo7:config:get',
  CONFIG_SAVE: 'evoo7:config:save'
} as const;

// ============================================================================
// Combinaison / types
// ============================================================================

export const EVOO7_ALL_EVENTS = {
  ...EVOO7_SOCKET_EVENTS,
  ...EVOO7_CLIENT_EVENTS
} as const;

export type Evoo7SocketEvents = typeof EVOO7_SOCKET_EVENTS;
export type Evoo7ClientEvents = typeof EVOO7_CLIENT_EVENTS;
export type Evoo7AllEvents = typeof EVOO7_ALL_EVENTS;

// Événements persistants (envoyés automatiquement aux nouveaux clients) — valeurs réelles des
// événements (pas les clés) : SocketBridge.registerAppSocketEvents() compare contre le nom
// d'événement émis (ex: 'evoo7:status'), pas contre la clé de l'objet (ex: 'STATUS'). Un décalage
// clé/valeur ici désactivait silencieusement le rejeu à la reconnexion pour toute l'app.
export const EVOO7_PERSISTENT_EVENTS: string[] = [
  EVOO7_SOCKET_EVENTS.STATUS,
  EVOO7_SOCKET_EVENTS.DONNEES_LIST
];
