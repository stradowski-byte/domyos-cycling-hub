import React, { useRef, useState } from 'react';
import {
  Play,
  Plus,
  Trash2,
  RefreshCw,
  Calendar,
  TrendingUp,
  Layers,
  Save,
  FileText,
  Download,
  Upload,
  FolderSync,
} from 'lucide-react';
import {
  AthleteProfile,
  ProfileId,
  RampCurveType,
  StructuredWorkout,
  WorkoutBlock,
} from '../types/cycling';
import {
  calculateBlockInstantTarget,
  downloadWorkoutAsTextFile,
  formatBlocksToIntervalsText,
  parseIcuTextFileToWorkout,
  parseIntervalsWorkoutText,
} from '../services/rampAndPhysiologyEngine';
import { WorkoutProfileChart } from './WorkoutProfileChart';
import { formatDurationClock } from './LiveCockpitView';

interface WorkoutsAndRampBuilderViewProps {
  activeProfile: AthleteProfile;
  profiles?: Record<ProfileId, AthleteProfile>;
  workouts: StructuredWorkout[];
  selectedWorkoutId: string;
  isSyncingIntervals: boolean;
  isSyncingDriveTxt?: boolean;
  onSelectAndLoadWorkout: (workout: StructuredWorkout, startImmediately?: boolean) => void;
  onSaveWorkout: (workout: StructuredWorkout) => void;
  onDeleteWorkout: (workoutId: string) => void;
  onSyncFromIntervalsIcu: () => void;
  onSyncTxtWorkoutsFolder?: () => void;
}

