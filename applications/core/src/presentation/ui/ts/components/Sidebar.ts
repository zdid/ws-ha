import { Module, ApplicationMenuConfig } from '../types';

/**
 * Composant Sidebar - Barre latérale de navigation
 * Web Component pour afficher le menu des applications
 */

// Template HTML pour le Shadow DOM
const createTemplate = (): HTMLTemplateElement => {
  const template = document.createElement('template');
  template.innerHTML = `
    <style>
      .sidebar {
        width: 250px;
        height: 100vh;
        background: #2c3e50;
        color: white;
        position: fixed;
        left: 0;
        top: 0;
        display: flex;
        flex-direction: column;
        z-index: 1000;
        box-shadow: 2px 0 5px rgba(0, 0, 0, 0.5);
      }
      
      .sidebar-header {
        padding: 20px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      }
      
      .sidebar-header h1 {
        margin: 0;
        font-size: 1.5rem;
        font-weight: 600;
      }
      
      .sidebar-header p {
        margin: 5px 0 0 0;
        font-size: 0.85rem;
        color: #bdc3c7;
      }
      
      .sidebar-nav {
        flex: 1;
        padding: 15px;
        overflow-y: auto;
      }
      
      .nav-title {
        font-size: 0.85rem;
        text-transform: uppercase;
        color: #bdc3c7;
        margin-bottom: 10px;
        padding: 0 10px;
      }
      
      .nav-list {
        list-style: none;
        padding: 0;
        margin: 0;
      }
      
      .nav-item {
        margin-bottom: 5px;
        border-radius: 4px;
        transition: background-color 0.2s;
      }
      
      .nav-item.nav-item-active {
        background-color: #2c3e50;
      }
      
      .nav-item:hover:not(.nav-item-active) {
        background-color: #34495e;
      }
      
      .nav-link {
        display: flex;
        align-items: center;
        padding: 10px 15px;
        color: white;
        text-decoration: none;
        cursor: pointer;
      }
      
      .nav-icon {
        margin-right: 10px;
        font-size: 1.1rem;
      }
      
      .nav-label {
        flex: 1;
        font-size: 0.9rem;
      }
      
      .nav-status {
        display: flex;
        align-items: center;
        font-size: 0.85rem;
      }
      
      .nav-status .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        margin-right: 5px;
      }
      
      .status-configured { color: #2ecc71; }
      .status-partial { color: #f39c12; }
      .status-missing { color: #e74c3c; }
      .status-error { color: #c0392b; }
      
      .sidebar-footer {
        padding: 15px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
      }
      
      .status-indicator {
        display: flex;
        align-items: center;
        font-size: 0.85rem;
        color: #bdc3c7;
      }
      
      .status-indicator .status-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background-color: #e74c3c;
        margin-right: 8px;
        transition: background-color 0.3s;
      }
      
      .status-indicator.connected .status-dot {
        background-color: #2ecc71;
      }
      
      .uptime {
        font-size: 0.85rem;
        color: #bdc3c7;
        margin-top: 10px;
      }
      
      .app-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 15px;
        border-radius: 4px;
        margin-bottom: 5px;
        cursor: pointer;
        transition: background-color 0.2s;
      }
      
      .app-item:hover {
        background-color: #34495e;
      }
      
      .app-info {
        display: flex;
        align-items: center;
        flex: 1;
      }
      
      .app-name {
        margin-left: 10px;
      }
      
      .app-badge {
        font-size: 0.75rem;
        padding: 2px 8px;
        border-radius: 10px;
        background-color: rgba(255, 255, 255, 0.1);
      }
      
      .app-badge.activated { background-color: #2ecc71; }
      .app-badge.disabled { background-color: #e74c3c; }
      
      /* Style pour les sous-menus des paramètres d'applications */
      .app-param-item .nav-link {
        padding-left: 30px;
      }
      
      .app-actions button {
        padding: 4px 12px;
        font-size: 0.75rem;
        border: none;
        border-radius: 3px;
        cursor: pointer;
      }
      
      .btn-success { background-color: #2ecc71; color: white; }
      .btn-warning { background-color: #f39c12; color: white; }
      
      .section-actions {
        margin-top: 15px;
        padding: 10px 15px;
      }
      
      /* Contenu principal */
      .main-content {
        margin-left: 250px;
        padding: 20px;
        min-height: 100vh;
      }
      
      .content-section {
        display: none;
      }
      
      .content-section[style*="display: block"] {
        display: block;
      }
      
      /* Alignement des sous-menus dans Paramètres Techniques */
      .app-param-item .nav-link {
        padding-left: 15px;
      }
      
      /* Menu accordéon pour Paramètres Techniques */
      .nav-section {
        margin-bottom: 5px;
      }
      
      .nav-section-header {
        display: flex;
        align-items: center;
        padding: 10px 15px;
        cursor: pointer;
        border-radius: 4px;
        transition: background-color 0.2s;
      }
      
      .nav-section-header:hover {
        background-color: #34495e;
      }
      
      .nav-section-title {
        font-size: 0.85rem;
        text-transform: uppercase;
        color: #bdc3c7;
        flex: 1;
      }
      
      .toggle-icon {
        font-size: 0.8rem;
        transition: transform 0.3s;
      }
      
      .nav-section-collapse {
        display: none;
      }
      
      .nav-section-collapse.visible {
        display: block !important;
      }
      
      .nav-section-header.expanded .toggle-icon {
        transform: rotate(90deg);
      }
      
      .nav-section-list {
        list-style: none;
        padding: 0;
        margin: 0;
      }
    </style>
    
    <aside class="sidebar">
      <div class="sidebar-header">
        <h1>HA/MQTT</h1>
        <p>Configuration Interface</p>
      </div>
      
      <nav class="sidebar-nav">
        <!-- PARAMETRES TECHNIQUES - Accordéon -->
        <div class="nav-section">
          <div class="nav-section-header collapsed" id="params-header">
            <span class="nav-section-title">Paramètres Techniques</span>
            <span class="toggle-icon">▲</span>
          </div>
          <div class="nav-section-collapse" id="params-collapse">
            <ul class="nav-section-list">
              <li class="nav-item">
                <a href="#ha" class="nav-link" data-section="ha">
                  <span class="nav-icon">⚙️</span>
                  <span class="nav-label">Web-services</span>
                </a>
              </li>
              <li class="nav-item">
                <a href="#mqtt" class="nav-link" data-section="mqtt">
                  <span class="nav-icon">📡</span>
                  <span class="nav-label">MQTT (Broker externe)</span>
                </a>
              </li>
              <li class="nav-item">
                <a href="#web" class="nav-link" data-section="web">
                  <span class="nav-icon">🌐</span>
                  <span class="nav-label">Serveur Web</span>
                </a>
              </li>
              <li class="nav-item">
                <a href="#logging" class="nav-link" data-section="logging">
                  <span class="nav-icon">📝</span>
                  <span class="nav-label">Journalisation</span>
                </a>
              </li>
              <li class="nav-item">
                <a href="#applications-manager" class="nav-link" data-section="applications-manager">
                  <span class="nav-icon">📦</span>
                  <span class="nav-label">Gestion des applications</span>
                </a>
              </li>
              <!-- Sous-menus générés pour chaque application -->
              <div id="app-params-submenu"></div>
            </ul>
          </div>
        </div>
        
        <!-- MODULES/APPLICATIONS -->
        <div class="nav-section">
          <div class="nav-section-header collapsed">
            <span class="nav-section-title">Applications</span>
            <span class="toggle-icon">▲</span>
          </div>
          <div class="nav-section-collapse">
            <ul class="nav-section-list" id="modules-container">
              <!-- Les modules seront insérés ici dynamiquement -->
            </ul>
          </div>
        </div>
      </nav>
      
      <div class="sidebar-footer">
        <div class="status-indicator" id="status-indicator">
          <span class="status-dot"></span>
          <span>Web-Services</span>
        </div>
        <div class="uptime">
          Uptime: <span id="uptime">0s</span>
        </div>
      </div>
    </aside>
  `;
  return template;
};

