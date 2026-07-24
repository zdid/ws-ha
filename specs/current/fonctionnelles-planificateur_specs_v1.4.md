# Spécifications Fonctionnelles — Application PLANIFICATEUR

**Version :** 1.4
**Date :** 24 Juillet 2026
**Statut :** Document de référence pour l'application `applications/planificateur`

> Conforme à `techniques-socle-ha-mqtt_specs` (architecture 5 couches, EventBus,
> `HaStructureRegistry`), `nommage_specs` (taxonomie QUOI/OÙ), `guide-nouvelle-application_specs`.
> À lire avec `fonctionnelles-ia_specs`, l'application complémentaire avec laquelle `planificateur`
> communique.

## 1. Contexte

`applications/planificateur` stocke les macros et planifications domotiques exprimées en langage
naturel (reçues sous forme de JSON structuré, produit par `applications/ia` à partir des règles
domotiques appliquées à une conversation Mistral), calcule les échéances de déclenchement, et —
principe central du système — **redemande systématiquement à `ia` d'interpréter la planification au
moment précis de son déclenchement**, plutôt que d'exécuter une version pré-compilée.

Rien n'est jamais figé en code exécutable. Le champ `phrase_originale` reste, à tout moment, la
seule source de vérité d'une planification ; le JSON qui l'accompagne n'en est qu'une dérivation
transitoire, régénérée à chaque exécution à partir du contexte réel du moment (état des appareils,
heure, macros connues).

`planificateur` est le **seul point d'exécution** du système — toute action réelle sur HA, quelle
que soit son origine (planification programmée, macro dite directement, ou appel d'outil résolu en
direct par `ia`, voir §6), passe systématiquement par lui.

