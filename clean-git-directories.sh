#!/bin/bash

# =============================================================================
# Script : clean-git-directories.sh
# Description : Supprime plusieurs répertoires de TOUT l'historique Git
# Usage : ./clean-git-directories.sh dir1 dir2 dir3 ...
# Exemple : ./clean-git-directories.sh src/applications/ src/ha/ old-files/
# =============================================================================

set -euo pipefail

# =============================================================================
# COULEURS
# =============================================================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# =============================================================================
# VARIABLES GLOBALES
# =============================================================================
BACKUP_DIR=""
ORIGINAL_DIR="$(pwd)"

# =============================================================================
# FONCTIONS
# =============================================================================

# Affiche un message d'erreur et exit
error_exit() {
    echo -e "${RED}❌ ERREUR: $1${NC}" >&2
    cd "$ORIGINAL_DIR"
    exit 1
}

# Affiche un message d'avertissement
warn() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Affiche un message d'information
info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Affiche un message de succès
success() {
    echo -e "${GREEN}✅ $1${NC}"
}

# Vérifie que le paramètre est fourni
check_parameters() {
    if [ $# -eq 0 ]; then
        error_exit "Aucun répertoire spécifié. Usage: $0 dir1 dir2 dir3 ..."
    fi
    
    for dir in "$@"; do
        if [ -z "$dir" ]; then
            error_exit "Un paramètre est vide"
        fi
    done
}

# Vérifie que nous sommes dans un dépôt Git
check_git_repo() {
    if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        error_exit "Ce n'est pas un dépôt Git ou le répertoire courant n'est pas un dépôt Git."
    fi
}

# Vérifie que git-filter-repo est installé
check_filter_repo() {
    if ! command -v git-filter-repo &>/dev/null; then
        error_exit "git-filter-repo n'est pas installé. Installez-le avec: pip install git-filter-repo"
    fi
}

# Crée une sauvegarde locale
create_backup() {
    local timestamp=$(date +%Y%m%d-%H%M%S)
    BACKUP_DIR="git-backup-$timestamp"
    
    info "Création de la sauvegarde locale dans $BACKUP_DIR..."
    
    # Créer un bundle de toutes les branches
    git bundle create "$BACKUP_DIR.bundle" --all
    
    # Copier le répertoire .git
    cp -r .git "$BACKUP_DIR"
    
    # Sauvegarder aussi les fichiers non versionnés (au cas où)
    if [ -d .gitignore ]; then
        # Sauvegarder les fichiers ignorés importants
        if [ -f config.yaml ]; then
            cp config.yaml "$BACKUP_DIR/"
        fi
        if [ -d data ]; then
            cp -r data "$BACKUP_DIR/"
        fi
    fi
    
    success "Sauvegarde créée: $BACKUP_DIR/ et $BACKUP_DIR.bundle"
}

# Supprime un répertoire de l'historique
remove_directory_from_history() {
    local dir_to_remove="$1"
    info "Suppression de '$dir_to_remove' de l'historique..."
    git filter-repo --path "$dir_to_remove" --invert-paths --force
    success "Historique nettoyé pour '$dir_to_remove'"
}

# Nettoie les références Git
clean_git_refs() {
    info "Nettoyage des références Git..."
    git reflog expire --expire=now --all
    git gc --prune=now --aggressive
    success "Références Git nettoyées"
}

# Affiche les instructions finales
show_instructions() {
    echo ""
    echo -e "${YELLOW}=============================================================================${NC}"
    echo -e "${YELLOW}⚠️  INSTRUCTIONS POUR FINALISER (À EXÉCUTER MANUELLEMENT)  ⚠️${NC}"
    echo -e "${YELLOW}=============================================================================${NC}"
    echo ""
    echo "1. Vérifiez que les répertoires ont bien été supprimés :"
    for dir in "${DIRECTORIES[@]}"; do
        echo -e "   ${BLUE}git log --all -- \"$dir\"  # Doit retourner 'nothing to show'${NC}"
    done
    echo ""
    echo "2. Si vous êtes satisfait, poussez les modifications :"
    echo -e "   ${BLUE}git push origin --force --all${NC}"
    echo -e "   ${BLUE}git push origin --force --tags${NC}"
    echo ""
    echo -e "${RED}⚠️  ATTENTION : Cela réécrira l'historique sur le dépôt distant !${NC}"
    echo -e "${RED}⚠️  Tous les collaborateurs devront recloner le dépôt.${NC}"
    echo ""
    echo "3. Si quelque chose ne va pas, restaurez depuis la sauvegarde :"
    echo -e "   ${BLUE}cd $BACKUP_DIR && git bundle verify $BACKUP_DIR.bundle${NC}"
    echo -e "   ${BLUE}git clone $BACKUP_DIR.bundle repo-restored${NC}"
    echo -e "   ${BLUE}cd repo-restored && cp -r $BACKUP_DIR/.git .${NC}"
    echo -e "${YELLOW}=============================================================================${NC}"
}

# =============================================================================
# EXÉCUTION PRINCIPALE
# =============================================================================

main() {
    # Vérifier les paramètres
    check_parameters "$@"
    local DIRECTORIES=("$@")
    
    # Vérifier que c'est un dépôt Git
    check_git_repo
    
    # Vérifier que git-filter-repo est installé
    check_filter_repo
    
    echo ""
    echo -e "${RED}=============================================================================${NC}"
    echo -e "${RED}⚠️  DANGER : Ce script va RÉÉCRIRE l'historique Git !            ⚠️${NC}"
    echo -e "${RED}⚠️  Cette opération est IRRÉVERSIBLE sans la sauvegarde.         ⚠️${NC}"
    echo -e "${RED}=============================================================================${NC}"
    echo ""
    
    # Afficher ce qui va être supprimé
    echo "Vous allez supprimer ces répertoires de TOUT l'historique :"
    for dir in "${DIRECTORIES[@]}"; do
        echo -e "  ${BLUE}→ $dir${NC}"
    done
    echo ""
    
    # Demander confirmation
    read -p "Êtes-vous SÛR de vouloir continuer ? (Oui/Non) : " -r
    echo ""
    if [[ ! $REPLY =~ ^[Oo][Uu][Ii]$ ]]; then
        error_exit "Opération annulée par l'utilisateur."
    fi
    
    # Créer une sauvegarde
    create_backup
    
    echo ""
    info "Début du nettoyage de l'historique..."
    
    # Supprimer chaque répertoire de l'historique
    for dir in "${DIRECTORIES[@]}"; do
        remove_directory_from_history "$dir"
    done
    
    # Nettoyer les références
    clean_git_refs
    
    # Vérifier le résultat
    echo ""
    info "Vérification des résultats..."
    local all_removed=true
    for dir in "${DIRECTORIES[@]}"; do
        if git log --all -- "$dir" | grep -q "$dir"; then
            warn "Le répertoire '$dir' est toujours présent dans l'historique !"
            all_removed=false
        else
            success "Le répertoire '$dir' a bien été supprimé de l'historique."
        fi
    done
    
    if [ "$all_removed" = false ]; then
        error_exit "Certains répertoires n'ont pas été complètement supprimés."
    fi
    
    # Afficher les instructions finales
    show_instructions
}

# Appel de la fonction principale avec tous les arguments
main "$@"
