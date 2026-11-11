import React, { useState } from 'react';
import { Star, AlertCircle, Sparkles, Check, MessageSquare } from 'lucide-react';
import { CompletedActivity } from '../types/cycling';
import {
  getFeelScoreVisualMeta,
  mapFeel1To10ToIntervalsFeel1To5,
  mapFeel1To10ToIntervalsRpe,
  POST_RIDE_NEGATIVE_FEEL_TAGS,
  POST_RIDE_POSITIVE_FEEL_TAGS,
} from '../services/rampAndPhysiologyEngine';

interface PostRideFeelSelectorProps {
  activity: CompletedActivity;
  compact?: boolean;
  hasIntervalsConnected?: boolean;
  onUpdateFeel: (
    activity: CompletedActivity,
    patch: {
      feelScore1To10: number;
      feelSymptomTags: string[];
      feelNotes?: string;
    }
  ) => Promise<void> | void;
}

export const PostRideFeelSelector: React.FC<PostRideFeelSelectorProps> = ({
  activity,
  compact = false,
  hasIntervalsConnected = false,
  onUpdateFeel,
}) => {
  const [score, setScore] = useState<number>(activity.feelScore1To10 || 0);
  const [selectedTags, setSelectedTags] = useState<string[]>(
    activity.feelSymptomTags || []
  );
  const [notes, setNotes] = useState<string>(activity.feelNotes || '');
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const visualMeta = getFeelScoreVisualMeta(score > 0 ? score : null);

  const commitChange = async (
    nextScore: number,
    nextTags: string[],
    nextNotes: string
  ) => {
    const finalScore = nextScore > 0 ? nextScore : 5;
    setScore(finalScore);
    setSelectedTags(nextTags);
    setIsSaving(true);
    try {
      await onUpdateFeel(activity, {
        feelScore1To10: finalScore,
        feelSymptomTags: nextTags,
        feelNotes: nextNotes.trim() || undefined,
      });
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 2500);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectScore = (newScore: number) => {
    commitChange(newScore, selectedTags, notes);
  };

  const handleToggleTag = (tagLabel: string) => {
    const exists = selectedTags.includes(tagLabel);
    const nextTags = exists
      ? selectedTags.filter((t) => t !== tagLabel)
      : [...selectedTags, tagLabel];
    const autoScore =
      score > 0
        ? score
        : POST_RIDE_NEGATIVE_FEEL_TAGS.some((n) => n.label === tagLabel)
        ? 4
        : 8;
    commitChange(autoScore, nextTags, notes);
  };

  const getScoreButtonStyle = (val: number, active: boolean) => {
    if (!active) {
      return 'bg-[#0B0F17] border-slate-800 text-slate-400 hover:border-slate-600 hover:text-white';
    }
    if (val <= 2) {
      return 'bg-rose-500 border-rose-400 text-slate-950 font-extrabold shadow-sm';
    }
    if (val <= 4) {
      return 'bg-orange-500 border-orange-400 text-slate-950 font-extrabold shadow-sm';
    }
    if (val <= 6) {
      return 'bg-amber-400 border-amber-300 text-slate-950 font-extrabold shadow-sm';
    }
    if (val <= 8) {
      return 'bg-sky-400 border-sky-300 text-slate-950 font-extrabold shadow-sm';
    }
    return 'bg-emerald-400 border-emerald-300 text-slate-950 font-extrabold shadow-sm';
  };

  const intervalsFeel1To5 = score > 0 ? mapFeel1To10ToIntervalsFeel1To5(score) : null;
  const intervalsRpe =
    score > 0
      ? mapFeel1To10ToIntervalsRpe(score, activity.intensityFactor)
      : null;

  return (
    <div
      className={`rounded-xl bg-[#0B0F17] border border-slate-800 ${
        compact ? 'p-3 space-y-2.5' : 'p-3.5 sm:p-4 space-y-3'
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Star
            className={`w-4 h-4 shrink-0 ${
              score >= 7
                ? 'text-emerald-400 fill-emerald-400'
                : score >= 1
                ? 'text-amber-400 fill-amber-400'
                : 'text-slate-400'
            }`}
          />
          <span className="text-xs font-bold text-white">
            Odczucia po jeździe (1 = słabo · 10 = super):
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {score > 0 && (
            <span
              className={`px-2 py-0.5 rounded-md border font-semibold ${visualMeta.badgeClass}`}
            >
              {visualMeta.shortLabel}
            </span>
          )}
          {score > 0 && hasIntervalsConnected && (
            <span className="px-2 py-0.5 rounded-md bg-sky-500/15 border border-sky-500/30 text-sky-300 font-mono-tabular">
              ICU: Feel {intervalsFeel1To5}/5 · RPE {intervalsRpe}/10
            </span>
          )}
          {(justSaved || isSaving) && (
            <span className="text-emerald-400 font-semibold flex items-center gap-1">
              <Check className="w-3.5 h-3.5" />
              {isSaving ? 'Zapisuję...' : 'Zapisano (Firebase + ICU)'}
            </span>
          )}
        </div>
      </div>

      {/* 1 to 10 Rating Buttons */}
      <div className="space-y-1">
        <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((val) => {
            const isSelected = score === val;
            const isStarLit = score >= val;
            return (
              <button
                key={val}
                type="button"
                onClick={() => handleSelectScore(val)}
                className={`min-h-[38px] rounded-lg border text-xs font-mono-tabular flex flex-col items-center justify-center gap-0.5 transition-all ${getScoreButtonStyle(
                  val,
                  isSelected
                )}`}
                title={`Ocena samopoczucia ${val}/10`}
              >
                <span className="leading-none">{val}</span>
                <Star
                  className={`w-2.5 h-2.5 ${
                    isSelected
                      ? 'text-slate-950 fill-slate-950'
                      : isStarLit
                      ? 'text-amber-400 fill-amber-400'
                      : 'text-slate-600'
                  }`}
                />
              </button>
            );
          })}
        </div>
        <div className="flex justify-between text-[10px] text-slate-400 px-0.5">
          <span>1 — Czułem się bardzo słabo / kryzys</span>
          <span>
            {score > 0 ? visualMeta.label : 'Kliknij 1–10, aby ocenić jazdę'}
          </span>
          <span>10 — Czułem się spoko / Flow</span>
        </div>
      </div>

      {/* Quick Symptom & Feel Comment Chips (DALDA / Hooper + Positive Flow) */}
      <div className="space-y-2 pt-0.5">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-300">
            <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span>
              Szybkie tagi zmęczenia i kryzysu (model DALDA / Hooper):
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {POST_RIDE_NEGATIVE_FEEL_TAGS.map((tag) => {
              const active = selectedTags.includes(tag.label);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => handleToggleTag(tag.label)}
                  className={`min-h-[34px] px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                    active
                      ? 'bg-rose-500/25 border-rose-400 text-rose-200 shadow-sm'
                      : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:border-rose-500/40 hover:text-white'
                  }`}
                  title={tag.physiologicalSystem}
                >
                  {active && <Check className="w-3.5 h-3.5 text-rose-300 shrink-0" />}
                  <span>{tag.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Tagi dobrego dnia / Flow (opcjonalnie przy wysokiej ocenie):</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {POST_RIDE_POSITIVE_FEEL_TAGS.map((tag) => {
              const active = selectedTags.includes(tag.label);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => handleToggleTag(tag.label)}
                  className={`min-h-[34px] px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                    active
                      ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200 shadow-sm'
                      : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:border-emerald-500/40 hover:text-white'
                  }`}
                  title={tag.physiologicalSystem}
                >
                  {active && (
                    <Check className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                  )}
                  <span>{tag.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {!compact && (
          <div className="flex items-center gap-2 pt-1">
            <MessageSquare className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => {
                if (notes !== (activity.feelNotes || '') && score > 0) {
                  commitChange(score, selectedTags, notes);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  commitChange(score || 5, selectedTags, notes);
                }
              }}
              placeholder="Dodatkowy krótki komentarz do jazdy (zapisze się w Firebase i Intervals.icu)..."
              className="w-full min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>
        )}
      </div>
    </div>
  );
};
