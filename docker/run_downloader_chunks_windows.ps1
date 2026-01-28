param(
    [int]$ChunkSize = 300,
    [int]$MaxParallel = 3,
    [string]$CookiesFile = "",
    [switch]$SkipLufs,
    [switch]$ForceLufs
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
        # RW-Mount, damit yt-dlp Cookies aktualisieren kann
        $cookieMount = "$($abs):/cookies/www.youtube.com_cookies.txt"
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

# 1) Playlist synchronisieren: Diff zwischen lokal und remote berechnen
Write-Host "[orchestrator] Synchronisiere Playlist (nur neue Videos werden geladen)..." -ForegroundColor Cyan

# sync_playlist.py liest alte metadata.json, vergleicht mit YouTube-Playlist,
# schreibt nur neue URLs in playlist_urls.json und gelöschte IDs in deleted_videos.json
$syncCmd = "docker compose -f .\compose.enviroment.yaml run --rm $cookieVolumeArg $cookieEnvArg downloader python -u sync_playlist.py"
Write-Host "[orchestrator] Befehl (sync): $syncCmd" -ForegroundColor DarkGray
$syncResult = Invoke-Expression $syncCmd 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "[orchestrator] Fehler beim Synchronisieren der Playlist:" -ForegroundColor Red
    Write-Host $syncResult
    exit 1
}

# Letzte Zeile suchen, die nur aus Ziffern besteht (Anzahl NEUER Videos)
$lines = $syncResult -split "`n"
[int]$total = 0
foreach ($line in $lines) {
    $trimmed = $line.Trim()
    if ($trimmed -match '^[0-9]+$') {
        $total = [int]$trimmed
    }
}

if ($total -le 0) {
    Write-Host "[orchestrator] Keine neuen Videos zum Download. Playlist ist synchron!" -ForegroundColor Green
    
    # Cleanup gelöschter Videos trotzdem durchführen
    Write-Host "[orchestrator] Prüfe auf gelöschte Videos..." -ForegroundColor Cyan
    $cleanupCmd = "docker compose -f .\compose.enviroment.yaml run --rm $cookieVolumeArg $cookieEnvArg downloader python -u cleanup_deleted.py"
    Invoke-Expression $cleanupCmd
    
    # Metadata neu generieren (falls Cleanup etwas gelöscht hat)
    Write-Host "[orchestrator] Aktualisiere metadata.json..." -ForegroundColor Cyan
    $metadataCmd = "docker compose -f .\compose.enviroment.yaml run --rm $cookieVolumeArg $cookieEnvArg downloader python -u build_metadata.py"
    Invoke-Expression $metadataCmd
    
    Write-Host "[orchestrator] Synchronisation abgeschlossen (keine Downloads nötig)." -ForegroundColor Green
    exit 0
}

Write-Host "[orchestrator] Neue Videos: $total" -ForegroundColor Green

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

# 4.5) Cleanup gelöschter Videos
Write-Host "[orchestrator] Lösche Videos die nicht mehr in der Playlist sind..." -ForegroundColor Cyan
$cleanupCmd = "docker compose -f .\compose.enviroment.yaml run --rm $cookieVolumeArg $cookieEnvArg downloader python -u cleanup_deleted.py"
Invoke-Expression $cleanupCmd

if ($LASTEXITCODE -ne 0) {
    Write-Host "[orchestrator] Warnung: Cleanup fehlgeschlagen, aber Downloads sind OK." -ForegroundColor Yellow
}

# Metadata nochmal neu generieren nach Cleanup
Write-Host "[orchestrator] Aktualisiere metadata.json nach Cleanup..." -ForegroundColor Cyan
$metadataCmd = "docker compose -f .\compose.enviroment.yaml run --rm $cookieVolumeArg $cookieEnvArg downloader python -u build_metadata.py"
Invoke-Expression $metadataCmd

