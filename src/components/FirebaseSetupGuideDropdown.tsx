import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  Copy,
  Check,
  ExternalLink,
  Lock,
  Database,
  KeyRound,
  Globe,
} from 'lucide-react';
import {
  activeConfig,
  getAuthorizedDomainHostname,
  RECOMMENDED_FIRESTORE_RULES_CODE,
} from '../lib/firebase';

interface FirebaseSetupGuideDropdownProps {
  defaultOpen?: boolean;
  onNotifyToast?: (msg: string) => void;
}

export const FirebaseSetupGuideDropdown: React.FC<
  FirebaseSetupGuideDropdownProps
> = ({ defaultOpen = false, onNotifyToast }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [copiedRules, setCopiedRules] = useState(false);
  const [copiedDomain, setCopiedDomain] = useState(false);

  const projectId = activeConfig?.projectId || 'twoj-projekt';
  const hasRealProject = Boolean(
    activeConfig?.projectId && activeConfig.projectId.length >= 3
  );

  const handleCopyRules = async () => {
    try {
      await navigator.clipboard.writeText(RECOMMENDED_FIRESTORE_RULES_CODE);
      setCopiedRules(true);
      onNotifyToast?.(
        'Skopiowano kompletny kod reguł bezpieczeństwa firestore.rules do schowka!'
      );
      window.setTimeout(() => setCopiedRules(false), 2600);
    } catch {
      onNotifyToast?.('Zaznacz i skopiuj reguły ręcznie z pola poniżej.');
    }
  };

  const authorizedDomain = getAuthorizedDomainHostname();

  const handleCopyDomain = async () => {
    try {
      await navigator.clipboard.writeText(authorizedDomain);
      setCopiedDomain(true);
      onNotifyToast?.(`Skopiowano domenę autoryzowaną: ${authorizedDomain}`);
      window.setTimeout(() => setCopiedDomain(false), 2400);
    } catch {
      onNotifyToast?.(`Domena do dodania: ${authorizedDomain}`);
    }
  };

  return (
    <div className="rounded-2xl bg-[#131B26] border border-emerald-500/40 overflow-hidden transition-colors">
      {/* Collapsible Dropdown Trigger Header */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="w-full min-h-[56px] px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-slate-800/30 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border transition-colors ${
              isOpen
                ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                : 'bg-[#0B0F17] text-emerald-400 border-slate-800'
            }`}
          >
            {isOpen ? (
              <ChevronDown className="w-5 h-5" />
            ) : (
              <ChevronRight className="w-5 h-5" />
            )}
          </div>
          <div className="min-w-0">
            <div className="text-xs sm:text-sm font-bold text-white flex flex-wrap items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                Instrukcja Krok po Kroku: Konfiguracja Firestore & Reguły Bezpieczeństwa (firestore.rules)
              </span>
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-[10px] font-bold text-emerald-300">
                Zero Anonymous · Tylko Google OAuth + Izolacja UID
              </span>
            </div>
            <p className="text-[11px] text-slate-400 truncate mt-0.5">
              Kliknij, aby rozwinąć przewodnik konfiguracji konsoli Firebase i skopiować gotowe reguły blokujące dostęp osobom niepowołanym
            </p>
          </div>
        </div>

        <span className="text-xs font-bold text-emerald-400 shrink-0 hidden sm:inline">
          {isOpen ? 'Zwiń instrukcję' : 'Rozwiń instrukcję'}
        </span>
      </button>

      {/* Expandable Step-by-Step Guide Content */}
      {isOpen && (
        <div className="border-t border-slate-800 p-4 sm:p-5 space-y-4 bg-[#0B0F17]/50 text-xs">
          {/* Security Architecture Summary Banner */}
          <div className="rounded-xl bg-[#131B26] border border-emerald-500/40 p-3.5 space-y-1.5">
            <div className="font-bold text-emerald-400 flex items-center gap-1.5">
              <Lock className="w-4 h-4 shrink-0" />
              <span>
                Jak działa ochrona Twojej bazy (Zero Anonimów + Weryfikacja Configu + Izolacja UID):
              </span>
            </div>
            <p className="text-slate-300 leading-relaxed">
              1) Aplikacja na urządzeniu wpuszcza do ekranu logowania{' '}
              <strong className="text-white">
                wyłącznie wtedy, gdy w pamięci lokalnej PWA załadowany jest kompletny obiekt{' '}
                <code>firebaseConfig</code>
              </strong>{' '}
              (z prawidłowym <code>apiKey</code>, <code>authDomain</code>,{' '}
              <code>projectId</code> i <code>appId</code>).
              <br />
              2) Reguły <code>firestore.rules</code> po stronie serwera Google
              całkowicie blokują logowanie anonimowe (
              <code>sign_in_provider == &apos;google.com&apos;</code> oraz{' '}
              <code>email_verified == true</code>) i pozwalają na zapis/edycję/usuwanie
              profilu oraz treningów wyłącznie właścicielowi przypisanemu po{' '}
              <code>request.auth.uid</code>.
            </p>
          </div>

          {/* 5 Step-by-Step Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* STEP 1 */}
            <div className="rounded-xl bg-[#131B26] border border-slate-800 p-3.5 space-y-1.5">
              <div className="font-bold text-white flex items-center gap-1.5">
                <KeyRound className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Krok 1. Pobierz firebaseConfig z Konsoli Firebase</span>
              </div>
              <p className="text-slate-300 leading-relaxed">
                Wejdź na{' '}
                <a
                  href={
                    hasRealProject
                      ? `https://console.firebase.google.com/project/${projectId}/settings/general`
                      : 'https://console.firebase.google.com/'
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 font-semibold underline underline-offset-2"
                >
                  Firebase Console → Project settings → General
                </a>
                , przewiń na dół do sekcji <strong>Your apps (Web app)</strong>,
                skopiuj blok <code>const firebaseConfig = &#123; ... &#125;</code> i
                wklej go w formularzu konfiguracji urządzenia.
              </p>
            </div>

            {/* STEP 2 */}
            <div className="rounded-xl bg-[#131B26] border border-slate-800 p-3.5 space-y-1.5">
              <div className="font-bold text-white flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  Krok 2. Włącz tylko Google Sign-In (Wyłącz Anonymous)
                </span>
              </div>
              <p className="text-slate-300 leading-relaxed">
                W menu{' '}
                <a
                  href={
                    hasRealProject
                      ? `https://console.firebase.google.com/project/${projectId}/authentication/providers`
                      : 'https://console.firebase.google.com/'
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 font-semibold underline underline-offset-2"
                >
                  Authentication → Sign-in method
                </a>{' '}
                włącz dostawcę <strong>Google</strong> (Enable) i wybierz swój adres
                e-mail wsparcia. Upewnij się, że dostawca{' '}
                <strong className="text-rose-400">Anonymous jest WYŁĄCZONY</strong>.
              </p>
            </div>

            {/* STEP 3 */}
            <div className="rounded-xl bg-[#131B26] border border-slate-800 p-3.5 space-y-2">
              <div className="font-bold text-white flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-sky-400 shrink-0" />
                <span>
                  Krok 3. Dodaj domenę GitHub Pages do Authorized Domains
                </span>
              </div>
              <p className="text-slate-300 leading-relaxed">
                W zakładce{' '}
                <a
                  href={
                    hasRealProject
                      ? `https://console.firebase.google.com/project/${projectId}/authentication/settings`
                      : 'https://console.firebase.google.com/'
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sky-400 font-semibold underline underline-offset-2"
                >
                  Authentication → Settings → Authorized domains
                </a>{' '}
                kliknij <strong>Add domain</strong> i wklej domenę swojego GitHub
                Pages:
              </p>
              <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-[#0B0F17] border border-slate-800">
                <code className="font-mono-tabular font-bold text-emerald-400 truncate">
                  {authorizedDomain}
                </code>
                <button
                  type="button"
                  onClick={handleCopyDomain}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-[11px] flex items-center gap-1 shrink-0"
                >
                  {copiedDomain ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Skopiowano</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Kopiuj domenę</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* STEP 4 */}
            <div className="rounded-xl bg-[#131B26] border border-slate-800 p-3.5 space-y-1.5">
              <div className="font-bold text-white flex items-center gap-1.5">
                <Database className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  Krok 4. Utwórz bazę Cloud Firestore (Production Mode)
                </span>
              </div>
              <p className="text-slate-300 leading-relaxed">
                Otwórz{' '}
                <a
                  href={
                    hasRealProject
                      ? `https://console.firebase.google.com/project/${projectId}/firestore`
                      : 'https://console.firebase.google.com/'
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 font-semibold underline underline-offset-2"
                >
                  Firestore Database
                </a>
                , kliknij <strong>Create database</strong>, wybierz lokalizację
                europejską (np. <code>eur3 (europe-west)</code>) i tryb{' '}
                <strong>Start in production mode</strong>. Po pierwszym zalogowaniu
                aplikacja sama utworzy kolekcje <code>hubConfig</code>,{' '}
                <code>profiles</code>, <code>plannedWorkouts</code> i{' '}
                <code>completedWorkouts</code>.
              </p>
            </div>
          </div>

          {/* STEP 5: COPY-READY FIRESTORE.RULES */}
          <div className="rounded-xl bg-[#131B26] border border-emerald-500/50 p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="space-y-0.5">
                <div className="font-bold text-white text-xs sm:text-sm flex items-center gap-2">
                  <Lock className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    Krok 5. Wklej poniższe reguły w Firestore Database → Rules i kliknij „Publish”
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Te reguły odrzucają każdy niezalogowany lub anonimowy ruch oraz
                  izolują zapis dokumentów po identyfikatorze UID zalogowanego konta
                  Google.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleCopyRules}
                  className="min-h-[38px] px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                >
                  {copiedRules ? (
                    <>
                      <Check className="w-4 h-4 shrink-0" />
                      <span>Skopiowano firestore.rules!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 shrink-0" />
                      <span>Kopiuj gotowe reguły firestore.rules</span>
                    </>
                  )}
                </button>

                {hasRealProject && (
                  <a
                    href={`https://console.firebase.google.com/project/${projectId}/firestore/databases/-default-/rules`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[38px] px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <span>Otwórz Reguły w Konsoli</span>
                    <ExternalLink className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  </a>
                )}
              </div>
            </div>

            <pre className="w-full max-h-[300px] overflow-y-auto p-3.5 rounded-xl bg-[#0B0F17] border border-slate-800 font-mono-tabular text-[11px] leading-relaxed text-emerald-300 select-all whitespace-pre-wrap break-words">
              {RECOMMENDED_FIRESTORE_RULES_CODE}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
