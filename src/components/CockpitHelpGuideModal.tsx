import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
} from 'lucide-react';

interface CockpitHelpGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type AccentTheme = 'emerald' | 'sky' | 'amber';

interface TourCalloutItem {
  markerNumber: number;
  selector: string;
  accent: AccentTheme;
  title: string;
  shortNote: string;
}

interface TourPage {
  pageNumber: number;
  pageTitle: string;
  items: TourCalloutItem[];
}

const COCKPIT_TOUR_PAGES: TourPage[] = [
  {
    pageNumber: 1,
    pageTitle: 'Strona 1 z 5 · Górny Pasek: Bluetooth, Czujniki i Widok',
    items: [
      {
        markerNumber: 1,
        selector: '[data-tour-target="p1-bike"]',
        accent: 'emerald',
        title: '1. Połącz Rower (FTMS + Blokada 🔒)',
        shortNote:
          'Paruje rower Domyos BLE. Po starcie jazdy przycisk blokuje się kłódką 🔒, a przy utracie sygnału sam włącza Auto-Pauzę.',
      },
      {
        markerNumber: 2,
        selector: '[data-tour-target="p1-hr-sniffer"]',
        accent: 'sky',
        title: '2. + Pas HR oraz Sniffer BLE',
        shortNote:
          'Łączy zewnętrzny pas tętna (0x180D) bezpośrednio z telefonem oraz otwiera skaner ramek HEX i dekoder HR na żywo.',
      },
      {
        markerNumber: 3,
        selector: '[data-tour-target="p1-audio-zen"]',
        accent: 'amber',
        title: '3. Głośnik (3-2-1) oraz Zen HUD',
        shortNote:
          'Włącza odliczanie dźwiękowe przed końcem odcinka oraz tryb pełnoekranowy Zen HUD (ukrywa paski nawigacji).',
      },
    ],
  },
  {
    pageNumber: 2,
    pageTitle: 'Strona 2 z 5 · Górne Kafelki: Moc i Zegar Interwału',
    items: [
      {
        markerNumber: 1,
        selector: '[data-tour-target="p2-power"]',
        accent: 'emerald',
        title: '1. Kafelek MOC (3S / 1S)',
        shortNote:
          'Pokazuje waty, strefę Z1–Z7 oraz różnicę do celu (CEL W). Stuknij w kafelek, aby przełączyć wygładzanie 3-sekundowe (3S) lub chwilowe (1S).',
      },
      {
        markerNumber: 2,
        selector: '[data-tour-target="p2-interval"]',
        accent: 'amber',
        title: '2. Kafelek INTERWAŁ (Odliczanie)',
        shortNote:
          'Odlicza czas bieżącego odcinka w dół do 00:00, pokazując numer bloku oraz docelowe waty na końcu rampy.',
      },
    ],
  },
  {
    pageNumber: 3,
    pageTitle: 'Strona 3 z 5 · Środkowe Kafelki: Tętno (Pa:Hr %) i Kadencja',
    items: [
      {
        markerNumber: 1,
        selector: '[data-tour-target="p3-hr"]',
        accent: 'emerald',
        title: '1. Kafelek TĘTNO (BPM + Dryf Pa:Hr %)',
        shortNote:
          'Monitoruje puls, źródło HR i żywy Dryf Tętna (Pa:Hr % — poniżej 5% oznacza stabilny tlen). Stuknij, aby otworzyć Sniffer BLE.',
      },
      {
        markerNumber: 2,
        selector: '[data-tour-target="p3-cadence"]',
        accent: 'sky',
        title: '2. Kafelek KADENCJA (Alert RPM)',
        shortNote:
          'Pokazuje rytm pedałowania RPM i cel odcinka. Gdy spadniesz o ponad 5 RPM poniżej celu, cały kafelek zaświeci na czerwono!',
      },
    ],
  },
  {
    pageNumber: 4,
    pageTitle: 'Strona 4 z 5 · Dolne Kafelki: Dystans 700c i Sterowanie ERG',
    items: [
      {
        markerNumber: 1,
        selector: '[data-tour-target="p4-time-dist"]',
        accent: 'emerald',
        title: '1. Kafelek CZAS JAZDY i Dystans 700c',
        shortNote:
          'Zlicza łączny czas treningu oraz realną prędkość (km/h) i dystans wyliczany z obrotów koła szosowego 700x25c (2.105 m).',
      },
      {
        markerNumber: 2,
        selector: '[data-tour-target="p4-erg-mode"]',
        accent: 'amber',
        title: '2. Kafelek TRYB (AUTO ERG / OPÓR 1–32)',
        shortNote:
          'Przełącza między automatycznym pilnowaniem watów a ręcznymi biegami 1–32. Przyciskami -5% / +5% szybko skorygujesz trudność.',
      },
    ],
  },
  {
    pageNumber: 5,
    pageTitle: 'Strona 5 z 5 · 3 Bloczki, Wykres i Pasek START / ZAKOŃCZ',
    items: [
      {
        markerNumber: 1,
        selector: '[data-tour-target="p5-preview-blocks"]',
        accent: 'emerald',
        title: '1. Podgląd 3 Odcinków (Teraz / +1 / +2)',
        shortNote:
          'Pokazuje czas i waty (stałe lub rampę Start W → Koniec W) obecnego i 2 kolejnych bloków. Stuknij, aby przeskoczyć.',
      },
      {
        markerNumber: 2,
        selector: '[data-tour-target="p5-chart"]',
        accent: 'sky',
        title: '2. Wykres Osi Czasu (▼ ODCINEK)',
        shortNote:
          'Wizualny profil całego treningu ze strefami mocy Z1–Z7 i zielonym znacznikiem postępu ▼.',
      },
      {
        markerNumber: 3,
        selector: '[data-tour-target="p5-transport"]',
        accent: 'amber',
        title: '3. Pasek START / PAUZA, +30s i ZAKOŃCZ',
        shortNote:
          '+30s wydłuża bieżący blok o pół minuty, a ZAKOŃCZ otwiera podsumowanie z wyborem Odczuć 1–10 i zapisem pliku .FIT.',
      },
    ],
  },
];

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
  bottom: number;
  centerX: number;
}

