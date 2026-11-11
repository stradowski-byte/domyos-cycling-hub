import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Volume2,
  VolumeX,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Square,
  Bluetooth,
  ArrowLeft,
  AlertTriangle,
  Maximize2,
  Minimize2,
  Heart,
  Terminal,
  RefreshCw,
  Lock,
  CheckCircle2,
  HelpCircle,
} from 'lucide-react';
import {
  AthleteProfile,
  CompletedActivity,
  LiveBikeTelemetry,
  StructuredWorkout,
  TelemetryRecord,
  WorkoutBlock,
} from '../types/cycling';
import {
  calculateActivitySummary,
  calculateBlockInstantTarget,
  getHrZoneForBpm,
  getPowerZoneForWatts,
} from '../services/rampAndPhysiologyEngine';
import { WorkoutProfileChart } from './WorkoutProfileChart';
import {
  BlePacketSnifferModal,
  getHrSourceBadgeInfo,
} from './BlePacketSnifferModal';
import { forceUpdatePwaAndClearCaches } from '../services/usePWAInstall';
import { PostRideFeelSelector } from './PostRideFeelSelector';
import { CockpitHelpGuideModal } from './CockpitHelpGuideModal';

export interface InitialWorkoutFeelPayload {
  feelScore1To10: number;
  feelSymptomTags: string[];
  feelNotes?: string;
}

interface LiveCockpitViewProps {
  profile: AthleteProfile;
  workout: StructuredWorkout;
  telemetry: LiveBikeTelemetry;
  isRunning: boolean;
  isPaused: boolean;
  elapsedWorkoutSec: number;
  currentBlockIndex: number;
  elapsedInBlockSec: number;
  liveRecords: TelemetryRecord[];
  soundEnabled: boolean;
  wakeLockActive: boolean;
  use3sPowerSmoothing: boolean;
  onToggle3sSmoothing: () => void;
  onStartOrResume: () => void;
  onPause: () => void;
  onStopAndFinish: (initialFeel?: InitialWorkoutFeelPayload) => void;
  onPrevBlock: () => void;
  onNextBlock: () => void;
  onJumpToBlock: (index: number) => void;
  onChangeBias: (deltaPct: number) => void;
  onResetBias: () => void;
  onChangeMode: (mode: 'erg_watts' | 'resistance_level') => void;
  onChangeResistance: (deltaLevel: number) => void;
  onToggleSound: () => void;
  onConnectDomyos: () => Promise<void> | void;
  onConnectExternalHrStrap?: () => Promise<void>;
  onDisconnectExternalHrStrap?: () => void;
  onNotifyToast?: (msg: string) => void;
  onBackToWorkouts?: () => void;
  onExtendCurrentBlockSec?: (deltaSec: number) => void;
  isFocusHudMode?: boolean;
  onToggleFocusHudMode?: () => void;
  autoShowFinishConfirm?: boolean;
  onDismissAutoFinishConfirm?: () => void;
}

