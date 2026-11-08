import { CompletedActivity } from '../types/cycling';

/**
 * Standard ANT+/Garmin FIT protocol CRC-16 computation
 */
function computeFitCrc16(bytes: Uint8Array, length: number): number {
  const crcTable = [
    0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401,
    0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01, 0x8801, 0x4400,
  ];
  let crc = 0;
  for (let i = 0; i < length; i++) {
    const byte = bytes[i];
    let tmp = crcTable[crc & 0x0f];
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ crcTable[byte & 0x0f];

    tmp = crcTable[crc & 0x0f];
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ crcTable[(byte >> 4) & 0x0f];
  }
  return crc & 0xffff;
}

const FIT_EPOCH_OFFSET_SEC = 631065600; // Seconds between 1970-01-01 and 1989-12-31 00:00:00 UTC

function toFitTimestamp(unixMs: number): number {
  return Math.max(0, Math.floor(unixMs / 1000) - FIT_EPOCH_OFFSET_SEC);
}

/**
 * Encodes a CompletedActivity into a genuine binary Garmin .FIT file (Uint8Array & Blob)
 * containing FileId (0), Record (20) 1Hz telemetry, Lap (19), Session (18), and Activity (34) messages.
 */
export function encodeActivityToFitBytes(activity: CompletedActivity): Uint8Array {
  const dataChunks: number[] = [];

  const pushUint8 = (v: number) => dataChunks.push(v & 0xff);
  const pushUint16LE = (v: number) => {
    dataChunks.push(v & 0xff, (v >> 8) & 0xff);
  };
  const pushUint32LE = (v: number) => {
    dataChunks.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff);
  };

  const startMs = new Date(activity.startedAtIso).getTime() || Date.now();
  const startFitTs = toFitTimestamp(startMs);
  const endFitTs = startFitTs + Math.max(1, activity.durationSec);

  // 1. Definition Message: file_id (Global Mesg 0, Local 0)
  pushUint8(0x40); // Definition header, local 0
  pushUint8(0x00); // Reserved
  pushUint8(0x00); // Little Endian
  pushUint16LE(0); // Global Mesg Num = 0 (file_id)
  pushUint8(4); // 4 fields
  pushUint8(0); pushUint8(1); pushUint8(0x00); // field 0 (type): enum
  pushUint8(1); pushUint8(2); pushUint8(0x84); // field 1 (manufacturer): uint16
  pushUint8(2); pushUint8(2); pushUint8(0x84); // field 2 (product): uint16
  pushUint8(4); pushUint8(4); pushUint8(0x86); // field 4 (time_created): uint32

  // Data Message: file_id (Local 0)
  pushUint8(0x00);
  pushUint8(4); // type = 4 (Activity)
  pushUint16LE(1); // manufacturer = 1 (Garmin)
  pushUint16LE(2026); // product ID
  pushUint32LE(startFitTs);

  // 2. Definition Message: record (Global Mesg 20, Local 1)
  pushUint8(0x41);
  pushUint8(0x00);
  pushUint8(0x00);
  pushUint16LE(20);
  pushUint8(6);
  pushUint8(253); pushUint8(4); pushUint8(0x86); // timestamp uint32
  pushUint8(5);   pushUint8(4); pushUint8(0x86); // distance uint32 (cm)
  pushUint8(6);   pushUint8(2); pushUint8(0x84); // speed uint16 (mm/s)
  pushUint8(7);   pushUint8(2); pushUint8(0x84); // power uint16 (watts)
  pushUint8(3);   pushUint8(1); pushUint8(0x02); // heart_rate uint8 (bpm)
  pushUint8(4);   pushUint8(1); pushUint8(0x02); // cadence uint8 (rpm)

  // Data Messages: records
  for (let i = 0; i < activity.records.length; i++) {
    const rec = activity.records[i];
    const recTs = startFitTs + (rec.elapsedSec || i);
    const distScaled = Math.max(0, Math.round(rec.distanceMeters * 100));
    const speedMms = Math.max(0, Math.round((rec.speedKmh / 3.6) * 1000));
    const powerW = Math.max(0, Math.min(2500, Math.round(rec.powerWatts)));
    const hrBpm = Math.max(30, Math.min(240, Math.round(rec.heartRateBpm)));
    const cadRpm = Math.max(0, Math.min(220, Math.round(rec.cadenceRpm)));

    pushUint8(0x01);
    pushUint32LE(recTs);
    pushUint32LE(distScaled);
    pushUint16LE(speedMms);
    pushUint16LE(powerW);
    pushUint8(hrBpm);
    pushUint8(cadRpm);
  }

  const totalTimerTimeScaled = Math.round(activity.durationSec * 1000);
  const totalDistanceScaled = Math.round(activity.totalDistanceMeters * 100);
  const avgSpeedScaled = Math.round((activity.avgSpeedKmh / 3.6) * 1000);

  // 3. Definition Message: lap (Global Mesg 19, Local 2)
  pushUint8(0x42);
  pushUint8(0x00);
  pushUint8(0x00);
  pushUint16LE(19);
  pushUint8(10);
  pushUint8(253); pushUint8(4); pushUint8(0x86);
  pushUint8(2);   pushUint8(4); pushUint8(0x86);
  pushUint8(7);   pushUint8(4); pushUint8(0x86);
  pushUint8(8);   pushUint8(4); pushUint8(0x86);
  pushUint8(9);   pushUint8(4); pushUint8(0x86);
  pushUint8(19);  pushUint8(2); pushUint8(0x84);
  pushUint8(20);  pushUint8(2); pushUint8(0x84);
  pushUint8(15);  pushUint8(1); pushUint8(0x02);
  pushUint8(16);  pushUint8(1); pushUint8(0x02);
  pushUint8(17);  pushUint8(1); pushUint8(0x02);

  pushUint8(0x02);
  pushUint32LE(endFitTs);
  pushUint32LE(startFitTs);
  pushUint32LE(totalTimerTimeScaled);
  pushUint32LE(totalTimerTimeScaled);
  pushUint32LE(totalDistanceScaled);
  pushUint16LE(activity.avgPowerWatts);
  pushUint16LE(activity.maxPowerWatts);
  pushUint8(activity.avgHrBpm);
  pushUint8(activity.maxHrBpm);
  pushUint8(activity.avgCadenceRpm);

  // 4. Definition Message: session (Global Mesg 18, Local 3)
  pushUint8(0x43);
  pushUint8(0x00);
  pushUint8(0x00);
  pushUint16LE(18);
  pushUint8(14);
  pushUint8(253); pushUint8(4); pushUint8(0x86);
  pushUint8(2);   pushUint8(4); pushUint8(0x86);
  pushUint8(7);   pushUint8(4); pushUint8(0x86);
  pushUint8(8);   pushUint8(4); pushUint8(0x86);
  pushUint8(9);   pushUint8(4); pushUint8(0x86);
  pushUint8(11);  pushUint8(2); pushUint8(0x84);
  pushUint8(14);  pushUint8(2); pushUint8(0x84);
  pushUint8(20);  pushUint8(2); pushUint8(0x84);
  pushUint8(21);  pushUint8(2); pushUint8(0x84);
  pushUint8(34);  pushUint8(2); pushUint8(0x84);
  pushUint8(35);  pushUint8(2); pushUint8(0x84);
  pushUint8(5);   pushUint8(1); pushUint8(0x00);
  pushUint8(6);   pushUint8(1); pushUint8(0x00);
  pushUint8(16);  pushUint8(1); pushUint8(0x02);

  pushUint8(0x03);
  pushUint32LE(endFitTs);
  pushUint32LE(startFitTs);
  pushUint32LE(totalTimerTimeScaled);
  pushUint32LE(totalTimerTimeScaled);
  pushUint32LE(totalDistanceScaled);
  pushUint16LE(activity.caloriesKcal);
  pushUint16LE(avgSpeedScaled);
  pushUint16LE(activity.avgPowerWatts);
  pushUint16LE(activity.maxPowerWatts);
  pushUint16LE(activity.normalizedPowerWatts);
  pushUint16LE(Math.round(activity.tss * 10));
  pushUint8(2); // cycling
  pushUint8(6); // indoor_cycling
  pushUint8(activity.avgHrBpm);

  // 5. Definition Message: activity (Global Mesg 34, Local 4)
  pushUint8(0x44);
  pushUint8(0x00);
  pushUint8(0x00);
  pushUint16LE(34);
  pushUint8(4);
  pushUint8(253); pushUint8(4); pushUint8(0x86);
  pushUint8(0);   pushUint8(4); pushUint8(0x86);
  pushUint8(1);   pushUint8(2); pushUint8(0x84);
  pushUint8(2);   pushUint8(1); pushUint8(0x00);

  pushUint8(0x04);
  pushUint32LE(endFitTs);
  pushUint32LE(totalTimerTimeScaled);
  pushUint16LE(1);
  pushUint8(0);

  // Build 14-byte FIT header + data payload + 2-byte CRC
  const dataSize = dataChunks.length;
  const totalBytes = new Uint8Array(14 + dataSize + 2);

  totalBytes[0] = 14;
  totalBytes[1] = 0x20;
  totalBytes[2] = 0x84;
  totalBytes[3] = 0x08;
  totalBytes[4] = dataSize & 0xff;
  totalBytes[5] = (dataSize >> 8) & 0xff;
  totalBytes[6] = (dataSize >> 16) & 0xff;
  totalBytes[7] = (dataSize >> 24) & 0xff;
  totalBytes[8] = 0x2e; // '.'
  totalBytes[9] = 0x46; // 'F'
  totalBytes[10] = 0x49; // 'I'
  totalBytes[11] = 0x54; // 'T'

  const headerCrc = computeFitCrc16(totalBytes, 12);
  totalBytes[12] = headerCrc & 0xff;
  totalBytes[13] = (headerCrc >> 8) & 0xff;

  for (let i = 0; i < dataSize; i++) {
    totalBytes[14 + i] = dataChunks[i];
  }

  const fileCrc = computeFitCrc16(totalBytes, 14 + dataSize);
  totalBytes[14 + dataSize] = fileCrc & 0xff;
  totalBytes[14 + dataSize + 1] = (fileCrc >> 8) & 0xff;

  return totalBytes;
}

