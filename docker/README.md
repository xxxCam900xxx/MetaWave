# Wie startet man das Projekt mit Docker?

- [Wie startet man das Projekt mit Docker?](#wie-startet-man-das-projekt-mit-docker)
  - [Step 0 | Docker installieren](#step-0--docker-installieren)
  - [Step 1 | Enviroment Files erstellen](#step-1--enviroment-files-erstellen)
  - [Step 2 | Docker Container starten](#step-2--docker-container-starten)
    - [Downloader in 300er-Chunks mit Orchestrator ausführen](#downloader-in-300er-chunks-mit-orchestrator-ausführen)
      - [Orchestrator-Variante (empfohlen)](#orchestrator-variante-empfohlen)
      - [Manuelle Variante (nur bei Bedarf)](#manuelle-variante-nur-bei-bedarf)
    - [LUFS-Analyse für bereits heruntergeladene Songs](#lufs-analyse-für-bereits-heruntergeladene-songs)
      - [Helper-Skripte (für manuelle Analyse)](#helper-skripte-für-manuelle-analyse)
      - [Manuelle Docker-Befehle](#manuelle-docker-befehle)
  - [Schnelltests](#schnelltests)
    - [Radio-API testen:](#radio-api-testen)
    - [Notification Job manuell auslösen:](#notification-job-manuell-auslösen)
    - [Metadata \& LUFS-Daten prüfen:](#metadata--lufs-daten-prüfen)
    - [Container-Logs ansehen:](#container-logs-ansehen)
  - [Step 3 | Start Coding!](#step-3--start-coding)

---

## Step 0 | Docker installieren

Installieren Sie Docker Desktop auf Ihrem System:
- https://www.docker.com/products/docker-desktop/

```bash
docker version
docker compose version
```

> [!IMPORTANT]
> - Stellen Sie sicher, dass Docker ausgeführt wird, bevor Sie fortfahren.
> - Für die Include-Funktion benötigen Sie Docker Compose v2.20+.

Das Projekt verwendet `docker/compose.enviroment.yaml`, welches folgende Compose-Fragmente inkludiert:

- `metawave_database/compose.database.yaml`
- `metawave_server/compose.server.yaml`
- `metawave_app/compose.app.yaml`

## Step 1 | Enviroment Files erstellen

Erstellen Sie im Verzeichnis `/docker/metawave_app` eine `.env` Datei mit den folgenden Variablen:

```bash
# Für die lokale Entwicklung können Sie localhost verwenden.
API_DOMAIN_URL=http://localhost:8000
```

Danach erstellen Sie im Verzeichnis `/docker/metawave_server` eine `.env` Datei mit den folgenden Variablen (an Ihre Umgebung anpassen):

```env
# Schauen Sie, dass die Playlist öffentlich zugänglich ist!
PLAYLIST_URL=https://www.youtube.com/playlist?list=PLYfrfvAfnsDmHAS1wU6v-NC5e5iFxmgmH

# --- Required server env vars ---
# API port (radio/auth service)
PORT=8000

# Database connection used by the server (matches docker/metawave_database/.env)
DB_HOST=database
DB_PORT=3306
DB_USER=metawave_user
DB_PASS=strongpassword
DB_NAME=database_metawave

# Auth secret for JWTs
AUTH_SECRET=<random_secret>
AUTH_TOKEN_EXPIRY=3600

# Standard notification text
STANDARD_NOTIFICATION_MESSAGE=Neuer WaveToken wurde generiert. Verwende ihn zum Login.

# --- Downloader configuration (optional fein-tuning) ---
# Number of concurrent downloads per batch
BATCH_SIZE=10
# Seconds to wait between batches
BATCH_DELAY_SECONDS=60
# Seconds to wait between individual video downloads
VIDEO_DELAY_SECONDS=5
# Retry/backoff settings
MAX_RETRIES=5
INITIAL_DELAY_SECONDS=60
# Optional: limit playlist items for testing, e.g. "1-10" or "1,3,5"
#PLAYLIST_ITEMS=

# --- YouTube Cookies (optional, für private/altersbeschränkte Videos) ---
# Pfad zur YouTube Cookies-Datei im Container
# Wenn gesetzt, wird yt-dlp authentifiziert (siehe GET_YT_COOKIES.md)
#YT_COOKIES=/cookies/www.youtube.com_cookies.txt

# --- E-Mail (notifications) configuration ---
# (Optional, wenn E-Mail-Benachrichtigungen verwendet werden)
SMTP_HOST=mail.hostpoint.ch
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<dein-hostpoint-login>
SMTP_PASS=<dein-hostpoint-passwort>

# Absender-Adresse für Benachrichtigungs-Mails
EMAIL_FROM="MetaWave <no-reply@deine-domain.tld>"

# Optional: Betreffzeile für E-Mail-Notifications
EMAIL_NOTIFICATION_SUBJECT=Dein neuer MetaWave WaveToken
```

Danach erstellen Sie im Verzeichnis `/docker/metawave_database` eine `.env` Datei. Diese muss zu den `DB_*`-Werten oben passen:

```env
MARIADB_ROOT_PASSWORD=supersecret
MARIADB_DATABASE=database_metawave
MARIADB_USER=metawave_user
MARIADB_PASSWORD=strongpassword
```

## Step 2 | Docker Container starten

Verwenden Sie den folgenden Befehl im Verzeichnis `docker`:

```bash
docker compose -f compose.enviroment.yaml up --build
```

Damit werden Datenbank, Server, Downloader und Client gemäss der inkludierten Dateien gestartet.

### Downloader in 300er-Chunks mit Orchestrator ausführen

Wenn deine Playlist sehr gross ist, kannst du die Downloads mit einem Orchestrator-Skript auf mehrere Downloader-Container aufteilen. Jeder Container lädt z.B. 300 Videos (Chunk) herunter, schreibt die MP3s + `.info.json` ins gemeinsame Volume `songs`, und am Ende wird aus allen vorhandenen Dateien eine gemeinsame `metadata.json` erzeugt.

**Wichtig:**

- Alle Downloader-Container teilen sich das Volume `songs`, daher landen alle MP3s und `.info.json`-Dateien im selben Ordner.
- Die Playlist wird einmalig geflattet und in `/songs/playlist_urls.json` gespeichert.
- Pro Chunk wird automatisch ein Downloader-Container mit eigener Range gestartet (z.B. `downloader-chunk-1-300`).
- Auch wenn einzelne Chunks fehlschlagen, wird am Ende eine `metadata.json` mit den bereits vorhandenen `.info.json`-Dateien erzeugt (Teilbestand).

#### Orchestrator-Variante (empfohlen)

1. Wechsle in das `docker` Verzeichnis:

  ```powershell
  cd .\docker\
  ```

2. Baue bei Bedarf das Downloader-Image neu (nach Änderungen an den Skripten):

  ```powershell
  docker compose -f .\compose.enviroment.yaml build downloader
  ```

3. Starte den Orchestrator (Standard: 300er Chunks, max. 3 parallele Downloader):

  ```powershell
  .\run_downloader_chunks.ps1
  ```

  **Der Orchestrator ist intelligent:**
  - **Synchronisation**: Lädt nur neue Videos herunter (vergleicht mit bestehender metadata.json)
  - **Cleanup**: Löscht Videos die nicht mehr in der Playlist sind
  - **LUFS-Analyse**: Führt automatisch EBU R128 Analyse am Ende aus
  - **Radio-Restart**: Startet Radio-Server mit aktuellen Songs neu

  **Erste Ausführung**: Lädt alle Videos herunter  
  **Weitere Ausführungen**: Nur neue Videos + Cleanup gelöschter

  **LUFS überspringen:**

  ```powershell
  .\run_downloader_chunks.ps1 -SkipLufs
  ```

  Optional kannst du Chunk-Größe, Parallelität und LUFS-Modus anpassen:

  ```powershell
  # Custom Chunks + Force LUFS Re-Analyse
  .\run_downloader_chunks.ps1 -ChunkSize 200 -MaxParallel 3 -ForceLufs

  # Mit YouTube Cookies (für private/altersbeschränkte Videos)
  .\run_downloader_chunks.ps1 -CookiesFile ".\www.youtube.com_cookies.txt"
  ```

  **Ablauf:**

  1. **Sync**: `sync_playlist.py` vergleicht lokale metadata.json mit YouTube-Playlist
     - Ermittelt neue Videos (noch nicht heruntergeladen)
     - Ermittelt gelöschte Videos (nicht mehr in Playlist)
     - Schreibt nur neue URLs in `playlist_urls.json`
  
  2. **Download**: Nur neue Videos werden in Chunks parallel heruntergeladen
     - Bis zu `MaxParallel` Downloader-Container gleichzeitig
     - Container-Namen: `downloader-chunk-1-300`, etc.
     - Bei 0 neuen Videos: Überspringt Downloads komplett
  
  3. **Cleanup**: `cleanup_deleted.py` löscht MP3/Info-Dateien für Videos die nicht mehr in der Playlist sind
  
  4. **Metadata**: `build_metadata.py` erstellt aktuelle `metadata.json` aus allen vorhandenen Dateien
  
  5. **LUFS**: Analysiert neue Songs mit EBU R128 (parallelisiert in Chunks, außer mit `-SkipLufs`)
  
  6. **Radio-Restart**: Startet Radio-Server neu um Änderungen zu laden

  **Performance**: Bei wiederholten Runs werden nur Delta-Änderungen verarbeitet (schnell!)

#### Manuelle Variante (nur bei Bedarf)

Alternativ kannst du weiterhin manuell mit `PLAYLIST_ITEMS` und den Flags von `update_playlist.py` arbeiten, z.B. um einzelne Bereiche gezielt neu zu laden.

1. Wechsle in das `docker` Verzeichnis:

  ```powershell
  cd .\docker\
  ```

2. Starte für jeden Playlist-Bereich einen Downloader-Run und gib dabei den entsprechenden `PLAYLIST_ITEMS` Bereich und das Flag `--download-only` an. Beispiel für die ersten 900 Videos:

  ```powershell
  # Videos 1–300
  docker compose -f .\compose.enviroment.yaml run --rm -e PLAYLIST_ITEMS="1-300" downloader python -u update_playlist.py --download-only

  # Videos 301–600
  docker compose -f .\compose.enviroment.yaml run --rm -e PLAYLIST_ITEMS="301-600" downloader python -u update_playlist.py --download-only

  # Videos 601–900
  docker compose -f .\compose.enviroment.yaml run --rm -e PLAYLIST_ITEMS="601-900" downloader python -u update_playlist.py --download-only
  ```

3. Wenn alle Downloader-Runs fertig sind, erzeugst du einmalig die kombinierte `metadata.json`:

  ```powershell
  docker compose -f .\compose.enviroment.yaml run --rm downloader python -u update_playlist.py --metadata-only
  ```

  Dieser Aufruf liest alle vorhandenen `*.info.json` Dateien im `songs`-Volume und schreibt eine gemeinsame `metadata.json` Datei.

### LUFS-Analyse für bereits heruntergeladene Songs

Nach dem Download (egal ob mit Orchestrator oder manuell) solltest du die **EBU R128 / LUFS Analyse** durchführen, damit der Monotone Equalizer optimal funktioniert.

> **💡 Hinweis:** Der Orchestrator (`run_downloader_chunks.ps1` / `.sh`) führt die LUFS-Analyse **automatisch parallelisiert** am Ende aus. Die LUFS-Analyse wird auf mehrere Container aufgeteilt (gleicher `ChunkSize` und `MaxParallel` Parameter wie Downloads), um die Verarbeitung zu beschleunigen.

> **⚡ Performance:** Bei 900 Songs mit 6 parallelen Containern dauert die LUFS-Analyse nur noch ~5-12 Minuten statt 30-75 Minuten sequenziell!

#### Helper-Skripte (für manuelle Analyse)

**Windows (PowerShell):**

```powershell
# Standard: Nur Songs ohne LUFS analysieren + Radio neu starten
.\run_lufs_analysis.ps1 -RestartRadio

# Force: ALLE Songs re-analysieren
.\run_lufs_analysis.ps1 -Force -RestartRadio

# Nur spezifische Dateien
.\run_lufs_analysis.ps1 -Files "song1.mp3","song2.mp3"
```

**Linux/macOS (Bash):**

```bash
# Standard: Nur Songs ohne LUFS analysieren + Radio neu starten
./run_lufs_analysis.sh --restart

# Force: ALLE Songs re-analysieren
./run_lufs_analysis.sh --force --restart

# Nur spezifische Dateien
./run_lufs_analysis.sh --files "song1.mp3" "song2.mp3" --restart
```

#### Manuelle Docker-Befehle

Alternativ kannst du auch direkt mit Docker arbeiten:

**1) Standard: Analysiere nur Songs ohne LUFS-Daten**

```powershell
docker compose -f .\compose.enviroment.yaml run --rm downloader python -u reanalyze_lufs.py
```

Dies analysiert alle Songs in `/songs`, die noch keine LUFS-Werte in der `metadata.json` haben.

**2) Force: Re-Analysiere ALLE Songs (überschreibt vorhandene LUFS-Daten)**

```powershell
docker compose -f .\compose.enviroment.yaml run --rm downloader python -u reanalyze_lufs.py --force
```

**3) Nur spezifische Songs analysieren**

```powershell
docker compose -f .\compose.enviroment.yaml run --rm downloader python -u reanalyze_lufs.py --files "song1.mp3" "song2.mp3"
```

**Was wird analysiert?**
- Jede MP3-Datei wird mit FFmpeg's `loudnorm` Filter analysiert (EBU R128 Standard)
- LUFS-Werte (Integrated Loudness, True Peak, Loudness Range) werden extrahiert
- Werte werden in `metadata.json` unter dem `lufs`-Feld gespeichert
- Dauert ca. 2-5 Sekunden pro Song (einmalig)

**Warum ist das wichtig?**
Der Monotone Equalizer nutzt diese LUFS-Werte für professionelle Broadcast-Qualität:
- Songs werden auf -16 LUFS normalisiert (Spotify/YouTube Standard)
- True Peak Limiting verhindert Clipping
- Konsistente Lautstärke über alle Songs hinweg

---

## Schnelltests

### Radio-API testen:

```powershell
# Health Check
curl http://localhost:8000

# Settings abrufen (benötigt Authentication Token)
curl http://localhost:8000/api/radio/settings -H "Authorization: Bearer <TOKEN>"
```

### Notification Job manuell auslösen:

```powershell
curl -X GET http://localhost:8000/api/notification/run-job
```

### Metadata & LUFS-Daten prüfen:

```powershell
# Zeige ersten Song aus metadata.json
docker compose -f .\compose.enviroment.yaml exec downloader sh -c "head -n 20 /songs/metadata.json"

# Prüfe ob LUFS-Daten vorhanden sind
docker compose -f .\compose.enviroment.yaml exec downloader sh -c "grep -c '\"lufs\"' /songs/metadata.json"
```

### Container-Logs ansehen:

```powershell
# Alle Services
docker compose -f .\compose.enviroment.yaml logs -f

# Nur Radio-Server
docker compose -f .\compose.enviroment.yaml logs -f radio

# Nur Downloader (letzte 100 Zeilen)
docker compose -f .\compose.enviroment.yaml logs --tail 100 downloader
```

## Step 3 | Start Coding!

Die folgenden Ports werden verwendet:
- `:8000` → (API) | [Radio & Auth Service](http://localhost:8000)
- `:80` → (Client) | [WebApp](http://localhost:80)