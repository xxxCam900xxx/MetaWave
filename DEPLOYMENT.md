# MetaWave Deployment auf einer VM

Dieses Dokument beschreibt, wie du MetaWave auf einer (Linux-)VM produktionsnah mit Docker deployen kannst.

> Hinweis: Die Beispiele gehen von einer frischen Ubuntu-VM aus. Auf anderen Distributionen sind die Paketbefehle leicht anzupassen.

---

## 1. Voraussetzungen der VM

- Aktuelles Linux (z. B. Ubuntu 22.04 LTS)
- Mindestens 2 vCPUs, 4 GB RAM, 20 GB Disk (empfohlen)
- Zugriff per SSH
- Ein Benutzer mit `sudo`-Rechten

### 1.1 System aktualisieren

```bash
sudo apt-get update && sudo apt-get upgrade -y
```

### 1.2 Docker & Docker Compose installieren

```bash
# Docker installieren
curl -fsSL https://get.docker.com | sudo sh

# Den aktuellen Benutzer zur docker-Gruppe hinzufügen
sudo usermod -aG docker "metawave"

# (optional) Ab- und wieder anmelden, damit die Gruppenmitgliedschaft greift
# oder: exec su -l $USER

# Prüfen
docker version
```

Docker Compose v2 ist in der modernen Docker-Installation bereits als `docker compose` enthalten. Prüfe die Version:

```bash
docker compose version
```

Stelle sicher, dass **mindestens Version 2.20+** verwendet wird, damit die `include`-Direktive in der Compose-Datei funktioniert.

---

## 2. Projekt auf die VM bringen

### 2.1 Repo auf der VM klonen (empfohlen, per SSH)

Voraussetzung: Auf der VM ist ein SSH-Key vorhanden und im Git-Provider (z. B. GitHub, GitLab) hinterlegt.

Kurze Schritte:

```bash
cd ~

# (optional) neuen SSH-Key erzeugen, falls noch keiner existiert
ssh-keygen -t ed25519 -C "metawave-vm"    # Fragen mit Enter bestätigen

# Public Key anzeigen und im Git-Provider als Deploy-/SSH-Key hinterlegen
cat ~/.ssh/id_ed25519.pub

# Verbindung zum Git-Provider testen (für GitHub z. B.)
ssh -T git@github.com

# Repo per SSH klonen (Beispiel)
git clone git@github.com:xxxCam900xxx/MetaWave.git MetaWave

cd MetaWave/docker
```

Passe `git@gitserver:<ORG>/<REPO>.git` an dein echtes Repository an. Alternativ kannst du das Projekt auch als Zip/SCP auf die VM kopieren und unter z. B. `/opt/MetaWave` ablegen. In allen Befehlen unten wird angenommen, dass du im Verzeichnis `MetaWave/docker` arbeitest.

---

## 3. Environment Files anlegen

In jedem der Service-Verzeichnisse unter `docker/` müssen `.env`-Dateien vorhanden sein.

### 3.1 App: docker/metawave_app/.env

1. Wechsle ins Docker-Verzeichnis:

	```bash
	cd ~/MetaWave/docker
	```

2. Öffne die Datei mit nano (wird erstellt, falls sie nicht existiert):

	```bash
	nano metawave_app/.env
	```

3. Kopiere folgenden Inhalt und füge ihn in nano ein:

	```env
	API_DOMAIN_URL=http://<VM_PUBLIC_IP>:8000
	```

4. Speichern in nano: `Ctrl+O`, Enter, dann mit `Ctrl+X` beenden.

> Wenn du später eine Domain (z. B. `radio.example.com`) hast, kannst du hier stattdessen `https://radio.example.com` eintragen.

### 3.2 Server: docker/metawave_server/.env

1. Datei mit nano öffnen:

	```bash
	cd ~/MetaWave/docker
	nano metawave_server/.env
	```

