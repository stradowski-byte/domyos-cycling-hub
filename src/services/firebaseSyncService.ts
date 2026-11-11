import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  getDocs,
  getDoc,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import {
  db,
  auth,
  handleFirestoreError,
  OperationType,
  KNOWN_RIDERS_STORAGE_KEY,
  saveCustomGitHubPagesUrl,
} from '../lib/firebase';
import { recordPrivateAuditLog } from './securityAndAuditLogger';
import {
  AthleteProfile,
  CompletedActivity,
  KnownGoogleRider,
  ProfileId,
  StructuredWorkout,
  TelemetryRecord,
} from '../types/cycling';
import {
  buildCleanActivityFitFileName,
  encodeActivityToFitBase64,
  encodeActivityToFitBlob,
} from './fitEncoder';
import {
  computeDetailedHrBreakdown,
  computeRidePeakPowerAndHr,
  createFallbackRuntimeProfile,
  createNewAthleteProfile,
  DEFAULT_WORKOUT_TAGS,
  getCleanWorkoutTxtFileName,
  inferWorkoutTags,
  mergeAndNormalizeWorkoutsLibrary,
  parseIcuTextFileToWorkout,
  PROFILE_AVATAR_COLORS,
  serializeWorkoutToIcuTextFile,
} from './rampAndPhysiologyEngine';

export const CURRENT_APP_VERSION = '2.4.0';
const LS_OFFLINE_FS_MANIFEST_KEY = 'domyos_offline_fs_manifest_v1';
const LS_PROFILES_KEY = 'domyos_hub_google_profile_v2';
export const LS_WORKOUT_TAGS_KEY = 'domyos_hub_workout_tags_v1';
export const LS_PENDING_SYNC_QUEUE_KEY = 'domyos_hub_pending_sync_queue_v1';

/** Firebase Spark (Free Tier) Cloud Firestore total stored data limit: 1 GiB = 1024 MB */
export const FIREBASE_SPARK_LIMIT_MB = 1024;
export const FIREBASE_SPARK_LIMIT_BYTES = 1024 * 1024 * 1024;

export interface FirestoreSparkStorageSummary {
  usedBytes: number;
  usedMb: number;
  limitMb: number;
  remainingMb: number;
  usedPercent: number;
  collectionsInitialized: boolean;
}

export interface QueuedFirestoreMutation {
  key: string; // e.g. 'plannedWorkouts/w_123'
  collectionName: 'hubConfig' | 'profiles' | 'plannedWorkouts' | 'completedWorkouts';
  docId: string;
  op: 'set' | 'delete';
  payload?: Record<string, unknown>;
  queuedAtIso: string;
}

export function getOfflineSyncQueue(): QueuedFirestoreMutation[] {
  try {
    const raw = localStorage.getItem(LS_PENDING_SYNC_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveOfflineSyncQueue(queue: QueuedFirestoreMutation[]): void {
  try {
    localStorage.setItem(LS_PENDING_SYNC_QUEUE_KEY, JSON.stringify(queue.slice(-250)));
  } catch {
    // ignore storage quota errors
  }
}

export function getPendingSyncQueueCount(): number {
  return getOfflineSyncQueue().length;
}

export function enqueueOfflineFirestoreMutation(
  mutation: Omit<QueuedFirestoreMutation, 'key' | 'queuedAtIso'>
): void {
  const key = `${mutation.collectionName}/${mutation.docId}`;
  const current = getOfflineSyncQueue().filter((item) => item.key !== key);
  current.push({
    ...mutation,
    key,
    queuedAtIso: new Date().toISOString(),
  });
  saveOfflineSyncQueue(current);
}

/**
 * Flushes all queued Offline-First mutations to Firebase Firestore using atomic `writeBatch`
 * chunks (max 400 operations per batch) to minimize network round-trips and Spark quota usage.
 */
export async function flushOfflineSyncQueueWithBatch(): Promise<number> {
  if (!db || !auth?.currentUser) return 0;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 0;

  const queue = getOfflineSyncQueue();
  if (queue.length === 0) return 0;

  let flushedCount = 0;
  const chunkSize = 400;
  const currentUid = auth.currentUser.uid;

  try {
    for (let i = 0; i < queue.length; i += chunkSize) {
      const chunk = queue.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      for (const item of chunk) {
        const ref = doc(db, item.collectionName, item.docId);
        if (item.op === 'delete') {
          batch.delete(ref);
        } else if (item.payload) {
          const enrichedPayload =
            item.collectionName === 'hubConfig'
              ? item.payload
              : {
                  ...item.payload,
                  uid: currentUid,
                  ownerUid: currentUid,
                };
          batch.set(ref, enrichedPayload, { merge: true });
        }
      }
      await batch.commit();
      flushedCount += chunk.length;
    }
    saveOfflineSyncQueue([]);
    return flushedCount;
  } catch (err) {
    recordPrivateAuditLog(
      'WARN',
      'FIRESTORE',
      'Wstrzymano opróżnianie kolejki Offline Sync (oczekiwanie na połączenie)',
      err instanceof Error ? err.message : String(err)
    );
    return flushedCount;
  }
}

export function normalizeTagList(customTags?: string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const defTag of DEFAULT_WORKOUT_TAGS) {
    const clean = defTag.trim();
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      ordered.push(clean);
    }
  }

  for (const raw of customTags || []) {
    if (typeof raw !== 'string') continue;
    const clean = raw.trim();
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      ordered.push(clean);
    }
  }

  return ordered;
}

export function getSavedWorkoutTags(): string[] {
  try {
    const raw = localStorage.getItem(LS_WORKOUT_TAGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return normalizeTagList(parsed);
      }
    }
  } catch {
    // fallback
  }
  return [...DEFAULT_WORKOUT_TAGS];
}

export function saveWorkoutTagsLocally(tags: string[]): string[] {
  const normalized = normalizeTagList(tags);
  try {
    localStorage.setItem(LS_WORKOUT_TAGS_KEY, JSON.stringify(normalized));
  } catch {
    // ignore
  }
  return normalized;
}

export async function saveWorkoutTagsToFirestore(tags: string[]): Promise<string[]> {
  const normalized = saveWorkoutTagsLocally(tags);
  const payload = {
    updatedAtIso: new Date().toISOString(),
    workoutTags: normalized,
  };

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    enqueueOfflineFirestoreMutation({
      collectionName: 'hubConfig',
      docId: 'default',
      op: 'set',
      payload,
    });
    return normalized;
  }

  if (!db || !auth?.currentUser) return normalized;
  const path = 'hubConfig/default';
  try {
    await setDoc(doc(db, 'hubConfig', 'default'), payload, { merge: true });
  } catch (err) {
    enqueueOfflineFirestoreMutation({
      collectionName: 'hubConfig',
      docId: 'default',
      op: 'set',
      payload,
    });
    handleFirestoreError(err, OperationType.WRITE, path);
  }
  return normalized;
}

/**
 * Estimates the current Firebase Cloud Firestore storage usage against the 1024 MB (1 GiB)
 * Firebase Spark Free Plan limit.
 */
