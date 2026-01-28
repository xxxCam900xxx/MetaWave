# YouTube Cookies: Lokal exportieren und im MetaWave-Downloader nutzen

**Zusammenfassung:** Exportiere deine YouTube-Cookies lokal, speichere die Datei sicher (nicht ins Repo), kopiere sie in den Downloader-Ordner und baue das Downloader-Image neu. Dann kannst du Downloads mit authentifizierten Requests ausführen.

**Wann brauchst du Cookies?**
- Altersbeschränkte Videos (18+)
- Private/Unlisted Videos aus deinen eigenen Playlists
- Um YouTube Rate-Limits zu umgehen
- Bei "Sign in to confirm you're not a bot" Fehlern

**Wichtig:** 
- ⚠️ Verwende nur eigene Accounts oder Test-Accounts
- ⚠️ Teile oder committe die Cookies niemals ins Git-Repository
- ⚠️ Cookies enthalten Session-Tokens - behandle sie wie Passwörter

---

## 1) Optionen zum Exportieren der Cookies

A) Browser-Extension (einfach, empfohlen)

**Chrome/Edge:**
1. Installiere Extension "Get cookies.txt LOCALLY" (von Ninh Pham) aus dem Chrome Web Store
   - Link: https://chrome.google.com/webstore (suche nach "get cookies.txt locally")
2. Öffne `https://www.youtube.com` und melde dich mit deinem Account an
3. Klicke auf die Extension (Puzzle-Icon oben rechts)
4. Klicke auf "Export" oder "Download"
5. Wähle "Netscape" Format
6. Speichere als `www.youtube.com_cookies.txt` in einem sicheren Ordner (z.B. `C:\temp`)

**Firefox:**
1. Installiere Extension "cookies.txt" aus den Firefox Add-ons
2. Öffne `https://www.youtube.com` und melde dich an
3. Klicke auf die Extension
4. "Export Cookies" → "Current Site"
5. Speichere als `www.youtube.com_cookies.txt`

**Alternativen:**
- "EditThisCookie" (Chrome/Edge) - Export als Netscape Format
- "Cookie-Editor" (Firefox/Chrome) - Manueller Export

B) `yt-dlp` Option: `--cookies-from-browser`
- Liefert Cookies direkt aus deinem Browserprofil (kein manuelles Exportfile), z.B.:

```powershell
yt-dlp --cookies-from-browser chrome "https://www.youtube.com/watch?v=NoEMIVx4J78"
```

- Hinweis: `--cookies-from-browser` funktioniert lokal; in Docker-Containern kann es komplizierter sein (Zugriff auf Browserprofile). Für den Container-Workflow ist ein manuelles `cookies.txt`‑File meist praktischer.

C) Manuelles Kopieren von Browser-Cookies (fortgeschritten)
- Für Spezialfälle, nicht empfohlen für Casual-Use. Nutze die Extension oder `--cookies-from-browser` statt manuellem DB-Pfaden.

---

## 2) Datei sichern und .gitignore prüfen

- Speichere die Datei lokal, z.B. `C:\Users\<du>\Downloads\www.youtube.com_cookies.txt`.
- Stelle sicher, dass die Datei nicht ins Git-Repo gelangt. In diesem Projekt sollte `.gitignore` die Datei bereits ausschliessen; prüfe, dass `www.youtube.com_cookies.txt` aufgeführt ist.

---

## 3) Cookie in den Downloader integrieren

### Methode A: Image-Build mit eingebauter Cookie-Datei (empfohlen)

Diese Methode backt die Cookies ins Docker-Image ein - praktisch für wiederholte Runs.

**Schritt 1:** Kopiere die Datei in den Downloader-Ordner:

```powershell
# Von Windows PowerShell aus (im Projekt-Root)
cp "C:\temp\www.youtube.com_cookies.txt" "app\metawave_server\downloader\www.youtube.com_cookies.txt"
```

