param(
    [int]$ChunkSize = 300,
    [int]$MaxParallel = 3,
    [string]$CookiesFile = ""
)

$ErrorActionPreference = "Stop"

Write-Host "[orchestrator] Verwende ChunkSize=$ChunkSize, MaxParallel=$MaxParallel" -ForegroundColor Cyan

# Optional: Cookie-Datei (z.B. www.youtube.com_cookies.txt) für authentifizierte YouTube-Requests
# Wenn gesetzt, wird sie als ReadOnly-Volume in den Downloader-Container gemountet und
# als Umgebungsvariable YT_COOKIES=/cookies/www.youtube.com_cookies.txt weitergereicht.
$cookieVolumeArg = ""
$cookieEnvArg = ""
if ($CookiesFile -ne "") {
    try {
        $abs = (Resolve-Path $CookiesFile).Path
        # WICHTIG: kompletter host:container:ro-Teil muss in einem Argument gequotet werden,
        # damit Docker Compose den Pfad nicht in Service-Name und Rest zerschneidet.
        $cookieMount = "$($abs):/cookies/www.youtube.com_cookies.txt:ro"
        $cookieVolumeArg = "-v `"$cookieMount`""
        $cookieEnvArg = "-e YT_COOKIES=/cookies/www.youtube.com_cookies.txt"
        Write-Host "[orchestrator] Verwende Cookie-Datei: $abs" -ForegroundColor Cyan
    }
    catch {
        Write-Host "[orchestrator] Warnung: Konnte CookiesFile '$CookiesFile' nicht auflösen. Fahre ohne Cookies fort." -ForegroundColor Yellow
        $cookieVolumeArg = ""
        $cookieEnvArg = ""
    }
}

# Stelle sicher, dass wir im docker-Verzeichnis sind
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

# 1) Playlist-Länge in einem Downloader-Container ermitteln
Write-Host "[orchestrator] Flatten der Playlist via Container und Ermittlung der Länge..." -ForegroundColor Cyan

# WICHTIG: Hier rufen wir python explizit auf, da ein zusätzliches Argument
# sonst als eigenes Kommando interpretiert würde.
# --flatten-playlist schreibt die komplette URL-Liste in /songs/playlist_urls.json
# und gibt am Ende die reine Anzahl der Einträge aus.
$flattenCmd = "docker compose -f .\compose.enviroment.yaml run --rm $cookieVolumeArg $cookieEnvArg downloader python -u flatten_playlist.py"
Write-Host "[orchestrator] Befehl (flatten): $flattenCmd" -ForegroundColor DarkGray
$dumpResult = Invoke-Expression $flattenCmd 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "[orchestrator] Fehler beim Ermitteln der Playlist-Länge:" -ForegroundColor Red
    Write-Host $dumpResult
    exit 1
}

# Letzte Zeile suchen, die nur aus Ziffern besteht (Anzahl)
$lines = $dumpResult -split "`n"
[int]$total = 0
foreach ($line in $lines) {
    $trimmed = $line.Trim()
    if ($trimmed -match '^[0-9]+$') {
        $total = [int]$trimmed
    }
}

if ($total -le 0) {
    Write-Host "[orchestrator] Konnte keine gültige Playlist-Länge ausgeben. Ausgabe:" -ForegroundColor Red
    Write-Host $dumpResult
    exit 1
}

Write-Host "[orchestrator] Playlist-Länge: $total Videos" -ForegroundColor Green

# 2) 300er (oder konfigurierbare) Chunks berechnen
$chunks = @()
for ($start = 1; $start -le $total; $start += $ChunkSize) {
    $end = [Math]::Min($start + $ChunkSize - 1, $total)
    $chunks += ,@($start, $end)
}
Write-Host "[orchestrator] Starte $($chunks.Count) Downloader-Runs (max. $MaxParallel parallel)..." -ForegroundColor Cyan

# 3) Für jeden Chunk einen Downloader-Run mit CHUNK_START/CHUNK_END und download_chunk.py (parallelisiert)
$jobs = @()
$chunkIndex = 0
$pathForJobs = $env:PATH
foreach ($chunk in $chunks) {
    $chunkIndex++
    $start = $chunk[0]
    $end = $chunk[1]
    $range = "$start-$end"

    # Throttling: nicht mehr als $MaxParallel Jobs gleichzeitig laufen lassen
    while ((@($jobs | Where-Object { $_.State -eq 'Running' })).Count -ge $MaxParallel) {
        Start-Sleep -Seconds 5
    }

    Write-Host "[orchestrator] Starte Chunk $chunkIndex/$($chunks.Count): Range=$range" -ForegroundColor Yellow

    $job = Start-Job -Name "chunk_$chunkIndex" -ScriptBlock {
        param($startInner, $endInner, $rangeInner, $scriptDirInner, $pathInner)

        # Sicherstellen, dass wir im docker-Verzeichnis sind und docker im PATH ist
        Set-Location $scriptDirInner
        $env:PATH = $pathInner

        Write-Host "[orchestrator][job] Chunk $rangeInner gestartet" -ForegroundColor Yellow

        # Eindeutiger Container-Name mit Chunk-Range, damit man die Container im Docker Desktop leicht erkennt
        $containerName = "downloader-chunk-$rangeInner"
        $cmd = "docker compose -f .\compose.enviroment.yaml run --rm --name $containerName $using:cookieVolumeArg $using:cookieEnvArg -e CHUNK_START=$startInner -e CHUNK_END=$endInner downloader python -u download_chunk.py"
        Write-Host "[orchestrator][job] Befehl: $cmd" -ForegroundColor DarkGray
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

    $jobs += $job
}

Write-Host "[orchestrator] Warte auf alle Downloader-Jobs..." -ForegroundColor Cyan
Wait-Job -Job $jobs | Out-Null

# Ergebnisse einsammeln und prüfen, ob irgendein Chunk fehlgeschlagen ist
$failed = $false
foreach ($job in $jobs) {
    $result = Receive-Job $job -Keep -ErrorAction SilentlyContinue

    # Rückgabewert kann int oder Array sein; wir interessieren uns nur für den letzten int
    $exitCode = 0
    if ($result -is [int]) {
        $exitCode = $result
    } elseif ($result -is [object[]]) {
        $ints = $result | Where-Object { $_ -is [int] }
        if ($ints.Count -gt 0) { $exitCode = $ints[-1] }
    }

    if ($exitCode -ne 0 -or $job.State -ne 'Completed') {
        $failed = $true
        Write-Host "[orchestrator] Chunk-Job '$($job.Name)' fehlgeschlagen (ExitCode=$exitCode, State=$($job.State))." -ForegroundColor Red
    }
}

if ($failed) {
    Write-Host "[orchestrator] Achtung: Mindestens ein Chunk ist fehlgeschlagen. Metadaten werden mit den vorhandenen Dateien erstellt (Teilbestand)." -ForegroundColor Yellow
}

# Zusätzliche Sicherheitsprüfung: sind noch Downloader-Container aktiv?
Write-Host "[orchestrator] Prüfe, ob noch Downloader-Container laufen..." -ForegroundColor Cyan
$runningDownloaders = docker ps --format "{{.Names}}" | Where-Object { $_ -like "*downloader*" }
if ($runningDownloaders) {
    Write-Host "[orchestrator] Warnung: Es sind noch Downloader-Container aktiv:" -ForegroundColor Yellow
    $runningDownloaders | ForEach-Object { Write-Host "  $_" }
    Write-Host "[orchestrator] Warte 10 Sekunden und versuche es erneut..." -ForegroundColor Yellow
    Start-Sleep -Seconds 10
    $runningDownloaders = docker ps --format "{{.Names}}" | Where-Object { $_ -like "*downloader*" }
    if ($runningDownloaders) {
        Write-Host "[orchestrator] Downloader-Container laufen weiterhin. Abbruch vor Metadata-Erstellung." -ForegroundColor Red
        exit 1
    }
}

# 4) Zum Schluss einmalig Metadaten erzeugen
Write-Host "[orchestrator] Erzeuge jetzt kombinierte metadata.json aus allen vorhandenen .info.json Dateien..." -ForegroundColor Cyan

$metadataCmd = "docker compose -f .\compose.enviroment.yaml run --rm $cookieVolumeArg $cookieEnvArg downloader python -u build_metadata.py"
Write-Host "[orchestrator] Befehl (metadata): $metadataCmd" -ForegroundColor DarkGray
Invoke-Expression $metadataCmd

if ($LASTEXITCODE -ne 0) {
    Write-Host "[orchestrator] Fehler beim Erzeugen der Metadaten (trotz vorhandener Dateien)." -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host "[orchestrator] Fertig: metadata.json aus allen aktuell vorhandenen Dateien erstellt." -ForegroundColor Green
