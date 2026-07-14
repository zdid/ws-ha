# Spécification Technique de Nommage et Taxonomie
**Normalisation à la volée des entités Home Assistant via MQTT Discovery**

---

## 1. Structure Générale du Protocole

Le protocole impose une nomenclature stricte sur le champ `name` reçu dans les payloads de configuration MQTT. Cette chaîne est segmentée en deux blocs majeurs par le séparateur triple tiret (`---`), isolant le type de l'appareil de sa hiérarchie géographique.

```text
quoi---lieuprecis--lieu--lieupere--lieugrandpere
```

## 2. Analyse et Segmentation du "QUOI"

Le composant **Quoi** constitue la clé de voûte fonctionnelle de l'entité. Il est systématiquement extrait de la partie située à l'extrême gauche de la chaîne brute, avant la rencontre du premier délimiteur majeur (`---`).

### 2.1 Spécifications de la Variable d'Affichage (`raw_quoi`)
La variable d'affichage conserve l'intégralité des attributs typographiques d'origine saisis par l'émetteur.

* **Définition mécanique :** Extraction par partitionnement textuel via l'instruction Jinja2 `raw_name.split('---')[0] | trim`.
* **Préservation des caractères :** Maintien de la casse (majuscules/minuscules), des caractères accentués (é, è, à, ç, œ, etc.), des espaces blancs internes ainsi que des apostrophes ou glyphes spécifiques.
* **Application cible dans Home Assistant :** Cette variable est directement injectée dans le paramètre utilisateur `name` ou `friendly_name` de l'appareil ou de l'entité. Elle garantit une lecture naturelle et ergonomique au sein des cartes du tableau de bord (Lovelace).

### 2.2 Spécifications de la Variable Technique (`slug_quoi`)
La variable technique applique une normalisation descendante stricte afin de rendre la chaîne conforme aux exigences des architectures logicielles et des registres de base de données de Home Assistant.

* **Définition mécanique :** Mutation de la variable d'affichage par application du filtre de transformation natif `raw_quoi | slugify`.
* **Règles de réécriture algorithmique :**
  1. **Passage en minuscules :** Conversion systématique de l'ensemble des caractères alphabétiques au format minuscule (`A-Z` → `a-z`).
  2. **Désaccentuation (ASCII Strip) :** Substitution des caractères complexes par leur équivalent standard (ex: `é`, `è`, `ê` → `e` ; `ç` → `c`).
  3. **Remplacement des séparateurs :** Analyse de tous les caractères non alphanumériques (espaces, tirets simples, apostrophes, ponctuations) et remplacement systématique par un unique caractère de soulignement (`_`). Les doublons d'underscores consécutifs sont fusionnés.
* **Application cible dans Home Assistant :** Cette variable est exploitée pour forcer ou réécrire l'identifiant technique de l'entité (`entity_id`). Par exemple, un commutateur extrait sous la forme `slug_quoi: seche_serviette` adoptera l'adresse système `switch.seche_serviette`.

### 2.3 Tableau de Synthèse des Transformations du "QUOI"

| Chaîne d'Origine (Payload MQTT) | Variable d'Affichage (`raw_quoi`) | Variable Technique (`slug_quoi`) |
| :--- | :--- | :--- |
| `Sèche-serviette` | `Sèche-serviette` | `seche_serviette` |
| `Lumière du Miroir` | `Lumière du Miroir` | `lumiere_du_miroir` |
| `Prise Pivot' 1` | `Prise Pivot' 1` | `prise_pivot_1` |
| `Volet Roulant principal` | `Volet Roulant principal` | `volet_roulant_principal` |

## 3. Analyse et Distribution des "OÙ" (Hiérarchie Géographique)

Le bloc géographique détermine la localisation spatiale de l'appareil. Il est isolé à droite du délimiteur majeur (`---`) et découpé de manière séquentielle de gauche à droite à l'aide du délimiteur secondaire (`--`). 

L'algorithme évalue dynamiquement la taille du tableau résultant ($N$, correspondant au nombre d'éléments séparés par `--`) pour attribuer les rôles, rendant les structures supérieures totalement facultatives.

