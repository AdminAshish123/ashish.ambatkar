/**
 * SpeechController
 * Thin wrapper around the browser's native Web Speech API
 * (window.speechSynthesis). No network calls, no API keys —
 * everything happens on the visitor's device for free.
 */
class SpeechController {
  constructor() {
    this.synth = window.speechSynthesis;
    this.utterance = null;
    this.text = "";
    this.words = [];
    this.rate = 1;
    this.voice = null;
    this.state = "idle"; // idle | playing | paused | ended

    // callbacks the widget UI subscribes to
    this.onStateChange = null;
    this.onWordBoundary = null; // (wordIndex) => void, for highlighting
    this.onProgress = null;     // (percent) => void
    this.onEnd = null;
  }

  isSupported() {
    return "speechSynthesis" in window;
  }

  getVoices() {
    // Voices load asynchronously in some browsers.
    return this.synth.getVoices();
  }

  /**
   * Auto-picks a single female-sounding voice from whatever the visitor's
   * browser/OS already provides — no picker shown to the user, no cloud
   * voices, no cost. Most platforms expose a "female" hint in the voice
   * name; we fall back sensibly if none is found.
   */
  autoSelectFemaleVoice(preferredLang) {
    const voices = this.getVoices();
    if (!voices.length) return null;

    const FEMALE_NAME_HINTS = [
      "female", "zira", "samantha", "victoria", "karen", "moira", "tessa",
      "fiona", "susan", "hazel", "kate", "salli", "joanna", "ivy", "aria",
      "google us english", "google uk english female"
    ];

    const isPreferredLang = (v) => !preferredLang || v.lang.toLowerCase().startsWith(preferredLang.toLowerCase());

    let voice =
      voices.find((v) => isPreferredLang(v) && FEMALE_NAME_HINTS.some((hint) => v.name.toLowerCase().includes(hint))) ||
      voices.find((v) => FEMALE_NAME_HINTS.some((hint) => v.name.toLowerCase().includes(hint))) ||
      voices.find((v) => isPreferredLang(v)) ||
      voices[0];

    this.setVoice(voice);
    return voice;
  }

  /** Rough estimate of listening time in seconds, based on ~150 wpm at rate 1. */
  estimateSeconds(text, rate = 1) {
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
    const wordsPerMinute = 150 * rate;
    return Math.max(1, Math.round((wordCount / wordsPerMinute) * 60));
  }

  setRate(rate) {
    this.rate = rate;
    if (this.utterance) this.utterance.rate = rate;
  }

  setVoice(voice) {
    this.voice = voice;
    if (this.utterance) this.utterance.voice = voice;
  }

  _setState(state) {
    this.state = state;
    if (this.onStateChange) this.onStateChange(state);
  }

  play(text) {
    if (!this.isSupported()) {
      console.warn("[tts-widget] Web Speech API not supported in this browser.");
      return;
    }

    this.text = text;
    this.words = text.trim().split(/\s+/);

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = this.rate;
    if (this.voice) utterance.voice = this.voice;

    // Cancelling (below, and in pause()/stop()) fires this same utterance's
    // onerror asynchronously, sometime AFTER we've already moved on to a
    // new one. Without this guard that late event stomps the new state
    // back to "idle" moments after play() set it to "playing" — that race
    // was the real cause behind pause/speed appearing broken.
    const isCurrent = () => this.utterance === utterance;

    utterance.onboundary = (event) => {
      if (!isCurrent() || event.name !== "word") return;
      const spokenSoFar = text.slice(0, event.charIndex);
      const wordIndex = spokenSoFar.trim().split(/\s+/).filter(Boolean).length;
      if (this.onWordBoundary) this.onWordBoundary(wordIndex);
      if (this.onProgress) {
        const percent = Math.min(100, Math.round((event.charIndex / text.length) * 100));
        this.onProgress(percent);
      }
    };

    utterance.onend = () => {
      if (!isCurrent()) return;
      this._setState("ended");
      if (this.onProgress) this.onProgress(100);
      if (this.onEnd) this.onEnd();
    };

    utterance.onerror = () => {
      if (!isCurrent()) return;
      this._setState("idle");
    };

    this.utterance = utterance;
    this.synth.cancel(); // stop whatever was speaking before; safe now that late events are guarded
    this.synth.speak(utterance);
    this._setState("playing");
  }

  pause() {
    if (this.state !== "playing") return;
    // Chrome (especially on Windows) has a long-standing bug where native
    // speechSynthesis.pause()/resume() silently breaks — audio just stops
    // and never comes back. We avoid relying on it at all: stop the
    // utterance ourselves and let the caller resume by re-speaking the
    // remaining text from wherever it left off (the widget tracks that).
    this.utterance = null; // detach so this utterance's late cancel-error is ignored
    this.synth.cancel();
    this._setState("paused");
  }

  restart() {
    if (!this.text) return;
    this.play(this.text);
  }

  stop() {
    this.utterance = null;
    this.synth.cancel();
    this._setState("idle");
  }
}

if (typeof window !== "undefined") {
  window.TTSSpeechController = SpeechController;
}
