import os
import sys
import unittest
from contextlib import nullcontext
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from tts_engine import TTSEngine, _chunks, _normalize


class TTSEngineTests(unittest.TestCase):
    def test_cuda_without_bfloat16_uses_float16(self):
        torch = SimpleNamespace(
            float16="float16", float32="float32", bfloat16="bfloat16",
            cuda=SimpleNamespace(is_available=lambda: True, is_bf16_supported=lambda: False,
                                 device=lambda device: nullcontext()),
        )
        model = MagicMock()
        model.generate_custom_voice.return_value = ([[0.1] * 100], 10)
        factory = MagicMock(return_value=model)
        modules = {
            "torch": torch,
            "soundfile": SimpleNamespace(write=MagicMock()),
            "numpy": SimpleNamespace(concatenate=lambda chunks: sum(chunks, [])),
            "qwen_tts": SimpleNamespace(Qwen3TTSModel=SimpleNamespace(from_pretrained=factory)),
        }
        with patch.dict(sys.modules, modules), patch.dict(os.environ, {"SPEAKER_TTS_DEVICE": "cuda:0"}), \
                patch("tts_engine._normalize", side_effect=lambda samples: samples):
            self.assertEqual(TTSEngine().render("Test", Path("test.wav")), 10)
        self.assertEqual(factory.call_args.kwargs["dtype"], "float16")
        self.assertIn("Radiomoderator", model.generate_custom_voice.call_args.kwargs["instruct"])

    def test_unavailable_cuda_is_reported(self):
        torch = SimpleNamespace(cuda=SimpleNamespace(is_available=lambda: False))
        modules = {
            "torch": torch,
            "soundfile": SimpleNamespace(write=MagicMock()),
            "numpy": SimpleNamespace(concatenate=lambda chunks: sum(chunks, [])),
            "qwen_tts": SimpleNamespace(Qwen3TTSModel=MagicMock()),
        }
        with patch.dict(sys.modules, modules), patch.dict(os.environ, {"SPEAKER_TTS_DEVICE": "cuda:0"}):
            with self.assertRaisesRegex(RuntimeError, "CUDA"):
                TTSEngine().render("Test", Path("test.wav"))

    def test_long_text_is_split_without_losing_words(self):
        text = " ".join(f"Wort{i}" for i in range(100)) + ". Noch ein Satz."
        chunks = _chunks(text)
        self.assertGreater(len(chunks), 1)
        self.assertTrue(all(len(chunk.split()) <= 45 for chunk in chunks))
        self.assertEqual(" ".join(chunks), text)

    def test_multiple_speech_chunks_are_combined(self):
        torch = SimpleNamespace(
            float32="float32", cuda=SimpleNamespace(is_available=lambda: False),
        )
        model = MagicMock()
        model.generate_custom_voice.side_effect = [([[0.1] * 100], 10), ([[0.2] * 50], 10)]
        writer = MagicMock()
        modules = {
            "torch": torch,
            "soundfile": SimpleNamespace(write=writer),
            "numpy": SimpleNamespace(concatenate=lambda chunks: sum(chunks, [])),
            "qwen_tts": SimpleNamespace(Qwen3TTSModel=SimpleNamespace(from_pretrained=lambda *args, **kwargs: model)),
        }
        with patch.dict(sys.modules, modules), patch.dict(os.environ, {"SPEAKER_TTS_DEVICE": "cpu"}), \
                patch("tts_engine._normalize", side_effect=lambda samples: samples):
            duration = TTSEngine().render(" ".join(["Wort"] * 46), Path("test.wav"))
        self.assertEqual(duration, 15)
        self.assertEqual(model.generate_custom_voice.call_count, 2)
        self.assertEqual(len(writer.call_args.args[1]), 150)

    def test_normalization_boosts_quiet_speech_without_clipping(self):
        try:
            import numpy as np
        except ImportError:
            self.skipTest("numpy is available in the Speaker container")
        samples = np.array([0.05, -0.05, 0.1, -0.1], dtype=np.float32)
        louder = _normalize(samples)
        self.assertGreater(float(np.sqrt(np.mean(louder ** 2))), float(np.sqrt(np.mean(samples ** 2))))
        self.assertLessEqual(float(np.max(np.abs(louder))), 0.9 + 1e-6)
        with self.assertRaises(RuntimeError):
            _normalize(np.zeros(10, dtype=np.float32))


if __name__ == "__main__":
    unittest.main()
