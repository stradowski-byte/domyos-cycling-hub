import {
  AthleteProfile,
  CompletedActivity,
  HeartRateZone,
  HrBreakdownSummary,
  HrZoneDetailedStat,
  OfflineTrainingMode,
  PeakPowerWindowStat,
  PowerZone,
  ProfileId,
  RampCurveType,
  StructuredWorkout,
  TelemetryRecord,
  WellnessDayMetric,
  WorkoutBlock,
} from '../types/cycling';

export function buildDefaultPowerZones(): PowerZone[] {
  return [
    { zone: 1, name: 'Z1 Aktywna Regeneracja', minPct: 0, maxPct: 55, color: '#94A3B8' },
    { zone: 2, name: 'Z2 Wytrzymałość (Endurance)', minPct: 56, maxPct: 75, color: '#3B82F6' },
    { zone: 3, name: 'Z3 Tempo / Sweet Spot', minPct: 76, maxPct: 90, color: '#10B981' },
    { zone: 4, name: 'Z4 Próg Mleczanowy (FTP)', minPct: 91, maxPct: 105, color: '#F59E0B' },
    { zone: 5, name: 'Z5 VO2 Max', minPct: 106, maxPct: 120, color: '#EF4444' },
    { zone: 6, name: 'Z6 Wydolność Beztlenowa', minPct: 121, maxPct: 150, color: '#A855F7' },
    { zone: 7, name: 'Z7 Moc Neuromięśniowa', minPct: 151, maxPct: 300, color: '#EC4899' },
  ];
}

export function buildPowerZonesFromFtp(_ftpWatts?: number): PowerZone[] {
  return buildDefaultPowerZones();
}

export function buildHrZonesFromMax(maxHr: number): HeartRateZone[] {
  return [
    { zone: 1, name: 'Z1 Regeneracja', minBpm: Math.round(maxHr * 0.5), maxBpm: Math.round(maxHr * 0.6), color: '#94A3B8' },
    { zone: 2, name: 'Z2 Tlenowa / Spalanie', minBpm: Math.round(maxHr * 0.6) + 1, maxBpm: Math.round(maxHr * 0.7), color: '#3B82F6' },
    { zone: 3, name: 'Z3 Aerobowa / Tempo', minBpm: Math.round(maxHr * 0.7) + 1, maxBpm: Math.round(maxHr * 0.8), color: '#10B981' },
    { zone: 4, name: 'Z4 Próg Beztlenowy', minBpm: Math.round(maxHr * 0.8) + 1, maxBpm: Math.round(maxHr * 0.9), color: '#F59E0B' },
    { zone: 5, name: 'Z5 Maksymalna (VO2Max)', minBpm: Math.round(maxHr * 0.9) + 1, maxBpm: maxHr, color: '#EF4444' },
  ];
}

export const PROFILE_AVATAR_COLORS = [
  '#10B981',
  '#3B82F6',
  '#F59E0B',
  '#A855F7',
  '#EC4899',
  '#06B6D4',
];

export const DEFAULT_PROFILES: Record<ProfileId, AthleteProfile> = {};

export function createFallbackRuntimeProfile(): AthleteProfile {
  return {
    id: 'google_rider',
    name: 'Zawodnik Google',
    subtitle: 'Konto Google + Firebase + Google Fit & Intervals.icu',
    avatarColor: '#10B981',
    ftpWatts: 200,
    weightKg: 75,
    maxHrBpm: 188,
    restingHrBpm: 54,
    lthrBpm: 170,
    offlineMode: 'all',
    hrZones: buildHrZonesFromMax(188),
    powerZones: buildDefaultPowerZones(),
    intervals: {
      enabled: false,
      athleteId: '',
      apiKey: '',
      autoUploadActivities: true,
    },
    googleFit: {
      enabled: true,
      autoUploadActivities: true,
    },
  };
}

export function sanitizeProfileSlug(name: string, existingIds: string[] = []): ProfileId {
  const base = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20);
  const candidate = base && base !== 'shared' && base !== 'engine' ? base : 'profil';
  if (!existingIds.includes(candidate)) return candidate;
  let counter = 2;
  while (existingIds.includes(`${candidate}_${counter}`)) {
    counter++;
  }
  return `${candidate}_${counter}`;
}

export function createNewAthleteProfile(params: {
  name: string;
  subtitle?: string;
  avatarColor?: string;
  ftpWatts?: number;
  weightKg?: number;
  maxHrBpm?: number;
  restingHrBpm?: number;
  lthrBpm?: number;
  offlineMode?: OfflineTrainingMode;
  intervalsEnabled?: boolean;
  athleteId?: string;
  apiKey?: string;
  existingIds?: string[];
}): AthleteProfile {
  const id = sanitizeProfileSlug(params.name, params.existingIds || []);
  const maxHr = Math.max(120, Math.min(230, params.maxHrBpm || 188));
  const lthr = Math.max(100, Math.min(maxHr, params.lthrBpm || Math.round(maxHr * 0.9)));
  const offlineMode: OfflineTrainingMode = params.offlineMode || 'all';
  const defaultSubtitle =
    offlineMode === 'ftp_builder'
      ? 'Budowa FTP & Interwały + Intervals.icu'
      : offlineMode === 'cardio_fitness'
      ? 'Cardio, Zdrowie & Spalanie + Offline'
      : 'Pełny Komputer Kolarski Offline + Intervals.icu';

  return {
    id,
    name: params.name.trim() || 'Nowy Profil',
    subtitle: params.subtitle?.trim() || defaultSubtitle,
    avatarColor: params.avatarColor || PROFILE_AVATAR_COLORS[0],
    ftpWatts: Math.max(50, Math.min(600, params.ftpWatts || 200)),
    weightKg: Math.max(35, Math.min(180, params.weightKg || 75)),
    maxHrBpm: maxHr,
    restingHrBpm: Math.max(35, Math.min(110, params.restingHrBpm || 55)),
    lthrBpm: lthr,
    offlineMode,
    hrZones: buildHrZonesFromMax(maxHr),
    powerZones: buildDefaultPowerZones(),
    intervals: {
      enabled: Boolean(params.intervalsEnabled || params.apiKey?.trim()),
      athleteId: params.athleteId?.trim() || '',
      apiKey: params.apiKey?.trim() || '',
      autoUploadActivities: true,
    },
  };
}

export function getCurveExponent(curve: RampCurveType): number {
  switch (curve) {
    case 'progressive':
      return 1.45; // gentler start, steeper finish
    case 'regressive':
      return 0.65; // steeper start, flatter finish
    case 'linear':
    default:
      return 1.0;
  }
}

/**
 * Calculates the instantaneous target power (Watts) and target resistance level (1-32)
 * at a specific second inside a WorkoutBlock, applying the ramp curve algorithm and user bias %.
 */
export function calculateBlockInstantTarget(
  block: WorkoutBlock,
  elapsedInBlockSec: number,
  ftpWatts: number,
  biasPercent: number = 100
): { targetWatts: number; targetResistance: number; progressRatio: number } {
  const duration = Math.max(1, block.durationSec);
  const clampedElapsed = Math.min(Math.max(0, elapsedInBlockSec), duration);
  const linearRatio = duration <= 1 ? 1 : clampedElapsed / duration;
  const alpha = getCurveExponent(block.rampCurve || 'linear');
  const curvedRatio = Math.pow(linearRatio, alpha);

  const rawValue = block.startValue + (block.endValue - block.startValue) * curvedRatio;
  const baseWatts =
    block.unit === 'pct_ftp' ? (rawValue / 100) * ftpWatts : rawValue;

  const biasedWatts = Math.max(30, Math.round(baseWatts * (biasPercent / 100)));

  // Calculate resistance level (1-32 on Domyos Challenge Bike)
  const startRes = block.startResistanceLevel ?? Math.max(1, Math.min(32, Math.round((biasedWatts / 350) * 32)));
  const endRes = block.endResistanceLevel ?? startRes;
  const interpolatedRes = Math.round(startRes + (endRes - startRes) * curvedRatio);
  const biasedRes = Math.max(1, Math.min(32, Math.round(interpolatedRes * (biasPercent / 100))));

  return {
    targetWatts: biasedWatts,
    targetResistance: biasedRes,
    progressRatio: linearRatio,
  };
}

export function getPowerZoneForWatts(watts: number, ftpWatts: number, zones: PowerZone[]): PowerZone {
  const pct = ftpWatts > 0 ? (watts / ftpWatts) * 100 : 0;
  for (const z of zones) {
    if (pct <= z.maxPct) return z;
  }
  return zones[zones.length - 1];
}

export function getHrZoneForBpm(bpm: number, zones: HeartRateZone[]): HeartRateZone {
  for (const z of zones) {
    if (bpm <= z.maxBpm) return z;
  }
  return zones[zones.length - 1];
}

/**
 * Standard 700c (28-inch, 700x25c) road bike wheel circumference in meters.
 * Speed is computed directly from rotations per second (RPS = RPM / 60) * circumference (2.105 m),
 * and distance is computed by multiplying speed by elapsed ride time (time cancels out -> pure distance).
 */
export const ROAD_WHEEL_700C_CIRCUMFERENCE_M = 2.105;

