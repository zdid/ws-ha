/**
 * RfxComTransceiver
 *
 * Enveloppe la bibliothèque npm `rfxcom` (v2.6.2, vérifiée directement dans node_modules —
 * voir types/rfxcom.d.ts pour le détail des écarts avec implementation-rfxcom_specs_v1.2.md).
 *
 * Écarts principaux constatés avec la spec :
 * - Pas d'événement générique 'device' : chaque protocole émet son propre événement nommé
 *   ('lighting1', 'lighting2', 'blinds1', 'temperaturehumidity1', ...).
 * - Cycle de vie réel : 'connecting' → 'ready' (succès) ou 'connectfailed'/'disconnect' (échec,
 *   avec message d'erreur) — pas de 'connect'/'error'/'status' comme décrit dans la spec.
 * - Signatures de commandes réelles très différentes (deviceId encodé en chaîne par protocole,
 *   pas de houseCode/unitCode en paramètres séparés) — voir buildCommandDeviceId().
 *
 * Couche : Domaine (dépend de la lib native `rfxcom`, mais pas de MQTT/EventBus — c'est
 * RfxComService qui fait le pont).
 */

import * as rfxcom from 'rfxcom';
import type { Logger } from '../../../../core/src/exports';
import type { RfxComRawMessage, RfxComDeviceType } from '../types';

export interface RfxComTransceiverOptions {
  port: string;
  baudRate: number;
  debug?: boolean;
}

type MessageCallback = (message: RfxComRawMessage) => void;
type ConnectionCallback = (connected: boolean, error?: string) => void;

/** Mapping événement rfxcom → { type interne, subtypeTable } (protocoles réellement gérés). */
const LIGHTING_EVENTS: Record<string, { type: RfxComDeviceType; table: rfxcom.ProtocolSubtypeTable }> = {
  lighting1: { type: 'Lighting1', table: rfxcom.lighting1 },
  lighting2: { type: 'Lighting2', table: rfxcom.lighting2 },
  lighting4: { type: 'Lighting4', table: rfxcom.lighting4 },
  lighting5: { type: 'Lighting5', table: rfxcom.lighting5 },
  lighting6: { type: 'Lighting6', table: rfxcom.lighting6 }
};

export class RfxComTransceiver {
  private device?: rfxcom.RfxCom;
  private connected = false;
  private messageCallbacks: MessageCallback[] = [];
  private connectionCallbacks: ConnectionCallback[] = [];
  // Transmitters mis en cache par "protocole:subtype" pour éviter d'en recréer un par commande
  private transmitters: Map<string, unknown> = new Map();
  // Filtre logiciel par type de message (fonctionnelles-rfxcom_specs §8.2, "Gestion des
  // protocoles") — null = tous activés (comportement par défaut, config.enabledProtocols vide).
  // Filtré ici (avant emitMessage aux callbacks), pas via le registre bitmap bas niveau de la
  // bibliothèque `rfxcom` (enableRFXProtocols) : ce dernier ne correspond pas à l'exemple d'UI de
  // la spec, dépend du type de récepteur réellement connecté (jamais vérifiable en environnement
  // de dev sans matériel), et écrit en mémoire non volatile à chaque appel si on utilisait
  // saveRFXProtocols (nombre de cycles d'écriture limité).
  private enabledTypes: Set<RfxComDeviceType> | null = null;

  constructor(private readonly logger: Logger) {}

  // ==========================================================================
  // Connexion
  // ==========================================================================

