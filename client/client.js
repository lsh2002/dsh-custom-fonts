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
 * Preferences persist in the Host settings document (namespace
 * `dsh-custom-fonts`, schema owned by the host half). The shared
 * `configForms` form is the single source of truth: it is adopted on load and
 * every control writes back through it, so values survive a page reload and a
 * restart. When the form is not served (a non-loopback connection, an older
 * Host), the page still works for the current view and says so.
 *
 * Bundle shape follows the official client-modules contract:
 *   window.__ModuleLoader__.load({ id, factory })
 * The factory's only external is `react` from the loader module table.
 */
window.__ModuleLoader__.load({
  id: 'dsh-custom-fonts',
  factory: (require) => {
    const React = require('react')
    const { createElement, useEffect, useState } = React

    const NAMESPACE = 'dsh-custom-fonts'
    const WRITE_DEBOUNCE_MS = 250

    const EN_FONTS = [
      'Maple Mono Normal NL CN', 'Segoe UI', 'Arial', 'Helvetica', 'Georgia',
      'Times New Roman', 'Courier New', 'Consolas', 'Verdana', 'Calibri',
    ]
    const ZH_FONTS = [
      'Maple Mono Normal NL CN', '微软雅黑', 'Microsoft YaHei', '宋体', 'SimSun',
      '黑体', 'SimHei', '楷体', 'KaiTi', '仿宋', 'FangSong', '思源黑体',
      'Noto Sans CJK SC', '苹方', 'PingFang SC',
    ]
    const CODE_FONTS = [
      'Maple Mono Normal NL CN', 'Consolas', 'Courier New', 'Menlo', 'Monaco',
      'SF Mono', 'JetBrains Mono', 'Fira Code', 'Cascadia Code',
      'Source Code Pro', 'DejaVu Sans Mono', 'Sarasa Mono SC', '等距更纱黑体',
    ]

    // --- state -------------------------------------------------------------
    // One frozen snapshot drives both the stylesheet and the React page, so a
    // value adopted from the Host document reaches the inputs too (a closure
    // only copy would leave the page stale after a reload).
    const DEFAULTS = Object.freeze({ en: '', zh: '', code: '', size: 0 })
    let snapshot = DEFAULTS
    const listeners = new Set()
    let styleTag = null

    /** The settings form, once `configForms` serves this namespace. */
    let form = null
    /** Set once the Host says this namespace cannot be written. */
    let readOnly = false
    /** Writes queued but not yet sent, and the count already in flight. */
    let queued = {}
    let writeTimer = null
    let inFlight = 0
    let lastError = null

    function notify() {
      for (const listener of [...listeners]) listener()
    }

    function subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    }

    function getSnapshot() {
      return snapshot
    }

    function sameAs(a, b) {
      return a.en === b.en && a.zh === b.zh && a.code === b.code && a.size === b.size
    }

    /** Replace the snapshot, repaint, and wake the page. */
    function publish(next) {
      const merged = Object.freeze({
        en: next.en ?? snapshot.en,
        zh: next.zh ?? snapshot.zh,
        code: next.code ?? snapshot.code,
        size: Number(next.size ?? snapshot.size) || 0,
      })
      if (sameAs(merged, snapshot)) return
      snapshot = merged
      applyFonts(snapshot)
      notify()
    }

    function setError(message) {
      lastError = message
      notify()
    }

    // --- CSS ---------------------------------------------------------------
    // Turn user input (comma-separated font lists allowed) into quoted CSS.
    function quoteList(str) {
      const seen = new Set()
      return String(str || '').split(',').map((s) => s.trim()).filter((s) => s.length > 0).map((s) => {
        if (/^['"].*['"]$/.test(s)) return s
        return "'" + s.replace(/['"]/g, '') + "'"
      }).filter((s) => {
        const key = s.toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
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
      if (styleTag !== null) { styleTag.remove(); styleTag = null }
      const css = buildCss(next)
      if (css === null) return
      const tag = document.createElement('style')
      tag.setAttribute('data-dsh-custom-fonts', '')
      tag.textContent = css
      document.head.appendChild(tag)
      styleTag = tag
    }

    // --- persistence -------------------------------------------------------
    /** Queue one field write; coalesces keystrokes into one document write. */
    function queueWrite(field, value) {
      queued = { ...queued, [field]: value }
      if (writeTimer !== null) clearTimeout(writeTimer)
      writeTimer = setTimeout(flushWrites, WRITE_DEBOUNCE_MS)
    }

    /** Send the queued fields as one atomic mutation. */
    function flushWrites() {
      if (writeTimer !== null) { clearTimeout(writeTimer); writeTimer = null }
      if (form === null) return
      const patch = queued
      queued = {}
      const ops = []
      for (const [field, value] of Object.entries(patch)) {
        const isDefault = field === 'size' ? Number(value) === 0 : String(value) === ''
        // A default value is cleared instead of stored, so the profile patch
        // only ever carries real overrides.
        ops.push(isDefault
          ? { op: 'unset', path: [field] }
          : { op: 'set', path: [field], value })
      }
      if (ops.length === 0) return
      inFlight += 1
      Promise.resolve(form.mutate(ops)).then((accepted) => {
        if (accepted === false) setError('保存失败：Host 拒绝了这次写入（设置仍在当前页面生效）')
        else if (lastError !== null) { lastError = null; notify() }
      }).catch((error) => {
        setError('保存失败：' + (error instanceof Error ? error.message : String(error)))
      }).finally(() => {
        inFlight -= 1
        // Re-sync with the Host once the queue drains: a rejected write must
        // not leave the page showing a value the document never stored.
        if (inFlight === 0 && Object.keys(queued).length === 0) adopt()
      })
    }

    /** Adopt the Host document's values, unless a local edit is in flight. */
    function adopt() {
      if (form === null) return
      if (inFlight > 0 || Object.keys(queued).length > 0) return
      const state = form.getSnapshot()
      const wasReadOnly = readOnly
      if (state.status === 'unavailable') {
        readOnly = true
        if (!wasReadOnly) notify()
        return
      }
      if (state.status !== 'ready') return
      readOnly = state.writable === false
      const value = state.value || {}
      publish({
        en: typeof value.en === 'string' ? value.en : '',
        zh: typeof value.zh === 'string' ? value.zh : '',
        code: typeof value.code === 'string' ? value.code : '',
        size: Number(value.size) || 0,
      })
      if (readOnly !== wasReadOnly) notify()
    }

    // --- page --------------------------------------------------------------
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
      const [view, setView] = useState(snapshot)
      useEffect(() => {
        const off = subscribe(() => setView(getSnapshot()))
        setView(getSnapshot())
        return off
      }, [])

      const { en, zh, code, size } = view
      const uiStack = [quoteList(en), quoteList(zh)].filter(Boolean).join(', ')
      const codeQ = quoteList(code)

      const change = (field) => (event) => {
        const value = field === 'size' ? Number(event.target.value) : event.target.value
        publish({ [field]: value })
        queueWrite(field, value)
      }

      return createElement('div', { style: { maxWidth: 560, padding: '4px 2px' } },
        createElement('p', {
          style: {
            margin: '0 0 18px', fontSize: 13, lineHeight: 1.7,
            color: 'var(--dsw-alias-label-secondary)',
          },
        },
          '自定义界面字体：UI 字体分英文与中文两栏，代码字体用于代码块与行内代码；字体留空即用默认，大小偏移为 0 即不调整。修改实时全局生效，并写入 Host 设置文档，重启后仍然有效。',
        ),
        readOnly
          ? createElement('p', {
              style: {
                margin: '0 0 14px', fontSize: 12, lineHeight: 1.7,
                color: 'var(--dsw-alias-state-warn-primary)',
              },
            }, '当前连接不可写：修改只在本次页面生效，刷新后恢复。')
          : null,
        lastError !== null
          ? createElement('p', {
              style: {
                margin: '0 0 14px', fontSize: 12, lineHeight: 1.7,
                color: 'var(--dsw-alias-state-error-primary)',
              },
            }, lastError)
          : null,
        createElement(Field, {
          label: 'UI 字体 · 英文', listId: 'dsh-custom-fonts-en-list', value: en,
          placeholder: '例如 Maple Mono Normal NL CN, Segoe UI', options: EN_FONTS,
          onChange: change('en'),
        }),
        createElement(Field, {
          label: 'UI 字体 · 中文', listId: 'dsh-custom-fonts-zh-list', value: zh,
          placeholder: '例如 Maple Mono Normal NL CN, 微软雅黑', options: ZH_FONTS,
          onChange: change('zh'),
        }),
        createElement(Field, {
          label: '代码字体', listId: 'dsh-custom-fonts-code-list', value: code,
          placeholder: '例如 Maple Mono Normal NL CN, Consolas', options: CODE_FONTS,
          onChange: change('code'),
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
                  onClick: () => { publish({ size: 0 }); queueWrite('size', 0) },
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
            onChange: change('size'),
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
            publish(DEFAULTS)
            queueWrite('en', '')
            queueWrite('zh', '')
            queueWrite('code', '')
            queueWrite('size', 0)
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

    function apply(ctx) {
      const slots = ctx.slots

      // Remove the injected stylesheet and drop queued writes on unload.
      ctx.effect(() => () => {
        if (styleTag !== null) { styleTag.remove(); styleTag = null }
        if (writeTimer !== null) { clearTimeout(writeTimer); writeTimer = null }
        queued = {}
        form = null
      }, 'dsh-custom-fonts: stylesheet')

      slots.inject('settings.section', () => slots.register(
        { name: 'settings.section', id: 'fonts', order: 25, label: () => '字体' },
        () => createElement(FontPage),
      ))

      // `configForms` is a soft dependency: without it the page still works for
      // the current view, so a missing service must not disable the plugin.
      ctx.inject(['configForms'], (child) => {
        const shared = child.configForms.get(NAMESPACE)
        form = shared
        child.effect(() => shared.subscribe(adopt), 'dsh-custom-fonts: adopt settings')
        adopt()
      })
    }

    return { name: 'dsh-custom-fonts', inject: ['slots'], apply }
  },
})
