# Plan Migracji Architektury: Centralny Firebase + Multi-User Google OAuth + Google Fit & Intervals.icu + GitHub Actions PWA

## 1. Cel i Zakres Zmian
Przebudowa warstwy chmurowej, autoryzacyjnej oraz procesu wydawniczego aplikacji **Domyos Cycling Hub (ERG & FIT Studio)**:
- **Jeden Centralny Projekt Firebase (Predefiniowany JSON)**: cała aplikacja korzysta z jednej wspólnej instancji Firebase Cloud Firestore, do której trafiają dane wszystkich profili i treningów.
- **Obowiązkowe Logowanie Google OAuth dla każdego zawodnika (Zero kont anonimowych)**:
  - Każdy użytkownik loguje się własnym kontem Google (`GoogleAuthProvider` w Firebase Auth).
  - Logowanie własnym kontem Google automatycznie tworzy lub wczytuje profil zawodnika przypisany do jego `uid` / `email` (bez hardcodowania jakichkolwiek imion w kodzie) oraz pozwala uzyskać token OAuth2 do wysyłki treningów bezpośrednio na indywidualne konto **Google Fit** danego użytkownika.
- **Trójtorowa Synchronizacja Treningów (Firebase + Intervals.icu + Google Fit)**:
  - **Firebase Cloud Firestore (Główny magazyn)**: wszystkie profile, zaplanowane treningi oraz wykonane sesje (wraz z telemetrią i pełnym plikiem binarnym `.FIT` w Base64) są zapisywane w centralnym Firestore (z pełną kolejką offline w OPFS / `localStorage`).
  - **Intervals.icu (Opcjonalnie per profil)**: indywidualny `Athlete ID` oraz `API Key` przypisany do profilu użytkownika.
  - **Google Fit REST API (Opcjonalnie per profil)**: wykorzystanie tokenu OAuth zalogowanego konta Google (`https://www.googleapis.com/auth/fitness.activity.write`, `fitness.heart_rate.write`, `fitness.body.write`) do automatycznego zapisu sesji kolarskiej, kalorii, mocy i tętna na koncie Google Fit trenującego.
- **System Szybkiego Przelogowywania Użytkowników (Fast Rider Switcher)**:
  - Dedykowany ekran i modal szybkiego przełączania zawodników z kafelkami zapisanych na urządzeniu kont Google (awatar Google, imię, aktualne FTP, ikony aktywnych integracji: Firebase / Google Fit / Intervals.icu).
  - Kliknięcie kafelka innego zawodnika wywołuje szybkie przelogowanie Google OAuth z parametrem `login_hint: user.email` oraz `prompt: 'select_account'`, co pozwala jednym tapnięciem przełączyć aktywne konto Google, profil fizjologiczny i token Google Fit przed treningiem.
- **Natywne wdrożenie na GitHub Pages przez GitHub Actions + Auto-Update PWA**:
  - Całkowite usunięcie ręcznego kodu GitHub API (PAT) oraz starego modułu Google Drive.
  - Automatyczny build i publikacja na gałąź `gh-pages` oraz automatyczna aktualizacja zainstalowanej aplikacji PWA przez Service Worker przy starcie.

---

## 2. Architektura Logowania i Szybkiego Przełączania Kont (Fast User Switcher)

### 2.1. Wyłącznie Google OAuth (Brak wejścia anonimowego)
- Przy starcie aplikacji, jeśli żaden użytkownik nie jest zalogowany w Firebase Auth, wyświetlany jest nowoczesny ekran startowy **Wybierz Zawodnika / Zaloguj przez Google**.
- Uwierzytelnianie odbywa się wyłącznie przez `signInWithPopup(auth, googleProvider)` z wymuszeniem dostępu Google (`sign_in_provider == 'google.com'`).
- Podczas logowania (lub przy włączeniu integracji Google Fit w profilu) `GoogleAuthProvider` pobiera zakresy (scopes):
  - `https://www.googleapis.com/auth/fitness.activity.write`
  - `https://www.googleapis.com/auth/fitness.heart_rate.write`
- Token dostępowy (`credential.accessToken`) jest buforowany w sesji dla aktywnego użytkownika, aby po zakończonym treningu aplikacja mogła od razu wysłać sesję treningową do **Google Fit** tego konkretnego użytkownika.

### 2.2. System Szybkiego Przelogowywania (Fast Rider Switcher)
- Na wspólnym telefonie/tablecie przy rowerze aplikacja zapamiętuje listę ostatnio zalogowanych na tym urządzeniu zawodników (`KnownDeviceRiders`: `uid`, `email`, `displayName`, `photoURL`, `ftpWatts`, `color`).
- W górnym pasku aplikacji (oraz w zakładce Profil) znajduje się przełącznik **Aktywny Zawodnik**:
  1. Pokazuje aktualnie zalogowanego użytkownika Google wraz z jego awatarem, FTP i statusem tokenu Google Fit / Intervals.icu.
  2. Pozwala jednym kliknięciem wybrać innego zapisanego domownika — aplikacja wywołuje `googleProvider.setCustomParameters({ login_hint: targetEmail, prompt: 'select_account' })`, dzięki czemu Google od razu podpowiada właściwe konto i odświeża poświadczenia Firebase + Google Fit.
  3. Przycisk **+ Dodaj nowego zawodnika (Konto Google)** pozwala zalogować kolejną osobę i automatycznie inicjalizuje dla niej profil fizjologiczny w bazie Firebase.

