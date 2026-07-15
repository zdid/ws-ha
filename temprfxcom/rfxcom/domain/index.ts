// src/applications/rfxcom/domain/index.ts
// Module RFXCOM - Déclaration et exports
// Conforme à specs-presentation-v2.0.md §8.1

import { z } from 'zod';
import type { ApplicationModule, ModuleUiMetadata, ConfigField } from '../../../types/config';
import { RFXCOM_SOCKET_EVENTS } from './socket-events';
import { rfxcomConfigSchema } from './config-schema';

/**
 * Métadonnées UI pour RFXCOM
 * Utilisées pour la génération dynamique des formulaires dans l'interface web
 * Conforme à l'architecture 5 couches : la couche Métier déclare ses besoins UI
 */
export const RFXCOM_UI_METADATA: ModuleUiMetadata = {
  title: 'Configuration RFXCOM',
  description: 'Paramètres techniques pour l\'intégration RFXCOM (433 MHz)',
  icon: '📡',
  fields: [
    {
      name: 'enabled',
      label: 'Activer RFXCOM',
      type: 'boolean',
      hint: 'Active ou désactive complètement le module RFXCOM',
      required: false,
    },
    {
      name: 'serialPort',
      label: 'Port Série',
      type: 'text',
      placeholder: '/dev/ttyACM0',
      hint: 'Chemin vers le port série où est connecté le transceiver RFXCOM',
      required: true,
    },
    {
      name: 'baudRate',
      label: 'Baud Rate',
      type: 'number',
      placeholder: '38400',
      hint: 'Vitesse de communication série en bauds',
      required: true,
      min: 1,
      max: 115200,
    },
    {
      name: 'transceiverType',
      label: 'Type de Transceiver',
      type: 'select',
      hint: 'Modèle du transceiver RFXCOM utilisé',
      required: true,
      options: [
        { value: 'rfxtrx433e', label: 'RFXtrx433E (433 MHz Europe)' },
        { value: 'rfxtrx433xl', label: 'RFXtrx433XL (433 MHz Long Range)' },
        { value: 'rfxcom433e', label: 'RFXCOM433E (433 MHz)' },
      ],
    },
    {
      name: 'serialTimeoutMs',
      label: 'Timeout Série (ms)',
      type: 'number',
      placeholder: '1000',
      hint: 'Délai d\'attente pour la lecture série en millisecondes',
      required: false,
      min: 1,
      max: 10000,
      step: 100,
    },
    {
      name: 'devicesConfigPath',
      label: 'Chemin Config Devices',
      type: 'text',
      placeholder: '/app/data/config-rfxcom-devices-v1.0.yaml',
      hint: 'Chemin vers le fichier YAML de configuration des devices',
      required: false,
    },
    {
      name: 'autoReloadConfigMs',
      label: 'Rechargement Auto (ms)',
      type: 'number',
      placeholder: '30000',
      hint: 'Intervalle de rechargement automatique de la config (0 = désactivé)',
      required: false,
      min: 0,
      max: 300000,
      step: 1000,
    },
    {
      name: 'autoDiscovery',
      label: 'Détection Automatique',
      type: 'boolean',
      hint: 'Active la détection automatique des nouveaux devices',
      required: false,
    },
    {
      name: 'discoveryIntervalMs',
      label: 'Intervalle Détection (ms)',
      type: 'number',
      placeholder: '60000',
      hint: 'Délai entre les scans de détection automatique',
      required: false,
      min: 1000,
      max: 300000,
      step: 1000,
    },
    {
      name: 'logLevel',
      label: 'Niveau de Log',
      type: 'select',
      hint: 'Niveau de détail des logs spécifiques à RFXCOM',
      required: false,
      options: [
        { value: 'debug', label: 'Debug (Très détaillé)' },
        { value: 'info', label: 'Info (Normal)' },
        { value: 'warn', label: 'Warning (Avertissements)' },
        { value: 'error', label: 'Error (Erreurs seulement)' },
      ],
    },
  ],
};