export const WorkoutsAndRampBuilderView: React.FC<WorkoutsAndRampBuilderViewProps> = ({
  activeProfile,
  profiles,
  workouts,
  selectedWorkoutId,
  isSyncingIntervals,
  isSyncingDriveTxt = false,
  onSelectAndLoadWorkout,
  onSaveWorkout,
  onDeleteWorkout,
  onSyncFromIntervalsIcu,
  onSyncTxtWorkoutsFolder,
}) => {
  const [filterScope, setFilterScope] = useState<'profile' | 'all' | 'intervals'>('profile');
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const txtFileInputRef = useRef<HTMLInputElement | null>(null);

  // Builder state
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState('Nowy Trening');
  const [description, setDescription] = useState(
    'Trening kolarski dla Domyos Challenge Bike.'
  );
  const [targetProfile, setTargetProfile] = useState<ProfileId | 'shared'>(activeProfile.id);
  const [scheduledDate, setScheduledDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [blocks, setBlocks] = useState<WorkoutBlock[]>([
    {
      id: 'b_init_1',
      label: 'Rozgrzewka',
      type: 'ramp',
      durationSec: 480,
      unit: 'pct_ftp',
      startValue: 45,
      endValue: 75,
      rampCurve: 'linear',
      targetCadenceRpm: 88,
    },
    {
      id: 'b_init_2',
      label: 'Część główna',
      type: 'steady',
      durationSec: 420,
      unit: 'pct_ftp',
      startValue: 88,
      endValue: 88,
      rampCurve: 'linear',
      targetCadenceRpm: 92,
    },
    {
      id: 'b_init_3',
      label: 'Schłodzenie',
      type: 'ramp',
      durationSec: 300,
      unit: 'pct_ftp',
      startValue: 65,
      endValue: 42,
      rampCurve: 'linear',
      targetCadenceRpm: 82,
    },
  ]);

  const [intervalsTextInput, setIntervalsTextInput] = useState(
    formatBlocksToIntervalsText(blocks)
  );
  const [showTextEditor, setShowTextEditor] = useState(false);

  const filteredWorkouts = workouts.filter((w) => {
    if (filterScope === 'intervals') {
      return w.source === 'intervals_calendar' || w.source === 'intervals_library';
    }
    if (filterScope === 'profile') {
      const belongsToProfile = w.profileId === activeProfile.id || w.profileId === 'shared';
      if (!belongsToProfile) return false;
      // If workout is explicitly assigned to this profile, always show it;
      // for shared default workouts, filter if user selected a specific offline focus mode
      if (w.profileId === 'shared' && activeProfile.offlineMode === 'ftp_builder') {
        return w.category !== 'Recovery';
      }
      if (w.profileId === 'shared' && activeProfile.offlineMode === 'cardio_fitness') {
        return w.category === 'Endurance' || w.category === 'Recovery' || w.category === 'Custom';
      }
      return true;
    }
    return true;
  });

  const openNewBuilder = () => {
    setEditId(null);
    setTitle(`Trening (${activeProfile.name.split(' ')[0]})`);
    setTargetProfile(activeProfile.id);
    setScheduledDate(new Date().toISOString().slice(0, 10));
    setIsBuilderOpen(true);
  };

  const openEditWorkout = (w: StructuredWorkout) => {
    setEditId(w.id);
    setTitle(w.name);
    setDescription(w.description);
    setTargetProfile(w.profileId);
    setScheduledDate(w.scheduledDate || new Date().toISOString().slice(0, 10));
    setBlocks(w.blocks.map((b) => ({ ...b })));
    setIntervalsTextInput(formatBlocksToIntervalsText(w.blocks));
    setIsBuilderOpen(true);
  };

  const handleAddBlock = (preset: 'ramp_up' | 'steady' | 'resistance_ramp' | 'cooldown') => {
    const id = `blk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    let newBlock: WorkoutBlock;
    if (preset === 'ramp_up') {
      newBlock = {
        id,
        label: 'Rampa Progresywna',
        type: 'ramp',
        durationSec: 360,
        unit: 'pct_ftp',
        startValue: 75,
        endValue: 102,
        rampCurve: 'progressive',
        targetCadenceRpm: 92,
      };
    } else if (preset === 'resistance_ramp') {
      newBlock = {
        id,
        label: 'Narastający Opór (Siła)',
        type: 'ramp',
        durationSec: 300,
        unit: 'pct_ftp',
        startValue: 70,
        endValue: 95,
        rampCurve: 'linear',
        targetCadenceRpm: 75,
        startResistanceLevel: 10,
        endResistanceLevel: 22,
      };
    } else if (preset === 'cooldown') {
      newBlock = {
        id,
        label: 'Schłodzenie Rampa',
        type: 'ramp',
        durationSec: 300,
        unit: 'pct_ftp',
        startValue: 60,
        endValue: 40,
        rampCurve: 'linear',
        targetCadenceRpm: 80,
      };
    } else {
      newBlock = {
        id,
        label: 'Stały Interwał ERG',
        type: 'steady',
        durationSec: 240,
        unit: 'pct_ftp',
        startValue: 90,
        endValue: 90,
        rampCurve: 'linear',
        targetCadenceRpm: 90,
      };
    }
    const updated = [...blocks, newBlock];
    setBlocks(updated);
    setIntervalsTextInput(formatBlocksToIntervalsText(updated));
  };

  const handleUpdateBlock = (idx: number, patch: Partial<WorkoutBlock>) => {
    const next = blocks.map((b, i) => {
      if (i !== idx) return b;
      const merged = { ...b, ...patch };
      if (merged.type === 'steady' && patch.startValue !== undefined) {
        merged.endValue = patch.startValue;
      }
      return merged;
    });
    setBlocks(next);
    setIntervalsTextInput(formatBlocksToIntervalsText(next));
  };

  const handleRemoveBlock = (idx: number) => {
    if (blocks.length <= 1) return;
    const next = blocks.filter((_, i) => i !== idx);
    setBlocks(next);
    setIntervalsTextInput(formatBlocksToIntervalsText(next));
  };

  const handleApplyTextSyntax = () => {
    const parsed = parseIntervalsWorkoutText(intervalsTextInput, activeProfile.ftpWatts);
    if (parsed.length > 0) {
      setBlocks(parsed);
    }
  };

  const handleSaveBuiltWorkout = (startAfterSave: boolean) => {
    const newWorkout: StructuredWorkout = {
      id: editId || `w_custom_${Date.now()}`,
      profileId: targetProfile,
      name: title.trim() || 'Trening Własny',
      description: description.trim(),
      category: 'Custom',
      scheduledDate: scheduledDate || undefined,
      source: 'local',
      blocks,
      createdAtIso: new Date().toISOString(),
    };
    onSaveWorkout(newWorkout);
    setIsBuilderOpen(false);
    if (startAfterSave) {
      onSelectAndLoadWorkout(newWorkout, true);
    }
  };

  const handleImportTxtFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      try {
        const text = await file.text();
        const parsedWorkout = parseIcuTextFileToWorkout(text, file.name, activeProfile.id);
        onSaveWorkout(parsedWorkout);
      } catch (err) {
        console.warn('Nie udało się wczytać pliku .txt:', file.name, err);
      }
    }
    e.target.value = '';
  };

  return (
    <div className="space-y-5 pb-8 min-w-0 max-w-full overflow-x-hidden">
      {/* Top Toolbar: Filter Tabs + Intervals.icu Sync + .TXT Folder Sync + Offline Ramp Creator Trigger */}
      <div className="rounded-2xl bg-[#131B26] border border-slate-800 p-3.5 sm:p-4 space-y-3 min-w-0 overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 min-w-0">
          {/* 3-Segment Filter Bar: 3 equal columns on mobile so 'Intervals.icu' never overflows screen */}
          <div className="grid grid-cols-3 sm:flex items-center gap-1 p-1 bg-[#0B0F17] rounded-xl border border-slate-800 w-full lg:w-auto min-w-0">
            <button
              onClick={() => setFilterScope('profile')}
              className={`min-h-[38px] px-2 sm:px-3.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold transition-colors truncate text-center min-w-0 ${
                filterScope === 'profile'
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'text-slate-300 hover:text-white'
              }`}
              title={`Plan dla: ${activeProfile.name}`}
            >
              <span className="sm:hidden">Plan: {activeProfile.name}</span>
              <span className="hidden sm:inline">Plan dla: {activeProfile.name}</span>
            </button>
            <button
              onClick={() => setFilterScope('intervals')}
              className={`min-h-[38px] px-2 sm:px-3.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold transition-colors truncate text-center min-w-0 ${
                filterScope === 'intervals'
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'text-slate-300 hover:text-white'
              }`}
              title="Z biblioteki Intervals.icu"
            >
              <span className="sm:hidden">Z bibl. ICU</span>
              <span className="hidden sm:inline">Z biblioteki Intervals.icu</span>
            </button>
            <button
              onClick={() => setFilterScope('all')}
              className={`min-h-[38px] px-2 sm:px-3.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold transition-colors truncate text-center min-w-0 ${
                filterScope === 'all'
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'text-slate-300 hover:text-white'
              }`}
              title={`Wszystkie (${workouts.length})`}
            >
              Wszystkie ({workouts.length})
            </button>
          </div>

          {/* Action Buttons: 2x2 grid on mobile, inline flex on desktop */}
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full lg:w-auto min-w-0">
            <input
              ref={txtFileInputRef}
              type="file"
              accept=".txt,.icu"
              multiple
              onChange={handleImportTxtFiles}
              className="hidden"
            />
            <button
              onClick={() => txtFileInputRef.current?.click()}
              className="min-h-[42px] px-2.5 sm:px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors min-w-0 truncate"
              title="Wczytaj pojedyncze lub wiele plików tekstowych .txt do folderu aktywnego profilu"
            >
              <Upload className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="truncate">Wczytaj .TXT (/{activeProfile.id})</span>
            </button>

            {onSyncTxtWorkoutsFolder && (
              <button
                onClick={onSyncTxtWorkoutsFolder}
                disabled={isSyncingDriveTxt}
                className="min-h-[42px] px-2.5 sm:px-3.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors min-w-0 truncate"
                title="Synchronizuj treningi z centralną bazą Firebase Firestore i pamięcią OPFS"
              >
                <FolderSync className={`w-3.5 h-3.5 shrink-0 ${isSyncingDriveTxt ? 'animate-spin' : ''}`} />
                <span className="truncate">Sync Firebase</span>
              </button>
            )}

            <button
              onClick={onSyncFromIntervalsIcu}
              disabled={isSyncingIntervals}
              className="min-h-[42px] px-2.5 sm:px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors min-w-0 truncate"
            >
              <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isSyncingIntervals ? 'animate-spin text-emerald-400' : ''}`} />
              <span className="truncate">Sync Intervals.icu</span>
            </button>

            <button
              onClick={() => (isBuilderOpen ? setIsBuilderOpen(false) : openNewBuilder())}
              className="min-h-[42px] px-3 sm:px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1.5 transition-colors min-w-0 truncate"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span className="truncate">{isBuilderOpen ? 'Zamknij Kreator' : 'Nowy Trening'}</span>
            </button>
          </div>
        </div>

        <div className="rounded-xl bg-[#0B0F17] border border-slate-800/90 px-3 py-2 text-[11px] text-slate-400 leading-relaxed break-words min-w-0 flex flex-wrap items-center justify-between gap-2">
          <span>
            Treningi <code className="text-slate-300">.txt</code> zapisują się w podkatalogu aktywnego profilu:{' '}
            <code className="text-emerald-400 break-all">/Workouts_Library/{activeProfile.id}/</code> oraz wspólnym{' '}
            <code className="text-amber-400 break-all">/Workouts_Library/shared/</code>.
          </span>
          <span className="text-slate-300 font-semibold">
            Tryb profilu:{' '}
            <span className="text-emerald-400">
              {activeProfile.offlineMode === 'ftp_builder'
                ? 'Budowa FTP & Interwały'
                : activeProfile.offlineMode === 'cardio_fitness'
                ? 'Cardio & Spalanie'
                : 'Wszystkie treningi'}
            </span>
          </span>
        </div>
      </div>

      {/* OFFLINE VISUAL WORKOUT CREATOR */}
      {isBuilderOpen && (
        <div className="rounded-2xl bg-[#131B26] border border-emerald-500/40 p-3.5 sm:p-5 space-y-4 min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3.5">
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-white">
                Kreator Treningu
              </h2>
              <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                Układaj bloki o stałej mocy, bloki ze zmienną mocą (ramp) lub odcinki oporowe. Waty są automatycznie przeliczane względem FTP profilu ({activeProfile.ftpWatts} W).
              </p>
            </div>
            <button
              onClick={() => setShowTextEditor(!showTextEditor)}
              className="w-full sm:w-auto min-h-[38px] px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 flex items-center justify-center gap-1.5"
            >
              <FileText className="w-4 h-4 text-emerald-400 shrink-0" />
              {showTextEditor ? 'Ukryj składnię tekstową' : 'Wklej tekst Intervals.icu'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            <div className="min-w-0">
              <label className="block text-xs text-slate-400 mb-1">Nazwa treningu</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full h-10 px-3 rounded-xl bg-[#0B0F17] border border-slate-700 text-sm text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div className="min-w-0">
              <label className="block text-xs text-slate-400 mb-1">Przypisz do profilu</label>
              <select
                value={targetProfile}
                onChange={(e) => setTargetProfile(e.target.value as ProfileId | 'shared')}
                className="w-full h-10 px-3 rounded-xl bg-[#0B0F17] border border-slate-700 text-sm text-white focus:border-emerald-500 focus:outline-none"
              >
                {profiles
                  ? Object.values(profiles).map((prof) => (
                      <option key={prof.id} value={prof.id}>
                        {prof.name} (/{prof.id} · FTP {prof.ftpWatts}W)
                      </option>
                    ))
                  : (
                    <option value={activeProfile.id}>
                      {activeProfile.name} (/{activeProfile.id})
                    </option>
                  )}
                <option value="shared">Wspólny dla wszystkich profili (/shared)</option>
              </select>
            </div>

            <div className="min-w-0">
              <label className="block text-xs text-slate-400 mb-1">Zaplanowana data</label>
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="w-full h-10 px-3 rounded-xl bg-[#0B0F17] border border-slate-700 text-sm text-white font-mono-tabular focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Optional Intervals.icu text syntax import */}
          {showTextEditor && (
            <div className="rounded-xl bg-[#0B0F17] border border-slate-800 p-3.5 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                <span>
                  Składnia Intervals.icu (np. <code>- 10m ramp 50-80% 90rpm</code> lub powtórzenia <code>4x</code>)
                </span>
                <button
                  onClick={handleApplyTextSyntax}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 font-semibold hover:bg-emerald-500/30"
                >
                  Przelicz tekst na bloki i rampy
                </button>
              </div>
              <textarea
                rows={4}
                value={intervalsTextInput}
                onChange={(e) => setIntervalsTextInput(e.target.value)}
                className="w-full p-3 rounded-lg bg-[#131B26] border border-slate-700 font-mono-tabular text-xs text-slate-200 focus:outline-none"
              />
            </div>
          )}

          {/* Live Preview of the Built Ramp & Interval Chart */}
          <div className="space-y-1.5 min-w-0">
            <div className="text-[11px] sm:text-xs text-slate-400">
              PODGLĄD KRZYWEJ MOCY I RAMP DLA PROFILU {activeProfile.name.toUpperCase()} (FTP {activeProfile.ftpWatts}W):
            </div>
            <WorkoutProfileChart
              blocks={blocks}
              profile={activeProfile}
              height={135}
            />
          </div>

          {/* Add Block Buttons */}
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
            <button
              onClick={() => handleAddBlock('steady')}
              className="min-h-[40px] px-3 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1.5 truncate"
            >
              <Layers className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">+ Stały Blok</span>
            </button>
            <button
              onClick={() => handleAddBlock('ramp_up')}
              className="min-h-[40px] px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1.5 truncate"
            >
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="truncate">+ Blok Ramp</span>
            </button>
            <button
              onClick={() => handleAddBlock('resistance_ramp')}
              className="min-h-[40px] px-3 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1.5 truncate"
            >
              <span className="truncate">+ Blok Oporu (1–32)</span>
            </button>
            <button
              onClick={() => handleAddBlock('cooldown')}
              className="min-h-[40px] px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] sm:text-xs font-semibold flex items-center justify-center truncate"
            >
              <span className="truncate">+ Schłodzenie</span>
            </button>
          </div>

          {/* Editable Blocks List */}
          <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1 min-w-0">
            {blocks.map((b, idx) => {
              const startW = calculateBlockInstantTarget(b, 0, activeProfile.ftpWatts).targetWatts;
              const endW = calculateBlockInstantTarget(
                b,
                b.durationSec,
                activeProfile.ftpWatts
              ).targetWatts;

              return (
                <div
                  key={b.id}
                  className="rounded-xl bg-[#0B0F17] border border-slate-800 p-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-12 gap-2.5 items-center min-w-0"
                >
                  <div className="col-span-2 sm:col-span-2 lg:col-span-3 min-w-0">
                    <label className="block text-[11px] text-slate-400 truncate">Etykieta odcinka</label>
                    <input
                      type="text"
                      value={b.label}
                      onChange={(e) => handleUpdateBlock(idx, { label: e.target.value })}
                      className="w-full h-9 px-2.5 rounded-lg bg-[#131B26] border border-slate-700 text-xs text-white min-w-0"
                    />
                  </div>

                  <div className="col-span-1 sm:col-span-1 lg:col-span-2 min-w-0">
                    <label className="block text-[11px] text-slate-400 truncate">Typ obciążenia</label>
                    <select
                      value={b.type}
                      onChange={(e) =>
                        handleUpdateBlock(idx, { type: e.target.value as WorkoutBlock['type'] })
                      }
                      className="w-full h-9 px-2 rounded-lg bg-[#131B26] border border-slate-700 text-xs text-white min-w-0"
                    >
                      <option value="ramp">Rampa (Zmienna)</option>
                      <option value="steady">Stałe Waty</option>
                      <option value="resistance">Poziom Oporu</option>
                    </select>
                  </div>

                  <div className="col-span-1 sm:col-span-1 lg:col-span-1 min-w-0">
                    <label className="block text-[11px] text-slate-400 truncate">Czas (min)</label>
                    <input
                      type="number"
                      min={0.5}
                      step={0.5}
                      value={Number((b.durationSec / 60).toFixed(1))}
                      onChange={(e) =>
                        handleUpdateBlock(idx, {
                          durationSec: Math.max(15, Math.round(parseFloat(e.target.value || '1') * 60)),
                        })
                      }
                      className="w-full h-9 px-2 rounded-lg bg-[#131B26] border border-slate-700 font-mono-tabular text-xs text-white min-w-0"
                    />
                  </div>

                  <div className="col-span-1 sm:col-span-1 lg:col-span-1 min-w-0">
                    <label className="block text-[11px] text-slate-400 truncate">Jedn.</label>
                    <select
                      value={b.unit}
                      onChange={(e) =>
                        handleUpdateBlock(idx, { unit: e.target.value as 'pct_ftp' | 'watts' })
                      }
                      className="w-full h-9 px-1.5 rounded-lg bg-[#131B26] border border-slate-700 text-xs text-white min-w-0"
                    >
                      <option value="pct_ftp">% FTP</option>
                      <option value="watts">Waty</option>
                    </select>
                  </div>

                  <div className="col-span-1 sm:col-span-1 lg:col-span-1 min-w-0">
                    <label className="block text-[11px] text-slate-400 truncate">Start</label>
                    <input
                      type="number"
                      min={20}
                      max={600}
                      value={b.startValue}
                      onChange={(e) =>
                        handleUpdateBlock(idx, { startValue: parseInt(e.target.value || '50', 10) })
                      }
                      className="w-full h-9 px-2 rounded-lg bg-[#131B26] border border-slate-700 font-mono-tabular text-xs text-white min-w-0"
                    />
                  </div>

                  <div className="col-span-1 sm:col-span-1 lg:col-span-1 min-w-0">
                    <label className="block text-[11px] text-slate-400 truncate">Koniec</label>
                    <input
                      type="number"
                      min={20}
                      max={600}
                      disabled={b.type === 'steady'}
                      value={b.endValue}
                      onChange={(e) =>
                        handleUpdateBlock(idx, { endValue: parseInt(e.target.value || '50', 10) })
                      }
                      className="w-full h-9 px-2 rounded-lg bg-[#131B26] border border-slate-700 disabled:opacity-40 font-mono-tabular text-xs text-white min-w-0"
                    />
                  </div>

                  <div className="col-span-1 sm:col-span-2 lg:col-span-2 min-w-0">
                    <label className="block text-[11px] text-slate-400 truncate">Krzywa rampy</label>
                    <select
                      value={b.rampCurve}
                      disabled={b.type === 'steady'}
                      onChange={(e) =>
                        handleUpdateBlock(idx, { rampCurve: e.target.value as RampCurveType })
                      }
                      className="w-full h-9 px-2 rounded-lg bg-[#131B26] border border-slate-700 disabled:opacity-40 text-xs text-white min-w-0"
                    >
                      <option value="linear">Liniowa</option>
                      <option value="progressive">Progresywna</option>
                      <option value="regressive">Regresywna</option>
                    </select>
                  </div>

                  <div className="col-span-2 sm:col-span-2 lg:col-span-1 flex items-center justify-between lg:justify-end gap-2 pt-2 lg:pt-4 border-t lg:border-t-0 border-slate-800/70">
                    <span className="font-mono-tabular text-xs font-semibold text-emerald-400">
                      {startW === endW ? `${startW}W` : `${startW}→${endW}W`}
                    </span>
                    <button
                      onClick={() => handleRemoveBlock(idx)}
                      className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800"
                      title="Usuń blok"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
            <button
              onClick={() => handleSaveBuiltWorkout(false)}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4 shrink-0" />
              Zapisz w Bibliotece
            </button>
            <button
              onClick={() => handleSaveBuiltWorkout(true)}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4 fill-current shrink-0" />
              Zapisz i Odpal w Kokpicie
            </button>
          </div>
        </div>
      )}

      {/* WORKOUT CARDS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-w-0">
        {filteredWorkouts.map((w) => {
          const totalSec = w.blocks.reduce((acc, b) => acc + b.durationSec, 0);
          const isSelected = w.id === selectedWorkoutId;

          return (
            <div
              key={w.id}
              className={`rounded-2xl bg-[#131B26] border p-4 sm:p-5 flex flex-col justify-between gap-3.5 transition-colors min-w-0 overflow-hidden ${
                isSelected ? 'border-emerald-500' : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="space-y-2 min-w-0">
                {/* Clean wrapped metadata row so text never overflows card width on 360px screens */}
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[11px] sm:text-xs text-slate-400 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 min-w-0">
                    <span className="font-semibold text-emerald-400 font-mono-tabular truncate max-w-[180px] sm:max-w-none">
                      /{w.profileId}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {w.profileId === 'shared'
                        ? 'Wspólny'
                        : profiles?.[w.profileId]?.name || w.profileId}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular">{formatDurationClock(totalSec)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{w.blocks.length} bloków</span>
                  </div>
                  {w.scheduledDate && (
                    <span className="flex items-center gap-1 font-mono-tabular text-slate-300 shrink-0">
                      <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      {w.scheduledDate}
                    </span>
                  )}
                </div>

                <h3 className="text-base font-bold text-white break-words leading-snug">
                  {w.name}
                </h3>
                <p className="text-xs text-slate-400 line-clamp-2 break-words leading-relaxed">
                  {w.description}
                </p>
              </div>

              <WorkoutProfileChart
                blocks={w.blocks}
                profile={activeProfile}
                height={110}
              />

              {/* Compact Wrapped Workout Blocks Preview (never overflows container) */}
              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                {w.blocks.slice(0, 5).map((blk) => {
                  const sW = calculateBlockInstantTarget(blk, 0, activeProfile.ftpWatts).targetWatts;
                  const eW = calculateBlockInstantTarget(
                    blk,
                    blk.durationSec,
                    activeProfile.ftpWatts
                  ).targetWatts;
                  const mins = Math.max(1, Math.round(blk.durationSec / 60));
                  return (
                    <span
                      key={blk.id}
                      className="max-w-full truncate rounded-lg bg-[#0B0F17] border border-slate-800/90 px-2 py-1 text-[10px] font-mono-tabular text-slate-300"
                      title={`${blk.label}: ${mins}m (${sW === eW ? `${sW}W` : `${sW}→${eW}W`})`}
                    >
                      <span className="text-slate-400">{blk.label.slice(0, 12)}:</span>{' '}
                      <strong className="text-white">{mins}m</strong>{' '}
                      <span className="text-emerald-400">
                        {sW === eW ? `${sW}W` : `${sW}→${eW}W`}
                      </span>
                    </span>
                  );
                })}
                {w.blocks.length > 5 && (
                  <span className="rounded-lg bg-[#0B0F17] border border-slate-800/90 px-2 py-1 text-[10px] font-mono-tabular text-slate-400">
                    +{w.blocks.length - 5} więcej
                  </span>
                )}
              </div>

              {/* Card Actions: Secondary row + Full-width CTA on mobile */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-2 border-t border-slate-800/80 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    onClick={() => openEditWorkout(w)}
                    className="flex-1 sm:flex-none min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors text-center"
                  >
                    Edytuj
                  </button>
                  <button
                    onClick={() => downloadWorkoutAsTextFile(w)}
                    className="flex-1 sm:flex-none min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-amber-300 flex items-center justify-center gap-1.5 transition-colors"
                    title="Pobierz trening jako samodzielny plik tekstowy .txt w składni Intervals.icu"
                  >
                    <Download className="w-3.5 h-3.5 shrink-0" />
                    .TXT
                  </button>
                  {w.source === 'local' && (
                    <button
                      onClick={() => onDeleteWorkout(w.id)}
                      className="min-h-[40px] px-2.5 py-1.5 rounded-xl bg-slate-800/60 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 transition-colors shrink-0 flex items-center justify-center"
                      title="Usuń trening"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <button
                  onClick={() => onSelectAndLoadWorkout(w, true)}
                  className="w-full sm:w-auto min-h-[42px] px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-colors truncate"
                >
                  <Play className="w-4 h-4 fill-current shrink-0" />
                  <span className="truncate">Załaduj i Jedź ({activeProfile.ftpWatts}W FTP)</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
