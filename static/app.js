/* ═══════════════════════════════════════════════════════════
   app.js — Multi-channel controller for TEXT2SYNTH
   ═══════════════════════════════════════════════════════════ */
(function () {
    'use strict';
    const tts = window.ttsClient;
    const chMgr = window.channelManager;
    const sidebar = document.getElementById('sidebar');
    const pitchFxDetails = document.getElementById('pitch-fx-details');
    const melodyTimingDetails = document.getElementById('melody-timing-details');
    const advancedFxDetails = document.getElementById('advanced-fx-details');

    // Sidebar DOM refs
    const engineRadios = document.querySelectorAll('input[name="engine"]');
    const samParams = document.getElementById('sam-params');
    const sayParams = document.getElementById('say-params');
    const espeakParams = document.getElementById('espeak-params');
    const espeakNgParams = document.getElementById('espeak-ng-params');
    const samPreset = document.getElementById('sam-preset');
    const samSpeed = document.getElementById('sam-speed');
    const samPitch = document.getElementById('sam-pitch');
    const samMouth = document.getElementById('sam-mouth');
    const samThroat = document.getElementById('sam-throat');
    const sayVoice = document.getElementById('say-voice');
    const sayRate = document.getElementById('say-rate');
    const espeakVoice = document.getElementById('espeak-voice');
    const espeakRate = document.getElementById('espeak-rate');
    const espeakPitch = document.getElementById('espeak-pitch');
    const espeakNgVoice = document.getElementById('espeak-ng-voice');
    const espeakNgRate = document.getElementById('espeak-ng-rate');
    const espeakNgPitch = document.getElementById('espeak-ng-pitch');
    const channelVolume = document.getElementById('channel-volume');
    const singEnabled = document.getElementById('sing-enabled');
    const singPitch = document.getElementById('sing-pitch');
    const singWobbleRate = document.getElementById('sing-wobble-rate');
    const singWobbleDepth = document.getElementById('sing-wobble-depth');
    const singWobbleWave = document.getElementById('sing-wobble-wave');
    const melodyEnabled = document.getElementById('melody-enabled');
    const melodyCleanNotes = document.getElementById('melody-clean-notes');
    const melodyPreset = document.getElementById('melody-preset');
    const melodyMode = document.getElementById('melody-mode');
    const melodyScale = document.getElementById('melody-scale');
    const melodyRoot = document.getElementById('melody-root');
    const melodyPattern = document.getElementById('melody-pattern');
    const melodyAutoNoteView = document.getElementById('melody-auto-note-view');
    const melodyNotesPreview = document.getElementById('melody-notes-preview');
    const melodyBpm = document.getElementById('melody-bpm');
    const melodyDepth = document.getElementById('melody-depth');
    const melodyGlide = document.getElementById('melody-glide');
    const melodyLoop = document.getElementById('melody-loop');
    const filterType = document.getElementById('filter-type');
    const filterCutoff = document.getElementById('filter-cutoff');
    const filterResonance = document.getElementById('filter-resonance');
    const lfoEnabled = document.getElementById('lfo-enabled');
    const lfoRate = document.getElementById('lfo-rate');
    const lfoDepth = document.getElementById('lfo-depth');
    const lfoWave = document.getElementById('lfo-wave');
    const lfoTarget = document.getElementById('lfo-target');
    const delayEnabled = document.getElementById('delay-enabled');
    const delayTime = document.getElementById('delay-time');
    const delayFeedback = document.getElementById('delay-feedback');
    const delayMix = document.getElementById('delay-mix');
    const droneEnabled = document.getElementById('drone-enabled');
    const droneWave = document.getElementById('drone-wave');
    const droneNote = document.getElementById('drone-note');
    const droneFreq = document.getElementById('drone-freq');
    const droneDetune = document.getElementById('drone-detune');
    const droneVoices = document.getElementById('drone-voices');
    const droneVolume = document.getElementById('drone-volume');
    const loopEnabled = document.getElementById('loop-enabled');
    const loopMode = document.getElementById('loop-mode');
    const loopInterval = document.getElementById('loop-interval');
    const loopBpm = document.getElementById('loop-bpm');
    const loopSecsRow = document.getElementById('loop-secs-row');
    const loopBpmRow = document.getElementById('loop-bpm-row');
    const loopCycle = document.getElementById('loop-cycle');

    let SAM_PRESETS = {};
    const ENGINE_NAMES = {
        sam: 'SAM (1982 RETRO)',
        say: 'MACOS SAY',
        espeak: 'ESPEAK (CLASSIC)',
        espeak_ng: 'ESPEAK-NG'
    };
    let AVAILABLE_ENGINES = ['sam'];
    let applyingMelodyPreset = false;
    const AUDIO_BUFFER_CACHE = new Map();
    const MAX_WORD_MELODY_TOKENS = 32;
    const MAX_BUFFER_CACHE_ITEMS = 96;
    const WORD_MELODY_GAP_SEC = 0.018;
    const WORD_MELODY_TRIM_THRESHOLD = 0.006;
    const WORD_MELODY_TRIM_PAD_SEC = 0.012;
    const SAM_SPEED_MIN = 1;
    const SAM_SPEED_MAX = 255;
    let MELODY_PRESETS = {
        fantastic_minor: { mode: 'word', scale: 'minor', root: 0, pattern: '0 2 4 2 -1 0 -3 -1', bpm: 92, depth: 115, glide: 0.06 },
        minor_descent: { mode: 'word', scale: 'minor', root: 0, pattern: '6 5 4 2 1 0 -2 -1', bpm: 78, depth: 125, glide: 0.075 },
        major_rise: { mode: 'word', scale: 'major', root: 0, pattern: '0 1 2 4 5 4 2 1', bpm: 110, depth: 95, glide: 0.035 },
        pentatonic: { mode: 'word', scale: 'pentatonic_minor', root: 0, pattern: '0 1 2 3 2 1 0 -1', bpm: 104, depth: 105, glide: 0.045 },
        tritone: { mode: 'word', scale: 'chromatic', root: 0, pattern: '0 3 6 5 3 0 -2 1', bpm: 88, depth: 135, glide: 0.08 },
        octave_test: { mode: 'word', scale: 'chromatic', root: 0, pattern: '0 7 12 7 0 -5 -12 -5', bpm: 95, depth: 100, glide: 0 }
    };

    // ─── Helpers ─────────────────────────────────────────────
    function bindSlider(slider, valId, dec) {
        const fn = () => { const s = document.getElementById(valId); if (s) s.textContent = parseFloat(slider.value).toFixed(dec); };
        slider.addEventListener('input', fn); fn();
    }

    function clampSamSpeed(v) {
        const n = Number(v) || SAM_SPEED_MIN;
        return Math.max(SAM_SPEED_MIN, Math.min(SAM_SPEED_MAX, Math.round(n)));
    }

    // config.yaml stores raw SAM speed values (lower raw = faster).
    // Convert to UI-semantic speed (higher = faster) when loading presets.
    function samConfigToUiSpeed(rawSpeed) {
        return (SAM_SPEED_MIN + SAM_SPEED_MAX) - clampSamSpeed(rawSpeed);
    }

    function ensureSelectValue(selectEl, preferredValue = '') {
        if (!selectEl || !selectEl.options || selectEl.options.length === 0) return '';
        const wanted = String(preferredValue ?? '');
        const hasWanted = Array.from(selectEl.options).some(o => o.value === wanted);
        if (hasWanted) {
            selectEl.value = wanted;
            return wanted;
        }
        const fallback = selectEl.options[0].value;
        selectEl.value = fallback;
        return fallback;
    }

    function melodyScaleSteps(scaleName) {
        const scales = {
            major: [0, 2, 4, 5, 7, 9, 11],
            minor: [0, 2, 3, 5, 7, 8, 10],
            harmonic_minor: [0, 2, 3, 5, 7, 8, 11],
            pentatonic_minor: [0, 3, 5, 7, 10],
            chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
            whole: [0, 2, 4, 6, 8, 10]
        };
        return scales[scaleName] || scales.minor;
    }

    function degreeToSemitone(degree, scaleName) {
        const scale = melodyScaleSteps(scaleName);
        const octave = Math.floor(degree / scale.length);
        const idx = degree - octave * scale.length;
        return scale[idx] + octave * 12;
    }

    function noteNameToSemitone(token) {
        const m = token.match(/^([a-gA-G])([#b]?)(-?\d+)?$/);
        if (!m) return null;
        const base = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[m[1].toLowerCase()];
        const accidental = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
        const octave = m[3] === undefined ? 4 : Number(m[3]);
        return base + accidental + (octave - 4) * 12;
    }

    function semitoneToNoteName(semitone) {
        const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const m = ((Math.round(semitone) % 12) + 12) % 12;
        return names[m];
    }

    function tokenToNoteName(token, root, scale) {
        if (/^(r|rest|hold|-)$/i.test(token)) return 'REST';
        if (/^-?\d+$/.test(token)) return semitoneToNoteName(root + degreeToSemitone(Number(token), scale));
        const named = noteNameToSemitone(token);
        return Number.isFinite(named) ? semitoneToNoteName(named) : null;
    }

    function renderMelodyPatternView() {
        if (!melodyAutoNoteView || !melodyPattern) return;
        if (!melodyPattern.dataset.rawSteps) melodyPattern.dataset.rawSteps = melodyPattern.value || '';

        if (!melodyAutoNoteView.checked) {
            melodyPattern.readOnly = false;
            melodyPattern.value = melodyPattern.dataset.rawSteps || melodyPattern.value;
            return;
        }

        const raw = melodyPattern.dataset.rawSteps || '';
        const tokens = raw.split(/[\s,]+/).map(t => t.trim()).filter(Boolean);
        if (!tokens.length) return;

        const root = Number(melodyRoot.value) || 0;
        const scale = melodyScale.value;
        const notes = tokens.map(t => tokenToNoteName(t, root, scale)).filter(Boolean);
        if (notes.length) {
            melodyPattern.value = notes.join(' ');
            melodyPattern.readOnly = true;
        }
    }

    function updateMelodyPreview() {
        if (!melodyNotesPreview) return;
        const sourcePattern = (melodyAutoNoteView && melodyAutoNoteView.checked && melodyPattern.dataset.rawSteps)
            ? melodyPattern.dataset.rawSteps
            : melodyPattern.value;
        const tokens = (sourcePattern || '').split(/[\s,]+/).map(t => t.trim()).filter(Boolean).slice(0, 12);
        if (!tokens.length) {
            melodyNotesPreview.textContent = 'NOTES PREVIEW: (empty)';
            melodyScale.disabled = false;
            melodyScale.title = '';
            melodyScale.style.opacity = '1';
            return;
        }

        const root = Number(melodyRoot.value) || 0;
        const scale = melodyScale.value;
        const notes = [];
        let hasNumeric = false;
        let hasNamed = false;

        for (const token of tokens) {
            if (/^(r|rest|hold|-)$/i.test(token)) {
                notes.push('REST');
                continue;
            }
            let semitone = null;
            if (/^-?\d+$/.test(token)) {
                hasNumeric = true;
                semitone = root + degreeToSemitone(Number(token), scale);
            } else {
                hasNamed = true;
                semitone = noteNameToSemitone(token);
            }
            if (Number.isFinite(semitone)) notes.push(semitoneToNoteName(semitone));
        }

        if (hasNamed && !hasNumeric) {
            melodyScale.disabled = true;
            melodyScale.title = 'SCALE does not apply when using explicit note names in MELODY STEPS';
            melodyScale.style.opacity = '0.55';
            melodyNotesPreview.textContent = `NOTES PREVIEW (ABSOLUTE NOTES): ${notes.join(' ') || '(invalid pattern)'}`;
            return;
        }

        melodyScale.disabled = false;
        melodyScale.title = '';
        melodyScale.style.opacity = '1';
        melodyNotesPreview.textContent = `NOTES PREVIEW (SCALE-BASED): ${notes.join(' ') || '(invalid pattern)'}`;
    }

    function updateEngineParamVisibility(engine) {
        samParams.classList.toggle('hidden', engine !== 'sam');
        sayParams.classList.toggle('hidden', engine !== 'say');
        espeakParams.classList.toggle('hidden', engine !== 'espeak');
        espeakNgParams.classList.toggle('hidden', engine !== 'espeak_ng');
    }

    // ─── Save sidebar state TO active channel ────────────────
    function saveToChannel() {
        const ch = chMgr.getActive(); if (!ch) return;
        ch.engine = document.querySelector('input[name="engine"]:checked')?.value || 'sam';
        ch.presetId = samPreset.value;
        ch.engineParams = { speed: +samSpeed.value, pitch: +samPitch.value, mouth: +samMouth.value, throat: +samThroat.value };
        ch.sayVoice = sayVoice.value;
        ch.sayRate = +sayRate.value;
        ch.espeakVoice = espeakVoice.value;
        ch.espeakRate = +espeakRate.value;
        ch.espeakPitch = +espeakPitch.value;
        ch.espeakNgVoice = espeakNgVoice.value;
        ch.espeakNgRate = +espeakNgRate.value;
        ch.espeakNgPitch = +espeakNgPitch.value;
        ch.volume = +channelVolume.value;
        ch.sing = { enabled: singEnabled.checked, pitch: +singPitch.value, wobbleRate: +singWobbleRate.value, wobbleDepth: +singWobbleDepth.value, wobbleWave: singWobbleWave.value };
        const melodyPatternRaw = (melodyPattern && melodyPattern.dataset && melodyPattern.dataset.rawSteps)
            ? melodyPattern.dataset.rawSteps
            : melodyPattern.value;
        ch.melody = { enabled: melodyEnabled.checked, mode: melodyMode.value, preset: melodyPreset.value, scale: melodyScale.value, root: +melodyRoot.value, pattern: melodyPatternRaw, bpm: +melodyBpm.value, depth: +melodyDepth.value, glide: +melodyGlide.value, loop: melodyLoop.checked };
        ch.filter = { type: filterType.value, cutoff: +filterCutoff.value, resonance: +filterResonance.value };
        ch.delay = { enabled: delayEnabled.checked, time: +delayTime.value, feedback: +delayFeedback.value, mix: +delayMix.value };
        ch.lfo = { enabled: lfoEnabled.checked, rate: +lfoRate.value, depth: +lfoDepth.value, wave: lfoWave.value, target: lfoTarget.value };
        ch.drone = { enabled: droneEnabled.checked, wave: droneWave.value, freq: +droneFreq.value, detune: +droneDetune.value, voices: +droneVoices.value, volume: +droneVolume.value };
        ch.loop.mode = loopMode.value;
        ch.loop.interval = +loopInterval.value;
        ch.loop.bpm = +loopBpm.value;
        ch.loop.cycleVoices = loopCycle.checked;
        ch.loop.enabled = loopEnabled.checked;
    }

    // ─── Load channel state INTO sidebar ─────────────────────
    function loadFromChannel(ch) {
        if (!ch) return;
        // Engine
        engineRadios.forEach(r => { r.checked = r.value === ch.engine; });
        updateEngineParamVisibility(ch.engine);
        // SAM
        samPreset.value = ch.presetId;
        samSpeed.value = ch.engineParams.speed; samPitch.value = ch.engineParams.pitch;
        samMouth.value = ch.engineParams.mouth; samThroat.value = ch.engineParams.throat;
        // Say
        ch.sayVoice = ensureSelectValue(sayVoice, ch.sayVoice);
        sayRate.value = ch.sayRate;
        // eSpeak
        ch.espeakVoice = ensureSelectValue(espeakVoice, ch.espeakVoice || 'en');
        espeakRate.value = ch.espeakRate || 175;
        espeakPitch.value = ch.espeakPitch ?? 50;
        // eSpeak NG
        ch.espeakNgVoice = ensureSelectValue(espeakNgVoice, ch.espeakNgVoice || 'en');
        espeakNgRate.value = ch.espeakNgRate || 175;
        espeakNgPitch.value = ch.espeakNgPitch ?? 50;
        // Channel
        channelVolume.value = ch.volume ?? 0.8;
        // Sing
        singEnabled.checked = ch.sing.enabled; singPitch.value = ch.sing.pitch;
        singWobbleRate.value = ch.sing.wobbleRate; singWobbleDepth.value = ch.sing.wobbleDepth;
        singWobbleWave.value = ch.sing.wobbleWave;
        if (melodyCleanNotes) melodyCleanNotes.checked = !ch.sing.enabled;
        if (pitchFxDetails && ch.sing.enabled) pitchFxDetails.open = true;
        // Melody
        melodyEnabled.checked = ch.melody.enabled; melodyMode.value = ch.melody.mode || 'word'; melodyPreset.value = ch.melody.preset;
        melodyScale.value = ch.melody.scale; melodyRoot.value = ch.melody.root;
        melodyPattern.value = ch.melody.pattern;
        melodyPattern.dataset.rawSteps = ch.melody.pattern;
        melodyBpm.value = ch.melody.bpm;
        melodyDepth.value = ch.melody.depth; melodyGlide.value = ch.melody.glide;
        melodyLoop.checked = ch.melody.loop;
        if (melodyTimingDetails && ch.melody.mode === 'phrase') melodyTimingDetails.open = true;
        // Filter
        filterType.value = ch.filter.type; filterCutoff.value = ch.filter.cutoff; filterResonance.value = ch.filter.resonance;
        // Delay
        delayEnabled.checked = ch.delay.enabled; delayTime.value = ch.delay.time;
        delayFeedback.value = ch.delay.feedback; delayMix.value = ch.delay.mix;
        // LFO
        lfoEnabled.checked = ch.lfo.enabled; lfoRate.value = ch.lfo.rate;
        lfoDepth.value = ch.lfo.depth; lfoWave.value = ch.lfo.wave; lfoTarget.value = ch.lfo.target;
        // Drone
        droneEnabled.checked = ch.drone.enabled; droneWave.value = ch.drone.wave;
        droneFreq.value = ch.drone.freq; droneDetune.value = ch.drone.detune;
        droneVoices.value = ch.drone.voices; droneVolume.value = ch.drone.volume;
        droneNote.value = Array.from(droneNote.options).reduce((best, opt) =>
            Math.abs(parseFloat(opt.value) - ch.drone.freq) < Math.abs(parseFloat(best.value) - ch.drone.freq) ? opt : best
        ).value;
        if (advancedFxDetails && (ch.delay.enabled || ch.lfo.enabled || ch.drone.enabled)) advancedFxDetails.open = true;
        // Loop
        loopEnabled.checked = ch.loop.enabled; loopMode.value = ch.loop.mode;
        loopInterval.value = ch.loop.interval; loopBpm.value = ch.loop.bpm;
        loopCycle.checked = ch.loop.cycleVoices;
        loopSecsRow.classList.toggle('hidden', ch.loop.mode === 'bpm');
        loopBpmRow.classList.toggle('hidden', ch.loop.mode !== 'bpm');
        // Update all slider displays — guard flag prevents melody listeners from resetting preset to 'custom'
        applyingMelodyPreset = true;
        document.querySelectorAll('.term-slider').forEach(s => s.dispatchEvent(new Event('input')));
        applyingMelodyPreset = false;
        renderMelodyPatternView();
        updateMelodyPreview();
    }

    // ─── Apply audio state to channel engine ─────────────────
    function applyAudioState(ch) {
        const ae = ch.audioEngine; if (!ae) return;
        ae.setChannelVolume(ch.volume ?? 0.8);
        ae.setFilterType(ch.filter.type);
        ae.setFilterCutoff(ch.filter.cutoff);
        ae.setFilterResonance(ch.filter.resonance);
        ae.setDelayEnabled(ch.delay.enabled);
        ae.setDelayTime(ch.delay.time);
        ae.setDelayFeedback(ch.delay.feedback);
        ae.setDelayMix(ch.delay.mix);
        ae.setLFOEnabled(ch.lfo.enabled);
        ae.setLFORate(ch.lfo.rate);
        ae.setLFODepth(ch.lfo.depth);
        ae.setLFOWave(ch.lfo.wave);
        ae.setLFOTarget(ch.lfo.target);
        ae.setSingEnabled(ch.sing.enabled);
        ae.setSingPitch(ch.sing.pitch);
        ae.setSingWobbleRate(ch.sing.wobbleRate);
        ae.setSingWobbleDepth(ch.sing.wobbleDepth);
        ae.setSingWobbleWave(ch.sing.wobbleWave);
        ae.setMelodyEnabled(ch.melody.enabled);
        ae.setMelodyMode(ch.melody.mode);
        ae.setMelodyScale(ch.melody.scale);
        ae.setMelodyRoot(ch.melody.root);
        ae.setMelodyPattern(ch.melody.pattern);
        ae.setMelodyBpm(ch.melody.bpm);
        ae.setMelodyDepth(ch.melody.depth);
        ae.setMelodyGlide(ch.melody.glide);
        ae.setMelodyLoop(ch.melody.loop);
        ae.setDroneEnabled(ch.drone.enabled);
        ae.setDroneWave(ch.drone.wave);
        ae.setDroneFreq(ch.drone.freq);
        ae.setDroneDetune(ch.drone.detune);
        ae.setDroneVoices(ch.drone.voices);
        ae.setDroneVolume(ch.drone.volume);
    }

    function loadMelodyPresets(presets) {
        if (!Array.isArray(presets) || presets.length === 0) return;

        MELODY_PRESETS = {};
        melodyPreset.innerHTML = '';
        presets.forEach(p => {
            MELODY_PRESETS[p.id] = {
                mode: p.mode || 'word',
                scale: p.scale || 'minor',
                root: Number(p.root) || 0,
                pattern: p.pattern || '0 2 4 2 -1 0 -3 -1',
                bpm: Number(p.bpm) || 92,
                depth: Number(p.depth) || 100,
                glide: Number(p.glide) || 0.06
            };
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = (p.name || p.id).toUpperCase();
            melodyPreset.appendChild(opt);
        });

        const custom = document.createElement('option');
        custom.value = 'custom';
        custom.textContent = 'CUSTOM';
        melodyPreset.appendChild(custom);
    }

    function applyConfigDefaults(ch, config) {
        const defaults = config.defaults || {};
        if (!ch) return;

        ch.engine = defaults.engine || ch.engine;
        ch.presetId = defaults.preset || ch.presetId;
        const preset = (config.sam_presets || []).find(p => p.id === ch.presetId);
        if (preset) {
            ch.engineParams = {
                speed: samConfigToUiSpeed(preset.speed),
                pitch: preset.pitch,
                mouth: preset.mouth,
                throat: preset.throat
            };
        }
        ch.volume = defaults.volume ?? ch.volume;
        ch.filter = { ...ch.filter, ...(defaults.filter || {}) };
        ch.delay = { ...ch.delay, ...(defaults.delay || {}) };
        ch.lfo = { ...ch.lfo, ...(defaults.lfo || {}) };
        ch.drone = { ...ch.drone, ...(defaults.drone || {}) };

        if (defaults.sing) {
            ch.sing = {
                enabled: defaults.sing.enabled ?? ch.sing.enabled,
                pitch: defaults.sing.pitch ?? ch.sing.pitch,
                wobbleRate: defaults.sing.wobble_rate ?? ch.sing.wobbleRate,
                wobbleDepth: defaults.sing.wobble_depth ?? ch.sing.wobbleDepth,
                wobbleWave: defaults.sing.wobble_wave ?? ch.sing.wobbleWave
            };
        }

        if (defaults.melody) {
            ch.melody = {
                enabled: defaults.melody.enabled ?? ch.melody.enabled,
                preset: defaults.melody.preset || ch.melody.preset,
                mode: defaults.melody.mode || ch.melody.mode,
                scale: defaults.melody.scale || ch.melody.scale,
                root: defaults.melody.root ?? ch.melody.root,
                pattern: defaults.melody.pattern || ch.melody.pattern,
                bpm: defaults.melody.bpm ?? ch.melody.bpm,
                depth: defaults.melody.depth ?? ch.melody.depth,
                glide: defaults.melody.glide ?? ch.melody.glide,
                loop: defaults.melody.loop ?? ch.melody.loop
            };
        }

        if (defaults.loop) {
            ch.loop.mode = defaults.loop.mode || ch.loop.mode;
            ch.loop.interval = defaults.loop.interval ?? ch.loop.interval;
            ch.loop.bpm = defaults.loop.bpm ?? ch.loop.bpm;
            ch.loop.cycleVoices = defaults.loop.cycle_voices ?? ch.loop.cycleVoices;
        }

        if (!AVAILABLE_ENGINES.includes(ch.engine)) {
            ch.engine = AVAILABLE_ENGINES[0] || 'sam';
        }
    }

    function buildSynthParams(ch) {
        const params = {};
        if (ch.engine === 'sam') {
            params.speed = ch.engineParams.speed;
            params.pitch = ch.engineParams.pitch;
            params.mouth = ch.engineParams.mouth;
            params.throat = ch.engineParams.throat;
            // Keep SAM internal sing mode tied only to WOBBLE.
            // Melody pitch is handled in WebAudio; coupling both causes blurred pitch motion.
            params.sing_mode = ch.sing.enabled;
        } else if (ch.engine === 'say') {
            params.voice = ch.sayVoice;
            params.rate = ch.sayRate;
        } else if (ch.engine === 'espeak') {
            params.voice = ch.espeakVoice;
            params.rate = ch.espeakRate;
            params.pitch = ch.espeakPitch;
        } else if (ch.engine === 'espeak_ng') {
            params.voice = ch.espeakNgVoice;
            params.rate = ch.espeakNgRate;
            params.pitch = ch.espeakNgPitch;
        }
        return params;
    }

    function splitWordsForMelody(text) {
        return (text.match(/\S+/g) || []).slice(0, MAX_WORD_MELODY_TOKENS);
    }

    async function getCachedBuffer(text, engine, params) {
        const key = JSON.stringify([engine, text, params]);
        if (AUDIO_BUFFER_CACHE.has(key)) return AUDIO_BUFFER_CACHE.get(key);

        const buffer = await tts.fetchBuffer(text, engine, params);
        AUDIO_BUFFER_CACHE.set(key, buffer);
        if (AUDIO_BUFFER_CACHE.size > MAX_BUFFER_CACHE_ITEMS) {
            AUDIO_BUFFER_CACHE.delete(AUDIO_BUFFER_CACHE.keys().next().value);
        }
        return buffer;
    }

    function pitchRateFromCents(cents) {
        return Math.max(0.125, Math.min(8, Math.pow(2, cents / 1200)));
    }

    function trimSilenceFromBuffer(buffer, ctx) {
        const padFrames = Math.floor(buffer.sampleRate * WORD_MELODY_TRIM_PAD_SEC);
        let first = -1;
        let last = -1;

        for (let i = 0; i < buffer.length; i++) {
            for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
                if (Math.abs(buffer.getChannelData(ch)[i]) > WORD_MELODY_TRIM_THRESHOLD) {
                    first = Math.max(0, i - padFrames);
                    break;
                }
            }
            if (first !== -1) break;
        }

        if (first === -1) return buffer;

        for (let i = buffer.length - 1; i >= first; i--) {
            for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
                if (Math.abs(buffer.getChannelData(ch)[i]) > WORD_MELODY_TRIM_THRESHOLD) {
                    last = Math.min(buffer.length, i + padFrames + 1);
                    break;
                }
            }
            if (last !== -1) break;
        }

        if (first === 0 && last === buffer.length) return buffer;

        const trimmed = ctx.createBuffer(buffer.numberOfChannels, Math.max(1, last - first), buffer.sampleRate);
        for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
            trimmed.copyToChannel(buffer.getChannelData(ch).subarray(first, last), ch);
        }
        return trimmed;
    }

    async function synthesizeWordMelody(chId, text, params) {
        const ch = chMgr.channels.get(chId); if (!ch) return;
        const words = splitWordsForMelody(text);
        if (!words.length) return;

        const buffers = [];
        for (const word of words) {
            const buffer = await getCachedBuffer(word, ch.engine, params);
            buffers.push(trimSilenceFromBuffer(buffer, ch.audioEngine.ctx));
        }

        const startAt = ch.audioEngine.ctx.currentTime + 0.05;
        let offset = 0;
        const noteCents = words.map((_, i) => ch.audioEngine.getMelodyCents(i));

        if (!ch.loop.enabled) {
            const trace = words
                .slice(0, 8)
                .map((word, i) => `${word}:${Math.round(noteCents[i])}c`)
                .join(' ');
            chMgr.addLine(chId, `NOTES: ${trace}`, 'system');
        }

        buffers.forEach((buffer, i) => {
            const fixedPitchCents = (ch.sing.enabled ? ch.sing.pitch : 0) + noteCents[i];
            const pitchRate = pitchRateFromCents(fixedPitchCents);
            ch.audioEngine.playBuffer(buffer, {
                when: startAt + offset,
                detuneCents: noteCents[i],
                pitchMethod: 'rate',
                applyMelody: false,
                enforceLimit: false
            });
            offset += Math.max(0.04, buffer.duration / pitchRate) + WORD_MELODY_GAP_SEC;
        });
    }

    // ─── Synthesize for a channel ────────────────────────────
    async function synthesizeForChannel(chId, text) {
        const ch = chMgr.channels.get(chId); if (!ch || ch.isProcessing || !text) return;
        ch.isProcessing = true;
        const procLine = chMgr.addLine(chId, 'PROCESSING...', 'processing');
        chMgr.addLine(chId, text, 'user');

        const params = buildSynthParams(ch);

        try {
            window.audioManager.resume();
            if (ch.melody.enabled && ch.melody.mode === 'word') {
                await synthesizeWordMelody(chId, text, params);
            } else {
                await tts.synthesize(text, ch.engine, params, ch.audioEngine);
            }
            chMgr.removeLine(procLine);
            const melodyModeLabel = ch.melody.mode === 'phrase' ? 'BEND' : 'NOTES';
            const mode = ch.melody.enabled ? ` ${melodyModeLabel}-MELODY` : '';
            chMgr.addLine(chId, `[▶ CH${chId} ${ch.engine.toUpperCase()}${mode}]`, 'system');
        } catch (err) {
            chMgr.removeLine(procLine);
            chMgr.addLine(chId, `ERROR: ${err.message}`, 'error');
        }
        ch.isProcessing = false;
    }

    // ─── Input handler (delegated) ───────────────────────────
    document.getElementById('channel-grid').addEventListener('keydown', async (e) => {
        if (!e.target.classList.contains('terminal-input')) return;
        const panel = e.target.closest('.channel-panel');
        if (!panel) return;
        const chId = parseInt(panel.dataset.ch);
        const ch = chMgr.channels.get(chId); if (!ch) return;

        if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (ch.history.length === 0) return;
            if (ch.historyIndex === -1) { ch.savedInput = ch.dom.input.value; ch.historyIndex = ch.history.length - 1; }
            else if (ch.historyIndex > 0) ch.historyIndex--;
            ch.dom.input.value = ch.history[ch.historyIndex];
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (ch.historyIndex === -1) return;
            if (ch.historyIndex < ch.history.length - 1) { ch.historyIndex++; ch.dom.input.value = ch.history[ch.historyIndex]; }
            else { ch.historyIndex = -1; ch.dom.input.value = ch.savedInput; }
            return;
        }
        if (e.key !== 'Enter' || ch.isProcessing) return;
        const text = ch.dom.input.value.trim(); if (!text) return;

        ch.history.push(text); ch.historyIndex = -1; ch.savedInput = '';
        ch.lastPhrase = text;
        ch.dom.input.value = '';

        // Save sidebar state if this is active channel
        if (chId === chMgr.activeId) saveToChannel();
        applyAudioState(ch);
        await synthesizeForChannel(chId, text);
    });

    // ─── Sidebar controls → save to active channel + apply ──
    function onSidebarChange() {
        saveToChannel();
        const ch = chMgr.getActive();
        if (ch) applyAudioState(ch);
    }

    // Bind all sidebar controls
    engineRadios.forEach(r => r.addEventListener('change', () => {
        const ch = chMgr.getActive(); if (!ch) return;
        saveToChannel();
        updateEngineParamVisibility(ch.engine);
        chMgr.addLine(ch.id, `ENGINE: ${ch.engine.toUpperCase()}`, 'system');
    }));

    samPreset.addEventListener('change', () => {
        const p = SAM_PRESETS[samPreset.value]; if (!p) return;
        samSpeed.value = samConfigToUiSpeed(p.speed);
        samPitch.value = p.pitch; samMouth.value = p.mouth; samThroat.value = p.throat;
        [samSpeed, samPitch, samMouth, samThroat].forEach(s => s.dispatchEvent(new Event('input')));
        onSidebarChange();
    });

    melodyPreset.addEventListener('change', () => {
        const p = MELODY_PRESETS[melodyPreset.value];
        if (!p) { onSidebarChange(); return; }
        applyingMelodyPreset = true;
        melodyEnabled.checked = true;
        melodyMode.value = p.mode;
        melodyScale.value = p.scale;
        melodyRoot.value = p.root;
        melodyPattern.value = p.pattern;
        melodyPattern.dataset.rawSteps = p.pattern;
        melodyBpm.value = p.bpm;
        melodyDepth.value = p.depth;
        melodyGlide.value = p.glide;
        if (melodyTimingDetails && p.mode === 'phrase') melodyTimingDetails.open = true;
        [melodyBpm, melodyDepth, melodyGlide].forEach(s => s.dispatchEvent(new Event('input')));
        applyingMelodyPreset = false;
        renderMelodyPatternView();
        onSidebarChange();
    });

    [melodyMode, melodyScale, melodyRoot, melodyPattern, melodyBpm, melodyDepth, melodyGlide].forEach(el => {
        const evt = el.tagName === 'SELECT' ? 'change' : 'input';
        el.addEventListener(evt, () => {
            if (el === melodyPattern && !melodyPattern.readOnly) {
                melodyPattern.dataset.rawSteps = melodyPattern.value;
            }
            if (el === melodyMode && melodyTimingDetails && melodyMode.value === 'phrase') melodyTimingDetails.open = true;
            if (!applyingMelodyPreset && melodyPreset.value !== 'custom') melodyPreset.value = 'custom';
            renderMelodyPatternView();
            updateMelodyPreview();
            onSidebarChange();
        });
    });

    if (melodyAutoNoteView) {
        melodyAutoNoteView.addEventListener('change', () => {
            renderMelodyPatternView();
            updateMelodyPreview();
            onSidebarChange();
        });
    }

    [melodyEnabled, melodyLoop].forEach(el => el.addEventListener('change', onSidebarChange));

    if (melodyCleanNotes) {
        melodyCleanNotes.addEventListener('change', () => {
            // Clean notes means disabling wobble layer.
            singEnabled.checked = !melodyCleanNotes.checked;
            onSidebarChange();
        });
    }

    [samSpeed, samPitch, samMouth, samThroat,
     singEnabled, singPitch, singWobbleRate, singWobbleDepth, singWobbleWave,
     filterType, filterCutoff, filterResonance,
     delayEnabled, delayTime, delayFeedback, delayMix,
     lfoEnabled, lfoRate, lfoDepth, lfoWave, lfoTarget,
     droneEnabled, droneWave, droneNote, droneFreq, droneDetune, droneVoices, droneVolume,
     sayVoice, sayRate,
     espeakVoice, espeakRate, espeakPitch,
     espeakNgVoice, espeakNgRate, espeakNgPitch,
     channelVolume, loopCycle
    ].forEach(el => {
        if (!el) return;
        const evt = (el.tagName === 'SELECT' || el.type === 'checkbox') ? 'change' : 'input';
        el.addEventListener(evt, onSidebarChange);
    });

    // Drone note → freq sync
    droneNote.addEventListener('change', () => {
        droneFreq.value = parseFloat(droneNote.value);
        droneFreq.dispatchEvent(new Event('input'));
    });

    // ─── Loop Controls ───────────────────────────────────────
    function getLoopIntervalSec(ch) {
        return ch.loop.mode === 'bpm' ? 60 / ch.loop.bpm : ch.loop.interval;
    }

    function startLoop(chId) {
        const ch = chMgr.channels.get(chId); if (!ch) return;
        stopLoop(chId);
        if (!ch.lastPhrase) {
            chMgr.addLine(chId, 'LOOP: NO PHRASE — TYPE FIRST', 'error');
            ch.loop.enabled = false;
            if (chId === chMgr.activeId) loopEnabled.checked = false;
            return;
        }
        const sec = getLoopIntervalSec(ch);
        chMgr.addLine(chId, `LOOP: ON — ${ch.loop.mode === 'bpm' ? ch.loop.bpm + ' BPM' : sec.toFixed(1) + 's'}`, 'system');

        // First tick
        loopTick(chId);
        ch.loop.timerId = setInterval(() => loopTick(chId), sec * 1000);
    }

    async function loopTick(chId) {
        const ch = chMgr.channels.get(chId); if (!ch || ch.isProcessing) return;

        if (ch.loop.cycleVoices) {
            const dropdown = ch.engine === 'sam' ? samPreset
                : ch.engine === 'say' ? sayVoice
                : ch.engine === 'espeak' ? espeakVoice
                : espeakNgVoice;
            if (chId === chMgr.activeId) {
                const nextIdx = (dropdown.selectedIndex + 1) % dropdown.options.length;
                dropdown.selectedIndex = nextIdx;
                dropdown.dispatchEvent(new Event('change'));
            } else {
                if (ch.engine === 'sam') {
                    const presetKeys = Object.keys(SAM_PRESETS);
                    const curIdx = presetKeys.indexOf(ch.presetId);
                    const nextIdx = (curIdx + 1) % presetKeys.length;
                    ch.presetId = presetKeys[nextIdx];
                    const p = SAM_PRESETS[ch.presetId];
                    if (p) {
                        ch.engineParams = {
                            speed: samConfigToUiSpeed(p.speed),
                            pitch: p.pitch,
                            mouth: p.mouth,
                            throat: p.throat
                        };
                    }
                } else if (ch.engine === 'say') {
                    const opts = Array.from(sayVoice.options);
                    if (opts.length) {
                        const curIdx = opts.findIndex(o => o.value === ch.sayVoice);
                        const nextIdx = ((curIdx < 0 ? 0 : curIdx) + 1) % opts.length;
                        ch.sayVoice = opts[nextIdx].value;
                    }
                } else if (ch.engine === 'espeak') {
                    const opts = Array.from(espeakVoice.options);
                    if (opts.length) {
                        const curIdx = opts.findIndex(o => o.value === ch.espeakVoice);
                        const nextIdx = ((curIdx < 0 ? 0 : curIdx) + 1) % opts.length;
                        ch.espeakVoice = opts[nextIdx].value;
                    }
                } else if (ch.engine === 'espeak_ng') {
                    const opts = Array.from(espeakNgVoice.options);
                    if (opts.length) {
                        const curIdx = opts.findIndex(o => o.value === ch.espeakNgVoice);
                        const nextIdx = ((curIdx < 0 ? 0 : curIdx) + 1) % opts.length;
                        ch.espeakNgVoice = opts[nextIdx].value;
                    }
                }
            }
        }

        applyAudioState(ch);
        const phrase = ch.dom.input.value.trim() || ch.lastPhrase;
        await synthesizeForChannel(chId, phrase);
    }

    function stopLoop(chId) {
        const ch = chMgr.channels.get(chId); if (!ch) return;
        if (ch.loop.timerId) { clearInterval(ch.loop.timerId); ch.loop.timerId = null; }
    }

    loopEnabled.addEventListener('change', () => {
        const ch = chMgr.getActive(); if (!ch) return;
        window.audioManager.resume();
        saveToChannel();
        ch.loop.enabled = loopEnabled.checked;
        if (ch.loop.enabled) startLoop(ch.id);
        else { stopLoop(ch.id); chMgr.addLine(ch.id, 'LOOP: OFF', 'system'); }
    });

    loopMode.addEventListener('change', () => {
        const isBpm = loopMode.value === 'bpm';
        loopSecsRow.classList.toggle('hidden', isBpm);
        loopBpmRow.classList.toggle('hidden', !isBpm);
        const ch = chMgr.getActive(); if (!ch) return;
        ch.loop.mode = loopMode.value;
        if (ch.loop.enabled) startLoop(ch.id);
    });

    [loopInterval, loopBpm].forEach(el => el.addEventListener('input', () => {
        saveToChannel();
        const ch = chMgr.getActive();
        if (ch && ch.loop.enabled) startLoop(ch.id);
    }));

    // ─── Channel switching callback ──────────────────────────
    chMgr.onActiveChange = (ch) => {
        if (ch) loadFromChannel(ch);
    };

    // ─── Add channel button ──────────────────────────────────
    document.getElementById('btn-add-channel').addEventListener('click', () => {
        window.audioManager.init(); window.audioManager.resume();
        chMgr.createChannel('');
    });

    // ─── Slider bindings ─────────────────────────────────────
    bindSlider(samSpeed, 'sam-speed-val', 0); bindSlider(samPitch, 'sam-pitch-val', 0);
    bindSlider(samMouth, 'sam-mouth-val', 0); bindSlider(samThroat, 'sam-throat-val', 0);
    bindSlider(sayRate, 'say-rate-val', 0);
    bindSlider(espeakRate, 'espeak-rate-val', 0); bindSlider(espeakPitch, 'espeak-pitch-val', 0);
    bindSlider(espeakNgRate, 'espeak-ng-rate-val', 0);
    bindSlider(espeakNgPitch, 'espeak-ng-pitch-val', 0);
    bindSlider(channelVolume, 'channel-volume-val', 2);
    bindSlider(singPitch, 'sing-pitch-val', 0); bindSlider(singWobbleRate, 'sing-wobble-rate-val', 1);
    bindSlider(singWobbleDepth, 'sing-wobble-depth-val', 0);
    bindSlider(melodyBpm, 'melody-bpm-val', 0); bindSlider(melodyDepth, 'melody-depth-val', 0);
    bindSlider(melodyGlide, 'melody-glide-val', 3);
    bindSlider(filterCutoff, 'filter-cutoff-val', 0); bindSlider(filterResonance, 'filter-resonance-val', 1);
    bindSlider(lfoRate, 'lfo-rate-val', 2); bindSlider(lfoDepth, 'lfo-depth-val', 0);
    bindSlider(delayTime, 'delay-time-val', 2); bindSlider(delayFeedback, 'delay-feedback-val', 2);
    bindSlider(delayMix, 'delay-mix-val', 2);
    bindSlider(loopInterval, 'loop-interval-val', 1); bindSlider(loopBpm, 'loop-bpm-val', 0);
    bindSlider(droneFreq, 'drone-freq-val', 1); bindSlider(droneDetune, 'drone-detune-val', 1);
    bindSlider(droneVolume, 'drone-volume-val', 2);

    // ─── Load config + voices ────────────────────────────────
    async function loadConfig() {
        try {
            const resp = await fetch('/api/config');
            const config = await resp.json();
            const presets = config.sam_presets || [];
            if (presets.length > 0) {
                SAM_PRESETS = {};
                samPreset.innerHTML = '';
                presets.forEach(p => {
                    SAM_PRESETS[p.id] = p;
                    const opt = document.createElement('option');
                    opt.value = p.id; opt.textContent = p.name.toUpperCase();
                    samPreset.appendChild(opt);
                });
            }
            loadMelodyPresets(config.melody_presets);
            // Create first channel with default phrase
            const phrase = config.defaults?.default_phrase || '';
            const ch = chMgr.createChannel(phrase);
            applyConfigDefaults(ch, config);
            loadFromChannel(ch);
            applyAudioState(ch);
            updateMelodyPreview();
        } catch (e) {
            console.warn('Config load failed:', e);
            chMgr.createChannel('I FEEL FANTASTIC');
        }
    }

    async function loadVoices() {
        try {
            const voices = await tts.getVoices();
            AVAILABLE_ENGINES = Array.isArray(voices.available_engines) && voices.available_engines.length
                ? voices.available_engines
                : ['sam'];

            engineRadios.forEach(r => {
                const isAvailable = AVAILABLE_ENGINES.includes(r.value);
                r.disabled = !isAvailable;
                const label = r.closest('label');
                if (label) {
                    label.style.display = isAvailable ? '' : 'none';
                    label.style.opacity = isAvailable ? '1' : '0.35';
                    label.title = isAvailable ? '' : 'Engine not available on this OS';
                }
            });

            if (voices.say && voices.say.length > 0) {
                sayVoice.innerHTML = '';
                voices.say.forEach(v => {
                    const opt = document.createElement('option');
                    opt.value = v.id; opt.textContent = `${v.name} (${v.lang})`.toUpperCase();
                    sayVoice.appendChild(opt);
                });
            }

            if (voices.espeak && voices.espeak.length > 0) {
                espeakVoice.innerHTML = '';
                voices.espeak.forEach(v => {
                    const opt = document.createElement('option');
                    opt.value = v.id;
                    opt.textContent = `${v.name} (${v.lang || 'n/a'})`.toUpperCase();
                    espeakVoice.appendChild(opt);
                });
            }

            if (voices.espeak_ng && voices.espeak_ng.length > 0) {
                espeakNgVoice.innerHTML = '';
                voices.espeak_ng.forEach(v => {
                    const opt = document.createElement('option');
                    opt.value = v.id;
                    opt.textContent = `${v.name} (${v.lang || 'n/a'})`.toUpperCase();
                    espeakNgVoice.appendChild(opt);
                });
            }

            const active = chMgr.getActive();
            if (active) {
                if (!AVAILABLE_ENGINES.includes(active.engine)) {
                    active.engine = AVAILABLE_ENGINES[0] || 'sam';
                    const targetRadio = Array.from(engineRadios).find(r => r.value === active.engine);
                    if (targetRadio) targetRadio.checked = true;
                }
                loadFromChannel(active);
            }
        } catch (e) {}
    }

    loadConfig();
    loadVoices();

    // ─── Sidebar Toggle ─────────────────────────────────────
    document.getElementById('btn-sidebar-close').addEventListener('click', (e) => {
        e.stopPropagation();
        sidebar.classList.add('collapsed');
    });
    document.getElementById('btn-sidebar-open')?.addEventListener('click', (e) => {
        e.stopPropagation();
        sidebar.classList.remove('collapsed');
    });

    // ─── Info Modal ──────────────────────────────────────────
    const infoOverlay = document.getElementById('info-overlay');
    document.getElementById('btn-info').addEventListener('click', () => infoOverlay.classList.remove('hidden'));
    document.getElementById('btn-info-close').addEventListener('click', () => infoOverlay.classList.add('hidden'));
    infoOverlay.addEventListener('click', (e) => { if (e.target === infoOverlay) infoOverlay.classList.add('hidden'); });

    // ─── Focus management ────────────────────────────────────
    document.addEventListener('click', (e) => {
        if (!sidebar.contains(e.target) && !infoOverlay.contains(e.target)) {
            const ch = chMgr.getActive();
            if (ch) ch.dom.input.focus();
        }
    });
})();
