/**
 * Script TypeScript pour la page de configuration RFXCOM (Devices & Récepteurs).
 */

// SocketService : URL réellement servie par le socle (core la compile déjà en JS navigateur
// et l'expose via son middleware /js/ts) — pas un chemin de fichier TypeScript, un import
// d'exécution résolu par le navigateur lui-même. Voir presentation/tsconfig.ui.json.
import { SocketService } from '/js/ts/services/SocketService.js';

// ============================================================================
// Types (miroir simplifié de domain/types.ts, pour l'UI uniquement)
// ============================================================================

interface RfxComDeviceInfo {
  uniqueId: string;
  sensorId: string;
  type: string;
  subType: string;
  protocole: string;
  name: string;
  defaultQuoi: string;
  transmitToHa: boolean;
  lastSeen?: string;
}

interface RfxComDiscoveredDevice {
  sensorId: string;
  type: string;
  subType: string;
  uniqueId: string;
  defaultQuoi: string;
  detectedAt: string;
}

interface AssociatedEmitter {
  emitterId: string;
  action: string;
  value?: number;
}

interface ReceiverConfig {
  receiverId: string;
  name: string;
  type: 'switch' | 'light' | 'cover' | 'scene';
  primaryEmitter: string;
  emitters: AssociatedEmitter[];
  transmitToHa: boolean;
  isDimmable?: boolean;
  defaultLevel?: number;
  coverType?: string;
  openTimeSec?: number;
  closeTimeSec?: number;
}

interface SceneAction {
  target: string;
  command: string;
  value?: number;
  delayMs?: number;
}

interface ReceiverSceneConfig {
  receiverId: string;
  name: string;
  type: 'scene';
  description?: string;
  sceneType: 'parallel' | 'sequential';
  delayBetweenCommands?: number;
  actions: SceneAction[];
  transmitToHa: boolean;
}

interface SceneExecutionResult {
  sceneId: string;
  success: boolean;
  executedCommands: number;
  failedCommands: number;
  errors: Array<{ receiverId: string; action: string; error: string }>;
  duration: number;
}

const SCENE_COMMANDS = ['turn_on', 'turn_off', 'toggle', 'set_level', 'open', 'close', 'stop', 'set_position'];

// ============================================================================
// État
// ============================================================================

let socket: any | null = null;
let configuredDevices: RfxComDeviceInfo[] = [];
let discoveredDevices: RfxComDiscoveredDevice[] = [];
let receivers: ReceiverConfig[] = [];
let editingReceiverId: string | null = null;
let scenes: ReceiverSceneConfig[] = [];
let editingSceneId: string | null = null;

// ============================================================================
// Initialisation
// ============================================================================

function init(): void {
  const socketService = new SocketService();
  socket = socketService.connect();

  setupSocketListeners();
  setupUiListeners();

  socket.emit('rfxcom:devices:list:get');
  socket.emit('rfxcom:receivers:list:get');
  socket.emit('rfxcom:scenes:list:get');

  hideLoading();
}

function setupSocketListeners(): void {
  socket.on('rfxcom:devices:list', (data: { configured: RfxComDeviceInfo[]; discovered: RfxComDiscoveredDevice[] }) => {
    configuredDevices = data.configured;
    discoveredDevices = data.discovered;
    renderConfiguredDevices();
    renderDiscoveredDevices();
    renderPrimaryEmitterOptions();
  });

  socket.on('rfxcom:device:detected', () => {
    socket.emit('rfxcom:devices:list:get');
  });

  socket.on('rfxcom:receivers:list', (data: { receivers: ReceiverConfig[] }) => {
    receivers = data.receivers;
    renderReceivers();
  });

  socket.on('rfxcom:receiver:created', () => showAlert('Récepteur créé', 'success'));
  socket.on('rfxcom:receiver:updated', () => showAlert('Récepteur mis à jour', 'success'));
  socket.on('rfxcom:receiver:deleted', () => showAlert('Récepteur supprimé', 'success'));

  socket.on('rfxcom:scan:complete', () => showAlert('Scan terminé', 'info'));
  socket.on('rfxcom:scan:failed', (data: { error: string }) => showAlert(`Scan échoué: ${data.error}`, 'error'));
  socket.on('rfxcom:error', (error: { message: string }) => showAlert(error.message, 'error'));

  socket.on('rfxcom:scenes:list', (data: { scenes: ReceiverSceneConfig[] }) => {
    scenes = data.scenes;
    renderScenes();
  });

  socket.on('rfxcom:scene:created', () => showAlert('Scène créée', 'success'));
  socket.on('rfxcom:scene:updated', () => showAlert('Scène mise à jour', 'success'));
  socket.on('rfxcom:scene:deleted', () => showAlert('Scène supprimée', 'success'));
  socket.on('rfxcom:scene:status', (data: { sceneId: string; status: string }) => {
    if (data.status === 'scene_executing') showAlert(`Scène ${data.sceneId} en cours d'exécution...`, 'info');
  });
  socket.on('rfxcom:scene:executed', (result: SceneExecutionResult) => {
    showAlert(
      result.success
        ? `Scène ${result.sceneId} exécutée (${result.executedCommands} commande(s))`
        : `Scène ${result.sceneId}: ${result.failedCommands} commande(s) en échec sur ${result.executedCommands + result.failedCommands}`,
      result.success ? 'success' : 'error'
    );
  });
}