export function estimateFirestoreSparkStorage(params: {
  profiles: Record<ProfileId, AthleteProfile>;
  workouts: StructuredWorkout[];
  activities: CompletedActivity[];
  tags: string[];
  collectionsInitialized?: boolean;
}): FirestoreSparkStorageSummary {
  const encoder =
    typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
  const byteSizeOf = (obj: unknown): number => {
    try {
      const str = JSON.stringify(obj) || '';
      return encoder ? encoder.encode(str).length : str.length * 2;
    } catch {
      return 0;
    }
  };

  // Firestore document & index overhead multiplier (~1.35x raw JSON + Base64 .FIT payload)
  const profilesBytes = byteSizeOf(params.profiles) * 1.35;
  const workoutsBytes = byteSizeOf(params.workouts) * 1.35;
  const hubConfigBytes = byteSizeOf({ workoutTags: params.tags }) * 1.35 + 2048;

  let activitiesBytes = 0;
  for (const act of params.activities || []) {
    const baseBytes = byteSizeOf(act);
    // If fitBase64 is not hydrated in memory yet, estimate ~35 KB per hour of 1Hz FIT + downsampled telemetry
    const estimatedFitAndTelemetryOverlay = act.fitBase64
      ? 0
      : Math.max(8192, Math.round((act.durationSec || 1800) * 18));
    activitiesBytes += (baseBytes + estimatedFitAndTelemetryOverlay) * 1.35;
  }

  const usedBytes = Math.round(
    profilesBytes + workoutsBytes + activitiesBytes + hubConfigBytes
  );
  const usedMb = Number((usedBytes / (1024 * 1024)).toFixed(2));
  const remainingMb = Number(
    Math.max(0, FIREBASE_SPARK_LIMIT_MB - usedMb).toFixed(2)
  );
  const usedPercent = Math.min(
    100,
    Number(((usedMb / FIREBASE_SPARK_LIMIT_MB) * 100).toFixed(3))
  );

  return {
    usedBytes,
    usedMb,
    limitMb: FIREBASE_SPARK_LIMIT_MB,
    remainingMb,
    usedPercent,
    collectionsInitialized: Boolean(params.collectionsInitialized),
  };
}

export interface OfflineDirectoryManifest {
  initialized: boolean;
  initializedAtIso: string;
  rootFolderName: string;
  foldersCreated: string[];
  cloudConnected: boolean;
  installedEngineVersion: string;
  lastUpdateCheckIso?: string;
}

export interface LocalOpfsFileEntry {
  path: string;
  folderBranch: string;
  ownerFolder: ProfileId | 'shared' | 'engine';
  name: string;
  sizeBytes: number;
  lastModified: number;
  kind: 'txt' | 'fit' | 'json' | 'html';
}

// ============================================================================
// 1. KNOWN GOOGLE RIDERS ROSTER (FAST USER SWITCHER)
// ============================================================================

