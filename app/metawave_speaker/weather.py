"""Current weather and dated forecast from Open-Meteo."""

import json
import math
import urllib.parse
import urllib.request

DESCRIPTIONS = {
    0: "klar", 1: "überwiegend klar", 2: "teilweise bewölkt", 3: "bedeckt",
    45: "neblig", 48: "Reifnebel", 51: "leichter Nieselregen", 53: "Nieselregen",
    55: "starker Nieselregen", 56: "gefrierender Nieselregen", 57: "starker gefrierender Nieselregen",
    61: "leichter Regen", 63: "Regen", 65: "starker Regen", 66: "gefrierender Regen",
    67: "starker gefrierender Regen", 71: "leichter Schneefall", 73: "Schneefall",
    75: "starker Schneefall", 77: "Schneegriesel", 80: "leichte Regenschauer",
    81: "Regenschauer", 82: "starke Regenschauer", 85: "Schneeschauer",
    86: "starke Schneeschauer", 95: "Gewitter", 96: "Gewitter mit leichtem Hagel",
    99: "Gewitter mit starkem Hagel",
}


def fetch_weather(latitude, longitude, location, target, timeout=12):
    from scheduler import ZONE

    params = urllib.parse.urlencode({
        "latitude": latitude, "longitude": longitude, "timezone": "Europe/Zurich",
        "current": "temperature_2m,weather_code",
        "daily": "weather_code,temperature_2m_max,temperature_2m_min",
        "hourly": "temperature_2m,weather_code",
        "forecast_days": 3,
    })
    request = urllib.request.Request(
        "https://api.open-meteo.com/v1/forecast?" + params,
        headers={"User-Agent": "MetaWave-Speaker/1.0"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        data = json.load(response)
    current, daily = data["current"], data["daily"]
    day = target.astimezone(ZONE).date().isoformat()
    index = daily["time"].index(day)
    hourly = data["hourly"]
    evening = hourly["time"].index(f"{day}T18:00")
    temperatures = (current["temperature_2m"], daily["temperature_2m_min"][index],
                    daily["temperature_2m_max"][index], hourly["temperature_2m"][evening])
    if any(isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value)
           for value in temperatures):
        raise ValueError("Wetterdaten enthalten ungültige Temperaturen")
    return {
        "ort": location, "messzeit": current["time"],
        "aktuell_grad": current["temperature_2m"],
        "aktuell": DESCRIPTIONS.get(current["weather_code"], "Wetterlage unbekannt"),
        "prognose_datum": day,
        "prognose": DESCRIPTIONS.get(daily["weather_code"][index], "Wetterlage unbekannt"),
        "minimum_grad": daily["temperature_2m_min"][index],
        "maximum_grad": daily["temperature_2m_max"][index],
        "abend_zeit": hourly["time"][evening],
        "abend": DESCRIPTIONS.get(hourly["weather_code"][evening], "Wetterlage unbekannt"),
        "abend_grad": hourly["temperature_2m"][evening],
    }
