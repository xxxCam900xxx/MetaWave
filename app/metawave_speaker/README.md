# MetaWave Speaker

Der Dienst bereitet Nachrichten aus drei RSS-Feeds mit lokalem Ollama und
Qwen3-TTS vor. Die Einstellungen und Audio-Dateien liegen im Docker-Volume
`speaker_data`; die Modell-Caches liegen in `ollama_models` und `speaker_models`.
Die Moderation ist auf natürliche Übergänge ohne vorgelesene Quellen ausgelegt;
die Quellenmetadaten bleiben für den Abruf erhalten. Automatisch erzeugte
Nachrichten können Fehler enthalten und sollten vor einer öffentlichen
Ausstrahlung redaktionell geprüft werden.
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
   Vorbereitung im Log starten; zur Sendezeit unterbricht der Beitrag die Musik
   und setzt sie anschliessend an derselben Stelle fort.

Die Sendezeiten sind täglich und verwenden `Europe/Zurich`. Eine bei der
Sommerzeitumstellung nicht existierende Uhrzeit entfällt; bei einer doppelt
vorkommenden Uhrzeit wird die erste verwendet. Vorbereitungen beginnen eine
reale Stunde vor dem Zielzeitpunkt. Ein pausiertes Radio lässt den Beitrag aus.
In der Player-Queue zeigt ein separater Hinweis die nächste geplante
Sendezeit in Schweizer Ortszeit. Er verändert die Musikreihenfolge nicht und
kennzeichnet einen bekannten Ausfall; bei pausiertem Radio kann die Sendung
ausfallen.
Ist ein Beitrag nicht rechtzeitig fertig, fällt er aus statt verspätet zu
starten. Werden Konfiguration oder Zeiten nach Beginn des Vorlaufs geändert,
muss für die neue Konfiguration wieder ein vollständiger Vorlauf möglich sein.
Nach Neustarts werden unterbrochene Vorbereitungen als fehlgeschlagen markiert.
Beiträge erhalten am Anfang und Ende eine kurze, lokal erzeugte
Nachrichtenkennung. Angestrebt werden ein bis drei Minuten inklusive Kennung.
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
Der Dienst muss zur Vorbereitungs- und Sendezeit laufen; verpasste Zeiten
werden nicht nachgeholt.

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