### 3.1 Logique d'Extraction Positionnelle

Le tableau des lieux est indexé de gauche à droite. Cependant, pour garantir la flexibilité du protocole (rendre les parents facultatifs), la distribution s'appuie sur le nombre total d'éléments trouvés ($N$) :

1. **Le premier élément à gauche (Index 0)** représente toujours le niveau le plus fin disponible. Si $N = 1$, cet élément est le **Lieu** obligatoire. Si $N > 1$, cet élément glisse automatiquement vers le rôle de **Lieu Précis** (sous-zone).
2. **Le deuxième élément (Index 1, si $N \ge 2$)** s'établit comme le **Lieu** principal (la pièce).
3. **Le troisième élément (Index 2, si $N \ge 3$)** s'établit comme le **Lieu Père** (l'étage ou la zone directe).
4. **Le quatrième élément (Index 3, si $N \ge 4$)** s'établit comme le **Lieu Grand-Père** (le bâtiment ou domaine).

### 3.2 Spécifications des Niveaux de Variables

Chaque niveau géographique génère deux variables distinctes : une chaîne brute d'affichage textuel (injectée dans le registre d'identification des pièces) et une chaîne technique normalisée (utilisée pour les tris, les scripts ou le maillage).

#### A. Lieu Précis (`nom_precis` / `slug_precis`)
* **Condition d'activation :** Actif uniquement si $N > 1$.
* **Rôle :** Représente un recoin, une sous-zone ou un point d'intérêt à l'intérieur d'une pièce (ex: `Coin Bureau`, `Plan de travail`, `Douche`).
* **Comportement Home Assistant :** aucun

#### B. Lieu (`nom_lieu` / `slug_lieu`)
* **Condition d'activation :** Toujours actif ($N \ge 1$). Niveau **obligatoire** du protocole.
* **Rôle :** Représente la pièce physique ou géographique standard (ex: `Salon`, `Cuisine`, `Chambre Parent`).
* **Comportement Home Assistant :** Déclenche la création d'une **Area** dans le registre de Home Assistant si celle-ci n'existe pas encore. Et devient le suggested-area du message mqtt

#### C. Lieu Père (`nom_pere` / `slug_pere`)
* **Condition d'activation :** Actif uniquement si $N \ge 3$.
* **Rôle :** Représente la structure englobante directe (ex: `Premier Étage`, `Rez-de-Chaussée`, `Extérieur`).
* **Comportement Home Assistant :** Utilisé pour créer l'Area associée ou, idéalement, alimenter le registre des **Floors (Étages)** de Home Assistant pour un contrôle vertical global.

#### D. Lieu Grand-Père (`nom_grand_pere` / `slug_grand_pere`)
* **Condition d'activation :** Actif uniquement si $N \ge 4$.
* **Rôle :** Représente le macro-domaine ou le bâtiment (ex: `Maison Principale`, `Garage Externe`, `Dépendance`).
* **Comportement Home Assistant :** Utilisé pour créer l'Area associée ou pour affecter automatiquement un **Label (Étiquette)** transversal sur toutes les entités concernées.

---

### 3.3 Matrice de Distribution selon la Profondeur ($N$)

Le tableau suivant spécifie la distribution exacte des variables selon le nombre de segments détectés après le séparateur `---` :

| Nombre de segments ($N$) | `nom_precis` (Sous-zone) | `nom_lieu` (Pièce) | `nom_pere` (Étage) | `nom_grand_pere` (Bâtiment) |
| :---: | :--- | :--- | :--- | :--- |
| **$N = 1$** | *Désactivé (`none`)* | Segment 0 | *Désactivé (`none`)* | *Désactivé (`none`)* |
| **$N = 2$** | Segment 0 | Segment 1 | *Désactivé (`none`)* | *Désactivé (`none`)* |
| **$N = 3$** | Segment 0 | Segment 1 | Segment 2 | *Désactivé (`none`)* |
| **$N = 4$** | Segment 0 | Segment 1 | Segment 2 | Segment 3 |

## 4. Matrice de Résolution & Exemples Concrets

