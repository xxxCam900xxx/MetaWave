# MetaWave Downloader & Orchestrator

Dieses Dokument beschreibt den Ablauf und die Architektur des Downloaders sowie des Orchestrators. Es richtet sich an Entwickler:innen, die verstehen wollen, wie die Playlist verarbeitet, auf mehrere Container verteilt und am Ende die `metadata.json` für den Radio-Container erzeugt wird.

## Übersicht

**Ziele:**

- Grosse YouTube-Playlist einmal flach auslesen ("flatten").
- Downloads auf mehrere Downloader-Container (Chunks) verteilen.
- Alle Downloads in einem gemeinsamen Volume (`songs`) sammeln.
- Am Ende eine konsolidierte `metadata.json` aus allen vorhandenen `.info.json` Dateien erzeugen.
- Robustheit: Auch bei fehlerhaften Chunks sollen vorhandene Daten nutzbar bleiben.

**Zentrale Komponenten:**

- Python-Skripte in `app/metawave_server/downloader/`:
  - `update_playlist.py` (Basisfunktionen: Download, Batching, Metadata-Erzeugung).
  - `flatten_playlist.py` (Playlist flatten und nach `/songs/playlist_urls.json` schreiben).
  - `download_chunk.py` (einen URL-Bereich aus der geflatteten Playlist herunterladen).
  - `build_metadata.py` (kombinierte `metadata.json` aus allen `.info.json`).
- Docker-Image für den Downloader:
  - Dockerfile: `docker/metawave_server/dockerfile.downloader`.
- Orchestrator-Skript:
  - `docker/run_downloader_chunks.ps1`.

---

## Downloader-Basislogik (`update_playlist.py`)

Die Datei `update_playlist.py` enthält die Kernlogik zum Herunterladen und zum Erzeugen von Metadaten.

Wichtige Konstanten:

```python
SONGS_DIR = Path("/songs")
METADATA_FILE = SONGS_DIR / "metadata.json"
PLAYLIST_FILE = SONGS_DIR / "playlist_urls.json"
SONGS_DIR.mkdir(parents=True, exist_ok=True)
```

### Playlist laden

Für das Laden der Playlist direkt via `yt-dlp` gibt es die Funktion `get_playlist_entries`:

```python
def get_playlist_entries(playlist_url: str):
    cmd = [
        sys.executable,
        "-m",
        "yt_dlp",
        "--ignore-errors",
        "--flat-playlist",
        "-J",
        playlist_url,
    ]

    success, rate_limited = run_with_retries(cmd, "Playlist laden")
    # ... Ergebnis parsen, URLs in eine Liste schreiben ...
    return urls
```

Diese Funktion wird intern z.B. im Standard-Downloadmodus verwendet, aber für das Chunking gibt es eine spezialisierte Variante in `flatten_playlist.py` (siehe unten).

### Downloads in Batches

Die Funktion `download_in_batches` übernimmt das Throttling (Batchgrösse, Pausen, ETA-Berechnung):

```python
def download_in_batches(video_urls):
    total = len(video_urls)
    downloaded = 0
    processed = 0

    for batch_start in range(0, total, BATCH_SIZE):
        batch = video_urls[batch_start:batch_start + BATCH_SIZE]
        # ... Logging, Aufruf von download_video(...) ...

    print(f"[downloader] Fertig. {downloaded}/{total} verarbeitet.")
```

Der eigentliche `yt-dlp`-Aufruf steckt in `download_video` und `run_with_retries`, inkl. Rate-Limit-Erkennung und Backoff.

### Metadaten bauen

`build_metadata` scannt alle `.info.json` Dateien im `SONGS_DIR` und erzeugt daraus `metadata.json`:

```python
def build_metadata():
    metadata = []

    for file in SONGS_DIR.glob("*.info.json"):
        with open(file, "r", encoding="utf-8") as f:
            data = json.load(f)
        mp3_file = file.with_suffix("").with_suffix(".mp3")
        metadata.append({
            "title": data.get("title"),
            "author": data.get("uploader"),
            "duration": data.get("duration"),
            "cover": data.get("thumbnail"),
            "filename": mp3_file.name,
        })

    with open(METADATA_FILE, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    print(f"[downloader] Metadata erstellt ({len(metadata)} Einträge).")
```

Diese Funktion wird sowohl vom "klassischen" Modus als auch von `build_metadata.py` (siehe unten) verwendet.

---

## Flatten: Einmalige Playlist-Auswertung (`flatten_playlist.py`)

Pfad: `app/metawave_server/downloader/flatten_playlist.py`

Aufgabe:

