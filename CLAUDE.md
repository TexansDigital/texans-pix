# Texans Wallpaper Studio

Client-side wallpaper composer. Static files, no framework, no build step.
ES modules served over HTTP.

## Hard rules

- **A fan's own photo never leaves the device.** No uploads, no POSTs, no
  remote image processing of user-supplied files. This is a product promise
  and a privacy posture, not an optimisation.
- **One canvas at real device pixels**, scaled down with CSS for preview. The
  export must be byte-identical to what the fan sees. Never export by
  upscaling a preview.
- **Guides are preview-only.** `render(false)` before reading the canvas.
- **No sponsor mark in an exported wallpaper.** Sponsorship lives on the page.

## Brand

Houston Texans "Steel" identity. Tokens in `assets/brand/tokens.css`.
Battle red `#eb0028`, red hot `#ff0000` for display type on dark art, deep
steel `#021118`, H-Town blue `#0080c6` for the alternate register.
HelveticaNeueLT Extended (500/700/800/900) for display, always uppercase.
Azeret Mono at 12px / 0.18em for stamps. Square corners; pill radius is for
tags only. Scrims over photography, never capsules.

Canvas falls back to Arial silently if a face has not loaded — always await
`loadFonts()` before drawing. All five faces are self-hosted in `assets/fonts`;
Azeret Mono is a variable font declared `font-weight: 100 900`, so nothing is
fetched from a third party at runtime and a stamp drawn at 500 is really 500.

## Testing

Use the `studio-qa` agent (`.claude/agents/studio-qa.md`) after changing
compositing, templates, devices, export, or the library pipeline. It drives
the real app in headless Chromium and reads canvas pixels rather than
eyeballing screenshots.

`window.__studio` exposes `state`, `render`, `useSource`, `setDevice`,
`setTemplate`, `setSurface` and `setFields` so tests can drive the app
without clicking through the UI.

Chromium: `/opt/pw-browsers/chromium`. Serve with `npm start` (port 8080).

## The fan list

One server-side surface: `POST /api/join` in `worker/index.js`, writing to D1.
Everything else is still static assets served by the same Worker.

- **The download is never gated.** The opt-in is offered after a wallpaper is
  actually saved, and declining costs the fan nothing. The page says "Free. No
  sign-in, no email" and that has to stay true.
- **Consent is a ticked box and the wording travels with it.** `CONSENT_TEXT`
  in `src/join.js` is sent with every signup and stored on the row, so a fan's
  consent is legible later even after the wording changes.
- **Request bodies are capped at 2KB** in the Worker. That is the enforcement
  of the photo rule above: there is no code path that accepts an image, and the
  cap means one cannot arrive by accident. `tests/15-join.mjs` audits every
  request a full session makes and fails on any image bytes, data: URI, long
  base64 run, or off-origin call.
- **No raw IP is stored.** The abuse throttle keys on a salted SHA-256.

`npm run list` exports the list as CSV. `npm run migrate` applies migrations.