export function calculate700cWheelSpeedAndDistance(
  cadenceRpm: number,
  elapsedDeltaSec: number = 1
): {
  rotationsPerSec: number;
  speedMetersPerSec: number;
  speedKmh: number;
  distanceDeltaMeters: number;
} {
  const safeRpm = Math.max(0, Number.isFinite(cadenceRpm) ? cadenceRpm : 0);
  const safeSec = Math.max(0, Number.isFinite(elapsedDeltaSec) ? elapsedDeltaSec : 0);
  const rotationsPerSec = safeRpm / 60;
  const speedMetersPerSec = rotationsPerSec * ROAD_WHEEL_700C_CIRCUMFERENCE_M;
  const speedKmh = Number((speedMetersPerSec * 3.6).toFixed(1));
  // Distance = speed (m/s) * time (s) [or speed (km/h) * time (h) * 1000] — time cancels out
  const distanceDeltaMeters = speedMetersPerSec * safeSec;

  return {
    rotationsPerSec,
    speedMetersPerSec,
    speedKmh,
    distanceDeltaMeters,
  };
}


/**
 * Parses Intervals.icu workout description syntax into executable WorkoutBlock[]
 * Supports:
 * - "- 10m ramp 50-75% 90rpm"
 * - "- 5m 65%"
 * - "- 4m 180-240W"
 * - "4x" repeat loops
 */
export function parseIntervalsWorkoutText(text: string, fallbackFtp: number = 200): WorkoutBlock[] {
  const rawLines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => !l.startsWith('#') && !l.startsWith('//'));

  const blocks: WorkoutBlock[] = [];
  let currentRepeat = 1;
  let repeatBuffer: Omit<WorkoutBlock, 'id'>[] = [];

  const flushRepeats = () => {
    if (repeatBuffer.length > 0) {
      for (let r = 0; r < currentRepeat; r++) {
        for (const item of repeatBuffer) {
          blocks.push({
            ...item,
            id: `blk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${blocks.length}`,
            label: currentRepeat > 1 ? `${item.label} (${r + 1}/${currentRepeat})` : item.label,
          });
        }
      }
      repeatBuffer = [];
      currentRepeat = 1;
    }
  };

  for (const line of rawLines) {
    // Blank line ends any active Nx repeat group
    if (line.length === 0) {
      flushRepeats();
      continue;
    }

    const repeatMatch = line.match(/^(\d+)\s*x$/i);
    if (repeatMatch) {
      flushRepeats();
      const count = parseInt(repeatMatch[1], 10);
      currentRepeat = count <= 1 ? 1 : Math.min(30, count);
      continue;
    }

    if (!line.startsWith('-')) {
      continue;
    }

    const clean = line.replace(/^-+\s*/, '');
    // Extract duration: e.g. 10m, 1m30s, 45s
    const durMatch = clean.match(/(?:(\d+)\s*m(?:in)?)?\s*(?:(\d+)\s*s(?:ec)?)?/i);
    let durationSec = 300;
    if (durMatch && (durMatch[1] || durMatch[2])) {
      const mins = durMatch[1] ? parseInt(durMatch[1], 10) : 0;
      const secs = durMatch[2] ? parseInt(durMatch[2], 10) : 0;
      durationSec = Math.max(10, mins * 60 + secs);
    }

    const isRampKeyword = /ramp/i.test(clean);
    const isProgressiveKeyword = /prog/i.test(clean);

    // Range or single value in % or W: e.g. 50-75%, 150-220W, 85%, 200W
    const rangePctMatch = clean.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*%/i);
    const rangeWattsMatch = clean.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*w/i);
    const singlePctMatch = clean.match(/(\d+(?:\.\d+)?)\s*%/i);
    const singleWattsMatch = clean.match(/(\d+(?:\.\d+)?)\s*w/i);
    const rpmMatch = clean.match(/(\d+)\s*rpm/i);

    let unit: 'pct_ftp' | 'watts' = 'pct_ftp';
    let startValue = 65;
    let endValue = 65;
    let type: WorkoutBlock['type'] = 'steady';

    if (rangePctMatch) {
      unit = 'pct_ftp';
      startValue = parseFloat(rangePctMatch[1]);
      endValue = parseFloat(rangePctMatch[2]);
      type = 'ramp';
    } else if (rangeWattsMatch) {
      unit = 'watts';
      startValue = parseFloat(rangeWattsMatch[1]);
      endValue = parseFloat(rangeWattsMatch[2]);
      type = 'ramp';
    } else if (singlePctMatch) {
      unit = 'pct_ftp';
      startValue = parseFloat(singlePctMatch[1]);
      endValue = startValue;
      type = isRampKeyword ? 'ramp' : 'steady';
    } else if (singleWattsMatch) {
      unit = 'watts';
      startValue = parseFloat(singleWattsMatch[1]);
      endValue = startValue;
      type = isRampKeyword ? 'ramp' : 'steady';
    }

    // Never allow a cooldown ramp (e.g. 60-40%) to be swallowed inside an Nx repeat loop
    if (
      currentRepeat > 1 &&
      repeatBuffer.length >= 2 &&
      type === 'ramp' &&
      startValue > endValue &&
      endValue <= 45
    ) {
      flushRepeats();
    }

    const targetCadenceRpm = rpmMatch ? parseInt(rpmMatch[1], 10) : 90;
    const labelPrefix =
      type === 'ramp'
        ? startValue < endValue
          ? 'Rampa w górę'
          : 'Rampa w dół'
        : startValue >= 95
        ? 'Interwał Próg/VO2'
        : startValue <= 60
        ? 'Odpoczynek / Z1'
        : 'Tempo / Baza';

    const parsedBlock: Omit<WorkoutBlock, 'id'> = {
      label: labelPrefix,
      type,
      durationSec,
      unit,
      startValue,
      endValue,
      rampCurve: isProgressiveKeyword ? 'progressive' : 'linear',
      targetCadenceRpm,
    };

    if (currentRepeat > 1) {
      repeatBuffer.push(parsedBlock);
    } else {
      blocks.push({
        ...parsedBlock,
        id: `blk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${blocks.length}`,
      });
    }
  }

  flushRepeats();

  if (blocks.length === 0 && fallbackFtp > 0) {
    return [
      {
        id: 'default_1',
        label: 'Rozgrzewka Rampa',
        type: 'ramp',
        durationSec: 600,
        unit: 'pct_ftp',
        startValue: 45,
        endValue: 75,
        rampCurve: 'linear',
        targetCadenceRpm: 90,
      },
    ];
  }

  return blocks;
}

export function formatBlocksToIntervalsText(blocks: WorkoutBlock[]): string {
  return blocks
    .map((b) => {
      const mins = Math.floor(b.durationSec / 60);
      const secs = b.durationSec % 60;
      const durStr = `${mins > 0 ? `${mins}m` : ''}${secs > 0 ? `${secs}s` : ''}`;
      const unitStr = b.unit === 'pct_ftp' ? '%' : 'W';
      const rpmStr = b.targetCadenceRpm ? ` ${b.targetCadenceRpm}rpm` : '';
      if (b.type === 'ramp' || b.startValue !== b.endValue) {
        const curveTag = b.rampCurve === 'progressive' ? ' prog' : '';
        return `- ${durStr} ramp ${b.startValue}-${b.endValue}${unitStr}${curveTag}${rpmStr}`;
      }
      return `- ${durStr} ${b.startValue}${unitStr}${rpmStr}`;
    })
    .join('\n');
}

export const DEFAULT_WORKOUT_TAGS: string[] = [
  'Z2',
  'Endurance',
  'Threshold / Sweet Spot',
  'VO2max',
  'Testy (FTP 20m / Ramp)',
  'Recovery',
];

/**
 * Infers one or more category tags for a workout if `workout.tags` is missing or empty.
 */
export function inferWorkoutTags(
  workout: Pick<StructuredWorkout, 'name' | 'category' | 'tags' | 'description'>
): string[] {
  if (Array.isArray(workout.tags) && workout.tags.length > 0) {
    return Array.from(new Set(workout.tags.map((t) => t.trim()).filter(Boolean)));
  }

  const inferred = new Set<string>();
  const text = `${workout.name} ${workout.description || ''}`.toLowerCase();

  if (
    workout.category === 'RampTest' ||
    /ramp\s*test|test\s*ftp|20\s*min.*ftp|test\s*wydolno/i.test(text)
  ) {
    inferred.add('Testy (FTP 20m / Ramp)');
  }
  if (/z2|fatmax|tlenow|spalanie/i.test(text)) {
    inferred.add('Z2');
  }
  if (workout.category === 'Endurance' || /endurance|wytrzyma|tempo/i.test(text)) {
    inferred.add('Endurance');
  }
  if (
    workout.category === 'Threshold' ||
    /sweet\s*spot|threshold|próg|prog|over-under|cruise/i.test(text)
  ) {
    inferred.add('Threshold / Sweet Spot');
  }
  if (
    workout.category === 'VO2Max' ||
    /vo2|interwa|30\/15|4x4|billat|rønnestad|ronnestad/i.test(text)
  ) {
    inferred.add('VO2max');
  }
  if (workout.category === 'Recovery' || /recovery|regenerac|rozjazd|openers/i.test(text)) {
    inferred.add('Recovery');
  }

  if (inferred.size === 0) {
    inferred.add('Endurance');
  }

  return Array.from(inferred);
}

