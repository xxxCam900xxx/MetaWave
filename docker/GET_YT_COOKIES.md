# YouTube Cookies: Lokal exportieren und im MetaWave-Downloader nutzen

Kurz: exportiere deine YouTube-Cookies lokal, speichere die Datei sicher (nicht ins Repo), kopiere sie in den Downloader-Ordner und baue das Downloader-Image neu. Dann kannst du die Orchestrator-Läufe/Downloads mit authentifizierten Requests ausführen.

Wichtig: Verwende nur eigene Accounts/Test‑Accounts. Teile oder committe die Cookies niemals.

---

## 1) Optionen zum Exportieren der Cookies

A) Browser-Extension (einfach)
- Chrome/Edge: "Get cookies.txt" oder "Get cookies.txt (by ilowht)" (im Chrome Web Store).
- Firefox: Erweiterung "cookies.txt".

Vorgehen (Chrome/Edge):
1. Installiere die Extension.
2. Öffne `https://www.youtube.com` und melde dich mit deinem Test-Account an.
3. Klicke auf die Extension → `Export` → speichere als `www.youtube.com_cookies.txt`.

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

## 3) Cookie in den Downloader integrieren (lokal, empfohlen)

Kopiere die Datei in den Downloader-Ordner (lokal, nicht committen):

```powershell
# Aus dem Projekt-Root
cp "C:\Users\<du>\Downloads\www.youtube.com_cookies.txt" "app\metawave_server\downloader\www.youtube.com_cookies.txt"
```

Danach Downloader-Image neu bauen (im `docker`-Ordner):

```powershell
cd docker
docker compose -f .\compose.enviroment.yaml build downloader
```

Die Dockerfile ist so angepasst, dass eine vorhandene Datei `app/metawave_server/downloader/www.youtube.com_cookies.txt` beim Image-Build nach `/cookies/www.youtube.com_cookies.txt` kopiert und `YT_COOKIES` gesetzt wird.

---

## 4) Alternativ: Cookie per Mount zur Laufzeit (falls du nicht neu bauen willst)

Wenn du die Image-Neubau-Variante nicht verwenden willst, kannst du die Cookie-Datei beim `docker compose run` mounten und `YT_COOKIES` setzen:

```powershell
# Beispiel: flatten mit temporärem Mount
docker compose -f .\compose.enviroment.yaml run --rm -v "${PWD}\www.youtube.com_cookies.txt:/cookies/www.youtube.com_cookies.txt:ro" -e YT_COOKIES=/cookies/www.youtube.com_cookies.txt downloader python -u flatten_playlist.py
```

Oder den Orchestrator starten und die Datei per Parameter übergeben:

```powershell
cd docker
.\run_downloader_chunks.ps1 -ChunkSize 150 -MaxParallel 6 -CookiesFile ".\www.youtube.com_cookies.txt"
```

Hinweis: Pfade in PowerShell sollten korrekt aufgelöst werden; wenn der Orchestrator Probleme meldet, gib den absoluten Pfad an.

---

## 5) Schnelltest der Cookies (lokal vor dem Copy)

Teste zunächst lokal mit `yt-dlp`, ob die Cookies Datei funktioniert:

```powershell
# Lokal (auf Host)
yt-dlp --cookies "C:\Users\<du>\Downloads\www.youtube.com_cookies.txt" https://www.youtube.com/watch?v=NoEMIVx4J78
```

Wenn das Video ohne „Sign in to confirm you’re not a bot“-Fehler heruntergeladen/gelistet wird, sind die Cookies in Ordnung.

---

## 6) Orchestrator + Full Run

Wenn du die Datei in `app/metawave_server/downloader/` kopiert und das Image neu gebaut hast, führe im `docker`-Ordner aus:

```powershell
.\run_downloader_chunks.ps1 -ChunkSize 150 -MaxParallel 6
```

oder (wenn du die mount-Methode wählst):

```powershell
.\run_downloader_chunks.ps1 -ChunkSize 150 -MaxParallel 6 -CookiesFile ".\www.youtube.com_cookies.txt"
```

Achte in den Logs auf:

- `[downloader] Verwende Cookies-Datei: /cookies/www.youtube.com_cookies.txt`
- Fehlermeldungen wie `Signature solving failed` sollten deutlich reduziert werden.

---

## 7) Troubleshooting

- `Sign in to confirm you’re not a bot`:
  - Cookies nicht korrekt oder abgelaufen → neu exportieren.
  - Teste mit `yt-dlp --cookies` lokal.
- `Skipping client "android" since it does not support cookies`:
  - Kein Fehler: bedeutet, dass yt-dlp den android-Client überspringt; wir nutzen jetzt den Web-Client wenn Cookies gesetzt sind.
- `Signature solving failed` oder `The downloaded file is empty`:
  - Wir haben `--remote-components ejs:github` aktiviert; wenn Probleme bleiben, exportiere Cookies neu oder teste einzelne Videos lokal mit `--list-formats`.

---

Wenn du willst, schreibe ich dir auch die exakten Schritte zum sicheren Export der Cookies in deinem konkreten Browser (Chrome/Firefox) anhand deiner Verfügbarkeit—sag mir kurz, welchen Browser du nutzt.