/**
 * TTSWidget — the visible player.
 * A self-contained Web Component rendered inside a Shadow DOM so the
 * host website's CSS/JS can never break it (and it can never break
 * the host site).
 *
 * It is created and mounted automatically by the loader (tts-widget.js) —
 * the website owner never writes any HTML for it.
 */
class TTSWidget extends HTMLElement {
  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: "open" });
    this.speech = new window.TTSSpeechController();
    this.config = window.TTS_CONFIG || {};
    this.articleText = "";
    this.currentWordIndex = 0;
  }

  connectedCallback() {
    const detected = window.TTSArticleDetector.detectArticle(document);
    if (!detected || !detected.text || detected.text.length < 40) {
      // Nothing readable found — stay silent instead of showing a broken player.
      console.info("[tts-widget] No article content detected on this page.");
      return;
    }
    this.articleText = detected.text;
    this.words = detected.text.trim().split(/\s+/);

    this._render();
    this._wireEvents();
  }

  _estimatedLabel(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  _render() {
    const color = this.config.color || "#2563EB";
    const radius = this.config.borderRadius || "12px";
    const totalSeconds = this.speech.estimateSeconds(this.articleText, this.config.defaultRate || 1);

    this.shadow.innerHTML = `
      <style>
        :host {
          all: initial;
          display: block;
          /* Appears inline, exactly where the <script> tag was placed on
             the page — not a floating overlay. Margin just gives it
             breathing room from whatever content sits above/below it. */
          margin: 16px 0;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .bar {
          display: flex;
          align-items: center;
          gap: 10px;
          background: #ffffff;
          color: #1f2937;
          border: 1px solid rgba(0,0,0,0.08);
          box-shadow: 0 2px 10px rgba(0,0,0,0.08);
          border-radius: ${radius};
          padding: 10px 14px;
          max-width: 420px;
        }
        button {
          border: none;
          background: ${color};
          color: #fff;
          width: 34px;
          height: 34px;
          border-radius: calc(${radius} - 4px);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          flex-shrink: 0;
        }
        button.secondary {
          background: transparent;
          color: ${color};
          border: 1px solid ${color};
          width: 30px;
          height: 30px;
        }
        .info { display: flex; flex-direction: column; min-width: 0; flex: 1; }
        .label { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .caption { font-size: 11px; color: #6b7280; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .progress-track { height: 4px; background: #e5e7eb; border-radius: 2px; margin-top: 4px; overflow: hidden; }
        .progress-fill { height: 100%; width: 0%; background: ${color}; transition: width 0.15s linear; }
        select {
          font-size: 11px;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          padding: 4px;
          background: #fff;
          color: #1f2937;
        }
        .controls { display: flex; align-items: center; gap: 6px; }
      </style>
      <div class="bar">
        <button class="play-pause" title="Play">&#9658;</button>
        <button class="restart secondary" title="Restart">&#8635;</button>
        <div class="info">
          <div class="label">Listen to this article</div>
          <div class="caption"><span class="time-label">0:00 / ${this._estimatedLabel(totalSeconds)}</span></div>
          <div class="progress-track"><div class="progress-fill"></div></div>
        </div>
        <div class="controls">
          <select class="rate-select" title="Playback speed">
            <option value="0.75">0.75x</option>
            <option value="1" selected>1x</option>
            <option value="1.25">1.25x</option>
            <option value="1.5">1.5x</option>
            <option value="2">2x</option>
          </select>
        </div>
      </div>
    `;

    this._selectVoice();
  }

  _selectVoice() {
    // One consistent female voice, chosen automatically — no picker shown.
    const pick = () => this.speech.autoSelectFemaleVoice(document.documentElement.lang);
    pick();
    // Some browsers load voices asynchronously, so retry once they're ready.
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = pick;
    }
  }

  _wireEvents() {
    const playPauseBtn = this.shadow.querySelector(".play-pause");
    const restartBtn = this.shadow.querySelector(".restart");
    const rateSelect = this.shadow.querySelector(".rate-select");
    const fill = this.shadow.querySelector(".progress-fill");
    const timeLabel = this.shadow.querySelector(".time-label");
    const caption = this.shadow.querySelector(".caption");

    // Mutable because changing speed recalculates the estimate.
    let totalSeconds = this.speech.estimateSeconds(this.articleText, this.config.defaultRate || 1);
    // How many words were already spoken before the CURRENT speech
    // segment started. Needed because restarting mid-article (see
    // rateSelect below) starts a fresh utterance at word 0 internally.
    let baseWordIndex = 0;

    const updateProgressDisplay = () => {
      const totalWords = this.words.length || 1;
      const percent = Math.min(100, Math.round((this.currentWordIndex / totalWords) * 100));
      fill.style.width = `${percent}%`;
      const elapsed = Math.round((percent / 100) * totalSeconds);
      timeLabel.textContent = `${this._estimatedLabel(elapsed)} / ${this._estimatedLabel(totalSeconds)}`;
    };

    // Speaks the article starting at a given word. This one function
    // backs Play, Restart, Resume-after-pause, and applying a new speed
    // mid-article — the Web Speech API has no reliable native pause/resume
    // or on-the-fly rate change, so every one of those is really just
    // "stop, then re-speak from here."
    const playFromWord = (wordIndex) => {
      baseWordIndex = wordIndex;
      this.currentWordIndex = wordIndex;
      const remaining = this.words.slice(wordIndex).join(" ");
      if (remaining) {
        this.speech.play(remaining);
      } else {
        this.speech.stop();
      }
    };

    playPauseBtn.addEventListener("click", () => {
      if (this.speech.state === "playing") {
        this.speech.pause();
      } else if (this.speech.state === "paused") {
        playFromWord(this.currentWordIndex);
      } else {
        playFromWord(0);
      }
    });

    restartBtn.addEventListener("click", () => {
      // Always restart the FULL article from the top, even if a pause or
      // speed change earlier left the engine only holding the remaining tail.
      playFromWord(0);
    });

    rateSelect.addEventListener("change", (e) => {
      const rate = parseFloat(e.target.value);
      this.speech.setRate(rate);
      totalSeconds = this.speech.estimateSeconds(this.articleText, rate);

      // The Web Speech API ignores rate changes on an utterance that's
      // already speaking — the only way the new speed actually takes
      // effect is to stop and re-speak from here on, at the new rate.
      if (this.speech.state === "playing" || this.speech.state === "paused") {
        playFromWord(this.currentWordIndex);
      }
    });

    this.speech.onStateChange = (state) => {
      playPauseBtn.innerHTML = state === "playing" ? "&#10074;&#10074;" : "&#9658;";
      playPauseBtn.title = state === "playing" ? "Pause" : "Play";
    };

    this.speech.onWordBoundary = (wordIndex) => {
      this.currentWordIndex = baseWordIndex + wordIndex;
      updateProgressDisplay();
      if (this.config.highlightText) {
        const context = this.words
          .slice(Math.max(0, this.currentWordIndex - 2), this.currentWordIndex + 4)
          .join(" ");
        caption.textContent = context || "Reading…";
      }
    };

    this.speech.onEnd = () => {
      fill.style.width = "0%";
      timeLabel.textContent = `0:00 / ${this._estimatedLabel(totalSeconds)}`;
      caption.textContent = "";
      baseWordIndex = 0;
      this.currentWordIndex = 0;
    };
  }
}

