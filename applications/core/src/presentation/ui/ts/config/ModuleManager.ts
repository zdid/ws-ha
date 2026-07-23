import { Module, ModuleUiMetadata, ConfigField, ConfigFieldGroup, isConfigFieldGroup } from '../types';

/**
 * Manager de modules
 * Gère la liste des modules et leurs métadonnées UI
 */

interface ModuleConfig {
  [key: string]: any;
}

export class ModuleManager {
  private modules: Module[] = [];
  private socket: any;
  private moduleConfigs: Record<string, ModuleConfig> = {};
  private moduleUiMetadata: Record<string, ModuleUiMetadata> = {};
  public activeModule: string | null = null;
  
  constructor(socket: any) {
    this.socket = socket;
    this.setupSocketListeners();
  }
  
  /**
   * Configure les écouteurs Socket.io
   */
  private setupSocketListeners(): void {
    // Liste des modules
    this.socket.on('app:modules:list', (data: { modules: Module[] }) => {
      this.modules = data.modules;
      
      // Charger les configurations de chaque module
      data.modules.forEach(module => {
        this.socket.emit('app:modules:config:get', { moduleId: module.id });
      });
      
      // Notifier que les modules sont chargés
      console.log('[ModuleManager] Modules chargés, dispatch modules:loaded:', this.modules.map(m => `${m.id}(${m.name})`));
      window.dispatchEvent(new CustomEvent('modules:loaded', {
        detail: { modules: this.modules }
      }));
      
      // Définir le premier module comme actif par défaut (sauf core, qui est géré par ConfigForm)
      if (this.modules.length > 0 && !this.activeModule) {
        const firstNonCoreModule = this.modules.find(m => m.id !== 'core');
        if (firstNonCoreModule) {
          this.setActiveModule(firstNonCoreModule.id);
        } else if (this.modules[0].id !== 'core') {
          this.setActiveModule(this.modules[0].id);
        }
        // Si seul core existe, ne pas l'activer (pas de présentation à charger)
      }
    });
    
    // Configuration d'un module
    this.socket.on('app:module:config', (data: { moduleId: string; config: ModuleConfig }) => {
      if (data.moduleId && data.config !== undefined) {
        this.moduleConfigs[data.moduleId] = data.config;
        console.log(`[ModuleManager] Configuration reçue pour module: ${data.moduleId}`);
        
        window.dispatchEvent(new CustomEvent('module:config:loaded', {
          detail: { moduleId: data.moduleId, config: data.config }
        }));
      }
    });
    
    // Métadonnées UI d'un module
    this.socket.on('app:module:ui:register', (data: { moduleId: string; metadata: ModuleUiMetadata }) => {
      this.moduleUiMetadata[data.moduleId] = data.metadata;
      console.log(`[ModuleManager] Métadonnées UI reçues pour module: ${data.moduleId}`);
      
      // Demander la config du module
      this.socket.emit('app:modules:config:get', { moduleId: data.moduleId });
    });
    
    // Configuration sauvegardée
    this.socket.on('app:module:config:saved', (data: { moduleId: string; success: boolean }) => {
      if (data.success) {
        console.log(`[ModuleManager] Configuration du module ${data.moduleId} sauvegardée`);
      }
    });
  }
  
  /**
   * Retourne la liste de tous les modules
   */
  getModules(): Module[] {
    return [...this.modules];
  }
  
  /**
   * Retourne un module spécifique
   */
  getModule(id: string): Module | undefined {
    return this.modules.find(m => m.id === id);
  }
  
  /**
   * Définit le module actif
   */
  setActiveModule(id: string): void {
    this.activeModule = id;
    const module = this.modules.find(m => m.id === id);
    
    if (module) {
      // Charger le contenu du module si nécessaire
      window.dispatchEvent(new CustomEvent('module:activated', {
        detail: { moduleId: id, module }
      }));
    }
  }
  
  /**
   * Charge la configuration d'un module
   */
  getModuleConfig(moduleId: string): ModuleConfig | undefined {
    return this.moduleConfigs[moduleId];
  }
  
  /**
   * Récupère la valeur d'un champ d'un module
   */
  getModuleField(moduleId: string, fieldName: string): any {
    const config = this.moduleConfigs[moduleId] || {};
    return this.getNestedValue(config, fieldName);
  }
  
