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

## Step 1 | Enviroment Files erstellen

Erstellen Sie im Verzeichnis `/docker/metawave_app` eine `.env` Datei mit den folgenden Variablen:

```bash
# Für die lokale Entwicklung können Sie localhost verwenden.
API_DOMAIN_URL=<http://localhost:8000>
```

Danach erstellen Sie im Verzeichnis `/docker/metawave_server` eine `.env` Datei mit den folgenden Variablen:
```bash
# Schauen Sie das die Playlist öffentlich zugänglich ist!
PLAYLIST_URL=<https://example.org/?playlist=kjnqwdoiugfikpoashd>

# --- Required server env vars ---
# API port (radio/auth service)
PORT=8000

# Database connection used by the server (matches docker/metawave_database/.env)
DB_HOST=database
DB_PORT=3306
DB_USER=metawave_user
DB_PASS=metawave_db_pass
DB_NAME=metawave_db

# Auth secret for JWTs
AUTH_SECRET=<random_secret>
AUTH_TOKEN_EXPIRY=1800

# --- Signal (notifications) configuration ---
# Option A: use the internal signal-cli-rest-api container (recommended)
# Set SIGNAL_REST_API_URL to the internal URL (we use http://signal-api:8000 in compose)
SIGNAL_REST_API_URL=http://signal-api:8000

# The phone number registered in signal-cli (must be registered/verified)
# Example: +41798878717
SIGNAL_FROM_NUMBER=+41798878717

# Optional: if you install signal-cli inside the radio container instead
# SIGNAL_CLI_CMD=/usr/bin/signal-cli

# Standard notification text
STANDARD_NOTIFICATION_MESSAGE=Neuer WaveToken wurde generiert. Verwende ihn zum Login.

# --- E-Mail (notifications) configuration ---
# SMTP settings (z.B. Hostpoint)
SMTP_HOST=mail.hostpoint.ch
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<dein-hostpoint-login>
SMTP_PASS=<dein-hostpoint-passwort>

# Absender-Adresse für Benachrichtigungs-Mails
EMAIL_FROM="MetaWave <no-reply@deine-domain.tld>"

# Optional: Betreffzeile für E-Mail-Notifications
EMAIL_NOTIFICATION_SUBJECT=Dein neuer MetaWave WaveToken

# Playlist URL for the downloader service
PLAYLIST_URL="https://www.youtube.com/playlist?list=PLYfrfvAfnsDnKbAvlaQzHTxwToq0m5jMj"
```

## Step 2 | Docker Container starten

Verwenden Sie den folgenden Befehl im Verzeichnis `docker`:

```bash
docker compose -f compose.enviroment.yaml up --build
```

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

3) Registrieren Sie die Nummer im Container (ersetzen Sie die Nummer durch Ihre `SIGNAL_FROM_NUMBER`):

```sh
signal-cli -u +41798878717 register --captcha <TOKEN>
```

4) Verifizieren Sie mit dem per SMS/Anruf erhaltenen Code:

```sh
signal-cli -u +41798878717 verify <CODE>
```

5) (Optional) Gerät koppeln oder Testnachricht senden:

```sh
signal-cli -u +41798878717 listDevices
signal-cli -u +41798878717 send -g "<group-id>" "Test Nachricht"
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
  -d '{"message":"Test Nachricht","number":"+41798878717","recipients":["group.<your-group-id>"]}'
```

## Step 3 | Start Coding!

Die folgenden Ports werden verwendet:
- `:8000` → (API) | [Radio & Auth Service](http://localhost:8000)
- `:80` → (Client) | [WebApp](http://localhost:80)
- `5000` → Signal REST API