"""
text2synth — Flask backend for retro text-to-speech synthesis.
Supports engines:
  - sam:    SAM (Software Automatic Mouth, 1982) via samtts
  - say:    macOS 'say' command (system voices)
  - espeak: eSpeak CLI
  - espeak_ng: eSpeak NG CLI
"""

import io
import os
import platform
import re
import shutil
import subprocess
import tempfile
import wave
import yaml
from flask import Flask, request, jsonify, send_from_directory, Response
from flask_cors import CORS

app = Flask(__name__, static_folder="static", static_url_path="")
CORS(app)

CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.yaml")


def load_config():
    """Load config.yaml, return dict. Returns defaults if file missing."""
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            return yaml.safe_load(f)
    except Exception:
        return {"sam_presets": [], "say_preferred_voices": [], "defaults": {}}


CONFIG = load_config()


def run_cmd(cmd, timeout=20, text=False):
    return subprocess.run(cmd, check=True, capture_output=True, timeout=timeout, text=text)


def _which_first(candidates):
    for name in candidates:
        path = shutil.which(name)
        if path:
            return name
    return None


def detect_engines():
    """Detect available engines and binaries in current OS."""
    system = platform.system().lower()

    # SAM availability via import
    sam_available = True
    sam_error = None
    try:
        from samtts import SamTTS  # noqa: F401
    except Exception as e:
        sam_available = False
        sam_error = str(e)

    say_available = bool(shutil.which("say") and shutil.which("afconvert"))
    espeak_bin = _which_first(["espeak"])
    espeak_ng_bin = _which_first(["espeak-ng"])

    engines = {
        "sam": {
            "id": "sam",
            "name": "SAM (1982 RETRO)",
            "available": sam_available,
            "reason": "ok" if sam_available else sam_error,
        },
        "say": {
            "id": "say",
            "name": "MACOS SAY",
            "available": say_available,
            "reason": "ok" if say_available else "requires macOS say + afconvert",
        },
        "espeak": {
            "id": "espeak",
            "name": "ESPEAK (CLASSIC)",
            "available": bool(espeak_bin),
            "bin": espeak_bin,
            "reason": "ok" if espeak_bin else "requires espeak-ng or espeak binary",
        },
        "espeak_ng": {
            "id": "espeak_ng",
            "name": "ESPEAK-NG",
            "available": bool(espeak_ng_bin),
            "bin": espeak_ng_bin,
            "reason": "ok" if espeak_ng_bin else "requires espeak-ng binary",
        },
    }

    return {
        "os": system,
        "engines": engines,
        "available_engines": [eid for eid, meta in engines.items() if meta.get("available")],
    }


ENGINE_STATE = detect_engines()


# ─────────────────────────────────────────────────────────────────────────────
# TTS Engine helpers
# ─────────────────────────────────────────────────────────────────────────────

def synthesize_say(text: str, voice: str = "Alex", rate: int = 175) -> bytes:
    aiff_tmp = tempfile.NamedTemporaryFile(suffix=".aiff", delete=False)
    aiff_path = aiff_tmp.name
    aiff_tmp.close()
    wav_path = aiff_path.replace(".aiff", ".wav")

    try:
        # [[rate N]] is embedded in the text stream so macOS say applies it across
        # all sentence boundaries — without it the rate resets to voice default at each ".".
        embedded = f"[[rate {rate}]]{text}"
        run_cmd(["say", "-v", voice, "-r", str(rate), "-o", aiff_path, "--", embedded], timeout=30)
        run_cmd(["afconvert", "-f", "WAVE", "-d", "LEI16", aiff_path, wav_path], timeout=10)
        with open(wav_path, "rb") as f:
            return f.read()
    finally:
        for p in (aiff_path, wav_path):
            if os.path.exists(p):
                os.unlink(p)


