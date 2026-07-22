/**
 * ArbreOuquoi Application - Client Socket.io
 * Visualisation du référentiel HA organisé par OU → QUOI → Entités
 * Ou par QUOI → OU → Entités (selon le mode)
 * Derniere modification: 2026-07-20 11:00:00 - Mise à jour pour les deux modes d'affichage
 */

// Import SocketService depuis le build compilé du core (pas le backend, pas core/src :
// arbreouquoi a rootDir=./src et ne peut pas compiler de source hors de son arbre —
// contrairement à nommage, on consomme donc directement le core/dist déjà buildé).
import { SocketService } from '../../../../core/dist/presentation/ui/js/ts/services/SocketService';
import { ARBREOUQUOI_SOCKET_EVENTS } from '../../domain/socket-events';

// Types pour le client
interface HaArea { area_id: string; name: string; picture?: string; }
interface HaDevice { id: string; name: string; }
interface HaQuoiDefinition { id: string; name: string; icon?: string; }
interface HaStructuredEntity {
  entity_id: string;
  domain: string;
  device_class?: string;
  state?: string;
  attributes?: Record<string, unknown>;
  area?: HaArea;
  device?: HaDevice;
  quoi_ids: string[];
}

// Types pour OU-first
interface OuNode {
  id: string;
  name: string;
  level: 'grand_pere' | 'pere' | 'lieu' | 'lieu_precis';
  children: OuNode[];
  entities: HaStructuredEntity[];
  entityCount: number;
  parentId: string | null;
}

interface OuWithQuoiNode {
  ou: OuNode;
  children: QuoiGroup[];
  entityCount: number;
}

interface OuFirstTree {
  levels: OuWithQuoiNode[];
  unassigned: EntityInfo[];
  totalEntities: number;
  totalOuNodes: number;
  totalQuoiTypes: number;
}

// Types pour QUOI-first
interface QuiGroupWithOu {
  quoi: HaQuoiDefinition;
  entityCount: number;
  ouHierarchy: OuNode[];
  entitiesByOu: Map<string, HaStructuredEntity[]>;
}

interface QuoiFirstTree {
  quoiGroups: QuiGroupWithOu[];
  unassigned: EntityInfo[];
  totalEntities: number;
  totalQuoiTypes: number;
  totalOuNodes: number;
}

interface QuoiGroup {
  quoi: HaQuoiDefinition;
  entities: HaStructuredEntity[];
  count: number;
}

interface EntityInfo {
  entity: HaStructuredEntity;
  ouPath: string[];
  quoiIds: string[];
  device: HaDevice | null;
  area: HaArea | null;
}

interface QuoiCatalogWithCounts {
  quoi: HaQuoiDefinition;
  entityCount: number;
  ouPaths: string[];
}

// État global
let state = {
  tree: null as (OuFirstTree | QuoiFirstTree) | null,
  viewMode: 'ou-first' as 'ou-first' | 'quoi-first',
  catalog: [] as QuoiCatalogWithCounts[],
  isConnected: false,
  isLoading: true,
  error: null as string | null,
  filters: { showOnlyActive: true },
  displayConfig: {
    expandAll: false,
    showEntityIds: true,
    showQuoiIcons: true
  }
};

const socket = new SocketService();

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  initUI();
});