interface BubbleHorizontalBounds {
  left: number;
  width: number;
}

const ACCENT_STYLES: Record<
  AccentTheme,
  {
    spotlightBorder: string;
    spotlightBg: string;
    badgeBg: string;
    cardBorder: string;
    triangleText: string;
    titleColor: string;
  }
> = {
  emerald: {
    spotlightBorder: 'border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.45)]',
    spotlightBg: 'bg-emerald-500/10',
    badgeBg: 'bg-emerald-400 text-slate-950',
    cardBorder: 'border-emerald-400',
    triangleText: 'text-emerald-400',
    titleColor: 'text-emerald-300',
  },
  sky: {
    spotlightBorder: 'border-sky-400 shadow-[0_0_20px_rgba(56,189,248,0.45)]',
    spotlightBg: 'bg-sky-500/10',
    badgeBg: 'bg-sky-400 text-slate-950',
    cardBorder: 'border-sky-400',
    triangleText: 'text-sky-400',
    titleColor: 'text-sky-300',
  },
  amber: {
    spotlightBorder: 'border-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.45)]',
    spotlightBg: 'bg-amber-500/10',
    badgeBg: 'bg-amber-400 text-slate-950',
    cardBorder: 'border-amber-400',
    triangleText: 'text-amber-400',
    titleColor: 'text-amber-300',
  },
};