  connect(options: RfxComTransceiverOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      this.logger.info('RfxComTransceiver', `Tentative de connexion au transceiver RFXCOM sur ${options.port}...`);

      const device = new rfxcom.RfxCom(options.port, { debug: options.debug ?? false });
      this.device = device;

      let settled = false;
      const onReady = () => {
        if (settled) return;
        settled = true;
        this.connected = true;
        this.logger.info('RfxComTransceiver', `Transceiver RFXCOM initialisé avec succès sur ${options.port}`);
        this.notifyConnection(true);
        resolve();
      };
      const onFailed = (message: string) => {
        if (settled) return;
        settled = true;
        this.connected = false;
        this.logger.warn('RfxComTransceiver', `Tentative de connexion RFXCOM échouée - Motif: ${message}`);
        this.notifyConnection(false, message);
        reject(new Error(message));
      };

      device.on('ready', onReady);
      device.on('connectfailed', (message: string) => onFailed(message));
      device.on('disconnect', (message: string) => {
        // Après une connexion déjà établie : ne rejette pas la promesse (déjà résolue),
        // juste notification de perte de connexion.
        if (settled) {
          this.connected = false;
          this.logger.warn('RfxComTransceiver', `Transceiver déconnecté: ${message || 'raison inconnue'}`);
          this.notifyConnection(false, message);
          return;
        }
        onFailed(message);
      });

      this.setupProtocolListeners(device);

      device.initialise(onReady);
    });
  }

  disconnect(): void {
    if (!this.device) return;
    try {
      this.device.close();
    } catch (error) {
      this.logger.error('RfxComTransceiver', `Erreur lors de la fermeture: ${error}`);
    }
    this.device = undefined;
    this.transmitters.clear();
    this.connected = false;
    this.notifyConnection(false);
  }

  isConnected(): boolean {
    return this.connected;
  }

  onMessage(callback: MessageCallback): void {
    this.messageCallbacks.push(callback);
  }

  onConnectionChange(callback: ConnectionCallback): void {
    this.connectionCallbacks.push(callback);
  }

  /** Restreint les messages relayés aux callbacks à ces types — tableau vide = tous activés. */
  setEnabledTypes(types: RfxComDeviceType[]): void {
    this.enabledTypes = types.length > 0 ? new Set(types) : null;
  }

  getEnabledTypes(): RfxComDeviceType[] | null {
    return this.enabledTypes ? Array.from(this.enabledTypes) : null;
  }

  // ==========================================================================
  // Réception — écoute de chaque événement protocole et normalisation
  // ==========================================================================

  private setupProtocolListeners(device: rfxcom.RfxCom): void {
    for (const [eventName, { type, table }] of Object.entries(LIGHTING_EVENTS)) {
      device.on(eventName, (evt: any) => {
        this.emitMessage({
          type,
          subType: table[evt.subtype] ?? String(evt.subtype),
          sensorId: evt.id,
          unitCode: evt.unitCode,
          commandDeviceId: this.buildCommandDeviceId(type, evt),
          seqNbr: evt.seqnbr,
          signalLevel: evt.rssi ?? 0,
          batteryLevel: evt.battery ?? 0,
          data: { command: evt.command, level: evt.level },
          timestamp: new Date()
        });
      });
    }

    device.on('temperaturehumidity1', (evt: any) => {
      const base = {
        sensorId: evt.id,
        seqNbr: evt.seqnbr,
        signalLevel: evt.rssi ?? 0,
        batteryLevel: evt.batteryLevel ?? 0,
        timestamp: new Date()
      };
      this.emitMessage({ ...base, type: 'RFXSensor', subType: 'Temperature', data: { temperature: evt.temperature } });
      this.emitMessage({ ...base, type: 'RFXSensor', subType: 'Humidity', data: { humidity: evt.humidity, humidityStatus: evt.humidityStatus } });
    });

    device.on('temperature1', (evt: any) => {
      this.emitMessage({
        type: 'RFXSensor',
        subType: 'Temperature',
        sensorId: evt.id,
        seqNbr: evt.seqnbr,
        signalLevel: evt.rssi ?? 0,
        batteryLevel: evt.batteryLevel ?? 0,
        data: { temperature: evt.temperature },
        timestamp: new Date()
      });
    });

    device.on('humidity1', (evt: any) => {
      this.emitMessage({
        type: 'RFXSensor',
        subType: 'Humidity',
        sensorId: evt.id,
        seqNbr: evt.seqnbr,
        signalLevel: evt.rssi ?? 0,
        batteryLevel: evt.batteryLevel ?? 0,
        data: { humidity: evt.humidity },
        timestamp: new Date()
      });
    });

    device.on('security1', (evt: any) => {
      // La bibliothèque rfxcom ne distingue pas nativement motion/contact autrement que par le
      // nom du subtype (ex: "X10_PIR" vs "X10_DOOR") — heuristique sur ce nom, best-effort.
      const subtypeName = rfxcom.security1[evt.subtype] ?? String(evt.subtype);
      const isMotion = /PIR|MOTION/i.test(subtypeName);
      this.emitMessage({
        type: 'RFXSensor',
        subType: isMotion ? 'Motion' : 'Contact',
        sensorId: evt.id,
        seqNbr: evt.seqnbr,
        signalLevel: evt.rssi ?? 0,
        batteryLevel: evt.batteryLevel ?? 0,
        data: { deviceStatus: evt.deviceStatus, subtypeRaw: subtypeName },
        timestamp: new Date()
      });
    });

    device.on('elec1', (evt: any) => {
      this.emitMessage({
        type: 'RFXMeter',
        subType: 'Current',
        sensorId: evt.id,
        seqNbr: evt.seqnbr,
        signalLevel: evt.rssi ?? 0,
        batteryLevel: evt.batteryLevel ?? 0,
        data: { current: Array.isArray(evt.current) ? evt.current[0] : evt.current },
        timestamp: new Date()
      });
    });

    device.on('elec23', (evt: any) => {
      this.emitMessage({
        type: 'RFXMeter',
        subType: 'Power',
        sensorId: evt.id,
        seqNbr: evt.seqnbr,
        signalLevel: evt.rssi ?? 0,
        batteryLevel: evt.batteryLevel ?? 0,
        data: { power: evt.power, energy: evt.energy },
        timestamp: new Date()
      });
    });

    device.on('blinds1', (evt: any) => {
      this.emitMessage({
        type: 'Blinds1',
        subType: rfxcom.blinds1[evt.subtype] ?? String(evt.subtype),
        sensorId: evt.id,
        unitCode: evt.unitCode,
        commandDeviceId: evt.id,
        seqNbr: evt.seqnbr,
        signalLevel: evt.rssi ?? 0,
        batteryLevel: evt.battery ?? 0,
        data: { command: evt.command },
        timestamp: new Date()
      });
    });
  }

  private emitMessage(message: RfxComRawMessage): void {
    if (this.enabledTypes && !this.enabledTypes.has(message.type)) return;
    for (const callback of this.messageCallbacks) {
      try {
        callback(message);
      } catch (error) {
        this.logger.error('RfxComTransceiver', `Erreur dans callback de message: ${error}`);
      }
    }
  }

  private notifyConnection(connected: boolean, error?: string): void {
    for (const callback of this.connectionCallbacks) {
      try {
        callback(connected, error);
      } catch (err) {
        this.logger.error('RfxComTransceiver', `Erreur dans callback de connexion: ${err}`);
      }
    }
  }

  /**
   * Construit l'identifiant déjà prêt pour renvoyer une commande via la classe Transmitter
   * correspondante — le format diffère par protocole (voir types/rfxcom.d.ts).
   */
  private buildCommandDeviceId(type: RfxComDeviceType, evt: any): string | undefined {
    switch (type) {
      case 'Lighting1':
        return `${evt.houseCode}${evt.unitCode}`;
      case 'Lighting2':
        return `${evt.id}/${evt.unitCode}`;
      default:
        return undefined;
    }
  }

  // ==========================================================================
  // Envoi de commandes
  // ==========================================================================

  /**
   * Envoie une commande à un device physique. `subType` doit être le nom du sous-protocole
   * (ex: "AC" pour Lighting2), utilisé pour instancier le bon Transmitter.
   */
  sendCommand(
    protocole: string,
    subType: string,
    commandDeviceId: string,
    action: 'on' | 'off' | 'set_level' | 'open' | 'close' | 'stop',
    value?: number
  ): void {
    if (!this.device) {
      throw new Error('Transceiver non initialisé');
    }

    const transmitter = this.getOrCreateTransmitter(protocole, subType);
    if (!transmitter) {
      throw new Error(`Protocole non supporté pour l'envoi de commandes: ${protocole}`);
    }

    switch (protocole) {
      case 'lighting1': {
        const t = transmitter as rfxcom.Lighting1;
        if (action === 'on') t.switchOn(commandDeviceId);
        else if (action === 'off') t.switchOff(commandDeviceId);
        else throw new Error(`Action non supportée pour lighting1: ${action}`);
        break;
      }
      case 'lighting2': {
        const t = transmitter as rfxcom.Lighting2;
        if (action === 'on') t.switchOn(commandDeviceId);
        else if (action === 'off') t.switchOff(commandDeviceId);
        else if (action === 'set_level') {
          // Échelle RFXCOM native 0-15, value reçu en 0-100%
          const level = Math.max(0, Math.min(15, Math.round(((value ?? 100) / 100) * 15)));
          t.setLevel(commandDeviceId, level);
        } else throw new Error(`Action non supportée pour lighting2: ${action}`);
        break;
      }
      case 'blinds1': {
        const t = transmitter as rfxcom.Blinds1;
        if (action === 'open') t.open(commandDeviceId);
        else if (action === 'close') t.close(commandDeviceId);
        else if (action === 'stop') t.stop(commandDeviceId);
        else throw new Error(`Action non supportée pour blinds1: ${action}`);
        break;
      }
      default:
        throw new Error(`Protocole non supporté pour l'envoi de commandes: ${protocole}`);
    }
  }

  private getOrCreateTransmitter(protocole: string, subType: string): unknown {
    if (!this.device) return undefined;

    const key = `${protocole}:${subType}`;
    const cached = this.transmitters.get(key);
    if (cached) return cached;

    let transmitter: unknown;
    switch (protocole) {
      case 'lighting1':
        transmitter = new rfxcom.Lighting1(this.device, rfxcom.lighting1[subType] ?? 0);
        break;
      case 'lighting2':
        transmitter = new rfxcom.Lighting2(this.device, rfxcom.lighting2[subType] ?? 0);
        break;
      case 'blinds1':
        transmitter = new rfxcom.Blinds1(this.device, rfxcom.blinds1[subType] ?? 0);
        break;
      default:
        return undefined;
    }

    this.transmitters.set(key, transmitter);
    return transmitter;
  }
}
