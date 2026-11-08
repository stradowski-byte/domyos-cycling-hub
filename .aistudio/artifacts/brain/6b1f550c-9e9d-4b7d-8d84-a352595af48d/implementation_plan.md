# Plan Wdrożenia: Publiczny GitHub (Zero Danych Prywatnych), Blokada Instalacji PWA i Profile Wyłącznie z Kont Google

## 1. Cel Architektoniczny
Przekształcenie **Domyos Cycling Hub (ERG & FIT Studio)** w aplikację w 100% bezpieczną do hostowania na **publicznym repozytorium GitHub** oraz **GitHub Pages**, w której:
1. **Zero danych prywatnych na GitHubie**: W kodzie źródłowym ani w zbudowanej paczce produkcyjnej (`docs/` / `dist/`) nie znajdują się żadne klucze API, identyfikatory baz danych Firebase, nazwy użytkowników ani predefiniowane profile.
2. **Brak domyślnych i anonimowych profili**: Aplikacja startuje z pustą listą profili (`{}`). Profile tworzą się **wyłącznie automatycznie po zalogowaniu kontem Google OAuth** (`profiles[googleUser.uid]`).
3. **Trzystopniowa Blokada Dostępu (PWA & Auth Gate)**: Dane aplikacji i konfiguracja bazy są przechowywane wyłącznie na urządzeniu mobilnym (telefon / tablet) po zainstalowaniu aplikacji jako **Standalone PWA**.

---

## 2. Trzystopniowa Bramka Startowa (`PwaAndAuthGateScreen`)

Zanim użytkownik uzyska dostęp do kokpitu treningowego, planów czy historii, aplikacja weryfikuje trzy warunki w ścisłej kolejności:

### Krok 1: Wymagana Instalacja Aplikacji PWA na Urządzeniu
- **Wykrywanie trybu uruchomienia**: Sprawdzenie `window.matchMedia('(display-mode: standalone)').matches` lub `(navigator as any).standalone === true`.
- **Blokada w zwykłej przeglądarce**:
  - Jeśli aplikacja została otwarta w zwykłej karcie przeglądarki (np. Chrome / Safari na telefonie lub z adresu `*.github.io`), ekran logowania Google i konfiguracji bazy jest **zablokowany**.
  - Wyświetlany jest dedykowany ekran instalacyjny z przyciskiem **„Zainstaluj Aplikację PWA na Urządzeniu”** (wywołującym natywny prompt `beforeinstallprompt`) oraz instrukcją instalacji dla iOS/Android.
  - **Wyjątek deweloperski wyłącznie dla AI Studio Preview**: Ponieważ podgląd roboczy wewnątrz ramki `iframe` w środowisku AI Studio (`*.run.app` / `localhost`) nie pozwala na uruchomienie w trybie standalone PWA, tylko na tym hoście widoczny będzie pomocniczy przycisk **„Tryb testowy AI Studio (Pomiń blokadę PWA w podglądzie)”**. Na `*.github.io` oraz na urządzeniach mobilnych blokada jest bezwzględna.

### Krok 2: Konfiguracja Bazy Firebase w Pamięci Urządzenia (Tylko po instalacji PWA)
- Po uruchomieniu zainstalowanej aplikacji PWA z ekranu głównego telefonu/tabletu aplikacja sprawdza, czy w `localStorage` urządzenia (`domyos_custom_firebase_config`) zapisano konfigurację projektu Firebase.
- Jeśli brak konfiguracji:
  - Wyświetlany jest ekran **„Krok 2: Podłącz swoją bazę Firebase”** z polem do wklejenia obiektu JSON (`apiKey`, `projectId`, `authDomain`, `appId`, opcjonalnie `firestoreDatabaseId`).
  - Konfiguracja zapisywana jest **wyłącznie lokalnie w pamięci zainstalowanej aplikacji PWA** na telefonie/tablecie.

### Krok 3: Obowiązkowe Logowanie Kontem Google OAuth (Tworzenie Profilu)
- Po skonfigurowaniu bazy Firebase, jeśli żaden użytkownik nie jest aktualnie zalogowany przez Google OAuth (`!googleUser`), wyświetlany jest ekran **„Krok 3: Zaloguj się kontem Google”**:
  - Przycisk **„Zaloguj się przez Google (OAuth 2.0 + Google Fit)”**.
  - Jeśli na tym urządzeniu logowano się już wcześniej na konta Google (zapisane w `knownAccounts` na urządzeniu), wyświetlana jest również lista szybkiego wyboru konta z natychmiastowym przelogowaniem OAuth.
- Po pomyślnym autoryzowaniu konta Google:
  - Aplikacja sprawdza w Firestore (`users/{uid}/profiles/{uid}`), czy dany użytkownik ma już zapisany profil kolarski (FTP, waga, HRMax, klucze Intervals.icu).
  - Jeśli profil istnieje w bazie Firebase — pobiera go wraz z historią treningów i planami.
  - Jeśli to pierwsze logowanie tego konta Google — automatycznie tworzy nowy profil powiązany z `uid`, imieniem, adresem e-mail i awatarem z konta Google.

---

## 3. Czysty Build na Publiczny GitHub (Gatekeep 1 & 2)

1. **`src/lib/firebase.ts` (Usunięcie jakichkolwiek zahardcodowanych kluczy)**:
   - Całkowite usunięcie stałej `PREDEFINED_FIREBASE_CONFIG` z kodu źródłowego.
   - Implementacja podwójnego zabezpieczenia (zgodnie z `FIREBASE_BLUEPRINT_GUIDE`):
     - Na produkcji (`*.github.io` lub po włączeniu blokady produkcyjnej) aplikacja **nigdy** nie czyta pliku lokalnego, lecz wyłącznie konfigurację wklejoną przez użytkownika na urządzeniu (`localStorage.getItem('domyos_custom_firebase_config')`).
     - Plik `firebase-applet-config.json` ładowany jest przez `import.meta.glob` wyłącznie w środowisku podglądu AI Studio, o ile nie włączono symulacji czystego buildu.
2. **`scripts/build-gh-pages.mjs` (Automatyczne czyszczenie przed kompilacją)**:
   - Podczas wykonywania `npm run build` (zarówno lokalnie, jak i w GitHub Actions) skrypt przed wywołaniem `npx vite build` nadpisuje plik `firebase-applet-config.json` pustym obiektem `{}`, a po zakończeniu buildu przywraca oryginał w bloku `finally`.
   - Dzięki temu w wygenerowanym katalogu `dist/` oraz `docs/` nie ma ani jednego bajtu prywatnej konfiguracji.

---

## 4. Zarządzanie Profilami Wyłącznie przez Konta Google

- Usunięcie `DEFAULT_PROFILES.default` („Domyślny Kolarz”) oraz formularza ręcznego tworzenia anonimowych profili bez konta Google.
- W zakładce **Profile** (`AthleteProfilesView`) oraz w modalu **Przełącznika Kont** (`FastUserSwitcherModal`):
  - Lista profili zawiera wyłącznie profile utworzone przez zalogowane na tym urządzeniu konta Google.
  - Przycisk **„+ Dodaj / Zaloguj kolejne konto Google”** wywołuje okno wyboru konta Google (`prompt: 'select_account'`) i automatycznie tworzy/synchronizuje profil dla nowego kolarza.
  - Opcja wylogowania lub usunięcia profilu z pamięci urządzenia (z możliwością wyczyszczenia lokalnej konfiguracji Firebase).
