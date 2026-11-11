import {
  BleRawPacketSample,
  ControlMode,
  DiscoveredBleServiceInfo,
  HrSourceType,
  LiveBikeTelemetry,
} from '../types/cycling';
import {
  recordPrivateAuditLog,
  syncPrivateAuditLogsWithFirestore,
} from './securityAndAuditLogger';
import { calculate700cWheelSpeedAndDistance } from './rampAndPhysiologyEngine';


const FTMS_SERVICE_UUID = 0x1826;
const INDOOR_BIKE_DATA_UUID = 0x2ad2;
const FITNESS_MACHINE_CONTROL_POINT_UUID = 0x2ad9;
const FITNESS_MACHINE_STATUS_UUID = 0x2ada;

const CYCLING_POWER_SERVICE_UUID = 0x1818;
const CYCLING_POWER_MEASUREMENT_UUID = 0x2a63;

const HEART_RATE_SERVICE_UUID = 0x180d;
const HEART_RATE_MEASUREMENT_UUID = 0x2a37;

const LS_CUSTOM_HR_OFFSET_KEY = 'domyos_hub_custom_hr_offset_v1';

type TelemetryListener = (telemetry: LiveBikeTelemetry) => void;
type SnifferListener = () => void;

export interface ParsedFtmsPacketResult {
  speedKmh?: number;
  cadenceRpm?: number;
  distanceMeters?: number;
  resistanceLevel?: number;
  powerWatts?: number;
  heartRateBpm?: number;
  hrSourceUsed?: HrSourceType;
  hrByteIndexUsed?: number;
  flagsUint16?: number;
  activeFlagNames?: string[];
  detectedHrCandidates?: { byteIndex: number; valueBpm: number; reason: string }[];
}

export function decodeFtmsIndoorBikeFlags(flags: number): string[] {
  const names: string[] = [];
  if ((flags & 0x0001) === 0) names.push('Bit0=SpeedPresent(0)');
  else names.push('Bit0=MoreData(1)');
  if (flags & 0x0002) names.push('Bit1=AvgSpeed');
  if (flags & 0x0004) names.push('Bit2=Cadence');
  if (flags & 0x0008) names.push('Bit3=AvgCadence');
  if (flags & 0x0010) names.push('Bit4=TotalDistance');
  if (flags & 0x0020) names.push('Bit5=ResistanceLevel');
  if (flags & 0x0040) names.push('Bit6=InstantPower');
  if (flags & 0x0080) names.push('Bit7=AvgPower');
  if (flags & 0x0100) names.push('Bit8=ExpendedEnergy');
  if (flags & 0x0200) names.push('Bit9=HeartRate');
  if (flags & 0x0400) names.push('Bit10=MetabolicEq');
  if (flags & 0x0800) names.push('Bit11=ElapsedTime');
  if (flags & 0x1000) names.push('Bit12=RemainingTime');
  return names;
}

/**
 * Parses standard BLE Heart Rate Measurement (0x2A37) packet.
 * Supports both uint8 (Bit 0 = 0) and uint16 LE (Bit 0 = 1) BPM formats.
 */
export function parseBleHeartRateMeasurement(data: DataView): number | null {
  if (data.byteLength < 2) return null;
  const flags = data.getUint8(0);
  const isUint16 = (flags & 0x01) !== 0;
  if (isUint16) {
    if (data.byteLength < 3) return null;
    const bpm = data.getUint16(1, true);
    return bpm >= 30 && bpm <= 245 ? bpm : null;
  }
  const bpm = data.getUint8(1);
  return bpm >= 30 && bpm <= 245 ? bpm : null;
}

/**
 * Parses Bluetooth SIG FTMS Indoor Bike Data (0x2AD2) binary packet.
 * Includes adaptive multi-offset HR recovery for Domyos / ChangYow FTMS consoles
 * (which may encode Resistance Level as 1 byte or shift HR before Elapsed Time)
 * as well as support for user-pinned custom byte offset from the Live BLE Sniffer.
 */
