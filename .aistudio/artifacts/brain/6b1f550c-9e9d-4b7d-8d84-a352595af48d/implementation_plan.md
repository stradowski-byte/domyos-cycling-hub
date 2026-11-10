# Domyos Cycling Hub — Optymalizacja Backendu Firebase, Wielookrążeniowe Pliki .FIT, BLE Auto-Reconnect i Zaawansowana Telemetria Kokpitu

Plan obejmuje rozbudowę warstwy synchronizacji chmurowej Firebase (paczki atomowe `writeBatch` i kolejka Offline-First), przebudowę kodera binarnego `.FIT` tak, aby każdy interwał treningowy tworzył osobne okrążenie (`Lap`), automatyczne wznawianie zerwanego połączenia Bluetooth FTMS w trakcie jazdy oraz wzbogacenie Kokpitu o 10-sekundowy alert przed kolejnym interwałem, celownik kadencji RPM i wskaźnik dryfu tętna (`Aerobic Decoupling Pa:Hr %`) na żywo.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> Poniższe decyzje architektoniczne i funkcjonalne zostały zatwierdzone w fazie pytań doprecyzowujących:

- **Potwierdzona Decyzja 1 (Backend Firebase Spark & Offline-First)**: Zastąpienie pętli pojedynczych zapisów atomowymi paczkami `writeBatch` oraz dodanie trwałej kolejki synchronizacji Offline-First, która buforuje zmiany dokonane bez internetu i wysyła je automatycznie po odzyskaniu sieci.
- **Potwierdzona Decyzja 2 (Binarny Koder `.FIT` z Okrążeniami Interwałowymi)**: Każdy blok/interwał treningowy (`blockIndex`) jest zapisywany w pliku `.FIT` jako osobny komunikat `Lap (Global Mesg 19)` z własnym czasem, dystansem, średnią/maksymalną mocą, tętnem i kadencją, dzięki czemu Strava, Garmin Connect i Intervals.icu prezentują pełną tabelę interwałów.
- **Potwierdzona Decyzja 3 (Bluetooth FTMS Auto-Reconnect)**: W przypadku przypadkowego zerwania sygnału GATT podczas jazdy kontroler automatycznie podejmuje do 5 prób ponownego połączenia (Exponential Backoff), przywracając strumień telemetrii `0x2AD2`, przejęcie kontroli `0x2AD9` oraz ostatnie obciążenie docelowe ERG bez przerywania treningu.
- **Potwierdzona Decyzja 4 (Nowe Funkcje Treningowe w Kokpicie)**:
  1. **Alert 10s przed kolejnym interwałem** z odliczaniem, nazwą kolejnego bloku, docelowymi watami (oraz różnicą `ΔW`) i sugerowaną kadencją.
  2. **Celownik Kadencji RPM** na kafelku kadencji porównujący aktualne obroty z celem bieżącego bloku.
  3. **Wskaźnik Dryfu Tętna (`Aerobic Decoupling Pa:Hr %`) na żywo**, porównujący stosunek Mocy do Tętna (`W/BPM`) między pierwszą a drugą połową trwającego treningu.

---

## 1. Overview & Core Concept

- **Co zmienia to wdrożenie**:
  - **Odporność i oszczędność chmury**: Aplikacja zużywa wielokrotnie mniej dziennego limitu zapisów darmowego planu Firebase Spark i gwarantuje brak utraty danych przy zaniku Wi-Fi/LTE w pomieszczeniu treningowym.
  - **Profesjonalna analityka `.FIT`**: Wyeksportowane pliki `.FIT` zawierają pełną strukturę okrążeń (`Laps`) odpowiadającą kolejnym blokom treningu (Rozgrzewka, Interwał 1, Odpoczynek, Interwał 2..., Schłodzenie).
  - **Niezawodność sprzętowa BLE**: Chwilowe uśpienie lub zakłócenie sygnału Bluetooth z rowerem Domyos lub miernikiem mocy jest automatycznie naprawiane w tle.
  - **Świadomość fizjologiczna podczas jazdy**: Kolarz z wyprzedzeniem 10 sekund widzi nadchodzący skok mocy, utrzymuje optymalną kadencję i monitoruje dryf tętna (`Pa:Hr %`) świadczący o zmęczeniu tlenowym lub odwodnieniu.

---

## 2. User Experience & Visual Design

### Kluczowe Scieżki Użytkownika (User Flows)

