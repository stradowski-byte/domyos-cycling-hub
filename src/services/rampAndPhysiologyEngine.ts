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

export const DEFAULT_PROFILES: Record<ProfileId, AthleteProfile> = {
  default: {
    id: 'default',
    name: 'Domyślny Profil',
    subtitle: 'Tryb Offline + Integracja Intervals.icu',
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
  },
};

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
 * Parses Intervals.icu workout description syntax into executable WorkoutBlock[]
 * Supports:
 * - "- 10m ramp 50-75% 90rpm"
 * - "- 5m 65%"
 * - "- 4m 180-240W"
 * - "4x" repeat loops
 */
export function parseIntervalsWorkoutText(text: string, fallbackFtp: number = 200): WorkoutBlock[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#') && !l.startsWith('//'));

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

  for (const line of lines) {
    const repeatMatch = line.match(/^(\d+)\s*x$/i);
    if (repeatMatch) {
      flushRepeats();
      currentRepeat = Math.min(30, Math.max(1, parseInt(repeatMatch[1], 10)));
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

/**
 * Serializes a StructuredWorkout into a standalone, human-readable Intervals.icu .txt file
 * that lives in /DomyosCyclingHub/Workouts_Library/<profileId>/ (or locally on disk).
 * User ownership is determined by the folder path (/<profileId> or /shared), so no user prefix
 * or profile metadata is required inside the file.
 */
export function serializeWorkoutToIcuTextFile(workout: StructuredWorkout): string {
  const headerLines = [
    `# ID: ${workout.id}`,
    `# Name: ${workout.name}`,
    `# Category: ${workout.category}`,
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
 * When `folderProfileId` is provided (from /Workouts_Library/<profileId> or /shared),
 * ownership is assigned directly from the parent folder without needing metadata in the file.
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

  const blocks = parseIntervalsWorkoutText(textContent, 200);

  return {
    id,
    profileId,
    name,
    description,
    category: 'Custom',
    scheduledDate,
    source: 'local',
    blocks,
    createdAtIso: new Date().toISOString(),
  };
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

export function getInitialWorkouts(): StructuredWorkout[] {
  const today = new Date().toISOString().slice(0, 10);
  return [
    {
      id: 'w_ramp_sweetspot',
      profileId: 'shared',
      name: 'Sweet Spot & Tempo (45 min)',
      description: 'Rozgrzewka progresywna, 3 odcinki w strefie Sweet Spot/FTP oraz spokojne schłodzenie.',
      category: 'Threshold',
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
    {
      id: 'w_endurance_ramps',
      profileId: 'shared',
      name: 'Wytrzymałość Tlenowa & Cardio Z2/Z3 (30 min)',
      description: 'Trening wytrzymałościowy i cardio z płynnymi zmianami tempa i kadencji w strefach Z2/Z3.',
      category: 'Endurance',
      scheduledDate: today,
      source: 'local',
      createdAtIso: new Date().toISOString(),
      blocks: [
        {
          id: 'jb1',
          label: 'Rozgrzewka',
          type: 'ramp',
          durationSec: 360,
          unit: 'pct_ftp',
          startValue: 45,
          endValue: 68,
          rampCurve: 'linear',
          targetCadenceRpm: 85,
        },
        {
          id: 'jb2',
          label: 'Wejście w Z2/Z3',
          type: 'ramp',
          durationSec: 300,
          unit: 'pct_ftp',
          startValue: 68,
          endValue: 85,
          rampCurve: 'linear',
          targetCadenceRpm: 90,
        },
        {
          id: 'jb3',
          label: 'Utrzymanie Tempo Z3',
          type: 'steady',
          durationSec: 180,
          unit: 'pct_ftp',
          startValue: 85,
          endValue: 85,
          rampCurve: 'linear',
          targetCadenceRpm: 92,
        },
        {
          id: 'jb4',
          label: 'Powrót do Z2',
          type: 'ramp',
          durationSec: 240,
          unit: 'pct_ftp',
          startValue: 85,
          endValue: 60,
          rampCurve: 'linear',
          targetCadenceRpm: 85,
        },
        {
          id: 'jb5',
          label: 'Druga Fala Tempo',
          type: 'ramp',
          durationSec: 300,
          unit: 'pct_ftp',
          startValue: 65,
          endValue: 88,
          rampCurve: 'progressive',
          targetCadenceRpm: 90,
          startResistanceLevel: 8,
          endResistanceLevel: 16,
        },
        {
          id: 'jb6',
          label: 'Wyciszenie',
          type: 'ramp',
          durationSec: 300,
          unit: 'pct_ftp',
          startValue: 60,
          endValue: 40,
          rampCurve: 'linear',
          targetCadenceRpm: 80,
        },
      ],
    },
    {
      id: 'w_cardio_fatburn_z2',
      profileId: 'shared',
      name: 'Cardio & Spalanie Tlenowe Z2 (35 min)',
      description: 'Komfortowa sesja w strefie tlenowej Z2 skupiona na redukcji tkanki tłuszczowej i kondycji sercowo-naczyniowej.',
      category: 'Recovery',
      scheduledDate: today,
      source: 'local',
      createdAtIso: new Date().toISOString(),
      blocks: parseIntervalsWorkoutText(
        `- 5m ramp 45-62% 85rpm\n- 10m 65% 88rpm\n- 8m ramp 65-73% 90rpm\n- 7m 64% 88rpm\n- 5m ramp 60-42% 80rpm`
      ),
    },
    {
      id: 'w_vo2_30_30',
      profileId: 'shared',
      name: 'Interwały VO2Max 6x 1 min',
      description: 'Klasyczny bodziec tlenowy: rozgrzewka i seria 6 dynamicznych odcinków 118% FTP.',
      category: 'VO2Max',
      scheduledDate: today,
      source: 'local',
      createdAtIso: new Date().toISOString(),
      blocks: parseIntervalsWorkoutText(
        `- 8m ramp 50-80% 90rpm\n- 2m 55% 85rpm\n6x\n- 1m 118% 98rpm\n- 1m 55% 85rpm\n- 5m ramp 65-42% 80rpm`
      ),
    },
    {
      id: 'w_step_ramp_test',
      profileId: 'shared',
      name: 'Test Wydolnościowy FTP (Ramp Test)',
      description: 'Sprawdzenie aktualnego progu FTP dla wybranego profilu z płynnie rosnącym obciążeniem.',
      category: 'RampTest',
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
  ];
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