/**
 * Serializes a StructuredWorkout into a standalone, human-readable Intervals.icu .txt file
 * that lives in /DomyosCyclingHub/Workouts_Library/<profileId>/ (or locally on disk).
 */
export function serializeWorkoutToIcuTextFile(workout: StructuredWorkout): string {
  const tags = inferWorkoutTags(workout);
  const headerLines = [
    `# ID: ${workout.id}`,
    `# Name: ${workout.name}`,
    `# Category: ${workout.category}`,
    `# Tags: ${tags.join(', ')}`,
    workout.scheduledDate ? `# Date: ${workout.scheduledDate}` : null,
    workout.description ? `# Description: ${workout.description.replace(/\r?\n/g, ' ')}` : null,
    '',
  ].filter((l) => l !== null);

  return `${headerLines.join('\n')}\n${formatBlocksToIntervalsText(workout.blocks)}\n`;
}

export function getCleanWorkoutTxtFileName(workout: StructuredWorkout): string {
  const cleanName = workout.name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 44);
  return `${cleanName || 'Trening'}.txt`;
}

/**
 * Parses an Intervals.icu .txt workout file into an executable StructuredWorkout object.
 */
export function parseIcuTextFileToWorkout(
  textContent: string,
  fallbackFileName: string = 'Trening.txt',
  folderProfileId?: ProfileId | 'shared'
): StructuredWorkout {
  const extractMeta = (key: string): string | undefined => {
    const regex = new RegExp(`^#\\s*${key}:\\s*(.+)$`, 'im');
    const match = textContent.match(regex);
    return match ? match[1].trim() : undefined;
  };

  const rawProfileFromHeader = (extractMeta('Profile') || '').toLowerCase();
  const profileId: ProfileId | 'shared' =
    folderProfileId || (rawProfileFromHeader ? rawProfileFromHeader : 'shared');

  const cleanFileBase = fallbackFileName
    .replace(/\.(txt|icu|erg|zwo)$/i, '')
    .replace(/^(shared|default)_/i, '');

  const id =
    extractMeta('ID') ||
    `w_txt_${profileId}_${cleanFileBase.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase()}`;
  const name = extractMeta('Name') || cleanFileBase.replace(/_/g, ' ');
  const scheduledDate = extractMeta('Date');
  const description =
    extractMeta('Description') ||
    `Plik tekstowy .txt z katalogu /Workouts_Library/${profileId}`;

  const rawCategory = extractMeta('Category') as StructuredWorkout['category'] | undefined;
  const validCategories: StructuredWorkout['category'][] = [
    'Endurance',
    'Threshold',
    'VO2Max',
    'RampTest',
    'Recovery',
    'Custom',
  ];
  const category: StructuredWorkout['category'] =
    rawCategory && validCategories.includes(rawCategory) ? rawCategory : 'Custom';

  const rawTagsHeader = extractMeta('Tags');
  const parsedHeaderTags = rawTagsHeader
    ? rawTagsHeader
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  const blocks = parseIntervalsWorkoutText(textContent, 200);

  const baseWorkout: StructuredWorkout = {
    id,
    profileId,
    name,
    description,
    category,
    tags: parsedHeaderTags,
    scheduledDate,
    source: 'local',
    blocks,
    createdAtIso: new Date().toISOString(),
  };

  baseWorkout.tags = inferWorkoutTags(baseWorkout);
  return baseWorkout;
}