function initEventListeners(): void {
  socket.on('connect', () => {
    state.isConnected = true;
    state.isLoading = true;
    updateConnectionStatus('connected');
    showLoading();
    hideError();
    socket.emit(ARBREOUQUOI_SOCKET_EVENTS.TREE_GET);
    socket.emit(ARBREOUQUOI_SOCKET_EVENTS.CATALOG_GET);
  });

  socket.on('disconnect', () => {
    state.isConnected = false;
    updateConnectionStatus('disconnected');
    showError('Déconnecté. Reconnexion en cours...');
  });

  socket.on(ARBREOUQUOI_SOCKET_EVENTS.TREE_STRUCTURE, (payload: {
    tree: OuFirstTree | QuoiFirstTree;
    viewMode: 'ou-first' | 'quoi-first';
    catalog: QuoiCatalogWithCounts[];
    timestamp: string;
  }) => {
    state.tree = payload.tree;
    state.viewMode = payload.viewMode;
    state.catalog = payload.catalog;
    state.isLoading = false;
    state.error = null;
    updateLastUpdate(payload.timestamp);
    renderTree();
    renderQuoiCatalog();
    updateStats();
    hideLoading();
    hideError();
  });

  socket.on(ARBREOUQUOI_SOCKET_EVENTS.QUOI_CATALOG, (catalog: QuoiCatalogWithCounts[]) => {
    state.catalog = catalog;
    renderQuoiCatalog();
  });

  socket.on(ARBREOUQUOI_SOCKET_EVENTS.STATS, (stats: {
    totalEntities: number;
    totalOuPaths: number;
    unassignedEntities: number;
    timestamp: string;
  }) => {
    document.getElementById('total-entities')!.textContent = stats.totalEntities.toString();
    document.getElementById('total-ou-paths')!.textContent = stats.totalOuPaths.toString();
    document.getElementById('unassigned-entities')!.textContent = stats.unassignedEntities.toString();
  });

  socket.on(ARBREOUQUOI_SOCKET_EVENTS.STATUS, (status: { status: string; message: string; timestamp: string }) => {
    updateConnectionStatus(status.status);
    if (status.status === 'error') showError(status.message);
  });

  socket.on(ARBREOUQUOI_SOCKET_EVENTS.ERROR, (error: { message: string }) => {
    showError(error.message);
  });

  socket.on(ARBREOUQUOI_SOCKET_EVENTS.ENTITY_DETAILS, (payload: {
    entity: HaStructuredEntity;
    ouPath: string[];
    area: HaArea | null;
    device: HaDevice | null;
    quiIds: string[];
    relatedEntities: EntityInfo[];
  }) => {
    renderEntityDetails(payload);
  });

  // Événements UI
  document.getElementById('refresh-btn')?.addEventListener('click', () => {
    socket.emit(ARBREOUQUOI_SOCKET_EVENTS.REFRESH);
    showLoading();
  });

  document.getElementById('filter-active-only')?.addEventListener('change', (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    state.filters.showOnlyActive = checked;
    socket.emit(ARBREOUQUOI_SOCKET_EVENTS.FILTER_SET, { showOnlyActive: checked });
  });

  document.getElementById('expand-all-btn')?.addEventListener('click', () => {
    state.displayConfig.expandAll = true;
    renderTree();
  });

  document.getElementById('collapse-all-btn')?.addEventListener('click', () => {
    state.displayConfig.expandAll = false;
    renderTree();
  });

  // Toggle mode OU-first / QUOI-first
  document.getElementById('toggle-view-mode-btn')?.addEventListener('click', () => {
    const newMode = state.viewMode === 'ou-first' ? 'quoi-first' : 'ou-first';
    state.viewMode = newMode;
    socket.emit(ARBREOUQUOI_SOCKET_EVENTS.CONFIG_SAVE, {
      display: { viewMode: newMode }
    });
    showLoading();
  });

  document.getElementById('search-btn')?.addEventListener('click', () => {
    const query = (document.getElementById('search-input') as HTMLInputElement)?.value || '';
    if (query.trim()) {
      socket.emit(ARBREOUQUOI_SOCKET_EVENTS.SEARCH, query);
      showLoading();
    }
  });

  document.getElementById('search-input')?.addEventListener('keypress', (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      const query = (e.target as HTMLInputElement).value;
      if (query.trim()) {
        socket.emit(ARBREOUQUOI_SOCKET_EVENTS.SEARCH, query);
        showLoading();
      }
    }
  });

  document.getElementById('close-details-btn')?.addEventListener('click', () => {
    hideDetailsPanel();
  });
}

