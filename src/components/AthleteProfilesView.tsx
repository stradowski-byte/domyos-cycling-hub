import React from 'react';
import {
  Heart,
  Zap,
  Link2,
  RefreshCw,
  CheckCircle2,
  Dumbbell,
  Edit3,
  Activity,
  Cloud,
  ShieldCheck,
} from 'lucide-react';
import {
  AthleteProfile,
  OfflineTrainingMode,
  ProfileId,
} from '../types/cycling';
import {
  buildHrZonesFromMax,
  PROFILE_AVATAR_COLORS,
} from '../services/rampAndPhysiologyEngine';

interface AthleteProfilesViewProps {
  activeProfile: AthleteProfile;
  onUpdateProfile: (id: ProfileId, updated: AthleteProfile) => void;
  isSyncingIntervals: boolean;
  onSyncFromIntervalsIcu: () => void;
  onOpenFastUserSwitcher?: () => void;
  onRefreshGoogleFitToken?: () => void;
}

export const AthleteProfilesView: React.FC<AthleteProfilesViewProps> = ({
  activeProfile,
  onUpdateProfile,
  isSyncingIntervals,
  onSyncFromIntervalsIcu,
  onOpenFastUserSwitcher,
  onRefreshGoogleFitToken,
}) => {
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

  const offlineModeLabel = (mode?: OfflineTrainingMode) => {
    if (mode === 'ftp_builder') return 'Budowa FTP i Interwały';
    if (mode === 'cardio_fitness') return 'Cardio, Zdrowie i Spalanie';
    return 'Wszystkie Treningi (Kompletny)';
  };

  const isGoogleFitEnabled = activeProfile.googleFit?.enabled !== false;

  return (
    <div className="space-y-5 pb-8 min-w-0 max-w-full overflow-x-hidden">
      {/* 1. CURRENT AUTHENTICATED GOOGLE ACCOUNT HEADER (NO MULTI-PROFILE LIST) */}
      <div className="rounded-2xl bg-[#131B26] border border-slate-800 p-4 sm:p-5 space-y-4 min-w-0 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 border-b border-slate-800 pb-4 min-w-0">
          <div className="flex items-center gap-3.5 min-w-0">
            {activeProfile.photoURL ? (
              <img
                src={activeProfile.photoURL}
                alt={activeProfile.name}
                className="w-12 h-12 rounded-full border-2 shrink-0"
                style={{ borderColor: activeProfile.avatarColor || '#10B981' }}
                referrerPolicy="no-referrer"
              />
            ) : (
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-base text-slate-950 shrink-0"
                style={{ backgroundColor: activeProfile.avatarColor || '#10B981' }}
              >
                {activeProfile.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white truncate">
                  {activeProfile.name}
                </h2>
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-[10px] font-bold text-emerald-300 flex items-center gap-1 shrink-0">
                  <ShieldCheck className="w-3 h-3" />
                  Aktywne Konto Google
                </span>
              </div>
              <div className="text-xs text-slate-400 font-mono-tabular truncate">
                {activeProfile.email || 'Konto Google OAuth'} · FTP {activeProfile.ftpWatts}W · {activeProfile.weightKg}kg
              </div>
            </div>
          </div>

          {onOpenFastUserSwitcher && (
            <button
              onClick={onOpenFastUserSwitcher}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shrink-0"
            >
              <RefreshCw className="w-4 h-4 shrink-0" />
              <span>Przeloguj Konto Google</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-end">
          <div className="md:col-span-4 min-w-0">
            <label className="block text-xs text-slate-400 mb-1 flex items-center gap-1.5">
              <Edit3 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Nazwa wyświetlana</span>
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
              <span>Fokus treningowy (filtrowanie biblioteki)</span>
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
            <label className="block text-xs text-slate-400 mb-1">Kolor akcentu</label>
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

      {/* 2. PHYSIOLOGY: FTP, WEIGHT, HR PARAMETERS & AUTOMATIC ZONES */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5 rounded-2xl bg-[#131B26] border border-slate-800 p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-base font-bold text-white">
                Parametry Fizjologiczne
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

      {/* 3. GOOGLE FIT + FIREBASE CLOUD INTEGRATION */}
      <div className="rounded-2xl bg-[#131B26] border border-slate-800 p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-rose-400" />
              Integracja z Google Fit & Firebase Firestore
            </h3>
            <p className="text-xs text-slate-400">
              Każdy zakończony trening jest zapisywany w Twojej bazie{' '}
              <strong className="text-emerald-400">Firebase Firestore</strong> oraz
              automatycznie wysyłany do połączonego konta{' '}
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
              Konto Google:{' '}
              <strong className="text-white">
                {activeProfile.email || 'Połączone'}
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

      {/* 4. INTERVALS.ICU INTEGRATION */}
      <div className="rounded-2xl bg-[#131B26] border border-slate-800 p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Link2 className="w-4 h-4 text-sky-400" />
              Integracja z Intervals.icu
            </h3>
            <p className="text-xs text-slate-400">
              Synchronizuj kalendarz treningów, wykresy Fitness (CTL/ATL/TSB) i
              pliki .FIT z kontem Intervals.icu przypisanym do tego konta Google.
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
              Konto <strong>{activeProfile.email || activeProfile.name}</strong>{' '}
              synchronizuje wszystkie treningi z <strong>Firebase Firestore</strong>,
              opcjonalnie eksportuje jazdy do <strong>Google Fit</strong> oraz
              zapisuje pliki <code>.FIT</code> w lokalnym katalogu OPFS.
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
