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
  - [Notification Service](#notification-service)
    - [POST `/notification/signal/invite`](#post-notificationsignalinvite)
    - [POST `/notification/signal/leave`](#post-notificationsignalleave)
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
Gibt die aktuellen Server-Einstellungen für Audio-Verarbeitung zurück, insbesondere den Status des Monotone Equalizers.

**Response**
```json
{
    "status": 200,
    "monotoneEnabled": false,
    "monotoneReduceLoud": false,
    "monotoneTargetVolume": 100
}
```

### POST `/stream/settings/monotone`
Aktiviert oder deaktiviert den Monotone Equalizer. Dieser hebt automatisch zu leise Songs an (RMS-basiert), ohne bereits laute Songs zu reduzieren.

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
    "message": "Monotone equalizer enabled",
    "monotoneEnabled": true
}
```

> [!INFO]
> Der Monotone Equalizer verwendet RMS-Analyse auf PCM-Ebene. Songs mit RMS < 10000 werden verstärkt (max. 2.5x), Songs mit RMS ≥ 10000 bleiben im Standard-Modus unverändert. Dies löst das Problem zu leiser Tracks, ohne gut gemasterte Songs zu komprimieren. Details siehe [MONOTONE_EQUALIZER.md](MONOTONE_EQUALIZER.md).

### POST `/stream/settings/monotone/reduce-loud`
Aktiviert oder deaktiviert die zusätzliche Reduktion lauter Songs. Benötigt einen aktiven Monotone Equalizer. Laute Songs (RMS > 10000) werden sanft reduziert mit einer Kompressionskurve die die musikalische Dynamik erhält.

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
    "message": "Monotone reduce loud enabled",
    "monotoneReduceLoud": true
}
```

> [!INFO]
> Der Reduce-Loud Modus nutzt eine sanfte Kompressionskurve (`Math.pow(ratio, 0.6)`) um laute Songs zu reduzieren ohne die Dynamik zu zerstören. Min. Reduktion: 0.4x (max. 60% leiser). Nur aktiv wenn Monotone Equalizer eingeschaltet ist.

## Notification Service

### POST `/notification/signal/invite`
Dieser Endpunkt ist dazu da, dass man ohne Authentifizierung den Service in eine Signal Gruppe einladen kann.

**Body**
```json
{
    "groupId": "string"
}
```

**Response**
```json
{
    "status": 201,
    "message": "SignalGroup was Successfully added"
}
```

### POST `/notification/signal/leave`
Für den Endpunkt `/notification/signal/invite` brauchen wir auch einen Endpunkt der dazu da ist das man die Notification von der Signal Gruppe wieder entfernen kann.

**Body**
```json
{
    "groupId": "string"
}
```

**Response**
```json
{
    "status": 200,
    "message": "SignalGroup was Successfully deleted"
}
```

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
Dieser Endpunkt dient dazu, den Batch-Job erneut auszuführen, wenn etwas schiefgelaufen ist oder zu Testzwecken. Der Job generiert (falls nötig) einen neuen WaveToken und verschickt ihn an alle hinterlegten Signal-Gruppen und E-Mail-Empfänger.

**Response**
```json
{
    "status": 200,
    "message": "Signal Notification job executed"
}
```
