# PROMPT.md - Instructions pour Vibe

## 📌 Règles Principales

### 1. **Lecture Obligatoire avant toute action**
- ✅ **TOUJOURS** lire `PROMPT_PROJET.md` en premier
- ✅ **TOUJOURS** lire les spécifications actuelles dans `specs/current/` avant toute modification
- ✅ **TOUJOURS** vérifier les dates de modification dans les commentaires des fichiers

### 2. **Gestion des Spécifications**
- ❌ **JAMAIS** supprimer ou modifier un fichier dans `specs/`
- ✅ **TOUJOURS** conserver toutes les versions (archives dans `specs/archives/vX.Y.Z/`)
- ✅ **TOUJOURS** inclure la version dans le nom des fichiers de specs
- ✅ **TOUJOURS** mettre à jour `specs/CHANGELOG.md` après modification des specs

### 3. **Build Obligatoire**
- ✅ **TOUJOURS** exécuter `npm run build` après toute modification du code
- ✅ Vérifier que le build se termine sans erreur avant de commiter

---

## 🔧 Procédure Standard pour toute Tâche

### Avant de commencer :
```
1. Lire PROMPT_PROJET.md
2. Lire toutes les specs dans specs/current/
3. Identifier les fichiers concernés
4. Vérifier les commentaires de date dans les fichiers principaux
```

### Pendant le travail :
```
1. Respecter les conventions de nommage (voir nommage_specs_v1.0.md)
2. Respecter les patterns architecturaux (voir architectural-patterns_specs-v1.0.md)
3. Appliquer les règles de gestion des erreurs (voir erreurs_specs_v1.0.md)
4. Suivre les spécifications fonctionnelles (voir fonctionnelles-rfxcom_specs_v5.0.md)
```

### Après modification :
```
1. Exécuter : npm run build
2. Vérifier l'absence d'erreurs de compilation
3. Tester les modifications si applicable
4. Mettre à jour les commentaires de date dans les fichiers modifiés
5. Documenter dans CHANGELOG.md si modification des specs
```

---

## 📁 Structure des Spécifications Actuelles

| Fichier | Description | Version |
|--------|-------------|---------|
| `architectural-patterns_specs-v1.0.md` | Patterns architecturaux | v1.0 |
| `classification-rfxcom_specs_v1.0.md` | Classification RFXCOM | v1.0 |
| `erreurs_specs_v1.0.md` | Gestion des erreurs | v1.0 |
| `fonctionnelles-rfxcom_specs_v5.0.md` | Spécifications fonctionnelles RFXCOM | v5.0 |
| `implementation-rfxcom_specs_v1.0.md` | Implémentation RFXCOM | v1.0 |
| `integrationbridge-mqtt-auto_specs_v1.0.md` | Intégration Bridge MQTT Auto | v1.0 |
| `nommage_specs_v1.0.md` | Conventions de nommage | v1.0 |
| `presentation_specs_v3.0.md` | Spécifications de présentation | v3.0 |
| `recepteurs-emetteurs-rfxcom_specs_v5.0.md` | Récepteurs/Émetteurs RFXCOM | v5.0 |
| `techniques-socle-ha-mqtt_specs_v4.4.md` | Spécifications techniques socle | v4.4 |

---

## 🚨 Règles Critiques pour Vibe

### Modifications de Masse
- ⚠️ **Une modification de masse** = >10 fichiers OU >30% du code d'un module
- ✅ **Analyser systématiquement** : portée, risque de corruption, criticité
- ✅ **Seuils** :
  - Modification mineure (≤10 fichiers ET ≤30% du code) ET sans risque → Application directe
  - Modification de masse (>10 fichiers OU >30%) OU risque identifié → **Demander confirmation explicite** + sauvegarde

### Scripts de Modification Massive
- ❌ **INTERDIT** : Utiliser `sed`, `awk` pour modifier du code source **sans validation manuelle préalable**
- ✅ **Préférer** : Outils de refactoring adaptés (IDE, linters)
- ⚠️ **Si indispensable** :
  1. Tester sur une copie isolée
  2. Valider chaque changement avec `git diff`
  3. Créer une sauvegarde complète avant exécution

### Sauvegardes
- ✅ **Créer une sauvegarde** dans `backups/` avant toute modification de masse
- ✅ **Format** : `[nom]_backup_[AAAA-MM-JJ][_description].ext`
- ✅ **Vérifier** avec `diff -r original/ backups/nom_backup/`
- ✅ **Conserver** au minimum 3 versions de chaque programme
- ❌ **JAMAIS** modifier un fichier dans `backups/`

---

## 📝 Format des Commentaires de Date

**Format obligatoire** dans les fichiers principaux (index.html, etc.) :
```html
<!-- Derniere modification: AAAA-MM-JJ HH:MM:SS - [Description de la modification] -->
```

**Exemple** :
```html
<!-- Derniere modification: 2026-07-13 12:14:50 - deferAlpineStart=true, scripts en fin de body, Alpine.start() manuel -->
```

---

## 🔄 Procédures Types

### Pour demander une sauvegarde :
```
"Vibe, sauvegarde le répertoire [nom_répertoire] avec la date du jour."
```

### Pour restaurer depuis une sauvegarde :
1. Vérifier l'intégrité : `diff -r current/ backups/nom_backup/`
2. Copier les fichiers nécessaires
3. Documenter dans `CHANGELOG.md`

---

## 🏗️ Structure du Projet

```
ha-mqtt-socle/
├── app/                          # Applications
├── applications/                 # Applications actives
├── applications_desactivees/    # Applications désactivées
├── backups/                      # Sauvegardes (exclu de git)
├── data/                         # Données
├── dist/                         # Build compilé
├── docs/                         # Documentation
├── logs/                         # Logs
├── scripts/                      # Scripts utilitaires
├── specs/                        # Spécifications
│   ├── current/                  # Spécifications actuelles
│   ├── archives/                 # Archives des specs
│   └── CHANGELOG.md              # Historique des specs
├── src/                          # Code source TypeScript
├── temprfxcom/                   # Fichiers temporaires RFXCOM
└── tests/                        # Tests
```

---

## ⚡ Commandes Utiles

| Action | Commande |
|--------|----------|
| Build | `npm run build` |
| Build UI | `npm run build:ui` |
| Build watch | `npm run build:watch` |
| Start | `npm start` |
| Dev | `npm run dev` |
| Test | `npm test` |
| Test watch | `npm run test:watch` |
| Typecheck | `npm run typecheck` |

| Action | Commande |
|--------|----------|
| Sauvegarder | `./scripts/backup.sh <répertoire> [description]` |
| Lister sauvegardes | `ls -la backups/` |
| Comparer | `diff -r src/ backups/src_backup_2026-07-12/` |
| Vérifier checksum | `sha256sum -c fichier.sha256` |

---

## 📊 Résumé des Règles en 10 Secondes

1. **Lire** PROMPT_PROJET.md + specs/current/ AVANT tout
2. **Sauvegarder** si modification de masse (>10 fichiers ou >30% du code)
3. **Build** après toute modification : `npm run build`
4. **Documenter** les dates dans les fichiers principaux
5. **Ne jamais** supprimer specs/ ou backups/
6. **Valider** avec `diff` avant de restaurer

---

*Ce fichier doit être lu avant toute interaction avec le projet. En cas de doute, se référer à PROMPT_PROJET.md.*