/**
 * Script TypeScript pour la page de configuration de l'application NOMMAGE
 *
 * Fonctionnalités :
 * - Chargement de la configuration actuelle depuis le serveur
 * - Gestion dynamique de la liste des sources MQTT (sources[], une ou plusieurs)
 * - Validation des champs du formulaire
 * - Envoi des modifications au serveur
 * - Réinitialisation de la configuration
 *
 * ⭐ v1.1 : `sources[]` remplace l'ancien bloc MQTT unique (`couples[0]`, qui n'était de toute
 * façon jamais itéré par le backend) — voir fonctionnelles-nommage_specs_v1.1.md §4.3.
 */

import { SocketService } from '../../../../core/src/ui-exports';
import type { NommageConfig, NommageSourceConfig } from '../../domain/config-schema';
import { DEFAULT_NOMMAGE_CONFIG, createDefaultSource } from '../../domain/config-schema';

// ============================================================================
// Types pour la configuration
// ============================================================================

interface FormErrors {
  [key: string]: string;
}

// ============================================================================
// État de l'application
// ============================================================================

let socket: any | null = null;
let currentConfig: NommageConfig = { ...DEFAULT_NOMMAGE_CONFIG };
let sourceCounter = 0;

// ============================================================================
// Initialisation
// ============================================================================

function initConfigPage(): void {
  try {
    const socketService = new SocketService();
    socket = socketService.connect();

    setupConfigEventListeners();
    loadCurrentConfig();
    loadConnectionStatus();

    console.log('[NOMMAGE Config] Initialisation terminée');

  } catch (error) {
    console.error('[NOMMAGE Config] Erreur d\'initialisation:', error);
    showAlert('Erreur d\'initialisation de la page de configuration', 'error');
  }
}

function setupConfigEventListeners(): void {
  if (!socket) return;

  socket.on('nommage:config:get:response', (config: NommageConfig) => {
    currentConfig = config;
    populateForm(config);
    hideLoading();
    showAlert('Configuration chargée avec succès', 'success');
  });

  socket.on('nommage:status', (status: any) => {
    updateConnectionStatus(status);
  });

  socket.on('nommage:config:save:response', (response: { success: boolean; message?: string; config?: NommageConfig }) => {
    hideLoading();

    if (response.success) {
      currentConfig = response.config || currentConfig;
      showAlert('Configuration enregistrée avec succès!', 'success');
      socket.emit('nommage:status:get');
    } else {
      showAlert(response.message || 'Erreur lors de l\'enregistrement', 'error');
    }
  });

  socket.on('nommage:config:reset:response', (response: { success: boolean; message?: string }) => {
    hideLoading();

    if (response.success) {
      currentConfig = { ...DEFAULT_NOMMAGE_CONFIG };
      populateForm(currentConfig);
      showAlert('Configuration réinitialisée avec succès!', 'success');
    } else {
      showAlert(response.message || 'Erreur lors de la réinitialisation', 'error');
    }
  });

  socket.on('connect', () => {
    console.log('[NOMMAGE Config] Connecté au serveur Socket.io');
    loadConnectionStatus();
  });

  socket.on('disconnect', () => {
    console.log('[NOMMAGE Config] Déconnecté du serveur Socket.io');
    updateConnectionStatus({ connected: false, mqttConnected: false });
  });
}

function loadCurrentConfig(): void {
  if (!socket) return;
  showLoading();
  socket.emit('nommage:config:get');
}

function loadConnectionStatus(): void {
  if (!socket) return;
  socket.emit('nommage:status:get');
}

// ============================================================================
// Gestion du formulaire — Sources MQTT (sources[])
// ============================================================================

/**
 * Remplit le formulaire : une source = un bloc `.source-item` répété dans #sources-container.
 */
function populateForm(config: NommageConfig): void {
  const sources = config.sources && config.sources.length > 0
    ? config.sources
    : DEFAULT_NOMMAGE_CONFIG.sources;

  const container = document.getElementById('sources-container');
  if (container) {
    container.innerHTML = '';
    sourceCounter = 0;
    sources.forEach((source) => renderSourceBlock(source));
  }

  setFormValue('ha-injectTaxonomyAttributes', config.ha?.injectTaxonomyAttributes !== false);

  const logging = config.logging || DEFAULT_NOMMAGE_CONFIG.logging;
  setFormValue('logging-level', logging.level || 'info');
  setFormValue('logging-showRawMessages', logging.showRawMessages || false);
  setFormValue('logging-showParsedMessages', logging.showParsedMessages || false);
}

