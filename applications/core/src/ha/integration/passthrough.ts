// =============================================================================
// passthrough.ts — Passthrough MQTT (techniques-socle-ha-mqtt_specs v4.9 §8.5.6)
//
// Pour les applications qui relaient un message MQTT déjà formé (lu depuis une
// source tierce, ex: nommage relayant Zigbee2MQTT) vers le broker HA unique,
// sans passer par la normalisation de découverte (discovery.ts).
// =============================================================================

import type { MqttTransport } from '../../infrastructure/transport/MqttTransport';
import { rewriteToHomeAssistantPrefix } from './types/ha-mqtt';

/**
 * Mode "découverte" : remplace le premier segment de `sourceTopic` par `homeassistant`
 * puis publie (QoS 1, retain true — règles standard de découverte).
 */
export function publishDiscoveryPassthrough(
  transport: MqttTransport,
  sourceTopic: string,
  payload: unknown
): void {
  const targetTopic = rewriteToHomeAssistantPrefix(sourceTopic);
  transport.publish(targetTopic, JSON.stringify(payload), 1, true);
}

/**
 * Mode "complet" : publication telle quelle, aucune transformation.
 */
export function publishPassthrough(
  transport: MqttTransport,
  topic: string,
  payload: unknown,
  qos: 0 | 1 = 1,
  retain: boolean = false
): void {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  transport.publish(topic, body, qos, retain);
}