export function getKnownGoogleRiders(): KnownGoogleRider[] {
  try {
    const raw = localStorage.getItem(KNOWN_RIDERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveKnownGoogleRiders(riders: KnownGoogleRider[]): void {
  try {
    localStorage.setItem(KNOWN_RIDERS_STORAGE_KEY, JSON.stringify(riders));
  } catch {
    // ignore
  }
}

export function upsertKnownGoogleRider(rider: KnownGoogleRider): KnownGoogleRider[] {
  const current = getKnownGoogleRiders();
  const idx = current.findIndex(
    (r) => r.uid === rider.uid || (r.email && r.email === rider.email)
  );
  const next = [...current];
  if (idx >= 0) {
    next[idx] = { ...next[idx], ...rider, lastLoginIso: new Date().toISOString() };
  } else {
    next.unshift({ ...rider, lastLoginIso: new Date().toISOString() });
  }
  saveKnownGoogleRiders(next);
  return next;
}

/**
 * Purges any legacy unauthenticated or default profiles so only Google OAuth profiles exist.
 */
export function filterGoogleAuthenticatedProfiles(
  rawProfiles: Record<ProfileId, AthleteProfile>
): Record<ProfileId, AthleteProfile> {
  const cleaned: Record<ProfileId, AthleteProfile> = {};
  for (const [key, prof] of Object.entries(rawProfiles || {})) {
    if (prof && (prof.uid || prof.email) && key !== 'default') {
      cleaned[key] = prof;
    }
  }
  return cleaned;
}

/**
 * Resolves or creates an AthleteProfile strictly for an authenticated Google User.
 * Zero pre-created or anonymous profiles are allowed.
 */
export function resolveOrCreateProfileForGoogleUser(
  user: User,
  existingProfiles: Record<ProfileId, AthleteProfile>
): {
  profile: AthleteProfile;
  updatedProfiles: Record<ProfileId, AthleteProfile>;
  isNew: boolean;
} {
  const googleOnlyProfiles = filterGoogleAuthenticatedProfiles(existingProfiles);
  const email = (user.email || '').toLowerCase();
  const displayName =
    user.displayName?.trim() ||
    (email ? email.split('@')[0] : 'Zawodnik Google');

  // 1. Match existing Google-authenticated profile by uid or email
  const existingList = Object.values(googleOnlyProfiles);
  const matchedByUidOrEmail = existingList.find(
    (p) =>
      (p.uid && p.uid === user.uid) ||
      (p.email && p.email.toLowerCase() === email)
  );

  if (matchedByUidOrEmail) {
    const updated: AthleteProfile = {
      ...matchedByUidOrEmail,
      uid: user.uid,
      email: user.email || matchedByUidOrEmail.email,
      photoURL: user.photoURL || matchedByUidOrEmail.photoURL,
      googleFit: matchedByUidOrEmail.googleFit || {
        enabled: true,
        autoUploadActivities: true,
      },
      updatedAtIso: new Date().toISOString(),
    };
    return {
      profile: updated,
      updatedProfiles: { [updated.id]: updated },
      isNew: false,
    };
  }

  // 2. Create a brand new profile strictly for this authenticated Google account
  const created = createNewAthleteProfile({
    name: displayName,
    subtitle: 'Konto Google + Firebase + Google Fit & Intervals.icu',
    avatarColor: PROFILE_AVATAR_COLORS[0],
    ftpWatts: 200,
    weightKg: 75,
    maxHrBpm: 188,
    existingIds: [],
  });

  const enriched: AthleteProfile = {
    ...created,
    uid: user.uid,
    email: user.email || '',
    photoURL: user.photoURL || undefined,
    googleFit: {
      enabled: true,
      autoUploadActivities: true,
    },
    updatedAtIso: new Date().toISOString(),
  };

  return {
    profile: enriched,
    updatedProfiles: {
      [enriched.id]: enriched,
    },
    isNew: true,
  };
}

// ============================================================================
// 2. FIREBASE CLOUD FIRESTORE REAL-TIME SYNC, NON-DESTRUCTIVE BOOTSTRAP & CRUD
// ============================================================================

function sanitizeForFirestore<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Checks whether all required Firestore collections (`hubConfig`, `profiles`,
 * `plannedWorkouts`, `completedWorkouts`) exist after login and initializes any missing
 * documents/collections in a single atomic `writeBatch` without EVER deleting or overwriting
 * existing user data.
 */
export async function ensureFirestoreCollectionsInitialized(params: {
  profile: AthleteProfile;
  workouts: StructuredWorkout[];
  tags: string[];
}): Promise<{
  initializedCollections: string[];
  mergedTags: string[];
  mergedWorkouts: StructuredWorkout[];
}> {
  if (!db || !auth?.currentUser) {
    return {
      initializedCollections: [],
      mergedTags: normalizeTagList(params.tags),
      mergedWorkouts: mergeAndNormalizeWorkoutsLibrary(params.workouts),
    };
  }

  const initializedCollections: string[] = [];
  const currentUid = auth.currentUser.uid;

  try {
    // First flush any queued offline mutations
    await flushOfflineSyncQueueWithBatch();

    const hubDocRef = doc(db, 'hubConfig', 'default');
    const profDocRef = doc(db, 'profiles', params.profile.id);

    const [hubSnap, profSnap, ownedWorkSnap, sharedWorkSnap] = await Promise.all([
      getDoc(hubDocRef),
      getDoc(profDocRef),
      getDocs(
        query(
          collection(db, 'plannedWorkouts'),
          where('ownerUid', '==', currentUid)
        )
      ),
      getDocs(
        query(
          collection(db, 'plannedWorkouts'),
          where('profileId', '==', 'shared')
        )
      ),
    ]);

    const existingCloudTags =
      hubSnap.exists() && Array.isArray(hubSnap.data()?.workoutTags)
        ? (hubSnap.data()?.workoutTags as string[])
        : [];
    const mergedTags = normalizeTagList([...params.tags, ...existingCloudTags]);
    saveWorkoutTagsLocally(mergedTags);

    const existingCloudWorkoutsMap = new Map<string, StructuredWorkout>();
    const collectWorkoutSnap = (snap: typeof ownedWorkSnap) => {
      snap.forEach((d) => {
        const data = d.data() as StructuredWorkout;
        if (data && data.id && Array.isArray(data.blocks)) {
          existingCloudWorkoutsMap.set(data.id, data);
        }
      });
    };
    collectWorkoutSnap(ownedWorkSnap);
    collectWorkoutSnap(sharedWorkSnap);

    const fullNormalizedLibrary = mergeAndNormalizeWorkoutsLibrary([
      ...Array.from(existingCloudWorkoutsMap.values()),
      ...params.workouts,
    ]);

    const batch = writeBatch(db);
    let batchOpsCount = 0;

    // 1. Initialize hubConfig/default if missing or missing workoutTags
    if (!hubSnap.exists() || !Array.isArray(hubSnap.data()?.workoutTags)) {
      batch.set(
        hubDocRef,
        sanitizeForFirestore({
          updatedAtIso: new Date().toISOString(),
          workoutTags: mergedTags,
        }),
        { merge: true }
      );
      batchOpsCount++;
      initializedCollections.push('hubConfig');
    }

    // 2. Initialize profiles/{profile.id} if missing (strictly stamped with uid & ownerUid)
    if (!profSnap.exists()) {
      batch.set(
        profDocRef,
        sanitizeForFirestore({
          ...params.profile,
          uid: currentUid,
          ownerUid: currentUid,
          updatedAtIso: new Date().toISOString(),
        }),
        { merge: true }
      );
      batchOpsCount++;
      initializedCollections.push('profiles');
    }

    // 3. Seed or tag any missing workouts in plannedWorkouts in the same atomic writeBatch
    let addedOrTaggedWorkouts = 0;
    for (const w of fullNormalizedLibrary) {
      const cloudExisting = existingCloudWorkoutsMap.get(w.id);
      if (
        !cloudExisting ||
        !Array.isArray(cloudExisting.tags) ||
        cloudExisting.tags.length === 0
      ) {
        const normalizedTags = inferWorkoutTags(w);
        batch.set(
          doc(db, 'plannedWorkouts', w.id),
          sanitizeForFirestore({
            ...w,
            profileId: w.profileId || 'shared',
            tags: normalizedTags,
            ownerUid: currentUid,
            uid: currentUid,
            updatedAtIso: new Date().toISOString(),
          }),
          { merge: true }
        );
        batchOpsCount++;
        addedOrTaggedWorkouts++;
      }
    }

    if (existingCloudWorkoutsMap.size === 0 || addedOrTaggedWorkouts > 0) {
      initializedCollections.push('plannedWorkouts');
    }

    if (batchOpsCount > 0) {
      await batch.commit();
    }

    initializedCollections.push('completedWorkouts');

    return {
      initializedCollections,
      mergedTags,
      mergedWorkouts: fullNormalizedLibrary,
    };
  } catch (err) {
    recordPrivateAuditLog(
      'WARN',
      'FIRESTORE',
      'Ostrzeżenie podczas inicjalizacji kolekcji Firestore',
      err instanceof Error ? err.message : String(err)
    );
    return {
      initializedCollections,
      mergedTags: normalizeTagList(params.tags),
      mergedWorkouts: mergeAndNormalizeWorkoutsLibrary(params.workouts),
    };
  }
}

export async function saveProfileToFirestore(profile: AthleteProfile): Promise<void> {
  const activeUid = profile.uid || auth?.currentUser?.uid;
  const payload = sanitizeForFirestore({
    ...profile,
    ...(activeUid ? { uid: activeUid, ownerUid: activeUid } : {}),
    updatedAtIso: new Date().toISOString(),
  }) as unknown as Record<string, unknown>;

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    enqueueOfflineFirestoreMutation({
      collectionName: 'profiles',
      docId: profile.id,
      op: 'set',
      payload,
    });
    return;
  }

  if (!db || !auth?.currentUser) return;
  const path = `profiles/${profile.id}`;
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'profiles', profile.id), payload, { merge: true });

    // Also update known riders in hubConfig/default in the same atomic batch
    if (profile.uid || profile.email) {
      const riderEntry: KnownGoogleRider = {
        uid: profile.uid || auth.currentUser.uid,
        profileId: profile.id,
        email: profile.email || auth.currentUser.email || '',
        displayName: profile.name,
        photoURL: profile.photoURL,
        avatarColor: profile.avatarColor,
        ftpWatts: profile.ftpWatts,
        lastLoginIso: new Date().toISOString(),
        googleFitEnabled: Boolean(profile.googleFit?.enabled),
        intervalsEnabled: Boolean(profile.intervals?.enabled),
      };
      const updatedRiders = upsertKnownGoogleRider(riderEntry);
      batch.set(
        doc(db, 'hubConfig', 'default'),
        sanitizeForFirestore({
          updatedAtIso: new Date().toISOString(),
          registeredRiders: updatedRiders,
        }),
        { merge: true }
      );
    }

    await batch.commit();
  } catch (err) {
    enqueueOfflineFirestoreMutation({
      collectionName: 'profiles',
      docId: profile.id,
      op: 'set',
      payload,
    });
    handleFirestoreError(err, OperationType.WRITE, path);
    throw err;
  }
}

export async function deleteProfileFromFirestore(profileId: ProfileId): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    enqueueOfflineFirestoreMutation({
      collectionName: 'profiles',
      docId: profileId,
      op: 'delete',
    });
    return;
  }
  if (!db || !auth?.currentUser) return;
  const path = `profiles/${profileId}`;
  try {
    await deleteDoc(doc(db, 'profiles', profileId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
    throw err;
  }
}

export async function savePlannedWorkoutToFirestore(
  workout: StructuredWorkout
): Promise<void> {
  const normalizedTags = inferWorkoutTags(workout);
  const currentUid = auth?.currentUser?.uid;
  const resolvedOwnerUid =
    currentUid ||
    (workout.ownerUid && workout.ownerUid !== 'offline_user'
      ? workout.ownerUid
      : undefined);

  const payload = sanitizeForFirestore({
    ...workout,
    tags: normalizedTags,
    ...(resolvedOwnerUid ? { ownerUid: resolvedOwnerUid, uid: resolvedOwnerUid } : {}),
    updatedAtIso: new Date().toISOString(),
  }) as unknown as Record<string, unknown>;

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    enqueueOfflineFirestoreMutation({
      collectionName: 'plannedWorkouts',
      docId: workout.id,
      op: 'set',
      payload,
    });
    return;
  }

  if (!db || !auth?.currentUser) return;
  const path = `plannedWorkouts/${workout.id}`;
  try {
    await setDoc(doc(db, 'plannedWorkouts', workout.id), payload, { merge: true });
  } catch (err) {
    enqueueOfflineFirestoreMutation({
      collectionName: 'plannedWorkouts',
      docId: workout.id,
      op: 'set',
      payload,
    });
    handleFirestoreError(err, OperationType.WRITE, path);
    throw err;
  }
}