**Schritt 2:** Downloader-Image neu bauen:

```powershell
cd docker
docker compose -f .\compose.enviroment.yaml build downloader
```

**Was passiert beim Build?**
- Die Dockerfile kopiert die Cookie-Datei nach `/cookies/www.youtube.com_cookies.txt`
- Umgebungsvariable `YT_COOKIES=/cookies/www.youtube.com_cookies.txt` wird gesetzt
- `yt-dlp` nutzt automatisch diese Cookies

**Schritt 3:** Verifiziere die Integration:

```powershell
# Prüfe ob Cookie-Datei im Image vorhanden ist
docker compose -f .\compose.enviroment.yaml run --rm downloader ls -la /cookies/

# Prüfe YT_COOKIES Variable
docker compose -f .\compose.enviroment.yaml run --rm downloader env | grep YT_COOKIES
```

### Methode B: Runtime-Mount (flexibel, für Tests)

Wenn du die Cookies nicht ins Image backen willst (z.B. für häufige Änderungen):

```powershell
# Einzelner Download mit Cookie-Mount
docker compose -f .\compose.enviroment.yaml run --rm \
  -v "${PWD}\www.youtube.com_cookies.txt:/cookies/www.youtube.com_cookies.txt:ro" \
  -e YT_COOKIES=/cookies/www.youtube.com_cookies.txt \
  downloader python -u update_playlist.py
```

**Orchestrator mit Cookies:**

Der PowerShell-Orchestrator unterstützt einen `-CookiesFile` Parameter:

```powershell
.\run_downloader_chunks.ps1 -ChunkSize 150 -MaxParallel 6 -CookiesFile ".\www.youtube.com_cookies.txt"
```

Der Orchestrator mounted die Datei automatisch in jeden Container.

---

## 4) Schnelltest der Cookies (vor dem Build)

Teste zuerst lokal mit `yt-dlp`, ob die Cookies-Datei funktioniert:

**Test 1: Einfaches Video:**

```powershell
# Lokal (auf Windows Host)
yt-dlp --cookies "C:\temp\www.youtube.com_cookies.txt" https://www.youtube.com/watch?v=NoEMIVx4J78
```

**Test 2: Altersbeschränktes Video:**

```powershell
# Teste mit 18+ Video (ersetze URL mit einem bekannten 18+ Video)
yt-dlp --cookies "C:\temp\www.youtube.com_cookies.txt" "https://www.youtube.com/watch?v=XXXXX"
```

**Test 3: Im Container:**

Nach dem Build kannst du einen Test im Container machen:

```powershell
cd docker

# Teste single Video mit Cookies
docker compose -f .\compose.enviroment.yaml run --rm downloader \
  yt-dlp --cookies /cookies/www.youtube.com_cookies.txt \
  --print "%(title)s - %(uploader)s" \
  "https://www.youtube.com/watch?v=NoEMIVx4J78"
```

**Erfolgskriterien:**
- Kein "Sign in to confirm you're not a bot" Fehler
- Video-Titel und Uploader werden angezeigt
- Bei 18+ Videos: Kein "inappropriate" oder "age-restricted" Fehler

**Wenn Tests fehlschlagen:**
- Cookies expired → Exportiere neu
- Falsches Format → Stelle sicher, dass "Netscape" Format verwendet wird
- Permission denied → Prüfe Dateiberechtigungen

---

## 5) Vollständiger Download-Workflow mit Cookies

### Option A: Image-Build Methode (empfohlen)

Wenn du die Cookies ins Image gebacken hast (Methode A aus Schritt 3):

```powershell
cd docker

# Standard-Download mit Orchestrator
.\run_downloader_chunks.ps1 -ChunkSize 150 -MaxParallel 6

# Oder manuell für einen Bereich
docker compose -f .\compose.enviroment.yaml run --rm \
  -e PLAYLIST_ITEMS="1-100" \
  downloader python -u update_playlist.py --download-only
```

