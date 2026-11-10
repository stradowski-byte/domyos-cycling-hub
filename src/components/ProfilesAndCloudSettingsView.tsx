import React, { useEffect, useRef, useState } from 'react';
import {
  Cloud,
  CheckCircle2,
  FolderSync,
  LogOut,
  RefreshCw,
  Smartphone,
  Download,
  Upload,
  FileText,
  Edit3,
  Plus,
  Sun,
  Moon,
  FolderOpen,
  X,
  ShieldCheck,
  ExternalLink,
  CloudUpload,
  Database,
  Users,
  Activity,
  GitBranch,
  Tag,
  HardDrive,
  Trash2,
  ChevronDown,
  ChevronRight,
  Wrench,
  Copy,
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  AppThemeMode,
  AthleteProfile,
  CompletedActivity,
  ProfileId,
  StructuredWorkout,
} from '../types/cycling';
import {
  CURRENT_APP_VERSION,
  downloadLocalOpfsFile,
  estimateFirestoreSparkStorage,
  listLocalOpfsFiles,
  LocalOpfsFileEntry,
  readLocalOpfsTextFile,
  writeLocalOpfsWorkoutTextFile,
} from '../services/firebaseSyncService';
import {
  DEFAULT_WORKOUT_TAGS,
  inferWorkoutTags,
} from '../services/rampAndPhysiologyEngine';
import { doc, setDoc } from 'firebase/firestore';
import {
  activeConfig,
  auth,
  clearCustomFirebaseConfig,
  db,
  DEFAULT_GITHUB_PAGES_URL,
  DEFAULT_GITHUB_REPO_URL,
  FIREBASE_CONSOLE_PLACEHOLDER,
  formatFirebaseConfigText,
  getGitHubPagesInstallUrl,
  isUsingCustomConfig,
  saveCustomFirebaseConfig,
  saveCustomGitHubPagesUrl,
} from '../lib/firebase';
import { FirebaseSetupGuideDropdown } from './FirebaseSetupGuideDropdown';
import { SecurityAuditAndLogsPanel } from './SecurityAuditAndLogsPanel';

interface ProfilesAndCloudSettingsViewProps {
  profiles: Record<ProfileId, AthleteProfile>;
  workouts: StructuredWorkout[];
  activities: CompletedActivity[];
  workoutTags?: string[];
  onUpdateWorkoutTags?: (nextTags: string[]) => void;
  onEnsureFirestoreCollections?: () => void;
  collectionsInitialized?: boolean;
  activeProfileId: ProfileId;
  themeMode: AppThemeMode;
  onChangeThemeMode: (mode: AppThemeMode) => void;
  googleUser: User | null;
  isSyncingFirebase: boolean;
  pendingFirebaseActivities: CompletedActivity[];
  onFlushPendingSync: () => void;
  isPwaInstallable: boolean;
  isPwaInstalled: boolean;
  onInstallPwa: () => void;
  onOpenFastUserSwitcher: () => void;
  onGoogleLogin: () => void;
  onGoogleLogout: () => void;
  onSyncAllToFirebase: () => void;
  onRestoreFromFirebase: () => void;
  onImportBackupJson: (data: {
    profiles?: Record<ProfileId, AthleteProfile>;
    workouts?: StructuredWorkout[];
    activities?: CompletedActivity[];
  }) => void;
  onSaveEditedOpfsWorkout?: (workout: StructuredWorkout) => void;
  onNotifyToast?: (msg: string) => void;
}

export const ProfilesAndCloudSettingsView: React.FC<
  ProfilesAndCloudSettingsViewProps
