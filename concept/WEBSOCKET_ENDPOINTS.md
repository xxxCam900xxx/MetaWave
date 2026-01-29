# MetaWave WebSocket Endpoints

## Inhaltsverzeichnis
- [MetaWave WebSocket Endpoints](#metawave-websocket-endpoints)
  - [Inhaltsverzeichnis](#inhaltsverzeichnis)
  - [Übersicht](#übersicht)
  - [Connection](#connection)
    - [Endpoint](#endpoint)
    - [Authentication](#authentication)
    - [Connection Flow](#connection-flow)
  - [Server → Client Events](#server--client-events)
    - [1. `trackChanged`](#1-trackchanged)
    - [2. `queueUpdated`](#2-queueupdated)
    - [3. `volumeChanged`](#3-volumechanged)
    - [4. `settingsUpdated`](#4-settingsupdated)
  - [Client → Server Messages](#client--server-messages)
    - [1. `SKIP`](#1-skip)
    - [2. `PREVIOUS`](#2-previous)
    - [3. `SHUFFLE_REMAINING`](#3-shuffle_remaining)
    - [4. `JUMPTO:{index}`](#4-jumptoindex)
  - [Connection Lifecycle](#connection-lifecycle)
    - [Initial State](#initial-state)
    - [Reconnection Strategy (Client)](#reconnection-strategy-client)
    - [Heartbeat](#heartbeat)
  - [Error Handling](#error-handling)
    - [Server-Side](#server-side)
    - [Client-Side](#client-side)
  - [Performance Characteristics](#performance-characteristics)
    - [Bandwidth Comparison](#bandwidth-comparison)
    - [Message Size](#message-size)
  - [Best Practices](#best-practices)
    - [Client Implementation](#client-implementation)
    - [Server Implementation](#server-implementation)
  - [Security](#security)
    - [Authentication](#authentication-1)
    - [Rate Limiting](#rate-limiting)
    - [Cross-Origin](#cross-origin)
  - [Testing](#testing)
    - [WebSocket Connection Test](#websocket-connection-test)
    - [Browser DevTools](#browser-devtools)
  - [Migration Guide (HTTP → WebSocket)](#migration-guide-http--websocket)
    - [Alte Implementation (HTTP Polling)](#alte-implementation-http-polling)
    - [Neue Implementation (WebSocket)](#neue-implementation-websocket)
  - [Related Documentation](#related-documentation)

## Übersicht

MetaWave nutzt WebSockets für Echtzeit-Kommunikation zwischen Server und Clients. Dies eliminiert die Notwendigkeit für HTTP-Polling und reduziert die Netzwerklast drastisch.

## Connection

### Endpoint
```
ws://localhost:8000/?token={JWT_TOKEN}
wss://metawave.timofej.ch/?token={JWT_TOKEN}
```

### Authentication
- **Query Parameter:** `token` (JWT Bearer Token)
- **Validation:** Token wird bei Connection-Aufbau validiert
- **Rejection:** Bei ungültigem Token wird die Verbindung sofort geschlossen

### Connection Flow
```
Client                          Server
  |                               |
  |--- WS Connect (token) ------> |
  |                               |--- Validate Token
  |                               |
  | <-- Initial State Messages -- |
  |     - trackChanged            |
  |     - queueUpdated            |
  |     - volumeChanged           |
  |                               |
  |<========= Connected =========>|
```

## Server → Client Events

### 1. `trackChanged`
Wird gesendet wenn ein neuer Track startet.

**Event Type:** `trackChanged`

**Payload:**
```json
{
  "type": "trackChanged",
  "meta": {
    "filename": "song.mp3",
    "title": "Song Title",
    "author": "Artist Name",
    "duration": 240,
    "cover": "https://example.com/cover.jpg",
    "index": 5,
    "total": 100,
    "elapsed": 0
  }
}
```

**Fields:**
- `filename` (string): Dateiname des aktuellen Songs
- `title` (string): Song-Titel
- `author` (string): Künstler-Name
- `duration` (number): Song-Dauer in Sekunden
- `cover` (string): URL zum Cover-Image
- `index` (number): Position in der Queue (0-basiert)
- `total` (number): Gesamtanzahl Songs in Queue
- `elapsed` (number): Verstrichene Zeit in Sekunden (bei Track-Start = 0)

**Trigger:**
- Neuer Song startet
- Skip/Previous wurde ausgeführt
- Jump-to wurde ausgeführt

**Client Action:**
- Meta-State updaten
- Lokalen Timer auf `elapsed` zurücksetzen
- UI neu rendern

---

### 2. `queueUpdated`
Wird gesendet wenn sich die Queue ändert.

**Event Type:** `queueUpdated`

**Payload:**
```json
{
  "type": "queueUpdated",
  "queue": {
    "nowPlayingIndex": 5,
    "nowPlaying": "current-song.mp3",
    "queue": [
      {
        "song": "song1.mp3",
        "title": "First Song",
        "author": "Artist 1",
        "duration": 180,
        "cover": "https://example.com/cover1.jpg",
        "index": 0,
        "isPlaying": false,
        "hasBeenPlayed": true
      },
      {
        "song": "song2.mp3",
        "title": "Second Song",
        "author": "Artist 2",
        "duration": 240,
        "cover": "https://example.com/cover2.jpg",
        "index": 1,
        "isPlaying": true,
        "hasBeenPlayed": false
      }
    ]
  }
}
```

**Queue Item Fields:**
- `song` (string): Dateiname
- `title` (string): Song-Titel
- `author` (string): Künstler
- `duration` (number): Dauer in Sekunden
- `cover` (string): Cover-URL
- `index` (number): Position in Queue
- `isPlaying` (boolean): Aktuell spielend
- `hasBeenPlayed` (boolean): Bereits gespielt

**Trigger:**
- Shuffle wurde ausgeführt
- Jump-to wurde ausgeführt
- Queue wurde neu geladen
- Track-Wechsel (zusammen mit trackChanged)

**Client Action:**
- Queue-State komplett ersetzen
- Scroll zu aktuellem Song
- UI neu rendern

---

### 3. `volumeChanged`
Wird gesendet wenn die Lautstärke geändert wird.

**Event Type:** `volumeChanged`

**Payload:**
```json
{
  "type": "volumeChanged",
  "volume": 85
}
```

**Fields:**
- `volume` (number): Lautstärke in Prozent (0-200)

**Trigger:**
- Volume-Endpoint wurde aufgerufen
- Ein Client hat Lautstärke geändert
- Initial State beim Connect

**Client Action:**
- Volume-State updaten
- Volume-Anzeige aktualisieren

---

### 4. `settingsUpdated`
Wird gesendet wenn Radio-Settings geändert werden.

**Event Type:** `settingsUpdated`

**Payload:**
```json
{
  "type": "settingsUpdated",
  "settings": {
    "monotoneEnabled": true,
    "monotoneReduceLoud": false,
    "minArtistDistance": 5
  }
}
```

**Fields:**
- `monotoneEnabled` (boolean): EBU R128 Loudness Normalization aktiv
- `monotoneReduceLoud` (boolean): Auch laute Songs reduzieren
- `minArtistDistance` (number): Min. Abstand zwischen Songs desselben Artists

**Trigger:**
- Settings wurden via API geändert
- Initial State beim Connect (implizit via separatem Fetch)

**Client Action:**
- Settings-State updaten
- Settings-UI aktualisieren

---

## Client → Server Messages

### 1. `SKIP`
Springt zum nächsten Song.

**Message:**
```
SKIP
```

**Server Action:**
- Aktuellen FFmpeg-Prozess beenden
- Nächsten Song starten
- `trackChanged` Event senden
- `queueUpdated` Event senden

**Equivalent HTTP:**
```
GET /stream/control/skip
```

---

### 2. `PREVIOUS`
Springt zum vorherigen Song.

**Message:**
```
PREVIOUS
```

**Server Action:**
- Aktuellen FFmpeg-Prozess beenden
- Vorherigen Song starten
- `trackChanged` Event senden
- `queueUpdated` Event senden

**Equivalent HTTP:**
```
GET /stream/control/previous
```

---

### 3. `SHUFFLE_REMAINING`
Shuffelt die verbleibenden Songs in der Queue.

**Message:**
```
SHUFFLE_REMAINING
```

**Server Action:**
- Bereits gespielte Songs behalten Position
- Verbleibende Songs shuffeln (mit Artist-Distance-Logik)
- `queueUpdated` Event senden

**Equivalent HTTP:**
```
GET /stream/control/shuffle
```

---

### 4. `JUMPTO:{index}`
Springt zu einem bestimmten Song in der Queue.

**Message:**
```
JUMPTO:42
```

**Parameters:**
- `index` (number): Queue-Index (0-basiert)

**Server Action:**
- Validierung des Index
- Aktuellen Song beenden
- Zu gewünschtem Song springen
- Queue reorganisieren (übersprungene Songs bleiben in Queue)
- `trackChanged` Event senden
- `queueUpdated` Event senden

**Equivalent HTTP:**
```
GET /stream/control/jumpto/42
```

---

## Connection Lifecycle

### Initial State
Beim erfolgreichen Connect sendet der Server sofort:
1. `trackChanged` - Aktueller Song
2. `queueUpdated` - Komplette Queue
3. `volumeChanged` - Aktuelle Lautstärke

Dies ermöglicht es neuen Clients, sofort den kompletten State zu haben.

### Reconnection Strategy (Client)
```typescript
ws.onclose = () => {
  console.log("WebSocket geschlossen, versuche Reconnect in 3s...");
  wsRef.current = null;
  
  // Auto-Reconnect nach 3 Sekunden
  setTimeout(() => {
    setupWebSocket();
  }, 3000);
};
```

**Reconnect Logic:**
- Bei normalem Close: Reconnect nach 3s
- Bei Fehler: Reconnect nach 5s
- HTTP-Fallback: Initial Fetch wenn WS nicht verfügbar

### Heartbeat
- **Client:** Automatisch via Browser WebSocket Implementation
- **Server:** WebSocket-Library handled automatisch
- **Timeout:** Browser-Default (meist 30-60s inactivity)

---

## Error Handling

### Server-Side
```javascript
wss.on("connection", (ws, req) => {
  const token = new URL(req.url || "", `http://${req.headers.host}`)
    .searchParams.get("token");

  if (!verifyToken(token)) {
    ws.close();  // Sofortiger Disconnect bei ungültigem Token
    return;
  }
  
  // ... normale Connection-Logik
});
```

### Client-Side
```typescript
ws.onerror = () => {
  console.log("WebSocket Fehler");
  // Kein direkter Reconnect - onclose handler wird getriggert
};

ws.onclose = () => {
  // Reconnect-Logic hier
};
```

---

## Performance Characteristics

### Bandwidth Comparison
| Method | Requests/min | Data/min | Latency |
|--------|--------------|----------|---------|
| **HTTP Polling (1s)** | 60 | ~120 KB | 50-200ms |
| **HTTP Polling (5s)** | 12 | ~24 KB | 50-200ms |
| **WebSocket** | ~0.2 | ~0.4 KB | 5-20ms |

**WebSocket Vorteile:**
- 99% weniger Bandwidth
- 95% weniger Latency
- Instant Updates (keine Polling-Verzögerung)
- Keine redundanten Requests

### Message Size
- `trackChanged`: ~200-500 bytes (komprimiert)
- `queueUpdated`: ~5-20 KB für 100 Songs (komprimiert, gecacht)
- `volumeChanged`: ~50 bytes
- Client Messages: 4-20 bytes

---

## Best Practices

### Client Implementation
1. **Immer Reconnect-Logic implementieren**
2. **HTTP-Fallback für Initial Load**
3. **Lokaler Timer für elapsed time** (statt Server zu pollen)
4. **Optimistic UI Updates** wo möglich
5. **Error Handling** für malformed messages

### Server Implementation
1. **Auth bei Connection-Aufbau**
2. **Initial State sofort senden**
3. **Broadcast nur bei echten Änderungen**
4. **Cleanup bei Disconnect**
5. **Rate Limiting** für Client-Messages (optional)

---

## Security

### Authentication
- JWT Token im Query String
- Token-Validation vor Connection-Accept
- Token-Refresh über HTTP (alle 10 Minuten)

### Rate Limiting
Derzeit nicht implementiert. Mögliche Erweiterungen:
- Max. X messages pro Sekunde pro Client
- Throttling für SKIP/PREVIOUS
- Backoff bei zu vielen JUMPTO

### Cross-Origin
WebSocket respektiert CORS nicht direkt, aber:
- Token-Validation ersetzt Origin-Check
- HTTPS/WSS in Production mandatory
- Token nur via sichere Kanäle übertragen

---

## Testing

### WebSocket Connection Test
```javascript
const ws = new WebSocket('ws://localhost:8000/?token=YOUR_JWT_TOKEN');

ws.onopen = () => console.log('Connected');
ws.onmessage = (event) => console.log('Message:', JSON.parse(event.data));
ws.onerror = (error) => console.error('Error:', error);
ws.onclose = () => console.log('Disconnected');

// Test Commands
ws.send('SKIP');
ws.send('PREVIOUS');
ws.send('SHUFFLE_REMAINING');
ws.send('JUMPTO:10');
```

### Browser DevTools
1. **Network Tab → WS Filter**
2. **Messages Tab** - Alle ein/ausgehenden Messages
3. **Timing Tab** - Latency Analyse
4. **Size Tab** - Bandwidth Monitoring

---

## Migration Guide (HTTP → WebSocket)

### Alte Implementation (HTTP Polling)
```typescript
// Ineffizient - alle 5s Request
setInterval(() => {
  fetch('/stream/meta/currentsong')
    .then(res => res.json())
    .then(data => setMeta(data.metadata));
}, 5000);
```

### Neue Implementation (WebSocket)
```typescript
// Effizient - nur bei Änderung
const ws = new WebSocket(WS_URL);
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'trackChanged') {
    setMeta(data.meta);
    setLocalElapsedTime(data.meta.elapsed);
  }
};

// Lokaler Timer für Progress
setInterval(() => {
  setLocalElapsedTime(prev => prev + 1);
}, 1000);
```

---

## Related Documentation
- [ENDPOINTS.md](ENDPOINTS.md) - REST API Endpoints
- [RADIO_ENGINE.md](RADIO_ENGINE.md) - RadioEngine Implementierung
- [../PERFORMANCE_OPTIMIZATIONS.md](../PERFORMANCE_OPTIMIZATIONS.md) - Performance Guide

---

**Version:** 2.0.0  
**Last Updated:** 29. Januar 2026  
**Author:** MetaWave Team
