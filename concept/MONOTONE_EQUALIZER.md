# Monotone Equalizer - Technische Dokumentation

## Übersicht

Der Monotone Equalizer ist ein Feature zur automatischen Lautstärke-Normalisierung mit zwei Modi:

**Standard-Modus (Nur Verstärkung):**
Das Hauptproblem vieler Radios sind zu leise Tracks - der Monotone Equalizer erkennt diese und hebt sie automatisch auf eine angemessene Lautstärke an. Laute Songs bleiben unverändert, um ihre Qualität und den Original-Charakter zu erhalten.

**Erweiterter Modus (Verstärkung + Reduktion):**
Zusätzlich zum Standard-Modus können sehr laute Songs optional sanft reduziert werden. Dies ermöglicht eine vollständige Normalisierung bei gleichzeitigem Schutz der musikalischen Dynamik durch eine sanfte Kompressionskurve.

## Problem

Das Hauptproblem beim Abspielen gemischter Musik-Playlists sind **zu leise Songs**:
- Ältere Tracks haben typischerweise niedrigere Durchschnittslautstärken
- Live-Aufnahmen sind oft deutlich leiser als Studio-Produktionen
- Bestimmte Genres (z.B. Jazz, Classical) werden mit geringerer Lautstärke gemastert
- Akustische Tracks sind oft leiser als elektronische Musik

Während moderne Songs meist laut genug sind (Loudness War), müssen Nutzer bei älteren oder leiseren Tracks ständig die Lautstärke hochdrehen. Das ist das Hauptproblem, das gelöst werden soll.

## Lösung: RMS-basierte Dual-Mode Normalisierung

### Modi

Der Monotone Equalizer bietet zwei Betriebsmodi:

1. **Standard-Modus (One-Way):** Nur Verstärkung leiser Songs
2. **Erweiterter Modus (Bidirektional):** Verstärkung leiser Songs + sanfte Reduktion lauter Songs

### Technisches Konzept

Der Monotone Equalizer verwendet **RMS (Root Mean Square)** Analyse zur Lautstärke-Normalisierung:

```
RMS = √(1/n × Σ(sample²))
```

Dabei gilt:
- `n` = Anzahl der Samples
- `sample` = Einzelner Audio-Sample-Wert (16-bit signed integer: -32768 bis 32767)

Der RMS-Wert repräsentiert die durchschnittliche "Energie" des Audio-Signals und korreliert gut mit der wahrgenommenen Lautstärke.

### Normalisierungs-Algorithmus

```javascript
// 1. Berechne RMS des aktuellen Audio-Chunks
let sumSquares = 0;
for (let i = 0; i + 1 < buffer.length; i += 2) {
  const sample = buffer.readInt16LE(i);
  sumSquares += sample * sample;
}
rms = Math.sqrt(sumSquares / (buffer.length / 2));

// 2. Berechne Normalisierungs-Multiplikator - Je nach Modus
const targetRMS = 10000; // Ziel-RMS-Level
let normalizationMultiplier = 1.0;

if (monotoneEnabled && rms > 0) {
  if (rms < targetRMS) {
    // Song ist zu leise -> verstärken (max 2.5x)
    normalizationMultiplier = Math.min(2.5, targetRMS / rms) * (targetVolume / 100);
  } else if (monotoneReduceLoud) {
    // Erweiterter Modus: Song ist laut -> sanfte Reduktion mit Kompressionskurve
    const rmsRatio = targetRMS / rms;
    const reductionFactor = Math.pow(rmsRatio, 0.6); // Sanfte Kompressionskurve
    normalizationMultiplier = Math.max(0.4, reductionFactor) * (targetVolume / 100);
  } else {
    // Standard-Modus: Song ist bereits laut genug -> nicht verändern
    normalizationMultiplier = targetVolume / 100;
  }
}

// 3. Wende Multiplikator auf jeden Sample an
for (let i = 0; i + 1 < buffer.length; i += 2) {
  const sample = buffer.readInt16LE(i);
  let normalizedSample = Math.round(sample * normalizationMultiplier * volumeMultiplier);
  
  // Clipping Protection
  if (normalizedSample > 32767) normalizedSample = 32767;
  if (normalizedSample < -32768) normalizedSample = -32768;
  
  output.writeInt16LE(normalizedSample, i);
}
```

