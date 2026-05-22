/* ═══════════════════════════════════════════════════════════
   tts-client.js — Fetch TTS audio from Flask backend
   Multi-channel: accepts a ChannelAudioEngine to play through.
   ═══════════════════════════════════════════════════════════ */

class TTSClient {
    constructor(baseUrl = '') {
        this.baseUrl = baseUrl;
    }

    async fetchBuffer(text, engine, params = {}) {
        const body = { text, engine, ...params };

        const response = await fetch(`${this.baseUrl}/api/synthesize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(err.error || `HTTP ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        return window.audioManager.decodeAudio(arrayBuffer);
    }

    /**
     * Request TTS synthesis and play through a specific channel engine.
     * @param {string} text - Text to synthesize
     * @param {string} engine - "sam" or "say"
     * @param {object} params - Engine-specific parameters
     * @param {ChannelAudioEngine} channelEngine - Channel to play through
     * @returns {Promise<AudioBufferSourceNode>}
     */
    async synthesize(text, engine, params = {}, channelEngine = null) {
        const audioBuffer = await this.fetchBuffer(text, engine, params);

        // Play through specified channel or first available
        if (channelEngine) {
            return channelEngine.playBuffer(audioBuffer);
        }

        // Fallback: play through first channel
        const firstCh = window.audioManager.channels.values().next().value;
        if (firstCh) return firstCh.playBuffer(audioBuffer);

        throw new Error('No audio channel available');
    }

    async getVoices() {
        const response = await fetch(`${this.baseUrl}/api/voices`);
        if (!response.ok) throw new Error('Failed to fetch voices');
        return response.json();
    }
}

window.ttsClient = new TTSClient();
