"""Time calculations for daily broadcasts in the configured local timezone."""

from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

UTC = timezone.utc
ZONE = ZoneInfo("Europe/Zurich")


def broadcasts(times: list[str], start: datetime, days: int = 3) -> list[datetime]:
    """Return UTC broadcast instants, skipping nonexistent local DST times.

    On the autumn clock change, the first occurrence of an ambiguous time is used.
    """
    if start.tzinfo is None or start.utcoffset() is None:
        raise ValueError("start must be timezone-aware")
    local_day = start.astimezone(ZONE).date()
    result = []
    for offset in range(days):
        day = local_day + timedelta(days=offset)
        for value in times:
            local = datetime.combine(day, time.fromisoformat(value), ZONE)
            instant = local.astimezone(UTC)
            if instant.astimezone(ZONE).replace(tzinfo=None) == local.replace(tzinfo=None):
                result.append(instant)
    return sorted(set(result))


def next_events(times: list[str], now: datetime) -> tuple[datetime | None, datetime | None]:
    """Return the next preparation and broadcast in UTC."""
    now = now.astimezone(UTC)
    candidates = broadcasts(times, now)
    air = next((target for target in candidates if target > now), None)
    prepare = next((target - timedelta(hours=1) for target in candidates
                    if target - timedelta(hours=1) > now), None)
    return prepare, air
