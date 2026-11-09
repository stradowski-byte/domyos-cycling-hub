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

// Gatekeep 1: Never hardcode any Firebase credentials in source code.
// Load firebase-applet-config.json ONLY in local AI Studio dev preview when not simulating production.
// During `npm run build` (GitHub Pages), scripts/build-gh-pages.mjs overwrites firebase-applet-config.json with `{}`.
const isLocalEnv = isAIStudioPreviewEnvironment();
const forceProd =
  typeof window !== 'undefined' &&
  window.localStorage.getItem(FORCE_PROD_MODE_KEY) === 'true';

let defaultConfig: Record<string, any> = {};
if (isLocalEnv && !forceProd) {
  const defaultConfigs = import.meta.glob('../../firebase-applet-config.json', {
    eager: true,
  });
  defaultConfig =
    (Object.values(defaultConfigs)[0] as any)?.default ||
    Object.values(defaultConfigs)[0] ||
    {};
}

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

  // Include optional non-default Firestore database ID only if explicitly custom
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
 * Parses a Firebase configuration pasted from the Firebase Console in any format:
 * - Full SDK snippet (`import { initializeApp } ... const firebaseConfig = { apiKey: "...", ... };`)
 * - `const firebaseConfig = { apiKey: "...", ... };`
 * - Raw key-value lines without `{ }` braces (`apiKey: "...", projectId: "..."`)
 * - Object with unquoted keys (`{ apiKey: "...", projectId: "..." }`)
 * - Standard JSON (`{ "apiKey": "...", "projectId": "..." }`)
 */
export function parseCustomFirebaseInput(rawInput: string): Record<string, string> {
  if (!rawInput || !rawInput.trim()) {
    throw new Error(
      'Wklej konfigurację firebaseConfig skopiowaną z konsoli Firebase.'
    );
  }

  // 1. Strip block comments /* ... */ and single-line comments // ... (outside of URLs like https://)
  const withoutComments = rawInput
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  // 2. If the input contains `firebaseConfig = { ... }`, isolate that block first to avoid matching anything outside
  const configBlockMatch = withoutComments.match(
    /firebaseConfig\s*=\s*\{([\s\S]*?)\}/
  );
  const targetText = configBlockMatch ? configBlockMatch[1] : withoutComments;

  const extracted: Record<string, string> = {};
  const allowedKeys = new Set<string>(FIREBASE_CONFIG_ORDERED_KEYS);

  // 3. Match both unquoted keys (`apiKey: "..."`) and quoted keys (`"apiKey": "..."` or `'apiKey': '...'`)
  // Works with or without surrounding `{ }` brackets.
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

  if (!extracted.apiKey || !extracted.projectId) {
    throw new Error(
      'Nie znaleziono wymaganych pól apiKey oraz projectId. Skopiuj i wklej konfigurację firebaseConfig bezpośrednio z konsoli Firebase.'
    );
  }

  return extracted;
}

export function getActiveFirebaseConfig() {
  try {
    const saved = localStorage.getItem(CUSTOM_FIREBASE_CONFIG_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.apiKey && parsed.projectId) {
        return { config: parsed, isCustom: true };
      }
    }
  } catch (e) {
    console.error('Failed to parse custom firebase config', e);
  }
  return { config: defaultConfig, isCustom: false };
}

export function saveCustomFirebaseConfig(rawInput: string) {
  const parsed = parseCustomFirebaseInput(rawInput);
  localStorage.setItem(CUSTOM_FIREBASE_CONFIG_KEY, JSON.stringify(parsed));
  window.location.reload();
}

export function clearCustomFirebaseConfig() {
  localStorage.removeItem(CUSTOM_FIREBASE_CONFIG_KEY);
  window.location.reload();
}

const { config: activeConfig, isCustom: isUsingCustomConfig } =
  getActiveFirebaseConfig();

const isConfigured = Boolean(
  activeConfig && activeConfig.apiKey && activeConfig.projectId
);

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

// Connection sanity test on boot when configured
async function testFirestoreConnection() {
  if (!db) return;
  try {
    await getDocFromServer(doc(db, 'hubConfig', 'connection_check'));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
      console.warn(
        'Firestore działa obecnie w trybie offline lub czeka na połączenie.'
      );
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
    email: string | null | undefined;
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
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
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
 * Supports `loginHintEmail` for 1-tap Fast User Switching between household riders,
 * and requests Google Fit scopes when `requestGoogleFitScopes` is true.
 */
export async function signInRiderWithGoogle(options?: {
  loginHintEmail?: string;
  requestGoogleFitScopes?: boolean;
}): Promise<{
  user: User;
  accessToken: string | null;
  hasGoogleFitScopes: boolean;
}> {
  if (!auth) {
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
      // Google OAuth access tokens are valid for ~55 minutes
      expiresAtMs: Date.now() + 55 * 60 * 1000,
      hasGoogleFitScopes: requestFit,
    });
  }

  return {
    user: result.user,
    accessToken,
    hasGoogleFitScopes: requestFit,
  };
}

export async function signOutGoogleRider(): Promise<void> {
  if (auth) {
    await signOut(auth);
  }
}

export function subscribeToGoogleAuth(
  onUserChanged: (user: User | null) => void
): () => void {
  if (!auth) {
    onUserChanged(null);
    return () => {};
  }
  return onAuthStateChanged(auth, (user) => {
    // Reject anonymous sessions if any ever existed
    if (user && user.isAnonymous) {
      signOut(auth).catch(() => {});
      onUserChanged(null);
      return;
    }
    onUserChanged(user);
  });
}