Ce chapitre présente l'application pratique des règles de segmentation et de normalisation à travers différents cas d'usage réels, du plus complexe au plus épuré.

### 4.1 Cas d'école complet : Résolution Maximale ($N = 4$)

Ce scénario illustre le traitement d'une chaîne exploitant l'intégralité des niveaux hiérarchiques autorisés par le protocole, incluant des caractères accentués, des espaces complexes et des apostrophes.

* **Chaîne brute reçue dans le payload MQTT :**
  `Sèche-serviette---Détecteur Douche--Salle de Bain--Rez-de-Chaussée--Maison Principale`

#### Étape 1 : Isolation du "Quoi"
* **Texte extrait (`raw_quoi`) :** `Sèche-serviette`
* **Normalisation technique (`slug_quoi`) :** `seche_serviette`

#### Étape 2 : Ventilation des "Où"
Le bloc géographique `Détecteur Douche--Salle de Bain--Rez-de-Chaussée--Maison Principale` contient 4 segments ($N = 4$).

* **Index 0 → `nom_precis` :** `Détecteur Douche` → `slug_precis` : `detecteur_douche`
* **Index 1 → `nom_lieu` :** `Salle de Bain` → `slug_lieu` : `salle_de_bain`
* **Index 2 → `nom_pere` :** `Rez-de-Chaussée` → `slug_pere` : `rez_de_chaussee`
* **Index 3 → `nom_grand_pere` :** `Maison Principale` → `slug_grand_pere` : `maison_principale`

#### Étape 3 : Comportement et Cycle de Création dans Home Assistant
1. Le système détecte `nom_grand_pere` → Création / Vérification de l'Area : **"Maison Principale"**
2. Le système détecte `nom_pere` → Création / Vérification de l'Area : **"Rez-de-Chaussée"**
3. Le système détecte `nom_lieu` → Création / Vérification de l'Area : **"Salle de Bain"**
4. Le système détecte `nom_precis` → Création / Vérification de l'Area : **"Détecteur Douche"**
5. **Affectation finale :** L'appareil technique (identifié sous le nom `seche_serviette`) est nativement classé et rattaché à l'Area : **"Salle de bain"**.

---

### 4.2 Cas d'école intermédiaire : Résolution Standard ($N = 2$)

Ce scénario représente l'usage courant pour l'isolation d'un équipement spécifique au sein d'une pièce unique, sans spécification des structures parentes (étages ou bâtiments).

* **Chaîne brute reçue dans le payload MQTT :**
  `Lumière---Plan de Travail--Atelier`

#### Étape 1 : Isolation du "Quoi"
* **Texte extrait (`raw_quoi`) :** `Lumière`
* **Normalisation technique (`slug_quoi`) :** `lumiere`

#### Étape 2 : Ventilation des "Où"
Le bloc géographique `Plan de Travail--Atelier` contient 2 segments ($N = 2$).

* **Index 0 → `nom_precis` :** `Plan de Travail` → `slug_precis` : `plan_de_travail`
* **Index 1 → `nom_lieu` :** `Atelier` → `slug_lieu` : `atelier`
* **Index 2 → `nom_pere` :** *Désactivé (`none`)*
* **Index 3 → `nom_grand_pere` :** *Désactivé (`none`)*

#### Étape 3 : Comportement et Cycle de Création dans Home Assistant
1. `nom_grand_pere` et `nom_pere` étant nuls, leurs blocs de création respectifs sont immédiatement ignorés.
2. Le système détecte `nom_lieu` → Création / Vérification de l'Area : **"Atelier"**
3. Le système détecte `nom_precis` → rien
4. **Affectation finale :** L'appareil `lumiere` est rattaché à l'Area : **"Atelier"**.

---

### 4.3 Cas d'école minimal : Résolution Directe ($N = 1$)

Ce scénario correspond à l'expression minimale requise par le protocole, associant directement un type d'appareil à une pièce principale.

* **Chaîne brute reçue dans le payload MQTT :**
  `Prise Connectée---Salon`

#### Étape 1 : Isolation du "Quoi"
* **Texte extrait (`raw_quoi`) :** `Prise Connectée`
* **Normalisation technique (`slug_quoi`) :** `prise_connectee`

