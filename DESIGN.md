---
version: alpha
name: threadreel
description: A tool that turns a video into string art, for makers and creative coders; it should feel like a clean workbench with a board, pegs and a spool of thread on it.
colors:
  ground: "#f3f3f1"   # the primed board
  surface: "#ffffff"  # the canvas plate and the source thumbnail
  ink: "#000000"      # text and the thread; real black, not tinted
  muted: "#5a5a57"    # secondary text, 6.6:1 on ground
  pencil: "#c9c9c3"   # guide lines: borders, slider tracks, disabled text
  signal: "#c81e26"   # the red of a cotton reel; one job: the action and the selected peg
typography:
  display:
    fontFamily: Archivo
    fontSize: clamp(40px, 6vw, 72px)
    fontWeight: 800
    fontStretch: 72%
    letterSpacing: -0.02em
  body:
    fontFamily: Archivo
    fontSize: 17px
    lineHeight: 1.5
rounded:
  sm: 2px
  md: 2px
  peg: 999px
spacing:
  sm: 8px
  md: 20px
  lg: 56px
components:
  button-primary:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: 12px 18px
  button-secondary:
    backgroundColor: transparent
    textColor: "{colors.ink}"
    border: 1px solid {colors.ink}
    rounded: "{rounded.sm}"
    padding: 12px 18px
---

## Overview

threadreel converts a video into string art: pegs around a frame, one thread, thousands of straight
lines per frame. Its visitors are makers and creative coders who want to try it on their own clip and
save the result. The page is the tool first and an explanation second.

The look comes from the string artist's bench, not from "editorial" or "technical": a board primed
white, pencil guide marks, steel pegs, black cotton thread, and the paper label on a reel of red
sewing thread. Everything on the page is one of those four things: board, pencil, thread, label.

## Colors

- **Ground (#f3f3f1):** a primed MDF board. Neutral, not cream: the saturation is under 9%.
- **Surface (#ffffff):** the plate where the picture is strung, and nothing else.
- **Ink (#000000):** the thread. Also the text. 20:1 on ground. No tinted near-black anywhere.
- **Muted (#5a5a57):** pencil writing on the board. 6.6:1 on ground.
- **Pencil (#c9c9c3):** guide lines only: borders, slider tracks, the disabled state. Never text.
- **Signal (#c81e26):** the red thread on the reel. It has one job: the primary action (Begin, the
  selected choice, the focus ring, the pegs when they are shown). It is never used for decoration,
  headings, or a highlighted word.

## Typography

One family, Archivo, used through its width axis the way a spool label uses condensed capitals for
the number and normal width for the rest.

- Display (wordmark, section titles, the big numbers): Archivo at 72% width, weight 800, tight
  tracking. Sentence case always.
- Body (everything else, labels included): Archivo at 100% width, 400 and 600, 17px / 1.5.
- Numbers that a reader compares (the ledger, the flags table): tabular figures (`tnum`).
- Code: the platform monospace, only for commands and code. Monospace is never a label.

Scale: 72 / 40 / 24 / 17 / 15. The one loud place is the wordmark.

## Layout

A 12-column grid in a 1240px container with 32px gutters (16px under 680px). The one structural
idea: the studio comes first, full width, the canvas eight columns wide on the left like a board on a
bench and the controls four columns on the right like the kit's instruction sheet. Below it the
method is a single reading column (62ch) beside four frames of a real sequence; then the command
line reference as a spec table; then one paragraph of credits. No hero, no stats strip, no cards.

## Elevation & Depth

Flat. Nothing lifts. The canvas plate has a 1px pencil border and sits on the board; there are no
shadows, blurs or gradients anywhere.

## Shapes

2px radius on buttons and inputs. Pegs (slider thumbs, radio marks, the drawn pegs) are circles.
Everything else is square.

## Components

- **Header:** wordmark left, one-line description and three links right, a 2px ink rule below.
- **Buttons:** primary red with white text, secondary ink outline; both 2px radius, 12px 18px,
  body face 600. Hover darkens the red / fills the outline; focus-visible is a 2px red ring offset 3px.
- **Sliders:** a 1px ink track (the thread) with a 14px circular thumb, white with a 2px ink ring (a
  peg head). Label left, value right in tabular 600.
- **Choice lists (radios):** stacked labels with a 12px circular mark; the checked mark fills red.
- **Ledger:** two by two, numbers in display face 36px, labels in body 15px muted.
- **Footer:** a 1px pencil rule and one paragraph.

## Do's and Don'ts

- Do reuse the tokens above unchanged; add a token here before a page uses it.
- Do keep the signal red for actions and selection only.
- Don't change: the Archivo family, the red #c81e26, the real black ink.
- Don't use: SD1 cream and terracotta, SD2 near-black and a neon, SD3 hairlines-and-columns
  masthead cosplay, SD4 all-caps or mono labels and `·` meta strings, SD5 a coloured headline word,
  SD6 decorative numerals, CP3 arrow glyphs, I2 emoji icons, dark mode, drop caps, pull quotes.
