/* ═══════════════════════════════════════════════════════════
   channel-manager.js — Multi-channel state & DOM management
   ═══════════════════════════════════════════════════════════ */

class ChannelManager {
    constructor() {
        this.channels = new Map();
        this.activeId = null;
        this.nextId = 1;
        this.maxChannels = 4;
        this.grid = document.getElementById('channel-grid');
        this.tabs = document.getElementById('channel-tabs');
        this.onActiveChange = null; // callback(channelState)
    }

    createChannel(defaultPhrase) {
        if (this.channels.size >= this.maxChannels) return null;
        const id = this.nextId++;
        const state = {
            id,
            engine: 'sam',
            presetId: 'creepy',
            engineParams: { speed: 60, pitch: 40, mouth: 150, throat: 200 },
            sayVoice: 'Alex',
            sayRate: 175,
            espeakVoice: 'en',
            espeakRate: 175,
            espeakPitch: 50,
            espeakNgVoice: 'en',
            espeakNgRate: 175,
            espeakNgPitch: 50,
            volume: 0.8,
            sing: { enabled: false, pitch: -200, wobbleRate: 3, wobbleDepth: 150, wobbleWave: 'sine' },
            melody: { enabled: false, mode: 'word', preset: 'fantastic_minor', scale: 'minor', root: 0, pattern: '0 2 4 2 -1 0 -3 -1', bpm: 92, depth: 115, glide: 0.06, loop: true },
            loop: { enabled: false, mode: 'secs', interval: 5, bpm: 120, cycleVoices: false, timerId: null },
            filter: { type: 'lowpass', cutoff: 8000, resonance: 1 },
            delay: { enabled: false, time: 0.3, feedback: 0.4, mix: 0.3 },
            lfo: { enabled: false, rate: 2, depth: 500, wave: 'sine', target: 'filter' },
            drone: { enabled: false, wave: 'sawtooth', freq: 55, detune: 5, voices: 3, volume: 0.15 },
            history: [],
            historyIndex: -1,
            savedInput: '',
            lastPhrase: defaultPhrase || '',
            isProcessing: false,
            audioEngine: null,
            dom: null
        };

        // Create audio engine for this channel
        const mgr = window.audioManager;
        mgr.init();
        mgr.resume();
        state.audioEngine = mgr.createChannel(id);

        // Create DOM
        state.dom = this._createDOM(id, defaultPhrase);
        this.grid.appendChild(state.dom.panel);
        this.channels.set(id, state);

        // Create tab
        this._createTab(id);
        this._updateGrid();

        // Select this channel
        this.setActive(id);
        return state;
    }

    removeChannel(id) {
        if (this.channels.size <= 1) return; // keep at least 1
        const state = this.channels.get(id);
        if (!state) return;

        // Stop loop
        if (state.loop.timerId) clearInterval(state.loop.timerId);
        // Remove audio
        window.audioManager.removeChannel(id);
        // Remove DOM
        state.dom.panel.remove();
        const tab = this.tabs.querySelector(`[data-ch="${id}"]`);
        if (tab) tab.remove();

        this.channels.delete(id);
        this._updateGrid();

        // Switch to another channel
        if (this.activeId === id) {
            const first = this.channels.keys().next().value;
            this.setActive(first);
        }
    }

    setActive(id) {
        this.activeId = id;
        // Update panel highlights
        this.channels.forEach((s, cid) => {
            s.dom.panel.classList.toggle('active', cid === id);
        });
        // Update tabs
        this.tabs.querySelectorAll('.channel-tab').forEach(t => {
            t.classList.toggle('active', parseInt(t.dataset.ch) === id);
        });
        // Notify callback to update sidebar
        if (this.onActiveChange) this.onActiveChange(this.channels.get(id));
        // Focus input
        const state = this.channels.get(id);
        if (state && state.dom.input) state.dom.input.focus();
    }

    getActive() {
        return this.channels.get(this.activeId);
    }

    _createDOM(id, defaultPhrase) {
        const panel = document.createElement('div');
        panel.className = 'channel-panel';
        panel.dataset.ch = id;

        const label = document.createElement('div');
        label.className = 'channel-label';
        label.textContent = `CH${id}`;

        const output = document.createElement('div');
        output.className = 'terminal-output';

        // Welcome lines
        const welcome = [
            `TEXT2SYNTH — CH${id}`,
            '═══════════════════════',
            'TYPE TEXT + ENTER TO SPEAK',
            '─────────────────────────'
        ];
        welcome.forEach(txt => {
            const line = document.createElement('div');
            line.className = 'term-line system';
            line.textContent = txt;
            output.appendChild(line);
        });

        const inputLine = document.createElement('div');
        inputLine.className = 'terminal-input-line';

        const prompt = document.createElement('span');
        prompt.className = 'prompt';
        prompt.innerHTML = '&gt;&nbsp;';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'terminal-input';
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.value = defaultPhrase || '';

        inputLine.appendChild(prompt);
        inputLine.appendChild(input);

        panel.appendChild(label);
        panel.appendChild(output);
        panel.appendChild(inputLine);

        // Click panel to select
        panel.addEventListener('click', (e) => {
            if (e.target !== input) this.setActive(id);
        });
        input.addEventListener('focus', () => this.setActive(id));

        return { panel, output, input };
    }

    _createTab(id) {
        const tab = document.createElement('button');
        tab.className = 'channel-tab';
        tab.dataset.ch = id;
        tab.innerHTML = `CH${id}`;

        if (this.channels.size > 1) {
            const close = document.createElement('span');
            close.className = 'tab-close';
            close.textContent = '✕';
            close.addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeChannel(id);
            });
            tab.appendChild(close);
        }

        tab.addEventListener('click', () => this.setActive(id));
        this.tabs.appendChild(tab);
    }

    _updateGrid() {
        this.grid.dataset.count = this.channels.size;
        // Update add button visibility
        const addBtn = document.getElementById('btn-add-channel');
        if (addBtn) addBtn.style.display = this.channels.size >= this.maxChannels ? 'none' : '';
        // Rebuild close buttons (show only if >1 channel)
        this.tabs.querySelectorAll('.tab-close').forEach(c => {
            c.style.display = this.channels.size > 1 ? '' : 'none';
        });
    }

    addLine(channelId, text, cls = 'system') {
        const state = this.channels.get(channelId);
        if (!state) return null;
        const div = document.createElement('div');
        div.className = `term-line ${cls}`;
        div.textContent = text;
        state.dom.output.appendChild(div);
        state.dom.output.scrollTop = state.dom.output.scrollHeight;
        return div;
    }

    removeLine(el) {
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }
}

window.channelManager = new ChannelManager();
