# MetaWave mit Docker starten – einfach erklärt

Diese Anleitung verwendet **Windows und PowerShell**. Alle Befehle unten werden
im Hauptordner des Projekts `MetaWave` ausgeführt – dort, wo die Haupt-README
liegt. Öffne diesen Ordner in VS Code und dann **Terminal → Neues Terminal**.

## Wenn MetaWave bereits eingerichtet ist

1. Starte Docker Desktop und warte, bis Docker bereit ist.
2. Gib im Terminal ein:

   ```powershell
   docker compose -f .\docker\compose.enviroment.yaml up -d
   ```

3. Öffne [http://localhost](http://localhost) und melde dich mit deinem
   WaveToken an.

`up -d` startet die Dienste im Hintergrund. Nach Änderungen am Projektcode
verwende stattdessen `up -d --build` (siehe unten). Die Schreibweise
`compose.enviroment.yaml` ist der tatsächliche Dateiname.

## Erstmalig einrichten

### 1. Voraussetzungen

- Docker Desktop installieren, starten und die Einrichtung abschliessen:
  [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/).
  Unter Windows kann Docker Desktop WSL 2 benötigen.
- Im Terminal prüfen:

  ```powershell
  docker version
  docker compose version
  ```

  Docker Compose muss die `include`-Funktion unterstützen (Version 2.20 oder
  neuer). Falls `docker version` keine Serverinformationen zeigt, ist Docker
  Desktop möglicherweise noch nicht bereit.
- Internetverbindung und genügend Speicherplatz für Container, Musik und
  KI-Modelle. Die Modelle benötigen mehrere GB; der erste Start kann lange
  dauern. Der Speaker funktioniert standardmässig auf der CPU.
- Die Ports **80** und **8000** müssen auf diesem Computer frei sein.

### 2. Konfigurationsdateien erstellen

Wenn die drei Dateien bereits vorhanden sind, **nicht überschreiben**. Öffne
sie bei Bedarf in VS Code. Für eine neue Installation erstelle die folgenden
Dateien mit genau dem Namen `.env`:

**`docker\metawave_database\.env`**

```env
MARIADB_ROOT_PASSWORD=HIER_EIGENES_ROOT_PASSWORT
MARIADB_DATABASE=database_metawave
MARIADB_USER=metawave_user
MARIADB_PASSWORD=HIER_EIGENES_DB_PASSWORT
```

**`docker\metawave_server\.env`**

```env
DB_HOST=database
DB_PORT=3306
DB_NAME=database_metawave
DB_USER=metawave_user
DB_PASS=HIER_EIGENES_DB_PASSWORT
AUTH_SECRET=HIER_LANGEN_ZUFALLSWERT_EINTRAGEN
AUTH_TOKEN_EXPIRY=3600
YT_COOKIES=
```

Ersetze die Platzhalter durch eigene sichere Werte. `DB_PASS` muss genau dem
`MARIADB_PASSWORD` entsprechen; Benutzername und Datenbankname müssen ebenfalls
übereinstimmen. `database_metawave` ist der im Datenbank-Init-Skript verwendete
Name. Zum Erzeugen eines zufälligen `AUTH_SECRET` kannst du ausführen:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Falls Node.js auf dem Host nicht installiert ist, erstelle stattdessen einen
langen zufälligen Wert mit einem Passwortmanager. Behandle Passwörter und
Secrets vertraulich: nicht veröffentlichen oder ins Git-Repository einchecken.
Eine bereits initialisierte MariaDB übernimmt geänderte Zugangsdaten nicht
automatisch nur durch Ändern der `.env`-Datei.

**`docker\metawave_app\.env`**

```env
EXPO_PUBLIC_API_BASE=http://localhost:8000
```

Das funktioniert, wenn Browser und Docker auf **demselben Computer** laufen.
Für andere Geräte bedeutet `localhost` das jeweilige Gerät, nicht den
Docker-Rechner. Für einen Fernzugriff braucht die App eine vom Browser
erreichbare API-Adresse und eine geeignete sichere Netzwerk-/CORS-Konfiguration;
die lokalen Standardwerte sind keine fertige öffentliche Deployment-Lösung.

Die aktuelle Downloader-Dockerdatei verlangt zusätzlich eine Cookie-Datei beim
Build, auch wenn du keine Cookies verwendest. Für öffentliche Playlists kannst
du eine harmlose leere Platzhalterdatei erstellen – bestehende Dateien bleiben
bei diesem Befehl unangetastet:

```powershell
if (-not (Test-Path .\app\metawave_server\downloader\www.youtube.com_cookies.txt)) {
  Set-Content -Path .\app\metawave_server\downloader\www.youtube.com_cookies.txt -Value '# Netscape HTTP Cookie File'
}
```

Mit `YT_COOKIES=` im Server-`.env` verwendet der Downloader keine Cookies.
Falls du später echte Cookies verwendest: Sie enthalten Zugangsdaten und werden
bei dieser Docker-Konfiguration **in das Downloader-Image kopiert**. Teile weder
die Datei noch dieses Image; siehe [Cookie-Anleitung](GET_YT_COOKIES.md).
E-Mail-Einstellungen sind für den lokalen Start optional.

### 3. Container bauen und starten

```powershell
docker compose -f .\docker\compose.enviroment.yaml up -d --build
```

Beim ersten Start werden Images gebaut und das Ollama-Modell heruntergeladen.
Der Speaker startet erst, wenn die einmalige Modellinitialisierung erfolgreich
abgeschlossen ist. Qwen-TTS lädt sein Modell beim ersten Einsatz. Warte bei
langsamer Verbindung oder CPU entsprechend länger.

Prüfe den Zustand:

```powershell
docker compose -f .\docker\compose.enviroment.yaml ps --all
```

`app` (Container `client`), `radio` (`server`), `database`, `downloader`,
`ollama` und `metawave-speaker` sollen laufen. `ollama-init` mit
**Exited (0)** ist normal: Das ist ein einmaliger Initialisierungsschritt.
Bei einem anderen Fehlercode helfen die Logs im Abschnitt unten.

### 4. Anmelden und Musik einrichten

1. Öffne [http://localhost](http://localhost).
2. Der aktuelle WaveToken wird bei erfolgreichem Serverstart im Radio-Log
   angezeigt:

   ```powershell
   docker compose -f .\docker\compose.enviroment.yaml logs --tail 100 radio
   ```

   Suche nach `Aktueller MetaWave Code`. Der Token ist vertraulich; teile die
   Logs nicht ungeprüft. Falls dort kein Code steht, prüfe Datenbank und
   Radio-Logs.
3. Melde dich mit dem Code an. Öffne **Einstellungen → Playlist Manager**,
   füge eine erreichbare YouTube-Playlist hinzu und klicke **Jetzt
   synchronisieren**. Die erstmalige Synchronisierung kann länger dauern.
   Nutze nur Inhalte, für die du die erforderlichen Rechte hast.
4. Starte die Wiedergabe im Player. Die Synchronisierung kann nicht mehr in
   aktiven Playlists enthaltene heruntergeladene Songs lokal bereinigen.

### 5. KI-Speaker testen

Öffne **Einstellungen → Speaker**, prüfe die RSS-Feeds und klicke **Jetzt
testen / Vorschau generieren**. Die Vorschau spielt nur auf deinem Gerät;
die Erstellung kann mehrere Minuten dauern. Aktiviere den Speaker für
automatische Sendungen. Im Player siehst du den Vorbereitungsstatus.

Die Vorbereitung startet eine Stunde vor der eingestellten Schweizer
Sendezeit. Nach der Sendezeit wartet die Ausspielung auf ein Liedende und
fertige Songansagen. Bei pausiertem Radio kann die Sendung ausfallen.
KI-Nachrichten können Fehler enthalten und müssen für öffentliche
Ausstrahlungen geprüft werden. Details stehen in der
[Speaker-Anleitung](../app/metawave_speaker/README.md).

## Häufige Befehle

Alle Befehle wieder im Projekt-Hauptordner:

```powershell
# Status aller Container, auch beendeter Initialisierungen
docker compose -f .\docker\compose.enviroment.yaml ps --all

# Letzte Meldungen eines Dienstes anzeigen
docker compose -f .\docker\compose.enviroment.yaml logs --tail 100 radio
docker compose -f .\docker\compose.enviroment.yaml logs --tail 100 database
docker compose -f .\docker\compose.enviroment.yaml logs --tail 100 downloader
docker compose -f .\docker\compose.enviroment.yaml logs --tail 100 ollama-init metawave-speaker

# Live-Logs; mit Strg+C beenden
docker compose -f .\docker\compose.enviroment.yaml logs -f metawave-speaker

# Dienste anhalten; Daten und Container bleiben erhalten
docker compose -f .\docker\compose.enviroment.yaml stop

# Nach Änderungen Code neu bauen und starten
docker compose -f .\docker\compose.enviroment.yaml up -d --build
```

`stop` unterbricht Musik und laufende Speaker-Vorbereitungen. Starte später mit
`up -d`. Sichere vor einem Rebuild die Datenbank: Falls Compose den
Datenbankcontainer neu erstellt, ist die Wiederverwendung des anonymen Volumes
nicht zuverlässig. Ein Rebuild kann auch Dienste unterbrechen.
Logs können WaveTokens oder andere vertrauliche Informationen enthalten.

**Wichtig zu Daten:** Die aktuelle Datenbank verwendet ein anonymes Docker-Volume.
Benutze zum normalen Anhalten **`stop`, nicht `down`**. Nach `down` kann ein neu
erstellter Datenbankcontainer ein neues leeres Volume erhalten; das alte Volume
wird nicht automatisch wieder eingebunden. Nutze niemals `down -v` oder
Volume-Bereinigungen, wenn Daten erhalten bleiben sollen. Sichere Datenbank,
Songs, Speaker-Daten und Modelle separat, bevor du Container oder Volumes
entfernst.

## Wenn etwas nicht funktioniert

- **Seite nicht erreichbar:** Läuft Docker Desktop? Prüfe `ps --all`, die
  App-Logs und ob Port 80 bereits belegt ist.
- **Login klappt nicht:** Prüfe, ob `database` läuft und gesund ist, ob der
  aktuelle WaveToken im Radio-Log steht und die DB-Zugangsdaten zusammenpassen.
- **Keine Songs:** Playlist im Playlist Manager hinzufügen und synchronisieren;
  Status dort und Downloader-Logs prüfen.
- **Speaker fehlt oder braucht lange:** Logs von `ollama-init` und
  `metawave-speaker` ansehen; Modell-Download und CPU-Generierung können lange
  dauern.
- **Build meldet fehlende Cookie-Datei:** Den Platzhalter aus Schritt 2
  erstellen und den Build erneut starten.

Weitere Details und optionale Werkzeuge: [ausführliche Docker-Anleitung](README.md).
