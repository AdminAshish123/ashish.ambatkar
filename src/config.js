/**
 * Default widget configuration.
 * When the configurator site generates a download, it overwrites
 * these values (color, borderRadius) and bakes the result straight
 * into the bundled dist file — the website owner never edits this.
 */
const TTS_CONFIG = {
  color: "#2563EB",       // main UI color
  borderRadius: "12px",   // corner radius of the player
  position: "bottom-right", // where the player docks on the page
  defaultRate: 1,          // default playback speed (0.5 - 2)
  highlightText: true      // highlight words as they're read
};

// Exposed for other modules (widget.js, speech.js) to read.
if (typeof window !== "undefined") {
  window.TTS_CONFIG = window.TTS_CONFIG || TTS_CONFIG;
}
