from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

TIMEZONE = ZoneInfo("Europe/Zurich")
RETRY_DELAY = timedelta(hours=1)


def should_sync(now, last_run, last_attempt):
    now = now.astimezone(TIMEZONE)
    if last_run is not None:
        success = datetime.fromtimestamp(last_run, TIMEZONE)
        if (success.year, success.month) == (now.year, now.month):
            return False
        if now.day == 1 and now.hour < 6:
            return False
    if last_attempt is not None:
        elapsed = now.timestamp() - last_attempt
        if elapsed < RETRY_DELAY.total_seconds():
            return False
    return True