/**
 * Construit et insère le bloc DOM d'une source (ou un bloc vide si aucune donnée fournie).
 */
function renderSourceBlock(source?: NommageSourceConfig): void {
  const container = document.getElementById('sources-container');
  if (!container) return;

  const index = sourceCounter++;
  const s = source || createDefaultSource(`source-${index + 1}`);

  const item = document.createElement('div');
  item.className = 'source-item';
  item.dataset.sourceIndex = String(index);
  item.innerHTML = `
    <div class="source-header">
      <h4>📡 Source</h4>
      <button type="button" class="btn-remove-source" data-action="remove-source">✕ Supprimer cette source</button>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Identifiant de la source *</label>
        <input type="text" class="form-control" data-field="id" required placeholder="ha-broker" value="${escapeHtml(s.id)}">
        <span class="hint">Identifiant unique (ex: "ha-broker", "zigbee2mqtt")</span>
      </div>
      <div class="form-group">
        <label>Client ID MQTT *</label>
        <input type="text" class="form-control" data-field="clientId" required placeholder="nommage-app" value="${escapeHtml(s.mqtt.clientId)}">
        <span class="hint">Doit être unique entre toutes les sources</span>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Hôte MQTT *</label>
        <input type="text" class="form-control" data-field="host" required placeholder="192.168.1.100" value="${escapeHtml(s.mqtt.host)}">
      </div>
      <div class="form-group">
        <label>Port MQTT *</label>
        <input type="number" class="form-control" data-field="port" required min="1" max="65535" value="${s.mqtt.port}">
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Utilisateur MQTT</label>
        <input type="text" class="form-control" data-field="username" placeholder="user" value="${escapeHtml(s.mqtt.username || '')}">
      </div>
      <div class="form-group">
        <label>Mot de passe MQTT</label>
        <input type="password" class="form-control" data-field="password" placeholder="password" value="${escapeHtml(s.mqtt.password || '')}">
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Préfixe des Topics *</label>
        <input type="text" class="form-control" data-field="topicPrefix" required placeholder="ha/" value="${escapeHtml(s.mqtt.topicPrefix)}">
        <span class="hint">Préfixe du 1er terme des topics de cette source (ex: "ha/" ou "homeassist/")</span>
      </div>
      <div class="form-group">
        <label>QoS</label>
        <select class="select-control" data-field="qos">
          <option value="0" ${s.mqtt.qos === 0 ? 'selected' : ''}>0 - Au maximum une fois</option>
          <option value="1" ${s.mqtt.qos === 1 ? 'selected' : ''}>1 - Au moins une fois</option>
          <option value="2" ${s.mqtt.qos === 2 ? 'selected' : ''}>2 - Exactement une fois</option>
        </select>
      </div>
    </div>

    <div class="form-group">
      <label>Topics de Découverte *</label>
      <div class="field-array" data-field="discoveryTopics">
        ${s.mqtt.discoveryTopics.map((topic) => `
          <div class="array-item">
            <input type="text" class="form-control" value="${escapeHtml(topic)}" placeholder="ha/+/+/config">
            <button type="button" class="btn-remove" data-action="remove-topic">✕</button>
          </div>
        `).join('')}
      </div>
      <button type="button" class="btn-add" data-action="add-topic">+ Ajouter un topic</button>
    </div>

    <div class="form-row">
      <div class="form-group">
        <div class="checkbox-group">
          <input type="checkbox" data-field="retain" ${s.mqtt.retain !== false ? 'checked' : ''}>
          <label style="margin: 0; cursor: pointer;">Conserver les messages retain</label>
        </div>
      </div>
      <div class="form-group">
        <div class="checkbox-group">
          <input type="checkbox" data-field="useTls" ${s.mqtt.useTls ? 'checked' : ''}>
          <label style="margin: 0; cursor: pointer;">Utiliser TLS (mqtts://)</label>
        </div>
      </div>
    </div>
  `;

  container.appendChild(item);

  // Au moins un topic visible
  const topicsArray = item.querySelector('.field-array');
  if (topicsArray && topicsArray.children.length === 0) {
    addTopicToSource(topicsArray);
  }
}

