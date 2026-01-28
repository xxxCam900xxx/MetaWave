# Contributing to MetaWave

Vielen Dank für dein Interesse, zu MetaWave beizutragen! 🎵

Dieses Dokument hilft dir, das Projekt zu verstehen und effektiv beizutragen.

---

## Inhaltsverzeichnis
- [Contributing to MetaWave](#contributing-to-metawave)
  - [Inhaltsverzeichnis](#inhaltsverzeichnis)
  - [Projekt-Übersicht](#projekt-übersicht)
    - [Zielgruppe](#zielgruppe)
  - [Technologie-Stack](#technologie-stack)
    - [Backend](#backend)
    - [Frontend](#frontend)
    - [DevOps](#devops)
    - [Wichtige Libraries](#wichtige-libraries)
  - [Development Setup](#development-setup)
    - [Schnellstart](#schnellstart)
  - [Projektstruktur](#projektstruktur)
    - [Wichtige Dateien](#wichtige-dateien)
  - [Entwicklungs-Workflow](#entwicklungs-workflow)
    - [Branch-Strategie](#branch-strategie)
    - [Feature entwickeln](#feature-entwickeln)
    - [Lokale Entwicklung ohne Docker](#lokale-entwicklung-ohne-docker)
  - [Code-Konventionen](#code-konventionen)
    - [JavaScript/Node.js](#javascriptnodejs)
    - [Python](#python)
    - [TypeScript/React Native](#typescriptreact-native)
    - [SQL](#sql)
  - [Testing](#testing)
    - [Backend-Tests](#backend-tests)
    - [Frontend-Tests](#frontend-tests)
  - [Pull Requests](#pull-requests)
    - [Bevor du einen PR erstellst](#bevor-du-einen-pr-erstellst)
    - [PR-Template](#pr-template)
    - [Review-Prozess](#review-prozess)
  - [Wichtige Konzepte](#wichtige-konzepte)
    - [1. EBU R128 / LUFS Normalisierung](#1-ebu-r128--lufs-normalisierung)
    - [2. Playlist-Download-Strategie](#2-playlist-download-strategie)
    - [3. WebSocket-Streaming](#3-websocket-streaming)
    - [4. Signal-Notifications](#4-signal-notifications)
    - [5. WaveToken (Invite-System)](#5-wavetoken-invite-system)
  - [Bekannte Probleme \& Roadmap](#bekannte-probleme--roadmap)
    - [Bekannte Probleme](#bekannte-probleme)
    - [Roadmap / Feature-Ideen](#roadmap--feature-ideen)
  - [Hilfreiche Ressourcen](#hilfreiche-ressourcen)
    - [Dokumentation](#dokumentation)
    - [Externe Docs](#externe-docs)
  - [Hilfe \& Kontakt](#hilfe--kontakt)
    - [Fragen?](#fragen)
    - [Bug melden](#bug-melden)
    - [Feature vorschlagen](#feature-vorschlagen)
  - [Danke!](#danke)

---

## Projekt-Übersicht

**MetaWave** ist ein containerbasierter Internet-Radio-Server mit folgenden Features:

- **YouTube Playlist Integration**: Automatischer Download und Verwaltung von Playlists
- **EBU R128 Loudness Normalization**: Professionelle Lautstärke-Normalisierung nach Broadcasting-Standard
- **WebSocket Streaming**: Echtzeit-Audio-Streaming mit Metadaten
- **Signal Notifications**: Push-Benachrichtigungen über Signal Messenger
- **React Native App**: Cross-Platform Mobile App (iOS/Android/Web)
- **RESTful API**: Vollständige Steuerung über HTTP/WebSocket

### Zielgruppe

- Privatpersonen, die einen eigenen Radio-Server betreiben möchten
- Entwickler, die Audio-Streaming-Lösungen aufbauen
- Enthusiasten für Broadcasting-Technologien

---

## Technologie-Stack

### Backend

- **Node.js 20+** (Express.js) - Radio-Streaming-Engine & API
- **Python 3.11+** - YouTube Downloader & LUFS-Analyse
- **FFmpeg 7+** - Audio-Transcoding & Normalisierung
- **MariaDB 11+** - Persistente Datenspeicherung
- **Signal CLI** - Notification-Service

### Frontend

- **React Native** (Expo) - Mobile & Web App
- **TypeScript** - Type-safe Frontend-Code
- **TailwindCSS** (NativeWind) - Styling

### DevOps

- **Docker & Docker Compose** - Containerisierung
- **Git** - Version Control

### Wichtige Libraries

- **yt-dlp**: YouTube Download
- **ws**: WebSocket-Server
- **node-cron**: Scheduled Jobs
- **swagger-ui-express**: API-Dokumentation

---

## Development Setup

### Schnellstart

1. **Repository klonen:**

   ```bash
   git clone https://github.com/your-username/MetaWave.git
   cd MetaWave
   ```

2. **Umgebungsvariablen konfigurieren** (siehe [docker/README.md](docker/README.md))

3. **Docker-Services starten:**

   ```bash
   cd docker
   docker compose -f compose.enviroment.yaml up -d database
   docker compose -f compose.enviroment.yaml up -d signal-api
   docker compose -f compose.enviroment.yaml run --rm downloader
   docker compose -f compose.enviroment.yaml run --rm downloader python -u reanalyze_lufs.py
   docker compose -f compose.enviroment.yaml up -d radio
   docker compose -f compose.enviroment.yaml up -d app
   ```

4. **Zugriff:**
   - Radio API: http://localhost:8000
   - Swagger Docs: http://localhost:8000/api-docs
   - WebApp: http://localhost

**📖 Vollständige Anleitung:** Siehe [docker/README.md](docker/README.md) für detaillierte Setup-Schritte, Umgebungsvariablen und Troubleshooting.

---

## Projektstruktur

```
MetaWave/
│
├── app/                                # Frontend & Backend
│   ├── metawave_app/                   # React Native App
│   │   ├── app/                        # App-Screens (Expo Router)
│   │   │   ├── index.tsx               # Login-Screen
│   │   │   ├── player.tsx              # Radio-Player
│   │   │   ├── settings.tsx            # Einstellungen
│   │   │   └── invite.tsx              # Einladungen
│   │   └── src/                        # Shared Code
│   │       ├── config.ts               # API-Konfiguration
│   │       └── styles/                 # Styling
│   │
│   ├── metawave_server/                # Backend-Services
│   │   ├── downloader/                 # YouTube Downloader (Python)
│   │   │   ├── update_playlist.py      # Playlist-Download & LUFS
│   │   │   ├── reanalyze_lufs.py       # Batch LUFS-Analyse
│   │   │   ├── flatten_playlist.py     # Playlist-Flattening
│   │   │   └── download_chunk.py       # Chunk-basierter Download
│   │   │
│   │   └── radio/                      # Radio-Server (Node.js)
│   │       ├── server.js               # Express-Server Entry
│   │       ├── core/                   # Radio-Engine
│   │       │   ├── RadioEngine.js      # Streaming-Logik
│   │       │   └── RadioEngineRouter.js # REST-Endpoints
│   │       ├── database/               # DB-Layer
│   │       │   └── DatabaseLogic.js
│   │       ├── middleware/             # Auth & Token
│   │       │   ├── AuthLogic.js
│   │       │   ├── AuthRouter.js
│   │       │   └── WaveTokenLogic.js
│   │       ├── notification/           # Signal-Integration
│   │       │   ├── NotificationLogic.js
│   │       │   ├── NotificationRouter.js
│   │       │   └── NotificationJob.js
│   │       ├── swagger/                # API-Dokumentation
│   │       │   └── openapi.yaml
│   │       └── websocket/              # WebSocket-Server
│   │           └── WebsocketLogic.js
│   │
│   └── metawave_database/              # Database-Schemas
│       └── init.sql                    # MariaDB Init-Script
│
├── concept/                            # Dokumentation
│   ├── ENDPOINTS.md                    # API-Referenz
│   ├── MONOTONE_EQUALIZER.md           # LUFS-Erklärung
│   └── DOWNLOADER_LOGIC.md             # Download-Strategie
│
├── docker/                             # Docker-Konfiguration
│   ├── compose.enviroment.yaml         # Haupt-Compose-Datei
│   ├── README.md                       # Lokale Dev-Anleitung
│   ├── GET_YT_COOKIES.md               # YouTube Cookie-Guide
│   ├── metawave_app/                   # App-Container
│   ├── metawave_server/                # Server-Container
│   ├── metawave_database/              # DB-Container
│   └── signal_cli/                     # Signal-Container
│
├── README.md                           # Projekt-README
├── DEPLOYMENT.md                       # VM-Deployment-Guide
├── CONTRIBUTING.md                     # Dieser Leitfaden
└── LICENSE                             # Lizenz
```

### Wichtige Dateien

| Datei | Beschreibung |
|-------|--------------|
| `app/metawave_server/radio/core/RadioEngine.js` | Kern der Streaming-Engine mit LUFS-Normalisierung |
| `app/metawave_server/downloader/update_playlist.py` | YouTube-Download & Metadata-Extraktion |
| `app/metawave_app/app/player.tsx` | React Native Player-UI |
| `docker/compose.enviroment.yaml` | Docker-Orchestrierung |
| `concept/ENDPOINTS.md` | API-Dokumentation |

---

## Entwicklungs-Workflow

### Branch-Strategie

Wir verwenden **Gitflow**:

- `main` - Produktions-Code (stable releases)
- `develop` - Aktuelle Entwicklung
- `feat/*` - Neue Features
- `bug/*` - Bugfixes
- `hotfix/*` - Dringende Production-Fixes

### Feature entwickeln

1. **Erstelle einen Feature-Branch:**

   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feature/mein-neues-feature
   ```

2. **Entwickle & Teste:**

   - Schreibe Code
   - Teste lokal mit Docker
   - Prüfe API mit Swagger (http://localhost:8000/api-docs)

3. **Commit mit aussagekräftiger Message:**

   ```bash
   git add .
   git commit -m "feat: Füge Playlist-Shuffle-Funktion hinzu"
   ```

   **Commit-Konventionen:**
   - `feat:` - Neues Feature
   - `fix:` - Bugfix
   - `docs:` - Dokumentation
   - `refactor:` - Code-Refactoring
   - `test:` - Tests hinzufügen
   - `chore:` - Build/Config-Änderungen

4. **Push & Pull Request erstellen:**

   ```bash
   git push origin feature/mein-neues-feature
   ```

   Erstelle dann einen Pull Request auf GitHub gegen `develop`.

### Lokale Entwicklung ohne Docker

**Backend (Radio-Server):**

```bash
cd app/metawave_server/radio
npm install
node server.js
```

**Frontend (React Native App):**

```bash
cd app/metawave_app
npm install
npx expo start
```

**Downloader (Python):**

```bash
cd app/metawave_server/downloader
pip install -r requirements.txt
python update_playlist.py
```

---

## Code-Konventionen

### JavaScript/Node.js

- **Indentation**: Tabs (wie im bestehenden Code)
- **Semicolons**: Verwenden
- **Quotes**: Single Quotes `'` bevorzugt
- **Naming**:
  - Klassen: `PascalCase` (z.B. `RadioEngine`)
  - Funktionen/Variablen: `camelCase` (z.B. `playNext()`)
  - Konstanten: `UPPER_SNAKE_CASE` (z.B. `MAX_RETRIES`)

**Beispiel:**

```javascript
class RadioEngine {
	constructor() {
		this.currentSong = null;
		this.isPlaying = false;
	}

	playNext() {
		if (!this.playlist || this.playlist.length === 0) {
			console.error('Playlist ist leer');
			return;
		}
		// ...
	}
}
```

### Python

- **Style Guide**: PEP 8
- **Indentation**: 4 Spaces
- **Naming**:
  - Funktionen/Variablen: `snake_case` (z.B. `analyze_lufs()`)
  - Klassen: `PascalCase`
  - Konstanten: `UPPER_SNAKE_CASE`

**Beispiel:**

```python
def analyze_lufs(mp3_path):
    """
    Analysiert LUFS-Werte eines MP3-Files mit FFmpeg.
    
    Args:
        mp3_path: Pfad zur MP3-Datei
        
    Returns:
        dict: LUFS-Werte oder None bei Fehler
    """
    # ...
```

### TypeScript/React Native

- **Indentation**: Tabs
- **Naming**:
  - Components: `PascalCase` (z.B. `PlayerScreen`)
  - Props/State: `camelCase`
  - Interfaces: `PascalCase` mit `I` Prefix (z.B. `IPlayerState`)

**Beispiel:**

```typescript
interface IPlayerState {
	isPlaying: boolean;
	currentSong: string | null;
}

export default function PlayerScreen() {
	const [state, setState] = useState<IPlayerState>({
		isPlaying: false,
		currentSong: null
	});
	
	// ...
}
```

### SQL

- **Keywords**: UPPERCASE
- **Tabellennamen**: `snake_case`
- **Indentation**: 2 Spaces

---

## Testing

### Backend-Tests

```bash
# Health Check
curl http://localhost:8000/api/stream/settings

# Play-Kontrolle
curl -X POST http://localhost:8000/api/stream/play
```

**Alle API-Endpoints:** Siehe [concept/ENDPOINTS.md](concept/ENDPOINTS.md) für vollständige API-Referenz.

**Test-Szenarien:** Siehe [docker/README.md](docker/README.md#schnelltests) für umfassende Test-Commands.

### Frontend-Tests

```bash
cd app/metawave_app
npx tsc --noEmit  # TypeScript Check
npx eslint .      # Linting
```

---

## Pull Requests

### Bevor du einen PR erstellst

- [ ] Code folgt den [Code-Konventionen](#code-konventionen)
- [ ] Funktionalität wurde lokal getestet
- [ ] Keine Debug-Logs oder `console.log()` im Production-Code
- [ ] `.env` Dateien sind nicht committed
- [ ] Dokumentation aktualisiert (falls nötig)

### PR-Template

```markdown
## Beschreibung
Kurze Beschreibung der Änderungen.

## Typ der Änderung
- [ ] Bugfix
- [ ] Neues Feature
- [ ] Breaking Change
- [ ] Dokumentation

## Getestet mit
- [ ] Docker Compose
- [ ] Lokale Node.js/Python Umgebung
- [ ] Manuelle API-Tests

## Checklist
- [ ] Code folgt Style-Guidelines
- [ ] Self-review durchgeführt
- [ ] Dokumentation aktualisiert
```

### Review-Prozess

1. **Automatische Checks** (falls CI/CD vorhanden)
2. **Code Review** durch Maintainer
3. **Test-Deployment** auf Staging-Umgebung
4. **Merge** in `develop` oder `main`

---

## Wichtige Konzepte

### 1. EBU R128 / LUFS Normalisierung

MetaWave verwendet **EBU R128** (LUFS) für professionelle Lautstärke-Normalisierung:

- **Zwei-Pass-Workflow**: Pre-Analyse beim Download → Playback mit gespeicherten Werten
- **Target**: -16 LUFS (Broadcasting-Standard wie Spotify/YouTube)
- **True Peak Limiting**: -1.5 dBTP

**Technische Details:** [concept/MONOTONE_EQUALIZER.md](concept/MONOTONE_EQUALIZER.md) - Migration von RMS zu LUFS, FFmpeg-Integration, Performance-Vergleich

### 2. Playlist-Download-Strategie

Für große Playlists (>300 Videos):

- **Chunked Download**: Teilt Playlist in 300er-Chunks auf
- **Parallele Downloader**: Max. 3 gleichzeitige Downloads
- **Retry-Logik**: Automatische Wiederholung bei Fehlern
- **YouTube Cookies**: Für private/altersbeschränkte Videos

**Orchestrator-Scripts:** [docker/README.md](docker/README.md) - `run_downloader_chunks.sh/ps1`

**Cookie-Setup:** [docker/GET_YT_COOKIES.md](docker/GET_YT_COOKIES.md) - Extraktion, Integration, Troubleshooting

### 3. WebSocket-Streaming

- **Endpoint**: `ws://localhost:8000`
- **Audio-Stream**: FFmpeg → WebSocket (`audio/mpeg`)
- **Metadata**: JSON-Messages (`type: metadata`, `type: playstateChange`)

**Implementierung:** Siehe [app/metawave_app/app/player.tsx](app/metawave_app/app/player.tsx) für Client-Beispiel

**WebSocket-API:** [concept/ENDPOINTS.md](concept/ENDPOINTS.md#websocket) - Message-Typen, Reconnect-Logik

### 4. Signal-Notifications

- **Notification-Job**: Cron-Job alle 30 Minuten
- **Trigger**: Neuer Song startet → Signal-Nachricht
- **Inhalt**: Titel, Interpret, YouTube-URL

**Setup-Anleitung:** [DEPLOYMENT.md](DEPLOYMENT.md#5-signal-notifications-auf-der-vm-einrichten) - Captcha-Token, Registrierung, Troubleshooting

### 5. WaveToken (Invite-System)

- **Generierung**: User kann Invite-Links erstellen
- **Gültigkeit**: 7 Tage (konfigurierbar)
- **Einmalig**: Token wird nach Verwendung ungültig
- **Authentifizierung**: Email + WaveToken = Login

---

## Bekannte Probleme & Roadmap

### Bekannte Probleme

- [ ] Volume-Änderung erfordert Track-Restart (FFmpeg-Limitierung)
- [ ] WebSocket-Reconnect kann kurze Audio-Lücken verursachen
- [ ] LUFS-Analyse bei sehr langen Songs (>10 Min) langsam

### Roadmap / Feature-Ideen

- [ ] Multi-User-Support (verschiedene Playlists pro User)
- [ ] Song-Voting (User können nächsten Song wählen)
- [ ] History (gespielte Songs speichern)
- [ ] Playlist-Editor (Songs hinzufügen/entfernen ohne YouTube)
- [ ] Mobile App Push-Notifications (nativ, nicht nur Signal)
- [ ] Audio-Visualizer (Spektrum-Analyse im Player)
- [ ] Podcast-Support (neben YouTube)

Wenn du an einem dieser Features arbeiten möchtest, erstelle zuerst ein GitHub Issue zur Diskussion!

---

## Hilfreiche Ressourcen

### Dokumentation

- [README.md](README.md) - Projekt-Übersicht
- [DEPLOYMENT.md](DEPLOYMENT.md) - VM-Deployment
- [docker/README.md](docker/README.md) - Lokale Entwicklung
- [concept/ENDPOINTS.md](concept/ENDPOINTS.md) - API-Referenz
- [concept/MONOTONE_EQUALIZER.md](concept/MONOTONE_EQUALIZER.md) - LUFS-Details
- [docker/GET_YT_COOKIES.md](docker/GET_YT_COOKIES.md) - YouTube Cookies

### Externe Docs

- [FFmpeg Documentation](https://ffmpeg.org/documentation.html)
- [yt-dlp Documentation](https://github.com/yt-dlp/yt-dlp)
- [EBU R128 Standard](https://tech.ebu.ch/docs/r/r128.pdf)
- [React Native Docs](https://reactnative.dev/)
- [Expo Router](https://docs.expo.dev/router/introduction/)
- [Docker Compose](https://docs.docker.com/compose/)

---

## Hilfe & Kontakt

### Fragen?

1. **Prüfe zuerst die Dokumentation** (siehe oben)
2. **GitHub Issues durchsuchen** - vielleicht wurde deine Frage schon beantwortet
3. **Neues Issue erstellen** mit folgenden Infos:
   - Beschreibung des Problems
   - Schritte zur Reproduktion
   - Erwartetes vs. tatsächliches Verhalten
   - Umgebung (OS, Docker-Version, etc.)
   - Relevante Logs

### Bug melden

Verwende das **Bug-Report-Template** im Issue-Tracker.

### Feature vorschlagen

Verwende das **Feature-Request-Template** im Issue-Tracker.

---

## Danke!
Vielen Dank, dass du zu MetaWave beitragen möchtest! Jeder Beitrag - ob Code, Dokumentation oder Bug-Reports - hilft das Projekt zu verbessern.

**Happy Coding!** 🎵
