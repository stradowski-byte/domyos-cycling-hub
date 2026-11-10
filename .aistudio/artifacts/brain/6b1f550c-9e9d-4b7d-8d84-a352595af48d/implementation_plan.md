# Plan Implementacji: Wieloźródłowy Odczyt Tętna (HR) + Skaner Ramek BLE na Żywo (HEX Sniffer) w Kokpicie

## 1. Cel i Diagnoza Problemu
1. **Usunięcie zamrożonego `120 BPM` po przejściu z Symulatora na Bluetooth**:
   - W obecnej wersji `startSimulator()` ustawia `heartRateBpm = 118..120`, a `connectDomyosBle()` zatrzymuje timer symulatora, lecz nie zeruje `heartRateBpm`. Gdy rower nie zwraca dodatniego HR w standardowym offsecie, wartość `120 BPM` wisi na ekranie przez cały trening.
   - Rozwiązanie: natychmiastowe zerowanie `heartRateBpm: 0` przy zatrzymaniu symulatora i starcie połączenia BLE oraz wygaszanie odczytu HR (`0 BPM`), jeśli przez `> 8 sekund` nie nadeszła żadna próbka tętna.
2. **Dwa niezależne źródła tętna (Rower FTMS + Bezpośredni Pas Tętna BLE `0x180D`)**:
   - **Źródło A (Przez konsolę roweru Domyos)**:
     - Ulepszony parser `parseFtmsIndoorBikeData (0x2AD2)` obsługujący zarówno standardowy układ Bluetooth SIG (Bit 9 `0x0200`), jak i przesunięcia offsetu w firmware Domyos/ChangYow (1-bajtowy vs 2-bajtowy opór, dzielone ramki `More Data = 1` oraz konfigurowalny offset bajtu HR).
     - Automatyczne nasłuchiwanie usługi `0x180D` (`Heart Rate Measurement 0x2A37`) oraz dodatkowych charakterystyk powiadomień bezpośrednio na połączeniu GATT roweru.
   - **Źródło B (Bezpośrednie połączenie Pasa Tętna BLE `0x180D` z telefonem)**:
     - Nowy przycisk **„+ Pas HR BLE”** w Kokpicie umożliwiający sparowanie dowolnego pasa tętna Bluetooth (Polar, Garmin, Decathlon, Coospo, Magene) bezpośrednio z telefonem równolegle z rowerem Domyos.
3. **Wbudowany w Kokpit „Skaner i Dekoder Ramek BLE na Żywo (HEX Sniffer)”**:
   - Pozwala podejrzeć surowe bajty wysyłane przez rower w czasie rzeczywistym, ręcznie przypiąć dowolny bajt ramki jako źródło HR jednym dotknięciem oraz **skopiować zrzut ramek HEX do schowka lub zapisać go w Firebase (`/securityAuditLogs`)**, aby w razie niestandardowego protokołu od razu zobaczyć dokładną strukturę bajtów.

---

## 2. Szczegółowe Zmiany w Kodzie

### A. Rozbudowa `src/types/cycling.ts` i `src/services/ftmsBluetooth.ts`
- Dodanie do `LiveBikeTelemetry` pól:
  - `externalHrConnected: boolean`
  - `externalHrDeviceName: string`
  - `hrSource: 'none' | 'bike_ftms' | 'bike_hr_service' | 'external_strap' | 'custom_byte_offset' | 'simulator'`
  - `customHrByteOffset: number | null` (opcjonalny indeks bajtu w ramce `0x2AD2` zapisywany w `localStorage`)
- Dodanie struktury diagnostycznej `BleRawPacketSample`:
  - `timestampIso: string`
  - `characteristicUuid: string` (`0x2AD2`, `0x2A37`, itp.)
  - `flagsHex: string`
  - `activeFlagNames: string[]`
  - `rawBytesHex: string` (np. `64 02 A0 00 4B 00 ...`)
  - `uint8Values: number[]`
  - `parsedSummary: string`
