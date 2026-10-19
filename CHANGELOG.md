# Changelog

All notable changes to this project are documented in this file.

## [1.2.0] - 2026-10-19

Fixes the persistence work proposed in
[PR #1](https://github.com/lsh2002/dsh-custom-fonts/pull/1), which never
landed upstream. The Host-document schema is kept; the browser half is
reworked so the round trip actually holds.

### Fixed

- **The settings page showed stale values after a reload.** The adopted values
  were written to the CSS only; the page's React state kept the pre-adoption
  defaults, so a restart looked like the fonts had been lost even when the
  document held them. One frozen snapshot now drives both the stylesheet and
  the page, and the page subscribes to it.
- **Every keystroke wrote the settings document.** Writes are now coalesced
  into one atomic `mutate` per 250 ms burst, so typing a font name costs one
  profile-patch write instead of one per character.
- **A rejected write left the page lying.** A refusal or a transport error now
  surfaces a message and re-reads the form, so the controls never show a value
  the document did not store.
- **`configForms` was a hard dependency.** Declaring it in `inject` disabled
  the whole plugin when the service was absent (older Host, non-loopback
  connection). It is now a soft `ctx.inject`; without it the page still applies
  fonts for the current view and says that the change will not survive a
  reload.

### Changed

- Clearing a control writes `unset` rather than an empty string, so the profile
  patch only carries real overrides.
- `@deepseek-ai/schemastery` is a runtime dependency of the host half, so the
  schema resolves from the plugin's own package instead of the Host.
- The font suggestions list `Maple Mono Normal NL CN` first, and duplicate
  entries in a font list are dropped.

### Added

- `scripts/verify.mjs` now exercises the persistence contract headlessly:
  adoption on load, page/state agreement, one write per burst, `unset` on
  clear, reset, refusal recovery, and the read-only notice.

## [Unreleased]

### Added

- **Preferences persist.** The four settings (UI English font, UI Chinese font,
  code font, size offset) are stored in the Host settings document under the
  `dsh-custom-fonts` namespace and re-applied on load, so they survive a page
  reload and a restart. Previously they lived only in the bundle closure and
  were lost on every reload.
- A minimal host half: it declares the settings schema (`Config`, every field
  `.volatile()`) and nothing else. `inject` is deliberately empty — declaring
  `settings` there would make the plugin's fiber wait for the settings service
  and never activate.

### Changed

- The browser half injects `configForms` and reads the namespace through
  `configForms.get('dsh-custom-fonts')`; each control writes its value back
  through the same form. Live application is unchanged — edits still take
  effect immediately.

## [1.1.0] - 2026-08-24

### Added

- **Code font**: a separate mono face for `pre`/`code`/`kbd`/`samp` regions (Consolas, JetBrains Mono, Fira Code, Cascadia Code, Sarasa Mono SC …), overriding the UI stack inside code regions.
- **Global font-size offset**: a -4..+8 px slider; implemented as `calc(1em ± Npx)` relative to each element's own size, so the shift stays flat across nesting (no cascade blow-up). Zero restores the default.
- Separate code-font preview line on the settings page.

### Changed

- Settings page labels now distinguish **UI fonts (English / Chinese)** from the **code font**; the reset button clears all four controls.

## [1.0.0] - 2026-08-24

### Added

- Settings page **Fonts (字体)** under Settings: customize the UI's English font and Chinese font independently.
- Live mixed Chinese/English preview that renders with the current font stack as you type.
- Comma-separated font lists and free-form font names (with common-font suggestions via `<datalist>`).
- Global stylesheet injection via a CSS `font-family` fallback chain: Latin characters run through the English font, Han characters fall back to the Chinese font — no language detection.
- **Restore defaults** button that clears both fields and removes every injected style.
- Pure client-side plugin: no host behavior, applies on page refresh, unloads cleanly.