2. Diesen Inhalt einfügen (vor dem Speichern ggf. Werte anpassen):

	```env
	# Playlist muss öffentlich zugänglich sein
	PLAYLIST_URL=https://www.youtube.com/playlist?list=PLYfrfvAfnsDmHAS1wU6v-NC5e5iFxmgmH

	# API-Port
	PORT=8000

	# Datenbank-Verbindung (muss zu metawave_database/.env passen)
	DB_HOST=database
	DB_PORT=3306
	DB_USER=metawave_user
	DB_PASS=strongpassword
	DB_NAME=database_metawave

	# Auth-Secret für JWTs (unbedingt zufällig wählen!)
	AUTH_SECRET=<random_secret>
	AUTH_TOKEN_EXPIRY=3600

	# Standard-Nachricht für neue WaveTokens
	STANDARD_NOTIFICATION_MESSAGE=Neuer WaveToken wurde generiert. Verwende ihn zum Login.

	# Downloader-Konfiguration (optional feintuning)
	BATCH_SIZE=10
	BATCH_DELAY_SECONDS=60
	VIDEO_DELAY_SECONDS=5
	MAX_RETRIES=5
	INITIAL_DELAY_SECONDS=60
	#PLAYLIST_ITEMS=1-10
	
	# YouTube Cookies (optional, für private/altersbeschränkte Videos)
	# Siehe GET_YT_COOKIES.md für Setup-Anleitung
	#YT_COOKIES=/cookies/www.youtube.com_cookies.txt
	```

3. Speichern: `Ctrl+O`, Enter, dann `Ctrl+X`.

Passe insbesondere `PLAYLIST_URL` und `AUTH_SECRET` an deine Umgebung an.

### 3.3 Datenbank: docker/metawave_database/.env

1. Datei mit nano öffnen:

	```bash
	cd ~/MetaWave/docker
	nano metawave_database/.env
	```

2. Folgenden Inhalt einfügen (entspricht der aktuellen Konfiguration):

	```env
	MARIADB_ROOT_PASSWORD=supersecret
	MARIADB_DATABASE=database_metawave
	MARIADB_USER=metawave_user
	MARIADB_PASSWORD=strongpassword
	```

3. Speichern: `Ctrl+O`, Enter, dann `Ctrl+X`.

Die Zugangsdaten müssen mit den Werten in `metawave_server/.env` (`DB_*`) übereinstimmen.

---

## 4. Docker-Services auf der VM starten

Wechsle ins Docker-Verzeichnis:

```bash
cd ~/MetaWave/docker
```

Starte die Services nacheinander in folgender Reihenfolge:

```bash
# 1) Datenbank
docker compose -f compose.enviroment.yaml up -d database

# Warte 10-15 Sekunden bis DB bereit ist
sleep 15

# 2) Downloader (lädt Playlist herunter und beendet sich)
# Für große Playlists: Siehe Orchestrator-Anleitung unten
docker compose -f compose.enviroment.yaml up downloader

# 3) LUFS-Analyse durchführen (EBU R128 Broadcasting-Standard)
# Analysiert alle Songs und speichert Loudness-Werte in metadata.json
docker compose -f compose.enviroment.yaml run --rm downloader python -u reanalyze_lufs.py

# 4) Radio / API
docker compose -f compose.enviroment.yaml up -d radio

# 5) WebApp
docker compose -f compose.enviroment.yaml up -d app
```

- `-d` startet die Container im Hintergrund (empfohlen für eine VM).
- Beim **ersten Deployment** kannst du optional `--build` ergänzen (z. B. `up --build -d database`), damit die Images neu gebaut werden.
- Die Compose-Datei inkludiert:
	- [docker/metawave_database/compose.database.yaml](docker/metawave_database/compose.database.yaml)
	- [docker/metawave_server/compose.server.yaml](docker/metawave_server/compose.server.yaml)
	- [docker/metawave_app/compose.app.yaml](docker/metawave_app/compose.app.yaml)