/**
 * Ajoute une nouvelle source vide au formulaire (bouton "+ Ajouter une source").
 */
function addSource(): void {
  renderSourceBlock();
}

/**
 * Supprime le bloc source contenant l'élément cliqué. Garde toujours au moins une source.
 */
function removeSource(target: HTMLElement): void {
  const container = document.getElementById('sources-container');
  const item = target.closest('.source-item');
  if (!container || !item) return;

  if (container.querySelectorAll('.source-item').length <= 1) {
    showAlert('Au moins une source MQTT est requise', 'error');
    return;
  }

  item.remove();
}

/**
 * Ajoute un champ de topic dans le field-array le plus proche du bouton cliqué.
 */
function addTopicToSource(container: Element): void {
  const item = document.createElement('div');
  item.className = 'array-item';
  item.innerHTML = `
    <input type="text" class="form-control" placeholder="ha/+/+/config">
    <button type="button" class="btn-remove" data-action="remove-topic">✕</button>
  `;
  container.appendChild(item);
  const input = item.querySelector('input');
  if (input) (input as HTMLElement).focus();
}

function removeTopicFromSource(target: HTMLElement): void {
  const container = target.closest('.field-array');
  const item = target.closest('.array-item');
  if (!container || !item) return;

  if (container.querySelectorAll('.array-item').length > 1) {
    item.remove();
  } else {
    const input = item.querySelector('input');
    if (input) (input as HTMLInputElement).value = '';
  }
}

// Délégation d'événements pour les boutons générés dynamiquement (add/remove source, add/remove topic)
document.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;
  const action = target.closest('[data-action]')?.getAttribute('data-action');
  if (!action) return;

  switch (action) {
    case 'remove-source':
      removeSource(target);
      break;
    case 'add-topic': {
      const fieldArray = target.closest('.form-group')?.querySelector('.field-array');
      if (fieldArray) addTopicToSource(fieldArray);
      break;
    }
    case 'remove-topic':
      removeTopicFromSource(target);
      break;
  }
});

/**
 * Lit le formulaire et reconstruit la configuration complète (sources[] + ha + logging).
 */
function getFormConfig(): NommageConfig {
  const sourceElements = document.querySelectorAll('#sources-container .source-item');

  const sources: NommageSourceConfig[] = Array.from(sourceElements).map((el) => {
    const getField = (name: string): HTMLInputElement | HTMLSelectElement | null =>
      el.querySelector(`[data-field="${name}"]`);

    const discoveryTopics = Array.from(el.querySelectorAll('[data-field="discoveryTopics"] input'))
      .map((input) => (input as HTMLInputElement).value.trim())
      .filter((v) => v.length > 0);

    return {
      id: (getField('id') as HTMLInputElement)?.value.trim() || `source-${Date.now()}`,
      mqtt: {
        host: (getField('host') as HTMLInputElement)?.value.trim() || 'localhost',
        port: parseInt((getField('port') as HTMLInputElement)?.value || '1883', 10) || 1883,
        username: (getField('username') as HTMLInputElement)?.value.trim() || undefined,
        password: (getField('password') as HTMLInputElement)?.value || undefined,
        clientId: (getField('clientId') as HTMLInputElement)?.value.trim() || 'nommage-app',
        keepalive: 60,
        reconnectPeriod: 5000,
        cleanSession: true,
        discoveryTopics: discoveryTopics.length > 0 ? discoveryTopics : ['ha/+/+/config', 'homeassistant/+/+/config'],
        topicPrefix: (getField('topicPrefix') as HTMLInputElement)?.value.trim() || 'ha/',
        qos: (parseInt((getField('qos') as HTMLSelectElement)?.value || '1', 10) || 1) as 0 | 1 | 2,
        retain: (getField('retain') as HTMLInputElement)?.checked !== false,
        useTls: (getField('useTls') as HTMLInputElement)?.checked || false,
        rejectUnauthorized: true
      }
    };
  });

  const ha = {
    injectTaxonomyAttributes: getFormValue('ha-injectTaxonomyAttributes', 'boolean') !== false
  };

  const logging = {
    level: (getFormValue('logging-level', 'string') as 'debug' | 'info' | 'warn' | 'error') || 'info',
    showRawMessages: getFormValue('logging-showRawMessages', 'boolean') || false,
    showParsedMessages: getFormValue('logging-showParsedMessages', 'boolean') || false
  };

  return {
    enabled: true,
    sources: sources.length > 0 ? sources : DEFAULT_NOMMAGE_CONFIG.sources,
    ha,
    logging
  };
}

