import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  getDocs,
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import {
  db,
  auth,
  handleFirestoreError,
  OperationType,
  KNOWN_RIDERS_STORAGE_KEY,
} from '../lib/firebase';
import {
  AthleteProfile,
  CompletedActivity,
  KnownGoogleRider,
  ProfileId,
  StructuredWorkout,
  TelemetryRecord,
} from '../types/cycling';
import {
  encodeActivityToFitBase64,
  encodeActivityToFitBlob,
} from './fitEncoder';
import {
  computeDetailedHrBreakdown,
  computeRidePeakPowerAndHr,
  createNewAthleteProfile,
  DEFAULT_PROFILES,
  getCleanWorkoutTxtFileName,
  parseIcuTextFileToWorkout,
  PROFILE_AVATAR_COLORS,
  sanitizeProfileSlug,
  serializeWorkoutToIcuTextFile,
} from './rampAndPhysiologyEngine';

export const CURRENT_APP_VERSION = '2.1.0';
const LS_OFFLINE_FS_MANIFEST_KEY = 'domyos_offline_fs_manifest_v1';
const LS_PROFILES_KEY = 'domyos_hub_profiles_v1';

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
 * Resolves or creates an AthleteProfile for the authenticated Google User.
 * Zero hardcoded personal names: uses the Google account's displayName/email
 * or links to an existing matching profile.
 */
export function resolveOrCreateProfileForGoogleUser(
  user: User,
  existingProfiles: Record<ProfileId, AthleteProfile>
): {
  profile: AthleteProfile;
  updatedProfiles: Record<ProfileId, AthleteProfile>;
  isNew: boolean;
} {
  const email = (user.email || '').toLowerCase();
  const displayName =
    user.displayName?.trim() ||
    (email ? email.split('@')[0] : 'Zawodnik Google');

  // 1. Match by uid or email
  const existingList = Object.values(existingProfiles);
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
      updatedProfiles: { ...existingProfiles, [updated.id]: updated },
      isNew: false,
    };
  }

  // 2. If only the untouched 'default' placeholder profile exists, bind it to this first Google rider
  if (
    existingList.length === 1 &&
    existingProfiles.default &&
    !existingProfiles.default.uid &&
    existingProfiles.default.name === 'Domyślny Profil'
  ) {
    const slugId = sanitizeProfileSlug(displayName, []);
    const boundProfile: AthleteProfile = {
      ...existingProfiles.default,
      id: slugId,
      uid: user.uid,
      email: user.email || '',
      photoURL: user.photoURL || undefined,
      name: displayName,
      subtitle: 'Konto Google + Firebase + Google Fit & Intervals.icu',
      googleFit: {
        enabled: true,
        autoUploadActivities: true,
      },
      updatedAtIso: new Date().toISOString(),
    };
    const copy = { ...existingProfiles };
    delete copy.default;
    copy[slugId] = boundProfile;
    return {
      profile: boundProfile,
      updatedProfiles: copy,
      isNew: false,
    };
  }

  // 3. Create a brand new profile for this Google account
  const colorIdx = existingList.length % PROFILE_AVATAR_COLORS.length;
  const created = createNewAthleteProfile({
    name: displayName,
    avatarColor: PROFILE_AVATAR_COLORS[colorIdx],
    ftpWatts: 200,
    weightKg: 75,
    maxHrBpm: 188,
    existingIds: Object.keys(existingProfiles),
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
      ...existingProfiles,
      [enriched.id]: enriched,
    },
    isNew: true,
  };
}

// ============================================================================
// 2. FIREBASE CLOUD FIRESTORE REAL-TIME SYNC & CRUD
// ============================================================================

function sanitizeForFirestore<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export async function saveProfileToFirestore(profile: AthleteProfile): Promise<void> {
  if (!db || !auth?.currentUser) return;
  const path = `profiles/${profile.id}`;
  try {
    const payload = sanitizeForFirestore({
      ...profile,
      updatedAtIso: new Date().toISOString(),
    });
    await setDoc(doc(db, 'profiles', profile.id), payload, { merge: true });

    // Also update known riders in hubConfig/default
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
      await setDoc(
        doc(db, 'hubConfig', 'default'),
        sanitizeForFirestore({
          updatedAtIso: new Date().toISOString(),
          registeredRiders: updatedRiders,
        }),
        { merge: true }
      );
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    throw err;
  }
}

