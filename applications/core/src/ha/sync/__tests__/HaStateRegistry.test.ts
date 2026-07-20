import { describe, it, expect, beforeEach } from 'vitest';
import { HaStateRegistry } from '../HaStateRegistry';
import { HaRawEntity } from '../../types/ha-entity';

describe('HaStateRegistry', () => {
  let registry: HaStateRegistry;

  const mockEntity1: HaRawEntity = {
    entity_id: 'light.salon',
    state: 'on',
    attributes: { friendly_name: 'Lumière Salon' },
    last_changed: '2026-01-01T10:00:00.000Z',
    last_updated: '2026-01-01T10:00:00.000Z',
    context: { id: '1', parent_id: null, user_id: null },
  };

  const mockEntity2: HaRawEntity = {
    entity_id: 'switch.interrupteur',
    state: 'off',
    attributes: { friendly_name: 'Interrupteur' },
    last_changed: '2026-01-01T11:00:00.000Z',
    last_updated: '2026-01-01T11:00:00.000Z',
    context: { id: '2', parent_id: null, user_id: null },
  };

  beforeEach(() => {
    registry = new HaStateRegistry();
  });

  describe('initialize', () => {
    it('should initialize with empty entities', () => {
      registry.initialize([]);
      expect(registry.getEntityCount()).toBe(0);
      expect(registry.getAllEntities()).toEqual([]);
    });

    it('should initialize with multiple entities', () => {
      registry.initialize([mockEntity1, mockEntity2]);
      expect(registry.getEntityCount()).toBe(2);
      expect(registry.getEntityIds()).toContain('light.salon');
      expect(registry.getEntityIds()).toContain('switch.interrupteur');
    });

    it('should replace existing entities on initialize', () => {
      registry.initialize([mockEntity1]);
      registry.initialize([mockEntity2]);
      expect(registry.getEntityCount()).toBe(1);
      expect(registry.hasEntity('light.salon')).toBe(false);
      expect(registry.hasEntity('switch.interrupteur')).toBe(true);
    });
  });

  describe('addEntity', () => {
    it('should add a new entity', () => {
      registry.addEntity(mockEntity1);
      expect(registry.hasEntity('light.salon')).toBe(true);
      expect(registry.getEntity('light.salon')).toEqual(mockEntity1);
    });

    it('should not add duplicate entity', () => {
      registry.addEntity(mockEntity1);
      registry.addEntity(mockEntity1);
      expect(registry.getEntityCount()).toBe(1);
    });
  });

  describe('updateEntity', () => {
    beforeEach(() => {
      registry.initialize([mockEntity1]);
    });

    it('should update existing entity state', () => {
      const updatedEntity: HaRawEntity = {
        ...mockEntity1,
        state: 'off',
        last_updated: '2026-01-01T12:00:00.000Z',
      };

      const wasUpdated = registry.updateEntity(updatedEntity);
      expect(wasUpdated).toBe(true);
      expect(registry.getEntity('light.salon')?.state).toBe('off');
    });

    it('should return false if state unchanged', () => {
      const wasUpdated = registry.updateEntity(mockEntity1);
      expect(wasUpdated).toBe(false);
    });

    it('should add new entity if not exists', () => {
      const wasUpdated = registry.updateEntity(mockEntity2);
      expect(wasUpdated).toBe(true);
      expect(registry.getEntityCount()).toBe(2);
    });
  });

  describe('removeEntity', () => {
    beforeEach(() => {
      registry.initialize([mockEntity1, mockEntity2]);
    });

    it('should remove existing entity', () => {
      const wasRemoved = registry.removeEntity('light.salon');
      expect(wasRemoved).toBe(true);
      expect(registry.hasEntity('light.salon')).toBe(false);
      expect(registry.getEntityCount()).toBe(1);
    });

    it('should return false for non-existent entity', () => {
      const wasRemoved = registry.removeEntity('non.existent');
      expect(wasRemoved).toBe(false);
    });
  });

  describe('getEntity', () => {
    beforeEach(() => {
      registry.initialize([mockEntity1, mockEntity2]);
    });

    it('should return entity by id', () => {
      const entity = registry.getEntity('light.salon');
      expect(entity).toEqual(mockEntity1);
    });

    it('should return undefined for non-existent entity', () => {
      const entity = registry.getEntity('non.existent');
      expect(entity).toBeUndefined();
    });
  });

  describe('getEntitiesByDomain', () => {
    beforeEach(() => {
      registry.initialize([mockEntity1, mockEntity2]);
    });

    it('should filter entities by domain', () => {
      const lightEntities = registry.getEntitiesByDomain('light');
      expect(lightEntities.length).toBe(1);
      expect(lightEntities[0].entity_id).toBe('light.salon');
    });

    it('should return empty array for non-existent domain', () => {
      const climateEntities = registry.getEntitiesByDomain('climate');
      expect(climateEntities.length).toBe(0);
    });
  });

  describe('getEntitiesByState', () => {
    beforeEach(() => {
      registry.initialize([mockEntity1, mockEntity2]);
    });

    it('should filter entities by state', () => {
      const onEntities = registry.getEntitiesByState('on');
      expect(onEntities.length).toBe(1);
      expect(onEntities[0].entity_id).toBe('light.salon');
    });

    it('should return empty array for non-existent state', () => {
      const unknownEntities = registry.getEntitiesByState('unknown');
      expect(unknownEntities.length).toBe(0);
    });
  });

  describe('getLastUpdated', () => {
    it('should return undefined for empty registry', () => {
      const lastUpdated = registry.getLastUpdated();
      expect(lastUpdated).toBeUndefined();
    });

    it('should return latest timestamp from entities', () => {
      registry.initialize([mockEntity1, mockEntity2]);
      const lastUpdated = registry.getLastUpdated();
      expect(lastUpdated).toBeDefined();
      expect(lastUpdated!.getTime()).toBeGreaterThanOrEqual(new Date('2026-01-01T11:00:00.000Z').getTime());
    });
  });

  describe('clear', () => {
    beforeEach(() => {
      registry.initialize([mockEntity1, mockEntity2]);
    });

    it('should clear all entities', () => {
      registry.clear();
      expect(registry.getEntityCount()).toBe(0);
      expect(registry.getAllEntities()).toEqual([]);
    });
  });

  describe('hasEntity', () => {
    beforeEach(() => {
      registry.initialize([mockEntity1]);
    });

    it('should return true for existing entity', () => {
      expect(registry.hasEntity('light.salon')).toBe(true);
    });

    it('should return false for non-existent entity', () => {
      expect(registry.hasEntity('non.existent')).toBe(false);
    });
  });

  describe('getEntityIds', () => {
    beforeEach(() => {
      registry.initialize([mockEntity1, mockEntity2]);
    });

    it('should return array of all entity ids', () => {
      const ids = registry.getEntityIds();
      expect(ids).toContain('light.salon');
      expect(ids).toContain('switch.interrupteur');
      expect(ids.length).toBe(2);
    });
  });
});