/**
 * Encodes a binary Uint8Array into Base64 string (safe for large buffers)
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

/**
 * Decodes a Base64 string back into a binary Uint8Array
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encodes an activity into a Base64 .FIT string for storing in Firebase Cloud Firestore
 */
export function encodeActivityToFitBase64(activity: CompletedActivity): string {
  if (activity.fitBase64 && (!activity.records || activity.records.length === 0)) {
    return activity.fitBase64;
  }
  const bytes = encodeActivityToFitBytes(activity);
  return uint8ArrayToBase64(bytes);
}

export function encodeActivityToFitBlob(activity: CompletedActivity): Blob {
  // If we already have the exact binary .FIT in fitBase64 (e.g. synced from Firestore on another device)
  // and local 1Hz records are empty/downsampled, use the preserved binary .FIT directly!
  if (activity.fitBase64 && (!activity.records || activity.records.length <= 360)) {
    try {
      const bytes = base64ToUint8Array(activity.fitBase64);
      return new Blob([bytes.buffer as ArrayBuffer], { type: 'application/octet-stream' });
    } catch {
      // fallback to re-encoding
    }
  }
  const bytes = encodeActivityToFitBytes(activity);
  return new Blob([bytes.buffer as ArrayBuffer], { type: 'application/octet-stream' });
}

