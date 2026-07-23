# Liste des problèmes à résoudre

## Problèmes prioritaires

### 🟡 Pages dédiées evoo7/rfxcom (Paramétrage & Données / Devices & Récepteurs) injoignables — Corrigé
- **Problème** : `menu.entry.path` et l'entrée `pages[]` "config" pointaient tous les deux vers `/evoo7/config`/`/rfxcom/config` — un chemin interne (jamais une vraie route servie par le serveur), et identique à `entry.path`, donc jamais rendu comme lien distinct par `Sidebar.ts` (`page.path !== entry.path`). Le seul endroit où ce lien apparaissait réellement était un `<a href="/evoo7/config">` en dur dans le tableau de bord de chaque app — un clic dessus donnait un 404. Même chantier que la migration Alpine.js (evoo7/rfxcom n'avaient pas non plus de pipeline de build navigateur pour ces pages dédiées : import `SocketService` cassé, pas de `type="module"`, et — spécifique aux pages de navigation complète, contrairement aux tableaux de bord injectés dans le Shadow DOM du core — pas de script socket.io chargé du tout, `io is not defined` au premier chargement).
- **Correctif** : chemins corrigés vers `/applications/{app}/presentation/{app}/config.html` (réellement servi), pipeline `tsconfig.ui.json` étendu pour compiler aussi `config-app.ts`, script socket.io CDN ajouté à chaque `config.html`.
- **Statut** : Corrigé (2026-07-23)
- **Priorité** : Basse (résolu)

### 🟡 Mock ConfigService incomplet dans AppService.test.ts — Corrigé
- **Problème** : `mockConfigService` (test) n'implémentait pas `ensureModuleSections`, une méthode pourtant appelée par `AppService.start()` — 5 tests plantaient sur ce mannequin de test incomplet, sans rapport avec un bug réel de l'application (même famille que le mock du logger, `getLevel`/`setLevel` manquants, corrigé plus tôt dans la session).
- **Correctif** : `ensureModuleSections: vi.fn()` ajouté au mock.
- **Statut** : Corrigé (2026-07-22)

### 🟡 Classification QUOI jamais implémentée (HaStructureRegistry)
- **Problème** : `HaStructureRegistry.test.ts` (11 tests) attend un classifieur qui assigne des QUOI (`eclairage`, `temperature`...) aux entités selon domaine/device_class — jamais implémenté en pratique. Confirmé par le test ET par l'instantané réel du référentiel HA (`ha-structure-debug.yaml`, toutes les `area.quoi` vides). Les tests sont corrects, c'est la fonctionnalité qui manque.
- **Statut** : Non implémenté
- **Priorité** : Basse pour l'instant (confirmé attendu par l'utilisateur, pas une régression)

