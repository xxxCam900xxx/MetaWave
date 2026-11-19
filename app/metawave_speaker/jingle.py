"""Add a short, locally generated news ident to a mono PCM WAV."""

import math
import os
import sys
import wave
from array import array
from pathlib import Path


def _ident(rate: int, frequencies: tuple[float, ...]) -> bytes:
    samples = array("h")
    note_length = round(rate * 0.22)
    gap = round(rate * 0.025)
    for frequency in frequencies:
        for index in range(note_length):
            envelope = min(1.0, index / (rate * 0.015), (note_length - index) / (rate * 0.04))
            angle = 2 * math.pi * frequency * index / rate
            samples.append(round(5200 * envelope * (math.sin(angle) + 0.2 * math.sin(2 * angle)) / 1.2))
        samples.extend([0] * gap)
    samples.extend([0] * round(rate * 0.25))
    if sys.byteorder != "little":
        samples.byteswap()
    return samples.tobytes()


def add_jingles(path: Path) -> float:
    with wave.open(str(path), "rb") as source:
        if source.getnchannels() != 1 or source.getsampwidth() != 2 or source.getcomptype() != "NONE":
            raise ValueError("Speaker-Audio muss eine unkomprimierte Mono-PCM-WAV-Datei sein")
        rate = source.getframerate()
        speech = source.readframes(source.getnframes())
    intro = _ident(rate, (523.25, 659.25, 783.99, 1046.50))
    outro = _ident(rate, (783.99, 659.25, 523.25))
    temp = path.with_name(path.name + ".jingle")
    try:
        with wave.open(str(temp), "wb") as target:
            target.setnchannels(1)
            target.setsampwidth(2)
            target.setframerate(rate)
            target.writeframes(intro + speech + outro)
        os.replace(temp, path)
    finally:
        temp.unlink(missing_ok=True)
    return (len(intro) + len(speech) + len(outro)) / (2 * rate)
