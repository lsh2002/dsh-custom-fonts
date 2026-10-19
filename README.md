# dsh-custom-fonts

Customize the **Chinese** and **English** fonts, the **code font**, and the **global font size** of the DeepSeek Harness Web UI — right from a settings page, with a live preview. Your choices are stored in the Host settings document, so they survive a page reload and a restart.

[中文说明](README.zh-CN.md)

## What it does

Once installed it adds a **Fonts (字体)** page under **Settings**:

- **UI font · English** — used for Latin characters. (Maple Mono Normal NL CN, Segoe UI, Arial, Georgia…)
- **UI font · Chinese** — used for Han characters. (Maple Mono Normal NL CN / 微软雅黑 / 宋体 / 黑体 / 楷体 / 思源黑体 / 苹方…)
- **Code font** — a separate mono face for code blocks and inline code (`pre`/`code`/`kbd`/`samp`). (Maple Mono Normal NL CN, Consolas, JetBrains Mono, Fira Code, Cascadia Code, Sarasa Mono SC…)
- **Font-size offset** — a -4..+8 px global slider; kernel text stays sharp, no layout blow-up (see below).
- **Live preview** — mixed Chinese/English UI sample plus a code-font sample render as you type (comma-separated font lists and free-form names are both supported).
- **Reset** — clears every control, removes all injected styles, and clears the stored overrides.

## How it works

The plugin injects one global stylesheet:

```css
:root { --dsh-custom-fonts-en: 'English'; --dsh-custom-fonts-zh: 'Chinese'; }
body, body * { font-family: 'English font', 'Chinese font' !important; }
pre, code, kbd, samp { font-family: 'Code font' !important; }
body, body * { font-size: calc(1em + 2px) !important; }  /* when offset ≠ 0 */
```

- The font-family fallback chain is the standard way to split fonts by script: Latin characters match the English font first, and Han characters — which the English font has no glyphs for — fall back to the Chinese font. No language detection, no DOM surgery.
- The code-font rule comes later and wins inside code regions only.
- The size offset applies `calc(1em ± Npx)` **relative to each element's own size**, so every nesting level shifts by exactly N — no exponential cascade. Clearing it (0) restores the default.

Changes apply immediately and globally (message body, sidebar, inputs, everything).

## Persistence

The host half declares a volatile `Config` — `en`, `zh`, `code`, `size` — and the Loader entry id becomes the settings namespace. The browser half reads and writes it through `ctx.configForms.get('dsh-custom-fonts')`, so the Host settings document is the single source of truth:

- values are adopted on load and applied before you touch anything;
- edits are coalesced (250 ms) into one atomic write per burst;
- clearing a control clears the stored field instead of writing an empty string, so the profile patch only carries real overrides;
- a refused write shows a message and re-reads the document, so the controls never display a value that was not stored.

When the settings service is not served (an older Host, or a non-loopback connection), the page still works for the current view and says that the change will not survive a reload.

## Install

From the plugin market (Settings → **Plugin Market**) once the entry is published, or:

```sh
dsh plugin --profile web add dsh-custom-fonts
```

or directly from the repository:

```sh
dsh plugin --profile web add github:lsh2002/dsh-custom-fonts
```

After a page refresh it is live — no restart required. Replacing an already-installed version needs a restart so the Host loads the new JavaScript generation.

## Uninstall

Remove it from **Settings → Plugins → Plugin configuration** (or `dsh plugin --profile web remove dsh-custom-fonts`), refresh the page; your fonts are reverted automatically.

## Development

```sh
pnpm install
node scripts/verify.mjs
```

`verify.mjs` is a zero-dependency harness: it imports the host half, loads the browser bundle against a fake `__ModuleLoader__` and Cordis context, and drives the settings page headlessly (adoption, page/state agreement, write coalescing, `unset` on clear, reset, refusal recovery, read-only notice).

## License

MIT
