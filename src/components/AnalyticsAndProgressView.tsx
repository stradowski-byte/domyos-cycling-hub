import React, { useMemo, useState } from 'react';
import {
  Download,
  CloudUpload,
  RefreshCw,
  TrendingUp,
  Award,
  Activity,
  FileCode,
  BarChart3,
  Zap,
  Heart,
  Calendar,
  Trash2,
  ExternalLink,
  AlertTriangle,
  X,
} from 'lucide-react';
import {
  AthleteProfile,
  CompletedActivity,
  WellnessDayMetric,
} from '../types/cycling';
import {
  computeDetailedHrBreakdown,
  computePeriodBestPeakPowerAndHr,
  computeRidePeakPowerAndHr,
  filterActivitiesByPeriod,
} from '../services/rampAndPhysiologyEngine';
import { formatDurationClock } from './LiveCockpitView';

interface AnalyticsAndProgressViewProps {
  profile: AthleteProfile;
  activities: CompletedActivity[];
  wellnessSeries: WellnessDayMetric[];
  isLoadingWellness: boolean;
  onRefreshIntervalsWellness: () => void;
  onDownloadFit: (activity: CompletedActivity) => void;
  onDownloadTcx: (activity: CompletedActivity) => void;
  onUploadToFirebase: (activity: CompletedActivity) => void;
  onUploadToGoogleFit: (activity: CompletedActivity) => void;
  onUploadToIntervals: (activity: CompletedActivity) => void;
  onDeleteActivity?: (activity: CompletedActivity) => Promise<void> | void;
  googleFitErrorInfo?: {
    message: string;
    enableApiUrl?: string;
    projectNumber?: string;
  } | null;
  onDismissGoogleFitError?: () => void;
  onToggleGoogleFitEnabled?: (enabled: boolean) => void;
}

