// src/application/EventBus.ts
// EventBus typé pour la communication inter-couches
// Conforme à specs-techniques-socle-ha-mqtt-v4.3.md §9

import { EventEmitter } from 'node:events';
import type { AppEvents } from '../types/events';
import type { IEventBus } from './IEventBus';

/**
 * EventBus typé - Canal de communication principal entre toutes les couches
 * 
 * Règles strictes (conforme §4.2 specs-techniques-socle-ha-mqtt-v4.3) :
 * - Les dépendances ne vont que vers le bas
 * - Aucune couche ne connaît l'existence d'une couche supérieure
 * - Tout passe par l'EventBus ou l'injection de dépendances
 * - SocketBridge est le SEUL composant qui traduit EventBus → Socket.io
 */
export class EventBus implements IEventBus<AppEvents> {
  private emitter: EventEmitter;
  private prefix: string;

  /**
   * Crée un nouveau EventBus avec un préfixe optionnel pour l'isolation
   * @param prefix - Préfixe pour les noms d'événements (ex: "app:")
   */
  constructor(prefix: string = '') {
    this.emitter = new EventEmitter();
    this.prefix = prefix;
    this.emitter.setMaxListeners(100); // Augmenter pour supporter de nombreux événements
  }

  /**
   * Émet un événement typé
   * @param event - Nom de l'événement
   * @param data - Payload de l'événement
   */
  emit<K extends keyof AppEvents>(event: K, data: AppEvents[K]): boolean {
    const fullEventName = this.prefix + event;
    return this.emitter.emit(fullEventName, data);
  }

  /**
   * Émet un événement générique (pour extension par les applications)
   * @param event - Nom complet de l'événement
   * @param data - Payload
   */
  emitGeneric<T = unknown>(event: string, data: T): boolean {
    return this.emitter.emit(event, data);
  }

  /**
   * Écoute un événement typé
   * @param event - Nom de l'événement
   * @param listener - Callback de traitement
   */
  on<K extends keyof AppEvents>(event: K, listener: (data: AppEvents[K]) => void): void {
    const fullEventName = this.prefix + event;
    this.emitter.on(fullEventName, listener);
  }

  /**
   * Écoute un événement générique (pour extension par les applications)
   * @param event - Nom complet de l'événement
   * @param listener - Callback de traitement
   */
  onGeneric<T = unknown>(event: string, listener: (data: T) => void): void {
    this.emitter.on(event, listener);
  }

  /**
   * Écoute un événement une seule fois
   * @param event - Nom de l'événement
   * @param listener - Callback de traitement
   */
  once<K extends keyof AppEvents>(event: K, listener: (data: AppEvents[K]) => void): void {
    const fullEventName = this.prefix + event;
    this.emitter.once(fullEventName, listener);
  }

  /**
   * Écoute un événement une seule fois (générique)
   */
  onceGeneric<T = unknown>(event: string, listener: (data: T) => void): void {
    this.emitter.once(event, listener);
  }

  /**
   * Supprime un listener
   * @param event - Nom de l'événement
   * @param listener - Callback à supprimer
   */
  off<K extends keyof AppEvents>(event: K, listener: (data: AppEvents[K]) => void): void {
    const fullEventName = this.prefix + event;
    this.emitter.off(fullEventName, listener);
  }

  /**
   * Supprime tous les listeners pour un événement
   * @param event - Nom de l'événement
   */
  removeAllListeners<K extends keyof AppEvents>(event: K): void {
    const fullEventName = this.prefix + event;
    this.emitter.removeAllListeners(fullEventName);
  }

  /**
   * Récupère le nombre de listeners pour un événement
   * @param event - Nom de l'événement
   * @returns Nombre de listeners
   */
  listenerCount<K extends keyof AppEvents>(event: K): number {
    const fullEventName = this.prefix + event;
    return this.emitter.listenerCount(fullEventName);
  }

  /**
   * Récupère la liste de tous les noms d'événements
   */
  eventNames(): string[] {
    return this.emitter.eventNames() as string[];
  }



  /**
   * Détruit l'EventBus et libère les ressources
   */
  destroy(): void {
    this.emitter.removeAllListeners();
  }
}

// ============================================================================
// SINGLETON GLOBAL (Optionnel - à utiliser avec précaution)
// ============================================================================

// Instance globale pour les tests ou cas d'usage simples
let globalEventBus: EventBus | null = null;

/**
 * Récupère ou crée l'EventBus global
 * ⚠️ À utiliser avec précaution - préférer l'injection de dépendances
 */
export function getGlobalEventBus(): EventBus {
  if (!globalEventBus) {
    globalEventBus = new EventBus();
  }
  return globalEventBus;
}

/**
 * Réinitialise l'EventBus global (utile pour les tests)
 */
export function resetGlobalEventBus(): void {
  if (globalEventBus) {
    globalEventBus.destroy();
    globalEventBus = null;
  }
}

// ============================================================================
// TYPES POUR EXTENSION
// ============================================================================

/** Type pour les applications qui étendent l'EventBus */
export type ExtendedEventBus<T extends Record<string, unknown>> = EventBus & {
  emitExtended: <K extends keyof T>(event: K, data: T[K]) => boolean;
  onExtended: <K extends keyof T>(event: K, listener: (data: T[K]) => void) => void;
};

/**
 * Crée un EventBus étendu avec des événements supplémentaires
 */
export function createExtendedEventBus<T extends Record<string, unknown>>(
  extension: T
): EventBus & {
  emitExtended: <K extends keyof T>(event: K, data: T[K]) => boolean;
  onExtended: <K extends keyof T>(event: K, listener: (data: T[K]) => void) => void;
} {
  const bus = new EventBus();
  
  return Object.assign(bus, {
    emitExtended<K extends keyof T>(event: K, data: T[K]): boolean {
      return bus.emitGeneric(String(event), data);
    },
    onExtended<K extends keyof T>(event: K, listener: (data: T[K]) => void): void {
      bus.onGeneric(String(event), listener);
    }
  });
}