function setFormValue(id: string, value: any): void {
  const element = document.getElementById(id) as HTMLInputElement | null;
  if (!element) {
    console.warn(`[NOMMAGE Config] Élément non trouvé: ${id}`);
    return;
  }
  if (element.type === 'checkbox') {
    element.checked = Boolean(value);
  } else {
    element.value = value;
  }
}

function getFormValue(id: string, type: string): any {
  const element = document.getElementById(id) as HTMLInputElement | null;
  if (!element) {
    console.warn(`[NOMMAGE Config] Élément non trouvé: ${id}`);
    return type === 'boolean' ? false : type === 'number' ? 0 : '';
  }
  switch (type) {
    case 'boolean':
      return element.type === 'checkbox' ? element.checked : false;
    case 'number':
      return parseInt(element.value) || 0;
    default:
      return element.value;
  }
}

/**
 * Valide la configuration : chaque source doit avoir un id/clientId non vide et uniques, un hôte,
 * un port valide et au moins un topic de découverte (fonctionnelles-nommage_specs §7.3).
 */
function validateConfig(config: NommageConfig): { valid: boolean; errors: FormErrors } {
  const errors: FormErrors = {};

  if (!config.sources || config.sources.length === 0) {
    errors['sources'] = 'Au moins une source MQTT est requise';
    return { valid: false, errors };
  }

  const ids = new Set<string>();
  const clientIds = new Set<string>();

  config.sources.forEach((source, index) => {
    const prefix = `source-${index}`;

    if (!source.id || source.id.trim() === '') {
      errors[`${prefix}-id`] = `Source ${index + 1} : l'identifiant est requis`;
    } else if (ids.has(source.id)) {
      errors[`${prefix}-id`] = `Source ${index + 1} : identifiant "${source.id}" en double`;
    } else {
      ids.add(source.id);
    }

    if (!source.mqtt.host || source.mqtt.host.trim() === '') {
      errors[`${prefix}-host`] = `Source ${index + 1} : l'hôte MQTT est requis`;
    }

    if (!source.mqtt.port || source.mqtt.port < 1 || source.mqtt.port > 65535) {
      errors[`${prefix}-port`] = `Source ${index + 1} : le port doit être compris entre 1 et 65535`;
    }

    if (!source.mqtt.clientId || source.mqtt.clientId.trim() === '') {
      errors[`${prefix}-clientId`] = `Source ${index + 1} : le Client ID MQTT est requis`;
    } else if (clientIds.has(source.mqtt.clientId)) {
      errors[`${prefix}-clientId`] = `Source ${index + 1} : Client ID "${source.mqtt.clientId}" en double`;
    } else {
      clientIds.add(source.mqtt.clientId);
    }

    if (!source.mqtt.discoveryTopics || source.mqtt.discoveryTopics.length === 0) {
      errors[`${prefix}-topics`] = `Source ${index + 1} : au moins un topic de découverte est requis`;
    }

    if (!source.mqtt.topicPrefix || source.mqtt.topicPrefix.trim() === '') {
      errors[`${prefix}-topicPrefix`] = `Source ${index + 1} : le préfixe des topics est requis`;
    }
  });

  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
}

function displayErrors(errors: FormErrors): void {
  document.querySelectorAll('.error-message').forEach((el) => el.remove());

  const messages = Object.values(errors);
  if (messages.length === 0) return;

  const container = document.getElementById('sources-container')?.parentElement;
  if (!container) return;

  const errorEl = document.createElement('div');
  errorEl.className = 'error-message';
  errorEl.style.color = 'var(--color-error)';
  errorEl.style.marginTop = '10px';
  errorEl.innerHTML = messages.map((m) => `<div>⚠️ ${escapeHtml(m)}</div>`).join('');
  container.appendChild(errorEl);
}

