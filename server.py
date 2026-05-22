"""
text2synth — Flask backend for retro text-to-speech synthesis.
Supports engines:
  - sam:  SAM (Software Automatic Mouth, 1982) via samtts
  - say:  macOS 'say' command (system voices, multi-language)
"""

import io
import os
import subprocess
import tempfile
import wave
import yaml
from flask import Flask, request, jsonify, send_from_directory, Response
from flask_cors import CORS

app = Flask(__name__, static_folder="static", static_url_path="")
CORS(app)

# ---------------------------------------------------------------------------
# Load configuration from YAML
# ---------------------------------------------------------------------------

CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.yaml")

def load_config():
    """Load config.yaml, return dict. Returns defaults if file missing."""
    try:
        with open(CONFIG_PATH, "r") as f:
            return yaml.safe_load(f)
    except Exception:
        return {"sam_presets": [], "say_preferred_voices": [], "defaults": {}}

CONFIG = load_config()

# ---------------------------------------------------------------------------
# TTS Engine helpers
# ---------------------------------------------------------------------------

def synthesize_say(text: str, voice: str = "Alex", rate: int = 175) -> bytes:
    """
    Synthesize speech using macOS 'say' command.
    Converts AIFF output to WAV for browser compatibility.
    Returns WAV bytes.
    """
    aiff_tmp = tempfile.NamedTemporaryFile(suffix=".aiff", delete=False)
    aiff_path = aiff_tmp.name
    aiff_tmp.close()
    wav_path = aiff_path.replace(".aiff", ".wav")

    try:
        cmd = ["say", "-v", voice, "-r", str(rate), "-o", aiff_path, "--", text]
        subprocess.run(cmd, check=True, capture_output=True, timeout=30)

        subprocess.run(
            ["afconvert", "-f", "WAVE", "-d", "LEI16", aiff_path, wav_path],
            check=True, capture_output=True, timeout=10
        )

        with open(wav_path, "rb") as f:
            return f.read()
    finally:
        for p in (aiff_path, wav_path):
            if os.path.exists(p):
                os.unlink(p)


def synthesize_sam(text: str, speed: int = 72, pitch: int = 64,
                   mouth: int = 128, throat: int = 128,
                   sing_mode: bool = False) -> bytes:
    """
    Synthesize speech using SAM (Software Automatic Mouth, 1982).
    Returns WAV bytes.
    """
    from samtts import SamTTS

    sam = SamTTS()

    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp_path = tmp.name
    tmp.close()

    try:
        sam.save(text, tmp_path, speed=speed, pitch=pitch,
                 mouth=mouth, throat=throat, sample_rate=22050,
                 sing_mode=sing_mode)

        with open(tmp_path, "rb") as f:
            return f.read()
    except Exception:
        # Fallback: get raw audio data and wrap in WAV
        raw = sam.get_audio_data(text, speed=speed, pitch=pitch,
                                mouth=mouth, throat=throat, sample_rate=22050,
                                sing_mode=sing_mode)
        wav_buffer = io.BytesIO()
        with wave.open(wav_buffer, 'wb') as wf:
            wf.setnchannels(1)
            wf.setsampwidth(1)
            wf.setframerate(22050)
            wf.writeframes(raw)
        return wav_buffer.getvalue()
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


def get_macos_voices():
    """Parse macOS 'say -v ?' output to list available voices."""
    try:
        result = subprocess.run(["say", "-v", "?"], capture_output=True,
                                text=True, timeout=5)
        voices = []
        for line in result.stdout.strip().split("\n"):
            if not line.strip():
                continue
            # Format: "Alex                en_US    # Most people recognize me..."
            # Split on multiple spaces to separate name from locale
            parts = line.split()
            if len(parts) >= 2:
                name = parts[0]
                lang = parts[1]
                voices.append({"id": name, "name": name, "lang": lang})
        return voices
    except Exception:
        return [{"id": "Alex", "name": "Alex", "lang": "en_US"}]


# ---------------------------------------------------------------------------
# API Routes
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return send_from_directory("static", "index.html")


@app.route("/api/synthesize", methods=["POST"])
def api_synthesize():
    """
    POST JSON: { text, engine, ... }
    Returns binary WAV audio.
    """
    data = request.get_json(force=True)
    text = data.get("text", "").strip()
    engine = data.get("engine", "sam")

    if not text:
        return jsonify({"error": "No text provided"}), 400

    try:
        if engine == "say":
            voice = data.get("voice", "Alex")
            rate = int(data.get("rate", 175))
            audio = synthesize_say(text, voice=voice, rate=rate)

        elif engine == "sam":
            speed = int(data.get("speed", 72))
            pitch = int(data.get("pitch", 64))
            mouth = int(data.get("mouth", 128))
            throat = int(data.get("throat", 128))
            sing_mode = bool(data.get("sing_mode", False))
            audio = synthesize_sam(text, speed=speed, pitch=pitch,
                                   mouth=mouth, throat=throat,
                                   sing_mode=sing_mode)
        else:
            return jsonify({"error": f"Unknown engine: {engine}"}), 400

        return Response(audio, mimetype="audio/wav",
                        headers={"Content-Disposition": "inline"})

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/api/voices", methods=["GET"])
def api_voices():
    """List available voices for each engine (loaded from config.yaml)."""
    global CONFIG
    CONFIG = load_config()  # Reload on each request for live editing

    voices = {"say": [], "sam": []}

    # macOS system voices
    voices["say"] = get_macos_voices()

    # SAM presets from YAML
    voices["sam"] = CONFIG.get("sam_presets", [])

    return jsonify(voices)


@app.route("/api/config", methods=["GET"])
def api_config():
    """Return full config for frontend initialization."""
    global CONFIG
    CONFIG = load_config()
    return jsonify(CONFIG)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5050))
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    print("╔══════════════════════════════════════╗")
    print("║   TEXT2SYNTH — RETRO TTS SERVER      ║")
    print(f"║   http://localhost:{port:<5}              ║")
    print("╚══════════════════════════════════════╝")
    app.run(host="0.0.0.0", port=port, debug=debug)
