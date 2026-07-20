import { describe, it, expect, beforeEach } from 'vitest';
import { HaStructureRegistry } from '../HaStructureRegistry';
import { DefaultHaClassifier } from '../DefaultHaClassifier';
import { HaRawEntity } from '../../types/ha-entity';

describe('HaStructureRegistry', () => {
  let classifier: DefaultHaClassifier;
  let structureRegistry: HaStructureRegistry;

  const mockRawEntities: HaRawEntity[] = [
    {
      entity_id: 'light.salon_plafond',
      state: 'on',
      attributes: { friendly_name: 'Lumière Salon Plafond' },
      last_changed: '2026-01-01T10:00:00.000Z',
      last_updated: '2026-01-01T10:00:00.000Z',
      context: { id: '1', parent_id: null, user_id: null },
    },
    {
      entity_id: 'sensor.temperature_salon',
      state: '21.5',
      attributes: { friendly_name: 'Température Salon' },
      last_changed: '2026-01-01T10:00:00.000Z',
      last_updated: '2026-01-01T10:00:00.000Z',
      context: { id: '2', parent_id: null, user_id: null },
    },
    {
      entity_id: 'binary_sensor.motion_couloir',
      state: 'on',
      attributes: { friendly_name: 'Détecteur Mouvement Couloir' },
      last_changed: '2026-01-01T10:00:00.000Z',
      last_updated: '2026-01-01T10:00:00.000Z',
      context: { id: '3', parent_id: null, user_id: null },
    },
  ];

  const mockAreas = [
    { area_id: 'salon', name: 'Salon' },
    { area_id: 'couloir', name: 'Couloir' },
  ];

  const mockDevices = [
    { device_id: 'device1', name: 'Device 1', area_id: 'salon' },
    { device_id: 'device2', name: 'Device 2', area_id: 'couloir' },
  ];

  const mockEntityRegistry = [
    { entity_id: 'light.salon_plafond', domain: 'light', device_id: 'device1', area_id: 'salon' },
    { entity_id: 'sensor.temperature_salon', domain: 'sensor', device_class: 'temperature', device_id: 'device1', area_id: 'salon' },
    { entity_id: 'binary_sensor.motion_couloir', domain: 'binary_sensor', device_class: 'motion', device_id: 'device2', area_id: 'couloir' },
  ];

  beforeEach(() => {
    classifier = new DefaultHaClassifier();
    structureRegistry = new HaStructureRegistry(classifier);
  });

  describe('initialize', () => {
    it('should initialize with areas, devices, and entities', () => {
      const registry = structureRegistry.initialize(
        mockRawEntities,
        mockAreas,
        mockDevices,
        mockEntityRegistry
      );

      expect(registry.entityCount).toBe(3);
      expect(registry.areaCount).toBe(2);
      expect(registry.deviceCount).toBe(2);
      expect(registry.lastFullSync).toBeDefined();
    });

    it('should classify entities correctly', () => {
      structureRegistry.initialize(
        mockRawEntities,
        mockAreas,
        mockDevices,
        mockEntityRegistry
      );

      const salonArea = structureRegistry.getArea('salon');
      expect(salonArea).toBeDefined();
      expect(salonArea!.quoiMap.has('eclairage')).toBe(true);
      expect(salonArea!.quoiMap.has('temperature')).toBe(true);

      const couloirArea = structureRegistry.getArea('couloir');
      expect(couloirArea).toBeDefined();
      expect(couloirArea!.quoiMap.has('detecteur')).toBe(true);
    });

    it('should handle entities with device_class classification', () => {
      structureRegistry.initialize(
        mockRawEntities,
        mockAreas,
        mockDevices,
        mockEntityRegistry
      );

      const salonArea = structureRegistry.getArea('salon');
      const temperatureQuoi = salonArea?.quoiMap.get('temperature');
      expect(temperatureQuoi).toBeDefined();
      expect(temperatureQuoi?.entities.length).toBe(1);
      expect(temperatureQuoi?.entities[0].entity_id).toBe('sensor.temperature_salon');
    });

    it('should handle entities with domain classification', () => {
      structureRegistry.initialize(
        mockRawEntities,
        mockAreas,
        mockDevices,
        mockEntityRegistry
      );

      const salonArea = structureRegistry.getArea('salon');
      const eclairageQuoi = salonArea?.quoiMap.get('eclairage');
      expect(eclairageQuoi).toBeDefined();
      expect(eclairageQuoi?.entities.length).toBe(1);
      expect(eclairageQuoi?.entities[0].entity_id).toBe('light.salon_plafond');
    });
  });

  describe('getRegistry', () => {
    it('should return complete registry structure', () => {
      structureRegistry.initialize(
        mockRawEntities,
        mockAreas,
        mockDevices,
        mockEntityRegistry
      );

      const registry = structureRegistry.getRegistry();
      expect(registry.areas.size).toBe(2);
      expect(registry.devices.size).toBe(2);
      expect(registry.entityCount).toBe(3);
      expect(registry.lastFullSync).toBeDefined();
    });
  });

  describe('getEntity', () => {
    beforeEach(() => {
      structureRegistry.initialize(
        mockRawEntities,
        mockAreas,
        mockDevices,
        mockEntityRegistry
      );
    });

    it('should return structured entity by id', () => {
      const entity = structureRegistry.getEntity('light.salon_plafond');
      expect(entity).toBeDefined();
      expect(entity?.entity_id).toBe('light.salon_plafond');
      expect(entity?.domain).toBe('light');
      expect(entity?.quoi_ids).toContain('eclairage');
    });

    it('should return undefined for non-existent entity', () => {
      const entity = structureRegistry.getEntity('non.existent');
      expect(entity).toBeUndefined();
    });
  });

  describe('getAllEntities', () => {
    beforeEach(() => {
      structureRegistry.initialize(
        mockRawEntities,
        mockAreas,
        mockDevices,
        mockEntityRegistry
      );
    });

    it('should return all structured entities', () => {
      const allEntities = structureRegistry.getAllEntities();
      expect(allEntities.length).toBe(3);
    });
  });

  describe('getAreas', () => {
    beforeEach(() => {
      structureRegistry.initialize(
        mockRawEntities,
        mockAreas,
        mockDevices,
        mockEntityRegistry
      );
    });

    it('should return map of all areas', () => {
      const areas = structureRegistry.getAreas();
      expect(areas.size).toBe(2);
      expect(areas.has('salon')).toBe(true);
      expect(areas.has('couloir')).toBe(true);
    });
  });

  describe('getArea', () => {
    beforeEach(() => {
      structureRegistry.initialize(
        mockRawEntities,
        mockAreas,
        mockDevices,
        mockEntityRegistry
      );
    });

    it('should return area by id', () => {
      const area = structureRegistry.getArea('salon');
      expect(area).toBeDefined();
      expect(area?.name).toBe('Salon');
    });

    it('should return undefined for non-existent area', () => {
      const area = structureRegistry.getArea('non.existent');
      expect(area).toBeUndefined();
    });
  });

  describe('getDevices', () => {
    beforeEach(() => {
      structureRegistry.initialize(
        mockRawEntities,
        mockAreas,
        mockDevices,
        mockEntityRegistry
      );
    });

    it('should return map of all devices', () => {
      const devices = structureRegistry.getDevices();
      expect(devices.size).toBe(2);
    });
  });

  describe('getDevice', () => {
    beforeEach(() => {
      structureRegistry.initialize(
        mockRawEntities,
        mockAreas,
        mockDevices,
        mockEntityRegistry
      );
    });

    it('should return device by id', () => {
      const device = structureRegistry.getDevice('device1');
      expect(device).toBeDefined();
      expect(device?.name).toBe('Device 1');
    });

    it('should return undefined for non-existent device', () => {
      const device = structureRegistry.getDevice('non.existent');
      expect(device).toBeUndefined();
    });
  });

  describe('addArea', () => {
    it('should add new area', () => {
      const area = structureRegistry.addArea({ area_id: 'nouvelle', name: 'Nouvelle Zone' });
      expect(area).toBeDefined();
      expect(area.area_id).toBe('nouvelle');
      expect(area.name).toBe('Nouvelle Zone');
      expect(structureRegistry.getArea('nouvelle')).toBeDefined();
    });
  });

  describe('updateArea', () => {
    beforeEach(() => {
      structureRegistry.initialize(
        mockRawEntities,
        mockAreas,
        mockDevices,
        mockEntityRegistry
      );
    });

    it('should update existing area', () => {
      const updatedArea = structureRegistry.updateArea({ area_id: 'salon', name: 'Salon Principal' });
      expect(updatedArea).toBeDefined();
      expect(updatedArea?.name).toBe('Salon Principal');
    });

    it('should return undefined for non-existent area', () => {
      const updatedArea = structureRegistry.updateArea({ area_id: 'non.existent', name: 'New' });
      expect(updatedArea).toBeUndefined();
    });
  });

  describe('removeArea', () => {
    beforeEach(() => {
      structureRegistry.initialize(
        mockRawEntities,
        mockAreas,
        mockDevices,
        mockEntityRegistry
      );
    });

    it('should remove existing area', () => {
      const wasRemoved = structureRegistry.removeArea('salon');
      expect(wasRemoved).toBe(true);
      expect(structureRegistry.getArea('salon')).toBeUndefined();
    });

    it('should return false for non-existent area', () => {
      const wasRemoved = structureRegistry.removeArea('non.existent');
      expect(wasRemoved).toBe(false);
    });
  });

  describe('addDevice', () => {
    it('should add new device', () => {
      const device = structureRegistry.addDevice({
        device_id: 'device3',
        name: 'Device 3',
        area_id: 'salon',
      });
      expect(device).toBeDefined();
      expect(device.device_id).toBe('device3');
      expect(structureRegistry.getDevice('device3')).toBeDefined();
    });
  });

  describe('getQuoiCatalog', () => {
    it('should return QUI catalog from classifier', () => {
      const catalog = structureRegistry.getQuoiCatalog();
      expect(catalog.length).toBeGreaterThan(0);
      expect(catalog).toEqual(classifier.getQuoiCatalog());
    });
  });

  describe('getEntitiesByQuoi', () => {
    beforeEach(() => {
      structureRegistry.initialize(
        mockRawEntities,
        mockAreas,
        mockDevices,
        mockEntityRegistry
      );
    });

    it('should return entities by QUOI', () => {
      const eclairageEntities = structureRegistry.getEntitiesByQuoi('eclairage');
      expect(eclairageEntities.length).toBeGreaterThan(0);
      expect(eclairageEntities[0].quoi_ids).toContain('eclairage');
    });

    it('should return entities with area reference', () => {
      const temperatureEntities = structureRegistry.getEntitiesByQuoi('temperature');
      expect(temperatureEntities.length).toBeGreaterThan(0);
      expect(temperatureEntities[0].area).toBeDefined();
      expect(temperatureEntities[0].area?.area_id).toBe('salon');
    });

    it('should return entities with device reference', () => {
      const temperatureEntities = structureRegistry.getEntitiesByQuoi('temperature');
      expect(temperatureEntities.length).toBeGreaterThan(0);
      expect(temperatureEntities[0].device).toBeDefined();
      expect(temperatureEntities[0].device?.device_id).toBe('device1');
    });

    it('should return empty array for non-existent QUOI', () => {
      const entities = structureRegistry.getEntitiesByQuoi('nonexistent');
      expect(entities.length).toBe(0);
    });
  });

  describe('getEntitiesByArea', () => {
    beforeEach(() => {
      structureRegistry.initialize(
        mockRawEntities,
        mockAreas,
        mockDevices,
        mockEntityRegistry
      );
    });

    it('should return entities by area', () => {
      const salonEntities = structureRegistry.getEntitiesByArea('salon');
      expect(salonEntities.length).toBe(2); // light.salon_plafond + sensor.temperature_salon
      expect(salonEntities.every(e => e.area?.area_id === 'salon')).toBe(true);
    });

    it('should return entities with quoi_ids', () => {
      const salonEntities = structureRegistry.getEntitiesByArea('salon');
      expect(salonEntities.length).toBeGreaterThan(0);
      expect(salonEntities.every(e => e.quoi_ids.length > 0)).toBe(true);
    });

    it('should return empty array for non-existent area', () => {
      const entities = structureRegistry.getEntitiesByArea('nonexistent');
      expect(entities.length).toBe(0);
    });
  });

  describe('getEntitiesByAreaAndQuoi', () => {
    beforeEach(() => {
      structureRegistry.initialize(
        mockRawEntities,
        mockAreas,
        mockDevices,
        mockEntityRegistry
      );
    });

    it('should return entities by area and QUOI', () => {
      const entities = structureRegistry.getEntitiesByAreaAndQuoi('salon', 'eclairage');
      expect(entities.length).toBe(1);
      expect(entities[0].entity_id).toBe('light.salon_plafond');
      expect(entities[0].quoi_ids).toContain('eclairage');
      expect(entities[0].area?.area_id).toBe('salon');
    });

    it('should return empty array for non-existent area', () => {
      const entities = structureRegistry.getEntitiesByAreaAndQuoi('nonexistent', 'eclairage');
      expect(entities.length).toBe(0);
    });

    it('should return empty array for non-existent QUOI in area', () => {
      const entities = structureRegistry.getEntitiesByAreaAndQuoi('salon', 'nonexistent');
      expect(entities.length).toBe(0);
    });
  });

  describe('getLastFullSync', () => {
    it('should return null before initialization', () => {
      expect(structureRegistry.getLastFullSync()).toBeNull();
    });

    it('should return date after initialization', () => {
      structureRegistry.initialize(
        mockRawEntities,
        mockAreas,
        mockDevices,
        mockEntityRegistry
      );
      expect(structureRegistry.getLastFullSync()).toBeDefined();
    });
  });

  describe('clear', () => {
    beforeEach(() => {
      structureRegistry.initialize(
        mockRawEntities,
        mockAreas,
        mockDevices,
        mockEntityRegistry
      );
    });

    it('should clear all data', () => {
      structureRegistry.clear();
      expect(structureRegistry.getEntityCount()).toBe(0);
      expect(structureRegistry.getAreas().size).toBe(0);
      expect(structureRegistry.getDevices().size).toBe(0);
      expect(structureRegistry.getLastFullSync()).toBeNull();
    });
  });

  describe('rebuild', () => {
    it('should rebuild registry from scratch', () => {
      structureRegistry.initialize(
        mockRawEntities,
        mockAreas,
        mockDevices,
        mockEntityRegistry
      );

      const newEntities = [mockRawEntities[0]];
      const registry = structureRegistry.rebuild(
        newEntities,
        [mockAreas[0]],
        [mockDevices[0]],
        [mockEntityRegistry[0]]
      );

      expect(registry.entityCount).toBe(1);
      expect(registry.areaCount).toBe(1);
      expect(registry.deviceCount).toBe(1);
    });
  });
});