export class Sidebar extends HTMLElement {
  private modules: Module[] = [];
  private activeModule: string | null = null;
  private _isConnected: boolean = false;
  private uptime: number = 0;
  private customMenus: Record<string, ApplicationMenuConfig> = {};
  
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    
    const template = createTemplate();
    this.shadowRoot!.appendChild(template.content.cloneNode(true));
  }
  
  connectedCallback() {
    this.setupEventListeners();
    this.render();
    this.setupMenuClicks();
  }
  
  private setupEventListeners(): void {
    // Écouter les modules chargés
    window.addEventListener('modules:loaded', (e: any) => {
      this.modules = e.detail.modules;
      if (this.modules.length > 0 && !this.activeModule) {
        // Ne pas activer core automatiquement (géré par ConfigForm)
        const firstNonCoreModule = this.modules.find(m => m.id !== 'core');
        if (firstNonCoreModule) {
          this.setActiveModule(firstNonCoreModule.id);
        } else if (this.modules[0].id !== 'core') {
          this.setActiveModule(this.modules[0].id);
        }
        // Si seul core existe, ne pas l'activer automatiquement
      }
      this.render();
    });
    
    // Écouter le module actif changé
    window.addEventListener('module:activated', (e: CustomEvent) => {
      this.activeModule = e.detail.moduleId;
      this.render();
    });
    
    // Écouter les enregistrements de menu dynamiques (pour NOMMAGE et autres)
    // Essayez d'abord avec SocketService via window.app
    const setupSocketMenuListener = () => {
      if (window.app?.socketService) {
        const socketService = window.app.socketService;
        socketService.on('app:menu:register', (data: { appId: string; menuConfig: ApplicationMenuConfig }) => {
          console.log('[Sidebar] Menu dynamique enregistré:', data.appId, data.menuConfig);
          this.registerCustomMenu(data.appId, data.menuConfig);
          this.render();
        });
      } else if (typeof io !== 'undefined') {
        // Si SocketService n'est pas disponible, essayer avec io directement
        io().on('app:menu:register', (data: { appId: string; menuConfig: ApplicationMenuConfig }) => {
          console.log('[Sidebar] Menu dynamique enregistré (via io):', data.appId, data.menuConfig);
          this.registerCustomMenu(data.appId, data.menuConfig);
          this.render();
        });
      } else {
        // Essayer à nouveau dans 1 seconde
        setTimeout(setupSocketMenuListener, 1000);
      }
    };
    
    // Installer l'écouteur
    setupSocketMenuListener();

    
    // Écouter le statut de connexion HA
    window.addEventListener('ha:status:changed', (e: CustomEvent) => {
      this._isConnected = e.detail.isConnected;
      this.updateStatusIndicator();
    });
    
    // Écouter la connexion socket
    window.addEventListener('socket:connected', () => {
      this._isConnected = true;
      this.updateStatusIndicator(true);
    });
    
    window.addEventListener('socket:disconnected', () => {
      this._isConnected = false;
      this.updateStatusIndicator(false);
    });
    
    // Écouter l'uptime
    window.addEventListener('app:started', (e: CustomEvent) => {
      this.uptime = e.detail.uptime || Date.now();
      this.updateUptime();
      
      // Mettre à jour l'uptime toutes les secondes
      setInterval(() => this.updateUptime(), 1000);
    });
    
    // Scroll vers une section
    window.addEventListener('scroll-to-section', (e: CustomEvent) => {
      this.scrollToSection(e.detail.sectionId);
    });
  }
  
  private setupMenuClicks(): void {
    // Masquer toutes les sections au départ
    this.hideAllContentSections();
    
    // Gestion de l'accordéon pour les sections
    const headers = this.shadowRoot!.querySelectorAll('.nav-section-header');
    console.log('[Sidebar] setupMenuClicks - Nombre de headers trouvés:', headers.length);
    headers.forEach((header, index) => {
      console.log(`[Sidebar] Header ${index}:`, header.id || header.textContent?.trim());
      header.addEventListener('click', (e) => {
        e.preventDefault();
        console.log('[Sidebar] Clic sur header accordéon:', header.id || header.textContent?.trim(), header.classList);
        this.toggleSection(header as HTMLElement);
      });
    });
    
    // Écouter les clics sur les liens de navigation
    this.shadowRoot!.querySelectorAll('.nav-link[data-section]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation(); // Empêcher le déclenchement du clic sur le header parent
        const sectionId = (link as HTMLElement).getAttribute('data-section');
        this.showContentSection(sectionId || '');
      });
    });
  }
  
  private toggleSection(header: HTMLElement): void {
    console.log('[Sidebar] toggleSection appelé pour header:', header.id || header.classList);
    
    // Dès qu'un clic est fait sur un menu principal, effacer la zone de données
    console.log('[Sidebar] toggleSection - Effacement de la zone de données');
    this.hideAllContentSections();
    
    // Déterminer le nouvel état AVANT de toggler
    const willBeExpanded = !header.classList.contains('expanded');
    
    // Si on va déplier ce menu, replier tous les autres (comportement accordéon)
    if (willBeExpanded) {
      this.collapseAllOtherSections(header);
    }
    
    // Trouver le collapseDiv
    const navSection = header.closest('.nav-section');
    const collapseDiv = navSection?.querySelector('.nav-section-collapse') as HTMLElement;
    
    // Basculer l'état
    header.classList.toggle('expanded');
    header.classList.toggle('collapsed');
    
    // Gérer l'affichage via la classe CSS .visible
    if (collapseDiv) {
      collapseDiv.classList.toggle('visible', header.classList.contains('expanded'));
      console.log('[Sidebar] toggleSection - collapseDiv.classList.toggle visible:', header.classList.contains('expanded'));
    } else {
      console.log('[Sidebar] ERROR: collapseDiv non trouvé !');
    }
    
    // Mettre à jour l'icône
    const toggleIcon = header.querySelector('.toggle-icon');
    if (toggleIcon) {
      toggleIcon.textContent = header.classList.contains('expanded') ? '▼' : '▲';
    }
    
    console.log('[Sidebar] toggleSection - header expanded:', header.classList.contains('expanded'));
    console.log('[Sidebar] toggleSection - header collapsed:', header.classList.contains('collapsed'));
  }

  private collapseAllOtherSections(currentHeader: HTMLElement): void {
    console.log('[Sidebar] collapseAllOtherSections - Repliage de tous les autres menus');
    const allHeaders = this.shadowRoot!.querySelectorAll('.nav-section-header');
    allHeaders.forEach(header => {
      if (header !== currentHeader) {
        // Replier le header
        header.classList.remove('expanded');
        header.classList.add('collapsed');
        
        // Replier le collapseDiv
        const navSection = header.closest('.nav-section');
        const collapseDiv = navSection?.querySelector('.nav-section-collapse') as HTMLElement;
        if (collapseDiv) {
          collapseDiv.classList.remove('visible');
        }
        
        // Mettre à jour l'icône
        const toggleIcon = header.querySelector('.toggle-icon');
        if (toggleIcon) {
          toggleIcon.textContent = '▲';
        }
        
        console.log('[Sidebar] collapseAllOtherSections - Menu replié:', header.id || header.textContent?.trim());
      }
    });
  }
  
  private hideAllContentSections(): void {
    // Méthode 1 : via main.main-content
    const mainContent = document.querySelector('main.main-content');
    if (mainContent) {
      const sections = mainContent.querySelectorAll('.content-section');
      console.log('[Sidebar] hideAllContentSections - Méthode 1, Nombre de sections:', sections.length);
      sections.forEach((section, index) => {
        (section as HTMLElement).style.display = 'none';
        console.log(`[Sidebar] Section ${index} masquée:`, section.id);
      });
      return;
    }
    
    // Méthode 2 : recherche directe
    console.log('[Sidebar] hideAllContentSections - Méthode 2, recherche directe');
    const allSections = document.querySelectorAll('.content-section');
    console.log('[Sidebar] Nombre de sections trouvées:', allSections.length);
    allSections.forEach((section, index) => {
      (section as HTMLElement).style.display = 'none';
      console.log(`[Sidebar] Section ${index} masquée (méthode 2):`, section.id);
    });
    
    if (!mainContent) {
      console.log('[Sidebar] WARNING: main.main-content non trouvé');
    }
  }
  
  private showModuleConfig(moduleId: string): void {
    console.log(`[Sidebar] Affichage de la configuration technique pour module: ${moduleId}`);
    this.hideAllContentSections();
    
    // Afficher la section HA (ou autre section statique) mais avec ConfigForm en mode module
    const haSection = document.getElementById('section-ha');
    if (haSection) {
      haSection.style.display = 'block';
      
      // Trouver le ConfigForm dans cette section et le configurer pour le module
      const configForm = haSection.querySelector('app-config-form');
      if (configForm) {
        console.log(`[Sidebar] ConfigForm trouvé, chargement de la config pour module: ${moduleId}`);
        // Émettre l'événement pour que ConfigForm charge la config du module
        window.dispatchEvent(new CustomEvent('module:config:show', {
          detail: { moduleId }
        }));
      } else {
        console.log('[Sidebar] ConfigForm non trouvé dans section-ha');
      }
    }
  }
  
  private showContentSection(sectionId: string): void {
    console.log('[Sidebar] showContentSection - Début, sectionId:', sectionId);
    this.hideAllContentSections();
    console.log('[Sidebar] showContentSection - hideAllContentSections terminé');
    
    // Réinitialiser ConfigForm s'il était en mode module
    const allConfigForms = document.querySelectorAll('app-config-form');
    allConfigForms.forEach((form) => {
      const htmlForm = form as HTMLElement;
      console.log('[Sidebar] Réinitialisation de ConfigForm:', htmlForm.getAttribute('data-section'));
      // Forcer la réinitialisation en changeant data-section
      htmlForm.setAttribute('data-section', sectionId);
    });
    
    // Mapper les sections du menu aux IDs des div de contenu
    const sectionMappings: Record<string, string> = {
      'ha': 'section-ha',
      'mqtt': 'section-mqtt',
      'web': 'section-web',
      'logging': 'section-logging',
      'applications-manager': 'section-applications-manager'
    };
    
    // Pour les applications dynamiques (app-nom)
    if (sectionId.startsWith('app-')) {
      // Pour les applications, on pourrait afficher une section dédiée
      // Pour l'instant, on affiche applications-manager
      this.showContentSection('applications-manager');
      return;
    }
    
    // Pour les modules dynamiques (clic depuis le menu Applications)
    if (this.modules.some(m => m.id === sectionId)) {
      console.log(`[Sidebar] showContentSection - Module dynamique détecté: ${sectionId}`);
      const modulesContainer = document.getElementById('modules-container');
      console.log(`[Sidebar] modules-container trouvé:`, !!modulesContainer);
      if (modulesContainer) {
        modulesContainer.style.display = 'block';
        console.log(`[Sidebar] modules-container affiché`);
        this.setActiveModule(sectionId);
      } else {
        console.log(`[Sidebar] ERREUR: modules-container non trouvé`);
      }
      return;
    }
    
    // Afficher la section mappée
    const contentSectionId = sectionMappings[sectionId];
    if (contentSectionId) {
      const section = document.getElementById(contentSectionId);
      if (section) {
        section.style.display = 'block';
      }
    }
  }
  
  private render(): void {
    this.renderModules();
    this.renderAppParamsSubmenu();
    this.updateStatusIndicator();
    this.updateUptime();
  }
  
  private renderModules(): void {
    const container = this.shadowRoot!.getElementById('modules-container');
    if (!container) return;
    
    const statusIcons: Record<string, string> = {
      configured: '✓',
      partial: '⚠',
      missing: '✗',
      error: '✘'
    };
    
    // Filtrer pour ne pas afficher 'core' ici (il sera géré dans le contenu principal)
    const displayModules = this.modules.filter(m => m.id !== 'core');
    
    console.log('[Sidebar] renderModules - Modules à afficher:', displayModules.map(m => `${m.id}(${m.name})`));
    
    container.innerHTML = displayModules.map(module => `
      <li class="nav-item ${this.activeModule === module.id ? 'nav-item-active' : ''}">
        <a href="#${module.id}" class="nav-link" data-module-id="${module.id}">
          <span class="nav-icon">${module.icon}</span>
          <span class="nav-label">${module.name}</span>
          <span class="nav-status">
            <span class="status-dot ${this.getModuleStatusClass(module.id)}"></span>
            <span>${statusIcons[module.status] || ''}</span>
          </span>
        </a>
      </li>
    `).join('');
    
    // Ajouter les écouteurs de clic
    displayModules.forEach(module => {
      const link = this.shadowRoot!.querySelector(`a[data-module-id="${module.id}"]`);
      link?.addEventListener('click', (e) => {
        e.preventDefault();
        console.log(`[Sidebar] Clic sur module: ${module.id} (${module.name})`);
        this.setActiveModuleAndShow(module.id);
      });
    });
  }
  
  private renderAppParamsSubmenu(): void {
    const container = this.shadowRoot!.getElementById('app-params-submenu');
    if (!container) return;
    
    // Filtrer les modules qui ont une configuration de menu ou configUi (pas core, qui est déjà géré)
    const paramModules = this.modules.filter(m => m.id !== 'core' && (m.configUi || m.menu));
    
    console.log('[Sidebar] renderAppParamsSubmenu - Modules avec menu/configUi:', paramModules.map(m => `${m.id}(${m.name})`));
    
    // Grouper les modules par catégorie et section de menu
    const modulesByCategory: Record<string, Record<string, Module[]>> = {};
    
    paramModules.forEach(module => {
      const menuConfig = this.getAppMenuConfig(module.id);
      const category = menuConfig?.category || 'Autres';
      const section = menuConfig?.section || module.name || module.id;
      
      if (!modulesByCategory[category]) {
        modulesByCategory[category] = {};
      }
      if (!modulesByCategory[category][section]) {
        modulesByCategory[category][section] = [];
      }
      modulesByCategory[category][section].push(module);
    });
    
    if (Object.keys(modulesByCategory).length === 0) {
      console.log('[Sidebar] renderAppParamsSubmenu - Aucun module avec menu/configUi trouvé');
      container.innerHTML = '';
      return;
    }
    
    // Générer le HTML pour chaque catégorie et section
    let html = '';
    
    Object.entries(modulesByCategory).forEach(([_category, sections]) => {
      // Créer une section pour chaque catégorie
      Object.entries(sections).forEach(([_section, modules]) => {
        if (modules.length > 0) {
          // Pour NOMMAGE : générer les sous-pages à partir de menu.pages
          const firstModule = modules[0];
          const menuConfig = this.getAppMenuConfig(firstModule.id);
          
          if (menuConfig && menuConfig.pages && menuConfig.pages.length > 0) {
            // Générer un menu hiérarchique avec les pages du menu
            const entry = menuConfig.entry;
            html += `
              <li class="nav-item app-param-item">
                <a href="${entry.path}" class="nav-link" data-section="${firstModule.id}">
                  <span class="nav-icon">${entry.icon || firstModule.icon}</span>
                  <span class="nav-label">${entry.label || firstModule.name}</span>
                  ${entry.badge ? `<span class="app-badge">${entry.badge}</span>` : ''}
                  <span class="nav-status">
                    <span class="status-dot ${this.getModuleStatusClass(firstModule.id)}"></span>
                    <span>${this.getStatusIcon(firstModule.status)}</span>
                  </span>
                </a>
              </li>
            `;
            
            // Ajouter les sous-pages
            menuConfig.pages.forEach(page => {
              if (page.id !== 'dashboard' && page.path && page.path !== entry.path) {
                html += `
                  <li class="nav-item app-param-item" style="padding-left: 15px;">
                    <a href="${page.path}" class="nav-link" data-section="${firstModule.id}-${page.id}">
                      <span class="nav-icon">${page.icon || ''}</span>
                      <span class="nav-label">${page.label}</span>
                      ${page.badge ? `<span class="app-badge">${page.badge}</span>` : ''}
                    </a>
                  </li>
                `;
              }
            });
          } else {
            // Ancienne méthode : un lien par module
            modules.forEach(module => {
              html += `
                <li class="nav-item app-param-item">
                  <a href="#${module.id}" class="nav-link" data-section="${module.id}">
                    <span class="nav-icon">${module.icon}</span>
                    <span class="nav-label">${module.name}</span>
                    <span class="nav-status">
                      <span class="status-dot ${this.getModuleStatusClass(module.id)}"></span>
                      <span>${this.getStatusIcon(module.status)}</span>
                    </span>
                  </a>
                </li>
              `;
            });
          }
        }
      });
    });
    
    container.innerHTML = html;
    
    // Ajouter les écouteurs de clic sur les sous-menus Paramètres Techniques
    paramModules.forEach(module => {
      const menuConfig = this.getAppMenuConfig(module.id);
      const entry = menuConfig?.entry;
      const mainSelector = entry ? `a[href="${entry.path}"]` : `a[data-section="${module.id}"]`;
      
      const link = this.shadowRoot!.querySelector(mainSelector);
      link?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log(`[Sidebar] Clic sur sous-menu Paramètres Techniques: ${module.id} (${module.name})`);
        this.showModuleConfig(module.id);
      });
      
      // Ajouter les écouteurs pour les sous-pages
      if (menuConfig?.pages) {
        menuConfig.pages.forEach(page => {
          if (page.id !== 'dashboard' && page.path && page.path !== entry?.path) {
            const pageLink = this.shadowRoot!.querySelector(`a[href="${page.path}"]`);
            pageLink?.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log(`[Sidebar] Clic sur page de menu: ${page.id} (${page.label})`);
              // Pour l'instant, on active juste le module
              this.showModuleConfig(module.id);
            });
          }
        });
      }
    });
  }
  

  
  private setActiveModule(id: string): void {
    this.activeModule = id;
    
    window.dispatchEvent(new CustomEvent('module:activated', {
      detail: { moduleId: id }
    }));
    
    this.render();
  }
  
  /**
   * Active un module et affiche son contenu
   */
  private setActiveModuleAndShow(id: string): void {
    this.setActiveModule(id);
    
    // Afficher le conteneur des modules
    const modulesContainer = document.getElementById('modules-container');
    if (modulesContainer) {
      modulesContainer.style.display = 'block';
      console.log(`[Sidebar] modules-container affiché via setActiveModuleAndShow(${id})`);
    }
  }
  
  /**
   * Enregistrer un menu personnalisé pour une application
   */
  private registerCustomMenu(appId: string, menuConfig: ApplicationMenuConfig): void {
    this.customMenus[appId] = menuConfig;
    console.log(`[Sidebar] Menu personnalisé enregistré pour ${appId}:`, menuConfig);
  }
  
  /**
   * Obtenir la configuration de menu pour une application
   */
  private getAppMenuConfig(appId: string): ApplicationMenuConfig | undefined {
    // D'abord vérifier dans les menus personnalisés enregistrés
    if (this.customMenus[appId]) {
      return this.customMenus[appId];
    }
    
    // Sinon, vérifier dans les modules chargés
    const module = this.modules.find(m => m.id === appId);
    if (module?.menu) {
      return module.menu;
    }
    
    return undefined;
  }
  
  private getModuleStatusClass(moduleId: string): string {
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

  private getStatusIcon(status: string): string {
    const icons: Record<string, string> = {
      configured: '✓',
      partial: '⚠',
      missing: '✗',
      error: '✘'
    };
    return icons[status] || '';
  }
  
  private updateStatusIndicator(connected?: boolean): void {
    const indicator = this.shadowRoot!.getElementById('status-indicator');
    if (connected !== undefined) {
      this._isConnected = connected;
    }
    
    if (indicator) {
      if (this._isConnected) {
        indicator.classList.add('connected');
      } else {
        indicator.classList.remove('connected');
      }
    }
  }
  
  private updateUptime(): void {
    const uptimeEl = this.shadowRoot!.getElementById('uptime');
    if (!uptimeEl) return;
    
    if (this.uptime) {
      const sec = Math.floor((Date.now() - this.uptime) / 1000);
      if (sec < 60) {
        uptimeEl.textContent = `${sec}s`;
      } else {
        const min = Math.floor(sec / 60);
        const remainingSec = sec % 60;
        if (min < 60) {
          uptimeEl.textContent = `${min}m ${remainingSec}s`;
        } else {
          const h = Math.floor(min / 60);
          const remainingMin = min % 60;
          uptimeEl.textContent = `${h}h ${remainingMin}m`;
        }
      }
    } else {
      uptimeEl.textContent = '0s';
    }
  }
  
  private scrollToSection(sectionId: string): void {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  }
}

// Enregistrer le composant
customElements.define('app-sidebar', Sidebar);
