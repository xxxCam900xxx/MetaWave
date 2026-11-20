"""Persist topics only after a broadcast has actually started."""

import hashlib
import json
import os
import re
import unicodedata
from pathlib import Path

from scheduler import ZONE


def _keys(item):
    title = item.get("title", "") if isinstance(item, dict) else item.title
    url = item.get("url") if isinstance(item, dict) else item.url
    title = unicodedata.normalize("NFKC", title).casefold()
    title = " ".join(re.findall(r"\w+", title))
    values = [f"title:{title}"] if title else []
    if url:
        values.append(f"url:{url}")
    return {hashlib.sha256(value.encode("utf-8")).hexdigest() for value in values}


def _load(path):
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or any(
        not isinstance(day, str) or not isinstance(keys, list)
        or any(not isinstance(key, str) for key in keys)
        for day, keys in data.items()
    ):
        raise ValueError("Sprecher-History ist ungültig")
    return data


def unseen(items, target, path):
    seen = set(_load(path).get(target.astimezone(ZONE).date().isoformat(), []))
    result = []
    for item in items:
        keys = _keys(item)
        if keys and not keys.intersection(seen):
            result.append(item)
            seen.update(keys)
    return result


def mark_played(items, target, path):
    day = target.astimezone(ZONE).date().isoformat()
    history = _load(path)
    keys = set(history.get(day, []))
    for item in items:
        keys.update(_keys(item))
    history[day] = sorted(keys)
    history = dict(sorted(history.items())[-7:])
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = Path(str(path) + ".tmp")
    try:
        temp.write_text(json.dumps(history, ensure_ascii=False), encoding="utf-8")
        os.replace(temp, path)
    finally:
        temp.unlink(missing_ok=True)