export async function deleteProfileFromFirestore(profileId: ProfileId): Promise<void> {
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
  if (!db || !auth?.currentUser) return;
  const path = `plannedWorkouts/${workout.id}`;
  try {
    const payload = sanitizeForFirestore({
      ...workout,
      ownerUid: workout.ownerUid || auth.currentUser.uid,
      updatedAtIso: new Date().toISOString(),
    });
    await setDoc(doc(db, 'plannedWorkouts', workout.id), payload, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    throw err;
  }
}

export async function deletePlannedWorkoutFromFirestore(
  workoutId: string
): Promise<void> {
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
  if (!db || !auth?.currentUser) {
    throw new Error('Brak aktywnej sesji Google OAuth w Firebase.');
  }
  const path = `completedWorkouts/${activity.id}`;
  try {
    const hydrated = await ensureActivityHasRecords(activity);
    const fitBase64 = activity.fitBase64 || encodeActivityToFitBase64(hydrated);
    const compactRecords = downsampleRecordsForFirestore(hydrated.records, 360);

    const firestoreDoc: CompletedActivity = sanitizeForFirestore({
      ...hydrated,
      ownerUid: hydrated.ownerUid || auth.currentUser.uid,
      ownerEmail: hydrated.ownerEmail || auth.currentUser.email || '',
      records: compactRecords,
      fitBase64,
      syncedToFirebase: true,
      pendingFirebaseSync: false,
      syncedToGoogleDrive: true,
      pendingDriveSync: false,
    });

    await setDoc(doc(db, 'completedWorkouts', activity.id), firestoreDoc, {
      merge: true,
    });

    return firestoreDoc;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
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

  let profilesCount = 0;
  for (const prof of Object.values(params.profiles)) {
    await saveProfileToFirestore(prof);
    profilesCount++;
  }

  let workoutsCount = 0;
  for (const w of params.workouts) {
    await savePlannedWorkoutToFirestore(w);
    workoutsCount++;
  }

  let activitiesCount = 0;
  for (const act of params.activities) {
    await saveCompletedActivityToFirestore(act);
    activitiesCount++;
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

  const [profSnap, workSnap, actSnap] = await Promise.all([
    getDocs(collection(db, 'profiles')),
    getDocs(collection(db, 'plannedWorkouts')),
    getDocs(collection(db, 'completedWorkouts')),
  ]);

  const profiles: Record<ProfileId, AthleteProfile> = {};
  profSnap.forEach((d) => {
    const data = d.data() as AthleteProfile;
    if (data && data.id) {
      profiles[data.id] = data;
    }
  });

  const workouts: StructuredWorkout[] = [];
  workSnap.forEach((d) => {
    const data = d.data() as StructuredWorkout;
    if (data && data.id && Array.isArray(data.blocks)) {
      workouts.push(data);
    }
  });

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

  return { profiles, workouts, activities };
}

/**
 * Subscribes to real-time `onSnapshot` updates from the central Firebase Firestore
 * database for profiles, planned workouts, completed workouts, and known riders.
 */
export function subscribeToFirestoreHub(callbacks: {
  onProfilesSnapshot: (profiles: Record<ProfileId, AthleteProfile>) => void;
  onWorkoutsSnapshot: (workouts: StructuredWorkout[]) => void;
  onActivitiesSnapshot: (activities: CompletedActivity[]) => void;
  onKnownRidersSnapshot?: (riders: KnownGoogleRider[]) => void;
}): () => void {
  if (!db || !auth?.currentUser) {
    return () => {};
  }

  const unsubHub = onSnapshot(
    doc(db, 'hubConfig', 'default'),
    (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (Array.isArray(data?.registeredRiders)) {
          saveKnownGoogleRiders(data.registeredRiders);
          callbacks.onKnownRidersSnapshot?.(data.registeredRiders);
        }
      }
    },
    (err) => handleFirestoreError(err, OperationType.GET, 'hubConfig/default')
  );

  const unsubProfiles = onSnapshot(
    collection(db, 'profiles'),
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

  const unsubWorkouts = onSnapshot(
    collection(db, 'plannedWorkouts'),
    (snap) => {
      if (snap.empty) return;
      const list: StructuredWorkout[] = [];
      snap.forEach((d) => {
        const w = d.data() as StructuredWorkout;
        if (w && w.id && Array.isArray(w.blocks)) {
          list.push(w);
        }
      });
      if (list.length > 0) {
        callbacks.onWorkoutsSnapshot(list);
      }
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'plannedWorkouts')
  );

  const unsubActivities = onSnapshot(
    collection(db, 'completedWorkouts'),
    (snap) => {
      if (snap.empty) return;
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
      if (list.length > 0) {
        callbacks.onActivitiesSnapshot(list);
      }
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'completedWorkouts')
  );

  return () => {
    unsubHub();
    unsubProfiles();
    unsubWorkouts();
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
        Object.keys(parsed).forEach((k) => {
          if (k && k !== 'shared' && k !== 'engine') idSet.add(k);
        });
      }
    }
  } catch {
    // ignore
  }
  for (const id of extraIds) {
    if (id && id !== 'shared' && id !== 'engine') idSet.add(id);
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

    const opfsRoot = await navigator.storage.getDirectory();
    const appRootDir = await opfsRoot.getDirectoryHandle(cleanRoot, { create: true });
    const engineDir = await appRootDir.getDirectoryHandle('App_Engine', { create: true });
    const workoutsRootDir = await appRootDir.getDirectoryHandle('Workouts_Library', {
      create: true,
    });
    const userDataRootDir = await appRootDir.getDirectoryHandle('User_Data', {
      create: true,
    });

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
    Object.values(profiles)[0] || DEFAULT_PROFILES.default;

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
  const datePart = activity.startedAtIso.slice(0, 10);
  const cleanName = activity.workoutName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 32);
  const fitFileName = `${datePart}_${cleanName}.fit`;

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
