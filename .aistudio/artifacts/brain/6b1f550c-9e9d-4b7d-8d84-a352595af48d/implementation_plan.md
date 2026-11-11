# Plan Optymalizacji, Refaktoryzacji i Czyszczenia Kodu — Domyos Cycling Hub

## 1. Naprawa ID treningów w silniku rekomendacji dnia (`WorkoutsAndRampBuilderView.tsx`)
- **Problem**: Funkcja `smartDailyRecommendations` odwołuje się do 4 nieistniejących identyfikatorów treningów (`'w_over_under_crisscross'`, `'w_recovery_openers_25'`, `'w_z2_cadence_drills_50'`, `'w_vo2_billat_30_30'`), przez co rekomendacje po cichu wpadały w domyślny fallback.
- **Rozwiązanie**:
  - Zmapowanie identyfikatorów na faktyczne ID z `getInitialWorkouts()`:
    - `'w_over_under_crisscross'` $\rightarrow$ `'w_threshold_over_unders_50'`
    - `'w_recovery_openers_25'` $\rightarrow$ `'w_recovery_openers_30'`
    - `'w_z2_cadence_drills_50'` $\rightarrow$ `'w_z2_cadence_bursts_50'`
    - `'w_vo2_billat_30_30'` $\rightarrow$ `'w_vo2_30_30'`

## 2. Ujednolicenie klucza profilu `LS_PROFILES_KEY` oraz automatyczne sprzątanie katalogu `/User_Data/default` w OPFS (`firebaseSyncService.ts`)
- **Problem**: `firebaseSyncService.ts` korzystał ze starego klucza `'domyos_hub_profiles_v1'`, podczas gdy `App.tsx` zapisuje profil pod `'domyos_hub_google_profile_v2'`. Skutkowało to tworzeniem zbędnego katalogu `/User_Data/default` w lokalnym systemie plików OPFS.
- **Rozwiązanie**:
  - Zaktualizowanie `LS_PROFILES_KEY` w `firebaseSyncService.ts` na `'domyos_hub_google_profile_v2'` oraz dostosowanie `getKnownProfileIds()` do obsługi zarówno pojedynczego obiektu profilu Google (`AthleteProfile`), jak i tablicy profili.
  - Dodanie w `initializeLocalOpfsDirectories()` bezpiecznego sprawdzenia i automatycznego usunięcia osieroconego katalogu `/User_Data/default` z OPFS (gdy użytkownik ma aktywny profil Google lub katalog `default` nie zawiera żadnych treningów `.FIT`), tak aby w eksploratorze OPFS widniał wyłącznie faktyczny katalog profilu użytkownika.

## 3. Usunięcie martwego kodu i zaszłości po starym Google Drive (`cycling.ts`, `firebaseSyncService.ts`, `App.tsx`, `AnalyticsAndProgressView.tsx`, `WorkoutsAndRampBuilderView.tsx`)
- **Problem**: W interfejsie `CompletedActivity` i w logice zapisu dublowane były pola `syncedToGoogleDrive`, `pendingDriveSync`, `googleDriveFileId` oraz nieużywane rekwizyty (`isSyncingDriveTxt`, `onSyncTxtWorkoutsFolder`).
- **Rozwiązanie**:
  - Usunięcie przestarzałych pól Google Drive z interfejsu `CompletedActivity` (`src/types/cycling.ts`) oraz z payloadów zapisywanych do Firestore i `localStorage`.
  - Usunięcie nieużywanych propów `isSyncingDriveTxt` i `onSyncTxtWorkoutsFolder` z `WorkoutsAndRampBuilderView.tsx` oraz `App.tsx`.

## 4. Deduplikacja funkcji aktualizacji PWA oraz generatora nazw plików `.FIT` (`usePWAInstall.ts`, `fitEncoder.ts`, `firebaseSyncService.ts`, `App.tsx`, `ProfilesAndCloudSettingsView.tsx`)
- **Problem**: Funkcja wymuszająca odświeżenie Service Workera i czyszczenie `CacheStorage` była zduplikowana w `App.tsx` (`handleForceUpdatePwa`) i `ProfilesAndCloudSettingsView.tsx` (`handleForceSwUpdate`). Analogicznie logika budowania nazwy pliku `${datePart}_${cleanName}.fit` powtarzała się w trzech miejscach.
- **Rozwiązanie**:
  - Wydzielenie wspólnej funkcji `forceUpdatePwaAndClearCaches()` w `src/hooks/usePWAInstall.ts` i użycie jej w nagłówku aplikacji (`App.tsx`) oraz w zakładce `5. Firebase` (`ProfilesAndCloudSettingsView.tsx`).
  - Wydzielenie czystej funkcji `buildCleanActivityFitFileName(startedAtIso, workoutName)` w `src/services/fitEncoder.ts` i użycie jej w `downloadActivityFitFile`, `saveCompletedRideAndStateToLocalOpfs` oraz `deleteCompletedActivityEverywhere` w `firebaseSyncService.ts`.

## 5. Optymalizacja obliczeń Peak Power (5s–20m) i Normalized Power (NP) do czasu liniowego $O(N)$ (`rampAndPhysiologyEngine.ts`)
- **Problem**: Obliczanie 30-sekundowej średniej kroczącej dla Normalized Power w `calculateActivitySummary` oraz wyznaczanie szczytowych mocy (`5s, 10s, 30s, 60s, 120s, 300s, 1200s`) w `computeRidePeakPowerAndHr` używało zagnieżdżonych pętli $O(N \times W)$. Dodatkowo w pliku znajdował się nieużywany eksport `DEFAULT_PROFILES`.
- **Rozwiązanie**:
  - Zastąpienie zagnieżdżonych pętli tablicą sum prefiksowych (`Float64Array` / `Int32Array` o długości $N + 1$), co redukuje złożoność obliczeniową każdego okna czasowego do $O(N)$ ze stałym czasem zapytania o sumę przedziału $O(1)$.
  - Usunięcie nieużywanego eksportu `DEFAULT_PROFILES` oraz uporządkowanie sygnatury `buildPowerZonesFromFtp()`.
