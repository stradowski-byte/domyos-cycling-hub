# Plan Implementacji: Audyt Bezpieczeństwa „Zero-Leak GitHub” oraz Prywatny System Logów (Telefon OPFS + Firebase)

## 1. Cel i Zakres Zmian
1. **100% Czyste Repozytorium na GitHubie (`Zero Private Data & Zero Hardcoded Configs`)**:
   - Całkowite wyczyszczenie pliku `/firebase-applet-config.json` do pustego obiektu `{}` na stałe — konfiguracja projektu Firebase jest przechowywana **wyłącznie lokalnie w pamięci urządzenia (`localStorage`)**.
   - Fizyczne usunięcie prywatnych zrzutów ekranu z telefonu i plików pomocniczych z `/public/assets/aistudio/` oraz zduplikowanego katalogu `/docs/`, aby nigdy nie trafiały na publiczną gałąź `main` ani `gh-pages`.
   - Usunięcie zahardkodowanego loginu i domeny (`stradowski-byte.github.io`) z kodu źródłowego `.ts`/`.tsx` — aplikacja automatycznie wykrywa bieżący adres z `window.location` lub wczytuje go z pamięci lokalnej telefonu (`localStorage`) oraz prywatnego dokumentu `hubConfig/default` w Firebase Firestore.
2. **Eliminacja `console.log` / `console.error` i Prywatny System Logów (`OPFS/localStorage` + Firebase `securityAuditLogs`)**:
   - Zastąpienie wszystkich wywołań `console.log`, `console.warn` oraz `console.error` w kodzie aplikacji prywatnym serwisem **`securityAndAuditLogger.ts`**.
   - Wszystkie logi diagnostyczne (błędy połączenia Bluetooth FTMS, kolejka synchronizacji Firestore, zdarzenia autoryzacji Google OAuth, próby dostępu) są automatycznie oczyszczane z wrażliwych kluczy (maskowanie `apiKey` i tokenów) i zapisywane:
     1. **Lokalnie na telefonie**: w `localStorage` (`domyos_private_audit_logs_v1`) oraz w prywatnym pliku `/DomyosCyclingHub/App_Engine/private_audit_logs.json` w pamięci `OPFS`.
     2. **W prywatnej kolekcji Firebase Firestore (`/securityAuditLogs/{logId}`)**: chronionej regułami `firestore.rules` (dostęp wyłącznie dla zweryfikowanego konta Google właściciela po `request.auth.uid`).
3. **Kreatywny Panel „Audyt Bezpieczeństwa & Prywatności (Zero-Leak Scanner)” w Zakładce `5. Chmura Firebase`**:
   - Interaktywny skaner bezpieczeństwa w czasie rzeczywistym sprawdzający 6 kryteriów ochrony danych (czystość buildu, brak kluczy w kodzie, weryfikacja dostawcy `google.com`, blokada `anonymous`, odcisk palca SHA-256 konfiguracji `firebaseConfig`, status szyfrowania/izolacji logów).
   - Przeglądarka prywatnych logów z telefonu (`OPFS`) i chmury (`Firebase`) z filtrowaniem po kategoriach (`AUTH`, `FIRESTORE`, `BLE`, `SECURITY`), eksportem raportu `.JSON` oraz przyciskiem awaryjnym **„Wyczyść dane z tego urządzenia (Device Wipe)”**.

---

## 2. Architektura Techniczna i Pliki do Modyfikacji

### A. Oczyszczenie Repozytorium i Pipeline'u Builda
- **`/firebase-applet-config.json` oraz `/firebase-blueprint.json`**:
  - Zastąpienie zawartości `/firebase-applet-config.json` pustym obiektem `{}`.
  - Zaktualizowanie `/firebase-blueprint.json`, aby opisywał również nową kolekcję `/securityAuditLogs/{logId}` bez żadnych prywatnych identyfikatorów projektu.
- **Usunięcie `/public/assets/aistudio/` oraz `/docs/`**:
  - Usunięcie wszystkich 3 prywatnych zrzutów ekranu (`.jpg`) oraz pliku `FIREBASE_BLUEPRINT_GUIDE_02332265.htm` z `/public/assets/aistudio/` oraz usunięcie katalogu `/docs/`.
- **`/.gitignore`, `/scripts/build-gh-pages.mjs` oraz `/.github/workflows/deploy.yml`**:
  - Dodanie do `.gitignore` reguł blokujących `public/assets/aistudio/`, `docs/`, `*Screenshot*.jpg`, `*Screenshot*.png` oraz lokalne zrzuty konfiguracji.
  - W `scripts/build-gh-pages.mjs` usunięcie kopiowania do `/docs` (GitHub Actions publikuje bezpośrednio z `./dist` na gałąź `gh-pages`) oraz wymuszenie, by `firebase-applet-config.json` zawsze pozostawał `{}`.

