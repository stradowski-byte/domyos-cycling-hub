import React, { useEffect, useRef, useState } from 'react';
import {
  Gauge,
  Calendar,
  TrendingUp,
  Sliders,
  Download,
  CloudUpload,
  CheckCircle2,
  Users,
  Sun,
  Moon,
  Smartphone,
  WifiOff,
  Wifi,
  Activity,
  Cloud,
  X,
  Sparkles,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  AppThemeMode,
  AthleteProfile,
  CompletedActivity,
  KnownGoogleRider,
  LiveBikeTelemetry,
  ProfileId,
  StructuredWorkout,
  TelemetryRecord,
  WellnessDayMetric,
} from './types/cycling';
import {
  buildPowerZonesFromFtp,
  calculate700cWheelSpeedAndDistance,
  calculateActivitySummary,
  calculateBlockInstantTarget,
  calculateLocalWellnessSeries,
  createFallbackRuntimeProfile,
  detectEstimatedFtpFromCompletedActivity,
  getInitialWorkouts,
  mergeAndNormalizeWorkoutsLibrary,
} from './services/rampAndPhysiologyEngine';
import { ftmsController } from './services/ftmsBluetooth';
import { audioAndWakeLock } from './services/audioAndWakeLock';
import {
  downloadActivityFitFile,
  downloadActivityTcxFile,
} from './services/fitEncoder';
import {
  AI_STUDIO_PWA_BYPASS_KEY,
  getGitHubPagesInstallUrl,
  isAIStudioPreviewEnvironment,
  isConfigured,
  signInRiderWithGoogle,
  signOutGoogleRider,
  subscribeToGoogleAuth,
} from './lib/firebase';
import { recordPrivateAuditLog } from './services/securityAndAuditLogger';
import {
  deleteCompletedActivityEverywhere,
  deletePlannedWorkoutFromFirestore,
  deleteWorkoutTxtFromLocalOpfs,
  ensureActivityHasRecords,
  ensureFirestoreCollectionsInitialized,
  fetchAllStateFromFirestore,
  filterGoogleAuthenticatedProfiles,
  flushOfflineSyncQueueWithBatch,
  getConfiguredRootFolderName,
  getKnownGoogleRiders,
  getPendingSyncQueueCount,
  getSavedWorkoutTags,
  initializeOfflineFolderStructure,
  offloadActivitiesTelemetryToOpfs,
  resolveOrCreateProfileForGoogleUser,
  saveCompletedActivityToFirestore,
  saveCompletedRideAndStateToLocalOpfs,
  savePlannedWorkoutToFirestore,
  saveProfileToFirestore,
  saveWorkoutTagsLocally,
  saveWorkoutTagsToFirestore,
  saveWorkoutTxtToLocalOpfs,
  subscribeToFirestoreHub,
  syncAllStateToFirestore,
  syncWorkoutsWithLocalOpfs,
  updateCompletedActivityExternalSyncInFirestore,
} from './services/firebaseSyncService';
import { uploadActivityToGoogleFit } from './services/googleFitService';
import {
  fetchIntervalsPlannedAndLibraryWorkouts,
  fetchIntervalsWellness,
  uploadActivityFitToIntervals,
} from './services/intervalsIcuService';
import { AccurateWorkoutTimer } from './services/workoutTimerWorker';
import {
  forceUpdatePwaAndClearCaches,
  useOnlineStatus,
  usePWAInstall,
} from './services/usePWAInstall';
import { LiveCockpitView, formatDurationClock } from './components/LiveCockpitView';
import { WorkoutsAndRampBuilderView } from './components/WorkoutsAndRampBuilderView';
import { AnalyticsAndProgressView } from './components/AnalyticsAndProgressView';
import { AthleteProfilesView } from './components/AthleteProfilesView';
import { ProfilesAndCloudSettingsView } from './components/ProfilesAndCloudSettingsView';
import { FastUserSwitcherModal } from './components/FastUserSwitcherModal';
import { PwaAndAuthGateScreen } from './components/PwaAndAuthGateScreen';

const LS_PROFILES_KEY = 'domyos_hub_google_profile_v2';
const LS_WORKOUTS_KEY = 'domyos_hub_workouts_v1';
const LS_ACTIVITIES_KEY = 'domyos_hub_activities_v1';
const LS_ACTIVE_PROFILE_KEY = 'domyos_hub_active_profile_v2';
const LS_THEME_MODE_KEY = 'domyos_hub_theme_v1';