export function formatDurationClock(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const rem = sec % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

function formatBlockPowerSummary(
  block: WorkoutBlock,
  ftpWatts: number,
  biasPercent: number
): {
  powerText: string;
  subText: string;
  isRamp: boolean;
} {
  const startTarget = calculateBlockInstantTarget(
    block,
    0,
    ftpWatts,
    biasPercent
  );
  if (block.type === 'ramp') {
    const endTarget = calculateBlockInstantTarget(
      block,
      block.durationSec,
      ftpWatts,
      biasPercent
    );
    const startPct = Math.round(
      (startTarget.targetWatts / Math.max(1, ftpWatts)) * 100
    );
    const endPct = Math.round(
      (endTarget.targetWatts / Math.max(1, ftpWatts)) * 100
    );
    return {
      powerText: `${startTarget.targetWatts}W → ${endTarget.targetWatts}W`,
      subText: `Rampa ${startPct}%→${endPct}%`,
      isRamp: true,
    };
  }

  const pct = Math.round(
    (startTarget.targetWatts / Math.max(1, ftpWatts)) * 100
  );
  return {
    powerText: `${startTarget.targetWatts} W`,
    subText: `Stała · ${pct}% FTP`,
    isRamp: false,
  };
}

export const LiveCockpitView: React.FC<LiveCockpitViewProps> = ({
  profile,
  workout,
  telemetry,
  isRunning,
  isPaused,
  elapsedWorkoutSec,
  currentBlockIndex,
  elapsedInBlockSec,
  liveRecords,
  soundEnabled,
  use3sPowerSmoothing,
  onToggle3sSmoothing,
  onStartOrResume,
  onPause,
  onStopAndFinish,
  onPrevBlock,
  onNextBlock,
  onJumpToBlock,
  onChangeBias,
  onResetBias,
  onChangeMode,
  onChangeResistance,
  onToggleSound,
  onConnectDomyos,
  onConnectExternalHrStrap,
  onDisconnectExternalHrStrap,
  onNotifyToast,
  onBackToWorkouts,
  onExtendCurrentBlockSec,
  isFocusHudMode = false,
  onToggleFocusHudMode,
  autoShowFinishConfirm = false,
  onDismissAutoFinishConfirm,
}) => {
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [isSnifferModalOpen, setIsSnifferModalOpen] = useState(false);
  const [isHelpGuideOpen, setIsHelpGuideOpen] = useState(false);
  const [isBleDisconnectModalOpen, setIsBleDisconnectModalOpen] =
    useState(false);

  // State for pre-selected feel (1-10 + tags + notes) inside the unified finish modal
  const [draftFeelScore, setDraftFeelScore] = useState<number>(7);
  const [draftFeelTags, setDraftFeelTags] = useState<string[]>([]);
  const [draftFeelNotes, setDraftFeelNotes] = useState<string>('');
  const [hasTouchedDraftFeel, setHasTouchedDraftFeel] = useState<boolean>(false);

  useEffect(() => {
    if (autoShowFinishConfirm) {
      setShowFinishConfirm(true);
    }
  }, [autoShowFinishConfirm]);

  // Track BLE connection state during active workout:
  // If BLE drops (connected -> false or reconnecting -> true) while workout is running,
  // automatically pause the workout and open the Bluetooth Reconnect Modal!
  const wasConnectedRef = useRef<boolean>(telemetry.connected);
  useEffect(() => {
    const previouslyConnected = wasConnectedRef.current;
    wasConnectedRef.current = telemetry.connected;

    if (
      isRunning &&
      ((previouslyConnected && !telemetry.connected) || telemetry.reconnecting)
    ) {
      if (!isPaused) {
        onPause();
      }
      setIsBleDisconnectModalOpen(true);
    }
  }, [
    isRunning,
    isPaused,
    telemetry.connected,
    telemetry.reconnecting,
    onPause,
  ]);

  const hrSourceBadge = getHrSourceBadgeInfo(telemetry);

  const safeBlockIndex = Math.min(
    Math.max(0, currentBlockIndex),
    Math.max(0, workout.blocks.length - 1)
  );
  const currentBlock = workout.blocks[safeBlockIndex];
  const nextBlock =
    safeBlockIndex + 1 < workout.blocks.length
      ? workout.blocks[safeBlockIndex + 1]
      : null;
  const thirdBlock =
    safeBlockIndex + 2 < workout.blocks.length
      ? workout.blocks[safeBlockIndex + 2]
      : null;

  const remainingInBlockSec = currentBlock
    ? Math.max(0, currentBlock.durationSec - elapsedInBlockSec)
    : 0;

  const totalWorkoutDurationSec = workout.blocks.reduce(
    (sum, b) => sum + b.durationSec,
    0
  );

  const { targetWatts, targetResistance } = currentBlock
    ? calculateBlockInstantTarget(
        currentBlock,
        elapsedInBlockSec,
        profile.ftpWatts,
        telemetry.biasPercent
      )
    : { targetWatts: 100, targetResistance: 5 };

  const displayedWatts = use3sPowerSmoothing
    ? telemetry.power3sAvgWatts
    : telemetry.powerWatts;

  const powerDelta = displayedWatts - targetWatts;
  const currentPowerZone = getPowerZoneForWatts(
    displayedWatts,
    profile.ftpWatts,
    profile.powerZones
  );
  const currentHrZone = getHrZoneForBpm(
    telemetry.heartRateBpm,
    profile.hrZones
  );

  const blockEndTargetWatts = currentBlock
    ? calculateBlockInstantTarget(
        currentBlock,
        currentBlock.durationSec,
        profile.ftpWatts,
        telemetry.biasPercent
      ).targetWatts
    : targetWatts;

  const nextBlockTarget = nextBlock
    ? calculateBlockInstantTarget(
        nextBlock,
        0,
        profile.ftpWatts,
        telemetry.biasPercent
      )
    : null;
  const nextBlockDeltaWatts = nextBlockTarget
    ? nextBlockTarget.targetWatts - targetWatts
    : 0;
  const nextBlockTargetCadence = nextBlock?.targetCadenceRpm || 90;

  const targetCadenceRpm = currentBlock?.targetCadenceRpm || 88;
  const cadenceDelta = telemetry.cadenceRpm - targetCadenceRpm;

  // Live preview summary for the Unified Finish Modal (so the user sees exact NP, TSS, Avg Power & Distance before/while picking 1-10 Feel)
  const previewFinishedActivity: CompletedActivity = useMemo(() => {
    const sampleRecords: TelemetryRecord[] =
      liveRecords.length > 0
        ? liveRecords
        : [
            {
              timestampMs: Date.now(),
              elapsedSec: Math.max(1, elapsedWorkoutSec),
              blockIndex: safeBlockIndex,
              powerWatts: telemetry.powerWatts || targetWatts,
              targetPowerWatts: targetWatts,
              powerMatchOffsetWatts: telemetry.powerMatchOffsetWatts,
              heartRateBpm: telemetry.heartRateBpm || 0,
              cadenceRpm: telemetry.cadenceRpm || 0,
              speedKmh: telemetry.speedKmh || 0,
              distanceMeters: Math.round(telemetry.distanceMeters),
              resistanceLevel: telemetry.resistanceLevel || targetResistance,
            },
          ];
    const base = calculateActivitySummary(
      profile,
      workout.name,
      workout.id,
      new Date().toISOString(),
      sampleRecords
    );
    return {
      ...base,
      feelScore1To10: hasTouchedDraftFeel ? draftFeelScore : undefined,
      feelSymptomTags: draftFeelTags,
      feelNotes: draftFeelNotes,
    };
  }, [
    liveRecords,
    elapsedWorkoutSec,
    safeBlockIndex,
    telemetry.powerWatts,
    telemetry.powerMatchOffsetWatts,
    telemetry.heartRateBpm,
    telemetry.cadenceRpm,
    telemetry.speedKmh,
    telemetry.distanceMeters,
    telemetry.resistanceLevel,
    targetWatts,
    targetResistance,
    profile,
    workout.name,
    workout.id,
    hasTouchedDraftFeel,
    draftFeelScore,
    draftFeelTags,
    draftFeelNotes,
  ]);

  // Live Aerobic Decoupling (Pa:Hr %) calculation comparing 1st half vs 2nd half of active telemetry
  const livePaHrMetrics = useMemo(() => {
    const valid = liveRecords.filter(
      (r) => r.powerWatts > 20 && r.heartRateBpm > 45
    );
    if (valid.length === 0) {
      const instantEf =
        telemetry.heartRateBpm > 45 && displayedWatts > 20
          ? Number((displayedWatts / telemetry.heartRateBpm).toFixed(2))
          : null;
      return {
        decouplingPct: null as number | null,
        ef: instantEf,
        statusLabel: 'Zbieranie danych',
        statusColor: 'text-slate-400',
      };
    }

    const totalAvgW =
      valid.reduce((s, r) => s + r.powerWatts, 0) / valid.length;
    const totalAvgHr =
      valid.reduce((s, r) => s + r.heartRateBpm, 0) / valid.length;
    const overallEf =
      totalAvgHr > 0 ? Number((totalAvgW / totalAvgHr).toFixed(2)) : null;

    if (valid.length < 40) {
      return {
        decouplingPct: null as number | null,
        ef: overallEf,
        statusLabel: `EF ${overallEf ?? '--'} W/BPM`,
        statusColor: 'text-sky-400',
      };
    }

    const half = Math.floor(valid.length / 2);
    const firstHalf = valid.slice(0, half);
    const secondHalf = valid.slice(half);

    const w1 =
      firstHalf.reduce((s, r) => s + r.powerWatts, 0) / firstHalf.length;
    const hr1 =
      firstHalf.reduce((s, r) => s + r.heartRateBpm, 0) / firstHalf.length;
    const ef1 = hr1 > 0 ? w1 / hr1 : 0;

    const w2 =
      secondHalf.reduce((s, r) => s + r.powerWatts, 0) / secondHalf.length;
    const hr2 =
      secondHalf.reduce((s, r) => s + r.heartRateBpm, 0) / secondHalf.length;
    const ef2 = hr2 > 0 ? w2 / hr2 : 0;

    if (ef1 <= 0) {
      return {
        decouplingPct: null as number | null,
        ef: overallEf,
        statusLabel: `EF ${overallEf ?? '--'}`,
        statusColor: 'text-slate-400',
      };
    }

    const decouplingPct = Number((((ef1 - ef2) / ef1) * 100).toFixed(1));

    if (decouplingPct < 5.0) {
      return {
        decouplingPct,
        ef: overallEf,
        statusLabel: 'Stabilny (<5%)',
        statusColor: 'text-emerald-400',
      };
    }
    if (decouplingPct <= 7.5) {
      return {
        decouplingPct,
        ef: overallEf,
        statusLabel: 'Nawodnij się',
        statusColor: 'text-amber-400',
      };
    }
    return {
      decouplingPct,
      ef: overallEf,
      statusLabel: 'Dryf zmęczeniowy',
      statusColor: 'text-rose-400',
    };
  }, [liveRecords, telemetry.heartRateBpm, displayedWatts]);

  // Lock BLE buttons while workout is running AND device is connected to prevent accidental mid-ride disconnect!
  const isBleLockedDuringWorkout = isRunning && telemetry.connected;

  const handleBikeBleButtonClick = () => {
    if (isBleLockedDuringWorkout) {
      onNotifyToast?.(
        'Połączenie Bluetooth z rowerem (Moc + Kadencja) jest zablokowane na czas trwania treningu, aby zapobiec przypadkowemu rozłączeniu.'
      );
      return;
    }
    void onConnectDomyos();
  };

  const handleHrStrapButtonClick = () => {
    if (isRunning && telemetry.externalHrConnected) {
      onNotifyToast?.(
        'Pas tętna BLE jest zablokowany na czas trwania treningu, aby zapobiec przypadkowemu rozłączeniu.'
      );
      return;
    }
    if (onConnectExternalHrStrap) {
      void onConnectExternalHrStrap();
    }
  };

  return (
    <div className="min-h-[calc(100dvh-118px)] md:h-[calc(100dvh-76px)] flex flex-col justify-between gap-1 sm:gap-1.5 select-none max-w-full overflow-x-hidden">
      {/* 1. COMPACT GARMIN STATUS & LOCKED BIKE CONNECTION HEADER */}
      <div className="rounded-xl bg-[#131B26] border border-slate-800 px-2.5 sm:px-3 py-1.5 flex items-center justify-between gap-2 shrink-0 min-w-0">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
          {onBackToWorkouts && (
            <button
              onClick={onBackToWorkouts}
              className="min-h-[34px] px-2 sm:px-2.5 py-1 rounded-lg bg-[#0B0F17] hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1 shrink-0"
              title="Wróć do listy treningów"
            >
              <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Treningi</span>
            </button>
          )}
          <div className="truncate min-w-0">
            <div className="text-xs font-bold text-white truncate">
              {workout.name}
            </div>
            <div className="text-[10px] text-slate-400 truncate">
              {profile.name} · FTP {profile.ftpWatts}W
              {telemetry.externalPowerConnected
                ? ` · PM ${telemetry.powerMatchOffsetWatts >= 0 ? '+' : ''}${telemetry.powerMatchOffsetWatts}W`
                : ''}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          <button
            onClick={handleBikeBleButtonClick}
            className={`min-h-[34px] px-2.5 sm:px-3 py-1 rounded-lg border text-[11px] sm:text-xs font-bold flex items-center gap-1 sm:gap-1.5 transition-colors whitespace-nowrap ${
              telemetry.reconnecting
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                : telemetry.connected
                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                : 'bg-emerald-500 hover:bg-emerald-400 border-emerald-400 text-slate-950'
            }`}
            title={
              isBleLockedDuringWorkout
                ? 'Zablokowano na czas treningu: Moc + Kadencja + HR są połączone'
                : 'Połącz z rowerem Domyos Bluetooth FTMS'
            }
          >
            {isBleLockedDuringWorkout ? (
              <Lock className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
            ) : (
              <Bluetooth className="w-3.5 h-3.5 shrink-0" />
            )}
            <span className="sm:hidden">
              {telemetry.reconnecting
                ? `BLE ${telemetry.reconnectAttempt || 1}/5`
                : telemetry.connected
                ? isRunning
                  ? 'Moc·Kad·HR'
                  : 'Połączono'
                : 'Połącz Rower'}
            </span>
            <span className="hidden sm:inline">
              {telemetry.reconnecting
                ? `Wznawianie BLE (${telemetry.reconnectAttempt || 1}/5)...`
                : telemetry.connected
                ? isRunning
                  ? `Zablokowano: Moc · Kadencja${telemetry.heartRateBpm > 0 ? ' · HR' : ''}`
                  : 'Rower Połączony'
                : 'Połącz Rower'}
            </span>
          </button>

          {onConnectExternalHrStrap && (
            <button
              onClick={handleHrStrapButtonClick}
              className={`min-h-[34px] px-2 sm:px-2.5 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1 transition-colors whitespace-nowrap ${
                telemetry.externalHrConnected
                  ? 'bg-rose-500/20 border-rose-500/50 text-rose-300'
                  : 'bg-[#0B0F17] border-slate-700 text-rose-300 hover:text-white'
              }`}
              title={
                isRunning && telemetry.externalHrConnected
                  ? 'Pas HR zablokowany na czas trwania treningu'
                  : 'Sparuj pas tętna BLE (0x180D) bezpośrednio z telefonem'
              }
            >
              {isRunning && telemetry.externalHrConnected ? (
                <Lock className="w-3 h-3 shrink-0 text-rose-300" />
              ) : (
                <Heart className="w-3.5 h-3.5 shrink-0" />
              )}
              <span className="hidden md:inline">
                {telemetry.externalHrConnected ? 'Pas HR Aktywny' : '+ Pas HR'}
              </span>
            </button>
          )}

          <button
            onClick={() => setIsSnifferModalOpen(true)}
            className="min-h-[34px] px-2 sm:px-2.5 py-1 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/40 text-sky-300 text-[11px] font-bold flex items-center gap-1 whitespace-nowrap"
            title="Otwórz Skaner Ramek BLE (HEX Sniffer) i Dekoder Tętna HR na żywo"
          >
            <Terminal className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">Sniffer BLE</span>
          </button>

          <button
            onClick={() => setIsHelpGuideOpen(true)}
            className="min-h-[34px] px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-xs font-extrabold flex items-center gap-1 transition-colors"
            title="Pomoc i przewodnik po elementach Kokpitu (3 strony)"
          >
            <HelpCircle className="w-3.5 h-3.5 shrink-0" />
            <span>?</span>
          </button>

          <button
            onClick={onToggleSound}
            className="min-h-[34px] px-2 py-1 rounded-lg bg-[#0B0F17] border border-slate-700 text-slate-300 hover:text-white text-[11px] flex items-center"
            title="Dźwięki odliczania końca interwału 3-2-1"
          >
            {soundEnabled ? (
              <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <VolumeX className="w-3.5 h-3.5 text-slate-500" />
            )}
          </button>

          {isFocusHudMode && (
            <button
              onClick={() => void forceUpdatePwaAndClearCaches()}
              className="min-h-[34px] px-2 py-1 rounded-lg bg-[#0B0F17] hover:bg-slate-800 border border-slate-700 text-emerald-400 text-[11px] font-bold flex items-center gap-1"
              title="Wymuś odświeżenie PWA (wyczyść cache Service Workera)"
            >
              <RefreshCw className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          )}

          {onToggleFocusHudMode && (
            <button
              onClick={onToggleFocusHudMode}
              className={`min-h-[34px] px-2 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1 transition-colors ${
                isFocusHudMode
                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                  : 'bg-[#0B0F17] border-slate-700 text-slate-300 hover:text-white'
              }`}
              title="Tryb Pełnoekranowy Zen HUD (ukrywa paski nawigacji podczas jazdy)"
            >
              {isFocusHudMode ? (
                <Minimize2 className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
              <span className="hidden lg:inline">Zen HUD</span>
            </button>
          )}
        </div>
      </div>

      {/* 10-SECOND UPCOMING INTERVAL ALERT BANNER */}
      {isRunning &&
        !isPaused &&
        nextBlock &&
        nextBlockTarget &&
        remainingInBlockSec <= 10 &&
        remainingInBlockSec > 0 && (
          <div className="rounded-xl bg-amber-500/20 border border-amber-400 px-3 py-1 flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-mono-tabular text-xs font-extrabold text-slate-950 bg-amber-400 px-2 py-0.5 rounded-md shrink-0">
                ZA {remainingInBlockSec} S
              </span>
              <span className="text-xs font-bold text-white truncate">
                Następny odcinek: {nextBlock.label}
              </span>
            </div>
            <div className="flex items-center gap-2 font-mono-tabular text-xs font-extrabold shrink-0">
              <span className="text-emerald-300">
                Cel: {nextBlockTarget.targetWatts} W (
                {nextBlockDeltaWatts >= 0
                  ? `+${nextBlockDeltaWatts}`
                  : nextBlockDeltaWatts}
                W)
              </span>
              <span className="text-slate-400">·</span>
              <span className="text-sky-300">
                Kadencja: {nextBlockTargetCadence} RPM
              </span>
            </div>
          </div>
        )}

      {/* 2. GARMIN EDGE SQUARE DATA FIELDS GRID (6 COMPACT CELLS WITH NARROWER VERTICAL DIGITS) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 flex-1 min-h-0">
        {/* FIELD 1: POWER (WATTS) + TARGET WATTS + ERG GAUGE */}
        <div
          onClick={onToggle3sSmoothing}
          style={{
            borderColor:
              isRunning && !isPaused ? `${currentPowerZone.color}88` : undefined,
          }}
          className="rounded-xl bg-[#131B26] border border-slate-800 px-2.5 sm:px-3 py-1.5 flex flex-col justify-between cursor-pointer min-w-0 overflow-hidden transition-colors"
          title="Stuknij, aby przełączyć wygładzanie mocy 3s / 1s"
        >
          <div className="flex items-center justify-between gap-1 text-[10px] font-bold tracking-wider text-slate-400 uppercase min-w-0">
            <span className="truncate">
              MOC ({use3sPowerSmoothing ? '3S' : '1S'})
            </span>
            <span className="text-emerald-400 font-mono-tabular shrink-0">
              CEL {targetWatts}W
            </span>
          </div>

          <div className="flex items-baseline justify-between gap-1 my-auto py-0 min-w-0">
            <div className="flex items-baseline gap-1 min-w-0">
              <span className="font-mono-tabular text-2xl sm:text-4xl font-extrabold tracking-tight text-white leading-none truncate">
                {displayedWatts}
              </span>
              <span className="text-[11px] sm:text-xs font-bold text-slate-400 shrink-0">
                W
              </span>
            </div>
            <span
              className={`font-mono-tabular text-[11px] sm:text-xs font-bold shrink-0 ${
                Math.abs(powerDelta) <= 8
                  ? 'text-emerald-400'
                  : powerDelta > 8
                  ? 'text-amber-400'
                  : 'text-sky-400'
              }`}
            >
              {powerDelta >= 0 ? `+${powerDelta}` : powerDelta}W
            </span>
          </div>

          <div className="space-y-0.5 pt-1 border-t border-slate-800/80 min-w-0">
            <div className="w-full h-1.5 rounded-full bg-[#0B0F17] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min(
                    100,
                    Math.max(
                      8,
                      Math.round(
                        (displayedWatts / Math.max(1, targetWatts)) * 75
                      )
                    )
                  )}%`,
                  backgroundColor: currentPowerZone.color,
                }}
              />
            </div>
            <div className="flex items-center justify-between gap-1 text-[10px] min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: currentPowerZone.color }}
                />
                <span className="font-bold text-white truncate min-w-0">
                  {currentPowerZone.name}
                </span>
              </div>
              <span className="font-mono-tabular text-slate-400 shrink-0">
                {Math.round(
                  (displayedWatts / Math.max(1, profile.ftpWatts)) * 100
                )}
                % FTP
              </span>
            </div>
          </div>
        </div>

        {/* FIELD 2: INTERVAL TIMER (DECREASING COUNTDOWN) */}
        <div className="rounded-xl bg-[#131B26] border border-slate-800 px-2.5 sm:px-3 py-1.5 flex flex-col justify-between min-w-0 overflow-hidden">
          <div className="flex items-center justify-between gap-1 text-[10px] font-bold tracking-wider text-amber-400 uppercase min-w-0">
            <span className="truncate">INTERWAŁ</span>
            <span className="font-mono-tabular text-slate-300 shrink-0">
              {safeBlockIndex + 1}/{workout.blocks.length}
            </span>
          </div>

          <div className="my-auto py-0 flex items-baseline justify-between gap-1 min-w-0">
            <span
              className={`font-mono-tabular text-2xl sm:text-4xl font-extrabold tracking-tight leading-none truncate ${
                remainingInBlockSec <= 5 && isRunning && !isPaused
                  ? 'text-rose-400'
                  : 'text-amber-400'
              }`}
            >
              {formatDurationClock(remainingInBlockSec)}
            </span>
          </div>

          <div className="flex items-center justify-between gap-1 text-[10px] pt-1 border-t border-slate-800/80 min-w-0">
            <span className="text-slate-200 font-semibold truncate min-w-0">
              {currentBlock?.label || 'Koniec'}
            </span>
            {currentBlock?.type === 'ramp' && (
              <span className="font-mono-tabular text-emerald-400 shrink-0">
                →{blockEndTargetWatts}W
              </span>
            )}
          </div>
        </div>

        {/* FIELD 3: HEART RATE (BPM) + LIVE AEROBIC DECOUPLING (Pa:Hr %) + BLE SNIFFER TRIGGER */}
        <div
          onClick={() => setIsSnifferModalOpen(true)}
          className="rounded-xl bg-[#131B26] border border-slate-800 hover:border-rose-500/40 px-2.5 sm:px-3 py-1.5 flex flex-col justify-between min-w-0 overflow-hidden cursor-pointer transition-colors"
          title="Stuknij, aby otworzyć Skaner Ramek BLE (HEX Sniffer) lub sparować pas tętna 0x180D"
        >
          <div className="flex items-center justify-between gap-1 text-[10px] font-bold tracking-wider text-slate-400 uppercase min-w-0">
            <span className="truncate flex items-center gap-1">
              <span>TĘTNO (HR)</span>
              <span
                className={`px-1.5 py-0.2 rounded border text-[9px] font-mono-tabular ${hrSourceBadge.colorClass}`}
              >
                {hrSourceBadge.shortLabel}
              </span>
            </span>
            <span className="font-mono-tabular text-rose-400 shrink-0">
              {telemetry.heartRateBpm > 0
                ? `${Math.round((telemetry.heartRateBpm / profile.maxHrBpm) * 100)}% MAX`
                : `MAX ${profile.maxHrBpm}`}
            </span>
          </div>

          <div className="my-auto py-0 flex items-baseline justify-between gap-1 min-w-0">
            <div className="flex items-baseline gap-1 min-w-0">
              <span className="font-mono-tabular text-2xl sm:text-4xl font-extrabold tracking-tight text-white leading-none truncate">
                {telemetry.heartRateBpm > 0 ? telemetry.heartRateBpm : '--'}
              </span>
              <span className="text-[11px] sm:text-xs font-bold text-rose-400 shrink-0">
                BPM
              </span>
            </div>
            {livePaHrMetrics.decouplingPct !== null ? (
              <span
                className={`font-mono-tabular text-[11px] sm:text-xs font-bold shrink-0 ${livePaHrMetrics.statusColor}`}
                title="Dryf Tętna (Aerobic Decoupling Pa:Hr %) porównujący I oraz II połowę jazdy"
              >
                Pa:Hr{' '}
                {livePaHrMetrics.decouplingPct >= 0
                  ? `+${livePaHrMetrics.decouplingPct}`
                  : livePaHrMetrics.decouplingPct}
                %
              </span>
            ) : telemetry.heartRateBpm === 0 ? (
              <span className="text-[10px] font-bold text-sky-400 underline shrink-0">
                Sniffer / +Pas
              </span>
            ) : null}
          </div>

          <div className="space-y-0.5 pt-1 border-t border-slate-800/80 min-w-0">
            <div className="flex items-center justify-between gap-1 text-[10px] min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{
                    backgroundColor:
                      telemetry.heartRateBpm > 0
                        ? currentHrZone.color
                        : '#64748B',
                  }}
                />
                <span className="font-bold text-white truncate min-w-0">
                  {telemetry.heartRateBpm > 0
                    ? currentHrZone.name
                    : 'Brak odczytu HR'}
                </span>
              </div>
              <span
                className={`font-mono-tabular font-semibold truncate shrink-0 ${livePaHrMetrics.statusColor}`}
              >
                {livePaHrMetrics.decouplingPct !== null
                  ? `Dryf: ${livePaHrMetrics.statusLabel}`
                  : livePaHrMetrics.statusLabel}
              </span>
            </div>
          </div>
        </div>

        {/* FIELD 4: CADENCE (RPM) + TARGET CADENCE GAUGE (RED ALERT WHEN TOO LOW) */}
        <div
          className={`rounded-xl px-2.5 sm:px-3 py-1.5 flex flex-col justify-between min-w-0 overflow-hidden transition-colors border ${
            cadenceDelta < -5
              ? 'bg-rose-950/25 border-rose-500/80 shadow-[0_0_15px_rgba(244,63,94,0.18)]'
              : 'bg-[#131B26] border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between gap-1 text-[10px] font-bold tracking-wider uppercase min-w-0">
            <span
              className={`truncate ${
                cadenceDelta < -5
                  ? 'text-rose-400 font-extrabold'
                  : 'text-slate-400'
              }`}
            >
              {cadenceDelta < -5 ? 'KADENCJA ZA NISKA!' : 'KADENCJA'}
            </span>
            <span className="font-mono-tabular text-sky-400 shrink-0">
              CEL {targetCadenceRpm} RPM
            </span>
          </div>

          <div className="my-auto py-0 flex items-baseline justify-between gap-1 min-w-0">
            <div className="flex items-baseline gap-1 min-w-0">
              <span
                className={`font-mono-tabular text-2xl sm:text-4xl font-extrabold tracking-tight leading-none truncate ${
                  cadenceDelta < -5 ? 'text-rose-400' : 'text-white'
                }`}
              >
                {telemetry.cadenceRpm}
              </span>
              <span
                className={`text-[11px] sm:text-xs font-bold shrink-0 ${
                  cadenceDelta < -5 ? 'text-rose-400' : 'text-sky-400'
                }`}
              >
                RPM
              </span>
            </div>
            <span
              className={`font-mono-tabular text-[10px] sm:text-xs font-extrabold shrink-0 ${
                Math.abs(cadenceDelta) <= 5
                  ? 'text-emerald-400'
                  : cadenceDelta < -5
                  ? 'text-rose-400'
                  : 'text-sky-400'
              }`}
            >
              {Math.abs(cadenceDelta) <= 5
                ? 'W CELU'
                : cadenceDelta < -5
                ? `ZA NISKO (+${Math.abs(cadenceDelta)} RPM)`
                : `-${cadenceDelta} RPM`}
            </span>
          </div>

          <div className="space-y-0.5 pt-1 border-t border-slate-800/80 min-w-0">
            <div className="w-full h-1.5 rounded-full bg-[#0B0F17] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min(
                    100,
                    Math.max(
                      10,
                      Math.round(
                        (telemetry.cadenceRpm / Math.max(40, targetCadenceRpm)) *
                          75
                      )
                    )
                  )}%`,
                  backgroundColor:
                    Math.abs(cadenceDelta) <= 5
                      ? '#10B981'
                      : cadenceDelta < -5
                      ? '#F43F5E'
                      : '#38BDF8',
                }}
              />
            </div>
            <div className="flex items-center justify-between gap-1 text-[10px] min-w-0">
              <span className="text-slate-400 truncate">Opór</span>
              <span className="font-mono-tabular font-bold text-slate-200 shrink-0">
                Poz. {telemetry.resistanceLevel}/32
              </span>
            </div>
          </div>
        </div>

        {/* FIELD 5: TOTAL WORKOUT TIME + 700c SPEED & DISTANCE */}
        <div className="rounded-xl bg-[#131B26] border border-slate-800 px-2.5 sm:px-3 py-1.5 flex flex-col justify-between min-w-0 overflow-hidden">
          <div className="flex items-center justify-between gap-1 text-[10px] font-bold tracking-wider text-slate-400 uppercase min-w-0">
            <span className="truncate">CZAS JAZDY</span>
            <span className="font-mono-tabular text-slate-400 shrink-0">
              {formatDurationClock(totalWorkoutDurationSec)}
            </span>
          </div>

          <div className="my-auto py-0 flex items-baseline justify-between gap-1 min-w-0">
            <span className="font-mono-tabular text-2xl sm:text-4xl font-extrabold tracking-tight text-white leading-none truncate">
              {formatDurationClock(elapsedWorkoutSec)}
            </span>
            <span
              className="font-mono-tabular text-[11px] sm:text-xs font-bold text-emerald-400 shrink-0"
              title="Dystans wyliczony z obrotów koła szosowego 700c (2.105m) w czasie jazdy"
            >
              {(telemetry.distanceMeters / 1000).toFixed(2)} km
            </span>
          </div>

          <div className="flex items-center justify-between gap-1 text-[10px] pt-1 border-t border-slate-800/80 min-w-0">
            <span className="text-slate-400 truncate min-w-0">
              Nast.:{' '}
              <strong className="text-slate-200">
                {nextBlock ? nextBlock.label : 'Koniec'}
              </strong>
            </span>
            <span className="font-mono-tabular text-sky-400 font-semibold shrink-0">
              {telemetry.speedKmh.toFixed(1)} km/h
            </span>
          </div>
        </div>

        {/* FIELD 6: INSTANT ERG / RESISTANCE CONTROL CELL */}
        <div className="rounded-xl bg-[#131B26] border border-slate-800 px-2.5 sm:px-3 py-1.5 flex flex-col justify-between min-w-0 overflow-hidden">
          <div className="flex items-center justify-between gap-1 min-w-0">
            <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase truncate">
              TRYB
            </span>
            <button
              onClick={() =>
                onChangeMode(
                  telemetry.controlMode === 'erg_watts'
                    ? 'resistance_level'
                    : 'erg_watts'
                )
              }
              className={`px-1.5 sm:px-2 py-0.5 rounded text-[10px] font-bold transition-colors shrink-0 ${
                telemetry.controlMode === 'erg_watts'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              }`}
            >
              {telemetry.controlMode === 'erg_watts' ? 'AUTO ERG' : 'OPÓR 1–32'}
            </button>
          </div>

          {telemetry.controlMode === 'erg_watts' ? (
            <div className="grid grid-cols-3 gap-1 my-auto py-0.5">
              <button
                onClick={() => onChangeBias(-5)}
                className="min-h-[32px] sm:min-h-[34px] rounded-lg bg-[#0B0F17] hover:bg-slate-800 border border-slate-700 font-mono-tabular text-[11px] sm:text-xs font-bold text-white"
              >
                -5%
              </button>
              <button
                onClick={onResetBias}
                className="min-h-[32px] sm:min-h-[34px] rounded-lg bg-[#0B0F17] border border-emerald-500/40 font-mono-tabular text-[11px] sm:text-xs font-extrabold text-emerald-400"
              >
                {telemetry.biasPercent}%
              </button>
              <button
                onClick={() => onChangeBias(5)}
                className="min-h-[32px] sm:min-h-[34px] rounded-lg bg-[#0B0F17] hover:bg-slate-800 border border-slate-700 font-mono-tabular text-[11px] sm:text-xs font-bold text-white"
              >
                +5%
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1 my-auto py-0.5">
              <button
                onClick={() => onChangeResistance(-1)}
                className="min-h-[32px] sm:min-h-[34px] rounded-lg bg-[#0B0F17] hover:bg-slate-800 border border-slate-700 font-mono-tabular text-[11px] sm:text-xs font-bold text-white"
              >
                -1
              </button>
              <span className="min-h-[32px] sm:min-h-[34px] rounded-lg bg-[#0B0F17] border border-amber-500/40 flex items-center justify-center font-mono-tabular text-[11px] sm:text-xs font-extrabold text-amber-400">
                {targetResistance}/32
              </span>
              <button
                onClick={() => onChangeResistance(1)}
                className="min-h-[32px] sm:min-h-[34px] rounded-lg bg-[#0B0F17] hover:bg-slate-800 border border-slate-700 font-mono-tabular text-[11px] sm:text-xs font-bold text-white"
              >
                +1
              </button>
            </div>
          )}

          <div className="flex items-center justify-between gap-1 text-[10px] text-slate-400 pt-1 border-t border-slate-800/80 min-w-0">
            <span className="truncate">Korekta</span>
            <span className="font-mono-tabular text-slate-300 shrink-0">
              {telemetry.controlMode === 'erg_watts'
                ? `${targetWatts}W`
                : `Poz. ${targetResistance}`}
            </span>
          </div>
        </div>
      </div>

      {/* 3. THREE INTERVAL PREVIEW BLOCKS (CURRENT + NEXT 2 INTERVALS) DIRECTLY ABOVE WORKOUT TIMELINE */}
      <div className="grid grid-cols-3 gap-1.5 shrink-0">
        {[
          {
            slotTitle: '1. TERAZ (AKTUALNY)',
            block: currentBlock,
            index: safeBlockIndex,
            isCurrent: true,
          },
          {
            slotTitle: '2. NASTĘPNY (+1)',
            block: nextBlock,
            index: safeBlockIndex + 1,
            isCurrent: false,
          },
          {
            slotTitle: '3. KOLEJNY (+2)',
            block: thirdBlock,
            index: safeBlockIndex + 2,
            isCurrent: false,
          },
        ].map((slot, idx) => {
          if (!slot.block) {
            return (
              <div
                key={idx}
                className="rounded-xl bg-[#131B26]/60 border border-slate-800/70 px-2.5 py-1.5 flex flex-col justify-between min-w-0"
              >
                <div className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase truncate">
                  {slot.slotTitle}
                </div>
                <div className="text-[11px] sm:text-xs font-semibold text-slate-500 truncate my-0.5">
                  Koniec treningu
                </div>
                <div className="text-[9px] font-mono-tabular text-slate-600 truncate">
                  Brak kolejnych odcinków
                </div>
              </div>
            );
          }

          const pwrInfo = formatBlockPowerSummary(
            slot.block,
            profile.ftpWatts,
            telemetry.biasPercent
          );

          return (
            <div
              key={`${slot.block.id}_${slot.index}`}
              onClick={() => onJumpToBlock(slot.index)}
              className={`rounded-xl px-2.5 py-1.5 flex flex-col justify-between min-w-0 cursor-pointer transition-colors border ${
                slot.isCurrent
                  ? 'bg-emerald-500/10 border-emerald-500/60'
                  : 'bg-[#131B26] hover:bg-slate-800/80 border-slate-800'
              }`}
              title="Stuknij, aby przeskoczyć do tego odcinka"
            >
              <div className="flex items-center justify-between gap-1 text-[9px] sm:text-[10px] font-bold uppercase min-w-0">
                <span
                  className={`truncate ${
                    slot.isCurrent ? 'text-emerald-400' : 'text-slate-400'
                  }`}
                >
                  {slot.slotTitle}
                </span>
                <span className="font-mono-tabular text-amber-300 shrink-0">
                  {slot.isCurrent
                    ? `${formatDurationClock(remainingInBlockSec)} / ${formatDurationClock(slot.block.durationSec)}`
                    : formatDurationClock(slot.block.durationSec)}
                </span>
              </div>

              <div className="flex items-baseline justify-between gap-1 my-0.5 min-w-0">
                <span className="text-[11px] sm:text-xs font-bold text-white truncate">
                  {slot.block.label}
                </span>
                <span
                  className={`font-mono-tabular text-[11px] sm:text-xs font-extrabold shrink-0 ${
                    pwrInfo.isRamp ? 'text-amber-300' : 'text-emerald-400'
                  }`}
                >
                  {pwrInfo.powerText}
                </span>
              </div>

              <div className="flex items-center justify-between gap-1 text-[9px] sm:text-[10px] text-slate-400 min-w-0">
                <span className="truncate">{pwrInfo.subText}</span>
                {slot.block.targetCadenceRpm ? (
                  <span className="font-mono-tabular text-sky-400 shrink-0">
                    {slot.block.targetCadenceRpm} RPM
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* 4. WORKOUT TIMELINE WITH PROMINENT POSITION ARROW (▼) */}
      <div className="rounded-xl bg-[#131B26] border border-slate-800 px-2.5 sm:px-3 py-1 sm:py-1.5 space-y-1 shrink-0 min-w-0 overflow-hidden">
        <div className="flex items-center justify-between gap-2 text-[10px] sm:text-[11px] min-w-0">
          <div className="flex items-center gap-1.5 text-slate-300 font-semibold truncate min-w-0">
            <span className="text-emerald-400 shrink-0">▼ ODCINEK:</span>
            <span className="text-white truncate">
              {currentBlock?.label} ({targetWatts}W)
            </span>
          </div>
          <span className="hidden sm:inline font-mono-tabular text-[10px] text-slate-400 shrink-0">
            Stuknij blok, aby przeskoczyć
          </span>
        </div>

        <WorkoutProfileChart
          blocks={workout.blocks}
          profile={profile}
          biasPercent={telemetry.biasPercent}
          currentBlockIndex={safeBlockIndex}
          elapsedInBlockSec={elapsedInBlockSec}
          liveRecords={liveRecords}
          height={68}
          compact={true}
          onSelectBlock={onJumpToBlock}
        />
      </div>

      {/* 5. SINGLE-ROW BOTTOM RIDE TRANSPORT BAR (+30S INTERVAL EXTEND) */}
      <div className="grid grid-cols-12 gap-1.5 shrink-0">
        <button
          onClick={onPrevBlock}
          disabled={safeBlockIndex === 0}
          className="col-span-2 min-h-[44px] rounded-xl bg-[#131B26] hover:bg-slate-800 border border-slate-800 disabled:opacity-40 text-white flex items-center justify-center"
          title="Poprzedni blok"
        >
          <SkipBack className="w-4 h-4" />
        </button>

        {!isRunning || isPaused ? (
          <button
            onClick={onStartOrResume}
            className="col-span-4 min-h-[44px] px-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-1.5 sm:gap-2 transition-colors truncate"
          >
            <Play className="w-4 h-4 fill-current shrink-0" />
            <span className="truncate">{!isRunning ? 'START' : 'WZNÓW'}</span>
          </button>
        ) : (
          <button
            onClick={onPause}
            className="col-span-4 min-h-[44px] px-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-1.5 sm:gap-2 transition-colors truncate"
          >
            <Pause className="w-4 h-4 fill-current shrink-0" />
            <span className="truncate">PAUZA</span>
          </button>
        )}

        {onExtendCurrentBlockSec && (
          <button
            onClick={() => onExtendCurrentBlockSec(30)}
            className="col-span-2 min-h-[44px] px-1 rounded-xl bg-[#131B26] hover:bg-slate-800 border border-emerald-500/40 font-mono-tabular text-xs font-extrabold text-emerald-400 flex items-center justify-center"
            title="Wydłuż aktualny interwał lub rozgrzewkę o 30 sekund"
          >
            +30s
          </button>
        )}

        <button
          onClick={onNextBlock}
          disabled={safeBlockIndex >= workout.blocks.length - 1}
          className={`${
            onExtendCurrentBlockSec ? 'col-span-1' : 'col-span-2'
          } min-h-[44px] rounded-xl bg-[#131B26] hover:bg-slate-800 border border-slate-800 disabled:opacity-40 text-white flex items-center justify-center`}
          title="Następny blok"
        >
          <SkipForward className="w-4 h-4" />
        </button>

        <button
          onClick={() => setShowFinishConfirm(true)}
          disabled={!isRunning && liveRecords.length === 0}
          className="col-span-3 min-h-[44px] px-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 disabled:opacity-40 text-rose-300 font-bold text-[11px] sm:text-xs flex items-center justify-center gap-1 sm:gap-1.5 transition-colors truncate"
        >
          <Square className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-current shrink-0" />
          <span className="truncate">ZAKOŃCZ</span>
        </button>
      </div>

      {/* BLUETOOTH DISCONNECTED AUTO-PAUSE & RECONNECT MODAL */}
      {isBleDisconnectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#131B26] border border-amber-500/60 p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2.5 text-amber-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <div>
                <h3 className="text-base font-bold text-white">
                  Bluetooth Rozłączony — Włączono Pauzę
                </h3>
                <p className="text-[11px] text-slate-400">
                  Zegar treningu został bezpiecznie zatrzymany do czasu ponownego
                  połączenia.
                </p>
              </div>
            </div>

            {telemetry.connected ? (
              <div className="rounded-xl bg-emerald-500/15 border border-emerald-500/50 p-3.5 text-xs text-emerald-200 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-white">
                    Połączenie z rowerem ({telemetry.deviceName}) zostało
                    odzyskane!
                  </div>
                  <div className="text-[11px] text-emerald-300 mt-0.5">
                    Trening pozostaje w stanie Pauzy. Zamknij to okno i kliknij{' '}
                    <strong>WZNÓW</strong>, gdy będziesz gotowy do dalszej
                    jazdy.
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl bg-[#0B0F17] border border-slate-800 p-3.5 space-y-2 text-xs text-slate-300">
                <div className="font-semibold text-amber-300">
                  {telemetry.reconnecting
                    ? `Trwa automatyczne wznawianie połączenia GATT (próba ${
                        telemetry.reconnectAttempt || 1
                      }/5)...`
                    : 'Połączenie z rowerem Bluetooth FTMS zostało przerwane.'}
                </div>
                <p className="text-[11px] text-slate-400">
                  Kliknij poniższy przycisk, aby wywołać okno wyboru urządzenia
                  Bluetooth i połączyć rower ponownie.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => void onConnectDomyos()}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-2 transition-colors"
              >
                <Bluetooth className="w-4 h-4 shrink-0" />
                <span>
                  {telemetry.connected
                    ? 'Połączono z rowerem ✓ (Kliknij, aby wybrać ponownie)'
                    : 'Połącz z rowerem Bluetooth (FTMS)'}
                </span>
              </button>

              {onConnectExternalHrStrap && (
                <button
                  type="button"
                  onClick={() => void onConnectExternalHrStrap()}
                  className="w-full min-h-[40px] px-4 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200 font-bold text-xs flex items-center justify-center gap-2 transition-colors"
                >
                  <Heart className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>
                    {telemetry.externalHrConnected
                      ? `Pas HR połączony (${telemetry.externalHrDeviceName}) ✓`
                      : 'Paruj zewnętrzny pas tętna BLE (0x180D)'}
                  </span>
                </button>
              )}
            </div>

            <div className="flex items-center justify-end pt-1">
              <button
                type="button"
                onClick={() => setIsBleDisconnectModalOpen(false)}
                className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-white transition-colors"
              >
                {telemetry.connected
                  ? 'Zamknij (Kliknij WZNÓW w Kokpicie, aby jechać dalej)'
                  : 'Zamknij okno'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* UNIFIED FINISH WORKOUT & POST-RIDE FEEL (1–10 + TAGS) MODAL (BOTH AUTO 00:00 AND MANUAL STOP) */}
      {showFinishConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4">
          <div className="w-full max-w-lg rounded-3xl bg-[#131B26] border border-emerald-500/50 p-4 sm:p-6 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 text-emerald-400">
                <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 shrink-0" />
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white">
                    {autoShowFinishConfirm
                      ? 'Ostatni interwał ukończony! Podsumowanie i Odczucia'
                      : 'Zakończenie Treningu — Podsumowanie i Odczucia'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {workout.name} · Oceń samopoczucie (1–10) i zapisz plik .FIT
                  </p>
                </div>
              </div>
            </div>

            {/* LIVE WORKOUT SUMMARY METRICS */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-[#0B0F17] border border-slate-800 p-2.5 min-w-0">
                <div className="text-[10px] text-slate-400">ŚR. MOC / NP</div>
                <div className="font-mono-tabular text-sm sm:text-base font-bold text-emerald-400 mt-0.5 truncate">
                  {previewFinishedActivity.avgPowerWatts}W /{' '}
                  {previewFinishedActivity.normalizedPowerWatts}W
                </div>
              </div>
              <div className="rounded-xl bg-[#0B0F17] border border-slate-800 p-2.5 min-w-0">
                <div className="text-[10px] text-slate-400">ŁADUNEK TSS</div>
                <div className="font-mono-tabular text-sm sm:text-base font-bold text-amber-400 mt-0.5 truncate">
                  {previewFinishedActivity.tss} TSS
                </div>
              </div>
              <div className="rounded-xl bg-[#0B0F17] border border-slate-800 p-2.5 min-w-0">
                <div className="text-[10px] text-slate-400">CZAS / DYSTANS</div>
                <div className="font-mono-tabular text-sm sm:text-base font-bold text-white mt-0.5 truncate">
                  {formatDurationClock(elapsedWorkoutSec)} ·{' '}
                  {(telemetry.distanceMeters / 1000).toFixed(2)} km
                </div>
              </div>
            </div>

            {/* EMBEDDED 1-10 FEEL & SYMPTOM TAGS SELECTOR RIGHT BEFORE SAVING */}
            <PostRideFeelSelector
              activity={previewFinishedActivity}
              compact={false}
              hasIntervalsConnected={Boolean(
                profile.intervals.enabled && profile.intervals.apiKey.trim()
              )}
              onUpdateFeel={(_act, patch) => {
                setDraftFeelScore(patch.feelScore1To10);
                setDraftFeelTags(patch.feelSymptomTags);
                setDraftFeelNotes(patch.feelNotes || '');
                setHasTouchedDraftFeel(true);
              }}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowFinishConfirm(false);
                  onDismissAutoFinishConfirm?.();
                }}
                className="min-h-[46px] rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-200 transition-colors"
              >
                Wróć do jazdy
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowFinishConfirm(false);
                  onDismissAutoFinishConfirm?.();
                  onStopAndFinish({
                    feelScore1To10: draftFeelScore,
                    feelSymptomTags: draftFeelTags,
                    feelNotes: draftFeelNotes.trim() || undefined,
                  });
                }}
                className="min-h-[46px] px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-xs font-extrabold text-slate-950 transition-colors shadow-sm"
              >
                Zakończ, zapisz .FIT i Odczucia ({draftFeelScore}/10)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LIVE BLE PACKET SNIFFER & HR DECODER MODAL */}
      <BlePacketSnifferModal
        isOpen={isSnifferModalOpen}
        onClose={() => setIsSnifferModalOpen(false)}
        telemetry={telemetry}
        onConnectExternalHrStrap={async () => {
          if (onConnectExternalHrStrap) {
            await onConnectExternalHrStrap();
          }
        }}
        onDisconnectExternalHrStrap={() => {
          if (isRunning) {
            onNotifyToast?.(
              'Rozłączenie pasa tętna jest zablokowane podczas aktywnego treningu.'
            );
            return;
          }
          if (onDisconnectExternalHrStrap) {
            onDisconnectExternalHrStrap();
          }
        }}
        onNotifyToast={onNotifyToast}
      />

      {/* 3-PAGE COCKPIT INTERFACE HELP OVERLAY (?) */}
      <CockpitHelpGuideModal
        isOpen={isHelpGuideOpen}
        onClose={() => setIsHelpGuideOpen(false)}
      />
    </div>
  );
};