1. **Alert 10s przed zmianą interwału w Kokpicie**:
   - Gdy do końca bieżącego bloku pozostaje `≤ 10 sekund`, nad wykresem profilu pojawia się wyraźny, kontrastowy pasek ostrzegawczy: **„Za X s: [Nazwa kolejnego bloku] · [Docelowe Waty] W ([+/- ΔW]) · Cel [RPM] RPM”**.
2. **Celownik Kadencji RPM i Dryf Tętna (`Pa:Hr %`) na żywo**:
   - Kafelek **Kadencja** wyświetla docelowy zakres obrotów dla aktualnego bloku (np. `Cel: 90 RPM`) oraz wskaźnik odchylenia (`OK / Za wolno / Za szybko`).
   - Kafelek **Tętno / Fizjologia** wyświetla na żywo wskaźnik **Dryf `Pa:Hr`** (np. `+2.4% · Stabilny` w kolorze szmaragdowym, `+5.8% · Nawodnij się` w kolorze bursztynowym, `> 7.5% · Wysoki dryf` w kolorze koralowym).
3. **Automatyczne Wznawianie Połączenia BLE (`Auto-Reconnect`)**:
   - Jeśli połączenie Bluetooth z rowerem zostanie przerwane w trakcie jazdy, w nagłówku kokpitu pojawia się nieinwazyjny status **„Wznawianie połączenia BLE (Próba X/5)...”**, a po odzyskaniu połączenia kontroler automatycznie przywraca zadane waty ERG.
4. **Kolejka Synchronizacji Offline-First**:
   - Jeśli użytkownik kończy jazdę lub edytuje trening bez dostępu do internetu, zadanie trafia do trwałej kolejki synchronizacji i zostaje automatycznie wysłane paczką `writeBatch`, gdy przeglądarka wykryje powrót połączenia (`online`).

### Tożsamość Wizualna i Ergonomia Mobilna
- **Hierarchia typograficzna i dyscyplina tabularna**: Wszystkie liczniki czasu, mocy, kadencji i dryfu `Pa:Hr %` wykorzystują cyfry o stałej szerokości (`font-mono tabular-nums`), zapobiegając drganiu interfejsu przy odświeżaniu 1 Hz.
- **Ergonomia dotykowa**: Wszystkie interaktywne kontrolki zachowują minimalne pole dotykowe `44 × 44 px`, a wskaźniki stanu łączą kolor z czytelną etykietą tekstową.

---

## 3. Key Product Decisions & Trade-Offs

- **Decyzja 1: Atomowe zapisy `writeBatch` + Kolejka Offline-First zamiast pojedynczych wywołań `setDoc`**
  - *Wybrane podejście*: Grupowanie inicjalizacji kolekcji, biblioteki treningów i pełnej synchronizacji w paczki `writeBatch` (do 450 operacji w jednej transakcji sieciowej) oraz kolejkowanie nieudanych zapisów w pamięci lokalnej z automatycznym ponawianiem po zdarzeniu `window.addEventListener('online')`.
  - *Dlaczego*: Pojedyncza transakcja paczkowa jest szybsza sieciowo, nie blokuje wątku UI i chroni dzienny limit zapisów Firebase Spark.
- **Decyzja 2: Generowanie wielookrążeniowych komunikatów `Lap (Global Mesg 19)` w binarnym pliku `.FIT`**
  - *Wybrane podejście*: Grupowanie próbek 1 Hz według zmian `blockIndex` (lub równoległe wyliczenie statystyk każdego ukończonego interwału), wyemitowanie komunikatu `Lap` dla każdego bloku z czasami `start_time`, `total_elapsed_time`, `avg_power`, `max_power`, `avg_heart_rate`, `max_heart_rate`, `avg_cadence` oraz ustawienie pola `num_laps` w komunikacie `Session (Global Mesg 18)`.
  - *Dlaczego*: Zewnętrzne platformy analityczne (Intervals.icu, Strava, Garmin) opierają analizę interwałów na rekordach `Lap` wewnątrz pliku `.FIT`.
- **Decyzja 3: Exponential Backoff BLE Auto-Reconnect w `FtmsBikeController`**
  - *Wybrane podejście*: Rozróżnienie celowego rozłączenia przez użytkownika (`manualDisconnect = true`) od przypadkowego zerwania sygnału GATT (`manualDisconnect = false`). W przypadku utraty sygnału kontroler automatycznie ponawia `device.gatt.connect()`, rejestruje notyfikacje `0x2AD2` i `0x2AD9`, wysyła `Request Control (0x00)` oraz przywraca ostatni cel `targetPowerWatts`.
  - *Dlaczego*: Zapobiega utracie ciągłości treningu ERG przy chwilowych zakłóceniach radiowych 2.4 GHz.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architektura i Przepływ Danych