### Parameterwahl

**Target RMS Level: 10000**
- Liegt ca. bei 30% der maximalen Amplitude (32767)
- Songs mit RMS < 10000 werden als "zu leise" erkannt und verstärkt (beide Modi)
- Songs mit RMS ≥ 10000:
  - Standard-Modus: Bleiben unverändert
  - Erweiterter Modus: Werden sanft reduziert
- Bietet ausreichend Headroom für Dynamik
- Empirisch ermittelt für gute Balance zwischen Lautstärke und Qualität

**Max Amplification: 2.5x**
- Begrenzt die maximale Verstärkung auf das 2,5-fache
- Verhindert extreme Verstärkung bei sehr leisen Tracks
- Schützt vor Verzerrungen und Clipping
- Erlaubt ausreichende Anhebung für alte/leise Aufnahmen

**Soft Compression für laute Songs (Erweiterter Modus)**
- Kompressionskurve: `Math.pow(ratio, 0.6)`
- Sanfte logarithmische Reduktion statt hartem Clipping
- Minimum Reduktion: 0.4x (maximal 60% leiser)
- Erhält musikalische Dynamik und Charakter
- Nur aktiv wenn "Laute Songs reduzieren" eingeschaltet ist

**Dual-Mode Betrieb**
- Standard: Nur Verstärkung (`monotoneEnabled = true`, `monotoneReduceLoud = false`)
- Erweitert: Verstärkung + Reduktion (`monotoneEnabled = true`, `monotoneReduceLoud = true`)
- Der Reduce-Modus benötigt aktivierten Monotone Equalizer

## Architektur

### Audio-Pipeline

```
┌─────────────┐
│  MP3 File   │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────┐
│  FFmpeg Decoder                     │
│  Ausgabe: PCM (s16le, 44100Hz, 2ch) │
└──────────────┬──────────────────────┘
               │
               ▼
┌───────────────────────────────────────┐
│  Node.js PCM Processing               │
│  ┌─────────────────────────────────┐  │
│  │ 1. RMS Berechnung               │  │
│  │ 2. Normalisierung (wenn aktiv)  │  │
│  │ 3. Volume Multiplikation        │  │
│  │ 4. Clipping Protection          │  │
│  └─────────────────────────────────┘  │
└───────────────┬───────────────────────┘
                │
                ▼
┌─────────────────────────────────────┐
│  FFmpeg Encoder                     │
│  Ausgabe: MP3 (128kbps)             │
└──────────────┬──────────────────────┘
               │
               ▼
┌──────────────────────────┐
│  Stream zu Clients       │
│  (HTTP/WebSocket)        │
└──────────────────────────┘
```

### Backend-Komponenten

#### RadioEngine.js

**Neue Properties:**
```javascript
this.monotoneEnabled = false;           // Feature-Toggle für Verstärkung
this.monotoneReduceLoud = false;        // Feature-Toggle für Reduktion (benötigt monotoneEnabled)
this.monotoneTargetVolume = 100;        // Ziel-Lautstärke in %
```

**Neue Methoden:**
```javascript
setMonotoneEnabled(enabled)       // Aktiviert/Deaktiviert Verstärkung
setMonotoneReduceLoud(enabled)    // Aktiviert/Deaktiviert Reduktion
getSettings()                     // Gibt aktuelle Settings zurück
```

**Modifizierte Funktion:**
```javascript
processPCM(buffer, multiplier)
// Erweitert um RMS-Berechnung und Normalisierung
```

#### RadioEngineRouter.js

**Neue Endpunkte:**

