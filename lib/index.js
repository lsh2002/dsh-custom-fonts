import z from '@deepseek-ai/schemastery'

/**
 * dsh-custom-fonts — host half.
 *
 * Owns the settings schema only. Every visible behaviour lives in the browser
 * half (./client); this half exists so the plugin's preferences can be stored
 * in the Host settings document instead of being lost on reload.
 *
 * Three things make the namespace appear at all, and all three are load-bearing:
 *   - `name`   — the loader's runtime identity for this plugin;
 *   - `inject` — left empty on purpose. Declaring `settings` here would make
 *                 this plugin's fiber wait for the settings service before it
 *                 could activate, and a fiber that never activates never runs
 *                 `apply`. The browser half claims the form lazily instead.
 *   - `Config` — read as `entry.fiber.runtime.Config`; without it the settings
 *                 service skips this entry entirely.
 *
 * Every field is `.volatile()`: the settings form is projected from volatile
 * fields only, so an unmarked field produces no form at all.
 */

/** Loader runtime identity for this plugin. */
export const name = 'dsh-custom-fonts'

/** No host-side service dependencies; see the note on `inject` above. */
export const inject = []

/** Settings namespace owned by this plugin (equals its loader entry id). */
export const FONT_SETTINGS_NAMESPACE = 'dsh-custom-fonts'

/**
 * Stored preferences. An empty string means "use the product default"; a size
 * offset of 0 means "do not adjust".
 */
export const Config = z.object({
  en: z.string().default('').volatile(),
  zh: z.string().default('').volatile(),
  code: z.string().default('').volatile(),
  size: z.number().default(0).volatile(),
})

/**
 * Host half: no behaviour of its own beyond claiming its settings presentation.
 *
 * The settings service derives a form from `Config` automatically. This plugin
 * renders its own page, so `auto: false` suppresses the duplicate auto-generated
 * one; it only flips `autoGenerate` on the descriptor, so the schema and values
 * the browser half reads stay served. The claim goes through a child fiber
 * because `inject` must stay empty (see above).
 * @param ctx - host plugin context.
 */
export function apply(ctx) {
  ctx.inject(['settings'], (child) => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber), 'dsh-custom-fonts: own settings page')
  })
}
