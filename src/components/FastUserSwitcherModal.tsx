import React, { useState } from 'react';
import {
  Users,
  CheckCircle2,
  Plus,
  RefreshCw,
  LogOut,
  Zap,
  Activity,
  Cloud,
  X,
  ShieldCheck,
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  AthleteProfile,
  KnownGoogleRider,
  ProfileId,
} from '../types/cycling';
import { getCachedGoogleFitToken } from '../lib/firebase';

interface FastUserSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
  profiles: Record<ProfileId, AthleteProfile>;
  activeProfile: AthleteProfile;
  googleUser: User | null;
  knownRiders: KnownGoogleRider[];
  onSelectAndSwitchRider: (
    profile: AthleteProfile,
    triggerGoogleOAuthSwitch: boolean
  ) => Promise<void>;
  onAddNewGoogleRider: () => Promise<void>;
  onRefreshGoogleFitToken: () => Promise<void>;
  onSignOutGoogle: () => Promise<void>;
  onGoToProfileSettings: (profileId: ProfileId) => void;
}

export const FastUserSwitcherModal: React.FC<FastUserSwitcherModalProps> = ({
  isOpen,
  onClose,
  profiles,
  activeProfile,
  googleUser,
  knownRiders,
  onSelectAndSwitchRider,
  onAddNewGoogleRider,
  onRefreshGoogleFitToken,
  onSignOutGoogle,
  onGoToProfileSettings,
}) => {
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);

  if (!isOpen) return null;

  const profileList = Object.values(profiles);
  const hasActiveFitToken = Boolean(getCachedGoogleFitToken(googleUser?.uid));

  const handleCardSwitch = async (
    prof: AthleteProfile,
    needsOAuthSwitch: boolean
  ) => {
    setSwitchingId(prof.id);
    try {
      await onSelectAndSwitchRider(prof, needsOAuthSwitch);
      onClose();
    } finally {
      setSwitchingId(null);
    }
  };

  const handleAddAccount = async () => {
    setIsAddingNew(true);
    try {
      await onAddNewGoogleRider();
      onClose();
    } finally {
      setIsAddingNew(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-3xl bg-[#131B26] border border-emerald-500/40 p-4 sm:p-6 space-y-5 shadow-2xl my-auto min-w-0">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 text-emerald-400">
              <Users className="w-5 h-5 shrink-0" />
              <h2 className="text-base sm:text-lg font-bold text-white truncate">
                Szybki Przełącznik Zawodników (Google OAuth)
              </h2>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Każdy zawodnik loguje się własnym kontem Google. Wszystkie profile zapisują dane do jednej wspólnej bazy <strong>Firebase Cloud Firestore</strong> oraz mogą synchronizować jazdy z osobistym kontem <strong>Google Fit</strong> i <strong>Intervals.icu</strong>.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Active Google Session Banner */}
        <div className="rounded-2xl bg-[#0B0F17] border border-slate-800 p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {googleUser?.photoURL ? (
              <img
                src={googleUser.photoURL}
                alt={googleUser.displayName || 'Google'}
                className="w-10 h-10 rounded-full border-2 border-emerald-500 shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-slate-950 shrink-0"
                style={{ backgroundColor: activeProfile.avatarColor || '#10B981' }}
              >
                {(googleUser?.displayName || activeProfile.name || 'U')
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm font-bold text-white truncate">
                  {googleUser
                    ? googleUser.displayName || googleUser.email
                    : 'Brak aktywnej sesji Google OAuth'}
                </span>
                {googleUser && (
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-[10px] font-bold text-emerald-300 shrink-0">
                    Zalogowany
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-400 truncate font-mono-tabular">
                {googleUser?.email
                  ? `${googleUser.email} · Google Fit Token: ${
                      hasActiveFitToken ? 'Aktywny' : 'Wymaga odświeżenia'
                    }`
                  : 'Zaloguj się kontem Google poniżej, aby włączyć zapis do Firebase i Google Fit'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {googleUser && (
              <>
                <button
                  onClick={onRefreshGoogleFitToken}
                  className="min-h-[36px] px-3 py-1.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  title="Odświeża token OAuth dla wysyłki treningów do Google Fit"
                >
                  <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                  <span>Token Google Fit</span>
                </button>
                <button
                  onClick={onSignOutGoogle}
                  className="min-h-[36px] px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 text-xs font-semibold flex items-center gap-1 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5 shrink-0" />
                  <span>Wyloguj</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Riders Grid */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs font-bold text-slate-300 uppercase tracking-wider">
            <span>Wybierz Zawodnika (Przelogowanie 1-klikiem)</span>
            <span className="text-[11px] font-normal text-slate-400">
              {profileList.length} {profileList.length === 1 ? 'profil' : 'profile'} w bazie
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[45vh] overflow-y-auto pr-1">
            {profileList.map((prof) => {
              const isCurrentProfile = prof.id === activeProfile.id;
              const known = knownRiders.find(
                (r) =>
                  r.profileId === prof.id ||
                  (prof.uid && r.uid === prof.uid) ||
                  (prof.email && r.email === prof.email)
              );
              const riderEmail = prof.email || known?.email || '';
              const riderPhoto = prof.photoURL || known?.photoURL;
              const isGoogleAccountMatched = Boolean(
                googleUser &&
                  ((prof.uid && googleUser.uid === prof.uid) ||
                    (riderEmail &&
                      googleUser.email?.toLowerCase() === riderEmail.toLowerCase()))
              );
              const wPerKg = (
                prof.ftpWatts / Math.max(35, prof.weightKg)
              ).toFixed(2);

              return (
                <div
                  key={prof.id}
                  className={`rounded-2xl p-4 border transition-all flex flex-col justify-between gap-3.5 min-w-0 ${
                    isCurrentProfile
                      ? 'bg-emerald-500/15 border-emerald-500 shadow-lg'
                      : 'bg-[#0B0F17] border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2.5 min-w-0">
                    <div className="flex items-center gap-3 min-w-0">
                      {riderPhoto ? (
                        <img
                          src={riderPhoto}
                          alt={prof.name}
                          className="w-11 h-11 rounded-full border-2 shrink-0"
                          style={{ borderColor: prof.avatarColor || '#10B981' }}
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div
                          className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm text-slate-950 shrink-0"
                          style={{
                            backgroundColor: prof.avatarColor || '#10B981',
                          }}
                        >
                          {prof.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold text-white truncate">
                            {prof.name}
                          </span>
                          {isCurrentProfile && (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate font-mono-tabular">
                          {riderEmail || 'Nieprzypisany e-mail Google'}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs font-mono-tabular">
                          <span className="text-emerald-400 font-bold flex items-center gap-0.5">
                            <Zap className="w-3 h-3" /> {prof.ftpWatts}W
                          </span>
                          <span className="text-slate-500">·</span>
                          <span className="text-slate-300">{wPerKg} W/kg</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Integration Status Badges */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-semibold text-emerald-300 flex items-center gap-1">
                      <Cloud className="w-3 h-3" /> Firebase
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md border text-[10px] font-semibold flex items-center gap-1 ${
                        prof.googleFit?.enabled !== false
                          ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                          : 'bg-slate-800 border-slate-700 text-slate-400'
                      }`}
                    >
                      <Activity className="w-3 h-3" /> Google Fit
                    </span>
                    {prof.intervals.enabled && prof.intervals.apiKey.trim() && (
                      <span className="px-2 py-0.5 rounded-md bg-sky-500/15 border border-sky-500/30 text-[10px] font-semibold text-sky-300">
                        Intervals.icu
                      </span>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {isGoogleAccountMatched ? (
                      <button
                        onClick={() => handleCardSwitch(prof, false)}
                        disabled={switchingId === prof.id}
                        className="col-span-2 min-h-[38px] px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>
                          {isCurrentProfile
                            ? 'Aktywny Zawodnik (Konto Google Połączone)'
                            : 'Aktywuj Profil'}
                        </span>
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => handleCardSwitch(prof, true)}
                          disabled={switchingId === prof.id}
                          className="col-span-2 min-h-[38px] px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <RefreshCw
                            className={`w-3.5 h-3.5 shrink-0 ${
                              switchingId === prof.id ? 'animate-spin' : ''
                            }`}
                          />
                          <span className="truncate">
                            {riderEmail
                              ? `Przeloguj Google (${riderEmail.split('@')[0]})`
                              : 'Zaloguj Google i Przypisz'}
                          </span>
                        </button>
                        <button
                          onClick={() => handleCardSwitch(prof, false)}
                          className="min-h-[34px] px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-[11px] flex items-center justify-center transition-colors"
                        >
                          Przełącz lokalnie
                        </button>
                        <button
                          onClick={() => {
                            onGoToProfileSettings(prof.id);
                            onClose();
                          }}
                          className="min-h-[34px] px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-[11px] flex items-center justify-center transition-colors"
                        >
                          Ustawienia FTP/HR
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer: Add New Google Rider */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-slate-800">
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              Nowa osoba? Zaloguj jej konto Google — profil utworzy się automatycznie w wspólnej bazie Firebase.
            </span>
          </div>

          <button
            onClick={handleAddAccount}
            disabled={isAddingNew}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shrink-0 shadow-sm"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>
              {isAddingNew
                ? 'Logowanie Google...'
                : '+ Dodaj / Zaloguj Nowe Konto Google'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