export const CockpitHelpGuideModal: React.FC<CockpitHelpGuideModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [pageIdx, setPageIdx] = useState(0);
  const [targetRects, setTargetRects] = useState<Record<string, TargetRect>>({});
  const [bubbleBounds, setBubbleBounds] = useState<
    Record<string, BubbleHorizontalBounds>
  >({});
  const bubbleRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const currentPage = COCKPIT_TOUR_PAGES[pageIdx] || COCKPIT_TOUR_PAGES[0];

  useEffect(() => {
    if (isOpen) {
      setPageIdx(0);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const measureAll = () => {
      const nextRects: Record<string, TargetRect> = {};

      for (const item of currentPage.items) {
        const nodes = Array.from(
          document.querySelectorAll(item.selector)
        ) as HTMLElement[];

        let minTop = Infinity;
        let minLeft = Infinity;
        let maxRight = -Infinity;
        let maxBottom = -Infinity;

        for (const el of nodes) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) continue;
          if (r.top < minTop) minTop = r.top;
          if (r.left < minLeft) minLeft = r.left;
          if (r.right > maxRight) maxRight = r.right;
          if (r.bottom > maxBottom) maxBottom = r.bottom;
        }

        if (minTop !== Infinity) {
          const pad = 4;
          const top = Math.max(2, minTop - pad);
          const left = Math.max(2, minLeft - pad);
          const right = Math.min(window.innerWidth - 2, maxRight + pad);
          const bottom = Math.min(window.innerHeight - 2, maxBottom + pad);

          nextRects[item.selector] = {
            top,
            left,
            width: Math.max(30, right - left),
            height: Math.max(26, bottom - top),
            bottom,
            centerX: left + (right - left) / 2,
          };
        }
      }

      setTargetRects(nextRects);

      // Measure rendered callout bubbles so each triangular beak aligns horizontally with its target centerX
      window.requestAnimationFrame(() => {
        const nextBubbles: Record<string, BubbleHorizontalBounds> = {};
        for (const item of currentPage.items) {
          const bEl = bubbleRefs.current[item.selector];
          if (bEl) {
            const br = bEl.getBoundingClientRect();
            nextBubbles[item.selector] = {
              left: br.left,
              width: Math.max(120, br.width),
            };
          }
        }
        setBubbleBounds(nextBubbles);
      });
    };

    measureAll();
    window.addEventListener('resize', measureAll);
    window.addEventListener('scroll', measureAll, true);
    return () => {
      window.removeEventListener('resize', measureAll);
      window.removeEventListener('scroll', measureAll, true);
    };
  }, [isOpen, pageIdx, currentPage]);

  if (!isOpen) return null;

  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 800;
  const activeRectList = currentPage.items
    .map((item) => targetRects[item.selector])
    .filter((r): r is TargetRect => Boolean(r));

  const groupMinTop =
    activeRectList.length > 0
      ? Math.min(...activeRectList.map((r) => r.top))
      : 100;
  const groupMaxBottom =
    activeRectList.length > 0
      ? Math.max(...activeRectList.map((r) => r.bottom))
      : 220;

  // Decide whether the callout cards sit BELOW the highlighted tools (with upward ▲ beak)
  // or ABOVE the highlighted tools (with downward ▼ beak)
  const spaceBelow = viewportH - groupMaxBottom;
  const spaceAbove = groupMinTop;
  const placeCalloutsBelow = spaceBelow >= spaceAbove;

  // Keep the navigation bar out of the way of the highlighted tools (bottom on pages 1-3, top on pages 4-5)
  const navBarAtTop = !placeCalloutsBelow;

  const handleAdvanceOrClose = () => {
    if (pageIdx + 1 < COCKPIT_TOUR_PAGES.length) {
      setPageIdx((prev) => prev + 1);
    } else {
      onClose();
    }
  };

  return (
    <div
      onClick={handleAdvanceOrClose}
      className="fixed inset-0 z-50 bg-slate-950/65 select-none overflow-hidden cursor-pointer"
      title="Stuknij w dowolne miejsce na ekranie, aby przejść do następnej strony"
    >
      {/* 1. HIGHLIGHT FRAMES + NUMBER BADGES AROUND EACH OF THE 2-3 ACTIVE TOOLS ON THIS PAGE */}
      {currentPage.items.map((item) => {
        const rect = targetRects[item.selector];
        if (!rect) return null;
        const styleTheme = ACCENT_STYLES[item.accent];

        return (
          <div
            key={item.selector}
            style={{
              position: 'fixed',
              top: `${rect.top}px`,
              left: `${rect.left}px`,
              width: `${rect.width}px`,
              height: `${rect.height}px`,
            }}
            className={`rounded-xl border-2 ${styleTheme.spotlightBorder} ${styleTheme.spotlightBg} pointer-events-none transition-all duration-200 z-10`}
          >
            <span
              className={`absolute -top-2.5 -left-1.5 w-5 h-5 rounded-full ${styleTheme.badgeBg} font-mono-tabular text-[11px] font-extrabold flex items-center justify-center shadow-md`}
            >
              {item.markerNumber}
            </span>
          </div>
        );
      })}

      {/* 2. 2-3 CALLOUT BUBBLES WITH SIMPLE TRIANGULAR BEAKS (▲ / ▼) POINTING AT THEIR TARGETS */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={
          placeCalloutsBelow
            ? {
                position: 'fixed',
                top: `${Math.min(viewportH - 250, groupMaxBottom + 14)}px`,
                left: '50%',
                transform: 'translateX(-50%)',
              }
            : {
                position: 'fixed',
                bottom: `${Math.max(12, viewportH - groupMinTop + 14)}px`,
                left: '50%',
                transform: 'translateX(-50%)',
              }
        }
        className={`w-[calc(100vw-20px)] max-w-4xl grid gap-2.5 cursor-default z-20 ${
          currentPage.items.length === 2
            ? 'grid-cols-1 sm:grid-cols-2'
            : 'grid-cols-1 md:grid-cols-3'
        }`}
      >
        {currentPage.items.map((item) => {
          const rect = targetRects[item.selector];
          const bBounds = bubbleBounds[item.selector];
          const styleTheme = ACCENT_STYLES[item.accent];

          // Compute exact horizontal X offset for the triangular beak on the card edge
          // so it points toward the center of its corresponding tool
          const beakLeftPx =
            rect && bBounds
              ? Math.max(
                  20,
                  Math.min(bBounds.width - 20, rect.centerX - bBounds.left)
                )
              : null;

          return (
            <div
              key={item.selector}
              ref={(el) => {
                bubbleRefs.current[item.selector] = el;
              }}
              className={`relative rounded-2xl bg-[#131B26]/95 border-2 ${styleTheme.cardBorder} px-3.5 py-2.5 shadow-[0_14px_35px_rgba(0,0,0,0.85)] space-y-1`}
            >
              {/* UPWARD TRIANGULAR BEAK (▲) AT TOP BORDER WHEN BUBBLE IS BELOW THE TOOL */}
              {placeCalloutsBelow && (
                <div
                  style={{
                    left: beakLeftPx !== null ? `${beakLeftPx}px` : '50%',
                  }}
                  className="absolute -top-[11px] -translate-x-1/2 pointer-events-none"
                >
                  <svg
                    width="22"
                    height="11"
                    viewBox="0 0 22 11"
                    className={`${styleTheme.triangleText} fill-current`}
                  >
                    <path d="M11 0L22 11H0L11 0Z" />
                  </svg>
                </div>
              )}

              {/* DOWNWARD TRIANGULAR BEAK (▼) AT BOTTOM BORDER WHEN BUBBLE IS ABOVE THE TOOL */}
              {!placeCalloutsBelow && (
                <div
                  style={{
                    left: beakLeftPx !== null ? `${beakLeftPx}px` : '50%',
                  }}
                  className="absolute -bottom-[11px] -translate-x-1/2 pointer-events-none"
                >
                  <svg
                    width="22"
                    height="11"
                    viewBox="0 0 22 11"
                    className={`${styleTheme.triangleText} fill-current`}
                  >
                    <path d="M11 11L0 0H22L11 11Z" />
                  </svg>
                </div>
              )}

              <div className="flex items-center gap-2">
                <span
                  className={`w-5 h-5 rounded-full ${styleTheme.badgeBg} font-mono-tabular text-[11px] font-extrabold flex items-center justify-center shrink-0`}
                >
                  {item.markerNumber}
                </span>
                <h4
                  className={`text-xs sm:text-sm font-extrabold ${styleTheme.titleColor} leading-tight`}
                >
                  {item.title}
                </h4>
              </div>

              <p className="text-[11px] sm:text-xs text-slate-100 leading-relaxed pl-7">
                {item.shortNote}
              </p>
            </div>
          );
        })}
      </div>

      {/* 3. COMPACT NAVIGATION BAR (WSTECZ / KROPKI 1..5 / DALEJ / ZAMKNIJ) */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`fixed left-1/2 -translate-x-1/2 w-[calc(100vw-20px)] max-w-xl rounded-2xl bg-[#0B0F17]/95 border border-slate-700 px-3.5 py-2.5 shadow-2xl flex flex-col gap-1.5 cursor-default z-30 ${
          navBarAtTop ? 'top-3' : 'bottom-3'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] sm:text-xs font-extrabold text-emerald-400 truncate">
            {currentPage.pageTitle}
          </span>

          <button
            type="button"
            onClick={onClose}
            className="min-h-[30px] px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-slate-200 hover:text-white flex items-center gap-1 shrink-0 transition-colors"
          >
            <span>Zamknij</span>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setPageIdx((prev) => Math.max(0, prev - 1))}
            disabled={pageIdx === 0}
            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-bold text-slate-200 flex items-center gap-1 transition-colors"
          >
            <ChevronLeft className="w-4 h-4 shrink-0" />
            <span>Wstecz</span>
          </button>

          {/* Page Dots (1..5) */}
          <div className="flex items-center gap-1.5">
            {COCKPIT_TOUR_PAGES.map((p, idx) => (
              <button
                key={p.pageNumber}
                type="button"
                onClick={() => setPageIdx(idx)}
                className={`h-2.5 rounded-full transition-all ${
                  idx === pageIdx
                    ? 'w-6 bg-emerald-400'
                    : 'w-2.5 bg-slate-700 hover:bg-slate-500'
                }`}
                title={`Przejdź do strony ${p.pageNumber}`}
              />
            ))}
          </div>

          {pageIdx + 1 < COCKPIT_TOUR_PAGES.length ? (
            <button
              type="button"
              onClick={() => setPageIdx((prev) => prev + 1)}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-xs font-extrabold text-slate-950 flex items-center gap-1 transition-colors"
            >
              <span>Dalej ({pageIdx + 1}/5)</span>
              <ChevronRight className="w-4 h-4 shrink-0" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-xs font-extrabold text-slate-950 flex items-center gap-1.5 transition-colors"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Gotowe!</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
