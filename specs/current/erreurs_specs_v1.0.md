# Spécifications Techniques — Codes d'Erreur et États
**Module Complémentaire aux Spécifications Socle HA/MQTT et RFXCOM**

**Version :** 1.0  
**Date :** 11 Juillet 2026  
**Statut :** Document de référence pour la gestion standardisée des erreurs  
**Conformité :** Intègre les besoins des modules `HaCommandService`, `HaWsClient`, `HaMqttIntegrationService` et `RfxComService`  

---

## 📌 Table des Matières
1. [Contexte et Objectifs](#1-contexte-et-objectifs)
2. [Principe Général](#2-principe-général)
3. [Codes d'Erreur HA WebSocket](#3-codes-derreur-ha-websocket)
4. [Codes d'Erreur MQTT](#4-codes-derreur-mqtt)
5. [Codes d'Erreur RFXCOM](#5-codes-derreur-rfxcom)
6. [Codes d'Erreur Génériques](#6-codes-derreur-génériques)
7. [États des Commandes](#7-états-des-commandes)
8. [États de Connexion](#8-états-de-connexion)
9. [Format des Messages d'Erreur](#9-format-des-messages-d'erreur)
10. [Intégration avec EventBus](#10-intégration-avec-eventbus)
11. [Exemples Concrets](#11-exemples-concrets)
12. [Annexes](#12-annexes)

---

## 1. Contexte et Objectifs

### 1.1 Pourquoi ce Document ?
Ce document **standardise** les codes d'erreur et les états pour toutes les applications du projet HA/MQTT.
**Problème résolu** :
- Chaque module (HA WS, MQTT, RFXCOM) avait ses propres codes d'erreur **non documentés** ou **incohérents**. 
- Impossible de **debugger** efficacement sans connaître la signification des erreurs.
- **Manque de traçabilité** pour les logs et les interfaces utilisateur.

### 1.2 Périmètre
| Inclus | Exclus |
|--------|--------|
| Codes d'erreur HA WebSocket | Implémentation des handlers d'erreur |
| Codes d'erreur MQTT | Gestion des exceptions non capturées |
| Codes d'erreur RFXCOM | Messages d'erreur personnalisés par application |
| États des commandes | Logique métier des commandes |
| États de connexion | Protocoles bas niveau (WS, MQTT) |
| Format des messages d'erreur | Affichage UI (Alpine.js) |

### 1.3 Public Cible
- Développeurs implémentant les services HA/MQTT/RFXCOM
- Intégrateurs Home Assistant
- Mainteneurs du socle technique
- Outils de monitoring (pour le parsing des logs)

### 1.4 Conformité
Ce document **respecte strictement** :
- [`specs-techniques-socle-ha-mqtt-v4.3.md`](specs-techniques-socle-ha-mqtt-v4.3.md) (architecture 5 couches)
- [`specs-fonctionnelles-rfxcom-v5.0.md`](specs-fonctionnelles-rfxcom-v5.0.md) (spécifications RFXCOM)
- [`specs-recepteurs-emetteurs-rfxcom-v5.0.md`](specs-recepteurs-emetteurs-rfxcom-v5.0.md) (intégration MQTT)

---

## 2. Principe Général

### 2.1 Structure d'un Code d'Erreur
Tout code d'erreur suit le format :
```
<DOMAINE>_<CATÉGORIE>_<CODE>
```
- **DOMAINE** : `HA` (Home Assistant), `MQTT`, `RFXCOM`, `APP` (générique)
- **CATÉGORIE** : `CONNECTION`, `AUTH`, `COMMAND`, `VALIDATION`, `HARDWARE`, `TIMEOUT`
- **CODE** : Identifiant unique (2-4 lettres, uppercase)

**Exemple** : `HA_CONNECTION_LOST`, `RFXCOM_HARDWARE_UNAVAILABLE`

### 2.2 Niveaux de Sévérité
| Niveau | Couleur (Logs) | Description | Action Attendue |
|--------|----------------|-------------|-----------------|
| `ERROR` | 🔴 | Erreur bloquante ou critique | **Redémarrage** ou intervention manuelle |
| `WARN` | 🟡 | Erreur non bloquante mais anormale | Surveillance, investigation |
| `INFO` | 🔵 | État normal ou transition | Aucun |
| `DEBUG` | ⚪ | Détail pour le debug | Aucun (désactivé en production) |

### 2.3 Règle d'Or
> **Toute erreur émise vers EventBus ou Socket.io DOIT avoir un code documenté dans ce fichier.**
> **Toute erreur loggée DOIT inclure son code et sa sévérité.**

---

## 3. Codes d'Erreur HA WebSocket

### 3.1 Erreurs de Connexion
| Code | Message | Cause | Sévérité | Action Recommandée | Événement EventBus | Événement Socket.io |
|------|---------|-------|-----------|-------------------|-------------------|-------------------|
| `HA_CONNECTION_LOST` | "Connection to Home Assistant lost" | Déconnexion WebSocket non planifiée | ERROR | Reconnecter automatiquement (backoff exponentiel) | `ha:disconnected` | `ha:status` (`{ connected: false }`) |
| `HA_CONNECTION_TIMEOUT` | "Connection timeout after {delay}s" | Délai de connexion dépassé | ERROR | Relancer la connexion avec un delay augmentée | `ha:disconnected` | `app:log` |
| `HA_CONNECTION_REFUSED` | "Connection refused by Home Assistant" | Port ou service non disponible | ERROR | Vérifier `ha.ws.host` et `ha.ws.port` | `ha:disconnected` | `app:log` |

### 3.2 Erreurs d'Authentification
| Code | Message | Cause | Sévérité | Action Recommandée | Événement EventBus | Événement Socket.io |
|------|---------|-------|-----------|-------------------|-------------------|-------------------|
| `HA_AUTH_FAILED` | "Authentication failed: invalid token" | Token HA invalide ou expiré | ERROR | Vérifier `ha.ws.token` dans `.env` | - | `app:log` |
| `HA_AUTH_REJECTED` | "Authentication rejected by Home Assistant" | Token rejeté par HA (ex: permissions insuffisantes) | ERROR | Générer un nouveau token (Long-Lived Access Token) | - | `app:log` |
| `HA_TOKEN_MISSING` | "Long-Lived Access Token is missing" | `ha.ws.token` non configuré | ERROR | Ajouter `HA_TOKEN` dans `.env` | - | - |

### 3.3 Erreurs de Synchronisation
| Code | Message | Cause | Sévérité | Action Recommandée | Événement EventBus | Événement Socket.io |
|------|---------|-------|-----------|-------------------|-------------------|-------------------|
| `HA_SYNC_FAILED` | "Failed to synchronize HA registry" | Échec du chargement initial (get_states, areas, devices) | ERROR | Vérifier la connexion HA et relancer | `ha:disconnected` | `app:status` |
| `HA_SYNC_PARTIAL` | "Partial HA registry synchronization" | Certaines données manquantes (ex: entities mais pas areas) | WARN | Continuer avec les données disponibles | `ha:ready` (avec `partial: true`) | `app:log` |
| `HA_ENTITY_NOT_FOUND` | "Entity {entityId} not found in HA" | Entité supprimée ou inexistante | WARN | Mettre à jour la configuration ou ignorer | `ha:entity:removed` | `app:log` |

### 3.4 Erreurs de Commandes
| Code | Message | Cause | Sévérité | Action Recommandée | Événement EventBus | Événement Socket.io |
|------|---------|-------|-----------|-------------------|-------------------|-------------------|
| `HA_SERVICE_NOT_AVAILABLE` | "Service {domain}.{service} not available" | Service HA non supporté | ERROR | Vérifier le domain/service dans HA | `ha:command:result` (`success: false`) | `ha:command:result` |
| `HA_SERVICE_INVALID` | "Invalid service call: {reason}" | Paramètres de service invalides | ERROR | Corriger les `service_data` | `ha:command:result` | `ha:command:result` |
| `HA_ENTITY_UNAUTHORIZED` | "Unauthorized to control {entityId}" | Permissions insuffisantes | ERROR | Vérifier les ACL dans HA | `ha:command:result` | `ha:command:result` |

---

## 4. Codes d'Erreur MQTT

### 4.1 Erreurs de Connexion MQTT
| Code | Message | Cause | Sévérité | Action Recommandée | Événement EventBus | Événement Socket.io |
|------|---------|-------|-----------|-------------------|-------------------|-------------------|
| `MQTT_CONNECTION_LOST` | "MQTT connection lost" | Déconnexion non planifiée | ERROR | Reconnecter automatiquement (backoff) | `ha:integration:disconnected` | `mqtt:disconnected` |
| `MQTT_CONNECTION_TIMEOUT` | "MQTT connection timeout" | Délai de connexion dépassé | ERROR | Relancer avec un delay augmentée | - | `app:log` |
| `MQTT_CONNECTION_REFUSED` | "MQTT connection refused" | Broker MQTT inaccessible | ERROR | Vérifier `ha.mqtt.host` et `ha.mqtt.port` | - | `app:log` |
| `MQTT_AUTH_FAILED` | "MQTT authentication failed" | Identifiants MQTT invalides | ERROR | Vérifier `ha.mqtt.username` et `ha.mqtt.password` | - | `app:log` |

### 4.2 Erreurs de Publication MQTT
| Code | Message | Cause | Sévérité | Action Recommandée | Événement EventBus | Événement Socket.io |
|------|---------|-------|-----------|-------------------|-------------------|-------------------|
| `MQTT_PUBLISH_FAILED` | "Failed to publish MQTT message to {topic}" | Erreur réseau ou permissions | ERROR | Relancer la publication | `ha:integration:error` | `app:log` |
| `MQTT_RETAINED_ERROR` | "Failed to set retained flag for {topic}" | Broker MQTT ne supporte pas retained | WARN | Continuer sans retained | - | `app:log` |
| `MQTT_QOS_UNSUPPORTED` | "QoS {qos} not supported for {topic}" | Broker ne supporte pas le QoS demandé | WARN | Utiliser QoS 0 ou 1 | - | `app:log` |

### 4.3 Erreurs d'Abonnement MQTT
| Code | Message | Cause | Sévérité | Action Recommandée | Événement EventBus | Événement Socket.io |
|------|---------|-------|-----------|-------------------|-------------------|-------------------|
| `MQTT_SUBSCRIBE_FAILED` | "Failed to subscribe to {topic}" | Erreur réseau ou topic invalide | ERROR | Relancer l'abonnement | - | `app:log` |
| `MQTT_UNSUBSCRIBE_FAILED` | "Failed to unsubscribe from {topic}" | Erreur réseau | ERROR | Ignorer (non critique) | - | `app:log` |

---

## 5. Codes d'Erreur RFXCOM

### 5.1 Erreurs Matérielles (Transceiver)
| Code | Message | Cause | Sévérité | Action Recommandée | Événement EventBus | Événement Socket.io |
|------|---------|-------|-----------|-------------------|-------------------|-------------------|
| `RFXCOM_TRANSCEIVER_UNAVAILABLE` | "RFXCOM transceiver not available" | Port série non accessible ou device non détecté | ERROR | Vérifier `/dev/ttyUSB0` ou `ha.rfxcom.serialPort` | `rfxcom:error` | `app:log` |
| `RFXCOM_PORT_PERMISSION_DENIED` | "Permission denied on serial port" | Droits insuffisants sur le port série | ERROR | `sudo usermod -aG dialout <user>` (Docker) | `rfxcom:error` | `app:log` |
| `RFXCOM_PORT_NOT_FOUND` | "Serial port {port} not found" | Port série inexistant | ERROR | Vérifier le port dans la config RFXCOM | `rfxcom:error` | `app:log` |
| `RFXCOM_BAUDRATE_INVALID` | "Invalid baudrate: {baudrate}" | Baudrate non supporté | ERROR | Utiliser 38400 (par défaut) | `rfxcom:error` | `app:log` |

### 5.2 Erreurs de Détection
| Code | Message | Cause | Sévérité | Action Recommandée | Événement EventBus | Événement Socket.io |
|------|---------|-------|-----------|-------------------|-------------------|-------------------|
| `RFXCOM_SCAN_FAILED` | "RFXCOM scan failed: {reason}" | Erreur pendant le scan RF433 | ERROR | Relancer le scan manuellement | `rfxcom:scan:failed` | `app:log` |
| `RFXCOM_SCAN_TIMEOUT` | "RFXCOM scan timeout after {duration}ms" | Aucun device détecté dans le délai | WARN | Augmenter `scanDuration` ou vérifier le transceiver | `rfxcom:scan:timeout` | `app:log` |

### 5.3 Erreurs d'Association
| Code | Message | Cause | Sévérité | Action Recommandée | Événement EventBus | Événement Socket.io |
|------|---------|-------|-----------|-------------------|-------------------|-------------------|
| `RFXCOM_EMITTER_NOT_PAIRABLE` | "Emitter {emitterId} cannot pair with receiver {receiverId}" | Protocoles incompatibles (ex: Lighting1 ↔ Lighting4) | ERROR | Vérifier `type` et `subType` des devices | `rfxcom:association:error` | `app:log` |
| `RFXCOM_RECEIVER_NOT_FOUND` | "Receiver {receiverId} not found" | Récepteur non configuré | ERROR | Ajouter le récepteur dans `config-rfxcom-devices-v1.0.yaml` | `rfxcom:association:error` | `app:log` |
| `RFXCOM_EMITTER_NOT_FOUND` | "Emitter {emitterId} not found" | Émetteur non détecté | ERROR | Vérifier la détection des devices | `rfxcom:association:error` | `app:log` |

### 5.4 Erreurs de Commandes RFXCOM
| Code | Message | Cause | Sévérité | Action Recommandée | Événement EventBus | Événement Socket.io |
|------|---------|-------|-----------|-------------------|-------------------|-------------------|
| `RFXCOM_INVALID_BRIGHTNESS` | "Brightness must be between 0 and 255" | Valeur de luminosité invalide | ERROR | Corriger `service_data.brightness` | `rfxcom:command:error` | `app:log` |
| `RFXCOM_COMMAND_FAILED` | "Command {command} failed for {deviceId}: {reason}" | Échec de l'envoi RF433 | ERROR | Vérifier le transceiver et relancer | `rfxcom:command:failed` | `app:log` |
| `RFXCOM_UNSUPPORTED_ACTION` | "Action {action} not supported for {deviceType}" | Action non implémentée | ERROR | Vérifier la documentation RFXCOM | `rfxcom:command:error` | `app:log` |

---

## 6. Codes d'Erreur Génériques

### 6.1 Erreurs de Configuration
| Code | Message | Cause | Sévérité | Action Recommandée | Événement EventBus | Événement Socket.io |
|------|---------|-------|-----------|-------------------|-------------------|-------------------|
| `APP_CONFIG_INVALID` | "Configuration is invalid: {errors}" | Schéma Zod non respecté | ERROR | Corriger `data/config.yaml` | - | `config:saved` (`success: false`) |
| `APP_CONFIG_MISSING` | "Configuration file not found" | `data/config.yaml` absent | ERROR | Créer le fichier depuis `.env.example` | - | `app:log` |
| `APP_CONFIG_REQUIRED_FIELD_MISSING` | "Required field {field} is missing" | Champ obligatoire non renseigné | ERROR | Remplir le champ manquant | - | `config:saved` (`success: false`) |

### 6.2 Erreurs de Validation
| Code | Message | Cause | Sévérité | Action Recommandée | Événement EventBus | Événement Socket.io |
|------|---------|-------|-----------|-------------------|-------------------|-------------------|
| `APP_VALIDATION_FAILED` | "Validation failed for {section}: {errors}" | Données invalides (ex: IP, port) | ERROR | Corriger les valeurs | - | `app:log` |
| `APP_VALUE_OUT_OF_RANGE` | "Value {value} is out of range [{min}, {max}]" | Valeur hors plage | ERROR | Utiliser une valeur dans la plage | - | `app:log` |

---

## 7. États des Commandes

### 7.1 États Standard pour `HaCommandService`
| État | Description | Transition Vers | Événement EventBus | Événement Socket.io |
|------|-------------|-----------------|-------------------|-------------------|
| `pending` | Commande en attente d'exécution | `executing` ou `error` | `ha:command:status` | - |
| `executing` | Commande en cours d'envoi à HA | `success`, `error`, ou `timeout` | `ha:command:status` | - |
| `success` | Commande exécutée avec succès | - | `ha:command:result` | `ha:command:result` |
| `error` | Erreur lors de l'exécution | - | `ha:command:result` | `ha:command:result` |
| `timeout` | Délai d'exécution dépassé | - | `ha:command:result` | `ha:command:result` |
| `cancelled` | Commande annulée manuellement | - | `ha:command:result` | `ha:command:result` |

### 7.2 États des Commandes RFXCOM
| État | Description | Transition Vers | Événement EventBus | Événement Socket.io |
|------|-------------|-----------------|-------------------|-------------------|
| `rfxcom_pending` | Commande RF433 en attente | `rfxcom_executing` ou `rfxcom_error` | `rfxcom:command:status` | - |
| `rfxcom_executing` | Commande RF433 en cours d'envoi | `rfxcom_success` ou `rfxcom_failed` | `rfxcom:command:status` | - |
| `rfxcom_success` | Commande RF433 envoyée avec succès | - | `rfxcom:command:result` | `rfxcom:command:result` |
| `rfxcom_failed` | Échec de l'envoi RF433 | - | `rfxcom:command:result` | `rfxcom:command:result` |

---

## 8. États de Connexion

### 8.1 États HA WebSocket
| État | Description | Événement EventBus | Événement Socket.io |
|------|-------------|-------------------|-------------------|
| `ha_connected` | Connexion WS HA établie et authentifiée | `ha:connected` | `ha:status` (`{ connected: true }`) |
| `ha_disconnected` | Connexion WS HA perdue | `ha:disconnected` | `ha:status` (`{ connected: false }`) |
| `ha_reconnecting` | Tentative de reconnexion en cours | - | `app:log` |
| `ha_reconnected` | Connexion WS HA rétablie | `ha:reconnected` | `ha:status` (`{ connected: true }`) |

### 8.2 États MQTT
| État | Description | Événement EventBus | Événement Socket.io |
|------|-------------|-------------------|-------------------|
| `mqtt_connected` | Connexion MQTT établie | `ha:integration:connected` | `mqtt:connected` |
| `mqtt_disconnected` | Connexion MQTT perdue | `ha:integration:disconnected` | `mqtt:disconnected` |
| `mqtt_reconnecting` | Tentative de reconnexion MQTT en cours | - | `app:log` |
| `mqtt_reconnected` | Connexion MQTT rétablie | `ha:integration:connected` | `mqtt:connected` |

### 8.3 États RFXCOM
| État | Description | Événement EventBus | Événement Socket.io |
|------|-------------|-------------------|-------------------|
| `rfxcom_ready` | Transceiver RFXCOM initialisé et prêt | `rfxcom:ready` | `rfxcom:status` |
| `rfxcom_scanning` | Scan RF433 en cours | `rfxcom:scan:start` | `rfxcom:status` |
| `rfxcom_scan_complete` | Scan RF433 terminé | `rfxcom:scan:complete` | `rfxcom:status` |
| `rfxcom_error` | Erreur RFXCOM (voir §5) | `rfxcom:error` | `app:log` |

---

## 9. Format des Messages d'Erreur

### 9.1 Structure Standardisée
```typescript
interface AppError {
  code: string;          // Ex: "HA_CONNECTION_LOST"
  message: string;       // Message lisible (ex: "Connection to Home Assistant lost")
  severity: 'error' | 'warn' | 'info' | 'debug';
  module: string;        // Ex: "ha:ws", "mqtt:client", "rfxcom:service"
  timestamp: string;     // ISO8601
  details?: {             // Contexte supplémentaire
    entityId?: string;
    service?: string;
    topic?: string;
    reason?: string;
    retryCount?: number;
  };
  stack?: string;        // Stack trace (debug uniquement)
}
```

### 9.2 Exemple de Message d'Erreur
```json
{
  "code": "RFXCOM_TRANSCEIVER_UNAVAILABLE",
  "message": "RFXCOM transceiver not available",
  "severity": "error",
  "module": "rfxcom:service",
  "timestamp": "2026-07-11T14:30:00.000Z",
  "details": {
    "port": "/dev/ttyUSB0",
    "reason": "ENOENT: no such file or directory"
  }
}
```

### 9.3 Format dans les Logs
```
[2026-07-11T14:30:00.000Z] [ERROR] [rfxcom:service] RFXCOM_TRANSCEIVER_UNAVAILABLE: RFXCOM transceiver not available (port: /dev/ttyUSB0, reason: ENOENT)
```

---

## 10. Intégration avec EventBus

### 10.1 Événements d'Erreur Standard
| Événement | Payload | Description | Émetteur |
|-----------|---------|-------------|-----------|
| `app:error` | `AppError` | Erreur générique de l'application | Tout module |
| `ha:error` | `AppError` | Erreur liée à HA WebSocket | `HaWsClient` |
| `mqtt:error` | `AppError` | Erreur liée à MQTT | `HaMqttIntegrationService` |
| `rfxcom:error` | `AppError` | Erreur liée à RFXCOM | `RfxComService` |

### 10.2 Flux de Propagation des Erreurs
```
Module (ex: RfxComService)
  │
  ▼
Émet EventBus.emit('rfxcom:error', AppError)
  │
  ▼
SocketBridge (si configuré)
  │
  ▼
Émet Socket.io 'app:log' (pour l'UI)
  │
  ▼
Logger (fichier + console)
```

### 10.3 Règles de Propagation
1. **Toute erreur critique (severity: error)** doit être émise sur EventBus.
2. **Toute erreur émise sur EventBus** doit être loggée (via `logger.error/warn`).
3. **Les erreurs critiques** (`HA_CONNECTION_LOST`, `RFXCOM_TRANSCEIVER_UNAVAILABLE`) doivent **aussi** être émises vers Socket.io (`app:log`).
4. **Les erreurs de validation** (`APP_CONFIG_INVALID`) doivent être retournées à l'UI via `config:saved`.

---

## 11. Exemples Concrets

### 11.1 Scénario 1 : Déconnexion HA WebSocket
```
1. HaWsClient détecte une déconnexion.
2. Émet EventBus.emit('ha:disconnected').
3. Logge : [ERROR] [ha:ws] HA_CONNECTION_LOST: Connection to Home Assistant lost
4. SocketBridge émet 'ha:status' ({ connected: false }) vers l'UI.
5. SocketBridge émet 'app:log' avec le message d'erreur.
```

### 11.2 Scénario 2 : Commande RFXCOM Invalide
```
1. RfxComService reçoit une commande avec brightness: 300.
2. Détecte que 300 > 255.
3. Émet EventBus.emit('rfxcom:command:error', {
     code: 'RFXCOM_INVALID_BRIGHTNESS',
     message: 'Brightness must be between 0 and 255',
     severity: 'error',
     module: 'rfxcom:service'
   }).
4. Logge l'erreur.
5. SocketBridge émet 'app:log' vers l'UI.
```

### 11.3 Scénario 3 : Échec de Connexion MQTT
```
1. HaMqttIntegrationService échoue à se connecter.
2. Émet EventBus.emit('ha:integration:disconnected', {
     code: 'MQTT_CONNECTION_REFUSED',
     message: 'MQTT connection refused',
     severity: 'error',
     module: 'ha:mqtt'
   }).
3. Logge l'erreur.
4. SocketBridge émet 'mqtt:disconnected' vers l'UI.
```

---

## 12. Annexes

### 12.1 Références
- [`specs-techniques-socle-ha-mqtt-v4.3.md`](specs-techniques-socle-ha-mqtt-v4.3.md) (architecture 5 couches)
- [`specs-fonctionnelles-rfxcom-v5.0.md`](specs-fonctionnelles-rfxcom-v5.0.md) (spécifications RFXCOM)
- [`specs-recepteurs-emetteurs-rfxcom-v5.0.md`](specs-recepteurs-emetteurs-rfxcom-v5.0.md) (intégration MQTT)

### 12.2 Glossaire
| Terme | Définition |
|-------|------------|
| Code d'erreur | Identifiant unique pour une erreur (ex: `HA_CONNECTION_LOST`) |
| Sévérité | Niveau de criticité (ERROR, WARN, INFO, DEBUG) |
| EventBus | Canal de communication inter-couches |
| MQTT | Protocole IoT pour la communication avec HA |
| RFXCOM | Protocole RF 433 MHz |

### 12.3 Historique des Versions
| Version | Date | Auteur | Modifications |
|---------|------|--------|---------------|
| 1.0 | 11 Juillet 2026 | - | Création initiale |

---

*Document conforme à specs-techniques-socle-ha-mqtt-v4.3.md, specs-fonctionnelles-rfxcom-v5.0.md et specs-recepteurs-emetteurs-rfxcom-v5.0.md.*
