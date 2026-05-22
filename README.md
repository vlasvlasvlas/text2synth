# TEXT2SYNTH

Retro terminal voice synthesizer built with Flask, SAM-style speech synthesis, macOS `say`, and a multi-channel Web Audio engine.

TEXT2SYNTH turns typed text into voice loops, drones, delay/filter/LFO chains, and eerie note-following speech inspired by the "I Feel Fantastic" vocal texture.

![TEXT2SYNTH interface](screenshot.png)

## Features

- Up to 4 independent terminal channels.
- One shared `AudioContext` with per-channel effects chains.
- SAM 1982-style voice engine via `samtts`.
- macOS `say` voices when running locally on macOS.
- Per-channel volume, filter, delay, LFO, drone, sing wobble, and loop state.
- `VOICE MELODY` modes:
  - `WORD NOTES`: splits text into words and assigns each word a note from a scale/pattern.
  - `PHRASE BEND`: bends the whole spoken phrase through the note pattern.
- YAML-configured SAM presets, melody presets, and initial defaults.

## Requirements

- macOS for full local experience with `say` voices.
- Python 3.8+.
- Homebrew `portaudio` for `samtts` dependencies.

```bash
brew install portaudio
```

## Install

```bash
git clone https://github.com/vlasvlasvlas/text2synth.git
cd text2synth

python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Run

```bash
source venv/bin/activate
python server.py
```

Open:

```text
http://localhost:5050
```

You can override the port:

```bash
PORT=8080 python server.py
```

Enable Flask debug only when developing:

```bash
FLASK_DEBUG=1 python server.py
```

## Basic Use

1. Type text into a channel terminal.
2. Press `Enter` to synthesize and play it.
3. Use `ArrowUp` and `ArrowDown` to browse that channel's command history.
4. Use `[+]` to add up to 4 channels.
5. Click a channel or tab to make it active.
6. Adjust the sidebar; controls apply only to the active channel.

## Voice Melody

`VOICE MELODY` is the main way to make the voice follow notes instead of only wobbling around one pitch.

The sidebar separates two different pitch layers:

- `PITCH FX`: static transpose plus wobble/vibrato. It makes the voice unstable, but it does not choose notes.
- `MELODY NOTES`: the actual note-following layer. It reads `SCALE`, `ROOT`, and `STEPS` to move words or phrases through a melody.

Recommended starting point:

1. Select `SAM (1982 RETRO)`.
2. Select SAM preset `I FEEL FANTASTIC`.
3. Enable `PITCH FX -> ENABLE PITCH FX` if you want wobble.
4. Enable `MELODY NOTES -> FOLLOW NOTE PATTERN`.
5. Set `MODE` to `WORD NOTES`.
6. Try presets like `FANTASTIC MINOR`, `MINOR DESCENT`, `TRITONE`, or `OCTAVE TEST`.
7. Type `I feel fantastic hey hey hey` and press `Enter`.

When `WORD NOTES` runs, the terminal prints a short `NOTES:` trace with the cents applied to the first words. Use `OCTAVE TEST` if you need to confirm the pitch movement audibly; it intentionally uses large jumps.

Controls:

- `PRESET`: loads a configured melody preset.
- `MODE`: `WORD NOTES` for one note per word, `PHRASE BEND` for pitch automation over the full phrase.
- `SCALE`: major, minor, harmonic minor, pentatonic minor, chromatic, or whole tone.
- `ROOT`: transposes the pattern by semitone.
- `STEPS`: scale degrees or note names.
- `BPM`: note step rate for `PHRASE BEND`. `WORD NOTES` keeps natural word spacing instead of inserting BPM silence.
- `RANGE`: interval exaggeration. Higher values sound more uncanny.
- `GLIDE`: pitch smoothing time. Higher values smear notes into each other.
- `REPEAT STEPS`: loops the note pattern across long phrases.

Example `STEPS` using scale degrees:

```text
0 2 4 2 -1 0 -3 -1
```

Example `STEPS` using note names:

```text
C3 D3 Eb3 G3 F3 D3
```

## Loops

Each channel can loop independently.

1. Type a phrase and press `Enter`.
2. Enable `LOOP -> AUTO-REPEAT`.
3. Choose `SECONDS` or `BPM`.
4. Enable `CYCLE VOICES` if you want SAM presets or voices to rotate between loop ticks.

Loops preserve each channel's own engine, text, melody, effects, and volume.

## Project Structure

```text
text2synth/
├── server.py
├── config.yaml
├── requirements.txt
├── screenshot.png
├── static/
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   ├── audio-engine.js
│   ├── channel-manager.js
│   └── tts-client.js
└── README.md
```

## API

### `GET /api/config`

Returns the full YAML configuration.

### `GET /api/voices`

Returns available macOS `say` voices and SAM presets.

### `POST /api/synthesize`

Synthesizes a phrase and returns WAV audio.

SAM example:

```json
{
  "text": "I feel fantastic",
  "engine": "sam",
  "speed": 60,
  "pitch": 40,
  "mouth": 150,
  "throat": 200,
  "sing_mode": true
}
```

macOS `say` example:

```json
{
  "text": "hola mundo",
  "engine": "say",
  "voice": "Monica",
  "rate": 175
}
```

## Scaling `config.yaml`

`config.yaml` is the main way to scale the instrument without editing JavaScript.

The file currently controls:

- SAM voice presets.
- Preferred macOS `say` voices.
- Voice melody presets.
- Initial defaults for engine, phrase, volume, effects, sing, melody, and loop.

### Add a SAM Preset

Add an item under `sam_presets`.

```yaml
sam_presets:
  - id: my_voice
    name: My Voice
    speed: 80
    pitch: 50
    mouth: 140
    throat: 180
