---
version: gamma
name: threadreel
description: A tool that turns a video into string art. Art Nouveau strung from straight chords — Mucha by way of a string artist.
colors:
  parchment: "#f2e9d8"  # page ground
  vellum: "#fbf6ec"     # frames and cards
  ink: "#2b2118"        # text, 13:1 on parchment
  muted: "#5e4b3a"      # secondary text, 7:1
  gilt: "#a87b2c"       # ornament and rules only (3.3:1, never text)
  gilt-text: "#7a5418"  # gold-coloured text, 5.6:1
  sage: "#4f6b4a"       # selected chips; white on sage 5.9:1
  sage-ink: "#3e5a3a"   # links, flag names
  madder: "#9c3b2f"     # the primary action, focus ring, slider pegs; vellum on madder 6.6:1
  forest: "#1f2a24"     # developer band and footer
  cream: "#efe6d2"      # text on forest and on the mount, 13:1
  gilt-light: "#d4a849" # ornament and accents on dark grounds, 7:1 on forest
  mount: "#1d1712"      # the arched mat around the canvas (the canvas itself stays #000)
typography:
  display: Federant — wordmark, section titles, preset names, step numerals, drop cap
  body: Fraunces — everything else; italic for the lede and captions; 18px / 1.6 (17px on phones)
  numerals: Fraunces 600, lining tabular figures (ledger, slider values)
  code: Courier Prime
---

## Overview

threadreel converts a video into string art: pegs around a frame, one thread, thousands of straight
lines per frame. Visitors are people who want a striking clip to post, and creative coders who want
the engine. The page sells the result in the first screen, then hands over the tool.

The concept: string art can only draw straight chords, yet curves appear where the chords pile up.
That curve is Art Nouveau's whiplash line, so every ornament is strung from straight chords between
pegs — the arch over the plate, the halo behind the wordmark, the leaf dividers, the frame corners and
the fan over the footer. `site/page.js` builds them once as SVG symbols (one path each) and reuses
them with `<use>`; the frame corner is a static data-URI in the stylesheet.

## Rules

- **The art is never touched.** Nothing is drawn over the canvas or the example images.
- **No ornament behind text.** Gilt is never a text colour; use `gilt-text`.
- **Contrast:** 4.5:1 for text, 3:1 for borders and the focus ring.
- **Targets:** 44px minimum.
- **Light on phones.** No `position: fixed` backgrounds, masks, filters, `backdrop-filter` or
  `will-change`. Ornaments stay a few hundred path segments in total. The studio caps its workers by
  a memory budget (smaller on touch devices), because every worker keeps its own line table.
- **Motion:** only the hero portrait stitching itself in. It stops under `prefers-reduced-motion`
  and behind the Pause motion button (remembered per browser).

## Layout

1. Header: wordmark, small-caps links divided by pegs, a peg rule below.
2. Hero: the halo behind the wordmark, an italic lede, the trust line, Make yours; the portrait in a
   small arched mount.
3. Studio: the canvas in an arched mount (sticky on desktop) beside one Settings frame in three
   numbered steps, with folded advanced settings and a Thread it / Stop bar pinned to its foot; then
   Save, the live command line, and the Ledger.
4. Examples: the 300 / 800 / 1,500 / 2,208 progression in arched mats, then other looks.
5. How it works: one frame with a drop cap, the second half folded.
6. For developers: a forest band of code frames with Copy buttons, then every flag (cards on phones).
7. Footer: the strung fan, the wordmark, credits.

## Components

- **Frame:** vellum, a gilt double rule (`border` + inset shadows), curve-stitch corners top left and
  right, a centred small-caps plaque between peg rules.
- **Buttons:** leaf-shaped (`border-radius: 22px 4px`), 48px. Primary madder with vellum text;
  secondary ink outline. Disabled: 45% opacity and a dashed border.
- **Choices:** leaf chips with a muted outline; selected is sage with white text.
- **Sliders:** a 1px ink thread with a gilt peg every tenth; the thumb is a madder peg ringed in vellum.
- **Code:** forest frames with a gilt-light rule, Courier Prime in cream, a small-caps Copy button.
