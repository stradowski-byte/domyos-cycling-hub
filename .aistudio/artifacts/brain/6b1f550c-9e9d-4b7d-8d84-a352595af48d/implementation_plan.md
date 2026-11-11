# Poprawki Po-Testowe: Koło 700c (Prędkość i Dystans), Auto-Zakończenie, Alert Kadencji, Usuwanie Jazd, Synchronizacja Intervals.icu przez Firebase, Google Fit 403 i Aktualizator PWA

Plan obejmuje 7 usprawnień po pierwszym pełnym teście treningowym na rowerze: realistyczne wyliczanie prędkości i dystansu z obwodu koła szosowego 700c (`2.105 m`) i czasu jazdy, automatyczne wywołanie okna zakończenia treningu po ostatnim interwale, czerwony alert zbyt niskiej kadencji, funkcję usuwania wykonanych treningów (z aplikacji, OPFS i Firebase), trwały zapis statusu wysyłki do Intervals.icu/Google Fit w kolekcji `/completedWorkouts` w Firebase (eliminujący duplikaty po wyczyszczeniu cache), obsługę błędu `403` Google Fitness API oraz przycisk ręcznej aktualizacji aplikacji PWA z GitHub Pages.

## User Review & Critical Decisions

> [!IMPORTANT]
> Poniższe decyzje zostały potwierdzone i zostaną wdrożone w dokładnie takiej postaci:

- **Potwierdzona Decyzja 1 (Prędkość `km/h` i Dystans `km` z koła 700c i czasu jazdy)**: Prędkość wyliczamy wyłącznie z liczby obrotów na sekundę ($\text{RPS} = \text{RPM} / 60$) pomnożonej przez obwód koła szosowego 700c / 28 cali ($2.105\text{ m}$), a dystans wynika z pomnożenia prędkości przez rzeczywisty czas jazdy ($\Delta d = v \times \Delta t$, gdzie czas się skraca i zostają same kilometry/metry), całkowicie ignorując zawyżony licznik z konsoli roweru oraz eliminując błąd wielokrotnego naliczania dystansu przy pakietach BLE przychodzących kilka razy na sekundę.
- **Potwierdzona Decyzja 2 (Koniec ostatniego interwału w Kokpicie)**: Gdy licznik ostatniego odcinka treningu dojdzie do `00:00`, aplikacja automatycznie otwiera na ekranie Kokpitu okno potwierdzenia **„Zakończyć i zapisać trening .FIT?”**.
- **Potwierdzona Decyzja 3 (Błąd 403 Google Fitness API)**: Aplikacja rozpoznaje błąd `403 (Fitness API has not been used in project ...)` i wyświetla bezpośredni przycisk prowadzący do włączenia **Fitness API** w Google Cloud Console dla projektu użytkownika (`782546220198`) oraz udostępnia wygodny przełącznik wyłączenia integracji z Google Fit.

---

## 1. Overview & Core Concept

- **Co zmienia ta aktualizacja**:
  1. **Moduł Koła Szosowego 700c (`2.105 m`)**: Zamiast ufać zawyżonemu licznikowi z konsoli roweru lub dodawać dystans przy każdej ramce Bluetooth (co dawało 74 km w 1h), aplikacja liczy prędkość z relacji obrotów na sekundę do obwodu koła 28" / 700c ($2.105\text{ m}$) i całkuje drogę ściśle po czasie zegara treningowego ($d = v \times t$).
  2. **Automatyczne okno zakończenia po ostatnim interwale**: Po ukończeniu ostatniego bloku na ekranie Kokpitu od razu pojawia się modal potwierdzenia zakończenia i zapisu pliku `.FIT`.
  3. **Czerwony alert zbyt niskiej kadencji**: Spadek kadencji o więcej niż `5 RPM` poniżej celu zmienia kolor paska, obramowania i komunikatu w kafelku Kadencji na wyraźny czerwony (`ZA NISKO! +X RPM`).
  4. **Usuwanie wykonanych treningów**: W zakładce **3. Postępy i FIT** każdy zapisany trening otrzymuje przycisk usunięcia (z potwierdzeniem), który kasuje go z listy, z pamięci `OPFS` na telefonie oraz z kolekcji `/completedWorkouts` w Firebase.
  5. **Firebase jako jedyne źródło prawdy o synchronizacji Intervals.icu i Google Fit**: Informacja `syncedToIntervals: true` (`intervalsActivityId`) oraz `syncedToGoogleFit: true` jest natychmiast zapisywana w dokumencie `/completedWorkouts/{id}` w Firebase Cloud Firestore. Auto-Sync czeka na załadowanie danych z Firebase i nigdy nie wysyła ponownie treningu po wyczyszczeniu cache przeglądarki.
  6. **Przycisk „Aktualizuj Aplikację” (PWA Update)**: Jedno kliknięcie na górnym pasku lub w zakładce **5. Chmura Firebase** wymusza pobranie nowego Service Workera z GitHub Pages, czyści pamięć podręczną zasobów i przeładowuje aplikację do najnowszej wersji.

