/**
 * Script TypeScript pour la page de configuration de l'application NOMMAGE
 * 
 * Fonctionnalités :
 * - Chargement de la configuration actuelle depuis le serveur
 * - Validation des champs du formulaire
 * - Envoi des modifications au serveur
 * - Réinitialisation de la configuration
 * 
 * Note: Ce fichier doit être compilé en JavaScript avant utilisation
 */

import { SocketService } from '../../../../core/src/ui-exports';
import type { NommageConfig, NommageLoggingConfig } from '../../domain/config-schema';
import { DEFAULT_NOMMAGE_CONFIG } from '../../domain/config-schema';

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
let formErrors: FormErrors = {};
let isLoading = false;

// ============================================================================
// Initialisation
// ============================================================================

/**
 * Initialiser la page de configuration
 */
function initConfigPage(): void {
  try {
    // Créer et connecter le socket
    const socketService = new SocketService();
    socket = socketService.connect();
    
    // Configurer les écouteurs
    setupConfigEventListeners();
    
    // Charger la configuration actuelle
    loadCurrentConfig();
    
    // Charger le statut de connexion
    loadConnectionStatus();
    
    console.log('[NOMMAGE Config] Initialisation terminée');
    
  } catch (error) {
    console.error('[NOMMAGE Config] Erreur d\'initialisation:', error);
    showAlert('Erreur d\'initialisation de la page de configuration', 'error');
  }
}

/**
 * Configurer les écouteurs d'événements Socket.io
 */
function setupConfigEventListeners(): void {
  if (!socket) return;
  
  // Réception de la configuration
  socket.on('nommage:config:get:response', (config: NommageConfig) => {
    currentConfig = config;
    populateForm(config);
    hideLoading();
    showAlert('Configuration chargée avec succès', 'success');
  });
  
  // Réception du statut
  socket.on('nommage:status', (status: any) => {
    updateConnectionStatus(status);
  });
  
  // Réponse après enregistrement
  socket.on('nommage:config:save:response', (response: { success: boolean; message?: string; config?: NommageConfig }) => {
    isLoading = false;
    hideLoading();
    
    if (response.success) {
      currentConfig = response.config || currentConfig;
      showAlert('Configuration enregistrée avec succès!', 'success');
      
      // Recharger le statut pour voir les changements
      socket.emit('nommage:status:get');
    } else {
      showAlert(response.message || 'Erreur lors de l\'enregistrement', 'error');
    }
  });
  
  // Réponse après réinitialisation
  socket.on('nommage:config:reset:response', (response: { success: boolean; message?: string }) => {
    isLoading = false;
    hideLoading();
    
    if (response.success) {
      currentConfig = { ...DEFAULT_NOMMAGE_CONFIG };
      populateForm(currentConfig);
      showAlert('Configuration réinitialisée avec succès!', 'success');
    } else {
      showAlert(response.message || 'Erreur lors de la réinitialisation', 'error');
    }
  });
  
  // Connexion/déconnexion
  socket.on('connect', () => {
    console.log('[NOMMAGE Config] Connecté au serveur Socket.io');
    loadConnectionStatus();
  });
  
  socket.on('disconnect', () => {
    console.log('[NOMMAGE Config] Déconnecté du serveur Socket.io');
    updateConnectionStatus({ connected: false, mqttConnected: false });
  });
}

/**
 * Charger la configuration actuelle
 */
function loadCurrentConfig(): void {
  if (!socket) return;
  
  showLoading();
  socket.emit('nommage:config:get');
}

/**
 * Charger le statut de connexion
 */
function loadConnectionStatus(): void {
  if (!socket) return;
  
  socket.emit('nommage:status:get');
}

// ============================================================================
// Gestion du formulaire
// ============================================================================

/**
 * Remplir le formulaire avec la configuration
 */
