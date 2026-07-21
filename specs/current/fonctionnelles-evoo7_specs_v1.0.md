# Spécifications Fonctionnelles — Application EVOO7

**Version :** 1.0
**Date :** 21 Juillet 2026
**Statut :** Document de référence pour l'application `applications/evoo7`

> Conforme à `techniques-socle-ha-mqtt_specs` (architecture 5 couches, EventBus, MQTT du socle),
> `nommage_specs` (taxonomie QUOI/OÙ), `guide-nouvelle-application_specs`.

---

## 1. Contexte

EVOO7 Control (VR Electronique) est un régulateur de chauffage/PAC exposant ses données via un
plugin MQTT propre (interface web `http://<host-evoo7>:8082`, onglets "EVOO7 Domotique" /
"Paramétrage" / "Données"). EVOO7 a son propre dialecte MQTT — topics fixes par donnée pour l'état
(`Sensor`), un seul topic partagé pour les commandes, placeholders `$name$`/`$value$`/`$date$` —
distinct du format normalisé du socle HA-MQTT de ce projet.

`applications/evoo7` joue le rôle de traducteur/"postier" entre ces deux mondes, sur le même
principe que RFXCOM/nommage : **deux connexions MQTT indépendantes** — l'une vers le broker EVOO7
(propre à l'application), l'autre via le socle vers le broker HA (mécanisme générique
`integration:evoo7:discovery/:state/:command`, identique à RFXCOM). Aucune modification du socle
n'a été nécessaire au-delà d'un correctif générique déjà en place depuis les scènes RFXCOM
(abonnement automatique aux commandes, voir `techniques-socle-ha-mqtt_specs` §8.5.2).

## 2. Source des données

Le fichier `applications/evoo7/seed/evoo7_donnees.json` liste les 43 données connues d'EVOO7
Control, capturées depuis les onglets réels d'EVOO7 le 21/07/2026, puis **enrichies** avec les
codes numériques des données à liste de valeurs (retrouvés dans les commentaires HTML de la page
EVOO7 — absents du JSON initialement fourni). Ce fichier sert de **seed** : au premier démarrage,
si `data/config-evoo7-donnees-v1.0.yaml` n'existe pas encore, il est généré à partir de ce JSON
(voir §4). Le JSON n'est plus relu ensuite — toute évolution ultérieure passe par le YAML.

## 3. Modèle de donnée

Chaque donnée EVOO7 (`Evoo7DataDefinition`, `applications/evoo7/src/domain/types.ts`) porte quatre
champs de sélection, de deux natures différentes :

### 3.1 Champs figés (dérivés une fois du JSON source, jamais modifiés par l'UI)

| Champ | Dérivation | Rôle |
|-------|-----------|------|
| `updatable` | `mise_a_jour !== null` dans le JSON source | Conditionne l'affichage de la case "Mise à jour" dans notre UI — si `false`, la donnée n'est **jamais** modifiable (la case "Mise à jour" n'existe tout simplement pas sur EVOO7 pour cette donnée). |
| `isConfigData` | `!consultation_originale` dans le JSON source | 8 données sur 43 étaient cochées "Consultation" d'origine sur EVOO7 (mesures/états : `temp_amb`, `temp_ext`, `fact_corr_ambiance`, `decalage_tdeg_ambiante`, `etat_fonctionnement`, `etat_circulateur_radiateur`, `consigne_normal`, `consigne_eco`) — ce sont les seules données **non-config** au sens HA. Les 35 autres sont des données de configuration : `isConfigData=true` pilote `entity_category: "config"` dans la découverte HA (omis pour les 8 non-config). |

### 3.2 Champs modifiables par l'utilisateur (persistés dans le YAML, valeur initiale = JSON source)

| Champ | Rôle |
|-------|------|
| `consultation` | Abonnement au topic Sensor de la donnée + publication découverte/état. |
| `miseAJour` | N'a de sens que si `updatable=true` — active la commande HA→EVOO7. Forcé à `false` silencieusement si `updatable=false`. |
| `topicSensor` / `formatMessageSensor` | Surchargeables par donnée (le seed capture les valeurs par défaut actuelles d'EVOO7). |

**Règle de découverte** : `integration:evoo7:discovery` est émis pour une donnée ssi
`consultation === true OU miseAJour === true`.

## 4. Fichier de configuration centralisé

`data/config-evoo7-donnees-v1.0.yaml` (racine du projet, gitignored comme tout `data/`) —
`ConfigFileManager` (`applications/evoo7/src/domain/yaml/ConfigFileManager.ts`) : chargement,
validation Zod, sauvegarde atomique (tmp→rename) avec backup `.bak`, **pré-remplissage depuis le
seed** si absent (contrairement à RFXCOM dont le fichier de devices démarre vide — les 43 données
EVOO7 sont connues à l'avance).

`data/config.yaml` (section `evoo7`) ne garde que les paramètres généraux : connexion au broker
EVOO7 (host/port/user/pass/qos, indépendante du broker HA), `bridgeInstance` (défaut
`evoo7_bridge_0001`), topic + format du message de commande global EVOO7.

## 5. Détermination du composant HA

`determineComponent()` (`applications/evoo7/src/domain/classification.ts`) :

| Forme de la donnée | `updatable=true` | `updatable=false` |
|---|---|---|
| `min`/`max` (nombre) | `number` | `sensor` |
| `valeursPossibles` (liste de valeurs) | **`sensor`** (jamais commandable — voir §6) | `sensor` |
| ni l'un ni l'autre (texte libre) | `text` | `sensor` |

Toutes les entités partagent le même bloc `device` HA (`identifiers: ["evoo7_control"]`, un seul
système logique — pas de sous-devices comme RFXCOM).

## 6. ⚠️ Limitation connue : listes de valeurs non traduites

Les codes numériques documentés dans les commentaires HTML de la page de configuration EVOO7
(ex: `etat_fonctionnement` → `0=Arrêt, 1=Chauffage, 2=Raffraichissement`) **ne correspondent pas
aux valeurs réellement observées sur le fil MQTT** — vérifié en conditions réelles par sniffing du
broker EVOO7 (`192.168.1.53:1883`) : `etat_fonctionnement` publie en réalité le mot littéral
`"on"`, pas un code numérique. Traduire ces codes aurait exposé un risque réel d'envoyer une
commande incorrecte à EVOO7 (ex: sélectionner "Chauffage" dans HA → traduction vers `"1"` →
valeur potentiellement sans effet ou erronée sur le système réel).

**Décision (validée avec l'utilisateur)** : toute donnée à liste de valeurs est exposée en lecture
seule (`sensor`, valeur brute passthrough, `value_template: "{{ value_json.state }}"`), sans
aucune traduction ni commande, quelle que soit la valeur de `updatable`/`miseAJour`. Les tables de
correspondance code↔libellé extraites d'EVOO7 (`Evoo7ValeurPossible[]`) restent stockées et
affichées dans l'UI à titre informatif (`buildLabelToCodeMap`/`buildCodeToLabelMap`), mais ne sont
plus utilisées pour la traduction runtime. Une réévaluation future nécessiterait d'observer le
trafic réel de chaque donnée énumérée (y compris en changeant effectivement l'état du chauffage
pour couvrir toutes les valeurs) plutôt que de se fier à la documentation de la page EVOO7.

## 7. Templates HA (value_template / command_template)

Le topic d'état de notre socle porte toujours une enveloppe JSON `{"state": ..., "attributes":
{...}}` (`HaMqttStateMessage`) — `value_template` lit donc systématiquement `value_json.state`
(jamais `value` nu), quel que soit le composant.

`command_template` (nécessaire pour `number`/`text` uniquement — jamais pour `sensor`) encapsule
la valeur brute publiée par HA dans `{"value": ...}` : notre socle exige du JSON strict sur le
topic de commande (`parseIncomingCommand` fait un `JSON.parse` strict), alors que HA publie par
défaut du texte brut non-JSON pour ces composants.

- `number` : `{"value": {{ value }} }` (valeur numérique non quotée)
- `text` : `{"value": "{{ value }}"}` (valeur quotée)

Le serveur (`Evoo7Service.handleHaCommand`) lit ensuite simplement `payload.value`, déjà prêt à
transmettre à EVOO7 — aucune traduction côté serveur.

## 8. Flux de données

### 8.1 État EVOO7 → HA

1. `Evoo7MqttClient` (connexion dédiée au broker EVOO7) reçoit un message JSON sur le topic Sensor
   d'une donnée sélectionnée (`consultation=true`) — topic résolu via substitution `$name$` → id.
2. `extractSensorValue()` extrait la clé `status` du payload (clé constante dans les 43 formats
   connus — pas besoin de reverse-parser `formatMessageSensor`).
3. `Evoo7Service` publie `integration:evoo7:state {bridgeInstance, deviceId: id, state: {state:
   value, attributes: {evoo7_id: id}}}` — valeur brute relayée telle quelle, aucune traduction.

### 8.2 Commande HA → EVOO7

1. HA publie sur le topic de commande de l'entité (déjà encapsulé en JSON par `command_template`).
2. Le socle route vers `integration:evoo7:command {deviceId, command: {value}}`.
3. `Evoo7Service.handleHaCommand` vérifie `updatable && miseAJour` et que le composant n'est pas
   `sensor` (défense en profondeur — la découverte ne publie jamais de `command_topic` pour les
   énumérations), puis construit le message EVOO7 (`resolveCommandMessage`, substitution
   `$name$`/`$value$` dans `formatMessageCommand`) et le publie sur le topic Commande unique
   d'EVOO7 via `Evoo7MqttClient`.

⚠️ Pas de confirmation immédiate : si la donnée n'est pas aussi en `consultation=true`, HA ne
recevra jamais d'écho de la nouvelle valeur tant qu'EVOO7 ne republie pas spontanément sur son
propre cycle de rafraîchissement.

## 9. Démarrage / cycle de vie

La découverte HA (`publishInitialDiscoveries`) est déclenchée par le **premier événement
`integration:evoo7:bridge:connection {connected: true}`**, jamais synchronement après
`integration:bridge:register` — `HaMqttIntegrationService.connectBridge()` est asynchrone en
arrière-plan (pas de garantie que le bridge socle soit connecté au broker HA au moment où le
handler d'enregistrement retourne) ; publier avant provoquerait un throw synchrone
(`MqttTransport.publish`: "Cannot publish: MQTT client is not connected") qui ferait échouer tout
le démarrage du service (bug réel rencontré et corrigé pendant l'implémentation). La connexion au
broker EVOO7 (`Evoo7MqttClient`) est indépendante — son échec au démarrage produit un `WARNING`,
pas un crash (même contrat que RFXCOM §11.1), et n'empêche pas la découverte HA d'être publiée.

## 10. Socket.io

Voir `applications/evoo7/src/domain/socket-events.ts` (`EVOO7_SOCKET_EVENTS`/`EVOO7_CLIENT_EVENTS`).
Points clés : `evoo7:donnee:set_selection` (consultation/miseAJour), `evoo7:donnee:set_topic`
(surcharge topic/format par donnée), `evoo7:config:get`/`:save` (paramètres généraux — un
changement de connexion broker EVOO7 nécessite un redémarrage du serveur, pas de reconfiguration à
chaud).

## 11. UI

Deux onglets, miroir direct des onglets réels EVOO7 :
- **Paramétrage** : connexion broker EVOO7, `bridgeInstance`, topic + format de commande global.
- **Données** : tableau des 43 données — badge config/donnée (`isConfigData`), contraintes
  (min/max ou liste de valeurs, lecture seule/informatif), case Consultation (toujours visible),
  case Mise à jour (visible ssi la donnée est commandable — `updatable` ET pas une énumération,
  voir §6), topic/format Sensor éditables par donnée.

Dashboard : statut des deux connexions (broker EVOO7, bridge socle), compteurs (données connues,
en consultation, en mise à jour), dernier message reçu.

## 12. Historique

| Version | Date | Auteur | Changements |
|---------|------|--------|-------------|
| 1.0 | 21/07/2026 | Claude | Version initiale — implémentation complète (domaine, MQTT double connexion, UI 2 onglets), validée en conditions réelles sur le broker EVOO7 (`192.168.1.53:1883`) et le broker HA de production (`192.168.1.26:1883`). |