`type: 'standalone'`, `requiredMqtt: false` (aucune connexion MQTT propre), `requiredHaWs: true`
(utilise `HaStructureRegistry` pour l'état/la résolution des entités et `HaWsClient`/
`HaCommandService` pour l'exécution).

## 2. Modèle de données

Le JSON échangé avec `ia` est un arbre de nœuds s'imbriquant librement, sans limite de profondeur.
Chaque nœud porte un champ `type` discriminant :

| `type` | Rôle |
|--------|------|
| `action` | Un ordre unique (`order`, `verbe`, `quoi`, `lieux`) — **toujours un sous-nœud**, jamais une réponse de premier niveau (voir `fonctionnelles-ia_specs` §9). C'est aussi la forme exacte des paramètres de l'outil `executer_action` (`fonctionnelles-ia_specs` §7) |
| `wait` | Une attente, durée fixe ou plage aléatoire (bornes toujours exprimées) |
| `condition` | Logique conditionnelle (`if`/`then`/`else?`), `else` optionnel |
| `macro_ref` | Référence à une macro existante par son nom |
| `sequence` | Plusieurs nœuds au même niveau |
| `macro` | Définition nommée d'une séquence d'étapes, stockée telle quelle |
| `planification` | Une macro/action associée à un déclencheur temporel (`trigger`) |
| `gestion` | Opération sur une macro/planification existante (§4) |
| `execution` | Séquence plate produite par `ia`, à chaque déploiement (§6) — jamais stockée |

`ActionNode` et chaque étape d'une séquence d'exécution portent en plus un champ optionnel
`resolved_service_call` (`domain`/`service`/`entity_id`/`data`). **Ce n'est pas Mistral qui le
peuple** : c'est `planificateur` lui-même, par résolution déterministe (§7), à partir de l'intention
`verbe`/`quoi`/`lieux` — voir §8 pour son usage à l'exécution.

Le nom d'une macro ou d'une planification est conservé exactement tel que formulé par
l'utilisateur (pas de normalisation, casse et accents préservés) — c'est ce nom qui sert
d'identifiant pour les opérations de gestion (§4).

## 3. Déclencheurs (`trigger`)

| Type | Exemple de formulation | Comportement |
|------|------------------------|---------------|
| `delay` | "dans 10 minutes" | Ponctuel, délai fixe ou plage aléatoire |
| `time` | "à 18h15" | Quotidien, heure fixe ou plage aléatoire |
| `date` | "le 15 juin" | Ponctuel, date précise |
| `recurrence` | "tous les jours à 18h", "sauf week-end" | Récurrent, jours inclus/exclus |
| `recurrence_complex` | "le dernier jour du mois", "premier lundi" | Récurrent, motif calculé |
| `window` | "de 18h à 22h" | Plage active |
| `duration` | "pendant 10 minutes" | Génère automatiquement une action de fin |

`{type:"delay", seconds:0}` sert aussi à représenter une **exécution immédiate et non répétitive** —
notamment celle d'un appel d'outil `executer_action` résolu en direct (§6) : aucun nouveau type de
déclencheur n'est nécessaire, `delay` n'étant déjà pas récurrent dans le scheduler.

Toute plage aléatoire (durée "entre X et Y", heure "entre X et Y") est résolue en une valeur fixe
**au moment du calcul du prochain délai**, jamais figée une fois pour toutes — un déclenchement
récurrent avec plage aléatoire tire une nouvelle valeur à chaque occurrence.

Cette résolution — transformer un `trigger` déjà structuré en délai exact (millisecondes,
prochaine date de calendrier) — est un calcul déterministe fait entièrement en code par
`planificateur` (motifs de date, résolution d'aléatoire compris). **Ce n'est jamais l'IA qui
calcule ce délai** : son rôle s'arrête à l'interprétation, une fois, de la phrase en `trigger`
structuré au moment de la création (§4) — recalculer une date/heure est une tâche déterministe hors
du périmètre du langage naturel, pour laquelle un calcul de code est strictement plus fiable, plus
rapide, et sans risque d'erreur arithmétique qu'une nouvelle interrogation de l'IA à chaque
occurrence.

## 4. Gestion des macros et planifications

Opérations disponibles (nœud `gestion`, champ `operation`) : `lister`, `activer`, `desactiver`,
`supprimer`, `modifier`. Cible (`cible`) : `planification`, `macro`, ou `tout` (uniquement pour
`lister`).

**Les opérations ne sont pas toutes valables pour les deux cibles** : `activer`/`desactiver`/
`modifier` ne s'appliquent qu'aux **planifications** — une macro n'a pas d'état actif/inactif,
c'est une définition disponible par son nom, jamais "programmée". Seuls `lister` et `supprimer`
s'appliquent aux macros. Une planification désactivée reste stockée mais n'a plus de minuteur
actif ; sa réactivation la reprogramme immédiatement selon son `trigger`.

## 5. Stockage

Deux fichiers YAML locaux, gitignorés comme tout `data/` — `data/planificateur/planificateur-macros-v1.0.yaml` et
`data/planificateur/planificateur-planifications-v1.0.yaml` — gérés par un `ConfigFileManager` sur le même
principe que RFXCOM/AREXX : validation Zod avant écriture, écriture atomique (fichier temporaire
puis renommage), copie de sauvegarde `.bak` du fichier précédent conservée à chaque sauvegarde.

`data/planificateur/config.yaml` (objet nu, ex-section `planificateur` de l'ancien fichier unique
— voir `techniques-socle-ha-mqtt_specs` §7) ne garde que les paramètres généraux — pas de
connexion MQTT propre à héberger, contrairement à EVOO7/Nommage.

Toutes les planifications actives sont reprogrammées automatiquement au démarrage du service, à
partir du contenu chargé depuis le fichier de planifications.

## 6. La boucle de déploiement — trois déclencheurs, un seul mécanisme

C'est le comportement structurant de l'application, celui qui garantit qu'aucune planification ni
macro n'est jamais exécutée depuis une version figée. **Trois situations distinctes y aboutissent,
toutes vers le même point d'exécution unique :**

- **Un déclencheur programmé arrive à échéance** (§3) — `planificateur`, via son minuteur, initie
  la boucle.
- **L'utilisateur prononce directement le nom d'une macro connue** ("je vais me coucher") — `ia`,
  ayant la liste des macros en contexte, reconnaît la correspondance et initie immédiatement le
  même déploiement.
- **Un appel d'outil `executer_action` est résolu** (`fonctionnelles-ia_specs` §7/§8) — traité comme
  une planification à un seul coup, immédiate et non répétitive (`trigger: {type:"delay",
  seconds:0}`, §3), envoyée au même point d'exécution.

Dans les trois cas, le même mécanisme de déploiement s'applique et produit le même format de sortie
(`execution`) :

1. Construction d'un **contexte de déploiement** : la `phrase_originale` (de la planification
   déclenchée, de l'utterance qui a nommé la macro, ou de la phrase à l'origine de l'appel d'outil),
   le contenu intégral de toutes les macros connues, l'état courant des entités HA concernées
   (`HaStructureRegistry.getAllEntities()` du socle — jamais un client HA maison, l'entité renvoyée
   porte déjà un état vivant, mis à jour en temps réel), et l'horodatage courant.
2. Interrogation de Mistral (via `ia`) avec les mêmes règles domotiques que pour une conversation
   normale.
3. Réponse sous forme d'`ExecutionPayload` — une séquence **plate et linéaire** : toute `macro_ref`
   déjà déployée récursivement (plus aucune référence dans le résultat), toute `condition` déjà
   évaluée et résolue (le nœud disparaît, seule la branche retenue subsiste), tout aléatoire déjà
   résolu en valeur fixe.
4. `planificateur` exécute chaque étape de la séquence reçue, dans l'ordre (§7, §8) — quelle que
   soit l'origine du déclenchement, `planificateur` reste toujours le seul exécuteur final.

Une macro qui s'appelle elle-même directement ou indirectement (boucle infinie) est détectée côté
`ia` avant l'envoi du résultat, dans les trois cas de figure — `planificateur` ne reçoit jamais de
séquence bouclée.

## 7. Résolution des actions vers un service HA

Une étape `action` porte une intention exprimée avec le vocabulaire QUOI/OÙ (`verbe`, `quoi`,
`lieux`, `valeur?`) — jamais directement un service HA nommé, Mistral ne connaissant pas la
nomenclature interne de HA. `planificateur` la résout en `resolved_service_call` (§2) selon deux
niveaux :

1. **Verbes sans valeur associée** (allumer, éteindre, basculer) → services **génériques** de HA
   (`homeassistant.turn_on`/`turn_off`/`toggle`), qui routent eux-mêmes vers le domaine réel de
   l'entité ciblée (`light`, `switch`, ...) — pas besoin de connaître ce domaine à l'avance.
2. **Verbes portant une valeur** (baisser/augmenter une luminosité, régler une température, ouvrir
   un volet à un pourcentage) → service spécifique au domaine concerné (`light.turn_on` avec
   `brightness_pct`, `climate.set_temperature`, `cover.set_cover_position`, ...) — HA n'a pas
   d'équivalent générique pour ces cas.

Cette table verbe→service **prolonge** la table verbe→quoi déjà définie dans les règles domotiques
(`regles_mistral.txt` §0.1) — même liste de verbes, une colonne supplémentaire côté code plutôt
qu'une nouvelle table indépendante à maintenir.

L'entité ciblée (`entity_id`) est résolue séparément, via `HaStructureRegistry`, à partir du couple
`quoi`/`lieux` — la même taxonomie que celle utilisée partout ailleurs dans le socle.

Si le verbe n'est pas connu de cette table (ambigu, nouveau, non encore prévu), la résolution
échoue silencieusement et `resolved_service_call` reste absent — voir §8 pour le repli associé.

## 8. Exécution des actions

Étape `wait` : simple attente (durée déjà résolue en secondes par `ia`, §6).

Étape `action` :
- Si `resolved_service_call` a pu être calculé (§7) : exécution **directe** via
  `HaCommandService.sendCommand()`/`HaWsClient.sendCommand()` (déjà disponibles dans le socle, avec
  retry/timeout) — chemin principal, rapide, déterministe.
- Sinon (verbe non résolu) : **repli** sur l'agent de conversation natif de Home Assistant
  (`HaWsClient.processConversation(order, language)`, nouvelle méthode du socle) — le texte de
  l'ordre en langage naturel (`order`) est transmis tel quel, HA reste responsable de le traduire
  en commande réelle. Filet de sécurité pour les cas non couverts par la table du §7, pas le
  chemin principal.

## 9. Communication interne (EventBus)

Voir `fonctionnelles-ia_specs` §11 pour la table complète des événements (`ia:command`/`:reply`,
`ia:tool:execute`/`:reply`, `planificateur:deploy`/`:reply`) — même helper de corrélation local des
deux côtés, pas de mécanisme partagé fourni par le socle.

## 10. Configuration

`data/planificateur/config.yaml` : noms/emplacement des fichiers de données (§5),
paramètres du délai d'attente pour les échanges avec `ia`.

## 11. UI

Tableau de bord : nombre de macros et de planifications actives, prochain déclenchement à venir.
Page dédiée : liste des macros et planifications (nom, statut actif/inactif, phrase d'origine),
actions activer/désactiver/supprimer (§4 : uniquement pertinentes pour les planifications, sauf
suppression qui s'applique aussi aux macros) — l'affichage du contenu JSON complet (étapes d'une
macro, détail d'un déclencheur) reste à concevoir en détail lors de l'implémentation de l'UI, plus
riche qu'un simple tableau.

## 12. Limitations connues / décisions

- **Stockage en fichiers locaux**, pas via Home Assistant — décision alignée sur le reste du socle
  (RFXCOM, AREXX, EVOO7 stockent tous en local). Une synchronisation multi-machines des
  planifications via HA resterait à concevoir séparément si ce besoin devenait réel, hors périmètre
  de cette version.
- La table verbe→service (§7) ne couvre que les verbes déjà connus des règles domotiques — tout
  nouveau verbe nécessite une mise à jour synchronisée des deux côtés (prompt et table de
  résolution), sans quoi il retombe silencieusement sur le repli du §8.
- Le repli vers l'agent de conversation HA (§8) dépend de sa disponibilité au moment précis du
  déclenchement — pas de nouvelle tentative automatique ; à surveiller en usage réel.

## 13. Historique

| Version | Date | Auteur | Changements |
|---------|------|--------|-------------|
| 1.3 | 23/07/2026 | Claude | **Révision majeure**, en miroir de `fonctionnelles-ia_specs` v1.3 : `resolved_service_call` n'est plus un placeholder inactif — c'est le mécanisme d'exécution **principal**, peuplé par `planificateur` lui-même (nouvelle §7 "Résolution des actions vers un service HA", table verbe→service à deux niveaux, prolongeant la table verbe→quoi des règles domotiques). §6 réécrite : trois déclencheurs convergent désormais vers le point d'exécution unique (minuteur, macro directe, **appel d'outil résolu** — nouveau, traité comme planification immédiate via `{type:"delay",seconds:0}`). §8 (ancienne §7) réécrite : exécution directe via `resolved_service_call` en chemin principal, agent de conversation HA relégué en repli. Toutes les références vers `fonctionnelles-ia_specs` corrigées suite à sa renumérotation. |
| 1.2 | 23/07/2026 | Claude | Corrections de références croisées uniquement, suite à la renumérotation de `fonctionnelles-ia_specs` en v1.2. |
| 1.1 | 23/07/2026 | Claude | Clarification §4 : `activer`/`desactiver`/`modifier` ne s'appliquent qu'aux planifications. §6 réécrite : deux déclencheurs (minuteur, macro directe) convergent vers le même mécanisme. §3 : précision que la résolution trigger→délai est un calcul déterministe en code, jamais fait par l'IA. |
| 1.0 | 23/07/2026 | Claude | Version initiale — spécification de l'application avant implémentation. |
