/* ═══════════════════════════════════════════════════════════
   audio-engine.js — Multi-channel Web Audio engine
   Each channel gets its own independent effects chain.
   Shared AudioContext for efficiency.
   ═══════════════════════════════════════════════════════════ */

class ChannelAudioEngine {
    /**
     * Create an independent effects chain for one channel.
     * @param {AudioContext} ctx - Shared AudioContext
     */
    constructor(ctx) {
        this.ctx = ctx;

        // Sing mode
        this.singEnabled = false;
        this.singPitch = -200;
        this.singWobbleRate = 3;
        this.singWobbleDepth = 150;
        this.singWobbleWave = 'sine';

        // Voice melody: scale-degree pitch steps over the spoken buffer.
        this.melodyEnabled = false;
        this.melodyMode = 'word';
        this.melodyScale = 'minor';
        this.melodyRoot = 0;
        this.melodyPattern = '0 2 4 2 -1 0 -3 -1';
        this.melodyBpm = 92;
        this.melodyDepth = 115;
        this.melodyGlide = 0.06;
        this.melodyLoop = true;

        // Source tracking
        this.activeSources = new Set();
        this.MAX_CONCURRENT_SOURCES = 4;

        // Drone
        this.droneOscs = [];
        this.droneGain = null;
        this.droneActive = false;
        this.lfoEnabled = false;
        this.delayEnabled = false;

        this.params = {
            filter: { type: 'lowpass', cutoff: 8000, resonance: 1 },
            delay: { time: 0.3, feedback: 0.4, mix: 0.3, enabled: false },
            lfo: { rate: 2, depth: 500, wave: 'sine', target: 'filter', enabled: false },
            drone: { wave: 'sawtooth', freq: 55, detune: 5, voices: 3, volume: 0.15 }
        };

        this._buildChain();
    }

    _buildChain() {
        const ctx = this.ctx;

        // Channel master
        this.masterGain = ctx.createGain();
        this.masterGain.gain.value = 0.8;

        // Per-channel limiter
        this.limiter = ctx.createDynamicsCompressor();
        this.limiter.threshold.value = -6;
        this.limiter.knee.value = 6;
        this.limiter.ratio.value = 12;
        this.limiter.attack.value = 0.003;
        this.limiter.release.value = 0.1;

        this.masterGain.connect(this.limiter);
        this.limiter.connect(ctx.destination);

        // Filter
        this.filter = ctx.createBiquadFilter();
        this.filter.type = this.params.filter.type;
        this.filter.frequency.value = this.params.filter.cutoff;
        this.filter.Q.value = this.params.filter.resonance;

        // Delay
        this.delayNode = ctx.createDelay(5.0);
        this.delayNode.delayTime.value = this.params.delay.time;
        this.delayFeedback = ctx.createGain();
        this.delayFeedback.gain.value = this.params.delay.feedback;
        this.delayNode.connect(this.delayFeedback);
        this.delayFeedback.connect(this.delayNode);

        // Dry/Wet
        this.delayDryGain = ctx.createGain();
        this.delayDryGain.gain.value = 1;
        this.delayWetGain = ctx.createGain();
        this.delayWetGain.gain.value = 0;

        this.filter.connect(this.delayDryGain);
        this.filter.connect(this.delayNode);
        this.delayNode.connect(this.delayWetGain);
        this.delayDryGain.connect(this.masterGain);
        this.delayWetGain.connect(this.masterGain);

        // LFO
        this.lfo = ctx.createOscillator();
        this.lfo.type = this.params.lfo.wave;
        this.lfo.frequency.value = this.params.lfo.rate;
        this.lfoGain = ctx.createGain();
        this.lfoGain.gain.value = 0;
        this.lfo.connect(this.lfoGain);
        this._routeLFO();
        this.lfo.start();

        // Drone gain
        this.droneGain = ctx.createGain();
        this.droneGain.gain.value = 0;
        this.droneGain.connect(this.filter);
    }

    _routeLFO() {
        try { this.lfoGain.disconnect(); } catch(e) {}
        if (this.params.lfo.target === 'filter') {
            this.lfoGain.connect(this.filter.frequency);
        } else if (this.params.lfo.target === 'delay') {
            this.lfoGain.connect(this.delayNode.delayTime);
        } else if (this.params.lfo.target === 'frequency') {
            this.droneOscs.forEach(osc => this.lfoGain.connect(osc.frequency));
        }
    }

