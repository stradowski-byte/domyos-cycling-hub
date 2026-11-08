import React, { useState } from 'react';
import {
  Volume2,
  VolumeX,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Square,
  Bluetooth,
  Cpu,
  Sliders,
  ArrowLeft,
  AlertTriangle,
} from 'lucide-react';
import {
  AthleteProfile,
  LiveBikeTelemetry,
  StructuredWorkout,
  TelemetryRecord,
} from '../types/cycling';
import {
  calculateBlockInstantTarget,
  getHrZoneForBpm,
  getPowerZoneForWatts,
} from '../services/rampAndPhysiologyEngine';
import { WorkoutProfileChart } from './WorkoutProfileChart';

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
  onStopAndFinish: () => void;
  onPrevBlock: () => void;
  onNextBlock: () => void;
  onJumpToBlock: (index: number) => void;
  onChangeBias: (deltaPct: number) => void;
  onResetBias: () => void;
  onChangeMode: (mode: 'erg_watts' | 'resistance_level') => void;
  onChangeResistance: (deltaLevel: number) => void;
  onToggleSound: () => void;
  onConnectDomyos: () => void;
  onToggleSimulator: () => void;
  onConnectExternalPower: () => void;
  onBackToWorkouts?: () => void;
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
  onToggleSimulator,
  onConnectExternalPower,
  onBackToWorkouts,
}) => {
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);

  const safeBlockIndex = Math.min(
    Math.max(0, currentBlockIndex),
    Math.max(0, workout.blocks.length - 1)
  );
  const currentBlock = workout.blocks[safeBlockIndex];
  const nextBlock =
    safeBlockIndex + 1 < workout.blocks.length
      ? workout.blocks[safeBlockIndex + 1]
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

  return (
    <div className="min-h-[calc(100dvh-118px)] md:h-[calc(100dvh-76px)] flex flex-col justify-between gap-1.5 sm:gap-2 select-none max-w-full overflow-x-hidden">
      {/* 1. COMPACT GARMIN STATUS & BIKE CONNECTION HEADER */}
      <div className="rounded-xl bg-[#131B26] border border-slate-800 px-2.5 sm:px-3 py-2 flex items-center justify-between gap-2 shrink-0 min-w-0">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
          {onBackToWorkouts && (
            <button
              onClick={onBackToWorkouts}
              className="min-h-[36px] px-2 sm:px-2.5 py-1 rounded-lg bg-[#0B0F17] hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1 shrink-0"
              title="Wróć do listy treningów"
            >
              <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Treningi</span>
            </button>
          )}
          <div className="truncate min-w-0">
            <div className="text-xs font-bold text-white truncate">{workout.name}</div>
            <div className="text-[10px] text-slate-400 truncate">
              {profile.name} · FTP {profile.ftpWatts}W
              {telemetry.externalPowerConnected ? ` · PM ${telemetry.powerMatchOffsetWatts >= 0 ? '+' : ''}${telemetry.powerMatchOffsetWatts}W` : ''}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          <button
            onClick={onConnectDomyos}
            className={`min-h-[36px] px-2.5 sm:px-3 py-1.5 rounded-lg border text-[11px] sm:text-xs font-bold flex items-center gap-1 sm:gap-1.5 transition-colors whitespace-nowrap ${
              telemetry.connected && !telemetry.isSimulator
                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                : 'bg-emerald-500 hover:bg-emerald-400 border-emerald-400 text-slate-950'
            }`}
          >
            <Bluetooth className="w-3.5 h-3.5 shrink-0" />
            <span className="sm:hidden">
              {telemetry.connected && !telemetry.isSimulator ? 'Połączono' : 'Rower'}
            </span>
            <span className="hidden sm:inline">
              {telemetry.connected && !telemetry.isSimulator
                ? 'Rower Połączony'
                : 'Połącz Rower'}
            </span>
          </button>

          <button
            onClick={onToggleSimulator}
            className={`min-h-[36px] px-2 sm:px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold flex items-center gap-1 transition-colors ${
              telemetry.isSimulator
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                : 'bg-[#0B0F17] border-slate-700 text-slate-300 hover:text-white'
            }`}
            title="Symulator roweru Domyos FTMS"
          >
            <Cpu className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">Symulator</span>
          </button>

          <button
            onClick={onConnectExternalPower}
            className="min-h-[36px] px-2 py-1.5 rounded-lg bg-[#0B0F17] border border-slate-700 text-slate-300 hover:text-white text-[11px] flex items-center"
            title="Sparuj zewnętrzny miernik mocy (Power Match)"
          >
            <Sliders className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={onToggleSound}
            className="min-h-[36px] px-2 py-1.5 rounded-lg bg-[#0B0F17] border border-slate-700 text-slate-300 hover:text-white text-[11px] flex items-center"
            title="Dźwięki odliczania końca interwału 3-2-1"
          >
            {soundEnabled ? (
              <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <VolumeX className="w-3.5 h-3.5 text-slate-500" />
            )}
          </button>
        </div>
      </div>

      {/* 2. GARMIN EDGE SQUARE DATA FIELDS GRID (6 COMPACT CELLS, NO VIRTUAL SPEED) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 sm:gap-2 flex-1 min-h-0">
        {/* FIELD 1: POWER (WATTS) + TARGET WATTS */}
        <div
          onClick={onToggle3sSmoothing}
          className="rounded-xl bg-[#131B26] border border-slate-800 px-2.5 sm:px-3.5 py-2 sm:py-2.5 flex flex-col justify-between cursor-pointer min-w-0 overflow-hidden"
          title="Stuknij, aby przełączyć wygładzanie mocy 3s / 1s"
        >
          <div className="flex items-center justify-between gap-1 text-[10px] font-bold tracking-wider text-slate-400 uppercase min-w-0">
            <span className="truncate">MOC ({use3sPowerSmoothing ? '3S' : '1S'})</span>
            <span className="text-emerald-400 font-mono-tabular shrink-0">
              CEL {targetWatts}W
            </span>
          </div>

          <div className="flex items-baseline justify-between gap-1 my-auto py-0.5 min-w-0">
            <div className="flex items-baseline gap-1 min-w-0">
              <span className="font-mono-tabular text-3xl sm:text-5xl font-extrabold tracking-tight text-white leading-none truncate">
                {displayedWatts}
              </span>
              <span className="text-[11px] sm:text-xs font-bold text-slate-400 shrink-0">W</span>
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

          <div className="flex items-center justify-between gap-1 text-[10px] sm:text-[11px] pt-1 border-t border-slate-800/80 min-w-0">
            <span
              style={{ color: currentPowerZone.color }}
              className="font-bold truncate min-w-0"
            >
              {currentPowerZone.name}
            </span>
            <span className="font-mono-tabular text-slate-400 shrink-0">
              {Math.round((displayedWatts / Math.max(1, profile.ftpWatts)) * 100)}% FTP
            </span>
          </div>
        </div>

        {/* FIELD 2: INTERVAL TIMER (DECREASING COUNTDOWN) */}
        <div className="rounded-xl bg-[#131B26] border border-slate-800 px-2.5 sm:px-3.5 py-2 sm:py-2.5 flex flex-col justify-between min-w-0 overflow-hidden">
          <div className="flex items-center justify-between gap-1 text-[10px] font-bold tracking-wider text-amber-400 uppercase min-w-0">
            <span className="truncate">INTERWAŁ</span>
            <span className="font-mono-tabular text-slate-300 shrink-0">
              {safeBlockIndex + 1}/{workout.blocks.length}
            </span>
          </div>

          <div className="my-auto py-0.5 flex items-baseline justify-between gap-1 min-w-0">
            <span
              className={`font-mono-tabular text-3xl sm:text-5xl font-extrabold tracking-tight leading-none truncate ${
                remainingInBlockSec <= 5 && isRunning && !isPaused
                  ? 'text-rose-400'
                  : 'text-amber-400'
              }`}
            >
              {formatDurationClock(remainingInBlockSec)}
            </span>
          </div>

          <div className="flex items-center justify-between gap-1 text-[10px] sm:text-[11px] pt-1 border-t border-slate-800/80 min-w-0">
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

        {/* FIELD 3: HEART RATE (BPM) */}
        <div className="rounded-xl bg-[#131B26] border border-slate-800 px-2.5 sm:px-3.5 py-2 sm:py-2.5 flex flex-col justify-between min-w-0 overflow-hidden">
          <div className="flex items-center justify-between gap-1 text-[10px] font-bold tracking-wider text-slate-400 uppercase min-w-0">
            <span className="truncate">TĘTNO (HR)</span>
            <span className="font-mono-tabular text-rose-400 shrink-0">
              {telemetry.heartRateBpm > 0
                ? `${Math.round((telemetry.heartRateBpm / profile.maxHrBpm) * 100)}% MAX`
                : `MAX ${profile.maxHrBpm}`}
            </span>
          </div>

          <div className="my-auto py-0.5 flex items-baseline gap-1 min-w-0">
            <span className="font-mono-tabular text-3xl sm:text-5xl font-extrabold tracking-tight text-white leading-none truncate">
              {telemetry.heartRateBpm || '--'}
            </span>
            <span className="text-[11px] sm:text-xs font-bold text-rose-400 shrink-0">BPM</span>
          </div>

          <div className="flex items-center justify-between gap-1 text-[10px] sm:text-[11px] pt-1 border-t border-slate-800/80 min-w-0">
            <span
              style={{ color: currentHrZone.color }}
              className="font-bold truncate min-w-0"
            >
              {currentHrZone.name}
            </span>
            <span className="font-mono-tabular text-slate-400 shrink-0">
              {currentHrZone.minBpm}–{currentHrZone.maxBpm}
            </span>
          </div>
        </div>

        {/* FIELD 4: CADENCE (RPM) */}
        <div className="rounded-xl bg-[#131B26] border border-slate-800 px-2.5 sm:px-3.5 py-2 sm:py-2.5 flex flex-col justify-between min-w-0 overflow-hidden">
          <div className="flex items-center justify-between gap-1 text-[10px] font-bold tracking-wider text-slate-400 uppercase min-w-0">
            <span className="truncate">KADENCJA</span>
            {currentBlock?.targetCadenceRpm ? (
              <span className="font-mono-tabular text-sky-400 shrink-0">
                CEL {currentBlock.targetCadenceRpm}
              </span>
            ) : (
              <span className="font-mono-tabular text-slate-400 shrink-0">RPM</span>
            )}
          </div>

          <div className="my-auto py-0.5 flex items-baseline gap-1 min-w-0">
            <span className="font-mono-tabular text-3xl sm:text-5xl font-extrabold tracking-tight text-white leading-none truncate">
              {telemetry.cadenceRpm}
            </span>
            <span className="text-[11px] sm:text-xs font-bold text-sky-400 shrink-0">RPM</span>
          </div>

          <div className="flex items-center justify-between gap-1 text-[10px] sm:text-[11px] pt-1 border-t border-slate-800/80 min-w-0">
            <span className="text-slate-400 truncate">Opór</span>
            <span className="font-mono-tabular font-bold text-slate-200 shrink-0">
              Poz. {telemetry.resistanceLevel}/32
            </span>
          </div>
        </div>

        {/* FIELD 5: TOTAL WORKOUT TIME (PROGRESSIVE) */}
        <div className="rounded-xl bg-[#131B26] border border-slate-800 px-2.5 sm:px-3.5 py-2 sm:py-2.5 flex flex-col justify-between min-w-0 overflow-hidden">
          <div className="flex items-center justify-between gap-1 text-[10px] font-bold tracking-wider text-slate-400 uppercase min-w-0">
            <span className="truncate">CZAS JAZDY</span>
            <span className="font-mono-tabular text-slate-400 shrink-0">
              {formatDurationClock(totalWorkoutDurationSec)}
            </span>
          </div>

          <div className="my-auto py-0.5 flex items-baseline gap-1 min-w-0">
            <span className="font-mono-tabular text-2xl sm:text-5xl font-extrabold tracking-tight text-white leading-none truncate">
              {formatDurationClock(elapsedWorkoutSec)}
            </span>
          </div>

          <div className="flex items-center justify-between gap-1 text-[10px] sm:text-[11px] pt-1 border-t border-slate-800/80 min-w-0">
            <span className="text-slate-400 truncate min-w-0">
              Nast.:{' '}
              <strong className="text-slate-200">
                {nextBlock ? nextBlock.label : 'Koniec'}
              </strong>
            </span>
          </div>
        </div>

        {/* FIELD 6: INSTANT ERG / RESISTANCE CONTROL CELL */}
        <div className="rounded-xl bg-[#131B26] border border-slate-800 px-2.5 sm:px-3 py-2 sm:py-2.5 flex flex-col justify-between min-w-0 overflow-hidden">
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
            <div className="grid grid-cols-3 gap-1 my-auto pt-1">
              <button
                onClick={() => onChangeBias(-5)}
                className="min-h-[36px] sm:min-h-[38px] rounded-lg bg-[#0B0F17] hover:bg-slate-800 border border-slate-700 font-mono-tabular text-[11px] sm:text-xs font-bold text-white"
              >
                -5%
              </button>
              <button
                onClick={onResetBias}
                className="min-h-[36px] sm:min-h-[38px] rounded-lg bg-[#0B0F17] border border-emerald-500/40 font-mono-tabular text-[11px] sm:text-xs font-extrabold text-emerald-400"
              >
                {telemetry.biasPercent}%
              </button>
              <button
                onClick={() => onChangeBias(5)}
                className="min-h-[36px] sm:min-h-[38px] rounded-lg bg-[#0B0F17] hover:bg-slate-800 border border-slate-700 font-mono-tabular text-[11px] sm:text-xs font-bold text-white"
              >
                +5%
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1 my-auto pt-1">
              <button
                onClick={() => onChangeResistance(-1)}
                className="min-h-[36px] sm:min-h-[38px] rounded-lg bg-[#0B0F17] hover:bg-slate-800 border border-slate-700 font-mono-tabular text-[11px] sm:text-xs font-bold text-white"
              >
                -1
              </button>
              <span className="min-h-[36px] sm:min-h-[38px] rounded-lg bg-[#0B0F17] border border-amber-500/40 flex items-center justify-center font-mono-tabular text-[11px] sm:text-xs font-extrabold text-amber-400">
                {targetResistance}/32
              </span>
              <button
                onClick={() => onChangeResistance(1)}
                className="min-h-[36px] sm:min-h-[38px] rounded-lg bg-[#0B0F17] hover:bg-slate-800 border border-slate-700 font-mono-tabular text-[11px] sm:text-xs font-bold text-white"
              >
                +1
              </button>
            </div>
          )}

          <div className="flex items-center justify-between gap-1 text-[10px] text-slate-400 pt-1 border-t border-slate-800/80 min-w-0">
            <span className="truncate">Korekta</span>
            <span className="font-mono-tabular text-slate-300 shrink-0">
              {telemetry.controlMode === 'erg_watts' ? `${targetWatts}W` : `Poz. ${targetResistance}`}
            </span>
          </div>
        </div>
      </div>

      {/* 3. WORKOUT TIMELINE WITH PROMINENT POSITION ARROW (▼) */}
      <div className="rounded-xl bg-[#131B26] border border-slate-800 px-2.5 sm:px-3 py-1.5 sm:py-2 space-y-1 shrink-0 min-w-0 overflow-hidden">
        <div className="flex items-center justify-between gap-2 text-[11px] min-w-0">
          <div className="flex items-center gap-1.5 text-slate-300 font-semibold truncate min-w-0">
            <span className="text-emerald-400 shrink-0">▼ ODCINEK:</span>
            <span className="text-white truncate">
              {currentBlock?.label} ({targetWatts}W)
            </span>
          </div>
          <span className="hidden sm:inline font-mono-tabular text-[11px] text-slate-400 shrink-0">
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
          height={82}
          compact={true}
          onSelectBlock={onJumpToBlock}
        />
      </div>

      {/* 4. SINGLE-ROW BOTTOM RIDE TRANSPORT BAR */}
      <div className="grid grid-cols-12 gap-1.5 sm:gap-2 shrink-0">
        <button
          onClick={onPrevBlock}
          disabled={safeBlockIndex === 0}
          className="col-span-2 min-h-[46px] rounded-xl bg-[#131B26] hover:bg-slate-800 border border-slate-800 disabled:opacity-40 text-white flex items-center justify-center"
          title="Poprzedni blok"
        >
          <SkipBack className="w-4 h-4" />
        </button>

        {!isRunning || isPaused ? (
          <button
            onClick={onStartOrResume}
            className="col-span-5 min-h-[46px] px-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-1.5 sm:gap-2 transition-colors truncate"
          >
            <Play className="w-4 h-4 fill-current shrink-0" />
            <span className="truncate">{!isRunning ? 'START' : 'WZNÓW'}</span>
            <span className="hidden sm:inline">{!isRunning ? 'TRENINGU' : 'JAZDĘ'}</span>
          </button>
        ) : (
          <button
            onClick={onPause}
            className="col-span-5 min-h-[46px] px-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-1.5 sm:gap-2 transition-colors truncate"
          >
            <Pause className="w-4 h-4 fill-current shrink-0" />
            <span className="truncate">PAUZA</span>
          </button>
        )}

        <button
          onClick={onNextBlock}
          disabled={safeBlockIndex >= workout.blocks.length - 1}
          className="col-span-2 min-h-[46px] rounded-xl bg-[#131B26] hover:bg-slate-800 border border-slate-800 disabled:opacity-40 text-white flex items-center justify-center"
          title="Następny blok"
        >
          <SkipForward className="w-4 h-4" />
        </button>

        <button
          onClick={() => setShowFinishConfirm(true)}
          disabled={!isRunning && liveRecords.length === 0}
          className="col-span-3 min-h-[46px] px-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 disabled:opacity-40 text-rose-300 font-bold text-[11px] sm:text-xs flex items-center justify-center gap-1 sm:gap-1.5 transition-colors truncate"
        >
          <Square className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-current shrink-0" />
          <span className="truncate">ZAKOŃCZ</span>
        </button>
      </div>

      {/* CONFIRMATION DIALOG BEFORE ENDING WORKOUT */}
      {showFinishConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-[#131B26] border border-slate-700 p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2.5 text-amber-400">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="text-base font-bold text-white">
                Zakończyć trening?
              </h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed break-words">
              Czy na pewno chcesz zakończyć trening <strong>{workout.name}</strong> ({formatDurationClock(elapsedWorkoutSec)}) i zapisać sesję do pliku <code>.FIT</code>?
            </p>
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                onClick={() => setShowFinishConfirm(false)}
                className="min-h-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 transition-colors"
              >
                Wróć do jazdy
              </button>
              <button
                onClick={() => {
                  setShowFinishConfirm(false);
                  onStopAndFinish();
                }}
                className="min-h-[44px] rounded-xl bg-rose-500 hover:bg-rose-400 text-xs font-bold text-slate-950 transition-colors"
              >
                Tak, zakończ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
