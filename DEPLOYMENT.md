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
sudo usermod -aG docker "$USER"

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

### 2.1 Repo auf der VM klonen (empfohlen)

```bash
cd ~
# Falls dein Repo privat ist, passe die URL entsprechend an
git clone <DEIN_GIT_REPO_URL> MetaWave
cd MetaWave/docker
```

Alternativ kannst du das Projekt auch als Zip/SCP auf die VM kopieren und unter z. B. `/opt/MetaWave` ablegen. In allen Befehlen unten wird angenommen, dass du im Verzeichnis `MetaWave/docker` arbeitest.

---

## 3. Environment Files anlegen

In jedem der drei Service-Verzeichnisse unter `docker/` müssen `.env`-Dateien vorhanden sein.

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
  PLAYLIST_URL=https://www.youtube.com/playlist?list=PLYfrfvAfnsDnKbAvlaQzHTxwToq0m5jMj

  # API-Port
  PORT=8000

  # Datenbank-Verbindung (muss zu metawave_database/.env passen)
  DB_HOST=database
  DB_PORT=3306
  DB_USER=metawave_user
  DB_PASS=metawave_db_pass
  DB_NAME=metawave_db

  # Auth-Secret für JWTs (unbedingt zufällig wählen!)
  AUTH_SECRET=<random_secret>
  AUTH_TOKEN_EXPIRY=1800

  # Signal (Notifications)
  SIGNAL_REST_API_URL=http://signal-api:8000
  SIGNAL_FROM_NUMBER=+41798878717

  # Standard-Nachricht für neue WaveTokens
  STANDARD_NOTIFICATION_MESSAGE=Neuer WaveToken wurde generiert. Verwende ihn zum Login.
  ```

3. Speichern: `Ctrl+O`, Enter, dann `Ctrl+X`.

Passe insbesondere `PLAYLIST_URL`, `AUTH_SECRET` und `SIGNAL_FROM_NUMBER` an deine Umgebung an.

### 3.3 Datenbank: docker/metawave_database/.env

1. Datei mit nano öffnen:

  ```bash
  cd ~/MetaWave/docker
  nano metawave_database/.env
  ```

2. Folgenden Inhalt einfügen:

  ```env
  # MySQL/MariaDB Konfiguration
  MYSQL_ROOT_PASSWORD=metawave_root_pass
  MYSQL_DATABASE=metawave_db
  MYSQL_USER=metawave_user
  MYSQL_PASSWORD=metawave_db_pass
  ```

3. Speichern: `Ctrl+O`, Enter, dann `Ctrl+X`.

Die Zugangsdaten müssen mit den Werten in `metawave_server/.env` (`DB_*`) übereinstimmen.

---

## 4. Docker-Services auf der VM starten

Wechsle ins Docker-Verzeichnis und starte alle Dienste:

```bash
cd ~/MetaWave/docker

docker compose -f compose.enviroment.yaml up --build -d
```

- `-d` startet die Container im Hintergrund (empfohlen für eine VM).
- Die Compose-Datei inkludiert:
  - [docker/metawave_database/compose.database.yaml](docker/metawave_database/compose.database.yaml)
  - [docker/metawave_server/compose.server.yaml](docker/metawave_server/compose.server.yaml)
  - [docker/metawave_app/compose.app.yaml](docker/metawave_app/compose.app.yaml)

### 4.1 Status prüfen

```bash
docker compose -f compose.enviroment.yaml ps

docker compose -f compose.enviroment.yaml logs -f
```

Relevante Container-Namen:
- `database` (MySQL/MariaDB)
- `server` (Radio & Auth API)
- `downloader` (Playlist-Downloader, läuft i. d. R. einmal durch)
- `signal-api` (Signal REST API)
- `client` (WebApp)

---

## 5. Signal (Notifications) auf der VM einrichten

Damit Benachrichtigungen funktionieren, muss die Nummer in `SIGNAL_FROM_NUMBER` im `signal-api` Container registriert werden.

### 5.1 Shell im signal-api Container öffnen

```bash
cd ~/MetaWave/docker

docker compose -f compose.enviroment.yaml exec signal-api sh
```

### 5.2 Captcha-Token erzeugen

1. Öffne auf deinem lokalen Rechner im Browser:  
   https://signalcaptchas.org/registration/generate.html
2. Löse das Captcha.
3. Rechtsklick auf „Open Signal“ → Link-Adresse kopieren.
4. Aus der URL den Wert hinter `token=` kopieren.

### 5.3 Nummer registrieren

Im Container (Shell aus Schritt 5.1):

```sh
signal-cli -u +<number> register --captcha <TOKEN>
```

`+<number>` muss zu deiner `SIGNAL_FROM_NUMBER` passen.

### 5.4 Code verifizieren

Du erhältst per SMS/Anruf einen Code:

```sh
signal-cli -u +<number> verify <CODE>
```

### 5.5 Prüfung & Test

Optional im Container:

```sh
signal-cli -u +<number> listDevices
```

---

## 6. Erreichbarkeit der Anwendung

Standard-Ports (auf der VM):

- `80` → WebApp (Client)
- `8000` → API (Radio & Auth Service)
- `5000` → Signal REST API

### 6.1 Zugriff von außen (ohne Domain)

- Öffne in deinem Browser: `http://<VM_PUBLIC_IP>` → MetaWave WebApp
- API-Endpoint-Test:

  ```bash
  curl http://<VM_PUBLIC_IP>:8000
  ```

Stelle sicher, dass in deiner Cloud-Firewall / Security Group die Ports 80 und 8000 (und optional 5000) von außen erreichbar sind.

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
docker compose -f compose.enviroment.yaml logs -f client database signal-api
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