    // ─── Source Management ───────────────────────────────────

    _trackSource(source, enforceLimit = true) {
        this.activeSources.add(source);
        source.onended = () => this.activeSources.delete(source);
        if (enforceLimit && this.activeSources.size > this.MAX_CONCURRENT_SOURCES) {
            const oldest = this.activeSources.values().next().value;
            try { oldest.stop(); } catch(e) {}
            this.activeSources.delete(oldest);
        }
    }

    stopAllSources() {
        this.activeSources.forEach(src => { try { src.stop(); } catch(e) {} });
        this.activeSources.clear();
    }

    // ─── Playback ───────────────────────────────────────────

    setChannelVolume(v) {
        const volume = Math.max(0, Math.min(1.5, Number(v) || 0));
        this.masterGain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.02);
    }

    playBuffer(buffer, options = {}) {
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        const now = this.ctx.currentTime;
        const startTime = Math.max(now, options.when ?? now);
        const fixedPitchCents = (this.singEnabled ? this.singPitch : 0) + (Number(options.detuneCents) || 0);
        const useRatePitch = options.pitchMethod === 'rate';
        const basePitch = useRatePitch ? 0 : fixedPitchCents;
        const applyPhraseMelody = options.applyMelody !== false && this.melodyEnabled && this.melodyMode === 'phrase';

        if (useRatePitch) {
            const rate = Math.max(0.125, Math.min(8, Math.pow(2, fixedPitchCents / 1200)));
            source.playbackRate.setValueAtTime(rate, startTime);
        }

        source.detune.cancelScheduledValues(now);
        source.detune.setValueAtTime(basePitch, startTime);

        if (applyPhraseMelody) {
            this._applyMelody(source, buffer.duration, basePitch, startTime);
        }

        if (this.singEnabled) {
            const wobbleLFO = this.ctx.createOscillator();
            const wobbleGain = this.ctx.createGain();
            wobbleLFO.type = this.singWobbleWave;
            wobbleLFO.frequency.value = this.singWobbleRate;
            wobbleGain.gain.value = this.singWobbleDepth;
            wobbleLFO.connect(wobbleGain);
            wobbleGain.connect(source.detune);
            wobbleLFO.start(startTime);
            source.addEventListener('ended', () => {
                try { wobbleLFO.stop(); wobbleLFO.disconnect(); wobbleGain.disconnect(); } catch(e) {}
            });
        }

        source.connect(this.filter);
        source.start(startTime);
        this._trackSource(source, options.enforceLimit !== false);
        return source;
    }

    // ─── Sing ────────────────────────────────────────────────
    setSingEnabled(v) { this.singEnabled = v; }
    setSingPitch(v) { this.singPitch = v; }
    setSingWobbleRate(v) { this.singWobbleRate = v; }
    setSingWobbleDepth(v) { this.singWobbleDepth = v; }
    setSingWobbleWave(v) { this.singWobbleWave = v; }

    // ─── Voice Melody ────────────────────────────────────────
    setMelodyEnabled(v) { this.melodyEnabled = v; }
    setMelodyMode(v) { this.melodyMode = v === 'phrase' ? 'phrase' : 'word'; }
    setMelodyScale(v) { this.melodyScale = v; }
    setMelodyRoot(v) { this.melodyRoot = Number(v) || 0; }
    setMelodyPattern(v) { this.melodyPattern = v || ''; }
    setMelodyBpm(v) { this.melodyBpm = Math.max(1, Number(v) || 92); }
    setMelodyDepth(v) { this.melodyDepth = Math.max(0, Number(v) || 100); }
    setMelodyGlide(v) { this.melodyGlide = Math.max(0, Number(v) || 0); }
    setMelodyLoop(v) { this.melodyLoop = v; }

    _scaleSteps() {
        const scales = {
            major: [0, 2, 4, 5, 7, 9, 11],
            minor: [0, 2, 3, 5, 7, 8, 10],
            harmonic_minor: [0, 2, 3, 5, 7, 8, 11],
            pentatonic_minor: [0, 3, 5, 7, 10],
            chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
            whole: [0, 2, 4, 6, 8, 10]
        };
        return scales[this.melodyScale] || scales.minor;
    }

    _degreeToSemitone(degree) {
        const scale = this._scaleSteps();
        const octave = Math.floor(degree / scale.length);
        const idx = degree - octave * scale.length;
        return scale[idx] + octave * 12;
    }

    _noteNameToSemitone(token) {
        const match = token.match(/^([a-gA-G])([#b]?)(-?\d+)?$/);
        if (!match) return null;
        const base = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[match[1].toLowerCase()];
        const accidental = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0;
        const octave = match[3] === undefined ? 3 : Number(match[3]);
        return base + accidental + (octave - 3) * 12;
    }

    _parseMelodyPattern() {
        return this.melodyPattern
            .split(/[\s,]+/)
            .map(token => token.trim())
            .filter(Boolean)
            .map(token => {
                if (/^(r|rest|hold|-)$/.test(token.toLowerCase())) return null;
                if (/^-?\d+$/.test(token)) return this._degreeToSemitone(Number(token));
                return this._noteNameToSemitone(token);
            })
            .filter(step => step === null || Number.isFinite(step));
    }

    getMelodyCents(index) {
        const steps = this._parseMelodyPattern();
        if (!steps.length) return 0;
        if (!this.melodyLoop && index >= steps.length) return 0;
        const step = steps[index % steps.length];
        const depth = this.melodyDepth / 100;
        const semitone = step === null ? 0 : this.melodyRoot + step * depth;
        return semitone * 100;
    }

    _applyMelody(source, duration, basePitch, startTime = this.ctx.currentTime) {
        const steps = this._parseMelodyPattern();
        if (!steps.length) return;

        const stepSeconds = Math.max(0.05, 60 / this.melodyBpm);
        const repeats = this.melodyLoop ? Math.ceil(duration / stepSeconds) : steps.length;
        const totalSteps = Math.max(1, repeats);

        for (let i = 0; i < totalSteps; i++) {
            const target = basePitch + this.getMelodyCents(i);
            const time = startTime + i * stepSeconds;
            if (i === 0 || this.melodyGlide === 0) {
                source.detune.setValueAtTime(target, time);
            } else {
                source.detune.setTargetAtTime(target, time, this.melodyGlide);
            }
        }
    }

    // ─── Filter ──────────────────────────────────────────────
    setFilterType(v) { this.params.filter.type = v; if (this.filter) this.filter.type = v; }
    setFilterCutoff(v) { this.params.filter.cutoff = v; if (this.filter) this.filter.frequency.setTargetAtTime(v, this.ctx.currentTime, 0.02); }
    setFilterResonance(v) { this.params.filter.resonance = v; if (this.filter) this.filter.Q.setTargetAtTime(v, this.ctx.currentTime, 0.02); }

    // ─── Delay ───────────────────────────────────────────────
    setDelayEnabled(v) {
        this.params.delay.enabled = v; this.delayEnabled = v;
        if (v) {
            this.delayWetGain.gain.setTargetAtTime(this.params.delay.mix, this.ctx.currentTime, 0.02);
            this.delayDryGain.gain.setTargetAtTime(1 - this.params.delay.mix, this.ctx.currentTime, 0.02);
        } else {
            this.delayWetGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
            this.delayDryGain.gain.setTargetAtTime(1, this.ctx.currentTime, 0.02);
        }
    }
    setDelayTime(v) { this.params.delay.time = v; if (this.delayNode) this.delayNode.delayTime.setTargetAtTime(v, this.ctx.currentTime, 0.02); }
    setDelayFeedback(v) { this.params.delay.feedback = v; if (this.delayFeedback) this.delayFeedback.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02); }
    setDelayMix(v) {
        this.params.delay.mix = v;
        if (this.delayEnabled) {
            this.delayDryGain.gain.setTargetAtTime(1 - v, this.ctx.currentTime, 0.02);
            this.delayWetGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
        }
    }

    // ─── LFO ─────────────────────────────────────────────────
    setLFOEnabled(v) {
        this.params.lfo.enabled = v; this.lfoEnabled = v;
        if (this.lfoGain) this.lfoGain.gain.setTargetAtTime(v ? this.params.lfo.depth : 0, this.ctx.currentTime, 0.02);
    }
    setLFORate(v) { this.params.lfo.rate = v; if (this.lfo) this.lfo.frequency.setTargetAtTime(v, this.ctx.currentTime, 0.02); }
    setLFODepth(v) { this.params.lfo.depth = v; if (this.lfoGain && this.lfoEnabled) this.lfoGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02); }
    setLFOWave(v) { this.params.lfo.wave = v; if (this.lfo) this.lfo.type = v; }
    setLFOTarget(v) { this.params.lfo.target = v; this._routeLFO(); }

    // ─── Drone ───────────────────────────────────────────────
    setDroneEnabled(v) { if (v && !this.droneActive) this._startDrone(); else if (!v && this.droneActive) this._stopDrone(); }
    setDroneWave(v) { this.params.drone.wave = v; this.droneOscs.forEach(o => { o.type = v; }); }
    setDroneFreq(v) { this.params.drone.freq = v; this._updateDroneFreqs(); }
    setDroneDetune(v) { this.params.drone.detune = v; this._updateDroneFreqs(); }
    setDroneVoices(v) { this.params.drone.voices = v; if (this.droneActive) { this._stopDrone(); this._startDrone(); } }
    setDroneVolume(v) { this.params.drone.volume = v; if (this.droneGain && this.droneActive) this.droneGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }

    _startDrone() {
        const { wave, freq, detune, voices, volume } = this.params.drone;
        this.droneOscs = [];
        for (let i = 0; i < voices; i++) {
            const osc = this.ctx.createOscillator();
            osc.type = wave;
            osc.frequency.value = freq;
            osc.detune.value = voices > 1 ? (i - (voices - 1) / 2) * detune : 0;
            osc.connect(this.droneGain);
            osc.start();
            this.droneOscs.push(osc);
        }
        if (this.params.lfo.target === 'frequency') this._routeLFO();
        this.droneGain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.1);
        this.droneActive = true;
    }

    _stopDrone() {
        this.droneGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
        const oscs = this.droneOscs; this.droneOscs = [];
        setTimeout(() => { oscs.forEach(o => { try { o.stop(); o.disconnect(); } catch(e) {} }); }, 200);
        this.droneActive = false;
    }

    _updateDroneFreqs() {
        const { freq, detune, voices } = this.params.drone;
        this.droneOscs.forEach((osc, i) => {
            osc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.02);
            osc.detune.setTargetAtTime(voices > 1 ? (i - (voices - 1) / 2) * detune : 0, this.ctx.currentTime, 0.02);
        });
    }

    /** Serialize current state for sidebar save/restore */
    getState() {
        return {
            sing: { enabled: this.singEnabled, pitch: this.singPitch, wobbleRate: this.singWobbleRate, wobbleDepth: this.singWobbleDepth, wobbleWave: this.singWobbleWave },
            melody: { enabled: this.melodyEnabled, mode: this.melodyMode, scale: this.melodyScale, root: this.melodyRoot, pattern: this.melodyPattern, bpm: this.melodyBpm, depth: this.melodyDepth, glide: this.melodyGlide, loop: this.melodyLoop },
            filter: { ...this.params.filter },
            delay: { ...this.params.delay },
            lfo: { ...this.params.lfo },
            drone: { ...this.params.drone, active: this.droneActive }
        };
    }
}

/**
 * AudioManager — manages shared context and per-channel engines.
 */
class AudioManager {
    constructor() {
        this.ctx = null;
        this.initialized = false;
        this.channels = new Map(); // channelId -> ChannelAudioEngine
    }

    init() {
        if (this.initialized) return;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.initialized = true;
    }

    resume() {
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    }

    /** Create a new channel engine */
    createChannel(channelId) {
        if (!this.initialized) this.init();
        const eng = new ChannelAudioEngine(this.ctx);
        this.channels.set(channelId, eng);
        return eng;
    }

    /** Get channel engine by ID */
    getChannel(channelId) {
        return this.channels.get(channelId);
    }

    /** Remove channel and clean up */
    removeChannel(channelId) {
        const eng = this.channels.get(channelId);
        if (eng) {
            eng.stopAllSources();
            if (eng.droneActive) eng._stopDrone();
            this.channels.delete(channelId);
        }
    }

    /** Decode audio (shared) */
    async decodeAudio(arrayBuffer) {
        if (!this.initialized) this.init();
        return this.ctx.decodeAudioData(arrayBuffer);
    }
}

window.audioManager = new AudioManager();
