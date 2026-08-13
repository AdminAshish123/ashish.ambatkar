/**
 * ArticleDetector
 * Finds the main article/blog content on a page and extracts clean,
 * readable text — skipping navigation, ads, footers, comments, etc.
 *
 * Strategy:
 *   1. Try well-known selectors first (fast path).
 *   2. If that fails, fall back to a scoring heuristic that picks the
 *      block with the most real paragraph text relative to links/noise.
 *
 * Kept as its own module so the detection logic can be improved later
 * without touching the player or speech code.
 */

const KNOWN_SELECTORS = [
  "article",
  "main",
  ".post-content",
  ".entry-content",
  ".article-content",
  ".blog-content",
  "[itemprop='articleBody']"
];

const EXCLUDE_SELECTORS = [
  "nav",
  "aside",
  ".sidebar",
  ".advertisement",
  ".ad",
  ".ads",
  ".cookie",
  ".cookie-notice",
  ".related",
  ".related-posts",
  ".social",
  ".social-share",
  ".share",
  ".comments",
  "#comments",
  ".comment-section",
  "form",
  "button",
  "script",
  "style",
  "noscript",
  "iframe",
  ".widget",
  ".newsletter",
  // Site-wide chrome specifically — NOT a bare "header"/"footer" tag.
  // Those are also valid HTML5 wrappers for an article's OWN byline or
  // tag list (e.g. <article><header><h1>...</h1></header>...</article>
  // is a completely standard blog pattern), and stripping them was
  // silently deleting real titles and bylines along with the real chrome.
  ".site-header",
  ".site-footer",
  ".navbar",
  "[role='banner']",
  "[role='navigation']",
  "[role='contentinfo']"
];

function cleanElementText(root) {
  // Clone so we don't touch the live page when stripping unwanted nodes.
  const clone = root.cloneNode(true);
  EXCLUDE_SELECTORS.forEach((selector) => {
    clone.querySelectorAll(selector).forEach((el) => el.remove());
  });

  // NOTE: intentionally textContent, not innerText. innerText depends on
  // the element actually being laid out on screen — but this clone is
  // detached from the document, so innerText is empty/unreliable across
  // browsers (this was silently dropping content, including headlines).
  // textContent has no such requirement and works deterministically here.
  const text = clone.textContent || "";
  return text.replace(/\s+/g, " ").trim();
}

function scoreElement(el) {
  const text = cleanElementText(el);
  const paragraphCount = el.querySelectorAll("p").length;
  const linkTextLength = Array.from(el.querySelectorAll("a"))
    .reduce((sum, a) => sum + (a.innerText || "").length, 0);

  // Reward real prose, penalize link-heavy (likely nav/list) blocks.
  const score = text.length + paragraphCount * 50 - linkTextLength;
  return { text, score };
}

function detectArticle(doc = document) {
  // 1. Fast path: known content selectors.
  for (const selector of KNOWN_SELECTORS) {
    const el = doc.querySelector(selector);
    if (el) {
      const text = cleanElementText(el);
      if (text.length > 200) {
        return { element: el, text };
      }
    }
  }

  // 2. Fallback: score candidate containers and pick the best one.
  const candidates = doc.querySelectorAll("div, section");
  let best = null;

  candidates.forEach((el) => {
    // Skip tiny or clearly excluded containers early.
    if (el.closest(EXCLUDE_SELECTORS.join(","))) return;
    const { text, score } = scoreElement(el);
    if (text.length < 200) return;
    if (!best || score > best.score) {
      best = { element: el, text, score };
    }
  });

  return best ? { element: best.element, text: best.text } : null;
}

if (typeof window !== "undefined") {
  window.TTSArticleDetector = { detectArticle };
}