function initUI(): void {
  hideLoading();
  hideError();
  hideDetailsPanel();
  updateConnectionStatus('connecting');
  updateViewModeButton();
}

function updateViewModeButton(): void {
  const btn = document.getElementById('toggle-view-mode-btn') as HTMLButtonElement;
  if (btn) {
    btn.textContent = state.viewMode === 'ou-first' 
      ? '🔀 Passer en mode QUOI → OU' 
      : '🔀 Passer en mode OU → QUOI';
  }
}

function updateConnectionStatus(status: string): void {
  const statusItem = document.getElementById('connection-status');
  const indicator = statusItem?.querySelector('.status-indicator');
  const text = statusItem?.querySelector('.status-text');
  if (!statusItem || !indicator || !text) return;
  
  const statuses: Record<string, { class: string; text: string }> = {
    connected: { class: 'connected', text: 'Connecté' },
    disconnected: { class: 'disconnected', text: 'Déconnecté' },
    connecting: { class: 'connecting', text: 'Connexion...' },
    error: { class: 'error', text: 'Erreur' }
  };
  const s = statuses[status] || statuses.connecting;
  indicator.className = `status-indicator ${s.class}`;
  text.textContent = s.text;
}

function updateLastUpdate(timestamp: string): void {
  const el = document.getElementById('last-update');
  if (el) el.textContent = new Date(timestamp).toLocaleString('fr-FR');
}

function showLoading(): void {
  state.isLoading = true;
  document.getElementById('loading-indicator')!.style.display = 'flex';
}

function hideLoading(): void {
  state.isLoading = false;
  document.getElementById('loading-indicator')!.style.display = 'none';
}

function showError(message: string): void {
  state.error = message;
  const errorEl = document.getElementById('error-message')!;
  errorEl.textContent = message;
  errorEl.style.display = 'block';
  setTimeout(() => { if (state.error === message) hideError(); }, 5000);
}

function hideError(): void {
  state.error = null;
  document.getElementById('error-message')!.style.display = 'none';
}

function renderTree(): void {
  const treeEl = document.getElementById('tree');
  if (!treeEl || !state.tree) return;
  
  if (state.viewMode === 'ou-first') {
    treeEl.innerHTML = renderOuFirstTree(state.tree as OuFirstTree);
  } else {
    treeEl.innerHTML = renderQuoiFirstTree(state.tree as QuoiFirstTree);
  }
  
  // Ajouter les événements après rendu
  document.querySelectorAll('.section-header, .quoi-header, .ou-header').forEach(header => {
    header.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleSection(header as HTMLElement);
    });
  });
}

function renderOuFirstTree(tree: OuFirstTree): string {
  let html = '';
  
  // Entités non assignées
  if (tree.unassigned.length > 0) {
    html += `
      <div class="tree-section unassigned-section">
        <div class="section-header">
          <span class="toggle-icon">▶</span>
          <span class="section-title">📦 Non assignés (${tree.unassigned.length})</span>
        </div>
        <div class="section-content" style="display: ${state.displayConfig.expandAll ? 'block' : 'none'};">
          ${tree.unassigned.map(e => renderEntity(e)).join('')}
        </div>
      </div>
    `;
  }
  
  // Niveaux OU
  for (const levelNode of tree.levels) {
    html += renderOuNode(levelNode, 0);
  }
  
  return html;
}

