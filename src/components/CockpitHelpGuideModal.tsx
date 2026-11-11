import React, { useState } from 'react';
import {
  X,
  HelpCircle,
  Bluetooth,
  Lock,
  Heart,
  Terminal,
  Volume2,
  Maximize2,
  Gauge,
  Clock,
  Activity,
  Sliders,
  Layers,
  Play,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';

interface CockpitHelpGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CockpitHelpGuideModal: React.FC<CockpitHelpGuideModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [page, setPage] = useState<1 | 2 | 3>(1);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4 select-none">
      <div className="w-full max-w-2xl rounded-3xl bg-[#131B26] border border-emerald-500/50 p-4 sm:p-6 space-y-4 shadow-2xl max-h-[92vh] flex flex-col justify-between overflow-hidden">
        {/* TOP HEADER & PAGE TABS */}
        <div className="space-y-3 shrink-0">
          <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                <HelpCircle className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm sm:text-base font-bold text-white truncate">
                  Przewodnik po Kokpicie Treningowym (Strona {page} z 3)
                </h2>
                <p className="text-[11px] text-slate-400 truncate">
                  Objaśnienie wszystkich przycisków, kafelków i wskaźników widoku Kokpitu
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white shrink-0"
              title="Zamknij przewodnik"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 3-PAGE SEGMENTED SELECTOR */}
          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[#0B0F17] border border-slate-800">
            <button
              type="button"
              onClick={() => setPage(1)}
              className={`min-h-[38px] px-2 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-colors truncate ${
                page === 1
                  ? 'bg-emerald-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              1. Górny Pasek i BLE
            </button>
            <button
              type="button"
              onClick={() => setPage(2)}
              className={`min-h-[38px] px-2 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-colors truncate ${
                page === 2
                  ? 'bg-emerald-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              2. 6 Kafelków Danych
            </button>
            <button
              type="button"
              onClick={() => setPage(3)}
              className={`min-h-[38px] px-2 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-colors truncate ${
                page === 3
                  ? 'bg-emerald-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              3. Interwały i Sterowanie
            </button>
          </div>
        </div>

        {/* SCROLLABLE BODY CONTENT FOR CURRENT PAGE */}
        <div className="overflow-y-auto pr-1 space-y-2.5 flex-1 min-h-0">
          {page === 1 && (
            <div className="space-y-2.5 text-xs">
              <div className="rounded-xl bg-[#0B0F17] border border-slate-800 p-3 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                  <Bluetooth className="w-4 h-4" />
                </div>
                <div className="space-y-1">
                  <div className="font-bold text-white">
                    Połącz Rower (FTMS) i Blokada podczas Jazdy 🔒
                  </div>
                  <p className="text-slate-300 leading-relaxed">
                    Przed treningiem kliknij <strong>Połącz Rower</strong>, aby sparować rower Domyos przez Bluetooth (przesyła moc, kadencję i opór). Gdy klikniesz <strong>START</strong>, przycisk automatycznie <strong>blokuje się ikoną kłódki</strong> (<Lock className="w-3 h-3 inline text-emerald-400" />), abyś nie rozłączył roweru przypadkowym dotknięciem ekranu w trakcie jazdy.
                  </p>
                </div>
              </div>

              <div className="rounded-xl bg-[#0B0F17] border border-slate-800 p-3 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div className="space-y-1">
                  <div className="font-bold text-white">
                    Automatyczna Pauza przy Zerwaniu Bluetooth
                  </div>
                  <p className="text-slate-300 leading-relaxed">
                    Jeśli w trakcie kręcenia rower samoczynnie straci połączenie Bluetooth, aplikacja natychmiast <strong>włącza Pauzę</strong> i otwiera okno ponownego łączenia. Po odzyskaniu łączności zegar czeka w Pauzie, aż ręcznie klikniesz <strong>WZNÓW</strong>.
                  </p>
                </div>
              </div>

              <div className="rounded-xl bg-[#0B0F17] border border-slate-800 p-3 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-rose-500/15 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0 mt-0.5">
                  <Heart className="w-4 h-4" />
                </div>
                <div className="space-y-1">
                  <div className="font-bold text-white">
                    + Pas HR (Zewnętrzny Pas Tętna BLE 0x180D)
                  </div>
                  <p className="text-slate-300 leading-relaxed">
                    Pozwala połączyć pas piersiowy lub opaskę optyczną (Polar, Garmin, Decathlon, Coospo) bezpośrednio z telefonem równolegle z rowerem. Po sparowaniu przycisk również zostaje zablokowany na czas trwania treningu.
                  </p>
                </div>
              </div>

              <div className="rounded-xl bg-[#0B0F17] border border-slate-800 p-3 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-500/40 flex items-center justify-center text-sky-400 shrink-0 mt-0.5">
                  <Terminal className="w-4 h-4" />
                </div>
                <div className="space-y-1">
                  <div className="font-bold text-white">
                    Sniffer BLE (Podgląd Ramek HEX i Dekoder HR)
                  </div>
                  <p className="text-slate-300 leading-relaxed">
                    Narzędzie diagnostyczne pokazujące surowe pakiety Bluetooth przychodzące z roweru oraz wykryte bajty tętna w czasie rzeczywistym.
                  </p>
                </div>
              </div>

              <div className="rounded-xl bg-[#0B0F17] border border-slate-800 p-3 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                  <Maximize2 className="w-4 h-4" />
                </div>
                <div className="space-y-1">
                  <div className="font-bold text-white">
                    Dźwięki (3-2-1) oraz Tryb Pełnoekranowy Zen HUD
                  </div>
                  <p className="text-slate-300 leading-relaxed">
                    Ikona głośnika (<Volume2 className="w-3 h-3 inline text-emerald-400" />) włącza sygnały dźwiękowe na 3 sekundy przed końcem każdego interwału. Przycisk <strong>Zen HUD</strong> ukrywa górny i dolny pasek nawigacji aplikacji, zostawiając na ekranie wyłącznie czysty Kokpit.
                  </p>
                </div>
              </div>
            </div>
          )}

          {page === 2 && (
            <div className="space-y-2.5 text-xs">
              <div className="rounded-xl bg-[#0B0F17] border border-slate-800 p-3 space-y-1">
                <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                  <Gauge className="w-4 h-4 shrink-0" />
                  <span>1. Kafelek MOC (3S / 1S) i CEL W</span>
                </div>
                <p className="text-slate-300 leading-relaxed">
                  Pokazuje Twoją aktualną moc w watach, cel bieżącego odcinka (<strong>CEL W</strong>), różnicę względem celu (np. <code>+4W</code>) oraz kolorową strefę mocy i <code>% FTP</code>. <strong>Stuknij w ten kafelek</strong>, aby przełączyć wygładzanie mocy między średnią 3-sekundową (<code>3S</code>) a odczytem chwilowym (<code>1S</code>).
                </p>
              </div>

              <div className="rounded-xl bg-[#0B0F17] border border-slate-800 p-3 space-y-1">
                <div className="font-bold text-amber-400 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 shrink-0" />
                  <span>2. Kafelek INTERWAŁ (Odliczanie do 00:00)</span>
                </div>
                <p className="text-slate-300 leading-relaxed">
                  Odlicza czas pozostały do końca aktualnego odcinka (w ostatnich 5 sekundach podświetla się na czerwono). Pokazuje numer bieżącego bloku (np. <code>2/6</code>), jego nazwę oraz docelowe waty końcowe, jeśli jedziesz rampę (<code>→W</code>).
                </p>
              </div>

              <div className="rounded-xl bg-[#0B0F17] border border-slate-800 p-3 space-y-1">
                <div className="font-bold text-rose-400 flex items-center gap-1.5">
                  <Heart className="w-4 h-4 shrink-0" />
                  <span>3. Kafelek TĘTNO (HR) + Dryf Tlenowy (Pa:Hr %)</span>
                </div>
                <p className="text-slate-300 leading-relaxed">
                  Wyświetla tętno w <code>BPM</code>, <code>% MAX</code> oraz <strong>Dryf Tętna (Pa:Hr %)</strong> i współczynnik efektywności <strong>EF (W/BPM)</strong> porównujący pierwszą i drugą połowę jazdy. Dryf poniżej <code>5%</code> oznacza stabilną bazę tlenową; powyżej <code>5%</code> sygnalizuje odwodnienie lub zmęczenie.
                </p>
              </div>

              <div className="rounded-xl bg-[#0B0F17] border border-slate-800 p-3 space-y-1">
                <div className="font-bold text-sky-400 flex items-center gap-1.5">
                  <Activity className="w-4 h-4 shrink-0" />
                  <span>4. Kafelek KADENCJA (RPM) z Czerwonym Alertem</span>
                </div>
                <p className="text-slate-300 leading-relaxed">
                  Pokazuje rytm pedałowania (<code>RPM</code>) oraz zadany cel odcinka (<code>CEL RPM</code>). Gdy Twoja kadencja spadnie o ponad 5 RPM poniżej celu, cały kafelek <strong>podświetla się na czerwono (KADENCJA ZA NISKA!)</strong>, przypominając o lżejszym i szybszym obrocie korbą.
                </p>
              </div>

              <div className="rounded-xl bg-[#0B0F17] border border-slate-800 p-3 space-y-1">
                <div className="font-bold text-white flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>5. CZAS / DYSTANS (700c) oraz 6. TRYB (AUTO ERG vs OPÓR)</span>
                </div>
                <p className="text-slate-300 leading-relaxed">
                  <strong>Kafelek 5</strong> zlicza całkowity czas sesji oraz realny dystans (<code>km</code>) i prędkość (<code>km/h</code>) dla koła szosowego <code>700c (2.105m)</code>. <strong>Kafelek 6 (TRYB)</strong> pozwala jednym stuknięciem przełączyć rower między <strong>AUTO ERG</strong> (rower sam pilnuje watów z planu, a przyciskami <code>-5% / +5%</code> korygujesz trudność) a ręcznym <strong>OPOREM 1–32</strong> (zmiana biegów <code>-1 / +1</code>).
                </p>
              </div>
            </div>
          )}

          {page === 3 && (
            <div className="space-y-2.5 text-xs">
              <div className="rounded-xl bg-[#0B0F17] border border-slate-800 p-3 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                  <Layers className="w-4 h-4" />
                </div>
                <div className="space-y-1">
                  <div className="font-bold text-white">
                    3 Bloczki Interwałów nad Wykresem (1. Teraz, 2. Następny, 3. Kolejny)
                  </div>
                  <p className="text-slate-300 leading-relaxed">
                    Bezpośrednio nad wykresem widzisz 3 karty pokazujące aktualny odcinek oraz dwa kolejne. Dla odcinków o stałej mocy wyświetlają pojedynczą wartość (np. <code>165 W</code>), a dla ramp dokładny zakres przejścia (np. <code>120W → 200W</code>). <strong>Stuknij w dowolny bloczek</strong>, aby od razu do niego przeskoczyć.
                  </p>
                </div>
              </div>

              <div className="rounded-xl bg-[#0B0F17] border border-slate-800 p-3 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-500/40 flex items-center justify-center text-sky-400 shrink-0 mt-0.5">
                  <Activity className="w-4 h-4" />
                </div>
                <div className="space-y-1">
                  <div className="font-bold text-white">
                    Wykres Profilu Treningu ze Strzałką Pozycji (▼)
                  </div>
                  <p className="text-slate-300 leading-relaxed">
                    Kolorowe bloki na wykresie oznaczają strefy mocy (od szarej Z1 i niebieskiej Z2 po czerwoną VO2max), przerywana linia to Twoje FTP, a zielona strzałka <strong>▼</strong> wskazuje dokładne miejsce, w którym jedziesz. Kliknięcie dowolnego słupka na wykresie przenosi Cię do tego odcinka.
                  </p>
                </div>
              </div>

              <div className="rounded-xl bg-[#0B0F17] border border-slate-800 p-3 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
                  <Play className="w-4 h-4" />
                </div>
                <div className="space-y-1">
                  <div className="font-bold text-white">
                    Dolny Pasek Transportu i Przycisk +30s
                  </div>
                  <p className="text-slate-300 leading-relaxed">
                    Na samym dole znajdują się duże przyciski pod kciuk: cofanie/przeskakiwanie odcinka (<code>⏮ / ⏭</code>), główny przycisk <strong>START / PAUZA / WZNÓW</strong>, przycisk <strong>+30s</strong> (natychmiast wydłuża aktualny interwał lub rozgrzewkę o 30 sekund) oraz przycisk <strong>ZAKOŃCZ</strong>.
                  </p>
                </div>
              </div>

              <div className="rounded-xl bg-[#0B0F17] border border-slate-800 p-3 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div className="space-y-1">
                  <div className="font-bold text-white">
                    Zunifikowany Panel Zakończenia i Odczuć (1–10)
                  </div>
                  <p className="text-slate-300 leading-relaxed">
                    Zarówno gdy ostatni interwał dojdzie do <code>00:00</code>, jak i gdy klikniesz ręcznie <strong>ZAKOŃCZ</strong>, otwiera się ten sam panel podsumowania. Wybierasz w nim swoje samopoczucie w skali <strong>1–10</strong> oraz szybkie tagi (np. <em>Ciężkie nogi</em>, <em>Lekka noga / Flow</em>) i klikasz <strong>Zakończ, zapisz .FIT i Odczucia</strong> (lub wracasz do jazdy).
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* BOTTOM PAGINATION CONTROLS */}
        <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-800 shrink-0">
          <button
            type="button"
            onClick={() => setPage((p) => (p > 1 ? ((p - 1) as 1 | 2 | 3) : p))}
            disabled={page === 1}
            className="min-h-[42px] px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-bold text-slate-200 flex items-center gap-1.5 transition-colors"
          >
            <ChevronLeft className="w-4 h-4 shrink-0" />
            <span>Poprzednia</span>
          </button>

          <span className="font-mono-tabular text-xs font-bold text-slate-400">
            Strona {page} z 3
          </span>

          {page < 3 ? (
            <button
              type="button"
              onClick={() =>
                setPage((p) => (p < 3 ? ((p + 1) as 1 | 2 | 3) : p))
              }
              className="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-xs font-extrabold text-slate-950 flex items-center gap-1.5 transition-colors"
            >
              <span>Następna</span>
              <ChevronRight className="w-4 h-4 shrink-0" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-xs font-extrabold text-slate-950 flex items-center gap-1.5 transition-colors"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Rozumiem, wracam do Kokpitu</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