### 4.1 Alternative: Orchestrator für große Playlists (empfohlen)

Für Playlists mit >300 Videos empfiehlt sich der Orchestrator-Ansatz:

**Auf Windows (PowerShell):**

```bash
cd ~/MetaWave/docker

# Standard: 300er Chunks, max. 3 parallele Downloader
./run_downloader_chunks.ps1 -ChunkSize 300 -MaxParallel 3

# Nach Download: LUFS-Analyse
docker compose -f compose.enviroment.yaml run --rm downloader python -u reanalyze_lufs.py
```

**Auf Linux (Bash):**

```bash
cd ~/MetaWave/docker

# Standard: 300er Chunks, max. 3 parallele Downloader
./run_downloader_chunks.sh 300 3

# Nach Download: LUFS-Analyse
docker compose -f compose.enviroment.yaml run --rm downloader python -u reanalyze_lufs.py
```

**Vorteile des Orchestrators:**
- Teilt große Playlists in handliche Chunks auf
- Mehrere parallele Downloads (schneller)
- Robuster gegenüber Fehlern (einzelne Chunks können fehlschlagen)
- Automatische Metadata-Erstellung am Ende

**Nach dem Orchestrator-Run:**

```bash
# Starte Radio-Server um neue Songs zu laden
docker compose -f compose.enviroment.yaml restart radio

# Prüfe ob LUFS-Werte vorhanden sind
docker compose -f compose.enviroment.yaml exec downloader sh -c "grep -c '\"lufs\"' /songs/metadata.json"
```

### 4.2 Status prüfen

```bash
docker compose -f compose.enviroment.yaml ps

docker compose -f compose.enviroment.yaml logs -f
```

Relevante Container-Namen:
- `database` (MySQL/MariaDB)
- `radio` (Radio & Auth API)
- `downloader` (Playlist-Downloader, läuft i. d. R. einmal durch)
- `app` (WebApp)

### 4.3 Troubleshooting Deployment

**Problem: Database Container startet nicht**

```bash
# Logs prüfen
docker compose -f compose.enviroment.yaml logs database

# Häufigster Fehler: .env Datei fehlt
ls -la metawave_database/.env

# Volume prüfen
docker volume inspect metawave_database-data

# Notfalls Volume löschen (ACHTUNG: Löscht alle Daten!)
docker compose -f compose.enviroment.yaml down
docker volume rm metawave_database-data
docker compose -f compose.enviroment.yaml up -d database
```

**Problem: Downloader schlägt fehl (YouTube 403/Sign in to confirm)**

Lösung: YouTube Cookies erforderlich

1. Siehe [GET_YT_COOKIES.md](docker/GET_YT_COOKIES.md) für Cookie-Extraktion
2. Kopiere `www.youtube.com_cookies.txt` nach `docker/` Ordner
3. Aktiviere in `metawave_server/.env`:
   ```
   YT_COOKIES=/cookies/www.youtube.com_cookies.txt
   ```
4. Starte Downloader neu:
   ```bash
   docker compose -f compose.enviroment.yaml up downloader
   ```

**Problem: LUFS-Analyse schlägt fehl**

```bash
# Prüfe ob FFmpeg vorhanden ist
docker compose -f compose.enviroment.yaml run --rm downloader ffmpeg -version

# Prüfe ob metadata.json existiert
docker compose -f compose.enviroment.yaml exec downloader ls -lh /songs/metadata.json

# Manuell einzelne Datei analysieren (zum Testen)
docker compose -f compose.enviroment.yaml run --rm downloader python -u reanalyze_lufs.py --files "Song Name.mp3"

# Force-Reanalyse aller Songs
docker compose -f compose.enviroment.yaml run --rm downloader python -u reanalyze_lufs.py --force
```

**Problem: Radio-Server startet nicht / keine Songs**

