import type { IEventBus } from '../../../core/dist/application/IEventBus';
import type { Logger } from '../../../core/dist/infrastructure/logger/index';
import type { IAppConfigProvider } from '../../../core/dist/infrastructure/config/IAppConfigProvider';
import type { HaStructuredEntity } from '../../../core/dist/ha/types/ha-entity';
import type { HaArea, HaDevice, HaQuoiDefinition } from '../../../core/dist/ha/types/ha-structure';
import type { HaStructureRegistry } from '../../../core/dist/ha/sync/HaStructureRegistry';
import type { ArbreouquoiConfig } from './config-schema';
import type { 
  OuNode, 
  OuWithQuoiNode, 
  OuFirstTree,
  QuoiFirstTree,
  QuiGroupWithOu,
  QuoiGroup,
  EntityInfo,
  QuoiCatalogWithCounts,
  FilterOptions,
  ArbreOuQuoiTreePayload 
} from './types';
import { ARBREOUQUOI_SOCKET_EVENTS } from './socket-events';

export class ArbreouquoiService {
  private refreshInterval: NodeJS.Timeout | null = null;

  constructor(
    private eventBus: IEventBus,
    private logger: Logger,
    private configService: IAppConfigProvider<ArbreouquoiConfig>,
    private haStructureRegistry: HaStructureRegistry
  ) {
    this.setupEventListeners();
  }

  // ⭐ OBLIGATOIRE : Méthode start() asynchrone
  async start(): Promise<void> {
    this.logger.info('ArbreouquoiService', 'Démarrage du service ArbreOuQui...');
    
    try {
      // Charger la configuration
      const config = this.configService.getAppConfig();
      this.logger.info('ArbreouquoiService', `Configuration chargée. Mode: ${config.display.viewMode}`);
      
      // Vérifier que le référentiel HA est disponible
      const entityCount = this.haStructureRegistry.getAllEntities().length;
      this.logger.info('ArbreouquoiService', `Référentiel HA initialisé avec ${entityCount} entités`);
      
      // Démarrer le rafraîchissement automatique si activé
      if (config.refresh.autoRefreshEnabled) {
        this.startAutoRefresh(config.refresh.autoRefreshInterval);
      }
      
      // Envoyer la structure initiale selon le mode d'affichage
      this.emitTree();
      this.emitCatalog();
      this.emitStats();
      
      // Émettre le statut
      this.emitStatus('ready', `Service démarré avec ${entityCount} entités HA, mode: ${config.display.viewMode}`);
      
      // Enregistrer les événements persistants
      this.registerPersistentEvents();
      
      this.logger.info('ArbreouquoiService', 'Service ArbreOuQui démarré avec succès');
    } catch (error) {
      this.logger.error('ArbreouquoiService', `Erreur de démarrage: ${error}`);
      this.emitStatus('error', `Erreur de démarrage: ${error}`);
      throw error;
    }
  }

  // OPTIONNEL : Méthode stop() pour un arrêt propre
  async stop(): Promise<void> {
    this.logger.info('ArbreouquoiService', 'Arrêt du service...');
    
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    
    this.emitStatus('stopped', 'Service arrêté');
    this.logger.info('ArbreouquoiService', 'Service arrêté');
  }

  private setupEventListeners(): void {
    this.eventBus.on('ha:structure:rebuilt', () => {
      this.logger.info('ArbreouquoiService', 'Référentiel HA reconstruit');
      const config = this.configService.getAppConfig();
      if (config.refresh.refreshOnHaUpdate) {
        this.emitTree();
        this.emitStats();
      }
    });

    this.eventBus.on('ha:entity:updated', () => {
      const config = this.configService.getAppConfig();
      if (config.refresh.refreshOnHaUpdate) {
        this.emitTree();
      }
    });

    this.eventBus.on(ARBREOUQUOI_SOCKET_EVENTS.TREE_GET, () => this.emitTree());
    this.eventBus.on(ARBREOUQUOI_SOCKET_EVENTS.CATALOG_GET, () => this.emitCatalog());
    this.eventBus.on(ARBREOUQUOI_SOCKET_EVENTS.REFRESH, () => {
      this.emitTree();
      this.emitCatalog();
      this.emitStats();
    });

    this.eventBus.on(ARBREOUQUOI_SOCKET_EVENTS.FILTER_SET, (data: unknown) => {
      this.emitFilteredTree(data as FilterOptions);
    });

    this.eventBus.on(ARBREOUQUOI_SOCKET_EVENTS.ENTITY_GET, (data: unknown) => {
      this.emitEntityDetails(data as string);
    });

    this.eventBus.on(ARBREOUQUOI_SOCKET_EVENTS.SEARCH, (data: unknown) => {
      this.emitSearchResults(data as string);
    });

    this.eventBus.on(ARBREOUQUOI_SOCKET_EVENTS.CONFIG_SAVE, (data: unknown) => {
      this.handleConfigSave(data as Partial<ArbreouquoiConfig>);
    });
  }