export function parseFtmsIndoorBikeData(
  data: DataView,
  customHrByteOffset: number | null = null
): ParsedFtmsPacketResult {
  if (data.byteLength < 2) return {};
  const flags = data.getUint16(0, true);
  const activeFlagNames = decodeFtmsIndoorBikeFlags(flags);
  let offset = 2;

  const result: ParsedFtmsPacketResult = {
    flagsUint16: flags,
    activeFlagNames,
    detectedHrCandidates: [],
  };

  const consumedOffsets = new Set<number>([0, 1]);
  const markConsumed = (start: number, len: number) => {
    for (let i = start; i < start + len; i++) consumedOffsets.add(i);
  };

  // Bit 0: More Data (0 = Instantaneous Speed IS present!)
  const moreData = (flags & 0x0001) !== 0;
  if (!moreData && offset + 2 <= data.byteLength) {
    const rawSpeed = data.getUint16(offset, true);
    result.speedKmh = Number((rawSpeed * 0.01).toFixed(1));
    markConsumed(offset, 2);
    offset += 2;
  }

  // Bit 1: Average Speed Present
  if ((flags & 0x0002) !== 0 && offset + 2 <= data.byteLength) {
    markConsumed(offset, 2);
    offset += 2;
  }

  // Bit 2: Instantaneous Cadence Present (0.5 rpm resolution)
  if ((flags & 0x0004) !== 0 && offset + 2 <= data.byteLength) {
    const rawCadence = data.getUint16(offset, true);
    result.cadenceRpm = Math.round(rawCadence * 0.5);
    markConsumed(offset, 2);
    offset += 2;
  }

  // Bit 3: Average Cadence Present
  if ((flags & 0x0008) !== 0 && offset + 2 <= data.byteLength) {
    markConsumed(offset, 2);
    offset += 2;
  }

  // Bit 4: Total Distance Present (uint24, 3 bytes in meters)
  if ((flags & 0x0010) !== 0 && offset + 3 <= data.byteLength) {
    const d0 = data.getUint8(offset);
    const d1 = data.getUint8(offset + 1);
    const d2 = data.getUint8(offset + 2);
    result.distanceMeters = d0 | (d1 << 8) | (d2 << 16);
    markConsumed(offset, 3);
    offset += 3;
  }

  // Bit 5: Resistance Level Present (standard sint16 = 2 bytes; some Domyos firmwares use 1 byte)
  if ((flags & 0x0020) !== 0 && offset + 2 <= data.byteLength) {
    const rawRes = data.getInt16(offset, true);
    result.resistanceLevel = Math.max(
      1,
      Math.min(32, Math.round(rawRes > 32 ? rawRes / 10 : rawRes))
    );
    markConsumed(offset, 2);
    offset += 2;
  }

  // Bit 6: Instantaneous Power Present (sint16 in Watts)
  if ((flags & 0x0040) !== 0 && offset + 2 <= data.byteLength) {
    const rawPower = data.getInt16(offset, true);
    result.powerWatts = Math.max(0, rawPower);
    markConsumed(offset, 2);
    offset += 2;
  }

  // Bit 7: Average Power Present
  if ((flags & 0x0080) !== 0 && offset + 2 <= data.byteLength) {
    markConsumed(offset, 2);
    offset += 2;
  }

  // Bit 8: Expended Energy Present (Total uint16 + Per Hour uint16 + Per Minute uint8 = 5 bytes)
  if ((flags & 0x0100) !== 0) {
    if (offset + 5 <= data.byteLength) {
      offset += 5;
    } else if (offset + 2 <= data.byteLength) {
      // Some non-compliant FTMS consoles only send 2 bytes (Total Kcal uint16) for Expended Energy
      offset += 2;
    }
  }

  const standardHrOffset = offset;

  // 1. Check standard Bit 9: Heart Rate Present (uint8 BPM)
  if ((flags & 0x0200) !== 0) {
    if (standardHrOffset < data.byteLength) {
      const stdHr = data.getUint8(standardHrOffset);
      if (stdHr >= 35 && stdHr <= 240) {
        result.heartRateBpm = stdHr;
        result.hrSourceUsed = 'bike_ftms';
        result.hrByteIndexUsed = standardHrOffset;
        result.detectedHrCandidates?.push({
          byteIndex: standardHrOffset,
          valueBpm: stdHr,
          reason: 'FTMS Bit 9 (Standardowy offset)',
        });
      }
    }

    // Fallback A: If standard offset was 0 or out of bounds (e.g. Resistance Level was 1 byte or Expended Energy was 2/3 bytes)
    if (!result.heartRateBpm) {
      const fallbackOffsets: { idx: number; reason: string }[] = [];
      if (standardHrOffset - 1 >= 2 && standardHrOffset - 1 < data.byteLength) {
        fallbackOffsets.push({
          idx: standardHrOffset - 1,
          reason: 'FTMS Bit 9 (Korekta -1B: 1-bajtowy opór Domyos)',
        });
      }
      if (standardHrOffset - 3 >= 2 && standardHrOffset - 3 < data.byteLength) {
        fallbackOffsets.push({
          idx: standardHrOffset - 3,
          reason: 'FTMS Bit 9 (Korekta -3B: skrócone Kcal)',
        });
      }
      // Also check trailing HR slot right before Elapsed Time (2B) / Remaining Time (2B) / Metabolic Eq (1B)
      let tailOffset = data.byteLength;
      if ((flags & 0x1000) !== 0) tailOffset -= 2;
      if ((flags & 0x0800) !== 0) tailOffset -= 2;
      if ((flags & 0x0400) !== 0) tailOffset -= 1;
      const tailHrIdx = tailOffset - 1;
      if (tailHrIdx >= 2 && tailHrIdx < data.byteLength) {
        fallbackOffsets.push({
          idx: tailHrIdx,
          reason: 'FTMS Bit 9 (Slot przed ElapsedTime)',
        });
      }

      for (const cand of fallbackOffsets) {
        if (consumedOffsets.has(cand.idx)) continue;
        const val = data.getUint8(cand.idx);
        if (val >= 40 && val <= 235) {
          result.heartRateBpm = val;
          result.hrSourceUsed = 'bike_ftms';
          result.hrByteIndexUsed = cand.idx;
          result.detectedHrCandidates?.push({
            byteIndex: cand.idx,
            valueBpm: val,
            reason: cand.reason,
          });
          break;
        }
      }
    }
  }

  // 2. Scan remaining unconsumed bytes for plausible HR candidates (42..225 BPM) for the Sniffer UI
  for (let i = 2; i < data.byteLength; i++) {
    if (consumedOffsets.has(i)) continue;
    const val = data.getUint8(i);
    if (val >= 42 && val <= 225) {
      const alreadyListed = result.detectedHrCandidates?.some(
        (c) => c.byteIndex === i
      );
      if (!alreadyListed) {
        result.detectedHrCandidates?.push({
          byteIndex: i,
          valueBpm: val,
          reason:
            moreData
              ? `Druga ramka FTMS (MoreData=1), Bajt [${i}]`
              : `Wolny bajt [${i}] w zakresie tętna (42-225 BPM)`,
        });
      }
    }
  }

  // 3. If the bike sends a split second packet (MoreData=1, Bit 0 = 1) where HR is placed even if Bit 9 is quirks-encoded
  if (!result.heartRateBpm && moreData && data.byteLength >= 3) {
    for (let i = 2; i < data.byteLength; i++) {
      const val = data.getUint8(i);
      if (val >= 45 && val <= 225) {
        result.heartRateBpm = val;
        result.hrSourceUsed = 'bike_ftms';
        result.hrByteIndexUsed = i;
        break;
      }
    }
  }

  // 4. Highest priority inside 0x2AD2: User-pinned Custom Byte Offset from Sniffer
  if (
    customHrByteOffset !== null &&
    customHrByteOffset >= 0 &&
    customHrByteOffset < data.byteLength
  ) {
    const pinnedVal = data.getUint8(customHrByteOffset);
    if (pinnedVal >= 30 && pinnedVal <= 245) {
      result.heartRateBpm = pinnedVal;
      result.hrSourceUsed = 'custom_byte_offset';
      result.hrByteIndexUsed = customHrByteOffset;
    }
  }

  return result;
}

