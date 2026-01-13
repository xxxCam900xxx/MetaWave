![MetaWave Banner](/concept/images/MetaWave%20-%20Banner.png)

# MetaWave – Komplette Roadmap

---

## Phase 0: Zieldefinition & Architektur

**Ziele:**
- Audio-Media-Server zuhause hosten
- Endlos-Radio-Stream mit Shuffle-Logik
- Monatliche Playlist-Updates via YouTube
- Client-App (PWA) für iOS/Android
- Zugangscode-System für externen Zugriff
- QR-Code für schnellen Login

**Architektur-Übersicht:**
```
Client-App / PWA
        |
        |  HTTPS + Zugangscode
        v
Cloudflare Tunnel / Reverse Proxy
        |
        v
MetaWave-Server (Python + Node.js)
        |
        v
Shuffle-Radio + yt-dlp + Songs
```

---

## Phase 1: Server Setup

### 1.1 Ordnerstruktur & Dateien
- `/songs/` – Musikdateien
- `/metadata/` – Metadaten JSON
- `/logs/` – Server-Logs
- `codes.json` – Zugangscode-Mapping

### 1.2 Playlist-Downloader
- **Technologie:** Python + yt-dlp
- **Aufgabe:** Monatliche Playlist abrufen, Songs herunterladen, alte Songs löschen
- **Automation:** Cronjob
```bash
0 3 1 * * python3 update_playlist.py
```

### 1.3 Shuffle-Radio-Server
- **Technologie:** Node.js + ffmpeg / audio-streaming
- **Funktionen:**
  - Shuffle-Logik (Fisher-Yates)
  - Endlos-Stream `/stream`
  - Steuer-Endpunkte `/skip`, `/play`, `/queue`
  - Metadaten-Endpunkt `/meta`

### 1.4 Zugangscode-Check
- **codes.json**
```json
{
  "2026-01": "RADIO-1234",
  "2026-02": "META-5678"
}
```
- Server prüft jeden Request → gültig = Zugriff erlaubt

---

## Phase 2: Von außen erreichbar

### 2.1 Cloudflare Tunnel
- Installiere `cloudflared`
- Befehl:
```bash
cloudflared tunnel run metawave
```
- Ergebnis: `https://metawave.yourdomain.com`

### 2.2 HTTPS & Sicherheit
- Tunnel erledigt TLS/HTTPS
- Zugangscode prüfen bei allen Requests
- Rate-Limits auf API-Endpunkte
- Keine offenen Admin-Endpunkte

---

## Phase 3: Client / App (PWA)

### 3.1 Grundfunktionen
- Zugangscode-Eingabe
- Stream abspielen
- Skip / Lautstärke / Play / Pause
- Metadaten-Anzeige
- Queue / Favoriten

### 3.2 QR-Code-Login
- Generiere QR-Code für aktuellen Zugangscode
- Scan in App → Code automatisch eintragen
- Technologie: `qrcode.js` oder serverseitig Python `qrcode`-Bibliothek

### 3.3 PWA Features
- Homescreen-Installation
- Offline-Caching (optional, nur Metadaten)
- Responsive Design

---

## Phase 4: Server-Client-Kommunikation

| Funktion       | Ausgeführt von | Technologie       |
|----------------|----------------|-----------------|
| Audio-Stream   | Server         | HTTP/HTTPS       |
| Skip Song      | Client → Server| WebSocket/REST   |
| Play/Pause     | Client → Server| WebSocket/REST   |
| Shuffle        | Server         | Fisher-Yates Algorithmus |
| Neue Playlist  | Server         | Cronjob + yt-dlp |
| QR-Code Login  | Client → Server| Scan + Code Validierung |

---

## Phase 5: Testing

- Endlos-Stream testen → keine Wiederholungen vor neuem Shuffle
- Skip/Play/Queue → synchron mit mehreren Clients
- Zugangscode → gültig/ungültig prüfen
- QR-Code Login → Scan funktioniert korrekt
- Tunnel / HTTPS → von extern erreichbar

---

## Phase 6: Optional / Feinschliff

- Push-Benachrichtigungen bei neuen Songs
- Favoriten pro Benutzer speichern
- Codes automatisch monatlich generieren
- Design optimieren (App & Metadatenanzeige)

---

## Phase 7: Zeitplan (Empfehlung)

| Phase | Dauer |
|-------|-------|
| 1 – Server lokal | 1–2 Wochen |
| 2 – Tunnel & HTTPS | 1 Tag |
| 3 – PWA & QR-Code | 1–2 Wochen |
| 4 – Kommunikation & API | 1 Woche |
| 5 – Testing & Debug | 3–5 Tage |
| 6 – Optionales Feinschliff | flexibel |

---

## Phase 8: Tech-Stack Zusammenfassung

| Bereich | Technologie |
|---------|-------------|
| Playlist Download | Python + yt-dlp + Cron |
| Audio-Stream | Node.js + ffmpeg |
| Auth / Code-Check | Node.js / Python |
| Tunnel / Remote Access | Cloudflare Tunnel / LocalUp |
| Client App | PWA (React oder Vanilla JS) |
| QR-Code Login | qrcode.js / Python qrc