function populateForm(config: NommageConfig): void {
  // Récupérer le premier couple (ou valeurs par défaut)
  const couple = config.couples[0] || DEFAULT_NOMMAGE_CONFIG.couples[0];
  const mqtt = couple.mqtt || DEFAULT_NOMMAGE_CONFIG.couples[0].mqtt;
  const ha = couple.ha || DEFAULT_NOMMAGE_CONFIG.couples[0].ha;
  const logging: NommageLoggingConfig = couple.logging || DEFAULT_NOMMAGE_CONFIG.couples[0].logging || { level: 'info', showRawMessages: false, showParsedMessages: false };
  
  // MQTT
  if (mqtt) {
    setFormValue('mqtt-host', mqtt.host);
    setFormValue('mqtt-port', mqtt.port);
    setFormValue('mqtt-username', mqtt.username || '');
    setFormValue('mqtt-password', mqtt.password || '');
    setFormValue('mqtt-clientId', mqtt.clientId);
    setFormValue('mqtt-topicPrefix', mqtt.topicPrefix);
    setFormValue('mqtt-qos', mqtt.qos || '1');
    setFormValue('mqtt-retain', mqtt.retain !== false);
    setFormValue('mqtt-useTls', mqtt.useTls || false);
    
    // Topics de découverte
    renderDiscoveryTopics(mqtt.discoveryTopics || []);
  }
  
  // Home Assistant
  if (ha) {
    setFormValue('ha-autoTransmit', ha.autoTransmit !== false);
    setFormValue('ha-defaultComponent', ha.defaultComponent || 'sensor');
    setFormValue('ha-defaultDomain', ha.defaultDomain || 'sensor');
    setFormValue('ha-objectIdPrefix', ha.objectIdPrefix || 'nommage_');
    setFormValue('ha-autoCreateAreas', ha.autoCreateAreas !== false);
    setFormValue('ha-injectTaxonomyAttributes', ha.injectTaxonomyAttributes !== false);
  }
  
  // Logging
  if (logging) {
    setFormValue('logging-level', logging.level || 'info');
    setFormValue('logging-showRawMessages', logging.showRawMessages || false);
    setFormValue('logging-showParsedMessages', logging.showParsedMessages || false);
  }
}

/**
 * Définir la valeur d'un champ de formulaire
 */
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

/**
 * Rendre les topics de découverte
 */
function renderDiscoveryTopics(topics: string[]): void {
  const container = document.getElementById('discovery-topics-container');
  
  if (!container) return;
  
  // Nettoyer
  container.innerHTML = '';
  
  // Ajouter des champs pour chaque topic
  topics.forEach(topic => {
    const item = document.createElement('div');
    item.className = 'array-item';
    item.innerHTML = `
      <input type="text" class="form-control" value="${escapeHtml(topic)}" placeholder="ha/+/+/config">
      <button type="button" class="btn-remove" onclick="removeTopic(this)">✕</button>
    `;
    container.appendChild(item);
  });
  
  // Ajouter un champ vide si aucun topic
  if (topics.length === 0) {
    addTopic();
  }
}

/**
 * Obtenir la configuration depuis le formulaire
 */
function getFormConfig(): NommageConfig {
  // MQTT
  const mqtt = {
    host: getFormValue('mqtt-host', 'string') || 'localhost',
    port: getFormValue('mqtt-port', 'number') || 1883,
    username: getFormValue('mqtt-username', 'string') || undefined,
    password: getFormValue('mqtt-password', 'string') || undefined,
    clientId: getFormValue('mqtt-clientId', 'string') || 'nommage-app',
    keepalive: 60,
    reconnectPeriod: 5000,
    cleanSession: true,
    discoveryTopics: getDiscoveryTopics(),
    topicPrefix: getFormValue('mqtt-topicPrefix', 'string') || 'ha/',
    qos: Number(getFormValue('mqtt-qos', 'string')) || 1,
    retain: getFormValue('mqtt-retain', 'boolean') !== false,
    useTls: getFormValue('mqtt-useTls', 'boolean') || false,
    rejectUnauthorized: true
  };
  
  // Home Assistant
  const ha = {
    autoTransmit: getFormValue('ha-autoTransmit', 'boolean') !== false,
    defaultComponent: getFormValue('ha-defaultComponent', 'string') || 'sensor',
    defaultDomain: getFormValue('ha-defaultDomain', 'string') || 'sensor',
    objectIdPrefix: getFormValue('ha-objectIdPrefix', 'string') || 'nommage_',
    autoCreateAreas: getFormValue('ha-autoCreateAreas', 'boolean') !== false,
    injectTaxonomyAttributes: getFormValue('ha-injectTaxonomyAttributes', 'boolean') !== false
  };
  
  // Logging
  const logging = {
    level: (getFormValue('logging-level', 'string') as 'debug' | 'info' | 'warn' | 'error') || 'info',
    showRawMessages: getFormValue('logging-showRawMessages', 'boolean') || false,
    showParsedMessages: getFormValue('logging-showParsedMessages', 'boolean') || false
  };
  
  return {
    enabled: true,
    couples: [{ mqtt, ha, logging }]
  };
}

