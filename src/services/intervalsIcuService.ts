import {
  CompletedActivity,
  IntervalsConfig,
  ProfileId,
  StructuredWorkout,
  WellnessDayMetric,
} from '../types/cycling';
import { encodeActivityToFitBlob } from './fitEncoder';
import { ensureActivityHasRecords } from './firebaseSyncService';
import {
  mapFeel1To10ToIntervalsFeel1To5,
  mapFeel1To10ToIntervalsRpe,
  parseIntervalsWorkoutText,
} from './rampAndPhysiologyEngine';

const INTERVALS_BASE_URL = 'https://intervals.icu/api/v1';

function buildBasicAuthHeader(apiKey: string): string {
  const token = btoa(`API_KEY:${apiKey.trim()}`);
  return `Basic ${token}`;
}

function buildIntervalsActivityDescription(activity: CompletedActivity): string {
  const base = `Domyos Challenge Bike FTMS • Śr. moc: ${activity.avgPowerWatts}W • NP: ${activity.normalizedPowerWatts}W • TSS: ${activity.tss}`;
  const feelParts: string[] = [];
  if (typeof activity.feelScore1To10 === 'number' && activity.feelScore1To10 >= 1) {
    feelParts.push(`Odczucia: ${activity.feelScore1To10}/10`);
  }
  if (activity.feelSymptomTags && activity.feelSymptomTags.length > 0) {
    feelParts.push(`Objawy/Tagi: ${activity.feelSymptomTags.join(', ')}`);
  }
  if (activity.feelNotes && activity.feelNotes.trim()) {
    feelParts.push(`Notatka: ${activity.feelNotes.trim()}`);
  }
  return feelParts.length > 0 ? `${base}\n[${feelParts.join(' • ')}]` : base;
}

/**
 * Fetches Fitness (CTL), Fatigue (ATL), Form (TSB), Ramp Rate, Resting HR, and HRV
 * from Intervals.icu Wellness API for the given date window.
 */
export async function fetchIntervalsWellness(
  config: IntervalsConfig,
  daysCount: number = 28
): Promise<WellnessDayMetric[]> {
  if (!config.apiKey.trim()) {
    throw new Error('Wprowadź swój klucz API Intervals.icu w ustawieniach profilu.');
  }
  const athleteId = config.athleteId.trim() || '0';
  const newestDate = new Date();
  const oldestDate = new Date();
  oldestDate.setDate(newestDate.getDate() - daysCount);

  const oldest = oldestDate.toISOString().slice(0, 10);
  const newest = newestDate.toISOString().slice(0, 10);

  const res = await fetch(
    `${INTERVALS_BASE_URL}/athlete/${encodeURIComponent(athleteId)}/wellness?oldest=${oldest}&newest=${newest}`,
    {
      headers: {
        Authorization: buildBasicAuthHeader(config.apiKey),
        Accept: 'application/json',
      },
    }
  );

  if (!res.ok) {
    throw new Error(`Intervals.icu zwróciło błąd (${res.status}). Sprawdź Athlete ID oraz API Key.`);
  }

  const rawList = await res.json();
  if (!Array.isArray(rawList)) return [];

  return rawList.map((item: any) => {
    const ctl = Number((item.ctl ?? 0).toFixed(1));
    const atl = Number((item.atl ?? 0).toFixed(1));
    return {
      date: item.id || item.date || newest,
      ctl,
      atl,
      tsb: Number((ctl - atl).toFixed(1)),
      tss: Math.round(item.ctlLoad ?? item.atlLoad ?? 0),
      restingHR: item.restingHR,
      hrv: item.hrv,
      weight: item.weight,
      rampRate: item.rampRate,
    };
  });
}

/**
 * Fetches planned workouts from the athlete's Intervals.icu Calendar (Events)
 * and Library (Folders / Workouts), converting them into executable ramp/interval workouts.
 */
export async function fetchIntervalsPlannedAndLibraryWorkouts(
  config: IntervalsConfig,
  profileId: ProfileId,
  ftpWatts: number
): Promise<StructuredWorkout[]> {
  if (!config.apiKey.trim()) {
    throw new Error('Brak klucza API Intervals.icu.');
  }
  const athleteId = config.athleteId.trim() || '0';
  const headers = {
    Authorization: buildBasicAuthHeader(config.apiKey),
    Accept: 'application/json',
  };

  const now = new Date();
  const oldest = new Date(now);
  oldest.setDate(now.getDate() - 3);
  const newest = new Date(now);
  newest.setDate(now.getDate() + 21);

  const oldestStr = oldest.toISOString().slice(0, 10);
  const newestStr = newest.toISOString().slice(0, 10);

  const imported: StructuredWorkout[] = [];

  // 1. Fetch scheduled Calendar Events (WORKOUT category)
  const eventsRes = await fetch(
    `${INTERVALS_BASE_URL}/athlete/${encodeURIComponent(athleteId)}/events?oldest=${oldestStr}&newest=${newestStr}`,
    { headers }
  );

  if (eventsRes.ok) {
    const events = await eventsRes.json();
    if (Array.isArray(events)) {
      for (const ev of events) {
        if (ev.category === 'WORKOUT' || ev.workout_doc || ev.description) {
          const rawText = ev.description || '';
          const blocks = parseIntervalsWorkoutText(rawText, ftpWatts);
          if (blocks.length > 0) {
            imported.push({
              id: `icu_ev_${ev.id}`,
              profileId,
              name: ev.name || 'Zaplanowany trening Intervals.icu',
              description: rawText.slice(0, 220) || 'Pobrano z kalendarza Intervals.icu',
              category: 'Custom',
              scheduledDate: (ev.start_date_local || '').slice(0, 10) || undefined,
              source: 'intervals_calendar',
              externalId: String(ev.id),
              blocks,
              createdAtIso: new Date().toISOString(),
            });
          }
        }
      }
    }
  }

  // 2. Fetch Workout Library (/workouts)
  const libRes = await fetch(
    `${INTERVALS_BASE_URL}/athlete/${encodeURIComponent(athleteId)}/workouts`,
    { headers }
  );

  if (libRes.ok) {
    const libWorkouts = await libRes.json();
    if (Array.isArray(libWorkouts)) {
      for (const w of libWorkouts.slice(0, 25)) {
        const rawText = w.description || '';
        const blocks = parseIntervalsWorkoutText(rawText, ftpWatts);
        if (blocks.length > 0) {
          imported.push({
            id: `icu_lib_${w.id}`,
            profileId,
            name: w.name || 'Trening z biblioteki Intervals.icu',
            description: rawText.slice(0, 220) || 'Biblioteka Intervals.icu',
            category: 'Custom',
            source: 'intervals_library',
            externalId: String(w.id),
            blocks,
            createdAtIso: new Date().toISOString(),
          });
        }
      }
    }
  }

  return imported;
}

