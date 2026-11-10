export type ProfileId = string;

export type OfflineTrainingMode = 'all' | 'ftp_builder' | 'cardio_fitness';

export interface HeartRateZone {
  zone: number;
  name: string;
  minBpm: number;
  maxBpm: number;
  color: string;
}

export interface PowerZone {
  zone: number;
  name: string;
  minPct: number;
  maxPct: number;
  color: string;
}

export interface IntervalsConfig {
  enabled: boolean;
  athleteId: string; // e.g., "0" or "i123456"
  apiKey: string;
  autoUploadActivities: boolean;
  lastSyncIso?: string;
}

export interface GoogleFitConfig {
  enabled: boolean;
  autoUploadActivities: boolean;
  lastSyncIso?: string;
}

export interface AthleteProfile {
  id: ProfileId;
  uid?: string;
  email?: string;
  photoURL?: string;
  name: string;
  subtitle: string;
  avatarColor: string;
  ftpWatts: number;
  weightKg: number;
  maxHrBpm: number;
  restingHrBpm: number;
  lthrBpm: number;
  offlineMode?: OfflineTrainingMode;
  hrZones: HeartRateZone[];
  powerZones: PowerZone[];
  intervals: IntervalsConfig;
  googleFit?: GoogleFitConfig;
  updatedAtIso?: string;
}

export interface KnownGoogleRider {
  uid: string;
  profileId: ProfileId;
  email: string;
  displayName: string;
  photoURL?: string;
  avatarColor: string;
  ftpWatts: number;
  lastLoginIso: string;
  googleFitEnabled?: boolean;
  intervalsEnabled?: boolean;
}

export type BlockType = 'steady' | 'ramp' | 'resistance' | 'freeride';

/**
 * RampCurveType defines how target power changes over the duration of a ramp block:
 * - 'linear': constant watt-per-second rate (alpha = 1.0)
 * - 'progressive': starts gentler and accelerates towards the end (alpha = 1.45)
 * - 'regressive': climbs faster initially and flattens out (alpha = 0.65)
 */
export type RampCurveType = 'linear' | 'progressive' | 'regressive';

export interface WorkoutBlock {
  id: string;
  label: string;
  type: BlockType;
  durationSec: number;
  /**
   * Power can be specified in % of profile's FTP (default) or absolute Watts
   */
  unit: 'pct_ftp' | 'watts';
  /** For 'steady', startValue == endValue. For 'ramp', interpolates from startValue to endValue */
  startValue: number;
  endValue: number;
  rampCurve: RampCurveType;
  /** Optional target cadence in RPM */
  targetCadenceRpm?: number;
  /** For 'resistance' blocks or progressive resistance intervals (1 - 32 on Domyos) */
  startResistanceLevel?: number;
  endResistanceLevel?: number;
  notes?: string;
}

export interface StructuredWorkout {
  id: string;
  profileId: ProfileId | 'shared';
  ownerUid?: string;
  name: string;
  description: string;
  category: 'Endurance' | 'Threshold' | 'VO2Max' | 'RampTest' | 'Recovery' | 'Custom';
  /** Multiple category tags so a workout can appear in several collapsible categories */
  tags?: string[];
  scheduledDate?: string; // YYYY-MM-DD
  source: 'local' | 'intervals_library' | 'intervals_calendar' | 'firebase';
  externalId?: string;
  blocks: WorkoutBlock[];
  createdAtIso: string;
  updatedAtIso?: string;
}

export interface TelemetryRecord {
  timestampMs: number;
  elapsedSec: number;
  blockIndex: number;
  powerWatts: number;
  targetPowerWatts: number;
  externalPowerWatts?: number;
  powerMatchOffsetWatts: number;
  heartRateBpm: number;
  cadenceRpm: number;
  speedKmh: number;
  distanceMeters: number;
  resistanceLevel: number;
}