// ============================================================================
// Actions du formulaire
// ============================================================================

function saveConfig(): void {
  if (!socket) return;

  const config = getFormConfig();

  const validation = validateConfig(config);
  if (!validation.valid) {
    displayErrors(validation.errors);
    showAlert('Veuillez corriger les erreurs dans le formulaire', 'error');
    return;
  }

  if (!confirm('Êtes-vous sûr de vouloir enregistrer cette configuration? L\'application redémarrera avec les nouveaux paramètres.')) {
    return;
  }

  showLoading();
  socket.emit('nommage:config:save', config);
}

function resetConfig(): void {
  if (!confirm('Êtes-vous sûr de vouloir réinitialiser la configuration aux valeurs par défaut?')) {
    return;
  }

  showLoading();
  if (socket) {
    socket.emit('nommage:config:reset');
  }
}

// ============================================================================
// Gestion du statut
// ============================================================================

function updateConnectionStatus(status: any): void {
  const statusEl = document.getElementById('connection-status');
  const detailsEl = document.getElementById('status-details');

  if (statusEl) {
    statusEl.textContent = status.connected ? 'Connecté' : 'Déconnecté';
    statusEl.className = `status-badge ${status.connected ? 'connected' : 'disconnected'}`;
  }

  if (detailsEl) {
    detailsEl.innerHTML = `
      <div style="margin-top: 10px;">
        <div><strong>Application:</strong> ${status.connected ? 'Connectée ✓' : 'Déconnectée ✗'}</div>
        <div><strong>MQTT:</strong> ${status.mqttConnected ? 'Au moins une source connectée ✓' : 'Aucune source connectée ✗'}</div>
        ${status.lastParsedAt ? `<div><strong>Dernier parsing:</strong> ${new Date(status.lastParsedAt).toLocaleString('fr-FR')}</div>` : ''}
        ${status.error ? `<div style="color: var(--color-error); margin-top: 5px;"><strong>Erreur:</strong> ${status.error}</div>` : ''}
      </div>
    `;
  }
}

// ============================================================================
// Gestion des onglets
// ============================================================================

function showConfigTab(tabId: string): void {
  document.querySelectorAll('.config-tab').forEach((el) => {
    el.classList.toggle('active', el.getAttribute('data-tab') === tabId);
  });
  document.querySelectorAll('.config-tab-panel').forEach((el) => {
    el.classList.toggle('active', el.getAttribute('data-tab-panel') === tabId);
  });
}

// ============================================================================
// Gestion de l'affichage
// ============================================================================

function showAlert(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
  const successAlert = document.getElementById('success-alert');
  const errorAlert = document.getElementById('error-alert');
  const infoAlert = document.getElementById('info-alert');

  [successAlert, errorAlert, infoAlert].forEach((alert) => {
    if (alert) alert.style.display = 'none';
  });

  let alertEl;
  switch (type) {
    case 'success':
      alertEl = successAlert;
      break;
    case 'error':
      alertEl = errorAlert;
      break;
    default:
      alertEl = infoAlert;
  }

  if (alertEl) {
    alertEl.textContent = message;
    alertEl.style.display = 'block';
    setTimeout(() => {
      if (alertEl) alertEl.style.display = 'none';
    }, 5000);
  }
}

function showLoading(): void {
  const loadingEl = document.getElementById('loading');
  if (loadingEl) loadingEl.style.display = 'block';
}

function hideLoading(): void {
  const loadingEl = document.getElementById('loading');
  if (loadingEl) loadingEl.style.display = 'none';
}

// ============================================================================
// Utilitaires
// ============================================================================

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================================
// Export global pour accès depuis le HTML
// ============================================================================

declare global {
  interface Window {
    nommageConfig: {
      init: () => void;
      saveConfig: () => void;
      resetConfig: () => void;
      addSource: () => void;
    };
    showConfigTab: (tabId: string) => void;
  }
}

window.nommageConfig = {
  init: initConfigPage,
  saveConfig,
  resetConfig,
  addSource
};

window.showConfigTab = showConfigTab;

// ============================================================================
// Initialisation automatique au chargement de la page
// ============================================================================

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initConfigPage);
} else {
  initConfigPage();
}