/**
 * Déclaration du module RFXCOM
 * 
 * Ce module est détecté automatiquement par AppService au démarrage
 * via la constante RFXCOM_APP exportée ici.
 * 
 * Conforme à specs-presentation-v2.0.md §4.3 et §8.1
 */
export const RFXCOM_APP: ApplicationModule = {
  id: 'rfxcom',
  name: 'RFXCOM',
  description: 'Intégration des devices RF433 (récepteurs 433 MHz)',
  icon: '📡',
  type: 'integration', // Utilise MQTT pour communiquer avec HA
  configurable: true,
  socketEvents: RFXCOM_SOCKET_EVENTS,
  requiredMqtt: true,  // Nécessite MQTT
  requiredHaWs: false, // ❌ Ne nécessite PAS HA WebSocket (MQTT uniquement)
  // NOUVEAU : Métadonnées pour la génération dynamique de l'UI
  configUi: RFXCOM_UI_METADATA,
  configSection: 'rfxcom', // Nom de la section dans la config
};

// Ré-exporter les sous-composants pour une importation facile
export * from './socket-events';
export * from './config-schema';
export * from './types';
export * from './RfxComService';
export * from './RfxComConfigService';
export * from './StatePersistenceService';


// =============================================================================
// Factory pour instancier RfxComService avec injection de dépendances
// =============================================================================

import type { IEventBus } from '../../../application/IEventBus';
import type { Logger } from '../../../infrastructure/logger/index';
import type { IAppConfigProvider } from '../../../infrastructure/config/IAppConfigProvider';
import { AppConfigProvider } from '../../../infrastructure/config/AppConfigProvider';
import { RfxComService } from './RfxComService';
import type { RfxComConfig } from './config-schema';
import type { ConfigService } from '../../../infrastructure/config/ConfigService';

/**
 * Factory pour créer une instance de RfxComService avec les bonnes dépendances.
 * 
 * **Utilisation :**
 * ```typescript
 * import { createRfxComService, RFXCOM_APP } from './applications/rfxcom/domain';
 * 
 * // Créer les dépendances (injection depuis les couches inférieures)
 * const configService = new ConfigService();
 * const eventBus = new EventBus();
 * const logger = new Logger('RFXCOM');
 * 
 * // Créer l'adaptateur de configuration pour RFXCOM
 * const rfxcomConfigProvider = new AppConfigProvider<RfxComConfig>('rfxcom', configService);
 * 
 * // Instancier le service via la factory
 * const rfxComService = createRfxComService(eventBus, logger, rfxcomConfigProvider);
 * ```
 * 
 * **Note :** Cette factory est conforme à l'architecture 5 couches :
 * - La couche Métier (RfxComService) dépend d'interfaces (IEventBus, IAppConfigProvider)
 * - Les implémentations concrètes sont injectées depuis les couches Application/Infrastructure
 */
export function createRfxComService(
  eventBus: IEventBus,
  logger: Logger,
  configProvider: IAppConfigProvider<RfxComConfig>
): RfxComService {
  return new RfxComService(eventBus, logger, configProvider);
}

/**
 * Factory simplifiée qui crée automatiquement l'adaptateur de configuration.
 * 
 * **Utilisation :**
 * ```typescript
 * import { createRfxComServiceWithConfig, RFXCOM_APP } from './applications/rfxcom/domain';
 * import { ConfigService } from './infrastructure/config/ConfigService';
 * import { EventBus } from './application/EventBus';
 * import { Logger } from './infrastructure/logger';
 * 
 * const configService = new ConfigService();
 * const eventBus = new EventBus();
 * const logger = new Logger('RFXCOM');
 * 
 * const rfxComService = createRfxComServiceWithConfig(eventBus, logger, configService);
 * ```
 */
export function createRfxComServiceWithConfig(
  eventBus: IEventBus,
  logger: Logger,
  configService: ConfigService
): RfxComService {
  const rfxcomConfigProvider = new AppConfigProvider<RfxComConfig>('rfxcom', configService);
  return createRfxComService(eventBus, logger, rfxcomConfigProvider);
}
