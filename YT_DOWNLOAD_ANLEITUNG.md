# MetaWave Download-Anleitung

**Vollständige Anleitung für das Herunterladen und Verwalten von YouTube-Playlists**

Version 2.0 - Januar 2026

---

## Inhaltsverzeichnis

- [MetaWave Download-Anleitung](#metawave-download-anleitung)
  - [Inhaltsverzeichnis](#inhaltsverzeichnis)
  - [Übersicht](#übersicht)
  - [Voraussetzungen](#voraussetzungen)
    - [Software](#software)
    - [Konfiguration](#konfiguration)
    - [Docker-Container starten](#docker-container-starten)
  - [Schnellstart](#schnellstart)
  - [Orchestrator-Skripte](#orchestrator-skripte)
    - [Windows PowerShell](#windows-powershell)
      - [Standard-Verwendung](#standard-verwendung)
      - [Mit Parametern](#mit-parametern)
    - [Linux/macOS Bash](#linuxmacos-bash)
      - [Standard-Verwendung](#standard-verwendung-1)
      - [Mit Parametern](#mit-parametern-1)
    - [Parameter und Optionen](#parameter-und-optionen)
      - [ChunkSize - Empfehlungen](#chunksize---empfehlungen)
      - [MaxParallel - Empfehlungen](#maxparallel---empfehlungen)
  - [Download-Workflow](#download-workflow)
    - [Erste Ausführung](#erste-ausführung)
    - [Weitere Ausführungen](#weitere-ausführungen)
    - [Was passiert im Hintergrund](#was-passiert-im-hintergrund)
      - [Phase 1: Synchronisation (sync\_playlist.py)](#phase-1-synchronisation-sync_playlistpy)
      - [Phase 2: Chunk-Downloads (download\_chunk.py)](#phase-2-chunk-downloads-download_chunkpy)
      - [Phase 3: Metadata-Generierung (build\_metadata.py)](#phase-3-metadata-generierung-build_metadatapy)
      - [Phase 4: Cleanup (cleanup\_deleted.py)](#phase-4-cleanup-cleanup_deletedpy)
      - [Phase 5: LUFS-Analyse (analyze\_lufs\_chunk.py)](#phase-5-lufs-analyse-analyze_lufs_chunkpy)
      - [Phase 6: LUFS-Merge (merge\_lufs\_results.py)](#phase-6-lufs-merge-merge_lufs_resultspy)
  - [LUFS-Analyse](#lufs-analyse)
    - [Was ist LUFS](#was-ist-lufs)
    - [Automatische Analyse](#automatische-analyse)
    - [Manuelle Analyse](#manuelle-analyse)
  - [YouTube Cookies](#youtube-cookies)
    - [Wann werden Cookies benötigt](#wann-werden-cookies-benötigt)
    - [Cookies exportieren](#cookies-exportieren)
      - [Methode 1: Browser-Extension (Empfohlen)](#methode-1-browser-extension-empfohlen)
      - [Methode 2: yt-dlp (Fortgeschritten)](#methode-2-yt-dlp-fortgeschritten)
      - [Cookies-Format prüfen](#cookies-format-prüfen)
    - [Cookies verwenden](#cookies-verwenden)
      - [Option 1: Parameter (empfohlen für Tests)](#option-1-parameter-empfohlen-für-tests)
      - [Option 2: Umgebungsvariable (dauerhaft)](#option-2-umgebungsvariable-dauerhaft)
  - [Manuelle Download-Befehle](#manuelle-download-befehle)
    - [Einzelne Chunks](#einzelne-chunks)
    - [Spezifische Videos](#spezifische-videos)
    - [Metadata generieren](#metadata-generieren)
    - [Mit Cookies (manuell)](#mit-cookies-manuell)
  - [Erweiterte Funktionen](#erweiterte-funktionen)
    - [Playlist synchronisieren](#playlist-synchronisieren)
    - [Gelöschte Videos entfernen](#gelöschte-videos-entfernen)
    - [LUFS neu berechnen](#lufs-neu-berechnen)
  - [Troubleshooting](#troubleshooting)
    - [Problem 1: "HTTP Error 403: Forbidden"](#problem-1-http-error-403-forbidden)
    - [Problem 2: "Chunk failed"](#problem-2-chunk-failed)
    - [Problem 3: "LUFS analysis failed"](#problem-3-lufs-analysis-failed)
    - [Problem 4: "No space left on device"](#problem-4-no-space-left-on-device)
    - [Problem 5: "Cookies invalid or expired"](#problem-5-cookies-invalid-or-expired)
    - [Problem 6: "Container startet nicht"](#problem-6-container-startet-nicht)
    - [Problem 7: "Playlist not found"](#problem-7-playlist-not-found)
  - [Alle Befehle im Überblick](#alle-befehle-im-überblick)
    - [Orchestrator](#orchestrator)
    - [LUFS-Analyse](#lufs-analyse-1)
    - [Manuelle Downloads](#manuelle-downloads)
    - [Synchronisation \& Cleanup](#synchronisation--cleanup)
    - [Diagnose](#diagnose)
    - [Wartung](#wartung)
  - [Schnellreferenz](#schnellreferenz)

---

## Übersicht

MetaWave lädt YouTube-Playlists herunter und analysiert die Audio-Eigenschaften für perfekte Lautstärken-Normalisierung.

**Hauptfunktionen:**

- **Intelligente Synchronisation** - Lädt nur neue Videos herunter
- **Chunk-basierter Download** - Parallelisiert auf mehrere Container
- **Automatische LUFS-Analyse** - EBU R128 Broadcast-Standard
- **Cleanup** - Entfernt Videos die nicht mehr in Playlist sind
- **Cookie-Support** - Für private/altersbeschränkte Videos

**Architektur:**

```
YouTube Playlist
       ↓
sync_playlist.py (vergleicht mit lokalen Daten)
       ↓
download_chunk.py (parallel, 3-8 Container)
       ↓
build_metadata.py (generiert metadata.json)
       ↓
cleanup_deleted.py (löscht entfernte Videos)
       ↓
analyze_lufs_chunk.py (parallel LUFS-Analyse)
       ↓
merge_lufs_results.py (kombiniert Ergebnisse)
       ↓
Radio-Server (lädt neue Songs)
```

---

## Voraussetzungen

### Software

- **Docker Desktop** (Version 20.10+)
- **Docker Compose** (v2.20+)
- **PowerShell** (Windows) oder **Bash** (Linux/macOS)

### Konfiguration

Erstellen Sie `docker/metawave_server/.env` mit Ihrer Playlist-URL:

```env
# Öffentliche YouTube Playlist URL
PLAYLIST_URL=https://www.youtube.com/playlist?list=YOUR_PLAYLIST_ID

# Download-Einstellungen
BATCH_SIZE=10
BATCH_DELAY_SECONDS=60
VIDEO_DELAY_SECONDS=5
MAX_RETRIES=5

# Optional: YouTube Cookies für private Videos
#YT_COOKIES=/cookies/www.youtube.com_cookies.txt
```

### Docker-Container starten

```powershell
# Im docker-Verzeichnis
cd docker
docker compose -f .\compose.enviroment.yaml up -d
```

---

## Schnellstart

**Windows (PowerShell):**

```powershell
cd docker
.\run_downloader_chunks_windows.ps1
```

**Linux/macOS (Bash):**

```bash
cd docker
./run_downloader_chunks.sh
```

**Das war's!** Der Orchestrator lädt automatisch alle Videos herunter und analysiert die LUFS-Werte.

---

## Orchestrator-Skripte

Die Orchestrator-Skripte automatisieren den kompletten Download-Prozess.

### Windows PowerShell

**Skript:** `run_downloader_chunks_windows.ps1`

#### Standard-Verwendung

```powershell
# Einfacher Download (Standard: 300er Chunks, max. 3 parallel)
.\run_downloader_chunks_windows.ps1
```

#### Mit Parametern

```powershell
# Custom Chunk-Größe und Parallelität
.\run_downloader_chunks_windows.ps1 -ChunkSize 200 -MaxParallel 6

# LUFS-Analyse überspringen (schneller, aber nicht empfohlen)
.\run_downloader_chunks_windows.ps1 -SkipLufs

# Alle Songs neu analysieren (Force LUFS)
.\run_downloader_chunks_windows.ps1 -ForceLufs

# Mit YouTube Cookies
.\run_downloader_chunks_windows.ps1 -CookiesFile ".\www.youtube.com_cookies.txt"

# Kombiniert
.\run_downloader_chunks_windows.ps1 -ChunkSize 150 -MaxParallel 8 -CookiesFile ".\www.youtube.com_cookies.txt"
```

### Linux/macOS Bash

**Skript:** `run_downloader_chunks.sh`

#### Standard-Verwendung

```bash
# Einfacher Download
./run_downloader_chunks.sh
```

#### Mit Parametern

```bash
# Custom Chunk-Größe und Parallelität
./run_downloader_chunks.sh --chunk-size 200 --max-parallel 6

# LUFS überspringen
./run_downloader_chunks.sh --skip-lufs

# Force LUFS
./run_downloader_chunks.sh --force-lufs

# Mit Cookies
./run_downloader_chunks.sh --cookies-file ./www.youtube.com_cookies.txt

# Kombiniert
./run_downloader_chunks.sh --chunk-size 150 --max-parallel 8 --force-lufs --cookies-file ./www.youtube.com_cookies.txt
```

### Parameter und Optionen

| Parameter (PowerShell) | Parameter (Bash) | Standard | Beschreibung |
|------------------------|------------------|----------|--------------|
| `-ChunkSize` | `--chunk-size` | 300 | Videos pro Download-Container |
| `-MaxParallel` | `--max-parallel` | 3 | Anzahl paralleler Container |
| `-SkipLufs` | `--skip-lufs` | false | Überspringt LUFS-Analyse |
| `-ForceLufs` | `--force-lufs` | false | Analysiert alle Songs neu |
| `-CookiesFile` | `--cookies-file` | - | Pfad zur YouTube Cookies-Datei |

#### ChunkSize - Empfehlungen

| Playlist-Größe | ChunkSize | Begründung |
|----------------|-----------|------------|
| < 100 Videos | 50 | Weniger Overhead |
| 100-300 Videos | 100 | Ausgewogen |
| 300-600 Videos | 150 | Optimal für mittlere Playlists |
| 600-1000 Videos | 200-300 | Standard |
| > 1000 Videos | 300 | Maximiert Effizienz |

#### MaxParallel - Empfehlungen

| System | RAM | CPU Kerne | MaxParallel |
|--------|-----|-----------|-------------|
| Schwach | 4 GB | 2 | 2 |
| Normal | 8 GB | 4 | 3-4 |
| Stark | 16 GB | 6-8 | 6-8 |
| Server | 32+ GB | 12+ | 8-12 |

> **Hinweis:** Jeder Container benötigt ~500 MB RAM und 1 CPU-Kern

---

## Download-Workflow

### Erste Ausführung

**Bei der ersten Ausführung lädt der Orchestrator alle Videos herunter:**

```powershell
PS C:\...\docker> .\run_downloader_chunks_windows.ps1
```

**Ausgabe:**

```
[orchestrator] === MetaWave Downloader Orchestrator ===
[orchestrator] ChunkSize: 300, MaxParallel: 3

[orchestrator] Synchronisiere Playlist...
[orchestrator] Befehl: docker compose -f .\compose.enviroment.yaml run --rm downloader python -u sync_playlist.py

[sync] Lade YouTube-Playlist: https://www.youtube.com/playlist?list=PLxxxxx
[sync] Playlist enthält 903 Videos
[sync] Lade lokale metadata.json...
[sync] Keine lokale metadata.json gefunden - erste Ausführung
[sync] Neue Videos: 903
[sync] Gelöschte Videos: 0
[sync] Erstelle playlist_urls.json mit 903 URLs...
[sync] Synchronisation abgeschlossen

[orchestrator] Chunks: 4 (ChunkSize=300, MaxParallel=3)
[orchestrator] Starte Chunk 1/4: Range=1-300
[orchestrator] Starte Chunk 2/4: Range=301-600
[orchestrator] Starte Chunk 3/4: Range=601-900

[orchestrator][job][1-300] Lade Video 1/300: Artist - Song Title
[orchestrator][job][301-600] Lade Video 1/300: Another Artist - Title
[orchestrator][job][601-900] Lade Video 1/300: Third Artist - Song

[orchestrator][job][1-300] Video 1/300 erfolgreich
[orchestrator][job][301-600] Video 1/300 erfolgreich
...
(ca. 3-6 Stunden bei 900 Videos)
...
[orchestrator][job] Chunk 1-300 erfolgreich
[orchestrator][job] Chunk 301-600 erfolgreich
[orchestrator][job] Chunk 601-900 erfolgreich

[orchestrator] Starte Chunk 4/4: Range=901-903
[orchestrator][job] Chunk 901-903 erfolgreich

[orchestrator] Warte auf alle Downloader-Jobs...
[orchestrator] Alle Downloads abgeschlossen

[orchestrator] Erzeuge metadata.json aus allen .info.json Dateien...
[metadata] Scanne /songs Verzeichnis...
[metadata] Gefunden: 903 .info.json Dateien
[metadata] Verarbeite Datei 1/903...
[metadata] Verarbeite Datei 903/903...
[metadata] metadata.json erstellt (903 Songs)

[orchestrator] Lösche Videos die nicht mehr in Playlist sind...
[cleanup] Keine deleted_videos.json gefunden - nichts zu löschen

[orchestrator] Aktualisiere metadata.json nach Cleanup...
[orchestrator] metadata.json aktualisiert

[orchestrator] Starte automatische LUFS-Analyse (parallelisiert)...
[orchestrator] Ermittle Songs für LUFS-Analyse...
[orchestrator] Gefunden: 903 Songs für LUFS-Analyse
[orchestrator] LUFS-Chunks: 4 (ChunkSize=300, MaxParallel=3)

[orchestrator] Starte LUFS-Chunk 1/4: Range=1-300
[orchestrator] Starte LUFS-Chunk 2/4: Range=301-600
[orchestrator] Starte LUFS-Chunk 3/4: Range=601-900

[orchestrator][lufs][1-300] Analysiere Song 1/300 [1/300]
[orchestrator][lufs][1-300] Song 1/300: -14.2 LUFS, -0.8 dBTP
[orchestrator][lufs][301-600] Analysiere Song 1/300 [1/300]
...
(ca. 10-15 Minuten bei 900 Videos mit 3 parallelen Containern)
...
[orchestrator][lufs] LUFS-Chunk 1-300 erfolgreich
[orchestrator][lufs] LUFS-Chunk 301-600 erfolgreich
[orchestrator][lufs] LUFS-Chunk 601-900 erfolgreich
[orchestrator][lufs] LUFS-Chunk 901-903 erfolgreich

[orchestrator] Warte auf alle LUFS-Jobs...
[orchestrator] Merge LUFS-Ergebnisse...

[lufs-merge] Gefunden: 4 Chunk-Ergebnis-Dateien
[lufs-merge] chunk_1-300.json: 300 Einträge geladen
[lufs-merge] chunk_301-600.json: 300 Einträge geladen
[lufs-merge] chunk_601-900.json: 300 Einträge geladen
[lufs-merge] chunk_901-903.json: 3 Einträge geladen
[lufs-merge] Gesamt LUFS-Einträge: 903
[lufs-merge] Metadata erfolgreich aktualisiert!
  - LUFS hinzugefügt: 903
  - Übersprungen: 0
[lufs-merge] Chunk-Ergebnisse aufgeräumt

[orchestrator] LUFS-Analyse erfolgreich abgeschlossen
[orchestrator] Starte Radio neu damit neue LUFS-Werte geladen werden...
[orchestrator] Radio wurde neugestartet

[orchestrator] Alle Schritte abgeschlossen
```

**Zeitaufwand (Beispiel: 900 Videos):**

| Phase | Dauer |
|-------|-------|
| Synchronisation | 30-60 Sekunden |
| Download (3 parallel) | 3-6 Stunden |
| Metadata | 20-40 Sekunden |
| Cleanup | 5 Sekunden |
| LUFS (3 parallel) | 10-15 Minuten |
| Radio-Neustart | 5 Sekunden |
| **GESAMT** | **3-6 Stunden** |

### Weitere Ausführungen

**Bei weiteren Ausführungen lädt der Orchestrator nur NEUE Videos herunter:**

```powershell
PS C:\...\docker> .\run_downloader_chunks_windows.ps1
```

**Ausgabe (keine Änderungen):**

```
[orchestrator] === MetaWave Downloader Orchestrator ===

[orchestrator] Synchronisiere Playlist...
[sync] Lade YouTube-Playlist...
[sync] Playlist enthält 903 Videos
[sync] Lade lokale metadata.json...
[sync] Lokal: 903 Songs
[sync] Neue Videos: 0
[sync] Gelöschte Videos: 0
[sync] Playlist ist synchron

[orchestrator] Keine neuen Videos - überspringe Downloads

[orchestrator] Lösche Videos die nicht mehr in Playlist sind...
[cleanup] Keine Videos zum Löschen

[orchestrator] Aktualisiere metadata.json nach Cleanup...
[orchestrator] metadata.json aktualisiert

[orchestrator] Ermittle Songs für LUFS-Analyse...
[orchestrator] Keine Songs brauchen LUFS-Analyse

[orchestrator] Alle Schritte abgeschlossen
```

**Zeitaufwand:** ~1-2 Minuten

**Ausgabe (5 neue Videos):**

```
[orchestrator] === MetaWave Downloader Orchestrator ===

[orchestrator] Synchronisiere Playlist...
[sync] Neue Videos: 5
[sync] Gelöschte Videos: 0
[sync] Erstelle playlist_urls.json mit 5 URLs...

[orchestrator] Chunks: 1 (ChunkSize=300, MaxParallel=3)
[orchestrator] Starte Chunk 1/1: Range=1-5

[orchestrator][job][1-5] Lade Video 1/5: New Artist - New Song
[orchestrator][job][1-5] Video 1/5 erfolgreich
...
[orchestrator][job] Chunk 1-5 erfolgreich

[orchestrator] Erzeuge metadata.json aus allen .info.json Dateien...
[metadata] metadata.json erstellt (908 Songs)

[orchestrator] Ermittle Songs für LUFS-Analyse...
[orchestrator] Gefunden: 5 Songs für LUFS-Analyse
[orchestrator] LUFS-Chunks: 1

[orchestrator][lufs][1-5] Analysiere Song 1/5 [1/5]
[orchestrator][lufs][1-5] Song 1/5: -15.8 LUFS, -1.2 dBTP
...
[orchestrator][lufs] LUFS-Chunk 1-5 erfolgreich

[orchestrator] Merge LUFS-Ergebnisse...
[lufs-merge] Metadata erfolgreich aktualisiert (5 hinzugefügt)

[orchestrator] LUFS-Analyse erfolgreich abgeschlossen
[orchestrator] Radio wurde neugestartet
[orchestrator] Alle Schritte abgeschlossen
```

**Zeitaufwand:** ~5-10 Minuten (für 5 neue Videos)

### Was passiert im Hintergrund

#### Phase 1: Synchronisation (sync_playlist.py)

```python
# 1. Lädt aktuelle YouTube-Playlist
yt-dlp --flat-playlist --dump-json PLAYLIST_URL

# 2. Lädt lokale metadata.json
with open('/songs/metadata.json') as f:
    local_songs = json.load(f)

# 3. Vergleicht Video-IDs
new_ids = remote_ids - local_ids
deleted_ids = local_ids - remote_ids

# 4. Schreibt nur neue URLs
playlist_urls.json → nur neue Videos
deleted_videos.json → zu löschende Video-IDs
```

#### Phase 2: Chunk-Downloads (download_chunk.py)

```python
# Jeder Container lädt seinen Chunk
CHUNK_START=1, CHUNK_END=300

# Liest playlist_urls.json
urls = urls[CHUNK_START-1:CHUNK_END]

# Lädt Videos mit yt-dlp
for url in urls:
    yt-dlp --extract-audio --audio-format mp3 url
    # Speichert: video_id.mp3 und video_id.info.json
```

**Parallelisierung:**

```
Container 1: Videos 1-300   (läuft parallel)
Container 2: Videos 301-600 (läuft parallel)
Container 3: Videos 601-900 (läuft parallel)
Container 4: Videos 901-903 (startet nach Container 1/2/3)
```

#### Phase 3: Metadata-Generierung (build_metadata.py)

```python
# Scannt /songs Verzeichnis
info_files = glob('/songs/*.info.json')

# Liest alle .info.json Dateien
metadata = []
for info_file in info_files:
    with open(info_file) as f:
        data = json.load(f)
        metadata.append({
            'id': data['id'],
            'title': data['title'],
            'artist': data['uploader'],
            'filename': f"{data['id']}.mp3"
        })

# Schreibt metadata.json
with open('/songs/metadata.json', 'w') as f:
    json.dump(metadata, f)
```

#### Phase 4: Cleanup (cleanup_deleted.py)

```python
# Liest deleted_videos.json
with open('deleted_videos.json') as f:
    deleted_ids = json.load(f)

# Löscht MP3 und .info.json
for video_id in deleted_ids:
    os.remove(f'/songs/{video_id}.mp3')
    os.remove(f'/songs/{video_id}.info.json')
```

#### Phase 5: LUFS-Analyse (analyze_lufs_chunk.py)

```python
# Jeder Container analysiert seinen Chunk
CHUNK_START=1, CHUNK_END=300

# Lädt metadata.json
songs = songs_without_lufs[CHUNK_START-1:CHUNK_END]

# Analysiert mit FFmpeg
for song in songs:
    ffmpeg -i song.mp3 -af loudnorm=I=-16:TP=-1.5 -f null -
    # Extrahiert LUFS-Werte aus Ausgabe
    lufs_data = parse_ffmpeg_output()
    
    # Speichert Chunk-Ergebnis
    chunk_results[song.id] = lufs_data

# Schreibt chunk_1-300.json
```

#### Phase 6: LUFS-Merge (merge_lufs_results.py)

```python
# Liest alle Chunk-Ergebnisse
chunk_files = glob('/songs/lufs_results/chunk_*.json')
all_lufs = {}
for chunk_file in chunk_files:
    all_lufs.update(json.load(chunk_file))

# Updated metadata.json
for song in metadata:
    if song['id'] in all_lufs:
        song['lufs'] = all_lufs[song['id']]

# Löscht Chunk-Dateien nach erfolgreichem Merge
```

---

## LUFS-Analyse

### Was ist LUFS

**LUFS** = Loudness Units relative to Full Scale (EBU R128 Standard)

**Warum wichtig?**

Ohne LUFS-Normalisierung haben Songs unterschiedliche Lautstärken:

```
Song 1 (Rock):      🔊🔊🔊🔊🔊🔊🔊🔊🔊(-8 LUFS)  ← SEHR LAUT
Song 2 (Klassik):   🔊             (-20 LUFS) ← SEHR LEISE
Song 3 (Pop):       🔊🔊🔊🔊         (-14 LUFS) ← MITTEL
```

Mit LUFS-Normalisierung auf -16 LUFS:

```
Song 1 (Rock):      🔊🔊🔊🔊(-16 LUFS) ← REDUZIERT
Song 2 (Klassik):   🔊🔊🔊🔊(-16 LUFS) ← ERHÖHT
Song 3 (Pop):       🔊🔊🔊🔊(-16 LUFS) ← LEICHT ERHÖHT
```

**MetaWave-Einstellungen:**

- **Target**: -16 LUFS (Spotify/YouTube/Apple Music Standard)
- **True Peak**: -1.5 dBTP (verhindert Clipping)
- **Loudness Range**: 11 LU

### Automatische Analyse

Der Orchestrator führt LUFS-Analyse automatisch am Ende aus:

```powershell
# Standard (mit LUFS)
.\run_downloader_chunks_windows.ps1

# LUFS überspringen (nicht empfohlen)
.\run_downloader_chunks_windows.ps1 -SkipLufs

# Alle Songs neu analysieren
.\run_downloader_chunks_windows.ps1 -ForceLufs
```

**Parallelisierung:**

Die LUFS-Analyse wird auf mehrere Container aufgeteilt (gleiche Parameter wie Downloads):

```
ChunkSize=300, MaxParallel=3

Container 1: Songs 1-300   → chunk_1-300.json
Container 2: Songs 301-600 → chunk_301-600.json
Container 3: Songs 601-900 → chunk_601-900.json
                ↓
        merge_lufs_results.py
                ↓
        metadata.json (aktualisiert)
```

**Performance:**

| Songs | Sequenziell (alt) | Parallel (3 Container) | Parallel (6 Container) |
|-------|-------------------|------------------------|------------------------|
| 100 | 3-8 Minuten | 1-3 Minuten | 1-2 Minuten |
| 300 | 10-25 Minuten | 3-8 Minuten | 2-4 Minuten |
| 900 | 30-75 Minuten | 10-25 Minuten | 5-12 Minuten |

### Manuelle Analyse

**Windows (PowerShell):**

```powershell
cd docker

# Standard: Nur Songs ohne LUFS analysieren + Radio neu starten
.\run_lufs_analysis.ps1 -RestartRadio

# Force: ALLE Songs neu analysieren
.\run_lufs_analysis.ps1 -Force -RestartRadio

# Nur spezifische Songs
.\run_lufs_analysis.ps1 -Files "video_id1.mp3","video_id2.mp3" -RestartRadio

# Ohne Radio-Neustart
.\run_lufs_analysis.ps1
```

**Linux/macOS (Bash):**

```bash
cd docker

# Standard + Radio-Neustart
./run_lufs_analysis.sh --restart

# Force
./run_lufs_analysis.sh --force --restart

# Spezifische Songs
./run_lufs_analysis.sh --files "video_id1.mp3" "video_id2.mp3" --restart

# Ohne Radio-Neustart
./run_lufs_analysis.sh
```

**Direkte Docker-Befehle:**

```powershell
# Standard-Analyse
docker compose -f .\compose.enviroment.yaml run --rm `
  downloader python -u reanalyze_lufs.py

# Force-Analyse
docker compose -f .\compose.enviroment.yaml run --rm `
  downloader python -u reanalyze_lufs.py --force

# Spezifische Songs
docker compose -f .\compose.enviroment.yaml run --rm `
  downloader python -u reanalyze_lufs.py --files "song1.mp3" "song2.mp3"
```

---

## YouTube Cookies

### Wann werden Cookies benötigt

Cookies sind **erforderlich** für:

- **Private Playlists** (nicht öffentlich sichtbar)
- **Altersbeschränkte Videos** (18+)
- **YouTube Premium Inhalte**
- **Regionale Beschränkungen umgehen**
- **Rate-Limit-Probleme vermeiden**

Cookies sind **NICHT erforderlich** für:

- Öffentliche Playlists
- Nicht altersbeschränkte Videos
- Standard-Downloads

### Cookies exportieren

#### Methode 1: Browser-Extension (Empfohlen)

**Chrome/Edge:**

1. Installieren Sie: [Get cookies.txt LOCALLY](https://chrome.google.com/webstore/detail/get-cookiestxt-locally)
2. Öffnen Sie https://www.youtube.com
3. Loggen Sie sich in Ihr YouTube-Konto ein
4. Klicken Sie auf die Extension (Puzzle-Icon → Get cookies.txt)
5. Klicken Sie "Export"
6. Speichern Sie als `www.youtube.com_cookies.txt`

**Firefox:**

1. Installieren Sie: [cookies.txt](https://addons.mozilla.org/de/firefox/addon/cookies-txt/)
2. Öffnen Sie https://www.youtube.com
3. Loggen Sie sich ein
4. Klicken Sie auf die Extension
5. Klicken Sie "Current Site"
6. Speichern Sie als `www.youtube.com_cookies.txt`

#### Methode 2: yt-dlp (Fortgeschritten)

```powershell
# Chrome
yt-dlp --cookies-from-browser chrome --cookies www.youtube.com_cookies.txt "https://www.youtube.com"

# Firefox
yt-dlp --cookies-from-browser firefox --cookies www.youtube.com_cookies.txt "https://www.youtube.com"

# Edge
yt-dlp --cookies-from-browser edge --cookies www.youtube.com_cookies.txt "https://www.youtube.com"
```

#### Cookies-Format prüfen

Die Datei muss das **Netscape HTTP Cookie File Format** haben:

```
# Netscape HTTP Cookie File
# This is a generated file! Do not edit.

.youtube.com    TRUE    /    TRUE    1234567890    CONSENT    YES+cb
.youtube.com    TRUE    /    FALSE   1234567890    VISITOR_INFO1_LIVE    abcdefg
.youtube.com    TRUE    /    TRUE    1234567890    LOGIN_INFO    xyz123
```

**Erste Zeile muss sein:** `# Netscape HTTP Cookie File`

### Cookies verwenden

#### Option 1: Parameter (empfohlen für Tests)

```powershell
# Kopieren Sie Cookies ins docker-Verzeichnis
copy C:\Users\...\www.youtube.com_cookies.txt docker\www.youtube.com_cookies.txt

# Verwenden Sie -CookiesFile Parameter
cd docker
.\run_downloader_chunks_windows.ps1 -CookiesFile ".\www.youtube.com_cookies.txt"
```

#### Option 2: Umgebungsvariable (dauerhaft)

Bearbeiten Sie `docker/metawave_server/.env`:

```env
# YouTube Cookies aktivieren
YT_COOKIES=/cookies/www.youtube.com_cookies.txt
```

Kopieren Sie die Cookies-Datei:

```powershell
copy www.youtube.com_cookies.txt docker\www.youtube.com_cookies.txt
```

Starten Sie den Orchestrator:

```powershell
.\run_downloader_chunks_windows.ps1
```

**Wie funktioniert es?**

Der Orchestrator mounted automatisch die Cookies-Datei:

```yaml
# Automatisches Volume-Mount
-v ./www.youtube.com_cookies.txt:/cookies/www.youtube.com_cookies.txt
```

yt-dlp verwendet die Cookies:

```bash
yt-dlp --cookies /cookies/www.youtube.com_cookies.txt URL
```

---

## Manuelle Download-Befehle

Für fortgeschrittene Benutzer oder spezielle Szenarien.

### Einzelne Chunks

```powershell
# Videos 1-300
docker compose -f .\compose.enviroment.yaml run --rm `
  -e PLAYLIST_ITEMS="1-300" `
  downloader python -u update_playlist.py --download-only

# Videos 301-600
docker compose -f .\compose.enviroment.yaml run --rm `
  -e PLAYLIST_ITEMS="301-600" `
  downloader python -u update_playlist.py --download-only

# Videos 601-900
docker compose -f .\compose.enviroment.yaml run --rm `
  -e PLAYLIST_ITEMS="601-900" `
  downloader python -u update_playlist.py --download-only
```

### Spezifische Videos

```powershell
# Nur Video 1
docker compose -f .\compose.enviroment.yaml run --rm `
  -e PLAYLIST_ITEMS="1" `
  downloader python -u update_playlist.py

# Nur Videos 1, 5, 10
docker compose -f .\compose.enviroment.yaml run --rm `
  -e PLAYLIST_ITEMS="1,5,10" `
  downloader python -u update_playlist.py

# Videos 10-20 und 50-60
docker compose -f .\compose.enviroment.yaml run --rm `
  -e PLAYLIST_ITEMS="10-20,50-60" `
  downloader python -u update_playlist.py
```

### Metadata generieren

```powershell
# Aus allen vorhandenen .info.json Dateien
docker compose -f .\compose.enviroment.yaml run --rm `
  downloader python -u update_playlist.py --metadata-only

# Oder: Direkt build_metadata.py
docker compose -f .\compose.enviroment.yaml run --rm `
  downloader python -u build_metadata.py
```

### Mit Cookies (manuell)

```powershell
# Volume-Mount für Cookies
docker compose -f .\compose.enviroment.yaml run --rm `
  -v "${PWD}/www.youtube.com_cookies.txt:/cookies/www.youtube.com_cookies.txt" `
  -e YT_COOKIES=/cookies/www.youtube.com_cookies.txt `
  -e PLAYLIST_ITEMS="1-100" `
  downloader python -u update_playlist.py
```

---

## Erweiterte Funktionen

### Playlist synchronisieren

**Synchronisiert lokale Songs mit YouTube-Playlist:**

```powershell
# Synchronisation (ohne Download)
docker compose -f .\compose.enviroment.yaml run --rm `
  downloader python -u sync_playlist.py
```

**Ausgabe:**

```
[sync] Lade YouTube-Playlist...
[sync] Playlist enthält 905 Videos
[sync] Lade lokale metadata.json...
[sync] Lokal: 903 Songs
[sync] Neue Videos: 2
[sync] Gelöschte Videos: 0
[sync] Playlist-URLs erstellt: /songs/playlist_urls.json
```

**Erstellte Dateien:**

- `playlist_urls.json` - Nur URLs neuer Videos
- `deleted_videos.json` - Video-IDs zu löschender Videos

### Gelöschte Videos entfernen

**Löscht MP3/Info-Dateien von Videos die nicht mehr in Playlist sind:**

```powershell
# Cleanup ausführen
docker compose -f .\compose.enviroment.yaml run --rm `
  downloader python -u cleanup_deleted.py
```

**Ausgabe:**

```
[cleanup] Lade deleted_videos.json...
[cleanup] Zu löschen: 2 Videos
[cleanup] Gelöscht: old_video_id.mp3
[cleanup] Gelöscht: old_video_id.info.json
[cleanup] Cleanup abgeschlossen (2 Videos entfernt)
```

### LUFS neu berechnen

**Alle Songs neu analysieren:**

```powershell
# Force-Analyse mit Helper-Skript
.\run_lufs_analysis.ps1 -Force -RestartRadio

# Oder direkt:
docker compose -f .\compose.enviroment.yaml run --rm `
  downloader python -u reanalyze_lufs.py --force
```

**Nur Songs ohne LUFS:**

```powershell
.\run_lufs_analysis.ps1 -RestartRadio

# Oder:
docker compose -f .\compose.enviroment.yaml run --rm `
  downloader python -u reanalyze_lufs.py
```

---

## Troubleshooting

### Problem 1: "HTTP Error 403: Forbidden"

**Symptom:**

```
ERROR: unable to download video data: HTTP Error 403: Forbidden
```

**Ursache:** YouTube blockiert zu viele Anfragen oder Video ist privat/altersbeschränkt

**Lösung 1: Cookies verwenden**

```powershell
.\run_downloader_chunks_windows.ps1 -CookiesFile ".\www.youtube.com_cookies.txt"
```

**Lösung 2: Wartezeiten erhöhen**

Bearbeiten Sie `docker/metawave_server/.env`:

```env
VIDEO_DELAY_SECONDS=10
BATCH_DELAY_SECONDS=120
```

**Lösung 3: IP-Adresse wechseln**

- VPN verwenden
- Mobiles Hotspot nutzen
- Später erneut versuchen

### Problem 2: "Chunk failed"

**Symptom:**

```
[orchestrator] Chunk-Job 'chunk_2' fehlgeschlagen (ExitCode=1, State=Failed)
```

**Lösung 1: Logs prüfen**

```powershell
docker compose -f .\compose.enviroment.yaml logs downloader
```

**Lösung 2: Chunk manuell wiederholen**

```powershell
# Chunk 301-600 manuell herunterladen
docker compose -f .\compose.enviroment.yaml run --rm `
  -e PLAYLIST_ITEMS="301-600" `
  downloader python -u update_playlist.py --download-only

# Metadata aktualisieren
docker compose -f .\compose.enviroment.yaml run --rm `
  downloader python -u update_playlist.py --metadata-only
```

**Lösung 3: Kleinere Chunks**

```powershell
# ChunkSize reduzieren
.\run_downloader_chunks_windows.ps1 -ChunkSize 100
```

### Problem 3: "LUFS analysis failed"

**Symptom:**

```
[lufs-chunk] Song 42/300: FFmpeg error
```

**Lösung 1: MP3-Datei prüfen**

```powershell
# FFmpeg-Validierung
docker compose -f .\compose.enviroment.yaml exec downloader `
  sh -c "ffmpeg -v error -i /songs/video_id.mp3 -f null -"
```

**Lösung 2: Beschädigte Datei neu herunterladen**

```powershell
# Finde Video-Position in Playlist
# Dann neu herunterladen:
docker compose -f .\compose.enviroment.yaml run --rm `
  -e PLAYLIST_ITEMS="42" `
  downloader python -u update_playlist.py --force

# LUFS neu analysieren
.\run_lufs_analysis.ps1 -Files "video_id.mp3" -RestartRadio
```

### Problem 4: "No space left on device"

**Symptom:**

```
ERROR: No space left on device
```

**Lösung 1: Speicherplatz prüfen**

```powershell
# Docker Volume-Größe
docker system df -v
```

**Lösung 2: Alte Container/Images löschen**

```powershell
# Unbenutzte Images
docker image prune -a

# Unbenutzte Volumes
docker volume prune

# Komplette Bereinigung
docker system prune -a
```

**Lösung 3: Songs-Volume verschieben** (Fortgeschritten)

Siehe Docker-Dokumentation für Volume-Migration.

### Problem 5: "Cookies invalid or expired"

**Symptom:**

```
ERROR: Sign in to confirm you're not a bot
```

**Lösung 1: Neue Cookies exportieren**

```powershell
# Schritt 1: Logout und erneut Login auf YouTube
# Schritt 2: Cookies neu exportieren (siehe "Cookies exportieren")
# Schritt 3: Alte Cookies ersetzen
copy new_cookies.txt docker\www.youtube.com_cookies.txt

# Schritt 4: Erneut versuchen
.\run_downloader_chunks_windows.ps1 -CookiesFile ".\www.youtube.com_cookies.txt"
```

**Lösung 2: Cookies-Format validieren**

```powershell
# Erste Zeile muss sein:
# # Netscape HTTP Cookie File
Get-Content .\www.youtube.com_cookies.txt | Select-Object -First 1
```

### Problem 6: "Container startet nicht"

**Symptom:**

```
ERROR: Cannot start container downloader
```

**Lösung 1: Container-Logs**

```powershell
docker compose -f .\compose.enviroment.yaml logs downloader
```

**Lösung 2: Image neu bauen**

```powershell
docker compose -f .\compose.enviroment.yaml build downloader
```

**Lösung 3: Container zurücksetzen**

```powershell
# Container stoppen und löschen
docker compose -f .\compose.enviroment.yaml down

# Neu starten
docker compose -f .\compose.enviroment.yaml up -d
```

### Problem 7: "Playlist not found"

**Symptom:**

```
ERROR: Playlist does not exist
```

**Lösung 1: Playlist-URL prüfen**

Bearbeiten Sie `docker/metawave_server/.env`:

```env
# Korrekte URL:
PLAYLIST_URL=https://www.youtube.com/playlist?list=PLxxxxx

# Falsch (Fehler):
PLAYLIST_URL=https://www.youtube.com/watch?v=xxxxx&list=PLxxxxx
```

**Lösung 2: Playlist-Sichtbarkeit**

- Öffnen Sie Playlist in Browser
- Prüfen Sie ob "Public" oder "Unlisted"
- Falls "Private": Cookies verwenden

---

## Alle Befehle im Überblick

### Orchestrator

```powershell
# === WINDOWS (PowerShell) ===

# Standard
.\run_downloader_chunks_windows.ps1

# Mit Parametern
.\run_downloader_chunks_windows.ps1 -ChunkSize 200 -MaxParallel 6
.\run_downloader_chunks_windows.ps1 -SkipLufs
.\run_downloader_chunks_windows.ps1 -ForceLufs
.\run_downloader_chunks_windows.ps1 -CookiesFile ".\www.youtube.com_cookies.txt"

# Kombiniert
.\run_downloader_chunks_windows.ps1 -ChunkSize 150 -MaxParallel 8 -ForceLufs -CookiesFile ".\cookies.txt"
```

```bash
# === LINUX/macOS (Bash) ===

# Standard
./run_downloader_chunks.sh

# Mit Parametern
./run_downloader_chunks.sh --chunk-size 200 --max-parallel 6
./run_downloader_chunks.sh --skip-lufs
./run_downloader_chunks.sh --force-lufs
./run_downloader_chunks.sh --cookies-file ./www.youtube.com_cookies.txt

# Kombiniert
./run_downloader_chunks.sh --chunk-size 150 --max-parallel 8 --force-lufs --cookies-file ./cookies.txt
```

### LUFS-Analyse

```powershell
# === WINDOWS ===

# Standard + Radio-Neustart
.\run_lufs_analysis.ps1 -RestartRadio

# Force
.\run_lufs_analysis.ps1 -Force -RestartRadio

# Spezifische Dateien
.\run_lufs_analysis.ps1 -Files "song1.mp3","song2.mp3" -RestartRadio

# Ohne Radio-Neustart
.\run_lufs_analysis.ps1
```

```bash
# === LINUX/macOS ===

# Standard + Radio-Neustart
./run_lufs_analysis.sh --restart

# Force
./run_lufs_analysis.sh --force --restart

# Spezifische Dateien
./run_lufs_analysis.sh --files "song1.mp3" "song2.mp3" --restart

# Ohne Radio-Neustart
./run_lufs_analysis.sh
```

### Manuelle Downloads

```powershell
# Chunks
docker compose -f .\compose.enviroment.yaml run --rm -e PLAYLIST_ITEMS="1-300" downloader python -u update_playlist.py --download-only
docker compose -f .\compose.enviroment.yaml run --rm -e PLAYLIST_ITEMS="301-600" downloader python -u update_playlist.py --download-only

# Spezifische Videos
docker compose -f .\compose.enviroment.yaml run --rm -e PLAYLIST_ITEMS="1,5,10" downloader python -u update_playlist.py

# Metadata
docker compose -f .\compose.enviroment.yaml run --rm downloader python -u update_playlist.py --metadata-only
docker compose -f .\compose.enviroment.yaml run --rm downloader python -u build_metadata.py

# Mit Cookies
docker compose -f .\compose.enviroment.yaml run --rm `
  -v "${PWD}/www.youtube.com_cookies.txt:/cookies/www.youtube.com_cookies.txt" `
  -e YT_COOKIES=/cookies/www.youtube.com_cookies.txt `
  downloader python -u update_playlist.py
```

### Synchronisation & Cleanup

```powershell
# Playlist synchronisieren
docker compose -f .\compose.enviroment.yaml run --rm downloader python -u sync_playlist.py

# Gelöschte Videos entfernen
docker compose -f .\compose.enviroment.yaml run --rm downloader python -u cleanup_deleted.py

# LUFS-Analyse (direkt)
docker compose -f .\compose.enviroment.yaml run --rm downloader python -u reanalyze_lufs.py
docker compose -f .\compose.enviroment.yaml run --rm downloader python -u reanalyze_lufs.py --force
docker compose -f .\compose.enviroment.yaml run --rm downloader python -u reanalyze_lufs.py --files "song.mp3"
```

### Diagnose

```powershell
# Container-Status
docker compose -f .\compose.enviroment.yaml ps

# Logs
docker compose -f .\compose.enviroment.yaml logs -f
docker compose -f .\compose.enviroment.yaml logs -f downloader
docker compose -f .\compose.enviroment.yaml logs --tail 200 downloader

# Songs-Anzahl
docker compose -f .\compose.enviroment.yaml exec downloader sh -c "ls -1 /songs/*.mp3 | wc -l"

# Metadata prüfen
docker compose -f .\compose.enviroment.yaml exec downloader sh -c "cat /songs/metadata.json | head -n 50"

# LUFS-Daten zählen
docker compose -f .\compose.enviroment.yaml exec downloader sh -c "grep -c '\"lufs\"' /songs/metadata.json"

# Speicherplatz
docker system df -v
```

### Wartung

```powershell
# Container neu starten
docker compose -f .\compose.enviroment.yaml restart
docker compose -f .\compose.enviroment.yaml restart downloader

# Container stoppen
docker compose -f .\compose.enviroment.yaml down

# Container und Volumes löschen (ACHTUNG: Löscht alle Songs!)
docker compose -f .\compose.enviroment.yaml down -v

# Image neu bauen
docker compose -f .\compose.enviroment.yaml build downloader

# Aufräumen
docker image prune -a
docker volume prune
docker system prune -a
```

---

## Schnellreferenz

| Aufgabe | Windows | Linux/macOS |
|---------|---------|-------------|
| **Playlist herunterladen** | `.\run_downloader_chunks_windows.ps1` | `./run_downloader_chunks.sh` |
| **LUFS analysieren** | `.\run_lufs_analysis.ps1 -RestartRadio` | `./run_lufs_analysis.sh --restart` |
| **Mit Cookies** | `... -CookiesFile ".\cookies.txt"` | `... --cookies-file ./cookies.txt` |
| **LUFS überspringen** | `... -SkipLufs` | `... --skip-lufs` |
| **Mehr parallel** | `... -MaxParallel 6` | `... --max-parallel 6` |
| **Kleinere Chunks** | `... -ChunkSize 150` | `... --chunk-size 150` |
| **Status prüfen** | `docker compose -f .\compose.enviroment.yaml ps` | (gleich) |
| **Logs anzeigen** | `docker compose -f .\compose.enviroment.yaml logs -f downloader` | (gleich) |

---

**Version**: 2.0  
**Letzte Aktualisierung**: Januar 2026  
**Siehe auch**: [README.md](README.md), [DEPLOYMENT.md](DEPLOYMENT.md), [GET_YT_COOKIES.md](docker/GET_YT_COOKIES.md)
