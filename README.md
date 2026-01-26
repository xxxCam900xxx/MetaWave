![MetaWave Banner](/concept/images/MetaWave%20-%20Banner.png)

# MetaWave
**Music without limits, streaming without ads**

MetaWave ist ein innovativer Audio-Media-Server mit Client-Anwendung, der es ermöglicht, YouTube-Playlists werbefrei und gemeinsam mit Freunden oder Kollegen zu streamen. Das System lädt automatisch monatlich Playlists herunter und streamt sie endlos im Shuffle-Modus. 

## Was ist MetaWave?

MetaWave löst das Problem des gemeinsamen Musik-Streamings ohne Werbung und mit vollständiger Kontrolle über die Playlist. Jeder verbundene Client kann Songs überspringen, neu shuffeln und die Lautstärke anpassen - alles synchron für alle Teilnehmer.

### Hauptfunktionen
- **Werbefreies Streaming** von YouTube-Playlists
- **Synchrones Hören** mit mehreren Teilnehmern
- **Gemeinsame Kontrolle** (Skip, Shuffle, Queue Management)
- **Sichere Authentifizierung** mit monatlichen Wave-Tokens
- **Cross-Platform Client** (Web, iOS, Android via Expo)
- **Individuelle Lautstärkeregelung** pro Client
- **Push-Benachrichtigungen** für neue Tokens

## Projektstruktur

```
MetaWave/
├── app/                          # Client-Anwendungen
│   ├── metawave_app/            # React Native App (Expo)
│   ├── metawave_database/       # Datenbank Setup
│   └── metawave_server/         # Backend Services
│       ├── downloader/          # YouTube Downloader Service
│       ├── radio/               # Radio Streaming Engine
│       └── shared/              # Gemeinsame Ressourcen
├── concept/                     # Projekt-Dokumentation
├── docker/                      # Docker Container Setup
└── README.md                    # Diese Datei
```

## Schnellstart

### Voraussetzungen
- Docker & Docker Compose
- Node.js 18+ (für lokale Entwicklung)
- Expo CLI (für Mobile App)
- YouTube API Cookies (für Downloads)

### Mit Docker starten

1. **Repository klonen**
   ```bash
   git clone <repository-url>
   cd MetaWave
   ```

2. **Environment Setup**
   ```bash
   # Folgen Sie der Anleitung in docker/README.md
   cd docker
   # Erstellen Sie die erforderlichen .env Dateien
   ```

3. **Container starten**
   ```bash
   docker compose -f docker/compose.enviroment.yaml up -d
   ```

4. **Client starten**
   ```bash
   cd app/metawave_app
   npm install
   npm start
   ```

Detaillierte Setup-Anweisungen finden Sie in [docker/README.md](docker/README.md).

## Architektur & Infrastruktur

![Infrastruktur](/concept/images/Infrastructure.drawio.png)

### Komponenten

- **Frontend Client**: React Native App mit Expo (Web, iOS, Android)
- **Backend Server**: Node.js mit Express
- **Datenbank**: MySQL für User-Management und Metadaten
- **Downloader**: Python-basierter YouTube-zu-Audio Converter
- **Notification Service**: Signal/WhatsApp Integration für Token-Verteilung

### Services

| Service | Technologie | Beschreibung |
|---------|------------|-------------|
| **Authentication** | Node.js + JWT | Monatliche Wave-Token Generation |
| **Radio Engine** | Node.js + WebSocket | Audio-Streaming & Kontrolle |
| **Notification** | Python + Signal-CLI | Token-Verteilung |
| **Downloader** | Python + yt-dlp | YouTube-zu-Audio Konvertierung |

## Dokumentation

| Datei | Beschreibung |
|-------|-------------|
| [DEPLOYMENT.md](DEPLOYMENT.md) | Produktive Deployment-Anleitung |
| [concept/README.md](concept/README.md) | Detaillierte Projektbeschreibung |
| [concept/ENDPOINTS.md](concept/ENDPOINTS.md) | API-Dokumentation |
| [concept/DOWNLOADER_LOGIC.md](concept/DOWNLOADER_LOGIC.md) | Downloader-Architektur |
| [docker/README.md](docker/README.md) | Docker Setup Guide |
| [docker/GET_YT_COOKIES.md](docker/GET_YT_COOKIES.md) | YouTube Cookie Setup |

## Entwicklung

### Lokale Entwicklung

1. **Backend starten**
   ```bash
   cd app/metawave_server/radio
   npm install
   npm start
   ```

2. **Frontend entwickeln**
   ```bash
   cd app/metawave_app
   npm install
   npm run web    # Für Web-Development
   npm run ios    # Für iOS Simulator
   npm run android # Für Android Emulator
   ```

3. **Downloader testen**
   ```bash
   cd app/metawave_server/downloader
   pip install -r requirements.txt
   python download_chunk.py
   ```

### API-Endpunkte

Die vollständige API-Dokumentation finden Sie in [concept/ENDPOINTS.md](concept/ENDPOINTS.md).

Wichtige Endpunkte:
- `POST /login` - Authentifizierung mit Wave-Token
- `GET /stream` - Audio-Stream abrufen
- `GET /stream/control/skip` - Nächsten Song abspielen
- `POST /notification/signal/invite` - Signal-Einladung senden

## Konfiguration

### Environment Variablen

Erstellen Sie `.env` Dateien für:
- Database-Konfiguration
- YouTube API Credentials
- Signal-CLI Setup
- JWT Secrets

Beispiel-Konfigurationen finden Sie in den jeweiligen Docker-Ordnern.

## Client Features

### Web-App
- Responsive Design für Desktop und Mobile
- Live-Synchronisation mit anderen Clients
- Playlist-Management
- Volume-Kontrolle

### Mobile App (React Native)
- Native iOS/Android Performance
- Push-Benachrichtigungen
- Offline-Fähigkeiten
- Gesture-basierte Kontrollen

## Sicherheit

- **Wave-Token**: Monatlich rotierende JWT-Token
- **Sichere API**: CORS und Rate-Limiting
- **Firewall-Integration**: Für produktive Deployments
- **SSL/TLS**: HTTPS für alle Verbindungen

## Deployment

### Produktiv-Deployment
Detaillierte Anweisungen für das produktive Deployment finden Sie in [DEPLOYMENT.md](DEPLOYMENT.md).

### Docker-Compose
Das Projekt nutzt ein modulares Docker-Setup:
- `compose.enviroment.yaml` - Haupt-Orchestration
- `compose.database.yaml` - MySQL Setup
- `compose.server.yaml` - Backend Services
- `compose.app.yaml` - Frontend Container

## Contributing

1. Fork das Repository
2. Erstelle einen Feature-Branch (`git checkout -b feature/amazing-feature`)
3. Commit deine Änderungen (`git commit -m 'Add amazing feature'`)
4. Push zum Branch (`git push origin feature/amazing-feature`)
5. Erstelle einen Pull Request

## Lizenz

Dieses Projekt steht unter der [LICENSE](LICENSE) - siehe die Lizenz-Datei für Details.

## Support & Kontakt

Bei Fragen oder Problemen:
- Erstelle ein Issue im Repository
- Prüfe die Dokumentation in `/concept/`
- Folge dem Setup-Guide in `/docker/README.md`

---

**MetaWave** - Entwickelt mit ❤️ für das ultimative gemeinsame Musik-Erlebnis.
