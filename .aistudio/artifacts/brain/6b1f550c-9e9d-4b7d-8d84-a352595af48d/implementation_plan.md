# Kompleksowa Dokumentacja GitHub (`README.md`) — Domyos Cycling Hub (ERG & FIT Studio)

Przygotowanie pełnej, techniczno-architektonicznej dokumentacji w języku polskim w pojedynczym pliku `README.md` w katalogu głównym repozytorium, szczegółowo wyjaśniającej **co** dzieje się w aplikacji, **dlaczego** zastosowano dane rozwiązania inżynieryjne, **jak** działają poszczególne protokoły (Web Bluetooth FTMS, binarny enkoder `.FIT`, OPFS, PWA Gate, Web Worker Timer) oraz **gdzie** przechowywane i przetwarzane są dane.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> Poniższe decyzje dotyczące struktury i zakresu dokumentacji zostały potwierdzone w fazie pytań:

- **Potwierdzona decyzja 1 — Język dokumentacji**: Pełna dokumentacja sporządzona w języku polskim, z zachowaniem precyzyjnej terminologii technicznej (GATT, FTMS `0x1826`, OPFS, CRC-16, Coggan Z1–Z7, Friel Z1–Z5, BYOK Firebase).
- **Potwierdzona decyzja 2 — Organizacja dokumentacji**: Jeden kompleksowy, samowystarczalny plik `README.md` w katalogu głównym repozytorium (z wewnętrznym spisem treści i diagramami przepływu danych).
- **Potwierdzona decyzja 3 — Szczegółowe sekcje techniczne**: Główny nacisk na architekturę **PWA (Standalone Gate + Service Worker)**, **OPFS (Origin Private File System)**, **Web Bluetooth FTMS (sterowanie ERG + pasy HR)** oraz **binarny eksporter `.FIT` (Garmin FIT SDK spec)**, wraz z wyjaśnieniem modelu bezpieczeństwa Zero-Secret na publicznym GitHubie.

---

### 1. Overview & Core Concept

- **Co robi dokumentacja (`README.md`)**: Stanowi kompletną mapę drogową dla każdego użytkownika i programisty odwiedzającego repozytorium na GitHubie. Wyjaśnia cel aplikacji (sterowanie trenażerami Domyos / FTMS w trybie ERG i symulacji oporu, kreator treningów i testów Ramp FTP, zapis binarnych plików `.FIT` oraz chmurową synchronizację BYOK Firebase / Google Fit / Intervals.icu) oraz powody stojące za każdą decyzją architektoniczną.
- **Grupa docelowa**: Właściciel repozytorium, kolarze trenujący na trenażerach Smart (Domyos, Wahoo, Tacx, Elite) uruchamiający własną instancję z GitHub Pages na telefonie/tablecie, oraz kontrybutorzy open-source.
- **Kluczowa wartość**: Odpowiada w sposób uporządkowany na cztery pytania:
  1. **CO się dzieje?** — funkcjonalności 5 zakładek, 3-etapowej blokady startowej i silników w tle.
  2. **DLACZEGO tak?** — uzasadnienie wymogu instalacji PWA, braku kluczy w repozytorium (Zero-Secret Build), użycia Web Workera do zegara 1 Hz, OPFS zamiast zwykłego `localStorage` dla plików binarnych i natywnego kodowania `.FIT`.
  3. **JAK to działa?** — szczegółowy opis ramek GATT Bluetooth (`0x2AD2`, `0x2AD9`, `0x2A37`), algorytmu binarnego `.FIT` z sumą kontrolną CRC-16, kalkulatora fizjologicznego (NP, IF, TSS, eFTP) oraz synchronizacji z Firestore.
  4. **GDZIE są dane i logika?** — mapa warstw pamięci (OPFS na urządzeniu, `localStorage` dla konfiguracji BYOK, Firestore w prywatnej chmurze użytkownika) i architektura modułów.

---

### 2. User Experience & Visual Design (Struktura Dokumentu `README.md`)

- **Układ i czytelność dokumentacji na GitHubie**:
  - Nagłówek z odznakami technologicznymi (React 19, TypeScript, Web Bluetooth FTMS, PWA Offline-First, Garmin `.FIT` Binary, Firebase Firestore) i zwięzłym podsumowaniem projektu.
  - Klikalny spis treści umożliwiający natychmiastowe przejście do wybranej sekcji technicznej.
  - Wyraźny podział na sekcje **CO / DLACZEGO / JAK / GDZIE**, wzbogacony o diagramy ASCII prezentujące przepływ telemetrii 1 Hz, 3-etapową bramkę bezpieczeństwa oraz strukturę rekordu `.FIT`.
  - Przejrzyste tabele ze specyfikacją charakterystyk Bluetooth GATT (`UUID`, kierunek komunikacji, format bajtów, rola w pętli sterowania ERG) oraz stref mocy i tętna.
  - Sekcje ostrzeżeń i wskazówek technicznych w formacie GitHub Alerts (`> [!IMPORTANT]`, `> [!NOTE]`, `> [!TIP]`).

---

### 3. Key Product Decisions & Trade-Offs (Dokumentowane Decyzje Inżynieryjne)

- **Decyzja 1: Model "Zero-Secret Public Repo" + 3-etapowa bramka PWA & BYOK Firebase**:
  - *Co opisujemy*: Dlaczego skrypt budujący (`npm run build`) czyści konfigurację Firebase przed publikacją na GitHub Pages i dlaczego aplikacja wymaga najpierw instalacji PWA na urządzeniu mobilnym, a następnie wklejenia własnego obiektu JSON Firebase i logowania Google OAuth.
  - *Dlaczego*: Chroni prywatność danych treningowych i kluczy chmurowych właściciela na publicznym GitHubie oraz zapobiega automatycznemu czyszczeniu pamięci OPFS przez systemy iOS/Android (tryb Standalone PWA gwarantuje trwałość pamięci lokalnej).
