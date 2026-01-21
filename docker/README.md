# Wie startet man das Projekt mit Docker?

- [Wie startet man das Projekt mit Docker?](#wie-startet-man-das-projekt-mit-docker)
  - [Step 0 | Docker installieren](#step-0--docker-installieren)
  - [Step 1 | Enviroment Files erstellen](#step-1--enviroment-files-erstellen)
  - [Step 2 | Docker Container starten](#step-2--docker-container-starten)
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
```

## Step 2 | Docker Container starten

Verwenden Sie den folgenden Befehl im Verzeichnis `docker`:

```bash
docker compose -f compose.enviroment.yaml up --build
```

## Step 3 | Start Coding!

Die folgenden Ports werden verwendet:
- `:8000` -> (API) | [Radio & Auth Service](http://localhost:8000)
- `:80` -> (Client) | [WebApp](http://localhost:80)