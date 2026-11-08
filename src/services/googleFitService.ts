import { CompletedActivity } from '../types/cycling';
import { getCachedGoogleFitToken, signInRiderWithGoogle } from '../lib/firebase';

const FITNESS_API_BASE = 'https://www.googleapis.com/fitness/v1/users/me';

async function ensureDataSource(
  accessToken: string,
  dataStreamName: string,
  dataType: { name: string; field: Array<{ name: string; format: string }> }
): Promise<string> {
  const payload = {
    dataStreamName,
    type: 'raw',
    application: {
      name: 'Domyos Cycling Hub',
      version: '2.1.0',
    },
    dataType,
    device: {
      manufacturer: 'Domyos',
      model: 'Challenge Bike FTMS',
      type: 'watch',
      uid: 'domyos_ftms_hub',
      version: '1.0',
    },
  };

  // List existing dataSources first to find matching stream
  const listRes = await fetch(`${FITNESS_API_BASE}/dataSources`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (listRes.ok) {
    const listData = await listRes.json();
    const found = (listData.dataSource || []).find(
      (ds: any) =>
        ds.dataStreamName === dataStreamName ||
        (ds.dataType?.name === dataType.name &&
          ds.device?.uid === 'domyos_ftms_hub')
    );
    if (found?.dataStreamId) {
      return found.dataStreamId;
    }
  }

  const createRes = await fetch(`${FITNESS_API_BASE}/dataSources`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!createRes.ok) {
    const errTxt = await createRes.text();
    throw new Error(`Google Fit dataSource error (${createRes.status}): ${errTxt}`);
  }

  const created = await createRes.json();
  return created.dataStreamId;
}

/**
 * Uploads a CompletedActivity (Power samples, Heart Rate samples, Calories, and Indoor Cycling Session)
 * to the logged-in rider's personal Google Fit account via the Google Fitness REST API.
 */
export async function uploadActivityToGoogleFit(
  activity: CompletedActivity,
  options?: {
    userUid?: string;
    userEmail?: string;
    interactiveRefreshIfExpired?: boolean;
  }
): Promise<{
  ok: boolean;
  sessionId?: string;
  message: string;
}> {
  try {
    let token = getCachedGoogleFitToken(options?.userUid);
    if (!token && options?.interactiveRefreshIfExpired) {
      const refreshed = await signInRiderWithGoogle({
        loginHintEmail: options.userEmail,
        requestGoogleFitScopes: true,
      });
      token = refreshed.accessToken;
    }

    if (!token) {
      return {
        ok: false,
        message:
          'Token Google Fit wygasł lub wymaga autoryzacji. Kliknij „Połącz / Odśwież Google Fit”, aby wysłać trening.',
      };
    }

    const startTimeMillis = new Date(activity.startedAtIso).getTime() || Date.now();
    const endTimeMillis = startTimeMillis + Math.max(1, activity.durationSec) * 1000;
    const startNs = `${startTimeMillis}000000`;
    const endNs = `${endTimeMillis}000000`;
    const datasetId = `${startNs}-${endNs}`;

    // 1. Push Heart Rate samples if available
    if (activity.avgHrBpm > 0) {
      try {
        const hrStreamId = await ensureDataSource(token, 'DomyosHeartRate', {
          name: 'com.google.heart_rate.bpm',
          field: [{ name: 'bpm', format: 'floatPoint' }],
        });

        const hrRecords =
          activity.records && activity.records.length > 0
            ? activity.records.filter((_, idx) => idx % 5 === 0)
            : [
                {
                  elapsedSec: 1,
                  heartRateBpm: activity.avgHrBpm,
                },
              ];

        const hrPoints = hrRecords.map((rec) => {
          const ptMs = startTimeMillis + (rec.elapsedSec || 0) * 1000;
          const ptNs = `${ptMs}000000`;
          return {
            dataTypeName: 'com.google.heart_rate.bpm',
            startTimeNanos: ptNs,
            endTimeNanos: ptNs,
            value: [{ fpVal: Number(rec.heartRateBpm || activity.avgHrBpm) }],
          };
        });

        await fetch(
          `${FITNESS_API_BASE}/dataSources/${encodeURIComponent(
            hrStreamId
          )}/datasets/${datasetId}`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              dataSourceId: hrStreamId,
              minStartTimeNs: startNs,
              maxEndTimeNs: endNs,
              point: hrPoints,
            }),
          }
        );
      } catch (e) {
        console.warn('Google Fit HR dataset warning:', e);
      }
    }

    // 2. Push Power (Watts) samples
    if (activity.avgPowerWatts > 0) {
      try {
        const powerStreamId = await ensureDataSource(token, 'DomyosPowerWatts', {
          name: 'com.google.power.sample',
          field: [{ name: 'watts', format: 'floatPoint' }],
        });

        const pwrRecords =
          activity.records && activity.records.length > 0
            ? activity.records.filter((_, idx) => idx % 5 === 0)
            : [
                {
                  elapsedSec: 1,
                  powerWatts: activity.avgPowerWatts,
                },
              ];

        const powerPoints = pwrRecords.map((rec) => {
          const ptMs = startTimeMillis + (rec.elapsedSec || 0) * 1000;
          const ptNs = `${ptMs}000000`;
          return {
            dataTypeName: 'com.google.power.sample',
            startTimeNanos: ptNs,
            endTimeNanos: ptNs,
            value: [{ fpVal: Number(rec.powerWatts || activity.avgPowerWatts) }],
          };
        });

        await fetch(
          `${FITNESS_API_BASE}/dataSources/${encodeURIComponent(
            powerStreamId
          )}/datasets/${datasetId}`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              dataSourceId: powerStreamId,
              minStartTimeNs: startNs,
              maxEndTimeNs: endNs,
              point: powerPoints,
            }),
          }
        );
      } catch (e) {
        console.warn('Google Fit Power dataset warning:', e);
      }
    }

    // 3. Register Stationary Biking Session (activityType = 15 = Stationary biking)
    const sessionId = `domyos_session_${activity.id}`;
    const sessionPayload = {
      id: sessionId,
      name: `${activity.workoutName} (${activity.avgPowerWatts}W NP ${activity.normalizedPowerWatts}W)`,
      description: `Domyos Cycling Hub · Śr. Moc: ${activity.avgPowerWatts}W · NP: ${activity.normalizedPowerWatts}W · TSS: ${activity.tss} · Śr. HR: ${activity.avgHrBpm} bpm · Energia: ${activity.caloriesKcal} kcal`,
      startTimeMillis,
      endTimeMillis,
      activityType: 15, // Stationary biking
      application: {
        name: 'Domyos Cycling Hub',
        version: '2.1.0',
      },
    };

    const sessionRes = await fetch(
      `${FITNESS_API_BASE}/sessions/${encodeURIComponent(sessionId)}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sessionPayload),
      }
    );

    if (!sessionRes.ok) {
      const errTxt = await sessionRes.text();
      return {
        ok: false,
        message: `Błąd zapisu sesji w Google Fit (${sessionRes.status}): ${errTxt.slice(0, 120)}`,
      };
    }

    return {
      ok: true,
      sessionId,
      message: `Wysłano trening „${activity.workoutName}” (${activity.avgPowerWatts}W, ${activity.avgHrBpm} bpm) na konto Google Fit!`,
    };
  } catch (err: any) {
    return {
      ok: false,
      message: err?.message || 'Nie udało się wysłać danych do Google Fit.',
    };
  }
}
