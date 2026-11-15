// The worklet averages each source interval into 16 kHz samples and emits 100 ms PCM frames.
export const voiceWorklet = `
class VoiceProcessor extends AudioWorkletProcessor {
  constructor() { super(); this.sum = 0; this.weight = 0; this.frame = new Int16Array(1600); this.index = 0; this.stopped = false; this.port.onmessage = () => { if (this.stopped) return; this.stopped = true; if (this.index) this.port.postMessage(this.frame.buffer.slice(0, this.index * 2)); this.port.postMessage("flushed"); }; }
  process(inputs) {
    if (this.stopped) return false;
    const channels = inputs[0];
    if (!channels || !channels.length) return true;
    for (let i = 0; i < channels[0].length; i++) {
      let value = 0;
      for (const channel of channels) value += channel[i] / channels.length;
      let remaining = 16000 / sampleRate;
      while (remaining > 0) {
        const part = Math.min(remaining, 1 - this.weight);
        this.sum += value * part; this.weight += part; remaining -= part;
        if (this.weight >= 1 - 1e-10) {
          const sample = Math.max(-1, Math.min(1, this.sum));
          this.frame[this.index++] = Math.round(sample * (sample < 0 ? 32768 : 32767));
          this.sum = 0; this.weight = 0;
          if (this.index === this.frame.length) {
            this.port.postMessage(this.frame.buffer, [this.frame.buffer]);
            this.frame = new Int16Array(1600); this.index = 0;
          }
        }
      }
    }
    return true;
  }
}
registerProcessor('voice-input', VoiceProcessor);
`;
