/**
 * Interface pour le bus d'événements.
 * 
 * **Rôle :**
 * - Abstraction de EventBus pour permettre l'injection sans connaître la classe concrète
 * - Permet à la couche Métier de dépendre d'une interface plutôt que d'une implémentation
 * - Respecte le principe : "Les dépendances ne vont que vers le bas" (spécs-techniques-socle-ha-mqtt-v4.3.md)
 * 
 * **Contrat :**
 * - Une application métier peut utiliser IEventBus pour émettre/écouter des événements
 * - L'implémentation concrète (EventBus) est fournie par la couche Application
 */

import type { AppEvents } from '../types/events';

/**
 * Interface générique pour le bus d'événements.
 * 
 * @template T - Type des événements (par défaut : AppEvents)
 */
export interface IEventBus<T = AppEvents> {
  /**
   * Émet un événement typé.
   * @param event - Nom de l'événement (clé de T)
   * @param data - Payload de l'événement
   */
  emit<K extends keyof T>(event: K, data: T[K]): boolean;

  /**
   * Émet un événement générique (pour extension par les applications).
   * @param event - Nom complet de l'événement
   * @param data - Payload
   */
  emitGeneric<D = unknown>(event: string, data: D): boolean;

  /**
   * Écoute un événement typé.
   * @param event - Nom de l'événement (clé de T)
   * @param listener - Callback de traitement
   */
  on<K extends keyof T>(event: K, listener: (data: T[K]) => void): void;

  /**
   * Écoute un événement générique.
   * @param event - Nom complet de l'événement
   * @param listener - Callback de traitement
   */
  onGeneric<D = unknown>(event: string, listener: (data: D) => void): void;

  /**
   * Écoute un événement une seule fois.
   * @param event - Nom de l'événement (clé de T)
   * @param listener - Callback de traitement
   */
  once<K extends keyof T>(event: K, listener: (data: T[K]) => void): void;

  /**
   * Écoute un événement une seule fois (générique).
   * @param event - Nom complet de l'événement
   * @param listener - Callback de traitement
   */
  onceGeneric<D = unknown>(event: string, listener: (data: D) => void): void;

  /**
   * Supprime un listener.
   * @param event - Nom de l'événement (clé de T)
   * @param listener - Callback à supprimer
   */
  off<K extends keyof T>(event: K, listener: (data: T[K]) => void): void;

  /**
   * Supprime tous les listeners pour un événement.
   * @param event - Nom de l'événement (clé de T)
   */
  removeAllListeners<K extends keyof T>(event: K): void;
}

/**
 * Type des événements par défaut (compatible avec AppEvents du projet).
 */
export type DefaultAppEvents = AppEvents;
