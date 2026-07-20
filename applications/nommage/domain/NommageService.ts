/**
 * NommageService
 * 
 * Service métier principal de l'application NOMMAGE.
 * 
 * Responsabilités :
 * - Écouter les messages de découverte bruts via EventBus
 * - Parser les messages selon le format QUOI---OÙ (nommage_specs_v1.0.md)
 * - Transmettre les structures au core pour envoi à Home Assistant
 * - Gérer le statut et les erreurs
 * 
 * Couche : Domain (Métier)
 * ⚠️ NE CONNAÎT PAS : MQTT, HA, Socket.io, filesystem
 *    → Tout passe par EventBus et interfaces injectées
 */

import type { IEventBus } from '../../../../application/IEventBus';
import type { Logger } from '../../../../infrastructure/logger/index';
import type { IAppConfigProvider } from '../../../../infrastructure/config/IAppConfigProvider';
import type { INommageMqttIntegrationService } from '../ha/integration/nommage/NommageMqttIntegrationService';
import type { NommageConfig } from './config-schema';
import type {
  DiscoveryMessage,
  ParsedTaxonomy,
  TaxonomyLevel,
  TaxonomyStructure,
  NommageStatus
} from './types';

// ============================================================================
// Interface du service
// ============================================================================

export interface INommageService {
  start(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): NommageStatus;
  getTaxonomyStructures(): TaxonomyStructure[];
}

// ============================================================================
// Implémentation
// ============================================================================

export class NommageService implements INommageService {
  private parsedCount: number = 0;
  private lastParsedAt: Date | null = null;
  private taxonomyStructures: TaxonomyStructure[] = [];
  private mqttConnected: boolean = false;
  private status: NommageStatus = {
    connected: false,
    mqttConnected: false,
    discoveryTopics: [],
    parsedMessagesCount: 0,
    error: undefined
  };
  
  private config: NommageConfig;
  private discoveryTopics: string[] = [];
  
  constructor(
    private eventBus: IEventBus,
    private logger: Logger,
    private configProvider: IAppConfigProvider<NommageConfig>,
    private mqttService: INommageMqttIntegrationService
  ) {
    this.config = this.configProvider.getAppConfig();
    this.discoveryTopics = this.config.mqtt.discoveryTopics;
    this.setupEventListeners();
  }
  
  // ==========================================================================
  // Cycle de vie
  // ==========================================================================
  
  async start(): Promise<void> {
    this.logger.info('NommageService', 'Démarrage du service NOMMAGE...');
    
    try {
      // Se connecter à MQTT
      await this.mqttService.connect();
      this.mqttConnected = true;
      
      this.logger.info('NommageService', 
        `Service démarré avec succès. Topics de découverte: ${this.discoveryTopics.join(', ')}`);
      
      this.updateStatus();
      
      // Émettre le statut initial
      this.emitStatus();
      
      // Émettre les événements persistants pour les nouveaux clients
      this.emitPersistentEvents();
      
    } catch (error) {
      this.logger.error('NommageService', 
        `Échec du démarrage: ${error}`);
      this.status.error = error instanceof Error ? error.message : String(error);
      this.emitStatus();
      throw error;
    }
  }
  
  async stop(): Promise<void> {
    this.logger.info('NommageService', 'Arrêt du service NOMMAGE...');
    
    try {
      await this.mqttService.disconnect();
      this.mqttConnected = false;
      this.updateStatus();
      this.emitStatus();
      
      this.logger.info('NommageService', 'Service arrêté avec succès');
    } catch (error) {
      this.logger.error('NommageService', 
        `Erreur lors de l'arrêt: ${error}`);
    }
  }
  
  // ==========================================================================
  // Gestion des événements EventBus
  // ==========================================================================
  
  private setupEventListeners(): void {
    // Écouter les messages de découverte bruts
    this.eventBus.on('nommage:discovery:raw', 
      (discoveryMessage: DiscoveryMessage) => {
        this.handleRawDiscoveryMessage(discoveryMessage);
      });
    
    // Écouter les changements de statut MQTT
    this.eventBus.on('nommage:mqtt:status', (status: { connected: boolean }) => {
      this.mqttConnected = status.connected;
      this.updateStatus();
      this.emitStatus();
    });
    
    // Écouter les demandes de statut depuis l'UI
    this.eventBus.on('nommage:status:get', () => {
      this.emitStatus();
    });
    
    // Écouter les demandes de structure taxonomique
    this.eventBus.on('nommage:taxonomy:get', () => {
      this.emitTaxonomyStructure();
    });
    
    // Écouter les demandes de sauvegarde de config
    this.eventBus.on('nommage:config:save', (config: Partial<NommageConfig>) => {
      this.saveConfig(config);
    });
  }
  