Die Cookies werden automatisch verwendet, da `YT_COOKIES` im Image gesetzt ist.

### Option B: Runtime-Mount Methode

Wenn du die Cookies zur Laufzeit mounten willst:

```powershell
cd docker

# Orchestrator mit Cookie-File Parameter
.\run_downloader_chunks.ps1 -ChunkSize 150 -MaxParallel 6 -CookiesFile ".\www.youtube.com_cookies.txt"
```

**Wichtig:** Die Cookie-Datei muss im `docker` Verzeichnis liegen oder als absoluter Pfad angegeben werden.

### Überprüfung der Cookie-Nutzung

In den Downloader-Logs solltest du sehen:

```
[downloader] Verwende Cookies-Datei: /cookies/www.youtube.com_cookies.txt
[youtube] Extracting URL: https://www.youtube.com/watch?v=...
[youtube] XXXXX: Downloading webpage
[youtube] XXXXX: Downloading android player API JSON
```

**Wenn Cookies funktionieren:**
- Weniger "Sign in" Fehler
- Altersbeschränkte Videos werden heruntergeladen
- Private/Unlisted Videos aus eigenen Playlists funktionieren

### Nach dem Download: LUFS-Analyse

Vergiss nicht, nach dem Download die LUFS-Analyse durchzuführen:

```powershell
# Analysiere alle Songs ohne LUFS-Daten
docker compose -f .\compose.enviroment.yaml run --rm downloader python -u reanalyze_lufs.py

# Starte Radio-Server neu um neue Metadata zu laden
docker compose -f .\compose.enviroment.yaml restart radio
```

---

## 6) Troubleshooting

### Problem: "Sign in to confirm you're not a bot"

**Ursachen:**
- Cookies nicht korrekt exportiert
- Cookies abgelaufen (Session-Timeout nach ~2 Wochen)
- Falsches Format (nicht Netscape)

**Lösungen:**
1. Exportiere Cookies neu mit Browser-Extension
2. Stelle sicher, dass du auf YouTube eingeloggt bist beim Export
3. Teste mit `yt-dlp --cookies` lokal bevor du buildest
4. Prüfe Cookie-Datei:
   ```powershell
   Get-Content .\www.youtube.com_cookies.txt | Select-Object -First 5
   # Sollte mit "# Netscape HTTP Cookie File" beginnen
   ```

### Problem: "Skipping client 'android' since it does not support cookies"

**Erklärung:** Das ist KEIN Fehler!
- `yt-dlp` probiert verschiedene Clients aus
- Android-Client unterstützt keine Cookies
- Web-Client wird automatisch verwendet wenn Cookies gesetzt sind

**Keine Aktion nötig.**

### Problem: "Unable to extract Initial Player Response"

**Ursachen:**
- YouTube hat die API geändert
- `yt-dlp` ist veraltet

**Lösungen:**
```powershell
# Update yt-dlp im Container
docker compose -f .\compose.enviroment.yaml build --no-cache downloader

# Oder manuell im Container
docker compose -f .\compose.enviroment.yaml run --rm downloader pip install --upgrade yt-dlp
```

### Problem: "ERROR: The downloaded file is empty"

**Ursachen:**
- Video ist nicht verfügbar (gelöscht, privat, gesperrt)
- Rate-Limit erreicht
- Cookie-Session ungültig

**Lösungen:**
1. Teste das spezifische Video manuell:
   ```powershell
   yt-dlp --cookies "C:\temp\www.youtube.com_cookies.txt" "https://www.youtube.com/watch?v=VIDEO_ID"
   ```
2. Prüfe ob Video überhaupt verfügbar ist (Browser)
3. Warte einige Minuten bei Rate-Limits
4. Exportiere Cookies neu

### Problem: "Permission denied" beim Cookie-File

**Windows:**
```powershell
# Gib Docker Zugriff auf die Datei
icacls "C:\temp\www.youtube.com_cookies.txt" /grant Everyone:R
```