> = ({
  profiles,
  workouts,
  activities,
  workoutTags = DEFAULT_WORKOUT_TAGS,
  onUpdateWorkoutTags,
  onEnsureFirestoreCollections,
  collectionsInitialized = true,
  activeProfileId = 'default',
  themeMode,
  onChangeThemeMode,
  googleUser,
  isSyncingFirebase,
  pendingFirebaseActivities,
  onFlushPendingSync,
  isPwaInstallable,
  isPwaInstalled,
  onInstallPwa,
  onOpenFastUserSwitcher,
  onGoogleLogin,
  onGoogleLogout,
  onSyncAllToFirebase,
  onRestoreFromFirebase,
  onImportBackupJson,
  onSaveEditedOpfsWorkout,
  onNotifyToast,
}) => {
  const [showCustomFirebaseConfig, setShowCustomFirebaseConfig] =
    useState(false);
  const [showAdvancedTools, setShowAdvancedTools] = useState(false);
  const [firebaseJsonInput, setFirebaseJsonInput] = useState(() =>
    formatFirebaseConfigText(activeConfig)
  );
  const [newTagInput, setNewTagInput] = useState('');
  const [ghPagesUrl, setGhPagesUrl] = useState<string>(() =>
    getGitHubPagesInstallUrl()
  );
  const [isEditingGhPagesUrl, setIsEditingGhPagesUrl] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleCopyGhPagesUrl = async () => {
    try {
      await navigator.clipboard.writeText(ghPagesUrl);
      onNotifyToast?.('Skopiowano link do instalacji PWA (GitHub Pages)!');
    } catch {
      onNotifyToast?.(`Link do instalacji: ${ghPagesUrl}`);
    }
  };

  const handleSaveGhPagesUrl = (e: React.FormEvent) => {
    e.preventDefault();
    const saved = saveCustomGitHubPagesUrl(ghPagesUrl);
    setGhPagesUrl(saved);
    setIsEditingGhPagesUrl(false);
    if (db && auth?.currentUser) {
      void setDoc(
        doc(db, 'hubConfig', 'default'),
        {
          updatedAtIso: new Date().toISOString(),
          ghPagesInstallUrl: saved,
        },
        { merge: true }
      ).catch(() => {});
    }
    onNotifyToast?.(
      'Zapisano adres GitHub Pages w pamięci telefonu oraz w chmurze Firebase!'
    );
  };

  const sparkStorage = estimateFirestoreSparkStorage({
    profiles,
    workouts,
    activities,
    tags: workoutTags,
    collectionsInitialized,
  });

  const handleAddCustomTag = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newTagInput.trim();
    if (!cleaned) return;
    if (workoutTags.some((t) => t.toLowerCase() === cleaned.toLowerCase())) {
      onNotifyToast?.(`Tag "${cleaned}" już istnieje na liście kategorii.`);
      return;
    }
    const next = [...workoutTags, cleaned];
    onUpdateWorkoutTags?.(next);
    setNewTagInput('');
    onNotifyToast?.(
      `Dodano nową kategorię "${cleaned}"! Jest już widoczna w wyborze treningu.`
    );
  };

  const handleRemoveCustomTag = (tagToRemove: string) => {
    if (DEFAULT_WORKOUT_TAGS.includes(tagToRemove)) {
      onNotifyToast?.(
        'Domyślne kategorie fizjologiczne są chronione. Możesz usuwać własne dodane tagi.'
      );
      return;
    }
    const next = workoutTags.filter((t) => t !== tagToRemove);
    onUpdateWorkoutTags?.(next);
    onNotifyToast?.(`Usunięto kategorię "${tagToRemove}".`);
  };

  // Local OPFS File Explorer & Live .TXT Editor State
  const [opfsFiles, setOpfsFiles] = useState<LocalOpfsFileEntry[]>([]);
  const [opfsFilter, setOpfsFilter] = useState<string>('all');
  const [isLoadingOpfs, setIsLoadingOpfs] = useState(false);

  const [editingTxtModal, setEditingTxtModal] = useState<{
    isOpen: boolean;
    ownerFolder: ProfileId | 'shared';
    fileName: string;
    content: string;
    isNew: boolean;
  } | null>(null);

  const refreshOpfsFileList = async () => {
    setIsLoadingOpfs(true);
    try {
      const list = await listLocalOpfsFiles();
      setOpfsFiles(list);
    } finally {
      setIsLoadingOpfs(false);
    }
  };

  useEffect(() => {
    refreshOpfsFileList();
  }, []);

  const handleSaveCustomFirebase = () => {
    try {
      saveCustomFirebaseConfig(firebaseJsonInput);
    } catch (err: any) {
      onNotifyToast?.(
        err?.message || 'Nieprawidłowy format JSON konfiguracji Firebase.'
      );
    }
  };

  const handleExportFullBackupJson = () => {
    const payload = {
      exportedAtIso: new Date().toISOString(),
      appVersion: CURRENT_APP_VERSION,
      profiles,
      workouts,
      activities,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `Domyos_Hub_Firebase_Backup_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onNotifyToast?.(
      'Pobrano pełną kopię zapasową (.json) ze wszystkimi profilami, planami i jazdami (.FIT)!'
    );
  };

  const handleImportBackupFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (parsed && (parsed.profiles || parsed.workouts || parsed.activities)) {
        onImportBackupJson(parsed);
        onNotifyToast?.(
          'Zaimportowano kopię zapasową (.json) i zaktualizowano dane aplikacji!'
        );
      } else {
        onNotifyToast?.('Plik nie zawiera prawidłowej struktury kopii zapasowej.');
      }
    } catch {
      onNotifyToast?.('Błąd odczytu pliku kopii zapasowej .json.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleForceSwUpdate = async () => {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const reg of regs) {
          await reg.update();
          if (reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
        }
      }
      onNotifyToast?.(
        'Sprawdzono aktualizacje Service Workera PWA! Przeładowuję aplikację...'
      );
      window.setTimeout(() => window.location.reload(), 800);
    } catch {
      window.location.reload();
    }
  };

  const handleOpenTxtFileEditor = async (entry: LocalOpfsFileEntry) => {
    const content = await readLocalOpfsTextFile(entry.folderBranch, entry.name);
    const owner: ProfileId | 'shared' =
      entry.ownerFolder && entry.ownerFolder !== 'engine'
        ? entry.ownerFolder
        : 'shared';
    setEditingTxtModal({
      isOpen: true,
      ownerFolder: owner,
      fileName: entry.name,
      content:
        content ||
        `# Name: ${entry.name.replace(/\.txt$/i, '')}\n# Category: Custom\n\n- 10m ramp 50-75% 90rpm\n- 15m 85% 92rpm\n- 5m ramp 65-45% 82rpm\n`,
      isNew: false,
    });
  };

  const handleCreateNewOpfsTxt = () => {
    setEditingTxtModal({
      isOpen: true,
      ownerFolder: 'shared',
      fileName: 'Nowy_Trening_Interwalowy.txt',
      content: `# Name: Nowy Trening Własny\n# Category: Custom\n# Description: Trening w bibliotece lokalnej OPFS\n\n- 8m ramp 48-75% 88rpm\n4x\n- 3m 95% 92rpm\n- 2m 55% 85rpm\n- 5m ramp 65-42% 80rpm\n`,
      isNew: true,
    });
  };

  const handleSaveTxtEditorModal = async () => {
    if (!editingTxtModal) return;
    const parsedWorkout = await writeLocalOpfsWorkoutTextFile(
      editingTxtModal.ownerFolder,
      editingTxtModal.fileName,
      editingTxtModal.content
    );
    if (parsedWorkout && onSaveEditedOpfsWorkout) {
      onSaveEditedOpfsWorkout(parsedWorkout);
    }
    setEditingTxtModal(null);
    await refreshOpfsFileList();
    onNotifyToast?.(
      `Zapisano plik ${editingTxtModal.fileName} w lokalnej bibliotece OPFS oraz w Firebase!`
    );
  };

  const filteredOpfsFiles = opfsFiles.filter((f) => {
    if (opfsFilter === 'all') return true;
    return f.kind === opfsFilter;
  });

  return (
    <div className="space-y-5 pb-8 min-w-0 max-w-full overflow-x-hidden">
      {/* =====================================================================
          0. PENDING OFFLINE SYNC BANNER
         ===================================================================== */}
      {pendingFirebaseActivities.length > 0 && (
        <div className="rounded-2xl bg-[#131B26] border border-amber-500/60 p-4 flex flex-wrap items-center justify-between gap-3.5 min-w-0 overflow-hidden">
          <div className="space-y-1 min-w-0">
            <div className="text-xs sm:text-sm font-bold text-amber-400 flex items-center gap-2">
              <CloudUpload className="w-5 h-5 shrink-0" />
              <span className="break-words">
                Kolejka Offline Sync: {pendingFirebaseActivities.length}{' '}
                {pendingFirebaseActivities.length === 1
                  ? 'ukończony trening oczekuje'
                  : 'ukończone treningi oczekują'}{' '}
                na wysyłkę do Firebase / Google Fit
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Pliki <code>.FIT</code> oraz telemetria <code>1Hz</code> są
              bezpiecznie zapisane w lokalnym <code>OPFS</code>. Kliknij przycisk,
              aby wysłać je do centralnego Firebase Firestore i Google Fit.
            </p>
          </div>
          <button
            onClick={onFlushPendingSync}
            disabled={isSyncingFirebase}
            className="w-full sm:w-auto min-h-[42px] px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-colors shrink-0"
          >
            <RefreshCw
              className={`w-4 h-4 shrink-0 ${
                isSyncingFirebase ? 'animate-spin' : ''
              }`}
            />
            <span className="truncate">
              Wyślij Zaległe Treningi ({pendingFirebaseActivities.length})
            </span>
          </button>
        </div>
      )}

      {/* =====================================================================
          1. CENTRAL FIREBASE CLOUD FIRESTORE & MULTI-USER GOOGLE OAUTH
         ===================================================================== */}
      <div className="rounded-2xl bg-[#131B26] border border-emerald-500/40 p-4 sm:p-5 space-y-4 min-w-0 overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3.5 border-b border-slate-800 pb-4 min-w-0">
          <div className="space-y-1 max-w-3xl min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <Database className="w-5 h-5 text-emerald-400 shrink-0" />
                <span className="break-words">
                  Centralna Chmura Firebase Cloud Firestore & Google OAuth
                </span>
              </h2>
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-[11px] font-bold text-emerald-300 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                Real-Time onSnapshot + .FIT Base64
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed break-words">
              Wszystkie profile domowników łączą się z jedną wspólną bazą{' '}
              <strong className="text-emerald-400">
                {activeConfig?.projectId || 'Firebase'}
              </strong>
              . Każda osoba loguje się swoimi poświadczeniami Google OAuth (brak
              kont anonimowych), aby zapisywać treningi w Firebase oraz wysyłać
              dane na własne konto <strong>Google Fit</strong> i{' '}
              <strong>Intervals.icu</strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={onOpenFastUserSwitcher}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm"
            >
              <Users className="w-4 h-4 shrink-0" />
              <span>Szybki Przełącznik Zawodników</span>
            </button>

            {!googleUser ? (
              <button
                onClick={onGoogleLogin}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                <Cloud className="w-4 h-4 shrink-0" />
                <span>Zaloguj Kontem Google</span>
              </button>
            ) : (
              <button
                onClick={onGoogleLogout}
                className="min-h-[40px] px-3 py-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5 shrink-0" />
                <span>Wyloguj</span>
              </button>
            )}
          </div>
        </div>

        {/* Active Google Account & Firestore Database Status */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-xl bg-[#0B0F17] border border-slate-800 p-3.5 space-y-1">
            <div className="text-[11px] text-slate-400">
              AKTYWNE KONTO GOOGLE OAUTH
            </div>
            <div className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5 truncate">
              {googleUser ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="truncate">{googleUser.email}</span>
                </>
              ) : (
                <span className="text-amber-400">
                  Niezalogowany (Tryb Lokalny OPFS)
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-400">
              {googleUser
                ? 'Połączono z Firebase Auth & Google Fit API'
                : 'Kliknij „Zaloguj Kontem Google”, aby włączyć synchronizację'}
            </div>
          </div>

          <div className="rounded-xl bg-[#0B0F17] border border-slate-800 p-3.5 space-y-1">
            <div className="text-[11px] text-slate-400">
              CENTRALNA BAZA FIREBASE FIRESTORE
            </div>
            <div className="font-mono-tabular text-xs sm:text-sm font-bold text-emerald-400 truncate">
              {activeConfig?.projectId || 'Predefiniowany Projekt'}
            </div>
            <div className="text-[11px] text-slate-400 font-mono-tabular truncate">
              Kolekcje: /profiles ({Object.keys(profiles).length}) ·
              /plannedWorkouts ({workouts.length}) · /completedWorkouts (
              {activities.length})
            </div>
          </div>

          <div className="rounded-xl bg-[#0B0F17] border border-slate-800 p-3.5 space-y-1">
            <div className="text-[11px] text-slate-400">
              INTEGRACJE TRENINGOWE PROFILU
            </div>
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-[11px] font-bold text-emerald-300">
                Firebase .FIT
              </span>
              <span className="px-2 py-0.5 rounded bg-rose-500/20 text-[11px] font-bold text-rose-300 flex items-center gap-1">
                <Activity className="w-3 h-3" /> Google Fit
              </span>
              <span className="px-2 py-0.5 rounded bg-sky-500/20 text-[11px] font-bold text-sky-300">
                Intervals.icu
              </span>
            </div>
            <div className="text-[11px] text-slate-400">
              Automatyczny zapis po każdym treningu
            </div>
          </div>
        </div>

        {/* ===================================================================
            FIREBASE SPARK (FREE PLAN 1 GiB / 1024 MB) STORAGE USAGE BAR
           =================================================================== */}
        <div className="rounded-xl bg-[#0B0F17] border border-slate-800 p-4 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-white">
              <HardDrive className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Wolne miejsce w projekcie Firebase (Darmowy Plan Spark 1 GiB)</span>
            </div>
            <div className="text-xs font-mono-tabular font-bold text-emerald-400">
              Użyto {sparkStorage.usedMb.toFixed(2)} MB / {sparkStorage.limitMb} MB (Pozostało {sparkStorage.remainingMb.toFixed(2)} MB)
            </div>
          </div>

          <div className="w-full h-3 rounded-full bg-slate-800/90 overflow-hidden p-0.5">
            <div
              className={`h-full rounded-full transition-all ${
                sparkStorage.usedPercent > 90
                  ? 'bg-rose-500'
                  : sparkStorage.usedPercent > 70
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
              }`}
              style={{
                width: `${Math.max(1.2, Math.min(100, sparkStorage.usedPercent))}%`,
              }}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
            <span>
              Kolekcje Firestore:{' '}
              <code className="text-emerald-400">hubConfig</code> ·{' '}
              <code className="text-emerald-400">profiles</code> ·{' '}
              <code className="text-emerald-400">plannedWorkouts</code> ·{' '}
              <code className="text-emerald-400">completedWorkouts</code>
            </span>
            {onEnsureFirestoreCollections && (
              <button
                type="button"
                onClick={onEnsureFirestoreCollections}
                disabled={isSyncingFirebase}
                className="text-emerald-400 hover:text-emerald-300 font-semibold underline underline-offset-4"
              >
                Sprawdź / Utwórz brakujące kolekcje (bez usuwania)
              </button>
            )}
          </div>
        </div>

        {/* Everyday Sync Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onSyncAllToFirebase}
              disabled={isSyncingFirebase}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              <FolderSync
                className={`w-4 h-4 shrink-0 ${
                  isSyncingFirebase ? 'animate-spin' : ''
                }`}
              />
              <span>Wyślij Cały Stan do Firebase</span>
            </button>

            <button
              onClick={onRestoreFromFirebase}
              disabled={isSyncingFirebase}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 border border-slate-700 text-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 text-sky-400 shrink-0 ${
                  isSyncingFirebase ? 'animate-spin' : ''
                }`}
              />
              <span>Odśwież z Firebase</span>
            </button>
          </div>
        </div>

        {/* Collapsible Step-by-Step Firebase & Security Rules Guide Dropdown */}
        <FirebaseSetupGuideDropdown
          defaultOpen={false}
          onNotifyToast={onNotifyToast}
        />
      </div>

      {/* =====================================================================
          1A. ZERO-LEAK SECURITY AUDIT & PRIVATE OPFS / FIREBASE LOGS PANEL
         ===================================================================== */}
      <SecurityAuditAndLogsPanel onNotifyToast={onNotifyToast} />

      {/* =====================================================================
          1B. WORKOUT TAGS & CATEGORIES MANAGER (CREATES DROPDOWNS ON MAIN VIEW)
         ===================================================================== */}
      <div className="rounded-2xl bg-[#131B26] border border-slate-800 p-4 sm:p-5 space-y-4 min-w-0 overflow-hidden">
        <div className="space-y-1 border-b border-slate-800 pb-3.5">
          <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
            <Tag className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>Menedżer Tagów i Kategorii Treningowych</span>
          </h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            Każdy tag tworzy rozwijaną kategorię (dropdown) w zakładce{' '}
            <strong className="text-white">1. Wybór Treningu</strong>. Treningi
            mogą mieć przypisanych kilka tagów jednocześnie i wyświetlać się w
            wielu kategoriach.
          </p>
        </div>

        {/* Add New Tag Form */}
        <form
          onSubmit={handleAddCustomTag}
          className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5"
        >
          <input
            type="text"
            value={newTagInput}
            onChange={(e) => setNewTagInput(e.target.value)}
            placeholder="Wpisz nazwę nowego tagu / kategorii (np. Siła, Sprinty, Kadencja, Zima)..."
            className="flex-1 h-11 px-3.5 rounded-xl bg-[#0B0F17] border border-slate-700 text-xs text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
          />
          <button
            type="submit"
            className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shrink-0 transition-colors"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>Dodaj Tag / Kategorię</span>
          </button>
        </form>

        {/* Active Tags List with Workout Counts */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {workoutTags.map((tag) => {
            const count = workouts.filter((w) =>
              inferWorkoutTags(w).includes(tag)
            ).length;
            const isDefault = DEFAULT_WORKOUT_TAGS.includes(tag);

            return (
              <div
                key={tag}
                className="rounded-xl bg-[#0B0F17] border border-slate-800 px-3.5 py-2.5 flex items-center justify-between gap-2 min-w-0"
              >
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white truncate">
                    {tag}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono-tabular">
                    {count}{' '}
                    {count === 1
                      ? 'trening'
                      : count >= 2 && count <= 4
                      ? 'treningi'
                      : 'treningów'}{' '}
                    · {isDefault ? 'Domyślna' : 'Własny tag'}
                  </div>
                </div>

                {!isDefault && (
                  <button
                    type="button"
                    onClick={() => handleRemoveCustomTag(tag)}
                    className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors shrink-0"
                    title="Usuń własny tag"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* =====================================================================
          1C. DIRECT GITHUB PAGES PWA INSTALLATION LINK CARD (ALWAYS VISIBLE)
         ===================================================================== */}
      <div className="rounded-2xl bg-[#131B26] border border-sky-500/40 p-4 sm:p-5 space-y-3.5 min-w-0 overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-sky-400 shrink-0" />
                <span>
                  Link do Instalacji Aplikacji PWA (GitHub Pages)
                </span>
              </h2>
              <span className="px-2 py-0.5 rounded-md bg-sky-500/20 border border-sky-500/40 text-[11px] font-bold text-sky-300">
                Android & iOS Standalone
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Otwórz poniższy adres bezpośrednio w przeglądarce Chrome (Android)
              lub Safari (iOS) na telefonie bądź tablecie, aby zainstalować pełną
              aplikację PWA na ekranie głównym.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <a
              href={ghPagesUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[42px] px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm"
            >
              <ExternalLink className="w-4 h-4 shrink-0" />
              <span>Otwórz GitHub Pages (Zainstaluj Apkę)</span>
            </a>

            <button
              type="button"
              onClick={handleCopyGhPagesUrl}
              className="min-h-[42px] px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              <Copy className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Kopiuj Link</span>
            </button>

            {isPwaInstallable && !isPwaInstalled && (
              <button
                type="button"
                onClick={onInstallPwa}
                className="min-h-[42px] px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                <Smartphone className="w-4 h-4 shrink-0" />
                <span>Zainstaluj Teraz</span>
              </button>
            )}
          </div>
        </div>

        {/* Clickable URL Bar + Quick Edit Option */}
        <div className="rounded-xl bg-[#0B0F17] border border-slate-800 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <GitBranch className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="text-slate-400 shrink-0">Adres Pages:</span>
            <a
              href={ghPagesUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono-tabular font-bold text-emerald-400 hover:underline truncate"
            >
              {ghPagesUrl}
            </a>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <a
              href={`${DEFAULT_GITHUB_REPO_URL}/actions`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-semibold text-sky-400 hover:underline flex items-center gap-1"
            >
              <span>Status GitHub Actions</span>
              <ExternalLink className="w-3 h-3" />
            </a>
            <button
              type="button"
              onClick={() => setIsEditingGhPagesUrl((v) => !v)}
              className="text-[11px] font-semibold text-slate-400 hover:text-white underline underline-offset-4"
            >
              {isEditingGhPagesUrl ? 'Anuluj' : 'Zmień URL'}
            </button>
          </div>
        </div>

        {isEditingGhPagesUrl && (
          <form
            onSubmit={handleSaveGhPagesUrl}
            className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1"
          >
            <input
              type="url"
              value={ghPagesUrl}
              onChange={(e) => setGhPagesUrl(e.target.value)}
              placeholder={DEFAULT_GITHUB_PAGES_URL}
              className="flex-1 h-10 px-3 rounded-xl bg-[#0B0F17] border border-slate-700 font-mono-tabular text-xs text-white focus:border-emerald-500 focus:outline-none"
            />
            <button
              type="submit"
              className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shrink-0"
            >
              Zapisz adres URL
            </button>
          </form>
        )}
      </div>

      {/* =====================================================================
          2. EYE-FRIENDLY LOW-CONTRAST THEME SWITCHER (SOFT LIGHT & SOFT DARK)
         ===================================================================== */}
      <div className="rounded-2xl bg-[#131B26] border border-slate-800 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 min-w-0 overflow-hidden">
        <div className="space-y-1 min-w-0">
          <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
            {themeMode === 'soft-light' ? (
              <Sun className="w-5 h-5 text-amber-400 shrink-0" />
            ) : (
              <Moon className="w-5 h-5 text-sky-400 shrink-0" />
            )}
            <span className="truncate">
              Motyw Ochrony Wzroku (Niski Kontrast)
            </span>
          </h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            Wybierz jasną gamę szarości i ciepłych bieli lub zbalansowany ciemny
            grafit.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:flex items-center gap-1.5 p-1 rounded-xl bg-[#0B0F17] border border-slate-800 w-full sm:w-auto min-w-0">
          <button
            onClick={() => onChangeThemeMode('soft-light')}
            className={`min-h-[40px] px-3 sm:px-4 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors truncate min-w-0 ${
              themeMode === 'soft-light'
                ? 'bg-emerald-500 text-slate-950'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Sun className="w-4 h-4 shrink-0" />
            <span className="sm:hidden truncate">Jasny</span>
            <span className="hidden sm:inline">Jasny (Ciepła Biel)</span>
          </button>
          <button
            onClick={() => onChangeThemeMode('soft-dark')}
            className={`min-h-[40px] px-3 sm:px-4 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors truncate min-w-0 ${
              themeMode === 'soft-dark'
                ? 'bg-emerald-500 text-slate-950'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Moon className="w-4 h-4 shrink-0" />
            <span className="sm:hidden truncate">Ciemny</span>
            <span className="hidden sm:inline">Ciemny (Grafit)</span>
          </button>
        </div>
      </div>

      {/* =====================================================================
          3. COLLAPSIBLE ACCORDION: ADVANCED TECHNICAL TOOLS (OPFS, FIREBASE CONFIG, BACKUP)
         ===================================================================== */}
      <div className="rounded-2xl bg-[#131B26] border border-slate-800 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAdvancedTools((v) => !v)}
          className="w-full min-h-[58px] px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-slate-800/30 transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border transition-colors ${
                showAdvancedTools
                  ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                  : 'bg-[#0B0F17] text-slate-300 border-slate-800'
              }`}
            >
              {showAdvancedTools ? (
                <ChevronDown className="w-5 h-5" />
              ) : (
                <ChevronRight className="w-5 h-5" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <Wrench className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="truncate">
                  Zaawansowane Narzędzia Techniczne (OPFS, Konfiguracja Firebase, Backup .JSON)
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate mt-0.5">
                Przeglądarka plików lokalnych OPFS ({opfsFiles.length} plików), edycja firebaseConfig, ręczny eksport/import JSON i linki deweloperskie
              </p>
            </div>
          </div>

          <span className="text-xs font-semibold text-emerald-400 shrink-0 hidden sm:inline">
            {showAdvancedTools ? 'Zwiń' : 'Rozwiń narzędzia'}
          </span>
        </button>

        {showAdvancedTools && (
          <div className="border-t border-slate-800 p-4 sm:p-5 space-y-5 bg-[#0B0F17]/40">
            {/* Manual JSON Backup + Firebase Config Toggle */}
            <div className="rounded-2xl bg-[#131B26] border border-slate-800 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleExportFullBackupJson}
                    className="min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Eksport Kopii (.JSON)</span>
                  </button>

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>Import Kopii (.JSON)</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleImportBackupFileChange}
                    className="hidden"
                  />
                </div>

                <button
                  onClick={() => setShowCustomFirebaseConfig((v) => !v)}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#0B0F17] hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-emerald-300 transition-colors"
                >
                  {showCustomFirebaseConfig
                    ? 'Ukryj edytor firebaseConfig'
                    : 'Pokaż / Zmień firebaseConfig'}
                </button>
              </div>

              {showCustomFirebaseConfig && (
                <div className="rounded-xl bg-[#0B0F17] border border-slate-800 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-bold text-white">
                      Konfiguracja projektu Firebase (
                      {isUsingCustomConfig
                        ? 'Zapisana w pamięci urządzenia PWA (localStorage)'
                        : 'Środowisko deweloperskie AI Studio'}
                      )
                    </div>
                    {isUsingCustomConfig && (
                      <button
                        onClick={clearCustomFirebaseConfig}
                        className="px-3 py-1 rounded-lg bg-rose-500/20 text-rose-300 text-xs font-semibold"
                      >
                        Usuń konfigurację z pamięci urządzenia
                      </button>
                    )}
                  </div>
                  <textarea
                    rows={9}
                    value={firebaseJsonInput}
                    onChange={(e) => setFirebaseJsonInput(e.target.value)}
                    placeholder={FIREBASE_CONSOLE_PLACEHOLDER}
                    className="w-full p-3 rounded-xl bg-[#131B26] border border-slate-700 font-mono-tabular text-xs text-emerald-300 focus:border-emerald-500 focus:outline-none"
                  />
                  <div className="flex justify-end">
                    <button
                      onClick={handleSaveCustomFirebase}
                      className="min-h-[38px] px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs"
                    >
                      Zapisz w pamięci urządzenia i przeładuj
                    </button>
                  </div>
                </div>
              )}
            </div>
      <div className="rounded-2xl bg-[#131B26] border border-slate-800 p-4 sm:p-5 space-y-4 min-w-0 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 border-b border-slate-800 pb-4">
          <div className="space-y-1 min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <GitBranch className="w-5 h-5 text-sky-400 shrink-0" />
              <span className="truncate">
                Wdrożenie GitHub Pages (GitHub Actions) & Aktualizacje PWA (v
                {CURRENT_APP_VERSION})
              </span>
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Kod publikowany przez natywną integrację GitHub w AI Studio
              automatycznie uruchamia workflow{' '}
              <code className="text-emerald-400">
                .github/workflows/deploy.yml
              </code>{' '}
              i buduje aplikację na gałąź <code>gh-pages</code>. Zainstalowana na
              telefonie aplikacja PWA sama pobiera aktualizację przy starcie.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {isPwaInstallable && !isPwaInstalled && (
              <button
                onClick={onInstallPwa}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors"
              >
                <Smartphone className="w-4 h-4 shrink-0" />
                <span>Zainstaluj PWA</span>
              </button>
            )}
            <button
              onClick={handleForceSwUpdate}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Sprawdź Update PWA Teraz</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <a
            href={`https://console.firebase.google.com/project/${
              activeConfig?.projectId || ''
            }/authentication/settings`}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl bg-[#0B0F17] border border-slate-800 hover:border-emerald-500/50 p-3.5 flex items-center justify-between gap-2 text-slate-200 transition-colors"
          >
            <div>
              <div className="font-bold text-emerald-400">
                1. Firebase Authorized Domains
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Dodaj domenę *.github.io do autoryzacji OAuth
              </div>
            </div>
            <ExternalLink className="w-4 h-4 text-slate-400 shrink-0" />
          </a>

          <a
            href={`https://console.firebase.google.com/project/${
              activeConfig?.projectId || ''
            }/firestore`}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl bg-[#0B0F17] border border-slate-800 hover:border-sky-500/50 p-3.5 flex items-center justify-between gap-2 text-slate-200 transition-colors"
          >
            <div>
              <div className="font-bold text-sky-400">
                2. Konsola Firebase Firestore
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Podgląd kolekcji profiles, plannedWorkouts i completedWorkouts
              </div>
            </div>
            <ExternalLink className="w-4 h-4 text-slate-400 shrink-0" />
          </a>

          <a
            href="https://console.cloud.google.com/apis/library/fitness.googleapis.com"
            target="_blank"
            rel="noreferrer"
            className="rounded-xl bg-[#0B0F17] border border-slate-800 hover:border-rose-500/50 p-3.5 flex items-center justify-between gap-2 text-slate-200 transition-colors"
          >
            <div>
              <div className="font-bold text-rose-400">
                3. Google Fitness REST API
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Panel API Google Fit w Google Cloud Console
              </div>
            </div>
            <ExternalLink className="w-4 h-4 text-slate-400 shrink-0" />
          </a>
        </div>
      </div>

      {/* =====================================================================
          4. LOCAL OPFS FILE SYSTEM & LIVE .TXT EDITOR (PER-USER FOLDERS)
         ===================================================================== */}
      <div className="rounded-2xl bg-[#131B26] border border-slate-800 p-4 sm:p-5 space-y-4 min-w-0 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 border-b border-slate-800 pb-4 min-w-0">
          <div className="space-y-1 min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-amber-400 shrink-0" />
              <span className="break-words">
                Pamięć Lokalna Offline OPFS (.TXT, .FIT, 1Hz)
              </span>
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Lokalny bufor urządzenia używany w trybie Offline (gdy wyłączysz
              Wi-Fi na czas treningu).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto min-w-0">
            <button
              onClick={() => handleCreateNewOpfsTxt()}
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-400 text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1 truncate"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">+ Nowy Plik .TXT</span>
            </button>
            <button
              onClick={refreshOpfsFileList}
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-[11px] sm:text-xs font-semibold text-slate-200 flex items-center justify-center gap-1 truncate"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 shrink-0 ${
                  isLoadingOpfs ? 'animate-spin' : ''
                }`}
              />
              <span className="truncate">Odśwież</span>
            </button>
          </div>
        </div>

        {/* Filter Tabs by File Type */}
        <div className="flex flex-wrap items-center justify-between gap-3 min-w-0">
          <div className="grid grid-cols-3 sm:flex sm:flex-wrap items-center gap-1 p-1 rounded-xl bg-[#0B0F17] border border-slate-800 w-full sm:w-auto min-w-0">
            <button
              onClick={() => setOpfsFilter('all')}
              className={`min-h-[34px] px-2.5 sm:px-3 py-1 rounded-lg text-[11px] sm:text-xs font-semibold transition-colors truncate text-center ${
                opfsFilter === 'all'
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'text-slate-300'
              }`}
            >
              Wszystkie ({opfsFiles.length})
            </button>
            <button
              onClick={() => setOpfsFilter('txt')}
              className={`min-h-[34px] px-2.5 sm:px-3 py-1 rounded-lg text-[11px] sm:text-xs font-semibold transition-colors truncate text-center ${
                opfsFilter === 'txt'
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'text-slate-300'
              }`}
            >
              Treningi .TXT ({opfsFiles.filter((f) => f.kind === 'txt').length})
            </button>
            <button
              onClick={() => setOpfsFilter('fit')}
              className={`min-h-[34px] px-2.5 sm:px-3 py-1 rounded-lg text-[11px] sm:text-xs font-semibold transition-colors truncate text-center ${
                opfsFilter === 'fit'
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'text-slate-300'
              }`}
            >
              Pliki .FIT ({opfsFiles.filter((f) => f.kind === 'fit').length})
            </button>
          </div>
        </div>

        {/* File List in OPFS */}
        {filteredOpfsFiles.length === 0 ? (
          <div className="rounded-xl bg-[#0B0F17] border border-slate-800 p-4 text-center text-xs text-slate-400">
            Brak plików w wybranym podfolderze OPFS. Po zapisaniu treningu lub
            ukończeniu jazdy pliki <code>.txt</code>, <code>.fit</code> oraz{' '}
            <code>Telemetry_JSON</code> zapisują się tutaj automatycznie.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-72 overflow-y-auto pr-1 min-w-0">
            {filteredOpfsFiles.map((file) => (
              <div
                key={file.path}
                className="rounded-xl bg-[#0B0F17] border border-slate-800 p-3 flex items-center justify-between gap-2.5 min-w-0 overflow-hidden"
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-mono-tabular text-slate-400 min-w-0">
                    <span className="text-emerald-400 font-semibold truncate">
                      {file.folderBranch}
                    </span>
                    <span className="shrink-0">·</span>
                    <span className="shrink-0">
                      {(file.sizeBytes / 1024).toFixed(1)} KB
                    </span>
                  </div>
                  <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="truncate">{file.name}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {file.kind === 'txt' && (
                    <button
                      onClick={() => handleOpenTxtFileEditor(file)}
                      className="min-h-[34px] px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] sm:text-xs font-semibold text-amber-400 flex items-center gap-1"
                    >
                      <Edit3 className="w-3.5 h-3.5 shrink-0" />
                      <span className="hidden sm:inline">Edytuj</span>
                    </button>
                  )}
                  <button
                    onClick={() =>
                      downloadLocalOpfsFile(file.folderBranch, file.name)
                    }
                    className="min-h-[34px] px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] sm:text-xs font-semibold text-slate-200 flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5 shrink-0" />
                    <span className="hidden sm:inline">Pobierz</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
          </div>
        )}
      </div>

      {/* MODAL: LIVE OPFS .TXT WORKOUT EDITOR */}
      {editingTxtModal && editingTxtModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-xl rounded-2xl bg-[#131B26] border border-amber-500/40 p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-amber-400">
                <FileText className="w-5 h-5" />
                <h3 className="text-base font-bold text-white">
                  Edytor Pliku Treningowego .TXT (/Workouts_Library/
                  {editingTxtModal.ownerFolder})
                </h3>
              </div>
              <button
                onClick={() => setEditingTxtModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Nazwa pliku .txt
                </label>
                <input
                  type="text"
                  value={editingTxtModal.fileName}
                  onChange={(e) =>
                    setEditingTxtModal({
                      ...editingTxtModal,
                      fileName: e.target.value,
                    })
                  }
                  className="w-full h-10 px-3 rounded-xl bg-[#0B0F17] border border-slate-700 font-mono-tabular text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Definicja interwałów (składnia Intervals.icu)
                </label>
                <textarea
                  rows={10}
                  value={editingTxtModal.content}
                  onChange={(e) =>
                    setEditingTxtModal({
                      ...editingTxtModal,
                      content: e.target.value,
                    })
                  }
                  className="w-full p-3 rounded-xl bg-[#0B0F17] border border-slate-700 font-mono-tabular text-xs text-emerald-300 focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setEditingTxtModal(null)}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200"
              >
                Anuluj
              </button>
              <button
                onClick={handleSaveTxtEditorModal}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs"
              >
                Zapisz Plik .TXT
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