export function downloadWorkoutAsTextFile(workout: StructuredWorkout): void {
  const content = serializeWorkoutToIcuTextFile(workout);
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const filename = getCleanWorkoutTxtFileName(workout);

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Returns the comprehensive 18-workout scientific library with 3–4 workouts per category
 * (Z2, Endurance, Threshold / Sweet Spot, VO2max, Testy (FTP 20m / Ramp), Recovery).
 */
export function getInitialWorkouts(): StructuredWorkout[] {
  const today = new Date().toISOString().slice(0, 10);
  return [
    // =========================================================================
    // KATEGORIA 1: Z2 (BAZA TLENOWA & FATMAX) — 4 treningi
    // =========================================================================
    {
      id: 'w_z2_steady_45',
      profileId: 'shared',
      name: 'Klasyczna Baza Tlenowa Z2 Steady (45 min)',
      description:
        'Równa jazda w środku 2. strefy mocy (65% FTP) stymulująca biogenezę mitochondriów, kapilaryzację mięśni i maksymalne utlenianie tłuszczów (FatMax).',
      category: 'Endurance',
      tags: ['Z2', 'Endurance'],
      scheduledDate: today,
      source: 'local',
      createdAtIso: new Date().toISOString(),
      blocks: parseIntervalsWorkoutText(
        `- 6m ramp 45-65% 88rpm\n- 34m 65% 90rpm\n- 5m ramp 62-42% 82rpm`
      ),
    },
    {
      id: 'w_cardio_fatburn_z2',
      profileId: 'shared',
      name: 'Piramida Tlenowa Z2 FatMax (40 min)',
      description:
        'Progresywna piramida w strefie tlenowej Z2 (58% -> 65% -> 72% -> 62% FTP) utrzymująca wysokie zaangażowanie włókien wolnokurczliwych Typu I.',
      category: 'Endurance',
      tags: ['Z2'],
      scheduledDate: today,
      source: 'local',
      createdAtIso: new Date().toISOString(),
      blocks: parseIntervalsWorkoutText(
        `- 5m ramp 45-58% 85rpm\n- 8m 58% 88rpm\n- 10m 65% 90rpm\n- 7m 72% 92rpm\n- 5m 62% 88rpm\n- 5m ramp 58-42% 80rpm`
      ),
    },
    {
      id: 'w_z2_cadence_bursts_50',
      profileId: 'shared',
      name: 'Baza Z2 z Pobudzeniami Kadencyjnymi (50 min)',
      description:
        'Trening tlenowy 65% FTP przeplatany 4 krótkimi pobudzeniami nerwowo-mięśniowymi (30s @ 105 rpm) bez przekraczania progu mleczanowego.',
      category: 'Endurance',
      tags: ['Z2', 'Endurance'],
      scheduledDate: today,
      source: 'local',
      createdAtIso: new Date().toISOString(),
      blocks: parseIntervalsWorkoutText(
        `- 6m ramp 45-65% 88rpm\n4x\n- 9m 65% 90rpm\n- 30s 78% 105rpm\n\n- 6m 64% 88rpm\n- 2m ramp 60-42% 80rpm`
      ),
    },
    {
      id: 'w_z2_wave_endurance_60',
      profileId: 'shared',
      name: 'Falowa Wytrzymałość Tlenowa Z2 (60 min)',
      description:
        'Godzinna sesja wytrzymałościowa z łagodnymi falami mocy między 60% a 73% FTP eliminującymi monotonię jazdy na trenażerze.',
      category: 'Endurance',
      tags: ['Z2', 'Endurance'],
      scheduledDate: today,
      source: 'local',
      createdAtIso: new Date().toISOString(),
      blocks: parseIntervalsWorkoutText(
        `- 6m ramp 45-62% 88rpm\n3x\n- 8m ramp 60-73% 90rpm\n- 8m ramp 73-60% 88rpm\n\n- 6m ramp 60-42% 82rpm`
      ),
    },
    {
      id: 'w_z2_endurance_75',
      profileId: 'shared',
      name: 'Długa Wytrzymałość Domowa Z2/Z3 (1h 15m)',
      description:
        'Pełna 75-minutowa sesja domowa łącząca bazę tlenową Z2 (68% FTP) z trzema 6-minutowymi wstawkami w dolnym Tempo Z3 (80% FTP) bez przekraczania 1h 20m.',
      category: 'Endurance',
      tags: ['Z2', 'Endurance'],
      scheduledDate: today,
      source: 'local',
      createdAtIso: new Date().toISOString(),
      blocks: parseIntervalsWorkoutText(
        `- 8m ramp 45-66% 88rpm\n3x\n- 14m 68% 90rpm\n- 6m 80% 92rpm\n\n- 7m ramp 62-42% 82rpm`
      ),
    },

    // =========================================================================
    // KATEGORIA 2: ENDURANCE (WYTRZYMAŁOŚĆ & TEMPO AEROBOWE) — 3 dodatkowe (+3 wspólne z Z2)
    // =========================================================================
    {
      id: 'w_endurance_ramps',
      profileId: 'shared',
      name: 'Wytrzymałość Zmienna Z2/Z3 Tempo (45 min)',
      description:
        'Trening wytrzymałościowy z płynnymi przejściami ze strefy Z2 (68% FTP) do dolnego Tempo Z3 (84% FTP) budujący odporność mięśniową (durability).',
      category: 'Endurance',
      tags: ['Endurance', 'Z2'],
      scheduledDate: today,
      source: 'local',
      createdAtIso: new Date().toISOString(),
      blocks: parseIntervalsWorkoutText(
        `- 6m ramp 45-68% 86rpm\n- 10m ramp 68-82% 90rpm\n- 5m 65% 88rpm\n- 10m ramp 70-84% 92rpm\n- 9m 68% 90rpm\n- 5m ramp 62-42% 80rpm`
      ),
    },
    {
      id: 'w_endurance_progressive_tempo_50',
      profileId: 'shared',
      name: 'Progresywne Tempo Aerobowe 3x 10 min (50 min)',
      description:
        'Trzy 10-minutowe rampy w strefie Z2/Z3 (72% -> 85% FTP) podnoszące ekonomię pedałowania i próg tlenowy LT1.',
      category: 'Endurance',
      tags: ['Endurance'],
      scheduledDate: today,
      source: 'local',
      createdAtIso: new Date().toISOString(),
      blocks: parseIntervalsWorkoutText(
        `- 8m ramp 48-70% 88rpm\n3x\n- 10m ramp 72-85% 92rpm\n- 3m 60% 85rpm\n\n- 3m ramp 60-42% 80rpm`
      ),
    },
    {
      id: 'w_endurance_torque_low_cadence_45',
      profileId: 'shared',
      name: 'Wytrzymałość Siłowa Niska Kadencja 4x 5 min (45 min)',
      description:
        'Cztery 5-minutowe odcinki w górnym Z2 / dolnym Z3 (80% FTP) przy kadencji 68 RPM rozwijające moment obrotowy i siłę specyficzną na podjazdach.',
      category: 'Endurance',
      tags: ['Endurance'],
      scheduledDate: today,
      source: 'local',
      createdAtIso: new Date().toISOString(),
      blocks: parseIntervalsWorkoutText(
        `- 8m ramp 45-70% 88rpm\n4x\n- 5m 80% 68rpm\n- 3m 60% 90rpm\n\n- 5m ramp 62-42% 82rpm`
      ),
    },

    // =========================================================================
    // KATEGORIA 3: THRESHOLD / SWEET SPOT (PRÓG FTP) — 5 treningów
    // =========================================================================
    {
      id: 'w_sweetspot_3x10',
      profileId: 'shared',
      name: 'Klasyczny Sweet Spot 3x 10 min (54 min)',
      description:
        'Złoty standard budowania bazy pod próg FTP: 3x 10 minut na 90% FTP z 4-minutowym odpoczynkiem. Wysoki bodziec adaptacyjny przy umiarkowanym koszcie zmęczenia.',
      category: 'Threshold',
      tags: ['Threshold / Sweet Spot'],
      scheduledDate: today,
      source: 'local',
      createdAtIso: new Date().toISOString(),
      blocks: parseIntervalsWorkoutText(
        `- 8m ramp 48-78% 90rpm\n3x\n- 10m 90% 92rpm\n- 4m 55% 85rpm\n\n- 4m ramp 60-42% 80rpm`
      ),
    },
    {
      id: 'w_sweetspot_endurance_65',
      profileId: 'shared',
      name: 'Rozbudowany Sweet Spot 3x 12 min + Z2 (1h 05m)',
      description:
        'Pełna jednostka 65-minutowa: 3x 12 minut w paśmie Sweet Spot (90% FTP) domknięte 9-minutowym tlenem Z2 (66% FTP) — idealna pod 1h–1h 15m na trenażerze.',
      category: 'Threshold',
      tags: ['Threshold / Sweet Spot', 'Endurance'],
      scheduledDate: today,
      source: 'local',
      createdAtIso: new Date().toISOString(),
      blocks: parseIntervalsWorkoutText(
        `- 8m ramp 48-78% 90rpm\n3x\n- 12m 90% 92rpm\n- 3m 55% 85rpm\n\n- 8m 66% 90rpm\n- 4m ramp 60-42% 80rpm`
      ),
    },
    {
      id: 'w_threshold_over_unders_50',
      profileId: 'shared',
      name: 'Over-Unders (Wypłukiwanie Mleczanu) 3x 9 min (52 min)',
      description:
        'Naprzemienna praca 2 min pod progiem (92% FTP) i 1 min nad progiem (105% FTP) trenująca transportery MCT1/MCT4 do utylizacji mleczanu jako paliwa.',
      category: 'Threshold',
      tags: ['Threshold / Sweet Spot'],
      scheduledDate: today,
      source: 'local',
      createdAtIso: new Date().toISOString(),
      blocks: parseIntervalsWorkoutText(
        `- 8m ramp 48-80% 90rpm\n- 2m 55% 85rpm\n3x\n- 2m 92% 92rpm\n- 1m 105% 96rpm\n- 2m 92% 92rpm\n- 1m 105% 96rpm\n- 2m 92% 92rpm\n- 1m 105% 96rpm\n- 4m 55% 85rpm\n\n- 3m ramp 58-40% 80rpm`
      ),
    },
    {
      id: 'w_threshold_cruise_4x8',
      profileId: 'shared',
      name: 'Próg Mleczanowy Cruise Intervals 4x 8 min (55 min)',
      description:
        'Cztery 8-minutowe odcinki dokładnie na progu FTP (99% FTP) zwiększające czas utrzymania mocy krytycznej (TTE) oraz równowagę MLSS.',
      category: 'Threshold',
      tags: ['Threshold / Sweet Spot'],
      scheduledDate: today,
      source: 'local',
      createdAtIso: new Date().toISOString(),
      blocks: parseIntervalsWorkoutText(
        `- 8m ramp 45-80% 90rpm\n4x\n- 8m 99% 94rpm\n- 3m 55% 85rpm\n\n- 3m ramp 60-40% 80rpm`
      ),
    },
    {
      id: 'w_ramp_sweetspot',
      profileId: 'shared',
      name: 'Progresywny Sweet Spot & Finisz FTP (45 min)',
      description:
        'Rozgrzewka progresywna, 3 odcinki narastające od strefy Sweet Spot (80% FTP) do ponad progu (106% FTP) oraz spokojne schłodzenie.',
      category: 'Threshold',
      tags: ['Threshold / Sweet Spot'],
      scheduledDate: today,
      source: 'local',
      createdAtIso: new Date().toISOString(),
      blocks: [
        {
          id: 'b1',
          label: 'Rozgrzewka',
          type: 'ramp',
          durationSec: 480,
          unit: 'pct_ftp',
          startValue: 45,
          endValue: 75,
          rampCurve: 'linear',
          targetCadenceRpm: 88,
        },
        {
          id: 'b2',
          label: 'Odcinek 1 — Sweet Spot',
          type: 'ramp',
          durationSec: 360,
          unit: 'pct_ftp',
          startValue: 80,
          endValue: 96,
          rampCurve: 'progressive',
          targetCadenceRpm: 92,
        },
        {
          id: 'b3',
          label: 'Odpoczynek Z1/Z2',
          type: 'steady',
          durationSec: 180,
          unit: 'pct_ftp',
          startValue: 55,
          endValue: 55,
          rampCurve: 'linear',
          targetCadenceRpm: 85,
        },
        {
          id: 'b4',
          label: 'Odcinek 2 — Próg FTP',
          type: 'ramp',
          durationSec: 360,
          unit: 'pct_ftp',
          startValue: 84,
          endValue: 102,
          rampCurve: 'progressive',
          targetCadenceRpm: 94,
        },
        {
          id: 'b5',
          label: 'Odpoczynek Z1/Z2',
          type: 'steady',
          durationSec: 180,
          unit: 'pct_ftp',
          startValue: 55,
          endValue: 55,
          rampCurve: 'linear',
          targetCadenceRpm: 85,
        },
        {
          id: 'b6',
          label: 'Odcinek 3 — Finisz',
          type: 'ramp',
          durationSec: 300,
          unit: 'pct_ftp',
          startValue: 88,
          endValue: 108,
          rampCurve: 'progressive',
          targetCadenceRpm: 95,
        },
        {
          id: 'b7',
          label: 'Schłodzenie',
          type: 'ramp',
          durationSec: 300,
          unit: 'pct_ftp',
          startValue: 65,
          endValue: 40,
          rampCurve: 'linear',
          targetCadenceRpm: 80,
        },
      ],
    },

    // =========================================================================
    // KATEGORIA 4: VO2MAX (PUŁAP TLENOWY) — 4 treningi
    // =========================================================================
    {
      id: 'w_vo2_ronnestad_30_15',
      profileId: 'shared',
      name: 'Mikrointerwały Rønnestad 2x (10x 30s/15s) (42 min)',
      description:
        'Słynny protokół prof. Benta Rønnestada: 30s @ 120% FTP przeplatane 15s @ 50% FTP. Utrzymuje wysokie zużycie tlenu przy niższym zakwaszeniu niż długie bloki.',
      category: 'VO2Max',
      tags: ['VO2max'],
      scheduledDate: today,
      source: 'local',
      createdAtIso: new Date().toISOString(),
      blocks: parseIntervalsWorkoutText(
        `- 8m ramp 48-78% 90rpm\n- 2m 55% 85rpm\n10x\n- 30s 120% 98rpm\n- 15s 50% 85rpm\n\n- 5m 52% 85rpm\n10x\n- 30s 120% 98rpm\n- 15s 50% 85rpm\n\n- 5m ramp 60-40% 80rpm`
      ),
    },
    {
      id: 'w_vo2_seiler_4x4',
      profileId: 'shared',
      name: 'Protokół Seilera 4x 4 min VO2max (43 min)',
      description:
        'Klasyczny norweski interwał tlenowy dr. Stephena Seilera: 4x 4 minuty @ 112% FTP z 3-minutowym aktywnym wypoczynkiem maksymalizujący objętość wyrzutową serca.',
      category: 'VO2Max',
      tags: ['VO2max'],
      scheduledDate: today,
      source: 'local',
      createdAtIso: new Date().toISOString(),
      blocks: parseIntervalsWorkoutText(
        `- 8m ramp 48-80% 90rpm\n- 2m 55% 85rpm\n4x\n- 4m 112% 96rpm\n- 3m 52% 85rpm\n\n- 5m ramp 60-40% 80rpm`
      ),
    },
    {
      id: 'w_vo2_30_30',
      profileId: 'shared',
      name: 'Interwały VO2max Billat 6x 2 min (39 min)',
      description:
        'Sześć dynamicznych 2-minutowych powtórzeń na 116% FTP według koncepcji Véronique Billat (czas na vVO2max) z pełnym 2-minutowym odpoczynkiem.',
      category: 'VO2Max',
      tags: ['VO2max'],
      scheduledDate: today,
      source: 'local',
      createdAtIso: new Date().toISOString(),
      blocks: parseIntervalsWorkoutText(
        `- 8m ramp 50-80% 90rpm\n- 2m 55% 85rpm\n6x\n- 2m 116% 96rpm\n- 2m 52% 85rpm\n\n- 5m ramp 62-40% 80rpm`
      ),
    },
    {
      id: 'w_vo2_pyramid_40',
      profileId: 'shared',
      name: 'Schodkowa Piramida VO2max 3m-2m-1m + Tlen Z2 (52 min)',
      description:
        'Dwie serie schodkowe o malejącym czasie i rosnącej mocy (3m @ 110% -> 2m @ 118% -> 1m @ 126% FTP) domknięte 14-minutowym blokiem tlenowym Z2.',
      category: 'VO2Max',
      tags: ['VO2max', 'Endurance'],
      scheduledDate: today,
      source: 'local',
      createdAtIso: new Date().toISOString(),
      blocks: parseIntervalsWorkoutText(
        `- 7m ramp 48-78% 90rpm\n2x\n- 3m 110% 95rpm\n- 2m 52% 85rpm\n- 2m 118% 98rpm\n- 2m 52% 85rpm\n- 1m 126% 100rpm\n- 3m 50% 85rpm\n\n- 14m 65% 90rpm\n- 5m ramp 60-40% 80rpm`
      ),
    },

    // =========================================================================
    // KATEGORIA 5: TESTY (FTP 20M / RAMP) — 3 treningi
    // =========================================================================
    {
      id: 'w_step_ramp_test',
      profileId: 'shared',
      name: 'Test Wydolnościowy FTP — Ramp Test Standard (25 min)',
      description:
        'Progresywny test rampowy do odmowy (55% -> 145% FTP). Po zakończeniu system wylicza Twoje nowe eFTP jako 75% z najlepszej 1-minutowej mocy (MAP).',
      category: 'RampTest',
      tags: ['Testy (FTP 20m / Ramp)'],
      source: 'local',
      createdAtIso: new Date().toISOString(),
      blocks: [
        {
          id: 'rt1',
          label: 'Rozgrzewka Swobodna',
          type: 'ramp',
          durationSec: 300,
          unit: 'pct_ftp',
          startValue: 42,
          endValue: 55,
          rampCurve: 'linear',
          targetCadenceRpm: 90,
        },
        {
          id: 'rt2',
          label: 'Główna Rampa Testowa (do odmowy)',
          type: 'ramp',
          durationSec: 900,
          unit: 'pct_ftp',
          startValue: 55,
          endValue: 145,
          rampCurve: 'linear',
          targetCadenceRpm: 95,
        },
        {
          id: 'rt3',
          label: 'Schłodzenie Regeneracyjne',
          type: 'ramp',
          durationSec: 300,
          unit: 'pct_ftp',
          startValue: 50,
          endValue: 35,
          rampCurve: 'linear',
          targetCadenceRpm: 80,
        },
      ],
    },
    {
      id: 'w_test_ftp_20min_coggan',
      profileId: 'shared',
      name: 'Klasyczny Test FTP 20 Minut (Protokół Coggana / Allena) (47 min)',
      description:
        'Pełny protokół Huntera Allena i dr. Andrew Coggana: rozgrzewka, 3 pobudzenia, 5 min przepalenia (110% FTP) redukującego udział beztlenowy W\' oraz 20 min próby czasowej (FTP = 95% średniej z 20 min).',
      category: 'RampTest',
      tags: ['Testy (FTP 20m / Ramp)', 'Threshold / Sweet Spot'],
      source: 'local',
      createdAtIso: new Date().toISOString(),
      blocks: parseIntervalsWorkoutText(
        `- 8m ramp 45-70% 90rpm\n3x\n- 1m 95% 100rpm\n- 1m 55% 85rpm\n\n- 3m 55% 85rpm\n- 5m 110% 95rpm\n- 5m 50% 85rpm\n- 20m ramp 98-105% 94rpm\n- 5m ramp 55-40% 80rpm`
      ),
    },
    {
      id: 'w_test_ramp_light',
      profileId: 'shared',
      name: 'Ramp Test Light / Łagodna Progresja (30 min)',
      description:
        'Łagodniejsza wersja testu rampowego (45% -> 130% FTP w 20 minut) polecana dla kolarzy o profilu wytrzymałościowym lub niższej masie ciała.',
      category: 'RampTest',
      tags: ['Testy (FTP 20m / Ramp)'],
      source: 'local',
      createdAtIso: new Date().toISOString(),
      blocks: [
        {
          id: 'rtl1',
          label: 'Rozgrzewka Tlenowa',
          type: 'ramp',
          durationSec: 300,
          unit: 'pct_ftp',
          startValue: 40,
          endValue: 50,
          rampCurve: 'linear',
          targetCadenceRpm: 88,
        },
        {
          id: 'rtl2',
          label: 'Łagodna Rampa Testowa (20 min)',
          type: 'ramp',
          durationSec: 1200,
          unit: 'pct_ftp',
          startValue: 50,
          endValue: 130,
          rampCurve: 'linear',
          targetCadenceRpm: 92,
        },
        {
          id: 'rtl3',
          label: 'Schłodzenie Z1',
          type: 'ramp',
          durationSec: 300,
          unit: 'pct_ftp',
          startValue: 50,
          endValue: 35,
          rampCurve: 'linear',
          targetCadenceRpm: 80,
        },
      ],
    },

    // =========================================================================
    // KATEGORIA 6: RECOVERY (AKTYWNA REGENERACJA) — 3 treningi
    // =========================================================================
    {
      id: 'w_recovery_active_spin_30',
      profileId: 'shared',
      name: 'Aktywna Regeneracja & Rozjazd Z1 (30 min)',
      description:
        'Bardzo lekka jazda w 1. strefie mocy (45-52% FTP) pobudzająca krążenie kapilarne i usuwanie metabolitów bez obciążania układu nerwowego.',
      category: 'Recovery',
      tags: ['Recovery'],
      scheduledDate: today,
      source: 'local',
      createdAtIso: new Date().toISOString(),
      blocks: parseIntervalsWorkoutText(
        `- 5m ramp 40-50% 85rpm\n- 20m 50% 88rpm\n- 5m ramp 50-38% 82rpm`
      ),
    },
    {
      id: 'w_recovery_flush_25',
      profileId: 'shared',
      name: 'Po-startowy Flush Mleczanowy Z1 (25 min)',
      description:
        'Krótka sesja regeneracyjna (25 minut) po ciężkim dniu interwałowym lub wyścigu rozluźniająca napięcie mięśniowe przy kadencji 90 RPM.',
      category: 'Recovery',
      tags: ['Recovery'],
      scheduledDate: today,
      source: 'local',
      createdAtIso: new Date().toISOString(),
      blocks: parseIntervalsWorkoutText(
        `- 5m ramp 38-52% 88rpm\n- 15m 52% 90rpm\n- 5m ramp 52-38% 82rpm`
      ),
    },
    {
      id: 'w_recovery_openers_30',
      profileId: 'shared',
      name: 'Przebudzenie Nerwowo-Mięśniowe (Openers 30 min)',
      description:
        'Trening aktywacyjny w dzień poprzedzający test FTP lub mocną sesję: lekki obrót Z1/Z2 z trzema 30-sekundowymi pobudzeniami na 105% FTP.',
      category: 'Recovery',
      tags: ['Recovery', 'Z2'],
      scheduledDate: today,
      source: 'local',
      createdAtIso: new Date().toISOString(),
      blocks: parseIntervalsWorkoutText(
        `- 8m ramp 45-62% 88rpm\n3x\n- 30s 105% 100rpm\n- 3m30s 52% 85rpm\n\n- 10m ramp 55-40% 82rpm`
      ),
    },
  ];
}

/**
 * Merges any missing initial scientific workouts into an existing workout list and ensures
 * every built-in workout has its accurate blocks (fixing any previously inflated repeat blocks)
 * without deleting or overwriting user-created workouts.
 */
export function mergeAndNormalizeWorkoutsLibrary(
  existingWorkouts: StructuredWorkout[]
): StructuredWorkout[] {
  const initial = getInitialWorkouts();
  const initialMap = new Map<string, StructuredWorkout>(
    initial.map((w) => [w.id, w])
  );
  const resultMap = new Map<string, StructuredWorkout>();

  for (const w of existingWorkouts || []) {
    if (!w || !w.id || !Array.isArray(w.blocks)) continue;
    const defaultMatch = initialMap.get(w.id);
    const normalizedTags =
      Array.isArray(w.tags) && w.tags.length > 0
        ? w.tags
        : defaultMatch?.tags || inferWorkoutTags(w);
    resultMap.set(w.id, {
      ...w,
      name: defaultMatch ? defaultMatch.name : w.name,
      blocks: defaultMatch ? defaultMatch.blocks : w.blocks,
      tags: normalizedTags,
    });
  }

  for (const defW of initial) {
    if (!resultMap.has(defW.id)) {
      resultMap.set(defW.id, defW);
    }
  }

  return Array.from(resultMap.values());
}

export function calculateActivitySummary(
  profile: AthleteProfile,
  workoutName: string,
  workoutId: string | undefined,
  startedAtIso: string,
  records: TelemetryRecord[]
): CompletedActivity {
  const durationSec = Math.max(1, records.length);
  let sumPower = 0;
  let maxPower = 0;
  let sumHr = 0;
  let maxHr = 0;
  let sumCad = 0;
  let maxCad = 0;
  let sumSpeed = 0;

  const timeInPowerZonesSec = [0, 0, 0, 0, 0, 0, 0];
  const timeInHrZonesSec = [0, 0, 0, 0, 0];

  for (const r of records) {
    sumPower += r.powerWatts;
    if (r.powerWatts > maxPower) maxPower = r.powerWatts;
    sumHr += r.heartRateBpm;
    if (r.heartRateBpm > maxHr) maxHr = r.heartRateBpm;
    sumCad += r.cadenceRpm;
    if (r.cadenceRpm > maxCad) maxCad = r.cadenceRpm;
    sumSpeed += r.speedKmh;

    const pz = getPowerZoneForWatts(r.powerWatts, profile.ftpWatts, profile.powerZones);
    const pzIdx = Math.min(6, Math.max(0, pz.zone - 1));
    timeInPowerZonesSec[pzIdx] += 1;

    const hz = getHrZoneForBpm(r.heartRateBpm, profile.hrZones);
    const hzIdx = Math.min(4, Math.max(0, hz.zone - 1));
    timeInHrZonesSec[hzIdx] += 1;
  }

  const avgPowerWatts = Math.round(sumPower / durationSec);
  const avgHrBpm = Math.round(sumHr / durationSec);
  const avgCadenceRpm = Math.round(sumCad / durationSec);
  const avgSpeedKmh = Number((sumSpeed / durationSec).toFixed(1));
  const totalDistanceMeters =
    records.length > 0 ? Math.round(records[records.length - 1].distanceMeters) : 0;

  // Normalized Power (30s rolling average raised to 4th power)
  let sumFourthPower = 0;
  let rollingCount = 0;
  const windowSize = Math.min(30, records.length);
  for (let i = 0; i < records.length; i++) {
    const startIdx = Math.max(0, i - windowSize + 1);
    let winSum = 0;
    const count = i - startIdx + 1;
    for (let j = startIdx; j <= i; j++) {
      winSum += records[j].powerWatts;
    }
    const rollingAvg = winSum / count;
    sumFourthPower += Math.pow(rollingAvg, 4);
    rollingCount++;
  }

  const normalizedPowerWatts =
    rollingCount > 0 ? Math.round(Math.pow(sumFourthPower / rollingCount, 0.25)) : avgPowerWatts;

  const ftp = Math.max(50, profile.ftpWatts);
  const intensityFactor = Number((normalizedPowerWatts / ftp).toFixed(2));
  const tss = Math.round(
    ((durationSec * normalizedPowerWatts * intensityFactor) / (ftp * 3600)) * 100
  );
  const workKj = Math.round((sumPower * 1) / 1000);
  // Rough human gross efficiency ~24%, so 1 kJ mechanical work ~= 1.04 kcal
  const caloriesKcal = Math.round(workKj * 1.04);

  const baseActivity: CompletedActivity = {
    id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    profileId: profile.id,
    workoutId,
    workoutName,
    startedAtIso,
    durationSec,
    ftpAtRideWatts: profile.ftpWatts,
    avgPowerWatts,
    maxPowerWatts: Math.round(maxPower),
    normalizedPowerWatts,
    intensityFactor,
    tss,
    workKj,
    avgHrBpm,
    maxHrBpm: Math.round(maxHr),
    avgCadenceRpm,
    maxCadenceRpm: Math.round(maxCad),
    avgSpeedKmh,
    totalDistanceMeters,
    caloriesKcal,
    timeInPowerZonesSec,
    timeInHrZonesSec,
    records,
    syncedToGoogleDrive: false,
    syncedToIntervals: false,
  };

  baseActivity.peakPowerWindows = computeRidePeakPowerAndHr(baseActivity, profile);
  baseActivity.hrBreakdown = computeDetailedHrBreakdown([baseActivity], profile);

  return baseActivity;
}

/**
 * Generates a 28-day CTL (Fitness), ATL (Fatigue), and TSB (Form) series
 * for the given profile from local CompletedActivity records.
 */
export function calculateLocalWellnessSeries(
  activities: CompletedActivity[],
  profileId: ProfileId,
  daysCount: number = 28
): WellnessDayMetric[] {
  const profileActs = activities.filter((a) => a.profileId === profileId);
  const tssByDate: Record<string, number> = {};

  for (const act of profileActs) {
    const dayStr = act.startedAtIso.slice(0, 10);
    tssByDate[dayStr] = (tssByDate[dayStr] || 0) + act.tss;
  }

  // Start with baseline fitness seed so the chart is immediately informative
  let ctl = 34;
  let atl = 30;

  const result: WellnessDayMetric[] = [];
  const now = new Date();

  for (let i = daysCount - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayTss = tssByDate[dateStr] ?? 0;

    const tsb = Number((ctl - atl).toFixed(1));
    ctl = Number((ctl + (dayTss - ctl) / 42).toFixed(1));
    atl = Number((atl + (dayTss - atl) / 7).toFixed(1));

    result.push({
      date: dateStr,
      ctl,
      atl,
      tsb,
      tss: dayTss,
    });
  }

  return result;
}

export const PEAK_POWER_WINDOWS: Array<{ durationSec: number; label: string }> = [
  { durationSec: 5, label: '5s' },
  { durationSec: 10, label: '10s' },
  { durationSec: 30, label: '30s' },
  { durationSec: 60, label: '1 min' },
  { durationSec: 120, label: '2 min' },
  { durationSec: 300, label: '5 min' },
  { durationSec: 1200, label: '20 min' },
];

/**
 * Calculates Max Mean Power (5s, 10s, 30s, 1m, 2m, 5m, 20m) and the corresponding
 * Heart Rate Breakdown (avg BPM, max BPM, % Max HR, HR Zone) during each peak effort
 * for a single CompletedActivity.
 */
export function computeRidePeakPowerAndHr(
  activity: CompletedActivity | null | undefined,
  profile: AthleteProfile
): PeakPowerWindowStat[] {
  const weightKg = Math.max(35, profile.weightKg || 70);
  const ftpWatts = Math.max(50, profile.ftpWatts || 200);
  const maxHrProfile = Math.max(120, profile.maxHrBpm || 190);

  if (!activity) {
    return PEAK_POWER_WINDOWS.map((w) => ({
      durationSec: w.durationSec,
      label: w.label,
      maxMeanWatts: null,
      wattsPerKg: null,
      pctFtp: null,
      avgHrDuringPeakBpm: null,
      maxHrDuringPeakBpm: null,
      pctMaxHr: null,
      hrZoneDuringPeak: null,
      hrZoneName: null,
      hrZoneColor: null,
    }));
  }

  const recs = activity.records || [];
  if (recs.length === 0 && activity.peakPowerWindows && activity.peakPowerWindows.length === PEAK_POWER_WINDOWS.length) {
    return activity.peakPowerWindows;
  }
  // Expand or normalize records to a 1-second timeline if needed
  let timelinePower: number[] = [];
  let timelineHr: number[] = [];

  if (recs.length >= 2) {
    // Check average step between records (e.g. 1s for local, 5s if downsampled from cloud)
    const stepSec = Math.max(
      1,
      Math.round((recs[recs.length - 1].elapsedSec - recs[0].elapsedSec) / Math.max(1, recs.length - 1))
    );
    if (stepSec <= 1) {
      timelinePower = recs.map((r) => r.powerWatts);
      timelineHr = recs.map((r) => r.heartRateBpm);
    } else {
      for (const r of recs) {
        for (let s = 0; s < stepSec; s++) {
          timelinePower.push(r.powerWatts);
          timelineHr.push(r.heartRateBpm);
        }
      }
    }
  } else if (recs.length === 1) {
    const dur = Math.max(1, activity.durationSec);
    timelinePower = new Array(dur).fill(recs[0].powerWatts || activity.avgPowerWatts);
    timelineHr = new Array(dur).fill(recs[0].heartRateBpm || activity.avgHrBpm);
  }

  const totalSamples = timelinePower.length;
  // Prefix sums for O(1) window mean queries
  const prefixPower = new Float64Array(totalSamples + 1);
  const prefixHr = new Float64Array(totalSamples + 1);
  for (let i = 0; i < totalSamples; i++) {
    prefixPower[i + 1] = prefixPower[i] + timelinePower[i];
    prefixHr[i + 1] = prefixHr[i] + timelineHr[i];
  }

  return PEAK_POWER_WINDOWS.map(({ durationSec, label }) => {
    const effectiveTotalDuration = Math.max(totalSamples, activity.durationSec || 0);
    if (effectiveTotalDuration < durationSec) {
      return {
        durationSec,
        label,
        maxMeanWatts: null,
        wattsPerKg: null,
        pctFtp: null,
        avgHrDuringPeakBpm: null,
        maxHrDuringPeakBpm: null,
        pctMaxHr: null,
        hrZoneDuringPeak: null,
        hrZoneName: null,
        hrZoneColor: null,
        achievedAtDateIso: activity.startedAtIso,
        workoutName: activity.workoutName,
        activityId: activity.id,
      };
    }

    let bestMeanPower = 0;
    let bestAvgHr = activity.avgHrBpm || 130;
    let bestMaxHr = activity.maxHrBpm || 145;

    if (totalSamples >= durationSec) {
      let bestStartIdx = 0;
      let maxWindowPowerSum = -1;
      for (let start = 0; start <= totalSamples - durationSec; start++) {
        const end = start + durationSec;
        const pSum = prefixPower[end] - prefixPower[start];
        if (pSum > maxWindowPowerSum) {
          maxWindowPowerSum = pSum;
          bestStartIdx = start;
        }
      }
      bestMeanPower = Math.round(maxWindowPowerSum / durationSec);
      const hrSum = prefixHr[bestStartIdx + durationSec] - prefixHr[bestStartIdx];
      bestAvgHr = Math.round(hrSum / durationSec);
      let windowMaxHr = 0;
      for (let k = bestStartIdx; k < bestStartIdx + durationSec; k++) {
        if (timelineHr[k] > windowMaxHr) windowMaxHr = timelineHr[k];
      }
      bestMaxHr = Math.round(windowMaxHr || bestAvgHr);
    } else {
      // Fallback estimation when only summary stats are stored
      const decayMap: Record<number, number> = {
        5: 0.98,
        10: 0.94,
        30: 0.86,
        60: 0.78,
        120: 0.72,
        300: 0.65,
        1200: 0.58,
      };
      const factor = decayMap[durationSec] ?? 0.7;
      const span = Math.max(0, activity.maxPowerWatts - activity.avgPowerWatts);
      bestMeanPower = Math.round(activity.avgPowerWatts + span * factor);
      const hrSpan = Math.max(0, activity.maxHrBpm - activity.avgHrBpm);
      bestAvgHr = Math.round(activity.avgHrBpm + hrSpan * Math.min(0.95, factor));
      bestMaxHr = Math.min(activity.maxHrBpm, bestAvgHr + 4);
    }

    const hz = getHrZoneForBpm(bestAvgHr, profile.hrZones);
    return {
      durationSec,
      label,
      maxMeanWatts: bestMeanPower,
      wattsPerKg: Number((bestMeanPower / weightKg).toFixed(2)),
      pctFtp: Math.round((bestMeanPower / ftpWatts) * 100),
      avgHrDuringPeakBpm: bestAvgHr,
      maxHrDuringPeakBpm: bestMaxHr,
      pctMaxHr: Math.round((bestAvgHr / maxHrProfile) * 100),
      hrZoneDuringPeak: hz.zone,
      hrZoneName: hz.name,
      hrZoneColor: hz.color,
      achievedAtDateIso: activity.startedAtIso,
      workoutName: activity.workoutName,
      activityId: activity.id,
    };
  });
}

/**
 * Filters activities by period ('last_30_days', 'all', or 'YYYY-MM' month string)
 */
export function filterActivitiesByPeriod(
  activities: CompletedActivity[],
  profileId: ProfileId,
  periodFilter: string
): CompletedActivity[] {
  const profileActs = activities.filter((a) => a.profileId === profileId);
  if (periodFilter === 'all') return profileActs;
  if (periodFilter === 'last_30_days') {
    const cutoffMs = Date.now() - 30 * 86400 * 1000;
    return profileActs.filter((a) => new Date(a.startedAtIso).getTime() >= cutoffMs);
  }
  // Month filter e.g. '2026-10'
  return profileActs.filter((a) => a.startedAtIso.slice(0, 7) === periodFilter);
}

/**
 * Computes the Best Peak Power & corresponding Heart Rate Breakdown across all rides
 * in the selected period (Last 30 Days or Selected Month) for the given athlete profile.
 */
export function computePeriodBestPeakPowerAndHr(
  activities: CompletedActivity[],
  profile: AthleteProfile,
  periodFilter: string = 'last_30_days'
): PeakPowerWindowStat[] {
  const filtered = filterActivitiesByPeriod(activities, profile.id, periodFilter);
  if (filtered.length === 0) {
    return computeRidePeakPowerAndHr(null, profile);
  }

  const perRideCurves = filtered.map((act) => computeRidePeakPowerAndHr(act, profile));

  return PEAK_POWER_WINDOWS.map((win, winIdx) => {
    let bestStat: PeakPowerWindowStat | null = null;
    for (const rideStats of perRideCurves) {
      const candidate = rideStats[winIdx];
      if (candidate && candidate.maxMeanWatts !== null) {
        if (!bestStat || bestStat.maxMeanWatts === null || candidate.maxMeanWatts > bestStat.maxMeanWatts) {
          bestStat = candidate;
        }
      }
    }
    return (
      bestStat || {
        durationSec: win.durationSec,
        label: win.label,
        maxMeanWatts: null,
        wattsPerKg: null,
        pctFtp: null,
        avgHrDuringPeakBpm: null,
        maxHrDuringPeakBpm: null,
        pctMaxHr: null,
        hrZoneDuringPeak: null,
        hrZoneName: null,
        hrZoneColor: null,
      }
    );
  });
}

/**
 * Computes a complete Heart Rate Breakdown (Z1-Z5 time, %, avg Watts in each HR zone,
 * W/BPM aerobic efficiency, % Max HR, and HR Reserve %) for either a single ride or a list of rides.
 */
export function computeDetailedHrBreakdown(
  activitiesToAnalyze: CompletedActivity[],
  profile: AthleteProfile
): HrBreakdownSummary {
  const maxHrProfile = Math.max(120, profile.maxHrBpm || 190);
  const restHrProfile = Math.max(35, profile.restingHrBpm || 55);

  const zoneSeconds = [0, 0, 0, 0, 0];
  const zonePowerWeightedSum = [0, 0, 0, 0, 0];
  const zoneHrWeightedSum = [0, 0, 0, 0, 0];

  let totalSec = 0;
  let weightedHrSum = 0;
  let weightedPowerSum = 0;
  let weightedNpSum = 0;
  let peakHrObserved = 0;

  for (const act of activitiesToAnalyze) {
    const dur = Math.max(1, act.durationSec);
    totalSec += dur;
    weightedHrSum += act.avgHrBpm * dur;
    weightedPowerSum += act.avgPowerWatts * dur;
    weightedNpSum += act.normalizedPowerWatts * dur;
    if (act.maxHrBpm > peakHrObserved) peakHrObserved = act.maxHrBpm;

    if (act.records && act.records.length > 0) {
      const stepSec = Math.max(1, dur / act.records.length);
      for (const r of act.records) {
        const hz = getHrZoneForBpm(r.heartRateBpm, profile.hrZones);
        const idx = Math.min(4, Math.max(0, hz.zone - 1));
        zoneSeconds[idx] += stepSec;
        zonePowerWeightedSum[idx] += r.powerWatts * stepSec;
        zoneHrWeightedSum[idx] += r.heartRateBpm * stepSec;
      }
    } else if (act.hrBreakdown && Array.isArray(act.hrBreakdown.zones)) {
      act.hrBreakdown.zones.forEach((z, idx) => {
        if (idx < 5 && z.durationSec > 0) {
          zoneSeconds[idx] += z.durationSec;
          zonePowerWeightedSum[idx] += z.avgPowerInZoneWatts * z.durationSec;
          const zoneMidHr = (profile.hrZones[idx].minBpm + profile.hrZones[idx].maxBpm) / 2;
          zoneHrWeightedSum[idx] += zoneMidHr * z.durationSec;
        }
      });
    } else if (act.timeInHrZonesSec && act.timeInHrZonesSec.length > 0) {
      act.timeInHrZonesSec.forEach((sec, idx) => {
        if (idx < 5 && sec > 0) {
          zoneSeconds[idx] += sec;
          const zoneMidHr = (profile.hrZones[idx].minBpm + profile.hrZones[idx].maxBpm) / 2;
          const estZonePower = Math.round(act.avgPowerWatts * (0.65 + idx * 0.14));
          zonePowerWeightedSum[idx] += estZonePower * sec;
          zoneHrWeightedSum[idx] += zoneMidHr * sec;
        }
      });
    }
  }

  const safeTotalSec = Math.max(1, totalSec);
  const avgHrBpm = totalSec > 0 ? Math.round(weightedHrSum / safeTotalSec) : 0;
  const avgPowerWatts = totalSec > 0 ? weightedPowerSum / safeTotalSec : 0;
  const avgNpWatts = totalSec > 0 ? weightedNpSum / safeTotalSec : 0;

  const pctMaxHrAvg = avgHrBpm > 0 ? Math.round((avgHrBpm / maxHrProfile) * 100) : 0;
  const pctMaxHrPeak = peakHrObserved > 0 ? Math.round((peakHrObserved / maxHrProfile) * 100) : 0;
  const hrReserveSpan = Math.max(20, maxHrProfile - restHrProfile);
  const hrReservePct =
    avgHrBpm > restHrProfile ? Math.min(100, Math.round(((avgHrBpm - restHrProfile) / hrReserveSpan) * 100)) : 0;

  const avgWattsPerBpm =
    avgHrBpm > 0 && avgPowerWatts > 0 ? Number((avgPowerWatts / avgHrBpm).toFixed(2)) : null;
  const efficiencyFactor =
    avgHrBpm > 0 && avgNpWatts > 0 ? Number((avgNpWatts / avgHrBpm).toFixed(2)) : null;

  const totalZoneSeconds = Math.max(
    1,
    zoneSeconds.reduce((a, b) => a + b, 0)
  );

  const zones: HrZoneDetailedStat[] = profile.hrZones.map((hz, idx) => {
    const zSec = Math.round(zoneSeconds[idx] || 0);
    const pct = totalSec > 0 ? Math.round((zSec / totalZoneSeconds) * 100) : 0;
    const avgPwr = zSec > 0 ? Math.round(zonePowerWeightedSum[idx] / zSec) : 0;
    const avgZoneHr = zSec > 0 ? zoneHrWeightedSum[idx] / zSec : (hz.minBpm + hz.maxBpm) / 2;
    const wPerBpm = zSec > 0 && avgZoneHr > 0 ? Number((avgPwr / avgZoneHr).toFixed(2)) : null;

    return {
      zone: hz.zone,
      name: hz.name,
      minBpm: hz.minBpm,
      maxBpm: hz.maxBpm,
      color: hz.color,
      durationSec: zSec,
      percentage: pct,
      avgPowerInZoneWatts: avgPwr,
      wattsPerBpm: wPerBpm,
    };
  });

  return {
    totalDurationSec: Math.round(totalSec),
    avgHrBpm,
    maxHrBpm: Math.round(peakHrObserved),
    pctMaxHrAvg,
    pctMaxHrPeak,
    hrReservePct,
    avgWattsPerBpm,
    efficiencyFactor,
    zones,
  };
}

export interface DetectedFtpEstimate {
  estimatedFtpWatts: number;
  previousFtpWatts: number;
  deltaWatts: number;
  protocolName: string;
  sourceDetail: string;
  isDedicatedTestWorkout: boolean;
}

/**
 * Automatically detects estimated FTP after completing a workout (especially Ramp Test
 * or Coggan 20m FTP Test, or any ride where 20m * 0.95 exceeds current FTP).
 */
export function detectEstimatedFtpFromCompletedActivity(
  activity: CompletedActivity | null | undefined,
  profile: AthleteProfile,
  workout?: StructuredWorkout | null
): DetectedFtpEstimate | null {
  if (!activity) return null;

  const nameLower = `${activity.workoutName || ''} ${workout?.name || ''}`.toLowerCase();
  const workoutIdStr = (activity.workoutId || '').toLowerCase();
  const tags = workout?.tags || [];
  const isTestTagged = tags.some((t) => t.toLowerCase().includes('test'));
  const isRampProtocol =
    workoutIdStr.includes('ramp') ||
    nameLower.includes('ramp test') ||
    nameLower.includes('map ramp');
  const is20mProtocol =
    workoutIdStr.includes('ftp_20m') ||
    nameLower.includes('20m ftp') ||
    nameLower.includes('coggan');

  const peaks =
    activity.peakPowerWindows && activity.peakPowerWindows.length > 0
      ? activity.peakPowerWindows
      : computeRidePeakPowerAndHr(activity, profile);

  const best1m = peaks.find((p) => p.durationSec === 60)?.maxMeanWatts ?? null;
  const best5m = peaks.find((p) => p.durationSec === 300)?.maxMeanWatts ?? null;
  const best20m = peaks.find((p) => p.durationSec === 1200)?.maxMeanWatts ?? null;

  // 1. Ramp Test Protocol: 75% of Best 1-Minute Power (MAP)
  if (isRampProtocol) {
    const mapWatts = best1m || Math.max(activity.maxPowerWatts, activity.avgPowerWatts);
    const estimated = Math.max(60, Math.round(mapWatts * 0.75));
    return {
      estimatedFtpWatts: estimated,
      previousFtpWatts: profile.ftpWatts,
      deltaWatts: estimated - profile.ftpWatts,
      protocolName: 'Protokół Ramp Test (75% × 1 min MAP)',
      sourceDetail: `Najlepsza 1 min (MAP): ${mapWatts} W × 0.75 = ${estimated} W`,
      isDedicatedTestWorkout: true,
    };
  }

  // 2. Classic 20-Minute FTP Test Protocol: 95% of Best 20-Minute Power
  if (is20mProtocol || isTestTagged) {
    const base20mWatts =
      best20m || best5m || activity.normalizedPowerWatts || activity.avgPowerWatts;
    const estimated = Math.max(60, Math.round(base20mWatts * 0.95));
    return {
      estimatedFtpWatts: estimated,
      previousFtpWatts: profile.ftpWatts,
      deltaWatts: estimated - profile.ftpWatts,
      protocolName: 'Protokół Coggan 20m (95% × 20 min)',
      sourceDetail: `Średnia z odcinka testowego: ${base20mWatts} W × 0.95 = ${estimated} W`,
      isDedicatedTestWorkout: true,
    };
  }

  // 3. Spontaneous FTP Breakthrough on regular workouts (if 95% of 20m power > current FTP)
  if (best20m && Math.round(best20m * 0.95) > profile.ftpWatts) {
    const estimated = Math.round(best20m * 0.95);
    return {
      estimatedFtpWatts: estimated,
      previousFtpWatts: profile.ftpWatts,
      deltaWatts: estimated - profile.ftpWatts,
      protocolName: 'Rekord 20 min z jazdy (95% × 20 min)',
      sourceDetail: `Najlepsze 20 min: ${best20m} W × 0.95 = ${estimated} W`,
      isDedicatedTestWorkout: false,
    };
  }

  return null;
}

/**
 * Estimates suggested FTP from the rider's completed activities history (last 30 days or all rides).
 */
export function estimateSuggestedFtpFromHistory(
  activities: CompletedActivity[],
  profile: AthleteProfile
): {
  suggestedFtpWatts: number;
  protocolLabel: string;
  workoutName: string;
  dateIso: string;
} | null {
  const profileActs = activities.filter((a) => a.profileId === profile.id);
  if (profileActs.length === 0) return null;

  let bestCandidate: {
    suggestedFtpWatts: number;
    protocolLabel: string;
    workoutName: string;
    dateIso: string;
    priority: number;
  } | null = null;

  for (const act of profileActs.slice(0, 30)) {
    const detected = detectEstimatedFtpFromCompletedActivity(act, profile);
    if (detected) {
      const priority = detected.isDedicatedTestWorkout ? 2 : 1;
      if (
        !bestCandidate ||
        priority > bestCandidate.priority ||
        (priority === bestCandidate.priority &&
          detected.estimatedFtpWatts > bestCandidate.suggestedFtpWatts)
      ) {
        bestCandidate = {
          suggestedFtpWatts: detected.estimatedFtpWatts,
          protocolLabel: detected.protocolName,
          workoutName: act.workoutName,
          dateIso: act.startedAtIso,
          priority,
        };
      }
    } else {
      const peaks =
        act.peakPowerWindows && act.peakPowerWindows.length > 0
          ? act.peakPowerWindows
          : computeRidePeakPowerAndHr(act, profile);
      const p20 = peaks.find((p) => p.durationSec === 1200)?.maxMeanWatts;
      const p5 = peaks.find((p) => p.durationSec === 300)?.maxMeanWatts;
      const est = p20
        ? Math.round(p20 * 0.95)
        : p5
        ? Math.round(p5 * 0.85)
        : Math.round(act.normalizedPowerWatts * 0.92);
      if (est >= 60 && (!bestCandidate || (bestCandidate.priority === 0 && est > bestCandidate.suggestedFtpWatts))) {
        bestCandidate = {
          suggestedFtpWatts: est,
          protocolLabel: p20
            ? '95% z najlepszych 20 min'
            : p5
            ? '85% z najlepszych 5 min'
            : 'Estymacja z Normalized Power (NP)',
          workoutName: act.workoutName,
          dateIso: act.startedAtIso,
          priority: 0,
        };
      }
    }
  }

  return bestCandidate;
}


