import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  Lock,
  RefreshCw,
  Download,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Fingerprint,
  FileWarning,
  Cloud,
  Smartphone,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import {
  AuditLogCategory,
  SecurityAuditLogEntry,
} from '../lib/firebase';
import {
  clearAllPrivateAuditLogs,
  getPrivateAuditLogs,
  LiveSecurityAuditReport,
  performEmergencyDeviceWipe,
  recordPrivateAuditLog,
  runLiveSecurityAudit,
  syncPrivateAuditLogsWithFirestore,
} from '../services/securityAndAuditLogger';

interface SecurityAuditAndLogsPanelProps {
  onNotifyToast?: (msg: string) => void;
}

export const SecurityAuditAndLogsPanel: React.FC<
  SecurityAuditAndLogsPanelProps
> = ({ onNotifyToast }) => {
  const [auditReport, setAuditReport] = useState<LiveSecurityAuditReport>(() =>
    runLiveSecurityAudit()
  );
  const [logs, setLogs] = useState<SecurityAuditLogEntry[]>(() =>
    getPrivateAuditLogs()
  );
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | AuditLogCategory>(
    'ALL'
  );
  const [isSyncingLogs, setIsSyncingLogs] = useState(false);
  const [isLogsExpanded, setIsLogsExpanded] = useState(false);
  const [confirmPanicWipe, setConfirmPanicWipe] = useState(false);

  const refreshState = () => {
    setAuditReport(runLiveSecurityAudit());
    setLogs(getPrivateAuditLogs());
  };

  useEffect(() => {
    const handler = () => {
      setLogs(getPrivateAuditLogs());
      setAuditReport(runLiveSecurityAudit());
    };
    window.addEventListener('domyos-audit-log-updated', handler);
    return () => window.removeEventListener('domyos-audit-log-updated', handler);
  }, []);

  const handleRunManualAuditScan = async () => {
    const report = runLiveSecurityAudit();
    setAuditReport(report);
    recordPrivateAuditLog(
      'SECURITY',
      'SECURITY_AUDIT',
      `Wykonano pełny audyt bezpieczeństwa Zero-Leak (Wynik: ${report.scorePercent}%, Fingerprint: ${report.deviceFingerprint})`
    );
    setLogs(getPrivateAuditLogs());
    onNotifyToast?.(
      `Zakończono skan bezpieczeństwa Zero-Leak: ${report.scorePercent}% (${report.deviceFingerprint})`
    );
  };

  const handleSyncLogsWithFirebase = async () => {
    setIsSyncingLogs(true);
    try {
      const res = await syncPrivateAuditLogsWithFirestore();
      setLogs(res.logs);
      onNotifyToast?.(
        `Zsynchronizowano prywatne logi z kolekcją /securityAuditLogs w Firebase (wysłano: ${res.uploadedCount}, łącznie: ${res.totalMergedCount}).`
      );
    } finally {
      setIsSyncingLogs(false);
    }
  };

  const handleExportAuditReportJson = () => {
    const payload = {
      exportedAtIso: new Date().toISOString(),
      securityAuditReport: auditReport,
      privateAuditLogs: logs,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `Domyos_Security_Audit_Report_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onNotifyToast?.(
      'Pobrano raport audytu bezpieczeństwa i prywatny dziennik logów (.JSON)!'
    );
  };

  const handleClearLogs = async () => {
    await clearAllPrivateAuditLogs();
    refreshState();
    onNotifyToast?.(
      'Wyczyszczono prywatny dziennik logów z pamięci telefonu (OPFS) oraz z Firebase.'
    );
  };

  const filteredLogs = logs.filter((entry) => {
    if (categoryFilter === 'ALL') return true;
    return entry.category === categoryFilter;
  });

  return (
    <div className="rounded-2xl bg-[#131B26] border border-emerald-500/40 p-4 sm:p-5 space-y-4 min-w-0 overflow-hidden">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 border-b border-slate-800 pb-4">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>
                Audyt Bezpieczeństwa & Prywatny Dziennik Logów (Zero-Leak GitHub)
              </span>
            </h2>
            <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-[11px] font-mono-tabular font-bold text-emerald-300 flex items-center gap-1">
              <Fingerprint className="w-3.5 h-3.5 shrink-0" />
              {auditReport.deviceFingerprint}
            </span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Repozytorium na GitHubie zawiera wyłącznie czysty kod aplikacji (
            <code>firebase-applet-config.json = &#123;&#125;</code>, zero zrzutów ekranu i
            zero wywołań <code>console.log/error</code>). Wszystkie logi diagnostyczne i
            konfiguracje znajdują się wyłącznie w pamięci telefonu (
            <code>OPFS / localStorage</code>) oraz w prywatnej kolekcji{' '}
            <code className="text-emerald-400">/securityAuditLogs</code> w Twoim
            Firebase.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleRunManualAuditScan}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm"
          >
            <RefreshCw className="w-4 h-4 shrink-0" />
            <span>Skanuj Bezpieczeństwo ({auditReport.scorePercent}%)</span>
          </button>

          <button
            type="button"
            onClick={handleExportAuditReportJson}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Pobierz Raport (.JSON)</span>
          </button>
        </div>
      </div>

      {/* 6-Point Live Security Audit Checklist */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {auditReport.checks.map((chk) => (
          <div
            key={chk.id}
            className={`rounded-xl bg-[#0B0F17] border p-3.5 space-y-1.5 flex flex-col justify-between ${
              chk.passed
                ? 'border-emerald-500/35'
                : 'border-amber-500/50'
            }`}
          >
            <div className="space-y-1">
              <div className="flex items-start justify-between gap-2">
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  {chk.passed ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  )}
                  <span>{chk.title}</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {chk.detail}
              </p>
            </div>
            <div className="pt-1">
              <span
                className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono-tabular font-bold ${
                  chk.passed
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                    : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                }`}
              >
                {chk.badge}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Collapsible Private Audit & Diagnostic Logs Viewer (OPFS + Firebase /securityAuditLogs) */}
      <div className="rounded-xl bg-[#0B0F17] border border-slate-800 overflow-hidden">
        <button
          type="button"
          onClick={() => setIsLogsExpanded((v) => !v)}
          className="w-full min-h-[52px] px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-slate-800/30 transition-colors"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {isLogsExpanded ? (
              <ChevronDown className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <Lock className="w-4 h-4 text-emerald-400 shrink-0" />
            <div className="min-w-0">
              <span className="text-xs sm:text-sm font-bold text-white">
                Prywatny Dziennik Logów Diagnostycznych i Audytowych ({logs.length}{' '}
                wpisów w OPFS / Firebase)
              </span>
            </div>
          </div>
          <span className="text-xs font-semibold text-emerald-400 shrink-0">
            {isLogsExpanded ? 'Zwiń dziennik' : 'Podgląd logów'}
          </span>
        </button>

        {isLogsExpanded && (
          <div className="border-t border-slate-800 p-3.5 sm:p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: 'ALL', label: `Wszystkie (${logs.length})` },
                    { id: 'SECURITY_AUDIT', label: 'Bezpieczeństwo' },
                    { id: 'AUTH', label: 'Google OAuth' },
                    { id: 'FIRESTORE', label: 'Firestore Sync' },
                    { id: 'BLE_FTMS', label: 'Bluetooth FTMS' },
                    { id: 'GOOGLE_FIT', label: 'Google Fit' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setCategoryFilter(tab.id)}
                    className={`min-h-[30px] px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                      categoryFilter === tab.id
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-bold'
                        : 'bg-[#131B26] border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSyncLogsWithFirebase}
                  disabled={isSyncingLogs}
                  className="min-h-[34px] px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-bold text-[11px] flex items-center gap-1.5 transition-colors"
                >
                  <Cloud
                    className={`w-3.5 h-3.5 shrink-0 ${
                      isSyncingLogs ? 'animate-spin' : ''
                    }`}
                  />
                  <span>Sync /securityAuditLogs</span>
                </button>

                <button
                  type="button"
                  onClick={handleClearLogs}
                  className="min-h-[34px] px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 border border-slate-700 text-slate-300 hover:text-rose-300 font-semibold text-[11px] flex items-center gap-1.5 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Wyczyść logi</span>
                </button>
              </div>
            </div>

            {filteredLogs.length === 0 ? (
              <div className="rounded-xl bg-[#131B26] border border-slate-800 p-4 text-center text-xs text-slate-400">
                Brak zapisanych zdarzeń w wybranej kategorii. Kliknij „Skanuj
                Bezpieczeństwo”, aby wygenerować wpis kontrolny.
              </div>
            ) : (
              <div className="max-h-[280px] overflow-y-auto space-y-2 pr-1">
                {filteredLogs.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl bg-[#131B26] border border-slate-800 p-2.5 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono-tabular">
                        <span
                          className={`px-1.5 py-0.5 rounded font-bold ${
                            item.level === 'ERROR'
                              ? 'bg-rose-500/20 text-rose-300'
                              : item.level === 'WARN'
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-emerald-500/20 text-emerald-300'
                          }`}
                        >
                          {item.level}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-sky-300 font-semibold">
                          {item.category}
                        </span>
                        <span className="text-slate-400">
                          {new Date(item.timestampIso).toLocaleString('pl-PL')}
                        </span>
                        {item.deviceFingerprint && (
                          <span className="text-slate-500">
                            · {item.deviceFingerprint}
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-semibold text-white break-words">
                        {item.message}
                      </div>
                      {item.context && (
                        <div className="text-[11px] font-mono-tabular text-slate-400 break-all">
                          {item.context}
                        </div>
                      )}
                    </div>

                    <div className="shrink-0 flex items-center gap-1 text-[10px] font-semibold">
                      {item.syncedToFirebase ? (
                        <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 flex items-center gap-1">
                          <Cloud className="w-3 h-3" /> Firebase + OPFS
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 flex items-center gap-1">
                          <Smartphone className="w-3 h-3" /> Telefon OPFS
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Emergency Device Panic Wipe (Clears phone credentials while keeping Firebase cloud intact) */}
      <div className="rounded-xl bg-[#0B0F17] border border-rose-500/35 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-0.5 min-w-0">
          <div className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
            <FileWarning className="w-4 h-4 text-rose-400 shrink-0" />
            <span>
              Awaryjne Odłączenie Telefonu („Panic Wipe Urządzenia”)
            </span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Natychmiast wylogowuje konto Google i kasuje lokalny{' '}
            <code>firebaseConfig</code>, tokeny OAuth oraz logi z pamięci tego
            telefonu (dane w chmurze Firebase pozostają nienaruszone).
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!confirmPanicWipe ? (
            <button
              type="button"
              onClick={() => setConfirmPanicWipe(true)}
              className="min-h-[38px] px-3.5 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 font-bold text-xs transition-colors"
            >
              Wyczyść Klucze z Tego Telefonu
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmPanicWipe(false)}
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
              >
                Anuluj
              </button>
              <button
                type="button"
                onClick={() => performEmergencyDeviceWipe()}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-slate-950 font-bold text-xs"
              >
                Potwierdź Panic Wipe
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