export const AnalyticsAndProgressView: React.FC<AnalyticsAndProgressViewProps> = ({
  profile,
  activities,
  wellnessSeries,
  isLoadingWellness,
  onRefreshIntervalsWellness,
  onDownloadFit,
  onDownloadTcx,
  onUploadToFirebase,
  onUploadToGoogleFit,
  onUploadToIntervals,
  onDeleteActivity,
  googleFitErrorInfo,
  onDismissGoogleFitError,
  onToggleGoogleFitEnabled,
}) => {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const hasIntervalsConnected = Boolean(
    profile.intervals.enabled && profile.intervals.apiKey.trim()
  );
  const isGoogleFitEnabled = profile.googleFit?.enabled !== false;

  const profileActivities = useMemo(
    () => activities.filter((a) => a.profileId === profile.id),
    [activities, profile.id]
  );

  // Sub-navigation tab in Analytics ('rides_fit' is default so completed .FIT rides are immediately on top on mobile)
  const [activeSubTab, setActiveSubTab] = useState<
    'rides_fit' | 'peak_power' | 'fitness_hr'
  >('rides_fit');

  // Selected ride for "Ostatnia / Wybrana Jazda" Peak Power & HR Breakdown
  const [selectedRideId, setSelectedRideId] = useState<string>('');
  // Selected period for "Ostatnie 30 dni / Wybrany miesiąc" Best Stats & HR Breakdown
  const [selectedPeriod, setSelectedPeriod] = useState<string>('last_30_days');
  // HR Breakdown scope ('last_ride' vs 'period')
  const [hrScope, setHrScope] = useState<'last_ride' | 'period'>('period');

  const activeRide: CompletedActivity | null = useMemo(() => {
    if (profileActivities.length === 0) return null;
    if (selectedRideId) {
      const found = profileActivities.find((a) => a.id === selectedRideId);
      if (found) return found;
    }
    return profileActivities[0];
  }, [profileActivities, selectedRideId]);

  // Available months (YYYY-MM) from profile activities + current month
  const availableMonths = useMemo(() => {
    const monthSet = new Set<string>();
    const currentMonth = new Date().toISOString().slice(0, 7);
    monthSet.add(currentMonth);
    for (const act of profileActivities) {
      if (act.startedAtIso && act.startedAtIso.length >= 7) {
        monthSet.add(act.startedAtIso.slice(0, 7));
      }
    }
    return Array.from(monthSet).sort((a, b) => b.localeCompare(a));
  }, [profileActivities]);

  // Compute Peak Power (5s, 10s, 30s, 1m, 2m, 5m, 20m) + HR Breakdown for:
  // 1) Last / Selected Ride
  const ridePeakStats = useMemo(
    () => computeRidePeakPowerAndHr(activeRide, profile),
    [activeRide, profile]
  );

  // 2) Best of Last 30 Days / Selected Month
  const periodActivities = useMemo(
    () => filterActivitiesByPeriod(activities, profile.id, selectedPeriod),
    [activities, profile.id, selectedPeriod]
  );

  const periodBestPeakStats = useMemo(
    () => computePeriodBestPeakPowerAndHr(activities, profile, selectedPeriod),
    [activities, profile, selectedPeriod]
  );

  // Compute Detailed Heart Rate Breakdown for Selected Ride and for Selected Period
  const rideHrBreakdown = useMemo(
    () => computeDetailedHrBreakdown(activeRide ? [activeRide] : [], profile),
    [activeRide, profile]
  );

  const periodHrBreakdown = useMemo(
    () => computeDetailedHrBreakdown(periodActivities, profile),
    [periodActivities, profile]
  );

  const displayedHrBreakdown = hrScope === 'last_ride' ? rideHrBreakdown : periodHrBreakdown;

  const latestWellness =
    wellnessSeries.length > 0
      ? wellnessSeries[wellnessSeries.length - 1]
      : { ctl: 30, atl: 28, tsb: 2, tss: 0 };

  const nowMs = Date.now();
  const sevenDaysAgoMs = nowMs - 7 * 86400 * 1000;
  const thirtyDaysAgoMs = nowMs - 30 * 86400 * 1000;

  const ridesLast7d = profileActivities.filter(
    (a) => new Date(a.startedAtIso).getTime() >= sevenDaysAgoMs
  );
  const ridesLast30d = profileActivities.filter(
    (a) => new Date(a.startedAtIso).getTime() >= thirtyDaysAgoMs
  );

  const duration7dSec = ridesLast7d.reduce((acc, a) => acc + a.durationSec, 0);
  const duration30dSec = ridesLast30d.reduce((acc, a) => acc + a.durationSec, 0);
  const work30dKj = Math.round(
    ridesLast30d.reduce((acc, a) => acc + (a.avgPowerWatts * a.durationSec) / 1000, 0)
  );

  const totalRides = profileActivities.length;
  const totalTss = profileActivities.reduce((acc, a) => acc + a.tss, 0);

  const avgPowerAllRides =
    totalRides > 0
      ? Math.round(
          profileActivities.reduce((acc, a) => acc + a.avgPowerWatts, 0) / totalRides
        )
      : 0;
  const bestNpWatts = profileActivities.reduce(
    (max, a) => Math.max(max, a.normalizedPowerWatts),
    0
  );
  const avgHrAllRides =
    totalRides > 0
      ? Math.round(
          profileActivities.reduce((acc, a) => acc + a.avgHrBpm, 0) / totalRides
        )
      : 0;
  const avgCadenceAllRides =
    totalRides > 0
      ? Math.round(
          profileActivities.reduce((acc, a) => acc + a.avgCadenceRpm, 0) / totalRides
        )
      : 0;

  // Aggregate time in Power Zones across completed rides
  const aggPowerZones = [0, 0, 0, 0, 0, 0, 0];
  for (const act of profileActivities) {
    act.timeInPowerZonesSec.forEach((sec, idx) => {
      if (idx < 7) aggPowerZones[idx] += sec;
    });
  }
  const totalPowerZoneSec = Math.max(
    1,
    aggPowerZones.reduce((a, b) => a + b, 0)
  );

  // Build SVG Performance Management Chart (CTL, ATL, TSB) for Intervals.icu mode
  const chartW = 900;
  const chartH = 210;
  const maxVal = Math.max(
    65,
    ...wellnessSeries.map((d) => Math.max(d.ctl, d.atl, Math.abs(d.tsb) + 20))
  );

  const buildPolyline = (selector: (d: WellnessDayMetric) => number) => {
    if (wellnessSeries.length === 0) return '';
    return wellnessSeries
      .map((d, i) => {
        const x =
          (i / Math.max(1, wellnessSeries.length - 1)) * (chartW - 40) + 20;
        const val = selector(d);
        const normalized = (val + 30) / (maxVal + 30);
        const y = chartH - 24 - Math.max(0, Math.min(1, normalized)) * (chartH - 44);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  };

  const recentRidesChronological = [...profileActivities].slice(0, 10).reverse();

  const periodLabel =
    selectedPeriod === 'last_30_days'
      ? 'Ostatnie 30 dni'
      : selectedPeriod === 'all'
      ? 'Cała historia profilu'
      : `Miesiąc ${selectedPeriod}`;

  return (
    <div className="space-y-4 pb-8 min-w-0 max-w-full overflow-x-hidden">
      {/* Header Banner + 3-Segment Sub-Navigation Bar */}
      <div className="rounded-2xl bg-[#131B26] border border-slate-800 p-3.5 sm:p-4 space-y-3 min-w-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 min-w-0">
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-bold text-white break-words">
              Postępy, Pliki .FIT i Analityka — {profile.name}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
              Eksportuj binarne pliki <code className="font-mono-tabular">.FIT</code> na samej górze lub przełącz na krzywą mocy (5s–20m) oraz analizę formy i tętna.
            </p>
          </div>

          {hasIntervalsConnected && (
            <button
              onClick={onRefreshIntervalsWellness}
              disabled={isLoadingWellness}
              className="w-full sm:w-auto min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-white flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw
                className={`w-4 h-4 shrink-0 ${
                  isLoadingWellness ? 'animate-spin text-emerald-400' : ''
                }`}
              />
              Odśwież z Intervals.icu
            </button>
          )}
        </div>

        {/* 3-Segment Sub-View Switcher (Rides & .FIT first!) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 p-1 bg-[#0B0F17] rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => setActiveSubTab('rides_fit')}
            className={`min-h-[42px] px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${
              activeSubTab === 'rides_fit'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>1. Ostatnie Jazdy i Pliki .FIT ({profileActivities.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('peak_power')}
            className={`min-h-[42px] px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${
              activeSubTab === 'peak_power'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Zap className="w-4 h-4 shrink-0" />
            <span>2. Krzywa Mocy i Rekordy (5s–20m)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('fitness_hr')}
            className={`min-h-[42px] px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${
              activeSubTab === 'fitness_hr'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Heart className="w-4 h-4 shrink-0" />
            <span>3. Forma (CTL/ATL) i Strefy Tętna</span>
          </button>
        </div>
      </div>

      {/* =====================================================================
          SUB-TAB 1 (DEFAULT): OSTATNIE JAZDY, KPI 7/30 DNI I EKSPORT PLIKÓW .FIT
         ===================================================================== */}
      {activeSubTab === 'rides_fit' && (
        <div className="space-y-4 min-w-0">
          {/* Quick 4-Card KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-2xl bg-[#131B26] border border-slate-800 p-3.5 sm:p-4 min-w-0">
              <div className="text-[11px] sm:text-xs text-slate-400 truncate">
                OSTATNIE 7 DNI
              </div>
              <div className="font-mono-tabular text-xl sm:text-2xl font-bold text-emerald-400 mt-1 truncate">
                {formatDurationClock(duration7dSec)}
              </div>
              <div className="text-[11px] text-slate-400 mt-1 truncate">
                {ridesLast7d.length}{' '}
                {ridesLast7d.length === 1 ? 'trening' : 'treningów'}
              </div>
            </div>

            <div className="rounded-2xl bg-[#131B26] border border-slate-800 p-3.5 sm:p-4 min-w-0">
              <div className="text-[11px] sm:text-xs text-slate-400 truncate">
                OSTATNIE 30 DNI
              </div>
              <div className="font-mono-tabular text-xl sm:text-2xl font-bold text-sky-400 mt-1 truncate">
                {formatDurationClock(duration30dSec)}
              </div>
              <div className="text-[11px] text-slate-400 mt-1 truncate">
                {ridesLast30d.length} jazd · {work30dKj} kJ
              </div>
            </div>

            <div className="rounded-2xl bg-[#131B26] border border-slate-800 p-3.5 sm:p-4 min-w-0">
              <div className="text-[11px] sm:text-xs text-slate-400 truncate">
                ŚREDNIA MOC / REKORD NP
              </div>
              <div className="font-mono-tabular text-lg sm:text-2xl font-bold text-white mt-1 truncate">
                {avgPowerAllRides || '--'}W{' '}
                <span className="text-xs sm:text-sm text-amber-400 font-semibold">
                  / NP {bestNpWatts || '--'}W
                </span>
              </div>
              <div className="text-[11px] text-slate-400 mt-1 truncate">
                Aktualne FTP: {profile.ftpWatts} W
              </div>
            </div>

            <div className="rounded-2xl bg-[#131B26] border border-slate-800 p-3.5 sm:p-4 min-w-0">
              <div className="text-[11px] sm:text-xs text-slate-400 truncate">
                ŚWIEŻOŚĆ (TSB) / ŁADUNEK
              </div>
              <div
                className={`font-mono-tabular text-lg sm:text-2xl font-bold mt-1 truncate ${
                  latestWellness.tsb >= -10
                    ? 'text-emerald-400'
                    : 'text-amber-400'
                }`}
              >
                TSB{' '}
                {latestWellness.tsb > 0
                  ? `+${latestWellness.tsb.toFixed(1)}`
                  : latestWellness.tsb.toFixed(1)}
              </div>
              <div className="text-[11px] text-slate-400 mt-1 truncate">
                Łącznie {totalRides} jazd · {totalTss} TSS
              </div>
            </div>
          </div>

          {/* GOOGLE FIT 403 DISABLED API HELPER BANNER */}
          {googleFitErrorInfo && (
            <div className="rounded-2xl bg-rose-950/35 border border-rose-500/60 p-4 space-y-3 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 text-rose-300 min-w-0">
                  <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  <div className="space-y-1 min-w-0">
                    <div className="text-xs sm:text-sm font-bold text-white">
                      Google Fitness API jest wyłączone w projekcie Google Cloud (
                      {googleFitErrorInfo.projectNumber || '782546220198'})
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed break-words">
                      {googleFitErrorInfo.message}
                    </p>
                  </div>
                </div>
                {onDismissGoogleFitError && (
                  <button
                    onClick={onDismissGoogleFitError}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <a
                  href={
                    googleFitErrorInfo.enableApiUrl ||
                    `https://console.developers.google.com/apis/api/fitness.googleapis.com/overview?project=${
                      googleFitErrorInfo.projectNumber || '782546220198'
                    }`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                >
                  <ExternalLink className="w-4 h-4 shrink-0" />
                  <span>
                    1. Włącz Fitness API w Google Cloud (Projekt{' '}
                    {googleFitErrorInfo.projectNumber || '782546220198'})
                  </span>
                </a>

                {onToggleGoogleFitEnabled && isGoogleFitEnabled && (
                  <button
                    type="button"
                    onClick={() => {
                      onToggleGoogleFitEnabled(false);
                      onDismissGoogleFitError?.();
                    }}
                    className="min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <span>
                      2. Wyłącz Google Fit w profilu (używaj tylko Firebase + Intervals.icu)
                    </span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* COMPLETED ACTIVITIES & GARMIN .FIT / FIREBASE / GOOGLE FIT / INTERVALS EXPORT */}
          <div className="rounded-2xl bg-[#131B26] border border-slate-800 p-4 sm:p-5 space-y-4 min-w-0 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-bold text-white break-words">
                  Zakończone Treningi i Eksport Plików (.FIT w /User_Data/{profile.id}/Workouts_FIT)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                  Statusy synchronizacji (<strong className="text-sky-400">Intervals.icu</strong> i <strong className="text-rose-400">Google Fit</strong>) są zapisywane bezpośrednio w chmurze <strong className="text-emerald-400">Firebase Firestore</strong>, dzięki czemu wyczyszczenie pamięci podręcznej nigdy nie duplikuje wysyłki.
                </p>
              </div>

              {onToggleGoogleFitEnabled && (
                <button
                  type="button"
                  onClick={() => onToggleGoogleFitEnabled(!isGoogleFitEnabled)}
                  className={`min-h-[36px] px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0 ${
                    isGoogleFitEnabled
                      ? 'bg-rose-500/15 border-rose-500/40 text-rose-300 hover:bg-rose-500/25'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                  }`}
                  title="Włącz lub wyłącz integrację Google Fit dla tego profilu"
                >
                  <Activity className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    Google Fit: {isGoogleFitEnabled ? 'Włączony' : 'Wyłączony'}
                  </span>
                </button>
              )}
            </div>

            {profileActivities.length === 0 ? (
              <div className="rounded-xl bg-[#0B0F17] border border-slate-800 p-5 text-center text-xs sm:text-sm text-slate-400 break-words">
                Brak zapisanych sesji dla profilu{' '}
                <strong className="text-white">{profile.name}</strong>. Po
                zakończonej jeździe w zakładce Kokpit i kliknięciu „ZAKOŃCZ”
                plik .FIT zapisze się automatycznie w{' '}
                <code className="break-all">
                  /User_Data/{profile.id}/Workouts_FIT
                </code>{' '}
                oraz pojawi się tutaj na samej górze.
              </div>
            ) : (
              <div className="space-y-3 min-w-0">
                {profileActivities.map((act) => {
                  const isSelected = activeRide?.id === act.id;
                  const distanceKm = Number(
                    ((act.totalDistanceMeters || 0) / 1000).toFixed(2)
                  );
                  return (
                    <div
                      key={act.id}
                      onClick={() => setSelectedRideId(act.id)}
                      className={`cursor-pointer rounded-xl bg-[#0B0F17] border p-3.5 sm:p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 transition-colors min-w-0 overflow-hidden ${
                        isSelected
                          ? 'border-emerald-500'
                          : 'border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] sm:text-xs text-slate-400 min-w-0">
                          <span className="font-mono-tabular text-slate-300">
                            {act.startedAtIso.slice(0, 16).replace('T', ' ')}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono-tabular">
                            Czas: {formatDurationClock(act.durationSec)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>
                            Firebase:{' '}
                            <strong
                              className={
                                act.syncedToFirebase || act.syncedToGoogleDrive
                                  ? 'text-emerald-400'
                                  : 'text-amber-400'
                              }
                            >
                              {act.syncedToFirebase || act.syncedToGoogleDrive
                                ? 'Zapisano (.FIT)'
                                : 'Pending'}
                            </strong>
                          </span>
                          {isGoogleFitEnabled && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>
                                Google Fit:{' '}
                                <strong
                                  className={
                                    act.syncedToGoogleFit
                                      ? 'text-rose-400'
                                      : 'text-slate-400'
                                  }
                                >
                                  {act.syncedToGoogleFit ? 'Wysłano' : 'Gotowy'}
                                </strong>
                              </span>
                            </>
                          )}
                          {hasIntervalsConnected && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>
                                ICU:{' '}
                                <strong
                                  className={
                                    act.syncedToIntervals
                                      ? 'text-sky-400'
                                      : 'text-slate-400'
                                  }
                                >
                                  {act.syncedToIntervals
                                    ? 'Wysłano (Firebase)'
                                    : 'Gotowy'}
                                </strong>
                              </span>
                            </>
                          )}
                        </div>

                        <h4 className="text-sm font-bold text-white flex flex-wrap items-center gap-2 break-words">
                          <span>{act.workoutName}</span>
                        </h4>

                        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-slate-300 font-mono-tabular pt-0.5">
                          <span>
                            Śr. Moc:{' '}
                            <strong className="text-emerald-400">
                              {act.avgPowerWatts}W
                            </strong>
                          </span>
                          <span>
                            Max:{' '}
                            <strong className="text-amber-400">
                              {act.maxPowerWatts}W
                            </strong>
                          </span>
                          <span>
                            NP:{' '}
                            <strong className="text-white">
                              {act.normalizedPowerWatts}W
                            </strong>
                          </span>
                          <span>
                            TSS:{' '}
                            <strong className="text-amber-400">{act.tss}</strong>{' '}
                            (IF {act.intensityFactor})
                          </span>
                          <span>
                            HR:{' '}
                            <strong className="text-rose-400">
                              {act.avgHrBpm}/{act.maxHrBpm} bpm
                            </strong>
                          </span>
                          <span>
                            Dystans (700c):{' '}
                            <strong className="text-sky-400">
                              {distanceKm} km ({act.avgSpeedKmh} km/h)
                            </strong>
                          </span>
                        </div>
                      </div>

                      <div
                        className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 shrink-0 w-full lg:w-auto"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => onDownloadFit(act)}
                          className="col-span-2 sm:col-span-1 min-h-[40px] px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors truncate"
                        >
                          <Download className="w-4 h-4 shrink-0" />
                          <span className="truncate">Pobierz .FIT</span>
                        </button>

                        <button
                          onClick={() => {
                            setSelectedRideId(act.id);
                            setActiveSubTab('peak_power');
                          }}
                          className="min-h-[40px] px-3 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors truncate"
                        >
                          <Zap className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">Krzywa 5s–20m</span>
                        </button>

                        <button
                          onClick={() => onDownloadTcx(act)}
                          className="min-h-[40px] px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs flex items-center justify-center gap-1.5 transition-colors truncate"
                        >
                          <FileCode className="w-4 h-4 shrink-0" />
                          <span>.TCX</span>
                        </button>

                        <button
                          onClick={() => onUploadToFirebase(act)}
                          className="min-h-[40px] px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-medium text-xs flex items-center justify-center gap-1.5 transition-colors truncate"
                        >
                          <CloudUpload className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span className="truncate">Firebase</span>
                        </button>

                        {isGoogleFitEnabled && (
                          <button
                            onClick={() => onUploadToGoogleFit(act)}
                            className="min-h-[40px] px-3 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors truncate"
                          >
                            <Activity className="w-4 h-4 shrink-0" />
                            <span className="truncate">
                              {act.syncedToGoogleFit ? 'Google Fit ✓' : 'Google Fit'}
                            </span>
                          </button>
                        )}

                        {hasIntervalsConnected && (
                          <button
                            onClick={() => onUploadToIntervals(act)}
                            className="col-span-2 sm:col-span-1 min-h-[40px] px-3 py-2 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors truncate"
                          >
                            <span className="truncate">
                              {act.syncedToIntervals
                                ? 'Intervals.icu ✓'
                                : 'Intervals.icu'}
                            </span>
                          </button>
                        )}

                        {onDeleteActivity &&
                          (confirmDeleteId === act.id ? (
                            <div className="col-span-2 sm:col-span-1 flex items-center gap-1.5">
                              <button
                                onClick={async () => {
                                  setIsDeletingId(act.id);
                                  try {
                                    await onDeleteActivity(act);
                                  } finally {
                                    setIsDeletingId(null);
                                    setConfirmDeleteId(null);
                                  }
                                }}
                                disabled={isDeletingId === act.id}
                                className="min-h-[40px] px-3 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-1 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                                <span>
                                  {isDeletingId === act.id
                                    ? 'Usuwanie...'
                                    : 'Potwierdź Usuń'}
                                </span>
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="min-h-[40px] px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                              >
                                Anuluj
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteId(act.id)}
                              className="min-h-[40px] px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                              title="Usuń ten wykonany trening z aplikacji, lokalnego OPFS i chmury Firebase"
                            >
                              <Trash2 className="w-3.5 h-3.5 shrink-0" />
                              <span>Usuń</span>
                            </button>
                          ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          SUB-TAB 2: PEAK POWER CURVE (5s, 10s, 30s, 1m, 2m, 5m, 20m)
          Comparison: Last/Selected Ride vs Best of Last 30 Days / Month
         ===================================================================== */}
      {activeSubTab === 'peak_power' && (
      <div className="rounded-2xl bg-[#131B26] border border-slate-800 p-4 sm:p-5 space-y-4 min-w-0 overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 border-b border-slate-800 pb-4 min-w-0">
          <div className="space-y-1 min-w-0">
            <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-400 shrink-0" />
              <span className="break-words">Szczytowa Moc (5s–20m) i Breakdown Tętna</span>
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Porównaj maksymalną średnią moc oraz reakcję tętna z wybranej jazdy oraz najlepsze wyniki z okresu dla profilu <strong>{profile.name}</strong> (FTP {profile.ftpWatts}W · {profile.weightKg}kg).
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex items-center gap-2.5 w-full lg:w-auto min-w-0">
            {/* Selector 1: Specific Ride */}
            <div className="flex items-center gap-2 min-w-0">
              <label className="text-[11px] font-semibold text-slate-400 whitespace-nowrap shrink-0">
                Jazda:
              </label>
              <select
                value={activeRide?.id || ''}
                onChange={(e) => setSelectedRideId(e.target.value)}
                disabled={profileActivities.length === 0}
                className="w-full min-w-0 h-9 px-2.5 rounded-xl bg-[#0B0F17] border border-slate-700 text-xs text-white font-medium focus:outline-none truncate"
              >
                {profileActivities.length === 0 ? (
                  <option value="">Brak zapisanych jazd</option>
                ) : (
                  profileActivities.map((act, idx) => (
                    <option key={act.id} value={act.id}>
                      {idx === 0 ? 'Ostatnia: ' : ''}
                      {act.startedAtIso.slice(0, 10)} — {act.workoutName} ({act.avgPowerWatts}W)
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Selector 2: 30 Days or Month */}
            <div className="flex items-center gap-2 min-w-0">
              <label className="text-[11px] font-semibold text-slate-400 whitespace-nowrap flex items-center gap-1 shrink-0">
                <Calendar className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                Okres:
              </label>
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="w-full min-w-0 h-9 px-2.5 rounded-xl bg-[#0B0F17] border border-slate-700 text-xs text-white font-medium focus:outline-none truncate"
              >
                <option value="last_30_days">Ostatnie 30 dni ({ridesLast30d.length} jazd)</option>
                {availableMonths.map((m) => (
                  <option key={m} value={m}>
                    Miesiąc: {m}
                  </option>
                ))}
                <option value="all">Cała historia ({profileActivities.length} jazd)</option>
              </select>
            </div>
          </div>
        </div>

        {/* 7 Peak Power Windows Grid (5s, 10s, 30s, 1m, 2m, 5m, 20m) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {ridePeakStats.map((rideWin, idx) => {
            const bestWin = periodBestPeakStats[idx];
            return (
              <div
                key={rideWin.durationSec}
                className="rounded-xl bg-[#0B0F17] border border-slate-800 p-3 flex flex-col justify-between gap-3"
              >
                {/* Window Header */}
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5">
                  <span className="font-mono-tabular text-xs font-extrabold text-amber-400">
                    MAX {rideWin.label}
                  </span>
                  {bestWin?.pctFtp && (
                    <span className="font-mono-tabular text-[10px] text-slate-400">
                      {bestWin.pctFtp}% FTP
                    </span>
                  )}
                </div>

                {/* Block 1: Last / Selected Ride Peak Power + HR */}
                <div className="space-y-1">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                    Wybrana jazda
                  </div>
                  {rideWin.maxMeanWatts !== null ? (
                    <>
                      <div className="font-mono-tabular text-xl font-bold text-white leading-tight">
                        {rideWin.maxMeanWatts}W
                        <span className="block text-[11px] font-normal text-emerald-400">
                          {rideWin.wattsPerKg} W/kg · {rideWin.pctFtp}% FTP
                        </span>
                      </div>
                      <div className="pt-1 text-[11px] font-mono-tabular text-slate-300 space-y-0.5">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">HR śr/max:</span>
                          <span className="text-rose-400 font-semibold">
                            {rideWin.avgHrDuringPeakBpm}/{rideWin.maxHrDuringPeakBpm}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">% Max HR:</span>
                          <span>
                            {rideWin.pctMaxHr}% (Z{rideWin.hrZoneDuringPeak})
                          </span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-slate-500 py-2 font-mono-tabular">
                      {activeRide
                        ? `Jazda < ${rideWin.label}`
                        : 'Brak jazdy'}
                    </div>
                  )}
                </div>

                {/* Block 2: Best in Last 30 Days / Selected Month + HR */}
                <div className="pt-2 border-t border-slate-800/80 space-y-1">
                  <div className="text-[10px] uppercase tracking-wider text-sky-400 font-semibold truncate">
                    Rekord ({periodLabel})
                  </div>
                  {bestWin && bestWin.maxMeanWatts !== null ? (
                    <>
                      <div className="font-mono-tabular text-base font-bold text-sky-400 leading-tight">
                        {bestWin.maxMeanWatts}W{' '}
                        <span className="text-[11px] font-normal text-slate-300">
                          ({bestWin.wattsPerKg} W/kg)
                        </span>
                      </div>
                      <div className="text-[10px] font-mono-tabular text-slate-400 space-y-0.5">
                        <div className="flex items-center justify-between">
                          <span>Tętno szczytu:</span>
                          <span className="text-rose-400 font-semibold">
                            {bestWin.avgHrDuringPeakBpm} bpm ({bestWin.pctMaxHr}%)
                          </span>
                        </div>
                        {bestWin.achievedAtDateIso && (
                          <div className="truncate text-slate-400">
                            Dnia: {bestWin.achievedAtDateIso.slice(0, 10)}
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="text-[11px] text-slate-500 font-mono-tabular">
                      Brak w okresie
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      )}

      {/* =====================================================================
          SUB-TAB 3: FORMA (CTL/ATL/TSB), STREFY MOCY I BREAKDOWN TĘTNA (W/BPM)
         ===================================================================== */}
      {activeSubTab === 'fitness_hr' && (
        <div className="space-y-4 min-w-0">
      <div className="rounded-2xl bg-[#131B26] border border-slate-800 p-4 sm:p-5 space-y-4 min-w-0 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3.5 min-w-0">
          <div className="space-y-0.5 min-w-0">
            <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <Heart className="w-5 h-5 text-rose-400 shrink-0" />
              <span className="break-words">Breakdown Tętna i Wydajności (W/BPM)</span>
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Rozkład czasu w strefach tętna Z1–Z5 wraz ze średnią mocą (W) generowaną w każdej strefie tętna oraz kosztem tętna (W/BPM).
            </p>
          </div>

          <div className="grid grid-cols-2 sm:flex items-center gap-1 p-1 rounded-xl bg-[#0B0F17] border border-slate-800 w-full sm:w-auto min-w-0">
            <button
              onClick={() => setHrScope('last_ride')}
              className={`min-h-[36px] px-2.5 sm:px-3 py-1 rounded-lg text-[11px] sm:text-xs font-semibold transition-colors truncate text-center min-w-0 ${
                hrScope === 'last_ride'
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Jazda ({activeRide ? activeRide.startedAtIso.slice(5, 10) : 'Brak'})
            </button>
            <button
              onClick={() => setHrScope('period')}
              className={`min-h-[36px] px-2.5 sm:px-3 py-1 rounded-lg text-[11px] sm:text-xs font-semibold transition-colors truncate text-center min-w-0 ${
                hrScope === 'period'
                  ? 'bg-emerald-500 text-slate-950 font-bold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {periodLabel} ({periodActivities.length})
            </button>
          </div>
        </div>

        {/* Top HR Physiology KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="rounded-xl bg-[#0B0F17] border border-slate-800 p-3">
            <div className="text-[11px] text-slate-400">ŚREDNIE TĘTNO</div>
            <div className="font-mono-tabular text-xl font-bold text-rose-400 mt-0.5">
              {displayedHrBreakdown.avgHrBpm || '--'} <span className="text-xs text-slate-400">bpm</span>
            </div>
            <div className="text-[11px] text-slate-400 font-mono-tabular">
              {displayedHrBreakdown.pctMaxHrAvg}% Max HR ({profile.maxHrBpm})
            </div>
          </div>

          <div className="rounded-xl bg-[#0B0F17] border border-slate-800 p-3">
            <div className="text-[11px] text-slate-400">SZCZYTOWE TĘTNO</div>
            <div className="font-mono-tabular text-xl font-bold text-white mt-0.5">
              {displayedHrBreakdown.maxHrBpm || '--'} <span className="text-xs text-slate-400">bpm</span>
            </div>
            <div className="text-[11px] text-slate-400 font-mono-tabular">
              {displayedHrBreakdown.pctMaxHrPeak}% Max · LTHR {profile.lthrBpm}
            </div>
          </div>

          <div className="rounded-xl bg-[#0B0F17] border border-slate-800 p-3">
            <div className="text-[11px] text-slate-400">REZERWA TĘTNA (HRR)</div>
            <div className="font-mono-tabular text-xl font-bold text-amber-400 mt-0.5">
              {displayedHrBreakdown.hrReservePct}%
            </div>
            <div className="text-[11px] text-slate-400 font-mono-tabular">
              Spoczynkowe: {profile.restingHrBpm} bpm
            </div>
          </div>

          <div className="rounded-xl bg-[#0B0F17] border border-slate-800 p-3">
            <div className="text-[11px] text-slate-400">WYDAJNOŚĆ (W / BPM)</div>
            <div className="font-mono-tabular text-xl font-bold text-emerald-400 mt-0.5">
              {displayedHrBreakdown.avgWattsPerBpm ?? '--'}{' '}
              <span className="text-xs text-slate-400">W/bpm</span>
            </div>
            <div className="text-[11px] text-slate-400">
              Waty na 1 uderzenie serca
            </div>
          </div>

          <div className="rounded-xl bg-[#0B0F17] border border-slate-800 p-3">
            <div className="text-[11px] text-slate-400">EFEKTYWNOŚĆ (EF = NP/HR)</div>
            <div className="font-mono-tabular text-xl font-bold text-sky-400 mt-0.5">
              {displayedHrBreakdown.efficiencyFactor ?? '--'}
            </div>
            <div className="text-[11px] text-slate-400">
              Czas łączny: {formatDurationClock(displayedHrBreakdown.totalDurationSec)}
            </div>
          </div>
        </div>

        {/* Z1-Z5 Detailed Table / Bars with Avg Watts & W/BPM per HR Zone */}
        <div className="space-y-2.5 pt-1">
          {displayedHrBreakdown.zones.map((hz) => (
            <div
              key={hz.zone}
              className="rounded-xl bg-[#0B0F17] border border-slate-800 p-3 space-y-1.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: hz.color }}
                  />
                  <span className="font-bold text-white">{hz.name}</span>
                  <span className="font-mono-tabular text-slate-400">
                    ({hz.minBpm}–{hz.maxBpm} bpm)
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-4 font-mono-tabular text-xs">
                  <span className="text-slate-300">
                    Czas: <strong>{formatDurationClock(hz.durationSec)}</strong> ({hz.percentage}%)
                  </span>
                  <span className="text-emerald-400">
                    Śr. moc w strefie: <strong>{hz.avgPowerInZoneWatts > 0 ? `${hz.avgPowerInZoneWatts}W` : '--'}</strong>
                  </span>
                  <span className="text-sky-400">
                    W/BPM: <strong>{hz.wattsPerBpm ?? '--'}</strong>
                  </span>
                </div>
              </div>

              <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.max(hz.durationSec > 0 ? 3 : 0, hz.percentage)}%`,
                    backgroundColor: hz.color,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* MODE A: INTERVALS.ICU CONNECTED (FULL CTL / ATL / TSB DASHBOARD) */}
      {hasIntervalsConnected ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="rounded-2xl bg-[#131B26] border border-slate-800 p-4">
              <div className="text-xs text-slate-400">FORMA (CTL / FITNESS)</div>
              <div className="font-mono-tabular text-3xl font-bold text-sky-400 mt-1">
                {latestWellness.ctl.toFixed(1)}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Z konta Intervals.icu (42 dni)
              </div>
            </div>

            <div className="rounded-2xl bg-[#131B26] border border-slate-800 p-4">
              <div className="text-xs text-slate-400">ZMĘCZENIE (ATL / FATIGUE)</div>
              <div className="font-mono-tabular text-3xl font-bold text-purple-400 mt-1">
                {latestWellness.atl.toFixed(1)}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Ostre obciążenie (7 dni)
              </div>
            </div>

            <div className="rounded-2xl bg-[#131B26] border border-slate-800 p-4">
              <div className="text-xs text-slate-400">ŚWIEŻOŚĆ (TSB / FORM)</div>
              <div
                className={`font-mono-tabular text-3xl font-bold mt-1 ${
                  latestWellness.tsb >= -10 ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {latestWellness.tsb > 0 ? `+${latestWellness.tsb.toFixed(1)}` : latestWellness.tsb.toFixed(1)}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                {latestWellness.tsb > 5
                  ? 'Świeżość / gotowość'
                  : latestWellness.tsb >= -15
                  ? 'Optymalny trening'
                  : 'Wysokie zmęczenie'}
              </div>
            </div>

            <div className="rounded-2xl bg-[#131B26] border border-slate-800 p-4">
              <div className="text-xs text-slate-400">JAZDY LOKALNE & NP</div>
              <div className="font-mono-tabular text-3xl font-bold text-white mt-1">
                {bestNpWatts || profile.ftpWatts} <span className="text-base text-slate-400">W</span>
              </div>
              <div className="text-xs text-slate-400 mt-1">
                {totalRides} jazd w apce · {totalTss} TSS
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-[#131B26] border border-slate-800 p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">
                  Wykres Intervals.icu: Fitness (CTL), Zmęczenie (ATL) i Forma (TSB)
                </h3>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="text-sky-400 font-semibold">— Fitness (CTL)</span>
                <span className="text-purple-400 font-semibold">— Zmęczenie (ATL)</span>
                <span className="text-emerald-400 font-semibold">— Forma (TSB)</span>
              </div>
            </div>

            <svg
              viewBox={`0 0 ${chartW} ${chartH}`}
              className="workout-chart-surface w-full h-44 rounded-xl bg-[#0F172A] border border-slate-700"
              preserveAspectRatio="none"
            >
              {[0.25, 0.5, 0.75].map((r) => (
                <line
                  key={r}
                  x1={0}
                  y1={chartH * r}
                  x2={chartW}
                  y2={chartH * r}
                  stroke="#334155"
                  strokeDasharray="4 4"
                  strokeOpacity="0.45"
                />
              ))}
              <polyline
                fill="none"
                stroke="#10B981"
                strokeWidth="2"
                strokeDasharray="4 3"
                points={buildPolyline((d) => d.tsb)}
              />
              <polyline
                fill="none"
                stroke="#A855F7"
                strokeWidth="2.2"
                points={buildPolyline((d) => d.atl)}
              />
              <polyline
                fill="none"
                stroke="#38BDF8"
                strokeWidth="2.8"
                points={buildPolyline((d) => d.ctl)}
              />
            </svg>
          </div>
        </>
      ) : (
        /* MODE B: BUILT-IN LOCAL PERFORMANCE SUMMARY (NO INTERVALS.ICU ACCOUNT) */
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-2xl bg-[#131B26] border border-slate-800 p-3.5 sm:p-4 min-w-0">
              <div className="text-[11px] sm:text-xs text-slate-400 truncate">OSTATNIE 7 DNI</div>
              <div className="font-mono-tabular text-xl sm:text-3xl font-bold text-emerald-400 mt-1 truncate">
                {formatDurationClock(duration7dSec)}
              </div>
              <div className="text-[11px] text-slate-400 mt-1 truncate">
                {ridesLast7d.length} {ridesLast7d.length === 1 ? 'trening' : 'treningów'}
              </div>
            </div>

            <div className="rounded-2xl bg-[#131B26] border border-slate-800 p-3.5 sm:p-4 min-w-0">
              <div className="text-[11px] sm:text-xs text-slate-400 truncate">OSTATNIE 30 DNI</div>
              <div className="font-mono-tabular text-xl sm:text-3xl font-bold text-sky-400 mt-1 truncate">
                {formatDurationClock(duration30dSec)}
              </div>
              <div className="text-[11px] text-slate-400 mt-1 truncate">
                {ridesLast30d.length} jazd · {work30dKj} kJ
              </div>
            </div>

            <div className="rounded-2xl bg-[#131B26] border border-slate-800 p-3.5 sm:p-4 min-w-0">
              <div className="text-[11px] sm:text-xs text-slate-400 truncate">ŚREDNIA / MAX NP</div>
              <div className="font-mono-tabular text-lg sm:text-2xl font-bold text-white mt-1 truncate">
                {avgPowerAllRides || '--'}W{' '}
                <span className="text-xs sm:text-sm text-amber-400 font-semibold">
                  / NP {bestNpWatts || '--'}W
                </span>
              </div>
              <div className="text-[11px] text-slate-400 mt-1 truncate">
                FTP: {profile.ftpWatts} W
              </div>
            </div>

            <div className="rounded-2xl bg-[#131B26] border border-slate-800 p-3.5 sm:p-4 min-w-0">
              <div className="text-[11px] sm:text-xs text-slate-400 truncate">TĘTNO & KADENCJA</div>
              <div className="font-mono-tabular text-lg sm:text-2xl font-bold text-rose-400 mt-1 truncate">
                {avgHrAllRides || '--'}{' '}
                <span className="text-xs text-slate-400">bpm</span> ·{' '}
                <span className="text-sky-400">{avgCadenceAllRides || '--'}</span>{' '}
                <span className="text-xs text-slate-400">rpm</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-1 truncate">
                Łącznie {totalRides} jazd
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-[#131B26] border border-slate-800 p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">
                  Podgląd Ostatnich Treningów (Średnia Moc W i Czas Jazdy)
                </h3>
              </div>
              <span className="text-xs text-slate-400">
                FTP profilu: {profile.ftpWatts} W
              </span>
            </div>

            {recentRidesChronological.length === 0 ? (
              <div className="rounded-xl bg-[#0B0F17] border border-slate-800 p-6 text-center text-xs text-slate-400">
                Gdy <strong className="text-white">{profile.name}</strong> ukończy pierwsze treningi, pojawi się tutaj wykres porównujący średnią moc (W), tętno i czas trwania kolejnych jazd.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2.5 pt-2">
                {recentRidesChronological.map((ride) => {
                  const pctFtp = Math.min(
                    130,
                    Math.round((ride.avgPowerWatts / Math.max(1, profile.ftpWatts)) * 100)
                  );
                  return (
                    <div
                      key={ride.id}
                      onClick={() => setSelectedRideId(ride.id)}
                      className={`cursor-pointer rounded-xl bg-[#0B0F17] border p-2.5 flex flex-col justify-between gap-2 transition-colors ${
                        activeRide?.id === ride.id
                          ? 'border-emerald-500'
                          : 'border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="text-[10px] font-mono-tabular text-slate-400 truncate">
                        {ride.startedAtIso.slice(5, 10)}
                      </div>
                      <div className="h-20 flex items-end bg-slate-900/80 rounded-lg p-1 overflow-hidden">
                        <div
                          className="w-full rounded bg-emerald-500 transition-all"
                          style={{ height: `${Math.max(12, Math.min(100, pctFtp))}%` }}
                        />
                      </div>
                      <div>
                        <div className="font-mono-tabular text-xs font-bold text-white">
                          {ride.avgPowerWatts}W ({pctFtp}%)
                        </div>
                        <div className="font-mono-tabular text-[10px] text-slate-400">
                          {formatDurationClock(ride.durationSec)} · {ride.avgHrBpm} bpm
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* Time in Power Zones Distribution */}
      <div className="rounded-2xl bg-[#131B26] border border-slate-800 p-5 space-y-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Award className="w-4 h-4 text-amber-400" />
          Rozkład Czasu w Strefach Mocy (FTP {profile.ftpWatts}W — Łącznie ze wszystkich jazd)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2.5">
          {profile.powerZones.map((pz, idx) => {
            const sec = aggPowerZones[idx] || 0;
            const pct = totalRides > 0 ? Math.round((sec / totalPowerZoneSec) * 100) : 0;
            return (
              <div key={pz.zone} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300 font-medium">{pz.name}</span>
                  <span className="font-mono-tabular text-slate-400">
                    {formatDurationClock(sec)} ({pct}%)
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(2, pct)}%`,
                      backgroundColor: pz.color,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
        </div>
      )}
    </div>
  );
};
