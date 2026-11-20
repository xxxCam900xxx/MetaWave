"""Lazy-loaded local Qwen3-TTS renderer."""

import logging
import os
import re
from pathlib import Path

logger = logging.getLogger(__name__)


def _chunks(text: str, max_words: int = 45) -> list[str]:
    chunks = []
    current: list[str] = []
    for sentence in re.split(r"(?<=[.!?])\s+|\n+", text.strip()):
        words = sentence.split()
        while words:
            space = max_words - len(current)
            if len(words) > space and current:
                chunks.append(" ".join(current))
                current = []
                continue
            current.extend(words[:space])
            words = words[space:]
            if len(current) == max_words:
                chunks.append(" ".join(current))
                current = []
    if current:
        chunks.append(" ".join(current))
    return chunks


def _normalize(samples):
    import numpy as np

    peak = float(np.max(np.abs(samples)))
    rms = float(np.sqrt(np.mean(np.square(samples, dtype=np.float64))))
    if not np.isfinite(peak) or not np.isfinite(rms) or peak == 0 or rms == 0:
        raise RuntimeError("Qwen TTS returned silent or invalid audio")
    gain = min(0.9 / peak, 0.18 / rms, 8.0)
    return samples * gain


class TTSEngine:
    def __init__(self) -> None:
        self.model = None

    def render(self, text: str, output: Path, speaker: str | None = None) -> float:
        return self.render_segments([(speaker or os.getenv("SPEAKER_TTS_VOICE", "Ryan"), text)], output)

    def render_segments(self, segments: list[tuple[str, str]], output: Path) -> float:
        import soundfile as sf
        import numpy as np
        import torch
        from qwen_tts import Qwen3TTSModel

        device = os.getenv("SPEAKER_TTS_DEVICE", "cpu")
        if device.startswith("cuda") and not torch.cuda.is_available():
            raise RuntimeError("CUDA wurde angefordert, ist aber nicht verfügbar")
        if device == "cpu":
            dtype = torch.float32
        elif device.startswith("cuda"):
            with torch.cuda.device(device):
                dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
        else:
            raise ValueError("SPEAKER_TTS_DEVICE muss cpu oder cuda:<index> sein")
        if self.model is None:
            model_name = os.getenv("SPEAKER_TTS_MODEL", "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice")
            logger.info("Loading Qwen TTS model %s on %s", model_name, device)
            self.model = Qwen3TTSModel.from_pretrained(
                model_name,
                device_map=device,
                dtype=dtype,
                attn_implementation="eager",
            )
        chunks = [(voice, chunk) for voice, text in segments for chunk in _chunks(text)]
        if not chunks or any(not voice for voice, _ in chunks):
            raise ValueError("Der Sprechertext ist leer")
        audio = []
        rate = None
        previous_voice = None
        for voice, chunk in chunks:
            waves, chunk_rate = self.model.generate_custom_voice(
                text=chunk,
                language="German",
                speaker=voice,
                instruct=os.getenv(
                    "SPEAKER_TTS_INSTRUCT",
                    "Sprich auf Deutsch wie ein freundlicher, natürlicher Radiomoderator: "
                    "lebendig, klar und mit entspannten Sprechpausen.",
                ),
            )
            if not waves or len(waves[0]) == 0:
                raise RuntimeError("Qwen TTS returned empty audio")
            if rate is not None and chunk_rate != rate:
                raise RuntimeError("Qwen TTS returned inconsistent sample rates")
            rate = chunk_rate
            if previous_voice is not None and previous_voice != voice:
                audio.append(np.zeros(int(rate * 0.35), dtype=np.float32))
            audio.append(waves[0])
            previous_voice = voice
        samples = _normalize(np.concatenate(audio))
        sf.write(str(output), samples, rate, format="WAV", subtype="PCM_16")
        return len(samples) / rate