function renderOuNode(node: OuWithQuoiNode, depth: number): string {
  const levelClass = `ou-level-${node.ou.level}`;
  const indent = '  '.repeat(depth * 2);
  
  let html = `
    <div class="ou-section ${levelClass}" data-level="${node.ou.level}" style="margin-left: ${depth * 15}px;">
      <div class="ou-header">
        <span class="toggle-icon">▶</span>
        <span class="ou-icon">${getOuIcon(node.ou.level)}</span>
        <span class="ou-name">${escapeHtml(node.ou.name)}</span>
        <span class="ou-level-badge">[${node.ou.level}]</span>
        <span class="entity-count">(${node.entityCount})</span>
      </div>
      <div class="ou-content" style="display: ${state.displayConfig.expandAll ? 'block' : 'none'};">
  `;
  
  // Regrouper par QUOI
  for (const quoiGroup of node.children) {
    html += `
        <div class="quoi-group">
          <div class="quoi-header">
            <span class="toggle-icon">▶</span>
            <span class="quoi-icon">${quoiGroup.quoi.icon || getQuoiIcon(quoiGroup.quoi.id)}</span>
            <span class="quoi-name">${escapeHtml(quoiGroup.quoi.name)}</span>
            <span class="quoi-count">(${quoiGroup.count})</span>
          </div>
          <div class="quoi-entities" style="display: ${state.displayConfig.expandAll ? 'block' : 'none'};">
            ${quoiGroup.entities.map(e => renderEntity({ entity: e, ouPath: [], quoiIds: e.quoi_ids, device: e.device || null, area: e.area || null })).join('')}
          </div>
        </div>
    `;
  }
  
  // Enfants OU
  for (const child of node.ou.children) {
    const childNode: OuWithQuoiNode = {
      ou: child,
      children: [],
      entityCount: child.entityCount
    };
    // Regrouper les entités de l'enfant par QUOI
    const childQuoiGroups = groupEntitiesByQuoi(child.entities, (state.tree as OuFirstTree).levels.flatMap(l => l.children).flatMap(g => g.quoi));
    childNode.children = childQuoiGroups;
    html += renderOuNode(childNode, depth + 1);
  }
  
  html += `
      </div>
    </div>
  `;
  
  return html;
}

function renderQuoiFirstTree(tree: QuoiFirstTree): string {
  let html = '';
  
  // Entités non assignées
  if (tree.unassigned.length > 0) {
    html += `
      <div class="tree-section unassigned-section">
        <div class="section-header">
          <span class="toggle-icon">▶</span>
          <span class="section-title">📦 Non assignés (${tree.unassigned.length})</span>
        </div>
        <div class="section-content" style="display: ${state.displayConfig.expandAll ? 'block' : 'none'};">
          ${tree.unassigned.map(e => renderEntity(e)).join('')}
        </div>
      </div>
    `;
  }
  
  // Groupes QUOI
  for (const group of tree.quoiGroups) {
    html += `
      <div class="quoi-section">
        <div class="quoi-header">
          <span class="toggle-icon">▶</span>
          <span class="quoi-icon">${group.quoi.icon || getQuoiIcon(group.quoi.id)}</span>
          <span class="quoi-name">${escapeHtml(group.quoi.name)}</span>
          <span class="quoi-count">(${group.entityCount} entités)</span>
        </div>
        <div class="quoi-content" style="display: ${state.displayConfig.expandAll ? 'block' : 'none'};">
    `;
    
    // Hiérarchie OU pour ce QUOI
    for (const ouNode of group.ouHierarchy) {
      const entities = group.entitiesByOu.get(ouNode.id) || [];
      if (entities.length === 0) continue;
      
      html += renderOuNodeForQuoi(ouNode, entities, 0);
    }
    
    html += `
        </div>
      </div>
    `;
  }
  
  return html;
}

