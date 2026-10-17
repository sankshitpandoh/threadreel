---
version: beta
name: threadreel
description: A tool that turns a video into string art. Maximalist vaporwave — a neon dusk strung from straight chords, with the studio as a glowing desktop program.
colors:
  void: "#0b0420"     # page background
  dusk: "#1a0b3d"     # status bars
  panel: "#24104f"    # window bodies; all reading text sits on this or darker
  panel-2: "#2d1660"  # secondary buttons, upload tile
  well: "#05010f"     # code, ledger, choice chips
  edge: "#3d2475"     # borders and table rules
  chrome: "#f1ecff"   # body text, 15:1 on panel
  muted: "#b3a6e0"    # secondary text, 7:1 on panel
  hot: "#ff2bd6"      # selection, slider thumbs, the horizon (never small text)
  hot-text: "#ff71ce" # magenta when it is text
  cyan: "#2de2e6"     # focus ring, values, links
  sun: "#ffb000"      # defaults, step numbers, stickers
  violet: "#7b2ff7"   # hard text shadows
gradients:
  sun: "linear-gradient(180deg, #ffe259, #ff7a59 48%, #ff2bd6)"   # primary buttons, the sun
  title: "linear-gradient(90deg, #a3128a, #4b1cb0 55%, #0e6f86)" # window title bars, white text passes on every stop
typography:
  wordmark: Monoton 400, clamp(34px, 7vw, 112px), chrome gradient fill + violet offset copy
  display: Syncopate 700, uppercase, section titles, steps, stickers, the marquee
  body: IBM Plex Sans 400/600, 17px / 1.55 (16px on phones)
  pixel: DotGothic16, window titles, legends, ledger labels, katakana
  lcd: VT323, every number a reader watches (slider values, ledger, time)
  code: IBM Plex Mono 14px
---

## Overview

threadreel converts a video into string art: pegs around a frame, one thread, thousands of straight
lines per frame. Visitors are people who want a striking clip to post, and creative coders who want
the engine. The page sells the result in the first screen, then hands over the tool.

The concept: the vaporwave sunset grid already is string art. The floor is threads strung from pegs
on the horizon to pegs along the bottom edge; the sun is a circular frame of 48 pegs, each strung to
the peg 17 along. Around that sky the studio and every other block is a window on a 90s desktop.

## Rules

- **The art is never touched.** No glow, tint, blend, scanline or filter over the canvas or the
  example images. Neon lives only in the frame around them.
- **Text sits on solid panels.** Gradients, grids and the sky carry no reading text. Gradient text is
  only for the wordmark.
- **Display faces never carry anything you operate.** Labels, values, prose and the flags table use
  Plex Sans, Plex Mono or VT323 numerals.
- **Contrast:** 4.5:1 for text, 3:1 for borders, tracks and the focus ring. Use `hot-text`, not `hot`,
  for magenta text.
- **Targets:** 44px minimum (chips, radios, checkboxes, transport button, taskbar links).
- **Motion:** at most three loops: the floor bands, the marquee, the hero portrait stitching in. All
  stop under `prefers-reduced-motion`, behind the Pause motion button (remembered per browser), and
  while a render runs (`body.is-rendering`). Animate transform and opacity only.

## Layout

1. Hero: taskbar nav, wordmark, one value line, README.TXT dialog with the trust line, Make yours,
   and MONALISA.EXE stitching itself in. Stickers in the corners (in a row on phones).
2. Marquee.
3. Studio: THREADREEL.EXE (canvas, transport, caption; sticky on desktop) beside SETTINGS.INI in three
   steps (clip, look, tune, with Thread & detail and Timing folded), STATS.DAT, EXPORT.EXE and the
   live command line. The Thread it / Stop bar sticks to the bottom of the settings window.
4. Examples: the 300 / 800 / 1,500 / 2,208 progression as tilted windows, then other looks.
5. How it works: METHOD.TXT, the second half folded.
6. For developers: terminal windows with Copy buttons, then FLAGS.CSV (cards on phones).
7. Footer: one window over a checkerboard floor.

## Components

- **Window:** `panel` body, 2px bevel (`#7a5ad0` / `#0a0320`), 8px hard black shadow, title bar in the
  title gradient with DotGothic16 white text and decorative `_ □ ×` (aria-hidden).
- **Primary button:** sun gradient, `void` text, 4px cyan hard shadow, presses down 3px.
- **Secondary button:** `panel-2` with a bevel. Disabled: 45% opacity, dashed border, no shadow.
- **Choices:** chips on `well` with a 2px `edge` border; checked is a `hot` border, tint and glow.
- **Sliders:** cyan-to-magenta track, white peg thumb with a `hot` ring.
- **Code:** `well` background, Copy button in the title bar copies the code text only.
