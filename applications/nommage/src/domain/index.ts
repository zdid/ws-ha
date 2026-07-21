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
  menuLabel: 'Conventions de Nommage',
  menuIcon: '🏷️',
  menuOrder: 10,
  menuPath: '/nommage/config',
  badge: 'MQTT',
  
  fields: [
    {
      title: 'MQTT',
      description: 'Configuration de la connexion MQTT pour la découverte des équipements',
      icon: '📡',
      fields: [
        {
          name: 'mqtt.host',
          label: 'Hôte MQTT',
          type: 'string',
          placeholder: '192.168.1.100',
          default: 'localhost',
          required: true
        },
        {
          name: 'mqtt.port',
          label: 'Port MQTT',
          type: 'number',
          placeholder: '1883',
          default: 1883,
          min: 1,
          max: 65535,
          required: true
        },
        {
          name: 'mqtt.username',
          label: 'Utilisateur MQTT',
          type: 'string',
          placeholder: 'user',
          required: false
        },
        {
          name: 'mqtt.password',
          label: 'Mot de passe MQTT',
          type: 'password',
          placeholder: 'password',
          required: false
        },
        {
          name: 'mqtt.clientId',
          label: 'Client ID MQTT',
          type: 'string',
          placeholder: 'nommage-app',
          default: 'nommage-app',
          required: true
        },
        {
          name: 'mqtt.topicPrefix',
          label: 'Préfixe des Topics',
          type: 'string',
          placeholder: 'ha/',
          default: 'ha/',
          description: 'Préfixe du premier terme des topics (ex: "ha/" ou "homeassistant/")'
        },
        {
          name: 'mqtt.discoveryTopics',
          label: 'Topics de Découverte',
          type: 'string-array',
          placeholder: 'ha/+/+/config',
          default: ['ha/+/+/config', 'homeassistant/+/+/config'],
          description: 'Liste des topics MQTT à écouter pour la découverte (séparés par des virgules)'
        },
        {
          name: 'mqtt.qos',
          label: 'QoS',
          type: 'select',
          options: ['0', '1', '2'],
          default: '1',
          description: 'Qualité de Service pour les abonnements'
        },
        {
          name: 'mqtt.retain',
          label: 'Retain',
          type: 'boolean',
          default: true,
          description: 'Conserver les messages retain'
        },
        {
          name: 'mqtt.useTls',
          label: 'Utiliser TLS',
          type: 'boolean',
          default: false,
          description: 'Activer la connexion MQTT sécurisée (mqtts://)'
        }
      ]
    },
    {
      title: 'Home Assistant',
      description: 'Configuration de la transmission vers Home Assistant',
      icon: '🏠',
      fields: [
        {
          name: 'ha.autoTransmit',
          label: 'Transmission Automatique',
          type: 'boolean',
          default: true,
          description: 'Transmettre automatiquement les structures parsées à HA'
        },
        {
          name: 'ha.defaultComponent',
          label: 'Composant par défaut',
          type: 'string',
          placeholder: 'sensor',
          default: 'sensor',
          description: 'Composant HA par défaut pour les entités créées'
        },
        {
          name: 'ha.defaultDomain',
          label: 'Domaine par défaut',
          type: 'string',
          placeholder: 'sensor',
          default: 'sensor',
          description: 'Domaine HA par défaut'
        },
        {
          name: 'ha.objectIdPrefix',
          label: 'Préfixe Object ID',
          type: 'string',
          placeholder: 'nommage_',
          default: 'nommage_',
          description: 'Préfixe pour les object_id HA générés'
        },
        {
          name: 'ha.autoCreateAreas',
          label: 'Créer les Areas automatiquement',
          type: 'boolean',
          default: true,
          description: 'Créer automatiquement les Areas dans HA si elles n\'existent pas'
        },
        {
          name: 'ha.injectTaxonomyAttributes',
          label: 'Injecter les attributs de taxonomie',
          type: 'boolean',
          default: true,
          description: 'Ajouter les attributs de taxonomie aux entités HA'
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
    label: 'Conventions de Nommage',
    icon: '🏷️',
    path: '/nommage/config',
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
      path: '/nommage/config',
      order: 2
    },
    {
      id: 'discovery',
      label: 'Messages de Découverte',
      icon: '📡',
      path: '/nommage/discovery',
      order: 3
    },
    {
      id: 'taxonomy',
      label: 'Structure Taxonomique',
      icon: '🗂️',
      path: '/nommage/taxonomy',
      order: 4
    },
    {
      id: 'logs',
      label: 'Logs',
      icon: '📜',
      path: '/nommage/logs',
      order: 5
    }
  ]
};

// ============================================================================
// Déclaration du Module NOMMAGE
// ============================================================================

export const NOMMAGE_APP: ApplicationModule & { menu?: ApplicationMenuConfig } = {
  id: 'nommage',
  name: 'NOMMAGE',
  description: 'Application de gestion des conventions de nommage et taxonomie pour Home Assistant. Écoute les messages de découverte MQTT, parse les noms selon le format QUOI---OÙ, et transmet les structures au core pour envoi à HA.',
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