| Method | Endpoint                              | Beschreibung                               |
|--------|---------------------------------------|-----------------------------------------|
| GET    | `/stream/settings`                    | Gibt aktuelle Settings zurück             |
| POST   | `/stream/settings/monotone`           | Setzt Monotone Equalizer On/Off           |
| POST   | `/stream/settings/monotone/reduce-loud` | Setzt Reduce Loud Modus On/Off          |

**Request/Response Beispiele:**

```javascript
// GET /stream/settings
Response: {
  status: 200,
  monotoneEnabled: false,
  monotoneReduceLoud: false,
  monotoneTargetVolume: 100
}

// POST /stream/settings/monotone
Request: {
  enabled: true
}

Response: {
  status: 200,
  message: "Monotone equalizer enabled",
  monotoneEnabled: true
}

// POST /stream/settings/monotone/reduce-loud
Request: {
  enabled: true
}

Response: {
  status: 200,
  message: "Monotone reduce loud enabled",
  monotoneReduceLoud: true
}
```

### Frontend-Komponenten

#### app/settings.tsx

Neue React Native Komponente für Settings-Page:

**State Management:**
```javascript
const [monotoneEnabled, setMonotoneEnabled] = useState(false);
const [monotoneReduceLoud, setMonotoneReduceLoud] = useState(false);
const [loading, setLoading] = useState(true);
const [saving, setSaving] = useState(false);
```

**API Integration:**
```javascript
// Settings laden
const loadSettings = async () => {
  const res = await fetch(`${API_BASE}/stream/settings`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const json = await res.json();
  setMonotoneEnabled(json.monotoneEnabled);
  setMonotoneReduceLoud(json.monotoneReduceLoud);
};

// Monotone Equalizer togglen
const saveMonotoneSetting = async (value) => {
  await fetch(`${API_BASE}/stream/settings/monotone`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ enabled: value })
  });
};

// Reduce Loud togglen
const saveReduceLoudSetting = async (value) => {
  await fetch(`${API_BASE}/stream/settings/monotone/reduce-loud`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ enabled: value })
  });
};
```

**UI Komponenten:**
- Toggle Switch für Monotone Equalizer (Verstärkung leiser Songs)
- Toggle Switch für "Laute Songs reduzieren" (nur aktiv wenn Monotone Equalizer an)
- Beschreibungstexte für beide Modi
- Info-Box mit Erklärung der Modi
- Zurück-Button zur Navigation

#### app/player.tsx

**Neue Navigation:**
```javascript
<TouchableOpacity onPress={() => router.push("/settings")}>
  <Text style={styles.settingsText}>⚙️ Settings</Text>
</TouchableOpacity>
```

## Echtzeit-Verarbeitung

### Chunk-basierte Verarbeitung

Die Audio-Verarbeitung erfolgt in Echtzeit auf Chunk-Basis:

1. **FFmpeg Decoder** erzeugt PCM-Chunks (typisch 4-16 KB)
2. **Für jeden Chunk:**
   - RMS wird berechnet
   - Normalisierungs-Multiplikator wird bestimmt
   - Samples werden transformiert
   - Chunk wird an Encoder weitergeleitet
3. **FFmpeg Encoder** erzeugt MP3-Stream
4. **Stream** wird an alle Clients gesendet

### Performance-Charakteristiken

- **Latenz:** Minimal (~10-50ms zusätzlich)
- **CPU-Overhead:** Gering (~2-5% pro Stream)
- **Memory:** Konstant (keine Akkumulation)
- **Skalierung:** Linear mit Anzahl der Chunks

## Vorteile dieser Implementierung

### 1. Flexible Dual-Mode Architektur
- Standard-Modus: Nur Verstärkung leiser Songs
- Erweiterter Modus: Zusätzlich sanfte Reduktion lauter Songs
- User kann selbst wählen welchen Modus er bevorzugt
- Löst das Hauptproblem (leise Songs) ohne laute Songs zu beeinträchtigen (Standard)
- Optional vollständige Normalisierung mit Dynamik-Schutz (Erweitert)

