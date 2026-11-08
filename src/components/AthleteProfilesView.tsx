import React, { useState } from 'react';
import {
  Users,
  Heart,
  Zap,
  Link2,
  RefreshCw,
  CheckCircle2,
  Plus,
  Trash2,
  Dumbbell,
  Edit3,
  Activity,
  Cloud,
  X,
} from 'lucide-react';
import {
  AthleteProfile,
  OfflineTrainingMode,
  ProfileId,
} from '../types/cycling';
import {
  buildHrZonesFromMax,
  createNewAthleteProfile,
  PROFILE_AVATAR_COLORS,
} from '../services/rampAndPhysiologyEngine';

interface AthleteProfilesViewProps {
  profiles: Record<ProfileId, AthleteProfile>;
  activeProfileId: ProfileId;
  onSelectProfile: (id: ProfileId) => void;
  onUpdateProfile: (id: ProfileId, updated: AthleteProfile) => void;
  onAddProfile: (newProfile: AthleteProfile) => void;
  onDeleteProfile: (id: ProfileId) => void;
  isSyncingIntervals: boolean;
  onSyncFromIntervalsIcu: () => void;
  onOpenFastUserSwitcher?: () => void;
  onRefreshGoogleFitToken?: () => void;
}

export const AthleteProfilesView: React.FC<AthleteProfilesViewProps> = ({
  profiles,
  activeProfileId,
  onSelectProfile,
  onUpdateProfile,
  onAddProfile,
  onDeleteProfile,
  isSyncingIntervals,
  onSyncFromIntervalsIcu,
  onOpenFastUserSwitcher,
  onRefreshGoogleFitToken,
}) => {
  const profileList = Object.values(profiles);
  const activeProfile = profiles[activeProfileId] || profileList[0];

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<ProfileId | null>(null);

  // New Profile Form State
  const [newName, setNewName] = useState('');
  const [newFtp, setNewFtp] = useState(200);
  const [newWeight, setNewWeight] = useState(75);
  const [newMaxHr, setNewMaxHr] = useState(188);
  const [newColor, setNewColor] = useState(PROFILE_AVATAR_COLORS[1]);
  const [newOfflineMode, setNewOfflineMode] = useState<OfflineTrainingMode>('all');
  const [newIntervalsEnabled, setNewIntervalsEnabled] = useState(false);
  const [newAthleteId, setNewAthleteId] = useState('');
  const [newApiKey, setNewApiKey] = useState('');
  const [newGoogleFitEnabled, setNewGoogleFitEnabled] = useState(true);

  const handleFieldChange = (patch: Partial<AthleteProfile>) => {
    const next: AthleteProfile = {
      ...activeProfile,
      ...patch,
    };
    if (patch.maxHrBpm && patch.maxHrBpm >= 120 && patch.maxHrBpm <= 230) {
      next.hrZones = buildHrZonesFromMax(patch.maxHrBpm);
    }
    onUpdateProfile(activeProfile.id, next);
  };

  const handleIntervalsChange = (patch: Partial<AthleteProfile['intervals']>) => {
    onUpdateProfile(activeProfile.id, {
      ...activeProfile,
      intervals: {
        ...activeProfile.intervals,
        ...patch,
      },
    });
  };

  const handleGoogleFitChange = (
    patch: Partial<NonNullable<AthleteProfile['googleFit']>>
  ) => {
    const currentFit = activeProfile.googleFit || {
      enabled: true,
      autoUploadActivities: true,
    };
    onUpdateProfile(activeProfile.id, {
      ...activeProfile,
      googleFit: {
        ...currentFit,
        ...patch,
      },
    });
  };

  const handleCreateProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const created = createNewAthleteProfile({
      name: newName.trim(),
      avatarColor: newColor,
      ftpWatts: newFtp,
      weightKg: newWeight,
      maxHrBpm: newMaxHr,
      offlineMode: newOfflineMode,
      intervalsEnabled: newIntervalsEnabled,
      athleteId: newAthleteId,
      apiKey: newApiKey,
      existingIds: Object.keys(profiles),
    });
    created.googleFit = {
      enabled: newGoogleFitEnabled,
      autoUploadActivities: true,
    };
    onAddProfile(created);
    setNewName('');
    setNewAthleteId('');
    setNewApiKey('');
    setNewIntervalsEnabled(false);
    setIsAddModalOpen(false);
  };

  const offlineModeLabel = (mode?: OfflineTrainingMode) => {
    if (mode === 'ftp_builder') return 'Budowa FTP i Interwały';
    if (mode === 'cardio_fitness') return 'Cardio, Zdrowie i Spalanie';
    return 'Wszystkie Treningi (Kompletny)';
  };

  const isGoogleFitEnabled = activeProfile.googleFit?.enabled !== false;

  return (
    <div className="space-y-5 pb-8 min-w-0 max-w-full overflow-x-hidden">
      {/* 1. DYNAMIC MULTI-PROFILE BAR + FAST USER SWITCHER + ADD PROFILE BUTTON */}
      <div className="rounded-2xl bg-[#131B26] border border-slate-800 p-4 sm:p-5 space-y-4 min-w-0 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 min-w-0">
          <div className="space-y-1 min-w-0">
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-emerald-400 shrink-0" />
              <span className="truncate">
                Profile Zawodników (Firebase + Google Fit + Intervals.icu)
              </span>
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Wszystkie profile zapisują swoje treningi do jednej wspólnej bazy{' '}
              <strong className="text-emerald-400">Firebase Cloud Firestore</strong>.
              Każda osoba loguje się własnym kontem Google, aby wysyłać dane na
              swoje konto <strong className="text-rose-400">Google Fit</strong> lub{' '}
              <strong className="text-sky-400">Intervals.icu</strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {onOpenFastUserSwitcher && (
              <button
                onClick={onOpenFastUserSwitcher}
                className="min-h-[42px] px-3.5 py-2 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                <RefreshCw className="w-4 h-4 shrink-0" />
                <span>Przełącz Konto Google</span>
              </button>
            )}
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>+ Dodaj Nowy Profil</span>
            </button>
          </div>
        </div>

        {/* Dynamic Profile Selector Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {profileList.map((p) => {
            const isSelected = p.id === activeProfile.id;
            return (
              <div
                key={p.id}
                onClick={() => onSelectProfile(p.id)}
                className={`cursor-pointer rounded-xl p-3 border transition-all flex items-center justify-between gap-2.5 min-w-0 ${
                  isSelected
                    ? 'bg-emerald-500/15 border-emerald-500 text-white shadow-sm'
                    : 'bg-[#0B0F17] border-slate-800 hover:border-slate-700 text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {p.photoURL ? (
                    <img
                      src={p.photoURL}
                      alt={p.name}
                      className="w-8 h-8 rounded-full border shrink-0"
                      style={{ borderColor: p.avatarColor || '#10B981' }}
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span
                      className="w-3.5 h-3.5 rounded-full shrink-0 ring-2 ring-white/10"
                      style={{ backgroundColor: p.avatarColor || '#10B981' }}
                    />
                  )}
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-bold text-white truncate">
                      {p.name}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono-tabular truncate">
                      {p.email ? `${p.email} · ` : `/${p.id} · `}FTP {p.ftpWatts}W ·{' '}
                      {p.weightKg}kg
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-[10px] font-bold text-emerald-300">
                    FB
                  </span>
                  {p.googleFit?.enabled !== false && (
                    <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-[10px] font-bold text-rose-300">
                      GFit
                    </span>
                  )}
                  {p.intervals.enabled && p.intervals.apiKey.trim() && (
                    <span className="px-1.5 py-0.5 rounded bg-sky-500/20 text-[10px] font-bold text-sky-300">
                      ICU
                    </span>
                  )}
                  {profileList.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDeleteId(p.id);
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      title={`Usuń profil ${p.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. ACTIVE PROFILE IDENTITY & OFFLINE FITNESS MODE */}
      <div className="rounded-2xl bg-[#131B26] border border-slate-800 p-4 sm:p-5 space-y-4 min-w-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 min-w-0">
            <Edit3 className="w-4 h-4 text-emerald-400 shrink-0" />
            <h3 className="text-sm sm:text-base font-bold text-white truncate">
              Konfiguracja Profilu i Konta Google — {activeProfile.name}
            </h3>
          </div>
          <div className="flex items-center gap-3 text-[11px] font-mono-tabular text-slate-400">
            <span>
              Konto Google:{' '}
              <strong className="text-emerald-400">
                {activeProfile.email || 'Nieprzypisane'}
              </strong>
            </span>
            <span>·</span>
            <span>
              OPFS: <strong className="text-emerald-400">/{activeProfile.id}</strong>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-end">
          <div className="md:col-span-4 min-w-0">
            <label className="block text-xs text-slate-400 mb-1">
              Nazwa wyświetlana profilu
            </label>
            <input
              type="text"
              value={activeProfile.name}
              onChange={(e) => handleFieldChange({ name: e.target.value })}
              className="w-full h-10 px-3 rounded-xl bg-[#0B0F17] border border-slate-700 text-sm font-bold text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div className="md:col-span-5 min-w-0">
            <label className="block text-xs text-slate-400 mb-1 flex items-center gap-1.5">
              <Dumbbell className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Tryb Fitness Offline (Fokus treningowy profilu)</span>
            </label>
            <select
              value={activeProfile.offlineMode || 'all'}
              onChange={(e) => {
                const mode = e.target.value as OfflineTrainingMode;
                handleFieldChange({
                  offlineMode: mode,
                  subtitle: offlineModeLabel(mode),
                });
              }}
              className="w-full h-10 px-3 rounded-xl bg-[#0B0F17] border border-slate-700 text-xs sm:text-sm font-semibold text-white focus:border-emerald-500 focus:outline-none"
            >
              <option value="all">
                Wszystkie treningi (Kompletny komputer kolarski)
              </option>
              <option value="ftp_builder">
                Budowa FTP, Sweet Spot & Interwały VO2Max
              </option>
              <option value="cardio_fitness">
                Cardio, Zdrowie & Spalanie Tlenowe (Z1–Z3)
              </option>
            </select>
          </div>

          <div className="md:col-span-3 min-w-0">
            <label className="block text-xs text-slate-400 mb-1">Kolor profilu</label>
            <div className="flex items-center gap-2 h-10 px-3 rounded-xl bg-[#0B0F17] border border-slate-800">
              {PROFILE_AVATAR_COLORS.map((col) => (
                <button
                  key={col}
                  type="button"
                  onClick={() => handleFieldChange({ avatarColor: col })}
                  className={`w-5 h-5 rounded-full transition-transform ${
                    activeProfile.avatarColor === col
                      ? 'scale-125 ring-2 ring-white'
                      : 'opacity-70 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: col }}
                  title={`Wybierz kolor ${col}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 3. PHYSIOLOGY: FTP, WEIGHT, HR PARAMETERS & AUTOMATIC ZONES */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5 rounded-2xl bg-[#131B26] border border-slate-800 p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-base font-bold text-white">
                Parametry Fizjologiczne — {activeProfile.name}
              </h3>
              <p className="text-xs text-slate-400">
                Wartości bazowe do przeliczania watów i stref tętna podczas jazdy
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Aktualne FTP (Waty)
              </label>
              <input
                type="number"
                min={60}
                max={550}
                value={activeProfile.ftpWatts}
                onChange={(e) =>
                  handleFieldChange({
                    ftpWatts: Math.max(60, parseInt(e.target.value || '180', 10)),
                  })
                }
                className="w-full h-11 px-3 rounded-xl bg-[#0B0F17] border border-slate-700 font-mono-tabular text-base font-bold text-emerald-400 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Masa ciała (kg)
              </label>
              <input
                type="number"
                min={35}
                max={160}
                value={activeProfile.weightKg}
                onChange={(e) =>
                  handleFieldChange({
                    weightKg: Math.max(35, parseInt(e.target.value || '65', 10)),
                  })
                }
                className="w-full h-11 px-3 rounded-xl bg-[#0B0F17] border border-slate-700 font-mono-tabular text-base font-bold text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Tętno Maksymalne (HR Max)
              </label>
              <input
                type="number"
                min={120}
                max={225}
                value={activeProfile.maxHrBpm}
                onChange={(e) =>
                  handleFieldChange({
                    maxHrBpm: Math.max(120, parseInt(e.target.value || '185', 10)),
                  })
                }
                className="w-full h-11 px-3 rounded-xl bg-[#0B0F17] border border-slate-700 font-mono-tabular text-base font-bold text-rose-400 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Tętno Progowe (LTHR)
              </label>
              <input
                type="number"
                min={100}
                max={210}
                value={activeProfile.lthrBpm}
                onChange={(e) =>
                  handleFieldChange({
                    lthrBpm: Math.max(100, parseInt(e.target.value || '168', 10)),
                  })
                }
                className="w-full h-11 px-3 rounded-xl bg-[#0B0F17] border border-slate-700 font-mono-tabular text-base font-bold text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="rounded-xl bg-[#0B0F17] border border-slate-800 p-3 flex items-center justify-between text-xs">
            <span className="text-slate-400">
              Wskaźnik mocy względnej (W/kg na progu):
            </span>
            <span className="font-mono-tabular font-bold text-emerald-400 text-sm">
              {(
                activeProfile.ftpWatts / Math.max(35, activeProfile.weightKg)
              ).toFixed(2)}{' '}
              W/kg
            </span>
          </div>
        </div>

        {/* Zones Preview (Power Z1-Z7 & HR Z1-Z5) */}
        <div className="lg:col-span-7 rounded-2xl bg-[#131B26] border border-slate-800 p-4 sm:p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Power Zones */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200 uppercase tracking-wider">
              <Zap className="w-4 h-4 text-emerald-400" />
              Strefy Mocy (FTP {activeProfile.ftpWatts} W)
            </div>
            <div className="space-y-1.5">
              {activeProfile.powerZones.map((pz) => {
                const minW = Math.round(
                  (pz.minPct / 100) * activeProfile.ftpWatts
                );
                const maxW =
                  pz.maxPct >= 250
                    ? 'MAX'
                    : `${Math.round((pz.maxPct / 100) * activeProfile.ftpWatts)}W`;
                return (
                  <div
                    key={pz.zone}
                    className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-[#0B0F17] border border-slate-800/80 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: pz.color }}
                      />
                      <span className="font-medium text-slate-200 truncate">
                        {pz.name}
                      </span>
                    </div>
                    <span className="font-mono-tabular font-semibold text-slate-300 shrink-0 ml-2">
                      {minW}–{maxW}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Heart Rate Zones */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200 uppercase tracking-wider">
              <Heart className="w-4 h-4 text-rose-400" />
              Strefy Tętna (Max {activeProfile.maxHrBpm} BPM)
            </div>
            <div className="space-y-1.5">
              {activeProfile.hrZones.map((hz) => (
                <div
                  key={hz.zone}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#0B0F17] border border-slate-800/80 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: hz.color }}
                    />
                    <span className="font-medium text-slate-200 truncate">
                      {hz.name}
                    </span>
                  </div>
                  <span className="font-mono-tabular font-semibold text-slate-300 shrink-0 ml-2">
                    {hz.minBpm}–{hz.maxBpm} bpm
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 4. GOOGLE FIT + FIREBASE CLOUD INTEGRATION */}
      <div className="rounded-2xl bg-[#131B26] border border-slate-800 p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-rose-400" />
              Integracja z Google Fit & Centralnym Firebase — {activeProfile.name}
            </h3>
            <p className="text-xs text-slate-400">
              Po zalogowaniu własnym kontem Google każdy zakończony trening jest
              zapisywany w centralnej bazie{' '}
              <strong className="text-emerald-400">Firebase Firestore</strong> oraz
              automatycznie wysyłany do osobistego konta{' '}
              <strong className="text-rose-400">Google Fit</strong> (moc, tętno,
              kalorie, sesja stacjonarna).
            </p>
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isGoogleFitEnabled}
              onChange={(e) =>
                handleGoogleFitChange({ enabled: e.target.checked })
              }
              className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-0"
            />
            <span className="text-xs font-bold text-slate-200">
              {isGoogleFitEnabled
                ? 'Automatyczny eksport do Google Fit Włączony'
                : 'Eksport do Google Fit Wyłączony'}
            </span>
          </label>
        </div>

        <div className="rounded-xl bg-[#0B0F17] border border-slate-800 p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 text-slate-300">
            <Cloud className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              Konto Google powiązane z profilem:{' '}
              <strong className="text-white">
                {activeProfile.email || 'Zaloguj konto Google w przełączniku'}
              </strong>
            </span>
          </div>
          {onRefreshGoogleFitToken && (
            <button
              onClick={onRefreshGoogleFitToken}
              className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 font-bold text-xs flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Autoryzuj / Odśwież Token Google Fit</span>
            </button>
          )}
        </div>
      </div>

      {/* 5. INTERVALS.ICU INTEGRATION (AVAILABLE FOR EVERY PROFILE) */}
      <div className="rounded-2xl bg-[#131B26] border border-slate-800 p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Link2 className="w-4 h-4 text-sky-400" />
              Integracja z Intervals.icu — {activeProfile.name}
            </h3>
            <p className="text-xs text-slate-400">
              Każdy profil może niezależnie synchronizować kalendarz treningów,
              wykresy Fitness (CTL/ATL/TSB) i pliki .FIT z własnym kontem
              Intervals.icu.
            </p>
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={activeProfile.intervals.enabled}
              onChange={(e) =>
                handleIntervalsChange({ enabled: e.target.checked })
              }
              className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-0"
            />
            <span className="text-xs font-bold text-slate-200">
              {activeProfile.intervals.enabled
                ? 'Połączono z Intervals.icu'
                : 'Tryb bez Intervals.icu (Firebase + Google Fit + Offline)'}
            </span>
          </label>
        </div>

        {activeProfile.intervals.enabled ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Athlete ID (np. <code>i123456</code> lub <code>0</code>)
              </label>
              <input
                type="text"
                value={activeProfile.intervals.athleteId}
                onChange={(e) =>
                  handleIntervalsChange({ athleteId: e.target.value })
                }
                placeholder="0 lub i123456"
                className="w-full h-10 px-3 rounded-xl bg-[#0B0F17] border border-slate-700 font-mono-tabular text-xs text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Intervals.icu API Key (Ustawienia → Developer Settings)
              </label>
              <input
                type="password"
                value={activeProfile.intervals.apiKey}
                onChange={(e) =>
                  handleIntervalsChange({ apiKey: e.target.value })
                }
                placeholder="Wklej osobisty klucz API..."
                className="w-full h-10 px-3 rounded-xl bg-[#0B0F17] border border-slate-700 font-mono-tabular text-xs text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onSyncFromIntervalsIcu}
                disabled={isSyncingIntervals}
                className="w-full min-h-[40px] px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-colors"
              >
                <RefreshCw
                  className={`w-4 h-4 ${
                    isSyncingIntervals ? 'animate-spin' : ''
                  }`}
                />
                Pobierz Kalendarz i Bibliotekę z Intervals.icu
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl bg-[#0B0F17] border border-slate-800/80 p-3.5 flex items-center gap-2.5 text-xs text-slate-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              Profil <strong>{activeProfile.name}</strong> synchronizuje wszystkie
              treningi z centralnym <strong>Firebase Firestore</strong>, opcjonalnie
              eksportuje jazdy do <strong>Google Fit</strong> oraz zapisuje pliki{' '}
              <code>.FIT</code> w lokalnym katalogu OPFS.
            </span>
          </div>
        )}
      </div>

      {/* MODAL: ADD NEW ATHLETE PROFILE */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
          <form
            onSubmit={handleCreateProfileSubmit}
            className="w-full max-w-lg rounded-3xl bg-[#131B26] border border-emerald-500/40 p-5 sm:p-6 space-y-4 shadow-2xl my-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base sm:text-lg font-bold text-white">
                  Dodaj Nowy Profil Kolarza
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Nazwa profilu (np. imię lub pseudonim)
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="np. Kolarz 2"
                  className="w-full h-10 px-3 rounded-xl bg-[#0B0F17] border border-slate-700 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Domyślny Tryb Fitness Offline
                </label>
                <select
                  value={newOfflineMode}
                  onChange={(e) =>
                    setNewOfflineMode(e.target.value as OfflineTrainingMode)
                  }
                  className="w-full h-10 px-3 rounded-xl bg-[#0B0F17] border border-slate-700 text-xs sm:text-sm text-white focus:border-emerald-500 focus:outline-none"
                >
                  <option value="all">
                    Wszystkie treningi (Kompletny komputer kolarski)
                  </option>
                  <option value="ftp_builder">
                    Budowa FTP, Sweet Spot & Interwały VO2Max
                  </option>
                  <option value="cardio_fitness">
                    Cardio, Zdrowie & Spalanie Tlenowe (Z1–Z3)
                  </option>
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    FTP (Waty)
                  </label>
                  <input
                    type="number"
                    min={60}
                    max={550}
                    value={newFtp}
                    onChange={(e) =>
                      setNewFtp(parseInt(e.target.value || '200', 10))
                    }
                    className="w-full h-10 px-3 rounded-xl bg-[#0B0F17] border border-slate-700 font-mono-tabular text-sm font-bold text-emerald-400"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Waga (kg)
                  </label>
                  <input
                    type="number"
                    min={35}
                    max={160}
                    value={newWeight}
                    onChange={(e) =>
                      setNewWeight(parseInt(e.target.value || '75', 10))
                    }
                    className="w-full h-10 px-3 rounded-xl bg-[#0B0F17] border border-slate-700 font-mono-tabular text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    HR Max (BPM)
                  </label>
                  <input
                    type="number"
                    min={120}
                    max={225}
                    value={newMaxHr}
                    onChange={(e) =>
                      setNewMaxHr(parseInt(e.target.value || '188', 10))
                    }
                    className="w-full h-10 px-3 rounded-xl bg-[#0B0F17] border border-slate-700 font-mono-tabular text-sm text-rose-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Kolor znacznika profilu
                </label>
                <div className="flex items-center gap-2.5">
                  {PROFILE_AVATAR_COLORS.map((col) => (
                    <button
                      key={col}
                      type="button"
                      onClick={() => setNewColor(col)}
                      className={`w-6 h-6 rounded-full transition-transform ${
                        newColor === col
                          ? 'scale-125 ring-2 ring-white'
                          : 'opacity-70'
                      }`}
                      style={{ backgroundColor: col }}
                    />
                  ))}
                </div>
              </div>

              <div className="rounded-xl bg-[#0B0F17] border border-slate-800 p-3.5 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newGoogleFitEnabled}
                    onChange={(e) => setNewGoogleFitEnabled(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-emerald-500"
                  />
                  <span className="text-xs font-bold text-slate-200">
                    Włącz automatyczny eksport treningów do Google Fit
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newIntervalsEnabled}
                    onChange={(e) => setNewIntervalsEnabled(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-emerald-500"
                  />
                  <span className="text-xs font-bold text-slate-200">
                    Skonfiguruj od razu integrację z Intervals.icu (opcjonalnie)
                  </span>
                </label>

                {newIntervalsEnabled && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Athlete ID
                      </label>
                      <input
                        type="text"
                        value={newAthleteId}
                        onChange={(e) => setNewAthleteId(e.target.value)}
                        placeholder="0 lub i123456"
                        className="w-full h-9 px-2.5 rounded-lg bg-[#131B26] border border-slate-700 font-mono-tabular text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        API Key
                      </label>
                      <input
                        type="password"
                        value={newApiKey}
                        onChange={(e) => setNewApiKey(e.target.value)}
                        placeholder="Klucz API Intervals.icu"
                        className="w-full h-9 px-2.5 rounded-lg bg-[#131B26] border border-slate-700 font-mono-tabular text-xs text-white"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200"
              >
                Anuluj
              </button>
              <button
                type="submit"
                className="min-h-[42px] px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                Utwórz Profil
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: CONFIRM DELETE PROFILE */}
      {confirmDeleteId && profiles[confirmDeleteId] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#131B26] border border-rose-500/40 p-5 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white">
              Usunąć profil „{profiles[confirmDeleteId].name}”?
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Profil zostanie usunięty z listy aktywnych profili w aplikacji.
              Zapisane wcześniej pliki <code>.FIT</code> pozostaną bezpieczne.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200"
              >
                Anuluj
              </button>
              <button
                onClick={() => {
                  const idToRemove = confirmDeleteId;
                  setConfirmDeleteId(null);
                  onDeleteProfile(idToRemove);
                }}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-slate-950 font-bold text-xs"
              >
                Usuń profil
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