export async function deletePlannedWorkoutFromFirestore(
  workoutId: string
): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    enqueueOfflineFirestoreMutation({
      collectionName: 'plannedWorkouts',
      docId: workoutId,
      op: 'delete',
    });
    return;
  }
  if (!db || !auth?.currentUser) return;
  const path = `plannedWorkouts/${workoutId}`;
  try {
    await deleteDoc(doc(db, 'plannedWorkouts', workoutId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
    throw err;
  }
}

/**
 * Downsamples 1Hz records to at most `maxPoints` (e.g. 360 points) for the Firestore
 * document JSON array, while encoding the FULL 1Hz binary .FIT file into `fitBase64`
 * so the Firestore document stays well below 1MB and the binary .FIT file is 100% intact.
 */
function downsampleRecordsForFirestore(
  records: TelemetryRecord[],
  maxPoints: number = 360
): TelemetryRecord[] {
  if (!records || records.length <= maxPoints) return records || [];
  const step = Math.ceil(records.length / maxPoints);
  return records.filter((_, idx) => idx % step === 0 || idx === records.length - 1);
}

export async function saveCompletedActivityToFirestore(
  activity: CompletedActivity
): Promise<CompletedActivity> {
  const hydrated = await ensureActivityHasRecords(activity);
  const fitBase64 = activity.fitBase64 || encodeActivityToFitBase64(hydrated);
  const compactRecords = downsampleRecordsForFirestore(hydrated.records, 360);
  const currentUid = auth?.currentUser?.uid;
  const resolvedOwnerUid =
    currentUid ||
    (hydrated.ownerUid && hydrated.ownerUid !== 'offline_user'
      ? hydrated.ownerUid
      : undefined);

  const firestoreDoc: CompletedActivity = sanitizeForFirestore({
    ...hydrated,
    ownerUid: resolvedOwnerUid || 'offline_user',
    ...(resolvedOwnerUid ? { uid: resolvedOwnerUid } : {}),
    ownerEmail: hydrated.ownerEmail || auth?.currentUser?.email || '',
    records: compactRecords,
    fitBase64,
    syncedToFirebase: true,
    pendingFirebaseSync: false,
  });

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    enqueueOfflineFirestoreMutation({
      collectionName: 'completedWorkouts',
      docId: activity.id,
      op: 'set',
      payload: firestoreDoc as unknown as Record<string, unknown>,
    });
    return firestoreDoc;
  }

  if (!db || !auth?.currentUser) {
    throw new Error('Brak aktywnej sesji Google OAuth w Firebase.');
  }
  const path = `completedWorkouts/${activity.id}`;
  try {
    await setDoc(doc(db, 'completedWorkouts', activity.id), firestoreDoc, {
      merge: true,
    });

    return firestoreDoc;
  } catch (err) {
    enqueueOfflineFirestoreMutation({
      collectionName: 'completedWorkouts',
      docId: activity.id,
      op: 'set',
      payload: firestoreDoc as unknown as Record<string, unknown>,
    });
    handleFirestoreError(err, OperationType.WRITE, path);
    throw err;
  }
}

/**
 * Persists external sync status (`syncedToIntervals`, `intervalsActivityId`, `syncedToGoogleFit`, `googleFitSessionId`)
 * directly into the central Firebase Cloud Firestore `/completedWorkouts/{activityId}` document
 * so clearing browser cache or restarting the app never causes duplicate uploads to Intervals.icu or Google Fit.
 */
export async function updateCompletedActivityExternalSyncInFirestore(
  activityId: string,
  patch: {
    syncedToIntervals?: boolean;
    intervalsActivityId?: string;
    syncedToGoogleFit?: boolean;
    googleFitSessionId?: string;
    feelScore1To10?: number;
    feelSymptomTags?: string[];
    feelNotes?: string;
  }
): Promise<void> {
  const payload = sanitizeForFirestore({
    ...patch,
    updatedAtIso: new Date().toISOString(),
  }) as unknown as Record<string, unknown>;

  recordPrivateAuditLog(
    'INFO',
    'FIRESTORE',
    `Zapis statusu synchronizacji zewnętrznej dla treningu ${activityId} w Firebase`,
    JSON.stringify(patch)
  );

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    enqueueOfflineFirestoreMutation({
      collectionName: 'completedWorkouts',
      docId: activityId,
      op: 'set',
      payload,
    });
    return;
  }

  if (!db || !auth?.currentUser) return;
  const path = `completedWorkouts/${activityId}`;
  try {
    await setDoc(doc(db, 'completedWorkouts', activityId), payload, {
      merge: true,
    });
  } catch (err) {
    enqueueOfflineFirestoreMutation({
      collectionName: 'completedWorkouts',
      docId: activityId,
      op: 'set',
      payload,
    });
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

/**
 * Deletes a completed workout activity from local OPFS (.FIT + 1Hz Telemetry_JSON)
 * AND from the central Firebase Cloud Firestore `/completedWorkouts/{activity.id}` collection.
 */
export async function deleteCompletedActivityEverywhere(
  activity: CompletedActivity
): Promise<void> {
  // 1. Remove local OPFS files (.FIT and .json telemetry)
  try {
    const tree = await getOrCreateOpfsTree(undefined, [activity.profileId]);
    if (tree) {
      const fitFileName = buildCleanActivityFitFileName(activity);

      for (const branch of Object.values(tree.userDataDirs)) {
        try {
          await branch.fitDir.removeEntry(fitFileName);
        } catch {
          // ignore if not in this folder
        }
        try {
          await branch.telemetryDir.removeEntry(`${activity.id}.json`);
        } catch {
          // ignore if not in this folder
        }
      }
    }
  } catch {
    // ignore OPFS removal errors
  }

  recordPrivateAuditLog(
    'INFO',
    'FIRESTORE',
    `Usunięto wykonany trening "${activity.workoutName}" (${activity.id}) z OPFS i Firebase`
  );

  // 2. Delete from Firebase Cloud Firestore (or queue deletion if offline)
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    enqueueOfflineFirestoreMutation({
      collectionName: 'completedWorkouts',
      docId: activity.id,
      op: 'delete',
    });
    return;
  }

  if (!db || !auth?.currentUser) return;
  const path = `completedWorkouts/${activity.id}`;
  try {
    await deleteDoc(doc(db, 'completedWorkouts', activity.id));
  } catch (err) {
    enqueueOfflineFirestoreMutation({
      collectionName: 'completedWorkouts',
      docId: activity.id,
      op: 'delete',
    });
    handleFirestoreError(err, OperationType.DELETE, path);
    throw err;
  }
}

