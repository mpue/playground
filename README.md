# Aquist Playground

Ein Board im Stil von Miro, auf dem Fachleute Apps skizzieren, verdrahten und sofort ausprobieren – ganz im Browser, ohne Server.

## So funktioniert's

1. **Oberfläche:** Screens (Smartphone, Tablet, Desktop) auf ein unendliches Board legen und Elemente hineinziehen: Überschrift, Text, Kennzahl, Bild, Button, Eingabefeld, Textbereich, Checkbox, Auswahl, Liste, Tabelle, Fläche, Trennlinie und Klebezettel.
2. **Workflow:** Die App mit Bausteinen verdrahten. Dunkle Pfeile legen die Reihenfolge fest, farbige Linien liefern Werte. Nicht verbundene Eingänge füllt man direkt im Baustein aus.
3. **Daten:** Tabellen mit Feldern anlegen (Text, Zahl, Ja/Nein, Datum, Auswahl), Datensätze pflegen, CSV importieren und exportieren.
4. **Ausprobieren:** Die App läuft in einer Vorschau neben dem Editor. Ausgeführte Bausteine leuchten auf, Fehler zeigen auf den verursachenden Baustein, Protokoll und Variablen sind live sichtbar.
5. **Teilen:** als Link (zum Bearbeiten oder nur zum Ausprobieren), als Projektdatei, als lauffähige HTML-Datei oder als Steckbrief (Markdown, Drucken/PDF).

### Bausteine

| Gruppe | Bausteine |
| --- | --- |
| Ereignisse | App gestartet, Screen geöffnet, Geklickt, Eingabe geändert, Eintrag gewählt, Timer, Eigener Ablauf |
| Oberfläche | Wert lesen, Text setzen, Feld befüllen, Eingaben leeren, Ein-/Ausblenden, Liste befüllen, Gehe zu Screen, Meldung anzeigen, Nachfragen, Eingabe abfragen |
| Datenbank | Datensatz anlegen, Datensätze holen (Filter, Sortierung, Anzahl), Datensatz ändern, Datensatz löschen, Tabelle leeren |
| Logik | Wenn/Sonst, Vergleichen, Und/Oder, Nicht, Verzweigen nach Wert |
| Schleifen | Für jedes Element, N-mal wiederholen, Solange |
| Listen & Zählen | Zählen (mit Bedingung), Summe/Schnitt/Min/Max, Filtern, Sortieren, Feld lesen, Element holen, Zu Text verbinden |
| Rechnen | Rechnen, Runden, Zufallszahl |
| Text & Werte | Wert, Text zusammensetzen (mit `{Platzhaltern}`), Text umwandeln, Jetzt (Datum/Zeit) |
| Variablen | Variable lesen, setzen, erhöhen, an Liste anhängen |
| Ablauf | Ablauf starten, Warten, Protokollieren, Notiz |

## Daten und Datenschutz

Projekte und Datensätze liegen im `localStorage` des Browsers. Beim Teilen werden Datenbank-Inhalte nur mitgegeben, wenn man das ausdrücklich ankreuzt. Ein Link enthält das ganze Projekt (JSON, komprimiert, Base64 im `#`-Teil der URL). Der `#`-Teil wird nie an einen Server geschickt.

## Betrieb mit Docker Compose

```bash
docker compose up -d --build
```

Baut das Image und startet den Playground auf <http://localhost:8080>. Der Port ist auf allen Netzwerkschnittstellen offen, Kolleginnen und Kollegen erreichen ihn also unter `http://<rechner>:8080`. Ein anderer Port geht mit `AQUIST_PORT=9000 docker compose up -d`.

Beim Bauen laufen Typecheck und Tests. Schlägt einer davon fehl, entsteht kein Image. Ausgeliefert wird nur die eine gebaute HTML-Datei: nginx läuft ohne Root-Rechte, das Dateisystem des Containers ist schreibgeschützt. Der Container startet nach einem Neustart des Rechners von selbst wieder (`restart: unless-stopped`). Ein `docker compose down` beendet ihn dauerhaft.

Der Server speichert nichts. Projekte und Daten liegen weiterhin im Browser jedes Nutzers, und zwar getrennt nach Adresse: `localhost:8080`, `rechner:8080` und `localhost:5180` haben jeweils ihren eigenen Speicher. Zum Umziehen gibt es die Projektdatei oder den Link zum Bearbeiten.

### Entwickeln im Container

```bash
docker compose --profile dev up --build -V dev
```

Startet Vite mit Hot Reload auf <http://localhost:5180>, nur auf diesem Rechner erreichbar. Die Quellen werden in den Container eingehängt, `node_modules` kommt aus dem Image. `-V` sorgt dafür, dass nach einer Änderung an `package.json` die neuen Pakete ankommen.

## Entwicklung ohne Docker

Voraussetzung ist Node.js ≥ 20.

```bash
npm install
```

```bash
npm run dev
```

Läuft auf <http://localhost:5180>.

```bash
npm test
```

Prüft die Ausführungs-Engine an den drei Vorlagen, das Fehlerverhalten und Teilen-Links.

```bash
npm run build
```

Erzeugt **eine einzige Datei** `dist/index.html` (rund 360 KB). Sie lässt sich auf jeden Webserver oder ein Netzlaufwerk legen und auch per Doppelklick öffnen. Nur diese gebaute Version kann Apps als eigenständige HTML-Datei exportieren: Sie kopiert sich selbst und bettet das Projekt ein.

### Aufbau

- `src/model/`: Datenmodell, Vorlagen, Speichern, Teilen, Steckbrief (`describe.ts`), Prüfung (`validate.ts`)
- `src/runtime/`: Ausführung: Bausteinbibliothek (`nodes.ts`), Interpreter (`Runtime.ts`), JSON-Datenbank (`database.ts`)
- `src/ui/`: Editor: Board (`board/`), Workflow-Designer (`flow/`), Daten-Tab (`data/`), Vorschau und Player (`run/`)

Ein neuer Baustein ist ein Eintrag in `src/runtime/nodes.ts` mit Ports, Einstellungen, `run` (Ablauf-Bausteine) oder `eval` (reine Werte-Bausteine) und `describe` für den Steckbrief.
