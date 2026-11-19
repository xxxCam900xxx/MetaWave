# MetaWave Speaker

Der Dienst bereitet Nachrichten aus drei RSS-Feeds mit lokalem Ollama und
Qwen3-TTS vor. Die Einstellungen und Audio-Dateien liegen im Docker-Volume
`speaker_data`; die Modell-Caches liegen in `ollama_models` und `speaker_models`.
Die Moderation ist auf natürliche Übergänge ohne vorgelesene Quellen ausgelegt;
die Quellenmetadaten bleiben für den Abruf erhalten. Automatisch erzeugte
Nachrichten können Fehler enthalten und sollten vor einer öffentlichen
Ausstrahlung redaktionell geprüft werden.
Die KI-Stimme stellt sich in neu erzeugten Beiträgen als **Alex** vor; die
Nachrichtensendung heisst **MetaWave Update**. Bereits vorbereitete Beiträge
behalten ihre bisherige Ansage.
Die API ist nicht auf dem Host veröffentlicht: Die angemeldete MetaWave-App
erreicht sie über den authentifizierten Radio-Proxy unter `/speaker`.

## Aufbau

- `main.py`: API, persistente Jobs und Vorbereitungsablauf
- `scheduler.py`: Sendezeiten in `Europe/Zurich`
- `feeds.py`: RSS-Abruf öffentlicher URLs
- `llm_client.py`: Ollama-Skript mit fester Begrüssung und Überleitung
- `tts_engine.py`: lokales Qwen3-TTS und WAV-Erzeugung
- `requirements.txt`, `test_*.py`: Abhängigkeiten und Tests
- `docker/metawave_speaker/`: Image und Compose-Dienste

## Start und Test

1. Wie in der [Docker-Anleitung](../../docker/README.md) die vorhandenen
   Umgebungsdateien einrichten und Docker starten.
2. Im Repository-Hauptverzeichnis ausführen:

   ```powershell
   docker compose -f .\docker\compose.enviroment.yaml up --build -d
   ```

   Ollama lädt beim ersten Start `qwen2.5:3b` herunter; Qwen3-TTS lädt sein
   Modell beim ersten Test herunter. Beide Downloads benötigen mehrere GB.
   CPU-Inferenz kann insbesondere beim ersten Lauf mehrere Minuten dauern und
   benötigt ausreichend RAM und freien Speicher. Fortschritt und Fehler:

   ```powershell
   docker compose -f .\docker\compose.enviroment.yaml logs -f ollama-init metawave-speaker
   ```

3. In MetaWave anmelden, **Einstellungen → Speaker** öffnen und die drei
   RSS-URLs prüfen. Voreingestellt sind heise online, SRF Schweiz und eine
   Google-News-Suche nach Zürich. Der Google-Feed ist laut Anbieter nur für
   persönliche, nicht kommerzielle Nutzung vorgesehen; für eine öffentliche
   oder kommerzielle Ausspielung eine dafür zugelassene Zürich-Quelle
   konfigurieren. Nutzungsrechte und Richtigkeit aller Quellen selbst prüfen.
   Die Feeds müssen öffentlich erreichbar sein, dürfen nicht auf private
   Netzwerkadressen zeigen und dürfen keine HTTP-Weiterleitung benötigen.
4. **Jetzt testen / Vorschau generieren** drücken. Nach RSS-Abruf,
   Textgenerierung und TTS wird die Vorschau ausschliesslich auf dem eigenen
   Gerät abgespielt. Falls der Browser automatisches Abspielen blockiert,
   **Vorschau abspielen** drücken. Fehler erscheinen in der Sektion und im Log.
5. Für den geplanten Test Speaker aktivieren und eine Uhrzeit mindestens eine
   Stunde in der Zukunft eintragen. Zu dieser Uhrzeit einen angemeldeten,
   bereits gestarteten Player geöffnet lassen. Eine Stunde vorher muss die
   Vorbereitung im Log starten. Ab der Sendezeit läuft zunächst der aktuelle
   Song zu Ende. Sobald die individuellen Songansagen bereit sind, beginnt der
   Beitrag an einem Liedende und kündigt danach den nächsten Song an.

