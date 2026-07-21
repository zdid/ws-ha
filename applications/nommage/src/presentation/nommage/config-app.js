/**
 * Script JavaScript pour la page de configuration de l'application NOMMAGE
 * 
 * Fonctionnalités :
 * - Chargement de la configuration actuelle depuis le serveur
 * - Validation des champs du formulaire
 * - Envoi des modifications au serveur
 * - Réinitialisation de la configuration
 * 
 * Version compilée depuis config-app.ts
 */

// ============================================================================
// État de l'application
// ============================================================================

var socket = null;
var currentConfig = {};
var formErrors = {};
var isLoading = false;

// ============================================================================
// Initialisation
// ============================================================================

/**
 * Initialiser la page de configuration
 */
function initConfigPage() {
  try {
    // Récupérer le socket
    if (typeof SocketService !== 'undefined' && SocketService.getInstance) {
      socket = SocketService.getInstance();
    } else if (typeof io !== 'undefined') {
      socket = io();
    } else {
      console.error('[NOMMAGE Config] SocketService ou io non disponible');
      showAlert('Erreur: SocketService non disponible', 'error');
      return;
    }
    
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
function setupConfigEventListeners() {
  if (!socket) return;
  
  // Réception de la configuration
  socket.on('nommage:config:get:response', function(config) {
    currentConfig = config;
    populateForm(config);
    hideLoading();
    showAlert('Configuration chargée avec succès', 'success');
  });
  
  // Réception du statut
  socket.on('nommage:status', function(status) {
    updateConnectionStatus(status);
  });
  
  // Réponse après enregistrement
  socket.on('nommage:config:save:response', function(response) {
    isLoading = false;
    hideLoading();
    
    if (response.success) {
      currentConfig = response.config || currentConfig;
      showAlert('Configuration enregistrée avec succès!', 'success');
      
      // Recharger le statut pour voir les changements
      if (socket) {
        socket.emit('nommage:status:get');
      }
    } else {
      showAlert(response.message || 'Erreur lors de l\'enregistrement', 'error');
    }
  });
  
  // Réponse après réinitialisation
  socket.on('nommage:config:reset:response', function(response) {
    isLoading = false;
    hideLoading();
    
    if (response.success) {
      currentConfig = {};
      populateForm({});
      showAlert('Configuration réinitialisée avec succès!', 'success');
    } else {
      showAlert(response.message || 'Erreur lors de la réinitialisation', 'error');
    }
  });
  
  // Connexion/déconnexion
  socket.on('connect', function() {
    console.log('[NOMMAGE Config] Connecté au serveur Socket.io');
    loadConnectionStatus();
  });
  
  socket.on('disconnect', function() {
    console.log('[NOMMAGE Config] Déconnecté du serveur Socket.io');
    updateConnectionStatus({ connected: false, mqttConnected: false });
  });
}

/**
 * Charger la configuration actuelle
 */
function loadCurrentConfig() {
  if (!socket) return;
  
  showLoading();
  socket.emit('nommage:config:get');
}

/**
 * Charger le statut de connexion
 */
function loadConnectionStatus() {
  if (!socket) return;
  
  socket.emit('nommage:status:get');
}

// ============================================================================
// Gestion du formulaire
// ============================================================================

/**
 * Remplir le formulaire avec la configuration
 */
function populateForm(config) {
  // MQTT
  if (config.mqtt) {
    setFormValue('mqtt-host', config.mqtt.host);
    setFormValue('mqtt-port', config.mqtt.port);
    setFormValue('mqtt-username', config.mqtt.username || '');
    setFormValue('mqtt-password', config.mqtt.password || '');
    setFormValue('mqtt-clientId', config.mqtt.clientId);
    setFormValue('mqtt-topicPrefix', config.mqtt.topicPrefix);
    setFormValue('mqtt-qos', config.mqtt.qos || '1');
    setFormValue('mqtt-retain', config.mqtt.retain !== false);
    setFormValue('mqtt-useTls', config.mqtt.useTls || false);
    
    // Topics de découverte
    renderDiscoveryTopics(config.mqtt.discoveryTopics || []);
  }
  
  // Home Assistant
  if (config.ha) {
    setFormValue('ha-autoTransmit', config.ha.autoTransmit !== false);
    setFormValue('ha-defaultComponent', config.ha.defaultComponent || 'sensor');
    setFormValue('ha-defaultDomain', config.ha.defaultDomain || 'sensor');
    setFormValue('ha-objectIdPrefix', config.ha.objectIdPrefix || 'nommage_');
    setFormValue('ha-autoCreateAreas', config.ha.autoCreateAreas !== false);
    setFormValue('ha-injectTaxonomyAttributes', config.ha.injectTaxonomyAttributes !== false);
  }
  
  // Logging
  if (config.logging) {
    setFormValue('logging-level', config.logging.level || 'info');
    setFormValue('logging-showRawMessages', config.logging.showRawMessages || false);
    setFormValue('logging-showParsedMessages', config.logging.showParsedMessages || false);
  }
}

/**
 * Définir la valeur d'un champ de formulaire
 */
function setFormValue(id, value) {
  var element = document.getElementById(id);
  
  if (!element) {
    console.warn('[NOMMAGE Config] Élément non trouvé: ' + id);
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
function renderDiscoveryTopics(topics) {
  var container = document.getElementById('discovery-topics-container');
  
  if (!container) return;
  
  // Nettoyer
  container.innerHTML = '';
  
  // Ajouter des champs pour chaque topic
  topics.forEach(function(topic) {
    var item = document.createElement('div');
    item.className = 'array-item';
    item.innerHTML = '
      <input type="text" class="form-control" value="' + escapeHtml(topic) + '" placeholder="ha/+/+/config">
      <button type="button" class="btn-remove" onclick="removeTopic(this)">✕</button>
    ';
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
function getFormConfig() {
  var config = {};
  
  // MQTT
  config.mqtt = {
    host: getFormValue('mqtt-host', 'string') || 'localhost',
    port: getFormValue('mqtt-port', 'number') || 1883,
    username: getFormValue('mqtt-username', 'string') || undefined,
    password: getFormValue('mqtt-password', 'string') || undefined,
    clientId: getFormValue('mqtt-clientId', 'string') || 'nommage-app',
    topicPrefix: getFormValue('mqtt-topicPrefix', 'string') || 'ha/',
    discoveryTopics: getDiscoveryTopics(),
    qos: getFormValue('mqtt-qos', 'string') || '1',
    retain: getFormValue('mqtt-retain', 'boolean') !== false,
    useTls: getFormValue('mqtt-useTls', 'boolean') || false
  };
  
  // Home Assistant
  config.ha = {
    autoTransmit: getFormValue('ha-autoTransmit', 'boolean') !== false,
    defaultComponent: getFormValue('ha-defaultComponent', 'string') || 'sensor',
    defaultDomain: getFormValue('ha-defaultDomain', 'string') || 'sensor',
    objectIdPrefix: getFormValue('ha-objectIdPrefix', 'string') || 'nommage_',
    autoCreateAreas: getFormValue('ha-autoCreateAreas', 'boolean') !== false,
    injectTaxonomyAttributes: getFormValue('ha-injectTaxonomyAttributes', 'boolean') !== false
  };
  
  // Logging
  config.logging = {
    level: getFormValue('logging-level', 'string') || 'info',
    showRawMessages: getFormValue('logging-showRawMessages', 'boolean') || false,
    showParsedMessages: getFormValue('logging-showParsedMessages', 'boolean') || false
  };
  
  return config;
}

/**
 * Obtenir la valeur d'un champ de formulaire
 */
function getFormValue(id, type) {
  var element = document.getElementById(id);
  
  if (!element) {
    console.warn('[NOMMAGE Config] Élément non trouvé: ' + id);
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
function getDiscoveryTopics() {
  var inputs = document.querySelectorAll('#discovery-topics-container input');
  var topics = [];
  
  inputs.forEach(function(input) {
    var value = input.value.trim();
    if (value) {
      topics.push(value);
    }
  });
  
  return topics.length > 0 ? topics : ['ha/+/+/config', 'homeassistant/+/+/config'];
}

/**
 * Valider la configuration
 */
function validateConfig(config) {
  var errors = {};
  
  // MQTT - Host requis
  if (!config.mqtt || !config.mqtt.host || config.mqtt.host.trim() === '') {
    errors['mqtt-host'] = 'L\'hôte MQTT est requis';
  }
  
  // MQTT - Port requis
  if (!config.mqtt || !config.mqtt.port || config.mqtt.port < 1 || config.mqtt.port > 65535) {
    errors['mqtt-port'] = 'Le port MQTT doit être compris entre 1 et 65535';
  }
  
  // MQTT - Client ID requis
  if (!config.mqtt || !config.mqtt.clientId || config.mqtt.clientId.trim() === '') {
    errors['mqtt-clientId'] = 'Le Client ID MQTT est requis';
  }
  
  // Topics de découverte requis
  if (!config.mqtt || !config.mqtt.discoveryTopics || config.mqtt.discoveryTopics.length === 0) {
    errors['mqtt-discoveryTopics'] = 'Au moins un topic de découverte est requis';
  }
  
  // Préfixe des topics requis
  if (!config.mqtt || !config.mqtt.topicPrefix || config.mqtt.topicPrefix.trim() === '') {
    errors['mqtt-topicPrefix'] = 'Le préfixe des topics est requis';
  }
  
  return {
    valid: Object.keys(errors).length === 0,
    errors: errors
  };
}

/**
 * Afficher les erreurs de validation
 */
function displayErrors(errors) {
  // Nettoyer les anciennes erreurs
  var groups = document.querySelectorAll('.form-group');
  groups.forEach(function(group) {
    group.classList.remove('error');
  });
  var errorMessages = document.querySelectorAll('.error-message');
  errorMessages.forEach(function(el) {
    el.remove();
  });
  
  // Afficher les nouvelles erreurs
  Object.entries(errors).forEach(function(entry) {
    var field = entry[0];
    var message = entry[1];
    var element = document.getElementById(field);
    if (element) {
      var group = element.closest('.form-group');
      if (group) {
        group.classList.add('error');
        var errorEl = document.createElement('div');
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
function saveConfig() {
  if (!socket) return;
  
  // Obtenir la configuration depuis le formulaire
  var config = getFormConfig();
  
  // Valider
  var validation = validateConfig(config);
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
function resetConfig() {
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
function addTopic() {
  var container = document.getElementById('discovery-topics-container');
  
  if (container) {
    var item = document.createElement('div');
    item.className = 'array-item';
    item.innerHTML = '
      <input type="text" class="form-control" placeholder="ha/+/+/config">
      <button type="button" class="btn-remove" onclick="removeTopic(this)">✕</button>
    ';
    container.appendChild(item);
    
    // Focus sur le nouvel input
    var input = item.querySelector('input');
    if (input) {
      input.focus();
    }
  }
}

/**
 * Supprimer un champ de topic de découverte
 */
function removeTopic(button) {
  var item = button.closest('.array-item');
  var container = document.getElementById('discovery-topics-container');
  
  if (item && container) {
    // Ne pas supprimer le dernier champ
    var items = container.querySelectorAll('.array-item');
    if (items.length > 1) {
      item.remove();
    } else {
      // Réinitialiser le champ
      var input = item.querySelector('input');
      if (input) {
        input.value = '';
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
function updateConnectionStatus(status) {
  var statusEl = document.getElementById('connection-status');
  var detailsEl = document.getElementById('status-details');
  
  if (statusEl) {
    statusEl.textContent = status.connected ? 'Connecté' : 'Déconnecté';
    statusEl.className = 'status-badge ' + (status.connected ? 'connected' : 'disconnected');
  }
  
  if (detailsEl) {
    var html = '<div style="margin-top: 10px;">';
    html += '<div><strong>Application:</strong> ' + (status.connected ? 'Connectée ✓' : 'Déconnectée ✗') + '</div>';
    html += '<div><strong>MQTT:</strong> ' + (status.mqttConnected ? 'Connecté ✓' : 'Déconnecté ✗') + '</div>';
    if (status.lastParsedAt) {
      html += '<div><strong>Dernier parsing:</strong> ' + new Date(status.lastParsedAt).toLocaleString('fr-FR') + '</div>';
    }
    if (status.error) {
      html += '<div style="color: var(--color-error); margin-top: 5px;"><strong>Erreur:</strong> ' + status.error + '</div>';
    }
    html += '</div>';
    detailsEl.innerHTML = html;
  }
}

// ============================================================================
// Gestion de l'affichage
// ============================================================================

/**
 * Afficher une alerte
 */
function showAlert(message, type) {
  type = type || 'info';
  
  var successAlert = document.getElementById('success-alert');
  var errorAlert = document.getElementById('error-alert');
  var infoAlert = document.getElementById('info-alert');
  
  // Masquer toutes les alertes
  [successAlert, errorAlert, infoAlert].forEach(function(alert) {
    if (alert) alert.style.display = 'none';
  });
  
  // Afficher l'alerte appropriée
  var alertEl;
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
    setTimeout(function() {
      if (alertEl) {
        alertEl.style.display = 'none';
      }
    }, 5000);
  }
}

/**
 * Afficher le chargement
 */
function showLoading() {
  var loadingEl = document.getElementById('loading');
  if (loadingEl) {
    loadingEl.style.display = 'block';
  }
}

/**
 * Masquer le chargement
 */
function hideLoading() {
  var loadingEl = document.getElementById('loading');
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
function escapeHtml(text) {
  if (!text) return '';
  var div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================================
// Export global pour accès depuis le HTML
// ============================================================================

window.nommageConfig = {
  init: initConfigPage,
  saveConfig: saveConfig,
  resetConfig: resetConfig,
  addTopic: addTopic,
  removeTopic: removeTopic
};

// ============================================================================
// Initialisation automatique au chargement de la page
// ============================================================================

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initConfigPage);
} else {
  initConfigPage();
}
