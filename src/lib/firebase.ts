import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';

export const CUSTOM_FIREBASE_CONFIG_KEY = 'domyos_custom_firebase_config';
export const FORCE_PROD_MODE_KEY = 'domyos_force_prod_mode';
export const AI_STUDIO_PWA_BYPASS_KEY = 'domyos_aistudio_pwa_bypass_v1';
export const GOOGLE_OAUTH_ACCESS_TOKEN_KEY = 'domyos_google_oauth_token_v1';
export const KNOWN_RIDERS_STORAGE_KEY = 'domyos_known_google_riders_v1';
export const CUSTOM_GH_PAGES_URL_KEY = 'domyos_hub_gh_pages_url_v1';
export const LS_PRIVATE_AUDIT_LOGS_KEY = 'domyos_private_audit_logs_v1';

export type AuditLogLevel = 'INFO' | 'WARN' | 'ERROR' | 'SECURITY';
export type AuditLogCategory =
  | 'AUTH'
  | 'FIRESTORE'
  | 'BLE_FTMS'
  | 'GOOGLE_FIT'
  | 'INTERVALS_ICU'
  | 'SECURITY_AUDIT'
  | 'OPFS_STORAGE';

export interface SecurityAuditLogEntry {
  id: string;
  uid?: string;
  ownerUid?: string;
  timestampIso: string;
  level: AuditLogLevel;
  category: AuditLogCategory;
  message: string;
  context?: string;
  deviceFingerprint?: string;
  syncedToFirebase?: boolean;
}

/**
 * Redacts any API keys (AIza...), Bearer tokens, or long secrets from log strings
 * before saving to device localStorage/OPFS or Firebase Firestore.
 */
export function redactSensitiveText(input: string): string {
  if (!input) return '';
  return input
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, (m) => `${m.slice(0, 6)}...[REDACTED_KEY]`)
    .replace(/ya29\.[0-9A-Za-z._-]+/g, 'ya29...[REDACTED_OAUTH_TOKEN]')
    .replace(/"apiKey"\s*:\s*"[^"]+"/g, '"apiKey":"[REDACTED]"')
    .replace(/"accessToken"\s*:\s*"[^"]+"/g, '"accessToken":"[REDACTED]"');
}

/**
 * Computes a short, non-reversible fingerprint of the loaded Firebase config
 * so the rider can verify the right config is loaded on the phone without exposing raw keys.
 */
export function getFirebaseConfigFingerprint(
  config: Record<string, any> | null | undefined
): string {
  if (!config || !config.apiKey || !config.projectId) {
    return 'BRAK-CONFIGU';
  }
  const raw = `${config.projectId}|${config.appId || ''}|${config.apiKey.slice(
    0,
    8
  )}|${config.apiKey.slice(-4)}`;
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const hex = (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
  return `CFG-${hex}-${String(config.projectId).slice(0, 10)}`;
}

/**
 * Appends a sanitized diagnostic/security log entry into device-local storage
 * without ever writing to browser DevTools console.
 */
export function appendLocalAuditLogEntry(params: {
  level: AuditLogLevel;
  category: AuditLogCategory;
  message: string;
  context?: unknown;
  uid?: string;
  deviceFingerprint?: string;
}): SecurityAuditLogEntry {
  const safeMessage = redactSensitiveText(params.message).slice(0, 1800);
  let safeContext = '';
  if (params.context !== undefined) {
    try {
      const serialized =
        typeof params.context === 'string'
          ? params.context
          : JSON.stringify(params.context);
      safeContext = redactSensitiveText(serialized).slice(0, 1800);
    } catch {
      safeContext = '';
    }
  }

  const nowIso = new Date().toISOString();
  const entry: SecurityAuditLogEntry = {
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestampIso: nowIso,
    level: params.level,
    category: params.category,
    message: safeMessage,
    ...(safeContext ? { context: safeContext } : {}),
    ...(params.uid ? { uid: params.uid, ownerUid: params.uid } : {}),
    ...(params.deviceFingerprint
      ? { deviceFingerprint: params.deviceFingerprint }
      : {}),
    syncedToFirebase: false,
  };

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(LS_PRIVATE_AUDIT_LOGS_KEY);
      const parsed: SecurityAuditLogEntry[] = raw ? JSON.parse(raw) : [];
      const list = Array.isArray(parsed) ? parsed : [];
      list.unshift(entry);
      window.localStorage.setItem(
        LS_PRIVATE_AUDIT_LOGS_KEY,
        JSON.stringify(list.slice(0, 160))
      );
      window.dispatchEvent(new CustomEvent('domyos-audit-log-updated'));
    }
  } catch {
    // ignore storage quota errors
  }

  return entry;
}

