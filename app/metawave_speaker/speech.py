"""Convert common written news notation into plain German speech."""

import re
import unicodedata


def number(value):
    units = ("null", "eins", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun",
             "zehn", "elf", "zwölf", "dreizehn", "vierzehn", "fünfzehn", "sechzehn", "siebzehn", "achtzehn", "neunzehn")
    tens = ("", "", "zwanzig", "dreissig", "vierzig", "fünfzig", "sechzig", "siebzig", "achtzig", "neunzig")
    if value < 20:
        return units[value]
    if value < 100:
        return (("ein" if value % 10 == 1 else units[value % 10]) + "und" if value % 10 else "") + tens[value // 10]
    if value < 1000:
        return ("ein" if value // 100 == 1 else units[value // 100]) + "hundert" + (number(value % 100) if value % 100 else "")
    if value < 1000000:
        return ("ein" if value // 1000 == 1 else number(value // 1000)) + "tausend" + (number(value % 1000) if value % 1000 else "")
    if value < 1000000000:
        millions = value // 1000000
        prefix = "eine Million" if millions == 1 else number(millions) + " Millionen"
        return prefix + (" " + number(value % 1000000) if value % 1000000 else "")
    return " ".join(units[int(digit)] for digit in str(value))


def _spoken_number(match):
    value = match.group()
    sign = "minus " if value.startswith("-") else "plus " if value.startswith("+") else ""
    value = value.lstrip("+-").replace("'", "").replace("’", "")
    if "," in value:
        whole, fraction = value.replace(".", "").split(",", 1)
    elif re.fullmatch(r"\d{1,3}(?:\.\d{3})+", value):
        whole, fraction = value.replace(".", ""), ""
    elif "." in value:
        parts = value.split(".")
        if len(parts) > 2:
            return sign + " Punkt ".join(number(int(part)) for part in parts)
        whole, fraction = parts
    else:
        whole, fraction = value, ""
    spoken = sign + number(int(whole))
    if fraction:
        spoken += " Komma " + " ".join(number(int(digit)) for digit in fraction)
    return spoken


def clean(text, sources=()):
    text = re.sub(r"\[([^\]]+)\]\(https?://[^)]+\)", r"\1", text)
    text = re.sub(r"https?://\S+|www\.\S+", "", text, flags=re.I)
    text = re.sub(r"\((?:quelle|quellen|via|source)\b[^)]*\)", "", text, flags=re.I)
    for source in sources:
        if source:
            text = re.sub(r"\(\s*" + re.escape(source) + r"\s*\)", "", text, flags=re.I)
    text = re.sub(r"([$€])\s*([-+]?\d+(?:[.,]\d+)?)", r"\2 \1", text)
    for pattern, replacement in (
        (r"\^SSMI\b", "der Schweizer Leitindex SMI"),
        (r"\^GDAXI\b", "der deutsche Leitindex DAX"),
        (r"\^GSPC\b", "der S und P fünfhundert"),
        (r"\bS\s*&\s*P\s*500\b", "S und P fünfhundert"),
        (r"\bKI\b", "Künstliche Intelligenz"),
        (r"\bUSA\b", "Vereinigten Staaten"),
        (r"\bz\.\s*B\.", "zum Beispiel"),
        (r"\bu\.\s*a\.", "unter anderem"),
        (r"\bUSD\b", "US Dollar"),
        (r"\bEUR\b", "Euro"),
        (r"\bkm/h\b", "Kilometer pro Stunde"),
        (r"°\s*C\b", " Grad"),
        (r"%", " Prozent"),
        (r"€", " Euro"),
        (r"\$", " Dollar"),
        (r"\bCHF\b", "Schweizer Franken"),
    ):
        text = re.sub(pattern, replacement, text, flags=re.I)
    text = re.sub(r"\b([01]?\d|2[0-3]):([0-5]\d)\b(?:\s*Uhr\b)?", lambda m:
                  ("ein" if int(m[1]) == 1 else number(int(m[1]))) + " Uhr" +
                  (" " + number(int(m[2])) if int(m[2]) else ""), text)
    text = re.sub(r"(?<=[A-Za-zÄÖÜäöü])(?=\d)|(?<=\d)(?=[A-Za-zÄÖÜäöü])", " ", text)
    text = re.sub(r"(?<![\w])[-+]?\d+(?:[.'’]\d+)*(?:,\d+)?", _spoken_number, text)
    text = re.sub(r"[*_#`~]+", "", text)
    text = re.sub(r"(?m)^\s*[-•]\s*", "", text)
    text = "".join(char for char in text if unicodedata.category(char) not in ("So", "Sk") and char not in ("\ufe0f", "\u200d"))
    text = re.sub(r"[ \t]+", " ", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()
