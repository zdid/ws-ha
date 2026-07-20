// applications/core/src/application/ApplicationManager.ts
// Service de gestion dynamique de l'activation/désactivation des applications
// Conforme à specs-techniques-socle-ha-mqtt-v4.4.md §4.3

import { existsSync, mkdirSync, readdirSync, renameSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { Logger } from '../infrastructure/logger';
import type { RestartManager } from './RestartManager';

/**
 * ApplicationManager - Gère l'activation et la désactivation dynamique des applications
 * 
 * Structure des répertoires :
 * - ACTIF : applications/{app}/src/ + applications/{app}/dist/
 * - DÉSACTIVÉ : applications_désactivées/{app}/src/ + applications_désactivées/{app}/dist/
 * - CORE : applications/core/ (toujours actif, ne peut pas être désactivé)
 * 
 * Responsabilités :
 * - Lister les applications activées et désactivées
 * - Activer une application (déplacement depuis applications_désactivées/)
 * - Désactiver une application (déplacement vers applications_désactivées/)
 * - Déclencher un restart après modification
 */
export class ApplicationManager {
  private readonly projectRoot: string;
  private readonly appsDir: string;
  private readonly disabledAppsDir: string;
  private logger: Logger;
  private restartManager: RestartManager;

  /**
   * Crée un nouveau ApplicationManager
   */
  constructor(restartManager: RestartManager, logger: Logger) {
    // Chemin vers la racine du projet
    this.projectRoot = process.env.PROJECT_ROOT || path.resolve(path.join(__dirname, '../../../../'));
    
    // Répertoires des applications
    this.appsDir = path.join(this.projectRoot, 'applications');
    this.disabledAppsDir = path.join(this.projectRoot, 'applications_désactivées');

    this.restartManager = restartManager;
    this.logger = logger;

    // S'assurer que les répertoires existent
    this.ensureDirectories();
  }

  /**
   * S'assure que tous les répertoires nécessaires existent
   */
  private ensureDirectories(): void {
    // Applications activées
    if (!existsSync(this.appsDir)) {
      mkdirSync(this.appsDir, { recursive: true });
      this.logger.info('ApplicationManager', `Répertoire ${this.appsDir} créé`);
    }
    
    // Applications désactivées
    if (!existsSync(this.disabledAppsDir)) {
      mkdirSync(this.disabledAppsDir, { recursive: true });
      this.logger.info('ApplicationManager', `Répertoire ${this.disabledAppsDir} créé`);
    }
  }

  /**
   * Liste toutes les applications (activées + désactivées)
   */
  listAll(): { activated: string[]; disabled: string[] } {
    this.logger.info('ApplicationManager', `Scanning for applications - active: ${this.appsDir}, disabled: ${this.disabledAppsDir}`);
    const activated = this.getApplicationsInDir(this.appsDir);
    const disabled = this.getApplicationsInDir(this.disabledAppsDir);
    this.logger.info('ApplicationManager', `listAll: activated=${JSON.stringify(activated)}, disabled=${JSON.stringify(disabled)}`);
    return { activated, disabled };
  }

  /**
   * Récupère la liste des applications dans un répertoire
   */
  private getApplicationsInDir(baseDir: string): string[] {
    const apps: string[] = [];
    
    if (!existsSync(baseDir)) return apps;
    
    try {
      const entries = readdirSync(baseDir).filter(entry => {
        if (entry.startsWith('.')) return false;
        const fullPath = path.join(baseDir, entry);
        try {
          return statSync(fullPath).isDirectory();
        } catch {
          return false;
        }
      });
      
      for (const entry of entries) {
        if (this.isValidAppDir(path.join(baseDir, entry))) {
          apps.push(entry);
        }
      }
    } catch (error) {
      this.logger.warn('ApplicationManager', `Erreur de lecture du répertoire ${baseDir}: ${error}`);
    }
    
    return apps;
  }

  /**
   * Vérifie qu'un répertoire est une application valide
   * (contient un répertoire src/ ou dist/ ou package.json)
   */
  private isValidAppDir(dirPath: string): boolean {
    const srcDir = path.join(dirPath, 'src');
    const distDir = path.join(dirPath, 'dist');
    const packageJson = path.join(dirPath, 'package.json');
    
    // Une application valide a au moins un de ces éléments
    return existsSync(srcDir) || existsSync(distDir) || existsSync(packageJson);
  }

  /**
   * Active une application (déplace de applications_désactivées/ vers applications/)
   */
  enable(appId: string): { success: boolean; error?: string } {
    try {
      // Valider le nom de l'application
      if (!this.isValidAppId(appId)) {
        return { success: false, error: `Nom d'application invalide: ${appId}` };
      }

      // Vérifier que l'application n'est pas déjà activée
      if (this.listAll().activated.includes(appId)) {
        return { success: false, error: `Application ${appId} déjà activée` };
      }

      // Vérifier que l'application existe dans applications_désactivées/
      if (!this.listAll().disabled.includes(appId)) {
        return { success: false, error: `Application ${appId} non trouvée dans applications_désactivées/` };
      }

      // S'assurer que les répertoires cibles existent
      this.ensureDirectories();

      // Déplacer toute l'application (src/ + dist/ + package.json, etc.)
      const disabledPath = path.join(this.disabledAppsDir, appId);
      const activePath = path.join(this.appsDir, appId);
      
      if (existsSync(disabledPath)) {
        if (existsSync(activePath)) {
          return { success: false, error: `Conflit : ${appId} existe déjà dans applications/` };
        }
        renameSync(disabledPath, activePath);
        this.logger.info('ApplicationManager', `Application ${appId} déplacée de applications_désactivées/ vers applications/`);
      }

      // Déclencher un restart
      this.restartManager.scheduleRestart();
      this.logger.info('ApplicationManager', `Application ${appId} activée`);
      
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error('ApplicationManager', `Erreur lors de l'activation de ${appId}: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Désactive une application (déplace de applications/ vers applications_désactivées/)
   */
  disable(appId: string): { success: boolean; error?: string } {
    try {
      // Valider le nom de l'application
      if (!this.isValidAppId(appId)) {
        return { success: false, error: `Nom d'application invalide: ${appId}` };
      }

      // Vérifier que ce n'est pas une application core
      if (appId === 'core') {
        return { success: false, error: `Impossible de désactiver l'application core` };
      }

      // Vérifier que l'application existe dans applications/
      if (!this.listAll().activated.includes(appId)) {
        return { success: false, error: `Application ${appId} non trouvée dans applications/` };
      }

      // S'assurer que les répertoires cibles existent
      this.ensureDirectories();

      // Déplacer toute l'application
      const activePath = path.join(this.appsDir, appId);
      const disabledPath = path.join(this.disabledAppsDir, appId);
      
      if (existsSync(activePath)) {
        if (existsSync(disabledPath)) {
          return { success: false, error: `Conflit : ${appId} existe déjà dans applications_désactivées/` };
        }
        renameSync(activePath, disabledPath);
        this.logger.info('ApplicationManager', `Application ${appId} déplacée de applications/ vers applications_désactivées/`);
      }

      // Déclencher un restart
      this.restartManager.scheduleRestart();
      this.logger.info('ApplicationManager', `Application ${appId} désactivée`);
      
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error('ApplicationManager', `Erreur lors de la désactivation de ${appId}: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Vérifie qu'un identifiant d'application est valide
   * (ne contient que des caractères alphanumériques, tirets et underscores)
   */
  private isValidAppId(appId: string): boolean {
    return /^[a-zA-Z0-9_-]+$/.test(appId);
  }

  /**
   * Vérifie si une application existe (activée ou désactivée)
   */
  exists(appId: string): boolean {
    const { activated, disabled } = this.listAll();
    return activated.includes(appId) || disabled.includes(appId);
  }

  /**
   * Récupère le statut d'une application spécifique
   */
  getStatus(appId: string): 'activated' | 'disabled' | 'not_found' {
    const { activated, disabled } = this.listAll();
    if (activated.includes(appId)) return 'activated';
    if (disabled.includes(appId)) return 'disabled';
    return 'not_found';
  }
}
