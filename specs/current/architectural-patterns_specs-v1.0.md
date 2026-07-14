# Spécifications — Patterns d'Intégration HA/MQTT
**Version : 1.0**
**Date : 12 Juillet 2026**
**Statut : Document de référence pour le choix des patterns d'intégration**
**Conformité : specs-techniques-socle-ha-mqtt-v4.3.md (architecture 5 couches)

---

## 1. Introduction

Ce document définit **deux patterns distincts** pour l'intégration des modules avec Home Assistant dans le socle HA-MQTT.

**Règle absolue** :
> Un module utilise **UN SEUL** de ces patterns. **Aucun module ne doit utiliser les deux simultanément** (sauf cas très spécifique documenté séparément).

**Objectif** :
- Clarifier **quand** utiliser MQTT ou WebSocket (HA WS).
- **Standardiser** l’architecture pour toutes les applications.
- Permettre l’**ajout facile** de nouveaux modules sans modifier le cœur.

---

## 2. Pattern MQTT (Intégrations Standards)

### 2.1 Quand l'utiliser ?

✅ **Cas d'usage** :
- Modules d'**intégration** avec des systèmes tiers (RFXCOM, Zigbee, Z-Wave, etc.).
- Communication **unidirectionnelle** avec Home Assistant (publier des données, recevoir des commandes).
- **Pas besoin** de synchroniser le référentiel HA localement (la configuration est auto-portée).

❌ **À éviter si** :
- Le module a besoin d’une **synchronisation temps réel** avec le référentiel HA.
- Le module doit **lire/modifier** des entités HA existantes (hors de son propre scope).

---

### 2.2 Implémentation

#### **2.2.1 Configuration**
- **Fichier dédié** : `config-<module>-devices-v1.0.yaml` (ex: `config-rfxcom-devices-v1.0.yaml`).
- **Format** : YAML strict, versionné.
- **Contenu** : Tous les devices, récepteurs, et associations du module.

**Exemple** (`config-rfxcom-devices-v1.0.yaml`) :
```yaml
# Configuration RFXCOM - Devices, Récepteurs et Associations
rfxcom_devices:
  # Capteurs
  rfxsensor_0xa5b3:
    sensorId: "0xA5B3"
    type: "RFXSensor"
    subType: "Temperature"
    name: "Température---Salon"  # Respecte spec-nommage-v1.0.md
    protocole: "rfxsensor"
    defaultQuoi: "Température"

rfxcom_receivers:
  recepteur_001:
    name: "Lumière---Salon--Canapé"
    primaryEmitter: lighting2_0x02b3
    emitters:
      - lighting2_0x02b3
    isDimmable: true
```

#### **2.2.2 Structure des Données**
- **Nommage** : Respecte `spec-nommage-v1.0.md` (`QUOI---OÙ--OÙ_père`).
- **Types** : Définis dans le schema du module (ex: `RfxComDevice`, `RfxComReceiver`).
- **Hierarchie** : Simple (`OU` + `QUOI` déclarés dans le YAML).

#### **2.2.3 Intégration avec Home Assistant**
- **MQTT Discovery** : Crée automatiquement les entités dans HA.
- **Topics** :
  - **Découverte** : `homeassistant/sensor/<module>/<device_id>/config`
  - **État** : `homeassistant/sensor/<module>/<device_id>/state`
  - **Commandes** : `homeassistant/<module>/<device_id>/set`

#### **2.2.4 Modules Existants**
- **RFXCOM** : Voir `specs-fonctionnelles-rfxcom-v5.0.md` et `specs-implementation-rfxcom-v1.0.md`.
- **À venir** : Zigbee, Z-Wave, etc. (même pattern).

---

## 3. Pattern WS (Synchronisation Forte)

### 3.1 Quand l'utiliser ?

✅ **Cas d'usage** :
- Modules nécessitant une **synchronisation bidirectionnelle** avec Home Assistant.
- Besoin de **référentiel local miroir** (pour l’IA, temps réel, supervision).
- **Hiérarchie multi-niveau** (`Où` → `QUOI` → `entités` → `devices`).

❌ **À éviter si** :
- Le module est une simple intégration de devices (utiliser MQTT à la place).

---

### 3.2 Implémentation

#### **3.2.1 Synchronisation**
- **Client** : `HaWsClient` (WebSocket HA, port 8123).
- **Une seule instance** pour TOUTES les applications (singleton).
- **Connexion unique** : Évite de multiplier les connexions WS vers HA.

#### **3.2.2 Structure du Référentiel Local**
Le référentiel est **un miroir** du référentiel Home Assistant, avec une hiérarchie enrichie :

```typescript
// Exemple de structure (HaStructureRegistry)
{
  "Maison": {                          // Area (Niveau 1)
    "1er Étage": {                     // Area (Niveau 2)
      "Salon": {                       // Area (Niveau 3)
        "Température": {                // QUOI (Type fonctionnel)
          "sensor.temperature_salon": { // entity_id HA
            device: "rfxsensor_0xa5b3",  // device_id RFXCOM
            state: 22.5,
            unit: "°C",
            last_updated: "2026-07-12T14:30:00Z"
          }
        },
        "Lumière": {
          "switch.lumière_canapé": {
            device: "lighting2_0x02b3",
            state: "ON"
          }
        }
      }
    }
  }
}
```

**Règles** :
- **Source de vérité** : Home Assistant (les modules **lisent** le référentiel, ne l’écrivent pas directement).
- **Mise à jour** : Les modifications du référentiel **viennent de HA** (WebSocket push).
- **Hiérarchie** : Conforme à `spec-nommage-v1.0.md` (QUOI/OÙ).