# 5) Automatische LUFS-Analyse (falls nicht übersprungen) - PARALLELISIERT
if (-not $SkipLufs) {
    Write-Host "[orchestrator] Starte automatische LUFS-Analyse (parallelisiert)..." -ForegroundColor Cyan
    
    # 5a) Finde alle Songs die LUFS-Analyse brauchen
    Write-Host "[orchestrator] Ermittle Songs für LUFS-Analyse..." -ForegroundColor Cyan
    $forceFlag = if ($ForceLufs) { "-e FORCE_LUFS=1" } else { "" }
    $countCmd = "docker compose -f .\compose.enviroment.yaml run --rm $cookieVolumeArg $cookieEnvArg $forceFlag downloader python -u -c `"from analyze_lufs_chunk import get_songs_to_analyze; songs = get_songs_to_analyze($($ForceLufs.ToString().ToLower())); print(len(songs))`""
    $songCountRaw = Invoke-Expression $countCmd 2>&1 | Select-Object -Last 1
    $songCount = 0
    if ([int]::TryParse($songCountRaw, [ref]$songCount) -and $songCount -gt 0) {
        Write-Host "[orchestrator] Gefunden: $songCount Songs für LUFS-Analyse" -ForegroundColor Yellow
        
        # 5b) Erstelle Chunks für LUFS-Analyse (1-basiert)
        $lufsChunks = @()
        for ($i = 1; $i -le $songCount; $i += $ChunkSize) {
            $chunkEnd = [Math]::Min($i + $ChunkSize - 1, $songCount)
            $lufsChunks += ,@($i, $chunkEnd)
        }
        
        Write-Host "[orchestrator] LUFS-Chunks: $($lufsChunks.Count) (ChunkSize=$ChunkSize, MaxParallel=$MaxParallel)" -ForegroundColor Yellow
        
        # 5c) Parallel LUFS-Analyse
        $lufsJobs = @()
        $lufsChunkIndex = 0
        foreach ($lufsChunk in $lufsChunks) {
            $lufsChunkIndex++
            $lufsStart = $lufsChunk[0]
            $lufsEnd = $lufsChunk[1]
            $lufsRange = "$lufsStart-$lufsEnd"
            
            # Throttling: nicht mehr als $MaxParallel Jobs gleichzeitig
            while ((@($lufsJobs | Where-Object { $_.State -eq 'Running' })).Count -ge $MaxParallel) {
                Start-Sleep -Seconds 5
            }
            
            Write-Host "[orchestrator] Starte LUFS-Chunk $lufsChunkIndex/$($lufsChunks.Count): Range=$lufsRange" -ForegroundColor Yellow
            
            $lufsJob = Start-Job -Name "lufs_chunk_$lufsChunkIndex" -ScriptBlock {
                param($startInner, $endInner, $rangeInner, $scriptDirInner, $pathInner, $forceFlagInner)
                
                Set-Location $scriptDirInner
                $env:PATH = $pathInner
                
                Write-Host "[orchestrator][lufs] LUFS-Chunk $rangeInner gestartet" -ForegroundColor Yellow
                
                $containerName = "lufs-chunk-$rangeInner"
                $cmd = "docker compose -f .\compose.enviroment.yaml run --rm --name $containerName $using:cookieVolumeArg $using:cookieEnvArg $forceFlagInner -e CHUNK_START=$startInner -e CHUNK_END=$endInner downloader python -u analyze_lufs_chunk.py"
                Write-Host "[orchestrator][lufs] Befehl: $cmd" -ForegroundColor DarkGray
                $output = Invoke-Expression $cmd 2>&1
                $output | ForEach-Object { Write-Host "[orchestrator][lufs][$rangeInner] $_" }
                $exitCode = $LASTEXITCODE
                
                if ($exitCode -ne 0) {
                    Write-Host "[orchestrator][lufs] Fehler in LUFS-Chunk $rangeInner, ExitCode=$exitCode" -ForegroundColor Red
                } else {
                    Write-Host "[orchestrator][lufs] LUFS-Chunk $rangeInner erfolgreich" -ForegroundColor Green
                }
                
                return $exitCode
            } -ArgumentList $lufsStart, $lufsEnd, $lufsRange, $scriptDir, $pathForJobs, $forceFlag
            
            $lufsJobs += $lufsJob
        }
        
        Write-Host "[orchestrator] Warte auf alle LUFS-Jobs..." -ForegroundColor Cyan
        Wait-Job -Job $lufsJobs | Out-Null
        
        # 5d) Prüfe Ergebnisse
        $lufsFailed = $false
        foreach ($lufsJob in $lufsJobs) {
            $result = Receive-Job $lufsJob -Keep -ErrorAction SilentlyContinue
            $exitCode = 0
            if ($result -is [int]) {
                $exitCode = $result
            } elseif ($result -is [object[]]) {
                $ints = $result | Where-Object { $_ -is [int] }
                if ($ints.Count -gt 0) { $exitCode = $ints[-1] }
            }
            
            if ($exitCode -ne 0 -or $lufsJob.State -ne 'Completed') {
                $lufsFailed = $true
                Write-Host "[orchestrator] LUFS-Job '$($lufsJob.Name)' fehlgeschlagen (ExitCode=$exitCode, State=$($lufsJob.State))." -ForegroundColor Red
            }
        }
        
        # 5e) Merge LUFS-Ergebnisse
        if (-not $lufsFailed) {
            Write-Host "[orchestrator] Merge LUFS-Ergebnisse..." -ForegroundColor Cyan
            $mergeCmd = "docker compose -f .\compose.enviroment.yaml run --rm $cookieVolumeArg $cookieEnvArg downloader python -u merge_lufs_results.py"
            Invoke-Expression $mergeCmd
            
            if ($LASTEXITCODE -ne 0) {
                Write-Host "[orchestrator] LUFS-Merge fehlgeschlagen." -ForegroundColor Red
            } else {
                Write-Host "[orchestrator] LUFS-Analyse erfolgreich abgeschlossen." -ForegroundColor Green
                
                # Radio-Neustart damit neue LUFS-Werte geladen werden
                Write-Host "[orchestrator] Starte Radio neu damit neue LUFS-Werte geladen werden..." -ForegroundColor Cyan
                docker compose -f ".\metawave_server\compose.server.yaml" restart radio
                Write-Host "[orchestrator] Radio wurde neugestartet." -ForegroundColor Green
            }
        } else {
            Write-Host "[orchestrator] LUFS-Analyse fehlgeschlagen (mindestens ein Chunk)." -ForegroundColor Yellow
        }
        
    } elseif ($songCount -eq 0) {
        Write-Host "[orchestrator] Keine Songs brauchen LUFS-Analyse." -ForegroundColor Green
    } else {
        Write-Host "[orchestrator] Fehler beim Ermitteln der Song-Anzahl für LUFS." -ForegroundColor Red
    }
} else {
    Write-Host "[orchestrator] LUFS-Analyse übersprungen (-SkipLufs gesetzt). Starte manuell: .\run_lufs_analysis.ps1 -RestartRadio" -ForegroundColor Yellow
}

Write-Host "[orchestrator] Alle Schritte abgeschlossen." -ForegroundColor Green
