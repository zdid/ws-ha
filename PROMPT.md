# PROMPT PROJET - Règles de Développement

## 📚 Table des Matières
1. [Règles Fondamentales](#-règles-fondamentales)
2. [Conventions de Nommage](#-conventions-de-nommage)
3. [Modifications de Programme](#-modifications-de-programme)
4. [Sauvegardes](#-sauvegardes)
5. [Intégration Git](#-intégration-git)
6. [Procédures Types](#-procédures-types)
7. [Cas Particuliers](#-cas-particuliers)
8. [Templates et Scripts](#-templates-et-scripts)

---

## 📋 Règles Fondamentales

### 1. **Conservation des Spécifications**
✅ **TOUJOURS** conserver les fichiers de spécifications.
❌ **JAMAIS** supprimer un fichier de spécifications, même si sa version est dépassée.

**Stockage :**
- Les spécifications actuelles → `specs/current/`
- Les versions obsolètes → `specs/archives/vX.Y.Z/`
- Un fichier `specs/CHANGELOG.md` doit tracer toutes les évolutions

---

### 2. **Immuabilité des Sauvegardes**
❌ **JAMAIS** modifier un fichier dans `backups/` après sa création.
✅ **TOUJOURS** créer une nouvelle sauvegarde si nécessaire.

---

### 3. **Convention de Nommage des Spécifications**
Les fichiers de spécification **doivent** contenir la version dans leur nom.

**Format recommandé :**
```
[nom]_specs_v[MAJEURE].[MINEURE].[PATCH][.suffixe].ext
```

**Exemples :**
- `api_specs_v1.0.0.md`
- `database_schema_v2.1.0.sql`
- `requirements_v3.0.0-beta.txt`

### 4. **Gestion des Dates dans les Fichiers**
Pour permettre le contrôle de version, **TOUJOURS** inclure un commentaire de date/heure correspondant à la date heure minutes secondes de le modification dans les fichiers principaux (index.html, etc.).

**Format obligatoire :**
```html
<!-- Derniere modification: AAAA-MM-JJ HH:MM:SS - [Description de la modification] -->
```

**Règles :**
- Utiliser le format ISO 8601 : `AAAA-MM-JJ`
- Inclure l'heure complète : `HH:MM:SS` (24h)
- Mettre à jour **immédiatement** après toute modification
- **Ne jamais** laisser une date obsolète

**Exemple :**
```html
<!-- Derniere modification: 2026-07-13 12:14:50 - deferAlpineStart=true, scripts en fin de body, Alpine.start() manuel -->
```

**Vérification :**
- Toujours vérifier ce commentaire pour confirmer la version du fichier
- En cas de doute, comparer avec le timestamp du système de fichiers

---

## ⚙️ Modifications de Programme

### 4. **Attention aux Modifications de Masse**
⚠️ **Définition :** Une modification de masse est tout changement touchant **plus de 10 fichiers** OU **plus de 30% du code d'un module**.

- **Privilégier** les modifications ciblées et incrémentales
- **Éviter** les refactorisations massives sans justification forte

### 4.1 **Analyse Systématique Obligatoire**
✅ **TOUJOURS analyser** avant toute modification :
- **Portée** : Nombre de fichiers touchés et pourcentage du code modifié dans chaque module
- **Risque de corruption** : La modification peut-elle casser des dépendances, des interfaces, ou la stabilité du programme ?
- **Criticité** : Le fichier modifié est-il critique (ex: service principal, configuration, parseur) ?

### 4.2 **Seuils et Actions Associés**

| Condition | Action Requise |
|-----------|----------------|
| Modification mineure (≤10 fichiers ET ≤30% du code d'un module) ET sans risque | Application directe avec transparence |
| Modification de masse (>10 fichiers OU >30% du code) **OU** risque de corruption identifié | ⚠️ **Demander confirmation explicite** + Créer une sauvegarde avant toute action |

### 4.3 **Risques des Modifications Massives par Script**
⚠️ **Les modifications massives par scripts (sed, awk, etc.) sont à haut risque** :
- **Non-unitarité** : Modifications potentiellement incohérentes ou mal appliquées.
- **Manque de contexte sémantique** : Les scripts ne comprennent pas le code.
- **Effets de bord imprévisibles** : Risque de corruption de fichiers critiques.

✅ **Règles strictes** :
- **❌ Interdit** : Utiliser `sed`, `awk`, ou outils similaires pour modifier du code source **sans validation manuelle préalable**.
- **✅ Préférer** : Outils de refactoring adaptés (IDE, linters, scripts dédiés et testés).
- **⚠️ Si indispensable** :
  1. Tester le script sur une **copie isolée** du projet.
  2. Valider **chaque changement individuellement** (ex: `git diff`).
  3. **Créer une sauvegarde complète** avant toute exécution.

---

## 💾 Sauvegardes

### 5. **Procédure de Sauvegarde Obligatoire**

Si une modification de masse est **indispensable** :

#### 5.1. Créer une sauvegarde
- **Emplacement :** Répertoire dédié aux sauvegardes (ex: `backups/`)
- **Structure :** Conserver **exactement** la même structure de répertoires que le projet original

#### 5.2. Nom de fichier de sauvegarde
Le nom **doit** intégrer :
- Le nom original du fichier
- La date au format `AAAA-MM-JJ`
- Eventuellement un identifiant de version ou description

**Format :**
```
[nom_original]_backup_[AAAA-MM-JJ][_description].ext
```

**Exemples :**
- `app.py_backup_2026-07-12.py`
- `config.json_backup_2026-07-12_before_migration.json`
- `models/component.py_backup_2026-07-12_v1.2.3.py`

#### 5.3. Gestion des versions multiples
- Le répertoire de sauvegarde peut contenir **plusieurs versions** du même programme
- Chaque version **doit** avoir un nom de fichier unique (via la date ou un suffixe)

---

### 6. **Sauvegarde à la Demande**

Je peux demander une sauvegarde complète d'un répertoire entier.

**Règles spécifiques :**
- Seuls **les noms de fichiers** intègrent le nouveau nom (date/suffixe)
- **Les répertoires** conservent leur nom d'origine
- La structure complète est préservée

**Exemple :**
```
Projet original:
project/
├── src/
│   ├── main.py
│   └── utils/
│       └── helper.py
└── config.json

Sauvegarde:
backups/project_2026-07-12/
├── src/
│   ├── main.py_backup_2026-07-12.py
│   └── utils/
│       └── helper.py_backup_2026-07-12.py
└── config.json_backup_2026-07-12.json
```

---

### 7. **Validation des Sauvegardes**
✅ **TOUJOURS vérifier** une sauvegarde avant de modifier l'original :
```bash
diff -r original/ backups/original_backup_2026-07-12/
```

---

### 8. **Nettoyage des Sauvegardes**
- Conserver **au minimum 3 versions** de chaque programme
- Archiver les anciennes sauvegardes (>6 mois) dans `backups/archives/`
- Supprimer uniquement après **validation manuelle** et accord écrit

---

## 🌿 Intégration Git

### 9. **Bonnes Pratiques Git**
- **Ne pas commiter** les sauvegardes dans le dépôt (ajouter `backups/` à `.gitignore`)
- **Taguer** les versions des spécifications : `git tag specs/v1.0.0`
- **Branches :** Utiliser `feature/`, `fix/`, `release/` pour les modifications
- **Commits :** Messages clairs et atomiques

---

## 📁 Structure Recommandée

```
projet/
├── specs/                          # Spécifications
│   ├── current/                    # Version actuelle
│   │   ├── api_specs_v2.0.0.md
│   │   └── database_schema_v3.1.0.sql
│   ├── archives/                   # Versions obsolètes
│   │   ├── v1.0/
│   │   │   └── api_specs_v1.0.0.md
│   │   └── v2.0/
│   │       └── api_specs_v2.0.0.md
│   └── CHANGELOG.md                # Historique des spécifications
├── src/                            # Code source
├── backups/                        # Sauvegardes
│   ├── programme1_backup_2026-07-12/
│   │   └── ...
│   ├── programme1_backup_2026-07-13/
│   │   └── ...
│   └── archives/                   # Archives anciennes
│       └── programme1_backup_2025-12-01/
│           └── ...
├── scripts/                        # Scripts utilitaires
│   └── backup.sh
├── .gitignore
└── README.md
```

---

## 🔧 Procédures Types

### 🔹 Avant toute modification importante

1. **Vérifier** s'il existe des spécifications concernées
2. **Créer une sauvegarde** si modification de masse (>10 fichiers ou >30% du code)
3. **Documenter** le changement dans `CHANGELOG.md` ou le commit
4. **Tester** les modifications avant validation
5. **Valider** la sauvegarde avec `diff`

### 🔹 Pour demander une sauvegarde

```
"Vibe, sauvegarde le répertoire [nom_répertoire] avec la date du jour."
```

### 🔹 Pour restaurer depuis une sauvegarde

1. Vérifier l'intégrité : `diff -r current/ backups/nom_backup/`
2. Copier les fichiers nécessaires
3. Documenter la restauration dans `CHANGELOG.md`

---

## ⚡ Cas Particuliers

### 🔸 Fichiers Binaires
- Toujours vérifier avec des **checksums** (MD5/SHA1) :
  ```bash
  sha256sum fichier.bin > fichier.bin.sha256
  ```

### 🔸 Bases de Données
- Sauvegarder avec `pg_dump`/`mysqldump` + date dans le nom :
  ```bash
  pg_dump db_name > backups/db_backup_2026-07-12.sql
  ```

### 🔸 Configurations
- **TOUJOURS** sauvegarder AVANT une mise à jour
- Conserver l'ancienne version avec suffixe : `config.old_2026-07-12.conf`

### 🔸 Fichiers Volumineux
- Pour les fichiers >100Mo : compresser en `.tar.gz` ou `.zip`
- Exemple : `data_backup_2026-07-12.tar.gz`

---

## 📝 Templates et Scripts

### 🔹 Script de Sauvegarde (backup.sh)

```bash
#!/bin/bash
# backup.sh - Script pour sauvegarder un répertoire
# Usage: ./backup.sh <répertoire_source> [description]

set -e

if [ -z "$1" ]; then
    echo "Erreur: Spécifiez un répertoire source"
    echo "Usage: $0 <répertoire> [description]"
    exit 1
fi

SOURCE="$1"
DESCRIPTION="${2:-}"
DEST_DIR="backups/$(basename "$SOURCE")_$(date +%Y-%m-%d)"

if [ -n "$DESCRIPTION" ]; then
    DEST_DIR="${DEST_DIR}_${DESCRIPTION}"
fi

# Créer la structure de destination
mkdir -p "$DEST_DIR"

# Copier récursivement
cp -r "$SOURCE"/* "$DEST_DIR/" 2>/dev/null || cp -r "$SOURCE"/. "$DEST_DIR/"

# Renommer les fichiers avec le suffixe de sauvegarde
find "$DEST_DIR" -type f -name "*.backup_*" -prune -o -type f -print | while read -r file; do
    dir=$(dirname "$file")
    base=$(basename "$file")
    ext="${base##*.}"
    name="${base%.*}"
    new_name="${name}_backup_$(date +%Y-%m-%d).${ext}"
    mv "$file" "$dir/$new_name"
done

echo "✅ Sauvegarde créée: $DEST_DIR"
ls -la "$DEST_DIR"
```

### 🔹 Template de Documentation de Sauvegarde

```markdown
---
**Fiche de Sauvegarde**
- **ID :** [auto-généré ou manuel]
- **Source :** `chemin/vers/répertoire/`
- **Destination :** `backups/nom_backup_2026-07-12/`
- **Date :** 2026-07-12
- **Heure :** 14:30:00
- **Raison :** [Refactorisation majeure / Migration / Correctif urgent]
- **Auteur :** [Nom ou identifiant]
- **Validé par :** [Nom ou identifiant]
- **Checksum :** [SHA256 du répertoire]
- **Taille :** [XX Mo/Go]
- **Fichiers :** [nombre de fichiers sauvegardés]
---

**Modifications associées :**
- [ ] Modification de masse
- [ ] Mise à jour de spécifications
- [ ] Correction de bug critique
- [ ] Autre: _______

**Notes :**
```

### 🔹 Commandes Utiles

| Action | Commande |
|--------|----------|
| Sauvegarder un répertoire | `./scripts/backup.sh src/ before_refactor` |
| Lister les sauvegardes | `ls -la backups/` |
| Comparer avec l'original | `diff -r src/ backups/src_backup_2026-07-12/` |
| Vérifier checksum | `sha256sum -c fichier.sha256` |
| Compresser une sauvegarde | `tar -czvf archive.tar.gz backups/nom_backup/` |
| Archiver une sauvegarde | `mv backups/ancien/ backups/archives/ancien_2026-07-12/` |

---

## ⚠️ Points Critiques

- **Ne jamais** supprimer `specs/` ou son contenu
- **Toujours** versionner les fichiers de spécifications
- **Vérifier** les sauvegardes avant de modifier
- **Documenter** chaque sauvegarde (pourquoi, quand, par qui)
- **Ne jamais** modifier les fichiers dans `backups/`
- **Conserver** au minimum 3 versions de chaque programme
- **Valider** les sauvegardes avec `diff` avant toute modification

---

*Ce fichier doit être lu et respecté avant tout travail sur un projet.*

---

## 📁 Structure Recommandée

```
projet/
├── specs/                  # Spécifications (toujours conservées)
│   ├── v1.0/              # Version 1.0 des specs
│   │   └── api_specs_v1.0.0.md
│   ├── v2.0/              # Version 2.0 des specs
│   │   └── api_specs_v2.0.0.md
│   └── current/           # Spécifications actuelles (symlink ou copie)
├── src/                   # Code source
├── backups/               # Sauvegardes des programmes
│   ├── programme1_backup_2026-07-12/
│   │   └── ...
│   ├── programme1_backup_2026-07-13/
│   │   └── ...
│   └── programme2_backup_2026-07-12/
│       └── ...
└── README.md
```

---

## 🔧 Procédures Types

### 🔹 Avant toute modification importante

1. **Vérifier** s'il existe des spécifications concernées
2. **Créer une sauvegarde** si modification de masse
3. **Documenter** le changement dans un fichier `CHANGELOG.md` ou commit
4. **Tester** les modifications avant validation

### 🔹 Pour demander une sauvegarde

```
"Vibe, sauvegarde le répertoire [nom_répertoire] avec la date du jour."
```

---

## ⚠️ Points Critiques

- **Ne jamais** supprimer `specs/` ou son contenu
- **Toujours** versionner les fichiers de spécifications
- **Vérifier** les sauvegardes avant de modifier
- **Documenter** chaque sauvegarde (pourquoi, quand, par qui)

---

*Ce fichier doit être lu et respecté avant tout travail sur un projet.*
