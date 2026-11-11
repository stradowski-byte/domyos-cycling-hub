import React, { useState } from 'react';
import {
  Smartphone,
  ShieldCheck,
  Database,
  Cloud,
  CheckCircle2,
  AlertTriangle,
  Users,
  RefreshCw,
  Terminal,
  Lock,
  Activity,
  Zap,
} from 'lucide-react';
import { KnownGoogleRider } from '../types/cycling';
import {
  activeConfig,
  clearCustomFirebaseConfig,
  FIREBASE_CONSOLE_PLACEHOLDER,
  formatFirebaseConfigText,
  getGitHubPagesInstallUrl,
  isAIStudioPreviewEnvironment,
  isConfigured,
  isUsingCustomConfig,
  saveCustomFirebaseConfig,
} from '../lib/firebase';
import { FirebaseSetupGuideDropdown } from './FirebaseSetupGuideDropdown';
import { forceUpdatePwaAndClearCaches } from '../services/usePWAInstall';

interface PwaAndAuthGateScreenProps {
  isPwaInstalled: boolean;
  isPwaInstallable: boolean;
  isIOS: boolean;
  isAiStudioBypassActive: boolean;
  onActivateAiStudioBypass: () => void;
  onInstallPwa: () => Promise<boolean>;
  onSignInGoogle: (loginHintEmail?: string) => Promise<void>;
  knownRiders: KnownGoogleRider[];
}