### 🔴 Les attributs de taxonomie n'atteignent jamais HA (attributs_taxonomie)
- **Problème** : `rfxcom`/`evoo7`/`nommage` injectent tous `attributs_taxonomie` via `extra: {attributs_taxonomie: buildAttributsTaxonomie(...)}`, fusionné par `buildDiscoveryPayload()` (`applications/core/src/ha/integration/discovery.ts` ligne 77) comme clé de premier niveau dans le message de découverte MQTT (`homeassistant/{component}/{object_id}/config`). Confirmé en direct sur l'instance HA réelle (script de diagnostic jetable, `get_states` sur les 469 entités) : **aucune** n'a `attributs_taxonomie` dans ses attributs réels — HA valide le message de découverte contre un schéma strict par plateforme et ignore silencieusement les clés non reconnues. La fonctionnalité "injecter les attributs de taxonomie" (réglage `ha.injectTaxonomyAttributes` de Nommage, et l'équivalent RFXCOM/EVOO7) n'a donc jamais fonctionné, depuis le début — pas de régression récente, un problème de conception initiale.
- **Cause** : mauvais mécanisme MQTT utilisé. Le mécanisme HA officiel pour attacher des attributs libres à une entité via découverte MQTT est `json_attributes_topic` (+ `json_attributes_template` optionnel) — un champ de découverte qui indique à HA un topic à écouter, dont le JSON reçu est fusionné dans `entity.attributes`. Rien d'équivalent n'existe pour des clés glissées directement dans le message de découverte.
- **À faire** : **pas besoin d'un topic supplémentaire** — le topic d'état (`state_topic`) publie déjà `JSON.stringify({state, attributes})` (`stateCommand.ts::publishState`, `HaMqttStateMessage.attributes` déjà présent dans le type) et `value_template` extrait déjà `{{ value_json.state }}` (convention existante, `evoo7/classification.ts::buildValueTemplate`). Il suffit de : (1) faire pointer `json_attributes_topic` vers ce même `state_topic` dans `buildDiscoveryPayload()` (`discovery.ts`), avec `json_attributes_template: '{{ value_json.attributes | tojson }}'` ; (2) faire porter `attributs_taxonomie` par `HaMqttStateMessage.attributes` au moment de `publishState()`, au lieu du bloc `extra` de la découverte (qui reste utile pour les vraies clés de config reconnues par HA, mais plus pour des attributs libres).
- **Validé en direct (2026-07-22)** : test bout-en-bout sur l'instance HA réelle (device+entité MQTT créés de toutes pièces, découverte avec `json_attributes_topic` pointant vers `state_topic`, état publié avec `attributs_taxonomie` dans `attributes`, puis lu via `get_states`) — les 10 champs de taxonomie apparaissent correctement dans les attributs de l'entité. Solution confirmée fonctionnelle, nettoyé après test (rien laissé sur l'instance HA). Note en passant : l'`entity_id` réel généré par HA combine le nom du device et de l'entité (`has_entity_name`), différent de l'`object_id` fourni — sans impact sur le correctif, juste une nuance à connaître si on compare des `entity_id` en dur quelque part.
- **Implémenté (2026-07-22)** :
  - `discovery.ts` (core) : `buildDiscoveryPayload()` ajoute `json_attributes_topic`/`json_attributes_template` pointant vers le `state_topic` de l'entité, systématiquement.
  - `evoo7` (`Evoo7Service.ts`) et `rfxcom` (`RfxComService.ts` + `ReceiverSwitch`/`ReceiverLight`/`ReceiverCover`) : `attributs_taxonomie` retiré du bloc `extra` de la découverte, porté à la place par `HaMqttStateMessage.attributes` à chaque publication d'état (ils contrôlent leur propre `state_topic`, déjà en JSON `{state, attributes}`).
  - RFXCOM scène (`device_automation`) : `attributs_taxonomie` simplement retiré (pas d'équivalent possible, un déclencheur n'a pas d'entité/attributs au sens HA).
  - `nommage` (`NommageService.ts`) : cas différent — le `state_topic` relayé appartient à la source tierce (Zigbee2MQTT etc.), format hors de notre contrôle. Nouveau topic dédié que NOMMAGE possède (`getAttributesTopic()`, ajouté à `ha-mqtt.ts`), publié via le mécanisme Passthrough existant (`integration:nommage:passthrough:publish`, mode "complet"), déclaré en `json_attributes_topic` dans la découverte relayée.
  - `npm run build` propre sur les 4 packages, tests existants (`core`, seul avec une suite) : mêmes 16 échecs préexistants, aucune régression. Pas de test automatisé dans evoo7/rfxcom/nommage.
- **Statut** : Corrigé
- **Priorité** : Haute (fonctionnalité coeur de la taxonomie, jamais opérationnelle)

### 🟡 Niveau de log jamais synchronisé avec config.yaml au démarrage — Corrigé
- **Problème** : `index.ts` (`initializeDependencies()`) créait le `Logger` avec un niveau codé en dur (`'info'`), jamais lu depuis `logging.level` dans `config.yaml`. Le vrai niveau ne s'appliquait qu'après une sauvegarde de configuration (`config:reload` → `handleConfigReload()` → `logger.setLevel()`) — donc `logging.level: debug` dans le fichier au démarrage était silencieusement ignoré tant qu'aucune sauvegarde n'avait eu lieu depuis. Découvert car il bloquait silencieusement le nouveau traçage debug du référentiel HA (`HaRegistryTracer`) : aucune erreur, juste rien ne se créait.
- **Correctif** : le niveau est maintenant synchronisé juste après le chargement de la config, dès le démarrage.
- **Statut** : Corrigé (2026-07-22)

### 🟡 HaWsClient : device_registry/list lisait le mauvais champ d'identifiant — Corrigé
- **Problème** : `config/device_registry/list` (HA) renvoie l'identifiant du device dans le champ **`id`**, pas `device_id` — contrairement aux areas (`area_id`, correct) et aux entités (`device_id`/`area_id`, corrects). `HaWsClient.loadInitialRegistry()` lisait `rawDevice.device_id` (toujours `undefined`), donc `HaStructureRegistry` stockait chaque device sous la clé `undefined` — ils s'écrasaient tous mutuellement, un seul survivait (109 devices reçus → 1 seul conservé). Découvert et confirmé en direct via un script de diagnostic jetable connecté à l'instance HA réelle, en creusant l'instantané produit par `HaRegistryTracer` (voir ci-dessus).
- **Correctif** : `loadInitialRegistry()` remappe désormais `id` → `device_id` avant de retourner les devices.
- **Statut** : Corrigé (2026-07-22)

### 🟡 Tableaux de bord des apps (Applications) : scripts injectés inertes — Corrigé pour arbreouquoi
- **Contexte** : `ModuleContainer.ts` injecte le `index.html` de chaque app via `innerHTML`, qui n'exécute jamais les `<script>` (comportement standard du DOM). Corrigé le 2026-07-22 en recréant les `<script>` après injection (`executeScripts()`) — combiné à la mise en place d'un vrai pipeline de build navigateur pour `arbreouquoi` (voir plus bas). Testé sur ArbreOuQuoi : toujours la coquille vide (pas d'arbre affiché), deux causes supplémentaires identifiées puis corrigées le 2026-07-23 (préalable nécessaire pour vérifier la migration Alpine.js Phase 2) :
  1. **`DOMContentLoaded` jamais déclenché** : `app.ts` attendait cet événement pour démarrer, mais le script n'est chargé que bien après le chargement initial de la page (au clic sur le module) — l'événement a déjà eu lieu, le listener ne se déclenche donc jamais. **Corrigé** : pattern `if (document.readyState === 'loading') {...} else {...}`, même parade que `nommage/config-app.ts`.
  2. **`document.getElementById` ne peut pas voir dans le Shadow DOM** : `ModuleContainer` est un composant à Shadow DOM — le `document` global d'un script d'app ne le traverse pas. **Corrigé** : `ModuleContainer.ts` expose désormais son shadow root sur `window.__moduleContainerRoot` (`connectedCallback()`) ; `arbreouquoi/app.ts` interroge ce root via un helper `$(id)` scopé (`document.getElementById(...)` remplacé partout).
- **Statut** : Corrigé (2026-07-23) pour `arbreouquoi` uniquement — le mécanisme (`window.__moduleContainerRoot` + helper `$()`) est réutilisable tel quel pour `evoo7`/`rfxcom`/`nommage` quand leur tour viendra.
- **Priorité** : Basse pour arbreouquoi (résolu) — Haute pour les 3 autres apps tant qu'elles n'ont pas reçu le même correctif.

### 🟡 ArbreouquoiService : référence circulaire entity↔area/device faisait planter l'envoi de l'arbre — Corrigé
- **Problème** : `HaStructuredEntity.device`/`.area` (peuplés par `HaStructureRegistry`) sont des références d'objets complets, pas de simples ID — `device.entities`/`area.entities` pointent en retour vers la même entité : un graphe réellement circulaire. `ArbreouquoiService` envoyait ces entités telles quelles dans les payloads Socket.io (arbre, catalogue, détails d'entité), ce qui faisait boucler indéfiniment `socket.io-parser` (`hasBinary`, qui parcourt tout objet sans détection de cycle contrairement à `JSON.stringify`) — `RangeError: Maximum call stack size exceeded` côté serveur à chaque tentative, `arbreouquoi:tree:structure` n'atteignait donc jamais le client (seul `arbreouquoi:stats`, qui n'embarque pas les entités, passait). Découvert en vérifiant la migration Alpine.js Phase 2 en conditions réelles (469 entités, stack trace obtenue en loggant `error.stack` au lieu du seul message).
- **Correctif** : nouvelle méthode `sanitizeEntity()` qui ne garde que `{device_id, name}`/`{area_id, name}` pour `.device`/`.area`, appliquée à chaque point où des entités du référentiel sont récupérées avant d'être embarquées dans un payload (`buildOuFirstTree(Filtered)`, `buildQuoiFirstTree(Filtered)`, `emitEntityDetails`).
- **Statut** : Corrigé (2026-07-23)
- **Priorité** : Était Haute (bloquait tout affichage réel de l'arbre) — résolu.

### 🔴 ArbreouquoiService.handleConfigSave : boucle infinie corrompait data/config.yaml — Corrigé
- **Problème** : `handleConfigSave()` (déclenché par le bouton bascule OÙ/QUOI, entre autres) émettait son accusé de réception `{success: true, config: newConfig}` sur le **même** nom d'événement (`ARBREOUQUOI_SOCKET_EVENTS.CONFIG_SAVE`) que celui écouté pour déclencher une sauvegarde — l'EventBus étant partagé, ce même handler se redéclenchait donc lui-même sur son propre accusé de réception, le traitant comme un nouveau `partialConfig` à fusionner (`{...currentConfig, success: true, config: newConfig}`), qui ré-émettait à son tour un accusé de réception, etc. Boucle infinie, une imbrication `.config.config.config...` de plus par itération, jusqu'à dépassement de la profondeur YAML max (100) — **`data/config.yaml` corrompu** (6778 lignes, 3,6 Mo, le serveur ne démarrait plus : `Invalid YAML... nesting exceeded maxDepth`). Découvert en vérifiant la migration Alpine.js Phase 2 (les clics de test sur le bouton bascule ont déclenché la boucle).
- **Correctif** : nouvel événement distinct `ARBREOUQUOI_SOCKET_EVENTS.CONFIG_SAVED` (`arbreouquoi:config:saved`) pour l'accusé de réception, séparé de `CONFIG_SAVE` (la demande) — plus de rebouclage. `data/config.yaml` réparé manuellement (sauvegarde du fichier corrompu dans `backups/data/`, reconstruction de la section `arbreouquoi` à partir des valeurs cohérentes trouvées au premier niveau d'imbrication, le reste du fichier — `ha`/`web`/`logging`/`evoo7`/`nommage`/`rfxcom` — intact et non affecté).
- **Effet de bord découvert en testant le correctif** (non corrigé, distinct) : `newConfig = {...currentConfig, ...partialConfig}` fait une fusion **superficielle** — un `partialConfig.display` partiel (ex: `{viewMode: ...}` seul) remplace tout `currentConfig.display` au lieu de le fusionner en profondeur, perdant les autres champs (`showEntityIds`/`showQuoiIcons`/`theme`) à chaque sauvegarde partielle. À corriger séparément si besoin (fusion profonde comme le fait déjà `TechnicalConfigManager.mergeDeep` côté navigateur, core).
- **Statut** : Corrigé (2026-07-23) pour la boucle infinie — la fusion superficielle reste un problème mineur distinct, non corrigé.
- **Priorité** : Était Critique (corruption de données réelles) — résolu.

### 🟡 Libellé du bouton bascule OÙ/QUOI jamais mis à jour après le premier rendu
- **Problème** : `updateViewModeButton()` (arbreouquoi/app.ts) n'est appelée qu'une fois dans `initUI()` — ni après un clic sur le bouton lui-même, ni après réception d'un nouvel arbre (`TREE_STRUCTURE`, qui porte pourtant `payload.viewMode` à jour). Le texte du bouton reste figé sur son état initial même quand le mode bascule réellement (l'arbre affiché, lui, change bien). Préexistant, découvert en vérifiant la migration Alpine.js Phase 2 (non lié à Alpine — la logique de rendu de l'arbre elle-même bascule correctement).
- **Statut** : Non résolu
- **Priorité** : Basse (cosmétique, la fonctionnalité sous-jacente marche)

### 🟡 Pipeline de build navigateur pour arbreouquoi — Corrigé (base pour les 3 autres apps)
- **Problème** : comme `nommage`/`evoo7`/`rfxcom`, `arbreouquoi` n'avait qu'un seul réglage TypeScript (orienté serveur, Node/CommonJS), appliqué aussi à `app.ts` (navigateur) — `require`/`exports` invalides dans un `<script>`, plus un import qui traversait vers `core/src` (jamais compilé en JS navigateur).
- **Correctif** : nouveau `tsconfig.ui.json` dédié (sortie ES modules), script `build:ui`, `SocketService` importé via l'URL déjà servie par `core` (`/js/ts/services/SocketService.js`) au lieu de traverser `core/src`, copie locale de `socket-events.ts` pour ne jamais mélanger build serveur/navigateur sur un même fichier, `type="module"` sur la balise `<script>`, middleware serveur `/applications/:appId` complète désormais `.js` automatiquement pour les imports sans extension.
- **Statut** : Corrigé (2026-07-22) pour `arbreouquoi` uniquement — même chantier à refaire pour `evoo7`/`rfxcom`/`nommage` si besoin.
- **Priorité** : Basse (le pipeline marche ; le blocage d'exécution des scripts qui restait est désormais résolu, voir l'entrée dédiée ci-dessus)

### 🟡 Indicateur de connexion RFXCOM — Corrigé (effet de bord du pipeline navigateur)
- **Problème** : L'UI affiche "Déconnecté" alors que le serveur a bien reçu des messages RFXCOM et broadcase `rfxcom:status` avec `connected:true`.
- **Cause réelle, identifiée rétrospectivement** : même bug que "Tableaux de bord des apps : scripts injectés inertes" — `updateStatusDisplay()` utilisait `document.getElementById('connection-badge')`, qui ne traverse pas le Shadow DOM de `ModuleContainer` ; l'élément n'était donc jamais trouvé et le badge restait figé sur sa valeur HTML par défaut ("Déconnecté"), quel que soit le vrai statut.
- **Correctif** : déjà résolu par le chantier pipeline navigateur + Shadow DOM du 2026-07-23 (`$()` scopé sur `window.__moduleContainerRoot`, voir "Pipeline de build navigateur pour arbreouquoi").
- **Vérifié en direct (2026-07-23)** : serveur sans transceiver physique réel connecté broadcastant tout de même `connected:true` (bibliothèque `rfxcom` en environnement de dev) — badge affiche bien "Connecté" (couleur verte), au lieu du défaut HTML "Déconnecté".
- **Statut** : Corrigé (2026-07-23)

---

## Problèmes secondaires

### 🟡 Pages Découverte/Taxonomie/Logs de Nommage orphelines
- **Problème** : `discovery.html`, `taxonomy.html`, `logs.html` (`applications/nommage/src/presentation/nommage/`) existent mais ne sont référencées nulle part (ni route serveur dédiée, ni lien depuis l'app elle-même) — code mort. Retirées du menu "Paramètres Techniques" le 2026-07-22 (elles menaient de toute façon toutes au même affichage générique, jamais aux vraies pages).
- **À faire** : décider si ces pages doivent être raccrochées quelque part (ex: dans le tableau de bord de l'app) ou supprimées.
- **Statut** : Non traité
- **Priorité** : Basse

### 🟡 Build cassé sur les 4 apps métier (home-assistant-js-websocket) — Corrigé
- **Problème** : `evoo7`, `rfxcom`, `arbreouquoi`, `nommage` ne compilaient plus du tout depuis le remplacement du client WebSocket HA par `home-assistant-js-websocket` (session précédente) — jamais détecté car aucune de ces apps n'avait été rebuild depuis. Cause : ce package tiers n'expose pas de condition `types` dans son `package.json` `exports`, invisible sous `moduleResolution: node` (utilisé par `core`) mais bloquant sous `moduleResolution: NodeNext` (utilisé par les 4 apps métier).
- **Correctif** : mapping `paths` vers `applications/core/node_modules/home-assistant-js-websocket/dist/index.d.ts` ajouté dans les 4 `tsconfig.json`.
- **Statut** : Corrigé (2026-07-22)

### 🟡 Sauvegarde de configuration
- **Problème** : Modification des champs sans clic sur "Sauvegarder" envoyait les données
- **Statut** : Corrigé (commit 1e84707 et 9ba5658)

### 🟡 Injection IAppConfigProvider
- **Problème** : `this.configService.getAppConfig is not a function`
- **Statut** : Corrigé (commit 32543ab)

### 🟡 Sauvegarde configuration avec anciennes données (module) — Corrigé
- **Problème** : Sur un module (testé EVOO7 et RFXCOM), modifier un champ (ex: `bridgeInstance`) et cliquer Sauvegarder réaffiche l'ancienne valeur à l'écran. Un arrêt/relance de l'application affiche bien la dernière valeur modifiée — donc la donnée envoyée et persistée en disque est correcte, seul l'affichage post-sauvegarde dans la même session reste faux.
- **Observé** : 
  - Client envoie : `serialPort: "/dev/ttyUSB0"` dans le payload
  - Serveur sauvegarde correctement (confirmé par redémarrage) mais l'UI réaffiche l'ancienne valeur juste après le clic Sauvegarder, sans redémarrage
- **Causes déjà corrigées, insuffisantes** (2026-07-22) :
  1. `ModuleManager.saveModuleConfig()` lisait `window.app.configManager.getConfig()[moduleId]` au lieu de `this.moduleConfigs[moduleId]` — corrigé.
  2. Les champs de module passaient par le handler générique de `ConfigForm.ts`, écrivant dans `TechnicalConfigManager.config` (écrasable par `config:current`) — corrigé en routant vers `ModuleManager.setModuleField`/`toggleModuleField`/`setSelectField`.
  3. `ConfigForm`'s listener `config:updated` faisait un `render()` inconditionnel qui réinjectait `moduleConfigFormHtml` figé — corrigé en sautant le `render()` quand `this.moduleId` est défini.
- **Cause racine réelle, trouvée le 2026-07-23** (en corrigeant un bug similaire sur le nouveau champ `array` de Nommage) : `app:modules:list` ET `app:module:ui:register` déclenchent chacun indépendamment `app:modules:config:get` pour un même module — au moins 2 réponses serveur `app:module:config` arrivent par module, chacune écrasant l'édition en cours dans `ModuleManager.moduleConfigs`. Un clic sur Sauvegarder juste avant l'arrivée de la 2e réponse voit donc son édition écrasée par l'ancienne valeur.
- **Correctif** (2026-07-23) : nouveau `ModuleManager.moduleConfigLoaded: Set<string>` — seule la toute première réponse `app:module:config` par module est acceptée, les suivantes sont ignorées.
- **Vérifié en direct (2026-07-23)** : champ `bridgeInstance` d'EVOO7 modifié puis sauvegardé — valeur conservée à l'écran (pas de réapparition de l'ancienne), confirmée persistée dans `data/config.yaml`, et toujours correcte après un rechargement complet de la page (qui redéclenche exactement le double appel `app:modules:config:get` en cause).
- **Statut** : Corrigé (2026-07-23)

### 🟡 Aucune confirmation visible pour l'utilisateur après une sauvegarde de config
- **Problème** : `ConfigForm.saveConfig()` (`applications/core/src/presentation/ui/ts/components/ConfigForm.ts`) réactive le bouton "Sauvegarder" après un simple `setTimeout(1000)`, sans jamais attendre ni afficher le vrai résultat de la sauvegarde (succès, erreurs de validation, échec d'écriture disque). Le serveur envoie pourtant deux événements dédiés à ce résultat réel (`config:save:result` pour la sauvegarde globale, `app:module:config:saved` pour un module) — désormais correctement relayés au navigateur (voir "Sauvegarde configuration avec anciennes données" ci-dessus et le point 1 du chantier config:current), mais côté UI, rien ne les écoute.
- **À faire** : Dans `ConfigForm.ts`, écouter `config:save:result`/`app:module:config:saved` (via `TechnicalConfigManager`/`ModuleManager`, en socket.on ou en CustomEvent relayé) pour afficher un vrai succès/échec (et les erreurs de validation le cas échéant) au lieu du `setTimeout` optimiste actuel.
- **Statut** : Non implémenté
- **Priorité** : Moyenne

### 🟡 Édition non sauvegardée écrasée par config:current (onglets statiques)
- **Problème** : Sur les onglets statiques (Web services, MQTT, Serveur Web, Journalisation), si une sauvegarde a lieu ailleurs (autre onglet ouvert, autre utilisateur) pendant qu'un champ vient d'être modifié mais pas encore sauvegardé, la réception de `config:current` déclenche un `render()` dans `ConfigForm.ts` qui écrase la saisie en cours avec la valeur serveur. Le même problème a été corrigé pour les formulaires de module (voir "Sauvegarde configuration avec anciennes données") en les découplant de `config:current`, mais les sections statiques n'ont pas d'autre source de vérité — pas de découplage possible sans suivi des champs "modifiés mais non sauvegardés".
- **À faire** : Ajouter un suivi des champs "dirty" dans `ConfigForm.ts` pour ignorer/fusionner sélectivement les mises à jour entrantes sur les champs en cours d'édition.
- **Statut** : Non implémenté
- **Priorité** : Basse (pas encore rencontré en pratique, risque théorique identifié pendant le chantier config:current)

### 🟡 Gestion des protocoles RFXCOM
- **Problème** : La librairie npm rfxcom permet de limiter la réception à certains protocoles. Il faut gérer cela dans l'UI.
- **À implémenter** :
  - Récupérer la liste des protocoles supportés depuis `rfxcom.protocols` au démarrage
  - Afficher une liste de cases à cocher dans les paramètres techniques RFXCOM
  - Envoyer les modifications au service RFXCOM via événements Socket.io
  - Appliquer les filtres au transceiver
- **Événements** : `rfxcom:protocols:list`, `rfxcom:protocol:toggle`, `rfxcom:protocols:update`
- **Statut** : Non implémenté
- **Priorité** : Moyenne

### 🟡 Envoi devices vers HA au démarrage
- **À implémenter** : Dès le démarrage de l'application, TOUS les devices avec `transmitToHa: true` doivent être envoyés à HA
- **Vérifier** : Le service RFXCOM publie-t-il bien les discoveries MQTT au démarrage ?
- **Statut** : Non implémenté
- **Priorité** : Moyenne

### 🟡 Architecture RFXCOM
- **Problème** : Le module `RfxComService` fait ~1800 lignes
- **Proposition d'éclatement** :
  - `RfxComCoreService` : Gestion du transceiver (connexion, déconnexion, messages bruts)
  - `RfxComDeviceManager` : Gestion des devices (détection, stockage, auto-discovery)
  - `RfxComReceiverManager` : Gestion des récepteurs et appairages
  - `RfxComSceneManager` : Gestion des scènes
  - `RfxComProtocolManager` : Gestion des protocoles activés
  - `RfxComHaBridge` : Intégration avec HA (discovery, états, commandes)
- **Statut** : En attente de validation
- **Priorité** : Basse

---

## Notes techniques

### Package npm utilisé
- **Nom** : `rfxcom`
- **Version** : v2.6.2 (d'après specs-implementation-rfxcom_specs_v1.0.md)
- **Vérification** : Voir `src/applications/rfxcom/domain/RfxComService.ts` ligne 30 : `import * as rfxcomLib from 'rfxcom';`
- **Confirmation** : ✅ Oui, le package npm utilisé est bien `rfxcom`

### Utilisation dans le code
```typescript
import * as rfxcomLib from 'rfxcom';
// puis
this.transceiver = new rfxcomLib.RfxCom(serialPort, options);
```

---

## Historique des commits récents
- `1e84707` - Fix perte de focus lors de la saisie dans ConfigForm
- `9ba5658` - Correction sauvegarde automatique ConfigForm et gestion des champs modules  
- `32543ab` - Correction démarrage automatique RFXCOM et injection IAppConfigProvider
