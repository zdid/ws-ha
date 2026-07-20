/**
 * Composant ModuleContainer - Conteneur pour les modules dynamiques
 * Charge et affiche le contenu des modules
 */

// Template HTML pour le Shadow DOM
const createTemplate = (): HTMLTemplateElement => {
  const template = document.createElement('template');
  template.innerHTML = `
    <style>
      .module-container {
        padding: 20px;
        min-height: 200px;
      }
      
      .module-content {
        background: #2c3e50;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        color: #ecf0f1;
      }
      
      .loading-hint {
        text-align: center;
        padding: 40px;
        color: #bdc3c7;
      }
      
      .error-hint {
        text-align: center;
        padding: 40px;
        color: #e74c3c;
        background: #34282c;
        border-radius: 8px;
      }
    </style>
    
    <div class="module-container" id="module-container">
      <div class="loading-hint">Chargement du module...</div>
    </div>
  `;
  return template;
};

export class ModuleContainer extends HTMLElement {
  private activeModule: string | null = null;
  private moduleContents: Record<string, string> = {};
  private moduleInited: Record<string, boolean> = {};
  
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    
    const template = createTemplate();
    this.shadowRoot!.appendChild(template.content.cloneNode(true));
  }
  
  connectedCallback() {
    this.setupEventListeners();
  }
  
  private setupEventListeners(): void {
    console.log('[ModuleContainer] setupEventListeners - Initialisation des écouteurs d\'événements');
    
    // Écouter les changements de module actif
    window.addEventListener('module:activated', (e: CustomEvent) => {
      console.log('[ModuleContainer] Événement module:activated reçu:', e.detail);
      this.activeModule = e.detail.moduleId || null;
      console.log('[ModuleContainer] Module actif défini à:', this.activeModule);
      if (this.activeModule) {
        console.log('[ModuleContainer] Chargement du contenu pour module:', this.activeModule);
        this.loadModuleContent(this.activeModule);
      }
    });
    
    // Écouter le chargement initial
    window.addEventListener('modules:loaded', (e: any) => {
      console.log('[ModuleContainer] Événement modules:loaded reçu:', e.detail);
      const modules = e.detail.modules;
      if (modules.length > 0 && !this.activeModule) {
        this.activeModule = modules[0].id;
        console.log('[ModuleContainer] Premier module défini à:', this.activeModule);
        if (this.activeModule) {
          console.log('[ModuleContainer] Chargement du contenu pour premier module:', this.activeModule);
          this.loadModuleContent(this.activeModule);
        }
      }
    });
  }
  
  /**
   * Charge le contenu d'un module
   */
  async loadModuleContent(moduleId: string): Promise<void> {
    console.log(`[ModuleContainer] loadModuleContent appelé pour module: ${moduleId}`);
    
    if (!moduleId) {
      console.log('[ModuleContainer] loadModuleContent - moduleId est vide, abandon');
      return;
    }
    
    // Ne pas charger de contenu pour le module core (géré par ConfigForm)
    // et ne pas recharger si déjà chargé et initialisé
    if (moduleId === 'core' || (this.moduleContents[moduleId] && this.moduleInited[moduleId])) {
      console.log(`[ModuleContainer] Module ${moduleId} déjà chargé, affichage du contenu existant`);
      console.log(`[ModuleContainer] moduleContents[${moduleId}] existe:`, !!this.moduleContents[moduleId]);
      console.log(`[ModuleContainer] moduleContents[${moduleId}] length:`, this.moduleContents[moduleId]?.length || 0);
      const container = this.shadowRoot!.getElementById('module-container');
      console.log(`[ModuleContainer] Conteneur trouvé:`, !!container);
      if (container && this.moduleContents[moduleId]) {
        container.innerHTML = `<div class="module-content">${this.moduleContents[moduleId]}</div>`;
        console.log(`[ModuleContainer] Contenu réaffiché pour ${moduleId}`);
        console.log(`[ModuleContainer] Conteneur innerHTML length:`, container.innerHTML.length);
        // Notifier que le module est chargé (pour les eventuels listeners)
        window.dispatchEvent(new CustomEvent('module:content:loaded', {
          detail: { moduleId }
        }));
      } else {
        console.log(`[ModuleContainer] ERREUR: Conteneur ou contenu manquant pour ${moduleId}`);
        console.log(`[ModuleContainer] container:`, !!container);
        console.log(`[ModuleContainer] moduleContents[${moduleId}]:`, !!this.moduleContents[moduleId]);
      }
      return;
    }
    
    const container = this.shadowRoot!.getElementById('module-container');
    if (!container) {
      console.log('[ModuleContainer] Conteneur introuvable, abandon');
      return;
    }
    
    try {
      console.log(`[ModuleContainer] Début du chargement du module: ${moduleId}`);
      
      // Afficher le chargement
      container.innerHTML = '<div class="loading-hint">Chargement du module...</div>';
      
      // Récupérer le contenu depuis le serveur
      console.log(`[ModuleContainer] Fetch URL: /applications/${moduleId}/presentation/index.html`);
      const response = await fetch(`/applications/${moduleId}/presentation/index.html`);
      
      console.log(`[ModuleContainer] Réponse reçue pour ${moduleId}: status=${response.status}, statusText=${response.statusText}`);
      
      if (response.ok) {
        const html = await response.text();
        this.moduleContents[moduleId] = html;
        console.log(`[ModuleContainer] Contenu HTML reçu pour ${moduleId}, longueur: ${html.length}`);
        
        container.innerHTML = `<div class="module-content">${html}</div>`;
        
        // Le contenu HTML charge lui-même ses Web Components via <script>
        // Pas besoin d'initialisation supplémentaire
        
        this.moduleInited[moduleId] = true;
        console.log(`[ModuleContainer] Module ${moduleId} marqué comme initialisé`);
        
        // Notifier que le module est chargé
        window.dispatchEvent(new CustomEvent('module:content:loaded', {
          detail: { moduleId }
        }));
        console.log(`[ModuleContainer] Événement module:content:loaded émis pour ${moduleId}`);
        
      } else if (response.status === 404) {
        // Module sans présentation HTML (comme core), ne pas afficher d'erreur
        console.log(`[ModuleContainer] Module ${moduleId} - 404: Aucun contenu HTML trouvé`);
        container.innerHTML = '<div class="loading-hint">Aucun contenu à afficher pour ce module</div>';
        this.moduleInited[moduleId] = true;
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error(`[ModuleContainer] Erreur de chargement du module ${moduleId}:`, error);
      const container = this.shadowRoot!.getElementById('module-container');
      if (container) {
        container.innerHTML = `<div class="error-hint">Erreur de chargement: ${(error as Error).message}</div>`;
      }
    }
  }
  
  /**
   * Retourne le contenu d'un module (pour accès externe)
   */
  getModuleContent(moduleId: string): string | undefined {
    return this.moduleContents[moduleId];
  }
  
  /**
   * Vérifie si un module est chargé
   */
  isModuleLoaded(moduleId: string): boolean {
    return !!this.moduleContents[moduleId];
  }
  
  /**
   * Vérifie si un module est initialisé
   */
  isModuleInited(moduleId: string): boolean {
    return !!this.moduleInited[moduleId];
  }
}

// Enregistrer le composant
customElements.define('app-module-container', ModuleContainer);