#### Étape 2 : Ventilation des "Où"
Le bloc géographique `Salon` contient 1 seul segment ($N = 1$).

* **Index 0 → `nom_lieu` :** `Salon` → `slug_lieu` : `salon`
* **Index 1 → `nom_precis` :** *Désactivé (`none`)* (Le glissement vers le Lieu Précis est annulé car $N$ n'est pas supérieur à 1).
* **Index 2 → `nom_pere` :** *Désactivé (`none`)*
* **Index 3 → `nom_grand_pere` :** *Désactivé (`none`)*

#### Étape 3 : Comportement et Cycle de Création dans Home Assistant
1. Le système isole uniquement l'élément obligatoire `nom_lieu` → Création / Vérification de l'Area : **"Salon"**
2. Les autres niveaux géographiques étant évalués à `none`, aucun autre traitement de structure n'est instancié.
3. **Affectation finale :** L'appareil `prise_connectee` est rattaché à sa pièce d'origine, l'Area : **"Salon"**.

## 5. Algorithme de Traitement Home Assistant (Jinja2)

Le traitement de la chaîne de caractères repose sur le moteur de template Jinja2 intégré à Home Assistant. L'algorithme s'exécute à chaque interception de payload de configuration sur le broker MQTT.

### 5.1 Logique de Découpage et Pivot de l'Area
L'isolation du type d'appareil et du bloc géographique s'effectue par la méthode `.split('---')[0]` pour le **Quoi**, et `.split('---')[1]` pour le bloc des **Où**.

L'évaluation de la longueur du tableau des lieux ($N$) via `| length` applique les règles strictes suivantes :
* **Si $N = 1$ :** Le segment unique (Index 0) représente la pièce principale (`nom_lieu`). La variable `nom_precis` reste nulle (`none`).
* **Si $N > 1$ :** Le segment d'Index 0 glisse vers le rôle de sous-zone descriptive (`nom_precis`), tandis que le segment d'Index 1 devient réglementairement le **Lieu** principal (`nom_lieu`). 

### 5.2 Idempotence et Priorité Géographique
Contrairement aux spécifications initiales, seul le `nom_lieu` (et les parents supérieurs existants) déclenche l'appel au registre de création `area_registry.create`. Le `nom_precis` est conservé uniquement pour l'analyse et l'injection d'attributs, sans générer d'Area dédiée dans l'interface de Home Assistant.

L'affectation finale de l'appareil utilise explicitement la variable `nom_lieu`, garantissant l'alignement strict avec le paramètre `suggested_area` de l'écosystème MQTT de Home Assistant.

### 5.3 Stockage Persistant dans les Attributs
Pour conserver la richesse de la hiérarchie géographique originale sans surcharger le registre des zones graphiques de Home Assistant, toutes les variables calculées (`raw_quoi`, `nom_precis`, `nom_lieu`, `nom_pere`, `nom_grand_pere`) ainsi que leurs déclinaisons techniques (`slug_*`) sont packagées pour être injectées en tant qu'**attributs d'état (state attributes)** de l'entité. Cela permet d'effectuer des filtrages dynamiques ou des regroupements avancés directement dans l'interface Lovelace ou via d'autres automatisations.

## 6. Code de l'Automatisation Globale (YAML)

Cette automatisation révisée intercepte les configurations MQTT, applique les nouvelles règles de ciblage géographiques (Index 1 comme Area principale si $N > 1$), crée les structures requises, puis utilise le service d'écriture pour lier l'appareil et ses attributs taxonomiques personnalisés.

```yaml
alias: "MQTT : Normalisation et Configuration des Lieux"
description: "Extrait la hiérarchie, applique l'Area sur le 2e terme (si N>1) et injecte Quoi/Où en attributs"
trigger:
  - platform: mqtt
    topic: "homeassistant/+/+/config"
action:
  - variables:
      payload: "{{ trigger.payload_json }}"
      
      # 1. Isolation du nom d'origine envoyé par le protocole
      raw_name: "{{ raw_name.split('---')[0] | trim }}"
      
      # 2. Extraction du QUOI et du bloc des LIEUX bruts
      raw_quoi: "{{ raw_name.split('---')[0] | trim }}"
      raw_lieux: "{{ raw_name.split('---')[1] if '---' in raw_name else '' }}"
      liste_lieux: "{{ raw_lieux.split('--') if raw_lieux != '' else [] }}"
      
      # 3. Cartographie des NOMS PROPRES (Respect des nouvelles spécifications de position)
      nom_grand_pere: "{{ liste_lieux[3] | trim if liste_lieux | length > 3 else none }}"
      nom_pere:       "{{ liste_lieux[2] | trim if liste_lieux | length > 2 else none }}"
      nom_lieu:        "{{ liste_lieux[1] | trim if liste_lieux | length > 1 else (liste_lieux[0] | trim if liste_lieux | length > 0 else none) }}"
      nom_precis:      "{{ liste_lieux[0] | trim if liste_lieux | length > 1 else none }}"
      
      # 4. Génération des SLUGS TECHNIQUES
      slug_quoi:       "{{ raw_quoi | slugify }}"
      slug_grand_pere: "{{ nom_grand_pere | slugify if nom_grand_pere is not none else none }}"
      slug_pere:       "{{ nom_pere | slugify if nom_pere is not none else none }}"
      slug_lieu:       "{{ nom_lieu | slugify if nom_lieu is not none else none }}"
      slug_precis:     "{{ nom_precis | slugify if nom_precis is not none else none }}"

  # ------------------------------------------------------------------
  # SÉQUENCE DE CRÉATION DE LA TOPOLOGIE (Exclusion du Lieu Précis)
  # ------------------------------------------------------------------
  
  # Niveau 4 : Grand-Père (ex: Bâtiment)
  - if:
      - condition: template
        value_template: "{{ nom_grand_pere is not none }}"
    then:
      - service: area_registry.create
        data:
          name: "{{ nom_grand_pere }}"

  # Niveau 3 : Père (ex: Étage)
  - if:
      - condition: template
        value_template: "{{ nom_pere is not none }}"
    then:
      - service: area_registry.create
        data:
          name: "{{ nom_pere }}"

  # Niveau 2 : Lieu Obligatoire (Détermine l'Area Home Assistant officielle)
  - if:
      - condition: template
        value_template: "{{ nom_lieu is not none }}"
    then:
      - service: area_registry.create
        data:
          name: "{{ nom_lieu }}"

  # ------------------------------------------------------------------
  # AFFECTATION GÉOGRAPHIQUE ET INJECTION DES ATTRIBUTS
  # ------------------------------------------------------------------
  
  # Association de l'appareil à la pièce réglementaire (nom_lieu)
  - service: area_registry.create
    data:
      name: "{{ nom_lieu }}"

  # Injection de la taxonomie complète dans les attributs de l'entité
  # Note : Permet de retrouver le "Quoi" et le "Lieu Précis" dans les outils de dev et cartes de HA
  - service: mqtt.publish
    data:
      topic: "{{ trigger.topic }}"
      retain: true
      payload: >-
        {% set new_payload = payload %}
        {% set taxonomie = {
          "attributs_taxonomie": {
            "quoi": raw_quoi,
            "slug_quoi": slug_quoi,
            "lieu_precis": nom_precis,
            "slug_precis": slug_precis,
            "lieu_principal": nom_lieu,
            "slug_lieu": slug_lieu,
            "lieu_pere": nom_pere,
            "lieu_grand_pere": nom_grand_pere
          }
        } %}
        {{ new_payload | combine(taxonomie) | to_json }}

mode: queued
max: 20
```

## 7. Recommandations d'Exploitation et Cycle de Vie

### 7.1 Exploitation des Attributs Personnalisés dans l'Interface
Puisque le **Quoi** et le **Lieu Précis** résident désormais directement dans les attributs de l'entité sous la clé `attributs_taxonomie`, vous pouvez y accéder dans vos cartes Lovelace (via des cartes de filtrage comme `auto-entities`) ou dans vos scripts de la manière suivante :

```jinja2
{{ state_attr('switch.votre_entite', 'attributs_taxonomie').lieu_precis }}
```