function renderOuNodeForQuoi(node: OuNode, entities: HaStructuredEntity[], depth: number): string {
  const childrenHtml = node.children.length > 0 
    ? node.children.map(child => {
        const childEntities = Array.from((state.tree as QuoiFirstTree).quoiGroups
          .flatMap(g => g.entitiesByOu.get(child.id) || []));
        return renderOuNodeForQuoi(child, childEntities, depth + 1);
      }).join('')
    : '';
  
  return `
    <div class="ou-section ou-level-${node.level}" style="margin-left: ${depth * 15}px;">
      <div class="ou-header">
        <span class="toggle-icon">${node.children.length > 0 ? '▶' : '•'}</span>
        <span class="ou-icon">${getOuIcon(node.level)}</span>
        <span class="ou-name">${escapeHtml(node.name)}</span>
        <span class="ou-level-badge">[${node.level}]</span>
        <span class="entity-count">(${entities.length + node.children.reduce((sum, c) => sum + c.entityCount, 0)})</span>
      </div>
      <div class="ou-content" style="display: ${state.displayConfig.expandAll ? 'block' : 'none'};">
        ${entities.length > 0 ? `<div class="entities-in-ou">${entities.map(e => renderEntity({ entity: e, ouPath: [], quoiIds: e.quoi_ids, device: e.device || null, area: e.area || null })).join('')}</div>` : ''}
        ${childrenHtml}
      </div>
    </div>
  `;
}

// Helper pour regrouper les entités par QUOI
function groupEntitiesByQuoi(entities: HaStructuredEntity[], allQuoiIds: HaQuoiDefinition[]): QuoiGroup[] {
  const map = new Map<string, HaStructuredEntity[]>();
  for (const entity of entities) {
    for (const qi of entity.quoi_ids) {
      if (!map.has(qi)) map.set(qi, []);
      map.get(qi)!.push(entity);
    }
  }
  return Array.from(map.entries()).map(([qi, es]) => ({
    quoi: allQuoiIds.find(q => q.id === qi) || { id: qi, name: qi, icon: '❓' },
    entities: es,
    count: es.length
  })).sort((a, b) => b.count - a.count);
}

function renderEntity(entityInfo: EntityInfo): string {
  const entity = entityInfo.entity;
  const quoiIcons = entity.quoi_ids.map(id => {
    const q = state.catalog.find(c => c.quoi.id === id)?.quoi;
    return q?.icon || getQuoiIcon(id);
  }).join('');
  
  const domain = entity.domain || 'unknown';
  const stateValue = entity.state || 'N/A';
  const areaName = entityInfo.ouPath.length > 0 ? entityInfo.ouPath[entityInfo.ouPath.length - 1] : (entity.area?.name || 'N/A');
  
  return `
    <div class="entity-item" 
         onclick="showEntityDetails('${entity.entity_id}')"
         onmouseenter="highlightEntity(this)"
         onmouseleave="unhighlightEntity(this)">
      <span class="entity-icon">${quoiIcons}</span>
      <span class="entity-domain ${domain}">${domain}</span>
      <span class="entity-name">${escapeHtml(entity.attributes?.friendly_name as string || entity.entity_id)}</span>
      ${state.displayConfig.showEntityIds ? `<span class="entity-id">${entity.entity_id}</span>` : ''}
      <span class="entity-state">${stateValue}</span>
      ${entity.device?.name ? `<span class="entity-device">[${entity.device.name}]</span>` : ''}
      ${areaName !== 'N/A' ? `<span class="entity-area">@${areaName}</span>` : ''}
    </div>
  `;
}

function renderQuoiCatalog(): void {
  const el = document.getElementById('quoi-catalog');
  if (!el) return;
  
  const html = `
    <h4>Légende QUOI (${state.catalog.length} types)</h4>
    <div class="quoi-icons">
      ${state.catalog.map(item => `
        <div class="quoi-catalog-item" title="${item.quoi.name} (${item.entityCount} entités)">
          <span class="quoi-catalog-icon">${item.quoi.icon || getQuoiIcon(item.quoi.id)}</span>
          <span class="quoi-catalog-count">${item.entityCount}</span>
        </div>
      `).join('')}
    </div>
  `;
  el.innerHTML = html;
}