Die Sendezeiten sind täglich und verwenden `Europe/Zurich`. Eine bei der
Sommerzeitumstellung nicht existierende Uhrzeit entfällt; bei einer doppelt
vorkommenden Uhrzeit wird die erste verwendet. Vorbereitungen beginnen eine
reale Stunde vor dem Zielzeitpunkt. Ein pausiertes Radio lässt den Beitrag aus.
In der Player-Queue zeigt ein separater Hinweis die nächste geplante
Sendezeit in Schweizer Ortszeit und kennzeichnet einen bekannten Ausfall;
bei pausiertem Radio kann die Sendung
ausfallen. Während die Sendung auf ein Liedende und ihre Songansagen wartet,
zeigt die Queue dies an.
Während der Erstellung zeigen Player-Queue und Desktop-Nachrichtenleiste einen
Ladeindikator; danach erscheint der Bereitschaftsstatus. Der Status beruht auf
den gemeldeten Jobs und ist keine Fortschrittsanzeige für einzelne Arbeitsschritte.
Eine manuell gestartete Vorschau wird als Test gekennzeichnet. Kürzliche
Ausfälle werden ebenfalls angezeigt; die Aktualisierung erfolgt etwa alle 15 Sekunden.
Auf dem Desktop lassen sich links die nächste und die zuletzt ausgestrahlte
Sendung aufklappen. Ein Lesefenster zeigt das vollständige KI-Skript; bei neu
vorbereiteten Sendungen stehen zusätzlich die vom RSS-Feed gelieferten Titel,
Zusammenfassungen und, soweit vorhanden, Links zur Quelle zur Verfügung.
Die RSS-Auswahl sind die Eingaben für das Modell: Nicht jede Meldung muss im
Skript vorkommen, und die Texte dürfen nicht als automatisch verifizierte
Fakten oder als vollständige Originalartikel verstanden werden. Bei älteren
Sendungen wurden keine Quellen gespeichert. Auch die automatisch generierten
Inhalte müssen redaktionell geprüft werden.
Ist der vorbereitete Nachrichtenbeitrag zur Sendezeit nicht fertig, fällt er
aus. Die zusätzlichen Songansagen werden erst ab der Sendezeit mit Qwen
erzeugt, sobald die konkreten Titel bekannt sind. Falls die Titel währenddessen
wechseln oder die Ansagen beim Liedende noch nicht bereit sind, läuft der
nächste Song und die Sendung wartet auf ein passendes späteres Liedende.
Nach 30 Minuten Wartezeit wird sie als fehlgeschlagen markiert. Werden
Konfiguration oder Zeiten nach Beginn des Vorlaufs geändert,
muss für die neue Konfiguration wieder ein vollständiger Vorlauf möglich sein.
Nach Neustarts werden unterbrochene Vorbereitungen als fehlgeschlagen markiert.
Beiträge erhalten am Anfang und Ende eine kurze, lokal erzeugte
Nachrichtenkennung. Angestrebt werden ein bis drei Minuten für den
Nachrichtenbeitrag inklusive Kennung; die Songansagen kommen zusätzlich hinzu.
Neu erzeugte Sprachaufnahmen werden für eine höhere Lautstärke normalisiert;
bereits vorhandene Beiträge bleiben unverändert.
Liegt das fertige Audio ausserhalb von 60 bis 180 Sekunden, wird der Job mit
einer Fehlermeldung verworfen und nicht ausgespielt. Längere Beiträge brauchen
besonders auf der CPU deutlich mehr Vorbereitungszeit.

Beiträge und Jobdaten vorheriger Kalendertage werden nach Schweizer Ortszeit
automatisch entfernt, auch die letzte Vorschau. Die Bereinigung läuft beim
Start und danach etwa minütlich. Noch laufende Vorbereitungen, Sendungen für
den aktuellen oder einen zukünftigen Tag und Dateien, die möglicherweise
gerade abgespielt werden, bleiben zunächst erhalten.

MetaWave verwendet **keinen zentralen Audiostream**. Aktive Player werden über
den Radio-Server synchronisiert und blenden Musik und Beitrag beim Wechsel kurz
aus bzw. ein. Netzwerkverzögerungen, Browser-Autoplay und Hintergrundbetrieb
verhindern eine garantiert samplegenaue oder überall gleichzeitige Ausspielung.
Die Ansagen nennen den gerade beendeten und den anschliessend vorgesehenen
Song. Der angekündigte nächste Song wird nach dem Beitrag auch dann gestartet,
wenn die Queue währenddessen umsortiert wurde. Ein manueller Songwechsel
während des Beitrags bricht diesen ab.
Der Dienst muss zur Vorbereitungs- und Sendezeit laufen; verpasste Zeiten
werden nicht nachgeholt.

Auch die Radio-Arbeitszeiten in den Einstellungen gelten in `Europe/Zurich`
und berücksichtigen die Schweizer Sommer- und Winterzeit.

## CPU und NVIDIA-GPU

Standardmässig laufen Ollama und TTS auf der CPU. Mit NVIDIA-Treiber,
NVIDIA Container Toolkit und Docker-GPU-Unterstützung kann alternativ das
GPU-Override verwendet werden:

```powershell
docker compose -f .\docker\compose.enviroment.yaml -f .\docker\compose.speaker-gpu.yaml up --build -d
```

Für den Wechsel zurück zur CPU dasselbe Kommando ohne das zweite `-f`
ausführen. Das Ollama-Modell lässt sich über `OLLAMA_MODEL` beim Compose-Aufruf
überschreiben. Der Speaker unterstützt darüber hinaus `SPEAKER_TTS_MODEL`,
`SPEAKER_TTS_VOICE`, `SPEAKER_TTS_DEVICE`, `OLLAMA_URL`, `OLLAMA_TIMEOUT`
und `SPEAKER_CORS_ORIGINS` als Container-Umgebungsvariablen. Der Sprechstil
kann über `SPEAKER_TTS_INSTRUCT` angepasst werden. Qwen3-TTS CustomVoice 0.6B
ignoriert diese Stilvorgabe; das grössere 1.7B-CustomVoice-Modell unterstützt
sie, benötigt aber entsprechend mehr Speicher und Rechenzeit. Beim
Compose-Aufruf kann es beispielsweise mit
`SPEAKER_TTS_MODEL=Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice` gewählt werden.
In PowerShell beispielsweise:

```powershell
$env:SPEAKER_TTS_MODEL = "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice"
docker compose -f .\docker\compose.enviroment.yaml up -d --no-deps metawave-speaker
```

Vor dem Wechsel eine laufende Vorbereitung abschliessen lassen. Die Variable
muss auch bei späteren Compose-Aufrufen gesetzt sein, wenn das grössere Modell
beibehalten werden soll.

## API

Intern auf Port 8010: `GET /status`, `GET /config`, `POST /config`,
`POST /trigger-prepare`, `GET /jobs/{id}`, `GET /jobs/{id}/audio` und
`GET /audio/latest`. Das Triggern liefert HTTP 202 mit einer Job-ID;
der Jobstatus meldet `preparing`, `ready` oder `failed`. `/internal/due` und
`/internal/ack` sind nur für die Radio-Ausspielung vorgesehen. Externer Zugriff
erfolgt ausschliesslich über `/speaker/...` am Radio mit dessen Bearer-Token.