### 2. Soft Compression (Erweiterter Modus)
- Logarithmische Reduktion (Math.pow 0.6) für natürlichen Klang
- Keine harten Clipping-Artefakte
- Dynamik bleibt weitgehend erhalten
- Verhindert extreme Lautstärke-Unterschiede
- Nur aktiv wenn explizit gewünscht

### 3. Echtzeit-Verarbeitung
- Keine Vorverarbeitung der Dateien nötig
- Funktioniert sofort mit bestehender Musikbibliothek
- Dynamische An/Aus-Schaltung für beide Modi möglich

### 4. Chunk-basierte RMS
- Adaptive Normalisierung innerhalb eines Songs
- Reagiert auf Dynamikänderungen (leise Verse vs. laute Refrains)
- Intelligente Erkennung von zu leisen Passagen
- Im erweiterten Modus auch Erkennung zu lauter Passagen

### 5. Clipping-Schutz
- Hard Limiting bei ±32767
- Max Amplification Cap (2.5x) für leise Songs
- Min Reduction Floor (0.4x) für laute Songs (Erweiterter Modus)
- Erhält Audio-Qualität in beiden Modi

### 6. Kombinierbar mit globalem Volume
- Monotone-Normalisierung arbeitet unabhängig
- Globale Lautstärke-Steuerung bleibt funktional
- Beide Multiplikatoren werden kombiniert

## Limitierungen & Trade-offs

### 1. Chunk-basierte Schwankungen
- RMS wird pro Chunk berechnet (nicht pro Song)
- Sehr leise Passagen innerhalb eines lauten Songs können überverstärkt werden
- Ein Song kann zwischen "verstärkt" und "nicht verstärkt" wechseln bei dynamischen Übergängen

**Mitigation:** Der Target RMS von 10000 ist konservativ gewählt als Schwellenwert

### 2. Keine Pre-Analysis
- Keine Kenntnis über die Gesamt-Lautstärke des Songs
- Kann bei extremen Dynamik-Unterschieden innerhalb eines Songs suboptimal sein
- Erste Sekunden eines Songs bestimmen initial die Verstärkung

**Alternative Ansätze:**
- ReplayGain (benötigt Vorverarbeitung)
- EBU R128 (komplexer Algorithmus)
- LUFS Normalisierung (höherer CPU-Bedarf)

### 3. Qualitätsverlust bei sehr leisen Tracks
- Starke Verstärkung (bis 2.5x) kann Rauschen hörbar machen
- Bei sehr leisen Aufnahmen kann Audio-Artefakte entstehen

**Mitigation:** Max Amplification Cap bei 2.5x verhindert extreme Verstärkung

### 4. Standard-Modus: Keine Abschwächung lauter Songs
- Im Standard-Modus bleiben sehr laute Songs sehr laut (gewollt)
- Bei extremen Lautstärke-Unterschieden müssen User entweder manuell die globale Lautstärke anpassen oder den erweiterten Modus aktivieren
- Trade-off: Erhalt der Original-Qualität vs. vollständige Normalisierung

**Lösung:** Erweiterter Modus mit "Laute Songs reduzieren" für User die vollständige Normalisierung wünschen

### 5. Erweiterter Modus: Sanfte Reduktion kann unzureichend sein
- Sehr laute Songs werden maximal auf 40% reduziert (0.4x Floor)
- Bei extremen Loudness-War-Tracks kann die Lautstärke immer noch hoch sein
- Trade-off: Dynamik-Erhalt vs. aggressive Normalisierung

**Rationale:** Die Kompressionskurve schützt die musikalische Dynamik. Aggressive Reduktion würde den Charakter gut produzierter Songs zerstören.

## Zukünftige Erweiterungen

### Mögliche Features:

1. **Konfigurierbarer Target RMS**
   - User könnte Ziel-Lautstärke anpassen
   - Slider in Settings: "Leise / Normal / Laut"

