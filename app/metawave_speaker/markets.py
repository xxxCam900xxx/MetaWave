"""Retrieve last available market prices and comparable prior closes."""

import json
import logging
import math
import urllib.parse
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo
from scheduler import ZONE

logger = logging.getLogger(__name__)

DEFAULT_WATCHLIST = [
    {"symbol": "^SSMI", "name": "Schweizer Leitindex SMI"},
    {"symbol": "^GDAXI", "name": "DAX"},
    {"symbol": "^GSPC", "name": "S und P 500"},
    {"symbol": "NVDA", "name": "Nvidia"},
    {"symbol": "AAPL", "name": "Apple"},
    {"symbol": "MSFT", "name": "Microsoft"},
    {"symbol": "BTC-USD", "name": "Bitcoin"},
]


def fetch_quote(symbol, name, timeout=8):
    url = "https://query1.finance.yahoo.com/v8/finance/chart/" + urllib.parse.quote(symbol, safe="") + "?range=5d&interval=1d"
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 MetaWave-Speaker/1.0"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        result = json.load(response)["chart"]["result"][0]
    meta = result["meta"]
    price = float(meta["regularMarketPrice"])
    timestamp = int(meta["regularMarketTime"])
    zone = ZoneInfo(meta["exchangeTimezoneName"])
    trade_date = datetime.fromtimestamp(timestamp, zone).date()
    closes = result["indicators"]["quote"][0]["close"]
    previous = [
        float(close) for instant, close in zip(result["timestamp"], closes)
        if close is not None and datetime.fromtimestamp(instant, zone).date() < trade_date
        and math.isfinite(float(close)) and float(close) > 0
    ]
    if not previous or not math.isfinite(price) or price <= 0:
        raise ValueError(f"Kein gültiger Vergleichskurs für {symbol}")
    prior = previous[-1]
    return {
        "name": name, "preis": price, "waehrung": meta["currency"],
        "vorheriger_schluss": prior, "veraenderung_prozent": round((price / prior - 1) * 100, 2),
        "kurszeit_utc": datetime.fromtimestamp(timestamp, ZoneInfo("UTC")).isoformat(),
        "kurszeit_schweiz": datetime.fromtimestamp(timestamp, ZONE).strftime("%d.%m.%Y %H:%M"),
    }


def fetch_markets(watchlist):
    quotes = []
    for item in watchlist:
        try:
            quotes.append(fetch_quote(item["symbol"], item["name"]))
        except (OSError, ValueError, KeyError, TypeError, IndexError) as exc:
            logger.warning("Marktdaten für %s nicht verfügbar: %s", item["symbol"], exc)
    return quotes
