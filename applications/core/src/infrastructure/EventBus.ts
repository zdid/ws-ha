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
// - **Implémente IEventBus** pour la compatibilité avec la couche Application
// =============================================================================

import { EventEmitter } from 'node:events';
import { Logger } from './logger/index';
import { ConfigSaveResult } from '../types/events';
import type { IEventBus } from '../application/IEventBus';
import type { AppEvents } from '../types/events';

// =============================================================================
// Types des événements
// =============================================================================

/**
 * Événement de découverte d'une entité depuis un module métier.
 * Émis par les modules domaine vers HA-integration.
 */
export interface EntityDiscoveryEvent {
  type: 'entity:discovered';
  source: string; // Nom du module source
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
    module: string; // Module cible
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
// EventBus - Implémente IEventBus et ajoute des méthodes spécifiques HA
// =============================================================================

/**
 * Bus d'événements pour la communication inter-couches.
 * Implémente IEventBus pour la compatibilité avec la couche Application.
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
 *   if (event.source === 'module-name') {
 *     console.log('Entité:', event.data);
 *   }
 * });
 * 
 * // S'abonner à TOUS les événements (wildcard)
 * const unsubscribe = bus.onAll((event) => {
 *   console.log('Événement:', event.type);
 * });
 * unsubscribe(); // Se désabonner
 * 
 * // Publier un événement (format objet complet)
 * bus.emit({
 *   type: 'entity:discovered',
 *   source: 'module-name',
 *   timestamp: new Date(),
 *   data: { entityId: 'sensor.temp_001', ... }
 * });
 * 
 * // Publier un événement (format IEventBus compatible)
 * bus.emit('entity:discovered', eventData);
 * 
 * // Publier un événement générique
 * bus.emitGeneric('custom:event', { customData: 'value' });
 * ```
 */
export class EventBus implements IEventBus {
  private emitter: EventEmitter;
  private listeners: Map<string, Set<EventCallback<EventBusEvent>>> = new Map();
  private wildcardListeners: Set<EventCallback<EventBusEvent>> = new Set();
  private logger: Logger;

  /**
   * @param logger - Logger optionnel
   */
  constructor(logger?: Logger) {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(100);
    this.logger = logger || new Logger({
      level: 'info',
      maxSizeMb: 10,
      maxFiles: 5,
      logDir: '/app/logs',
    });
  }

  // ===========================================================================
  // Méthodes IEventBus - Compatibilité avec la couche Application
  // ===========================================================================

  /**
   * Émet un événement typé (IEventBus).
   * @param event - Nom de l'événement (clé de AppEvents)
   * @param data - Payload de l'événement
   */
  emit<K extends keyof AppEvents>(event: K, data: AppEvents[K]): boolean {
    const fullEventName = String(event);
    const result = this.emitter.emit(fullEventName, data);
    
    // aussi notifier les listeners HA spécifiques
    this.notifyHaListeners(fullEventName, data);
    
    return result;
  }

  /**
   * Émet un événement générique (IEventBus).
   * @param event - Nom complet de l'événement
   * @param data - Payload
   */
  emitGeneric<D = unknown>(event: string, data: D): boolean {
    const result = this.emitter.emit(event, data);
    
    // aussi notifier les listeners HA spécifiques
    this.notifyHaListeners(event, data);
    
    return result;
  }

  /**
   * Écoute un événement typé (IEventBus).
   * @param event - Nom de l'événement
   * @param listener - Callback de traitement
   */
  on<K extends keyof AppEvents>(event: K, listener: (data: AppEvents[K]) => void): void {
    const fullEventName = String(event);
    this.emitter.on(fullEventName, listener);
  }

  /**
   * Écoute un événement générique (IEventBus).
   * @param event - Nom complet de l'événement
   * @param listener - Callback de traitement
   */
  onGeneric<D = unknown>(event: string, listener: (data: D) => void): void {
    this.emitter.on(event, listener);
  }

  /**
   * Supprime un listener générique (IEventBus) — symétrique de onGeneric, pas de préfixe.
   */
  offGeneric<D = unknown>(event: string, listener: (data: D) => void): void {
    this.emitter.off(event, listener);
  }