if (typeof window !== "undefined" && !customElements.get("tts-widget")) {
  customElements.define("tts-widget", TTSWidget);
}

if (typeof window !== "undefined") {
  window.TTSWidget = TTSWidget;
}

/**
 * Auto-mount: the website owner never writes <tts-widget> HTML.
 * Including the bundled script is enough — the widget inserts ITSELF
 * at the exact spot the <script> tag was placed. So if the owner pastes
 * the script line right above their <h1>, the player appears right
 * above the headline; if they paste it at the end of the article, it
 * appears there instead.
 *
 * document.currentScript only points at the right tag while this file
 * is first executing, so we must capture it immediately — not inside
 * a later callback.
 */
const hostScript = typeof document !== "undefined" ? document.currentScript : null;

function mountWidget() {
  if (document.querySelector("tts-widget")) return; // don't double-mount
  const el = document.createElement("tts-widget");

  if (hostScript && hostScript.parentNode) {
    // Place the widget immediately after its own <script> tag.
    hostScript.parentNode.insertBefore(el, hostScript.nextSibling);
  } else {
    // Fallback (e.g. script was injected dynamically): append to body.
    document.body.appendChild(el);
  }
}

if (typeof window !== "undefined") {
  // Wait until the full page has been parsed so article detection can
  // see all the content, even content that comes after the script tag.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountWidget);
  } else {
    mountWidget();
  }
}