---

## 2. User Experience & Visual Design

- **Kluczowe przepływy użytkownika**:
  - **Kokpit na Żywo (`2. Kokpit`)**:
    - Podczas jazdy kafelek **KADENCJA** wyświetla zielony status `W CELU` (gdy odchylenie mieści się w $\pm 5\text{ RPM}$), błękitny status przy wyższej kadencji oraz **czerwony alarm (`text-rose-400`, czerwony pasek `#F43F5E`, czerwona ramka kafelka) z napisem `ZA NISKO! (+X RPM)`**, gdy kadencja spadnie poniżej celu.
    - W momencie gdy czas ostatniego interwału osiąga `00:00`, odtwarzany jest sygnał dźwiękowy i automatycznie otwiera się okno dialogowe **„Trening ukończony! Zakończyć i zapisać sesję do pliku .FIT?”**.
  - **Lista Zakończonych Jazd (`3. Postępy i FIT`)**:
    - Na karcie każdej jazdy widoczny jest rzeczywisty dystans w `km` oraz średnia prędkość w `km/h` wyliczona z koła 700c.
    - Obok przycisków eksportu znajduje się przycisk **„Usuń”** (ikona kosza z potwierdzeniem usunięcia z urządzenia i chmury Firebase).
    - Jeśli Google Fit zwróci błąd `403`, wyświetlana jest czytelna karta pomocnicza z bezpośrednim linkiem **„Włącz Google Fitness API w projekcie 782546220198”** oraz przyciskiem **„Wyłącz Google Fit w moim profilu”**.
  - **Aktualizacja PWA z GitHub Pages**:
    - Na górnym pasku nawigacji oraz w zakładce **5. Chmura Firebase** dostępny jest przycisk **„Aktualizuj Apkę”** (ikona odświeżania), który sprawdza i instaluje najnowszą wersję z GitHub Pages bez utraty połączenia z Firebase.

---

## 3. Key Product Decisions & Trade-Offs

- **Decyzja 1: Fizyka prędkości i drogi z obwodu koła 700c (`2.105 m`) i czasu ($\Delta t = 1\text{ s}$)**
  - *Wybrane podejście*:
    - Obwód standardowego koła szosowego 700c (28 cali, opona 700×25c): $C = 2.105\text{ m}$.
    - Liczba obrotów na sekundę: $\text{RPS} = \frac{\text{RPM}}{60}$.
    - Prędkość w $\text{m/s}$: $v_{\text{m/s}} = \frac{\text{RPM}}{60} \times 2.105$.
    - Prędkość w $\text{km/h}$: $v_{\text{km/h}} = v_{\text{m/s}} \times 3.6 = \text{RPM} \times 0.1263$.
    - Przyrost drogi w każdej sekundzie jazdy ($\Delta t_{\text{h}} = \frac{1}{3600}\text{ h}$):
      $$\Delta d_{\text{km}} = v_{\text{km/h}} \times \frac{\Delta t_{\text{s}}}{3600} \quad\Longleftrightarrow\quad \Delta d_{\text{m}} = v_{\text{m/s}} \times \Delta t_{\text{s}}$$
  - *Dlaczego*: Wcześniej funkcja `ingestTelemetry` dodawała przyrost drogi przy każdym pakiecie BLE (`0x2AD2`), które rower wysyła 3–4 razy na sekundę, oraz pobierała surowy licznik z konsoli roweru, co sztucznie mnożyło dystans do 74 km/h. Zliczanie drogi ściśle z 1-sekundowego zegara treningowego ($\Delta t$) i obwodu koła 700c daje stuprocentową zgodność matematyczną ($d = v \times t$).

