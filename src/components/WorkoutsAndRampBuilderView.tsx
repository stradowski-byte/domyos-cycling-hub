import React, { useMemo, useRef, useState } from 'react';
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
  ChevronDown,
  ChevronRight,
  Tag,
  Search,
  Check,
  Clock,
  Sparkles,
} from 'lucide-react';
import {
  AthleteProfile,
  CompletedActivity,
  ProfileId,
  RampCurveType,
  StructuredWorkout,
  WorkoutBlock,
} from '../types/cycling';
import {
  calculateBlockInstantTarget,
  DEFAULT_WORKOUT_TAGS,
  downloadWorkoutAsTextFile,
  formatBlocksToIntervalsText,
  inferWorkoutTags,
  parseIcuTextFileToWorkout,
  parseIntervalsWorkoutText,
} from '../services/rampAndPhysiologyEngine';
import { WorkoutProfileChart } from './WorkoutProfileChart';
import { formatDurationClock } from './LiveCockpitView';

interface WorkoutsAndRampBuilderViewProps {
  activeProfile: AthleteProfile;
  profiles?: Record<ProfileId, AthleteProfile>;
  workouts: StructuredWorkout[];
  availableTags?: string[];
  selectedWorkoutId: string;
  latestTsb?: number;
  lastCompletedActivity?: CompletedActivity | null;
  isSyncingIntervals: boolean;
  isSyncingDriveTxt?: boolean;
  onSelectAndLoadWorkout: (workout: StructuredWorkout, startImmediately?: boolean) => void;
  onSaveWorkout: (workout: StructuredWorkout) => void;
  onDeleteWorkout: (workoutId: string) => void;
  onSyncFromIntervalsIcu: () => void;
  onSyncTxtWorkoutsFolder?: () => void;
}

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  Z2: 'Baza tlenowa, spalanie tłuszczów (FatMax ~60–73% FTP) i kapilaryzacja',
  Endurance: 'Wytrzymałość tlenowa, zmienne tempo Z2/Z3 i siła wytrzymałościowa',
  'Threshold / Sweet Spot': 'Budowa progu mleczanowego FTP (88–105% FTP) oraz Over-Unders',
  VO2max: 'Pułap tlenowy (110–125% FTP): protokoły Rønnestad 30/15, Seiler 4x4 i Billat',
  'Testy (FTP 20m / Ramp)': 'Diagnostyka wydolności: Ramp Test (eFTP) oraz klasyczny Test FTP 20m',
  Recovery: 'Aktywna regeneracja Z1, rozjazd po-startowy i pobudzenia (Openers)',
};

