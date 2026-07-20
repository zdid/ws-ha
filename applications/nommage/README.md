# Application NOMMAGE

**Version :** 1.0.0  
**Date :** 19 Juillet 2026  
**Type :** Intégration MQTT  
**Auteur :** Mistral Vibe

---

## 📋 Description

Application de gestion des **conventions de nommage et taxonomie** pour Home Assistant.

**Fonctionnalités principales :**
- Écoute les **messages de découverte MQTT** émis par d'autres applications
- Parse les noms selon le **format QUOI---OÙ** (basé sur [nommage_specs_v1.0.md](../../specs/current/nommage_specs_v1.0.md))
- Crée la structure taxonomique des **QUOI** (types d'entités) et **OÙ** (hiérarchie géographique)
- Transmet les structures au **core** pour envoi à Home Assistant

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      APPLICATION NOMMAGE                         │
├─────────────────────────────────────────────────────────────────┤
│  domain/                                                      │
│    ├── index.ts             # Déclaration du module + Factory   │
│    ├── NommageService.ts    # Service métier (parsing QUOI/OÙ)  │
│    ├── config-schema.ts    # Schéma Zod de configuration         │
│    ├── socket-events.ts    # Événements Socket.io                │
│    └── types.ts            # Types TypeScript                   │
│                                                                 │
│  ha/                                                        │
│    └── integration/nommage/                                 │
│        └── NommageMqttIntegrationService.ts  # Client MQTT    │
│                                                                 │
│  presentation/                                               │
│    ├── index.html          # UI (affichage statut)              │
│    └── ts/app.ts           # Logique frontend                   │
└─────────────────────────────────────────────────────────────────┘
```

**Couches respectées :**
- **Présentation** : UI avec Socket.io (TypeScript + HTML/CSS)
- **Application** : Cycle de vie géré par AppService (core)
- **Domain (Métier)** : Parsing QUOI/OÙ, transmission au core
- **HA (Intégration)** : Client MQTT pour écouter les messages
- **Infrastructure** : Utilisée depuis le core (Config, Logger, EventBus)

---

## 📡 Flux de Données

```
Autres Applications (RFXCOM, etc.)
    │
    ▼
[MQTT] Message de découverte (ex: ha/sensor/temperature/config)
    │
    ▼
[NOMMAGE] NommageMqttIntegrationService (écoute MQTT)
    │
    ▼
[EventBus] nommage:discovery:raw (message brut)
    │
    ▼
[NOMMAGE] NommageService (parse selon QUOI---OÙ)
    │
    ▼
[EventBus] nommage:discovery:parsed (structure taxonomique)
    │
    ▼
[EventBus] nommage:transmit:to-core (pour envoi à HA)
    │
    ▼
[CORE] Écoute l'événement et envoie à Home Assistant via WS
    │
    ▼
Home Assistant (création des Areas, entités avec attributs taxonomie)
```

---

## 📂 Format des Noms (QUOI---OÙ)

Basé sur [nommage_specs_v1.0.md](../../specs/current/nommage_specs_v1.0.md) :

```
quoi---lieu_precis--lieu--lieu_pere--lieu_grand_pere
```

**Exemples :**
| Chaîne MQTT | QUOI | Lieu Précis | Lieu (Area HA) | Lieu Père (Floor) | Lieu Grand-Père |
|-------------|------|-------------|----------------|------------------|-----------------|
| `Température---Capteur Fenêtre--Salon--Rez-de-Chaussée--Maison` | Température | Capteur Fenêtre | Salon | Rez-de-Chaussée | Maison |
| `Lumière---Plan de Travail--Atelier` | Lumière | Plan de Travail | Atelier | - | - |
| `Prise Connectée---Salon` | Prise Connectée | - | Salon | - | - |

**Règles :**
- **`---`** (3 tirets) : sépare **QUOI** et **OÙ**
- **`--`** (2 tirets) : sépare les niveaux géographiques
- **N = 1** : seul le LIEU est présent (obligatoire)
- **N = 2** : LIEU PRÉCIS + LIEU
- **N = 3** : LIEU PRÉCIS + LIEU + LIEU PÈRE
- **N ≥ 4** : LIEU PRÉCIS + LIEU + LIEU PÈRE + LIEU GRAND-PÈRE

---

## 🚀 Installation

### 1. Activer l'application

L'application est **automatiquement détectée** par AppService si elle est dans `applications/nommage/`.

```bash
# Déplacer l'application des désactivées vers activées
mv applications_desactivees/nommage applications/

# Ou créer un symlink
ln -s applications_desactivees/nommage applications/nommage
```

### 2. Configuration MQTT

Ajouter dans `data/config.yaml` :

```yaml
nommage:
  enabled: true
  
  mqtt:
    host: "192.168.1.100"      # Adresse du broker MQTT
    port: 1883                  # Port MQTT
    username: "user"           # Optionnel
    password: "password"       # Optionnel
    clientId: "nommage-app"
    
    # Topics à écouter pour la découverte
    discoveryTopics:
      - "ha/+/+/config"
      - "homeassistant/+/+/config"
      - "homeassistant/+/+/discovery"
    
    # Préfixe des topics (ex: "ha/" ou "homeassistant/")
    topicPrefix: "ha/"
    
    qos: 1
    retain: true
    useTls: false
    
  ha:
    autoTransmit: true       # Transmettre automatiquement à HA
    defaultComponent: "sensor"
    defaultDomain: "sensor"
    objectIdPrefix: "nommage_"
    autoCreateAreas: true
    injectTaxonomyAttributes: true
    
  logging:
    level: "info"
    showRawMessages: false
    showParsedMessages: false
```

### 3. Configurer le Core

Pour que le core envoie les structures à HA, il faut qu'il écoute l'événement `nommage:transmit:to-core`.

**À ajouter dans le core (AppService ou HaMqttIntegrationService) :**

```typescript
// Dans le core, écouter les événements de NOMMAGE
this.eventBus.on('nommage:transmit:to-core', (data) => {
  // data = { discoveryMessage, parsedTaxonomy, timestamp }
  
  // Récupérer la structure parsée
  const parsed = data.parsedTaxonomy;
  
  // Créer les Areas dans HA si nécessaire
  if (parsed.ou.lieu && this.config.ha.autoCreateAreas) {
    this.haStructureRegistry.ensureAreaExists(parsed.ou.lieu.raw);
  }
  
  // Publier la découverte MQTT vers HA
  this.haMqttIntegrationService.publishDiscovery(
    parsed.haAttributes.device_class || 'sensor',
    parsed.haEntityId,
    {
      name: parsed.quoi.raw,
      unique_id: parsed.haEntityId,
      device_class: parsed.haAttributes.device_class,
      ...parsed.haAttributes
    }
  );
});
```

---

## 🎛️ Configuration via UI

L'application NOMMAGE fournit une interface de configuration accessible via :
- **Paramètres Techniques > Gestion des Applications > NOMMAGE > Configurer**

**Sections configurables :**
1. **MQTT** : Connexion au broker (host, port, credentials, topics)
2. **Home Assistant** : Paramètres de transmission (composant, domaine, préfixe)
3. **Logging** : Niveau de logs et options de débogage

---

## 📊 Interface Utilisateur

L'UI minimale affiche :
- ✅ Statut de connexion (Application + MQTT)
- 📋 Liste des topics de découverte MQTT
- 📊 Compteur des messages parsés
- ⏱️ Date du dernier parsing

**URL :** `http://localhost:8080/applications/nommage/presentation/index.html`

---

## 🔌 Événements Socket.io

### Événements Server → Client (Backend → UI)

| Événement | Description | Payload |
|-----------|-------------|---------|
| `nommage:status` | Statut actuel de l'application | `NommageStatus` |
| `nommage:discovery:received` | Message de découverte reçu | `DiscoveryMessage` |
| `nommage:discovery:parsed` | Message de découverte parsé | `{ rawMessage, parsedTaxonomy }` |
| `nommage:taxonomy:structure` | Structure taxonomique complète | `{ structures, count }` |
| `nommage:transmission:sent` | Transmission réussie vers HA | - |
| `nommage:transmission:failed` | Erreur de transmission | `{ error }` |
| `nommage:error` | Erreur interne | `{ message, error }` |

### Événements Client → Server (UI → Backend)

| Événement | Description | Payload |
|-----------|-------------|---------|
| `nommage:status:get` | Demander le statut | - |
| `nommage:taxonomy:get` | Demander la structure taxonomique | - |
| `nommage:discovery:refresh` | Rafraîchir les messages de découverte | - |
| `nommage:config:save` | Sauvegarder la configuration | `Partial<NommageConfig>` |

### Événements Internes (EventBus)

| Événement | Description | Payload |
|-----------|-------------|---------|
| `nommage:discovery:raw` | Message brut de découverte | `DiscoveryMessage` |
| `nommage:mqtt:status` | Statut de la connexion MQTT | `{ connected: boolean }` |
| `nommage:transmit:to-core` | Transmission au core pour HA | `{ discoveryMessage, parsedTaxonomy }` |

---

## 📦 Dépendances

**NPM (package.json) :**
```json
{
  "dependencies": {
    "mqtt": "^5.0.0"
  },
  "devDependencies": {
    "@types/mqtt": "^2.0.0"
  }
}
```

---

## 🔄 Cycle de Vie

```
Démarrage AppService
    │
    ▼
Détection du module "nommage" (applications/nommage/)
    │
    ▼
Instanciation: createNommageService(eventBus, logger, configProvider)
    │
    ▼
Connexion MQTT (NommageMqttIntegrationService.connect())
    │
    ▼
Abonnement aux topics de découverte
    │
    ▼
Appel automatique: .start()
    │
    ▼
✅ Service démarré - Prêt à écouter les messages MQTT
```

---

## 🐛 Dépannage

### Problème : L'application ne démarre pas

**Vérifications :**
1. Le répertoire est bien dans `applications/nommage/` (pas dans `applications_desactivees/`)
2. Le fichier `domain/index.ts` exporte bien `NOMMAGE_APP` et `createNommageService`
3. La configuration dans `data/config.yaml` est valide (validation Zod)
4. Le broker MQTT est accessible depuis le conteneur

**Logs à vérifier :**
```bash
# Voir les logs de l'application
tail -f logs/app.log | grep -i nommage
```

### Problème : Aucun message n'est parsé

**Vérifications :**
1. Le broker MQTT est bien configuré (host, port)
2. Les topics de découverte sont corrects
3. Les messages MQTT contiennent bien un champ `name` ou `raw_name`
4. Le format des noms est bien `quoi---ou` (avec `---`)

**Activer les logs de débogage :**
```yaml
nommage:
  logging:
    level: debug
    showRawMessages: true
    showParsedMessages: true
```

### Problème : Les structures ne sont pas envoyées à HA

**Vérifications :**
1. `ha.autoTransmit` est bien à `true` dans la configuration
2. Le core écoute bien l'événement `nommage:transmit:to-core`
3. La connexion WebSocket HA est fonctionnelle

---

## 📚 Documentation Connexe

- [Spécifications Techniques Socle v4.6](../../specs/current/techniques-socle-ha-mqtt_specs_v4.6.md)
- [Spécifications de Nommage v1.0](../../specs/current/nommage_specs_v1.0.md)
- [Guide Nouvelle Application v1.0](../../specs/current/guide-nouvelle-application_specs_v1.0.md)
- [PROMPT_PROJET.md](../../PROMPT_PROJET.md) - Règles générales
- [PROMPT.md](../../PROMPT.md) - Instructions pour Vibe

---

## 🏷️ Metadata

- **ID :** `nommage`
- **Type :** `integration`
- **Version :** `1.0.0`
- **Dernière modification :** 19 Juillet 2026
- **Dépendances :** mqtt@^5.0.0
- **Licence :** MIT

---

*Document généré par Mistral Vibe*
*Co-Authored-By: Mistral Vibe <vibe@mistral.ai>*
