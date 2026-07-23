/**
 * Script TypeScript pour la page de configuration AREXX (Capteurs).
 */

// SocketService : URL réellement servie par le socle (core la compile déjà en JS navigateur
// et l'expose via son middleware /js/ts) — pas un chemin de fichier TypeScript, un import
// d'exécution résolu par le navigateur lui-même. Voir presentation/tsconfig.ui.json.
import { SocketService } from '/js/ts/services/SocketService.js';

// ============================================================================
// Types (miroir simplifié de domain/types.ts, pour l'UI uniquement)
// ============================================================================

interface ArexxSensorInfo {
  uniqueId: string;
  kind: 'temperature' | 'humidity';
  name: string;
  transmitToHa: boolean;
  lastValue?: number;
  lastSeen?: string;
}

interface ArexxDiscoveredSensor {
  uniqueId: string;
  kind: 'temperature' | 'humidity';
  detectedAt: string;
}

// ============================================================================
// État
// ============================================================================

let socket: any | null = null;
let configuredSensors: ArexxSensorInfo[] = [];
let discoveredSensors: ArexxDiscoveredSensor[] = [];

// ============================================================================
// Initialisation
// ============================================================================

function init(): void {
  const socketService = new SocketService();
  socket = socketService.connect();

  setupSocketListeners();
  setupUiListeners();

  socket.emit('arexx:sensors:list:get');

  hideLoading();
}

function setupSocketListeners(): void {
  socket.on('arexx:sensors:list', (data: { configured: ArexxSensorInfo[]; discovered: ArexxDiscoveredSensor[] }) => {
    configuredSensors = data.configured;
    discoveredSensors = data.discovered;
    renderConfiguredSensors();
    renderDiscoveredSensors();
  });

  socket.on('arexx:sensor:detected', () => {
    socket.emit('arexx:sensors:list:get');
  });

  socket.on('arexx:error', (error: { message: string }) => showAlert(error.message, 'error'));
}

function setupUiListeners(): void {
  document.getElementById('btn-refresh')?.addEventListener('click', () => {
    socket.emit('arexx:sensors:list:get');
  });

  // Délégation d'événements pour les éléments générés dynamiquement
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const action = target.closest('[data-action]')?.getAttribute('data-action');
    const id = target.closest('[data-id]')?.getAttribute('data-id');
    if (!action || !id) return;

    if (action === 'set-sensor-name') return setSensorName(id);
    if (action === 'delete-sensor') return deleteSensor(id);
  });

  document.addEventListener('change', (event) => {
    const target = event.target as HTMLElement;
    if (target.getAttribute('data-action') === 'toggle-transmit') {
      const id = target.closest('[data-id]')?.getAttribute('data-id');
      if (id) toggleSensorTransmit(id);
    }
  });
}

// ============================================================================
// Capteurs
// ============================================================================

function kindLabel(kind: 'temperature' | 'humidity'): string {
  return kind === 'humidity' ? 'Humidité' : 'Température';
}

function renderConfiguredSensors(): void {
  const body = document.getElementById('configured-sensors-body');
  if (!body) return;

  body.innerHTML = configuredSensors.map((s) => `
    <tr>
      <td class="mono">${escapeHtml(s.uniqueId)}</td>
      <td>${escapeHtml(s.name)}</td>
      <td>${escapeHtml(kindLabel(s.kind))}</td>
      <td>
        <input type="checkbox" data-action="toggle-transmit" data-id="${escapeHtml(s.uniqueId)}" ${s.transmitToHa ? 'checked' : ''}>
      </td>
      <td>${s.lastSeen ? new Date(s.lastSeen).toLocaleString('fr-FR') : '--'}</td>
      <td>
        <button class="btn btn-secondary" data-action="set-sensor-name" data-id="${escapeHtml(s.uniqueId)}">✏️</button>
        <button class="btn btn-danger" data-action="delete-sensor" data-id="${escapeHtml(s.uniqueId)}">🗑️</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="6">Aucun capteur paramétré</td></tr>';
}

function renderDiscoveredSensors(): void {
  const body = document.getElementById('discovered-sensors-body');
  if (!body) return;

  body.innerHTML = discoveredSensors.map((s) => `
    <tr>
      <td class="mono">${escapeHtml(s.uniqueId)}</td>
      <td>${escapeHtml(kindLabel(s.kind))}</td>
      <td>${new Date(s.detectedAt).toLocaleString('fr-FR')}</td>
      <td><button class="btn btn-primary" data-action="set-sensor-name" data-id="${escapeHtml(s.uniqueId)}">Paramétrer</button></td>
    </tr>
  `).join('') || '<tr><td colspan="4">Aucun capteur en auto-découverte</td></tr>';
}

function setSensorName(uniqueId: string): void {
  const existing = configuredSensors.find((s) => s.uniqueId === uniqueId);
  const discovered = discoveredSensors.find((s) => s.uniqueId === uniqueId);
  const kind = existing?.kind || discovered?.kind || 'temperature';
  const defaultQuoi = kindLabel(kind);

  const currentQuoi = existing?.name.split('---')[0] || defaultQuoi;
  const currentLieu = existing?.name.includes('---') ? existing.name.split('---')[1] : '';

  const quoi = prompt(`QUOI pour ${uniqueId} (ex: Température)`, currentQuoi);
  if (quoi === null || quoi.trim() === '') return;

  const lieu = prompt(
    `Localisation (OÙ) pour ${uniqueId}\nFormat: lieu_principal (ou lieu_precis--lieu_principal)`,
    currentLieu || ''
  );
  if (lieu === null || lieu.trim() === '') return;

  const name = `${quoi.trim()}---${lieu.trim()}`;
  socket.emit('arexx:sensor:set_name', { uniqueId, name });
}

function toggleSensorTransmit(uniqueId: string): void {
  const sensor = configuredSensors.find((s) => s.uniqueId === uniqueId);
  if (!sensor) return;
  socket.emit('arexx:sensor:set_transmit', { uniqueId, transmitToHa: !sensor.transmitToHa });
}

function deleteSensor(uniqueId: string): void {
  if (!confirm(`Supprimer le capteur ${uniqueId} ?`)) return;
  socket.emit('arexx:sensor:delete', { uniqueId });
}

// ============================================================================
// Utilitaires
// ============================================================================

function showAlert(message: string, type: 'success' | 'error'): void {
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
