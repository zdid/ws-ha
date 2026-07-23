/**
 * Module principal de l'application NOMMAGE
 * 
 * Ce fichier est scanné par AppService pour la détection automatique.
 * Il doit exporter :
 * - NOMMAGE_APP : ApplicationModule (métadonnées)
 * - createNommageService : Factory de service
 * 
 * ⚠️ Le nom du répertoire (nommage) DOIT correspondre à l'ID déclaré ici.
 * 
 * NOUVEAU v1.0 : Configuration pour un chapitre de menu dédié "Nommage"
 */

import { 
  ApplicationModule,
  ModuleUiMetadata,
  IEventBus,
  Logger,
  IAppConfigProvider,
  ConfigService,
  AppConfigProvider
} from '../../../core/src/exports';
import { NOMMAGE_SOCKET_EVENTS, NOMMAGE_PERSISTENT_EVENTS } from './socket-events';
import { NommageService, INommageService } from './NommageService';
import { NommageMqttIntegrationService, INommageMqttIntegrationService } from '../ha/integration/nommage/NommageMqttIntegrationService';
import type { NommageConfig } from './config-schema';

// ============================================================================
// Types pour la configuration du menu
// ============================================================================

/**
 * Configuration d'une entrée de menu
 */
export interface MenuEntry {
  id?: string;
  label: string;
  icon?: string;
  path: string;
  order: number;
  badge?: string;
  parentId?: string;
}

/**
 * Configuration du menu pour une application
 */
export interface ApplicationMenuConfig {
  category: string;
  section: string;
  entry: MenuEntry;
  pages?: MenuEntry[];
}

// ============================================================================
// Métadonnées UI (pour la configuration dans l'interface)
// ============================================================================

export const NOMMAGE_UI_METADATA: ModuleUiMetadata = {
  title: 'NOMMAGE - Conventions de Nommage',
  description: 'Application de gestion des conventions de nommage QUOI/OÙ pour Home Assistant. Parse les messages de découverte MQTT et normalise les noms selon le protocole unifié.',
  icon: '🏷️',
  category: 'Nommage',
  menuLabel: 'Nommage',
  menuIcon: '🏷️',
  menuOrder: 10,
  menuPath: '/applications/nommage/presentation/nommage/config.html',
  badge: 'MQTT',
  
  // ⭐ v1.1 : les sources MQTT (config.sources[], une ou plusieurs, ajout/suppression dynamique)
  // ne sont plus représentables comme des champs plats ici — elles ont leur propre page dédiée
  // (/nommage/config, voir presentation/nommage/config-app.ts), qui gère le tableau sources[].
  fields: [
    {
      title: 'Home Assistant',
      description: 'Configuration de la transmission vers Home Assistant (Passthrough MQTT)',
      icon: '🏠',
      fields: [
        {
          name: 'ha.injectTaxonomyAttributes',
          label: 'Injecter les attributs de taxonomie',
          type: 'boolean',
          default: true,
          description: 'Ajouter les attributs de taxonomie au message relayé vers HA'
        }
      ]
    },
    {
      title: 'Logging',
      description: 'Configuration des logs de l\'application',
      icon: '📜',
      fields: [
        {
          name: 'logging.level',
          label: 'Niveau de Log',
          type: 'select',
          options: ['debug', 'info', 'warn', 'error'],
          default: 'info'
        },
        {
          name: 'logging.showRawMessages',
          label: 'Afficher les messages bruts',
          type: 'boolean',
          default: false,
          description: 'Afficher les messages MQTT bruts dans les logs'
        },
        {
          name: 'logging.showParsedMessages',
          label: 'Afficher les messages parsés',
          type: 'boolean',
          default: false,
          description: 'Afficher les messages parsés dans les logs'
        }
      ]
    }
  ]
};

// ============================================================================
// Configuration du Menu pour NOMMAGE
// ============================================================================

export const NOMMAGE_MENU_CONFIG: ApplicationMenuConfig = {
  category: 'Paramètres Techniques',
  section: 'Nommage',
  entry: {
    label: 'Nommage',
    icon: '🏷️',
    path: '/applications/nommage/presentation/nommage/config.html',
    order: 20,
    badge: 'MQTT'
  },
  pages: [
    {
      id: 'dashboard',
      label: 'Tableau de bord',
      icon: '📊',
      path: '/applications/nommage/presentation/index.html',
      order: 1
    },
    {
      id: 'config',
      label: 'Configuration',
      icon: '⚙️',
      path: '/applications/nommage/presentation/nommage/config.html',
      order: 2
    }
  ]
};

// ============================================================================
// Déclaration du Module NOMMAGE
// ============================================================================

export const NOMMAGE_APP: ApplicationModule & { menu?: ApplicationMenuConfig } = {
  id: 'nommage',
  name: 'NOMMAGE',
  description: 'Application de gestion des conventions de nommage et taxonomie pour Home Assistant. Écoute une ou plusieurs sources MQTT simultanément, parse les noms selon le format QUOI---OÙ, et relaie les messages enrichis vers HA via le Passthrough MQTT du socle.',
  icon: '🏷️',
  
  menu: NOMMAGE_MENU_CONFIG,
  
  type: 'integration',
  configurable: true,
  requiredMqtt: true,
  requiredHaWs: false,
  configSection: 'nommage',
  configUi: NOMMAGE_UI_METADATA,
  socketEvents: NOMMAGE_SOCKET_EVENTS
};

// ============================================================================
// Factory du Service NOMMAGE
// ============================================================================

export function createNommageService(
  eventBus: IEventBus,
  logger: Logger,
  configProvider: IAppConfigProvider<NommageConfig>
): INommageService {
  const mqttService = NommageMqttIntegrationService.create(
    eventBus,
    logger,
    configProvider
  );
  
  const service = NommageService.create(
    eventBus,
    logger,
    configProvider,
    mqttService
  );
  
  eventBus.emit('app:socket-events:registered', {
    appId: 'nommage',
    socketEvents: NOMMAGE_SOCKET_EVENTS,
    persistentEvents: NOMMAGE_PERSISTENT_EVENTS
  });
  
  eventBus.emit('app:menu:register', {
    appId: 'nommage',
    menuConfig: NOMMAGE_MENU_CONFIG
  });
  
  return service;
}

export function createNommageServiceWithConfig(
  eventBus: IEventBus,
  logger: Logger,
  configService: ConfigService
): INommageService {
  const configProvider = new AppConfigProvider<NommageConfig>('nommage' as any, configService);
  return createNommageService(eventBus, logger, configProvider);
}

// ============================================================================
// Ré-export de tous les composants
// ============================================================================

export * from './NommageService';
export * from './config-schema';
export * from './socket-events';
export * from './types';
export * from '../ha/integration/nommage/NommageMqttIntegrationService';