export async function syncAllStateToFirestore(params: {
  profiles: Record<ProfileId, AthleteProfile>;
  workouts: StructuredWorkout[];
  activities: CompletedActivity[];
}): Promise<{
  profilesCount: number;
  workoutsCount: number;
  activitiesCount: number;
}> {
  if (!db || !auth?.currentUser) {
    throw new Error('Zaloguj się kontem Google, aby zsynchronizować dane z Firebase.');
  }

  await flushOfflineSyncQueueWithBatch();

  // Commit profiles + plannedWorkouts in a single atomic writeBatch
  const batch = writeBatch(db);
  let profilesCount = 0;
  for (const prof of Object.values(params.profiles)) {
    const activeUid = prof.uid || auth.currentUser.uid;
    batch.set(
      doc(db, 'profiles', prof.id),
      sanitizeForFirestore({
        ...prof,
        uid: activeUid,
        ownerUid: activeUid,
        updatedAtIso: new Date().toISOString(),
      }),
      { merge: true }
    );
    profilesCount++;
  }

  let workoutsCount = 0;
  for (const w of params.workouts) {
    const normalizedTags = inferWorkoutTags(w);
    batch.set(
      doc(db, 'plannedWorkouts', w.id),
      sanitizeForFirestore({
        ...w,
        tags: normalizedTags,
        ownerUid: auth.currentUser.uid,
        uid: auth.currentUser.uid,
        updatedAtIso: new Date().toISOString(),
      }),
      { merge: true }
    );
    workoutsCount++;
  }

  await batch.commit();

  // Hydrate and batch completed activities in groups of 25 (since each contains a binary Base64 .FIT payload)
  let activitiesCount = 0;
  const actList = params.activities || [];
  const actBatchSize = 25;
  for (let i = 0; i < actList.length; i += actBatchSize) {
    const slice = actList.slice(i, i + actBatchSize);
    const actBatch = writeBatch(db);
    for (const act of slice) {
      const hydrated = await ensureActivityHasRecords(act);
      const fitBase64 = act.fitBase64 || encodeActivityToFitBase64(hydrated);
      const compactRecords = downsampleRecordsForFirestore(hydrated.records, 360);
      const firestoreDoc: CompletedActivity = sanitizeForFirestore({
        ...hydrated,
        ownerUid: auth.currentUser.uid,
        ...(auth.currentUser.uid ? { uid: auth.currentUser.uid } : {}),
        ownerEmail: hydrated.ownerEmail || auth.currentUser.email || '',
        records: compactRecords,
        fitBase64,
        syncedToFirebase: true,
        pendingFirebaseSync: false,
      });
      actBatch.set(doc(db, 'completedWorkouts', act.id), firestoreDoc, {
        merge: true,
      });
      activitiesCount++;
    }
    await actBatch.commit();
  }

  return { profilesCount, workoutsCount, activitiesCount };
}

export async function fetchAllStateFromFirestore(): Promise<{
  profiles: Record<ProfileId, AthleteProfile>;
  workouts: StructuredWorkout[];
  activities: CompletedActivity[];
}> {
  if (!db || !auth?.currentUser) {
    throw new Error('Zaloguj się kontem Google, aby pobrać dane z Firebase.');
  }

  const currentUid = auth.currentUser.uid;

  const [profSnap, ownedWorkSnap, sharedWorkSnap, actSnap] = await Promise.all([
    getDocs(query(collection(db, 'profiles'), where('uid', '==', currentUid))),
    getDocs(
      query(
        collection(db, 'plannedWorkouts'),
        where('ownerUid', '==', currentUid)
      )
    ),
    getDocs(
      query(
        collection(db, 'plannedWorkouts'),
        where('profileId', '==', 'shared')
      )
    ),
    getDocs(
      query(
        collection(db, 'completedWorkouts'),
        where('ownerUid', '==', currentUid)
      )
    ),
  ]);

  const profiles: Record<ProfileId, AthleteProfile> = {};
  profSnap.forEach((d) => {
    const data = d.data() as AthleteProfile;
    if (data && data.id) {
      profiles[data.id] = data;
    }
  });

  const workoutsMap = new Map<string, StructuredWorkout>();
  const appendWorkoutDocs = (snap: typeof ownedWorkSnap) => {
    snap.forEach((d) => {
      const data = d.data() as StructuredWorkout;
      if (data && data.id && Array.isArray(data.blocks)) {
        workoutsMap.set(data.id, {
          ...data,
          tags: inferWorkoutTags(data),
        });
      }
    });
  };
  appendWorkoutDocs(ownedWorkSnap);
  appendWorkoutDocs(sharedWorkSnap);

  const activities: CompletedActivity[] = [];
  actSnap.forEach((d) => {
    const data = d.data() as CompletedActivity;
    if (data && data.id) {
      activities.push(data);
    }
  });

  activities.sort(
    (a, b) =>
      new Date(b.startedAtIso).getTime() - new Date(a.startedAtIso).getTime()
  );

  return {
    profiles,
    workouts: mergeAndNormalizeWorkoutsLibrary(Array.from(workoutsMap.values())),
    activities,
  };
}

/**
 * Subscribes to real-time `onSnapshot` updates from the central Firebase Firestore
 * database strictly filtered by the active Google user's `uid`/`ownerUid` and `'shared'`
 * workouts so every query complies with `isOwnerOrShared(resource.data)` security rules.
 */
export function subscribeToFirestoreHub(callbacks: {
  onProfilesSnapshot: (profiles: Record<ProfileId, AthleteProfile>) => void;
  onWorkoutsSnapshot: (workouts: StructuredWorkout[]) => void;
  onActivitiesSnapshot: (activities: CompletedActivity[]) => void;
  onKnownRidersSnapshot?: (riders: KnownGoogleRider[]) => void;
  onTagsSnapshot?: (tags: string[]) => void;
}): () => void {
  if (!db || !auth?.currentUser) {
    return () => {};
  }

  const currentUid = auth.currentUser.uid;

  const unsubHub = onSnapshot(
    doc(db, 'hubConfig', 'default'),
    (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (Array.isArray(data?.registeredRiders)) {
          saveKnownGoogleRiders(data.registeredRiders);
          callbacks.onKnownRidersSnapshot?.(data.registeredRiders);
        }
        if (Array.isArray(data?.workoutTags)) {
          const normalized = saveWorkoutTagsLocally(data.workoutTags);
          callbacks.onTagsSnapshot?.(normalized);
        }
        if (
          typeof data?.ghPagesInstallUrl === 'string' &&
          data.ghPagesInstallUrl.startsWith('http')
        ) {
          saveCustomGitHubPagesUrl(data.ghPagesInstallUrl);
        }
      }
    },
    (err) => handleFirestoreError(err, OperationType.GET, 'hubConfig/default')
  );

  const unsubProfiles = onSnapshot(
    query(collection(db, 'profiles'), where('uid', '==', currentUid)),
    (snap) => {
      if (snap.empty) return;
      const map: Record<ProfileId, AthleteProfile> = {};
      snap.forEach((d) => {
        const prof = d.data() as AthleteProfile;
        if (prof && prof.id) {
          map[prof.id] = prof;
        }
      });
      if (Object.keys(map).length > 0) {
        callbacks.onProfilesSnapshot(map);
      }
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'profiles')
  );

  // Maintain merged map of owned + shared plannedWorkouts across two rule-compliant queries
  const ownedWorkoutsMap = new Map<string, StructuredWorkout>();
  const sharedWorkoutsMap = new Map<string, StructuredWorkout>();

  const emitMergedWorkouts = () => {
    const combined = new Map<string, StructuredWorkout>([
      ...sharedWorkoutsMap.entries(),
      ...ownedWorkoutsMap.entries(),
    ]);
    if (combined.size > 0) {
      callbacks.onWorkoutsSnapshot(Array.from(combined.values()));
    }
  };

  const unsubOwnedWorkouts = onSnapshot(
    query(collection(db, 'plannedWorkouts'), where('ownerUid', '==', currentUid)),
    (snap) => {
      ownedWorkoutsMap.clear();
      snap.forEach((d) => {
        const w = d.data() as StructuredWorkout;
        if (w && w.id && Array.isArray(w.blocks)) {
          ownedWorkoutsMap.set(w.id, {
            ...w,
            tags: inferWorkoutTags(w),
          });
        }
      });
      emitMergedWorkouts();
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'plannedWorkouts')
  );

  const unsubSharedWorkouts = onSnapshot(
    query(collection(db, 'plannedWorkouts'), where('profileId', '==', 'shared')),
    (snap) => {
      sharedWorkoutsMap.clear();
      snap.forEach((d) => {
        const w = d.data() as StructuredWorkout;
        if (w && w.id && Array.isArray(w.blocks)) {
          sharedWorkoutsMap.set(w.id, {
            ...w,
            tags: inferWorkoutTags(w),
          });
        }
      });
      emitMergedWorkouts();
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'plannedWorkouts')
  );

  const unsubActivities = onSnapshot(
    query(
      collection(db, 'completedWorkouts'),
      where('ownerUid', '==', currentUid)
    ),
    (snap) => {
      const list: CompletedActivity[] = [];
      snap.forEach((d) => {
        const a = d.data() as CompletedActivity;
        if (a && a.id) {
          list.push(a);
        }
      });
      list.sort(
        (a, b) =>
          new Date(b.startedAtIso).getTime() - new Date(a.startedAtIso).getTime()
      );
      callbacks.onActivitiesSnapshot(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'completedWorkouts')
  );

  return () => {
    unsubHub();
    unsubProfiles();
    unsubOwnedWorkouts();
    unsubSharedWorkouts();
    unsubActivities();
  };
}

