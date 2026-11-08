# Domyos Cycling Hub (ERG & FIT Studio)

![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![Web Bluetooth FTMS](https://img.shields.io/badge/Web_Bluetooth-FTMS_0x1826-0082FC?logo=bluetooth&logoColor=white)
![PWA Standalone](https://img.shields.io/badge/PWA-Offline--First_%26_OPFS-5A0FC8?logo=pwa&logoColor=white)
![Garmin FIT Binary](https://img.shields.io/badge/Garmin_.FIT-Binary_SDK_v2-007CC3)
![Firebase Firestore](https://img.shields.io/badge/Firebase-BYOK_Cloud_Sync-FFCA28?logo=firebase&logoColor=black)

**Domyos Cycling Hub (ERG & FIT Studio)** to progresywna aplikacja webowa (PWA) stworzona do bezpośredniego sterowania rowerami stacjonarnymi i trenażerami **Domyos (Decathlon)** oraz wszystkimi urządzeniami zgodnymi ze standardem **Bluetooth FTMS (Fitness Machine Service `0x1826`)**.

Aplikacja umożliwia przeprowadzanie strukturalnych treningów kolarskich w trybie **ERG** (automatyczne wymuszanie mocy docelowej w watach), wykonywanie **Ramp Testów FTP**, rejestrowanie telemetrii z częstotliwością **1 Hz**, generowanie natywnych **binarnych plików `.FIT`** (kompatybilnych ze Strava, Garmin Connect i Intervals.icu) oraz synchronizację danych między urządzeniami za pośrednictwem własnej instancji **Firebase Cloud Firestore**, **Google Fit API** oraz **Intervals.icu API**.

---

## Spis treści

1. [CO się dzieje w aplikacji? (Przegląd funkcjonalności)](#1-co-się-dzieje-w-aplikacji-przegląd-funkcjonalności)
2. [DLACZEGO zastosowano taką architekturę? (Decyzje inżynieryjne i bezpieczeństwo)](#2-dlaczego-zastosowano-taką-architekturę-decyzje-inżynieryjne-i-bezpieczeństwo)
3. [JAK to działa pod maską? (Protokoły i algorytmy)](#3-jak-to-działa-pod-maską-protokoły-i-algorytmy)
   - [3.1. 3-etapowa Bramka Startowa (PWA + BYOK Firebase + Google OAuth)](#31-3-etapowa-bramka-startowa-pwa--byok-firebase--google-oauth)
   - [3.2. Protokół Web Bluetooth FTMS (`0x1826`) i Pętla Sterowania ERG](#32-protokół-web-bluetooth-ftms-0x1826-i-pętla-sterowania-erg)
   - [3.3. Zegar Treningowy 1 Hz (Web Worker), Wake Lock i Audio](#33-zegar-treningowy-1-hz-web-worker-wake-lock-i-audio)
   - [3.4. Silnik Fizjologii, Metryki (NP, IF, TSS, eFTP) i Składnia Plików `.TXT`](#34-silnik-fizjologii-metryki-np-if-tss-eftp-i-składnia-plików-txt)
   - [3.5. Binarny Enkoder Plików `.FIT` (Specyfikacja Garmin FIT SDK)](#35-binarny-enkoder-plików-fit-specyfikacja-garmin-fit-sdk)
   - [3.6. Integracje Zewnętrzne: Google Fit REST API oraz Intervals.icu](#36-integracje-zewnętrzne-google-fit-rest-api-oraz-intervalsicu)
4. [GDZIE znajdują się dane i kod? (Architektura pamięci i struktura projektu)](#4-gdzie-znajdują-się-dane-i-kod-architektura-pamięci-i-struktura-projektu)
   - [4.1. Trzy warstwy przechowywania danych (`OPFS`, `localStorage`, `Firestore`)](#41-trzy-warstwy-przechowywania-danych-opfs-localstorage-firestore)
   - [4.2. Mapa modułów i plików źródłowych](#42-mapa-modułów-i-plików-źródłowych)
5. [Instrukcja wdrożenia na GitHub Pages i konfiguracji własnego Firebase](#5-instrukcja-wdrożenia-na-github-pages-i-konfiguracji-własnego-firebase)

---

## 1. CO się dzieje w aplikacji? (Przegląd funkcjonalności)

Po przejściu 3-etapowej bramki bezpieczeństwa (zainstalowana aplikacja PWA + podpięty klucz projektu Firebase + zalogowane konto Google), aplikacja udostępnia **5 głównych modułów operacyjnych**:

| Zakładka | Co się w niej dzieje? | Kluczowe mechanizmy |
| :--- | :--- | :--- |
| **1. Wybór Treningu** | Wybór gotowych jednostek treningowych (Sweet Spot, VO2max, Threshold, Recovery), generowanie **Ramp Testu FTP** (Standard 20W/min, Light 10W/min, Pro 25W/min) oraz tworzenie i import własnych treningów z plików `.TXT`. | Automatyczne przeliczanie stref mocy względem aktualnego FTP zalogowanego kolarza; zapis własnych planów w pamięci lokalnej OPFS oraz w chmurze Firestore. |
| **2. Jazda (Live Cockpit)** | Kokpit telemetryczny czasu rzeczywistego (1 Hz). Wyświetla aktualną moc (W), docelową moc ERG, kadencję (RPM), tętno (BPM), prędkość (km/h), dystans, spalone kilodżule (kJ) oraz wykres bloków treningowych. | Pętla **ERG Watchdog** wysyłająca komendy mocy do roweru, ręczna korekta mocy (`-10W` / `-5W` / `+5W` / `+10W`), przełączanie trybu `ERG <-> SIM (Poziom oporu 1-16)`, blokada wygaszania ekranu (`Wake Lock`) i sygnały dźwiękowe przed zmianą bloku. |
| **3. Historia i Analityka** | Pełne archiwum ukończonych sesji treningowych wraz z interaktywnymi wykresami mocy/tętna/kadencji, rozkładem czasu w strefach mocy (Z1–Z7) i tętna (Z1–Z5) oraz tabelą międzyczasów (Laps). | Pobranie natywnego pliku binarnego `.FIT` na urządzenie, odtworzenie pliku `.FIT` z chmury Firestore (Base64), ręczna lub automatyczna wysyłka sesji do **Intervals.icu** oraz **Google Fit**. |
| **4. Profil Kolarza** | Zarządzanie profilem aktualnie zalogowanego konta Google: FTP (W), masa ciała (kg), tętno maksymalne (HR Max), próg mleczanowy (LTHR), automatycznie wyliczane strefy mocy **Coggana (Z1–Z7)** i strefy tętna **Friela (Z1–Z5)**. | Konfiguracja bezpośredniego eksportu do **Google Fit** (OAuth 2.0 Bearer Token) oraz **Intervals.icu** (Athlete ID + API Key + Auto-Upload po zakończeniu jazdy). |
| **5. Baza OPFS i Chmura** | Menedżer lokalnego systemu plików przeglądarki (**Origin Private File System**) oraz diagnostyka połączenia z bazą **Firebase Cloud Firestore**. | Podgląd, pobieranie i usuwanie surowych plików `.FIT` i `.TXT` zapisanych w izolowanej przestrzeni dyskowej urządzenia mobilnego; ręczny Backup/Restore stanu z chmury. |

---

## 2. DLACZEGO zastosowano taką architekturę? (Decyzje inżynieryjne i bezpieczeństwo)

Projekt został zaprojektowany pod kątem hostowania na **publicznym repozytorium GitHub oraz GitHub Pages**, przy jednoczesnym zachowaniu pełnej prywatności danych treningowych i niezawodności sprzętowej na urządzeniach mobilnych:

1. **Dlaczego w repozytorium nie ma żadnych profili ani kluczy API ("Zero-Secret Public Repo")?**
   - Publiczne repozytorium na GitHubie nie może zawierać prywatnych danych kolarza, zahardkodowanych profili użytkowników ani prywatnych kluczy konfiguracyjnych bazy Firebase.
   - Skrypt budujący (`scripts/build-gh-pages.mjs`) podczas każdego wykonania `npm run build` **automatycznie nadpisuje plik `firebase-applet-config.json` pustym obiektem `{}`** przed kompilacją paczki produkcyjnej do folderu `docs/`, a po zbudowaniu przywraca plik roboczy. Dzięki temu w opublikowanej wersji na GitHub Pages nie ma ani jednego bajta prywatnych poświadczeń.

2. **Dlaczego aplikacja wymusza instalację jako PWA na telefonie/tablecie przed zalogowaniem?**
   - Przeglądarki mobilne (szczególnie na systemach Android oraz iOS/iPadOS) traktują zwykłe karty przeglądarki jako tymczasowe i mogą po kilku dniach wyczyścić ich pamięć `localStorage` oraz pliki w `OPFS` (tzw. *Storage Eviction*).
   - Zainstalowanie aplikacji na ekranie głównym i uruchomienie jej w trybie **Standalone PWA (`display-mode: standalone`)** nadaje jej wyższy priorytet systemowy, chroni bazę plików `.FIT` w OPFS przed usunięciem, pozwala na pracę pełnoekranową bez paska adresu i zapewnia stabilniejsze działanie połączenia Bluetooth oraz blokady wygaszania ekranu (`Screen Wake Lock`).

3. **Dlaczego konfiguracja Firebase jest wklejana jako JSON na urządzeniu (model BYOK — Bring Your Own Key)?**
   - Zamiast kompilować klucze Firebase w kodzie źródłowym na GitHubie, użytkownik po zainstalowaniu PWA na swoim telefonie lub tablecie **jednorazowo wkleja obiekt konfiguracyjny JSON** swojego projektu Firebase.
   - Konfiguracja ta jest zapisywana wyłącznie w pamięci `localStorage` tego konkretnego urządzenia (`domyos_custom_firebase_config_v1`).

4. **Dlaczego profil użytkownika jest tworzony wyłącznie na podstawie zalogowanego konta Google?**
   - Każdy użytkownik loguje się własnym kontem Google (`GoogleAuthProvider`). Aplikacja identyfikuje kolarza po unikalnym identyfikatorze `uid` oraz adresie `email` i ładuje (lub automatycznie tworzy przy pierwszym logowaniu) **wyłącznie jeden profil powiązany z tym kontem Google**.
   - Dodatkowo logowanie przez Google pozwala uzyskać token dostępowy OAuth2 z uprawnieniami do bezpośredniego zapisu sesji kolarskich i tętna w **Google Fit API**.

5. **Dlaczego używany jest natywny system plików OPFS (Origin Private File System) obok chmury Firestore?**
   - Trening kolarski trwa od 30 minut do kilku godzin. W razie utraty zasięgu Wi-Fi/LTE w pomieszczeniu treningowym plik binarny `.FIT` oraz logi treningu są natychmiast zapisywane bezpośrednio na dysku urządzenia w standardzie **OPFS** (działającym w 100% offline), a równolegle (lub po odzyskaniu połączenia) synchronizowane z kolekcją `workoutLogs` w chmurze Firestore (wraz z zakodowanym w Base64 plikiem `.FIT`).

---

## 3. JAK to działa pod maską? (Protokoły i algorytmy)

```
┌────────────────────────────────────────────────────────────────────────────┐
│                   1. BRAMKA BEZPIECZEŃSTWA (PWA & AUTH GATE)               │
│  [Etap 1: Instalacja Standalone PWA] ──► [Etap 2: Wklejenie JSON Firebase] │
│  ──► [Etap 3: Logowanie Google OAuth (Izolowany Profil Konta Google)]      │
└───────────────────────────────────────┬────────────────────────────────────┘
                                        │
                                        ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                    2. RDZEŃ TELEMETRII I STEROWANIA (1 Hz)                 │
│                                                                            │
│  ┌─────────────────────────┐         ┌──────────────────────────────────┐  │
│  │ Web Bluetooth API (BLE) │         │ Zegar Treningowy & Utrzymanie    │  │
│  │ • FTMS 0x1826           │◄───────►│ • Web Worker (takt 1000 ms)      │  │
│  │   - 0x2AD2 (Telemetria) │  ERG W  │ • Screen Wake Lock API           │  │
│  │   - 0x2AD9 (Sterowanie) │  Op 0x05│ • Web Audio API (Alerty 3-2-1)   │  │
│  │ • HR 0x180D / 0x2A37    │         └─────────────────┬────────────────┘  │
│  └────────────┬────────────┘                           │                   │
│               └───────────────────┬────────────────────┘                   │
│                                   ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ Silnik Fizjologii i Analityki (W Czasie Rzeczywistym + Post-Workout) │  │
│  │ • 30s Rolling Power -> NP (Normalized Power), IF, TSS, VI, Praca kJ  │  │
│  │ • Rozkład czasu w strefach mocy (Z1-Z7 Coggan) i tętna (Z1-Z5 Friel) │  │
│  │ • Detekcja rekordu eFTP (75% najlepszej 1-minutowej mocy z Ramp Test)│  │
│  └────────────────────────────────┬─────────────────────────────────────┘  │
└───────────────────────────────────┼────────────────────────────────────────┘
                                    ▼
┌────────────────────────────────────────────────────────────────────────────┐
│               3. KODOWANIE BINARNE I WARSTWY TRWAŁOŚCI DANYCH              │
│                                                                            │
│  ┌──────────────────────┐   ┌─────────────────────┐   ┌─────────────────┐  │
│  │ Binarny Enkoder .FIT │   │ Pamięć Lokalna OPFS │   │ Chmura & API    │  │
│  │ • Nagłówek 14B       │──►│ • Origin Private FS │──►│ • Firestore DB  │  │
│  │ • Rekordy 1Hz + Laps │   │   (*.fit, *.txt)    │   │   (Telemetria + │  │
│  │ • Garmin Epoch 1989  │   │ • localStorage      │   │    .FIT Base64) │  │
│  │ • Suma CRC-16        │   │   (Konfig Firebase) │   │ • Intervals.icu │  │
│  └──────────────────────┘   └─────────────────────┘   │ • Google Fit API│  │
│                                                       └─────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

### 3.1. 3-etapowa Bramka Startowa (PWA + BYOK Firebase + Google OAuth)

Komponent `PwaAndAuthGateScreen.tsx` weryfikuje trzy warunki przed wpuszczeniem użytkownika do aplikacji:
1. **Weryfikacja trybu PWA Standalone**: Sprawdza `window.matchMedia('(display-mode: standalone)').matches` lub `navigator.standalone === true`. Jeśli aplikacja została otwarta w zwykłej karcie przeglądarki na telefonie lub z domeny GitHub Pages, wyświetla przycisk natywnej instalacji PWA (`beforeinstallprompt`) lub instrukcję dodania do ekranu głównego. *(W środowisku deweloperskim AI Studio dostępny jest przycisk testowego pominięcia blokady ze względu na ograniczenia `iframe`).*
2. **Konfiguracja Firebase (BYOK)**: Sprawdza obecność kluczy `apiKey` oraz `projectId` w pamięci urządzenia (`localStorage`). Użytkownik może wkleić zarówno czysty obiekt JSON, jak i cały fragment kodu `const firebaseConfig = { ... };` skopiowany prosto z konsoli Firebase — parser automatycznie wyodrębnia klamry `{ ... }` i waliduje wymagane pola.
3. **Logowanie Google OAuth**: Wywołuje `signInWithPopup(auth, googleProvider)` i przekazuje zalogowanego użytkownika do funkcji `resolveOrCreateProfileForGoogleUser()`, która wyszukuje w kolekcji `profiles` dokument powiązany z danym `uid` / `email` lub zakłada nowy profil z domyślnymi strefami mocy i tętna.

---

### 3.2. Protokół Web Bluetooth FTMS (`0x1826`) i Pętla Sterowania ERG

Komunikacja z trenażerem i czujnikiem tętna odbywa się bez udziału zewnętrznych serwerów — bezpośrednio między układem Bluetooth urządzenia mobilnego a elektroniką roweru (`src/services/ftmsBluetooth.ts`):

| Usługa / Charakterystyka GATT | UUID | Kierunek | Opis techniczny i parsowanie |
| :--- | :--- | :--- | :--- |
| **Fitness Machine Service (FTMS)** | `0x1826` | Usługa główna | Standardowy profil GATT dla trenażerów kolarskich Smart i rowerów Domyos. |
| **Indoor Bike Data** | `0x2AD2` | `Notify` (Rower -> Aplikacja) | Strumień binarny wysyłany przez rower. Pierwsze 2 bajty (`Uint16` Little-Endian) to **Flagi Bitowe** określające, które pola występują w ramce:<br>• Bit 0 (`0x0001` == 0): Instantaneous Speed (`Uint16`, rozdzielczość `0.01 km/h`)<br>• Bit 2 (`0x0004`): Instantaneous Cadence (`Uint16`, rozdzielczość `0.5 RPM`)<br>• Bit 6 (`0x0040`): Instantaneous Power (`Int16`, rozdzielczość `1 W`)<br>• Bit 9 (`0x0200`): Heart Rate z konsoli roweru (`Uint8`, `1 BPM`). |
| **Fitness Machine Control Point** | `0x2AD9` | `Write` / `Indicate` (Aplikacja -> Rower) | Kanał rozkazów sterujących obciążeniem trenażera:<br>• `0x00` (**Request Control**): Przejęcie kontroli nad elektroniką oporu roweru.<br>• `0x07` (**Start / Resume**): Aktywacja sesji sterowanej.<br>• `0x05` (**Set Target Power — Tryb ERG**): `3 bajty` -> `[0x05, powerLSB, powerMSB]` gdzie moc docelowa zapisana jest jako `Int16` Little-Endian w krokach co `1 W`.<br>• `0x11` (**Set Indoor Bike Simulation — Tryb SIM**): `7 bajtów` -> `[0x11, windLSB, windMSB, gradeLSB, gradeMSB, crr, cw]` do symulacji nachylenia podjazdu i poziomu oporu (1–16). |
| **Heart Rate Service & Measurement** | `0x180D` / `0x2A37` | `Notify` (Pas HR -> Aplikacja) | Niezależne połączenie z pasem napiersiowym lub opaską optyczną BLE (Garmin, Polar, Wahoo, Coospo, Magene). Jeśli Bit 0 flagi wynosi `0`, tętno odczytywane jest jako `Uint8` (bajt 1); jeśli `1` — jako `Uint16` (bajty 1–2). Pomiar z dedykowanego pasa HR ma zawsze wyższy priorytet niż czujnik w kierownicy roweru. |

> [!TIP]
> **Mechanizm ERG Watchdog w rowerach Domyos**: Wiele konsol Domyos (np. Domyos Bike 500/900, Challenge Bike) posiada wbudowany timeout bezpieczeństwa — jeśli przez kilkanaście sekund nie otrzymają nowej komendy na charakterystyce `0x2AD9`, potrafią zresetować opór. Dlatego aplikacja co kilka sekund oraz przy każdej zmianie bloku ponawia sekwencję `Request Control (0x00)` -> `Set Target Power (0x05)`.

---

### 3.3. Zegar Treningowy 1 Hz (Web Worker), Wake Lock i Audio

- **Odporność na uśpienie wątku UI (`workoutTimerWorker.ts`)**: Zwykłe wywołanie `setInterval` w głównym wątku przeglądarki potrafi zwalniać, gdy przeglądarka jest obciążona lub chwilowo zminimalizowana. Zegar treningowy działa w osobnym wątku **Web Worker**, wysyłając komunikat `TICK` dokładnie co `1000 ms`.
- **Screen Wake Lock API (`audioAndWakeLock.ts`)**: W momencie rozpoczęcia jazdy aplikacja wywołuje `navigator.wakeLock.request('screen')`, blokując automatyczne wygaszenie ekranu telefonu/tabletu na uchwycie kierownicy. Po powrocie do karty (`visibilitychange`) blokada jest automatycznie odnawiana.
- **Syntezator dźwiękowy Web Audio API**: Bez ładowania zewnętrznych plików MP3, aplikacja generuje za pomocą `AudioContext` + `OscillatorNode` sygnały odliczania **3–2–1** (`440 Hz`) oraz wyższy ton startu nowego interwału (`880 Hz`).

---

### 3.4. Silnik Fizjologii, Metryki (NP, IF, TSS, eFTP) i Składnia Plików `.TXT`

Moduł `src/services/rampAndPhysiologyEngine.ts` odpowiada za obliczenia fizjologiczne w trakcie i po zakończeniu jazdy:

1. **Normalized Power (NP® — Moc Znormalizowana)**:
   - Obliczana jest 30-sekundowa średnia krocząca mocy ($P_{30s}$).
   - Każda próbka średniej kroczącej jest podnoszona do czwartej potęgi ($P_{30s}^4$), uśredniana z całego treningu, a z wyniku wyciągany jest pierwiastek czwartego stopnia:
     $$\text{NP} = \sqrt[4]{\frac{1}{N}\sum_{i=1}^{N} \left(P_{30s, i}\right)^4}$$
2. **Intensity Factor (IF®) oraz Training Stress Score (TSS®)**:
   $$\text{IF} = \frac{\text{NP}}{\text{FTP}}, \qquad \text{TSS} = \frac{t_{\text{sekundy}} \times \text{NP} \times \text{IF}}{\text{FTP} \times 3600} \times 100$$
3. **Estymacja FTP (eFTP) z testu Ramp Test**:
   - Algorytm skanuje cały przebieg treningu sekundę po sekundzie, wyznacza najlepszą 60-sekundową średnią moc (**Best 1-Minute Power**) i wylicza estymowane FTP według protokołu rampowego:
     $$\text{eFTP} = \text{round}(0.75 \times P_{\text{max 60s}})$$
   - Jeśli wyliczone `eFTP` przekracza dotychczasowe FTP kolarza o co najmniej `2 W`, po zakończeniu treningu wyświetlane jest powiadomienie z możliwością automatycznej aktualizacji profilu oraz przeliczenia **7 stref mocy Coggana (Z1–Z7)** w bazie Firestore.
4. **Składnia własnych plików treningowych `.TXT`**:
   - Pliki `.TXT` obsługują zarówno bloki stałej mocy, jak i płynne rampy liniowe (rozgrzewki, schłodzenia, progresje):
     ```text
     # Komentarze zaczynają się od znaku #
     # Format stałego bloku: MINUTY;WATY
     5;120
     10;200
     # Format płynnej rampy: MINUTY;WATY_START;WATY_KONIEC
     5;100;220
     ```
   - Gdy zdefiniowana jest rampa (`WATY_START;WATY_KONIEC`), aplikacja automatycznie dzieli ją na 1-minutowe schodki pośrednie, płynnie zwiększając lub zmniejszając opór trenażera.

---

### 3.5. Binarny Enkoder Plików `.FIT` (Specyfikacja Garmin FIT SDK)

Moduł `src/services/fitEncoder.ts` buduje od podstaw (na tablicach `Uint8Array` oraz `DataView`) natywny plik binarny zgodny ze specyfikacją **Garmin Flexible and Interoperable Data Transfer (FIT) Protocol v2.0**:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    STRUKTURA PLIKU BINARNEGO .FIT                       │
├──────────────────────┬──────────────────────────────────────────────────┤
│ Nagłówek (14 Bajtów) │ • Rozmiar nagłówka: 14 (0x0E)                    │
│                      │ • Wersja protokołu: 0x20 (2.0)                   │
│                      │ • Wersja profilu: 2132 (0x0854 Little-Endian)    │
│                      │ • Rozmiar sekcji danych (Uint32 Little-Endian)   │
│                      │ • Sygnatura ASCII: ".FIT" (0x2E 0x46 0x49 0x54)  │
│                      │ • Suma kontrolna nagłówka CRC-16 (2 bajty)       │
├──────────────────────┼──────────────────────────────────────────────────┤
│ Sekcja Rekordów      │ • Definicja + Dane: File ID (MesgNum 0)          │
│ (Definition & Data)  │   (Typ pliku: Activity = 4, Producent: 1)        │
│                      │ • Definicja + Dane: Event Start (MesgNum 21)     │
│                      │ • Definicja + Strumień 1 Hz: Record (MesgNum 20) │
│                      │   - Timestamp (Garmin Epoch: Unix - 631065600s)  │
│                      │   - Distance (Uint32, skala 100 -> cm)           │
│                      │   - Speed (Uint16, skala 1000 -> mm/s)           │
│                      │   - Heart Rate (Uint8, BPM)                      │
│                      │   - Cadence (Uint8, RPM)                         │
│                      │   - Power (Uint16, Waty)                         │
│                      │ • Definicja + Dane: Lap (MesgNum 19) dla bloków  │
│                      │ • Definicja + Dane: Session (MesgNum 18)         │
│                      │   (Sport: Cycling = 2, SubSport: Indoor = 6,     │
│                      │    Avg/Max Power, NP, TSS, IF, Avg/Max HR/Cad)   │
│                      │ • Definicja + Dane: Activity (MesgNum 34)        │
├──────────────────────┼──────────────────────────────────────────────────┤
│ Stopka (2 Bajty)     │ • 16-bitowa suma kontrolna CRC-16 całego pliku   │
└──────────────────────┴──────────────────────────────────────────────────┘
```

- **Konwersja czasu (Garmin Epoch)**: Wszystkie znaczniki czasu w plikach `.FIT` są zapisywane jako liczba sekund, które upłynęły od **`1989-12-31T00:00:00Z`** (czyli `UnixTimestampSeconds - 631065600`).
- **Kompatybilność**: Wygenerowany plik przechodzi walidację sumy kontrolnej CRC-16 i może być bezpośrednio wgrywany do **Strava**, **Garmin Connect**, **TrainingPeaks** oraz **Intervals.icu**.

---

### 3.6. Integracje Zewnętrzne: Google Fit REST API oraz Intervals.icu

1. **Intervals.icu (`src/services/intervalsIcuService.ts`)**:
   - Wykorzystuje uwierzytelnianie HTTP Basic Auth (`API_KEY:<klucz_api>`).
   - Wysyła wygenerowany binarny plik `.FIT` metodą `POST multipart/form-data` bezpośrednio na endpoint `https://intervals.icu/api/v1/athlete/{athleteId}/activities`.
   - Jeśli w profilu kolarza włączona jest opcja **Auto-Upload**, plik `.FIT` jest przesyłany do Intervals.icu natychmiast po kliknięciu „Zakończ i zapisz trening".
2. **Google Fit REST API (`src/services/googleFitService.ts`)**:
   - Wykorzystuje token OAuth 2.0 uzyskany podczas autoryzacji konta Google (`scopes: fitness.activity.write`, `fitness.heart_rate.write`, `fitness.location.write`).
   - Tworzy źródła danych (`dataSources`), przesyła strumień tętna (`com.google.heart_rate.bpm`), moc (`com.google.power.sample`), spalone kalorie (`com.google.calories.expended`) oraz rejestruje sesję kolarską (`activityType: 15` — Stationary Biking).

---

## 4. GDZIE znajdują się dane i kod? (Architektura pamięci i struktura projektu)

### 4.1. Trzy warstwy przechowywania danych (`OPFS`, `localStorage`, `Firestore`)

| Warstwa pamięci | Gdzie fizycznie się znajduje? | Co dokładnie przechowuje? | Dlaczego tam? |
| :--- | :--- | :--- | :--- |
| **1. OPFS (Origin Private File System)** | Izolowany, natywny system plików przeglądarki w pamięci flash telefonu/tabletu (`navigator.storage.getDirectory()`). | • Binarne pliki ukończonych aktywności `*.fit`<br>• Pliki definicji własnych treningów `*.txt` | Bardzo szybki zapis binarny (`FileSystemWritableFileStream`), pełne działanie w trybie **Offline**, brak limitu 5 MB znanego z `localStorage`. |
| **2. `localStorage` urządzenia** | Pamięć przeglądarki przypisana do zainstalowanej aplikacji PWA. | • `domyos_custom_firebase_config_v1` (wklejony JSON Firebase)<br>• `domyos_hub_google_profile_v2` (cache profilu zalogowanego konta Google)<br>• `domyos_hub_logs_v1` oraz `domyos_hub_custom_workouts_v1` | Natychmiastowy start aplikacji i zachowanie konfiguracji połączenia z Firebase na danym urządzeniu mobilnym bez konieczności ponownego wklejania JSON-a. |
| **3. Firebase Cloud Firestore** | Prywatna baza chmurowa projektu Firebase należącego do użytkownika. | • Kolekcja `profiles` (dokument profilu powiązany z `uid` i `email` konta Google)<br>• Kolekcja `customWorkouts` (własne treningi `.TXT`)<br>• Kolekcja `workoutLogs` (pełna telemetria 1 Hz, statystyki stref oraz **binarny plik `.FIT` zakodowany w Base64** w polu `fitBase64`) | Synchronizacja w czasie rzeczywistym (`onSnapshot`) pomiędzy telefonem używanym na rowerze a tabletem lub komputerem służącym do analizy historii treningów. |

---

### 4.2. Mapa modułów i plików źródłowych

- **Konfiguracja i budowanie (Root & Scripts)**:
  - `scripts/build-gh-pages.mjs` — skrypt budujący paczkę produkcyjną: czyści `firebase-applet-config.json` do `{}` (Gatekeep bezpieczeństwa), uruchamia `vite build`, kopiuje artefakty PWA do katalogu `docs/` wraz z plikiem `.nojekyll` oraz `404.html` (obsługa routingu SPA na GitHub Pages).
  - `public/manifest.json` oraz `public/sw.js` — manifest Web App (tryb `standalone`, ikony, kolorystyka) oraz Service Worker zapewniający buforowanie zasobów offline i automatyczną aktualizację przy starcie (`skipWaiting` + `clients.claim`).
  - `firestore.rules` oraz `firebase-blueprint.json` — reguły bezpieczeństwa bazy Firestore oraz definicja schematu kolekcji.
- **Warstwa autoryzacji i chmury (`src/lib/` & `src/services/`)**:
  - `src/lib/firebase.ts` — inicjalizacja Firebase SDK na podstawie konfiguracji wklejonej przez użytkownika w pamięci urządzenia (`localStorage`), obsługa `GoogleAuthProvider` oraz stanu sesji OAuth.
  - `src/services/firebaseSyncService.ts` — dwukierunkowa synchronizacja profilu zalogowanego konta Google, własnych treningów i historii jazd (wraz z konwersją `Uint8Array <-> Base64` dla plików `.FIT`).
- **Warstwa sprzętowa i obliczeniowa (`src/services/`)**:
  - `src/services/ftmsBluetooth.ts` — obsługa Web Bluetooth GATT (`0x1826` FTMS, `0x2AD2` Indoor Bike Data, `0x2AD9` Control Point, `0x180D` Heart Rate).
  - `src/services/fitEncoder.ts` — niskopoziomowy enkoder binarny plików `.FIT` (nagłówek 14B, rekordy 1 Hz, okrążenia, sesja, CRC-16).
  - `src/services/rampAndPhysiologyEngine.ts` — kalkulator stref mocy (Coggan Z1–Z7) i tętna (Friel Z1–Z5), generator Ramp Testów FTP, parser treningów `.TXT` oraz obliczenia NP, IF, TSS i eFTP.
  - `src/services/workoutTimerWorker.ts` — dedykowany Web Worker utrzymujący niezawodny takt zegara `1000 ms`.
  - `src/services/audioAndWakeLock.ts` — zarządzanie `Screen Wake Lock API` oraz syntezą sygnałów dźwiękowych `Web Audio API`.
  - `src/services/googleFitService.ts` oraz `src/services/intervalsIcuService.ts` — klienty REST API do eksportu treningów do Google Fit oraz Intervals.icu.
- **Komponenty interfejsu użytkownika (`src/components/`)**:
  - `PwaAndAuthGateScreen.tsx` — 3-etapowy ekran blokady startowej (Wymóg instalacji PWA -> Wklejenie JSON Firebase -> Logowanie Google OAuth).
  - `WorkoutsAndRampBuilderView.tsx` — Zakładka 1: Wybór treningu, konfigurator Ramp Testu i kreator plików `.TXT`.
  - `LiveRideCockpitView.tsx` — Zakładka 2: Kokpit jazdy na żywo, wykres interwałów i sterowanie ERG/SIM.
  - `HistoryAndAnalyticsView.tsx` — Zakładka 3: Historia sesji, wykresy post-workout, analiza stref i pobieranie plików `.FIT`.
  - `AthleteProfilesView.tsx` — Zakładka 4: Parametry fizjologiczne zalogowanego konta Google oraz konfiguracja kluczy Google Fit i Intervals.icu.
  - `ProfilesAndCloudSettingsView.tsx` — Zakładka 5: Eksplorator plików lokalnych OPFS (`.FIT` / `.TXT`) oraz diagnostyka chmury Firestore.

---

## 5. Instrukcja wdrożenia na GitHub Pages i konfiguracji własnego Firebase

### Krok 1: Uruchomienie lokalne i budowanie paczki na GitHub Pages

```bash
# 1. Instalacja zależności
npm install

# 2. Uruchomienie serwera deweloperskiego (port 3000)
npm run dev

# 3. Zbudowanie bezpiecznej paczki produkcyjnej (bez kluczy) do katalogu docs/
npm run build
```

Po wykonaniu `npm run build` w katalogu `docs/` znajduje się kompletna, statyczna aplikacja PWA gotowa do publikacji na **GitHub Pages** (w ustawieniach repozytorium GitHub wybierz: **Settings -> Pages -> Build and deployment -> Deploy from a branch -> Branch: `main` / Folder: `/docs`**).

### Krok 2: Przygotowanie własnego projektu Firebase

1. Wejdź do [Firebase Console](https://console.firebase.google.com/) i utwórz nowy projekt.
2. W sekcji **Build -> Authentication -> Sign-in method** włącz dostawcę **Google**.
3. W sekcji **Authentication -> Settings -> Authorized domains** dodaj domenę swojego GitHub Pages (np. `<twoj-login>.github.io`).
4. W sekcji **Build -> Firestore Database** utwórz bazę danych i w zakładce **Rules** wklej reguły z pliku `firestore.rules` znajdującego się w repozytorium.
5. W ustawieniach projektu (**Project settings -> General -> Your apps**) zarejestruj aplikację Web (`</>`) i skopiuj obiekt `firebaseConfig` (JSON).

### Krok 3: Instalacja PWA na telefonie / tablecie i pierwsze logowanie

1. Otwórz adres swojej aplikacji na GitHub Pages w przeglądarce **Chrome / Edge (Android)** lub **Safari / Chrome (iOS / iPadOS)**.
2. Na pierwszym ekranie blokady zainstaluj aplikację jako **PWA** („Zainstaluj aplikację PWA" lub „Dodaj do ekranu początkowego") i uruchom ją z ikony na pulpicie telefonu/tabletu.
3. W drugim kroku wklej skopiowany obiekt JSON swojego projektu Firebase i kliknij **Zapisz konfigurację w pamięci urządzenia**.
4. W trzecim kroku kliknij **Zaloguj przez konto Google** — aplikacja automatycznie utworzy Twój indywidualny profil kolarski, zsynchronizuje go z Twoją bazą Firestore i odblokuje dostęp do wszystkich 5 zakładek treningowych.
