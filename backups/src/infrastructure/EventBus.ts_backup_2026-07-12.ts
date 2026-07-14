// =============================================================================
// EventBus - Bus d'événements pour la communication inter-couches
//
// Ce bus permet aux différentes couches (HA, Domain, Integration) de communiquer
// sans dépendre directement les unes des autres.
//
// **Responsabilités :**
// - Centraliser la gestion des événements
// - Permettre l'abonnement et la publication d'événements
// - Typage fort des événements
// =============================================================================

import { Logger } from './logger/index';
import { ConfigSaveResult } from '../types/events';

// =============================================================================
// Types des événements
// =============================================================================

/**
 * Événement de découverte d'une entité depuis un module métier.
 * Émis par les modules domaine (ex: RfxComService) vers HA-integration.
 */
export interface EntityDiscoveryEvent {
  type: 'entity:discovered';
  source: string; // Nom du module source (ex: 'rfxcom')
  timestamp: Date;
  data: {
    entityId: string;
    deviceId: string;
    sensorId: string;
    name: string;
    component: string;
    deviceClass?: string;
    state: string | number | boolean;
    attributes: Record<string, unknown>;
    unitOfMeasurement?: string;
    icon?: string;
    commandTopic?: string;
  };
}

/**
 * Événement de changement d'état d'une entité.
 * Émis par les modules domaine vers HA-integration.
 */
export interface EntityStateChangeEvent {
  type: 'entity:state_changed';
  source: string; // Nom du module source
  timestamp: Date;
  data: {
    entityId: string;
    state: string | number | boolean;
    attributes?: Record<string, unknown>;
  };
}

/**
 * Événement de suppression d'une entité.
 * Émis par les modules domaine vers HA-integration.
 */
export interface EntityRemovedEvent {
  type: 'entity:removed';
  source: string;
  timestamp: Date;
  data: {
    entityId: string;
  };
}

/**
 * Événement de connexion/déconnexion d'un device.
 * Émis par les modules domaine vers HA-integration.
 */
export interface DeviceConnectionEvent {
  type: 'device:connected' | 'device:disconnected';
  source: string;
  timestamp: Date;
  data: {
    deviceId: string;
    name: string;
    manufacturer?: string;
    model?: string;
  };
}

/**
 * Événement de commande reçue de HA.
 * Émis par HA-integration vers les modules domaine.
 */
export interface CommandReceivedEvent {
  type: 'command:received';
  source: string; // Module HA source (ex: 'mqtt')
  timestamp: Date;
  data: {
    module: string; // Module cible (ex: 'rfxcom')
    entityId: string;
    command: string;
    payload?: Record<string, unknown>;
  };
}

/**
 * Événement de résultat de sauvegarde de configuration.
 * Émis par AppService après tentative de sauvegarde.
 */
export interface ConfigSaveEvent {
  type: 'config:save:result';
  source: 'app';
  timestamp: Date;
  data: ConfigSaveResult;
}

/**
 * Union de tous les types d'événements.
 */
export type EventBusEvent = 
  | EntityDiscoveryEvent
  | EntityStateChangeEvent
  | EntityRemovedEvent
  | DeviceConnectionEvent
  | CommandReceivedEvent
  | ConfigSaveEvent;

/**
 * Type générique pour un callback d'événement.
 */
export type EventCallback<T extends EventBusEvent> = (event: T) => void;

/**
 * Filtre pour s'abonner à des événements spécifiques.
 */
export interface EventFilter {
  type?: string;
  source?: string;
}

// =============================================================================
// EventBus
// =============================================================================

/**
 * Bus d'événements pour la communication inter-couches.
 * 
 * **Utilisation :**
 * ```typescript
 * const bus = new EventBus();
 * 
 * // S'abonner à tous les événements de découverte
 * bus.on('entity:discovered', (event) => {
 *   console.log('Nouvelle entité:', event.data.entityId);
 * });
 * 
 * // S'abonner aux événements d'un module spécifique
 * bus.on('entity:discovered', (event) => {
 *   if (event.source === 'rfxcom') {
 *     console.log('Entité RFXCOM:', event.data);
 *   }
 * });
 * 
 * // Publier un événement
 * bus.emit({
 *   type: 'entity:discovered',
 *   source: 'rfxcom',
 *   timestamp: new Date(),
 *   data: { entityId: 'sensor.temp_001', ... }
 * });
 * ```
 */
