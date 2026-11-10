import { ControlMode, LiveBikeTelemetry } from '../types/cycling';

const FTMS_SERVICE_UUID = 0x1826;
const INDOOR_BIKE_DATA_UUID = 0x2ad2;
const FITNESS_MACHINE_CONTROL_POINT_UUID = 0x2ad9;

const CYCLING_POWER_SERVICE_UUID = 0x1818;
const CYCLING_POWER_MEASUREMENT_UUID = 0x2a63;

type TelemetryListener = (telemetry: LiveBikeTelemetry) => void;

/**
 * Parses Bluetooth SIG FTMS Indoor Bike Data (0x2AD2) binary packet.
 * Handles Domyos Challenge Bike telemetry including Power (W), Heart Rate (BPM),
 * Cadence (RPM), Instantaneous Speed (km/h), Total Distance, and Resistance Level.
 */
export function parseFtmsIndoorBikeData(data: DataView): {
  speedKmh?: number;
  cadenceRpm?: number;
  distanceMeters?: number;
  resistanceLevel?: number;
  powerWatts?: number;
  heartRateBpm?: number;
} {
  if (data.byteLength < 2) return {};
  const flags = data.getUint16(0, true);
  let offset = 2;

  const result: {
    speedKmh?: number;
    cadenceRpm?: number;
    distanceMeters?: number;
    resistanceLevel?: number;
    powerWatts?: number;
    heartRateBpm?: number;
  } = {};

  // Bit 0: More Data (0 = Instantaneous Speed IS present!)
  const moreData = (flags & 0x0001) !== 0;
  if (!moreData && offset + 2 <= data.byteLength) {
    const rawSpeed = data.getUint16(offset, true);
    result.speedKmh = Number((rawSpeed * 0.01).toFixed(1));
    offset += 2;
  }

  // Bit 1: Average Speed Present
  if ((flags & 0x0002) !== 0 && offset + 2 <= data.byteLength) {
    offset += 2;
  }

  // Bit 2: Instantaneous Cadence Present (0.5 rpm resolution)
  if ((flags & 0x0004) !== 0 && offset + 2 <= data.byteLength) {
    const rawCadence = data.getUint16(offset, true);
    result.cadenceRpm = Math.round(rawCadence * 0.5);
    offset += 2;
  }

  // Bit 3: Average Cadence Present
  if ((flags & 0x0008) !== 0 && offset + 2 <= data.byteLength) {
    offset += 2;
  }

  // Bit 4: Total Distance Present (uint24, 3 bytes in meters)
  if ((flags & 0x0010) !== 0 && offset + 3 <= data.byteLength) {
    const d0 = data.getUint8(offset);
    const d1 = data.getUint8(offset + 1);
    const d2 = data.getUint8(offset + 2);
    result.distanceMeters = d0 | (d1 << 8) | (d2 << 16);
    offset += 3;
  }

  // Bit 5: Resistance Level Present (sint16)
  if ((flags & 0x0020) !== 0 && offset + 2 <= data.byteLength) {
    const rawRes = data.getInt16(offset, true);
    result.resistanceLevel = Math.max(1, Math.round(rawRes > 32 ? rawRes / 10 : rawRes));
    offset += 2;
  }

  // Bit 6: Instantaneous Power Present (sint16 in Watts)
  if ((flags & 0x0040) !== 0 && offset + 2 <= data.byteLength) {
    const rawPower = data.getInt16(offset, true);
    result.powerWatts = Math.max(0, rawPower);
    offset += 2;
  }

  // Bit 7: Average Power Present
  if ((flags & 0x0080) !== 0 && offset + 2 <= data.byteLength) {
    offset += 2;
  }

  // Bit 8: Expended Energy Present (Total uint16 + Per Hour uint16 + Per Minute uint8 = 5 bytes)
  if ((flags & 0x0100) !== 0 && offset + 5 <= data.byteLength) {
    offset += 5;
  }

  // Bit 9: Heart Rate Present (uint8 BPM) — Domyos Challenge Bike forwards paired HR strap here
  if ((flags & 0x0200) !== 0 && offset + 1 <= data.byteLength) {
    result.heartRateBpm = data.getUint8(offset);
    offset += 1;
  }

  return result;
}

