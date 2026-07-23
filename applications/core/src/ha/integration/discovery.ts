// =============================================================================
// discovery.ts — Construction et publication du message de découverte HA
//
// Conforme à techniques-socle-ha-mqtt_specs v4.9 §8.5.0 : le module métier ne fournit
// que les données ESSENTIELLES d'une entité ; cette brique complète et normalise
// l'intégralité du message de découverte (topics, bloc device, defaults).
// =============================================================================

import type { MqttTransport } from '../../infrastructure/transport/MqttTransport';
import type { HaMqttDevice, HaMqttDiscoveryEntity } from './types/ha-mqtt';
import { getDiscoveryTopic, getStateTopic, getCommandTopic } from './types/ha-mqtt';

/**
 * Données essentielles qu'un module métier doit fournir pour une entité.
 * Tout le reste (topics, bloc device par défaut, etc.) est complété par cette brique.
 */
export interface EssentialEntityData {
  name: string;
  deviceClass?: string;
  unitOfMeasurement?: string;
  icon?: string;
  payloadOn?: string;
  payloadOff?: string;
  valueTemplate?: string;
  device?: HaMqttDevice;
  /** Si absent, publication en lecture seule (pas de command_topic). */
  commandEnabled?: boolean;
  /**
   * Champs de découverte additionnels reconnus par HA, fusionnés tels quels (ex: state_class,
   * entity_category). ⚠️ Ne PAS y glisser des attributs libres arbitraires (ex: taxonomie) : HA
   * valide le message de découverte contre un schéma strict par plateforme et ignore
   * silencieusement toute clé non reconnue — vérifié en direct sur une instance HA réelle,
   * confirmé par un test de bout en bout (aucun des champs "extra" custom n'atteignait jamais
   * entity.attributes). Pour des attributs libres, les porter dans HaMqttStateMessage.attributes
   * (publishState) — json_attributes_topic/json_attributes_template (ci-dessous) les récupère
   * automatiquement depuis là.
   */
  extra?: Record<string, unknown>;
}

/**
 * Contexte de routage nécessaire pour construire les topics.
 */
export interface DiscoveryContext {
  moduleName: string;
  bridgeInstance: string;
  /** Identifiant opaque utilisé pour les topics état/commande — peut différer de objectId. */
  deviceId: string;
  /** Composant HA (sensor, switch, binary_sensor, ...). */
  component: string;
  /** object_id HA — utilisé dans le topic de découverte et comme unique_id par défaut. */
  objectId: string;
}

/**
 * Construit le message de découverte HA complet à partir des données essentielles
 * fournies par un module métier.
 */
export function buildDiscoveryPayload(
  essential: EssentialEntityData,
  context: DiscoveryContext
): HaMqttDiscoveryEntity {
  const stateTopic = getStateTopic(context.moduleName, context.bridgeInstance, context.deviceId);

  const entity: HaMqttDiscoveryEntity = {
    name: essential.name,
    unique_id: context.objectId,
    state_topic: stateTopic,
    device_class: essential.deviceClass,
    unit_of_measurement: essential.unitOfMeasurement,
    icon: essential.icon,
    payload_on: essential.payloadOn,
    payload_off: essential.payloadOff,
    value_template: essential.valueTemplate,
    device: essential.device,
    retain: true,
    qos: 1,
    // Le topic d'état publie déjà { state, attributes } en JSON (stateCommand.ts::publishState) —
    // réutilisé tel quel pour les attributs libres de l'entité (ex: attributs_taxonomie), sans
    // topic supplémentaire. Validé en direct sur une instance HA réelle.
    json_attributes_topic: stateTopic,
    json_attributes_template: '{{ value_json.attributes | tojson }}',
  };

  if (essential.commandEnabled) {
    entity.command_topic = getCommandTopic(context.moduleName, context.bridgeInstance, context.deviceId);
  }

  return essential.extra ? ({ ...entity, ...essential.extra } as HaMqttDiscoveryEntity) : entity;
}

/**
 * Publie un message de découverte sur le topic HA standard.
 */
export function publishDiscovery(
  transport: MqttTransport,
  component: string,
  objectId: string,
  entity: HaMqttDiscoveryEntity,
  qos: 0 | 1 = 1,
  retain: boolean = true
): void {
  transport.publish(getDiscoveryTopic(component, objectId), JSON.stringify(entity), qos, retain);
}