// ============================================================================
// 3. LOCAL OPFS STORAGE ENGINE (OFFLINE WORKOUTS .TXT & .FIT CACHE)
// ============================================================================

export function getKnownProfileIds(extraIds: ProfileId[] = []): ProfileId[] {
  const idSet = new Set<ProfileId>();
  try {
    const raw = localStorage.getItem(LS_PROFILES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        if (typeof parsed.id === 'string') {
          if (
            parsed.id &&
            parsed.id !== 'shared' &&
            parsed.id !== 'engine' &&
            parsed.id !== 'default'
          ) {
            idSet.add(parsed.id);
          }
        } else {
          Object.keys(parsed).forEach((k) => {
            if (k && k !== 'shared' && k !== 'engine' && k !== 'default') {
              idSet.add(k);
            }
          });
        }
      }
    }
    if (idSet.size === 0) {
      const ridersRaw = localStorage.getItem(KNOWN_RIDERS_STORAGE_KEY);
      if (ridersRaw) {
        const riders = JSON.parse(ridersRaw);
        if (Array.isArray(riders)) {
          riders.forEach((r: KnownGoogleRider) => {
            if (
              r?.profileId &&
              r.profileId !== 'shared' &&
              r.profileId !== 'engine' &&
              r.profileId !== 'default'
            ) {
              idSet.add(r.profileId);
            }
          });
        }
      }
    }
  } catch {
    // ignore
  }
  for (const id of extraIds) {
    if (id && id !== 'shared' && id !== 'engine' && id !== 'default') {
      idSet.add(id);
    }
  }
  if (idSet.size === 0) {
    idSet.add('default');
  }
  return Array.from(idSet);
}