- **Decyzja 2: Web Bluetooth FTMS (`0x1826`) z pętlą Watchdog ERG oraz Web Worker 1 Hz**:
  - *Co opisujemy*: Jak aplikacja komunikuje się bezpośrednio z trenażerem Domyos / FTMS (`Indoor Bike Data 0x2AD2` oraz `Fitness Machine Control Point 0x2AD9`, Opcode `0x05` Set Target Power) i pasem tętna (`0x180D` / `0x2A37`), oraz dlaczego odliczanie interwałów realizuje dedykowany Web Worker + Screen Wake Lock API.
  - *Dlaczego*: Przeglądarki mobilne dławią (`throttling`) zwykłe timery `setInterval` w głównym wątku UI i usypiają ekran; Web Worker utrzymuje precyzyjny takt 1000 ms (1 Hz), a Watchdog co kilka sekund ponawia komendę docelowych watów, aby trenażer Domyos nie wyłączył trybu ERG.
- **Decyzja 3: Dwuwarstwowy zapis danych (OPFS + Cloud Firestore) i natywny koder binarny `.FIT`**:
  - *Co opisujemy*: Jak w przeglądarce generowany jest pełnoprawny plik binarny `.FIT` (14-bajtowy nagłówek, wiadomości definicji i danych z offsetem czasu Garmin `1989-12-31T00:00:00Z`, 2-bajtowy CRC-16) i gdzie trafia po treningu (OPFS na urządzeniu + Base64 w Firestore + eksport do Strava / Garmin Connect / Intervals.icu / Google Fit).

---

### 4. Technical Architecture & Data Strategy *(Struktura Sekcji w `README.md`)*

Dokument `README.md` będzie zawierał poniższy schemat architektury systemu oraz szczegółowe omówienie każdego bloku:

```
┌────────────────────────────────────────────────────────────────────────────┐
│                   1. BRAMKA BEZPIECZEŃSTWA (PWA & AUTH GATE)               │
│  [Etap 1: Instalacja Standalone PWA] ──► [Etap 2: Wklejenie JSON Firebase] │
│  ──► [Etap 3: Logowanie Google OAuth (Tworzenie/Odczyt Profilu Konta)]     │
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

#### Szczegółowy plan rozdziałów w `README.md`:
1. **Wprowadzenie (CO to jest?)** — cel projektu, obsługiwany sprzęt (Domyos Bike 500/900, Challenge Bike, dowolny trenażer FTMS + pasy HR BLE) oraz przegląd 5 głównych widoków aplikacji.
2. **Filozofia Bezpieczeństwa i Architektura "Zero-Secret" (DLACZEGO tak działa?)** — wyjaśnienie dlaczego publiczne repozytorium nie zawiera żadnych profili ani kluczy (`scripts/build-gh-pages.mjs`), jak działa 3-etapowa blokada startowa (Standalone PWA -> BYOK Firebase JSON -> Google OAuth) i dlaczego konto Google tworzy jeden odizolowany profil użytkownika.
3. **Protokół Web Bluetooth FTMS i Pętla Sterowania ERG (JAK działa łączność z rowerem?)** — dokładny opis charakterystyk `0x2AD2` (parsowanie flag bitowych prędkości, kadencji, mocy), `0x2AD9` (Request Control `0x00`, Start/Resume `0x07`, Set Target Power `0x05`, Set Indoor Bike Simulation `0x11`), odczytu tętna `0x2A37` oraz mechanizmu ERG Watchdog.
4. **Silnik Treningowy, Zegar Web Worker i Fizjologia (JAK liczone są metryki?)** — format plików treningowych `.TXT` (`MINUTES;WATTS` oraz rampy `MINUTES;START_WATTS;END_WATTS`), protokoły Ramp Test FTP (Standard 20W/min, Light 10W/min, Pro 25W/min), wzory na NP, IF, TSS, eFTP oraz automatyczną aktualizację stref Z1–Z7 i Z1–Z5.
5. **Binarny Eksporter `.FIT` (JAK powstaje plik dla Garmin / Strava / Intervals.icu?)** — anatomia pliku binarnego `.FIT` generowanego bezpośrednio w przeglądarce: nagłówek 14 bajtów, konwersja znaczników czasu do epoki Garmina (`631065600` s), wiadomości `file_id`, `session`, `lap`, `record` (1 Hz) i `event`, oraz algorytm sumy kontrolnej CRC-16.
6. **Przechowywanie Danych: OPFS, `localStorage` i Firebase Firestore (GDZIE znajdują się dane?)** — porównanie ról: Origin Private File System (natywny system plików przeglądarki dla plików `.fit` i `.txt`), `localStorage` (konfiguracja BYOK Firebase i cache profilu), oraz kolekcje Firestore (`profiles`, `customWorkouts`, `workoutLogs` z binarnym payloadem `.FIT` w Base64).
7. **Instrukcja Uruchomienia, Wdrożenia na GitHub Pages i Konfiguracji Własnego Firebase** — komendy developerskie, automatyczny pipeline budowania do katalogu `docs/` na potrzeby GitHub Pages oraz kroki utworzenia projektu Firebase i wklejenia JSON-a po zainstalowaniu PWA na telefonie/tablecie.