export function downloadActivityFitFile(activity: CompletedActivity): void {
  const blob = encodeActivityToFitBlob(activity);
  const datePart = activity.startedAtIso.slice(0, 10);
  const cleanName = activity.workoutName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32);
  const filename = `Domyos_${activity.profileId}_${datePart}_${cleanName}.fit`;

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
 * Generates Garmin Training Center XML (.TCX) with Power, HR, and Cadence extensions
 */
export function downloadActivityTcxFile(activity: CompletedActivity): void {
  const startIso = new Date(activity.startedAtIso).toISOString();
  const trackpoints = activity.records
    .map((r) => {
      const ptIso = new Date(r.timestampMs).toISOString();
      return `          <Trackpoint>
            <Time>${ptIso}</Time>
            <DistanceMeters>${r.distanceMeters.toFixed(1)}</DistanceMeters>
            <HeartRateBpm><Value>${Math.round(r.heartRateBpm)}</Value></HeartRateBpm>
            <Cadence>${Math.round(r.cadenceRpm)}</Cadence>
            <Extensions>
              <ns3:TPX>
                <ns3:Speed>${(r.speedKmh / 3.6).toFixed(2)}</ns3:Speed>
                <ns3:Watts>${Math.round(r.powerWatts)}</ns3:Watts>
              </ns3:TPX>
            </Extensions>
          </Trackpoint>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase
  xsi:schemaLocation="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2 http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd"
  xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2"
  xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Activities>
    <Activity Sport="Biking">
      <Id>${startIso}</Id>
      <Lap StartTime="${startIso}">
        <TotalTimeSeconds>${activity.durationSec}</TotalTimeSeconds>
        <DistanceMeters>${activity.totalDistanceMeters}</DistanceMeters>
        <Calories>${activity.caloriesKcal}</Calories>
        <AverageHeartRateBpm><Value>${activity.avgHrBpm}</Value></AverageHeartRateBpm>
        <MaximumHeartRateBpm><Value>${activity.maxHrBpm}</Value></MaximumHeartRateBpm>
        <Intensity>Active</Intensity>
        <Cadence>${activity.avgCadenceRpm}</Cadence>
        <TriggerMethod>Manual</TriggerMethod>
        <Track>
${trackpoints}
        </Track>
      </Lap>
    </Activity>
  </Activities>
</TrainingCenterDatabase>`;

  const blob = new Blob([xml], { type: 'application/vnd.garmin.tcx+xml' });
  const datePart = activity.startedAtIso.slice(0, 10);
  const cleanName = activity.workoutName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32);
  const filename = `Domyos_${activity.profileId}_${datePart}_${cleanName}.tcx`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
