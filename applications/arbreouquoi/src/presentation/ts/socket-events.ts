// Copie navigateur de applications/arbreouquoi/src/domain/socket-events.ts — dupliquée ici
// volontairement : le build navigateur (tsconfig.ui.json) est isolé du reste de l'app pour ne
// jamais recompiler de fichier partagé avec le build serveur (Node/CommonJS) dans un format
// différent (ES modules) au même endroit. Garder synchronisé avec domain/socket-events.ts.
export const ARBREOUQUOI_SOCKET_EVENTS = {
  // Server → Client
  TREE_STRUCTURE: 'arbreouquoi:tree:structure',
  TREE_UPDATED: 'arbreouquoi:tree:updated',

  QUOI_CATALOG: 'arbreouquoi:quoi:catalog',
  AREAS_LIST: 'arbreouquoi:areas:list',
  DEVICES_LIST: 'arbreouquoi:devices:list',

  ENTITY_DETAILS: 'arbreouquoi:entity:details',
  ENTITIES_BY_AREA: 'arbreouquoi:entities:by-area',
  ENTITIES_BY_QUOI: 'arbreouquoi:entities:by-quoi',

  STATS: 'arbreouquoi:stats',

  STATUS: 'arbreouquoi:status',
  ERROR: 'arbreouquoi:error',

  // Client → Server
  TREE_GET: 'arbreouquoi:tree:get',
  CATALOG_GET: 'arbreouquoi:catalog:get',
  ENTITY_GET: 'arbreouquoi:entity:get',
  SEARCH: 'arbreouquoi:search',

  FILTER_SET: 'arbreouquoi:filter:set',
  FILTER_RESET: 'arbreouquoi:filter:reset',

  REFRESH: 'arbreouquoi:refresh',
  EXPAND_NODE: 'arbreouquoi:node:expand',
  COLLAPSE_NODE: 'arbreouquoi:node:collapse',

  CONFIG_GET: 'arbreouquoi:config:get',
  CONFIG_SAVE: 'arbreouquoi:config:save',
  CONFIG_SAVED: 'arbreouquoi:config:saved'
} as const;

export type ArbreouquoiSocketEvents = typeof ARBREOUQUOI_SOCKET_EVENTS;