export interface CompletedActivity {
  id: string;
  profileId: ProfileId;
  ownerUid?: string;
  ownerEmail?: string;
  workoutId?: string;
  workoutName: string;
  startedAtIso: string;
  durationSec: number;
  ftpAtRideWatts: number;
  avgPowerWatts: number;
  maxPowerWatts: number;
  normalizedPowerWatts: number;
  intensityFactor: number;
  tss: number;
  workKj: number;
  avgHrBpm: number;
  maxHrBpm: number;
  avgCadenceRpm: number;
  maxCadenceRpm: number;
  avgSpeedKmh: number;
  totalDistanceMeters: number;
  caloriesKcal: number;
  timeInPowerZonesSec: number[]; // 7 zones
  timeInHrZonesSec: number[]; // 5 zones
  records: TelemetryRecord[];
  telemetryStoredInOpfs?: boolean;
  peakPowerWindows?: PeakPowerWindowStat[];
  hrBreakdown?: HrBreakdownSummary;
  /** Full binary .FIT file encoded in Base64 for cross-device download from Firestore */
  fitBase64?: string;
  /** Firebase Cloud Firestore sync status */
  pendingFirebaseSync?: boolean;
  syncedToFirebase?: boolean;
  /** Legacy compatibility alias */
  pendingDriveSync?: boolean;
  syncedToGoogleDrive: boolean;
  googleDriveFileId?: string;
  /** Intervals.icu sync status */
  syncedToIntervals: boolean;
  intervalsActivityId?: string;
  /** Google Fit REST API sync status */
  syncedToGoogleFit?: boolean;
  googleFitSessionId?: string;
}

export type ControlMode = 'erg_watts' | 'resistance_level';

export interface LiveBikeTelemetry {
  connected: boolean;
  reconnecting?: boolean;
  reconnectAttempt?: number;
  deviceName: string;
  isSimulator: boolean;
  externalPowerConnected: boolean;
  externalPowerDeviceName: string;
  powerWatts: number;
  power3sAvgWatts: number;
  externalPowerWatts: number | null;
  powerMatchOffsetWatts: number;
  heartRateBpm: number;
  cadenceRpm: number;
  speedKmh: number;
  distanceMeters: number;
  resistanceLevel: number;
  targetPowerWatts: number;
  targetResistanceLevel: number;
  controlMode: ControlMode;
  biasPercent: number; // e.g., 100 = 100%, 95 = -5%, 105 = +5%
}

export interface WellnessDayMetric {
  date: string; // YYYY-MM-DD
  ctl: number; // Fitness (42-day exponentially weighted TSS)
  atl: number; // Fatigue (7-day exponentially weighted TSS)
  tsb: number; // Form (CTL - ATL)
  tss: number; // Daily Training Stress Score
  restingHR?: number;
  hrv?: number;
  weight?: number;
  rampRate?: number;
}

export type AppThemeMode = 'soft-light' | 'soft-dark';

export interface PeakPowerWindowStat {
  durationSec: number; // 5, 10, 30, 60, 120, 300, 1200
  label: string;       // '5s', '10s', '30s', '1 min', '2 min', '5 min', '20 min'
  maxMeanWatts: number | null;
  wattsPerKg: number | null;
  pctFtp: number | null;
  avgHrDuringPeakBpm: number | null;
  maxHrDuringPeakBpm: number | null;
  pctMaxHr: number | null;
  hrZoneDuringPeak: number | null;
  hrZoneName: string | null;
  hrZoneColor: string | null;
  achievedAtDateIso?: string;
  workoutName?: string;
  activityId?: string;
}

export interface HrZoneDetailedStat {
  zone: number;
  name: string;
  minBpm: number;
  maxBpm: number;
  color: string;
  durationSec: number;
  percentage: number;
  avgPowerInZoneWatts: number;
  wattsPerBpm: number | null;
}

export interface HrBreakdownSummary {
  totalDurationSec: number;
  avgHrBpm: number;
  maxHrBpm: number;
  pctMaxHrAvg: number;
  pctMaxHrPeak: number;
  hrReservePct: number;
  avgWattsPerBpm: number | null;
  efficiencyFactor: number | null;
  zones: HrZoneDetailedStat[];
}