**Im Container:**
```powershell
# Prüfe Permissions
docker compose -f .\compose.enviroment.yaml run --rm downloader ls -la /cookies/

# Sollte readable sein (-r--r--r--)
```

### Problem: Cookies funktionieren nach einigen Tagen nicht mehr

**Ursache:** YouTube Sessions expiren nach ~2 Wochen

**Lösung:**
1. Exportiere regelmäßig neue Cookies (alle 1-2 Wochen)
2. Baue Image neu mit frischen Cookies
3. Automatisiere wenn möglich

### Debugging-Tipps

**Verbose Logging aktivieren:**
```powershell
# Einzelner Download mit Debug-Output
docker compose -f .\compose.enviroment.yaml run --rm downloader \
  yt-dlp --cookies /cookies/www.youtube.com_cookies.txt \
  --verbose \
  "https://www.youtube.com/watch?v=VIDEO_ID"
```

**Cookie-Inhalt prüfen:**
```powershell
# Zeige Cookie-Datei im Container
docker compose -f .\compose.enviroment.yaml run --rm downloader \
  cat /cookies/www.youtube.com_cookies.txt
```

**Test mit yt-dlp Optionen:**
```powershell
# Liste Formate statt Download
docker compose -f .\compose.enviroment.yaml run --rm downloader \
  yt-dlp --cookies /cookies/www.youtube.com_cookies.txt \
  --list-formats \
  "https://www.youtube.com/watch?v=VIDEO_ID"
```

---

## 7) Sicherheitshinweise

⚠️ **Wichtige Sicherheitsregeln:**

1. **Niemals committen:**
   - `www.youtube.com_cookies.txt` steht in `.gitignore`
   - Prüfe mit `git status` vor jedem Commit

2. **Zugriffsbeschränkung:**
   - Speichere Cookies nur lokal
   - Nicht auf shared Drives oder Cloud-Speicher
   - Lösche alte Cookie-Dateien

3. **Separate Accounts:**
   - Nutze Test-Accounts für Automatisierung
   - Nicht deinen Haupt-YouTube-Account

4. **Regelmäßige Rotation:**
   - Exportiere alle 1-2 Wochen neue Cookies
   - Lösche alte Dateien

5. **Bei Kompromittierung:**
   - Melde dich bei YouTube ab
   - Ändere dein Passwort
   - Lösche alle Cookie-Dateien
   - Revoke Sessions auf https://myaccount.google.com/permissions

---

## 8) Best Practices

**Für Entwicklung:**
- Nutze Runtime-Mount während der Entwicklung (flexibler)
- Backe Cookies nur für Production ins Image

**Für Production:**
- Verwende Service-Account mit minimalen Rechten
- Dokumentiere Cookie-Rotation-Prozess
- Setze Monitoring für "Sign in" Fehler auf

**Für große Playlists:**
- Teste zuerst mit kleinem Batch (`PLAYLIST_ITEMS="1-10"`)
- Verifiziere dass Cookies funktionieren
- Dann vollständigen Orchestrator-Run

**Cookie-Refresh Workflow:**
```powershell
# 1. Exportiere neue Cookies
# (Browser Extension)

# 2. Kopiere in Projekt
cp "C:\temp\www.youtube.com_cookies.txt" "app\metawave_server\downloader\www.youtube.com_cookies.txt"

# 3. Rebuild Image
cd docker
docker compose -f .\compose.enviroment.yaml build downloader

# 4. Teste
docker compose -f .\compose.enviroment.yaml run --rm downloader \
  yt-dlp --cookies /cookies/www.youtube.com_cookies.txt \
  --print "%(title)s" \
  "https://www.youtube.com/watch?v=NoEMIVx4J78"

# 5. Lösche alte Cookie-Datei
Remove-Item "C:\temp\www.youtube.com_cookies.txt"
```