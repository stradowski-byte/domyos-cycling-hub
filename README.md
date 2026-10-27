# Domyos Cycling Hub (Clean Production Release v1.8.0)

Czysty kod produkcyjny aplikacji **Domyos Cycling Hub (PWA)** do sterowania rowerem **Domyos Challenge Bike (FTMS Bluetooth)**.

## Polityka Czystego Kodu (Zero-PII)
To repozytorium zawiera **wyłącznie czysty silnik aplikacji**.
Żadne dane osobowe, identyfikatory `Intervals.icu Athlete ID`, klucze API ani pliki `.FIT` nie są przechowywane w tym repozytorium — wszystkie dane profilowe żyją wyłącznie lokalnie na urządzeniu (`OPFS`) oraz w prywatnym folderze `/User_Data` na Google Dysku użytkownika.

## Instalacja PWA na telefonie (Android Chrome)
1. Otwórz adres GitHub Pages tego repozytorium: `https://stradowski-byte.github.io/domyos-cycling-hub/`
2. Kliknij **Zainstaluj Apkę** (lub w menu Chrome: *Zainstaluj aplikację / Dodaj do ekranu głównego*).
3. Aplikacja działa w 100% offline (zapis treningów `.FIT` w pamięci wewnętrznej `OPFS` z kolejką `Pending Sync` po włączeniu WiFi) i automatycznie pobiera nowe wydania z tego repozytorium.