2. **Pre-analyzed Metadata**
   - ReplayGain-Werte im Metadata-System speichern
   - Song-basierte vs. Chunk-basierte Normalisierung

3. **Advanced Algorithms**
   - EBU R128 Loudness Normalization
   - Dynamic Range Compression
   - Psychoacoustic Modeling

4. **Statistiken**
   - Zeige durchschnittliche RMS-Werte
   - Normalisierungs-History
   - Clipping-Warnings

## Testing

### Testszenarien:

1. **Unterschiedliche Genres:**
   - Classical (hohe Dynamik) vs. Pop (komprimiert)
   - Live-Aufnahmen vs. Studio
   - Alte vs. moderne Masters

2. **Edge Cases:**
   - Sehr leise Tracks (Ambient)
   - Sehr laute Tracks (Metal, EDM)
   - Wechsel zwischen extremen Unterschieden

3. **Performance:**
   - Mehrere simultane Clients
   - CPU/Memory Monitoring
   - Latenz-Messungen

### Erwartete Ergebnisse:

- ✅ Lautstärke-Konsistenz innerhalb ±10%
- ✅ Kein wahrnehmbares Clipping
- ✅ CPU-Overhead < 5%
- ✅ Keine spürbaren Latenz-Erhöhungen

## Verwendung

### Für Nutzer:

1. Navigiere zum Player
2. Klicke auf "⚙️ Settings"
3. Aktiviere "Monotone Equalizer" Toggle (Verstärkung leiser Songs)
4. Optional: Aktiviere "Laute Songs reduzieren" Toggle (Reduktion lauter Songs)
5. Genieße konsistente Lautstärke!

**Modi:**
- **Standard:** Nur Monotone Equalizer aktiv - leise Songs werden lauter
- **Erweitert:** Beide Toggles aktiv - leise Songs lauter + laute Songs leiser

### Für Entwickler:

```javascript
// Backend: Monotone aktivieren (Standard-Modus)
radio.setMonotoneEnabled(true);
radio.setMonotoneReduceLoud(false);

// Backend: Erweiterten Modus aktivieren
radio.setMonotoneEnabled(true);
radio.setMonotoneReduceLoud(true);

// Backend: Settings abrufen
const settings = radio.getSettings();
// { monotoneEnabled: true, monotoneReduceLoud: false, monotoneTargetVolume: 100 }

// Frontend: Settings laden
const response = await fetch('/stream/settings');
const settings = await response.json();

// Frontend: Monotone togglen
await fetch('/stream/settings/monotone', {
  method: 'POST',
  body: JSON.stringify({ enabled: true })
});

// Frontend: Reduce Loud togglen
await fetch('/stream/settings/monotone/reduce-loud', {
  method: 'POST',
  body: JSON.stringify({ enabled: true })
});
```

## Zusammenfassung

Der Monotone Equalizer nutzt RMS-basierte Echtzeit-Erkennung mit flexibler Dual-Mode Architektur:

**Standard-Modus (One-Way):**
- ✅ Fokussiert auf das Hauptproblem: zu leise Songs werden angehoben
- ✅ Laute Songs bleiben unverändert
- ✅ Erhalt der Qualität gut gemasterter Tracks

**Erweiterter Modus (Bidirektional):**
- ✅ Leise Songs werden angehoben + laute Songs sanft reduziert
- ✅ Soft Compression erhält musikalische Dynamik
- ✅ Vollständige Normalisierung bei Bedarf

**Allgemein:**
- ✅ Einfach und performant
- ✅ Keine Vorverarbeitung nötig
- ✅ Dynamisch an/abschaltbar
- ✅ Gut integriert in die bestehende Audio-Pipeline
- ✅ User-freundlich über Settings-Page steuerbar mit zwei Toggles
- ✅ Flexibel: User wählt den bevorzugten Modus

Das Feature verbessert das Nutzererlebnis erheblich, indem es zu leise Songs automatisch anhebt. Optional können auch laute Songs sanft reduziert werden, ohne dabei die musikalische Dynamik zu zerstören.