def synthesize_sam(text: str, speed: int = 72, pitch: int = 64,
                   mouth: int = 128, throat: int = 128,
                   sing_mode: bool = False) -> bytes:
    from samtts import SamTTS

    # speed is UI-semantic (higher = faster); SAM raw is inverted (lower = faster)
    sam_speed = max(1, min(255, (1 + 255) - speed))

    sam = SamTTS()
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp_path = tmp.name
    tmp.close()

    try:
        sam.save(
            text,
            tmp_path,
            speed=sam_speed,
            pitch=pitch,
            mouth=mouth,
            throat=throat,
            sample_rate=22050,
            sing_mode=sing_mode,
        )

        with open(tmp_path, "rb") as f:
            return f.read()
    except Exception:
        raw = sam.get_audio_data(
            text,
            speed=sam_speed,
            pitch=pitch,
            mouth=mouth,
            throat=throat,
            sample_rate=22050,
            sing_mode=sing_mode,
        )
        wav_buffer = io.BytesIO()
        with wave.open(wav_buffer, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(1)
            wf.setframerate(22050)
            wf.writeframes(raw)
        return wav_buffer.getvalue()
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


def synthesize_espeak_bin(bin_name: str, text: str, voice: str = "en", rate: int = 175, pitch: int = 50) -> bytes:
    resolved_voice = _resolve_espeak_voice(bin_name, voice)
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp_path = tmp.name
    tmp.close()
    try:
        try:
            run_cmd([bin_name, "-v", resolved_voice, "-s", str(rate), "-p", str(pitch), "-w", tmp_path, text], timeout=30)
        except subprocess.CalledProcessError:
            # Some espeak-ng voices may be listed but fail for specific scripts/text.
            # Fallback to a stable default so the channel does not hard-fail.
            run_cmd([bin_name, "-v", "en", "-s", str(rate), "-p", str(pitch), "-w", tmp_path, text], timeout=30)
        with open(tmp_path, "rb") as f:
            return f.read()
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


def get_macos_voices():
    try:
        result = run_cmd(["say", "-v", "?"], timeout=8, text=True)
        voices = []
        for line in result.stdout.strip().split("\n"):
            if not line.strip():
                continue
            parts = line.split()
            if len(parts) >= 2:
                voices.append({"id": parts[0], "name": parts[0], "lang": parts[1]})
        return voices
    except Exception:
        return []


def get_espeak_voices(engine_key="espeak"):
    meta = ENGINE_STATE.get("engines", {}).get(engine_key, {})
    if not meta.get("available"):
        return []

    bin_name = meta.get("bin") or "espeak"
    try:
        result = run_cmd([bin_name, "--voices"], timeout=8, text=True)
        voices = []
        for line in result.stdout.splitlines():
            line = line.strip()
            if not line or line.lower().startswith("pty"):
                continue
            parts = re.split(r"\s+", line)
            if len(parts) >= 5 and parts[0].isdigit():
                lang = parts[1]
                name = parts[3]
                voices.append({"id": lang, "name": name, "lang": lang})
        # Deduplicate while preserving order
        seen = set()
        out = []
        for v in voices:
            if v["id"] in seen:
                continue
            seen.add(v["id"])
            out.append(v)
        return out
    except Exception:
        return [{"id": "en", "name": "en", "lang": "en"}]


def _resolve_espeak_voice(bin_name: str, requested: str) -> str:
    """
    Map requested voice token to a valid -v identifier.
    Accepts both Language IDs (en-us, fr-fr, etc.) and older VoiceName values
    such as English_(Shavian_alphabet).
    """
    req = (requested or "").strip()
    if not req:
        return "en"

    try:
        result = run_cmd([bin_name, "--voices"], timeout=8, text=True)
        by_lang = {}
        by_name = {}
        for line in result.stdout.splitlines():
            line = line.strip()
            if not line or line.lower().startswith("pty"):
                continue
            parts = re.split(r"\s+", line)
            if len(parts) >= 5 and parts[0].isdigit():
                lang = parts[1]
                voice_name = parts[3]
                by_lang[lang.lower()] = lang
                by_name[voice_name.lower()] = lang

        key = req.lower()
        if key in by_lang:
            return by_lang[key]
        if key in by_name:
            return by_name[key]
    except Exception:
        pass

    return req


# ─────────────────────────────────────────────────────────────────────────────
# API Routes
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return send_from_directory("static", "index.html")


@app.route("/api/synthesize", methods=["POST"])
def api_synthesize():
    data = request.get_json(force=True)
    text = data.get("text", "").strip()
    engine = data.get("engine", "sam")

    if not text:
        return jsonify({"error": "No text provided"}), 400

    available = set(ENGINE_STATE.get("available_engines", []))
    if engine not in available:
        return jsonify({"error": f"Engine '{engine}' is not available on this system"}), 400

    try:
        if engine == "say":
            audio = synthesize_say(
                text,
                voice=data.get("voice", "Alex"),
                rate=int(data.get("rate", 175)),
            )
        elif engine == "sam":
            audio = synthesize_sam(
                text,
                speed=int(data.get("speed", 72)),
                pitch=int(data.get("pitch", 64)),
                mouth=int(data.get("mouth", 128)),
                throat=int(data.get("throat", 128)),
                sing_mode=bool(data.get("sing_mode", False)),
            )
        elif engine == "espeak":
            espeak_bin = ENGINE_STATE.get("engines", {}).get("espeak", {}).get("bin") or "espeak"
            audio = synthesize_espeak_bin(
                espeak_bin,
                text,
                voice=data.get("voice", "en"),
                rate=int(data.get("rate", 175)),
                pitch=int(data.get("pitch", 50)),
            )
        elif engine == "espeak_ng":
            espeak_ng_bin = ENGINE_STATE.get("engines", {}).get("espeak_ng", {}).get("bin") or "espeak-ng"
            audio = synthesize_espeak_bin(
                espeak_ng_bin,
                text,
                voice=data.get("voice", "en"),
                rate=int(data.get("rate", 175)),
                pitch=int(data.get("pitch", 50)),
            )
        else:
            return jsonify({"error": f"Unknown engine: {engine}"}), 400

        return Response(audio, mimetype="audio/wav", headers={"Content-Disposition": "inline"})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/api/voices", methods=["GET"])
def api_voices():
    global CONFIG, ENGINE_STATE
    CONFIG = load_config()
    ENGINE_STATE = detect_engines()

    voices = {
        "say": get_macos_voices() if ENGINE_STATE["engines"]["say"]["available"] else [],
        "sam": CONFIG.get("sam_presets", []),
        "espeak": get_espeak_voices("espeak"),
        "espeak_ng": get_espeak_voices("espeak_ng"),
        "engine_meta": ENGINE_STATE["engines"],
        "available_engines": ENGINE_STATE["available_engines"],
        "os": ENGINE_STATE["os"],
    }
    return jsonify(voices)


@app.route("/api/config", methods=["GET"])
def api_config():
    global CONFIG
    CONFIG = load_config()
    return jsonify(CONFIG)


if __name__ == "__main__":
    ENGINE_STATE = detect_engines()

    port = int(os.environ.get("PORT", 5050))
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    print("╔══════════════════════════════════════╗")
    print("║   TEXT2SYNTH — RETRO TTS SERVER      ║")
    print(f"║   http://localhost:{port:<5}              ║")
    print("╚══════════════════════════════════════╝")
    print(f"[engines] os={ENGINE_STATE['os']} available={ENGINE_STATE['available_engines']}")

    app.run(host="0.0.0.0", port=port, debug=debug)
