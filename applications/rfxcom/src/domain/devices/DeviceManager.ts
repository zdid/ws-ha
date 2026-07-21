/**
 * DeviceManager
 *
 * Registre des devices RFXCOM physiques : deux listes distinctes (fonctionnelles-rfxcom_specs
 * §11.2) — "paramétrés" (persistés dans config-rfxcom-devices-v1.0.yaml) et "auto-discovery"
 * (en mémoire uniquement pendant la session, jamais persistés tant qu'ils ne sont pas paramétrés).
 *
 * Couche : Domaine — pas de dépendance MQTT/EventBus/YAML (RfxComService fait le pont).
 */

import type { Logger } from '../../../../core/src/exports';
import { determineQuoi, getProtocole } from '../classification';
import type { RfxComDeviceInfo, RfxComDiscoveredDevice, RfxComRawMessage } from '../types';

export class DeviceManager {
  private configuredDevices: Map<string, RfxComDeviceInfo> = new Map();
  private discoveredDevices: Map<string, RfxComDiscoveredDevice> = new Map();

  constructor(private readonly logger: Logger) {}

  // ==========================================================================
  // Chargement / accès
  // ==========================================================================

  loadConfigured(devices: Record<string, RfxComDeviceInfo>): void {
    this.configuredDevices.clear();
    for (const [uniqueId, device] of Object.entries(devices)) {
      this.configuredDevices.set(uniqueId, device);
    }
    this.logger.info('DeviceManager', `${this.configuredDevices.size} device(s) paramétré(s) chargé(s)`);
  }

  getConfiguredDevices(): RfxComDeviceInfo[] {
    return Array.from(this.configuredDevices.values());
  }

  getConfiguredDevicesRecord(): Record<string, RfxComDeviceInfo> {
    return Object.fromEntries(this.configuredDevices);
  }

  getDiscoveredDevices(): RfxComDiscoveredDevice[] {
    return Array.from(this.discoveredDevices.values());
  }

  getDevice(uniqueId: string): RfxComDeviceInfo | undefined {
    return this.configuredDevices.get(uniqueId);
  }

  // ==========================================================================
  // Traitement des messages RF433
  // ==========================================================================

  /**
   * Traite un message RF433 normalisé : si le device est déjà paramétré, met à jour lastSeen
   * (et commandDeviceId, qui peut varier d'un message à l'autre pour un même émetteur logique
   * — improbable mais sans coût de le rafraîchir). Sinon, l'ajoute (ou le met à jour) dans la
   * liste auto-discovery, en mémoire seulement.
   */
  handleRawMessage(message: RfxComRawMessage): { uniqueId: string; isNew: boolean } {
    const protocole = getProtocole(message.type);
    const uniqueId = `${protocole}_${message.sensorId.toLowerCase()}`;

    const configured = this.configuredDevices.get(uniqueId);
    if (configured) {
      configured.lastSeen = message.timestamp.toISOString();
      if (message.commandDeviceId) {
        configured.commandDeviceId = message.commandDeviceId;
      }
      return { uniqueId, isNew: false };
    }

    const alreadyDiscovered = this.discoveredDevices.has(uniqueId);
    this.discoveredDevices.set(uniqueId, {
      sensorId: message.sensorId,
      type: message.type,
      subType: message.subType,
      uniqueId,
      defaultQuoi: determineQuoi(message.type, message.subType),
      unitCode: message.unitCode,
      detectedAt: message.timestamp.toISOString()
    });

    if (!alreadyDiscovered) {
      this.logger.info('DeviceManager', `Nouveau device détecté: ${uniqueId} (${message.type}/${message.subType})`);
    }

    return { uniqueId, isNew: !alreadyDiscovered };
  }

  /** Supprime tous les devices auto-découverts non paramétrés (fonctionnelles-rfxcom_specs §11.2 toolbar). */
  clearUnconfigured(): number {
    const count = this.discoveredDevices.size;
    this.discoveredDevices.clear();
    return count;
  }

  /**
   * Paramètre un device : le fait passer d'auto-discovery (ou crée un nouveau) vers la liste
   * paramétrée, avec son nom QUOI---OÙ complet. `transmitToHa` défaut à false (fonctionnelles-
   * rfxcom_specs §12.5 : "sauvegardés avec transmitToHa à false" — l'utilisateur l'active ensuite).
   */
  setDeviceName(uniqueId: string, name: string): RfxComDeviceInfo {
    const discovered = this.discoveredDevices.get(uniqueId);
    const existing = this.configuredDevices.get(uniqueId);

    const device: RfxComDeviceInfo = existing
      ? { ...existing, name }
      : {
          uniqueId,
          sensorId: discovered?.sensorId ?? uniqueId,
          type: discovered?.type ?? 'RFXSensor',
          subType: discovered?.subType ?? 'Unknown',
          protocole: getProtocole(discovered?.type ?? 'RFXSensor'),
          name,
          defaultQuoi: discovered?.defaultQuoi ?? '',
          transmitToHa: false,
          unitCode: discovered?.unitCode
        };

    this.configuredDevices.set(uniqueId, device);
    this.discoveredDevices.delete(uniqueId);

    return device;
  }

  setTransmitToHa(uniqueId: string, transmitToHa: boolean): RfxComDeviceInfo | undefined {
    const device = this.configuredDevices.get(uniqueId);
    if (!device) return undefined;
    device.transmitToHa = transmitToHa;
    return device;
  }

  deleteDevice(uniqueId: string): boolean {
    return this.configuredDevices.delete(uniqueId);
  }
}