/**
 * Obtenir la valeur d'un champ de formulaire
 */
function getFormValue(id: string, type: string): any {
  const element = document.getElementById(id) as HTMLInputElement | null;
  
  if (!element) {
    console.warn(`[NOMMAGE Config] Élément non trouvé: ${id}`);
    return type === 'boolean' ? false : type === 'number' ? 0 : '';
  }
  
  switch (type) {
    case 'boolean':
      if (element.type === 'checkbox') {
        return element.checked;
      }
      return false;
    case 'number':
      return parseInt(element.value) || 0;
    default:
      return element.value;
  }
}

/**
 * Obtenir les topics de découverte depuis le formulaire
 */
function getDiscoveryTopics(): string[] {
  const inputs = document.querySelectorAll('#discovery-topics-container input');
  const topics: string[] = [];
  
  inputs.forEach(input => {
    const value = (input as HTMLInputElement).value.trim();
    if (value) {
      topics.push(value);
    }
  });
  
  return topics.length > 0 ? topics : ['ha/+/+/config', 'homeassistant/+/+/config'];
}

/**
 * Valider la configuration
 */
function validateConfig(config: NommageConfig): { valid: boolean; errors: FormErrors } {
  const errors: FormErrors = {};
  
  // Récupérer le premier couple
  const couple = config.couples[0] || DEFAULT_NOMMAGE_CONFIG.couples[0];
  const mqtt = couple.mqtt || {};
  
  // MQTT - Host requis
  if (!mqtt.host || mqtt.host.trim() === '') {
    errors['mqtt-host'] = 'L\'hôte MQTT est requis';
  }
  
  // MQTT - Port requis
  if (!mqtt.port || mqtt.port < 1 || mqtt.port > 65535) {
    errors['mqtt-port'] = 'Le port MQTT doit être compris entre 1 et 65535';
  }
  
  // MQTT - Client ID requis
  if (!mqtt.clientId || mqtt.clientId.trim() === '') {
    errors['mqtt-clientId'] = 'Le Client ID MQTT est requis';
  }
  
  // Topics de découverte requis
  if (!mqtt.discoveryTopics || mqtt.discoveryTopics.length === 0) {
    errors['mqtt-discoveryTopics'] = 'Au moins un topic de découverte est requis';
  }
  
  // Préfixe des topics requis
  if (!mqtt.topicPrefix || mqtt.topicPrefix.trim() === '') {
    errors['mqtt-topicPrefix'] = 'Le préfixe des topics est requis';
  }
  
  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
}

/**
 * Afficher les erreurs de validation
 */
function displayErrors(errors: FormErrors): void {
  // Nettoyer les anciennes erreurs
  document.querySelectorAll('.form-group').forEach(group => {
    group.classList.remove('error');
  });
  document.querySelectorAll('.error-message').forEach(el => {
    el.remove();
  });
  
  // Afficher les nouvelles erreurs
  Object.entries(errors).forEach(([field, message]) => {
    const element = document.getElementById(field);
    if (element) {
      const group = element.closest('.form-group');
      if (group) {
        group.classList.add('error');
        const errorEl = document.createElement('div');
        errorEl.className = 'error-message';
        errorEl.style.color = 'var(--color-error)';
        errorEl.style.fontSize = '0.85em';
        errorEl.style.marginTop = '5px';
        errorEl.textContent = message;
        group.appendChild(errorEl);
      }
    }
  });
}

// ============================================================================
// Actions du formulaire
// ============================================================================

/**
 * Enregistrer la configuration
 */