  // ==========================================================================
  // Parsing des messages de découverte
  // ==========================================================================
  
  private handleRawDiscoveryMessage(discoveryMessage: DiscoveryMessage): void {
    this.logger.debug('NommageService', 
      `Message brut reçu: ${discoveryMessage.rawName}`);
    
    try {
      // Parser selon le format QUOI---OÙ
      const parsed = this.parseDiscoveryName(discoveryMessage.rawName);
      
      if (parsed) {
        discoveryMessage.rawQuoi = parsed.quoi.raw;
        discoveryMessage.slugQuoi = parsed.quoi.slug;
        discoveryMessage.rawLieux = parsed.rawLieux || '';
        discoveryMessage.lieuxSegments = parsed.lieuxSegments || [];
        discoveryMessage.nomPrecis = parsed.ou.precis?.raw;
        discoveryMessage.slugPrecis = parsed.ou.precis?.slug;
        discoveryMessage.nomLieu = parsed.ou.lieu?.raw;
        discoveryMessage.slugLieu = parsed.ou.lieu?.slug;
        discoveryMessage.nomPere = parsed.ou.pere?.raw;
        discoveryMessage.slugPere = parsed.ou.pere?.slug;
        discoveryMessage.nomGrandPere = parsed.ou.grandPere?.raw;
        discoveryMessage.slugGrandPere = parsed.ou.grandPere?.slug;
        
        // Créer la structure taxonomique
        const taxonomyStructure: TaxonomyStructure = {
          entityId: this.generateEntityId(parsed),
          taxonomy: {
            ...parsed,
            sourceTopic: discoveryMessage.topic,
            sourcePayload: discoveryMessage.payload
          },
          lastUpdated: new Date()
        };
        
        // Stocker la structure
        this.taxonomyStructures.push(taxonomyStructure);
        
        // Incrémenter les compteurs
        this.parsedCount++;
        this.lastParsedAt = new Date();
        
        // Émettre les événements
        this.emitDiscoveryParsed(discoveryMessage, parsed);
        
        // Transmettre au core pour envoi à HA
        this.transmitToCore(discoveryMessage, parsed);
        
        this.logger.info('NommageService', 
          `Message parsed: QUOI="${parsed.quoi.raw}" | LIEU="${parsed.ou.lieu?.raw || 'N/A'}"`);
        
        if (this.config.logging.showParsedMessages) {
          this.logger.debug('NommageService', 
            `Parsed: ${JSON.stringify(parsed, null, 2)}`);
        }
        
        this.updateStatus();
        this.emitStatus();
        this.emitTaxonomyStructure();
        
      } else {
        this.logger.warn('NommageService', 
          `Format de nom non valide: ${discoveryMessage.rawName}`);
      }
      
    } catch (error) {
      this.logger.error('NommageService', 
        `Erreur de parsing: ${error}`);
      
      // Émettre une erreur
      this.eventBus.emit('nommage:error', {
        message: `Erreur de parsing du message: ${discoveryMessage.rawName}`,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date()
      });
    }
  }
  
