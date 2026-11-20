"""Broadcast format selection, based on the target's Swiss local time."""

import json
import re
from pathlib import Path

from scheduler import ZONE

DEFAULTS = json.loads((Path(__file__).parent / "formats.json").read_text(encoding="utf-8"))
WEEKDAYS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
TECH = re.compile(r"\b(tech|ki|künstliche intelligenz|software|computer|chip|internet|digital|apple|microsoft|nvidia|google|cyber|robot|smartphone)\w*", re.I)
CURIOUS = re.compile(r"\b(kurios|absurd|seltsam|ungewöhnlich|skurril|alltag|panne|rekord|witzig|überrasch|tier|katze|hund)\w*", re.I)


def planned_format(target, plan):
    local = target.astimezone(ZONE)
    selected = plan.get(WEEKDAYS[local.weekday()], {}).get(local.strftime("%H:%M"), "feierabend_lounge")
    if local.weekday() >= 5 and selected == "tech_markt_radar":
        selected = "feierabend_lounge"
    return selected


def select_program(target, plan, items):
    selected = planned_format(target, plan)
    fmt = DEFAULTS["formats"][selected]
    pattern = TECH if "tech" in fmt["focus"] else CURIOUS if "curious" in fmt["focus"] else None
    matching = [item for item in items if pattern.search(f"{item.title} {item.summary}")] if pattern else list(items)
    if not matching:
        selected = "feierabend_lounge"
        fmt = DEFAULTS["formats"][selected]
        matching = list(items)
    return selected, fmt, matching[:fmt["topics"]]