export class FtmsBikeController {
  private listeners: Set<TelemetryListener> = new Set();
  private controlPointChar: any = null;
  private bleDevice: any = null;
  private extPowerDevice: any = null;
  private simInterval: number | null = null;
  private recentPowers: number[] = [];
  private lastSentWatts: number = -1;
  private lastSentRes: number = -1;
  private lastCommandTimeMs: number = 0;
  private manualDisconnect: boolean = false;
  private reconnectTimer: number | null = null;

  private state: LiveBikeTelemetry = {
    connected: false,
    reconnecting: false,
    reconnectAttempt: 0,
    deviceName: 'Brak połączenia',
    isSimulator: false,
    externalPowerConnected: false,
    externalPowerDeviceName: '',
    powerWatts: 0,
    power3sAvgWatts: 0,
    externalPowerWatts: null,
    powerMatchOffsetWatts: 0,
    heartRateBpm: 0,
    cadenceRpm: 0,
    speedKmh: 0,
    distanceMeters: 0,
    resistanceLevel: 1,
    targetPowerWatts: 120,
    targetResistanceLevel: 6,
    controlMode: 'erg_watts',
    biasPercent: 100,
  };

  public subscribe(listener: TelemetryListener): () => void {
    this.listeners.add(listener);
    listener({ ...this.state });
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit() {
    const snapshot = { ...this.state };
    this.listeners.forEach((l) => l(snapshot));
  }

  public getState(): LiveBikeTelemetry {
    return { ...this.state };
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private async setupFtmsGattServices(device: any): Promise<void> {
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(FTMS_SERVICE_UUID);

    // Subscribe to Indoor Bike Data (0x2AD2)
    const bikeDataChar = await service.getCharacteristic(INDOOR_BIKE_DATA_UUID);
    await bikeDataChar.startNotifications();
    bikeDataChar.addEventListener('characteristicvaluechanged', (event: any) => {
      const dv: DataView = event.target.value;
      const parsed = parseFtmsIndoorBikeData(dv);
      this.ingestTelemetry(parsed);
    });

    // Acquire Fitness Machine Control Point (0x2AD9)
    try {
      this.controlPointChar = await service.getCharacteristic(
        FITNESS_MACHINE_CONTROL_POINT_UUID
      );
      await this.controlPointChar.startNotifications();
      // Request Control (0x00) and Start/Resume (0x07)
      await this.writeControlPoint(new Uint8Array([0x00]));
      await new Promise((r) => setTimeout(r, 180));
      await this.writeControlPoint(new Uint8Array([0x07]));
    } catch (cpErr) {
      console.warn('Control point setup warning:', cpErr);
    }

    this.state.connected = true;
    this.state.reconnecting = false;
    this.state.reconnectAttempt = 0;
    this.state.isSimulator = false;
    this.state.deviceName = device.name || 'Domyos Challenge Bike';
    this.emit();

    // Immediately restore current target load (Watts / Resistance) after (re)connection
    await this.applyTargetLoad(
      this.state.targetPowerWatts,
      this.state.targetResistanceLevel,
      true
    );
  }

  private scheduleAutoReconnect(attempt: number = 1) {
    const maxAttempts = 5;
    if (this.manualDisconnect || !this.bleDevice || attempt > maxAttempts) {
      this.state.connected = false;
      this.state.reconnecting = false;
      this.state.reconnectAttempt = 0;
      this.state.deviceName = 'Rozłączono';
      this.controlPointChar = null;
      this.emit();
      return;
    }

    const delaysMs = [1500, 3000, 5000, 8000, 12000];
    const delay = delaysMs[Math.min(attempt - 1, delaysMs.length - 1)];

    this.state.connected = false;
    this.state.reconnecting = true;
    this.state.reconnectAttempt = attempt;
    this.state.deviceName = `Wznawianie BLE (${attempt}/${maxAttempts})...`;
    this.controlPointChar = null;
    this.emit();

    this.clearReconnectTimer();
    this.reconnectTimer = window.setTimeout(async () => {
      if (this.manualDisconnect || !this.bleDevice) return;
      try {
        await this.setupFtmsGattServices(this.bleDevice);
      } catch (err) {
        console.warn(`BLE auto-reconnect attempt ${attempt} failed:`, err);
        this.scheduleAutoReconnect(attempt + 1);
      }
    }, delay);
  }

  public async connectDomyosBle(): Promise<{ ok: boolean; message: string }> {
    const nav = navigator as any;
    if (!nav.bluetooth) {
      return {
        ok: false,
        message: 'Twoja przeglądarka nie obsługuje Web Bluetooth. Użyj Chrome na Androidzie/PC lub włącz Symulator.',
      };
    }

    try {
      this.stopSimulator();
      this.manualDisconnect = false;
      this.clearReconnectTimer();

      const device = await nav.bluetooth.requestDevice({
        filters: [{ services: [FTMS_SERVICE_UUID] }],
        optionalServices: [FTMS_SERVICE_UUID, CYCLING_POWER_SERVICE_UUID, 0x180d],
      });

      this.bleDevice = device;
      device.addEventListener('gattserverdisconnected', () => {
        if (this.manualDisconnect) {
          this.state.connected = false;
          this.state.reconnecting = false;
          this.state.reconnectAttempt = 0;
          this.state.deviceName = 'Rozłączono';
          this.controlPointChar = null;
          this.emit();
          return;
        }
        // Unexpected GATT drop during workout — initiate automatic reconnection loop
        this.scheduleAutoReconnect(1);
      });

      await this.setupFtmsGattServices(device);

      return { ok: true, message: `Połączono z ${this.state.deviceName}` };
    } catch (err: any) {
      return {
        ok: false,
        message: err?.message || 'Anulowano lub nie udało się połączyć z rowerem FTMS.',
      };
    }
  }

  public async connectExternalPowerMeter(): Promise<{ ok: boolean; message: string }> {
    const nav = navigator as any;
    if (!nav.bluetooth) {
      return { ok: false, message: 'Brak obsługi Web Bluetooth w tej przeglądarce.' };
    }

    try {
      const device = await nav.bluetooth.requestDevice({
        filters: [{ services: [CYCLING_POWER_SERVICE_UUID] }],
      });
      this.extPowerDevice = device;

      const connectExtPowerGatt = async () => {
        const server = await device.gatt.connect();
        const service = await server.getPrimaryService(CYCLING_POWER_SERVICE_UUID);
        const powerChar = await service.getCharacteristic(CYCLING_POWER_MEASUREMENT_UUID);
        await powerChar.startNotifications();
        powerChar.addEventListener('characteristicvaluechanged', (event: any) => {
          const dv: DataView = event.target.value;
          if (dv.byteLength >= 4) {
            const extWatts = Math.max(0, dv.getInt16(2, true));
            this.state.externalPowerWatts = extWatts;
            // Auto Power Match: gently adjust offset between External Power Meter and Domyos internal sensor
            const diff = this.state.targetPowerWatts - extWatts;
            this.state.powerMatchOffsetWatts = Math.max(
              -50,
              Math.min(50, Math.round(this.state.powerMatchOffsetWatts * 0.7 + diff * 0.3))
            );
            this.emit();
          }
        });
        this.state.externalPowerConnected = true;
        this.state.externalPowerDeviceName = device.name || 'Miernik Mocy BLE';
        this.emit();
      };

      device.addEventListener('gattserverdisconnected', () => {
        if (this.manualDisconnect) {
          this.state.externalPowerConnected = false;
          this.state.externalPowerDeviceName = '';
          this.state.externalPowerWatts = null;
          this.state.powerMatchOffsetWatts = 0;
          this.emit();
          return;
        }
        // Try silent auto-reconnect for external power meter
        window.setTimeout(() => {
          if (!this.manualDisconnect && this.extPowerDevice) {
            connectExtPowerGatt().catch(() => {
              this.state.externalPowerConnected = false;
              this.state.externalPowerDeviceName = '';
              this.state.externalPowerWatts = null;
              this.state.powerMatchOffsetWatts = 0;
              this.emit();
            });
          }
        }, 2000);
      });

      await connectExtPowerGatt();
      return { ok: true, message: `Zewnętrzny pomiar mocy aktywny (${this.state.externalPowerDeviceName})` };
    } catch (err: any) {
      return { ok: false, message: err?.message || 'Nie połączono zewnętrznego miernika mocy.' };
    }
  }

  public startSimulator() {
    this.disconnectBle();
    this.manualDisconnect = false;
    this.state.connected = true;
    this.state.reconnecting = false;
    this.state.reconnectAttempt = 0;
    this.state.isSimulator = true;
    this.state.deviceName = 'Domyos Challenge Bike (Symulator FTMS)';
    this.state.heartRateBpm = 118;
    this.state.cadenceRpm = 88;
    this.emit();

    if (this.simInterval) window.clearInterval(this.simInterval);
    this.simInterval = window.setInterval(() => {
      const targetW =
        this.state.controlMode === 'erg_watts'
          ? this.state.targetPowerWatts
          : Math.round(this.state.targetResistanceLevel * 10.5);

      const noise = Math.round((Math.random() - 0.5) * 6);
      const simulatedPower = Math.max(40, Math.round(this.state.powerWatts * 0.35 + targetW * 0.65 + noise));
      const simulatedCadence = Math.max(65, Math.min(110, 88 + Math.round((simulatedPower - 150) / 18) + Math.round((Math.random() - 0.5) * 3)));
      const targetHr = Math.min(192, Math.max(95, 92 + Math.round(simulatedPower * 0.36)));
      const simulatedHr = Math.round(this.state.heartRateBpm + (targetHr - this.state.heartRateBpm) * 0.08);
      const speedKmh = Number((Math.pow(simulatedPower, 0.38) * 4.8).toFixed(1));
      const deltaMeters = speedKmh / 3.6;

      this.ingestTelemetry({
        powerWatts: simulatedPower,
        cadenceRpm: simulatedCadence,
        heartRateBpm: simulatedHr,
        speedKmh,
        distanceMeters: this.state.distanceMeters + deltaMeters,
        resistanceLevel: this.state.targetResistanceLevel,
      });
    }, 1000);
  }

  public stopSimulator() {
    if (this.simInterval) {
      window.clearInterval(this.simInterval);
      this.simInterval = null;
    }
  }

  public disconnectBle() {
    this.manualDisconnect = true;
    this.clearReconnectTimer();
    this.stopSimulator();
    try {
      if (this.bleDevice?.gatt?.connected) {
        this.bleDevice.gatt.disconnect();
      }
      if (this.extPowerDevice?.gatt?.connected) {
        this.extPowerDevice.gatt.disconnect();
      }
    } catch {
      // ignore
    }
    this.state.connected = false;
    this.state.reconnecting = false;
    this.state.reconnectAttempt = 0;
    this.state.isSimulator = false;
    this.state.deviceName = 'Brak połączenia';
    this.controlPointChar = null;
    this.emit();
  }

  private ingestTelemetry(parsed: {
    speedKmh?: number;
    cadenceRpm?: number;
    distanceMeters?: number;
    resistanceLevel?: number;
    powerWatts?: number;
    heartRateBpm?: number;
  }) {
    if (parsed.powerWatts !== undefined) {
      // If external power meter is connected, use its live value as primary power display
      const effectiveWatts =
        this.state.externalPowerConnected && this.state.externalPowerWatts !== null
          ? this.state.externalPowerWatts
          : parsed.powerWatts;

      this.state.powerWatts = effectiveWatts;
      this.recentPowers.push(effectiveWatts);
      if (this.recentPowers.length > 3) this.recentPowers.shift();
      const sum = this.recentPowers.reduce((a, b) => a + b, 0);
      this.state.power3sAvgWatts = Math.round(sum / this.recentPowers.length);
    }

    if (parsed.heartRateBpm !== undefined && parsed.heartRateBpm > 0) {
      this.state.heartRateBpm = parsed.heartRateBpm;
    }
    if (parsed.cadenceRpm !== undefined) {
      this.state.cadenceRpm = parsed.cadenceRpm;
    }
    if (parsed.speedKmh !== undefined) {
      this.state.speedKmh = parsed.speedKmh;
    } else if (this.state.powerWatts > 0) {
      // Fallback speed estimation if bike packet omits speed flag
      this.state.speedKmh = Number((Math.pow(this.state.powerWatts, 0.38) * 4.8).toFixed(1));
    }

    if (parsed.distanceMeters !== undefined && parsed.distanceMeters > 0) {
      this.state.distanceMeters = parsed.distanceMeters;
    } else {
      this.state.distanceMeters += this.state.speedKmh / 3.6;
    }

    if (parsed.resistanceLevel !== undefined) {
      this.state.resistanceLevel = parsed.resistanceLevel;
    }

    this.emit();
  }

  public setControlMode(mode: ControlMode) {
    this.state.controlMode = mode;
    this.emit();
    this.applyTargetLoad(this.state.targetPowerWatts, this.state.targetResistanceLevel, true);
  }

  public setBiasPercent(biasPercent: number) {
    this.state.biasPercent = Math.max(70, Math.min(130, biasPercent));
    this.emit();
  }

  public setManualResistanceLevel(level: number) {
    const clamped = Math.max(1, Math.min(32, level));
    this.state.targetResistanceLevel = clamped;
    this.state.controlMode = 'resistance_level';
    this.emit();
    this.applyTargetLoad(this.state.targetPowerWatts, clamped, true);
  }

  /**
   * Sends FTMS Target Power (0x05) or Target Resistance Level (0x04) to Domyos Challenge Bike.
   * Includes smart hysteresis (>= 2W or >= 1.2s) to ensure smooth ramps without flooding BLE GATT.
   */
  public async applyTargetLoad(
    targetWatts: number,
    targetResistanceLevel: number,
    forceSend: boolean = false
  ): Promise<void> {
    const matchedWatts = Math.max(
      30,
      Math.min(1200, Math.round(targetWatts + this.state.powerMatchOffsetWatts))
    );
    const clampedRes = Math.max(1, Math.min(32, Math.round(targetResistanceLevel)));

    this.state.targetPowerWatts = Math.round(targetWatts);
    this.state.targetResistanceLevel = clampedRes;
    this.emit();

    if (!this.controlPointChar) return;

    const now = Date.now();
    if (!forceSend && now - this.lastCommandTimeMs < 1100) {
      return;
    }

    if (this.state.controlMode === 'erg_watts') {
      if (!forceSend && Math.abs(matchedWatts - this.lastSentWatts) < 2) {
        return;
      }
      // FTMS Opcode 0x05: Set Target Power (Sint16 LE in Watts)
      const payload = new Uint8Array(3);
      payload[0] = 0x05;
      payload[1] = matchedWatts & 0xff;
      payload[2] = (matchedWatts >> 8) & 0xff;
      await this.writeControlPoint(payload);
      this.lastSentWatts = matchedWatts;
      this.lastCommandTimeMs = now;
    } else {
      if (!forceSend && clampedRes === this.lastSentRes) {
        return;
      }
      // FTMS Opcode 0x04: Set Target Resistance Level (Uint8, Domyos scale)
      const payload = new Uint8Array(2);
      payload[0] = 0x04;
      payload[1] = clampedRes & 0xff;
      await this.writeControlPoint(payload);
      this.lastSentRes = clampedRes;
      this.lastCommandTimeMs = now;
    }
  }

  private async writeControlPoint(bytes: Uint8Array): Promise<void> {
    if (!this.controlPointChar) return;
    try {
      if (this.controlPointChar.writeValueWithResponse) {
        await this.controlPointChar.writeValueWithResponse(bytes);
      } else {
        await this.controlPointChar.writeValue(bytes);
      }
    } catch (err) {
      console.warn('FTMS write warning:', err);
    }
  }
}

export const ftmsController = new FtmsBikeController();