```bash
# Logs prüfen
docker compose -f compose.enviroment.yaml logs radio

# Prüfe ob Songs vorhanden sind
docker compose -f compose.enviroment.yaml exec radio ls -lh /songs/

# Prüfe metadata.json
docker compose -f compose.enviroment.yaml exec radio cat /songs/metadata.json | jq '.songs | length'

# Starte Radio neu
docker compose -f compose.enviroment.yaml restart radio
```

**Problem: App lädt nicht / 502 Bad Gateway**

```bash
# Prüfe ob Radio-Server läuft
curl http://localhost:8000/api/stream/settings

# Prüfe App-Container
docker compose -f compose.enviroment.yaml logs app

# Firewall-Regeln (falls auf VM)
sudo ufw allow 8000/tcp
sudo ufw allow 80/tcp
```

---

## 5. Erreichbarkeit der Anwendung

Standard-Ports (auf der VM):

- `80` → WebApp (Client)
- `8000` → API (Radio & Auth Service)
### 5.1 Zugriff von aussen (ohne Domain)

- Öffne in deinem Browser: `http://<VM_PUBLIC_IP>` → MetaWave WebApp
- API-Endpoint-Test:

	```bash
	curl http://<VM_PUBLIC_IP>:8000
	```

Stelle sicher, dass in deiner Cloud-Firewall / Security Group die Ports 80 und 8000 (und optional 5000) von aussen erreichbar sind.

### 6.2 Zugriff mit Domain (optional)

Wenn du eine Domain (z. B. `radio.example.com`) hast, kannst du einen DNS-Eintrag auf die öffentliche IP der VM setzen und einen Reverse Proxy (z. B. Nginx oder Traefik) davor schalten.

Ein einfaches Setup könnte sein:
- Nginx auf der VM installiert
- Nginx lauscht auf Port 80/443
- Weiterleitung von `/` an `http://localhost:80` (Client)
- Weiterleitung von `/api` an `http://localhost:8000`

(Dieses Thema sprengt den Rahmen dieses Dokuments – bei Bedarf kann hier später ein eigener Abschnitt ergänzt werden.)

---

## 7. Betrieb & Wartung

### 7.1 Container stoppen & starten

```bash
cd ~/MetaWave/docker

# Stoppen
docker compose -f compose.enviroment.yaml down

# Starten (ohne Neu-Build)
docker compose -f compose.enviroment.yaml up -d
```

### 7.2 Logs ansehen

```bash
cd ~/MetaWave/docker

docker compose -f compose.enviroment.yaml logs -f server
# oder
docker compose -f compose.enviroment.yaml logs -f client database
```

### 7.3 Images aktualisieren / neue App-Version

Wenn du Änderungen am Code gemacht oder ein neues Release ausgecheckt hast:

```bash
cd ~/MetaWave/docker

docker compose -f compose.enviroment.yaml build

docker compose -f compose.enviroment.yaml up -d
```

---

## 8. Schnelltests nach dem Deployment

Nach einem frischen Deployment auf der VM kannst du folgende Checks machen:

```bash
# Läuft die API?
curl http://localhost:8000

# Läuft die WebApp lokal auf der VM? (z. B. via textbasiertem Browser)
sudo apt-get install -y lynx
lynx http://localhost
```

Wenn das alles funktioniert, solltest du von deinem Rechner aus über `http://<VM_PUBLIC_IP>` auf MetaWave zugreifen können.

Hinweis zum Downloader
- Der Downloader läuft im `downloader`-Service, schreibt unbuffered Logs und nutzt die ENV-Werte aus `metawave_server/.env` (Batch- und Retry-Settings).
- Bei HTTP 429 (YouTube Rate-Limit) siehst du im Log Backoff-Meldungen. Nach den konfigurierten Versuchen werden problematische Videos übersprungen, der Rest der Playlist wird weiter verarbeitet.