  /**
   * Parse un nom selon le format QUOI---OÙ
   * Basé sur nommage_specs_v1.0.md
   */
  private parseDiscoveryName(rawName: string): ParsedTaxonomy | null {
    // Vérifier la présence du séparateur majeur '---'
    const separatorIndex = rawName.indexOf('---');
    
    let rawQuoi: string;
    let rawLieux: string;
    
    if (separatorIndex === -1) {
      // Format minimal : seulement QUOI (pas de OÙ)
      rawQuoi = rawName.trim();
      rawLieux = '';
    } else {
      rawQuoi = rawName.substring(0, separatorIndex).trim();
      rawLieux = rawName.substring(separatorIndex + 3).trim(); // +3 pour sauter '---'
    }
    
    // Normaliser le QUOI
    const slugQuoi = this.slugify(rawQuoi);
    
    // Parser les OÙ (séparés par '--')
    const lieuxSegments = rawLieux ? rawLieux.split('--').map(s => s.trim()) : [];
    const N = lieuxSegments.length;
    
    // Distribuer selon la matrice de nommage_specs_v1.0.md §3.3
    let nomPrecis: TaxonomyLevel | undefined;
    let nomLieu: TaxonomyLevel | undefined;
    let nomPere: TaxonomyLevel | undefined;
    let nomGrandPere: TaxonomyLevel | undefined;
    
    if (N === 0) {
      // Aucun OÙ, seulement QUOI
      nomLieu = undefined;
    } else if (N === 1) {
      // Un seul segment : c'est le LIEU (obligatoire)
      nomLieu = { raw: lieuxSegments[0], slug: this.slugify(lieuxSegments[0]) };
    } else if (N === 2) {
      // Deux segments : [0] = LIEU PRÉCIS, [1] = LIEU
      nomPrecis = { raw: lieuxSegments[0], slug: this.slugify(lieuxSegments[0]) };
      nomLieu = { raw: lieuxSegments[1], slug: this.slugify(lieuxSegments[1]) };
    } else if (N === 3) {
      // Trois segments : [0] = LIEU PRÉCIS, [1] = LIEU, [2] = LIEU PÈRE
      nomPrecis = { raw: lieuxSegments[0], slug: this.slugify(lieuxSegments[0]) };
      nomLieu = { raw: lieuxSegments[1], slug: this.slugify(lieuxSegments[1]) };
      nomPere = { raw: lieuxSegments[2], slug: this.slugify(lieuxSegments[2]) };
    } else if (N >= 4) {
      // Quatre segments ou plus : [0] = LIEU PRÉCIS, [1] = LIEU, [2] = LIEU PÈRE, [3] = LIEU GRAND-PÈRE
      nomPrecis = { raw: lieuxSegments[0], slug: this.slugify(lieuxSegments[0]) };
      nomLieu = { raw: lieuxSegments[1], slug: this.slugify(lieuxSegments[1]) };
      nomPere = { raw: lieuxSegments[2], slug: this.slugify(lieuxSegments[2]) };
      nomGrandPere = { raw: lieuxSegments[3], slug: this.slugify(lieuxSegments[3]) };
    }
    
    // Créer la structure de taxonomie
    const taxonomy: ParsedTaxonomy = {
      quoi: { raw: rawQuoi, slug: slugQuoi },
      ou: {
        precis: nomPrecis,
        lieu: nomLieu,  // ⭐ OBLIGATOIRE pour HA
        pere: nomPere,
        grandPere: nomGrandPere
      },
      // Générer l'Area ID pour HA
      haAreaId: nomLieu ? this.slugify(nomLieu.raw) : undefined,
      haAreaName: nomLieu?.raw,
      // Générer une entity_id suggérée
      haEntityId: nomLieu ? `${this.config.ha.objectIdPrefix}${slugQuoi}_${nomLieu.slug}` : 
                   `${this.config.ha.objectIdPrefix}${slugQuoi}`,
      // Attributs pour HA
      haAttributes: {
        attributs_taxonomie: {
          quoi: rawQuoi,
          slug_quoi: slugQuoi,
          lieu_precis: nomPrecis?.raw,
          slug_precis: nomPrecis?.slug,
          lieu_principal: nomLieu?.raw,
          slug_lieu: nomLieu?.slug,
          lieu_pere: nomPere?.raw,
          slug_pere: nomPere?.slug,
          lieu_grand_pere: nomGrandPere?.raw,
          slug_grand_pere: nomGrandPere?.slug
        }
      },
      sourceTopic: '',
      sourcePayload: {}
    };
    
    return taxonomy;
  }
  