// ============================================================================
// Onglets
// ============================================================================

function setupUiListeners(): void {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = (btn as HTMLElement).dataset.tab;
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${tab}`)?.classList.add('active');
    });
  });

  document.getElementById('btn-scan')?.addEventListener('click', () => {
    socket.emit('rfxcom:scan:start');
    showAlert('Scan RF433 démarré — actionnez le device à détecter', 'info');
  });

  document.getElementById('btn-clear-unconfigured')?.addEventListener('click', () => {
    if (!confirm('Effacer tous les devices auto-découverts non paramétrés ?')) return;
    socket.emit('rfxcom:devices:clear-unconfigured');
  });

  document.getElementById('btn-refresh-devices')?.addEventListener('click', () => {
    socket.emit('rfxcom:devices:refresh');
    socket.emit('rfxcom:devices:list:get');
  });

  document.getElementById('btn-add-receiver')?.addEventListener('click', () => openReceiverForm(null));
  document.getElementById('rf-cancel')?.addEventListener('click', closeReceiverForm);
  document.getElementById('rf-save')?.addEventListener('click', saveReceiver);
  document.getElementById('rf-add-emitter')?.addEventListener('click', () => addEmitterRow());

  document.getElementById('rf-type')?.addEventListener('change', updateTypeSpecificFields);

  document.getElementById('btn-add-scene')?.addEventListener('click', () => openSceneForm(null));
  document.getElementById('sc-cancel')?.addEventListener('click', closeSceneForm);
  document.getElementById('sc-save')?.addEventListener('click', saveScene);
  document.getElementById('sc-add-action')?.addEventListener('click', () => addActionRow());

  // Délégation d'événements pour les boutons générés dynamiquement
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const action = target.closest('[data-action]')?.getAttribute('data-action');
    const id = target.closest('[data-id]')?.getAttribute('data-id');
    if (!action) return;

    if (action === 'set-device-name' && id) return setDeviceName(id);
    if (action === 'toggle-transmit' && id) return toggleDeviceTransmit(id);
    if (action === 'edit-receiver' && id) return openReceiverForm(id);
    if (action === 'delete-receiver' && id) return deleteReceiver(id);
    if (action === 'remove-emitter-row') {
      target.closest('.emitter-row')?.remove();
      return;
    }
    if (action === 'edit-scene' && id) return openSceneForm(id);
    if (action === 'delete-scene' && id) return deleteScene(id);
    if (action === 'execute-scene' && id) return executeScene(id);
    if (action === 'cancel-scene' && id) return cancelScene(id);
    if (action === 'remove-action-row') {
      target.closest('.emitter-row')?.remove();
      return;
    }
  });
}

// ============================================================================
// Devices
// ============================================================================

function renderConfiguredDevices(): void {
  const body = document.getElementById('configured-devices-body');
  if (!body) return;

  body.innerHTML = configuredDevices.map((d) => `
    <tr>
      <td class="mono">${escapeHtml(d.uniqueId)}</td>
      <td>${escapeHtml(d.name)}</td>
      <td>
        <input type="checkbox" data-action="toggle-transmit" data-id="${escapeHtml(d.uniqueId)}" ${d.transmitToHa ? 'checked' : ''}>
      </td>
      <td>${d.lastSeen ? new Date(d.lastSeen).toLocaleString('fr-FR') : '--'}</td>
      <td><button class="btn btn-secondary" data-action="set-device-name" data-id="${escapeHtml(d.uniqueId)}">✏️</button></td>
    </tr>
  `).join('') || '<tr><td colspan="5">Aucun device paramétré</td></tr>';
}

function renderDiscoveredDevices(): void {
  const body = document.getElementById('discovered-devices-body');
  if (!body) return;

  body.innerHTML = discoveredDevices.map((d) => `
    <tr>
      <td class="mono">${escapeHtml(d.uniqueId)}</td>
      <td>${escapeHtml(d.defaultQuoi)}</td>
      <td>${new Date(d.detectedAt).toLocaleString('fr-FR')}</td>
      <td><button class="btn btn-primary" data-action="set-device-name" data-id="${escapeHtml(d.uniqueId)}">Paramétrer</button></td>
    </tr>
  `).join('') || '<tr><td colspan="4">Aucun device en auto-découverte</td></tr>';
}

function setDeviceName(uniqueId: string): void {
  const existing = configuredDevices.find((d) => d.uniqueId === uniqueId);
  const discovered = discoveredDevices.find((d) => d.uniqueId === uniqueId);
  const defaultQuoi = existing?.name.split('---')[0] || discovered?.defaultQuoi || '';

  const currentLieu = existing?.name.includes('---') ? existing.name.split('---')[1] : '';
  const lieu = prompt(
    `Localisation (OÙ) pour ${uniqueId}\nQUOI: ${defaultQuoi}\n\nFormat: lieu_principal (ou lieu_precis--lieu_principal)`,
    currentLieu || ''
  );
  if (lieu === null || lieu.trim() === '') return;

  const name = `${defaultQuoi}---${lieu.trim()}`;
  socket.emit('rfxcom:device:set_name', { uniqueId, name });
}

function toggleDeviceTransmit(uniqueId: string): void {
  const device = configuredDevices.find((d) => d.uniqueId === uniqueId);
  if (!device) return;
  socket.emit('rfxcom:device:set_transmit', { uniqueId, transmitToHa: !device.transmitToHa });
}

// ============================================================================
// Récepteurs
// ============================================================================

function renderReceivers(): void {
  const listEl = document.getElementById('receivers-list');
  if (!listEl) return;

  listEl.innerHTML = receivers.map((r) => `
    <div class="receiver-item">
      <div class="header">
        <strong>${escapeHtml(r.receiverId)}</strong> — ${escapeHtml(r.name)} (${escapeHtml(r.type)})
        <div>
          <button class="btn btn-secondary" data-action="edit-receiver" data-id="${escapeHtml(r.receiverId)}">✏️</button>
          <button class="btn btn-danger" data-action="delete-receiver" data-id="${escapeHtml(r.receiverId)}">🗑️</button>
        </div>
      </div>
      <div>primaryEmitter: <span class="mono">${escapeHtml(r.primaryEmitter)}</span></div>
      <div>Vers HA: <span class="badge ${r.transmitToHa ? 'on' : 'off'}">${r.transmitToHa ? 'oui' : 'non'}</span></div>
      <div>Émetteurs appairés: ${r.emitters.map((e) => `<span class="mono">${escapeHtml(e.emitterId)}</span> (${escapeHtml(e.action)})`).join(', ') || 'aucun'}</div>
    </div>
  `).join('') || '<p>Aucun récepteur configuré</p>';
}

function renderPrimaryEmitterOptions(): void {
  const select = document.getElementById('rf-primaryEmitter') as HTMLSelectElement | null;
  if (!select) return;

  // Seuls les devices de type Lighting*/Blinds1 sont des émetteurs commandables
  const emitters = configuredDevices.filter((d) => d.type.startsWith('Lighting') || d.type === 'Blinds1');
  select.innerHTML = emitters.map((d) => `<option value="${escapeHtml(d.uniqueId)}">${escapeHtml(d.uniqueId)} (${escapeHtml(d.name)})</option>`).join('');
}

function openReceiverForm(receiverId: string | null): void {
  editingReceiverId = receiverId;
  const card = document.getElementById('receiver-form-card');
  const title = document.getElementById('receiver-form-title');
  if (!card) return;

  card.classList.remove('hidden');
  renderPrimaryEmitterOptions();

  const existing = receiverId ? receivers.find((r) => r.receiverId === receiverId) : null;

  if (title) title.textContent = existing ? `Modifier ${existing.receiverId}` : 'Nouveau récepteur';

  setValue('rf-receiverId', existing?.receiverId || `recepteur_${String(receivers.length + 1).padStart(3, '0')}`);
  (document.getElementById('rf-receiverId') as HTMLInputElement).disabled = !!existing;
  setValue('rf-name', existing?.name || '');
  setValue('rf-type', existing?.type || 'switch');
  setValue('rf-primaryEmitter', existing?.primaryEmitter || '');
  setChecked('rf-isDimmable', existing?.isDimmable || false);
  setValue('rf-defaultLevel', String(existing?.defaultLevel ?? 100));
  setValue('rf-coverType', existing?.coverType || 'Curtain1');
  setValue('rf-openTimeSec', String(existing?.openTimeSec ?? ''));
  setValue('rf-closeTimeSec', String(existing?.closeTimeSec ?? ''));
  setChecked('rf-transmitToHa', existing?.transmitToHa || false);

  const emittersContainer = document.getElementById('rf-emitters-container');
  if (emittersContainer) {
    emittersContainer.innerHTML = '';
    (existing?.emitters || []).forEach((e) => addEmitterRow(e));
    if (!existing) addEmitterRow();
  }

  updateTypeSpecificFields();
  card.scrollIntoView({ behavior: 'smooth' });
}

function closeReceiverForm(): void {
  document.getElementById('receiver-form-card')?.classList.add('hidden');
  editingReceiverId = null;
}

function updateTypeSpecificFields(): void {
  const type = getValue('rf-type');
  document.getElementById('rf-light-fields')?.classList.toggle('hidden', type !== 'light');
  document.getElementById('rf-cover-fields')?.classList.toggle('hidden', type !== 'cover');
}

function addEmitterRow(existing?: AssociatedEmitter): void {
  const container = document.getElementById('rf-emitters-container');
  if (!container) return;

  const emitterOptions = configuredDevices
    .filter((d) => d.type.startsWith('Lighting') || d.type === 'Blinds1')
    .map((d) => `<option value="${escapeHtml(d.uniqueId)}" ${existing?.emitterId === d.uniqueId ? 'selected' : ''}>${escapeHtml(d.uniqueId)}</option>`)
    .join('');

  const row = document.createElement('div');
  row.className = 'emitter-row';
  row.innerHTML = `
    <select class="select-control emitter-id">${emitterOptions}</select>
    <select class="select-control emitter-action">
      ${['toggle', 'on', 'off', 'set_level', 'open', 'close', 'stop'].map((a) =>
        `<option value="${a}" ${existing?.action === a ? 'selected' : ''}>${a}</option>`).join('')}
    </select>
    <input type="number" class="form-control emitter-value" placeholder="valeur (set_level)" min="0" max="100" value="${existing?.value ?? ''}">
    <button type="button" class="btn btn-danger" data-action="remove-emitter-row">✕</button>
  `;
  container.appendChild(row);
}

function saveReceiver(): void {
  const receiverId = getValue('rf-receiverId').trim();
  const name = getValue('rf-name').trim();
  const type = getValue('rf-type') as ReceiverConfig['type'];
  const primaryEmitter = getValue('rf-primaryEmitter');

  if (!receiverId || !name || !primaryEmitter) {
    showAlert('Identifiant, nom et émetteur principal sont requis', 'error');
    return;
  }

  const emitters: AssociatedEmitter[] = Array.from(document.querySelectorAll('#rf-emitters-container .emitter-row')).map((row) => {
    const emitterId = (row.querySelector('.emitter-id') as HTMLSelectElement).value;
    const action = (row.querySelector('.emitter-action') as HTMLSelectElement).value;
    const valueStr = (row.querySelector('.emitter-value') as HTMLInputElement).value;
    return { emitterId, action, value: valueStr ? Number(valueStr) : undefined };
  }).filter((e) => e.emitterId);

  const config: ReceiverConfig = {
    receiverId,
    name,
    type,
    primaryEmitter,
    emitters,
    transmitToHa: isChecked('rf-transmitToHa')
  };

  if (type === 'light') {
    config.isDimmable = isChecked('rf-isDimmable');
    config.defaultLevel = Number(getValue('rf-defaultLevel') || 100);
  }
  if (type === 'cover') {
    config.coverType = getValue('rf-coverType');
    config.openTimeSec = Number(getValue('rf-openTimeSec'));
    config.closeTimeSec = Number(getValue('rf-closeTimeSec'));
    if (!config.openTimeSec || !config.closeTimeSec) {
      showAlert('Les temps d\'ouverture/fermeture sont obligatoires pour un cover', 'error');
      return;
    }
  }

  if (editingReceiverId) {
    socket.emit('rfxcom:receiver:update', { receiverId: editingReceiverId, config });
  } else {
    socket.emit('rfxcom:receiver:create', { config });
  }

  closeReceiverForm();
}

function deleteReceiver(receiverId: string): void {
  if (!confirm(`Supprimer le récepteur ${receiverId} ?`)) return;
  socket.emit('rfxcom:receiver:delete', { receiverId });
}

// ============================================================================
// Scènes
// ============================================================================

function renderScenes(): void {
  const listEl = document.getElementById('scenes-list');
  if (!listEl) return;

  listEl.innerHTML = scenes.map((s) => `
    <div class="receiver-item">
      <div class="header">
        <strong>${escapeHtml(s.receiverId)}</strong> — ${escapeHtml(s.name)} (${escapeHtml(s.sceneType)})
        <div>
          <button class="btn btn-primary" data-action="execute-scene" data-id="${escapeHtml(s.receiverId)}">▶️ Exécuter</button>
          <button class="btn btn-secondary" data-action="cancel-scene" data-id="${escapeHtml(s.receiverId)}">⏹️ Annuler</button>
          <button class="btn btn-secondary" data-action="edit-scene" data-id="${escapeHtml(s.receiverId)}">✏️</button>
          <button class="btn btn-danger" data-action="delete-scene" data-id="${escapeHtml(s.receiverId)}">🗑️</button>
        </div>
      </div>
      ${s.description ? `<div>${escapeHtml(s.description)}</div>` : ''}
      <div>Vers HA: <span class="badge ${s.transmitToHa ? 'on' : 'off'}">${s.transmitToHa ? 'oui' : 'non'}</span></div>
      <div>Commandes: ${s.actions.map((a) => `<span class="mono">${escapeHtml(a.target)}</span> → ${escapeHtml(a.command)}${a.value !== undefined ? `(${a.value})` : ''}`).join(', ') || 'aucune'}</div>
    </div>
  `).join('') || '<p>Aucune scène configurée</p>';
}

function openSceneForm(sceneId: string | null): void {
  editingSceneId = sceneId;
  const card = document.getElementById('scene-form-card');
  const title = document.getElementById('scene-form-title');
  if (!card) return;

  card.classList.remove('hidden');

  const existing = sceneId ? scenes.find((s) => s.receiverId === sceneId) : null;

  if (title) title.textContent = existing ? `Modifier ${existing.receiverId}` : 'Nouvelle scène';

  setValue('sc-sceneId', existing?.receiverId || `scene_${String(scenes.length + 1).padStart(3, '0')}`);
  (document.getElementById('sc-sceneId') as HTMLInputElement).disabled = !!existing;
  setValue('sc-name', existing?.name || '');
  setValue('sc-description', existing?.description || '');
  setValue('sc-sceneType', existing?.sceneType || 'sequential');
  setValue('sc-delayBetweenCommands', String(existing?.delayBetweenCommands ?? 500));
  setChecked('sc-transmitToHa', existing?.transmitToHa || false);

  const actionsContainer = document.getElementById('sc-actions-container');
  if (actionsContainer) {
    actionsContainer.innerHTML = '';
    (existing?.actions || []).forEach((a) => addActionRow(a));
    if (!existing) addActionRow();
  }

  card.scrollIntoView({ behavior: 'smooth' });
}

function closeSceneForm(): void {
  document.getElementById('scene-form-card')?.classList.add('hidden');
  editingSceneId = null;
}

function addActionRow(existing?: SceneAction): void {
  const container = document.getElementById('sc-actions-container');
  if (!container) return;

  const targetOptions = receivers
    .filter((r) => r.type !== 'scene')
    .map((r) => `<option value="${escapeHtml(r.receiverId)}" ${existing?.target === r.receiverId ? 'selected' : ''}>${escapeHtml(r.receiverId)} (${escapeHtml(r.name)})</option>`)
    .join('');

  const row = document.createElement('div');
  row.className = 'emitter-row';
  row.innerHTML = `
    <select class="select-control action-target">${targetOptions}</select>
    <select class="select-control action-command">
      ${SCENE_COMMANDS.map((c) => `<option value="${c}" ${existing?.command === c ? 'selected' : ''}>${c}</option>`).join('')}
    </select>
    <input type="number" class="form-control action-value" placeholder="valeur" value="${existing?.value ?? ''}">
    <input type="number" class="form-control action-delay" placeholder="délai (ms)" min="0" value="${existing?.delayMs ?? ''}">
    <button type="button" class="btn btn-danger" data-action="remove-action-row">✕</button>
  `;
  container.appendChild(row);
}

function saveScene(): void {
  const receiverId = getValue('sc-sceneId').trim();
  const name = getValue('sc-name').trim();

  if (!receiverId || !name) {
    showAlert('Identifiant et nom sont requis', 'error');
    return;
  }

  const actions: SceneAction[] = Array.from(document.querySelectorAll('#sc-actions-container .emitter-row')).map((row) => {
    const target = (row.querySelector('.action-target') as HTMLSelectElement).value;
    const command = (row.querySelector('.action-command') as HTMLSelectElement).value;
    const valueStr = (row.querySelector('.action-value') as HTMLInputElement).value;
    const delayStr = (row.querySelector('.action-delay') as HTMLInputElement).value;
    return {
      target,
      command,
      value: valueStr ? Number(valueStr) : undefined,
      delayMs: delayStr ? Number(delayStr) : undefined
    };
  }).filter((a) => a.target);

  if (actions.length === 0) {
    showAlert('Au moins une commande est requise', 'error');
    return;
  }

  const config: ReceiverSceneConfig = {
    receiverId,
    name,
    type: 'scene',
    description: getValue('sc-description').trim() || undefined,
    sceneType: getValue('sc-sceneType') as 'parallel' | 'sequential',
    delayBetweenCommands: Number(getValue('sc-delayBetweenCommands') || 500),
    actions,
    transmitToHa: isChecked('sc-transmitToHa')
  };

  if (editingSceneId) {
    socket.emit('rfxcom:scene:update', { sceneId: editingSceneId, config });
  } else {
    socket.emit('rfxcom:scene:create', { config });
  }

  closeSceneForm();
}

function deleteScene(sceneId: string): void {
  if (!confirm(`Supprimer la scène ${sceneId} ?`)) return;
  socket.emit('rfxcom:scene:delete', { sceneId });
}

function executeScene(sceneId: string): void {
  socket.emit('rfxcom:scene:execute', { sceneId });
}

function cancelScene(sceneId: string): void {
  socket.emit('rfxcom:scene:cancel', { sceneId });
}

// ============================================================================
// Utilitaires
// ============================================================================

function setValue(id: string, value: string): void {
  const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
  if (el) el.value = value;
}
function getValue(id: string): string {
  return (document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null)?.value || '';
}
function setChecked(id: string, checked: boolean): void {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (el) el.checked = checked;
}
function isChecked(id: string): boolean {
  return (document.getElementById(id) as HTMLInputElement | null)?.checked || false;
}

function showAlert(message: string, type: 'success' | 'error' | 'info'): void {
  const successEl = document.getElementById('success-alert');
  const errorEl = document.getElementById('error-alert');
  [successEl, errorEl].forEach((el) => { if (el) el.style.display = 'none'; });

  const el = type === 'error' ? errorEl : successEl;
  if (el) {
    el.textContent = message;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 4000);
  }
}

function hideLoading(): void {
  const el = document.getElementById('loading');
  if (el) el.style.display = 'none';
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