  /**
   * Écoute un événement une seule fois (IEventBus).
   * @param event - Nom de l'événement
   * @param listener - Callback de traitement
   */
  once<K extends keyof AppEvents>(event: K, listener: (data: AppEvents[K]) => void): void {
    const fullEventName = String(event);
    this.emitter.once(fullEventName, listener);
  }

  /**
   * Écoute un événement une seule fois (générique) (IEventBus).
   */
  onceGeneric<D = unknown>(event: string, listener: (data: D) => void): void {
    this.emitter.once(event, listener);
  }

  /**
   * Supprime un listener (IEventBus).
   * @param event - Nom de l'événement
   * @param listener - Callback à supprimer
   */
  off<K extends keyof AppEvents>(event: K, listener: (data: AppEvents[K]) => void): void {
    const fullEventName = String(event);
    this.emitter.off(fullEventName, listener);
  }

  /**
   * Supprime tous les listeners pour un événement (IEventBus).
   * @param event - Nom de l'événement
   */
  removeAllListeners<K extends keyof AppEvents>(event: K): void {
    const fullEventName = String(event);
    this.emitter.removeAllListeners(fullEventName);
  }

  /**
   * Récupère le nombre de listeners pour un événement (IEventBus).
   * @param event - Nom de l'événement
   * @returns Nombre de listeners
   */
  listenerCount<K extends keyof AppEvents>(event: K): number {
    const fullEventName = String(event);
    return this.emitter.listenerCount(fullEventName);
  }

  /**
   * Récupère la liste de tous les noms d'événements (IEventBus).
   */
  eventNames(): string[] {
    return this.emitter.eventNames() as string[];
  }

  /**
   * Détruit l'EventBus et libère les ressources (IEventBus).
   */
  destroy(): void {
    this.emitter.removeAllListeners();
    this.listeners.clear();
    this.wildcardListeners.clear();
  }

  // ===========================================================================
  // Méthodes spécifiques HA - Pour l'infrastructure
  // ===========================================================================

  /**
   * S'abonne à un type d'événement spécifique (format HA).
   * 
   * @param eventType - Type de l'événement (ex: 'entity:discovered')
   * @param callback - Callback à appeler
   * @returns Fonction pour se désabonner
   */
  onTyped<T extends EventBusEvent>(eventType: T['type'], callback: EventCallback<T>): () => void {
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
   * Publie un événement sur le bus (format HA - objet complet).
   * 
   * @param event - Événement à publier
   */
  emitHa<T extends EventBusEvent>(event: T): void {
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
    
    // aussi émettre via EventEmitter pour compatibilité IEventBus
    this.emitter.emit(event.type, event);
  }

  // Note: La méthode emit() est fournie par IEventBus
  // Pour émettre un événement HA (objet complet), utilisez emitHa()
  // Pour émettre un événement IEventBus (type + data), utilisez emit(type, data)

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
   * Notifie les listeners HA spécifiques pour un événement EventEmitter.
   */
  private notifyHaListeners(eventType: string, data: unknown): void {
    // Convertir en format HA si nécessaire
    const haEvent: EventBusEvent = {
      type: eventType as EventBusEvent['type'],
      source: 'app',
      timestamp: new Date(),
      data: data as any,
    } as EventBusEvent;
    
    // Notifier les listeners spécifiques au type
    const typeListeners = this.listeners.get(eventType);
    if (typeListeners) {
      for (const listener of typeListeners) {
        try {
          listener(haEvent);
        } catch (error) {
          this.logger.error('eventbus', `Erreur dans HA listener pour ${eventType}: ${error}`);
        }
      }
    }

    // Notifier les wildcard listeners
    for (const listener of this.wildcardListeners) {
      try {
        listener(haEvent);
      } catch (error) {
        this.logger.error('eventbus', `Erreur dans HA wildcard listener: ${error}`);
      }
    }
  }

  /**
   * Supprime tous les listeners.
   */
  clear(): void {
    this.listeners.clear();
    this.wildcardListeners.clear();
    this.emitter.removeAllListeners();
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
    return count + this.emitter.listenerCount('');
  }

  /**
   * Récupère les types d'événements actuellement écoutés.
   */
  getListenedTypes(): string[] {
    return Array.from(this.listeners.keys());
  }
}