/**
 * Checks whether the app is currently running inside the AI Studio preview or localhost
 * development environment (as opposed to public GitHub Pages or a production domain).
 */
export function isAIStudioPreviewEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.endsWith('.run.app')
  );
}

// Gatekeep 1: Zero hardcoded credentials in source code or repository.
// firebase-applet-config.json is strictly `{}` in the repository; all credentials come from device localStorage.
const defaultConfig: Record<string, any> = {};

export const FIREBASE_CONSOLE_PLACEHOLDER = `const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "twoj-projekt.firebaseapp.com",
  projectId: "twoj-projekt",
  storageBucket: "twoj-projekt.firebasestorage.app",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef123456",
  measurementId: "G-XXXXXXXXXX"
};`;

const FIREBASE_CONFIG_ORDERED_KEYS = [
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
  'measurementId',
  'databaseURL',
  'firestoreDatabaseId',
  'oAuthClientId',
  'recaptchaSiteKey',
] as const;

/**
 * Formats a Firebase configuration object into the exact JavaScript snippet format
 * shown in the Firebase Console (unquoted property keys, standard key ordering).
 */
export function formatFirebaseConfigText(
  config: Record<string, any> | null | undefined
): string {
  if (!config || !config.apiKey || !config.projectId) {
    return '';
  }

  const standardKeys = [
    'apiKey',
    'authDomain',
    'projectId',
    'storageBucket',
    'messagingSenderId',
    'appId',
    'measurementId',
  ];

  const lines: string[] = [];
  for (const key of standardKeys) {
    const val = config[key];
    if (typeof val === 'string' && val.trim() !== '') {
      lines.push(`  ${key}: "${val.trim()}"`);
    }
  }

  if (
    typeof config.firestoreDatabaseId === 'string' &&
    config.firestoreDatabaseId.trim() !== '' &&
    config.firestoreDatabaseId.trim() !== '(default)'
  ) {
    lines.push(`  firestoreDatabaseId: "${config.firestoreDatabaseId.trim()}"`);
  }

  return `const firebaseConfig = {\n${lines.join(',\n')}\n};`;
}

/**
 * Parses a Firebase configuration pasted from the Firebase Console in any format.
 */