/**
 * Updates subjective `feel` (1–5 in Intervals.icu), `icu_rpe` (1–10), and `description`
 * on an existing Intervals.icu activity via PUT /api/v1/activities/{intervalsActivityId}
 */
export async function updateIntervalsActivityFeelAndNotes(
  config: IntervalsConfig,
  activity: CompletedActivity
): Promise<{ ok: boolean; message: string }> {
  if (!config.enabled || !config.apiKey.trim()) {
    return { ok: false, message: 'Integracja Intervals.icu nie jest aktywna.' };
  }
  if (!activity.intervalsActivityId) {
    return { ok: false, message: 'Brak identyfikatora aktywności Intervals.icu.' };
  }
  if (typeof activity.feelScore1To10 !== 'number' || activity.feelScore1To10 < 1) {
    return { ok: false, message: 'Brak oceny odczuć (1–10).' };
  }

  const feel1To5 = mapFeel1To10ToIntervalsFeel1To5(activity.feelScore1To10);
  const icuRpe = mapFeel1To10ToIntervalsRpe(
    activity.feelScore1To10,
    activity.intensityFactor
  );
  const description = buildIntervalsActivityDescription(activity);

  const res = await fetch(
    `${INTERVALS_BASE_URL}/activities/${encodeURIComponent(activity.intervalsActivityId)}`,
    {
      method: 'PUT',
      headers: {
        Authorization: buildBasicAuthHeader(config.apiKey),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        feel: feel1To5,
        icu_rpe: icuRpe,
        description,
      }),
    }
  );

  if (!res.ok) {
    return {
      ok: false,
      message: `Nie udało się zaktualizować odczuć w Intervals.icu (status ${res.status}).`,
    };
  }

  return {
    ok: true,
    message: `Zaktualizowano odczucia (${activity.feelScore1To10}/10 → Feel ${feel1To5}/5, RPE ${icuRpe}/10) w Intervals.icu!`,
  };
}

/**
 * Uploads a completed activity's binary .FIT file directly to Intervals.icu
 * via POST /api/v1/athlete/{id}/activities and syncs subjective Feel/RPE if present.
 */
export async function uploadActivityFitToIntervals(
  config: IntervalsConfig,
  activity: CompletedActivity
): Promise<{ ok: boolean; activityId?: string; message: string }> {
  if (!config.apiKey.trim()) {
    return { ok: false, message: 'Brak klucza API Intervals.icu w profilu.' };
  }
  const athleteId = config.athleteId.trim() || '0';
  const hydratedActivity = await ensureActivityHasRecords(activity);
  const fitBlob = encodeActivityToFitBlob(hydratedActivity);
  const datePart = activity.startedAtIso.slice(0, 10);
  const fileName = `Domyos_${datePart}_${activity.id}.fit`;

  const form = new FormData();
  form.append('file', fitBlob, fileName);

  const query = new URLSearchParams({
    name: activity.workoutName,
    description: buildIntervalsActivityDescription(activity),
    external_id: activity.id,
  });

  const res = await fetch(
    `${INTERVALS_BASE_URL}/athlete/${encodeURIComponent(athleteId)}/activities?${query.toString()}`,
    {
      method: 'POST',
      headers: {
        Authorization: buildBasicAuthHeader(config.apiKey),
      },
      body: form,
    }
  );

  if (!res.ok) {
    return {
      ok: false,
      message: `Błąd wysyłania do Intervals.icu (status ${res.status}).`,
    };
  }

  const data = await res.json().catch(() => ({}));
  const activityId = data?.id ? String(data.id) : undefined;

  // If rider already selected post-ride feel (1-10) or tags, sync them to the newly created Intervals.icu activity
  if (activityId && typeof activity.feelScore1To10 === 'number' && activity.feelScore1To10 >= 1) {
    await updateIntervalsActivityFeelAndNotes(config, {
      ...activity,
      intervalsActivityId: activityId,
    }).catch(() => {});
  }

  return {
    ok: true,
    activityId,
    message: 'Pomyślnie przesłano plik .FIT do Intervals.icu!',
  };
}

