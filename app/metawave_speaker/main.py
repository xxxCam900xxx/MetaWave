"""MetaWave Speaker API and preparation scheduler."""

import asyncio
import copy
import hashlib
import json
import logging
import os
import re
import threading
import time
import uuid
import wave
from contextlib import asynccontextmanager
from dataclasses import asdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, field_validator

from feeds import fetch_feed
from jingle import add_jingles
from llm_client import generate_script
from history import mark_played, unseen
from markets import DEFAULT_WATCHLIST, fetch_markets
from program import DEFAULTS, WEEKDAYS, planned_format, select_program
from scheduler import ZONE, broadcasts, next_events
from speech import clean
from tts_engine import TTSEngine
from weather import fetch_weather

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
log = logging.getLogger("speaker")
UTC = timezone.utc
DATA = Path(os.getenv("SPEAKER_DATA_DIR", "/data"))
AUDIO = DATA / "audio"
JOBS = DATA / "jobs"
CONFIG = DATA / "config.json"
LATEST = DATA / "latest.json"
HISTORY = DATA / "history.json"

DEFAULT_FEEDS = [
    "https://www.heise.de/rss/heise-atom.xml",
    "https://www.srf.ch/news/bnf/rss/1890",
    "https://news.google.com/rss/search?q=Z%C3%BCrich&hl=de&gl=CH&ceid=CH:de",
]


