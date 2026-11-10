# Plan Implementacji: Twarda Izolacja Właściciela w `firestore.rules` oraz Filtrowane Zapytania `.where(...)` we Frontendzie

## 1. Cel Zmian
Naprawa dwóch luk logicznych w regułach bezpieczeństwa Firestore oraz pełne dostosowanie zapytań klienckich we frontendzie:
1. **Usunięcie luki braku właściciela (`Orphan Document Bypass`) w `isOwnerOrShared(data)`**:
   - Całkowite usunięcie warunku `!('uid' in data) && !('ownerUid' in data)`.
   - Funkcja `isOwnerOrShared(data)` twardo wymaga zgodności `data.uid == request.auth.uid`, `data.ownerUid == request.auth.uid` lub jawnej flagi `data.profileId == 'shared'`.
   - Wymuszenie obecności pól właściciela przy zapisie (`create` / `update`) w każdej kolekcji.
2. **Zabezpieczenie odczytu (`allow read`) przed globalnym wyciekiem danych**:
   - W kolekcjach `profiles`, `plannedWorkouts`, `completedWorkouts` oraz `securityAuditLogs` reguła `allow read` wymaga `isVerifiedGoogleUser() && (resource == null || isOwnerOrShared(resource.data))` (dzięki `resource == null` pojedyncze sprawdzenie `getDoc` nieistniejącego jeszcze dokumentu profilu przy pierwszym logowaniu nie zwraca błędu uprawnień, natomiast odczyt istniejących dokumentów i listowanie `list` wymaga pełnej zgodności właściciela).
3. **Dodanie obowiązkowych filtrów `.where(...)` we wszystkich zapytaniach `getDocs` i `onSnapshot` we frontendzie**:
   - Zastąpienie nielimitowanych zapytań `collection(db, ...)` zapytaniami `query(collection(db, ...), where(...))`, aby silnik reguł Firestore nigdy nie odrzucał listowania z błędem `Missing or insufficient permissions`.

---

## 2. Szczegółowy Zakres Modyfikacji

### A. Reguły Bezpieczeństwa `/firestore.rules` oraz `RECOMMENDED_FIRESTORE_RULES_CODE` w `src/lib/firebase.ts`
- Wprowadzenie dokładnego zestawu reguł:
  - `isVerifiedGoogleUser()`: `request.auth != null && request.auth.token.firebase.sign_in_provider == 'google.com' && request.auth.token.email_verified == true`
  - `isOwnerOrShared(data)`:
    ```javascript
    function isOwnerOrShared(data) {
      return (('uid' in data) && data.uid == request.auth.uid)
          || (('ownerUid' in data) && data.ownerUid == request.auth.uid)
          || (('profileId' in data) && data.profileId == 'shared');
    }
    ```
  - Zabezpieczenie `allow read` we wszystkich kolekcjach prywatnych (`profiles`, `plannedWorkouts`, `completedWorkouts`, `securityAuditLogs`) warunkiem `isVerifiedGoogleUser() && (resource == null || isOwnerOrShared(resource.data))`.
  - Synchronizacja tego samego kodu w `RECOMMENDED_FIRESTORE_RULES_CODE` w `src/lib/firebase.ts`, aby przycisk **„Kopiuj gotowe reguły firestore.rules”** w rozwijanej instrukcji zawierał poprawioną wersję.

### B. Dopasowanie Zapytań `getDocs` i Subskrypcji `onSnapshot` w `src/services/firebaseSyncService.ts`
1. **`ensureFirestoreCollectionsInitialized`**:
   - Zamiast `getDocs(collection(db, 'plannedWorkouts'))`, wykonanie dwóch równoległych, bezpiecznych zapytań:
     - `getDocs(query(collection(db, 'plannedWorkouts'), where('ownerUid', '==', currentUid)))`
     - `getDocs(query(collection(db, 'plannedWorkouts'), where('profileId', '==', 'shared')))`
   - Podczas inicjalizacji profilu (`profiles/{profile.id}`) twarde dopisanie `uid: currentUid` oraz `ownerUid: currentUid`.
2. **`fetchAllStateFromFirestore`**:
   - `profiles`: `getDocs(query(collection(db, 'profiles'), where('uid', '==', currentUid)))`
   - `plannedWorkouts`: połączenie wyników `where('ownerUid', '==', currentUid)` oraz `where('profileId', '==', 'shared')`
   - `completedWorkouts`: `getDocs(query(collection(db, 'completedWorkouts'), where('ownerUid', '==', currentUid)))`
3. **`subscribeToFirestoreHub` (`onSnapshot`)**:
   - `profiles`: `onSnapshot(query(collection(db, 'profiles'), where('uid', '==', currentUid)), ...)`
   - `plannedWorkouts`: subskrypcja `query(collection(db, 'plannedWorkouts'), where('ownerUid', '==', currentUid))` oraz `query(collection(db, 'plannedWorkouts'), where('profileId', '==', 'shared'))` ze wspólnym scalaniem po `id`
   - `completedWorkouts`: `onSnapshot(query(collection(db, 'completedWorkouts'), where('ownerUid', '==', currentUid)), ...)`
4. **`flushOfflineSyncQueueWithBatch`**:
   - Przed wysłaniem zaległych mutacji z kolejki offline do `profiles`, `plannedWorkouts` lub `completedWorkouts`, automatyczne uzupełnienie `uid: auth.currentUser.uid` oraz `ownerUid: auth.currentUser.uid` (zastępujące ewentualne tymczasowe `'offline_user'`), aby żadna operacja z kolejki offline nie została odrzucona przez `isOwnerOrShared(request.resource.data)`.

### C. Dopasowanie Zapytań w `src/services/securityAndAuditLogger.ts`
- W funkcjach `syncPrivateAuditLogsWithFirestore()` oraz `clearAllPrivateAuditLogs()`:
  - Zastąpienie `getDocs(collection(db, 'securityAuditLogs'))` zapytaniem filtrowanym `getDocs(query(collection(db, 'securityAuditLogs'), where('ownerUid', '==', currentUid)))`.

---

## 3. Weryfikacja
1. Sprawdzenie kompilacji TypeScript (`lint_applet`) i pełnego buildu produkcyjnego (`compile_applet`).
2. Weryfikacja, że w całym kodzie nie ma już żadnego niefiltrowanego wywołania `collection(db, ...)` dla kolekcji objętych regułą `isOwnerOrShared`.
