# Natywny Format i Parser Konfiguracji Firebase (`firebaseConfig`)

Przebudowa parsera oraz sposobu wyświetlania konfiguracji Firebase w aplikacji tak, aby w 100% odpowiadał formatowi generowanemu w konsoli Firebase (klucze/nagłówki bez cudzysłowów, brak sztucznych pól w rodzaju `"firestoreDatabaseId": "(default)"`, pełna obsługa wklejenia samych linii `klucz: "wartość"` bez nawiasów klamrowych `{ }`, obiektu `const firebaseConfig = { ... }` oraz pełnego skryptu inicjalizacyjnego z konsoli Firebase).

---

### User Review & Critical Decisions

> [!IMPORTANT]
> Poniższe założenia uwzględniają Twoje doprecyzowanie z pytania:

- **Potwierdzona decyzja 1 — Natywny format z konsoli Firebase (nagłówki bez cudzysłowów/nawiasów)**: Wzorzec w polach tekstowych (zarówno w Kroku 2 bramki startowej PWA, jak i w Zakładce 5) oraz funkcja wyświetlająca zapisany config nie używają już `JSON.stringify` (który dodawał cudzysłowy wokół każdego klucza `"apiKey": "..."` i nawiasy `"(default)"`), lecz prezentują dokładny format z konsoli Firebase:
  ```javascript
  const firebaseConfig = {
    apiKey: "AIzaSy...",
    authDomain: "twoj-projekt.firebaseapp.com",
    projectId: "twoj-projekt",
    storageBucket: "twoj-projekt.firebasestorage.app",
    messagingSenderId: "1234567890",
    appId: "1:1234567890:web:abcdef123456",
    measurementId: "G-XXXXXXXXXX"
  };
  ```
- **Potwierdzona decyzja 2 — Odporny parser oparty na ekstrakcji par `klucz: wartość` (z nawiasami lub bez nawiasów)**: Nowy parser nie polega na kruchym `JSON.parse` ani wycinaniu pierwszego nawiasu `{` (który psuł się np. na `import { initializeApp }` lub gdy wklejono same linie `apiKey: "..."` bez nawiasów `{ }`). Zamiast tego bezpośrednio odczytuje pary klucz–wartość z dowolnego wklejonego fragmentu z konsoli Firebase.

---

### 1. Overview & Core Concept

- **Co zmieniamy**:
  1. Wzorzec (`placeholder`) oraz domyślnie wyświetlany tekst konfiguracji w `PwaAndAuthGateScreen` (Krok 2) i `ProfilesAndCloudSettingsView` (Zakładka 5) będzie wyglądał identycznie jak w konsoli Firebase (`apiKey: "..."`, `authDomain: "..."`, `projectId: "..."`, `storageBucket: "..."`, `messagingSenderId: "..."`, `appId: "..."`, `measurementId: "..."`).
  2. Parser `parseCustomFirebaseInput` w `src/lib/firebase.ts` zostanie zastąpiony ekstraktorem par klucz–wartość, który przyjmuje:
     - same linie `apiKey: "...", projectId: "..."` bez zewnętrznych nawiasów `{ }`,
     - blok `const firebaseConfig = { ... };`,
     - cały skopiowany kod z konsoli Firebase wraz z liniami `import { initializeApp } from "firebase/app";` oraz komentarzami `// ...`,
     - klasyczny format JSON.

---

### 2. User Experience & Visual Design

- **Czytelny wzorzec 1:1 z Firebase Console**:
  - Użytkownik wchodzący w `Project settings -> General -> Your apps -> SDK setup and configuration` w konsoli Firebase widzi w aplikacji dokładnie tę samą strukturę i kolejność pól (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`, `measurementId`).
  - Niezależnie od tego, czy skopiuje tylko wnętrze obiektu (bez nawiasów `{ }`), cały blok `const firebaseConfig = { ... };`, czy pełny snippet z `import { ... }`, zapis zadziała od razu bez błędów składniowych.

---

### 3. Key Product Decisions & Trade-Offs

- **Decyzja 1: Rezygnacja z `JSON.parse` na wejściu użytkownika na rzecz dedykowanego parsera właściwości `firebaseConfig`**:
  - *Wybrane podejście*: Usuwanie komentarzy JS (`//` oraz `/* */`) i bezpośrednie dopasowanie właściwości (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`, `measurementId`, oraz opcjonalnych pól środowiskowych jak `firestoreDatabaseId`) wyrażeniem regularnym obsługującym klucze bez cudzysłowów i z cudzysłowami.
  - *Dlaczego*: Konfig generowany przez Firebase to obiekt JavaScript (klucze bez cudzysłowów), a nie ścisły JSON. Ponadto wklejenie samych linii bez `{ }` lub pełnego kodu z `import { initializeApp }` powodowało błąd w `JSON.parse`.
- **Decyzja 2: Dedykowany formater `formatFirebaseConfigText(config)` zamiast `JSON.stringify`**:
  - *Wybrane podejście*: Funkcja formatująca zapisany obiekt z powrotem do postaci natywnego obiektu Firebase (`apiKey: "...",` itd.) podczas podglądu lub edycji konfiguracji w UI.

---

### 4. Technical Architecture & Data Strategy *(Technical Reference)*

```
┌───────────────────────────────────────────────────────────────────────────┐
│                WEJŚCIE UŻYTKOWNIKA (Wklejony tekst z Firebase)            │
│  • Wariant A: Same linie bez nawiasów (apiKey: "...", projectId: "...")   │
│  • Wariant B: const firebaseConfig = { apiKey: "...", ... };              │
│  • Wariant C: Pełny skrypt SDK z import { initializeApp } i komentarzami  │
└─────────────────────────────────────┬─────────────────────────────────────┘
                                      │
                                      ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                  parseCustomFirebaseInput(rawInput)                       │
│  1. Oczyszczenie komentarzy // oraz /* */ i linii import/initializeApp    │
│  2. Ekstrakcja par klucz: "wartość" (bez wymogu nawiasów {} i cudzysłowów │
│     wokół kluczy) dla standardowych pól Firebase Config                   │
│  3. Walidacja obecności wymaganych pól: apiKey oraz projectId             │
└─────────────────────────────────────┬─────────────────────────────────────┘
                                      │
                                      ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                formatFirebaseConfigText(activeConfig)                     │
│  Wyświetla w polach <textarea> (Krok 2 PWA oraz Zakładka 5) dokładny      │
│  format z konsoli Firebase (klucze bez cudzysłowów, oryginalna kolejność) │
└───────────────────────────────────────────────────────────────────────────┘
```
