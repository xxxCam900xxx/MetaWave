<#
Runs LUFS re-analysis inside the downloader container.

Usage examples:
  # Analyze only missing values
  .\run_lufs_analysis.ps1

  # Force reanalyse all songs
  .\run_lufs_analysis.ps1 -Force

  # Analyse specific files
  .\run_lufs_analysis.ps1 -Files "Song A.mp3","Song B.mp3"

  # Analyse and restart radio afterwards
  .\run_lufs_analysis.ps1 -Force -RestartRadio
#>

param(
    [switch]$Force,
    [string[]]$Files,
    [switch]$RestartRadio
)

$ComposeFile = "compose.enviroment.yaml"
$BaseArgs = @("compose","-f",$ComposeFile,"run","--rm","downloader","python","-u","reanalyze_lufs.py")

if ($Force) {
    $BaseArgs += "--force"
}

if ($Files) {
    foreach ($f in $Files) {
        $BaseArgs += "--files"
        $BaseArgs += $f
    }
}

Write-Host "Running: docker $($BaseArgs -join ' ')"

& docker @BaseArgs

if ($LASTEXITCODE -ne 0) {
    Write-Error "reanalyze_lufs.py failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

if ($RestartRadio) {
    Write-Host "Restarting radio container..."
    & docker compose -f $ComposeFile restart radio
}

Write-Host "Done."