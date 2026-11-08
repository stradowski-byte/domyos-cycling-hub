# Plan Wdrożenia: Jeden Aktywny Profil Zalogowanego Konta Google (Brak Listy Profili w Zakładce 4 i w Treningach)

## 1. Cel Zmiany
Całkowite wyeliminowanie widoku wyboru profili (zarówno starych profili z pamięci podręcznej/bazy, jak i przełączników profilowych wewnątrz zakładek) na rzecz modelu **1 Zalogowane Konto Google = 1 Aktywny Profil Kolarza**:
- Po zalogowaniu przez Google OAuth użytkownik widzi w całej aplikacji **wyłącznie swoje konto Google** (`uid` / `email`), swoje parametry fizjologiczne oraz swoją historię jazd.
- W **Zakładce 1 (Wybór Treningu)** znika jakikolwiek podział na profile, selektory „Przypisz do profilu” oraz prefiksy `/profil` na kartach treningowych.
- W **Zakładce 4 (Mój Profil)** znika lista kart profili i przyciski tworzenia/usuwania profili — zakładka prezentuje bezpośrednio ustawienia aktualnie zalogowanego konta Google.

---

## 2. Zakres Modyfikacji w Komponentach

### A. Zakładka 4: `AthleteProfilesView.tsx` („4. Mój Profil”)
1. **Usunięcie paska wyboru wielu profili (`profileList`)**:
   - Usunięcie siatki kart z profilami oraz modali usuwania profilu.
   - Nagłówek zakładki pokazuje bezpośrednio wizytówkę aktualnie zalogowanego konta Google (awatar Google, imię/nazwę wyświetlaną, adres e-mail `googleUser.email`) oraz przycisk **„Przeloguj konto Google”**.
2. **Bezpośrednia konfiguracja fizjologii i integracji zalogowanego konta**:
   - Edycja FTP (W), masy ciała (kg), HR Max, LTHR oraz automatycznych stref mocy (Z1–Z7) i tętna (Z1–Z5) zapisywana bezpośrednio pod identyfikatorem `uid` zalogowanego konta Google w Firebase Firestore.
   - Konfiguracja **Google Fit** oraz **Intervals.icu** przypisana bezpośrednio do aktualnie zalogowanego konta Google.

### B. Zakładka 1: `WorkoutsAndRampBuilderView.tsx` („1. Wybór Treningu”)
1. **Usunięcie podziału na profile w pasku filtrów**:
   - Zastąpienie przycisku `Plan dla: <nazwa profilu>` uniwersalnymi filtrami:
     - **Wszystkie treningi** (wspólne + własne zalogowanego konta),
     - **Z biblioteki Intervals.icu**,
     - **Własne / Kreator**.
2. **Usunięcie wyboru profilu w Kreatorze Treningu**:
   - Usunięcie pola `<select> Przypisz do profilu` z formularza tworzenia/edycji treningu (zamiast 3 kolumn: *Nazwa treningu* + *Zaplanowana data*).
3. **Czyste karty treningowe bez etykiet profili**:
   - Usunięcie znaczników `/{w.profileId}` oraz nazw profili z nagłówków kart treningowych — wyświetlane są wyłącznie: kategoria treningu, czas trwania, liczba bloków oraz data.

### C. Zakładka 5 (`ProfilesAndCloudSettingsView.tsx`) oraz Stan Główny (`App.tsx` i `firebaseSyncService.ts`)
1. **Izolacja profilu do `googleUser.uid`**:
   - W `App.tsx` i `firebaseSyncService.ts` pobierany i utrzymywany w stanie jest wyłącznie profil należący do aktualnie zalogowanego `googleUser.uid` (dokument `profiles/{uid}` w Firestore).
   - Automatyczne wyczyszczenie starego klucza `domyos_hub_profiles_v1` z dawnymi profilami lokalnymi, aby żadne historyczne profile nigdy nie pojawiały się w interfejsie ani w filtrach OPFS.
   - W eksploratorze plików OPFS (Zakładka 5) usunięcie zakładek filtrujących po starych profilach — widoczne są wyłącznie pliki aktualnego konta oraz biblioteka treningów.