type ActiveTab = 'cockpit' | 'workouts' | 'analytics' | 'profiles' | 'settings';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('workouts');

  // Eye-friendly Low-Contrast Theme Mode ('soft-light' | 'soft-dark')
  const [themeMode, setThemeMode] = useState<AppThemeMode>(() => {
    try {
      const saved = localStorage.getItem(LS_THEME_MODE_KEY);
      if (saved === 'soft-light' || saved === 'soft-dark') return saved;
    } catch {
      // ignore
    }
    return 'soft-light';
  });

  useEffect(() => {
    try {
      localStorage.setItem(LS_THEME_MODE_KEY, themeMode);
      document.body.classList.remove('theme-soft-light', 'theme-soft-dark');
      document.body.classList.add(
        themeMode === 'soft-light' ? 'theme-soft-light' : 'theme-soft-dark'
      );
    } catch {
      // ignore
    }
  }, [themeMode]);

  // Single Active Google Account Profile State (Purges legacy multi-profile cache)
  const [profiles, setProfiles] = useState<Record<ProfileId, AthleteProfile>>(() => {
    try {
      localStorage.removeItem('domyos_hub_profiles_v1');
      localStorage.removeItem('domyos_hub_active_profile_v1');
      const saved = localStorage.getItem(LS_PROFILES_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          const valid = filterGoogleAuthenticatedProfiles(parsed);
          const firstKey = Object.keys(valid)[0];
          return firstKey ? { [firstKey]: valid[firstKey] } : {};
        }
      }
    } catch {
      // fallback
    }
    return {};
  });

  const [activeProfileId, setActiveProfileId] = useState<ProfileId>(() => {
    try {
      const saved = localStorage.getItem(LS_ACTIVE_PROFILE_KEY);
      if (saved && profiles[saved]) return saved;
    } catch {
      // fallback
    }
    return Object.keys(profiles)[0] || '';
  });

  const activeProfile =
    profiles[activeProfileId] ||
    Object.values(profiles)[0] ||
    createFallbackRuntimeProfile();

  // Workouts Library State (automatically merges all 18 scientific workouts and normalizes category tags)
  const [workouts, setWorkouts] = useState<StructuredWorkout[]>(() => {
    try {
      const saved = localStorage.getItem(LS_WORKOUTS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return mergeAndNormalizeWorkoutsLibrary(parsed);
        }
      }
    } catch {
      // fallback
    }
    return getInitialWorkouts();
  });

  // Available Workout Category Tags State (6 default categories + user custom tags)
  const [workoutTags, setWorkoutTags] = useState<string[]>(() =>
    getSavedWorkoutTags()
  );
  const [collectionsInitialized, setCollectionsInitialized] =
    useState<boolean>(false);

  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string>(() => {
    return workouts[0]?.id || 'w_ramp_sweetspot';
  });

  const currentWorkout =
    workouts.find((w) => w.id === selectedWorkoutId) || workouts[0];

  // Completed Activities History State
  const [activities, setActivities] = useState<CompletedActivity[]>(() => {
    try {
      const saved = localStorage.getItem(LS_ACTIVITIES_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // fallback
    }
    return [];
  });

  // Live FTMS Bike Telemetry
  const [telemetry, setTelemetry] = useState<LiveBikeTelemetry>(() =>
    ftmsController.getState()
  );

  // Active Ride Session State
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedWorkoutSec, setElapsedWorkoutSec] = useState(0);
  const [currentBlockIndex, setCurrentBlockIndex] = useState(0);
  const [elapsedInBlockSec, setElapsedInBlockSec] = useState(0);
  const [liveRecords, setLiveRecords] = useState<TelemetryRecord[]>([]);
  const [rideStartedAtIso, setRideStartedAtIso] = useState<string | null>(null);
  const [use3sPowerSmoothing, setUse3sPowerSmoothing] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [isFocusHudMode, setIsFocusHudMode] = useState(false);

  // Completed Ride Modal & Auto-Finish Proposal after Final Interval
  const [justFinishedActivity, setJustFinishedActivity] =
    useState<CompletedActivity | null>(null);
  const [autoShowFinishConfirm, setAutoShowFinishConfirm] = useState(false);

  // Firebase Auth, Firestore Real-Time & Fast User Switcher State
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [firestoreActivitiesLoaded, setFirestoreActivitiesLoaded] =
    useState(false);
  const inFlightIntervalsIdsRef = useRef<Set<string>>(new Set());
  const rideDistanceMetersRef = useRef<number>(0);
  const [googleFitErrorInfo, setGoogleFitErrorInfo] = useState<{
    message: string;
    enableApiUrl?: string;
    projectNumber?: string;
  } | null>(null);
  const [knownRiders, setKnownRiders] = useState<KnownGoogleRider[]>(() =>
    getKnownGoogleRiders()
  );
  const [isFastSwitcherOpen, setIsFastSwitcherOpen] = useState(false);
  const [isSyncingFirebase, setIsSyncingFirebase] = useState(false);
  const [isSyncingIntervals, setIsSyncingIntervals] = useState(false);
  const [intervalsWellness, setIntervalsWellness] = useState<
    WellnessDayMetric[] | null
  >(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // PWA Install, Online/Offline status & Auto Service Worker Check
  const isOnline = useOnlineStatus();
  const { isInstallable, isInstalled, isIOS, isInIframe, install } = usePWAInstall();
  const [isPwaInstallGuideOpen, setIsPwaInstallGuideOpen] = useState(false);
  const [dismissedInstallBanner, setDismissedInstallBanner] = useState(false);
  const [isAiStudioBypassActive, setIsAiStudioBypassActive] = useState<boolean>(
    () => {
      try {
        return localStorage.getItem(AI_STUDIO_PWA_BYPASS_KEY) === 'true';
      } catch {
        return false;
      }
    }
  );

  const showToast = (msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 4500);
  };

  const handleInstallPwaClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (accepted) {
        showToast('Zainstalowano aplikację Domyos Cycling Hub na urządzeniu!');
      }
      return;
    }
    setIsPwaInstallGuideOpen(true);
  };

  const handleForceUpdatePwa = () => {
    forceUpdatePwaAndClearCaches(showToast);
  };

  // Automatic PWA Service Worker Update on Startup
  useEffect(() => {
    if ('serviceWorker' in navigator && isOnline) {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => {
          for (const reg of regs) {
            reg.update().catch(() => {});
          }
        })
        .catch(() => {});
    }
  }, [isOnline]);

  // Automatically initialize internal OPFS folders silently on boot
  useEffect(() => {
    const bootLocalStorageAndOpfs = async () => {
      try {
        await initializeOfflineFolderStructure({
          rootFolderName: getConfiguredRootFolderName() || 'DomyosCyclingHub',
          cloudConnected: Boolean(googleUser),
        });
        const merged = await syncWorkoutsWithLocalOpfs(workouts);
        if (merged && merged.length > 0) {
          setWorkouts(mergeAndNormalizeWorkoutsLibrary(merged));
        }
        const lightweight = await offloadActivitiesTelemetryToOpfs(
          activities,
          profiles
        );
        setActivities(lightweight);
      } catch {
        // silent fallback
      }
    };
    bootLocalStorageAndOpfs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist to localStorage (only lightweight summaries without heavy 1Hz arrays so 5MB limit is never exceeded)
  useEffect(() => {
    try {
      localStorage.setItem(LS_PROFILES_KEY, JSON.stringify(profiles));
    } catch {
      // ignore
    }
  }, [profiles]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_ACTIVE_PROFILE_KEY, activeProfileId);
    } catch {
      // ignore
    }
  }, [activeProfileId]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_WORKOUTS_KEY, JSON.stringify(workouts));
    } catch {
      // ignore
    }
  }, [workouts]);

  useEffect(() => {
    try {
      const compactActivities = activities.slice(0, 120).map((a) => ({
        ...a,
        records: a.telemetryStoredInOpfs ? [] : a.records.slice(0, 300),
      }));
      localStorage.setItem(LS_ACTIVITIES_KEY, JSON.stringify(compactActivities));
    } catch {
      // ignore
    }
  }, [activities]);

  // Subscribe to FTMS Bluetooth controller
  useEffect(() => {
    return ftmsController.subscribe((nextTelemetry) => {
      setTelemetry(nextTelemetry);
    });
  }, []);

  // Subscribe to Google OAuth & Real-Time Firebase Firestore Hub
  const profilesRef = useRef(profiles);
  profilesRef.current = profiles;
  const workoutsRef = useRef(workouts);
  workoutsRef.current = workouts;
  const workoutTagsRef = useRef(workoutTags);
  workoutTagsRef.current = workoutTags;

  useEffect(() => {
    let unsubFirestore: (() => void) | null = null;

    const unsubAuth = subscribeToGoogleAuth((user) => {
      setGoogleUser(user);
      if (unsubFirestore) {
        unsubFirestore();
        unsubFirestore = null;
      }

      if (user) {
        // Bind or create profile for this authenticated Google rider
        const { profile: resolvedProf, updatedProfiles } =
          resolveOrCreateProfileForGoogleUser(user, profilesRef.current);
        setProfiles(updatedProfiles);
        setActiveProfileId(resolvedProf.id);
        saveProfileToFirestore(resolvedProf).catch(() => {});
        setKnownRiders(getKnownGoogleRiders());

        // Non-destructively verify and initialize required Firestore collections & seed 18 workouts + tags if missing
        ensureFirestoreCollectionsInitialized({
          profile: resolvedProf,
          workouts: workoutsRef.current,
          tags: workoutTagsRef.current,
        })
          .then((res) => {
            if (res.initializedCollections.length > 0) {
              setCollectionsInitialized(true);
            }
            if (res.mergedTags && res.mergedTags.length > 0) {
              setWorkoutTags(res.mergedTags);
            }
            if (res.mergedWorkouts && res.mergedWorkouts.length > 0) {
              setWorkouts(res.mergedWorkouts);
            }
          })
          .catch(() => {});

        // Start real-time Firestore listeners for active Google account
        unsubFirestore = subscribeToFirestoreHub({
          onProfilesSnapshot: (cloudProfiles) => {
            const validCloudProfiles =
              filterGoogleAuthenticatedProfiles(cloudProfiles);
            const firstCloud = Object.values(validCloudProfiles)[0];
            if (firstCloud) {
              setProfiles({ [firstCloud.id]: firstCloud });
              setActiveProfileId(firstCloud.id);
            }
          },
          onWorkoutsSnapshot: (cloudWorkouts) => {
            setWorkouts((prev) => {
              const map = new Map<string, StructuredWorkout>();
              for (const w of prev) map.set(w.id, w);
              for (const cw of cloudWorkouts) map.set(cw.id, cw);
              return mergeAndNormalizeWorkoutsLibrary(Array.from(map.values()));
            });
          },
          onActivitiesSnapshot: (cloudActivities) => {
            setActivities((prev) => {
              const cloudIds = new Set(cloudActivities.map((c) => c.id));
              const map = new Map<string, CompletedActivity>();
              // Keep only locally pending unsynced rides that aren't in Firebase yet
              for (const a of prev) {
                if (
                  !cloudIds.has(a.id) &&
                  a.pendingFirebaseSync &&
                  !a.syncedToFirebase
                ) {
                  map.set(a.id, a);
                }
              }
              // Cloud Firebase is the single source of truth for completedWorkouts and external sync flags
              for (const ca of cloudActivities) {
                const existing = prev.find((p) => p.id === ca.id);
                map.set(ca.id, {
                  ...existing,
                  ...ca,
                  syncedToIntervals: Boolean(
                    ca.syncedToIntervals || existing?.syncedToIntervals
                  ),
                  intervalsActivityId:
                    ca.intervalsActivityId || existing?.intervalsActivityId,
                  syncedToGoogleFit: Boolean(
                    ca.syncedToGoogleFit || existing?.syncedToGoogleFit
                  ),
                  googleFitSessionId:
                    ca.googleFitSessionId || existing?.googleFitSessionId,
                  records:
                    existing?.records &&
                    existing.records.length > (ca.records?.length || 0)
                      ? existing.records
                      : ca.records || [],
                });
              }
              return Array.from(map.values()).sort(
                (a, b) =>
                  new Date(b.startedAtIso).getTime() -
                  new Date(a.startedAtIso).getTime()
              );
            });
            setFirestoreActivitiesLoaded(true);
          },
          onKnownRidersSnapshot: (riders) => {
            setKnownRiders(riders);
          },
          onTagsSnapshot: (cloudTags) => {
            setWorkoutTags(cloudTags);
          },
        });
      }
    });

    return () => {
      unsubAuth();
      if (unsubFirestore) unsubFirestore();
    };
  }, []);

  // Automatically fetch Intervals.icu wellness stats when profile has Intervals.icu configured
  useEffect(() => {
    if (
      activeProfile.intervals.enabled &&
      activeProfile.intervals.apiKey.trim()
    ) {
      fetchIntervalsWellness(activeProfile.intervals, 28)
        .then((series) => {
          if (series.length > 0) setIntervalsWellness(series);
        })
        .catch(() => {});
    } else {
      setIntervalsWellness(null);
    }
  }, [
    activeProfile.id,
    activeProfile.intervals.enabled,
    activeProfile.intervals.apiKey,
  ]);

  // Keep refs for 1Hz Web Worker workout timer loop
  const telemetryRef = useRef(telemetry);
  telemetryRef.current = telemetry;
  const activeProfileRef = useRef(activeProfile);
  activeProfileRef.current = activeProfile;
  const currentWorkoutRef = useRef(currentWorkout);
  currentWorkoutRef.current = currentWorkout;
  const currentBlockIndexRef = useRef(currentBlockIndex);
  currentBlockIndexRef.current = currentBlockIndex;
  const elapsedWorkoutSecRef = useRef(elapsedWorkoutSec);
  elapsedWorkoutSecRef.current = elapsedWorkoutSec;

  // 1Hz Background-Resilient Web Worker + Wall-Clock Delta Workout Execution Loop
  useEffect(() => {
    if (!isRunning || isPaused) return;

    const workerTimer = new AccurateWorkoutTimer();
    workerTimer.start((secondsDelta) => {
      const workout = currentWorkoutRef.current;
      const profile = activeProfileRef.current;
      const bike = telemetryRef.current;

      setElapsedWorkoutSec((prevTotal) => prevTotal + secondsDelta);

      setElapsedInBlockSec((prevBlockSec) => {
        const blkIdx = currentBlockIndexRef.current;
        const block = workout.blocks[blkIdx];
        if (!block) return prevBlockSec;

        const nextSec = prevBlockSec + secondsDelta;
        const remaining = block.durationSec - nextSec;

        // Audio countdown cues at 3s, 2s, 1s, and 0s
        if (remaining <= 3 && remaining >= 0) {
          audioAndWakeLock.playCountdownBeep(remaining);
        }

        // Compute dynamic ramp target Watts & Resistance for this exact second
        const { targetWatts, targetResistance } = calculateBlockInstantTarget(
          block,
          nextSec,
          profile.ftpWatts,
          bike.biasPercent
        );
        ftmsController.applyTargetLoad(targetWatts, targetResistance, false);

        // Record 1Hz telemetry samples (catching up if app was in background on Android)
        // Speed (km/h) & Distance (m) are computed strictly from rotations/sec (RPM/60) * 700c wheel (2.105m) * 1s
        const effectiveCadenceRpm =
          bike.cadenceRpm || (bike.isSimulator ? 88 : 0);
        const wheel1Hz = calculate700cWheelSpeedAndDistance(
          effectiveCadenceRpm,
          1
        );
        const newSamples: TelemetryRecord[] = [];
        for (let s = 1; s <= secondsDelta; s++) {
          rideDistanceMetersRef.current = Number(
            (
              rideDistanceMetersRef.current + wheel1Hz.distanceDeltaMeters
            ).toFixed(2)
          );
          newSamples.push({
            timestampMs: Date.now() - (secondsDelta - s) * 1000,
            elapsedSec: elapsedWorkoutSecRef.current + s,
            blockIndex: blkIdx,
            powerWatts: bike.powerWatts || targetWatts,
            targetPowerWatts: targetWatts,
            externalPowerWatts: bike.externalPowerWatts ?? undefined,
            powerMatchOffsetWatts: bike.powerMatchOffsetWatts,
            heartRateBpm: bike.heartRateBpm || (bike.isSimulator ? 125 : 0),
            cadenceRpm: effectiveCadenceRpm,
            speedKmh: wheel1Hz.speedKmh,
            distanceMeters: Math.round(rideDistanceMetersRef.current),
            resistanceLevel: bike.resistanceLevel || targetResistance,
          });
        }
        setLiveRecords((prev) => [...prev, ...newSamples]);

        // Advance to next block if interval countdown reached 0
        if (nextSec >= block.durationSec) {
          if (blkIdx + 1 < workout.blocks.length) {
            const nextIdx = blkIdx + 1;
            setCurrentBlockIndex(nextIdx);
            const nextBlock = workout.blocks[nextIdx];
            const nextTarget = calculateBlockInstantTarget(
              nextBlock,
              0,
              profile.ftpWatts,
              bike.biasPercent
            );
            ftmsController.applyTargetLoad(
              nextTarget.targetWatts,
              nextTarget.targetResistance,
              true
            );
            return Math.max(0, nextSec - block.durationSec);
          } else {
            // End of final block -> Pause timer and automatically open Finish & Save .FIT confirmation modal!
            setIsPaused(true);
            setAutoShowFinishConfirm(true);
            showToast(
              'Ostatni interwał zakończony! Potwierdź zapis pliku .FIT w oknie podsumowania.'
            );
            return block.durationSec;
          }
        }

        return nextSec;
      });
    });

    return () => workerTimer.stop();
  }, [isRunning, isPaused]);

  // Handlers for Cockpit Transport
  const handleStartOrResume = async () => {
    if (!telemetry.connected) {
      ftmsController.startSimulator();
      showToast(
        'Uruchomiono symulator Domyos FTMS (możesz w każdej chwili połączyć prawdziwy rower Bluetooth).'
      );
    }

    setAutoShowFinishConfirm(false);

    if (!isRunning) {
      ftmsController.resetRideDistance();
      rideDistanceMetersRef.current = 0;
      setRideStartedAtIso(new Date().toISOString());
      setElapsedWorkoutSec(0);
      setCurrentBlockIndex(0);
      setElapsedInBlockSec(0);
      setLiveRecords([]);
      setIsRunning(true);
      setIsPaused(false);
    } else {
      setIsPaused(false);
    }

    const block =
      currentWorkout.blocks[currentBlockIndex] || currentWorkout.blocks[0];
    if (block) {
      const { targetWatts, targetResistance } = calculateBlockInstantTarget(
        block,
        elapsedInBlockSec,
        activeProfile.ftpWatts,
        telemetry.biasPercent
      );
      ftmsController.applyTargetLoad(targetWatts, targetResistance, true);
    }

    const locked = await audioAndWakeLock.requestWakeLock();
    setWakeLockActive(locked);
  };

  const handlePause = () => {
    setIsPaused(true);
  };

  const handleStopAndFinish = async () => {
    setIsRunning(false);
    setIsPaused(false);
    await audioAndWakeLock.releaseWakeLock();
    setWakeLockActive(false);

    const recordsToSave: TelemetryRecord[] =
      liveRecords.length > 0
        ? liveRecords
        : [
            {
              timestampMs: Date.now(),
              elapsedSec: 1,
              blockIndex: 0,
              powerWatts: telemetry.powerWatts || 150,
              targetPowerWatts: telemetry.targetPowerWatts || 150,
              powerMatchOffsetWatts: 0,
              heartRateBpm: telemetry.heartRateBpm || (telemetry.isSimulator ? 130 : 0),
              cadenceRpm: telemetry.cadenceRpm || 88,
              speedKmh: telemetry.speedKmh || 28.5,
              distanceMeters: Math.max(100, telemetry.distanceMeters),
              resistanceLevel: telemetry.resistanceLevel || 8,
            },
          ];

    const summary = calculateActivitySummary(
      activeProfile,
      currentWorkout.name,
      currentWorkout.id,
      rideStartedAtIso || new Date().toISOString(),
      recordsToSave
    );

    // 1. Always save binary .FIT + 1Hz Telemetry_JSON + fitBase64 into local OPFS first!
    const localOpfsRes = await saveCompletedRideAndStateToLocalOpfs(
      summary,
      activeProfile,
      [summary, ...activities]
    );

    const summaryWithFitBase64: CompletedActivity = {
      ...summary,
      ownerUid: googleUser?.uid || activeProfile.uid,
      ownerEmail: googleUser?.email || activeProfile.email,
      fitBase64: localOpfsRes.fitBase64,
      pendingFirebaseSync: true,
      syncedToFirebase: false,
    };

    const summaryForState: CompletedActivity = {
      ...summaryWithFitBase64,
      records: localOpfsRes.savedToOpfs ? [] : summary.records,
      telemetryStoredInOpfs: localOpfsRes.savedToOpfs,
    };

    setActivities((prev) => [summaryForState, ...prev]);
    setJustFinishedActivity(summaryWithFitBase64);

    if (!navigator.onLine) {
      showToast(
        `Tryb Offline: Zapisano plik .FIT i telemetrię w pamięci OPFS (/User_Data/${summary.profileId}/Workouts_FIT). Zostanie wysłany do Firebase, Google Fit i Intervals.icu po włączeniu WiFi!`
      );
      return;
    }

    // 2. Upload to central Firebase Cloud Firestore first (with full .FIT in Base64)
    if (googleUser) {
      try {
        await saveCompletedActivityToFirestore(summaryWithFitBase64);
        setActivities((prev) =>
          prev.map((a) =>
            a.id === summary.id
              ? {
                  ...a,
                  syncedToFirebase: true,
                  pendingFirebaseSync: false,
                }
              : a
          )
        );
        setJustFinishedActivity((prev) =>
          prev
            ? {
                ...prev,
                syncedToFirebase: true,
                pendingFirebaseSync: false,
              }
            : null
        );
        showToast(
          `Zapisano trening (${(summary.totalDistanceMeters / 1000).toFixed(2)} km, ${summary.avgSpeedKmh} km/h) i plik .FIT w Firebase Cloud Firestore oraz w OPFS!`
        );
      } catch (err) {
        recordPrivateAuditLog(
          'WARN',
          'FIRESTORE',
          'Trening .FIT zapisany lokalnie w OPFS i dodany do kolejki Pending Sync dla Firebase',
          err instanceof Error ? err.message : String(err)
        );
        showToast(
          `Zapisano .FIT w OPFS! Trening dodano do kolejki Pending Sync dla Firebase.`
        );
      }
    } else {
      showToast(
        `Zapisano .FIT w OPFS — zaloguj się kontem Google, aby zsynchronizować z Firebase i Google Fit!`
      );
    }

    // 3. If online and Intervals.icu is configured for this profile, auto-upload .FIT to Intervals.icu
    // and immediately persist syncedToIntervals = true in Firebase Cloud Firestore!
    if (
      activeProfile.intervals.enabled &&
      activeProfile.intervals.apiKey.trim() &&
      !inFlightIntervalsIdsRef.current.has(summary.id)
    ) {
      inFlightIntervalsIdsRef.current.add(summary.id);
      uploadActivityFitToIntervals(
        activeProfile.intervals,
        summaryWithFitBase64
      )
        .then(async (intRes) => {
          if (intRes.ok) {
            setActivities((prev) =>
              prev.map((a) =>
                a.id === summary.id
                  ? {
                      ...a,
                      syncedToIntervals: true,
                      intervalsActivityId: intRes.activityId,
                    }
                  : a
              )
            );
            setJustFinishedActivity((prev) =>
              prev && prev.id === summary.id
                ? {
                    ...prev,
                    syncedToIntervals: true,
                    intervalsActivityId: intRes.activityId,
                  }
                : prev
            );
            await updateCompletedActivityExternalSyncInFirestore(summary.id, {
              syncedToIntervals: true,
              intervalsActivityId: intRes.activityId,
            });
          }
        })
        .catch(() => {})
        .finally(() => {
          inFlightIntervalsIdsRef.current.delete(summary.id);
        });
    }

    // 4. Auto-upload to Google Fit if enabled on profile and persist syncedToGoogleFit in Firebase!
    if (activeProfile.googleFit?.enabled !== false && googleUser) {
      uploadActivityToGoogleFit(summaryWithFitBase64, {
        userUid: googleUser.uid,
        userEmail: googleUser.email || undefined,
      })
        .then(async (fitRes) => {
          if (fitRes.ok) {
            setGoogleFitErrorInfo(null);
            setActivities((prev) =>
              prev.map((a) =>
                a.id === summary.id
                  ? {
                      ...a,
                      syncedToGoogleFit: true,
                      googleFitSessionId: fitRes.sessionId,
                    }
                  : a
              )
            );
            setJustFinishedActivity((prev) =>
              prev && prev.id === summary.id
                ? {
                    ...prev,
                    syncedToGoogleFit: true,
                    googleFitSessionId: fitRes.sessionId,
                  }
                : prev
            );
            await updateCompletedActivityExternalSyncInFirestore(summary.id, {
              syncedToGoogleFit: true,
              googleFitSessionId: fitRes.sessionId,
            });
          } else if (fitRes.fitnessApiDisabledUrl) {
            setGoogleFitErrorInfo({
              message: fitRes.message,
              enableApiUrl: fitRes.fitnessApiDisabledUrl,
              projectNumber: fitRes.projectNumber,
            });
          }
        })
        .catch(() => {});
    }
  };

  const handleJumpToBlock = (index: number) => {
    if (index < 0 || index >= currentWorkout.blocks.length) return;
    setCurrentBlockIndex(index);
    setElapsedInBlockSec(0);
    const block = currentWorkout.blocks[index];
    const { targetWatts, targetResistance } = calculateBlockInstantTarget(
      block,
      0,
      activeProfile.ftpWatts,
      telemetry.biasPercent
    );
    ftmsController.applyTargetLoad(targetWatts, targetResistance, true);
  };

  const handleChangeBias = (deltaPct: number) => {
    const nextBias = Math.max(
      70,
      Math.min(130, telemetry.biasPercent + deltaPct)
    );
    ftmsController.setBiasPercent(nextBias);
    const block = currentWorkout.blocks[currentBlockIndex];
    if (block) {
      const { targetWatts, targetResistance } = calculateBlockInstantTarget(
        block,
        elapsedInBlockSec,
        activeProfile.ftpWatts,
        nextBias
      );
      ftmsController.applyTargetLoad(targetWatts, targetResistance, true);
    }
  };

  // Fast User Switcher & Google OAuth Handlers
  const handleSelectAndSwitchRider = async (
    targetProfile: AthleteProfile,
    triggerGoogleOAuthSwitch: boolean
  ) => {
    if (triggerGoogleOAuthSwitch) {
      try {
        const res = await signInRiderWithGoogle({
          loginHintEmail: targetProfile.email,
          requestGoogleFitScopes: targetProfile.googleFit?.enabled !== false,
        });
        const updatedProfile: AthleteProfile = {
          ...targetProfile,
          uid: res.user.uid,
          email: res.user.email || targetProfile.email,
          photoURL: res.user.photoURL || targetProfile.photoURL,
          updatedAtIso: new Date().toISOString(),
        };
        setProfiles((prev) => ({ ...prev, [updatedProfile.id]: updatedProfile }));
        setActiveProfileId(updatedProfile.id);
        await saveProfileToFirestore(updatedProfile);
        setKnownRiders(getKnownGoogleRiders());
        showToast(
          `Przelogowano na konto Google: ${res.user.email} (${updatedProfile.name}, FTP ${updatedProfile.ftpWatts}W)!`
        );
      } catch (err: any) {
        showToast(err?.message || 'Przelogowanie Google nie powiodło się.');
      }
      return;
    }

    setActiveProfileId(targetProfile.id);
    setIntervalsWellness(null);
    showToast(
      `Aktywowano profil: ${targetProfile.name} (FTP: ${targetProfile.ftpWatts} W)`
    );
  };

  const handleAddNewGoogleRider = async (loginHintEmail?: string) => {
    try {
      const res = await signInRiderWithGoogle({
        loginHintEmail,
        requestGoogleFitScopes: true,
      });
      const { profile: newProf, updatedProfiles } =
        resolveOrCreateProfileForGoogleUser(res.user, profiles);
      setProfiles(updatedProfiles);
      setActiveProfileId(newProf.id);
      await saveProfileToFirestore(newProf);
      setKnownRiders(getKnownGoogleRiders());
      showToast(
        `Zalogowano konto Google ${res.user.email} i połączono profil „${newProf.name}” z centralnym Firebase oraz Google Fit!`
      );
    } catch (err: any) {
      showToast(err?.message || 'Logowanie Google OAuth nie powiodło się.');
      throw err;
    }
  };

  const handleRefreshGoogleFitToken = async () => {
    try {
      const res = await signInRiderWithGoogle({
        loginHintEmail: activeProfile.email || googleUser?.email || undefined,
        requestGoogleFitScopes: true,
      });
      showToast(
        `Odświeżono token Google Fit dla konta ${res.user.email || activeProfile.name}!`
      );
    } catch (err: any) {
      showToast(err?.message || 'Nie udało się odświeżyć tokenu Google Fit.');
    }
  };

  const handleGoogleLogout = async () => {
    await signOutGoogleRider();
    setGoogleUser(null);
    setProfiles({});
    setActiveProfileId('');
    showToast('Wylogowano z konta Google.');
  };

  // Firebase Cloud Firestore Sync Handlers
  const handleSyncAllToFirebase = async () => {
    if (!googleUser) {
      await handleAddNewGoogleRider();
    }
    setIsSyncingFirebase(true);
    try {
      const counts = await syncAllStateToFirestore({
        profiles,
        workouts,
        activities,
      });
      setActivities((prev) =>
        prev.map((a) => ({
          ...a,
          syncedToFirebase: true,
          pendingFirebaseSync: false,
        }))
      );
      showToast(
        `Zsynchronizowano z Firebase Firestore: ${counts.profilesCount} profili, ${counts.workoutsCount} planów i ${counts.activitiesCount} treningów (.FIT)!`
      );
    } catch (err: any) {
      showToast(err?.message || 'Błąd synchronizacji z Firebase Firestore.');
    } finally {
      setIsSyncingFirebase(false);
    }
  };

  const handleRestoreFromFirebase = async () => {
    if (!googleUser) {
      await handleAddNewGoogleRider();
    }
    setIsSyncingFirebase(true);
    try {
      const restored = await fetchAllStateFromFirestore();
      if (Object.keys(restored.profiles).length > 0) {
        setProfiles((prev) => ({ ...prev, ...restored.profiles }));
      }
      if (restored.workouts.length > 0) {
        setWorkouts(mergeAndNormalizeWorkoutsLibrary(restored.workouts));
      }
      if (restored.activities.length > 0) {
        setActivities(restored.activities);
      }
      showToast(
        `Pobrano dane z centralnego Firebase Firestore (${restored.workouts.length} treningów, ${restored.activities.length} wykonanych jazd)!`
      );
    } catch (err: any) {
      showToast(err?.message || 'Nie udało się pobrać danych z Firebase.');
    } finally {
      setIsSyncingFirebase(false);
    }
  };

  const handleUpdateWorkoutTags = (nextTags: string[]) => {
    const normalized = saveWorkoutTagsLocally(nextTags);
    setWorkoutTags(normalized);
    if (googleUser) {
      saveWorkoutTagsToFirestore(normalized).catch(() => {});
    }
  };

  const handleEnsureFirestoreCollections = async () => {
    if (!googleUser) {
      await handleAddNewGoogleRider();
    }
    setIsSyncingFirebase(true);
    try {
      const res = await ensureFirestoreCollectionsInitialized({
        profile: activeProfile,
        workouts,
        tags: workoutTags,
      });
      setCollectionsInitialized(true);
      setWorkoutTags(res.mergedTags);
      setWorkouts(res.mergedWorkouts);
      showToast(
        `Zweryfikowano kolekcje Firestore (hubConfig, profiles, plannedWorkouts, completedWorkouts) — zsynchronizowano ${res.mergedWorkouts.length} treningów i ${res.mergedTags.length} kategorii!`
      );
    } catch (err: any) {
      showToast(
        err?.message || 'Nie udało się zweryfikować kolekcji w Firestore.'
      );
    } finally {
      setIsSyncingFirebase(false);
    }
  };

  const handleUploadSingleActivityToFirebase = async (
    activity: CompletedActivity
  ) => {
    if (!googleUser) {
      await handleAddNewGoogleRider();
    }
    try {
      await saveCompletedActivityToFirestore(activity);
      setActivities((prev) =>
        prev.map((a) =>
          a.id === activity.id
            ? {
                ...a,
                syncedToFirebase: true,
                pendingFirebaseSync: false,
              }
            : a
        )
      );
      showToast(
        `Zapisano trening „${activity.workoutName}” wraz z plikiem .FIT w Firebase Firestore!`
      );
    } catch (err: any) {
      showToast(
        err?.message || 'Nie udało się zapisać treningu w Firebase Firestore.'
      );
    }
  };

  const handleUploadSingleActivityToGoogleFit = async (
    activity: CompletedActivity
  ) => {
    const res = await uploadActivityToGoogleFit(activity, {
      userUid: googleUser?.uid,
      userEmail: activeProfile.email || googleUser?.email || undefined,
      interactiveRefreshIfExpired: true,
    });
    showToast(res.message);
    if (res.ok) {
      setGoogleFitErrorInfo(null);
      setActivities((prev) =>
        prev.map((a) =>
          a.id === activity.id
            ? {
                ...a,
                syncedToGoogleFit: true,
                googleFitSessionId: res.sessionId,
              }
            : a
        )
      );
      setJustFinishedActivity((prev) =>
        prev && prev.id === activity.id
          ? {
              ...prev,
              syncedToGoogleFit: true,
              googleFitSessionId: res.sessionId,
            }
          : prev
      );
      await updateCompletedActivityExternalSyncInFirestore(activity.id, {
        syncedToGoogleFit: true,
        googleFitSessionId: res.sessionId,
      });
    } else if (res.fitnessApiDisabledUrl) {
      setGoogleFitErrorInfo({
        message: res.message,
        enableApiUrl: res.fitnessApiDisabledUrl,
        projectNumber: res.projectNumber,
      });
    }
  };

  const handleDeleteCompletedActivity = async (activity: CompletedActivity) => {
    setActivities((prev) => prev.filter((a) => a.id !== activity.id));
    setJustFinishedActivity((prev) =>
      prev && prev.id === activity.id ? null : prev
    );
    try {
      await deleteCompletedActivityEverywhere(activity);
      showToast(
        `Usunięto wykonany trening „${activity.workoutName}” z aplikacji, lokalnego OPFS i chmury Firebase!`
      );
    } catch (err: any) {
      showToast(
        err?.message ||
          'Usunięto trening lokalnie (zostanie usunięty z Firebase po połączeniu).'
      );
    }
  };

  const handleToggleGoogleFitEnabled = (enabled: boolean) => {
    const updatedProfile: AthleteProfile = {
      ...activeProfile,
      googleFit: {
        enabled,
        autoUploadActivities: enabled,
      },
      updatedAtIso: new Date().toISOString(),
    };
    setProfiles((prev) => ({ ...prev, [updatedProfile.id]: updatedProfile }));
    saveProfileToFirestore(updatedProfile).catch(() => {});
    if (!enabled) {
      setGoogleFitErrorInfo(null);
    }
    showToast(
      enabled
        ? 'Włączono integrację Google Fit dla aktywnego profilu.'
        : 'Wyłączono Google Fit — aplikacja używa teraz wyłącznie Firebase Cloud i Intervals.icu.'
    );
  };

  // Pending Offline Sync Queue
  const pendingFirebaseActivities = activities.filter(
    (a) => a.pendingFirebaseSync && !a.syncedToFirebase
  );

  const handleFlushPendingSync = async () => {
    const queuedMutationsCount = getPendingSyncQueueCount();
    if (pendingFirebaseActivities.length === 0 && queuedMutationsCount === 0) {
      return;
    }
    if (!googleUser) {
      await handleAddNewGoogleRider();
    }
    setIsSyncingFirebase(true);
    try {
      const flushedBatchCount = await flushOfflineSyncQueueWithBatch();
      let uploadedCount = 0;
      const syncedIds = new Set<string>();
      for (const pendingAct of pendingFirebaseActivities) {
        await saveCompletedActivityToFirestore(pendingAct);
        syncedIds.add(pendingAct.id);
        uploadedCount++;
      }

      setActivities((prev) =>
        prev.map((a) =>
          syncedIds.has(a.id)
            ? {
                ...a,
                syncedToFirebase: true,
                pendingFirebaseSync: false,
              }
            : a
        )
      );
      showToast(
        `Zsynchronizowano paczkowo (writeBatch) ${uploadedCount} zaległych treningów .FIT oraz ${flushedBatchCount} zmian z kolejki Offline-First do Firebase Firestore!`
      );
    } catch (err: any) {
      showToast(
        err?.message || 'Nie udało się wysłać wszystkich zaległych treningów.'
      );
    } finally {
      setIsSyncingFirebase(false);
    }
  };

  // Automatic Background Sync when WiFi reconnects (isOnline becomes true)
  // Strictly gated on `firestoreActivitiesLoaded` so clearing browser cache NEVER re-uploads rides already marked `syncedToIntervals: true` in Firebase!
  const autoSyncInFlightRef = useRef(false);
  useEffect(() => {
    if (!isOnline || !googleUser || !firestoreActivitiesLoaded || autoSyncInFlightRef.current) {
      return;
    }

    const runAutoBackgroundSync = async () => {
      autoSyncInFlightRef.current = true;
      try {
        // 0. Flush any queued Offline-First mutations (profiles, tags, workouts, activities) in an atomic writeBatch
        const flushedBatchOps = await flushOfflineSyncQueueWithBatch();
        if (flushedBatchOps > 0) {
          showToast(
            `Auto-Sync (writeBatch): Zsynchronizowano ${flushedBatchOps} operacji z kolejki Offline-First z Firebase!`
          );
        }

        // 1. Auto-upload any pending activities to Firebase Firestore first
        if (pendingFirebaseActivities.length > 0) {
          let fbCount = 0;
          const syncedFbIds = new Set<string>();
          for (const pendingAct of pendingFirebaseActivities) {
            await saveCompletedActivityToFirestore(pendingAct);
            syncedFbIds.add(pendingAct.id);
            fbCount++;
          }
          if (fbCount > 0) {
            setActivities((prev) =>
              prev.map((a) =>
                syncedFbIds.has(a.id)
                  ? {
                      ...a,
                      syncedToFirebase: true,
                      pendingFirebaseSync: false,
                    }
                  : a
              )
            );
            showToast(
              `Auto-Sync (WiFi): Automatycznie wysłano ${fbCount} zaległych treningów .FIT z OPFS do centralnego Firebase!`
            );
          }
        }

        // 2. Auto-upload any unsynced activities to Intervals.icu ONLY after Firebase snapshot is loaded
        // and immediately persist syncedToIntervals = true in Firebase Firestore!
        const unsyncedIntervals = activities.filter((a) => {
          const prof = profiles[a.profileId];
          return (
            prof?.intervals?.enabled &&
            prof?.intervals?.apiKey?.trim() &&
            prof?.intervals?.autoUploadActivities !== false &&
            !a.syncedToIntervals &&
            !inFlightIntervalsIdsRef.current.has(a.id)
          );
        });

        if (unsyncedIntervals.length > 0) {
          let intSyncedCount = 0;
          const syncedIntIds = new Map<string, string | undefined>();
          for (const act of unsyncedIntervals) {
            const prof = profiles[act.profileId];
            if (!prof) continue;
            inFlightIntervalsIdsRef.current.add(act.id);
            try {
              const res = await uploadActivityFitToIntervals(prof.intervals, act);
              if (res.ok) {
                syncedIntIds.set(act.id, res.activityId);
                intSyncedCount++;
                await updateCompletedActivityExternalSyncInFirestore(act.id, {
                  syncedToIntervals: true,
                  intervalsActivityId: res.activityId,
                });
              }
            } finally {
              inFlightIntervalsIdsRef.current.delete(act.id);
            }
          }
          if (intSyncedCount > 0) {
            setActivities((prev) =>
              prev.map((a) =>
                syncedIntIds.has(a.id)
                  ? {
                      ...a,
                      syncedToIntervals: true,
                      intervalsActivityId: syncedIntIds.get(a.id),
                    }
                  : a
              )
            );
            showToast(
              `Auto-Sync (WiFi): Wysłano ${intSyncedCount} zaległych treningów .FIT do Intervals.icu i oznaczono w Firebase!`
            );
          }
        }
      } catch {
        // silent background retry on next online event
      } finally {
        autoSyncInFlightRef.current = false;
      }
    };

    runAutoBackgroundSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, googleUser, firestoreActivitiesLoaded, activities.length]);

  const handleDownloadHydratedFit = async (activity: CompletedActivity) => {
    const hydrated = await ensureActivityHasRecords(activity);
    downloadActivityFitFile(hydrated);
  };

  const handleDownloadHydratedTcx = async (activity: CompletedActivity) => {
    const hydrated = await ensureActivityHasRecords(activity);
    downloadActivityTcxFile(hydrated);
  };

  // Intervals.icu Handlers
  const handleSyncFromIntervalsIcu = async () => {
    if (!activeProfile.intervals.apiKey.trim()) {
      setActiveTab('profiles');
      showToast(
        `Wpisz klucz API Intervals.icu w zakładce 4. Profile (${activeProfile.name}), aby pobrać bibliotekę i kalendarz.`
      );
      return;
    }

    setIsSyncingIntervals(true);
    try {
      const fetched = await fetchIntervalsPlannedAndLibraryWorkouts(
        activeProfile.intervals,
        activeProfile.id,
        activeProfile.ftpWatts
      );
      if (fetched.length === 0) {
        showToast(
          'Połączono z Intervals.icu, ale nie znaleziono nowych treningów w kalendarzu/bibliotece.'
        );
      } else {
        setWorkouts((prev) => {
          const existingIds = new Set(prev.map((w) => w.id));
          const merged = [...prev];
          for (const item of fetched) {
            const idx = merged.findIndex((w) => w.id === item.id);
            if (idx >= 0) merged[idx] = item;
            else if (!existingIds.has(item.id)) merged.unshift(item);
          }
          return merged;
        });
        for (const item of fetched) {
          savePlannedWorkoutToFirestore(item).catch(() => {});
        }
        showToast(
          `Pobrano ${fetched.length} treningów z Intervals.icu i zapisano w Firebase!`
        );
      }
    } catch (err: any) {
      showToast(err?.message || 'Błąd komunikacji z Intervals.icu.');
    } finally {
      setIsSyncingIntervals(false);
    }
  };

  const handleRefreshIntervalsWellness = async () => {
    if (!activeProfile.intervals.apiKey.trim()) {
      setActiveTab('profiles');
      showToast('Dodaj klucz API Intervals.icu w zakładce 4. Profile.');
      return;
    }
    setIsSyncingIntervals(true);
    try {
      const series = await fetchIntervalsWellness(activeProfile.intervals, 28);
      if (series.length > 0) {
        setIntervalsWellness(series);
        showToast(
          'Pobrano aktualne wskaźniki Fitness (CTL) i Zmęczenia (ATL) z Intervals.icu.'
        );
      }
    } catch (err: any) {
      showToast(
        err?.message || 'Nie udało się pobrać danych Wellness z Intervals.icu.'
      );
    } finally {
      setIsSyncingIntervals(false);
    }
  };

  const handleUploadActivityToIntervals = async (
    activity: CompletedActivity
  ) => {
    if (inFlightIntervalsIdsRef.current.has(activity.id)) return;
    inFlightIntervalsIdsRef.current.add(activity.id);
    try {
      const res = await uploadActivityFitToIntervals(
        activeProfile.intervals,
        activity
      );
      showToast(res.message);
      if (res.ok) {
        setActivities((prev) =>
          prev.map((a) =>
            a.id === activity.id
              ? {
                  ...a,
                  syncedToIntervals: true,
                  intervalsActivityId: res.activityId,
                }
              : a
          )
        );
        setJustFinishedActivity((prev) =>
          prev && prev.id === activity.id
            ? {
                ...prev,
                syncedToIntervals: true,
                intervalsActivityId: res.activityId,
              }
            : prev
        );
        await updateCompletedActivityExternalSyncInFirestore(activity.id, {
          syncedToIntervals: true,
          intervalsActivityId: res.activityId,
        });
      }
    } finally {
      inFlightIntervalsIdsRef.current.delete(activity.id);
    }
  };

  const computedWellnessSeries =
    intervalsWellness && intervalsWellness.length > 0
      ? intervalsWellness
      : calculateLocalWellnessSeries(activities, activeProfile.id, 28);

  const latestTsb =
    computedWellnessSeries.length > 0
      ? computedWellnessSeries[computedWellnessSeries.length - 1].tsb
      : 2;

  const lastProfileActivity =
    activities.find((a) => a.profileId === activeProfile.id) || null;

  const detectedPostRideFtp = detectEstimatedFtpFromCompletedActivity(
    justFinishedActivity,
    activeProfile,
    currentWorkout
  );

  const handleApplyDetectedFtp = (newFtpWatts: number) => {
    const clampedFtp = Math.max(60, Math.min(600, Math.round(newFtpWatts)));
    const updatedProfile: AthleteProfile = {
      ...activeProfile,
      ftpWatts: clampedFtp,
      powerZones: buildPowerZonesFromFtp(clampedFtp),
      updatedAtIso: new Date().toISOString(),
    };
    setProfiles((prev) => ({ ...prev, [updatedProfile.id]: updatedProfile }));
    saveProfileToFirestore(updatedProfile).catch(() => {});
    showToast(
      `Zaktualizowano FTP na ${clampedFtp} W i automatycznie przeliczono 7 stref mocy oraz zapisano w Firebase!`
    );
  };

  const isPwaUnlocked =
    isInstalled || (isAIStudioPreviewEnvironment() && isAiStudioBypassActive);

  // STRICT 3-STAGE GATE:
  // 1) Must be installed as Standalone PWA on mobile/tablet (or AI Studio preview bypass active)
  // 2) Must have Firebase JSON configured in device memory
  // 3) Must be authenticated with Google OAuth (profiles are created exclusively from Google accounts)
  if (
    !isPwaUnlocked ||
    !isConfigured ||
    !googleUser ||
    Object.keys(profiles).length === 0
  ) {
    return (
      <PwaAndAuthGateScreen
        isPwaInstalled={isInstalled}
        isPwaInstallable={isInstallable}
        isIOS={isIOS}
        isAiStudioBypassActive={isAiStudioBypassActive}
        onActivateAiStudioBypass={() => {
          try {
            localStorage.setItem(AI_STUDIO_PWA_BYPASS_KEY, 'true');
          } catch {
            // ignore
          }
          setIsAiStudioBypassActive(true);
        }}
        onInstallPwa={install}
        onSignInGoogle={async (hintEmail?: string) => {
          await handleAddNewGoogleRider(hintEmail);
        }}
        knownRiders={knownRiders}
      />
    );
  }

  return (
    <div
      className={`min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-[#0B0F17] text-slate-100 flex flex-col ${
        themeMode === 'soft-light' ? 'theme-soft-light' : 'theme-soft-dark'
      }`}
    >
      {/* STRICT 3-ZONE TOP BAR CONTRACT (HIDDEN IN ZEN FOCUS HUD MODE) */}
      {!(activeTab === 'cockpit' && isFocusHudMode) && (
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 sm:gap-4 px-2.5 sm:px-8 py-2 bg-[#0B0F17]/95 backdrop-blur-md border-b border-slate-800 shrink-0 min-w-0">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#workouts"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('workouts');
          }}
          className="text-sm sm:text-lg font-bold tracking-tight text-white truncate min-w-0"
        >
          Domyos Cycling Hub
        </a>

        {/* Zone 2: 5 concise single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
          <a
            href="#workouts"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('workouts');
            }}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'workouts'
                ? 'text-white underline underline-offset-8 decoration-emerald-500 decoration-2'
                : ''
            }`}
          >
            1. Wybór Treningu
          </a>
          <a
            href="#cockpit"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('cockpit');
            }}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'cockpit'
                ? 'text-white underline underline-offset-8 decoration-emerald-500 decoration-2'
                : ''
            }`}
          >
            2. Workout Mode
          </a>
          <a
            href="#analytics"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('analytics');
            }}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'analytics'
                ? 'text-white underline underline-offset-8 decoration-emerald-500 decoration-2'
                : ''
            }`}
          >
            3. Postępy i FIT
          </a>
          <a
            href="#profiles"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('profiles');
            }}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'profiles'
                ? 'text-white underline underline-offset-8 decoration-emerald-500 decoration-2'
                : ''
            }`}
          >
            4. Profile
          </a>
          <a
            href="#settings"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('settings');
            }}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'settings'
                ? 'text-white underline underline-offset-8 decoration-emerald-500 decoration-2'
                : ''
            }`}
          >
            5. Chmura Firebase
          </a>
        </nav>

        {/* Zone 3: PWA Install, Offline Badge, Pending Sync Indicator, Theme Switcher & Fast Rider Switcher */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {!isInstalled && (
            <button
              onClick={handleInstallPwaClick}
              className="min-h-[34px] sm:min-h-[36px] px-2 sm:px-3 py-1 sm:py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-[11px] sm:text-xs font-bold flex items-center gap-1 transition-colors shadow-sm"
              title="Zainstaluj Domyos Cycling Hub jako aplikację PWA na telefonie"
            >
              <Smartphone className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Zainstaluj Apkę</span>
              <span className="sm:hidden">Instaluj</span>
            </button>
          )}

          {!isOnline && (
            <span
              className="min-h-[34px] sm:min-h-[36px] px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/50 text-[11px] sm:text-xs font-bold text-amber-400 flex items-center gap-1"
              title="Tryb Offline: Treningi .FIT zapisują się w pamięci OPFS i wyślą się automatycznie do Firebase i Google Fit po włączeniu WiFi"
            >
              <WifiOff className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden lg:inline">Offline (OPFS)</span>
            </span>
          )}

          {pendingFirebaseActivities.length > 0 && (
            <button
              onClick={handleFlushPendingSync}
              disabled={isSyncingFirebase || !isOnline}
              className="min-h-[34px] sm:min-h-[36px] px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 disabled:opacity-60 border border-amber-500/50 text-[11px] sm:text-xs font-bold text-amber-400 flex items-center gap-1 transition-colors"
              title="Kliknij, aby wysłać zaległe treningi .FIT do centralnego Firebase Firestore"
            >
              <CloudUpload className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Pending:</span>
              <span>{pendingFirebaseActivities.length}</span>
            </button>
          )}

          <button
            onClick={handleForceUpdatePwa}
            className="min-h-[34px] sm:min-h-[36px] px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] sm:text-xs font-semibold text-emerald-400 flex items-center gap-1 transition-colors"
            title="Pobierz najnowszą wersję aplikacji z GitHub Pages i przeładuj Service Worker PWA"
          >
            <RefreshCw className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden lg:inline">Aktualizuj</span>
          </button>

          <button
            onClick={() =>
              setThemeMode((prev) =>
                prev === 'soft-light' ? 'soft-dark' : 'soft-light'
              )
            }
            className="min-h-[34px] sm:min-h-[36px] px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] sm:text-xs font-semibold text-slate-200 flex items-center gap-1 transition-colors"
          >
            {themeMode === 'soft-light' ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="hidden sm:inline">Jasny</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span className="hidden sm:inline">Ciemny</span>
              </>
            )}
          </button>

          <button
            onClick={() => setIsFastSwitcherOpen(true)}
            className="min-h-[34px] sm:min-h-[36px] px-2.5 sm:px-3.5 py-1 sm:py-1.5 text-[11px] sm:text-xs font-bold text-slate-950 bg-emerald-500 hover:bg-emerald-400 rounded-xl transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 shadow-sm"
            title="Szybki Przełącznik Zawodników (Google OAuth + Firebase + Google Fit)"
          >
            {googleUser?.photoURL ? (
              <img
                src={googleUser.photoURL}
                alt={activeProfile.name}
                className="w-4 h-4 rounded-full border border-slate-950 shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : (
              <Users className="w-3.5 h-3.5 shrink-0" />
            )}
            <span className="truncate max-w-[115px] sm:max-w-[175px]">
              {activeProfile.name} ({activeProfile.ftpWatts}W)
            </span>
          </button>
        </div>
      </header>
      )}

      {/* TOP STATUS BANNERS */}
      {activeTab !== 'cockpit' && (
        <div className="max-w-7xl w-full mx-auto px-3 sm:px-8 pt-2.5 space-y-2 min-w-0">
          {!googleUser && isOnline && (
            <div className="rounded-2xl bg-emerald-500/15 border border-emerald-500/40 px-3.5 sm:px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 min-w-0">
              <div className="flex items-start sm:items-center gap-2.5 text-xs text-slate-200 min-w-0">
                <Cloud className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5 sm:mt-0" />
                <span className="break-words">
                  <strong>Centralny Firebase & Google Fit:</strong> Zaloguj się
                  swoim kontem Google, aby synchronizować profil, plany i pliki{' '}
                  <code className="font-mono-tabular">.FIT</code> ze wspólną bazą
                  Firebase oraz wysyłać treningi do <strong>Google Fit</strong>.
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setIsFastSwitcherOpen(true)}
                  className="w-full sm:w-auto min-h-[36px] px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Users className="w-3.5 h-3.5 shrink-0" />
                  <span>Wybierz / Zaloguj Zawodnika (Google)</span>
                </button>
              </div>
            </div>
          )}

          {!isInstalled && !dismissedInstallBanner && (
            <div className="rounded-2xl bg-sky-500/15 border border-sky-500/40 px-3.5 sm:px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 min-w-0">
              <div className="flex items-start sm:items-center gap-3 min-w-0">
                <div className="p-2 rounded-xl bg-sky-500/20 text-sky-400 shrink-0">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-bold text-white">
                    Zainstaluj Domyos Cycling Hub jako aplikację w telefonie (PWA Offline-First)
                  </div>
                  <p className="text-[11px] text-slate-300 mt-0.5 break-words">
                    Po zainstalowaniu aplikacja działa na pełnym ekranie, obsługuje tryb Offline i automatycznie aktualizuje się przy starcie.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                <button
                  onClick={handleInstallPwaClick}
                  className="flex-1 sm:flex-initial min-h-[38px] px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                >
                  <Smartphone className="w-4 h-4 shrink-0" />
                  <span className="truncate">
                    {isInstallable
                      ? 'Zainstaluj Aplikację Teraz'
                      : 'Jak Zainstalować na Telefonie'}
                  </span>
                </button>
                <button
                  onClick={() => setDismissedInstallBanner(true)}
                  className="p-2 rounded-lg text-slate-400 hover:text-white shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {!isOnline && (
            <div className="rounded-2xl bg-amber-500/15 border border-amber-500/40 px-3.5 sm:px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 min-w-0">
              <div className="flex items-start sm:items-center gap-2.5 text-xs text-amber-300 min-w-0">
                <WifiOff className="w-4 h-4 text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
                <span className="break-words">
                  <strong>Tryb Offline Aktywny (WiFi wyłączone):</strong> Bluetooth FTMS, zegar treningowy i zapis plików <code className="font-mono-tabular">.FIT</code> w pamięci OPFS działają w 100% lokalnie. Zakończone jazdy wyślą się automatycznie do Firebase, Google Fit i Intervals.icu po włączeniu WiFi.
                </span>
              </div>
            </div>
          )}

          {isOnline && pendingFirebaseActivities.length > 0 && (
            <div className="rounded-2xl bg-emerald-500/15 border border-emerald-500/40 px-3.5 sm:px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 min-w-0">
              <div className="flex items-center gap-2.5 text-xs text-slate-200 min-w-0">
                <Wifi className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="break-words">
                  <strong>Połączenie WiFi aktywne:</strong> Masz{' '}
                  <strong className="text-emerald-400">
                    {pendingFirebaseActivities.length} oczekujące pliki .FIT
                  </strong>{' '}
                  zapisane offline w pamięci OPFS.
                </span>
              </div>
              <button
                onClick={handleFlushPendingSync}
                disabled={isSyncingFirebase}
                className="w-full sm:w-auto min-h-[36px] px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shrink-0"
              >
                <CloudUpload className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {isSyncingFirebase
                    ? 'Wysyłanie .FIT...'
                    : `Zsynchronizuj z Firebase (${pendingFirebaseActivities.length})`}
                </span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* FAST USER SWITCHER MODAL (MULTI-USER GOOGLE OAUTH) */}
      <FastUserSwitcherModal
        isOpen={isFastSwitcherOpen}
        onClose={() => setIsFastSwitcherOpen(false)}
        profiles={profiles}
        activeProfile={activeProfile}
        googleUser={googleUser}
        knownRiders={knownRiders}
        onSelectAndSwitchRider={handleSelectAndSwitchRider}
        onAddNewGoogleRider={handleAddNewGoogleRider}
        onRefreshGoogleFitToken={handleRefreshGoogleFitToken}
        onSignOutGoogle={handleGoogleLogout}
        onGoToProfileSettings={(pid) => {
          setActiveProfileId(pid);
          setActiveTab('profiles');
        }}
      />

      {/* PWA INSTALL GUIDE MODAL */}
      {isPwaInstallGuideOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-3xl bg-[#131B26] border border-sky-500/40 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5 text-sky-400">
                <Smartphone className="w-6 h-6" />
                <h2 className="text-base sm:text-lg font-bold text-white">
                  Instalacja Aplikacji PWA na Telefonie
                </h2>
              </div>
              <button
                onClick={() => setIsPwaInstallGuideOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isInIframe && (
              <div className="rounded-xl bg-amber-500/15 border border-amber-500/40 p-3.5 text-xs text-amber-200 leading-relaxed">
                <strong>Uwaga (Podgląd w ramce AI Studio):</strong> Gdy otworzysz aplikację bezpośrednio z <strong>GitHub Pages</strong> w przeglądarce w telefonie, przycisk <strong>„Zainstaluj Apkę”</strong> uruchomi od razu systemowy instalator Androida!
              </div>
            )}

            <div className="rounded-xl bg-[#0B0F17] border border-sky-500/40 p-3.5 space-y-2.5 text-xs">
              <div className="font-bold text-white flex items-center justify-between gap-2">
                <span>Bezpośredni link do Twojego GitHub Pages:</span>
                <span className="text-[11px] font-mono-tabular text-emerald-400">
                  PWA Ready
                </span>
              </div>
              <a
                href={getGitHubPagesInstallUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="block font-mono-tabular text-xs font-bold text-sky-400 hover:underline break-all"
              >
                {getGitHubPagesInstallUrl()}
              </a>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <a
                  href={getGitHubPagesInstallUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[38px] px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                  <span>Otwórz GitHub Pages w Nowej Karcie</span>
                </a>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(getGitHubPagesInstallUrl());
                      setToastMessage('Skopiowano link GitHub Pages do schowka!');
                    } catch {
                      // ignore
                    }
                  }}
                  className="min-h-[38px] px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs transition-colors"
                >
                  Kopiuj Link
                </button>
              </div>
            </div>

            <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
              <div className="rounded-xl bg-[#0B0F17] border border-slate-800 p-3.5 space-y-1.5">
                <div className="font-bold text-emerald-400">
                  1. Telefon Android (Chrome / Edge / Brave):
                </div>
                <p>
                  Otwórz powyższy adres aplikacji z GitHub Pages w Chrome na telefonie → kliknij przycisk <strong>„Zainstaluj Apkę”</strong> na górnym pasku (lub menu przeglądarki <code className="font-mono-tabular">⋮</code> → <strong>„Zainstaluj aplikację”</strong>).
                </p>
              </div>

              {isIOS || true ? (
                <div className="rounded-xl bg-[#0B0F17] border border-slate-800 p-3.5 space-y-1.5">
                  <div className="font-bold text-sky-400">
                    2. iPhone / iPad (Safari):
                  </div>
                  <p>
                    Stuknij ikonę <strong>Udostępnij</strong> na dolnym pasku Safari → wybierz <strong>„Dodaj do ekranu początkowego”</strong>.
                  </p>
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setIsPwaInstallGuideOpen(false)}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-colors"
              >
                Rozumiem
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-20 md:bottom-6 right-4 z-50 max-w-sm rounded-xl bg-[#131B26] border border-emerald-500/60 px-4 py-3 text-xs font-medium text-white shadow-2xl flex items-center justify-between gap-3">
          <span>{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* MAIN WORKSPACE CONTENT */}
      <main
        className={`flex-1 max-w-7xl w-full mx-auto px-3 sm:px-8 ${
          activeTab === 'cockpit'
            ? 'pt-2 pb-16 md:pb-2 overflow-hidden'
            : 'pt-4 pb-20 md:pb-8'
        }`}
      >
        {activeTab === 'cockpit' && (
          <LiveCockpitView
            profile={activeProfile}
            workout={currentWorkout}
            telemetry={telemetry}
            isRunning={isRunning}
            isPaused={isPaused}
            elapsedWorkoutSec={elapsedWorkoutSec}
            currentBlockIndex={currentBlockIndex}
            elapsedInBlockSec={elapsedInBlockSec}
            liveRecords={liveRecords}
            soundEnabled={soundEnabled}
            wakeLockActive={wakeLockActive}
            use3sPowerSmoothing={use3sPowerSmoothing}
            onToggle3sSmoothing={() => setUse3sPowerSmoothing((v) => !v)}
            onStartOrResume={handleStartOrResume}
            onPause={handlePause}
            onStopAndFinish={handleStopAndFinish}
            onPrevBlock={() => handleJumpToBlock(currentBlockIndex - 1)}
            onNextBlock={() => handleJumpToBlock(currentBlockIndex + 1)}
            onJumpToBlock={handleJumpToBlock}
            onChangeBias={handleChangeBias}
            onResetBias={() => handleChangeBias(100 - telemetry.biasPercent)}
            onChangeMode={(m) => ftmsController.setControlMode(m)}
            onChangeResistance={(delta) =>
              ftmsController.setManualResistanceLevel(
                telemetry.targetResistanceLevel + delta
              )
            }
            onToggleSound={() => {
              const next = !soundEnabled;
              setSoundEnabled(next);
              audioAndWakeLock.setSoundEnabled(next);
            }}
            onConnectDomyos={async () => {
              const res = await ftmsController.connectDomyosBle();
              showToast(res.message);
            }}
            onToggleSimulator={() => {
              if (telemetry.isSimulator) {
                ftmsController.stopSimulator();
                ftmsController.disconnectBle();
                showToast('Wyłączono symulator FTMS.');
              } else {
                ftmsController.startSimulator();
                showToast('Włączono symulator roweru Domyos Challenge Bike.');
              }
            }}
            onConnectExternalPower={async () => {
              const res = await ftmsController.connectExternalPowerMeter();
              showToast(res.message);
            }}
            onConnectExternalHrStrap={async () => {
              const res = await ftmsController.connectExternalHeartRateStrap();
              showToast(res.message);
            }}
            onDisconnectExternalHrStrap={() => {
              ftmsController.disconnectExternalHeartRateStrap();
              showToast('Rozłączono zewnętrzny pas tętna BLE.');
            }}
            onNotifyToast={showToast}
            onBackToWorkouts={() => {
              setIsFocusHudMode(false);
              setActiveTab('workouts');
            }}
            onExtendCurrentBlockSec={(deltaSec) => {
              setElapsedInBlockSec((prev) => Math.max(0, prev - deltaSec));
              showToast(`Wydłużono aktualny odcinek o +${deltaSec} sekund.`);
            }}
            isFocusHudMode={isFocusHudMode}
            onToggleFocusHudMode={() => setIsFocusHudMode((v) => !v)}
            autoShowFinishConfirm={autoShowFinishConfirm}
            onDismissAutoFinishConfirm={() => setAutoShowFinishConfirm(false)}
          />
        )}

        {activeTab === 'workouts' && (
          <WorkoutsAndRampBuilderView
            activeProfile={activeProfile}
            profiles={profiles}
            workouts={workouts}
            availableTags={workoutTags}
            selectedWorkoutId={currentWorkout.id}
            latestTsb={latestTsb}
            lastCompletedActivity={lastProfileActivity}
            isSyncingIntervals={isSyncingIntervals}
            isSyncingFirebase={isSyncingFirebase}
            onSelectAndLoadWorkout={(w, startNow) => {
              setSelectedWorkoutId(w.id);
              setCurrentBlockIndex(0);
              setElapsedInBlockSec(0);
              setAutoShowFinishConfirm(false);
              setActiveTab('cockpit');
              if (startNow) {
                const firstBlock = w.blocks[0];
                if (firstBlock) {
                  const { targetWatts, targetResistance } =
                    calculateBlockInstantTarget(
                      firstBlock,
                      0,
                      activeProfile.ftpWatts,
                      telemetry.biasPercent
                    );
                  ftmsController.applyTargetLoad(
                    targetWatts,
                    targetResistance,
                    true
                  );
                }
              }
            }}
            onSaveWorkout={async (newW) => {
              setWorkouts((prev) => {
                const exists = prev.some((item) => item.id === newW.id);
                return exists
                  ? prev.map((item) => (item.id === newW.id ? newW : item))
                  : [newW, ...prev];
              });
              setSelectedWorkoutId(newW.id);

              await saveWorkoutTxtToLocalOpfs(newW);
              if (googleUser) {
                savePlannedWorkoutToFirestore(newW).catch(() => {});
                showToast(
                  `Zapisano trening „${newW.name}” w centralnym Firebase Firestore oraz w lokalnym OPFS!`
                );
              } else {
                showToast(
                  `Zapisano trening „${newW.name}” w pamięci OPFS (/Workouts_Library/${newW.profileId})!`
                );
              }
            }}
            onDeleteWorkout={(id) => {
              if (workouts.length <= 1) return;
              const targetW = workouts.find((w) => w.id === id);
              if (targetW) {
                deleteWorkoutTxtFromLocalOpfs(targetW).catch(() => {});
                deletePlannedWorkoutFromFirestore(id).catch(() => {});
              }
              setWorkouts((prev) => prev.filter((w) => w.id !== id));
              showToast('Usunięto trening z biblioteki, OPFS i Firebase.');
            }}
            onSyncFromIntervalsIcu={handleSyncFromIntervalsIcu}
            onSyncWithFirebase={handleSyncAllToFirebase}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsAndProgressView
            profile={activeProfile}
            activities={activities}
            wellnessSeries={computedWellnessSeries}
            isLoadingWellness={isSyncingIntervals}
            onRefreshIntervalsWellness={handleRefreshIntervalsWellness}
            onDownloadFit={handleDownloadHydratedFit}
            onDownloadTcx={handleDownloadHydratedTcx}
            onUploadToFirebase={handleUploadSingleActivityToFirebase}
            onUploadToGoogleFit={handleUploadSingleActivityToGoogleFit}
            onUploadToIntervals={handleUploadActivityToIntervals}
            onDeleteActivity={handleDeleteCompletedActivity}
            googleFitErrorInfo={googleFitErrorInfo}
            onDismissGoogleFitError={() => setGoogleFitErrorInfo(null)}
            onToggleGoogleFitEnabled={handleToggleGoogleFitEnabled}
          />
        )}

        {activeTab === 'profiles' && (
          <AthleteProfilesView
            activeProfile={activeProfile}
            activities={activities}
            onUpdateProfile={(id, updated) => {
              setProfiles({ [id]: updated });
              saveProfileToFirestore(updated).catch(() => {});
            }}
            isSyncingIntervals={isSyncingIntervals}
            onSyncFromIntervalsIcu={handleSyncFromIntervalsIcu}
            onOpenFastUserSwitcher={() => setIsFastSwitcherOpen(true)}
            onRefreshGoogleFitToken={handleRefreshGoogleFitToken}
            onNotifyToast={showToast}
          />
        )}

        {activeTab === 'settings' && (
          <ProfilesAndCloudSettingsView
            themeMode={themeMode}
            onChangeThemeMode={(mode) => setThemeMode(mode)}
            profiles={profiles}
            workouts={workouts}
            activities={activities}
            activeProfileId={activeProfile.id}
            googleUser={googleUser}
            isSyncingFirebase={isSyncingFirebase}
            pendingFirebaseActivities={pendingFirebaseActivities}
            onFlushPendingSync={handleFlushPendingSync}
            isPwaInstallable={isInstallable}
            isPwaInstalled={isInstalled}
            onInstallPwa={install}
            onOpenFastUserSwitcher={() => setIsFastSwitcherOpen(true)}
            onGoogleLogin={handleAddNewGoogleRider}
            onGoogleLogout={handleGoogleLogout}
            onSyncAllToFirebase={handleSyncAllToFirebase}
            onRestoreFromFirebase={handleRestoreFromFirebase}
            onImportBackupJson={(data) => {
              if (data.profiles) setProfiles(data.profiles);
              if (data.workouts)
                setWorkouts(mergeAndNormalizeWorkoutsLibrary(data.workouts));
              if (data.activities) setActivities(data.activities);
            }}
            onSaveEditedOpfsWorkout={(editedW) => {
              setWorkouts((prev) => {
                const exists = prev.some((item) => item.id === editedW.id);
                return exists
                  ? prev.map((item) => (item.id === editedW.id ? editedW : item))
                  : [editedW, ...prev];
              });
              savePlannedWorkoutToFirestore(editedW).catch(() => {});
            }}
            onNotifyToast={showToast}
            workoutTags={workoutTags}
            onUpdateWorkoutTags={handleUpdateWorkoutTags}
            onEnsureFirestoreCollections={handleEnsureFirestoreCollections}
            collectionsInitialized={collectionsInitialized}
          />
        )}
      </main>

      {/* POST-RIDE COMPLETION & EXPORT MODAL (.FIT / FIREBASE / GOOGLE FIT / INTERVALS.ICU) */}
      {justFinishedActivity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4">
          <div className="w-full max-w-lg rounded-3xl bg-[#131B26] border border-slate-700 p-4 sm:p-6 space-y-4 sm:space-y-5 shadow-2xl min-w-0 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between gap-2 min-w-0">
              <div className="flex items-center gap-2 text-emerald-400 min-w-0">
                <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 shrink-0" />
                <h2 className="text-base sm:text-lg font-bold text-white truncate">
                  Trening Zakończony i Zapisany!
                </h2>
              </div>
              <button
                onClick={() => setJustFinishedActivity(null)}
                className="p-2 rounded-lg text-slate-400 hover:text-white shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs text-slate-300 break-words">
              Profil: <strong className="text-white">{activeProfile.name}</strong> ·{' '}
              <span>{justFinishedActivity.workoutName}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
              <div className="rounded-xl bg-[#0B0F17] border border-slate-800 p-3 min-w-0">
                <div className="text-[11px] text-slate-400">ŚR. MOC / NP</div>
                <div className="font-mono-tabular text-lg sm:text-xl font-bold text-emerald-400 mt-0.5 truncate">
                  {justFinishedActivity.avgPowerWatts}W /{' '}
                  {justFinishedActivity.normalizedPowerWatts}W
                </div>
              </div>
              <div className="rounded-xl bg-[#0B0F17] border border-slate-800 p-3 min-w-0">
                <div className="text-[11px] text-slate-400">ŁADUNEK TSS</div>
                <div className="font-mono-tabular text-lg sm:text-xl font-bold text-amber-400 mt-0.5 truncate">
                  {justFinishedActivity.tss} TSS
                </div>
              </div>
              <div className="rounded-xl bg-[#0B0F17] border border-slate-800 p-3 min-w-0">
                <div className="text-[11px] text-slate-400">CZAS / DYSTANS (700c)</div>
                <div className="font-mono-tabular text-lg sm:text-xl font-bold text-white mt-0.5 truncate">
                  {formatDurationClock(justFinishedActivity.durationSec)} ·{' '}
                  {((justFinishedActivity.totalDistanceMeters || 0) / 1000).toFixed(2)} km
                </div>
              </div>
            </div>

            {googleFitErrorInfo && (
              <div className="rounded-2xl bg-rose-950/35 border border-rose-500/60 p-3.5 space-y-2.5 text-xs">
                <div className="flex items-start gap-2 text-rose-300 font-bold">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>
                    Google Fitness API jest wyłączone w projekcie GCP (
                    {googleFitErrorInfo.projectNumber || '782546220198'})
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={
                      googleFitErrorInfo.enableApiUrl ||
                      `https://console.developers.google.com/apis/api/fitness.googleapis.com/overview?project=${
                        googleFitErrorInfo.projectNumber || '782546220198'
                      }`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[36px] px-3 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-slate-950 font-extrabold text-xs flex items-center gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    <span>Włącz Fitness API w Google Cloud</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => handleToggleGoogleFitEnabled(false)}
                    className="min-h-[36px] px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs"
                  >
                    Wyłącz Google Fit w profilu
                  </button>
                </div>
              </div>
            )}

            {/* AUTOMATIC FTP DETECTOR & 1-CLICK PROFILE UPDATE AFTER TEST WORKOUT */}
            {detectedPostRideFtp && (
              <div className="rounded-2xl bg-emerald-500/15 border border-emerald-500/50 p-3.5 sm:p-4 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-300">
                    <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{detectedPostRideFtp.protocolName}</span>
                  </div>
                  <span className="font-mono-tabular text-xs font-bold text-white">
                    Wyliczone FTP:{' '}
                    <strong className="text-emerald-400 text-sm">
                      {detectedPostRideFtp.estimatedFtpWatts} W
                    </strong>{' '}
                    ({detectedPostRideFtp.deltaWatts >= 0 ? `+${detectedPostRideFtp.deltaWatts}` : detectedPostRideFtp.deltaWatts}W)
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 font-mono-tabular">
                  {detectedPostRideFtp.sourceDetail} · Dotychczasowe FTP profilu: {activeProfile.ftpWatts} W
                </p>
                {detectedPostRideFtp.estimatedFtpWatts !== activeProfile.ftpWatts ? (
                  <button
                    type="button"
                    onClick={() =>
                      handleApplyDetectedFtp(detectedPostRideFtp.estimatedFtpWatts)
                    }
                    className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-2 transition-colors shadow-sm"
                  >
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>
                      Zaktualizuj moje FTP na {detectedPostRideFtp.estimatedFtpWatts} W jednym kliknięciem
                    </span>
                  </button>
                ) : (
                  <div className="text-[11px] font-bold text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Profil ma już ustawione FTP = {activeProfile.ftpWatts} W (7 stref mocy przeliczonych)</span>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2.5 pt-1">
              <button
                onClick={() => downloadActivityFitFile(justFinishedActivity)}
                className="w-full min-h-[48px] px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <Download className="w-4 h-4 shrink-0" />
                <span className="truncate">
                  Pobierz Binarny Plik .FIT (Garmin / Strava)
                </span>
              </button>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  onClick={() =>
                    handleUploadSingleActivityToFirebase(justFinishedActivity)
                  }
                  className="min-h-[44px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
                >
                  <CloudUpload className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="truncate">
                    {justFinishedActivity.syncedToFirebase
                      ? 'Zapisano w Firebase (.FIT)'
                      : 'Wyślij do Firebase Cloud'}
                  </span>
                </button>

                {activeProfile.googleFit?.enabled !== false && (
                  <button
                    onClick={() =>
                      handleUploadSingleActivityToGoogleFit(justFinishedActivity)
                    }
                    className="min-h-[44px] px-3 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
                  >
                    <Activity className="w-4 h-4 shrink-0" />
                    <span className="truncate">
                      {justFinishedActivity.syncedToGoogleFit
                        ? 'Wysłano do Google Fit ✓'
                        : 'Wyślij do Google Fit'}
                    </span>
                  </button>
                )}

                {activeProfile.intervals.enabled && (
                  <button
                    onClick={() =>
                      handleUploadActivityToIntervals(justFinishedActivity)
                    }
                    className="sm:col-span-2 min-h-[44px] px-3 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-300 font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
                  >
                    <span className="truncate">
                      {justFinishedActivity.syncedToIntervals
                        ? 'Wysłano do Intervals.icu (Zapisano w Firebase) ✓'
                        : 'Wyślij do Intervals.icu'}
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FIXED BOTTOM NAVIGATION BAR FOR MOBILE THUMB ERGONOMICS (HIDDEN IN ZEN FOCUS HUD MODE) */}
      {!(activeTab === 'cockpit' && isFocusHudMode) && (
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0B0F17]/95 backdrop-blur-md border-t border-slate-800 grid grid-cols-5 items-center h-14 px-1">
        <button
          onClick={() => setActiveTab('workouts')}
          className={`min-h-[44px] min-w-0 px-0.5 flex flex-col items-center justify-center ${
            activeTab === 'workouts' ? 'text-emerald-400' : 'text-slate-400'
          }`}
        >
          <Calendar className="w-4 h-4 shrink-0" />
          <span className="text-[10px] font-semibold mt-0.5 truncate max-w-full">
            1. Treningi
          </span>
        </button>

        <button
          onClick={() => setActiveTab('cockpit')}
          className={`min-h-[44px] min-w-0 px-0.5 flex flex-col items-center justify-center ${
            activeTab === 'cockpit' ? 'text-emerald-400' : 'text-slate-400'
          }`}
        >
          <Gauge className="w-4 h-4 shrink-0" />
          <span className="text-[10px] font-semibold mt-0.5 truncate max-w-full">
            2. Kokpit
          </span>
        </button>

        <button
          onClick={() => setActiveTab('analytics')}
          className={`min-h-[44px] min-w-0 px-0.5 flex flex-col items-center justify-center ${
            activeTab === 'analytics' ? 'text-emerald-400' : 'text-slate-400'
          }`}
        >
          <TrendingUp className="w-4 h-4 shrink-0" />
          <span className="text-[10px] font-semibold mt-0.5 truncate max-w-full">
            3. Postępy
          </span>
        </button>

        <button
          onClick={() => setActiveTab('profiles')}
          className={`min-h-[44px] min-w-0 px-0.5 flex flex-col items-center justify-center ${
            activeTab === 'profiles' ? 'text-emerald-400' : 'text-slate-400'
          }`}
        >
          <Users className="w-4 h-4 shrink-0" />
          <span className="text-[10px] font-semibold mt-0.5 truncate max-w-full">
            4. Profile
          </span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`min-h-[44px] min-w-0 px-0.5 flex flex-col items-center justify-center ${
            activeTab === 'settings' ? 'text-emerald-400' : 'text-slate-400'
          }`}
        >
          <Sliders className="w-4 h-4 shrink-0" />
          <span className="text-[10px] font-semibold mt-0.5 truncate max-w-full">
            5. Firebase
          </span>
        </button>
      </nav>
      )}
    </div>
  );
}
