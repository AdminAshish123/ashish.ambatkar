/**
 * Builds a single, fully self-contained HTML file for pasting into
 * Framer's "Embed" component (Insert -> Embed -> Paste Code).
 *
 * Framer's HTML paste can't fetch external CSS/JS/image files, so this
 * script inlines everything from /website into one file:
 *   - styles.css  -> <style> block
 *   - config.js, speech.js, widget-template.js, app.js -> one <script> block
 *   - assets/listenly-logo.png -> base64 data: URI
 *
 * Run: node build-embed.js   (after running "node build.js" first)
 */
const fs = require("fs");
const path = require("path");

const SITE_DIR = path.join(__dirname, "website");
const OUT_DIR = path.join(__dirname, "framer-embed");
const OUT_FILE = path.join(OUT_DIR, "listenly-embed.html");

function build() {
  let html = fs.readFileSync(path.join(SITE_DIR, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(SITE_DIR, "styles.css"), "utf8");
  const scriptOrder = ["config.js", "speech.js", "widget-template.js", "app.js"];
  const js = scriptOrder
    .map((f) => `/* ---- ${f} ---- */\n` + fs.readFileSync(path.join(SITE_DIR, f), "utf8"))
    .join("\n");

  const logoBuf = fs.readFileSync(path.join(SITE_DIR, "assets", "listenly-logo.png"));
  const logoDataUri = `data:image/png;base64,${logoBuf.toString("base64")}`;

  // 1. Inline the stylesheet.
  html = html.replace(
    '<link rel="stylesheet" href="styles.css" />',
    `<style>\n${css}\n</style>`
  );

  // 2. Inline all four scripts as one block, right where app.js was.
  html = html.replace(
    /<script src="config\.js"><\/script>[\s\S]*?<script src="app\.js"><\/script>/,
    `<script>\n${js}\n</script>`
  );

  // 3. Inline the logo as a data URI (appears twice: nav + footer).
  html = html.split('src="assets/listenly-logo.png"').join(`src="${logoDataUri}"`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, html, "utf8");
  console.log(`Built ${path.relative(__dirname, OUT_FILE)} (${(html.length / 1024).toFixed(1)} KB)`);
}

build();
