/**
 * Script TypeScript pour la page de configuration EVOO7 (Paramétrage & Données).
 */

import { SocketService } from '../../../../core/src/ui-exports';

// ============================================================================
// Types (miroir simplifié de domain/types.ts, pour l'UI uniquement)
// ============================================================================

interface Evoo7ValeurPossible {
  code: string;
  libelle: string;
}

interface Evoo7DataDefinition {
  id: string;
  description: string;
  min?: number;
  max?: number;
  valeursPossibles?: Evoo7ValeurPossible[];
  updatable: boolean;
  isConfigData: boolean;
  consultation: boolean;
  miseAJour: boolean;
  topicSensor: string;
  formatMessageSensor: string;
}

interface Evoo7Config {
  bridgeInstance: string;
  mqtt: {
    host: string;
    port: number;
    username?: string;
    password?: string;
    qos: number;
  };
  topicCommand: string;
  formatMessageCommand: string;
}

// ============================================================================
// État
// ============================================================================

let socket: any | null = null;
let donnees: Evoo7DataDefinition[] = [];

// ============================================================================
// Initialisation
// ============================================================================

function init(): void {
  const socketService = new SocketService();
  socket = socketService.connect();

  setupSocketListeners();
  setupUiListeners();

  socket.emit('evoo7:donnees:list:get');
  socket.emit('evoo7:config:get');

  hideLoading();
}

function setupSocketListeners(): void {
  socket.on('evoo7:donnees:list', (data: { donnees: Evoo7DataDefinition[] }) => {
    donnees = data.donnees;
    renderDonnees();
  });

  socket.on('evoo7:config:get:response', (config: Evoo7Config) => {
    fillParametrageForm(config);
  });

  socket.on('evoo7:config:save:response', () => showAlert('Paramétrage enregistré', 'success'));
  socket.on('evoo7:error', (error: { message: string }) => showAlert(error.message, 'error'));
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

  document.getElementById('pa-save')?.addEventListener('click', saveParametrage);

  // Délégation d'événements pour les éléments générés dynamiquement (table Données)
  document.addEventListener('change', (event) => {
    const target = event.target as HTMLElement;
    const id = target.closest('[data-id]')?.getAttribute('data-id');
    if (!id) return;

    if (target.classList.contains('consultation-check')) {
      toggleSelection(id, 'consultation', (target as HTMLInputElement).checked);
    }
    if (target.classList.contains('miseajour-check')) {
      toggleSelection(id, 'miseAJour', (target as HTMLInputElement).checked);
    }
  });

  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const action = target.closest('[data-action]')?.getAttribute('data-action');
    const id = target.closest('[data-id]')?.getAttribute('data-id');
    if (action === 'save-topic' && id) saveTopic(id);
  });
}

// ============================================================================
// Données
// ============================================================================

/** Miroir client de classification.ts: une énumération n'est jamais commandable (voir Evoo7Service). */
function isCommandable(d: Evoo7DataDefinition): boolean {
  const hasEnum = !!d.valeursPossibles && d.valeursPossibles.length > 0;
  return d.updatable && !hasEnum;
}

function renderConstraints(d: Evoo7DataDefinition): string {
  if (d.min !== undefined || d.max !== undefined) {
    return `min: ${d.min ?? '--'} / max: ${d.max ?? '--'}`;
  }
  if (d.valeursPossibles && d.valeursPossibles.length > 0) {
    return d.valeursPossibles.map((v) => escapeHtml(v.libelle)).join(', ');
  }
  return '--';
}

function renderDonnees(): void {
  const body = document.getElementById('donnees-body');
  if (!body) return;

  body.innerHTML = donnees.map((d) => `
    <tr>
      <td>
        <div class="mono">${escapeHtml(d.id)}</div>
        <div>${escapeHtml(d.description)}</div>
      </td>
      <td><span class="badge ${d.isConfigData ? 'config' : 'donnee'}">${d.isConfigData ? 'config' : 'donnée'}</span></td>
      <td class="constraints">${renderConstraints(d)}</td>
      <td><input type="checkbox" class="consultation-check" data-id="${escapeHtml(d.id)}" ${d.consultation ? 'checked' : ''}></td>
      <td>${isCommandable(d)
        ? `<input type="checkbox" class="miseajour-check" data-id="${escapeHtml(d.id)}" ${d.miseAJour ? 'checked' : ''}>`
        : '<span class="constraints">--</span>'}</td>
      <td class="topic-cell">
        <input type="text" class="form-control topic-sensor" data-id="${escapeHtml(d.id)}" value="${escapeHtml(d.topicSensor)}">
        <input type="text" class="form-control format-sensor" data-id="${escapeHtml(d.id)}" value="${escapeHtml(d.formatMessageSensor)}">
      </td>
      <td><button class="btn btn-secondary" data-action="save-topic" data-id="${escapeHtml(d.id)}">💾</button></td>
    </tr>
  `).join('') || '<tr><td colspan="7">Aucune donnée</td></tr>';
}

function toggleSelection(id: string, field: 'consultation' | 'miseAJour', checked: boolean): void {
  const donnee = donnees.find((d) => d.id === id);
  if (!donnee) return;

  const consultation = field === 'consultation' ? checked : donnee.consultation;
  const miseAJour = field === 'miseAJour' ? checked : donnee.miseAJour;

  socket.emit('evoo7:donnee:set_selection', { id, consultation, miseAJour });
}

function saveTopic(id: string): void {
  const row = document.querySelector(`.topic-sensor[data-id="${id}"]`)?.closest('tr');
  if (!row) return;

  const topicSensor = (row.querySelector('.topic-sensor') as HTMLInputElement).value;
  const formatMessageSensor = (row.querySelector('.format-sensor') as HTMLInputElement).value;

  socket.emit('evoo7:donnee:set_topic', { id, topicSensor, formatMessageSensor });
  showAlert(`Topic mis à jour pour ${id}`, 'success');
}

// ============================================================================
// Paramétrage
// ============================================================================

function fillParametrageForm(config: Evoo7Config): void {
  setValue('pa-host', config.mqtt.host);
  setValue('pa-port', String(config.mqtt.port));
  setValue('pa-username', config.mqtt.username || '');
  setValue('pa-password', config.mqtt.password || '');
  setValue('pa-qos', String(config.mqtt.qos));
  setValue('pa-bridgeInstance', config.bridgeInstance);
  setValue('pa-topicCommand', config.topicCommand);
  setValue('pa-formatMessageCommand', config.formatMessageCommand);
}

function saveParametrage(): void {
  const config: Partial<Evoo7Config> = {
    bridgeInstance: getValue('pa-bridgeInstance'),
    mqtt: {
      host: getValue('pa-host'),
      port: Number(getValue('pa-port') || 1883),
      username: getValue('pa-username') || undefined,
      password: getValue('pa-password') || undefined,
      qos: Number(getValue('pa-qos') || 0)
    },
    topicCommand: getValue('pa-topicCommand'),
    formatMessageCommand: getValue('pa-formatMessageCommand')
  };

  socket.emit('evoo7:config:save', config);
}

// ============================================================================
// Utilitaires
// ============================================================================

function setValue(id: string, value: string): void {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (el) el.value = value;
}
function getValue(id: string): string {
  return (document.getElementById(id) as HTMLInputElement | null)?.value || '';
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