export const WorkoutsAndRampBuilderView: React.FC<WorkoutsAndRampBuilderViewProps> = ({
  activeProfile,
  workouts,
  availableTags = DEFAULT_WORKOUT_TAGS,
  selectedWorkoutId,
  latestTsb = 2,
  lastCompletedActivity = null,
  isSyncingIntervals,
  isSyncingDriveTxt = false,
  onSelectAndLoadWorkout,
  onSaveWorkout,
  onDeleteWorkout,
  onSyncFromIntervalsIcu,
  onSyncTxtWorkoutsFolder,
}) => {
  const [filterScope, setFilterScope] = useState<'all' | 'intervals' | 'custom'>('all');
  const [durationFilter, setDurationFilter] = useState<'all' | 'short' | 'medium' | 'long'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  // All category dropdowns are collapsed by default for maximum mobile clarity
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [editingTagsWorkoutId, setEditingTagsWorkoutId] = useState<string | null>(null);

  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const txtFileInputRef = useRef<HTMLInputElement | null>(null);

  // Builder state
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState('Nowy Trening');
  const [description, setDescription] = useState(
    'Trening kolarski dla Domyos Challenge Bike.'
  );
  const [scheduledDate, setScheduledDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [selectedBuilderTags, setSelectedBuilderTags] = useState<string[]>([
    'Endurance',
  ]);
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

  // Combine configured tags with any custom tags found on workouts
  const allCategoryTags = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const t of availableTags) {
      const clean = t.trim();
      if (clean && !seen.has(clean)) {
        seen.add(clean);
        list.push(clean);
      }
    }
    for (const w of workouts) {
      for (const wt of inferWorkoutTags(w)) {
        if (wt && !seen.has(wt)) {
          seen.add(wt);
          list.push(wt);
        }
      }
    }
    return list;
  }, [availableTags, workouts]);

  const filteredWorkouts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return workouts.filter((w) => {
      if (filterScope === 'intervals') {
        if (w.source !== 'intervals_calendar' && w.source !== 'intervals_library') {
          return false;
        }
      } else if (filterScope === 'custom') {
        if (
          w.category !== 'Custom' &&
          !w.id.startsWith('w_custom_') &&
          !w.id.startsWith('w_txt_')
        ) {
          return false;
        }
      } else {
        if (activeProfile.offlineMode === 'ftp_builder' && w.category === 'Recovery') {
          return false;
        }
        if (
          activeProfile.offlineMode === 'cardio_fitness' &&
          w.category !== 'Endurance' &&
          w.category !== 'Recovery' &&
          w.category !== 'Custom'
        ) {
          return false;
        }
      }

      if (durationFilter !== 'all') {
        const totalMin = Math.round(
          w.blocks.reduce((acc, b) => acc + b.durationSec, 0) / 60
        );
        if (durationFilter === 'short' && totalMin > 38) return false;
        if (durationFilter === 'medium' && (totalMin < 39 || totalMin > 62)) return false;
        if (durationFilter === 'long' && totalMin <= 62) return false;
      }

      if (q) {
        const wTags = inferWorkoutTags(w).join(' ').toLowerCase();
        const hay = `${w.name} ${w.description} ${wTags}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }, [workouts, filterScope, durationFilter, searchQuery, activeProfile.offlineMode]);

  // Smart Daily Workout Recommendation based on TSB (freshness) and recent ride
  const smartDailyRecommendation = useMemo(() => {
    if (workouts.length === 0) return null;
    const hoursSinceLastRide = lastCompletedActivity
      ? (Date.now() - new Date(lastCompletedActivity.startedAtIso).getTime()) / 3600000
      : 999;
    const hadHardRideRecently =
      hoursSinceLastRide < 26 && (lastCompletedActivity?.tss || 0) >= 75;

    let preferredId = 'w_thresh_ss_3x10';
    let reason = `Optymalny bodziec tlenowo-progowy (Forma TSB ${latestTsb >= 0 ? `+${latestTsb}` : latestTsb})`;

    if (latestTsb < -12 || hadHardRideRecently) {
      preferredId = 'w_rec_flush_35';
      reason = hadHardRideRecently
        ? `Po mocnym treningu (${lastCompletedActivity?.tss} TSS) zalecana aktywna regeneracja Z1/Z2`
        : `Wysokie zmęczenie (TSB ${latestTsb}) — dzisiaj lekki rozjazd regeneracyjny`;
    } else if (latestTsb < -3) {
      preferredId = 'w_z2_steady_60';
      reason = `Budowa bazy tlenowej Z2 przy umiarkowanym zmęczeniu (TSB ${latestTsb})`;
    } else if (latestTsb >= 6) {
      preferredId = 'w_vo2_ronnestad_30_15';
      reason = `Wysoka świeżość (TSB +${latestTsb}) — idealny dzień na interwały VO2max lub Sweet Spot`;
    }

    const found =
      workouts.find((w) => w.id === preferredId) ||
      workouts.find((w) => w.id === selectedWorkoutId) ||
      workouts[0];

    const totalSec = found.blocks.reduce((sum, b) => sum + b.durationSec, 0);
    return {
      workout: found,
      reason,
      totalSec,
      tags: inferWorkoutTags(found),
    };
  }, [workouts, latestTsb, lastCompletedActivity, selectedWorkoutId]);

  // Group workouts by tag (a workout with multiple tags appears in each matching category)
  const categorizedWorkouts = useMemo(() => {
    const map = new Map<string, StructuredWorkout[]>();
    for (const tag of allCategoryTags) {
      map.set(tag, []);
    }

    for (const w of filteredWorkouts) {
      const wTags = inferWorkoutTags(w);
      for (const t of wTags) {
        if (!map.has(t)) {
          map.set(t, []);
        }
        map.get(t)!.push(w);
      }
    }

    return Array.from(map.entries()).map(([tag, items]) => ({
      tag,
      description:
        CATEGORY_DESCRIPTIONS[tag] ||
        `Kategoria treningowa #${tag} (własny tag kolarza)`,
      workouts: items,
    }));
  }, [allCategoryTags, filteredWorkouts]);

  const toggleCategoryDropdown = (tag: string) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [tag]: !prev[tag],
    }));
  };

  const anyExpanded = Object.values(expandedCategories).some(Boolean);

  const handleToggleExpandAll = () => {
    if (anyExpanded) {
      setExpandedCategories({});
    } else {
      const next: Record<string, boolean> = {};
      for (const c of categorizedWorkouts) {
        if (c.workouts.length > 0) {
          next[c.tag] = true;
        }
      }
      setExpandedCategories(next);
    }
  };

  const toggleTagInBuilder = (tag: string) => {
    setSelectedBuilderTags((prev) => {
      if (prev.includes(tag)) {
        if (prev.length <= 1) return prev; // keep at least 1 tag
        return prev.filter((t) => t !== tag);
      }
      return [...prev, tag];
    });
  };

  const handleToggleTagOnExistingWorkout = (
    workout: StructuredWorkout,
    tagToToggle: string
  ) => {
    const currentTags = inferWorkoutTags(workout);
    let nextTags: string[];
    if (currentTags.includes(tagToToggle)) {
      if (currentTags.length <= 1) return; // keep at least 1 category tag
      nextTags = currentTags.filter((t) => t !== tagToToggle);
    } else {
      nextTags = [...currentTags, tagToToggle];
    }

    const updatedWorkout: StructuredWorkout = {
      ...workout,
      tags: nextTags,
      updatedAtIso: new Date().toISOString(),
    };
    onSaveWorkout(updatedWorkout);
  };

  const openNewBuilder = () => {
    setEditId(null);
    setTitle('Nowy Trening Własny');
    setSelectedBuilderTags(['Endurance']);
    setScheduledDate(new Date().toISOString().slice(0, 10));
    setIsBuilderOpen(true);
  };

  const openEditWorkout = (w: StructuredWorkout) => {
    setEditId(w.id);
    setTitle(w.name);
    setDescription(w.description);
    setSelectedBuilderTags(inferWorkoutTags(w));
    setScheduledDate(w.scheduledDate || new Date().toISOString().slice(0, 10));
    setBlocks(w.blocks.map((b) => ({ ...b })));
    setIntervalsTextInput(formatBlocksToIntervalsText(w.blocks));
    setIsBuilderOpen(true);
  };

  const handleAddBlock = (
    preset: 'ramp_up' | 'steady' | 'resistance_ramp' | 'cooldown'
  ) => {
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
    const parsed = parseIntervalsWorkoutText(
      intervalsTextInput,
      activeProfile.ftpWatts
    );
    if (parsed.length > 0) {
      setBlocks(parsed);
    }
  };

  const handleSaveBuiltWorkout = (startAfterSave: boolean) => {
    const normalizedTags =
      selectedBuilderTags.length > 0 ? selectedBuilderTags : ['Endurance'];
    const newWorkout: StructuredWorkout = {
      id: editId || `w_custom_${Date.now()}`,
      profileId: 'shared',
      name: title.trim() || 'Trening Własny',
      description: description.trim(),
      category: 'Custom',
      tags: normalizedTags,
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
        const parsedWorkout = parseIcuTextFileToWorkout(text, file.name, 'shared');
        onSaveWorkout(parsedWorkout);
      } catch (err) {
        console.warn('Nie udało się wczytać pliku .txt:', file.name, err);
      }
    }
    e.target.value = '';
  };

  return (
    <div className="space-y-4 pb-8 min-w-0 max-w-full overflow-x-hidden">
      {/* SMART DAILY RECOMMENDATION CARD (1-CLICK START) */}
      {smartDailyRecommendation && (
        <div className="rounded-2xl bg-gradient-to-r from-emerald-500/15 via-[#131B26] to-[#131B26] border border-emerald-500/40 p-3.5 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 min-w-0">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-emerald-400">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-emerald-300">
                <Sparkles className="w-3 h-3 shrink-0" />
                Polecany Trening na Dziś
              </span>
              <span className="font-mono-tabular text-slate-300">
                {formatDurationClock(smartDailyRecommendation.totalSec)} ·{' '}
                {smartDailyRecommendation.tags.join(' / ')}
              </span>
            </div>
            <div className="text-sm sm:text-base font-bold text-white truncate">
              {smartDailyRecommendation.workout.name}
            </div>
            <p className="text-xs text-slate-300 break-words">
              {smartDailyRecommendation.reason}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() =>
                onSelectAndLoadWorkout(smartDailyRecommendation.workout, true)
              }
              className="w-full md:w-auto min-h-[42px] px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-sm whitespace-nowrap"
            >
              <Play className="w-4 h-4 fill-current shrink-0" />
              <span>Jedź Teraz ({activeProfile.ftpWatts}W FTP)</span>
            </button>
          </div>
        </div>
      )}

      {/* Top Toolbar: Filter Tabs + Duration Filter + Search + Expand/Collapse All + Creator Trigger */}
      <div className="rounded-2xl bg-[#131B26] border border-slate-800 p-3.5 sm:p-4 space-y-3 min-w-0 overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 min-w-0">
          {/* 3-Segment Filter Bar */}
          <div className="grid grid-cols-3 sm:flex items-center gap-1 p-1 bg-[#0B0F17] rounded-xl border border-slate-800 w-full lg:w-auto min-w-0">
            <button
              onClick={() => setFilterScope('all')}
              className={`min-h-[38px] px-2 sm:px-3.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold transition-colors truncate text-center min-w-0 ${
                filterScope === 'all'
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'text-slate-300 hover:text-white'
              }`}
              title={`Wszystkie treningi (${workouts.length})`}
            >
              Wszystkie ({workouts.length})
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
              <span className="sm:hidden">Intervals.icu</span>
              <span className="hidden sm:inline">Z biblioteki Intervals.icu</span>
            </button>
            <button
              onClick={() => setFilterScope('custom')}
              className={`min-h-[38px] px-2 sm:px-3.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold transition-colors truncate text-center min-w-0 ${
                filterScope === 'custom'
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'text-slate-300 hover:text-white'
              }`}
              title="Własne treningi i zaimportowane pliki .TXT"
            >
              Własne / .TXT
            </button>
          </div>

          {/* Action Buttons */}
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
              title="Wczytaj pojedyncze lub wiele plików tekstowych .txt"
            >
              <Upload className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="truncate">Wczytaj .TXT</span>
            </button>

            {onSyncTxtWorkoutsFolder && (
              <button
                onClick={onSyncTxtWorkoutsFolder}
                disabled={isSyncingDriveTxt}
                className="min-h-[42px] px-2.5 sm:px-3.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors min-w-0 truncate"
                title="Synchronizuj treningi z bazą Firebase Firestore i pamięcią OPFS"
              >
                <FolderSync
                  className={`w-3.5 h-3.5 shrink-0 ${
                    isSyncingDriveTxt ? 'animate-spin' : ''
                  }`}
                />
                <span className="truncate">Sync Firebase</span>
              </button>
            )}

            <button
              onClick={onSyncFromIntervalsIcu}
              disabled={isSyncingIntervals}
              className="min-h-[42px] px-2.5 sm:px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors min-w-0 truncate"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 shrink-0 ${
                  isSyncingIntervals ? 'animate-spin text-emerald-400' : ''
                }`}
              />
              <span className="truncate">Sync Intervals.icu</span>
            </button>

            <button
              onClick={() =>
                isBuilderOpen ? setIsBuilderOpen(false) : openNewBuilder()
              }
              className="min-h-[42px] px-3 sm:px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1.5 transition-colors min-w-0 truncate"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span className="truncate">
                {isBuilderOpen ? 'Ukryj Kreator .TXT' : '+ Kreator .TXT'}
              </span>
            </button>
          </div>
        </div>

        {/* Quick Duration Filter Pills (All / <= 35m / 40-60m / > 60m) */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1 mr-1">
              <Clock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              Czas jazdy:
            </span>
            {(
              [
                { id: 'all', label: 'Dowolny czas' },
                { id: 'short', label: '≤ 35 min (Szybki)' },
                { id: 'medium', label: '40–60 min (Standard)' },
                { id: 'long', label: '> 60 min (Długi)' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setDurationFilter(opt.id)}
                className={`min-h-[32px] px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                  durationFilter === opt.id
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-bold'
                    : 'bg-[#0B0F17] border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <span className="text-[11px] text-slate-400 font-mono-tabular">
            Pasujących: <strong className="text-white">{filteredWorkouts.length}</strong> · FTP:{' '}
            <strong className="text-emerald-400">{activeProfile.ftpWatts} W</strong>
          </span>
        </div>

        {/* Search & Expand/Collapse All Controls for Mobile Ergonomics */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Szukaj treningu lub tagu (np. Z2, Rønnestad, Sweet Spot, 20 min)..."
              className="w-full h-10 pl-9 pr-3 rounded-xl bg-[#0B0F17] border border-slate-800 text-xs text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 shrink-0">
            <button
              onClick={handleToggleExpandAll}
              className="w-full sm:w-auto min-h-[38px] px-3 py-1.5 rounded-xl bg-[#0B0F17] hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-200 flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              {anyExpanded ? (
                <>
                  <ChevronDown className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Zwiń wszystkie kategorie</span>
                </>
              ) : (
                <>
                  <ChevronRight className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Rozwiń wszystkie ({categorizedWorkouts.length})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* VISUAL WORKOUT CREATOR */}
      {isBuilderOpen && (
        <div className="rounded-2xl bg-[#131B26] border border-emerald-500/40 p-3.5 sm:p-5 space-y-4 min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3.5">
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-white">
                Kreator Treningu
              </h2>
              <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                Układaj bloki o stałej mocy, rampy oraz przypisuj wiele tagów kategorii. Waty przeliczane są względem FTP ({activeProfile.ftpWatts} W).
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div className="min-w-0">
              <label className="block text-xs text-slate-400 mb-1">
                Nazwa treningu
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full h-10 px-3 rounded-xl bg-[#0B0F17] border border-slate-700 text-sm text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div className="min-w-0">
              <label className="block text-xs text-slate-400 mb-1">
                Zaplanowana data
              </label>
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="w-full h-10 px-3 rounded-xl bg-[#0B0F17] border border-slate-700 text-sm text-white font-mono-tabular focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Multi-Tag Category Selector in Builder */}
          <div className="space-y-2">
            <label className="block text-xs text-slate-300 font-semibold">
              Przypisz tagi / kategorie (możesz wybrać kilka — trening pojawi się w każdej z nich):
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {allCategoryTags.map((tag) => {
                const isSelected = selectedBuilderTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTagInBuilder(tag)}
                    className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-colors whitespace-nowrap shrink-0 ${
                      isSelected
                        ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-bold'
                        : 'bg-[#0B0F17] text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {isSelected ? (
                      <Check className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <Tag className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    )}
                    <span>{tag}</span>
                  </button>
                );
              })}
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
              PODGLĄD KRZYWEJ MOCY I RAMP (FTP {activeProfile.ftpWatts}W):
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
              const startW = calculateBlockInstantTarget(
                b,
                0,
                activeProfile.ftpWatts
              ).targetWatts;
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
                    <label className="block text-[11px] text-slate-400 truncate">
                      Etykieta odcinka
                    </label>
                    <input
                      type="text"
                      value={b.label}
                      onChange={(e) =>
                        handleUpdateBlock(idx, { label: e.target.value })
                      }
                      className="w-full h-9 px-2.5 rounded-lg bg-[#131B26] border border-slate-700 text-xs text-white min-w-0"
                    />
                  </div>

                  <div className="col-span-1 sm:col-span-1 lg:col-span-2 min-w-0">
                    <label className="block text-[11px] text-slate-400 truncate">
                      Typ obciążenia
                    </label>
                    <select
                      value={b.type}
                      onChange={(e) =>
                        handleUpdateBlock(idx, {
                          type: e.target.value as WorkoutBlock['type'],
                        })
                      }
                      className="w-full h-9 px-2 rounded-lg bg-[#131B26] border border-slate-700 text-xs text-white min-w-0"
                    >
                      <option value="ramp">Rampa (Zmienna)</option>
                      <option value="steady">Stałe Waty</option>
                      <option value="resistance">Poziom Oporu</option>
                    </select>
                  </div>

                  <div className="col-span-1 sm:col-span-1 lg:col-span-1 min-w-0">
                    <label className="block text-[11px] text-slate-400 truncate">
                      Czas (min)
                    </label>
                    <input
                      type="number"
                      min={0.5}
                      step={0.5}
                      value={Number((b.durationSec / 60).toFixed(1))}
                      onChange={(e) =>
                        handleUpdateBlock(idx, {
                          durationSec: Math.max(
                            15,
                            Math.round(parseFloat(e.target.value || '1') * 60)
                          ),
                        })
                      }
                      className="w-full h-9 px-2 rounded-lg bg-[#131B26] border border-slate-700 font-mono-tabular text-xs text-white min-w-0"
                    />
                  </div>

                  <div className="col-span-1 sm:col-span-1 lg:col-span-1 min-w-0">
                    <label className="block text-[11px] text-slate-400 truncate">
                      Jedn.
                    </label>
                    <select
                      value={b.unit}
                      onChange={(e) =>
                        handleUpdateBlock(idx, {
                          unit: e.target.value as 'pct_ftp' | 'watts',
                        })
                      }
                      className="w-full h-9 px-1.5 rounded-lg bg-[#131B26] border border-slate-700 text-xs text-white min-w-0"
                    >
                      <option value="pct_ftp">% FTP</option>
                      <option value="watts">Waty</option>
                    </select>
                  </div>

                  <div className="col-span-1 sm:col-span-1 lg:col-span-1 min-w-0">
                    <label className="block text-[11px] text-slate-400 truncate">
                      Start
                    </label>
                    <input
                      type="number"
                      min={20}
                      max={600}
                      value={b.startValue}
                      onChange={(e) =>
                        handleUpdateBlock(idx, {
                          startValue: parseInt(e.target.value || '50', 10),
                        })
                      }
                      className="w-full h-9 px-2 rounded-lg bg-[#131B26] border border-slate-700 font-mono-tabular text-xs text-white min-w-0"
                    />
                  </div>

                  <div className="col-span-1 sm:col-span-1 lg:col-span-1 min-w-0">
                    <label className="block text-[11px] text-slate-400 truncate">
                      Koniec
                    </label>
                    <input
                      type="number"
                      min={20}
                      max={600}
                      disabled={b.type === 'steady'}
                      value={b.endValue}
                      onChange={(e) =>
                        handleUpdateBlock(idx, {
                          endValue: parseInt(e.target.value || '50', 10),
                        })
                      }
                      className="w-full h-9 px-2 rounded-lg bg-[#131B26] border border-slate-700 disabled:opacity-40 font-mono-tabular text-xs text-white min-w-0"
                    />
                  </div>

                  <div className="col-span-1 sm:col-span-2 lg:col-span-2 min-w-0">
                    <label className="block text-[11px] text-slate-400 truncate">
                      Krzywa rampy
                    </label>
                    <select
                      value={b.rampCurve}
                      disabled={b.type === 'steady'}
                      onChange={(e) =>
                        handleUpdateBlock(idx, {
                          rampCurve: e.target.value as RampCurveType,
                        })
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

      {/* =====================================================================
          COLLAPSIBLE CATEGORY DROPDOWNS (DEFAULT COLLAPSED ON MOBILE)
         ===================================================================== */}
      <div className="space-y-3 min-w-0">
        {categorizedWorkouts.map(({ tag, description: catDesc, workouts: catWorkouts }) => {
          const isSearching = searchQuery.trim().length > 0;
          const isExpanded = isSearching
            ? catWorkouts.length > 0
            : Boolean(expandedCategories[tag]);

          if (isSearching && catWorkouts.length === 0) {
            return null;
          }

          return (
            <div
              key={tag}
              className={`rounded-2xl bg-[#131B26] border transition-colors overflow-hidden ${
                isExpanded
                  ? 'border-emerald-500/50'
                  : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              {/* Collapsible Category Dropdown Header (Min 56px Touch Target) */}
              <button
                type="button"
                onClick={() => toggleCategoryDropdown(tag)}
                className="w-full min-h-[58px] px-4 py-3.5 flex items-center justify-between gap-3 text-left transition-colors hover:bg-slate-800/30"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border transition-colors ${
                      isExpanded
                        ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                        : 'bg-[#0B0F17] text-emerald-400 border-slate-800'
                    }`}
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-5 h-5" />
                    ) : (
                      <ChevronRight className="w-5 h-5" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm sm:text-base font-bold text-white truncate">
                        {tag}
                      </span>
                      <span className="text-xs font-mono-tabular text-emerald-400 font-semibold">
                        · {catWorkouts.length}{' '}
                        {catWorkouts.length === 1
                          ? 'trening'
                          : catWorkouts.length >= 2 && catWorkouts.length <= 4
                          ? 'treningi'
                          : 'treningów'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">
                      {catDesc}
                    </p>
                  </div>
                </div>

                <div className="text-xs font-semibold text-slate-400 shrink-0 hidden sm:flex items-center gap-1">
                  <span>{isExpanded ? 'Zwiń' : 'Rozwiń'}</span>
                </div>
              </button>

              {/* Expanded Workouts Grid inside Category */}
              {isExpanded && (
                <div className="border-t border-slate-800/90 p-3.5 sm:p-4 bg-[#0B0F17]/50">
                  {catWorkouts.length === 0 ? (
                    <div className="text-xs text-slate-400 py-4 text-center">
                      Brak treningów przypisanych do kategorii <strong>{tag}</strong>.
                      Dodaj tag <strong>{tag}</strong> na dowolnej karcie treningu lub w kreatorze.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-w-0">
                      {catWorkouts.map((w) => {
                        const totalSec = w.blocks.reduce(
                          (acc, b) => acc + b.durationSec,
                          0
                        );
                        const isSelected = w.id === selectedWorkoutId;
                        const wTags = inferWorkoutTags(w);
                        const isEditingTagsHere =
                          editingTagsWorkoutId === `${tag}_${w.id}`;

                        return (
                          <div
                            key={`${tag}_${w.id}`}
                            className={`rounded-2xl bg-[#131B26] border p-4 flex flex-col justify-between gap-3 transition-colors min-w-0 overflow-hidden ${
                              isSelected
                                ? 'border-emerald-500'
                                : 'border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            <div className="space-y-2 min-w-0">
                              {/* Metadata Row + Quick Tag Editor Button */}
                              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[11px] sm:text-xs text-slate-400 min-w-0">
                                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 min-w-0">
                                  <span className="font-semibold text-emerald-400">
                                    {wTags.join(' / ')}
                                  </span>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-mono-tabular">
                                    {formatDurationClock(totalSec)}
                                  </span>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-mono-tabular">
                                    {w.blocks.length} bloków
                                  </span>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  {w.scheduledDate && (
                                    <span className="flex items-center gap-1 font-mono-tabular text-slate-300">
                                      <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                      {w.scheduledDate}
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setEditingTagsWorkoutId(
                                        isEditingTagsHere ? null : `${tag}_${w.id}`
                                      )
                                    }
                                    className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold text-emerald-300 flex items-center gap-1 transition-colors"
                                    title="Przypisz ten trening do kilku kategorii (tagów)"
                                  >
                                    <Tag className="w-3 h-3 shrink-0" />
                                    <span>+ Tagi</span>
                                  </button>
                                </div>
                              </div>

                              {/* Inline Multi-Tag Selector on Card */}
                              {isEditingTagsHere && (
                                <div className="rounded-xl bg-[#0B0F17] border border-emerald-500/40 p-2.5 space-y-2">
                                  <div className="text-[11px] text-slate-300 font-semibold flex items-center justify-between">
                                    <span>Kategorie tego treningu (wielokrotny wybór):</span>
                                    <button
                                      type="button"
                                      onClick={() => setEditingTagsWorkoutId(null)}
                                      className="text-emerald-400 hover:underline text-[11px]"
                                    >
                                      Gotowe
                                    </button>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {allCategoryTags.map((availTag) => {
                                      const active = wTags.includes(availTag);
                                      return (
                                        <button
                                          key={availTag}
                                          type="button"
                                          onClick={() =>
                                            handleToggleTagOnExistingWorkout(
                                              w,
                                              availTag
                                            )
                                          }
                                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 border transition-colors ${
                                            active
                                              ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-bold'
                                              : 'bg-[#131B26] text-slate-300 border-slate-700 hover:border-slate-600'
                                          }`}
                                        >
                                          {active && <Check className="w-3 h-3" />}
                                          <span>{availTag}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              <h3 className="text-sm sm:text-base font-bold text-white break-words leading-snug">
                                {w.name}
                              </h3>
                              <p className="text-xs text-slate-400 line-clamp-2 break-words leading-relaxed">
                                {w.description}
                              </p>
                            </div>

                            <WorkoutProfileChart
                              blocks={w.blocks}
                              profile={activeProfile}
                              height={100}
                            />

                            {/* Compact Workout Blocks Preview */}
                            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                              {w.blocks.slice(0, 4).map((blk) => {
                                const sW = calculateBlockInstantTarget(
                                  blk,
                                  0,
                                  activeProfile.ftpWatts
                                ).targetWatts;
                                const eW = calculateBlockInstantTarget(
                                  blk,
                                  blk.durationSec,
                                  activeProfile.ftpWatts
                                ).targetWatts;
                                const mins = Math.max(
                                  1,
                                  Math.round(blk.durationSec / 60)
                                );
                                return (
                                  <span
                                    key={blk.id}
                                    className="max-w-full truncate rounded-lg bg-[#0B0F17] border border-slate-800/90 px-2 py-1 text-[10px] font-mono-tabular text-slate-300"
                                  >
                                    <span className="text-slate-400">
                                      {blk.label.slice(0, 11)}:
                                    </span>{' '}
                                    <strong className="text-white">{mins}m</strong>{' '}
                                    <span className="text-emerald-400">
                                      {sW === eW ? `${sW}W` : `${sW}→${eW}W`}
                                    </span>
                                  </span>
                                );
                              })}
                              {w.blocks.length > 4 && (
                                <span className="rounded-lg bg-[#0B0F17] border border-slate-800/90 px-2 py-1 text-[10px] font-mono-tabular text-slate-400">
                                  +{w.blocks.length - 4} bloków
                                </span>
                              )}
                            </div>

                            {/* Card Actions */}
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-2 border-t border-slate-800/80 min-w-0">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <button
                                  onClick={() => openEditWorkout(w)}
                                  className="flex-1 sm:flex-none min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors text-center"
                                >
                                  Edytuj
                                </button>
                                <button
                                  onClick={() => downloadWorkoutAsTextFile(w)}
                                  className="flex-1 sm:flex-none min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-amber-300 flex items-center justify-center gap-1.5 transition-colors"
                                  title="Pobierz trening jako plik .txt"
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
                                <span className="truncate">
                                  Załaduj i Jedź ({activeProfile.ftpWatts}W FTP)
                                </span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