---

## 3. Struktura Bazy Danych w Centralnym Firebase Cloud Firestore

Wszystkie dane trafiają do jednej predefiniowanej instancji Firebase, zabezpieczonej regułami `firestore.rules` wymagającymi uwierzytelnienia kontem Google (`request.auth != null && request.auth.token.firebase.sign_in_provider == 'google.com'`):

1. **`/hubConfig/default`**
   - Metadane instancji (lista zarejestrowanych zawodników `registeredRiders`, data ostatniej synchronizacji, wersja schematu).
2. **`/profiles/{uid}`**
   - Dokument profilu powiązany bezpośrednio z `uid` konta Google użytkownika:
     - `uid`, `email`, `name`, `photoURL`, `color`
     - Parametry fizjologiczne: `weightKg`, `heightCm`, `maxHr`, `restingHr`, `lthr`, `ftpWatts`
     - Konfiguracja **Intervals.icu**: `intervalsAthleteId`, `intervalsApiKey`, `autoSyncIntervals`
     - Konfiguracja **Google Fit**: `googleFitEnabled`, `lastGoogleFitSyncAt`
     - Historia progresji: `progressionHistory` (wyniki testów Ramp Test i estymacje eFTP)
3. **`/plannedWorkouts/{workoutId}`**
   - Zaplanowane i własne treningi strukturalne ERG (`WorkoutDefinition`). Mogą być przypisane do konkretnego `uid` zawodnika lub oznaczone jako wspólne (`isShared: true`) dla wszystkich zalogowanych domowników.
4. **`/completedWorkouts/{sessionId}`**
   - Wykonane treningi kolarskie (`SavedWorkoutSession`):
     - `ownerUid`, `ownerEmail`, `profileName`
     - Pełne statystyki mocy, tętna, kadencji, NP, IF, TSS oraz tablica próbek telemetrycznych do wykresów
     - **`fitBase64`**: pełny binarny plik `.FIT` zakodowany w Base64 (gotowy do pobrania w dowolnym momencie na każdym urządzeniu)
     - Statusy synchronizacji: `firebaseSyncStatus`, `intervalsSyncStatus`, `googleFitSyncStatus`

---

## 4. Integracja Google Fit & Tryb Offline (OPFS + Auto-Sync Queue)

### 4.1. Eksport do Google Fit REST API (`src/services/googleFitService.ts`)
- Tworzy źródło danych (`dataSources`) dla sesji stacjonarnego roweru treningowego (Power, Heart Rate, Calories, Activity Segment `biking.stationary`).
- Po zakończeniu jazdy wysyła punkty mocy (W), tętna (BPM), spalonych kilokalorii oraz rejestruje sesję treningową w `https://www.googleapis.com/fitness/v1/users/me/sessions/{sessionId}`.
- Jeśli token OAuth wygasł (np. po kilku godzinach), przycisk **Synchronizuj z Google Fit** pozwala jednym kliknięciem odświeżyć token Google i dopchnąć oczekujące sesje.

### 4.2. Pełny Tryb Offline (OPFS + Kolejka Synchronizacji)
- Jeśli podczas treningu Wi-Fi / internet jest wyłączony, po zakończeniu jazdy:
  1. Plik `.FIT` oraz pełna telemetria zapisują się w lokalnej pamięci urządzenia (OPFS + `localStorage`) dla zalogowanego `uid`.
  2. Trening otrzymuje flagę `pending` dla Firebase, Intervals.icu oraz Google Fit.
  3. Gdy urządzenie odzyska połączenie z internetem (lub przy kolejnym uruchomieniu aplikacji), kolejka automatycznie wysyła zaległe treningi do centralnego **Firebase Firestore**, **Intervals.icu** oraz **Google Fit**.

---

## 5. Predefiniowany Config Firebase + Wdrożenie GitHub Actions PWA

1. **Predefiniowany JSON Firebase (`src/lib/firebase.ts` + `firebase-applet-config.json`)**:
   - Konfiguracja Firebase jest predefiniowana w projekcie (oraz posiada opcję podmiany/podglądu JSON-a w ustawieniach zaawansowanych), dzięki czemu po otwarciu aplikacji na telefonie od razu działa przycisk **Zaloguj kontem Google** bez konieczności ręcznego kopiowania kluczy na każdym urządzeniu.
2. **Skrypt budujący i GitHub Actions (`scripts/build-gh-pages.mjs` + `.github/workflows/deploy.yml`)**:
   - Buduje aplikację ze ścieżkami względnymi (`base: './'`), tworzy `dist/404.html` i `dist/.nojekyll` oraz wdraża całość na gałąź `gh-pages` przy każdym pushu do repozytorium.
3. **Automatyczna aktualizacja PWA**:
   - Service Worker automatycznie wykrywa nową wersję po wdrożeniu na GitHub Pages i aktualizuje zainstalowaną na telefonie aplikację przy jej uruchomieniu.