export const PwaAndAuthGateScreen: React.FC<PwaAndAuthGateScreenProps> = ({
  isPwaInstalled,
  isPwaInstallable,
  isIOS,
  isAiStudioBypassActive,
  onActivateAiStudioBypass,
  onInstallPwa,
  onSignInGoogle,
  knownRiders,
}) => {
  const isAiStudioHost = isAIStudioPreviewEnvironment();
  const isPwaUnlocked = isPwaInstalled || (isAiStudioHost && isAiStudioBypassActive);

  const [firebaseJsonText, setFirebaseJsonText] = useState(() =>
    isConfigured && activeConfig?.apiKey
      ? formatFirebaseConfigText(activeConfig)
      : ''
  );
  const [configError, setConfigError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [showEditConfigInStep3, setShowEditConfigInStep3] = useState(false);

  const handleSaveFirebaseConfig = (e: React.FormEvent) => {
    e.preventDefault();
    setConfigError(null);
    try {
      saveCustomFirebaseConfig(firebaseJsonText);
    } catch (err: any) {
      setConfigError(
        err?.message ||
          'Nieprawidłowy format konfiguracji. Skopiuj i wklej firebaseConfig bezpośrednio z konsoli Firebase.'
      );
    }
  };

  const handleGoogleSignInClick = async (hintEmail?: string) => {
    setAuthError(null);
    setIsSigningIn(true);
    try {
      await onSignInGoogle(hintEmail);
    } catch (err: any) {
      setAuthError(
        err?.message ||
          'Logowanie Google OAuth nie powiodło się. Sprawdź, czy domena jest dodana do Authorized Domains w konsoli Firebase.'
      );
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#0B0F17] text-slate-100 flex flex-col justify-between p-4 sm:p-6 overflow-x-hidden">
      {/* Top Identity Bar */}
      <header className="max-w-2xl w-full mx-auto flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
            <Zap className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-bold text-white truncate">
              Domyos Cycling Hub · ERG & FIT Studio
            </h1>
            <p className="text-[11px] text-slate-400 truncate">
              Public GitHub Safe Edition · Zero Danych Prywatnych w Repozytorium
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => void forceUpdatePwaAndClearCaches()}
            className="min-h-[32px] px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] font-bold text-emerald-400 flex items-center gap-1 transition-colors"
            title="Wymuś odświeżenie PWA: wyczyść cache Service Workera i przeładuj aplikację"
          >
            <RefreshCw className="w-3.5 h-3.5 shrink-0" />
            <span>Refresh</span>
          </button>

          <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-[11px] font-bold text-emerald-300 hidden sm:flex items-center gap-1 shrink-0">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Standalone Guard</span>
          </span>
        </div>
      </header>

      {/* Main 3-Step Gate Card */}
      <main className="max-w-2xl w-full mx-auto my-auto py-6 space-y-5">
        {/* Progress Stepper */}
        <div className="grid grid-cols-3 gap-2">
          <div
            className={`rounded-xl p-2.5 border text-xs flex items-center gap-2 ${
              isPwaUnlocked
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : 'bg-sky-500/15 border-sky-500 text-white font-bold'
            }`}
          >
            {isPwaUnlocked ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <Smartphone className="w-4 h-4 text-sky-400 shrink-0" />
            )}
            <span className="truncate">1. Instalacja PWA</span>
          </div>

          <div
            className={`rounded-xl p-2.5 border text-xs flex items-center gap-2 ${
              !isPwaUnlocked
                ? 'bg-[#131B26]/60 border-slate-800 text-slate-500'
                : isConfigured
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : 'bg-amber-500/15 border-amber-500 text-white font-bold'
            }`}
          >
            {isPwaUnlocked && isConfigured ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <Database className="w-4 h-4 shrink-0" />
            )}
            <span className="truncate">2. Baza Firebase</span>
          </div>

          <div
            className={`rounded-xl p-2.5 border text-xs flex items-center gap-2 ${
              !isPwaUnlocked || !isConfigured
                ? 'bg-[#131B26]/60 border-slate-800 text-slate-500'
                : 'bg-emerald-500/15 border-emerald-500 text-white font-bold'
            }`}
          >
            <Cloud className="w-4 h-4 shrink-0" />
            <span className="truncate">3. Konto Google</span>
          </div>
        </div>

        {/* ===================================================================
            STAGE 1: MANDATORY STANDALONE PWA INSTALLATION GATE
           =================================================================== */}
        {!isPwaUnlocked && (
          <div className="rounded-3xl bg-[#131B26] border border-sky-500/50 p-5 sm:p-7 space-y-5 shadow-2xl">
            <div className="flex items-start gap-3.5">
              <div className="p-3 rounded-2xl bg-sky-500/20 border border-sky-500/40 text-sky-400 shrink-0">
                <Lock className="w-6 h-6" />
              </div>
              <div className="space-y-1.5 min-w-0">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-sky-500/20 text-[11px] font-bold text-sky-300">
                  KROK 1 Z 3 · WYMAGANA INSTALACJA NA URZĄDZENIU
                </div>
                <h2 className="text-lg sm:text-xl font-bold text-white">
                  Zainstaluj aplikację PWA na telefonie lub tablecie
                </h2>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  Ze względów bezpieczeństwa na publicznym GitHubie nie są
                  przechowywane żadne dane prywatne, profile ani klucze bazy
                  danych. Konfiguracja Firebase oraz logowanie Google są dostępne{' '}
                  <strong className="text-white">
                    wyłącznie po zainstalowaniu aplikacji PWA na urządzeniu
                    mobilnym
                  </strong>
                  .
                </p>
              </div>
            </div>

            {isPwaInstallable && (
              <button
                onClick={() => onInstallPwa()}
                className="w-full min-h-[50px] px-5 py-3 rounded-2xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2.5 transition-colors shadow-lg"
              >
                <Smartphone className="w-5 h-5 shrink-0" />
                <span>Zainstaluj Aplikację PWA Teraz (1-Klik)</span>
              </button>
            )}

            <div className="rounded-2xl bg-[#0B0F17] border border-sky-500/40 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
              <div className="min-w-0">
                <div className="text-[11px] text-slate-400">
                  Adres instalacji aplikacji (GitHub Pages):
                </div>
                <a
                  href={getGitHubPagesInstallUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono-tabular font-bold text-emerald-400 hover:underline break-all"
                >
                  {getGitHubPagesInstallUrl()}
                </a>
              </div>
              <a
                href={getGitHubPagesInstallUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[38px] px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shrink-0 transition-colors"
              >
                <Smartphone className="w-4 h-4 shrink-0" />
                <span>Otwórz GitHub Pages</span>
              </a>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="rounded-2xl bg-[#0B0F17] border border-slate-800 p-4 space-y-1.5">
                <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 shrink-0" />
                  <span>Android (Chrome / Edge / Brave)</span>
                </div>
                <p className="text-slate-300 leading-relaxed">
                  Kliknij przycisk instalacji powyżej lub otwórz menu przeglądarki{' '}
                  <code className="px-1.5 py-0.5 rounded bg-slate-800 text-white font-mono-tabular">
                    ⋮
                  </code>{' '}
                  w prawym górnym rogu i wybierz{' '}
                  <strong className="text-white">„Zainstaluj aplikację”</strong>,
                  a następnie uruchom ją z ikony na ekranie głównym.
                </p>
              </div>

              <div
                className={`rounded-2xl bg-[#0B0F17] border p-4 space-y-1.5 ${
                  isIOS ? 'border-sky-500/60' : 'border-slate-800'
                }`}
              >
                <div className="font-bold text-sky-400 flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 shrink-0" />
                  <span>iPhone / iPad (Safari)</span>
                </div>
                <p className="text-slate-300 leading-relaxed">
                  Stuknij przycisk{' '}
                  <strong className="text-white">Udostępnij</strong> na dolnym
                  pasku Safari, wybierz{' '}
                  <strong className="text-white">
                    „Dodaj do ekranu początkowego”
                  </strong>{' '}
                  i otwórz zainstalowaną aplikację z pulpitu.
                </p>
              </div>
            </div>

            {/* AI Studio Preview Bypass Button (strictly limited to AI Studio / localhost dev environment) */}
            {isAiStudioHost && (
              <div className="rounded-2xl bg-amber-500/10 border border-amber-500/40 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5 text-xs">
                  <div className="font-bold text-amber-300 flex items-center gap-1.5">
                    <Terminal className="w-4 h-4 shrink-0" />
                    <span>Środowisko deweloperskie AI Studio Preview</span>
                  </div>
                  <p className="text-slate-300 text-[11px] leading-relaxed">
                    Wewnątrz ramki podglądu AI Studio na komputerze nie można
                    zainstalować PWA. Na GitHub Pages ten przycisk jest
                    niedostępny.
                  </p>
                </div>
                <button
                  onClick={onActivateAiStudioBypass}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shrink-0 transition-colors"
                >
                  Tryb testowy AI Studio (Pomiń blokadę)
                </button>
              </div>
            )}
          </div>
        )}

        {/* ===================================================================
            STAGE 2: DEVICE-LOCAL FIREBASE JSON CONFIGURATION
           =================================================================== */}
        {isPwaUnlocked && (!isConfigured || showEditConfigInStep3) && (
          <form
            onSubmit={handleSaveFirebaseConfig}
            className="rounded-3xl bg-[#131B26] border border-amber-500/50 p-5 sm:p-7 space-y-4 shadow-2xl"
          >
            <div className="flex items-start gap-3.5">
              <div className="p-3 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 shrink-0">
                <Database className="w-6 h-6" />
              </div>
              <div className="space-y-1 min-w-0">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-amber-500/20 text-[11px] font-bold text-amber-300">
                  KROK 2 Z 3 · KONFIGURACJA BAZY W PAMIĘCI URZĄDZENIA
                </div>
                <h2 className="text-lg sm:text-xl font-bold text-white">
                  Wklej konfigurację JSON swojego projektu Firebase
                </h2>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Konfiguracja zostanie zapisana{' '}
                  <strong className="text-emerald-400">
                    wyłącznie w pamięci lokalnej tej zainstalowanej aplikacji
                  </strong>{' '}
                  na Twoim telefonie lub tablecie. Żadne klucze nie trafiają na
                  GitHub.
                </p>
              </div>
            </div>

            {configError && (
              <div className="rounded-xl bg-rose-500/15 border border-rose-500/40 p-3 text-xs text-rose-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{configError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300">
                Konfiguracja firebaseConfig (z Konsoli Firebase → Project settings →
                General → Your apps):
              </label>
              <textarea
                rows={10}
                required
                value={firebaseJsonText}
                onChange={(e) => setFirebaseJsonText(e.target.value)}
                placeholder={FIREBASE_CONSOLE_PLACEHOLDER}
                className="w-full p-3.5 rounded-2xl bg-[#0B0F17] border border-slate-700 font-mono-tabular text-xs text-emerald-300 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
              {showEditConfigInStep3 ? (
                <button
                  type="button"
                  onClick={() => setShowEditConfigInStep3(false)}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200"
                >
                  Wróć do logowania Google
                </button>
              ) : (
                <span className="text-[11px] text-slate-400">
                  Wklej cały obiekt <code>const firebaseConfig = &#123;...&#125;</code> lub same linie bez nawiasów
                </span>
              )}

              <div className="flex items-center gap-2">
                {isUsingCustomConfig && (
                  <button
                    type="button"
                    onClick={clearCustomFirebaseConfig}
                    className="min-h-[42px] px-3.5 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 font-semibold text-xs"
                  >
                    Wyczyść z urządzenia
                  </button>
                )}
                <button
                  type="submit"
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm flex items-center gap-2 transition-colors shadow-lg"
                >
                  <Database className="w-4 h-4 shrink-0" />
                  <span>Zapisz w pamięci urządzenia</span>
                </button>
              </div>
            </div>

            {/* Collapsible Step-by-Step Firebase & Security Rules Guide Dropdown */}
            <div className="pt-2">
              <FirebaseSetupGuideDropdown defaultOpen={false} />
            </div>
          </form>
        )}

        {/* ===================================================================
            STAGE 3: MANDATORY GOOGLE OAUTH LOGIN (GOOGLE-ONLY PROFILES)
           =================================================================== */}
        {isPwaUnlocked && isConfigured && !showEditConfigInStep3 && (
          <div className="rounded-3xl bg-[#131B26] border border-emerald-500/50 p-5 sm:p-7 space-y-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3.5 min-w-0">
                <div className="p-3 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 shrink-0">
                  <Users className="w-6 h-6" />
                </div>
                <div className="space-y-1 min-w-0">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-emerald-500/20 text-[11px] font-bold text-emerald-300">
                    KROK 3 Z 3 · AUTORYZACJA GOOGLE OAUTH (ZERO ANONIMÓW)
                  </div>
                  <h2 className="text-lg sm:text-xl font-bold text-white">
                    Zaloguj się kontem Google, aby aktywować profil
                  </h2>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    W aplikacji nie istnieją żadne profile domyślne ani
                    anonimowe. Dostęp do bazy{' '}
                    <strong className="text-emerald-400">
                      {activeConfig?.projectId}
                    </strong>{' '}
                    jest otwarty wyłącznie wtedy, gdy na urządzeniu załadowano
                    właściwy <code>firebaseConfig</code> i zalogowano
                    zweryfikowanym kontem Google OAuth.
                  </p>
                </div>
              </div>
            </div>

            {authError && (
              <div className="rounded-xl bg-rose-500/15 border border-rose-500/40 p-3.5 text-xs text-rose-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{authError}</span>
              </div>
            )}

            {/* Primary Google OAuth Login Button */}
            <button
              onClick={() => handleGoogleSignInClick()}
              disabled={isSigningIn}
              className="w-full min-h-[52px] px-5 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-sm flex items-center justify-center gap-2.5 transition-colors shadow-lg"
            >
              <RefreshCw
                className={`w-5 h-5 shrink-0 ${
                  isSigningIn ? 'animate-spin' : ''
                }`}
              />
              <span>
                {isSigningIn
                  ? 'Autoryzacja konta Google...'
                  : 'Zaloguj się kontem Google (Firebase + Google Fit)'}
              </span>
            </button>

            {/* Previously Logged-In Google Accounts on This Device */}
            {knownRiders.length > 0 && (
              <div className="space-y-2.5 pt-2 border-t border-slate-800">
                <div className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Zapamiętane konta Google na tym urządzeniu (Szybki wybór):
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {knownRiders.map((rider) => (
                    <button
                      key={rider.uid || rider.email}
                      onClick={() => handleGoogleSignInClick(rider.email)}
                      disabled={isSigningIn}
                      className="rounded-2xl bg-[#0B0F17] hover:bg-slate-900 border border-slate-800 hover:border-emerald-500/50 p-3 flex items-center justify-between gap-2.5 text-left transition-all"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {rider.photoURL ? (
                          <img
                            src={rider.photoURL}
                            alt={rider.displayName}
                            className="w-9 h-9 rounded-full border shrink-0"
                            style={{
                              borderColor: rider.avatarColor || '#10B981',
                            }}
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs text-slate-950 shrink-0"
                            style={{
                              backgroundColor: rider.avatarColor || '#10B981',
                            }}
                          >
                            {(rider.displayName || 'G')
                              .slice(0, 2)
                              .toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate">
                            {rider.displayName}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono-tabular truncate">
                            {rider.email} · FTP {rider.ftpWatts}W
                          </div>
                        </div>
                      </div>
                      <Activity className="w-4 h-4 text-emerald-400 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Collapsible Step-by-Step Firebase & Security Rules Guide Dropdown */}
            <FirebaseSetupGuideDropdown defaultOpen={false} />

            {/* Footer Controls to Inspect/Change Device Firebase Config */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-800 text-xs text-slate-400">
              <span>
                Połączony projekt:{' '}
                <strong className="text-emerald-400 font-mono-tabular">
                  {activeConfig?.projectId}
                </strong>
              </span>
              <button
                type="button"
                onClick={() => setShowEditConfigInStep3(true)}
                className="text-sky-400 hover:text-sky-300 font-semibold underline underline-offset-4"
              >
                Zmień konfigurację JSON Firebase w urządzeniu
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Footer Security Note */}
      <footer className="max-w-2xl w-full mx-auto text-center text-[11px] text-slate-500 border-t border-slate-900 pt-3">
        Domyos Cycling Hub PWA · Wszystkie dane, klucze i profile przechowywane
        są wyłącznie po zainstalowaniu aplikacji na urządzeniu mobilnym oraz w
        Twojej bazie Firebase Firestore.
      </footer>
    </div>
  );
};
