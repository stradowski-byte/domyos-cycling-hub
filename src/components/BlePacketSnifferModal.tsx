import React, { useEffect, useState } from 'react';
import {
  Activity,
  Bluetooth,
  Check,
  CloudUpload,
  Copy,
  Cpu,
  Heart,
  Pause,
  Pin,
  Play,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { LiveBikeTelemetry } from '../types/cycling';
import { ftmsController } from '../services/ftmsBluetooth';

interface BlePacketSnifferModalProps {
  isOpen: boolean;
  onClose: () => void;
  telemetry: LiveBikeTelemetry;
  onConnectExternalHrStrap: () => Promise<void>;
  onDisconnectExternalHrStrap: () => void;
  onNotifyToast?: (msg: string) => void;
}

export function getHrSourceBadgeInfo(telemetry: LiveBikeTelemetry): {
  label: string;
  shortLabel: string;
  colorClass: string;
} {
  if (telemetry.externalHrConnected) {
    return {
      label: `Pas BLE 0x180D (${telemetry.externalHrDeviceName || 'Zewnętrzny'})`,
      shortLabel: 'PAS 0x180D',
      colorClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    };
  }
  switch (telemetry.hrSource) {
    case 'custom_byte_offset':
      return {
        label: `Ręczny Bajt #[${telemetry.customHrByteOffset ?? '?'}] (0x2AD2)`,
        shortLabel: `BAJT #[${telemetry.customHrByteOffset ?? '?'}]`,
        colorClass: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
      };
    case 'bike_hr_service':
      return {
        label: 'Usługa GATT 0x180D Roweru',
        shortLabel: 'ROWER 0x180D',
        colorClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      };
    case 'bike_ftms':
      return {
        label: 'Konsola Roweru FTMS (0x2AD2)',
        shortLabel: 'FTMS 0x2AD2',
        colorClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      };
    default:
      return {
        label: 'Brak sygnału HR z roweru',
        shortLabel: 'BRAK HR',
        colorClass: 'bg-slate-800 text-slate-400 border-slate-700',
      };
  }
}

export const BlePacketSnifferModal: React.FC<BlePacketSnifferModalProps> = ({
  isOpen,
  onClose,
  telemetry,
  onConnectExternalHrStrap,
  onDisconnectExternalHrStrap,
  onNotifyToast,
}) => {
  const [snapshot, setSnapshot] = useState(() =>
    ftmsController.getSnifferSnapshot()
  );
  const [copiedHex, setCopiedHex] = useState(false);
  const [isSavingFirebase, setIsSavingFirebase] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setSnapshot(ftmsController.getSnifferSnapshot());
    return ftmsController.subscribeSniffer(() => {
      setSnapshot({ ...ftmsController.getSnifferSnapshot() });
    });
  }, [isOpen]);

  if (!isOpen) return null;

  const latest2ad2Packet =
    snapshot.samples.find((s) =>
      s.characteristicUuid.toLowerCase().includes('2ad2')
    ) || snapshot.samples[0];

  const hrBadge = getHrSourceBadgeInfo(telemetry);

  const handleCopyReport = async () => {
    try {
      const text = ftmsController.formatSnifferReportText();
      await navigator.clipboard.writeText(text);
      setCopiedHex(true);
      onNotifyToast?.(
        'Skopiowano pełny raport ramek HEX BLE do schowka! Możesz wkleić go w czacie.'
      );
      window.setTimeout(() => setCopiedHex(false), 3000);
    } catch {
      onNotifyToast?.('Nie udało się skopiować raportu do schowka.');
    }
  };

  const handleSaveToFirebase = async () => {
    setIsSavingFirebase(true);
    try {
      const res = await ftmsController.saveSnifferSnapshotToFirebase();
      onNotifyToast?.(res.message);
    } finally {
      setIsSavingFirebase(false);
    }
  };

  const handleTogglePinByte = (byteIndex: number) => {
    if (snapshot.customHrByteOffset === byteIndex) {
      ftmsController.setCustomHrByteOffset(null);
      onNotifyToast?.(
        'Przywrócono automatyczny dekoder tętna FTMS (Bit 9 + korekta offsetu).'
      );
    } else {
      ftmsController.setCustomHrByteOffset(byteIndex);
      onNotifyToast?.(
        `Przypięto Bajt [${byteIndex}] z ramki 0x2AD2 jako bezpośrednie źródło tętna (HR)!`
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-2.5 sm:p-4">
      <div className="w-full max-w-3xl max-h-[92dvh] rounded-3xl bg-[#131B26] border border-slate-700 shadow-2xl flex flex-col overflow-hidden">
        {/* HEADER */}
        <div className="px-4 sm:px-6 py-3.5 bg-[#0B0F17] border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-400 shrink-0">
              <Heart className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-extrabold text-white truncate">
                Skaner Ramek BLE (HEX Sniffer) & Dekoder Tętna HR
              </h2>
              <p className="text-[11px] text-slate-400 truncate">
                Podgląd surowych bajtów FTMS 0x2AD2 / 0x180D na żywo + parowanie pasa HR
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* BODY */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs">
          {/* 1. LIVE HR STATUS & DIRECT BLE STRAP PAIRING (0x180D) */}
          <div className="rounded-2xl bg-[#0B0F17] border border-slate-800 p-3.5 sm:p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  1. Aktywne Źródło Tętna (HR)
                </span>
                <span
                  className={`px-2 py-0.5 rounded-md border text-[11px] font-bold ${hrBadge.colorClass}`}
                >
                  {hrBadge.label}
                </span>
              </div>

              <div className="flex items-baseline gap-1.5 font-mono-tabular">
                <span className="text-2xl font-extrabold text-rose-400">
                  {telemetry.heartRateBpm > 0 ? telemetry.heartRateBpm : '--'}
                </span>
                <span className="text-xs font-bold text-slate-400">BPM</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-300 leading-relaxed">
              Jeśli Twój pas tętna jest połączony z konsolą roweru Domyos, poniższy skaner automatycznie szuka bajtu HR w ramce <code className="font-mono-tabular text-emerald-300">0x2AD2</code> oraz w usłudze <code className="font-mono-tabular text-emerald-300">0x180D</code> roweru. Możesz też <strong>sparować pas tętna Bluetooth (Polar, Garmin, Decathlon, Magene, Coospo) bezpośrednio z telefonem</strong> równolegle z rowerem:
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {!telemetry.externalHrConnected ? (
                <button
                  type="button"
                  onClick={onConnectExternalHrStrap}
                  className="min-h-[40px] px-3.5 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-slate-950 font-extrabold text-xs flex items-center gap-2 transition-colors shadow-sm"
                >
                  <Bluetooth className="w-4 h-4 shrink-0" />
                  <span>Sparuj Pas Tętna BLE (0x180D) z Telefonem</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onDisconnectExternalHrStrap}
                  className="min-h-[40px] px-3.5 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/50 text-rose-300 font-bold text-xs flex items-center gap-2 transition-colors"
                >
                  <X className="w-4 h-4 shrink-0" />
                  <span>
                    Rozłącz Zewnętrzny Pas HR ({telemetry.externalHrDeviceName})
                  </span>
                </button>
              )}

              {snapshot.customHrByteOffset !== null && (
                <button
                  type="button"
                  onClick={() => handleTogglePinByte(snapshot.customHrByteOffset!)}
                  className="min-h-[40px] px-3 py-2 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-300 font-bold text-xs flex items-center gap-1.5 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    Wyłącz ręczny Bajt #[{snapshot.customHrByteOffset}] (Wróć do Auto)
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* 2. INTERACTIVE BYTE INSPECTOR FOR LATEST 0x2AD2 PACKET */}
          <div className="rounded-2xl bg-[#0B0F17] border border-slate-800 p-3.5 sm:p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Cpu className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    2. Inspektor Bajtów Ramki Roweru na Żywo (Stuknij bajt, aby przypiąć jako HR)
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Widzisz poniżej każdy bajt odbierany z roweru w czasie rzeczywistym. Bajty w zakresie <strong className="text-rose-300">42–225</strong> (potencjalne tętno BPM) są podświetlone. Stuknij dowolny kafel <code className="font-mono-tabular">[Bajt #]</code>, aby wymusić pobieranie HR z tego bajtu!
                </p>
              </div>
              {latest2ad2Packet && (
                <span className="font-mono-tabular text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-lg">
                  Flagi: {latest2ad2Packet.flagsHex} ({latest2ad2Packet.byteLength} B)
                </span>
              )}
            </div>

            {!latest2ad2Packet ? (
              <div className="rounded-xl bg-[#131B26] border border-slate-800 p-4 text-center text-slate-400">
                Brak odebranych ramek BLE z roweru. Kliknij <strong>„Połącz Rower”</strong> w Kokpicie i zakręć korbą, aby zobaczyć surowe bajty HEX na żywo.
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5 text-[10px]">
                  {latest2ad2Packet.activeFlagNames.map((flagName) => (
                    <span
                      key={flagName}
                      className={`px-2 py-0.5 rounded-md font-mono-tabular border ${
                        flagName.includes('HeartRate')
                          ? 'bg-rose-500/20 border-rose-500/50 text-rose-300 font-bold'
                          : 'bg-[#131B26] border-slate-800 text-slate-300'
                      }`}
                    >
                      {flagName}
                    </span>
                  ))}
                </div>

                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-1.5 pt-1">
                  {latest2ad2Packet.uint8Values.map((val, idx) => {
                    const isPinned = snapshot.customHrByteOffset === idx;
                    const isCandidate =
                      latest2ad2Packet.detectedHrCandidates.some(
                        (c) => c.byteIndex === idx
                      ) ||
                      (idx >= 2 && val >= 45 && val <= 220);
                    const hexByte = val
                      .toString(16)
                      .toUpperCase()
                      .padStart(2, '0');

                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleTogglePinByte(idx)}
                        className={`p-2 rounded-xl border text-left transition-all flex flex-col justify-between ${
                          isPinned
                            ? 'bg-sky-500/25 border-sky-400 ring-2 ring-sky-400/40'
                            : isCandidate
                            ? 'bg-rose-500/15 border-rose-500/50 hover:bg-rose-500/25'
                            : 'bg-[#131B26] border-slate-800 hover:border-slate-600'
                        }`}
                        title={`Stuknij, aby przypiąć Bajt [${idx}] (wartość dziesiętna: ${val}) jako źródło Tętna HR`}
                      >
                        <div className="flex items-center justify-between gap-1 text-[10px] text-slate-400 font-mono-tabular">
                          <span>B[{idx}]</span>
                          {isPinned ? (
                            <Pin className="w-3 h-3 text-sky-400 shrink-0" />
                          ) : (
                            <span className="text-slate-500">0x{hexByte}</span>
                          )}
                        </div>
                        <div className="font-mono-tabular text-base sm:text-lg font-extrabold text-white mt-0.5">
                          {val}
                        </div>
                        <div className="text-[9px] font-bold truncate mt-0.5">
                          {idx === 0 || idx === 1 ? (
                            <span className="text-amber-400">FLAGI</span>
                          ) : isPinned ? (
                            <span className="text-sky-300">PRZYPIĘTY HR</span>
                          ) : isCandidate ? (
                            <span className="text-rose-300">KANDYDAT BPM?</span>
                          ) : (
                            <span className="text-slate-500">uint8</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {latest2ad2Packet.detectedHrCandidates.length > 0 && (
                  <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-2.5 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] text-rose-200 font-semibold">
                      Wykryto potencjalne bajty tętna w ramce:{' '}
                      {latest2ad2Packet.detectedHrCandidates
                        .map(
                          (c) =>
                            `Bajt [${c.byteIndex}] = ${c.valueBpm} BPM (${c.reason})`
                        )
                        .join(' · ')}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* 3. EXPORT TO CLIPBOARD OR FIREBASE CLOUD */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-[#0B0F17] border border-slate-800 rounded-2xl p-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCopyReport}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 transition-colors"
              >
                {copiedHex ? (
                  <Check className="w-4 h-4 shrink-0" />
                ) : (
                  <Copy className="w-4 h-4 shrink-0" />
                )}
                <span>
                  {copiedHex
                    ? 'Skopiowano Raport HEX!'
                    : 'Kopiuj Raport HEX do Schowka'}
                </span>
              </button>

              <button
                type="button"
                onClick={handleSaveToFirebase}
                disabled={isSavingFirebase}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-300 font-bold text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <CloudUpload className="w-4 h-4 shrink-0" />
                <span>
                  {isSavingFirebase
                    ? 'Zapisywanie w Firebase...'
                    : 'Zapisz Próbki HEX w Firebase'}
                </span>
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  ftmsController.setSnifferPaused(!snapshot.snifferPaused)
                }
                className={`min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 ${
                  snapshot.snifferPaused
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                    : 'bg-slate-800 border-slate-700 text-slate-200 hover:text-white'
                }`}
              >
                {snapshot.snifferPaused ? (
                  <>
                    <Play className="w-3.5 h-3.5 shrink-0" />
                    <span>Wznów</span>
                  </>
                ) : (
                  <>
                    <Pause className="w-3.5 h-3.5 shrink-0" />
                    <span>Zatrzymaj klatkę</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => ftmsController.clearSnifferSamples()}
                className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white"
                title="Wyczyść bufor ramek"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* 4. DISCOVERED GATT SERVICES & RAW PACKET STREAM */}
          {snapshot.discoveredServices.length > 0 && (
            <div className="rounded-2xl bg-[#0B0F17] border border-slate-800 p-3.5 space-y-2">
              <div className="text-xs font-bold text-white uppercase tracking-wider">
                Wykryte Usługi i Charakterystyki GATT Roweru ({snapshot.discoveredServices.length})
              </div>
              <div className="space-y-1.5 font-mono-tabular text-[11px]">
                {snapshot.discoveredServices.map((svc) => (
                  <div
                    key={svc.serviceUuid}
                    className="rounded-xl bg-[#131B26] border border-slate-800 px-3 py-2 space-y-1"
                  >
                    <div className="font-bold text-emerald-400">
                      {svc.serviceName}{' '}
                      <span className="text-slate-400">[{svc.serviceUuid}]</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {svc.characteristics.map((ch) => (
                        <span
                          key={ch.uuid}
                          className={`px-2 py-0.5 rounded border text-[10px] ${
                            ch.subscribed
                              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                              : 'bg-[#0B0F17] border-slate-800 text-slate-400'
                          }`}
                        >
                          {ch.name} ({ch.properties.join('/')})
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-2xl bg-[#0B0F17] border border-slate-800 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-sky-400 shrink-0" />
                <span>
                  Ostatnie Surowe Ramki HEX ({snapshot.samples.length} / łącznie{' '}
                  {snapshot.totalPacketsReceived})
                </span>
              </span>
            </div>

            {snapshot.samples.length === 0 ? (
              <div className="text-slate-400 text-center py-4">
                Oczekiwanie na pakiety Bluetooth GATT...
              </div>
            ) : (
              <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1 font-mono-tabular text-[11px]">
                {snapshot.samples.slice(0, 20).map((pkt) => (
                  <div
                    key={pkt.id}
                    className="rounded-xl bg-[#131B26] border border-slate-800 px-3 py-2 space-y-1"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-sky-300">
                        [{pkt.timestampIso.slice(11, 19)}] {pkt.characteristicName}{' '}
                        ({pkt.byteLength}B) · Flagi: {pkt.flagsHex}
                      </span>
                      <span className="text-emerald-400 font-bold">
                        {pkt.parsedSummary}
                      </span>
                    </div>
                    <div className="text-slate-200 break-all">
                      <span className="text-slate-500">HEX: </span>
                      {pkt.rawBytesHex}
                    </div>
                    <div className="text-slate-400 break-all text-[10px]">
                      <span className="text-slate-500">DEC: </span>
                      {pkt.uint8Values
                        .map((v, i) => `[${i}]=${v}`)
                        .join('  ')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