export function parseCustomFirebaseInput(rawInput: string): Record<string, string> {
  if (!rawInput || !rawInput.trim()) {
    throw new Error(
      'Wklej konfigurację firebaseConfig skopiowaną z konsoli Firebase.'
    );
  }

  const withoutComments = rawInput
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  const configBlockMatch = withoutComments.match(
    /firebaseConfig\s*=\s*\{([\s\S]*?)\}/
  );
  const targetText = configBlockMatch ? configBlockMatch[1] : withoutComments;

  const extracted: Record<string, string> = {};
  const allowedKeys = new Set<string>(FIREBASE_CONFIG_ORDERED_KEYS);

  const keyValueRegex =
    /["']?([a-zA-Z0-9_]+)["']?\s*:\s*(?:"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|([^,\n\r};]+))/g;

  let match: RegExpExecArray | null;
  while ((match = keyValueRegex.exec(targetText)) !== null) {
    const key = match[1]?.trim();
    const rawVal =
      match[2] !== undefined
        ? match[2]
        : match[3] !== undefined
        ? match[3]
        : (match[4] || '').trim().replace(/^["']|["']$/g, '');

    if (key && allowedKeys.has(key)) {
      extracted[key] = rawVal.trim();
    }
  }

  if (
    !extracted.apiKey ||
    !extracted.apiKey.startsWith('AIza') ||
    extracted.apiKey.length < 20 ||
    !extracted.projectId ||
    !extracted.authDomain ||
    !extracted.appId
  ) {
    throw new Error(
      'Konfiguracja firebaseConfig jest niepełna! Wymagane są prawidłowe pola: apiKey (zaczynający się od "AIza..."), authDomain, projectId oraz appId skopiowane z konsoli Firebase.'
    );
  }

  return extracted;
}

/**
 * Validates that a device-loaded Firebase config has all required fields
 * (`apiKey` starting with `AIza`, `authDomain`, `projectId`, `appId`).
 */
export function isValidDeviceFirebaseConfig(
  config: Record<string, any> | null | undefined
): boolean {
  if (!config || typeof config !== 'object') return false;
  const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : '';
  const projectId =
    typeof config.projectId === 'string' ? config.projectId.trim() : '';
  const authDomain =
    typeof config.authDomain === 'string' ? config.authDomain.trim() : '';
  const appId = typeof config.appId === 'string' ? config.appId.trim() : '';

  return (
    apiKey.startsWith('AIza') &&
    apiKey.length >= 20 &&
    projectId.length >= 3 &&
    authDomain.length >= 5 &&
    appId.length >= 6
  );
}

export const RECOMMENDED_FIRESTORE_RULES_CODE = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 1. TYLKO zweryfikowane konta Google OAuth (ZERO dostępu anonimowego / hasła)
    function isVerifiedGoogleUser() {
      return request.auth != null &&
             request.auth.token.firebase.sign_in_provider == 'google.com' &&
             request.auth.token.email_verified == true;
    }

    // 2. Izolacja zapisu po UID zalogowanego użytkownika Google (lub trening wspólny 'shared')
    function isOwnerOrShared(data) {
      return !('uid' in data) && !('ownerUid' in data)
             || ('uid' in data && data.uid == request.auth.uid)
             || ('ownerUid' in data && data.ownerUid == request.auth.uid)
             || ('profileId' in data && data.profileId == 'shared');
    }

    match /hubConfig/{configId} {
      allow read: if isVerifiedGoogleUser();
      allow create, update: if isVerifiedGoogleUser()
        && request.resource.data.keys().hasAll(['updatedAtIso'])
        && request.resource.data.updatedAtIso is string;
      allow delete: if false;
    }

    match /profiles/{profileId} {
      allow read: if isVerifiedGoogleUser();
      allow create, update: if isVerifiedGoogleUser()
        && isOwnerOrShared(request.resource.data)
        && (resource == null || isOwnerOrShared(resource.data))
        && request.resource.data.keys().hasAll(['id', 'name', 'ftpWatts', 'weightKg'])
        && request.resource.data.id is string
        && request.resource.data.name is string
        && request.resource.data.name.size() > 0
        && request.resource.data.name.size() <= 120
        && request.resource.data.ftpWatts is number
        && request.resource.data.weightKg is number;
      allow delete: if isVerifiedGoogleUser()
        && isOwnerOrShared(resource.data);
    }

    match /plannedWorkouts/{workoutId} {
      allow read: if isVerifiedGoogleUser();
      allow create, update: if isVerifiedGoogleUser()
        && isOwnerOrShared(request.resource.data)
        && (resource == null || isOwnerOrShared(resource.data))
        && request.resource.data.keys().hasAll(['id', 'profileId', 'name', 'blocks'])
        && request.resource.data.id is string
        && request.resource.data.profileId is string
        && request.resource.data.name is string
        && request.resource.data.name.size() > 0
        && request.resource.data.name.size() <= 200
        && request.resource.data.blocks is list;
      allow delete: if isVerifiedGoogleUser()
        && isOwnerOrShared(resource.data);
    }

    match /completedWorkouts/{activityId} {
      allow read: if isVerifiedGoogleUser();
      allow create, update: if isVerifiedGoogleUser()
        && isOwnerOrShared(request.resource.data)
        && (resource == null || isOwnerOrShared(resource.data))
        && request.resource.data.keys().hasAll(['id', 'profileId', 'workoutName', 'startedAtIso', 'durationSec'])
        && request.resource.data.id is string
        && request.resource.data.profileId is string
        && request.resource.data.workoutName is string
        && request.resource.data.workoutName.size() <= 240
        && request.resource.data.startedAtIso is string
        && request.resource.data.durationSec is number;
      allow delete: if isVerifiedGoogleUser()
        && isOwnerOrShared(resource.data);
    }

    match /securityAuditLogs/{logId} {
      allow read: if isVerifiedGoogleUser()
        && (resource == null || isOwnerOrShared(resource.data));
      allow create, update: if isVerifiedGoogleUser()
        && isOwnerOrShared(request.resource.data)
        && (resource == null || isOwnerOrShared(resource.data))
        && request.resource.data.keys().hasAll(['id', 'timestampIso', 'level', 'category', 'message'])
        && request.resource.data.id is string
        && request.resource.data.timestampIso is string
        && request.resource.data.level is string
        && request.resource.data.category is string
        && request.resource.data.message is string
        && request.resource.data.message.size() <= 2000;
      allow delete: if isVerifiedGoogleUser()
        && isOwnerOrShared(resource.data);
    }
  }
}`;

export function getActiveFirebaseConfig() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem(CUSTOM_FIREBASE_CONFIG_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (isValidDeviceFirebaseConfig(parsed)) {
          return { config: parsed, isCustom: true };
        }
      }
    }
  } catch (e) {
    appendLocalAuditLogEntry({
      level: 'ERROR',
      category: 'SECURITY_AUDIT',
      message: 'Błąd odczytu lokalnej konfiguracji firebaseConfig z localStorage',
      context: e instanceof Error ? e.message : String(e),
    });
  }
  return { config: defaultConfig, isCustom: false };
}

export function saveCustomFirebaseConfig(rawInput: string) {
  const parsed = parseCustomFirebaseInput(rawInput);
  localStorage.setItem(CUSTOM_FIREBASE_CONFIG_KEY, JSON.stringify(parsed));
  appendLocalAuditLogEntry({
    level: 'SECURITY',
    category: 'SECURITY_AUDIT',
    message: `Zapisano nową konfigurację firebaseConfig w pamięci urządzenia (${getFirebaseConfigFingerprint(
      parsed
    )})`,
    deviceFingerprint: getFirebaseConfigFingerprint(parsed),
  });
  window.location.reload();
}

export function clearCustomFirebaseConfig() {
  localStorage.removeItem(CUSTOM_FIREBASE_CONFIG_KEY);
  appendLocalAuditLogEntry({
    level: 'SECURITY',
    category: 'SECURITY_AUDIT',
    message: 'Usunięto konfigurację firebaseConfig z pamięci lokalnej urządzenia',
  });
  window.location.reload();
}

export const DEFAULT_GITHUB_PAGES_URL =
  typeof window !== 'undefined' && window.location.hostname.endsWith('.github.io')
    ? `${window.location.origin}${window.location.pathname}`
    : 'https://twoj-login.github.io/domyos-cycling-hub/';

export const DEFAULT_GITHUB_REPO_URL = 'https://github.com';

/**
 * Resolves the GitHub Pages PWA installation URL dynamically from `window.location`
 * or device `localStorage` (synced with Firestore `hubConfig/default`), so zero
 * personal GitHub usernames are hardcoded in the source repository.
 */
export function getGitHubPagesInstallUrl(): string {
  try {
    if (typeof window !== 'undefined') {
      if (window.location.hostname.endsWith('.github.io')) {
        const detected = `${window.location.origin}${window.location.pathname}`;
        window.localStorage.setItem(CUSTOM_GH_PAGES_URL_KEY, detected);
        return detected;
      }
      const custom = window.localStorage.getItem(CUSTOM_GH_PAGES_URL_KEY);
      if (custom && custom.trim().startsWith('http')) {
        return custom.trim();
      }
    }
  } catch {
    // ignore
  }
  return DEFAULT_GITHUB_PAGES_URL;
}

export function getAuthorizedDomainHostname(): string {
  try {
    const installUrl = getGitHubPagesInstallUrl();
    if (installUrl && installUrl.startsWith('http')) {
      const parsed = new URL(installUrl);
      if (parsed.hostname && parsed.hostname !== 'twoj-login.github.io') {
        return parsed.hostname;
      }
    }
    if (typeof window !== 'undefined' && window.location.hostname) {
      return window.location.hostname;
    }
  } catch {
    // ignore
  }
  return 'twoja-domena.github.io';
}

export function saveCustomGitHubPagesUrl(url: string): string {
  const clean = url.trim() || DEFAULT_GITHUB_PAGES_URL;
  try {
    localStorage.setItem(CUSTOM_GH_PAGES_URL_KEY, clean);
  } catch {
    // ignore
  }
  return clean;
}

const { config: activeConfig, isCustom: isUsingCustomConfig } =
  getActiveFirebaseConfig();

const isConfigured = isValidDeviceFirebaseConfig(activeConfig);

const app = isConfigured
  ? getApps().length === 0
    ? initializeApp(activeConfig)
    : getApps()[0]
  : null;

export const db =
  app && isConfigured
    ? getFirestore(app, (activeConfig as any).firestoreDatabaseId || '(default)')
    : (null as any);

export const auth = app && isConfigured ? getAuth(app) : (null as any);

export { isUsingCustomConfig, isConfigured, activeConfig };

// Connection sanity test on boot when configured (logs privately to local audit log, never console)
async function testFirestoreConnection() {
  if (!db) return;
  try {
    await getDocFromServer(doc(db, 'hubConfig', 'connection_check'));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
      appendLocalAuditLogEntry({
        level: 'WARN',
        category: 'FIRESTORE',
        message: 'Firestore działa obecnie w trybie offline i oczekuje na sieć.',
        deviceFingerprint: getFirebaseConfigFingerprint(activeConfig),
      });
    }
  }
}
testFirestoreConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
) {
  const errInfo: FirestoreErrorInfo = {
    error: redactSensitiveText(
      error instanceof Error ? error.message : String(error)
    ),
    authInfo: {
      userId: auth?.currentUser?.uid,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
    },
    operationType,
    path,
  };

  // Never print sensitive auth/path metadata to browser DevTools console.
  // Record strictly to local device audit storage & private Firestore log queue.
  appendLocalAuditLogEntry({
    level: 'ERROR',
    category: 'FIRESTORE',
    message: `Błąd operacji Firestore [${operationType}] na ścieżce ${
      path || 'nieznana'
    }: ${errInfo.error}`,
    context: errInfo,
    uid: auth?.currentUser?.uid,
    deviceFingerprint: getFirebaseConfigFingerprint(activeConfig),
  });

  return errInfo;
}

// OAuth Access Token Cache (for Google Fit REST API calls per logged-in Google user)
interface CachedGoogleToken {
  uid: string;
  email: string;
  accessToken: string;
  expiresAtMs: number;
  hasGoogleFitScopes: boolean;
}

export function getCachedGoogleFitToken(uid?: string): string | null {
  try {
    const raw = localStorage.getItem(GOOGLE_OAUTH_ACCESS_TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedGoogleToken;
    if (uid && parsed.uid !== uid) return null;
    if (Date.now() > parsed.expiresAtMs) return null;
    return parsed.accessToken;
  } catch {
    return null;
  }
}

export function setCachedGoogleFitToken(data: CachedGoogleToken) {
  try {
    localStorage.setItem(GOOGLE_OAUTH_ACCESS_TOKEN_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

/**
 * Signs in a rider with their own Google OAuth credentials (NEVER anonymous).
 */
export async function signInRiderWithGoogle(options?: {
  loginHintEmail?: string;
  requestGoogleFitScopes?: boolean;
}): Promise<{
  user: User;
  accessToken: string | null;
  hasGoogleFitScopes: boolean;
}> {
  if (!auth || !isConfigured) {
    throw new Error(
      'Najpierw wklej konfigurację JSON projektu Firebase w pamięci urządzenia.'
    );
  }

  const provider = new GoogleAuthProvider();
  const requestFit = options?.requestGoogleFitScopes ?? true;

  if (requestFit) {
    provider.addScope('https://www.googleapis.com/auth/fitness.activity.write');
    provider.addScope('https://www.googleapis.com/auth/fitness.heart_rate.write');
  }

  const customParams: Record<string, string> = {
    prompt: 'select_account',
  };
  if (options?.loginHintEmail) {
    customParams.login_hint = options.loginHintEmail;
  }
  provider.setCustomParameters(customParams);

  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  const accessToken = credential?.accessToken || null;

  if (accessToken && result.user) {
    setCachedGoogleFitToken({
      uid: result.user.uid,
      email: result.user.email || '',
      accessToken,
      expiresAtMs: Date.now() + 55 * 60 * 1000,
      hasGoogleFitScopes: requestFit,
    });
  }

  appendLocalAuditLogEntry({
    level: 'SECURITY',
    category: 'AUTH',
    message: `Pomyślna autoryzacja Google OAuth (UID: ${result.user.uid.slice(
      0,
      8
    )}..., Google Fit: ${requestFit ? 'TAK' : 'NIE'})`,
    uid: result.user.uid,
    deviceFingerprint: getFirebaseConfigFingerprint(activeConfig),
  });

  return {
    user: result.user,
    accessToken,
    hasGoogleFitScopes: requestFit,
  };
}

export async function signOutGoogleRider(): Promise<void> {
  if (auth) {
    const uid = auth.currentUser?.uid;
    await signOut(auth);
    appendLocalAuditLogEntry({
      level: 'SECURITY',
      category: 'AUTH',
      message: 'Wylogowano sesję Google OAuth na urządzeniu.',
      uid,
      deviceFingerprint: getFirebaseConfigFingerprint(activeConfig),
    });
  }
}

export function subscribeToGoogleAuth(
  onUserChanged: (user: User | null) => void
): () => void {
  if (!auth || !isConfigured) {
    onUserChanged(null);
    return () => {};
  }
  return onAuthStateChanged(auth, (user) => {
    const hasGoogleProvider = Boolean(
      user?.providerData?.some((p: { providerId?: string }) => p?.providerId === 'google.com')
    );
    if (user && (user.isAnonymous || !hasGoogleProvider)) {
      appendLocalAuditLogEntry({
        level: 'SECURITY',
        category: 'SECURITY_AUDIT',
        message:
          'Zablokowano próbę autoryzacji spoza dostawcy google.com lub sesję anonimową.',
        uid: user.uid,
        deviceFingerprint: getFirebaseConfigFingerprint(activeConfig),
      });
      signOut(auth).catch(() => {});
      onUserChanged(null);
      return;
    }
    onUserChanged(user);
  });
}