export function getOfflineFsManifest(): OfflineDirectoryManifest | null {
  try {
    const raw = localStorage.getItem(LS_OFFLINE_FS_MANIFEST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.initialized && Array.isArray(parsed.foldersCreated)) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

export function getConfiguredRootFolderName(): string {
  const manifest = getOfflineFsManifest();
  return manifest?.rootFolderName?.trim() || 'DomyosCyclingHub';
}

async function getOrCreateOpfsTree(
  customRootName?: string,
  extraProfileIds: ProfileId[] = []
): Promise<{
  appRootDir: FileSystemDirectoryHandle;
  engineDir: FileSystemDirectoryHandle;
  workoutsRootDir: FileSystemDirectoryHandle;
  workoutsUserDirs: Record<string, FileSystemDirectoryHandle>;
  userDataRootDir: FileSystemDirectoryHandle;
  userDataDirs: Record<
    ProfileId,
    {
      profileDir: FileSystemDirectoryHandle;
      fitDir: FileSystemDirectoryHandle;
      telemetryDir: FileSystemDirectoryHandle;
    }
  >;
} | null> {
  try {
    if (
      typeof navigator === 'undefined' ||
      !navigator.storage ||
      !navigator.storage.getDirectory
    ) {
      return null;
    }
    const cleanRoot =
      (customRootName || getConfiguredRootFolderName())
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, '_') || 'DomyosCyclingHub';

    const profileIds = getKnownProfileIds(extraProfileIds);
    const hasRealProfile = profileIds.some((pid) => pid !== 'default');

    const opfsRoot = await navigator.storage.getDirectory();
    const appRootDir = await opfsRoot.getDirectoryHandle(cleanRoot, { create: true });
    const engineDir = await appRootDir.getDirectoryHandle('App_Engine', { create: true });
    const workoutsRootDir = await appRootDir.getDirectoryHandle('Workouts_Library', {
      create: true,
    });
    const userDataRootDir = await appRootDir.getDirectoryHandle('User_Data', {
      create: true,
    });

    // Automatically clean up legacy orphaned 'default' directories when a real user profile is active
    if (hasRealProfile) {
      try {
        await workoutsRootDir.removeEntry('default', { recursive: true });
      } catch {
        // ignore if not present
      }
      try {
        const defaultUserDir = await userDataRootDir.getDirectoryHandle('default', {
          create: false,
        });
        let hasAnyFitFile = false;
        try {
          const defaultFitDir = await defaultUserDir.getDirectoryHandle('Workouts_FIT', {
            create: false,
          });
          for await (const [entryName, entryHandle] of (defaultFitDir as any).entries()) {
            if (entryHandle.kind === 'file' && entryName.endsWith('.fit')) {
              hasAnyFitFile = true;
              break;
            }
          }
        } catch {
          // no Workouts_FIT subfolder
        }
        if (!hasAnyFitFile) {
          await userDataRootDir.removeEntry('default', { recursive: true });
        }
      } catch {
        // ignore if default does not exist
      }
    }

    const workoutsUserDirs: Record<string, FileSystemDirectoryHandle> = {};
    workoutsUserDirs.shared = await workoutsRootDir.getDirectoryHandle('shared', {
      create: true,
    });

    const userDataDirs: Record<
      ProfileId,
      {
        profileDir: FileSystemDirectoryHandle;
        fitDir: FileSystemDirectoryHandle;
        telemetryDir: FileSystemDirectoryHandle;
      }
    > = {};

    for (const pid of profileIds) {
      const safePid = pid.replace(/[^a-zA-Z0-9_-]/g, '_') || 'default';
      workoutsUserDirs[pid] = await workoutsRootDir.getDirectoryHandle(safePid, {
        create: true,
      });
      const uDir = await userDataRootDir.getDirectoryHandle(safePid, { create: true });
      const [fitDir, telemetryDir] = await Promise.all([
        uDir.getDirectoryHandle('Workouts_FIT', { create: true }),
        uDir.getDirectoryHandle('Telemetry_JSON', { create: true }),
      ]);
      userDataDirs[pid] = { profileDir: uDir, fitDir, telemetryDir };
    }

    try {
      for await (const [dirName, handle] of (workoutsRootDir as any).entries()) {
        if (handle.kind === 'directory' && !workoutsUserDirs[dirName]) {
          workoutsUserDirs[dirName] = handle;
        }
      }
      for await (const [dirName, handle] of (userDataRootDir as any).entries()) {
        if (handle.kind === 'directory' && !userDataDirs[dirName]) {
          const fitDir = await handle.getDirectoryHandle('Workouts_FIT', {
            create: true,
          });
          const telemetryDir = await handle.getDirectoryHandle('Telemetry_JSON', {
            create: true,
          });
          userDataDirs[dirName] = { profileDir: handle, fitDir, telemetryDir };
        }
      }
    } catch {
      // ignore if directory iteration isn't supported
    }

    return {
      appRootDir,
      engineDir,
      workoutsRootDir,
      workoutsUserDirs,
      userDataRootDir,
      userDataDirs,
    };
  } catch {
    return null;
  }
}

async function writeTextToOpfsDir(
  dirHandle: FileSystemDirectoryHandle,
  fileName: string,
  content: string
): Promise<void> {
  const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

async function writeBlobToOpfsDir(
  dirHandle: FileSystemDirectoryHandle,
  fileName: string,
  blob: Blob
): Promise<void> {
  const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

export async function initializeOfflineFolderStructure(options: {
  rootFolderName: string;
  cloudConnected: boolean;
  profileIds?: ProfileId[];
}): Promise<OfflineDirectoryManifest> {
  const cleanRoot =
    options.rootFolderName.trim().replace(/[^a-zA-Z0-9_-]/g, '_') ||
    'DomyosCyclingHub';

  const profileIds = getKnownProfileIds(options.profileIds || []);
  const foldersToCreate = [
    `/${cleanRoot}/App_Engine`,
    `/${cleanRoot}/Workouts_Library/shared`,
    ...profileIds.map((pid) => `/${cleanRoot}/Workouts_Library/${pid}`),
    ...profileIds.map((pid) => `/${cleanRoot}/User_Data/${pid}/Workouts_FIT`),
  ];

  const tree = await getOrCreateOpfsTree(cleanRoot, profileIds);
  if (tree) {
    try {
      await writeTextToOpfsDir(
        tree.engineDir,
        'app_version_manifest.json',
        JSON.stringify(
          {
            version: CURRENT_APP_VERSION,
            updatedAtIso: new Date().toISOString(),
            rootFolder: cleanRoot,
          },
          null,
          2
        )
      );
    } catch {
      // ignore
    }
  }

  const prev = getOfflineFsManifest();
  const manifest: OfflineDirectoryManifest = {
    initialized: true,
    initializedAtIso: prev?.initializedAtIso || new Date().toISOString(),
    rootFolderName: cleanRoot,
    foldersCreated: foldersToCreate,
    cloudConnected: options.cloudConnected,
    installedEngineVersion: CURRENT_APP_VERSION,
    lastUpdateCheckIso: new Date().toISOString(),
  };

  try {
    localStorage.setItem(LS_OFFLINE_FS_MANIFEST_KEY, JSON.stringify(manifest));
  } catch {
    // ignore
  }

  return manifest;
}

export async function saveWorkoutTxtToLocalOpfs(
  workout: StructuredWorkout
): Promise<string | null> {
  const ownerFolder = workout.profileId || 'shared';
  const tree = await getOrCreateOpfsTree(
    undefined,
    ownerFolder !== 'shared' ? [ownerFolder] : []
  );
  if (!tree) return null;
  try {
    const fileName = getCleanWorkoutTxtFileName(workout);
    const content = serializeWorkoutToIcuTextFile(workout);
    const targetDir =
      tree.workoutsUserDirs[ownerFolder] || tree.workoutsUserDirs.shared;
    await writeTextToOpfsDir(targetDir, fileName, content);

    for (const [otherKey, otherDir] of Object.entries(tree.workoutsUserDirs)) {
      if (otherKey !== ownerFolder) {
        try {
          await otherDir.removeEntry(fileName);
        } catch {
          // ignore
        }
      }
    }
    return fileName;
  } catch {
    return null;
  }
}

export async function deleteWorkoutTxtFromLocalOpfs(
  workout: StructuredWorkout
): Promise<void> {
  const tree = await getOrCreateOpfsTree();
  if (!tree) return;
  const fileName = getCleanWorkoutTxtFileName(workout);
  for (const dir of Object.values(tree.workoutsUserDirs)) {
    try {
      await dir.removeEntry(fileName);
    } catch {
      // ignore
    }
  }
}

export async function syncWorkoutsWithLocalOpfs(
  currentWorkouts: StructuredWorkout[]
): Promise<StructuredWorkout[]> {
  const tree = await getOrCreateOpfsTree();
  if (!tree) return currentWorkouts;

  const workoutMap = new Map<string, StructuredWorkout>();
  for (const w of currentWorkouts) {
    workoutMap.set(w.id, w);
  }

  for (const [owner, dir] of Object.entries(tree.workoutsUserDirs)) {
    try {
      for await (const [entryName, handle] of (dir as any).entries()) {
        if (
          handle.kind === 'file' &&
          (entryName.endsWith('.txt') || entryName.endsWith('.icu'))
        ) {
          const file: File = await handle.getFile();
          const text = await file.text();
          const parsed = parseIcuTextFileToWorkout(text, entryName, owner);
          if (parsed.blocks.length > 0) {
            const existing = workoutMap.get(parsed.id);
            workoutMap.set(parsed.id, {
              ...parsed,
              profileId: owner,
              createdAtIso: existing?.createdAtIso || parsed.createdAtIso,
            });
          }
        }
      }
    } catch {
      // ignore
    }
  }

  const merged = Array.from(workoutMap.values());
  for (const w of merged) {
    await saveWorkoutTxtToLocalOpfs(w);
  }

  return merged;
}

export async function saveActivityTelemetryToOpfs(
  profileId: ProfileId,
  activityId: string,
  records: TelemetryRecord[]
): Promise<boolean> {
  if (!records || records.length === 0) return false;
  const tree = await getOrCreateOpfsTree(undefined, [profileId]);
  if (!tree) return false;
  try {
    const userBranch =
      tree.userDataDirs[profileId] || Object.values(tree.userDataDirs)[0];
    if (!userBranch) return false;
    await writeTextToOpfsDir(
      userBranch.telemetryDir,
      `${activityId}.json`,
      JSON.stringify(records)
    );
    return true;
  } catch {
    return false;
  }
}

export async function loadActivityTelemetryFromOpfs(
  profileId: ProfileId,
  activityId: string
): Promise<TelemetryRecord[] | null> {
  const tree = await getOrCreateOpfsTree(undefined, [profileId]);
  if (!tree) return null;
  try {
    const userBranch = tree.userDataDirs[profileId];
    if (!userBranch) return null;
    const fileHandle = await userBranch.telemetryDir.getFileHandle(
      `${activityId}.json`
    );
    const file = await fileHandle.getFile();
    const raw = await file.text();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function ensureActivityHasRecords(
  activity: CompletedActivity
): Promise<CompletedActivity> {
  if (activity.records && activity.records.length > 0) {
    return activity;
  }
  const opfsRecords = await loadActivityTelemetryFromOpfs(
    activity.profileId,
    activity.id
  );
  if (opfsRecords && opfsRecords.length > 0) {
    return {
      ...activity,
      records: opfsRecords,
    };
  }
  const fallbackRecords: TelemetryRecord[] = [];
  const dur = Math.max(1, activity.durationSec);
  for (let s = 1; s <= dur; s++) {
    fallbackRecords.push({
      timestampMs: new Date(activity.startedAtIso).getTime() + s * 1000,
      elapsedSec: s,
      blockIndex: 0,
      powerWatts: activity.avgPowerWatts,
      targetPowerWatts: activity.avgPowerWatts,
      powerMatchOffsetWatts: 0,
      heartRateBpm: activity.avgHrBpm,
      cadenceRpm: activity.avgCadenceRpm,
      speedKmh: activity.avgSpeedKmh,
      distanceMeters: Math.round((activity.totalDistanceMeters * s) / dur),
      resistanceLevel: 8,
    });
  }
  return {
    ...activity,
    records: fallbackRecords,
  };
}

export async function offloadActivitiesTelemetryToOpfs(
  activities: CompletedActivity[],
  profiles: Record<ProfileId, AthleteProfile>
): Promise<CompletedActivity[]> {
  const result: CompletedActivity[] = [];
  const fallbackProfile =
    Object.values(profiles)[0] || createFallbackRuntimeProfile();

  for (const act of activities) {
    const prof = profiles[act.profileId] || fallbackProfile;
    const peakPowerWindows =
      act.peakPowerWindows && act.peakPowerWindows.length > 0
        ? act.peakPowerWindows
        : computeRidePeakPowerAndHr(act, prof);
    const hrBreakdown =
      act.hrBreakdown || computeDetailedHrBreakdown([act], prof);

    if (act.records && act.records.length > 0) {
      const saved = await saveActivityTelemetryToOpfs(
        act.profileId,
        act.id,
        act.records
      );
      result.push({
        ...act,
        records: saved ? [] : act.records,
        telemetryStoredInOpfs: saved || act.telemetryStoredInOpfs,
        peakPowerWindows,
        hrBreakdown,
      });
    } else {
      result.push({
        ...act,
        peakPowerWindows,
        hrBreakdown,
      });
    }
  }
  return result;
}

export async function saveCompletedRideAndStateToLocalOpfs(
  activity: CompletedActivity,
  profile: AthleteProfile,
  allActivities: CompletedActivity[]
): Promise<{ fitFileName: string; savedToOpfs: boolean; fitBase64: string }> {
  const fitFileName = buildCleanActivityFitFileName(activity);

  const hydratedActivity = await ensureActivityHasRecords(activity);
  const fitBase64 = encodeActivityToFitBase64(hydratedActivity);

  const tree = await getOrCreateOpfsTree(undefined, [activity.profileId]);
  if (!tree) {
    return { fitFileName, savedToOpfs: false, fitBase64 };
  }

  try {
    const userBranch =
      tree.userDataDirs[activity.profileId] ||
      Object.values(tree.userDataDirs)[0];
    if (!userBranch) {
      return { fitFileName, savedToOpfs: false, fitBase64 };
    }
    const fitBlob = encodeActivityToFitBlob({
      ...hydratedActivity,
      fitBase64,
    });
    await writeBlobToOpfsDir(userBranch.fitDir, fitFileName, fitBlob);

    if (hydratedActivity.records.length > 0) {
      await writeTextToOpfsDir(
        userBranch.telemetryDir,
        `${activity.id}.json`,
        JSON.stringify(hydratedActivity.records)
      );
    }

    const userActs = allActivities
      .filter((a) => a.profileId === activity.profileId)
      .map((a) => ({ ...a, records: [] }));
    const stateJson = JSON.stringify(
      {
        updatedAtIso: new Date().toISOString(),
        profileId: activity.profileId,
        profile,
        activitiesCount: userActs.length,
        activities: userActs.slice(0, 100),
      },
      null,
      2
    );
    await writeTextToOpfsDir(
      userBranch.profileDir,
      'profile_state.json',
      stateJson
    );
    return { fitFileName, savedToOpfs: true, fitBase64 };
  } catch {
    return { fitFileName, savedToOpfs: false, fitBase64 };
  }
}

export async function listLocalOpfsFiles(): Promise<LocalOpfsFileEntry[]> {
  const tree = await getOrCreateOpfsTree();
  if (!tree) return [];
  const rootName = getConfiguredRootFolderName();
  const entries: LocalOpfsFileEntry[] = [];

  const scanDir = async (
    dir: FileSystemDirectoryHandle,
    folderBranch: string,
    ownerFolder: LocalOpfsFileEntry['ownerFolder']
  ) => {
    try {
      for await (const [name, handle] of (dir as any).entries()) {
        if (handle.kind === 'file') {
          const f: File = await handle.getFile();
          const kind: LocalOpfsFileEntry['kind'] = name.endsWith('.fit')
            ? 'fit'
            : name.endsWith('.json')
            ? 'json'
            : name.endsWith('.html')
            ? 'html'
            : 'txt';
          entries.push({
            path: `/${rootName}/${folderBranch}/${name}`,
            folderBranch,
            ownerFolder,
            name,
            sizeBytes: f.size,
            lastModified: f.lastModified,
            kind,
          });
        }
      }
    } catch {
      // ignore
    }
  };

  const scanPromises: Promise<void>[] = [
    scanDir(tree.engineDir, 'App_Engine', 'engine'),
  ];

  for (const [owner, wDir] of Object.entries(tree.workoutsUserDirs)) {
    scanPromises.push(scanDir(wDir, `Workouts_Library/${owner}`, owner));
  }

  for (const [pid, uDirs] of Object.entries(tree.userDataDirs)) {
    scanPromises.push(scanDir(uDirs.profileDir, `User_Data/${pid}`, pid));
    scanPromises.push(
      scanDir(uDirs.fitDir, `User_Data/${pid}/Workouts_FIT`, pid)
    );
    scanPromises.push(
      scanDir(uDirs.telemetryDir, `User_Data/${pid}/Telemetry_JSON`, pid)
    );
  }

  await Promise.all(scanPromises);

  return entries.sort((a, b) => b.lastModified - a.lastModified);
}

async function resolveOpfsDirectoryByBranch(
  folderBranch: string
): Promise<FileSystemDirectoryHandle | null> {
  const tree = await getOrCreateOpfsTree();
  if (!tree) return null;
  if (folderBranch === 'App_Engine') return tree.engineDir;
  if (folderBranch.startsWith('Workouts_Library/')) {
    const owner = folderBranch.replace('Workouts_Library/', '');
    return tree.workoutsUserDirs[owner] || null;
  }
  if (folderBranch.startsWith('User_Data/')) {
    const rest = folderBranch.replace('User_Data/', '');
    const parts = rest.split('/');
    const pid = parts[0];
    const sub = parts[1];
    const uBranch = tree.userDataDirs[pid];
    if (!uBranch) return null;
    if (!sub) return uBranch.profileDir;
    if (sub === 'Workouts_FIT') return uBranch.fitDir;
    if (sub === 'Telemetry_JSON') return uBranch.telemetryDir;
  }
  return null;
}

export async function readLocalOpfsTextFile(
  folderBranch: string,
  fileName: string
): Promise<string | null> {
  const dir = await resolveOpfsDirectoryByBranch(folderBranch);
  if (!dir) return null;
  try {
    const fileHandle = await dir.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    return await file.text();
  } catch {
    return null;
  }
}

export async function writeLocalOpfsWorkoutTextFile(
  ownerFolder: ProfileId | 'shared',
  fileName: string,
  textContent: string
): Promise<StructuredWorkout | null> {
  const tree = await getOrCreateOpfsTree(
    undefined,
    ownerFolder !== 'shared' ? [ownerFolder] : []
  );
  const safeName = fileName.endsWith('.txt') ? fileName : `${fileName}.txt`;
  if (tree) {
    const targetDir =
      tree.workoutsUserDirs[ownerFolder] || tree.workoutsUserDirs.shared;
    await writeTextToOpfsDir(targetDir, safeName, textContent);
  }
  const parsed = parseIcuTextFileToWorkout(textContent, safeName, ownerFolder);
  return {
    ...parsed,
    profileId: ownerFolder,
  };
}

export async function downloadLocalOpfsFile(
  folderBranch: string,
  fileName: string
): Promise<boolean> {
  const dir = await resolveOpfsDirectoryByBranch(folderBranch);
  if (!dir) return false;
  try {
    const fileHandle = await dir.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}