  private handleConfigSave(partialConfig: Partial<ArbreouquoiConfig>): void {
    try {
      const currentConfig = this.configService.getAppConfig();
      const newConfig = { ...currentConfig, ...partialConfig };
      
      this.configService.savePartialConfig(newConfig);
      
      if (partialConfig.refresh?.autoRefreshInterval) {
        if (this.refreshInterval) clearInterval(this.refreshInterval);
        if (newConfig.refresh.autoRefreshEnabled) {
          this.startAutoRefresh(newConfig.refresh.autoRefreshInterval);
        }
      }
      
      // Si le mode a changé, rafraîchir immédiatement
      if (partialConfig.display?.viewMode && partialConfig.display.viewMode !== currentConfig.display.viewMode) {
        this.emitTree();
      }
      
      this.eventBus.emit(ARBREOUQUOI_SOCKET_EVENTS.CONFIG_SAVE, {
        success: true,
        config: newConfig
      });
    } catch (error) {
      this.eventBus.emit(ARBREOUQUOI_SOCKET_EVENTS.ERROR, {
        message: `Erreur de sauvegarde: ${error}`
      });
    }
  }

  private registerPersistentEvents(): void {
    this.eventBus.emit('app:socket-events:registered', {
      appId: 'arbreouquoi',
      socketEvents: ARBREOUQUOI_SOCKET_EVENTS,
      persistentEvents: [
        ARBREOUQUOI_SOCKET_EVENTS.TREE_STRUCTURE,
        ARBREOUQUOI_SOCKET_EVENTS.QUOI_CATALOG,
        ARBREOUQUOI_SOCKET_EVENTS.STATS,
        ARBREOUQUOI_SOCKET_EVENTS.STATUS
      ]
    });
  }

  private startAutoRefresh(intervalMs: number): void {
    if (this.refreshInterval) clearInterval(this.refreshInterval);
    this.refreshInterval = setInterval(() => {
      try {
        this.emitTree();
        this.emitStats();
      } catch (error) {
        this.logger.error('ArbreouquoiService', `Rafraîchissement auto: ${error}`);
      }
    }, intervalMs);
  }

  private emitStatus(status: string, message: string): void {
    this.eventBus.emit(ARBREOUQUOI_SOCKET_EVENTS.STATUS, {
      status, message, timestamp: new Date().toISOString()
    });
  }