  /**
   * Normalisation slugify (basé sur nommage_specs_v1.0.md §2.2)
   */
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD') // Décomposer les caractères accentués
      .replace(/[\u0300-\u036f]/g, '') // Supprimer les diacritiques
      .replace(/[^a-z0-9]+/g, '_') // Remplacer les non-alphanum par _
      .replace(/^_+|_+$/g, '') // Supprimer les _ en début/fin
      .replace(/_+/g, '_'); // Fusionner les _ consécutifs
  }
  
  /**
   * Générer une entity_id pour HA
   */
  private generateEntityId(parsed: ParsedTaxonomy): string {
    const prefix = this.config.ha.objectIdPrefix;
    const domain = this.config.ha.defaultDomain;
    const quoi = parsed.quoi.slug;
    const lieu = parsed.ou.lieu?.slug || 'unknown';
    
    return `${domain}.${prefix}${quoi}_${lieu}`;
  }
  
  // ==========================================================================
  // Transmission au core
  // ==========================================================================
  
  /**
   * Transmettre la structure parsée au core pour envoi à HA
   */
  private transmitToCore(discoveryMessage: DiscoveryMessage, parsed: ParsedTaxonomy): void {
    if (!this.config.ha.autoTransmit) {
      this.logger.debug('NommageService', 'Transmission automatique désactivée');
      return;
    }
    
    // Émettre un événement pour le core
    // Le core écoutera cet événement et enverra à HA
    this.eventBus.emit('nommage:transmit:to-core', {
      type: 'nommage:discovery:parsed',
      discoveryMessage,
      parsedTaxonomy: parsed,
      timestamp: new Date()
    });
    
    this.logger.debug('NommageService', 
      `Structure transmise au core pour envoi à HA`);
  }
  
  // ==========================================================================
  // Émission des événements Socket.io
  // ==========================================================================
  
  private emitStatus(): void {
    this.status = {
      ...this.status,
      connected: true,
      mqttConnected: this.mqttConnected,
      discoveryTopics: this.discoveryTopics,
      parsedMessagesCount: this.parsedCount,
      lastParsedAt: this.lastParsedAt || undefined,
      error: undefined
    };
    
    this.eventBus.emit('nommage:status', this.status);
  }
  
  private emitDiscoveryParsed(discoveryMessage: DiscoveryMessage, parsed: ParsedTaxonomy): void {
    this.eventBus.emit('nommage:discovery:parsed', {
      rawMessage: discoveryMessage,
      parsedTaxonomy: parsed,
      timestamp: new Date()
    });
  }
  
  private emitTaxonomyStructure(): void {
    this.eventBus.emit('nommage:taxonomy:structure', {
      structures: this.taxonomyStructures,
      count: this.taxonomyStructures.length,
      timestamp: new Date()
    });
  }
  
  private emitPersistentEvents(): void {
    // Émettre les événements persistants pour les nouveaux clients
    this.emitStatus();
    this.emitTaxonomyStructure();
  }
  
  // ==========================================================================
  // Gestion de la configuration
  // ==========================================================================
  
  private async saveConfig(partialConfig: Partial<NommageConfig>): Promise<void> {
    try {
      await this.configProvider.savePartialConfig(partialConfig);
      this.config = this.configProvider.getAppConfig();
      this.discoveryTopics = this.config.mqtt.discoveryTopics;
      
      // Reconfigurer le service MQTT si nécessaire
      await this.mqttService.disconnect();
      await this.mqttService.connect();
      
      this.logger.info('NommageService', 'Configuration sauvegardée et appliquée');
      
      // Notifier l'UI
      this.eventBus.emit('nommage:config:saved', {
        success: true,
        config: this.config
      });
      
    } catch (error) {
      this.logger.error('NommageService', 
        `Erreur de sauvegarde de la config: ${error}`);
      
      this.eventBus.emit('nommage:config:saved', {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  // ==========================================================================
  // Getters
  // ==========================================================================
  
  getStatus(): NommageStatus {
    return { ...this.status };
  }
  
  getTaxonomyStructures(): TaxonomyStructure[] {
    return [...this.taxonomyStructures];
  }
  
  private updateStatus(): void {
    this.status = {
      ...this.status,
      connected: true,
      mqttConnected: this.mqttConnected,
      discoveryTopics: this.discoveryTopics,
      parsedMessagesCount: this.parsedCount,
      lastParsedAt: this.lastParsedAt || undefined,
      error: undefined
    };
  }
  
  // ==========================================================================
  // Factory
  // ==========================================================================
  
  static create(
    eventBus: IEventBus,
    logger: Logger,
    configProvider: IAppConfigProvider<NommageConfig>,
    mqttService: INommageMqttIntegrationService
  ): NommageService {
    return new NommageService(eventBus, logger, configProvider, mqttService);
  }
}