function loadSavedCustomHrOffset(): number | null {
  try {
    const raw = localStorage.getItem(LS_CUSTOM_HR_OFFSET_KEY);
    if (raw === null || raw === '') return null;
    const num = Number(raw);
    return Number.isInteger(num) && num >= 0 && num <= 64 ? num : null;
  } catch {
    return null;
  }
}

function formatDataViewToHex(dv: DataView): {
  hexString: string;
  uint8Values: number[];
  int16LeValues: { offset: number; value: number }[];
} {
  const uint8Values: number[] = [];
  const hexParts: string[] = [];
  for (let i = 0; i < dv.byteLength; i++) {
    const b = dv.getUint8(i);
    uint8Values.push(b);
    hexParts.push(b.toString(16).toUpperCase().padStart(2, '0'));
  }
  const int16LeValues: { offset: number; value: number }[] = [];
  for (let i = 0; i + 1 < dv.byteLength; i += 2) {
    int16LeValues.push({
      offset: i,
      value: dv.getInt16(i, true),
    });
  }
  return {
    hexString: hexParts.join(' '),
    uint8Values,
    int16LeValues,
  };
}

function getKnownCharacteristicName(uuid: string): string {
  const u = uuid.toLowerCase();
  if (u.includes('2ad2')) return 'FTMS Indoor Bike Data (0x2AD2)';
  if (u.includes('2ad9')) return 'FTMS Control Point (0x2AD9)';
  if (u.includes('2ada')) return 'FTMS Machine Status (0x2ADA)';
  if (u.includes('2ad3')) return 'FTMS Training Status (0x2AD3)';
  if (u.includes('2a37')) return 'Heart Rate Measurement (0x2A37)';
  if (u.includes('2a63')) return 'Cycling Power Measurement (0x2A63)';
  return `BLE Characteristic (${uuid})`;
}

function getKnownServiceName(uuid: string): string {
  const u = uuid.toLowerCase();
  if (u.includes('1826')) return 'Fitness Machine Service (0x1826)';
  if (u.includes('180d')) return 'Heart Rate Service (0x180D)';
  if (u.includes('1818')) return 'Cycling Power Service (0x1818)';
  if (u.includes('180a')) return 'Device Information (0x180A)';
  if (u.includes('180f')) return 'Battery Service (0x180F)';
  return `GATT Service (${uuid})`;
}

export class FtmsBikeController {
  private listeners: Set<TelemetryListener> = new Set();
  private snifferListeners: Set<SnifferListener> = new Set();
  private controlPointChar: any = null;
  private bleDevice: any = null;
  private extPowerDevice: any = null;
  private extHrDevice: any = null;
  private simInterval: number | null = null;
  private hrStalenessInterval: number | null = null;
  private lastHrReceivedMs: number = 0;
  private recentPowers: number[] = [];
  private lastSentWatts: number = -1;
  private lastSentRes: number = -1;
  private lastCommandTimeMs: number = 0;
  private manualDisconnect: boolean = false;
  private manualExtHrDisconnect: boolean = false;
  private reconnectTimer: number | null = null;

  // Sniffer & Diagnostic State
  private rawPacketSamples: BleRawPacketSample[] = [];
  private discoveredServices: DiscoveredBleServiceInfo[] = [];
  private snifferPaused: boolean = false;
  private totalPacketsReceived: number = 0;