### B. Prywatny Logger Diagnostyczny i Audytowy (`src/services/securityAndAuditLogger.ts`)
- Nowy moduł obsługujący strukturę `SecurityAuditLogEntry`:
  - `id`: unikalny identyfikator wpisu (`log_${timestamp}_${hash}`)
  - `timestampIso`: dokładny czas zdarzenia
  - `level`: `'INFO' | 'WARN' | 'ERROR' | 'SECURITY'`
  - `category`: `'AUTH' | 'FIRESTORE' | 'BLE_FTMS' | 'GOOGLE_FIT' | 'INTERVALS_ICU' | 'SECURITY_AUDIT'`
  - `message`: czytelny opis zdarzenia (po automatycznym zamaskowaniu wszelkich tokenów i kluczy `AIza...`)
  - `context`: bezpieczne metadane diagnostyczne (np. nazwa kolekcji, kod błędu, wersja silnika)
  - `uid`: identyfikator zalogowanego użytkownika Google (`request.auth.uid`)
- **Funkcje**:
  - `recordPrivateAuditLog(level, category, message, context)` — zapisuje wpis synchronicznie w `localStorage` (`domyos_private_audit_logs_v1`), asynchronicznie dopisuje do pliku `/DomyosCyclingHub/App_Engine/private_audit_logs.json` w `OPFS` oraz — jeśli użytkownik jest zalogowany kontem Google — synchronizuje z kolekcją `/securityAuditLogs` w Firebase Firestore.
  - `computeConfigFingerprint(config)` — wylicza bezpieczny skrót kontrolny aktywnej konfiguracji `firebaseConfig` załadowanej w pamięci telefonu, bez ujawniania surowego klucza `apiKey`.
  - `runLiveSecurityAudit()` — wykonuje test kontrolny weryfikujący:
    1. Brak zahardkodowanych kluczy w `firebase-applet-config.json`.
    2. Obecność prawidłowego `firebaseConfig` w `localStorage` urządzenia.
    3. Autoryzację wyłącznie przez `google.com` (`isAnonymous === false`).
    4. Brak wywołań konsolowych i aktywność prywatnego dziennika `OPFS` + `Firestore`.
- **Podmiana wszystkich `console.*` w kodzie**:
  - `src/lib/firebase.ts`: `handleFirestoreError`, `getActiveFirebaseConfig`, `testFirestoreConnection`.
  - `src/services/firebaseSyncService.ts`: logi kolejki offline i inicjalizacji kolekcji.
  - `src/services/ftmsBluetooth.ts`: logi parowania i ponownego łączenia Web Bluetooth FTMS.
  - `src/services/googleFitService.ts`: logi synchronizacji strumieni HR i mocy z Google Fit REST API.
  - `src/components/WorkoutsAndRampBuilderView.tsx` oraz `src/App.tsx`: logi importu plików `.txt` i kolejki synchronizacji.

### C. Reguły Bezpieczeństwa `/firestore.rules` dla Kolekcji `/securityAuditLogs`
- Rozszerzenie `/firestore.rules` oraz stałej `RECOMMENDED_FIRESTORE_RULES_CODE` w `src/lib/firebase.ts` o regułę dla `/securityAuditLogs/{logId}`:
  ```javascript
  match /securityAuditLogs/{logId} {
    allow read: if isVerifiedGoogleUser() && isOwnerOrShared(resource.data);
    allow create, update: if isVerifiedGoogleUser()
      && isOwnerOrShared(request.resource.data)
      && request.resource.data.keys().hasAll(['id', 'timestampIso', 'level', 'category', 'message'])
      && request.resource.data.message is string
      && request.resource.data.message.size() <= 2000;
    allow delete: if isVerifiedGoogleUser() && isOwnerOrShared(resource.data);
  }
  ```

### D. Panel „Audyt Bezpieczeństwa & Prywatne Logi” (`src/components/SecurityAuditAndLogsPanel.tsx`)
- Osadzony w zakładce **5. Chmura Firebase** (`src/components/ProfilesAndCloudSettingsView.tsx`):
  - **Sekcja 1: Skaner Zero-Leak & Status Bezpieczeństwa (6 wskaźników kontrolnych)** z wynikiem punktowym (np. `100/100 · Czyste Repozytorium & Izolacja UID`) oraz odciskiem palca aktywnego `firebaseConfig` z pamięci telefonu.
  - **Sekcja 2: Dziennik Zdarzeń i Logów Diagnostycznych (Lokalny Telefon OPFS + Firebase `/securityAuditLogs`)** z filtrami kategorii, przyciskiem synchronizacji z chmurą, eksportem do pliku `.JSON` oraz czyszczeniem logów.
  - **Sekcja 3: Awaryjne Czyszczenie Urządzenia („Panic Wipe Telefonu”)** — jednym kliknięciem usuwa lokalny `firebaseConfig`, tokeny OAuth i pamięć podręczną z przeglądarki telefonu bez naruszania danych w chmurze Firebase.

---

## 3. Weryfikacja
1. Weryfikacja za pomocą `grep`, że w całym katalogu `src/`, `public/` oraz głównym drzewie projektu nie ma żadnych kluczy `AIzaSy...`, prywatnych adresów e-mail, zahardkodowanych nazw kont ani wywołań `console.log`/`console.error`/`console.warn`.
2. Wdrożenie zaktualizowanych reguł `firestore.rules` (obejmujących `/securityAuditLogs`) narzędziem `deploy_firebase`.
3. Kompilacja produkcyjna (`compile_applet`) oraz kontrola typów (`lint_applet`).