- W `FtmsBikeController`:
  - **Reset telemetrii przy połączeniu BLE**: zerowanie `heartRateBpm: 0` i `hrSource: 'none'`.
  - **Automatyczna enumeracja GATT roweru (`discoveredGattMap`)**: po połączeniu z rowerem pobranie listy dostępnych usług (`getPrimaryServices()`) i charakterystyk, automatyczne podpięcie `0x180D` → `0x2A37` (jeśli rower wystawia tętno na standardowej usłudze HR) oraz zapisywanie ostatnich 35 surowych ramek w buforze Sniffera.
  - **Adaptacyjny dekoder `parseFtmsIndoorBikeData(data, customHrByteOffset)`**:
    - Jeśli użytkownik wybrał ręczny `customHrByteOffset`, pobiera `data.getUint8(customHrByteOffset)`.
    - Jeśli flaga `Bit 9 (0x0200)` jest aktywna, a wyliczony standardowy `offset` wykracza poza `data.byteLength` lub wskazuje `0`, inteligentny fallback sprawdza również przesunięcie o `-1` / `-2` bajty (przypadek 1-bajtowego pola oporu/energii w konsolach Domyos) oraz ostatni bajt przed ewentualnym `Elapsed Time`.
  - **Metoda `connectExternalHeartRateStrap()`**:
    - Wywołuje `navigator.bluetooth.requestDevice({ filters: [{ services: [0x180d] }] })`, subskrybuje `0x2A37` (`Heart Rate Measurement` — obsługując zarówno format 8-bitowy `flags & 0x01 === 0`, jak i 16-bitowy `flags & 0x01 !== 0`), automatycznie wznawia połączenie po zerwaniu i nadaje zewnętrznemu pasowi najwyższy priorytet odczytu HR.

### B. Nowy Modal / Panel Diagnostyczny `src/components/BlePacketSnifferModal.tsx`
- Otwierany przyciskiem **„Sniffer BLE / HR”** bezpośrednio z górnego paska w **Kokpicie (`2. Kokpit na Żywo`)**:
  1. **Status Źródła Tętna i Szybkie Parowanie Pasa HR (`0x180D`)**:
     - Pokazuje aktualne źródło tętna (`Pas zewnętrzny BLE`, `Konsola roweru FTMS 0x2AD2`, `Usługa 0x180D roweru` lub `Ręczny offset bajtu [i]`).
     - Przycisk **„Połącz Pas Tętna BLE bezpośrednio z telefonem (0x180D)”**.
  2. **Interaktywny Inspektor Bajtów Ramki `0x2AD2` na Żywo**:
     - Wyświetla ostatnią odebraną ramkę w rozbiciu na pojedyncze kafelki bajtów `Bajt [0] .. Bajt [N]` z wartością `HEX`, `uint8` (0–255) oraz `uint16 LE`.
     - Kliknięcie dowolnego kafelka `Bajt [i]` pozwala ustawić go jako **„Używaj Bajtu [i] jako HR”** (lub przywrócić tryb automatyczny).
  3. **Lista Wykrytych Usług GATT Roweru + Historia Ostatnich 30 Ramek HEX**:
     - Przycisk **„Kopiuj Zrzut Ramek HEX do Schowka”** (gotowy blok diagnostyczny do wklejenia na czacie).
     - Przycisk **„Zapisz Zrzut Ramek BLE w Firebase (`/securityAuditLogs`)”**, który trwale zapisuje próbki pakietów z roweru w Twojej bazie Firestore.

### C. Integracja w `src/components/LiveCockpitView.tsx` oraz `src/App.tsx`
- Dodanie w Kokpicie przycisku **„+ Pas HR BLE”** oraz przycisku **„Sniffer BLE”** (otwierającego `BlePacketSnifferModal`).
- Wyświetlenie na kafelku Tętna (HR) czytelnej odznaki źródła sygnału (np. `PAS BLE`, `FTMS`, `BAJT #X` lub `BRAK SYGNAŁU HR`, gdy wartość wynosi `0 BPM`).

---

## 3. Weryfikacja
1. Sprawdzenie kompilacji TypeScript (`lint_applet`) i pełnego buildu produkcyjnego (`compile_applet`).
2. Weryfikacja, że po wyłączeniu symulatora HR natychmiast spada do `0` (`-- BPM`) zamiast wisieć na `120 BPM`, a parser obsługuje zarówno ramki FTMS `0x2AD2`, jak i bezpośrednie pakiety `0x2A37`.