function updateStats(): void {
  if (!state.tree) return;
  const tree = state.tree;
  document.getElementById('total-entities')!.textContent = tree.totalEntities.toString();
  if ('totalOuNodes' in tree) {
    document.getElementById('total-ou-paths')!.textContent = (tree as OuFirstTree | QuoiFirstTree).totalOuNodes.toString();
  }
  document.getElementById('total-qui-types')!.textContent = tree.totalQuoiTypes.toString();
  document.getElementById('unassigned-entities')!.textContent = tree.unassigned.length.toString();
}

function showEntityDetails(entityId: string): void {
  socket.emit(ARBREOUQUOI_SOCKET_EVENTS.ENTITY_GET, entityId);
  const panel = document.getElementById('details-panel')!;
  panel.style.display = 'block';
  document.getElementById('details-content')!.innerHTML = '<div class="loading-small"><div class="spinner-small"></div><p>Chargement...</p></div>';
}

function renderEntityDetails(payload: {
  entity: HaStructuredEntity;
  ouPath: string[];
  area: HaArea | null;
  device: HaDevice | null;
  quiIds: string[];
  relatedEntities: EntityInfo[];
}): void {
  const contentEl = document.getElementById('details-content');
  if (!contentEl) return;
  
  const e = payload.entity;
  let html = `
    <div class="details-header">
      <h2>${escapeHtml(e.attributes?.friendly_name as string || e.entity_id)}</h2>
      <div class="details-meta">
        <span class="meta-badge domain">${e.domain}</span>
        ${e.device_class ? `<span class="meta-badge device-class">${e.device_class}</span>` : ''}
        ${e.state ? `<span class="meta-badge state">État: ${e.state}</span>` : ''}
      </div>
    </div>
    
    <div class="details-section">
      <h3>📋 Informations de base</h3>
      <table class="details-table">
        <tr><td>ID Entité</td><td><code>${e.entity_id}</code></td></tr>
        <tr><td>Nom</td><td>${escapeHtml(e.attributes?.friendly_name as string || 'N/A')}</td></tr>
        <tr><td>Domaine</td><td>${e.domain}</td></tr>
        ${e.device_class ? `<tr><td>Classe Appareil</td><td>${e.device_class}</td></tr>` : ''}
        <tr><td>État</td><td>${e.state || 'N/A'}</td></tr>
      </table>
    </div>
  `;
  
  if (payload.ouPath.length > 0) {
    html += `
      <div class="details-section">
        <h3>📍 Hiérarchie OU</h3>
        <div class="ou-path-display">
          ${payload.ouPath.map((name, idx) => {
            const level = getLevelFromPathIndex(idx, payload.ouPath.length);
            return `<span class="ou-path-item"><span class="ou-path-icon">${getOuIcon(level)}</span> ${escapeHtml(name)} <span class="ou-path-level">[${level}]</span></span>`;
          }).join(' → ')}
        </div>
      </div>
    `;
  }
  
  if (payload.area) {
    html += `
      <div class="details-section">
        <h3>🏠 Area HA</h3>
        <table class="details-table">
          <tr><td>Nom</td><td>${payload.area.name}</td></tr>
          <tr><td>ID</td><td><code>${payload.area.area_id}</code></td></tr>
        </table>
      </div>
    `;
  }
  
  if (payload.device) {
    html += `
      <div class="details-section">
        <h3>📱 Appareil</h3>
        <table class="details-table">
          <tr><td>Nom</td><td>${payload.device.name}</td></tr>
          <tr><td>ID</td><td><code>${payload.device.id}</code></td></tr>
        </table>
      </div>
    `;
  }
  
  if (payload.quiIds.length > 0) {
    html += `
      <div class="details-section">
        <h3>🏷️ Classification QUOI</h3>
        <div class="quoi-tags">
          ${payload.quiIds.map(qi => {
            const q = state.catalog.find(c => c.quoi.id === qi)?.quoi;
            const icon = q?.icon || getQuoiIcon(qi);
            return `<span class="quoi-tag">${icon} ${q?.name || qi}</span>`;
          }).join('')}
        </div>
      </div>
    `;
  }
  
  if (payload.relatedEntities.length > 0) {
    html += `
      <div class="details-section">
        <h3>🔗 Entités associées (${payload.relatedEntities.length})</h3>
        <div class="related-entities">
          ${payload.relatedEntities.slice(0, 10).map(re => `
            <div class="related-entity" onclick="showEntityDetails('${re.entity.entity_id}')">
              <span class="related-entity-name">${escapeHtml(re.entity.attributes?.friendly_name as string || re.entity.entity_id)}</span>
              <span class="related-entity-id">${re.entity.entity_id}</span>
            </div>
          `).join('')}
          ${payload.relatedEntities.length > 10 ? `<p class="related-more">+ ${payload.relatedEntities.length - 10} autres...</p>` : ''}
        </div>
      </div>
    `;
  }
  
  if (e.attributes) {
    html += `
      <div class="details-section">
        <h3>📊 Attributs</h3>
        <table class="details-table">
          ${Object.entries(e.attributes).map(([key, value]) => {
            if (key === 'friendly_name') return '';
            if (key === 'attributs_taxonomie') return ''; // Masquer la taxonomie (déjà affichée)
            return `<tr><td>${key}</td><td><pre>${JSON.stringify(value, null, 2)}</pre></td></tr>`;
          }).join('')}
        </table>
      </div>
    `;
  }
  
  contentEl.innerHTML = html;
}

