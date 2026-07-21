// Événements Socket.io spécifiques à l'application ArbreOuquoi
export const ARBREOUQUOI_SOCKET_EVENTS = {
  // Server → Client
  // Structure complète de l'arbre
  TREE_STRUCTURE: 'arbreouquoi:tree:structure',
  TREE_UPDATED: 'arbreouquoi:tree:updated',
  
  // Catalogues et listes
  QUOI_CATALOG: 'arbreouquoi:quoi:catalog',
  AREAS_LIST: 'arbreouquoi:areas:list',
  DEVICES_LIST: 'arbreouquoi:devices:list',
  
  // Détails d'entités
  ENTITY_DETAILS: 'arbreouquoi:entity:details',
  ENTITIES_BY_AREA: 'arbreouquoi:entities:by-area',
  ENTITIES_BY_QUOI: 'arbreouquoi:entities:by-quoi',
  
  // Statistiques
  STATS: 'arbreouquoi:stats',
  
  // Statut de l'application
  STATUS: 'arbreouquoi:status',
  ERROR: 'arbreouquoi:error',
  
  // Client → Server
  // Demandes
  TREE_GET: 'arbreouquoi:tree:get',
  CATALOG_GET: 'arbreouquoi:catalog:get',
  ENTITY_GET: 'arbreouquoi:entity:get',
  SEARCH: 'arbreouquoi:search',
  
  // Filtres
  FILTER_SET: 'arbreouquoi:filter:set',
  FILTER_RESET: 'arbreouquoi:filter:reset',
  
  // Actions
  REFRESH: 'arbreouquoi:refresh',
  EXPAND_NODE: 'arbreouquoi:node:expand',
  COLLAPSE_NODE: 'arbreouquoi:node:collapse',
  
  // Configuration
  CONFIG_GET: 'arbreouquoi:config:get',
  CONFIG_SAVE: 'arbreouquoi:config:save'
} as const;

export type ArbreouquoiSocketEvents = typeof ARBREOUQUOI_SOCKET_EVENTS;
