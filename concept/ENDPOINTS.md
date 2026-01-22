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
  - [Notification Service](#notification-service)
    - [POST `/notification/signal/invite`](#post-notificationsignalinvite)
    - [POST `/notification/signal/leave`](#post-notificationsignalleave)
    - [GET `/notification/signal/run-job`](#get-notificationsignalrun-job)

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

## Notification Service

### POST `/notification/signal/invite`
Den einzigen Endpunkt den dieser Service kriegt ist der `/notification/signal/invite` Endpunkt. Der Zweck davon ist das man ohne Authentifizierung den Service in die Signal Gruppe einladen kann.

**Body**
```json
{
    "singalgroupId": "string"
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
    "singalgroupId": "string"
}
```

**Response**
```json
{
    "status": 200,
    "message": "SignalGroup was Successfully deleted"
}
```

### GET `/notification/signal/run-job`
Dieser Endpunkt dient dazu, den Batch-Job erneut auszuführen, wenn etwas schiefgelaufen ist oder zu Testzwecken.

**Response**
```json
{
    "status": 200,
    "message": "Signal Notification job executed"
}
```
