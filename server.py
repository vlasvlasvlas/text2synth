"""
text2synth — Flask backend for retro text-to-speech synthesis.
Supports engines:
  - sam:    SAM (Software Automatic Mouth, 1982) via samtts
  - say:    macOS 'say' command (system voices)
  - espeak: eSpeak/eSpeak NG CLI
  - flite:  CMU Flite CLI
"""

import io
import os
import platform
import re
import shutil
import subprocess
import sys
import tempfile
import wave
import yaml
from flask import Flask, request, jsonify, send_from_directory, Response
from flask_cors import CORS

app = Flask(__name__, static_folder="static", static_url_path="")
CORS(app)

CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.yaml")
ENGINE_STATE = {}


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


def _attempt_install_optional_python_deps():
    """
    Install optional Python deps we can handle ourselves.
    Default enabled: TEXT2SYNTH_AUTO_INSTALL_PY=1
    """
    if os.environ.get("TEXT2SYNTH_AUTO_INSTALL_PY", "1") != "1":
        return

    try:
        import pyttsx3  # noqa: F401
    except Exception:
        try:
            run_cmd([sys.executable, "-m", "pip", "install", "pyttsx3"], timeout=90)
            print("[engine-setup] installed optional dependency: pyttsx3")
        except Exception as e:
            print(f"[engine-setup] could not install pyttsx3 automatically: {e}")


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
    espeak_bin = _which_first(["espeak-ng", "espeak"])
    flite_bin = _which_first(["flite"])

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
        "flite": {
            "id": "flite",
            "name": "FLITE (CMU)",
            "available": bool(flite_bin),
            "bin": flite_bin,
            "reason": "ok" if flite_bin else "requires flite binary",
        },
    }

    return {
        "os": system,
        "engines": engines,
        "available_engines": [eid for eid, meta in engines.items() if meta.get("available")],
    }


# ─────────────────────────────────────────────────────────────────────────────
# TTS Engine helpers
# ─────────────────────────────────────────────────────────────────────────────

def synthesize_say(text: str, voice: str = "Alex", rate: int = 175) -> bytes:
    aiff_tmp = tempfile.NamedTemporaryFile(suffix=".aiff", delete=False)
    aiff_path = aiff_tmp.name
    aiff_tmp.close()
    wav_path = aiff_path.replace(".aiff", ".wav")

    try:
        run_cmd(["say", "-v", voice, "-r", str(rate), "-o", aiff_path, "--", text], timeout=30)
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

    sam = SamTTS()
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp_path = tmp.name
    tmp.close()

    try:
        sam.save(
            text,
            tmp_path,
            speed=speed,
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
            speed=speed,
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


def synthesize_espeak(text: str, voice: str = "en", rate: int = 175, pitch: int = 50) -> bytes:
    bin_name = ENGINE_STATE.get("engines", {}).get("espeak", {}).get("bin") or "espeak-ng"
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp_path = tmp.name
    tmp.close()
    try:
        run_cmd([bin_name, "-v", voice, "-s", str(rate), "-p", str(pitch), "-w", tmp_path, text], timeout=30)
        with open(tmp_path, "rb") as f:
            return f.read()
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


def synthesize_flite(text: str, voice: str = "", rate: int = 140) -> bytes:
    bin_name = ENGINE_STATE.get("engines", {}).get("flite", {}).get("bin") or "flite"
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp_path = tmp.name
    tmp.close()

    stretch = max(0.35, min(3.0, 140.0 / max(60.0, float(rate))))
    cmd = [bin_name, "-t", text, "-o", tmp_path, "-setf", "duration_stretch", f"{stretch:.3f}"]
    if voice:
        cmd.extend(["-voice", voice])

    try:
        run_cmd(cmd, timeout=30)
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


def get_espeak_voices():
    meta = ENGINE_STATE.get("engines", {}).get("espeak", {})
    if not meta.get("available"):
        return []

    bin_name = meta.get("bin") or "espeak-ng"
    try:
        result = run_cmd([bin_name, "--voices"], timeout=8, text=True)
        voices = []
        for line in result.stdout.splitlines():
            line = line.strip()
            if not line or line.lower().startswith("pty"):
                continue
            parts = re.split(r"\s+", line)
            if len(parts) >= 4 and parts[0].isdigit():
                lang = parts[1]
                name = parts[3]
                voices.append({"id": name, "name": name, "lang": lang})
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


def get_flite_voices():
    meta = ENGINE_STATE.get("engines", {}).get("flite", {})
    if not meta.get("available"):
        return []

    bin_name = meta.get("bin") or "flite"
    try:
        result = subprocess.run([bin_name, "-lv"], capture_output=True, text=True, timeout=8)
        text_out = (result.stdout or "") + "\n" + (result.stderr or "")
        voices = []
        for line in text_out.splitlines():
            if "voices available" in line.lower():
                tail = line.split(":", 1)[-1].strip()
                for token in tail.split():
                    token = token.strip()
                    if token:
                        voices.append({"id": token, "name": token.upper(), "lang": "n/a"})
        if voices:
            return voices
        # Common fallback list
        return [
            {"id": "slt", "name": "SLT", "lang": "en_US"},
            {"id": "kal", "name": "KAL", "lang": "en_US"},
        ]
    except Exception:
        return [{"id": "slt", "name": "SLT", "lang": "en_US"}]


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
            audio = synthesize_espeak(
                text,
                voice=data.get("voice", "en"),
                rate=int(data.get("rate", 175)),
                pitch=int(data.get("pitch", 50)),
            )
        elif engine == "flite":
            audio = synthesize_flite(
                text,
                voice=data.get("voice", ""),
                rate=int(data.get("rate", 140)),
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
        "espeak": get_espeak_voices(),
        "flite": get_flite_voices(),
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
    _attempt_install_optional_python_deps()
    ENGINE_STATE = detect_engines()

    port = int(os.environ.get("PORT", 5050))
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    print("╔══════════════════════════════════════╗")
    print("║   TEXT2SYNTH — RETRO TTS SERVER      ║")
    print(f"║   http://localhost:{port:<5}              ║")
    print("╚══════════════════════════════════════╝")
    print(f"[engines] os={ENGINE_STATE['os']} available={ENGINE_STATE['available_engines']}")

    app.run(host="0.0.0.0", port=port, debug=debug)
