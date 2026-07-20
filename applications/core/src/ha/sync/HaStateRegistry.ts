import { HaRawEntity } from '../types/ha-entity';
import { Logger } from '../../infrastructure/logger/index';

// =============================================================================
// HaStateRegistry - Registre des états bruts des entités HA
// 
// Ce registre stocke les états bruts tels que reçus via WebSocket HA.
// Il est utilisé comme source de vérité pour la synchronisation.
// =============================================================================

/**
 * Registre des états bruts des entités HA.
 * Stocke toutes les entités avec leur état actuel.
 */
export class HaStateRegistry {
  private entities: Map<string, HaRawEntity> = new Map();
  private logger: Logger;

  /**
   * @param logger - Logger pour les logs (optionnel)
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
   * Initialise le registre avec un tableau d'entités.
   * Remplace complètement le contenu actuel.
   * 
   * @param rawEntities - Tableau d'entités brutes depuis HA
   */
  initialize(rawEntities: HaRawEntity[]): void {
    this.entities.clear();
    
    for (const entity of rawEntities) {
      this.entities.set(entity.entity_id, entity);
    }
    
    this.logger.info('ha:state_registry', `Registre initialisé avec ${rawEntities.length} entités`);
  }

  /**
   * Met à jour l'état d'une entité.
   * Si l'entité n'existe pas, elle est ajoutée.
   * 
   * @param entity - Entité avec son nouvel état
   * @returns true si l'entité a été mise à jour, false si elle était déjà dans le même état
   */
  updateEntity(entity: HaRawEntity): boolean {
    const existing = this.entities.get(entity.entity_id);
    
    if (existing && existing.state === entity.state) {
      // État inchangé, pas de mise à jour nécessaire
      return false;
    }
    
    this.entities.set(entity.entity_id, entity);
    this.logger.debug('ha:state_registry', `Entité mise à jour: ${entity.entity_id} (state: ${entity.state})`);
    
    return true;
  }

  /**
   * Ajoute une nouvelle entité au registre.
   * 
   * @param entity - Nouvelle entité à ajouter
   */
  addEntity(entity: HaRawEntity): void {
    if (!this.entities.has(entity.entity_id)) {
      this.entities.set(entity.entity_id, entity);
      this.logger.debug('ha:state_registry', `Nouvelle entité ajoutée: ${entity.entity_id}`);
    }
  }

  /**
   * Supprime une entité du registre.
   * 
   * @param entityId - ID de l'entité à supprimer
   * @returns true si l'entité a été supprimée, false si elle n'existait pas
   */
  removeEntity(entityId: string): boolean {
    const existed = this.entities.has(entityId);
    this.entities.delete(entityId);
    
    if (existed) {
      this.logger.debug('ha:state_registry', `Entité supprimée: ${entityId}`);
    }
    
    return existed;
  }

  /**
   * Récupère une entité par son ID.
   * 
   * @param entityId - ID de l'entité
   * @returns L'entité ou undefined si non trouvée
   */
  getEntity(entityId: string): HaRawEntity | undefined {
    return this.entities.get(entityId);
  }

  /**
   * Récupère toutes les entités.
   * 
   * @returns Tableau de toutes les entités
   */
  getAllEntities(): HaRawEntity[] {
    return Array.from(this.entities.values());
  }

  /**
   * Récupère toutes les IDs d'entités.
   * 
   * @returns Tableau des IDs d'entités
   */
  getEntityIds(): string[] {
    return Array.from(this.entities.keys());
  }

  /**
   * Récupère le nombre d'entités dans le registre.
   */
  getEntityCount(): number {
    return this.entities.size;
  }

  /**
   * Vérifie si une entité existe dans le registre.
   * 
   * @param entityId - ID de l'entité
   * @returns true si l'entité existe
   */
  hasEntity(entityId: string): boolean {
    return this.entities.has(entityId);
  }

  /**
   * Filtre les entités par domaine.
   * 
   * @param domain - Domaine à filtrer (ex: 'light', 'switch', 'sensor')
   * @returns Tableau d'entités du domaine spécifié
   */
  getEntitiesByDomain(domain: string): HaRawEntity[] {
    return Array.from(this.entities.values())
      .filter(entity => entity.entity_id.startsWith(`${domain}.`));
  }

  /**
   * Filtre les entités par état.
   * 
   * @param state - État à filtrer (ex: 'on', 'off')
   * @returns Tableau d'entités dans l'état spécifié
   */
  getEntitiesByState(state: string): HaRawEntity[] {
    return Array.from(this.entities.values())
      .filter(entity => entity.state === state);
  }

  /**
   * Récupère le timestamp de la dernière mise à jour du registre.
   * 
   * @returns Date de la dernière mise à jour ou undefined si vide
   */
  getLastUpdated(): Date | undefined {
    if (this.entities.size === 0) {
      return undefined;
    }
    
    const allEntities = this.getAllEntities();
    const timestamps = allEntities
      .map(e => new Date(e.last_updated).getTime())
      .filter(t => !isNaN(t));
    
    if (timestamps.length === 0) {
      return undefined;
    }
    
    const maxTimestamp = Math.max(...timestamps);
    return new Date(maxTimestamp);
  }

  /**
   * Efface toutes les entités du registre.
   */
  clear(): void {
    this.entities.clear();
    this.logger.info('ha:state_registry', 'Registre vidé');
  }
}