  private state: LiveBikeTelemetry = {
    connected: false,
    reconnecting: false,
    reconnectAttempt: 0,
    deviceName: 'Brak połączenia',
    isSimulator: false,
    externalPowerConnected: false,
    externalPowerDeviceName: '',
    externalHrConnected: false,
    externalHrDeviceName: '',
    hrSource: 'none',
    customHrByteOffset: loadSavedCustomHrOffset(),
    lastRawBikeHex: '',
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

  constructor() {
    // Watchdog: if not in simulator and no valid HR packet has arrived in 10 seconds, clear stale HR to 0
    if (typeof window !== 'undefined') {
      this.hrStalenessInterval = window.setInterval(() => {
        if (
          !this.state.isSimulator &&
          this.state.heartRateBpm > 0 &&
          this.lastHrReceivedMs > 0 &&
          Date.now() - this.lastHrReceivedMs > 10000
        ) {
          this.state.heartRateBpm = 0;
          if (!this.state.externalHrConnected) {
            this.state.hrSource = 'none';
          }
          this.emit();
        }
      }, 2500);
    }
  }

  public subscribe(listener: TelemetryListener): () => void {
    this.listeners.add(listener);
    listener({ ...this.state });
    return () => {
      this.listeners.delete(listener);
    };
  }

  public subscribeSniffer(listener: SnifferListener): () => void {
    this.snifferListeners.add(listener);
    return () => {
      this.snifferListeners.delete(listener);
    };
  }

  private emit() {
    const snapshot = { ...this.state };
    this.listeners.forEach((l) => l(snapshot));
  }

  private emitSniffer() {
    this.snifferListeners.forEach((l) => l());
  }

  public getState(): LiveBikeTelemetry {
    return { ...this.state };
  }

  public getSnifferSnapshot(): {
    samples: BleRawPacketSample[];
    discoveredServices: DiscoveredBleServiceInfo[];
    snifferPaused: boolean;
    totalPacketsReceived: number;
    customHrByteOffset: number | null;
    hrSource: HrSourceType;
    externalHrConnected: boolean;
    externalHrDeviceName: string;
  } {
    return {
      samples: this.rawPacketSamples,
      discoveredServices: this.discoveredServices,
      snifferPaused: this.snifferPaused,
      totalPacketsReceived: this.totalPacketsReceived,
      customHrByteOffset: this.state.customHrByteOffset ?? null,
      hrSource: this.state.hrSource || 'none',
      externalHrConnected: Boolean(this.state.externalHrConnected),
      externalHrDeviceName: this.state.externalHrDeviceName || '',
    };
  }

  public setSnifferPaused(paused: boolean) {
    this.snifferPaused = paused;
    this.emitSniffer();
  }

  public clearSnifferSamples() {
    this.rawPacketSamples = [];
    this.emitSniffer();
  }

  public setCustomHrByteOffset(byteOffset: number | null) {
    const sanitized =
      byteOffset !== null && Number.isInteger(byteOffset) && byteOffset >= 0
        ? byteOffset
        : null;
    this.state.customHrByteOffset = sanitized;
    try {
      if (sanitized === null) {
        localStorage.removeItem(LS_CUSTOM_HR_OFFSET_KEY);
      } else {
        localStorage.setItem(LS_CUSTOM_HR_OFFSET_KEY, String(sanitized));
      }
    } catch {
      // ignore
    }

    // Immediately re-evaluate latest 0x2AD2 sample if present so the user sees instant feedback
    const latest2ad2 = this.rawPacketSamples.find((s) =>
      s.characteristicUuid.toLowerCase().includes('2ad2')
    );
    if (latest2ad2 && sanitized !== null && sanitized < latest2ad2.uint8Values.length) {
      const candidateBpm = latest2ad2.uint8Values[sanitized];
      if (candidateBpm >= 30 && candidateBpm <= 245) {
        this.state.heartRateBpm = candidateBpm;
        this.state.hrSource = 'custom_byte_offset';
        this.lastHrReceivedMs = Date.now();
      }
    } else if (sanitized === null && !this.state.externalHrConnected) {
      this.hrRateResetCheck();
    }

    this.emit();
    this.emitSniffer();
  }

  private recordRawPacketSample(params: {
    characteristicUuid: string;
    dv: DataView;
    flagsUint16: number | null;
    activeFlagNames: string[];
    parsedSummary: string;
    detectedHrCandidates?: { byteIndex: number; valueBpm: number; reason: string }[];
  }) {
    this.totalPacketsReceived += 1;
    const { hexString, uint8Values, int16LeValues } = formatDataViewToHex(
      params.dv
    );

    if (params.characteristicUuid.toLowerCase().includes('2ad2')) {
      this.state.lastRawBikeHex = hexString;
    }

    if (this.snifferPaused) return;

    const sample: BleRawPacketSample = {
      id: `pkt_${Date.now()}_${this.totalPacketsReceived}`,
      timestampIso: new Date().toISOString(),
      characteristicUuid: params.characteristicUuid,
      characteristicName: getKnownCharacteristicName(params.characteristicUuid),
      byteLength: params.dv.byteLength,
      flagsUint16: params.flagsUint16,
      flagsHex:
        params.flagsUint16 !== null
          ? `0x${params.flagsUint16.toString(16).toUpperCase().padStart(4, '0')}`
          : '--',
      activeFlagNames: params.activeFlagNames,
      rawBytesHex: hexString,
      uint8Values,
      int16LeValues,
      parsedSummary: params.parsedSummary,
      detectedHrCandidates: params.detectedHrCandidates || [],
    };

    this.rawPacketSamples = [sample, ...this.rawPacketSamples.slice(0, 39)];
    this.emitSniffer();
  }

  public formatSnifferReportText(): string {
    const lines: string[] = [];
    lines.push('=== DOMYOS CYCLING HUB — RAPORT DIAGNOSTYCZNY BLE (HEX SNIFFER) ===');
    lines.push(`Data zrzutu: ${new Date().toISOString()}`);
    lines.push(`Urządzenie główne: ${this.state.deviceName} (Połączono: ${this.state.connected}, Symulator: ${this.state.isSimulator})`);
    lines.push(
      `Zewnętrzny pas HR (0x180D): ${
        this.state.externalHrConnected
          ? `TAK (${this.state.externalHrDeviceName})`
          : 'NIE'
      }`
    );
    lines.push(
      `Aktywne źródło HR: ${this.state.hrSource || 'none'} | Aktualne HR: ${
        this.state.heartRateBpm
      } BPM | Ręczny offset bajtu HR: ${
        this.state.customHrByteOffset !== null &&
        this.state.customHrByteOffset !== undefined
          ? `Bajt [${this.state.customHrByteOffset}]`
          : 'Auto'
      }`
    );
    lines.push(
      `Aktualna telemetria: Moc=${this.state.powerWatts}W, Kadencja=${this.state.cadenceRpm}RPM, Opór=${this.state.resistanceLevel}/32`
    );
    lines.push('');
    lines.push('--- WYKRYTE USŁUGI I CHARAKTERYSTYKI GATT ROWERU ---');
    if (this.discoveredServices.length === 0) {
      lines.push('(Brak zapisanych usług GATT lub rower niepołączony)');
    } else {
      for (const svc of this.discoveredServices) {
        lines.push(`* Usługa: ${svc.serviceName} [${svc.serviceUuid}]`);
        for (const ch of svc.characteristics) {
          lines.push(
            `    - Char: ${ch.name} [${ch.uuid}] props=(${ch.properties.join(
              ','
            )}) sub=${ch.subscribed ? 'TAK' : 'NIE'}`
          );
        }
      }
    }
    lines.push('');
    lines.push(`--- OSTATNIE RAMKI BLE (${this.rawPacketSamples.length} z ${this.totalPacketsReceived} odebranych) ---`);
    for (const pkt of this.rawPacketSamples.slice(0, 25)) {
      lines.push(
        `[${pkt.timestampIso.slice(11, 23)}] ${pkt.characteristicName} (${
          pkt.byteLength
        }B) Flags=${pkt.flagsHex} [${pkt.activeFlagNames.join(', ')}]`
      );
      lines.push(`  HEX  : ${pkt.rawBytesHex}`);
      lines.push(
        `  UINT8: ${pkt.uint8Values
          .map((v, idx) => `[${idx}]=${v}`)
          .join(' ')}`
      );
      lines.push(`  PARSE: ${pkt.parsedSummary}`);
      if (pkt.detectedHrCandidates.length > 0) {
        lines.push(
          `  KANDYDACI HR: ${pkt.detectedHrCandidates
            .map((c) => `Bajt[${c.byteIndex}]=${c.valueBpm}BPM (${c.reason})`)
            .join(' | ')}`
        );
      }
    }
    return lines.join('\n');
  }

  public async saveSnifferSnapshotToFirebase(): Promise<{
    ok: boolean;
    message: string;
  }> {
    const report = this.formatSnifferReportText();
    recordPrivateAuditLog(
      'INFO',
      'BLE_FTMS',
      `Zrzut Sniffera Ramek BLE (${this.state.deviceName}, HR=${this.state.heartRateBpm} BPM, src=${this.state.hrSource})`,
      report
    );
    try {
      const res = await syncPrivateAuditLogsWithFirestore();
      return {
        ok: true,
        message: `Zapisano pełny raport ramek HEX BLE w pamięci urządzenia i zsynchronizowano z kolekcją /securityAuditLogs w Firebase (${res.uploadedCount} wysłanych wpisów)!`,
      };
    } catch (err) {
      return {
        ok: false,
        message: `Zapisano zrzut ramek BLE w pamięci telefonu (błąd synchronizacji z Firebase: ${
          err instanceof Error ? err.message : String(err)
        })`,
      };
    }
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private lastDistanceIntegrationMs: number = 0;

  public resetRideDistance() {
    this.state.distanceMeters = 0;
    this.lastDistanceIntegrationMs = Date.now();
    this.emit();
  }

  private resetLiveTelemetryOnModeSwitch() {
    this.recentPowers = [];
    this.state.powerWatts = 0;
    this.state.power3sAvgWatts = 0;
    this.state.cadenceRpm = 0;
    this.state.speedKmh = 0;
    this.lastDistanceIntegrationMs = Date.now();
    if (!this.state.externalHrConnected) {
      this.state.heartRateBpm = 0;
      this.state.hrSource = 'none';
      this.lastHrReceivedMs = 0;
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
      const parsed = parseFtmsIndoorBikeData(
        dv,
        this.state.customHrByteOffset ?? null
      );

      const summaryParts: string[] = [];
      if (parsed.powerWatts !== undefined) summaryParts.push(`P=${parsed.powerWatts}W`);
      if (parsed.cadenceRpm !== undefined) summaryParts.push(`Cad=${parsed.cadenceRpm}RPM`);
      if (parsed.speedKmh !== undefined) summaryParts.push(`Spd=${parsed.speedKmh}km/h`);
      if (parsed.resistanceLevel !== undefined) summaryParts.push(`Res=${parsed.resistanceLevel}`);
      if (parsed.heartRateBpm !== undefined) {
        summaryParts.push(
          `HR=${parsed.heartRateBpm}BPM(Bajt[${parsed.hrByteIndexUsed ?? '?'}])`
        );
      } else {
        summaryParts.push('HR=brak');
      }

      this.recordRawPacketSample({
        characteristicUuid: '0x2AD2',
        dv,
        flagsUint16: parsed.flagsUint16 ?? null,
        activeFlagNames: parsed.activeFlagNames || [],
        parsedSummary: summaryParts.join(' · '),
        detectedHrCandidates: parsed.detectedHrCandidates,
      });

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
      recordPrivateAuditLog(
        'WARN',
        'BLE_FTMS',
        'Ostrzeżenie inicjalizacji punktu kontrolnego FTMS 0x2AD9',
        cpErr instanceof Error ? cpErr.message : String(cpErr)
      );
    }

    // Try subscribing to Fitness Machine Status (0x2ADA) for extra diagnostic visibility
    try {
      const statusChar = await service.getCharacteristic(
        FITNESS_MACHINE_STATUS_UUID
      );
      await statusChar.startNotifications();
      statusChar.addEventListener('characteristicvaluechanged', (event: any) => {
        const dv: DataView = event.target.value;
        this.recordRawPacketSample({
          characteristicUuid: '0x2ADA',
          dv,
          flagsUint16: null,
          activeFlagNames: ['MachineStatus'],
          parsedSummary: `Status Opcode=0x${
            dv.byteLength > 0
              ? dv.getUint8(0).toString(16).toUpperCase().padStart(2, '0')
              : '00'
          }`,
        });
      });
    } catch {
      // Optional characteristic
    }

    // Auto-check if the Domyos bike itself exposes a separate GATT Heart Rate Service (0x180D -> 0x2A37)
    try {
      const bikeHrService = await server.getPrimaryService(
        HEART_RATE_SERVICE_UUID
      );
      const bikeHrChar = await bikeHrService.getCharacteristic(
        HEART_RATE_MEASUREMENT_UUID
      );
      await bikeHrChar.startNotifications();
      bikeHrChar.addEventListener('characteristicvaluechanged', (event: any) => {
        const dv: DataView = event.target.value;
        const bpm = parseBleHeartRateMeasurement(dv);
        this.recordRawPacketSample({
          characteristicUuid: '0x2A37 (Rower 0x180D)',
          dv,
          flagsUint16: dv.byteLength > 0 ? dv.getUint8(0) : null,
          activeFlagNames: ['BikeHeartRateService'],
          parsedSummary: bpm ? `HR z usługi 0x180D roweru = ${bpm} BPM` : 'HR=0',
          detectedHrCandidates: bpm
            ? [{ byteIndex: 1, valueBpm: bpm, reason: 'Usługa 0x180D -> 0x2A37 roweru' }]
            : [],
        });

        if (bpm && bpm > 0 && !this.state.externalHrConnected) {
          this.state.heartRateBpm = bpm;
          this.state.hrSource = 'bike_hr_service';
          this.lastHrReceivedMs = Date.now();
          this.emit();
        }
      });
    } catch {
      // Bike does not expose a separate 0x180D service; normal for many FTMS bikes
    }

    // Enumerate all accessible GATT services & characteristics for the Sniffer UI
    try {
      const primaryServices = await server.getPrimaryServices();
      const serviceList: DiscoveredBleServiceInfo[] = [];
      for (const svc of primaryServices) {
        const svcUuid = String(svc.uuid);
        const charEntries: DiscoveredBleServiceInfo['characteristics'] = [];
        try {
          const chars = await svc.getCharacteristics();
          for (const ch of chars) {
            const chUuid = String(ch.uuid);
            const props: string[] = [];
            if (ch.properties?.read) props.push('read');
            if (ch.properties?.write) props.push('write');
            if (ch.properties?.writeWithoutResponse) props.push('writeNoResp');
            if (ch.properties?.notify) props.push('notify');
            if (ch.properties?.indicate) props.push('indicate');

            const isSub =
              chUuid.toLowerCase().includes('2ad2') ||
              chUuid.toLowerCase().includes('2ad9') ||
              chUuid.toLowerCase().includes('2ada') ||
              chUuid.toLowerCase().includes('2a37');

            charEntries.push({
              uuid: chUuid,
              name: getKnownCharacteristicName(chUuid),
              properties: props,
              subscribed: isSub,
            });
          }
        } catch {
          // ignore characteristic enumeration error on restricted service
        }
        serviceList.push({
          serviceUuid: svcUuid,
          serviceName: getKnownServiceName(svcUuid),
          characteristics: charEntries,
        });
      }
      this.discoveredServices = serviceList;
      this.emitSniffer();
    } catch {
      // ignore service enumeration error
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
        recordPrivateAuditLog(
          'WARN',
          'BLE_FTMS',
          `Próba automatycznego wznowienia połączenia BLE (${attempt}) nie powiodła się`,
          err instanceof Error ? err.message : String(err)
        );
        this.scheduleAutoReconnect(attempt + 1);
      }
    }, delay);
  }