- `PLAYLIST_URL` aus der Umgebung lesen.
- Die komplette Playlist mit `yt-dlp` flach auslesen.
- Alle Video-URLs in `/songs/playlist_urls.json` schreiben.
- Die Gesamtanzahl der Videos auf stdout ausgeben (für den Orchestrator).

Kernlogik:

```python
from update_playlist import flatten_playlist_to_file, PLAYLIST_FILE

if __name__ == "__main__":
    playlist_url = os.environ.get("PLAYLIST_URL")
    if not playlist_url:
        print("[flatten] Fehler: PLAYLIST_URL nicht gesetzt.")
        raise SystemExit(1)

    count = flatten_playlist_to_file(playlist_url, PLAYLIST_FILE)
    print(count)
    sys.exit(0 if count > 0 else 1)
```

Die Funktion `flatten_playlist_to_file` sitzt in `update_playlist.py` und übernimmt den eigentlichen `yt-dlp`-Aufruf und das Schreiben der JSON-Datei.

---

## Chunk-Download: Ein Teilbereich der Playlist (`download_chunk.py`)

Pfad: `app/metawave_server/downloader/download_chunk.py`

Aufgabe:

- Bereits geflattete Playlist aus `PLAYLIST_FILE` laden.
- Umgebungsvariablen `CHUNK_START` und `CHUNK_END` lesen.
- Den entsprechenden Slice der URL-Liste herunterladen.

Kernlogik:

```python
from update_playlist import PLAYLIST_FILE, download_in_batches

if __name__ == "__main__":
    if not PLAYLIST_FILE.exists():
        print("[download_chunk] Fehler: Playlist-Datei existiert nicht.")
        raise SystemExit(1)

    start_str = os.environ.get("CHUNK_START")
    end_str = os.environ.get("CHUNK_END")
    if not start_str or not end_str:
        print("[download_chunk] Fehler: CHUNK_START und CHUNK_END müssen gesetzt sein.")
        raise SystemExit(1)

    chunk_start = int(start_str)
    chunk_end = int(end_str)

    with open(PLAYLIST_FILE, "r", encoding="utf-8") as f:
        all_urls = json.load(f)

    urls_slice = all_urls[chunk_start - 1:chunk_end]
    print(f"[download_chunk] Starte Chunk-Download für Range {chunk_start}-{chunk_end}...")
    download_in_batches(urls_slice)
```

Jeder Downloader-Container bekommt also nur einen definierten Bereich der Playlist zugewiesen und schreibt seine MP3s + `.info.json` ins gemeinsame `songs`-Volume.

---

## Metadaten separat bauen (`build_metadata.py`)

Pfad: `app/metawave_server/downloader/build_metadata.py`

Aufgabe:

- Die konsolidierte `metadata.json` aus allen vorhandenen `.info.json` im `songs`-Volume erzeugen.
- Wird typischerweise am Ende des Orchestrator-Laufs ausgeführt.

Kernlogik:

```python
from update_playlist import build_metadata

if __name__ == "__main__":
    print("[build_metadata] Erzeuge combined metadata.json...")
    build_metadata()
    print("[build_metadata] Fertig.")
```

Damit ist die Metadaten-Erzeugung entkoppelt vom eigentlichen Download.

---

## Docker-Image für den Downloader

Pfad Dockerfile: `docker/metawave_server/dockerfile.downloader`

Wesentliche Punkte:

- Basierend auf `python:3.12-slim` mit `ffmpeg` und `nodejs`.
- Installation der Python-Abhängigkeiten aus `requirements.txt`.
- Alle Downloader-Skripte werden ins Image kopiert:

```dockerfile
WORKDIR /app

COPY app/metawave_server/downloader/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Alle Downloader-Skripte ins Image kopieren
COPY app/metawave_server/downloader/*.py .

VOLUME ["/songs"]
CMD ["python", "-u", "update_playlist.py"]  # Default-Entry, wird bei docker compose up genutzt
```

Für die Orchestrierung werden die Skripte explizit angegeben, z.B. `python -u flatten_playlist.py` oder `python -u download_chunk.py`.

---

## Orchestrator-Skript (`run_downloader_chunks.ps1`)

Pfad: `docker/run_downloader_chunks.ps1`

Aufgabe:

- Einmalige Flatten-Phase ausführen.
- Playlist-Länge ermitteln und Chunks berechnen.
- Pro Chunk bis zu `MaxParallel` Downloader-Container parallel starten.
- Am Ende `build_metadata.py` ausführen, um `metadata.json` zu erzeugen – auch wenn einzelne Chunks fehlschlagen (dann mit Teilbestand).

### Parameter

```powershell
param(
    [int]$ChunkSize = 300,
    [int]$MaxParallel = 3
)
```

- `ChunkSize`: Anzahl Videos pro Chunk.
- `MaxParallel`: Maximale Anzahl paralleler Downloader-Container.