  /**
   * Écrit une valeur dans l'objet config en respectant un chemin imbriqué
   * (ex: "mqtt.host" → config.mqtt.host) — symétrique de getNestedValue().
   */
  private setNestedValue(config: ModuleConfig, fieldPath: string, value: any): void {
    const parts = fieldPath.split('.');
    let current: any = config;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
        current[parts[i]] = {};
      }
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
  }

  /**
   * Met à jour la valeur d'un champ d'un module
   */
  setModuleField(event: Event, moduleId: string, fieldName: string): void {
    if (!this.moduleConfigs[moduleId]) {
      this.moduleConfigs[moduleId] = {};
    }

    const target = event.target as HTMLInputElement;
    const value = target.type === 'number'
      ? parseFloat(target.value) || 0
      : target.type === 'checkbox'
        ? target.checked
        : target.value;

    this.setNestedValue(this.moduleConfigs[moduleId], fieldName, value);

    window.dispatchEvent(new CustomEvent('module:field:updated', {
      detail: { moduleId, fieldName, value }
    }));
  }

  /**
   * Bascule un champ booléen d'un module
   */
  toggleModuleField(moduleId: string, fieldName: string): void {
    if (!this.moduleConfigs[moduleId]) {
      this.moduleConfigs[moduleId] = {};
    }

    const current = this.getModuleField(moduleId, fieldName);
    const value = !current;
    this.setNestedValue(this.moduleConfigs[moduleId], fieldName, value);

    window.dispatchEvent(new CustomEvent('module:field:updated', {
      detail: { moduleId, fieldName, value }
    }));
  }

  /**
   * Sélectionne une valeur dans un select
   */
  setSelectField(event: Event, moduleId: string, fieldName: string): void {
    if (!this.moduleConfigs[moduleId]) {
      this.moduleConfigs[moduleId] = {};
    }

    const target = event.target as HTMLSelectElement;
    this.setNestedValue(this.moduleConfigs[moduleId], fieldName, target.value);

    window.dispatchEvent(new CustomEvent('module:field:updated', {
      detail: { moduleId, fieldName, value: target.value }
    }));
  }
  
  /**
   * Sauvegarde la configuration d'un module
   */
  saveModuleConfig(moduleId: string): void {
    console.log('[ModuleManager] Sauvegarde config module - moduleId:', moduleId);
    
    // Utiliser this.moduleConfigs, alimenté en direct par les éditions du formulaire
    // (setModuleField/toggleModuleField/setSelectField) — TechnicalConfigManager ne
    // reflète jamais ces éditions, seulement la dernière config confirmée par le serveur.
    const config = this.moduleConfigs[moduleId] || {};
    console.log('[ModuleManager] Config module:', JSON.stringify(config, null, 2));
    console.log('[ModuleManager] Envoi de app:modules:config:save au serveur');
    this.socket.emit('app:modules:config:save', { moduleId, config });
    
    window.dispatchEvent(new CustomEvent('module:config:saving', {
      detail: { moduleId }
    }));
    
    // Reset après un délai
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('module:config:saved', {
        detail: { moduleId }
      }));
    }, 1000);
  }
  
  /**
   * Retourne les métadonnées UI d'un module
   */
  getModuleUiMetadata(moduleId: string): ModuleUiMetadata | undefined {
    return this.moduleUiMetadata[moduleId];
  }
  
  /**
   * Génère un formulaire de configuration pour un module
   */
  generateModuleConfigForm(moduleId: string): string {
    const metadata = this.moduleUiMetadata[moduleId];
    
    if (!metadata) {
      return `<div class="error-hint">Métadonnées UI non disponibles pour ${moduleId}</div>`;
    }
    
    if (!this.moduleConfigs[moduleId]) {
      this.moduleConfigs[moduleId] = {};
    }
    
    const config = this.moduleConfigs[moduleId];
    const fields = metadata.fields || [];

    let html = `
      <div class="module-config-header">
        <h3>${metadata.icon || ''} ${metadata.title}</h3>
        <p class="section-description">${metadata.description}</p>
      </div>
      <form class="module-config-form" onsubmit="return false">
    `;

    // Générer les champs — supporte les champs plats (ConfigField[]) ET les groupes
    // (ConfigFieldGroup[], ex: nommage/rfxcom/evoo7) : un groupe entier traité comme un champ
    // unique produisait auparavant une ligne "undefined" (field.name/type inexistants).
    fields.forEach(item => {
      if (isConfigFieldGroup(item)) {
        html += this.generateFieldGroupHtml(item, config, moduleId);
      } else {
        html += `<div class="config-grid">${this.generateFieldHtml(item, config, moduleId)}</div>`;
      }
    });

    html += `
      </form>
      <div class="section-actions module-config-actions">
        <button onclick="window.app.moduleManager.saveModuleConfig('${moduleId}')"
                class="btn btn-primary">
          Sauvegarder
        </button>
      </div>
    `;

    return html;
  }

  /**
   * Génère le HTML pour un groupe de champs (title/description/fields imbriqués).
   */
  private generateFieldGroupHtml(group: ConfigFieldGroup, config: ModuleConfig, moduleId: string): string {
    const fieldsHtml = group.fields.map(field => this.generateFieldHtml(field, config, moduleId)).join('');
    return `
      <div class="module-config-group">
        <h4>${group.icon || ''} ${group.title || ''}</h4>
        ${group.description ? `<p class="section-description">${group.description}</p>` : ''}
        <div class="config-grid">${fieldsHtml}</div>
      </div>
    `;
  }
  
  /**
   * Génère le HTML pour un champ spécifique
   */
  private generateFieldHtml(field: ConfigField, config: ModuleConfig, moduleId: string): string {
    const fieldName = field.name;
    const resolved = this.getNestedValue(config, fieldName);
    const value = resolved !== undefined ? resolved : field.default ?? '';
    const id = `field-${moduleId}-${fieldName.replace(/\./g, '-')}`;

    let html = `
      <div class="form-group" id="${id}">
        <label for="${id}">
          ${field.label}
          ${field.required ? '<span class="required-badge">Requis</span>' : ''}
        </label>
    `;

    // Générer l'input en fonction du type
    switch (field.type) {
      case 'text':
      case 'string':
        html += `
          <input
            type="text"
            id="${id}"
            value="${value || ''}"
            data-module="${moduleId}"
            data-field="${fieldName}"
            placeholder="${field.placeholder || ''}"
          />
          ${field.hint ? '<div class="field-hint">' + field.hint + '</div>' : ''}
        `;
        break;

      case 'number':
        html += `
          <input 
            type="number" 
            id="${id}"
            value="${value || ''}"
            data-module="${moduleId}"
            data-field="${fieldName}"
            ${field.min !== undefined ? `min="${field.min}"` : ''}
            ${field.max !== undefined ? `max="${field.max}"` : ''}
            ${field.step !== undefined ? `step="${field.step}"` : ''}
            placeholder="${field.placeholder || ''}"
          />
          ${field.hint ? '<div class="field-hint">' + field.hint + '</div>' : ''}
        `;
        break;
        
      case 'boolean':
        html += `
          <input 
            type="checkbox" 
            id="${id}"
            ${value ? 'checked' : ''}
            data-module="${moduleId}"
            data-field="${fieldName}"
          />
          ${field.hint ? '<div class="field-hint">' + field.hint + '</div>' : ''}
        `;
        break;
        
      case 'select':
        html += `
          <select
            id="${id}"
            data-module="${moduleId}"
            data-field="${fieldName}"
          >
            ${field.options?.map(opt => {
              // options accepte soit string[] (ex: ['debug','info',...]) soit {value,label}[]
              const optValue = typeof opt === 'string' ? opt : opt.value;
              const optLabel = typeof opt === 'string' ? opt : opt.label;
              return `<option value="${optValue}" ${value === optValue ? 'selected' : ''}>${optLabel}</option>`;
            }).join('') || ''}
          </select>
          ${field.hint ? '<div class="field-hint">' + field.hint + '</div>' : ''}
        `;
        break;
        
      case 'password':
        html += `
          <input 
            type="password" 
            id="${id}"
            value="${value || ''}"
            data-module="${moduleId}"
            data-field="${fieldName}"
            autocomplete="off"
            placeholder="${field.placeholder || ''}"
          />
          ${field.hint ? '<div class="field-hint">' + field.hint + '</div>' : ''}
        `;
        break;
    }
    
    html += '</div>';
    return html;
  }

  /**
   * Résout un chemin de champ (ex: "mqtt.host") en valeur imbriquée dans l'objet config
   * (ex: config.mqtt.host) — accès plat config[fieldName] auparavant, qui ne trouvait jamais
   * rien pour les noms de champs pointés utilisés par nommage/rfxcom/evoo7 (mirroring
   * ConfigForm.getFieldValue, applications/core/src/presentation/ui/ts/components/ConfigForm.ts).
   */
  private getNestedValue(config: ModuleConfig, fieldPath: string): any {
    const parts = fieldPath.split('.');
    let current: any = config;
    for (const part of parts) {
      if (current && current[part] !== undefined) {
        current = current[part];
      } else {
        return undefined;
      }
    }
    return current;
  }

  /**
   * Retourne la classe CSS pour le statut d'un module
   */
  getModuleStatusClass(moduleId: string): string {
    const module = this.modules.find(m => m.id === moduleId);
    if (!module) return '';
    
    const statusClasses: Record<string, string> = {
      configured: 'status-configured',
      partial: 'status-partial',
      missing: 'status-missing',
      error: 'status-error'
    };
    
    return statusClasses[module.status] || '';
  }
  
  /**
   * Retourne l'icône de statut d'un module
   */
  getModuleStatusIcon(moduleId: string): string {
    const module = this.modules.find(m => m.id === moduleId);
    if (!module) return '';
    
    const statusIcons: Record<string, string> = {
      configured: '✓',
      partial: '⚠',
      missing: '✗',
      error: '✘'
    };
    
    return statusIcons[module.status] || '';
  }
  
  /**
   * Charge les modules depuis le socket
   */
  loadModules(modules: Module[]): void {
    this.modules = modules;
    if (modules.length > 0 && !this.activeModule) {
      this.setActiveModule(modules[0].id);
    }
    
    console.log('[ModuleManager] loadModules - Modules chargés, dispatch modules:loaded:', modules.map(m => `${m.id}(${m.name})`));
    window.dispatchEvent(new CustomEvent('modules:loaded', {
      detail: { modules: this.modules }
    }));
  }
}