- **Decyzja 2: Firebase Cloud Firestore jako jedyne źródło prawdy o synchronizacji zewnętrznej**
  - *Wybrane podejście*: Po każdym udanym wysłaniu pliku `.FIT` do Intervals.icu lub sesji do Google Fit aplikacja natychmiast wywołuje `updateCompletedActivitySyncStatusInFirestore()`, zapisując `syncedToIntervals: true`, `intervalsActivityId` oraz `syncedToGoogleFit: true` w dokumencie `/completedWorkouts/{id}` w Firebase (oraz logując zdarzenie w `/securityAuditLogs`).
  - *Dlaczego*: Po wyczyszczeniu danych przeglądarki lub otwarciu aplikacji na nowo `localStorage` jest pusty, ale Firebase zwraca dokumenty z `syncedToIntervals: true`. Zablokowanie pętli Auto-Sync do momentu odebrania pierwszego snapshotu z Firestore (`firestoreActivitiesLoaded = true`) oraz rejestr wysłanych ID (`inFlightIntervalsSyncIds`) całkowicie eliminuje wielokrotne wysyłanie tego samego treningu do Intervals.icu.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────────┐
│                   1Hz WORKOUT TIMER & 700c WHEEL MODULE                    │
│  • RPM -> RPS = RPM / 60 -> Speed (m/s) = RPS * 2.105m -> km/h = m/s * 3.6 │
│  • Distance (m) += Speed (m/s) * deltaSec (strictly 1x per elapsed second) │
│  • When last block reaches 00:00 -> auto-open Finish Workout Modal         │
└─────────────────────────────────────┬──────────────────────────────────────┘
                                      │
                                      ▼
┌────────────────────────────────────────────────────────────────────────────┐
│             FIREBASE CLOUD FIRESTORE (/completedWorkouts/{id})             │
│  • Stores: syncedToIntervals, intervalsActivityId, syncedToGoogleFit       │
│  • Auto-Sync waits for initial Firestore snapshot before checking queue    │
│  • Delete Completed Workout removes from State + OPFS + Firestore          │
└────────────────────────────────────────────────────────────────────────────┘
```

### Mapowanie interakcji i stanu
1. **Automatyczne okno zakończenia po ostatnim interwale**:
   - W `App.tsx` (pętla 1Hz) gdy `nextSec >= block.durationSec` na ostatnim odcinku (`blkIdx + 1 >= workout.blocks.length`), ustawiana jest flaga `autoPromptFinishRide = true`, która automatycznie otwiera modal potwierdzenia zakończenia treningu w `LiveCockpitView`.
2. **Usuwanie wykonanych treningów**:
   - Nowa funkcja `deleteCompletedActivityEverywhere(activity)` w `firebaseSyncService.ts` usuwa dokument `completedWorkouts/{activity.id}` z Firestore, kasuje pliki `.fit` oraz `.json` z katalogu `/User_Data/{profileId}` w `OPFS` i aktualizuje `profile_state.json`.
3. **Aktualizator PWA (`forceUpdatePwaFromGitHub`)**:
   - Wywołuje `navigator.serviceWorker.getRegistrations()`, dla każdej rejestracji uruchamia `reg.update()` i `reg.waiting?.postMessage({ type: 'SKIP_WAITING' })`, czyści pamięci podręczne `caches.keys()` i przeładowuje okno z najnowszym buildem z GitHub Pages.