export class EventBus {
  private listeners: Map<string, Set<EventCallback<EventBusEvent>>> = new Map();
  private wildcardListeners: Set<EventCallback<EventBusEvent>> = new Set();
  private logger: Logger;

  /**
   * @param logger - Logger optionnel
   */
  constructor(logger?: Logger) {
    this.logger = logger || new Logger({
      level: 'info',
      maxSizeMb: 10,
      maxFiles: 5,
      logDir: '/app/logs',
    });
  }

  /**
   * S'abonne à un type d'événement spécifique.
   * 
   * @param eventType - Type de l'événement (ex: 'entity:discovered')
   * @param callback - Callback à appeler
   * @returns Fonction pour se désabonner
   */
  on<T extends EventBusEvent>(eventType: T['type'], callback: EventCallback<T>): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    (this.listeners.get(eventType) as Set<EventCallback<any>>).add(callback as EventCallback<any>);

    this.logger.debug('eventbus', `Abonnement à ${eventType}`);

    // Retourner la fonction de désabonnement
    return () => {
      const listeners = this.listeners.get(eventType);
      if (listeners) {
        listeners.delete(callback as EventCallback<any>);
        this.logger.debug('eventbus', `Désabonnement de ${eventType}`);
      }
    };
  }

  /**
   * S'abonne à tous les événements (wildcard).
   * 
   * @param callback - Callback à appeler pour tous les événements
   * @returns Fonction pour se désabonner
   */
  onAll(callback: EventCallback<EventBusEvent>): () => void {
    this.wildcardListeners.add(callback);
    this.logger.debug('eventbus', 'Abonnement à tous les événements');

    return () => {
      this.wildcardListeners.delete(callback);
      this.logger.debug('eventbus', 'Désabonnement de tous les événements');
    };
  }

  /**
   * S'abonne avec un filtre.
   * 
   * @param filter - Filtre pour les événements
   * @param callback - Callback à appeler
   * @returns Fonction pour se désabonner
   */
  onFiltered(filter: EventFilter, callback: EventCallback<EventBusEvent>): () => void {
    const wrappedCallback: EventCallback<EventBusEvent> = (event) => {
      if (this.matchFilter(event, filter)) {
        callback(event);
      }
    };

    this.wildcardListeners.add(wrappedCallback);
    this.logger.debug('eventbus', `Abonnement avec filtre: ${JSON.stringify(filter)}`);

    return () => {
      this.wildcardListeners.delete(wrappedCallback);
    };
  }

  /**
   * Publie un événement sur le bus.
   * 
   * @param event - Événement à publier
   */
  emit<T extends EventBusEvent>(event: T): void {
    this.logger.debug('eventbus', `Événement émis: ${event.type} [source: ${event.source}]`);

    // Notifier les listeners spécifiques au type
    const typeListeners = this.listeners.get(event.type);
    if (typeListeners) {
      for (const listener of typeListeners) {
        try {
          listener(event as EventBusEvent);
        } catch (error) {
          this.logger.error('eventbus', `Erreur dans listener pour ${event.type}: ${error}`);
        }
      }
    }

    // Notifier les wildcard listeners
    for (const listener of this.wildcardListeners) {
      try {
        listener(event as EventBusEvent);
      } catch (error) {
        this.logger.error('eventbus', `Erreur dans wildcard listener: ${error}`);
      }
    }
  }

  /**
   * Vérifie si un événement correspond à un filtre.
   * 
   * @param event - Événement à tester
   * @param filter - Filtre à appliquer
   * @returns true si l'événement correspond au filtre
   */
  private matchFilter(event: EventBusEvent, filter: EventFilter): boolean {
    if (filter.type && event.type !== filter.type) {
      return false;
    }
    if (filter.source && event.source !== filter.source) {
      return false;
    }
    return true;
  }

  /**
   * Supprime tous les listeners.
   */
  clear(): void {
    this.listeners.clear();
    this.wildcardListeners.clear();
    this.logger.info('eventbus', 'Tous les listeners supprimés');
  }

  /**
   * Récupère le nombre de listeners actifs.
   */
  getListenerCount(): number {
    let count = this.wildcardListeners.size;
    for (const listeners of this.listeners.values()) {
      count += listeners.size;
    }
    return count;
  }

  /**
   * Récupère les types d'événements actuellement écoutés.
   */
  getListenedTypes(): string[] {
    return Array.from(this.listeners.keys());
  }
}
