# Texans Wallpaper Studio

A fan picks a photo, picks their device, picks a template, and gets a
wallpaper cut to that screen's exact pixels.

Static, client-side, no build step. **A fan's own photo never leaves their
device** — everything composites in a canvas in their browser.

## Run it

```sh
npm install      # sharp, for the library tool only
npm start        # serves on http://localhost:8080
```

Open `http://localhost:8080`. Serve over HTTP rather than opening the file
directly; ES modules and canvas behave differently on `file://`.

## The weekly photo drop

1. Put this week's frames in `library/photos/` (tuned for ~100).
2. `npm run library`

The manifest, thumbnails and display derivatives are generated, not committed
— run `npm run library` once after a fresh clone or the picker will be empty.
`npm run deploy` does it for you.

That writes 400px thumbnails to `library/thumbs/` and regenerates
`library/manifest.json`, which the studio reads on load. Filenames become
titles, so `stroud-td-week04.jpg` shows as "Stroud TD Week04".

The editorial cull is the quality gate. The studio wants 20–40 strong frames
a week, not everything the shooters filed.

## What's in here

| Path | |
| --- | --- |
| `index.html` | the studio shell |
| `src/devices.js` | device presets and lock/home safe zones |
| `src/templates.js` | the five wallpaper templates |
| `src/compose.js` | canvas primitives, fonts, image decode |
| `src/app.js` | UI wiring |
| `tools/build-library.mjs` | weekly library build |
| `.claude/agents/studio-qa.md` | the QA agent that stress-tests this |

## Design rules the templates hold to

From the Houston Texans design system (Steel identity):

- Display type is always uppercase, Black cut, tight leading.
- `//` separates. `★` is the only decorative glyph. Never emoji.
- Type over photography gets a **scrim**, never a rounded translucent box.
- Square corners. Red is emphasis, never a large field except the ticker.
- **No sponsor mark is ever baked into the exported file.** A wallpaper is
  lived with, not shared, and nobody puts a sponsor's logo on their lock
  screen. Sponsor the studio page and the weekly drop notification instead.

## Two things worth knowing

**Lock and home are different designs, not one file.** Different safe zones,
different focal placement. Toggle "show clock & widget zones" to see what the
OS will cover.

**Compose for the iOS depth effect.** When a subject is cleanly separated,
iOS tucks the clock behind it. A wallpaper where a helmet crosses in front of
the time reads as a different class of product. Worth testing on real
handsets — it is finicky about widgets and subject size.

## Not done yet

- Team library ships with two brand plates as placeholders; real player
  photography replaces them via the weekly drop.
- "Save to my collection" (the identity capture moment) is not built.
- Export is JPEG at q94. PNG option for flat-art templates is open.
