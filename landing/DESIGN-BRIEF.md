# ClaudeKeeper landing page — shared design brief

You are building ONE section of a single-page marketing site for **ClaudeKeeper**.
All sections share the design system in `landing/base.css` (already written — READ IT
FIRST). The look is an editorial "proofreader's pen" aesthetic in the warm Anthropic
palette: ivory text on warm ink, a terracotta/clay "pen" red accent, the **Sentient**
serif for editorial voice, the **Gambarino** wordmark, a subtle grain substrate, and
bespoke proofreader marks (a red strike through the wrong word, a caret ‸, an italic
insertion). It must feel like Anthropic's Claude brand: warm, calm, precise, honest.

## Reuse the existing class vocabulary — do NOT invent a new visual language

From `base.css`, these are available and you SHOULD use them:

- Layout: `.wrap` (max-width + gutter), `.shell`, `.grain`
- Type: `.serif`, `.mono`; CSS vars `--serif` (Sentient), `--wordmark` (Gambarino),
  `--sans`, `--mono`
- Color tokens: `--ink`, `--ink-raised`, `--ink-floor`, `--ivory`, `--taupe`,
  `--taupe-dim`, `--pen`, `--pen-light`, `--pen-deep`, `--paper`, `--paper-hi`,
  `--paper-lo`, `--paper-ink`, `--paper-mut`
- Marks: `.strike` (red pen line through text — struck-out wrong default),
  `.ins` (italic pen-light insertion, pair with a `.caret`), `.caret` (inline SVG mark)
- Buttons: `.stamp` (chamfered stamped action, `.stamp.sm` smaller)
- Sections already styled: `.nav`, `.hero` (+ `.hero-h1 .hero-lower .hero-note
  .paper-stage .paper .paper-head .paper-body .marginal`), `.manifesto` (+ `.man
  .man-lead .man-p .man-em .man-beat .becomes .why .branch .man-close .man-tag`),
  `.agents` (+ `.sec-lead .sec-sub .logo-row .agent .install .path .copy`), `.cta`
  (+ `.cta-in .cta-h .cta-side`), `.foot` (+ `.foot-top .foot-say .foot-group
  .foot-label .colophon`)

The caret SVG markup used inline everywhere is:
`<svg class="caret" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 9 L6 3 L10 9"/></svg>`

If a section needs a little extra CSS, add a scoped `<style>` block at the TOP of your
fragment using the SAME tokens — additive only, no overriding base rules, no new fonts,
no new colors outside the tokens.

## The product (facts — do not invent features)

**ClaudeKeeper** — "Keep Claude working." A local macOS supervisor that keeps your Mac
awake — even with the lid closed — so Claude Code keeps running when you step away.

The honest story (this is the emotional core — use the pen metaphor):

- Claude Code is tied to your terminal and your Mac's power state. Close the laptop and
  macOS sleeps; the session **stalls**. Nothing outside that window keeps it alive.
- ClaudeKeeper is a tiny local daemon. It holds a sleep assertion so the Mac never
  idle-sleeps, and — the part that actually matters — it runs `sudo pmset -a
  disablesleep 1` so the machine stays **fully awake with the lid shut**: screen off,
  CPU and your Claude process still running.
- Be honest, don't oversell: an ordinary sleep assertion (caffeinate / IOKit) does NOT
  override lid-close sleep — only `pmset disablesleep` does, which is why it asks for
  sudo once. And a closed Mac that never sleeps makes heat: run on AC, don't cook it in
  a bag. Telling the truth is the brand.

The proofreader metaphor to lean on: strike the wrong state, insert the right one.
e.g.  ~~Close the lid and Claude stops.~~ → *Claude keeps working.*
      ~~asleep~~ *awake* · ~~paused~~ *running* · ~~"probably fine"~~ *actually running*

**Commands (the entire surface — there are only three):**
- `claudekeeper daemon start`  — start the daemon; keep the Mac awake, lid closed included
- `claudekeeper daemon stop`   — stop and restore normal sleep
- `claudekeeper uninstall`     — stop, restore sleep, remove it
- flag: `claudekeeper daemon start --no-lid` — idle-sleep only, no sudo

**Install:** `npm install -g @rangan23/claudekeeper` — macOS, Node 24+.
On start it prints the port it serves on (default `http://localhost:7642`, an optional
dashboard).

**Links:**
- GitHub: https://github.com/TaxCollector23/claudekeeper
- npm: https://www.npmjs.com/package/@rangan23/claudekeeper
- License: MIT

## Output rules

- Write a single self-contained HTML fragment (no `<html>/<head>/<body>`) to the path
  you're told. Start with an optional scoped `<style>`, then the section markup.
- Use real, specific copy — no lorem, no placeholder links. Wire the real GitHub/npm URLs.
- Accessible: real headings, `aria-hidden` on decorative SVGs, sufficient contrast,
  keyboard-focusable interactive elements, respect `prefers-reduced-motion`.
- Responsive: must hold up from 360px to 1440px. Use the existing responsive patterns.
- Do NOT modify base.css or any file outside your assigned fragment path.