```

Parameter ranges:

- `speed`: `1-255`, lower is slower.
- `pitch`: `1-255`, lower is deeper.
- `mouth`: `1-255`, changes mouth/formant color.
- `throat`: `1-255`, changes throat/formant color.

Keep `id` stable and lowercase. The UI uses `id` internally.

### Add a Melody Preset

Add an item under `melody_presets`.

```yaml
melody_presets:
  - id: haunted_minor
    name: Haunted Minor
    mode: word
    scale: minor
    root: 0
    pattern: "0 2 4 2 -1 0 -3 -1"
    bpm: 92
    depth: 120
    glide: 0.07
```

Fields:

- `mode`: `word` or `phrase`.
- `scale`: `major`, `minor`, `harmonic_minor`, `pentatonic_minor`, `chromatic`, `whole`.
- `root`: semitone offset from C. `0=C`, `1=C#`, `2=D`, ... `11=B`.
- `pattern`: scale degrees or note names.
- `bpm`: note step rate.
- `depth`: interval multiplier in percent.
- `glide`: pitch smoothing in seconds.

Scale-degree pattern:

```yaml
pattern: "0 2 4 2 -1 0 -3 -1"
```

Note-name pattern:

```yaml
pattern: "C3 D3 Eb3 G3 F3 D3"
```

### Set Startup Defaults

Edit `defaults`.

```yaml
defaults:
  engine: sam
  preset: creepy
  default_phrase: "I FEEL FANTASTIC."
  volume: 0.8

  sing:
    enabled: false
    pitch: -200
    wobble_rate: 3.0
    wobble_depth: 150
    wobble_wave: sine

  melody:
    enabled: false
    preset: fantastic_minor
    mode: word
    scale: minor
    root: 0
    pattern: "0 2 4 2 -1 0 -3 -1"
    bpm: 92
    depth: 115
    glide: 0.06
    loop: true
```

Refresh the browser after changing frontend defaults or presets.

### Scaling Guidelines

- Keep presets short and named clearly; they become dropdown options.
- Prefer adding new presets over changing existing `id` values.
- Use `word` mode for robotic note-per-word singing.
- Use `phrase` mode for smoother pitch-bent speech and fewer backend requests.
- Keep `WORD NOTES` phrases under 32 words for best latency.
- If loops feel slow the first time, repeat them once; the frontend caches word buffers.
- For cloud hosting, avoid depending on macOS `say`; SAM works better cross-platform.

## Deployment Notes

This is not a static site. It needs the Flask backend because the browser requests WAV audio from `/api/synthesize`.

For local network use, the app binds to `0.0.0.0`.

For cloud hosts:

- Set command: `python server.py`.
- Set `PORT` if the platform does not inject it automatically.
- Expect `say` voices to fail on Linux hosts unless you add another TTS engine.
- SAM synthesis is the portable path.

## Architecture

```text
Browser terminal UI
  -> /api/synthesize
  -> Flask server
  -> SAM or macOS say WAV
  -> shared AudioContext
  -> per-channel filter/delay/LFO/drone/limiter
  -> speakers
```

Important frontend modules:

- `static/channel-manager.js`: channel state and dynamic terminal DOM.
- `static/audio-engine.js`: Web Audio graph and note/pitch scheduling.
- `static/tts-client.js`: API client and WAV decoding.
- `static/app.js`: UI binding, loops, melody, and channel synchronization.

## License

MIT