### Flatten-Phase

```powershell
Write-Host "[orchestrator] Flatten der Playlist via Container und Ermittlung der Länge..."
$dumpResult = docker compose -f .\compose.enviroment.yaml run --rm downloader python -u flatten_playlist.py 2>&1
# Aus der Ausgabe wird die letzte Zeile mit einer Zahl als Playlist-Länge interpretiert.
```

### Chunk-Berechnung

```powershell
$chunks = @()
for ($start = 1; $start -le $total; $start += $ChunkSize) {
    $end = [Math]::Min($start + $ChunkSize - 1, $total)
    $chunks += ,@($start, $end)
}
```

### Paralleler Chunk-Download

Für jeden Chunk wird ein PowerShell-Job gestartet, der intern `docker compose run` aufruft und `CHUNK_START`/`CHUNK_END` setzt:

```powershell
$job = Start-Job -Name "chunk_$chunkIndex" -ScriptBlock {
    param($startInner, $endInner, $rangeInner, $scriptDirInner, $pathInner)

    Set-Location $scriptDirInner
    $env:PATH = $pathInner

    $containerName = "downloader-chunk-$rangeInner"
    $cmd = "docker compose -f .\compose.enviroment.yaml run --rm --name $containerName -e CHUNK_START=$startInner -e CHUNK_END=$endInner downloader python -u download_chunk.py"

    $output = Invoke-Expression $cmd 2>&1
    $output | ForEach-Object { Write-Host "[orchestrator][job][$rangeInner] $_" }
    $exitCode = $LASTEXITCODE

    if ($exitCode -ne 0) {
        Write-Host "[orchestrator][job] Fehler in Chunk $rangeInner, ExitCode=$exitCode" -ForegroundColor Red
    } else {
        Write-Host "[orchestrator][job] Chunk $rangeInner erfolgreich" -ForegroundColor Green
    }

    return $exitCode
} -ArgumentList $start, $end, $range, $scriptDir, $pathForJobs
```

- Jeder Container bekommt einen sprechenden Namen wie `downloader-chunk-1-300`.
- `MaxParallel` begrenzt die Anzahl gleichzeitig laufender Jobs.

### Fehlerhandling und Metadaten

Nach Abschluss aller Jobs werden die Exit-Codes ausgewertet:

```powershell
$failed = $false
foreach ($job in $jobs) {
    $result = Receive-Job $job -Keep -ErrorAction SilentlyContinue
    # ... ExitCode auslesen ...
    if ($exitCode -ne 0 -or $job.State -ne 'Completed') {
        $failed = $true
        Write-Host "[orchestrator] Chunk-Job '$($job.Name)' fehlgeschlagen..." -ForegroundColor Red
    }
}

if ($failed) {
    Write-Host "[orchestrator] Achtung: Mindestens ein Chunk ist fehlgeschlagen. Metadaten werden mit den vorhandenen Dateien erstellt (Teilbestand)." -ForegroundColor Yellow
}
```

Anschliessend wird – unabhängig davon, ob einige Chunks fehlgeschlagen sind – `build_metadata.py` ausgeführt:

```powershell
Write-Host "[orchestrator] Erzeuge jetzt kombinierte metadata.json aus allen vorhandenen .info.json Dateien..."

docker compose -f .\compose.enviroment.yaml run --rm downloader python -u build_metadata.py
```

So wird sichergestellt, dass immer eine konsistente `metadata.json` für den aktuellen Stand im `songs`-Volume vorliegt.

---

## Ablauf im Überblick

1. **Flatten**
   - Container: `downloader`
   - Kommando: `python -u flatten_playlist.py`
   - Ergebnis: `/songs/playlist_urls.json` + Anzahl Videos.

2. **Chunks berechnen**
   - Script: `run_downloader_chunks.ps1`
   - Teilt die Playlist in Bereiche à `ChunkSize` auf.

3. **Chunk-Downloads (parallel)**
   - Container: `downloader-chunk-<start>-<end>` (bis zu `MaxParallel` gleichzeitig)
   - Kommando je Container: `python -u download_chunk.py` mit `CHUNK_START`/`CHUNK_END`.
   - Ergebnis: MP3s + `.info.json` im `songs`-Volume.

4. **Metadaten bauen**
   - Container: `downloader`
   - Kommando: `python -u build_metadata.py`
   - Ergebnis: `metadata.json` im `songs`-Volume (für den Radio-Container).

5. **Radio-Service**
   - Nutzt die Dateien aus dem `songs`-Volume inkl. `metadata.json`, um die Playlist im Radio bereitzustellen.

Damit ist der komplette Flow des Downloader-Setups und des Orchestrators dokumentiert.