  public async connectDomyosBle(): Promise<{ ok: boolean; message: string }> {
    const nav = navigator as any;
    if (!nav.bluetooth) {
      return {
        ok: false,
        message:
          'Twoja przeglądarka nie obsługuje Web Bluetooth. Użyj Chrome na Androidzie/PC lub włącz Symulator.',
      };
    }

    try {
      this.stopSimulator();
      this.resetLiveTelemetryOnModeSwitch();
      this.manualDisconnect = false;
      this.clearReconnectTimer();

      const device = await nav.bluetooth.requestDevice({
        filters: [{ services: [FTMS_SERVICE_UUID] }],
        optionalServices: [
          FTMS_SERVICE_UUID,
          CYCLING_POWER_SERVICE_UUID,
          HEART_RATE_SERVICE_UUID,
          0x180a,
          0x180f,
          0xfff0,
          0xffe0,
        ],
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
        message:
          err?.message || 'Anulowano lub nie udało się połączyć z rowerem FTMS.',
      };
    }
  }

  /**
   * Pairs an external BLE Heart Rate Strap (0x180D -> 0x2A37, e.g., Polar, Garmin, Decathlon, Coospo, Magene)
   * directly to the phone in parallel with the Domyos bike.
   */
  public async connectExternalHeartRateStrap(): Promise<{
    ok: boolean;
    message: string;
  }> {
    const nav = navigator as any;
    if (!nav.bluetooth) {
      return {
        ok: false,
        message: 'Brak obsługi Web Bluetooth w tej przeglądarce.',
      };
    }

    try {
      this.manualExtHrDisconnect = false;
      const device = await nav.bluetooth.requestDevice({
        filters: [{ services: [HEART_RATE_SERVICE_UUID] }],
        optionalServices: [HEART_RATE_SERVICE_UUID, 0x180f],
      });
      this.extHrDevice = device;

      const connectExtHrGatt = async () => {
        const server = await device.gatt.connect();
        const service = await server.getPrimaryService(HEART_RATE_SERVICE_UUID);
        const hrChar = await service.getCharacteristic(
          HEART_RATE_MEASUREMENT_UUID
        );
        await hrChar.startNotifications();
        hrChar.addEventListener('characteristicvaluechanged', (event: any) => {
          const dv: DataView = event.target.value;
          const bpm = parseBleHeartRateMeasurement(dv);

          this.recordRawPacketSample({
            characteristicUuid: '0x2A37 (Pas HR)',
            dv,
            flagsUint16: dv.byteLength > 0 ? dv.getUint8(0) : null,
            activeFlagNames: ['ExternalHeartRateStrap'],
            parsedSummary: bpm
              ? `Pas HR (${device.name || '0x180D'}) = ${bpm} BPM`
              : 'Pas HR = 0 BPM',
            detectedHrCandidates: bpm
              ? [{ byteIndex: 1, valueBpm: bpm, reason: 'Zewnętrzny pas HR 0x180D' }]
              : [],
          });

          if (bpm !== null && bpm > 0) {
            this.state.heartRateBpm = bpm;
            this.state.hrSource = 'external_strap';
            this.lastHrReceivedMs = Date.now();
            this.emit();
          }
        });

        this.state.externalHrConnected = true;
        this.state.externalHrDeviceName = device.name || 'Pas Tętna BLE';
        this.state.hrSource = 'external_strap';
        this.emit();
        this.emitSniffer();
      };

      device.addEventListener('gattserverdisconnected', () => {
        if (this.manualExtHrDisconnect) {
          this.state.externalHrConnected = false;
          this.state.externalHrDeviceName = '';
          this.state.heartRateBpm = 0;
          this.state.hrSource = 'none';
          this.emit();
          this.emitSniffer();
          return;
        }
        // Silent auto-reconnect for external HR strap
        window.setTimeout(() => {
          if (!this.manualExtHrDisconnect && this.extHrDevice) {
            connectExtHrGatt().catch(() => {
              this.state.externalHrConnected = false;
              this.state.externalHrDeviceName = '';
              this.state.heartRateBpm = 0;
              this.state.hrSource = 'none';
              this.emit();
              this.emitSniffer();
            });
          }
        }, 2000);
      });

      await connectExtHrGatt();
      recordPrivateAuditLog(
        'INFO',
        'BLE_FTMS',
        `Połączono zewnętrzny pas tętna BLE 0x180D: ${this.state.externalHrDeviceName}`
      );
      return {
        ok: true,
        message: `Połączono pas tętna BLE: ${this.state.externalHrDeviceName}`,
      };
    } catch (err: any) {
      return {
        ok: false,
        message: err?.message || 'Anulowano parowanie zewnętrznego pasa tętna BLE.',
      };
    }
  }

  public disconnectExternalHeartRateStrap() {
    this.manualExtHrDisconnect = true;
    try {
      if (this.extHrDevice?.gatt?.connected) {
        this.extHrDevice.gatt.disconnect();
      }
    } catch {
      // ignore
    }
    this.extHrDevice = null;
    this.state.externalHrConnected = false;
    this.state.externalHrDeviceName = '';
    this.state.heartRateBpm = 0;
    this.state.hrSource = 'none';
    this.emit();
    this.emitSniffer();
  }

  public async connectExternalPowerMeter(): Promise<{
    ok: boolean;
    message: string;
  }> {
    const nav = navigator as any;
    if (!nav.bluetooth) {
      return {
        ok: false,
        message: 'Brak obsługi Web Bluetooth w tej przeglądarce.',
      };
    }

    try {
      const device = await nav.bluetooth.requestDevice({
        filters: [{ services: [CYCLING_POWER_SERVICE_UUID] }],
      });
      this.extPowerDevice = device;

      const connectExtPowerGatt = async () => {
        const server = await device.gatt.connect();
        const service = await server.getPrimaryService(
          CYCLING_POWER_SERVICE_UUID
        );
        const powerChar = await service.getCharacteristic(
          CYCLING_POWER_MEASUREMENT_UUID
        );
        await powerChar.startNotifications();
        powerChar.addEventListener('characteristicvaluechanged', (event: any) => {
          const dv: DataView = event.target.value;
          if (dv.byteLength >= 4) {
            const extWatts = Math.max(0, dv.getInt16(2, true));
            this.state.externalPowerWatts = extWatts;
            const diff = this.state.targetPowerWatts - extWatts;
            this.state.powerMatchOffsetWatts = Math.max(
              -50,
              Math.min(
                50,
                Math.round(this.state.powerMatchOffsetWatts * 0.7 + diff * 0.3)
              )
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
      return {
        ok: true,
        message: `Zewnętrzny pomiar mocy aktywny (${this.state.externalPowerDeviceName})`,
      };
    } catch (err: any) {
      return {
        ok: false,
        message: err?.message || 'Nie połączono zewnętrznego miernika mocy.',
      };
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
    if (!this.state.externalHrConnected) {
      this.state.heartRateBpm = 118;
      this.state.hrSource = 'simulator';
    }
    this.state.cadenceRpm = 88;
    this.emit();

    if (this.simInterval) window.clearInterval(this.simInterval);
    this.simInterval = window.setInterval(() => {
      const targetW =
        this.state.controlMode === 'erg_watts'
          ? this.state.targetPowerWatts
          : Math.round(this.state.targetResistanceLevel * 10.5);

      const noise = Math.round((Math.random() - 0.5) * 6);
      const simulatedPower = Math.max(
        40,
        Math.round(this.state.powerWatts * 0.35 + targetW * 0.65 + noise)
      );
      const simulatedCadence = Math.max(
        65,
        Math.min(
          110,
          88 +
            Math.round((simulatedPower - 150) / 18) +
            Math.round((Math.random() - 0.5) * 3)
        )
      );
      const targetHr = Math.min(
        192,
        Math.max(95, 92 + Math.round(simulatedPower * 0.36))
      );
      const baseHr = this.state.heartRateBpm > 40 ? this.state.heartRateBpm : 115;
      const simulatedHr = Math.round(baseHr + (targetHr - baseHr) * 0.08);
      const { speedKmh } = calculate700cWheelSpeedAndDistance(simulatedCadence, 1);

      this.ingestTelemetry({
        powerWatts: simulatedPower,
        cadenceRpm: simulatedCadence,
        heartRateBpm: this.state.externalHrConnected
          ? undefined
          : simulatedHr,
        hrSourceUsed: this.state.externalHrConnected
          ? 'external_strap'
          : 'simulator',
        speedKmh,
        resistanceLevel: this.state.targetResistanceLevel,
      });
    }, 1000);
  }

  public stopSimulator() {
    if (this.simInterval) {
      window.clearInterval(this.simInterval);
      this.simInterval = null;
    }
    if (this.state.isSimulator) {
      this.state.isSimulator = false;
      this.resetLiveTelemetryOnModeSwitch();
      this.emit();
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
    this.resetLiveTelemetryOnModeSwitch();
    this.state.connected = false;
    this.state.reconnecting = false;
    this.state.reconnectAttempt = 0;
    this.state.isSimulator = false;
    this.state.deviceName = 'Brak połączenia';
    this.controlPointChar = null;
    this.emit();
  }

  private hrRateResetCheck() {
    if (!this.state.externalHrConnected && !this.state.isSimulator) {
      this.state.heartRateBpm = 0;
      this.state.hrSource = 'none';
    }
  }

  private ingestTelemetry(parsed: ParsedFtmsPacketResult) {
    if (parsed.powerWatts !== undefined) {
      const effectiveWatts =
        this.state.externalPowerConnected &&
        this.state.externalPowerWatts !== null
          ? this.state.externalPowerWatts
          : parsed.powerWatts;

      this.state.powerWatts = effectiveWatts;
      this.recentPowers.push(effectiveWatts);
      if (this.recentPowers.length > 3) this.recentPowers.shift();
      const sum = this.recentPowers.reduce((a, b) => a + b, 0);
      this.state.power3sAvgWatts = Math.round(sum / this.recentPowers.length);
    }

    // Priority 1: Direct External BLE Heart Rate Strap (0x180D) always wins if connected
    if (!this.state.externalHrConnected) {
      if (parsed.heartRateBpm !== undefined && parsed.heartRateBpm > 0) {
        this.state.heartRateBpm = parsed.heartRateBpm;
        this.state.hrSource =
          parsed.hrSourceUsed ||
          (this.state.isSimulator ? 'simulator' : 'bike_ftms');
        this.lastHrReceivedMs = Date.now();
      }
    }

    if (parsed.cadenceRpm !== undefined) {
      this.state.cadenceRpm = parsed.cadenceRpm;
    }

    // Calculate speed (km/h) and distance delta (m) strictly from rotations per second (RPM/60)
    // and standard 700c (28-inch, 2.105m) road wheel circumference multiplied by elapsed time
    const nowMs = Date.now();
    const elapsedSec =
      this.lastDistanceIntegrationMs > 0
        ? Math.min(5, Math.max(0, (nowMs - this.lastDistanceIntegrationMs) / 1000))
        : 0;
    this.lastDistanceIntegrationMs = nowMs;

    const wheelMetrics = calculate700cWheelSpeedAndDistance(
      this.state.cadenceRpm,
      elapsedSec
    );
    this.state.speedKmh = wheelMetrics.speedKmh;
    this.state.distanceMeters = Number(
      (this.state.distanceMeters + wheelMetrics.distanceDeltaMeters).toFixed(2)
    );

    if (parsed.resistanceLevel !== undefined) {
      this.state.resistanceLevel = parsed.resistanceLevel;
    }

    this.emit();
  }

  public setControlMode(mode: ControlMode) {
    this.state.controlMode = mode;
    this.emit();
    this.applyTargetLoad(
      this.state.targetPowerWatts,
      this.state.targetResistanceLevel,
      true
    );
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
    const clampedRes = Math.max(
      1,
      Math.min(32, Math.round(targetResistanceLevel))
    );

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
      recordPrivateAuditLog(
        'WARN',
        'BLE_FTMS',
        'Ostrzeżenie zapisu komendy sterującej FTMS ERG/Opór',
        err instanceof Error ? err.message : String(err)
      );
    }
  }
}

export const ftmsController = new FtmsBikeController();