```
┌────────────────────────────────────────────────────────────────────────────┐
│                   WARSTWA SPRZĘTOWA I TELEMETRII 1 Hz                      │
│  ┌──────────────────────────────────┐  ┌────────────────────────────────┐  │
│  │ FtmsBikeController (Web BLE)     │  │ Kalkulator Fizjologii Na Żywo  │  │
│  │ • Auto-Reconnect (5 prób GATT)   │  │ • Live Pa:Hr Decoupling (%)    │  │
│  │ • Przywracanie Control Point     │  │ • Alert 10s przed interwałem   │  │
│  │ • Ponowne wysłanie Target Watts  │  │ • Celownik kadencji RPM        │  │
│  └───────────────┬──────────────────┘  └───────────────┬────────────────┘  │
└──────────────────┼─────────────────────────────────────┼───────────────────┘
                   ▼                                     ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                 KOKPIT TRENINGOWY (LiveCockpitView)                        │
│  • Baner odliczania 10s: Kolejny blok, docelowe W, ΔW i docelowe RPM       │
│  • Kafelek Kadencji z paskiem celności RPM + Kafelek HR z Dryfem Pa:Hr %   │
│  • Pasek stanu BLE Auto-Reconnect podczas wznawiania połączenia GATT       │
└──────────────────────────────────┬─────────────────────────────────────────┘
                                   ▼
┌────────────────────────────────────────────────────────────────────────────┐
│         SILNIK PLIKÓW .FIT I SYNCHRONIZACJI CHMUROWEJ (Offline-First)      │
│  ┌──────────────────────────────────┐  ┌────────────────────────────────┐  │
│  │ Multi-Lap Binary FIT Encoder     │  │ Firebase Batch & Sync Queue    │  │
│  │ • Grupowanie rekordów po bloku   │  │ • Atomowy writeBatch Firestore │  │
│  │ • Osobny Lap (Mesg 19) / interwał│  │ • Kolejka Offline-First JSON   │  │
│  │ • Session (Mesg 18) z num_laps   │  │ • Auto-Flush przy 'online'     │  │
│  └──────────────────────────────────┘  └────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

### Mapowanie Komponentów i Stanu
- **Kontroler Bluetooth (`FtmsBikeController`)**:
  - Dodaje pola stanu `reconnecting: boolean` oraz `reconnectAttempt: number` do `LiveBikeTelemetry`.
  - Przy zdarzeniu `gattserverdisconnected` (gdy nie wywołano ręcznego rozłączenia) uruchamia asynchroniczny cykl ponownego łączenia (`1.5s`, `3s`, `5s`, `8s`, `12s`) i po sukcesie przywraca `applyTargetLoad(..., forceSend = true)`.
- **Koder Binarny `.FIT` (`encodeActivityToFitBytes`)**:
  - Wyodrębnia segmenty okrążeń (`LapSegment`) na podstawie zmian `blockIndex` w tablicy `activity.records`.
  - Zapisuje osobny rekord `Lap (Local Mesg 2, Global Mesg 19)` dla każdego interwału oraz aktualizuje pole `num_laps (Field 25, uint16)` w komunikacie `Session (Local Mesg 3, Global Mesg 18)`.
- **Serwis Synchronizacji (`firebaseSyncService`)**:
  - Wykorzystuje `writeBatch(db)` w `ensureFirestoreCollectionsInitialized` oraz `syncAllStateToFirestore`.
  - Zarządza kolejką oczekujących operacji (`pendingSyncQueue`) w pamięci lokalnej, opróżnianą automatycznie po przywróceniu połączenia sieciowego lub zalogowaniu.
- **Kokpit Treningowy (`LiveCockpitView`)**:
  - Oblicza na żywo `liveAerobicDecouplingPct` (porównanie `EF = AvgPower / AvgHR` z pierwszej i drugiej połowy dotychczasowego czasu aktywnej jazdy).
  - Wyświetla dynamiczny baner `Alert 10s` przed zmianą bloku oraz wskaźnik docelowej kadencji RPM na kafelku kadencji.