function saveConfig(): void {
  if (!socket) return;
  
  // Obtenir la configuration depuis le formulaire
  const config = getFormConfig();
  
  // Valider
  const validation = validateConfig(config);
  if (!validation.valid) {
    displayErrors(validation.errors);
    showAlert('Veuillez corriger les erreurs dans le formulaire', 'error');
    return;
  }
  
  // Confirmer
  if (!confirm('Êtes-vous sûr de vouloir enregistrer cette configuration? L\'application redémarrera avec les nouveaux paramètres.')) {
    return;
  }
  
  // Envoyer
  isLoading = true;
  showLoading();
  
  socket.emit('nommage:config:save', config);
}

/**
 * Réinitialiser la configuration
 */
function resetConfig(): void {
  if (!confirm('Êtes-vous sûr de vouloir réinitialiser la configuration aux valeurs par défaut?')) {
    return;
  }
  
  isLoading = true;
  showLoading();
  
  if (socket) {
    socket.emit('nommage:config:reset');
  }
}

/**
 * Ajouter un champ de topic de découverte
 */
function addTopic(): void {
  const container = document.getElementById('discovery-topics-container');
  
  if (container) {
    const item = document.createElement('div');
    item.className = 'array-item';
    item.innerHTML = `
      <input type="text" class="form-control" placeholder="ha/+/+/config">
      <button type="button" class="btn-remove" onclick="removeTopic(this)">✕</button>
    `;
    container.appendChild(item);
    
    // Focus sur le nouvel input
    const input = item.querySelector('input');
    if (input) {
      (input as HTMLElement).focus();
    }
  }
}

/**
 * Supprimer un champ de topic de découverte
 */
function removeTopic(button: HTMLButtonElement): void {
  const item = button.closest('.array-item');
  const container = document.getElementById('discovery-topics-container');
  
  if (item && container) {
    // Ne pas supprimer le dernier champ
    const items = container.querySelectorAll('.array-item');
    if (items.length > 1) {
      item.remove();
    } else {
      // Réinitialiser le champ
      const input = item.querySelector('input');
      if (input) {
        (input as HTMLInputElement).value = '';
      }
    }
  }
}

// ============================================================================
// Gestion du statut
// ============================================================================

/**
 * Mettre à jour le statut de connexion
 */
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
        <div><strong>MQTT:</strong> ${status.mqttConnected ? 'Connecté ✓' : 'Déconnecté ✗'}</div>
        ${status.lastParsedAt ? `<div><strong>Dernier parsing:</strong> ${new Date(status.lastParsedAt).toLocaleString('fr-FR')}</div>` : ''}
        ${status.error ? `<div style="color: var(--color-error); margin-top: 5px;"><strong>Erreur:</strong> ${status.error}</div>` : ''}
      </div>
    `;
  }
}

// ============================================================================
// Gestion de l'affichage
// ============================================================================

/**
 * Afficher une alerte
 */
function showAlert(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
  const successAlert = document.getElementById('success-alert');
  const errorAlert = document.getElementById('error-alert');
  const infoAlert = document.getElementById('info-alert');
  
  // Masquer toutes les alertes
  [successAlert, errorAlert, infoAlert].forEach(alert => {
    if (alert) alert.style.display = 'none';
  });
  
  // Afficher l'alerte appropriée
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
    
    // Masquer après 5 secondes
    setTimeout(() => {
      if (alertEl) {
        alertEl.style.display = 'none';
      }
    }, 5000);
  }
}

/**
 * Afficher le chargement
 */
function showLoading(): void {
  const loadingEl = document.getElementById('loading');
  if (loadingEl) {
    loadingEl.style.display = 'block';
  }
}

/**
 * Masquer le chargement
 */
function hideLoading(): void {
  const loadingEl = document.getElementById('loading');
  if (loadingEl) {
    loadingEl.style.display = 'none';
  }
}

// ============================================================================
// Utilitaires
// ============================================================================

/**
 * Échapper le HTML pour éviter les injections XSS
 */
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
      addTopic: () => void;
      removeTopic: (button: HTMLButtonElement) => void;
    };
  }
}

window.nommageConfig = {
  init: initConfigPage,
  saveConfig,
  resetConfig,
  addTopic,
  removeTopic
};

// ============================================================================
// Initialisation automatique au chargement de la page
// ============================================================================

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initConfigPage);
} else {
  initConfigPage();
}
