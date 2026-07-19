# CHANGELOG - Historique des Spécifications

**Dernière mise à jour :** 19 Juillet 2026

---

## 📅 Historique Global

### 📌 Spécifications Socle

| Date | Version | Fichier | Auteur | Changements |
|------|---------|---------|--------|-------------|
| 19/07/2026 | **v4.6** | techniques-socle-ha-mqtt_specs_v4.6.md | Mistral Vibe | **Restructuration complète de l'arborescence** : Déplacement de `src/applications/` et `src/applications_desactivees/` vers `applications/` et `applications_desactivees/` à la racine du projet. Chaque application (y compris le core) est maintenant autonome avec ses propres `package.json`, `tsconfig.json`, et `dist/`. **Le core ne peut pas être désactivé**. Activation/désactivation via sous-menu Paramètres Techniques. Mise à jour des mécanismes de détection et d'activation/désactivation via `AppService`. |
| 18/07/2026 | v5.5 | fonctionnelles-rfxcom_specs_v5.5.md | Mistral Vibe | Spécifications Cover avec Lighting2, traduction Commandes HA→RFXCOM par type, arborescence des programmes, détection automatique, actions MQTT par le socle, indicateur connexion, traces détaillées |
| 17/07/2026 | **v4.5** | techniques-socle-ha-mqtt_specs_v4.5.md | Mistral Vibe | Ajout du **démarrage automatique des services d'application** avec reconnexion sur changement de configuration. **Traces obligatoires** au démarrage et gestion des erreurs de connexion (matériel absent, mauvais paramètres). Processus reproductible pour toute nouvelle application. |
| 14/07/2026 | **v4.4** | techniques-socle-ha-mqtt_specs_v4.4.md | Mistral Vibe | Ajout de la **gestion dynamique d'activation/désactivation** des applications via répertoires `src/applications/` et `src/applications_desactivees/`. |
| 10/07/2026 | v4.3 | techniques-socle-ha-mqtt_specs_v4.3.md | - | Restructuration de la configuration HA avec flags `ws_enable` et `mqtt_enable` + regroupement MQTT sous HA. |

---

### 📌 Spécifications Projet

| Date | Version | Fichier | Auteur | Changements |
|------|---------|---------|--------|-------------|
| 19/07/2026 | **v1.2** | PROMPT_PROJET_v1.2.md | Mistral Vibe | **Ajout sections Gestion des Spécifications** : Identification des redondances majeures (EventBus, Architecture 5 couches, Gestion des erreurs, etc.) avec tableau des fichiers de référence. **Liste complète des specs nécessaires par type de développement** avec ordre de lecture recommandé. |
| 19/07/2026 | **v1.1** | PROMPT_PROJET_v1.1.md | Mistral Vibe | **Mise à jour de la structure des répertoires** : Intégration de la nouvelle arborescence avec `applications/` et `applications_desactivees/` à la racine. **Le core ne peut pas être désactivé**. Précision sur le sous-menu des **Paramètres Techniques** pour activer/désactiver les applications. |

---

### 📌 Autres Spécifications

| Date | Version | Fichier | Auteur | Changements |
|------|---------|---------|--------|-------------|
| 18/07/2026 | v5.4 | fonctionnelles-rfxcom_specs_v5.4.md | Mistral Vibe | Actions MQTT par le socle, gestion des protocoles RFXCOM |
| 17/07/2026 | v1.2 | implementation-rfxcom_specs_v1.2.md | Mistral Vibe | Démarrage automatique via AppService avec reconnexion sur changement de configuration, injection unifiée d'IAppConfigProvider, traces détaillées |
| 16/07/2026 | **v3.2** | presentation_specs_v3.2.md | Mistral Vibe | Comportement accordéon strict (1 seul menu déplié) et effacement systématique de la zone de données au clic. Correction du double déclenchement des écouteurs, utilisation de classes CSS `.visible` |
| 16/07/2026 | v3.1 | presentation_specs_v3.1.md | Mistral Vibe | Structure de menu accordéon et affichage conditionnel |
| 16/07/2026 | v3.0 | presentation_specs_v3.0.md | Mistral Vibe | Migration complète vers TypeScript pur, suppression de Alpine.js |
| 12/07/2026 | v1.0 | architectural-patterns_specs-v1.0.md | Mistral Vibe | Définition des patterns MQTT et WS pour l'intégration HA/MQTT |
| 12/07/2026 | v1.0 | integrationbridge-mqtt-auto_specs_v1.0.md | Mistral Vibe | Démarrage/arrêt automatique MQTT et HA-WS |
| 11/07/2026 | v1.0 | classification-rfxcom_specs_v1.0.md | Mistral Vibe | Classifieur RFXCOM (IHaClassifier) avec priorités subType → QUOI |
| 11/07/2026 | v1.0 | erreurs_specs_v1.0.md | Mistral Vibe | Codes d'erreur standardisés pour HA, MQTT, RFXCOM |
| 11/07/2026 | v1.0 | nommage_specs_v1.0.md | Mistral Vibe | Taxonomie QUOI/OÙ avec format `quoi---ou--ou` |
| 09/07/2026 | v5.0 | recepteurs-emetteurs-rfxcom_specs_v5.0.md | Mistral Vibe | Mapping N↔N, primaryEmitter, appairages dans YAML |
| 09/07/2026 | v5.0 | fonctionnelles-rfxcom_specs_v5.0.md | Mistral Vibe | Fichier de configuration centralisé, QUOI auto-déterminé |

---

## 🔍 Légende
- **Nouvelle version** : Mise en évidence avec `**vX.Y**`
- **Modifications majeures** : En gras dans la colonne "Changements"
- **Auteur** : "Mistral Vibe" pour les modifications automatiques, "-" pour les versions initiales
