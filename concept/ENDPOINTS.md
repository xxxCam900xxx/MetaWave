![MetaWave Banner](/concept/images/MetaWave%20-%20Banner.png)

# MetaWave | Endpunkte
Hier werden alle Endpunkte mit ihrem Zweck sowie allen möglichen `Headern`, `Parametern` und `Bodies` aufgeführt. Zudem zeigen wir, was man zurückerhält, um ein möglichst gutes Verständnis dafür zu entwickeln, wie die API funktioniert.

## Inhaltsverzeichnis
- [MetaWave | Endpunkte](#metawave--endpunkte)
  - [Inhaltsverzeichnis](#inhaltsverzeichnis)
  - [Authentifizierung Service](#authentifizierung-service)
    - [POST `/login`](#post-login)
    - [POST `/validate`](#post-validate)
  - [RadioEngine Service](#radioengine-service)
    - [GET `/stream`](#get-stream)
    - [GET `/stream/meta/currentsong`](#get-streammetacurrentsong)
    - [GET `/stream/meta/queue`](#get-streammetaqueue)
    - [GET `/stream/control/skip`](#get-streamcontrolskip)
    - [GET `/stream/control/previous`](#get-streamcontrolprevious)
    - [GET `/stream/control/shuffle`](#get-streamcontrolshuffle)
    - [GET `/stream/control/jumpto/${index}`](#get-streamcontroljumptoindex)
    - [GET `/stream/control/volume`](#get-streamcontrolvolume)
    - [GET `/stream/control/sound/{percentage}`](#get-streamcontrolsoundpercentage)
    - [GET `/stream/settings`](#get-streamsettings)
    - [POST `/stream/settings/monotone`](#post-streamsettingsmonotone)
    - [POST `/stream/settings/monotone/reduce-loud`](#post-streamsettingsmonotonereduce-loud)
    - [POST `/stream/settings/artist-distance`](#post-streamsettingsartist-distance)
  - [Notification Service](#notification-service)
    - [POST `/notification/email/invite`](#post-notificationemailinvite)
    - [POST `/notification/email/leave`](#post-notificationemailleave)
    - [GET `/notification/run-job`](#get-notificationrun-job)

## Authentifizierung Service

### POST `/login`
Dieser Endpunkt ist dazu da um den User auf dem Client einzuloggen und das mithilfe des wavetoken, welche man nur durch den Notification Service kriegt.

**Body**
```json
{
    "wavetoken": "token"
}
```

**Response**
```json
{
    "status": 200,
    "message": "Sucessfully Logged In",
    "token": "token"
}
```

### GET `/login?wavetoken=...`
Dieser Endpunkt ermöglicht die Authentifizierung direkt über einen URL-Parameter. Dies erlaubt direkten Zugriff auf den Player ohne manuelle Token-Eingabe - ideal für Shortcuts, Bookmarks und eingebettete Links.

**Query Parameter**
```
wavetoken - Der aktuelle WaveToken (z.B. MW202601-RADIO)
```

**Beispiel-URL**
```
GET /auth/login?wavetoken=MW202601-RADIO
```

**Response**
```json
{
    "status": 200,
    "message": "Sucessfully Logged In",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Use Cases**
- **Desktop Shortcuts**: Browser-Lesezeichen mit eingebettetem Token
- **Mobile Home-Screen**: Direkt-Zugriff ohne Login-Screen
- **Interne Tools**: Integration in Dashboards, Wikis, etc.
- **Kiosk-Mode**: Automatischer Login auf geteilten Geräten

**Verwendung im Client**
```
https://metawave.timofej.ch/?wavetoken=MW202601-RADIO
```

Der Client erkennt den `?wavetoken=` oder `?token=` URL-Parameter automatisch, ruft `/auth/login?wavetoken=...` auf, authentifiziert den User und leitet direkt zum Player weiter.

> [!WARNING]
> **Sicherheitshinweis**: WaveTokens in URLs sind sichtbar in Browser-Verläufen, Server-Logs und bei geteilten Links. Nutze diese Funktion nur in vertrauenswürdigen Umgebungen. Für sensible Bereiche verwende den Standard-Login mit manueller Token-Eingabe.

> [!INFO]
> Detaillierte Dokumentation und interaktive Demo siehe [URL_LOGIN.md](/URL_LOGIN.md) und [URL_LOGIN_DEMO.html](/concept/URL_LOGIN_DEMO.html)

### POST `/validate`
Der `/validate` Endpunkt ist dazu da um die Session zu verlängern und den Token zu erneuern für den [`/stream`](#get-stream) Endpunkt.

**Body**
```json
{
    "Bearer Token": "token"
}
```

**Response**
```json
{
    "status": 200,
    "message": "Token is Valid and Refreshed"
}
```

## RadioEngine Service
Jeder Endpunkt wird mit dem [Authentication Service](#authentifizierung-service) gesichert, sodass niemand ohne wirckliche Erlaubnis auf das Radio zugreifen kann.

**Headers**
```bash
Authorization: Bearer <JWT_TOKEN>
```

### GET `/stream`
Bei diesem Endpunkt erhält der Client den Live-Audio-Stream der aktuellen Playlist. Die Verbindung bleibt dauerhaft offen und liefert kontinuierlich Audiodaten (Live-Stream).

**Response**
```bash
# Content-Type
audio/mpeg
```

### GET `/stream/meta/currentsong`
Der Endpunkt gibt die Metadaten des derzeit abgespielten Songs aus dem aktuellen Stream aus.

**Response**
```json
{
    "status": 200,
    "message": "Displaying the metadata for the currently playing song",
    "metadata": {
        "index": 1, // Queue Position
        "title": "string",
        "author": "string",
        "cover": "string", // URL
        "duration": 100,
        "elapsed": 10,
        "origin": "string", // Youtube or Spotify
    }
}
```

### GET `/stream/meta/queue`
Dieser Endpunkt gibt die Metadaten von allen Songs aus in der Queue. In diesem Endpunkt werden weniger Daten angezeigt um Zeit zu sparen.

**Response**
```json
{
    "status": 200,
    "message": "Displaying the metadata for all songs in Queue",
    "metadata": [
        {
        "index": 1, // Queue Position
        "title": "string",
        "author": "string",
        "cover": "string", // URL
        "origin": "string", // Youtube or Spotify
        "isPlaying": true,
        "hasBeenPlayed": true
        }
    ]
}
```

### GET `/stream/control/skip`
Bei diesem Endpunkt wird der aktuell abgespielte Song übersprungen und der nächste Song in der Warteschlange wird abgespielt.

**Response**
```json
{
    "status": 200,
    "message": "Song has been skipped",
}
```

### GET `/stream/control/previous`
An diesem Endpunkt wird der vorherige Song erneut als aktueller Song im Index abgespielt. Die Queue bleibt unverändert.

**Response**
```json
{
    "status": 200,
    "message": "Previous song will be played",
}
```

### GET `/stream/control/shuffle`
Dieser Endpunkt dient dazu, die aktuelle Queue, die noch nicht abgespielt wurde, neu zu shuffeln, falls man mit der aktuellen Queue nicht zufrieden ist.

**Response**
```json
{
    "status": 200,
    "message": "Previous song will be played",
}
```

### GET `/stream/control/jumpto/${index}`
Mit diesem Endpunkt kann man in der Warteschlange zum gewünschten Lied springen. Alle Lieder, die dazwischen übersprungen wurden, kommen wieder in die Warteschlange, sofern sie noch nicht abgespielt wurden.

**Response**
```json
{
    "status": 200,
    "message": "Jumped to Song Index {index}",
}
```

### GET `/stream/control/volume`
Dieser Endpunkt liefert die aktuell konfigurierte globale Lautstärke in Prozent (0-200) für alle Hörer.

**Response**
```json
{
    "status": 200,
    "volume": 100
}
```

### GET `/stream/control/sound/{percentage}`
Setzt die globale Lautstärke für alle Hörer. Erwartet einen Path-Parameter `percentage` (ganzzahlig, 0-200).
Bei Änderung interpoliert der Server die Lautstärke sanft (ca. 600ms), sodass die Wiedergabe nicht von vorn beginnt.

**Response**
```json
{
    "status": 200,
    "volume": 80
}
```

> [!INFO]
> Die Lautstärkeänderung wird serverseitig auf PCM-Ebene angewendet und dann wieder zu MP3 enkodiert. Das ermöglicht ein glattes Fading, erhöht aber CPU-/I/O-Last auf dem Server.

### GET `/stream/settings`
Gibt die aktuellen Server-Einstellungen für Audio-Verarbeitung zurück, insbesondere den Status des EBU R128 Loudness Normalizers und die Mindestdistanz für gleiche Künstler.

**Response**
```json
{
    "status": 200,
    "monotoneEnabled": false,
    "monotoneReduceLoud": false,
    "minArtistDistance": 5
}
```

### POST `/stream/settings/monotone`
Aktiviert oder deaktiviert die EBU R128 Loudness Normalisierung. Im Standard-Modus werden nur zu leise Songs auf Broadcast-Standard (-14 LUFS) angehoben.

**Body**
```json
{
    "enabled": true
}
```

**Response**
```json
{
    "status": 200,
    "message": "EBU R128 Loudness Normalization enabled",
    "monotoneEnabled": true
}
```

> [!INFO]
> Der Monotone Equalizer verwendet **EBU R128 / LUFS** (Loudness Units relative to Full Scale), den europäischen Broadcasting-Standard. Songs werden auf **-14 LUFS** normalisiert (Spotify/YouTube Standard) mit **True Peak Limiting** bei -1.5 dB. LUFS-Werte werden einmalig beim Download analysiert und in metadata.json gespeichert. Details siehe [MONOTONE_EQUALIZER.md](MONOTONE_EQUALIZER.md).

### POST `/stream/settings/monotone/reduce-loud`
Aktiviert oder deaktiviert die zusätzliche Reduktion lauter Songs. Benötigt einen aktiven Monotone Equalizer. Laute Songs (> -14 LUFS) werden präzise auf -14 LUFS reduziert mit True Peak Limiting.

**Body**
```json
{
    "enabled": true
}
```

**Response**
```json
{
    "status": 200,
    "message": "EBU R128 Reduce Loud Songs enabled",
    "monotoneReduceLoud": true
}
```

> [!INFO]
> Im erweiterten Modus werden alle Songs auf exakt -14 LUFS normalisiert. FFmpeg's loudnorm Filter verwendet die voranalysierten LUFS-Werte für präzise Second-Pass Normalisierung. **Standard-Modus** (reduce-loud=false): Nur leise Songs werden geboostet, laute bleiben original. **Erweiterter Modus** (reduce-loud=true): Vollständige Normalisierung mit True Peak Limiting.

### POST `/stream/settings/artist-distance`
Konfiguriert die minimale Anzahl von Songs zwischen Auftritten desselben Künstlers in der Queue. Dies verhindert, dass derselbe Künstler zu häufig hintereinander gespielt wird und erhöht die Vielfalt beim Shuffle.

**Body**
```json
{
    "distance": 5
}
```

**Response**
```json
{
    "status": 200,
    "message": "Minimum artist distance set to 5 songs",
    "minArtistDistance": 5
}
```

> [!INFO]
> Der **Smart Shuffle Algorithmus** respektiert die Artist Distance beim Mischen der Queue. Nach einem Song von Künstler A werden mindestens X andere Songs gespielt, bevor wieder ein Song von A kommt. **Künstler-Normalisierung**: Der Algorithmus erkennt Variationen wie "Artist feat. Someone" oder "Artist & Other" und behandelt sie als denselben Künstler. **Edge Cases**: Bei wenigen verschiedenen Künstlern platziert der Algorithmus Songs so weit auseinander wie mathematisch möglich. Beim Wert `0` ist die Funktion deaktiviert und es wird ein Standard Fisher-Yates Shuffle verwendet.

## Notification Service

### POST `/notification/email/invite`
Mit diesem Endpunkt kann man eine E-Mail-Adresse für Benachrichtigungen hinterlegen. Bei der Registrierung wird der aktuelle WaveToken direkt per Mail an diese Adresse geschickt.

**Body**
```json
{
    "email": "user@example.com"
}
```

**Response**
```json
{
    "status": 201,
    "message": "Email recipient was Successfully added"
}
```

### POST `/notification/email/leave`
Dieser Endpunkt ist dazu da, eine zuvor registrierte E-Mail-Adresse wieder aus der Notification-Liste zu entfernen.

**Body**
```json
{
    "email": "user@example.com"
}
```

**Response**
```json
{
    "status": 200,
    "message": "Email recipient was Successfully deleted"
}
```

### GET `/notification/run-job`
Dieser Endpunkt dient dazu, den Batch-Job erneut auszuführen, wenn etwas schiefgelaufen ist oder zu Testzwecken. Der Job generiert (falls nötig) einen neuen WaveToken und verschickt ihn an alle hinterlegten E-Mail-Empfänger.

**Response**
```json
{
    "status": 200,
    "message": "Email notification job executed"
}
```