class Host(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    voice: str = Field(min_length=1, max_length=50)
    character: str = Field(min_length=1, max_length=200)


class Location(BaseModel):
    name: str = Field(default="Zürich", min_length=1, max_length=100)
    latitude: float = Field(default=47.3769, ge=-90, le=90)
    longitude: float = Field(default=8.5417, ge=-180, le=180)


class MarketSymbol(BaseModel):
    symbol: str = Field(min_length=1, max_length=30, pattern=r"^[A-Za-z0-9.^=-]+$")
    name: str = Field(min_length=1, max_length=100)


class Config(BaseModel):
    enabled: bool = False
    times: list[str] = ["08:00", "10:00", "14:00", "16:00"]
    rss_urls: list[str] = Field(default_factory=lambda: list(DEFAULT_FEEDS))
    week_plan: dict[str, dict[str, str]] = Field(default_factory=lambda: copy.deepcopy(DEFAULTS["week_plan"]))
    hosts: dict[str, Host] = Field(default_factory=lambda: {key: Host(**value) for key, value in DEFAULTS["hosts"].items()})
    weather_location: Location = Field(default_factory=Location)
    watchlist: list[MarketSymbol] = Field(default_factory=lambda: [MarketSymbol(**entry) for entry in DEFAULT_WATCHLIST], max_length=12)
    dialog_formats: list[str] = Field(default_factory=list)
    cohost: str = "elena"

    @field_validator("week_plan")
    @classmethod
    def valid_plan(cls, value):
        if set(value) != set(WEEKDAYS):
            raise ValueError("Der Wochenplan benötigt alle sieben Wochentage")
        for slots in value.values():
            if any(not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", slot)
                   or format_id not in DEFAULTS["formats"] for slot, format_id in slots.items()):
                raise ValueError("Ungültige Sendezeit oder Format-ID im Wochenplan")
        return value

    @field_validator("hosts")
    @classmethod
    def valid_hosts(cls, value):
        if set(value) != set(DEFAULTS["hosts"]):
            raise ValueError("Das Team benötigt die Moderatoren lukas, elena und max")
        return value

    @field_validator("dialog_formats")
    @classmethod
    def valid_dialog_formats(cls, value):
        if len(set(value)) != len(value) or any(item not in DEFAULTS["formats"] for item in value):
            raise ValueError("Ungültige Dialogformate")
        return value

    @field_validator("cohost")
    @classmethod
    def valid_cohost(cls, value):
        if value not in DEFAULTS["hosts"]:
            raise ValueError("Ungültiger Co-Moderator")
        return value

    @field_validator("times")
    @classmethod
    def valid_times(cls, values: list[str]) -> list[str]:
        if not values or len(values) > 24 or len(set(values)) != len(values):
            raise ValueError("Eine bis 24 verschiedene Sendezeiten eingeben")
        if any(not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", value) for value in values):
            raise ValueError("Sendezeiten müssen das Format HH:MM haben")
        return sorted(values)

    @field_validator("rss_urls")
    @classmethod
    def valid_urls(cls, values: list[str]) -> list[str]:
        if values != DEFAULT_FEEDS:
            raise ValueError("Die RSS-Quellen sind fest vorgegeben und können nicht geändert werden")
        return values


def write_json(path: Path, value: dict) -> None:
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")
    os.replace(temp, path)


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def revision(config: Config) -> str:
    return hashlib.sha256(config.model_dump_json().encode()).hexdigest()[:16]


def job_path(target: datetime, config: Config) -> Path:
    return JOBS / f"{int(target.timestamp())}-{revision(config)}.json"


class Speaker:
    def __init__(self) -> None:
        AUDIO.mkdir(parents=True, exist_ok=True)
        JOBS.mkdir(parents=True, exist_ok=True)
        if CONFIG.exists():
            stored = read_json(CONFIG)
            feeds_changed = stored.get("rss_urls", DEFAULT_FEEDS) != DEFAULT_FEEDS
            if feeds_changed:
                log.warning("Gespeicherte RSS-Quellen werden durch die festen Quellen ersetzt")
                stored["rss_urls"] = list(DEFAULT_FEEDS)
            self.config = Config.model_validate(stored)
            if feeds_changed:
                write_json(CONFIG, self.config.model_dump())
        else:
            self.config = Config()
            write_json(CONFIG, self.config.model_dump())
        self.tts = TTSEngine()
        self.tts_lock = threading.Lock()
        self.current: dict | None = None
        self.task: asyncio.Task | None = None
        self.transition: dict | None = None
        self.transition_task: asyncio.Task | None = None
        self.scheduler: asyncio.Task | None = None
        for path in JOBS.glob("*.json"):
            record = read_json(path)
            if record.get("state") == "preparing":
                record.update(state="failed", error="Vorbereitung durch Neustart unterbrochen")
                write_json(path, record)
            elif record.get("state") == "played" and record.get("items") and record.get("target"):
                target = datetime.fromisoformat(record.get("played_at") or record["target"])
                if target.tzinfo is None or target.utcoffset() is None:
                    raise ValueError(f"Sendezeit in {path.name} hat keine Zeitzone")
                if target.astimezone(ZONE).date() == datetime.now(ZONE).date():
                    mark_played(record["items"], target, HISTORY)
        self.prune()
        self.next_prune = time.monotonic() + 60

    def prune(self, now: datetime | None = None) -> None:
        now = now or datetime.now(UTC)
        today = now.astimezone(ZONE).date()
        protected: set[str] = set()
        active_transition_key = None
        if self.transition and self.transition.get("state") == "ready":
            try:
                key = self.transition["signature"][0]
                path = JOBS / f"{key}.json"
                if path.exists():
                    record = read_json(path)
                    target = datetime.fromisoformat(record["target"])
                    waiting = record.get("state") == "claimed" and 0 <= (now - target).total_seconds() < 1800
                    playing = record.get("state") == "played" and path.stat().st_mtime > now.timestamp() - max(180, self.transition["duration"] + 30)
                    if waiting or playing:
                        protected.add(self.transition["filename"])
                        active_transition_key = key
            except (OSError, ValueError, KeyError, TypeError):
                log.exception("Could not check active speaker transition for cleanup")
                protected.add(self.transition["filename"])
        for path in JOBS.glob("*.json"):
            filename = ""
            try:
                record = read_json(path)
                filename = record.get("filename", "")
                valid_audio = isinstance(filename, str) and re.fullmatch(r"speaker-[a-f0-9]{32}\.wav", filename)
                audio = AUDIO / filename if valid_audio else None
                target = datetime.fromisoformat(record["target"])
                if target.tzinfo is None or target.utcoffset() is None:
                    raise ValueError("Job target has no timezone")
                recent = (0 <= (now - target).total_seconds() < 180
                          or path.stat().st_mtime > now.timestamp() - 180
                          or path.stem == active_transition_key
                          or (record.get("state") == "claimed" and 0 <= (now - target).total_seconds() < 1800))
                if audio and audio.exists():
                    recent = recent or audio.stat().st_mtime > now.timestamp() - 180
                if target.astimezone(ZONE).date() < today and record.get("state") != "preparing" and not recent:
                    if audio:
                        audio.unlink(missing_ok=True)
                    path.unlink()
                    if self.current and self.current.get("id") == record.get("id") and (not self.task or self.task.done()):
                        self.current = None
                elif valid_audio:
                    protected.add(filename)
            except (OSError, ValueError, KeyError, TypeError):
                log.exception("Could not clean speaker job %s", path)
                if isinstance(filename, str):
                    protected.add(filename)

        if LATEST.exists():
            try:
                latest = read_json(LATEST)
                filename = latest.get("filename", "")
                if isinstance(filename, str) and re.fullmatch(r"speaker-[a-f0-9]{32}\.wav", filename):
                    target = datetime.fromisoformat(latest["target"])
                    if target.tzinfo is None or target.utcoffset() is None:
                        raise ValueError("Latest target has no timezone")
                    if target.astimezone(ZONE).date() >= today or latest.get("state") == "preparing":
                        protected.add(filename)
                    elif not (AUDIO / filename).exists():
                        LATEST.unlink()
            except (OSError, ValueError, KeyError, TypeError):
                log.exception("Could not clean latest speaker reference")

        active_id = self.current.get("id") if self.current and self.task and not self.task.done() else None
        for path in AUDIO.glob("speaker-*"):
            try:
                match = re.fullmatch(r"speaker-([a-f0-9]{32})\.wav(?:(?:\.intro|\.outro)?\.tmp(?:\.jingle)?)?", path.name)
                if not match or path.name in protected or match.group(1) == active_id:
                    continue
                modified = datetime.fromtimestamp(path.stat().st_mtime, UTC)
                if modified.astimezone(ZONE).date() < today and modified.timestamp() <= now.timestamp() - 180:
                    path.unlink()
            except OSError:
                log.exception("Could not clean speaker audio %s", path)
        if LATEST.exists():
            try:
                latest = read_json(LATEST)
                filename = latest.get("filename", "")
                if isinstance(filename, str) and re.fullmatch(r"speaker-[a-f0-9]{32}\.wav", filename) and not (AUDIO / filename).exists():
                    LATEST.unlink()
            except (OSError, ValueError, TypeError):
                log.exception("Could not clean latest speaker reference")

    def prepare_sync(self, config: Config, target: datetime, filename: str) -> dict:
        feeds = []
        feed_errors = []
        for url in config.rss_urls:
            try:
                feeds.append(fetch_feed(url))
            except (OSError, ValueError, RuntimeError) as exc:
                log.warning("RSS-Feed nicht verfügbar: %s", exc)
                feed_errors.append(str(exc))
        if not feeds:
            raise RuntimeError("Alle RSS-Feeds sind nicht erreichbar: " + "; ".join(feed_errors))
        items = [feed[index] for index in range(3) for feed in feeds if index < len(feed)]
        items = unseen(items, target, HISTORY)
        format_id, program, items = select_program(target, config.week_plan, items)
        host = config.hosts[program["host"]]
        cohost_key = config.cohost if config.cohost != program["host"] else (
            "lukas" if program["host"] != "lukas" else "elena"
        )
        cohost = config.hosts[cohost_key]
        weather = None
        if "weather" in program["focus"]:
            try:
                location = config.weather_location
                weather = fetch_weather(location.latitude, location.longitude, location.name, target)
            except (OSError, ValueError, KeyError, TypeError, IndexError) as exc:
                log.warning("Wetter nicht verfügbar: %s", exc)
        markets = fetch_markets([entry.model_dump() for entry in config.watchlist]) if "markets" in program["focus"] else []
        dialog = format_id in config.dialog_formats
        script = generate_script(
            items, target.astimezone(ZONE),
            ollama_url=os.getenv("OLLAMA_URL", "http://ollama:11434"),
            model=os.getenv("OLLAMA_MODEL", "qwen2.5:3b"),
            timeout=float(os.getenv("OLLAMA_TIMEOUT", "600")),
            program=program, host=host.model_dump(), cohost=cohost.model_dump(),
            weather=weather, markets=markets, dialog=dialog,
        )
        temporary = AUDIO / (filename + ".tmp")
        try:
            with self.tts_lock:
                if dialog:
                    segments = [(host.voice if line.startswith("[HOST_A]:") else cohost.voice,
                                 line.split(":", 1)[1].strip()) for line in script.splitlines()]
                    self.tts.render_segments(segments, temporary)
                else:
                    self.tts.render(script, temporary, speaker=host.voice)
            duration = add_jingles(temporary)
            if not 10 <= duration <= 180:
                raise ValueError(f"Sprecherbeitrag dauert {duration:.1f} Sekunden; benötigt werden 10 bis 180 Sekunden")
            os.replace(temporary, AUDIO / filename)
        finally:
            temporary.unlink(missing_ok=True)
        return {"filename": filename, "duration": duration, "script": script,
                "format_id": format_id, "format_name": program["name"], "host": host.name, "voice": host.voice,
                "items": [asdict(item) for item in items]}

    def render_transition(self, source: str, previous: str, following: str, voice: str | None = None) -> dict:
        filename = f"speaker-{uuid.uuid4().hex}.wav"
        temporary = AUDIO / (filename + ".tmp")
        intro = AUDIO / (filename + ".intro.tmp")
        outro = AUDIO / (filename + ".outro.tmp")
        try:
            with self.tts_lock:
                self.tts.render(clean(f"Das war {previous}. Kommen wir zum Programm."), intro, speaker=voice)
                self.tts.render(clean(f"Jetzt kommt {following}. Danke fürs Einschalten!"), outro, speaker=voice)
            parts = []
            params = None
            for path in (intro, AUDIO / source, outro):
                with wave.open(str(path), "rb") as audio:
                    current = (audio.getnchannels(), audio.getsampwidth(), audio.getframerate(), audio.getcomptype())
                    if params is not None and current != params:
                        raise ValueError("Sprecheraufnahmen haben unterschiedliche Audioformate")
                    params = current
                    parts.append(audio.readframes(audio.getnframes()))
            if params is None or params[3] != "NONE":
                raise ValueError("Ungültiges Sprecher-Audioformat")
            with wave.open(str(temporary), "wb") as audio:
                audio.setnchannels(params[0])
                audio.setsampwidth(params[1])
                audio.setframerate(params[2])
                audio.writeframes(b"\0" * (params[0] * params[1] * params[2]))
                for part in parts:
                    audio.writeframes(part)
                duration = audio.getnframes() / params[2]
            os.replace(temporary, AUDIO / filename)
            return {"filename": filename, "duration": duration}
        finally:
            for path in (temporary, intro, outro):
                path.unlink(missing_ok=True)

    def request_transition(self, key: str, source: str, previous: str, following: str) -> dict:
        if not self.config.enabled or not key.endswith(f"-{revision(self.config)}"):
            return {"state": "failed", "error": "Speaker-Konfiguration wurde geändert"}
        path = JOBS / f"{key}.json"
        if not path.exists():
            return {"state": "failed", "error": "Sendung nicht gefunden"}
        record = read_json(path)
        if record.get("filename") != source or record.get("state") not in ("ready", "claimed", "uncertain"):
            return {"state": "failed", "error": "Sendung ist nicht für die Übergabe bereit"}
        signature = (key, source, previous, following, record.get("voice"))
        if self.transition and self.transition["signature"] == signature:
            return {k: v for k, v in self.transition.items() if k != "signature"}
        if (self.transition_task and not self.transition_task.done()) or (self.task and not self.task.done()):
            return {"state": "busy"}
        self.transition = {"signature": signature, "state": "preparing"}
        self.transition_task = asyncio.create_task(self.run_transition(signature))
        return {"state": "preparing"}

    async def run_transition(self, signature: tuple[str, str, str, str, str | None]) -> None:
        try:
            result = await asyncio.to_thread(self.render_transition, signature[1], signature[2], signature[3], signature[4])
            self.transition.update(result, state="ready")
        except Exception as exc:
            log.exception("Speaker transition preparation failed")
            self.transition.update(state="failed", error=str(exc))

    def start_job(self, target: datetime, scheduled: bool) -> dict:
        if self.task and not self.task.done():
            raise HTTPException(409, "Eine Vorbereitung läuft bereits")
        config = self.config.model_copy(deep=True)
        job_id = uuid.uuid4().hex
        record = {"id": job_id, "state": "preparing", "target": target.isoformat(), "scheduled": scheduled}
        path = job_path(target, config) if scheduled else JOBS / f"preview-{job_id}.json"
        write_json(path, record)
        self.prune()
        self.current = record
        self.task = asyncio.create_task(self.run_job(record, config, target, path))
        return record.copy()

    async def run_job(self, record: dict, config: Config, target: datetime, path: Path) -> None:
        try:
            result = await asyncio.to_thread(self.prepare_sync, config, target, f"speaker-{record['id']}.wav")
            record.update(result, state="ready")
            write_json(LATEST, record)
            saved = read_json(path)
            if saved.get("state") == "missed":
                record.update(state="missed", error=saved.get("error"))
            log.info("Speaker audio ready: %s", record["id"])
        except Exception as exc:
            log.exception("Speaker preparation failed")
            record.update(state="failed", error=str(exc))
        write_json(path, record)

    async def schedule(self) -> None:
        while True:
            try:
                now = datetime.now(UTC)
                if time.monotonic() >= self.next_prune:
                    self.prune(now)
                    self.next_prune = time.monotonic() + 60
                config = self.config
                if config.enabled:
                    for target in broadcasts(config.times, now):
                        delay = (now - (target - timedelta(hours=1))).total_seconds()
                        path = job_path(target, config)
                        if 0 <= delay < 2 and not path.exists():
                            try:
                                self.start_job(target, True)
                            except HTTPException:
                                log.error("Scheduled preparation missed: another job is running")
                                write_json(path, {"state": "failed", "error": "Andere Vorbereitung läuft", "target": target.isoformat()})
                        late = (now - target).total_seconds()
                        if 2 <= late < 3600:
                            if not path.exists():
                                write_json(path, {"state": "missed", "target": target.isoformat(), "error": "Kein vorbereiteter Beitrag vorhanden"})
                                log.error("No prepared speaker broadcast for %s", target)
                                continue
                            record = read_json(path)
                            if record.get("state") in ("preparing", "ready"):
                                record.update(state="missed", error="Nicht rechtzeitig ausgespielt")
                                write_json(path, record)
                                log.error("Speaker broadcast missed: %s", target)
                            elif record.get("state") == "claimed" and late >= 1800:
                                record.update(state="uncertain", error="Radio hat die Ausspielung nicht bestätigt")
                                write_json(path, record)
                                log.error("Speaker broadcast acknowledgement missing: %s", target)
            except Exception:
                log.exception("Speaker scheduler failed")
            await asyncio.sleep(0.25)

    def due(self, playing: bool) -> dict | None:
        if not self.config.enabled:
            return None
        now = datetime.now(UTC)
        for target in broadcasts(self.config.times, now):
            delay = (now - target).total_seconds()
            if not 0 <= delay < 2:
                continue
            path = job_path(target, self.config)
            if not path.exists():
                log.error("Scheduled audio was not prepared for %s", target)
                write_json(path, {"state": "missed", "target": target.isoformat(), "error": "Kein vorbereiteter Beitrag vorhanden"})
                return None
            record = read_json(path)
            if record.get("state") == "ready":
                record["state"] = "claimed" if playing else "skipped"
                write_json(path, record)
                if playing:
                    return {"filename": record["filename"], "duration": record["duration"],
                            "key": path.stem, "target": target.isoformat()}
                log.info("Speaker skipped because radio is paused")
            elif record.get("state") == "preparing":
                record.update(state="missed", error="Vorbereitung zur Sendezeit nicht abgeschlossen")
                write_json(path, record)
                log.error("Speaker was not ready for %s", target)
            return None
        return None


speaker: Speaker


@asynccontextmanager
async def lifespan(app: FastAPI):
    global speaker
    speaker = Speaker()
    speaker.scheduler = asyncio.create_task(speaker.schedule())
    yield
    speaker.scheduler.cancel()
    try:
        await speaker.scheduler
    except asyncio.CancelledError:
        pass
    if speaker.task and not speaker.task.done():
        await speaker.task
    if speaker.transition_task and not speaker.transition_task.done():
        await speaker.transition_task


app = FastAPI(title="MetaWave Speaker", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv("SPEAKER_CORS_ORIGINS", "http://localhost:8081").split(",") if origin.strip()],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.get("/status")
async def status():
    now = datetime.now(UTC)
    prepare, air = next_events(speaker.config.times, now) if speaker.config.enabled else (None, None)
    latest = read_json(LATEST) if LATEST.exists() else None
    next_path = job_path(air, speaker.config) if air else None
    next_record = read_json(next_path) if next_path and next_path.exists() else None
    scheduled = [path for path in JOBS.glob("*.json") if not path.name.startswith("preview-")]
    last_scheduled = read_json(max(scheduled, key=lambda path: path.stat().st_mtime_ns)) if scheduled else None
    last_played = None
    last_played_time = None
    for path in scheduled:
        record = read_json(path)
        if record.get("state") != "played" or not isinstance(record.get("script"), str):
            continue
        try:
            target = datetime.fromisoformat(record["target"])
            if target.tzinfo is None or target.utcoffset() is None:
                raise ValueError("Broadcast target has no timezone")
        except (KeyError, TypeError, ValueError):
            log.exception("Invalid played broadcast target in %s", path)
            continue
        if target <= now and (last_played_time is None or target > last_played_time):
            last_played = {"target": record["target"], "script": record["script"]}
            if "items" in record:
                last_played["items"] = record["items"]
            last_played_time = target
    if speaker.config.enabled:
        for path in scheduled:
            if not path.stem.endswith(f"-{revision(speaker.config)}"):
                continue
            record = read_json(path)
            if record.get("state") != "claimed" or not record.get("target"):
                continue
            target = datetime.fromisoformat(record["target"])
            if 0 <= (now - target).total_seconds() < 1800:
                air = target
                next_record = record
                break
    local_day = now.astimezone(ZONE).date()
    next_program = None
    if air:
        format_id = planned_format(air, speaker.config.week_plan)
        if next_record and next_record.get("state") in ("ready", "claimed"):
            format_id = next_record.get("format_id") or format_id
        program = DEFAULTS["formats"][format_id]
        next_program = {
            "date": air.astimezone(ZONE).date().isoformat(),
            "time": air.astimezone(ZONE).strftime("%H:%M"),
            "format_id": format_id,
            "name": program["name"],
            "host": speaker.config.hosts[program["host"]].name,
            "prepared": bool(next_record and next_record.get("state") in ("ready", "claimed")),
        }
    today_program = []
    for target in broadcasts(speaker.config.times, now, days=1):
        format_id = planned_format(target, speaker.config.week_plan)
        program = DEFAULTS["formats"][format_id]
        today_program.append({
            "time": target.astimezone(ZONE).strftime("%H:%M"),
            "format_id": format_id,
            "name": program["name"],
            "host": speaker.config.hosts[program["host"]].name,
            "is_next": target == air,
        })
    return {
        "enabled": speaker.config.enabled,
        "timezone": str(ZONE),
        "next_prepare": prepare.isoformat() if prepare else None,
        "next_broadcast": air.isoformat() if air else None,
        "next_format": planned_format(air, speaker.config.week_plan) if air else None,
        "next_prepared_format": next_record.get("format_id") if next_record else None,
        "next_broadcast_state": next_record.get("state") if next_record else None,
        "next_program": next_program,
        "today_date": local_day.isoformat(),
        "today_program": today_program,
        "next_broadcast_script": next_record.get("script") if next_record and next_record.get("state") in ("ready", "claimed") else None,
        "next_broadcast_items": next_record.get("items") if next_record and next_record.get("state") in ("ready", "claimed") else None,
        "job": speaker.current,
        "transition_state": speaker.transition.get("state") if speaker.transition else None,
        "latest": latest,
        "last_scheduled": last_scheduled,
        "last_broadcast": last_played,
    }


@app.get("/config")
async def get_config():
    return speaker.config.model_dump()


@app.post("/config")
async def set_config(config: Config):
    write_json(CONFIG, config.model_dump())
    speaker.config = config
    return config.model_dump()


@app.post("/trigger-prepare", status_code=202)
async def trigger_prepare():
    return speaker.start_job(datetime.now(UTC), False)


@app.get("/jobs/{job_id}")
async def job_status(job_id: str):
    if not re.fullmatch(r"[a-f0-9]{32}", job_id):
        raise HTTPException(400, "Ungültige Job-ID")
    path = JOBS / f"preview-{job_id}.json"
    if not path.exists():
        raise HTTPException(404, "Vorbereitung nicht gefunden")
    return read_json(path)


@app.get("/jobs/{job_id}/audio")
async def job_audio(job_id: str):
    record = await job_status(job_id)
    if record.get("state") != "ready":
        raise HTTPException(409, "Vorschau ist noch nicht fertig")
    filename = record.get("filename", "")
    if not re.fullmatch(r"speaker-[a-f0-9]{32}\.wav", filename):
        raise HTTPException(500, "Ungültiger Dateiname")
    path = AUDIO / filename
    if not path.is_file():
        raise HTTPException(404, "Audiodatei nicht gefunden")
    return FileResponse(path, media_type="audio/wav", headers={"Cache-Control": "no-store"})


@app.get("/audio/latest")
async def latest_audio():
    if not LATEST.exists():
        raise HTTPException(404, "Noch kein Beitrag vorhanden")
    filename = read_json(LATEST)["filename"]
    path = AUDIO / Path(filename).name
    if not path.is_file():
        raise HTTPException(404, "Audiodatei nicht gefunden")
    return FileResponse(path, media_type="audio/wav", headers={"Cache-Control": "no-store"})


class DueRequest(BaseModel):
    playing: bool


@app.post("/internal/due")
async def due(request: DueRequest):
    return {"episode": speaker.due(request.playing)}


class TransitionRequest(BaseModel):
    key: str
    filename: str
    previous: str
    following: str

    @field_validator("previous", "following")
    @classmethod
    def valid_title(cls, value: str) -> str:
        value = " ".join(value.split())
        if not value or len(value) > 200:
            raise ValueError("Ungültiger Songtitel")
        return value


@app.post("/internal/transition")
async def transition(request: TransitionRequest):
    if not re.fullmatch(r"\d+-[a-f0-9]{16}", request.key) or not re.fullmatch(r"speaker-[a-f0-9]{32}\.wav", request.filename):
        raise HTTPException(400, "Ungültige Sendung")
    return speaker.request_transition(request.key, request.filename, request.previous, request.following)


class AckRequest(BaseModel):
    key: str
    filename: str
    played: bool


@app.post("/internal/ack")
async def acknowledge(request: AckRequest):
    if not re.fullmatch(r"\d+-[a-f0-9]{16}", request.key):
        raise HTTPException(400, "Ungültiger Beitrag")
    path = JOBS / f"{request.key}.json"
    if not path.exists():
        raise HTTPException(404, "Beitrag nicht gefunden")
    record = read_json(path)
    if record.get("filename") != request.filename:
        raise HTTPException(409, "Beitrag stimmt nicht überein")
    outcome = "played" if request.played else "failed"
    if record.get("state") == outcome:
        return {"state": outcome}
    if record.get("state") not in ("claimed", "uncertain"):
        raise HTTPException(409, "Beitrag ist nicht zur Bestätigung freigegeben")
    if request.played:
        played_at = datetime.now(UTC)
        if record.get("items"):
            mark_played(record["items"], played_at, HISTORY)
        record["played_at"] = played_at.isoformat()
    record["state"] = outcome
    if not request.played:
        record["error"] = "Radio konnte den Beitrag nicht starten"
    write_json(path, record)
    return {"state": outcome}