function hideDetailsPanel(): void {
  document.getElementById('details-panel')!.style.display = 'none';
}

function toggleSection(header: HTMLElement): void {
  const content = header.nextElementSibling as HTMLElement | null;
  const icon = header.querySelector('.toggle-icon') as HTMLElement | null;
  if (!content || !icon) return;
  
  if (content.style.display === 'none') {
    content.style.display = 'block';
    icon.textContent = '▼';
  } else {
    content.style.display = 'none';
    icon.textContent = content.classList.contains('ou-content') && content.querySelectorAll('.ou-section').length > 0 ? '▶' : '•';
  }
}

function highlightEntity(element: HTMLElement): void {
  element.classList.add('highlight');
}

function unhighlightEntity(element: HTMLElement): void {
  element.classList.remove('highlight');
}

function getOuIcon(level: string): string {
  const icons: Record<string, string> = {
    grand_pere: '🏠',
    pere: '🏢',
    lieu: '📍',
    lieu_precis: '🎯'
  };
  return icons[level] || '📁';
}

function getQuoiIcon(quoiId: string): string {
  const icons: Record<string, string> = {
    lumiere: '💡', temperature: '🌡️', humidite: '💧', interrupteur: '🔘',
    prise: '🔌', volet: '🪟', porte: '🚪', fenetre: '🪟',
    detecteur: '👁️', mouvement: '🏃', fumee: '💨', gaz: '⛽', eau: '💦',
    sonnette: '🔔', camera: '📹', alarme: '🚨', climatisation: '❄️', chauffage: '🔥'
  };
  return icons[quoiId.toLowerCase()] || '❓';
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getLevelFromPathIndex(idx: number, length: number): 'grand_pere' | 'pere' | 'lieu' | 'lieu_precis' {
  if (length === 1) return 'lieu';
  if (length === 2) return idx === 0 ? 'lieu_precis' : 'lieu';
  if (length === 3) {
    if (idx === 0) return 'lieu_precis';
    if (idx === 1) return 'lieu';
    return 'pere';
  }
  if (idx === 0) return 'lieu_precis';
  if (idx === 1) return 'lieu';
  if (idx === 2) return 'pere';
  return 'grand_pere';
}

// Exporter pour accès global (nécessaire pour les onclick dans le HTML généré)
(window as any).toggleSection = toggleSection;
(window as any).showEntityDetails = showEntityDetails;
(window as any).highlightEntity = highlightEntity;
(window as any).unhighlightEntity = unhighlightEntity;
