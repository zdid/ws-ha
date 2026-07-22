// =============================================================================
// Types pour les commandes Home Assistant
// =============================================================================

/**
 * Commande à envoyer à Home Assistant.
 */
export interface HaCommand {
  entity_id: string | string[];      // ID(s) de(s) entité(s) cible(s)
  domain: string;                    // Domaine de la commande (ex: "light", "switch", "climate")
  service: string;                   // Service à appeler (ex: "turn_on", "turn_off", "set_temperature")
  service_data?: Record<string, unknown>; // Données optionnelles pour le service
}

/**
 * Résultat d'une commande.
 * Conforme à specs-erreurs-v1.0.md §7.1
 */
export interface HaCommandResult {
  success: boolean;                  // Indique si la commande a réussi
  command: HaCommandWithStatus;    // La commande qui a été exécutée (avec son ID)
  error?: string;                   // Message d'erreur si la commande a échoué
  errorCode?: string;               // Code d'erreur standardisé (specs-erreurs-v1.0.md)
  response?: unknown;               // Réponse brute de HA (optionnel)
  timestamp: Date;                  // Timestamp de l'exécution
}

/**
 * Appel de service HA via WebSocket.
 * Correspond au message call_service du protocole HA WS.
 */
export interface HaServiceCall {
  id: number;                       // ID de la requête
  type: 'call_service';
  domain: string;                   // Domaine du service
  service: string;                  // Nom du service
  target?: {
    entity_id?: string | string[];  // Entité(s) cible(s)
  };
  service_data?: Record<string, unknown>; // Données du service
}

/**
 * Résultat d'un appel de service HA.
 */
export interface HaServiceCallResult {
  id: number;                       // ID de la requête
  type: 'result';
  success: boolean;
  result?: unknown;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Statut d'exécution d'une commande.
 * Conforme à specs-erreurs-v1.0.md §7.1
 */
export type HaCommandStatus = 
  | 'pending'
  | 'executing'
  | 'success'
  | 'error'
  | 'timeout'
  | 'cancelled';

/**
 * Commande avec métadonnées d'exécution.
 */
export interface HaCommandWithStatus extends HaCommand {
  id: string;                       // ID unique de la commande
  status: HaCommandStatus;
  timestamp: Date;
  retryCount: number;
  maxRetries: number;
  error?: string;
  result?: unknown;
}
