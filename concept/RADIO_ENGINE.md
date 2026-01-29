![MetaWave Banner](/concept/images/MetaWave%20-%20Banner.png)

# MetaWave | Radio Engine Logik

Die RadioEngine ist das Herzstück von MetaWave und verantwortlich für die komplette Audio-Streaming-Logik, Queue-Verwaltung, Smart Shuffle und Echtzeit-Audio-Verarbeitung.

## Inhaltsverzeichnis
- [MetaWave | Radio Engine Logik](#metawave--radio-engine-logik)
  - [Inhaltsverzeichnis](#inhaltsverzeichnis)
  - [Übersicht](#übersicht)
  - [Architektur](#architektur)
  - [Queue Management](#queue-management)
    - [Laden der Queue](#laden-der-queue)
    - [Queue State](#queue-state)
  - [Playback Pipeline](#playback-pipeline)
    - [FFmpeg Decoder/Encoder Architektur](#ffmpeg-decoderencoder-architektur)
    - [Live Gain Transform](#live-gain-transform)
    - [Stream Distribution](#stream-distribution)
  - [Smart Shuffle Algorithmus](#smart-shuffle-algorithmus)
    - [Artist Distance Feature](#artist-distance-feature)
    - [Artist Identifier Extraktion](#artist-identifier-extraktion)
    - [Greedy Placement Strategie](#greedy-placement-strategie)
  - [Control Functions](#control-functions)
    - [Skip](#skip)
    - [Previous](#previous)
    - [Jump To](#jump-to)
    - [Shuffle Remaining](#shuffle-remaining)
  - [Settings \& Configuration](#settings--configuration)
    - [Volume Control](#volume-control)
    - [EBU R128 Normalisierung](#ebu-r128-normalisierung)
    - [Minimum Artist Distance](#minimum-artist-distance)
  - [WebSocket Broadcasting](#websocket-broadcasting)
    - [Event Types](#event-types)
    - [Broadcasting Implementation](#broadcasting-implementation)
  - [Event Flow](#event-flow)
    - [Song Playback Lifecycle](#song-playback-lifecycle)
    - [Skip/Previous Flow](#skipprevious-flow)
    - [Jump To Flow](#jump-to-flow)
  - [Zusammenfassung](#zusammenfassung)

---

## Übersicht

Die RadioEngine ist als `EventEmitter` implementiert und verwaltet:
- **Queue**: Liste aller Songs mit Metadaten
- **Playback State**: Aktueller Index, laufende FFmpeg-Prozesse
- **Client Management**: HTTP-Stream-Clients und WebSocket-Clients
- **Audio Processing**: Decoder → Live Gain Transform → Encoder Pipeline
- **Smart Features**: Artist Distance, EBU R128 Normalisierung

```javascript
export class RadioEngine extends EventEmitter {
  constructor() {
    this.queue = [];              // Song-Warteschlange
    this.currentIndex = 0;        // Aktueller Song-Index
    this.currentDecoder = null;   // FFmpeg Decoder Prozess
    this.currentEncoder = null;   // FFmpeg Encoder Prozess
    this.clients = new Set();     // HTTP Stream Clients
    this.wsClients = new Set();   // WebSocket Clients
    this.volumePercent = 100;     // Globale Lautstärke (0-200%)
    this.monotoneEnabled = false; // EBU R128 Normalisierung
    this.minArtistDistance = 5;   // Mindestabstand zwischen gleichen Artists
  }
}
```

---

## Architektur

```
┌─────────────────────────────────────────────────────────────┐
│                      RadioEngine                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐ │
│  │   Queue      │───▶│   Playback   │───▶│   Clients    │ │
│  │  Management  │    │   Pipeline   │    │ Distribution │ │
│  └──────────────┘    └──────────────┘    └──────────────┘ │
│         │                    │                    │        │
│         │                    │                    │        │
│  ┌──────▼──────┐    ┌────────▼────────┐  ┌───────▼──────┐ │
│  │   Smart     │    │  Live Gain      │  │  WebSocket   │ │
│  │   Shuffle   │    │  Transform      │  │  Broadcast   │ │
│  └─────────────┘    └─────────────────┘  └──────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Queue Management

### Laden der Queue

Beim Start lädt die RadioEngine alle verfügbaren Songs aus `metadata.json`:

```javascript
loadQueue() {
  // 1. Prüfe ob metadata.json existiert
  if (!fs.existsSync(METADATA_FILE)) {
    // Fallback: Lade nur Dateinamen
    const files = fs.readdirSync(SONGS_DIR)
      .filter(f => f.endsWith(".mp3") && !f.endsWith(".info.mp3"));
    this.queue = files.map(f => ({ filename: f, title: f }));
    return;
  }

  // 2. Lade vollständige Metadaten
  const data = JSON.parse(fs.readFileSync(METADATA_FILE, "utf-8"));
  
  // 3. Filtere nur existierende Songs (keine .info.mp3)
  this.queue = data
    .filter(s => s?.filename && fs.existsSync(path.join(SONGS_DIR, s.filename)) 
                 && !s.filename.endsWith(".info.mp3"))
    .map(s => ({
      filename: s.filename,
      title: s.title || s.filename,
      author: s.author || "",
      cover: s.cover || "",
      duration: s.duration || 0,
      lufs: s.lufs || null  // LUFS Daten für Normalisierung
    }));

  // 4. Initiales Shuffle
  if (this.queue.length > 0) {
    this.shuffleQueue();
  }
}
```

**Song-Struktur:**
```javascript
{
  filename: "song123.mp3",        // Dateiname
  title: "Artist - Song Title",   // Anzeigetitel
  author: "Artist Name",          // Künstler (optional)
  cover: "https://...",           // Cover URL
  duration: 215,                  // Dauer in Sekunden
  lufs: {                         // LUFS Daten (optional)
    input_i: -14.5,               // Integrated Loudness
    input_tp: -0.8                // True Peak
  },
  hasBeenPlayed: false            // Runtime Flag
}
```

### Queue State

Der `getQueueState()` liefert den kompletten Queue-Status für Clients:

```javascript
getQueueState() {
  return {
    nowPlayingIndex: this.currentIndex,
    nowPlaying: this.queue[this.currentIndex]?.filename || "",
    queue: this.queue.map((song, index) => ({
      song: song.filename,
      title: song.title,
      author: song.author,
      duration: song.duration,
      cover: song.cover,
      index,
      isPlaying: index === this.currentIndex,
      hasBeenPlayed: (typeof song.hasBeenPlayed === "boolean") 
        ? song.hasBeenPlayed 
        : (index < this.currentIndex)
    }))
  };
}
```

---

## Playback Pipeline

### FFmpeg Decoder/Encoder Architektur

MetaWave nutzt eine 3-stufige Audio-Pipeline für maximale Flexibilität:

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Decoder    │─────▶│ GainTransform│─────▶│   Encoder    │
│   (FFmpeg)   │ PCM  │  (Live Gain) │ PCM  │   (FFmpeg)   │
│              │ s16le│   + LUFS     │ s16le│              │
│ MP3 → PCM    │      │   + Volume   │      │ PCM → MP3    │
└──────────────┘      └──────────────┘      └──────────────┘
       │                      │                      │
       │                      │                      │
       ▼                      ▼                      ▼
  Input File            Live Processing        Output Stream
```

**1. Decoder (MP3 → PCM)**
```javascript
const decoderArgs = [
  "-re",                  // Echtzeit-Modus
  "-i", filePath,         // Input Datei
  "-f", "s16le",          // Format: signed 16-bit little-endian
  "-acodec", "pcm_s16le", // Codec: PCM 16-bit
  "-ac", "2",             // 2 Channels (Stereo)
  "-ar", "44100",         // Sample Rate: 44.1kHz
  "pipe:1"                // Output zu stdout
];
```

**2. Live Gain Transform**

Benutzerdefinierter `Transform` Stream für Echtzeit-Manipulation:

```javascript
class GainTransform extends Transform {
  _transform(chunk, encoding, callback) {
    const mult = this.getMultiplier(); // Volume * LUFS Gain
    const out = Buffer.alloc(chunk.length);
    
    // Verarbeite 16-bit Samples
    for (let i = 0; i < chunk.length; i += 2) {
      const sample = chunk.readInt16LE(i);
      let s = Math.round(sample * mult);
      
      // Clipping Prevention
      if (s > 32767) s = 32767;
      if (s < -32768) s = -32768;
      
      out.writeInt16LE(s, i);
    }
    this.push(out);
    callback();
  }
}
```

**Gain Berechnung:**
```javascript
const getMultiplier = () => {
  const vol = this.currentVolumeMultiplier; // User Volume (0-2.0)
  let monoMult = 1;
  
  if (this.monotoneEnabled && song.lufs) {
    const targetLUFS = -14.0;  // Broadcast Standard
    const currentLUFS = song.lufs.input_i;
    let gainDb = targetLUFS - currentLUFS;
    
    // Optional: Nur leise Songs boosten
    if (gainDb < 0 && !this.monotoneReduceLoud) gainDb = 0;
    
    monoMult = Math.pow(10, gainDb / 20); // dB zu linear
  }
  
  return vol * monoMult;
};
```

**3. Encoder (PCM → MP3)**
```javascript
const encoderArgs = [
  "-f", "s16le",     // Input Format
  "-ar", "44100",    // Sample Rate
  "-ac", "2",        // Channels
  "-i", "pipe:0",    // Input von stdin
  "-f", "mp3",       // Output Format
  "-b:a", "128k",    // Bitrate
  "pipe:1"           // Output zu stdout
];
```

**Pipeline Connection:**
```javascript
decoder.stdout.pipe(gainTransform).pipe(encoder.stdin);
```

### Live Gain Transform

**Vorteil:** Änderungen an Volume/LUFS werden **ohne Neustart** angewendet!

```javascript
// Volume Änderung
setVolume(percent) {
  this.currentVolumeMultiplier = percent / 100;
  this.broadcastVolumeUpdate();
  // ✅ Kein Neustart nötig - GainTransform liest dynamisch!
}

// LUFS Änderung
setMonotoneEnabled(enabled) {
  this.monotoneEnabled = enabled;
  this.broadcastSettingsUpdate();
  // ✅ Kein Neustart nötig - GainTransform liest dynamisch!
}
```

### Stream Distribution

Der MP3-Output wird an alle verbundenen Clients gestreamt:

```javascript
encoder.stdout.on("data", (mp3chunk) => {
  // Update elapsed time
  this.currentProcessElapsedTime = Math.floor((Date.now() - startTime) / 1000);
  
  // Stream zu HTTP Clients
  for (const res of this.clients) {
    try { res.write(mp3chunk); } catch (e) {}
  }
  
  // Stream zu WebSocket Clients
  for (const ws of this.wsClients) {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(mp3chunk); } catch (e) {}
    }
  }
});
```

---

## Smart Shuffle Algorithmus

### Artist Distance Feature

**Problem:** Ohne Smart Shuffle kann derselbe Künstler mehrmals hintereinander spielen.

**Lösung:** Minimum Artist Distance - garantiert X Songs zwischen gleichem Künstler.

### Artist Identifier Extraktion

Songs können Künstler-Information an verschiedenen Stellen haben:

**1. Author Field:**
```javascript
{ author: "Eminem" } → ["eminem"]
```

**2. Title Patterns:**
```javascript
// Pattern: "Artist - Song"
"Eminem - Lose Yourself" → ["eminem"]

// Pattern: "[Artist] Song"
"[Drake] God's Plan" → ["drake"]

// Pattern: "Artist: Song"
"Travis Scott: SICKO MODE" → ["travis scott"]
```

**Implementation:**
```javascript
extractArtistIdentifiers(song) {
  const identifiers = [];
  
  // 1. Author Field
  if (song.author) {
    const normalized = this.normalizeArtistName(song.author);
    if (normalized) identifiers.push(normalized);
  }
  
  // 2. Title Patterns
  if (song.title) {
    const title = song.title;
    
    // "Artist - Song"
    const dashMatch = title.match(/^([^-]+)\s*-\s*.+$/);
    if (dashMatch) {
      const normalized = this.normalizeArtistName(dashMatch[1]);
      if (normalized && !identifiers.includes(normalized)) {
        identifiers.push(normalized);
      }
    }
    
    // "[Artist] Song" oder "(Artist) Song"
    const bracketMatch = title.match(/^[\[\(]([^\]\)]+)[\]\)]\s*.+$/);
    if (bracketMatch) {
      const normalized = this.normalizeArtistName(bracketMatch[1]);
      if (normalized && !identifiers.includes(normalized)) {
        identifiers.push(normalized);
      }
    }
    
    // "Artist: Song"
    const colonMatch = title.match(/^([^:]+)\s*:\s*.+$/);
    if (colonMatch) {
      const normalized = this.normalizeArtistName(colonMatch[1]);
      if (normalized && !identifiers.includes(normalized)) {
        identifiers.push(normalized);
      }
    }
  }
  
  return identifiers;
}
```

**Artist Name Normalisierung:**
```javascript
normalizeArtistName(artist) {
  return artist
    .toLowerCase()
    .replace(/\s*[\(\[]?(feat|ft|featuring|with)[.\s]*[^\)\]]*[\)\]]?/gi, "")
    .replace(/\s*&\s*/g, " ")
    .trim();
}

// Beispiele:
"Eminem feat. Rihanna" → "eminem"
"Drake & 21 Savage" → "drake 21 savage"
"Travis Scott (feat. Drake)" → "travis scott"
```

**Artist Vergleich:**
```javascript
isSameArtist(song1, song2) {
  const identifiers1 = this.extractArtistIdentifiers(song1);
  const identifiers2 = this.extractArtistIdentifiers(song2);
  
  // Wenn irgendein Identifier übereinstimmt → gleicher Artist
  for (const id1 of identifiers1) {
    for (const id2 of identifiers2) {
      if (id1 === id2) return true;
    }
  }
  
  return false;
}
```

### Greedy Placement Strategie

Der Smart Shuffle nutzt einen Greedy-Algorithmus für optimale Artist-Verteilung:

```javascript
smartShuffle(songs, lastPlayedSong = null) {
  // 1. Initiales Random Shuffle
  const shuffled = [...songs];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // 2. Greedy Placement mit Artist Distance
  const result = [];
  const remaining = [...shuffled];
  const context = lastPlayedSong ? [lastPlayedSong] : [];

  while (remaining.length > 0) {
    let placed = false;

    // Versuch 1: Finde Song der Artist Distance respektiert
    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      const testQueue = [...context, ...result];
      
      if (this.canPlayArtistAt(testQueue, testQueue.length, candidate)) {
        result.push(candidate);
        remaining.splice(i, 1);
        placed = true;
        break;
      }
    }

    // Versuch 2: Falls kein Song passt, wähle den mit größter Distanz
    if (!placed) {
      let bestIndex = 0;
      let bestScore = -1;

      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i];
        
        // Finde letzte Position dieses Artists
        let lastOccurrence = -1;
        const testQueue = [...context, ...result];
        for (let j = testQueue.length - 1; j >= 0; j--) {
          if (this.isSameArtist(testQueue[j], candidate)) {
            lastOccurrence = j;
            break;
          }
        }

        const distance = lastOccurrence === -1 
          ? Infinity 
          : testQueue.length - lastOccurrence;
        
        // Bevorzuge größte Distanz
        if (distance > bestScore) {
          bestScore = distance;
          bestIndex = i;
        } else if (distance === bestScore && Math.random() > 0.5) {
          bestIndex = i; // Random bei Gleichstand
        }
      }

      result.push(remaining[bestIndex]);
      remaining.splice(bestIndex, 1);
    }
  }

  return result;
}
```

**Artist Distance Check:**
```javascript
canPlayArtistAt(queue, position, candidateSong) {
  if (this.minArtistDistance === 0) return true;
  
  const candidateIdentifiers = this.extractArtistIdentifiers(candidateSong);
  if (candidateIdentifiers.length === 0) return true;

  // Check backward (position - distance bis position)
  const checkStart = Math.max(0, position - this.minArtistDistance);
  for (let i = checkStart; i < position; i++) {
    if (this.isSameArtist(queue[i], candidateSong)) {
      return false;
    }
  }

  // Check forward (position bis position + distance)
  const checkEnd = Math.min(queue.length, position + this.minArtistDistance + 1);
  for (let i = position + 1; i < checkEnd; i++) {
    if (this.isSameArtist(queue[i], candidateSong)) {
      return false;
    }
  }

  return true;
}
```

**Beispiel mit minArtistDistance = 5:**
```
Index: 0    1    2    3    4    5    6    7    8    9
Song:  A    B    C    D    E   [A?]  F    G    H    I
       └─────────────────────────┘
              5 Songs Abstand

✅ A kann bei Index 5 NICHT gespielt werden (nur 4 Songs dazwischen)
✅ A kann bei Index 6+ gespielt werden (5+ Songs dazwischen)
```

---

## Control Functions

### Skip

Überspringt den aktuellen Song:

```javascript
skip() {
  if (this.currentDecoder) {
    console.log("Skip requested");
    try { 
      if (this.currentDecoder) this.currentDecoder.kill("SIGKILL"); 
      if (this.currentEncoder) this.currentEncoder.kill("SIGKILL");
    } catch (e) {}
    // ✅ onExit Handler macht automatisch currentIndex++ und playNext()
  }
}
```

**Wichtig:** Beide Prozesse (Decoder UND Encoder) müssen terminiert werden!

### Previous

Spielt den vorherigen Song:

```javascript
previous() {
  const targetIndex = this.currentIndex > 0 
    ? this.currentIndex - 1 
    : Math.max(0, this.queue.length - 1);

  if (this.currentDecoder) {
    // Setze auf targetIndex - 1, damit onExit Handler mit ++ auf targetIndex landet
    this.currentIndex = targetIndex - 1;
    try { 
      if (this.currentDecoder) this.currentDecoder.kill("SIGKILL"); 
      if (this.currentEncoder) this.currentEncoder.kill("SIGKILL");
    } catch (e) {}
  } else {
    // Kein laufender Song, direkt abspielen
    this.currentIndex = targetIndex;
    this.playNext();
  }
}
```

### Jump To

Springt zu einem bestimmten Song in der Queue:

**Forward Jump (idx > currentIndex):**
```javascript
// Aktuelle Queue: [0:Played, 1:Current, 2:X, 3:X, 4:Target, 5:X, 6:X]
// Jump to Index 4

const played = this.queue.slice(0, this.currentIndex + 1);  // [0, 1]
const target = this.queue[idx];                             // [4]
const skipped = this.queue.slice(this.currentIndex + 1, idx); // [2, 3]
const remaining = this.queue.slice(idx + 1);                // [5, 6]

const leftovers = [...skipped, ...remaining]; // [2, 3, 5, 6]

// Smart Shuffle leftovers
const shuffledLeftovers = this.smartShuffle(leftovers, target);

// Neue Queue: [0:Played, 1:Played, 2:Target, 3+:Shuffled]
this.queue = [...played, target, ...shuffledLeftovers];

// Der Target Song ist jetzt an Position played.length
const newIndex = played.length; // = 2

if (this.currentDecoder) {
  // Setze auf newIndex - 1, damit onExit mit ++ auf newIndex landet
  this.currentIndex = newIndex - 1;
  this.killProcesses();
} else {
  this.currentIndex = newIndex;
  this.playNext();
}
```

**Backward Jump (idx < currentIndex):**
```javascript
// Markiere alle bisherigen Songs als "played"
for (let i = 0; i < this.currentIndex; i++) {
  if (this.queue[i]) this.queue[i].hasBeenPlayed = true;
}

// Extrahiere Target Song
const target = this.queue[idx];

// Entferne Target von alter Position
this.queue.splice(idx, 1);

// Füge Target nach currentIndex ein
const newCurrent = Math.max(0, this.currentIndex - 1);
const insertPos = newCurrent + 1;
this.queue.splice(insertPos, 0, target);

if (this.currentDecoder) {
  this.currentIndex = newCurrent;
  this.killProcesses();
} else {
  this.currentIndex = insertPos;
  this.playNext();
}
```

### Shuffle Remaining

Shuffelt nur die noch nicht gespielten Songs:

```javascript
shuffleRemaining() {
  const played = this.queue.slice(0, this.currentIndex + 1);
  const remaining = this.queue.slice(this.currentIndex + 1);

  if (this.minArtistDistance === 0) {
    // Standard Fisher-Yates Shuffle
    for (let i = remaining.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
    }
  } else {
    // Smart Shuffle mit Artist Distance
    const shuffled = this.smartShuffle(remaining, played[played.length - 1]);
    this.queue = [...played, ...shuffled];
    this.broadcastQueueUpdate();
    return;
  }

  this.queue = [...played, ...remaining];
  this.broadcastQueueUpdate();
}
```

---

## Settings & Configuration

### Volume Control

Globale Lautstärke für alle Clients (0-200%):

```javascript
setVolume(percent) {
  const clamped = Math.max(0, Math.min(200, Math.round(percent)));
  this.volumePercent = clamped;
  this.currentVolumeMultiplier = clamped / 100;
  this.broadcastVolumeUpdate();
  // ✅ Änderung wird sofort angewendet durch Live Gain Transform!
}
```

**Multiplier Beispiele:**
- `50%` → `0.5` → Halbierte Lautstärke
- `100%` → `1.0` → Originale Lautstärke
- `200%` → `2.0` → Doppelte Lautstärke

### EBU R128 Normalisierung

Siehe [MONOTONE_EQUALIZER.md](MONOTONE_EQUALIZER.md) für Details.

**Aktivierung:**
```javascript
setMonotoneEnabled(enabled) {
  this.monotoneEnabled = Boolean(enabled);
  this.broadcastSettingsUpdate();
}

setMonotoneReduceLoud(enabled) {
  this.monotoneReduceLoud = Boolean(enabled);
  this.broadcastSettingsUpdate();
}
```

**Modi:**
- **Standard** (`monotoneReduceLoud = false`): Nur leise Songs werden geboostet
- **Erweitert** (`monotoneReduceLoud = true`): Alle Songs auf -14 LUFS normalisiert

### Minimum Artist Distance

```javascript
setMinArtistDistance(distance) {
  const d = Number(distance);
  if (Number.isNaN(d) || d < 0) return;
  
  this.minArtistDistance = Math.round(d);
  this.broadcastSettingsUpdate();
}
```

**Werte:**
- `0`: Feature deaktiviert, Standard Shuffle
- `1-15`: Mindestanzahl Songs zwischen gleichem Artist

---

## WebSocket Broadcasting

Die RadioEngine nutzt WebSockets für Echtzeit-Updates:

### Event Types

**1. Track Changed:**
```javascript
{
  type: "trackChanged",
  meta: {
    filename: "song.mp3",
    title: "Artist - Song",
    author: "Artist",
    cover: "https://...",
    duration: 215,
    index: 5,
    total: 100,
    elapsed: 0
  }
}
```

**2. Queue Updated:**
```javascript
{
  type: "queueUpdated",
  queue: {
    nowPlayingIndex: 5,
    nowPlaying: "song.mp3",
    queue: [/* Array of songs */]
  }
}
```

**3. Volume Changed:**
```javascript
{
  type: "volumeChanged",
  volume: 100
}
```

**4. Settings Updated:**
```javascript
{
  type: "settingsUpdated",
  settings: {
    monotoneEnabled: false,
    monotoneReduceLoud: false,
    minArtistDistance: 5
  }
}
```

### Broadcasting Implementation

```javascript
broadcastQueueUpdate() {
  const payload = JSON.stringify({
    type: "queueUpdated",
    queue: this.getQueueState()
  });

  for (const ws of this.wsClients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}
```

---

## Event Flow

### Song Playback Lifecycle

```
1. playNext() wird aufgerufen
   ↓
2. FFmpeg Decoder/Encoder werden gestartet
   ↓
3. Decoder.stdout → GainTransform → Encoder.stdin
   ↓
4. Encoder.stdout sendet MP3 Chunks an Clients
   ↓
5. Decoder Exit Event wird gefeuert
   ↓
6. onExit Handler:
   - currentIndex++
   - Ende der Queue? → Shuffle und zurück zu 0
   - broadcastQueueUpdate()
   - Sende "trackChanged" Event
   - playNext() für nächsten Song
```

### Skip/Previous Flow

```
1. skip() oder previous() wird aufgerufen
   ↓
2. currentIndex wird auf target - 1 gesetzt
   ↓
3. Decoder + Encoder werden getötet (SIGKILL)
   ↓
4. Decoder Exit Event wird gefeuert
   ↓
5. onExit Handler:
   - currentIndex++ (landet auf target)
   - playNext() startet den gewünschten Song
```

### Jump To Flow

```
1. jumpto(index) wird aufgerufen
   ↓
2. Queue wird neu organisiert:
   Forward: [played, target, shuffled(skipped+remaining)]
   Backward: Song wird nach current eingefügt
   ↓
3. currentIndex wird auf newPosition - 1 gesetzt
   ↓
4. Decoder + Encoder werden getötet
   ↓
5. onExit Handler:
   - currentIndex++ (landet auf newPosition)
   - playNext() startet den Target Song
```

---

## Zusammenfassung

Die RadioEngine ist eine hochentwickelte Audio-Streaming-Engine mit:

✅ **Flexible Playback Pipeline**: Decoder → Live Gain → Encoder  
✅ **Echtzeit Audio Processing**: Volume & LUFS ohne Neustart  
✅ **Smart Shuffle**: Artist Distance mit intelligentem Greedy-Algorithmus  
✅ **Robuste Artist Erkennung**: Author Field + Title Pattern Matching  
✅ **WebSocket Broadcasting**: Echtzeit-Updates für alle Clients  
✅ **Saubere Prozess-Verwaltung**: Keine Zombie-Prozesse oder Memory Leaks  
✅ **EBU R128 Normalisierung**: Professionelle Broadcast-Qualität  

Die Architektur ermöglicht maximale Flexibilität bei gleichzeitig minimaler Latenz und optimalem Ressourcen-Management.