  private emitTree(): void {
    try {
      const config = this.configService.getAppConfig();
      const viewMode = config.display.viewMode || 'ou-first';
      const tree = viewMode === 'ou-first' ? this.buildOuFirstTree() : this.buildQuoiFirstTree();
      const catalog = this.buildQuoiCatalog();

      this.eventBus.emit(ARBREOUQUOI_SOCKET_EVENTS.TREE_STRUCTURE, {
        tree, viewMode, catalog, timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('ArbreouquoiService', `Erreur arbre: ${error}`);
      this.eventBus.emit(ARBREOUQUOI_SOCKET_EVENTS.ERROR, { message: String(error) });
    }
  }

  private emitCatalog(): void {
    try {
      this.eventBus.emit(ARBREOUQUOI_SOCKET_EVENTS.QUOI_CATALOG, this.buildQuoiCatalog());
    } catch (error) {
      this.logger.error('ArbreouquoiService', `Erreur catalogue: ${error}`);
    }
  }

  private emitStats(): void {
    try {
      const allEntities = this.haStructureRegistry.getAllEntities();
      const ouPaths = new Set<string>();
      for (const entity of allEntities) {
        const path = this.extractOuPathFromEntity(entity).join('/');
        if (path) ouPaths.add(path);
      }
      this.eventBus.emit(ARBREOUQUOI_SOCKET_EVENTS.STATS, {
        totalEntities: allEntities.length,
        totalOuPaths: ouPaths.size,
        unassignedEntities: allEntities.filter(e => !this.extractOuPathFromEntity(e).length).length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('ArbreouquoiService', `Erreur stats: ${error}`);
    }
  }

  private emitFilteredTree(filterOptions: FilterOptions): void {
    try {
      const config = this.configService.getAppConfig();
      const viewMode = config.display.viewMode || 'ou-first';
      const tree = viewMode === 'ou-first' 
        ? this.buildOuFirstTreeFiltered(filterOptions) 
        : this.buildQuoiFirstTreeFiltered(filterOptions);
      this.eventBus.emit(ARBREOUQUOI_SOCKET_EVENTS.TREE_STRUCTURE, {
        tree, viewMode, catalog: this.buildQuoiCatalog(), timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.eventBus.emit(ARBREOUQUOI_SOCKET_EVENTS.ERROR, { message: String(error) });
    }
  }

  // ============ BUILD OU-FIRST TREE ============

  private buildOuFirstTree(): OuFirstTree {
    const allEntities = this.haStructureRegistry.getAllEntities();
    const catalog = this.haStructureRegistry.getQuoiCatalog();
    
    const entitiesWithOu: Array<{ entity: HaStructuredEntity; ouPath: string[]; ouNames: string[] }> = [];
    
    for (const entity of allEntities) {
      const ouPath = this.extractOuPathFromEntity(entity);
      const ouNames = this.extractOuNamesFromEntity(entity);
      if (ouPath.length > 0) {
        entitiesWithOu.push({ entity, ouPath, ouNames });
      }
    }
    
    const rootOuNodes: OuNode[] = [];
    const ouNodeMap = new Map<string, OuNode>();
    
    for (const { entity, ouPath, ouNames } of entitiesWithOu) {
      let currentParent: OuNode | null = null;
      for (let i = 0; i < ouPath.length; i++) {
        const ouId = ouPath[i]!;
        const ouName = ouNames[i]!;
        const level = this.getOuLevel(i, ouPath.length);
        
        let ouNode = ouNodeMap.get(ouId);
        if (!ouNode) {
          ouNode = { id: ouId, name: ouName, level, children: [], entities: [], entityCount: 0, parentId: (currentParent as OuNode | null)?.id || null };
          ouNodeMap.set(ouId, ouNode);
          if (currentParent) currentParent.children.push(ouNode);
          else rootOuNodes.push(ouNode);
        }
        ouNode.entityCount++;
        if (i === ouPath.length - 1) ouNode.entities.push(entity);
        currentParent = ouNode;
      }
    }
    
    this.sortOuNodes(rootOuNodes);
    const levels = this.buildOuWithQuoiNodes(rootOuNodes, catalog);
    const unassigned = allEntities
      .filter(e => this.extractOuPathFromEntity(e).length === 0)
      .map(e => ({ entity: e, ouPath: [], quoiIds: e.quoi_ids, device: e.device || null, area: e.area || null }));
    
    return {
      levels,
      unassigned,
      totalEntities: allEntities.length,
      totalOuNodes: rootOuNodes.length,
      totalQuoiTypes: new Set(allEntities.flatMap(e => e.quoi_ids)).size
    };
  }

  private buildOuFirstTreeFiltered(filterOptions: FilterOptions): OuFirstTree {
    const allEntities = this.haStructureRegistry.getAllEntities();
    let filtered = filterOptions.showOnlyActive !== false 
      ? allEntities.filter(e => e.state !== 'unavailable') 
      : allEntities;
    
    const catalog = this.haStructureRegistry.getQuoiCatalog();
    const entitiesWithOu: Array<{ entity: HaStructuredEntity; ouPath: string[]; ouNames: string[] }> = [];
    
    for (const entity of filtered) {
      const ouPath = this.extractOuPathFromEntity(entity);
      const ouNames = this.extractOuNamesFromEntity(entity);
      if (ouPath.length > 0) entitiesWithOu.push({ entity, ouPath, ouNames });
    }
    
    const rootOuNodes: OuNode[] = [];
    const ouNodeMap = new Map<string, OuNode>();
    for (const { entity, ouPath, ouNames } of entitiesWithOu) {
      let currentParent: OuNode | null = null;
      for (let i = 0; i < ouPath.length; i++) {
        const ouId = ouPath[i]!;
        const ouName = ouNames[i]!;
        const level = this.getOuLevel(i, ouPath.length);
        let ouNode = ouNodeMap.get(ouId);
        if (!ouNode) {
          ouNode = { id: ouId, name: ouName, level, children: [], entities: [], entityCount: 0, parentId: (currentParent as OuNode | null)?.id || null };
          ouNodeMap.set(ouId, ouNode);
          if (currentParent) currentParent.children.push(ouNode);
          else rootOuNodes.push(ouNode);
        }
        ouNode.entityCount++;
        if (i === ouPath.length - 1) ouNode.entities.push(entity);
        currentParent = ouNode;
      }
    }
    this.sortOuNodes(rootOuNodes);
    return {
      levels: this.buildOuWithQuoiNodes(rootOuNodes, catalog),
      unassigned: [],
      totalEntities: filtered.length,
      totalOuNodes: rootOuNodes.length,
      totalQuoiTypes: new Set(filtered.flatMap(e => e.quoi_ids)).size
    };
  }

  // ============ BUILD QUOI-FIRST TREE ============

  private buildQuoiFirstTree(): QuoiFirstTree {
    const allEntities = this.haStructureRegistry.getAllEntities();
    const catalog = this.haStructureRegistry.getQuoiCatalog();
    
    const quoiGroups: QuiGroupWithOu[] = [];
    const quoiMap = new Map<string, QuiGroupWithOu>();
    
    for (const entity of allEntities) {
      for (const quoiId of entity.quoi_ids) {
        let group = quoiMap.get(quoiId);
        if (!group) {
          const quoiDef = catalog.find(q => q.quoi_id === quoiId) || { quoi_id: quoiId, label: quoiId, description: '' };
          group = { quoi: quoiDef, entityCount: 0, ouHierarchy: [], entitiesByOu: new Map() };
          quoiMap.set(quoiId, group);
          quoiGroups.push(group);
        }
        group!.entityCount++;
        const ouPath = this.extractOuPathFromEntity(entity);
        const ouNames = this.extractOuNamesFromEntity(entity);
        const ouKey = ouPath.join('/') || 'unassigned';
        if (!group!.entitiesByOu.has(ouKey)) group!.entitiesByOu.set(ouKey, []);
        group!.entitiesByOu.get(ouKey)!.push(entity);
        this.updateOuHierarchyForQuoi(group!, ouPath, ouNames);
      }
    }
    
    quoiGroups.sort((a, b) => b.entityCount - a.entityCount);
    const unassigned = allEntities
      .filter(e => this.extractOuPathFromEntity(e).length === 0)
      .map(e => ({ entity: e, ouPath: [], quoiIds: e.quoi_ids, device: e.device || null, area: e.area || null }));
    
    return {
      quoiGroups,
      unassigned,
      totalEntities: allEntities.length,
      totalQuoiTypes: quoiGroups.length,
      totalOuNodes: new Set(allEntities.flatMap(e => this.extractOuPathFromEntity(e))).size
    };
  }

  private buildQuoiFirstTreeFiltered(filterOptions: FilterOptions): QuoiFirstTree {
    const allEntities = this.haStructureRegistry.getAllEntities();
    let filtered = filterOptions.showOnlyActive !== false 
      ? allEntities.filter(e => e.state !== 'unavailable') 
      : allEntities;
    
    const catalog = this.haStructureRegistry.getQuoiCatalog();
    const quoiGroups: QuiGroupWithOu[] = [];
    const quoiMap = new Map<string, QuiGroupWithOu>();
    
    for (const entity of filtered) {
      for (const quoiId of entity.quoi_ids) {
        let group = quoiMap.get(quoiId);
        if (!group) {
          const quoiDef = catalog.find(q => q.quoi_id === quoiId) || { quoi_id: quoiId, label: quoiId, description: '' };
          group = { quoi: quoiDef, entityCount: 0, ouHierarchy: [], entitiesByOu: new Map() };
          quoiMap.set(quoiId, group);
          quoiGroups.push(group);
        }
        group!.entityCount++;
        const ouPath = this.extractOuPathFromEntity(entity);
        const ouNames = this.extractOuNamesFromEntity(entity);
        const ouKey = ouPath.join('/') || 'unassigned';
        if (!group!.entitiesByOu.has(ouKey)) group!.entitiesByOu.set(ouKey, []);
        group!.entitiesByOu.get(ouKey)!.push(entity);
      }
    }
    
    return {
      quoiGroups: quoiGroups.sort((a, b) => b.entityCount - a.entityCount),
      unassigned: [],
      totalEntities: filtered.length,
      totalQuoiTypes: quoiGroups.length,
      totalOuNodes: 0
    };
  }

  // ============ HELPERS ============

  private getOuLevel(index: number, totalLength: number): 'grand_pere' | 'pere' | 'lieu' | 'lieu_precis' {
    if (totalLength === 1) return 'lieu';
    if (totalLength === 2) return index === 0 ? 'lieu_precis' : 'lieu';
    if (totalLength === 3) {
      if (index === 0) return 'lieu_precis';
      if (index === 1) return 'lieu';
      return 'pere';
    }
    if (index === 0) return 'lieu_precis';
    if (index === 1) return 'lieu';
    if (index === 2) return 'pere';
    return 'grand_pere';
  }

  private extractOuPathFromEntity(entity: HaStructuredEntity): string[] {
    const attrs = entity.attributes as Record<string, unknown> | undefined;
    const taxonomie = attrs?.attributs_taxonomie as {
      slug_grand_pere: string | null;
      slug_pere: string | null;
      slug_lieu: string | null;
      slug_precis: string | null;
    } | undefined;
    if (!taxonomie) return [];
    const path: string[] = [];
    if (taxonomie.slug_grand_pere) path.push(taxonomie.slug_grand_pere);
    if (taxonomie.slug_pere) path.push(taxonomie.slug_pere);
    if (taxonomie.slug_lieu) path.push(taxonomie.slug_lieu);
    if (taxonomie.slug_precis) path.push(taxonomie.slug_precis);
    return path;
  }

  private extractOuNamesFromEntity(entity: HaStructuredEntity): string[] {
    const attrs = entity.attributes as Record<string, unknown> | undefined;
    const taxonomie = attrs?.attributs_taxonomie as {
      lieu_grand_pere: string | null;
      lieu_pere: string | null;
      lieu_principal: string | null;
      lieu_precis: string | null;
    } | undefined;
    if (!taxonomie) return [];
    const names: string[] = [];
    if (taxonomie.lieu_grand_pere) names.push(taxonomie.lieu_grand_pere);
    if (taxonomie.lieu_pere) names.push(taxonomie.lieu_pere);
    if (taxonomie.lieu_principal) names.push(taxonomie.lieu_principal);
    if (taxonomie.lieu_precis) names.push(taxonomie.lieu_precis);
    return names;
  }

  private sortOuNodes(nodes: OuNode[]): void {
    nodes.sort((a, b) => {
      const order: Record<string, number> = { grand_pere: 0, pere: 1, lieu: 2, lieu_precis: 3 };
      const aOrder = order[a.level] ?? 99;
      const bOrder = order[b.level] ?? 99;
      return aOrder !== bOrder ? aOrder - bOrder : a.name.localeCompare(b.name);
    });
    for (const node of nodes) this.sortOuNodes(node.children);
  }

  private buildOuWithQuoiNodes(nodes: OuNode[], catalog: HaQuoiDefinition[]): OuWithQuoiNode[] {
    return nodes.map(ouNode => {
      const quoiGroupsMap = new Map<string, HaStructuredEntity[]>();
      for (const entity of ouNode.entities) {
        for (const quoiId of entity.quoi_ids) {
          if (!quoiGroupsMap.has(quoiId)) quoiGroupsMap.set(quoiId, []);
          quoiGroupsMap.get(quoiId)!.push(entity);
        }
      }
      const quoiGroups: QuoiGroup[] = Array.from(quoiGroupsMap.entries()).map(([qi, entities]) => ({
        quoi: catalog.find(q => q.quoi_id === qi) || { quoi_id: qi, label: qi, description: '' },
        entities,
        count: entities.length
      })).sort((a, b) => b.count - a.count);
      return { ou: ouNode, children: quoiGroups, entityCount: ouNode.entityCount };
    });
  }

  private updateOuHierarchyForQuoi(group: QuiGroupWithOu, ouPath: string[], ouNames: string[]): void {
    const existingIds = new Set(group.ouHierarchy.map(n => n.id));
    if (ouPath.length === 0 || existingIds.has(ouPath[0])) return;
    
    const newNodes: OuNode[] = [];
    let parent: OuNode | null = null;
    for (let i = 0; i < ouPath.length; i++) {
      const node: OuNode = {
        id: ouPath[i],
        name: ouNames[i],
        level: this.getOuLevel(i, ouPath.length),
        children: [],
        entities: [],
        entityCount: 0,
        parentId: parent?.id || null
      };
      newNodes.push(node);
      if (parent) parent.children.push(node);
      parent = node;
    }
    group.ouHierarchy.push(...newNodes);
  }

  private buildQuoiCatalog(): QuoiCatalogWithCounts[] {
    const catalog = this.haStructureRegistry.getQuoiCatalog();
    const allEntities = this.haStructureRegistry.getAllEntities();
    return catalog.map(quoiDef => {
      const entities = allEntities.filter(e => e.quoi_ids.includes(quoiDef.quoi_id));
      const paths = new Set<string>();
      for (const e of entities) {
        const p = this.extractOuPathFromEntity(e).join('/');
        paths.add(p || 'unassigned');
      }
      return { quoi: quoiDef, entityCount: entities.length, ouPaths: Array.from(paths) };
    }).filter(i => i.entityCount > 0);
  }

  private emitEntityDetails(entityId: string): void {
    try {
      const entity = this.haStructureRegistry.getEntity(entityId);
      if (!entity) {
        this.eventBus.emit(ARBREOUQUOI_SOCKET_EVENTS.ERROR, { message: `Entité non trouvée: ${entityId}` });
        return;
      }
      const ouNames = this.extractOuNamesFromEntity(entity);
      const related = this.haStructureRegistry.getAllEntities()
        .filter(e => e.entity_id !== entityId)
        .filter(e => {
          const ePath = this.extractOuPathFromEntity(e).join('/');
          const myPath = this.extractOuPathFromEntity(entity).join('/');
          if (ePath === myPath) return true;
          return e.quoi_ids.some(q => entity.quoi_ids.includes(q));
        })
        .map(e => ({
          entity: e,
          ouPath: this.extractOuNamesFromEntity(e),
          quoiIds: e.quoi_ids,
          device: e.device || null,
          area: e.area || null
        }));
      
      this.eventBus.emit(ARBREOUQUOI_SOCKET_EVENTS.ENTITY_DETAILS, {
        entity,
        ouPath: ouNames.length > 0 ? ouNames : [entity.area?.name || 'N/A'],
        area: entity.area || null,
        device: entity.device || null,
        quiIds: entity.quoi_ids,
        relatedEntities: related
      });
    } catch (error) {
      this.eventBus.emit(ARBREOUQUOI_SOCKET_EVENTS.ERROR, { message: String(error) });
    }
  }

  private emitSearchResults(query: string): void {
    this.emitTree();
  }
}

export function createArbreouquoiService(
  eventBus: IEventBus,
  logger: Logger,
  configProvider: IAppConfigProvider<ArbreouquoiConfig>
): ArbreouquoiService {
  return new ArbreouquoiService(eventBus, logger, configProvider, configProvider as unknown as HaStructureRegistry);
}

export function createArbreouquoiServiceWithRegistry(
  eventBus: IEventBus,
  logger: Logger,
  configService: unknown,
  haStructureRegistry: HaStructureRegistry
): ArbreouquoiService {
  const configProvider = new (require('../../../../infrastructure/config/AppConfigProvider').AppConfigProvider)('arbreouquoi', configService);
  return new ArbreouquoiService(eventBus, logger, configProvider, haStructureRegistry);
}