#### **3.2.3 Composants Clés**
| **Composant** | **Rôle** | **Fichier** |
|---------------|----------|-------------|
| `HaWsClient` | Connexion WebSocket à HA | `src/ha/sync/HaWsClient.ts` |
| `HaStateRegistry` | États bruts des entités | `src/ha/sync/HaStateRegistry.ts` |
| `HaStructureRegistry` | Référentiel structuré (areas → devices → entities) | `src/ha/sync/HaStructureRegistry.ts` |

#### **3.2.4 Cas d'Usage Typiques**
- **Intelligence Artificielle** : Besoin de données temps réel pour prendre des décisions.
- **Supervision** : Tableau de bord local avec synchronisation immédiate.
- **Modules de contrôle avancé** : Qui doivent connaître l’état global du système.

---

## 4. Tableau Comparatif

| **Critère** | **Pattern MQTT** | **Pattern WS** |
|-------------|------------------|----------------|
| **Technologie** | MQTT (Broker externe) | WebSocket (HA WS, port 8123) |
| **Synchronisation** | Unidirectionnelle | Bidirectionnelle |
| **Configuration** | Fichier YAML centralisé | Dynamique (miroir HA) |
| **Hiérarchie** | Simple (`OU` + `QUOI`) | Multi-niveau (`Où` → `QUOI` → `entités` → `devices`) |
| **Duplication** | ❌ Non (MQTT Discovery gère HA) | ✅ Oui (référentiel local = miroir HA) |
| **Temps de réponse** | ~100ms (latence MQTT) | **Imédiat** (WebSocket push) |
| **Complexité** | Faible | Élevée |
| **Exemples** | RFXCOM, Zigbee, Z-Wave | IA, Supervision, Contrôle avancé |
| **Couche HA** | HA.B (Modules d’intégration) | HA.A (Synchronisation référentiel) |
| **Singularité** | Une instance par module | **Une seule instance pour TOUTES les apps** |

---

## 5. Intégration dans le Socle HA-MQTT

### 5.1 Architecture 5 Couches (Rappel)
La couche **HA** est divisée en **deux sous-composants distincts** (conforme à `specs-techniques-socle-ha-mqtt-v4.3.md` §73–88) :

```
┌─────────────────────────────────────────────────────────────┐
│                     COUCHE HA                                │
│                                                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  A) Synchronisation Référentiel   │  ← **WebSocket**       │
│  │     - HaWsClient                  │  ← Pattern WS          │
│  │     - HaStateRegistry             │                         │
│  │     - HaStructureRegistry         │                         │
│  └─────────────────────┬──────────────────────────────┘   │
│                        │                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  B) Modules d’Intégration        │  ← **MQTT**            │
│  │     - MqttClient                  │  ← Pattern MQTT        │
│  │     - IntegrationBridge           │                         │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Règles d'Utilisation
1. **Un module = Un pattern** : Chaque module **décide** s’il utilise MQTT ou WS, mais **pas les deux**. 
2. **Référentiel unique WS** : Tous les modules qui utilisent WS **partagent** le même `HaWsClient` et les mêmes registries.
3. **MQTT par module** : Chaque module MQTT peut avoir sa propre connexion (ou partager un client MQTT global).
4. **Détection automatique** : `AppService` détecte les modules et **active le bon pattern** en fonction de `requiredMqtt` et `requiredHaWs`.

---

## 6. Exemples Concrets

### 6.1 RFXCOM (Pattern MQTT)
- **Type** : `'integration'`
- **Technologie** : MQTT uniquement
- **Configuration** : `config-rfxcom-devices-v1.0.yaml`
- **Intégration HA** : MQTT Discovery
- **`requiredMqtt`** : `true`
- **`requiredHaWs`** : `false`

### 6.2 Module IA (Pattern WS)
- **Type** : `'application'` ou `'core'`
- **Technologie** : WebSocket uniquement
- **Référentiel** : Miroir local du référentiel HA
- **Synchronisation** : Bidirectionnelle (push/pull)
- **`requiredMqtt`** : `false`
- **`requiredHaWs`** : `true`

---

## 7. Bonnes Pratiques

### 7.1 Pour les Nouveaux Modules
- **Choisir le bon pattern** dès la conception.
- **MQTT** : Pour les intégrations de devices.
- **WS** : Pour les modules qui ont besoin de données temps réel.

### 7.2 Nommage des Fichiers
- **MQTT** : `config-<module>-devices-vX.Y.Z.yaml`
- **WS** : Pas de fichier de config spécifique (synchronisation dynamique).

### 7.3 Intégration avec EventBus
- **Tous les modules** (MQTT ou WS) communiquent avec le reste de l’application **via EventBus**.
- **Exemple** :
  ```typescript
  // Module MQTT (RFXCOM)
  this.eventBus.emit('rfxcom:device:detected', { device, state });
  
  // Module WS (IA)
  this.eventBus.on('rfxcom:device:detected', (data) => this.handleNewDevice(data));
  ```

---

## 8. Roadmap

| **Étape** | **Action** | **Priorité** | **Fichier** | **Statut** |
|-----------|------------|--------------|-------------|------------|
| 1 | Corriger `requiredHaWs: false` pour RFXCOM | 🔴 Haute | `src/applications/rfxcom/domain/index.ts` | ✅ Terminé |
| 2 | Intégrer MQTT dans le bootstrap | 🟡 Moyenne | `src/index.ts` ou `AppService.ts` | ⏳ En cours |
| 3 | Implémenter un module WS (ex: IA) | 🟢 Faible | À venir | ⏳ À venir |

---

*Ce document doit être lu avant de créer un nouveau module d'intégration.*
