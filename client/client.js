/**
 * dsh-custom-fonts — client bundle.
 *
 * Customizes the global UI fonts on a settings page:
 *   - "UI fonts":  "英文字体 / English font" for Latin characters and
 *     "中文字体 / Chinese font" for CJK glyphs, resolved through a CSS
 *     font-family fallback chain (English first, so Latin runs through the
 *     English font and Han characters fall back to the Chinese one — the
 *     standard way to split fonts by script without any language detection);
 *   - "代码字体 / code font": a separate mono face for `pre`/`code`/`kbd`/
 *     `samp` regions, applied with priority over the UI stack;
 *   - "字体大小偏移 / font-size offset": a global px offset (range -4..+8)
 *     applied as `calc(1em + Npx)` relative to each element's own size —
 *     every level shifts by exactly N, so there is no cascade blow-up.
 *
 * Pure client-only plugin (host half is a no-op entry for the bundle
 * manifest): the market shim-mounts it, changes apply on page refresh, no
 * restart.
 *
 * Bundle shape follows the official client-modules contract:
 *   window.__ModuleLoader__.load({ id, factory })
 * The factory's only external is `react` from the loader module table.
 */
window.__ModuleLoader__.load({
  id: 'dsh-custom-fonts',
  factory: (require) => {
    const { createElement, useState } = require('react')

    // Font state lives in the bundle closure so it survives settings-page
    // navigation. Empty font means "use the product default"; size 0 means
    // "no offset".
    const state = { en: '', zh: '', code: '', size: 0 }
    let styleTag = null

    // The settings form for our namespace, captured in apply(). Writes go
    // through it so values are persisted by the Host rather than kept in the
    // bundle closure (which is rebuilt on every page load).
    let writeForm = null

    /** Persist one field; ignore the write until the form is available. */
    function persist(patch) {
      if (writeForm === null) return
      for (const [key, value] of Object.entries(patch)) writeForm.set(key, value)
    }

    const EN_FONTS = [
      'Segoe UI', 'Arial', 'Helvetica', 'Georgia', 'Times New Roman',
      'Courier New', 'Consolas', 'Verdana', 'Calibri',
    ]
    const ZH_FONTS = [
      '微软雅黑', 'Microsoft YaHei', '宋体', 'SimSun', '黑体', 'SimHei',
      '楷体', 'KaiTi', '仿宋', 'FangSong', '思源黑体', 'Noto Sans CJK SC',
      '苹方', 'PingFang SC',
    ]
    const CODE_FONTS = [
      'Consolas', 'Courier New', 'Menlo', 'Monaco', 'SF Mono',
      'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Source Code Pro',
      'DejaVu Sans Mono', 'Sarasa Mono SC', '等距更纱黑体',
    ]

    // Turn user input (comma-separated font lists allowed) into quoted CSS.
    function quoteList(str) {
      return String(str || '').split(',').map((s) => s.trim()).filter((s) => s.length > 0).map((s) => {
        if (/^['"]/.test(s) && /['"]$/.test(s)) return s
        return "'" + s.replace(/['"]/g, '') + "'"
      }).join(', ')
    }

    // The global font CSS. Order matters:
    //   1. UI stack (latin → chinese fallback)
    //   2. code stack, later and equally specific, wins inside code regions
    //   3. size offset, relative to each element's own size
    function buildCss(o) {
      const enQ = quoteList(o.en)
      const zhQ = quoteList(o.zh)
      const codeQ = quoteList(o.code)
      const offset = Number(o.size) || 0
      const rules = []
      const vars = []
      if (enQ) vars.push('--dsh-custom-fonts-en: ' + enQ)
      if (zhQ) vars.push('--dsh-custom-fonts-zh: ' + zhQ)
      const uiStack = [enQ, zhQ].filter(Boolean).join(', ')
      if (uiStack) {
        rules.push('body, body * { font-family: ' + uiStack + ' !important; }')
      }
      if (codeQ) {
        rules.push('pre, code, kbd, samp { font-family: ' + codeQ + ' !important; }')
      }
      if (offset !== 0) {
        const sign = offset > 0 ? '+' : '-'
        rules.push('body, body * { font-size: calc(1em ' + sign + ' ' + Math.abs(offset) + 'px) !important; }')
      }
      if (rules.length === 0) return null
      return (vars.length > 0 ? ':root { ' + vars.join('; ') + '; }\n' : '') + rules.join('\n')
    }

    // Apply or revert everything: replaces the injected <style> each time.
    function applyFonts(next) {
      Object.assign(state, next)
      if (styleTag !== null) { styleTag.remove(); styleTag = null }
      const css = buildCss(state)
      if (css !== null) {
        const tag = document.createElement('style')
        tag.setAttribute('data-dsh-custom-fonts', '')
        tag.textContent = css
        document.head.appendChild(tag)
        styleTag = tag
      }
    }

    const fieldLabelStyle = {
      display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6,
      color: 'var(--dsw-alias-label-primary)',
    }
    const inputStyle = {
      width: '100%', boxSizing: 'border-box', padding: '8px 10px',
      borderRadius: 8, border: '1px solid var(--dsw-alias-border-l2)',
      background: 'var(--dsw-alias-bg-layer-2)', color: 'var(--dsw-alias-label-primary)',
      fontSize: 14, outline: 'none',
    }

    function Field(props) {
      return createElement('div', { style: { marginBottom: 14 } },
        createElement('label', { style: fieldLabelStyle }, props.label),
        createElement('input', {
          type: 'text', list: props.listId, value: props.value,
          placeholder: props.placeholder, onChange: props.onChange,
          style: inputStyle,
        }),
        createElement('datalist', { id: props.listId },
          props.options.map((name) => createElement('option', { key: name, value: name }))
        ),
      )
    }

    function FontPage() {
      const [en, setEn] = useState(state.en)
      const [zh, setZh] = useState(state.zh)
      const [code, setCode] = useState(state.code)
      const [size, setSize] = useState(state.size)
      const uiStack = [quoteList(en), quoteList(zh)].filter(Boolean).join(', ')
      const codeQ = quoteList(code)
      return createElement('div', { style: { maxWidth: 560, padding: '4px 2px' } },
        createElement('p', {
          style: {
            margin: '0 0 18px', fontSize: 13, lineHeight: 1.7,
            color: 'var(--dsw-alias-label-secondary)',
          },
        },
          '自定义界面字体：UI 字体分英文与中文两栏，代码字体用于代码块与行内代码；字体留空即用默认，大小偏移为 0 即不调整。修改实时全局生效。',
        ),
        createElement(Field, {
          label: 'UI 字体 · 英文', listId: 'dsh-custom-fonts-en-list', value: en,
          placeholder: '例如 Segoe UI, Arial', options: EN_FONTS,
          onChange: (e) => { setEn(e.target.value); applyFonts({ en: e.target.value }); persist({ en: e.target.value }) },
        }),
        createElement(Field, {
          label: 'UI 字体 · 中文', listId: 'dsh-custom-fonts-zh-list', value: zh,
          placeholder: '例如 微软雅黑, 思源黑体', options: ZH_FONTS,
          onChange: (e) => { setZh(e.target.value); applyFonts({ zh: e.target.value }); persist({ zh: e.target.value }) },
        }),
        createElement(Field, {
          label: '代码字体', listId: 'dsh-custom-fonts-code-list', value: code,
          placeholder: '例如 Consolas, JetBrains Mono', options: CODE_FONTS,
          onChange: (e) => { setCode(e.target.value); applyFonts({ code: e.target.value }); persist({ code: e.target.value }) },
        }),
        createElement('div', { style: { marginBottom: 16 } },
          createElement('div', {
            style: {
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 6,
            },
          },
            createElement('label', { style: fieldLabelStyle },
              '字体大小偏移 ',
              createElement('span', {
                style: { color: 'var(--dsw-alias-label-secondary)', fontWeight: 400 },
              },
                size > 0 ? '+' + size + 'px' : size + 'px',
              ),
            ),
            size !== 0
              ? createElement('button', {
                  onClick: () => { setSize(0); applyFonts({ size: 0 }); persist({ size: 0 }) },
                  style: {
                    fontSize: 12, padding: '2px 10px', borderRadius: 6, cursor: 'pointer',
                    border: '1px solid var(--dsw-alias-border-l1)',
                    background: 'var(--dsw-alias-bg-layer-2)',
                    color: 'var(--dsw-alias-label-primary)',
                  },
                }, '归零')
              : null,
          ),
          createElement('input', {
            type: 'range', min: -4, max: 8, step: 1, value: size,
            onChange: (e) => { const v = Number(e.target.value); setSize(v); applyFonts({ size: v }); persist({ size: v }) },
            style: { width: '100%' },
          }),
        ),
        createElement('div', {
          style: {
            marginTop: 4, padding: '14px 16px', borderRadius: 10,
            border: '1px solid var(--dsw-alias-border-l1)',
            background: 'var(--dsw-alias-bg-layer-1)',
            fontSize: 15, lineHeight: 1.8, color: 'var(--dsw-alias-label-primary)',
            fontFamily: uiStack || 'inherit',
          },
        },
          'The quick brown fox jumps over the lazy dog 0123456789',
          createElement('br', null),
          '敏捷的棕色狐狸跳过了懒狗 0123456789',
        ),
        createElement('div', {
          style: {
            marginTop: 8, padding: '10px 16px', borderRadius: 10,
            border: '1px solid var(--dsw-alias-border-l1)',
            background: 'var(--dsw-alias-bg-layer-1)',
            fontSize: 13, lineHeight: 1.8, color: 'var(--dsw-alias-label-secondary)',
          },
        },
          createElement('code', {
            style: {
              fontFamily: codeQ || 'inherit',
              color: 'var(--dsw-alias-label-primary)',
              background: 'var(--dsw-alias-bg-layer-2)',
              padding: '2px 6px', borderRadius: 4,
            },
          },
            codeQ
              ? 'const font = "ui + code"; return 0x2f;  // 代码字体预览'
              : 'const demo = "set your code font";  // 代码字体预览',
          ),
        ),
        createElement('button', {
          onClick: () => {
            setEn(''); setZh(''); setCode(''); setSize(0)
            applyFonts({ en: '', zh: '', code: '', size: 0 })
            persist({ en: '', zh: '', code: '', size: 0 })
          },
          style: {
            marginTop: 16, padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
            border: '1px solid var(--dsw-alias-border-l1)',
            background: 'var(--dsw-alias-bg-layer-2)',
            color: 'var(--dsw-alias-label-primary)', fontSize: 13,
          },
        }, '恢复默认'),
      )
    }

    /**
     * Adopt whatever the settings form currently holds.
     *
     * The form is the single source of truth: it is hydrated from the Host
     * document when the plugin loads, and every accepted write lands back in
     * it, so this is the one place that turns stored values into CSS.
     */
    function adopt(form) {
      const snapshot = form.getSnapshot()
      const value = (snapshot && snapshot.value) || {}
      applyFonts({
        en: typeof value.en === 'string' ? value.en : '',
        zh: typeof value.zh === 'string' ? value.zh : '',
        code: typeof value.code === 'string' ? value.code : '',
        size: Number(value.size) || 0,
      })
    }

    function apply(ctx) {
      // `slots` is declared in `inject`, so Cordis only runs apply() once the
      // service is present.
      const slots = ctx.slots
      // Remove the injected stylesheet when the plugin is unloaded.
      ctx.effect(() => () => {
        if (styleTag !== null) { styleTag.remove(); styleTag = null }
      })

      // Stored preferences: adopt once on load, then follow every accepted
      // write. `get` returns the shared form for our namespace, so a second
      // consumer observes the same values rather than a private copy.
      const form = ctx.configForms.get('dsh-custom-fonts')
      ctx.effect(() => form.subscribe(() => adopt(form)), 'dsh-custom-fonts: adopt settings')
      adopt(form)
      writeForm = form

      slots.inject('settings.section', () => slots.register(
        { name: 'settings.section', id: 'fonts', order: 25, label: () => '字体' },
        () => createElement(FontPage),
      ))
    }

    return { name: 'dsh-custom-fonts', inject: ['slots', 'configForms'], apply }
  },
})