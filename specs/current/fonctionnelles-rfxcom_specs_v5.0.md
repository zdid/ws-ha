# Spécifications Fonctionnelles - Module RFXCOM

*Version 5.0 - 09 Juillet 2026*
*Intègre le fichier de configuration centralisé config-rfxcom-devices-v1.0.yaml avec primaryEmitter et émetteurs appairés dans les récepteurs*

---

## 📌 Table des Matières
1. [Introduction](#1-introduction)
2. [Référentiel de Nommage et Taxonomie](#2-référentiel-de-nommage-et-taxonomie)
3. [Architecture](#3-architecture)
4. [Types de Devices et Entités Supportés](#4-types-de-devices-et-entités-supportés)
5. [Gestion des Émetteurs et Récepteurs](#5-gestion-des-émetteurs-et-récepteurs)
6. [Format des Messages RFXCOM](#6-format-des-messages-rfxcom)
7. [Mappage vers Home Assistant](#7-mappage-vers-home-assistant)
8. [Configuration](#8-configuration)
9. [Gestion des Données QUOI et OÙ](#9-gestion-des-données-quoi-et-ou)
10. [Fichier de Configuration Centralisé](#10-fichier-de-configuration-centralisé)
11. [Interface Web et Socket.io](#11-interface-web-et-socketio)
12. [Scénarios d'Utilisation](#12-scenarios-dutilisation)
13. [Gestion des États](#13-gestion-des-états)
14. [Commandes](#14-commandes)
   - [14.1 Émetteurs Lighting](#141-émetteurs-lighting)
   - [14.2 Récepteurs](#142-récepteurs)
   - [14.3 Scènes RFXCOM](#143-scènes-rfxcom)
   - [14.4 Commandes Spécifiques aux Récepteurs Dimmables](#144-commandes-spécifiques-aux-récepteurs-dimmables)
   - [14.5 Commandes Spécifiques aux Covers](#145-commandes-spécifiques-aux-covers)
15. [Tests](#15-tests)
16. [Limites et Contraintes](#16-limites-et-contraintes)
17. [Roadmap](#17-roadmap)
18. [Annexes](#18-annexes)

---

## 1. Introduction

### 1.1 Objectif
Ce document décrit les spécifications fonctionnelles du module d'intégration **RFXCOM** pour Home Assistant.

**NOUVEAU v5.0 :**
- ✅ **Fichier de configuration centralisé** : `config-rfxcom-devices-v1.0.yaml` contient TOUS les devices, récepteurs et associations
- ✅ **primaryEmitter dans chaque récepteur** : Détermine quel device RFXCOM envoie les commandes
- ✅ **Liste des émetteurs appairés dans le récepteur** : Les associations N↔N sont stockées directement dans la définition du récepteur
- ✅ **entity_id et unique_id contiennent TOUJOURS le protocole interne** (`<protocole_interne>_<sensorId>`)
- ✅ **QUOI = type fonctionnel pur** (ex: "Température", "Humidité", "Courant")
- ✅ **QUOI auto-déterminé** depuis le subType RFXCOM
- ✅ **Émetteurs Lighting = binary_sensor par défaut** (on/off)

### 1.2 Périmètre
- **Inclus** : Réception messages RF433, classification HA, publication MQTT, exécution commandes, gestion récepteurs/émetteurs
- **Exclus** : Gestion du matériel RFXCOM (pilotes), configuration broker MQTT, implémentation UI

### 1.3 Public Cible
- Développeurs intégrant le module RFXCOM
- Mainteneurs du socle HA-MQTT
- Utilisateurs finaux (configuration via fichier YAML)

---

## 2. Référentiel de Nommage et Taxonomie

**⚠️ Ce module respecte strictement [spec-nommage-v1.0.md](spec-nommage-v1.0.md)**

### 2.1 Format du name (Obligatoire)
```
quoi---lieu_precis--lieu--lieu_pere--lieu_grand_pere
```
- `---` : Séparateur majeur entre QUOI et OÙ
- `--` : Séparateur mineur entre niveaux hiérarchiques

### 2.2 Règle de Nommage Technique

**Pour TOUS les devices RFXCOM (capteurs et émetteurs) :**
```
<protocole_interne>_<sensorId>
```

| Élément | Description | Exemple | Résultat |
|---------|-------------|---------|----------|
| protocole_interne | Protocole RFXCOM interne | `lighting2`, `rfxsensor`, `rfxmeter` | - |
| sensorId | Identifiant unique du device | `0x02b3`, `0xa5b3` | - |
| **Nom complet** | - | - | `lighting2_0x02b3`, `rfxsensor_0xa5b3` |

**Pour les récepteurs logiques :**
```
recepteur_<numéro_séquence>
```
- `numéro_séquence` : Numéro attribué séquentiellement (001, 002, ...)
- Exemple : `recepteur_001`, `recepteur_002`

> ✅ **Garantie d'unicité** : Le sensorId ou le numéro de séquence assure l'unicité dans tout le système.

### 2.3 QUOI = Type Fonctionnel Pur

**Le QUOI ne désigne PAS un endroit, mais le type fonctionnel du device :**

| SubType RFXCOM | QUOI (auto-déterminé) | Exemple |
|----------------|----------------------|---------|
| Temperature | Température | `Température---Salon` |
| Humidity | Humidité | `Humidité---Cuisine` |
| Motion | Mouvement | `Mouvement---Couloir` |
| Contact | Contact | `Contact---Entrée` |
| Current | Courant | `Courant---Tableau` |
| Power | Puissance | `Puissance---Cuisine` |
| Lighting1 | Interrupteur | `Interrupteur---Salon` |
| Lighting2 | Bouton | `Bouton---Salon` |
| Lighting4 | Télécommande | `Télécommande---Salon` |

> ⚠️ **IMPORTANT** : Le QUOI est **prérempli automatiquement** depuis le subType du message RFXCOM. L'utilisateur peut le modifier dans le fichier de configuration.

### 2.4 OÙ = Localisation Hiérarchique
Représente **l'emplacement** après `---`, séparé par `--` :

| Niveau | Rôle | Exemple | Obligatoire |
|--------|------|---------|-------------|
| `lieu_grand_pere` | Bâtiment | `Maison` | ❌ |
| `lieu_pere` | Étage | `Rez-de-Chaussée` | ❌ |
| `lieu_principal` | Pièce | **`Salon`** | ✅ **OUI** |
| `lieu_precis` | Sous-zone | `Coin Canapé` | ❌ |

**Exemples complets :**
- `Température---Salon` (N=1)
- `Température---Coin Canapé--Salon` (N=2)
- `Bouton---Fenêtre Sud--Cuisine--Rez-de-Chaussée` (N=3)

### 2.5 Règle de Transmission vers HA (CRITIQUE)
**⭐ Les données ne sont PAS transmissibles vers HA si :**
- ❌ QUOI (`raw_quoi`) est vide/manquant
- ❌ OÙ n'a PAS de `lieu_principal` (aucune pièce définie)

### 2.6 Attributs de Taxonomie (Obligatoire)
Toute entité DOIT inclure dans son payload MQTT :
```json
{
  "attributs_taxonomie": {
    "quoi": "Température",
    "slug_quoi": "temperature",
    "lieu_principal": "Salon",
    "slug_lieu": "salon",
    "lieu_precis": "Coin Canapé",
    "slug_precis": "coin_canape",
    "lieu_pere": null,
    "slug_pere": null,
    "lieu_grand_pere": null,
    "slug_grand_pere": null
  }
}
```

---

## 3. Architecture

### 3.1 Schéma Global (5 Couches - Conforme à specs-techniques-socle-ha-mqtt.md)
```
┌─────────────────────────────────────────────────────────────────┐
│                    COUCHE PRÉSENTATION                    │
│              (UI Web + Socket.io)                        │
├─────────────────────────────────────────────────────────────────┤
│                    COUCHE APPLICATION                     │
│   AppService · EventBus · SocketBridge · RestartManager   │
├─────────────────────────────────────────────────────────────────┤
│                     COUCHE MÉTIER                         │
│   RfxComService · ReceiverSwitchModule · ReceiverLightModule   │
│   ReceiverCoverModule · ReceiverSceneModule                      │
├─────────────────────────────────────────────────────────────────┤
│                       COUCHE HA                           │
│   HaMqttIntegrationService · IntegrationBridge · EventBus       │
├─────────────────────────────────────────────────────────────────┤
│                  COUCHE INFRASTRUCTURE                    │
│   ConfigService · Logger · MqttTransport                        │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Flux de Données (Mis à jour v5.0)
```
RFXCOM Transceiver (Port Série)
    |
    v (Message RF433)
RfxComService.handleRfxMessage()
    |
    v (Auto-détermination QUOI depuis subType)
    v (Ex: Temperature → QUOI = "Température")
    |
    v (Validation QUOI/OÙ)
    +--[QUOI ou OÙ manquant?]---> [BLOCAGE: Pas de transmission HA]
    |
    v (Mise à jour dans config-rfxcom-devices-v1.0.yaml)
    v (Si nouvel émetteur, ajout à rfxcom_devices)
    |
    v (Publication Discovery MQTT)
Home Assistant
```

---

## 4. Types de Devices et Entités Supportés

### 4.1 RFXSensor - Capteurs (0x50-0x5F)
**QUOI auto-déterminé depuis subType**

| SubType | QUOI | Composant HA | Device Class | Unité | Exemple entity_id | Exemple unique_id | Exemple name |
|---------|------|---------------|--------------|-------|-------------------|-------------------|--------------|
| Temperature | Température | sensor | temperature | °C | `sensor.rfxsensor_0xa5b3` | `rfxsensor_0xa5b3` | `Température---Salon` |
| Humidity | Humidité | sensor | humidity | % | `sensor.rfxsensor_0xc4d2` | `rfxsensor_0xc4d2` | `Humidité---Cuisine` |
| Motion | Mouvement | binary_sensor | motion | - | `binary_sensor.rfxsensor_0xe7f1` | `rfxsensor_0xe7f1` | `Mouvement---Couloir` |
| Contact | Contact | binary_sensor | door | - | `binary_sensor.rfxsensor_0x98a4` | `rfxsensor_0x98a4` | `Contact---Entrée` |

### 4.2 RFXMeter - Compteurs (0x70-0x7F)
**QUOI auto-déterminé depuis subType**

| SubType | QUOI | Composant HA | Device Class | Unité | Exemple entity_id | Exemple unique_id | Exemple name |
|---------|------|---------------|--------------|-------|-------------------|-------------------|--------------|
| Current | Courant | sensor | current | A | `sensor.rfxmeter_0xb2c3` | `rfxmeter_0xb2c3` | `Courant---Tableau` |
| Power | Puissance | sensor | power | W | `sensor.rfxmeter_0xd4e5` | `rfxmeter_0xd4e5` | `Puissance---Cuisine` |

### 4.3 Lighting - Émetteurs Physiques (0x10-0x1F)
**TOUS les Lighting sont des ÉMETTEURS PHYSIQUES**
**Par défaut : composant HA = binary_sensor (on/off)**

| Type | QUOI | Composant HA | Commandes | Exemple entity_id | Exemple unique_id | Exemple name |
|------|------|---------------|-----------|-------------------|-------------------|--------------|
| Lighting1 | Interrupteur | binary_sensor | on, off | `binary_sensor.lighting1_0x01a2` | `lighting1_0x01a2` | `Interrupteur---Salon` |
| Lighting2 | Bouton | binary_sensor | on, off | `binary_sensor.lighting2_0x02b3` | `lighting2_0x02b3` | `Bouton---Salon` |
| Lighting4 | Télécommande | binary_sensor | on, off | `binary_sensor.lighting4_0x1001` | `lighting4_0x1001` | `Télécommande---Salon` |

> ⚠️ **CLARIFICATION** : 
> - Lighting2 peut être configuré comme **variateur** via le fichier de configuration
> - Dans ce cas, le récepteur associé sera de type `light` (et non `binary_sensor`)
> - L'information "variateur" **ne vient pas du device lui-même**, mais de la configuration du récepteur (`isDimmable: true`)

---

## 5. Gestion des Émetteurs et Récepteurs

### 5.1 Définitions Clés

| Terme | Définition | Type HA | Nom Technique | Exemple |
|-------|------------|---------|---------------|---------|
| **Device RFXCOM** | Appareil physique RFXCOM | variable | `<protocole>_<sensorId>` | `lighting2_0x02b3`, `rfxsensor_0xa5b3` |
| **Émetteur** | Device Lighting1/2/4 qui émet des signaux RF433 | **binary_sensor** (par défaut) | `<protocole>_<sensorId>` | `lighting2_0x02b3` |
| **Récepteur** | Entité logique déclarée, associée à des émetteurs | switch, light, cover, scene | `recepteur_<seq>` | `recepteur_001` |
| **primaryEmitter** | Émetteur principal d'un récepteur, utilisé pour envoyer les commandes RF433 | - | `<protocole>_<sensorId>` | `lighting2_0x02b3` |
| **Association** | Lien entre émetteur et récepteur (**N↔N**) stocké dans le récepteur | - | - | - |

### 5.2 Règles Fondamentales (NOUVEAU v5.0)

1. **Tous les devices RFXCOM ont un nom technique** : `<protocole_interne>_<sensorId>`
2. **QUOI = type fonctionnel pur** (ex: "Température", "Humidité", "Courant"), pas un endroit
3. **QUOI auto-déterminé** depuis le subType du message RFXCOM
4. **Émetteurs Lighting = binary_sensor par défaut** (ils émettent on/off)
5. **Associations stockées dans le fichier YAML** : dans `config-rfxcom-devices-v1.0.yaml`, chaque récepteur contient sa liste d'émetteurs appairés
6. **primaryEmitter obligatoire** : Chaque récepteur a UN émetteur primaire qui détermine quel device RFXCOM envoie les commandes
7. **Relations N↔N** : 
   - Un récepteur peut avoir **plusieurs émetteurs** associés (dans `emitters[]`)
   - Un émetteur peut agir sur **plusieurs récepteurs** (chaque récepteur référence l'émetteur)
8. **Lighting2 variateur** : L'information "variateur" vient **exclusivement** de la propriété `isDimmable` du récepteur

### 5.3 Flux Émetteur → Récepteur
```
1. Bouton physique (Lighting2 0x02B3) envoie: "ON"
2. RfxComService reçoit message RF433
3. Service identifie 0x02B3 comme émetteur (lighting2_0x02b3)
4. Service parcourt TOUS les récepteurs dans config-rfxcom-devices-v1.0.yaml
5. Pour chaque récepteur qui a lighting2_0x02b3 dans sa liste emitters:
   a. Vérification que QUOI/OÙ sont complets
   b. Module approprié exécute l'action configurée (toggle, on, off, set_level, etc.)
   c. Module met à jour état du récepteur dans HA
```

### 5.4 Flux HA → Récepteur → Device RFXCOM (NOUVEAU v5.0)
```
1. HA publie: homeassistant/light/recepteur_001/set
   Payload: {"state": "ON", "brightness": 128}
2. IntegrationBridge reçoit via MQTT
3. RfxComService trouve recepteur_001 dans config-rfxcom-devices-v1.0.yaml
4. Récupère primaryEmitter: "lighting2_0x02b3"
5. Trouve le device associé: lighting2_0x02b3 → sensorId: "0x02B3"
6. ReceiverLightModule convertit: brightness 128 → level 50%
7. Module envoie commande à RfxComService:
   {targetSensorId: "0x02B3", command: "set_level", value: 50}
8. RfxComService envoie signal RF433 au device cible
9. Device physique (0x02B3) exécute
```

---

## 6. Format des Messages RFXCOM

### 6.1 Structure Commune
```typescript
interface RfxComRawMessage {
  type: RfxComDeviceType;      // "RFXSensor", "RFXMeter", "Lighting1", "Lighting2", "Lighting4"
  subType: RfxComSubType;      // "Temperature", "Humidity", "Motion", "AC", etc.
  sensorId: string;            // "0x123456"
  seqNbr: number;              // 0-255
  signalLevel: number;         // dBm (-128 à 127)
  batteryLevel: number;        // 0-9
  data: Record<string, unknown>;
  rawData: Buffer;
}
```

### 6.2 Auto-détermination du QUOI
```typescript
const SUBTYPE_TO_QUOI: Record<string, string> = {
  'Temperature': 'Température',
  'Humidity': 'Humidité',
  'Motion': 'Mouvement',
  'Contact': 'Contact',
  'Current': 'Courant',
  'Power': 'Puissance',
  'Lighting1': 'Interrupteur',
  'Lighting2': 'Bouton',
  'Lighting4': 'Télécommande',
};
```

---

## 7. Mappage vers Home Assistant

### 7.1 Composants HA par Type de Device

| Type RFXCOM | SubType | Composant HA | Device Class | QUOI |
|-------------|---------|---------------|--------------|------|
| RFXSensor | Temperature | sensor | temperature | Température |
| RFXSensor | Humidity | sensor | humidity | Humidité |
| RFXSensor | Motion | binary_sensor | motion | Mouvement |
| RFXSensor | Contact | binary_sensor | door | Contact |
| RFXMeter | Current | sensor | current | Courant |
| RFXMeter | Power | sensor | power | Puissance |
| Lighting1 | - | **binary_sensor** | - | Interrupteur |
| Lighting2 | - | **binary_sensor** | - | Bouton |
| Lighting4 | - | **binary_sensor** | - | Télécommande |

### 7.2 Discovery MQTT pour Device RFXCOM
**Template général (capteur) :**
```json
{
  "name": "{{ taxonomy.raw_quoi }}",
  "unique_id": "{{ protocole }}_{{ sensorId }}",
  "~": "homeassistant/sensor/{{ protocole }}_{{ sensorId }}",
  "device": {
    "identifiers": ["{{ protocole }}_{{ sensorId }}"],
    "name": "RFXCOM {{ type }} {{ subType }}",
    "manufacturer": "RFXCOM",
    "model": "{{ protocole | uppercase }}"
  },
  "attributs_taxonomie": {
    "quoi": "{{ taxonomy.raw_quoi }}",
    "slug_quoi": "{{ taxonomy.slug_quoi }}",
    "lieu_principal": "{{ taxonomy.nom_lieu }}",
    "slug_lieu": "{{ taxonomy.slug_lieu }}"
  }
}
```

---

## 8. Configuration

### 8.1 Fichier config.yaml (Paramètres généraux)
**Seuls les paramètres généraux RFXCOM sont dans ce fichier :**

```yaml
# ============================================================
# Configuration Socle (voir specs-techniques-socle-ha-mqtt.md)
# ============================================================
ha:
  ws:
    host: "192.168.1.100"
    port: 8123
    token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

mqtt:
  host: "192.168.1.100"
  port: 1883
  client_id: "ha-rfxcom-001"

web:
  port: 8080
  host: "0.0.0.0"

# ============================================================
# Configuration RFXCOM - Paramètres généraux
# ============================================================
rfxcom:
  port: "/dev/ttyUSB0"
  baudRate: 38400
  
  # Règle de transmission (obligatoire)
  transmission:
    requireQuoi: true
    requireLieu: true
  
  # Auto-détermination QUOI activée par défaut
  autoDetermineQuoi: true
  
  # Fichier de configuration des devices/récepteurs/associations
  devicesConfigFile: "config-rfxcom-devices-v1.0.yaml"
```

> ⚠️ **IMPORTANT** : 
> - Les **devices RFXCOM**, **récepteurs** et **associations** sont dans **`config-rfxcom-devices-v1.0.yaml`** (fichier séparé)
> - Seul le fichier principal `config.yaml` contient les paramètres généraux (port série, MQTT, etc.)

---

## 9. Gestion des Données QUOI et OÙ

### 9.1 Règle Fondamentale
**Toute transmission vers HA est conditionnée par QUOI + lieu_principal**

### 9.2 Auto-détermination du QUOI
**Algorithme :**
```typescript
function determineQuoi(message: RfxComRawMessage): string {
  const defaultQuoi = getDefaultQuoi(message.subType);
  if (defaultQuoi) return defaultQuoi;
  return message.subType;
}
```

### 9.3 Extraction de la Taxonomie
```typescript
function extractTaxonomie(fullName: string): Taxonomie {
  const parts = fullName.split('---');
  const raw_quoi = (parts[0] || '').trim();
  const lieux = parts[1] ? parts[1].split('--') : [];
  
  return {
    raw_quoi,
    slug_quoi: raw_quoi ? slugify(raw_quoi) : '',
    nom_precis: lieux[0]?.trim() || null,
    slug_precis: lieux[0]?.trim() ? slugify(lieux[0].trim()) : null,
    nom_lieu: lieux.length > 1 ? lieux[1]?.trim() : (lieux[0]?.trim() || null),
    slug_lieu: lieux.length > 1 ? lieux[1]?.trim() ? slugify(lieux[1].trim()) : null : 
               (lieux[0]?.trim() ? slugify(lieux[0].trim()) : null),
    nom_pere: lieux[2]?.trim() || null,
    slug_pere: lieux[2]?.trim() ? slugify(lieux[2].trim()) : null,
    nom_grand_pere: lieux[3]?.trim() || null,
    slug_grand_pere: lieux[3]?.trim() ? slugify(lieux[3].trim()) : null
  };
}
```

---

## 10. Fichier de Configuration Centralisé

### 10.1 `config-rfxcom-devices-v1.0.yaml`
**Structure complète :**

```yaml
# ============================================
# SECTION 1 : DEVICES RFXCOM PHYSIQUES
# ============================================
rfxcom_devices:
  rfxsensor_0xa5b3:
    sensorId: "0xA5B3"
    type: "RFXSensor"
    subType: "Temperature"
    name: "Température---Salon"
    protocole: "rfxsensor"
    defaultQuoi: "Température"
  
  lighting2_0x02b3:
    sensorId: "0x02B3"
    type: "Lighting2"
    subType: "AC"
    name: "Bouton---Salon"
    protocole: "lighting2"
    defaultQuoi: "Bouton"

# ============================================
# SECTION 2 : RÉCEPTEURS LOGIQUES
# ============================================
rfxcom_receivers:
  recepteur_001:
    receiverId: "recepteur_001"
    name: "Lumière---Salon"
    type: "light"
    isDimmable: true
    defaultLevel: 80
    primaryEmitter: "lighting2_0x02b3"  # ⭐ Émetteur principal pour envoyer les commandes RF433
    emitters:                           # ⭐ Liste complète des émetteurs associés (N↔N)
      - emitterId: "lighting2_0x02b3"
        action: "toggle"
      - emitterId: "lighting2_0x1001"
        action: "set_level"
        value: 50

# ============================================
# SECTION 3 : MAPPING INVERSE (Optionnel)
# ============================================
# sensorId_to_receiver:
#   "0x02B3": "recepteur_001"
```

### 10.2 Règles du Fichier
- **Format** : YAML strict
- **Chargement** : Au démarrage du service RFXCOM
- **Sauvegarde** : À chaque modification via UI ou API
- **Validation** : Schéma Zod obligatoire avant chargement
- **Backup** : Copie automatique avant toute écriture

### 10.3 Exemple Complet
Voir fichier `config-rfxcom-devices-v1.0.yaml` à la racine du projet.

---

## 11. Interface Web et Socket.io

### 11.1 Communication
- **Socket.io** est le canal principal de communication entre UI et serveur
- **Le fichier YAML peut aussi être édité manuellement** (rechargé automatiquement)
- La configuration est soumise via `config:save` et déclenche un redémarrage

### 11.2 Fonctionnalités UI pour RFXCOM

**Gestion des Devices :**
1. **Liste des devices détectés** : Affiche tous les devices RFXCOM avec leur sensorId, type, subType
2. **QUOI auto-rempli** : Le QUOI est prérempli depuis le subType, modifiable par l'utilisateur
3. **Saisie du OÙ** : Formulaire pour définir la localisation (lieu_principal obligatoire)

**Gestion des Récepteurs :**
1. **Création de récepteur** : Définir type (switch/light/cover/scene), primaryEmitter, et liste des emitters
2. **Configuration variateur** : Pour Lighting2, cocher "isDimmable" pour activer le mode variateur
3. **Configuration covers** : Saisie des délais openTimeSec/closeTimeSec **OBLIGATOIRES**

**Gestion des Associations :**
1. **Ajout d'émetteurs à un récepteur** : Sélectionner des émetteurs dans la liste des devices détectés
2. **Définir l'action** : toggle, on, off, set_level (pour light), open, close, stop (pour cover)
3. **Définir le primaryEmitter** : L'émetteur principal qui enverra les commandes RF433

### 11.3 Événements Socket.io

**Server → Client :**
```typescript
'rfxcom:devices:list': { devices: RfxComDeviceInfo[] }
'rfxcom:receivers:list': { receivers: ReceiverConfig[] }
'rfxcom:device:detected': { device: RfxComDeviceInfo }
'rfxcom:receiver:created': { receiver: ReceiverConfig }
```

**Client → Server :**
```typescript
'rfxcom:receiver:create': { config: ReceiverConfig }
'rfxcom:receiver:update': { receiverId: string, config: Partial<ReceiverConfig> }
'rfxcom:receiver:delete': { receiverId: string }
'config:save': AppConfig
```

---

## 12. Scénarios d'Utilisation

### 12.1 Découverte d'un Capteur (Température)
```
1. RFXCOM reçoit: RFXSensor Temperature 0xA5B3
2. Auto-détermination: subType "Temperature" → QUOI = "Température"
3. Génération: protocole = "rfxsensor", entity_id = "sensor.rfxsensor_0xa5b3"
4. Ajout automatique dans config-rfxcom-devices-v1.0.yaml:
   rfxcom_devices:
     rfxsensor_0xa5b3:
       sensorId: "0xA5B3"
       name: "Température---[à compléter]"
5. UI propose de compléter le OÙ
6. Utilisateur saisit: "Température---Salon"
7. Validation: QUOI="Température" ✅, lieu="Salon" ✅
8. Publication Discovery MQTT
9. HA découvre: sensor.rfxsensor_0xa5b3
```

### 12.2 Découverte d'un Émetteur (Lighting2)
```
1. RFXCOM reçoit: Lighting2 0x02B3
2. Auto-détermination: type "Lighting2" → QUOI = "Bouton"
3. Génération: protocole = "lighting2", unique_id = "lighting2_0x02b3"
4. Ajout automatique dans config-rfxcom-devices-v1.0.yaml:
   rfxcom_devices:
     lighting2_0x02b3:
       sensorId: "0x02B3"
       name: "Bouton---[à compléter]"
5. **Par défaut: composant HA = binary_sensor**
6. UI propose de compléter le OÙ
7. Publication Discovery MQTT (binary_sensor.lighting2_0x02b3)
8. HA découvre l'émetteur
```

### 12.3 Création d'un Récepteur avec Variateur
```
1. Utilisateur crée un récepteur via UI
   - receiverId: "recepteur_001" (auto-généré)
   - name: "Lumière---Salon"
   - type: "light"
   - isDimmable: true  # ⭐ Mode variateur activé
   - primaryEmitter: "lighting2_0x02b3"  # ⭐ Émetteur principal
   - emitters:  # ⭐ Liste des émetteurs associés
       - emitterId: "lighting2_0x02b3", action: "toggle"
       - emitterId: "lighting2_0x1001", action: "set_level", value: 50
2. Sauvegarde dans config-rfxcom-devices-v1.0.yaml
3. Publication Discovery MQTT (light.recepteur_001)
4. Test: appui sur bouton physique 0x02B3 → recepteur_001 toggle
5. Test: commande HA light.recepteur_001/set → Envoi RF433 à 0x02B3
```

### 12.4 Association Multiple (N↔N)
```
Récepteur recepteur_001 (light) a:
  primaryEmitter: "lighting2_0x02b3"
  emitters:
    - emitterId: "lighting2_0x02b3", action: "toggle"
    - emitterId: "lighting2_0x1001", action: "set_level", value: 50

Émetteur lighting2_0x02b3 est référencé dans:
  - recepteur_001 (primaryEmitter)
  - recepteur_002 (dans emitters[])

Appui sur lighting2_0x02b3:
  → recepteur_001 toggle (car primaryEmitter)
  → recepteur_002 exécute son action (ex: on)
```

---

## 13. Gestion des États

### 13.1 Attributes Communs
```json
{
  "signal_level": -75,
  "battery_level": 9,
  "sensor_id": "rfxsensor_0xa5b3",
  "device_id": "rfxsensor_0xa5b3",
  "attributs_taxonomie": {
    "quoi": "Température",
    "slug_quoi": "temperature",
    "lieu_principal": "Salon",
    "slug_lieu": "salon"
  }
}
```

---

## 14. Commandes

### 14.1 Émetteurs Lighting (binary_sensor par défaut)
| Type | Commandes HA | Signification |
|------|--------------|---------------|
| Lighting1/2/4 | on, off | Émission signal RF433 ON/OFF |

### 14.2 Récepteurs
| Type | Commandes HA | Action RFXCOM |
|------|--------------|----------------|
| switch | on, off, toggle | Envoi ON/OFF au device cible (via primaryEmitter) |
| light | on, off, toggle, set_level | Conversion level 0-100%, envoi au device cible |
| cover | open, close, stop, set_position | Envoi OPEN/CLOSE/STOP au device cible |

### 14.3 Scènes RFXCOM

Une **scène** est un ensemble de commandes exécutées simultanément ou séquentiellement sur plusieurs récepteurs.

#### 14.3.1 Structure des Scènes
Chaque scène est définie dans `config-rfxcom-devices-v1.0.yaml` avec la structure suivante :

```yaml
rfxcom_scenes:
  <sceneId>:
    id: "<sceneId>"                    # Identifiant unique (ex: scene_001)
    name: "<QUOI>---<OÙ>"              # Ex: "Scène---Soirée--Salon" (conforme spec-nommage-v1.0.md)
    description: "<description>"       # Optionnel
    type: "parallel" | "sequential"     # Mode d'exécution (défaut: sequential)
    delayBetweenCommands: <ms>         # Délai entre commandes en mode sequential (défaut: 500)
    commands:                         # Liste des commandes à exécuter
      - target: "<receiverId>"          # Récepteur cible (obligatoire)
        action: "<action>"              # Commande HA (ex: turn_on, set_level)
        parameters:                     # Paramètres optionnels
          brightness?: 0-255           # Pour les récepteurs dimmables
          position?: 0-100             # Pour les covers
          transition?: <ms>            # Durée de transition (optionnel)
```

#### 14.3.2 Exemple de Scène
```yaml
rfxcom_scenes:
  scene_001:
    id: "scene_001"
    name: "Soirée---Salon"
    description: "Allume les lumières du salon à 50% et ferme les volets"
    type: "sequential"
    delayBetweenCommands: 300
    commands:
      - target: "recepteur_001"
        action: "turn_on"
        parameters:
          brightness: 128
      - target: "recepteur_002"
        action: "close"
      - target: "recepteur_003"
        action: "turn_on"
```

#### 14.3.3 Comportement des Scènes
- **Mode `parallel`** : Toutes les commandes sont envoyées **simultanément**.
- **Mode `sequential`** : Les commandes sont envoyées **les unes après les autres**, avec un délai de `delayBetweenCommands` entre chaque.
- **Gestion des erreurs** :
  - Si une commande échoue en mode `sequential`, les commandes suivantes **sont annulées**.
  - En mode `parallel`, toutes les commandes sont tentées **même si certaines échouent**.
- **Feedback** : À la fin de l'exécution, un événement `rfxcom:scene:executed` est émis avec :
  ```typescript
  {
    sceneId: string;
    success: boolean;
    executedCommands: number;
    failedCommands: number;
    errors: Array<{
      receiverId: string;
      action: string;
      error: AppError;  // Voir specs-erreurs-v1.0.md
    }>;
    duration: number;   // Durée totale en ms
  }
  ```

#### 14.3.4 Intégration avec Home Assistant
Les scènes sont publiées comme des **automatisations HA** via MQTT Discovery :

```json
{
  "name": "Soirée Salon",
  "unique_id": "rfxcom_scene_001",
  "automation_type": "trigger",
  "topic": "rfxcom/scene/scene_001/execute",
  "payload": "{}",
  "device": {
    "identifiers": ["rfxcom_scene_001"],
    "name": "RFXCOM Scène",
    "manufacturer": "RFXCOM",
    "model": "Scene"
  }
}
```

**Topics MQTT pour les scènes :**
- **Exécution** : `rfxcom/scene/{sceneId}/execute` (HA → App, QoS 1, retain false)
- **Résultat** : `rfxcom/scene/{sceneId}/result` (App → HA, QoS 0, retain false)

#### 14.3.5 Commandes Spécifiques aux Scènes
| Commande | Description | Payload |
|----------|-------------|---------|
| `rfxcom:scene:execute` | Exécuter une scène | `{ sceneId: string }` |
| `rfxcom:scene:cancel` | Annuler une scène en cours | `{ sceneId: string }` |
| `rfxcom:scene:list` | Lister toutes les scènes | `{ scenes: SceneConfig[] }` |
| `rfxcom:scene:created` | Scène créée | `{ scene: SceneConfig }` |
| `rfxcom:scene:updated` | Scène mise à jour | `{ scene: SceneConfig }` |
| `rfxcom:scene:deleted` | Scène supprimée | `{ sceneId: string }` |

#### 14.3.6 États des Scènes
| État | Description | Événement EventBus | Événement Socket.io |
|------|-------------|-------------------|-------------------|
| `scene_pending` | Scène en attente d'exécution | `rfxcom:scene:status` | - |
| `scene_executing` | Scène en cours d'exécution | `rfxcom:scene:status` | - |
| `scene_completed` | Scène terminée avec succès | `rfxcom:scene:executed` | `rfxcom:scene:executed` |
| `scene_failed` | Scène terminée avec erreurs | `rfxcom:scene:executed` | `rfxcom:scene:executed` |
| `scene_cancelled` | Scène annulée | `rfxcom:scene:executed` | `rfxcom:scene:executed` |

### 14.4 Commandes Spécifiques aux Récepteurs Dimmables

Pour les récepteurs avec `isDimmable: true` :

| Commande HA | Action RFXCOM | Conversion |
|--------------|----------------|-----------|
| `turn_on` | Envoi ON avec dernier niveau | Utilise `defaultLevel` ou 100% |
| `turn_off` | Envoi OFF | - |
| `toggle` | Basculer ON/OFF | Inverse l'état actuel |
| `set_level` | Envoi ON avec niveau spécifié | `level = brightness * 255 / 100` |

**Note** : Le niveau RFXCOM est en **0-255**, tandis que HA utilise **0-100%**.

### 14.5 Commandes Spécifiques aux Covers

Pour les récepteurs de type `cover` :

| Commande HA | Action RFXCOM | Paramètres |
|--------------|----------------|------------|
| `open` | Envoi OPEN au device | `duration = openTimeSec * 1000` |
| `close` | Envoi CLOSE au device | `duration = closeTimeSec * 1000` |
| `stop` | Envoi STOP au device | - |
| `set_position` | Envoi SET_POSITION au device | `position = 0-100%` |

**Timing** : Les délais `openTimeSec` et `closeTimeSec` sont **obligatoires** pour les covers.

---



## 15. Tests

| ID | Description | Type |
|----|-------------|------|
| RFX-001 | Auto-détermination QUOI depuis subType | Unitaire |
| RFX-002 | Génération entity_id/unique_id avec protocole | Unitaire |
| RFX-003 | QUOI = type fonctionnel pur (pas d'endroit) | Unitaire |
| RFX-004 | Lighting = binary_sensor par défaut | Unitaire |
| RFX-005 | Association N↔N émetteurs/récepteurs | Intégration |
| RFX-006 | Configuration variateur via fichier YAML | Intégration |
| RFX-007 | Validation QUOI/OÙ obligatoire | Unitaire |
| RFX-008 | primaryEmitter utilisé pour les commandes HA→RFXCOM | Intégration |

---

## 16. Limites et Contraintes

| Limite | Impact | Solution |
|--------|--------|----------|
| QUOI auto-déterminé | Peut ne pas correspondre | Modifiable dans le fichier YAML |
| Lighting = binary_sensor par défaut | Pas toujours adapté | Configurable via type de récepteur |
| Variateur uniquement via configuration | Pas de détection auto | Configuration manuelle obligatoire |
| Fichier YAML centralisé | Tail important pour beaucoup de devices | Structure optimisée et validation Zod |

---

## 17. Roadmap

### V4 (Terminé)
- [x] Correction noms techniques
- [x] Clarification émetteurs/récepteurs
- [x] QUOI pur, entity_id avec protocole pour TOUS
- [x] Auto-détermination QUOI depuis subType

### V5 (En Cours)
- [x] **Fichier de configuration centralisé** (`config-rfxcom-devices-v1.0.yaml`)
- [x] **primaryEmitter dans chaque récepteur** pour les commandes HA→RFXCOM
- [x] **Liste des émetteurs appairés dans le récepteur** (associations N↔N)
- [x] **Attributs_taxonomie validé pour HA**
- [ ] Implémentation complète
- [ ] Tests d'intégration

---

## 18. Annexes

### 18.1 Références
- [Spécification de Nommage **OBLIGATOIRE**](spec-nommage-v1.0.md) ⭐
- [Spécifications Récepteurs/Émetteurs](specs-recepteurs-emetteurs-rfxcom-v5.0.md)
- [Spécifications Techniques Socle HA-MQTT **OBLIGATOIRE**](specs-techniques-socle-ha-mqtt.md) ⭐
- [Fichier de configuration centralisé](config-rfxcom-devices-v1.0.yaml)

### 18.2 Glossaire
| Terme | Définition |
|-------|------------|
| QUOI | **Type fonctionnel pur** (ex: "Température", "Humidité", "Bouton") |
| OÙ | Localisation hiérarchique (ex: "Salon", "Coin Canapé--Salon") |
| entity_id | `<domain>.<protocole>_<sensorId>` |
| unique_id | `<protocole>_<sensorId>` |
| primaryEmitter | Émetteur principal d'un récepteur, utilisé pour envoyer les commandes RF433 |

### 18.3 Historique
| Version | Date | Auteur | Changements |
|---------|------|--------|------------|
| 1.0 | 2026-07-05 | Mistral Vibe | Version initiale |
| 2.0 | 2026-07-07 | Mistral Vibe | Intégration spec nommage.md |
| 3.0 | 2026-07-08 | Mistral Vibe | Correction noms techniques, clarification émetteurs/récepteurs |
| 4.0 | 2026-07-08 | Mistral Vibe | QUOI pur, entity_id avec protocole pour TOUS, auto-détermination, Lighting=binary_sensor, associations N↔N via UI |
| 5.0 | 2026-07-09 | Mistral Vibe | **Fichier YAML centralisé, primaryEmitter, émetteurs dans récepteur, attributs_taxonomie validé** |

---

*Conforme à [spec-nommage-v1.0.md](spec-nommage-v1.0.md) et [specs-techniques-socle-ha-mqtt.md](specs-techniques-socle-ha-mqtt.md)*
