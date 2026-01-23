# Wie startet man das Projekt mit Docker?

- [Wie startet man das Projekt mit Docker?](#wie-startet-man-das-projekt-mit-docker)
  - [Step 0 | Docker installieren](#step-0--docker-installieren)
  - [Step 1 | Enviroment Files erstellen](#step-1--enviroment-files-erstellen)
  - [Step 2 | Docker Container starten](#step-2--docker-container-starten)
  - [Zusatz: signal-cli konfigurieren (signal-cli-rest-api)](#zusatz-signal-cli-konfigurieren-signal-cli-rest-api)
  - [Schnelltests](#schnelltests)
  - [Step 3 | Start Coding!](#step-3--start-coding)

---

## Step 0 | Docker installieren

Installieren Sie Docker Desktop auf Ihrem System:
- https://www.docker.com/products/docker-desktop/

```bash
docker version
docker compose version
```

> [!IMPORTANT]
> - Stellen Sie sicher, dass Docker ausgeführt wird, bevor Sie fortfahren.
> - Für die Include-Funktion benötigen Sie Docker Compose v2.20+.

Das Projekt verwendet `docker/compose.enviroment.yaml`, welches folgende Compose-Fragmente inkludiert:

- `metawave_database/compose.database.yaml`
- `metawave_server/compose.server.yaml`
- `metawave_app/compose.app.yaml`
- `signal_cli/compose.signal.yaml`

## Step 1 | Enviroment Files erstellen

Erstellen Sie im Verzeichnis `/docker/metawave_app` eine `.env` Datei mit den folgenden Variablen:

```bash
# Für die lokale Entwicklung können Sie localhost verwenden.
API_DOMAIN_URL=http://localhost:8000
```

Danach erstellen Sie im Verzeichnis `/docker/metawave_server` eine `.env` Datei mit den folgenden Variablen (an Ihre Umgebung anpassen):

```env
# Schauen Sie, dass die Playlist öffentlich zugänglich ist!
PLAYLIST_URL=https://www.youtube.com/playlist?list=PLYfrfvAfnsDmHAS1wU6v-NC5e5iFxmgmH

# --- Required server env vars ---
# API port (radio/auth service)
PORT=8000

# Database connection used by the server (matches docker/metawave_database/.env)
DB_HOST=database
DB_PORT=3306
DB_USER=metawave_user
DB_PASS=strongpassword
DB_NAME=database_metawave

# Auth secret for JWTs
AUTH_SECRET=<random_secret>
AUTH_TOKEN_EXPIRY=3600

# --- Signal (notifications) configuration ---
# Interner Zugriff auf den signal-cli-rest-api Container
SIGNAL_REST_URL=http://signal-api:8000

# Die Nummer, die im signal-api Container registriert ist
SIGNAL_NUMBER=+41XXXXXXXX

# Standard notification text
STANDARD_NOTIFICATION_MESSAGE=Neuer WaveToken wurde generiert. Verwende ihn zum Login.

# --- Downloader configuration (optional fein-tuning) ---
# Number of concurrent downloads per batch
BATCH_SIZE=10
# Seconds to wait between batches
BATCH_DELAY_SECONDS=60
# Seconds to wait between individual video downloads
VIDEO_DELAY_SECONDS=5
# Retry/backoff settings
MAX_RETRIES=5
INITIAL_DELAY_SECONDS=60
# Optional: limit playlist items for testing, e.g. "1-10" or "1,3,5"
#PLAYLIST_ITEMS=

# --- E-Mail (notifications) configuration ---
# (Optional, wenn E-Mail-Benachrichtigungen verwendet werden)
SMTP_HOST=mail.hostpoint.ch
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<dein-hostpoint-login>
SMTP_PASS=<dein-hostpoint-passwort>

# Absender-Adresse für Benachrichtigungs-Mails
EMAIL_FROM="MetaWave <no-reply@deine-domain.tld>"

# Optional: Betreffzeile für E-Mail-Notifications
EMAIL_NOTIFICATION_SUBJECT=Dein neuer MetaWave WaveToken
```

Danach erstellen Sie im Verzeichnis `/docker/metawave_database` eine `.env` Datei. Diese muss zu den `DB_*`-Werten oben passen:

```env
MARIADB_ROOT_PASSWORD=supersecret
MARIADB_DATABASE=database_metawave
MARIADB_USER=metawave_user
MARIADB_PASSWORD=strongpassword
```

## Step 2 | Docker Container starten

Verwenden Sie den folgenden Befehl im Verzeichnis `docker`:

```bash
docker compose -f compose.enviroment.yaml up --build
```

Damit werden Datenbank, Server, Downloader, Signal-API und Client gemäß der inkludierten Dateien gestartet.

---

## Zusatz: signal-cli konfigurieren (signal-cli-rest-api)

Dieses Projekt enthält einen `signal-api`-Service im Compose-Setup (Image: `bbernhard/signal-cli-rest-api`). Nachdem Sie `docker compose up` ausgeführt haben, müssen Sie die Absender-Telefonnummer für den Service registrieren und verifizieren.

1) Öffnen Sie eine Shell im `signal-api`-Container:

```powershell
docker compose -f .\compose.enviroment.yaml exec signal-api sh
```

2) Captcha-Token erzeugen (für die öffentliche Signal-Registrierung erforderlich):

- Öffnen Sie https://signalcaptchas.org/registration/generate.html in Ihrem Browser und lösen Sie das Captcha.
- Rechtsklicken Sie auf den Link "Open Signal" und kopieren Sie den Token-Wert (die URL enthält `token=...`).

3) Registrieren Sie die Nummer im Container (ersetzen Sie die Nummer durch Ihre `SIGNAL_NUMBER`):

```sh
signal-cli -u +41XXXXXXXX register --captcha <TOKEN>
```

4) Verifizieren Sie mit dem per SMS/Anruf erhaltenen Code:

```sh
signal-cli -u +41XXXXXXXX verify <CODE>
```

5) (Optional) Gerät koppeln oder Testnachricht senden:

```sh
signal-cli -u +41XXXXXXXX listDevices
signal-cli -u +41XXXXXXXX send -g "<group-id>" "Test Nachricht"
```

Hinweise:
- Registrierung persistent machen: Die Compose-Datei bindet ein Volume `signal-data` in den `signal-api`-Container (`/home/.local/share/signal-cli`). Bewahren Sie dieses Volume zwischen Neustarts, damit Sie nicht erneut registrieren müssen.
- Wenn die Registrierung fehlschlägt, prüfen Sie die Container-Logs:

```powershell
docker compose -f .\compose.enviroment.yaml logs --tail 200 signal-api
```

Häufige Probleme:
- Captcha-Token abgelaufen oder ungültig → Token erneut unter signalcaptchas.org erzeugen
- SMS/Anruf wird nicht zugestellt → versuchen Sie `register --voice` oder prüfen Sie das Nummernformat
- Volume fehlt → stellen Sie sicher, dass `signal-data` in der Compose-Datei vorhanden ist

## Schnelltests

Prüfen Sie den Status von `signal-api`:

```powershell
curl http://localhost:5000/v1/status
```

Einen Notification-Run über die App auslösen:

```powershell
curl http://localhost:8000/notification/run-job
```

Direkter REST-API-Test (ersetzen Sie `group-id`/`number`):

```powershell
curl -i -X POST http://localhost:5000/v1/send \
	-H "Content-Type: application/json" \
	-d '{"message":"Test Nachricht","number":"+41XXXXXXXX","recipients":["group.<your-group-id>"]}'
```

## Step 3 | Start Coding!

Die folgenden Ports werden verwendet:
- `:8000` → (API) | [Radio & Auth Service](http://localhost:8000)
- `:80` → (Client) | [WebApp](http://localhost:80)
- `5000` → Signal REST API