// Zero-dependency smoke test for dsh-custom-fonts.
//
// Verifies the three load contracts this package ships:
//   1. host half   — importable ESM exposing { name, inject, Config, apply },
//      with every Config field volatile (the settings form needs that).
//   2. client half — window.__ModuleLoader__.load({ id, factory }) registers a
//      Cordis surface { name, inject: ['slots'], apply } that registers the
//      settings.section entry under a fresh id and carries a cleanup disposer.
//   3. persistence — the page adopts the form's stored values on load, writes
//      every control back through that form, and coalesces keystrokes.
//
// Run: node scripts/verify.mjs

import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const root = join(import.meta.dirname, '..')
let failures = 0

async function check(name, fn) {
  try {
    await fn()
    console.log(`ok   ${name}`)
  } catch (error) {
    failures += 1
    console.error(`FAIL ${name}: ${error.message}`)
  }
}

// --- host half -----------------------------------------------------------
await check('host half imports and exposes the settings schema', async () => {
  const mod = await import(pathToFileURL(join(root, 'lib', 'index.js')).href)
  if (mod.name !== 'dsh-custom-fonts') throw new Error(`name is ${mod.name}`)
  if (typeof mod.apply !== 'function') throw new Error('apply missing')
  if (!Array.isArray(mod.inject) || mod.inject.length !== 0) {
    throw new Error('inject must stay empty: declaring settings would stall activation')
  }
  if (mod.Config === undefined || typeof mod.Config.toJSON !== 'function') throw new Error('Config missing')
  const json = mod.Config.toJSON()
  // `toJSON` is a shared-reference envelope: `dict` values are `refs` ids.
  const resolve = (node) => (typeof node === 'number' ? json.refs[String(node)] : node)
  const schema = resolve(json.uid)
  for (const field of ['en', 'zh', 'code', 'size']) {
    const node = resolve(schema.dict?.[field])
    if (node === undefined) throw new Error(`Config.${field} missing`)
    if (node.meta?.volatile !== true) throw new Error(`Config.${field} must be volatile`)
  }
  // `apply` claims the presentation through a child fiber, so it must work
  // without a live settings service too.
  const effects = []
  mod.apply({
    fiber: {},
    inject: (services, cb) => {
      if (!services.includes('settings')) throw new Error('apply must inject settings')
      cb({ settings: { configure: () => () => {} }, effect: (fn) => { effects.push(fn); fn() } })
    },
  })
  if (effects.length === 0) throw new Error('apply did not claim the settings presentation')
})

// --- a minimal hooks harness so the page can be rendered headlessly -------
/** Hook slot cursor shared by the fake React and the tree walker. */
const hookCursor = { value: 0 }

/**
 * @returns a fake React module that records hook state across renders.
 */
function createFakeReact() {
  const states = []
  const effects = []
  return {
    createElement: (type, props, ...children) => ({
      type,
      props: { ...(props ?? {}), children: children.length > 1 ? children : children[0] },
    }),
    useState: (initial) => {
      const index = hookCursor.value++
      if (!(index in states)) states[index] = initial
      return [states[index], (next) => {
        states[index] = typeof next === 'function' ? next(states[index]) : next
      }]
    },
    useEffect: (fn) => { effects.push(fn) },
    /** Render a component, running its effects, and return the element tree. */
    render(component) {
      hookCursor.value = 0
      effects.length = 0
      const tree = component()
      for (const fn of effects) fn()
      return tree
    },
  }
}

/** Collect every element of one type from a tree, rendering function components. */
function findAll(node, predicate, found = []) {
  if (node === null || node === undefined) return found
  if (typeof node === 'string' || typeof node === 'number') return found
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, predicate, found)
    return found
  }
  if (typeof node !== 'object') return found
  // A function component renders with its props; give it a fresh hook cursor so
  // it does not disturb the component that is already rendering.
  if (typeof node.type === 'function') {
    const outer = hookCursor.value
    hookCursor.value = 0
    const rendered = node.type(node.props ?? {})
    hookCursor.value = outer
    findAll(rendered, predicate, found)
    return found
  }
  if (predicate(node)) found.push(node)
  findAll(node.props?.children, predicate, found)
  return found
}

/** The text inputs of the page, keyed by their label. */
function textInputs(tree) {
  const inputs = findAll(tree, (node) => node.type === 'input' && node.props?.type === 'text')
  return inputs
}

// --- client half ---------------------------------------------------------
/**
 * Load the browser bundle against a fake loader and fake Cordis context.
 * @param {object} options - stored value and whether configForms is served.
 * @returns the surface, its fake React, the registered page, and write calls.
 */
function loadClient(options = {}) {
  globalThis.window = {
    __ModuleLoader__: { load: (handoff) => { globalThis.__handoff = handoff } },
  }
  require(join(root, 'client', 'client.js'))
  globalThis.window = undefined
  const handoff = globalThis.__handoff
  if (!handoff || handoff.id !== 'dsh-custom-fonts') throw new Error('no registration with id dsh-custom-fonts')

  const styleTags = []
  globalThis.document = {
    head: { appendChild: (tag) => styleTags.push(tag) },
    createElement: () => ({ setAttribute() {}, remove() { this.removed = true }, textContent: '' }),
  }

  const react = createFakeReact()
  const surface = handoff.factory((id) => {
    if (id === 'react') return react
    throw new Error('unexpected require: ' + id)
  })
  if (surface.name !== 'dsh-custom-fonts') throw new Error(`name is ${surface.name}`)
  if (JSON.stringify(surface.inject) !== '["slots"]') throw new Error('inject must declare slots')

  const calls = { mutations: [], listeners: new Set(), effects: [], page: null }
  const snapshot = {
    status: 'ready',
    writable: options.writable !== false,
    revision: 1,
    value: { en: '', zh: '', code: '', size: 0, ...(options.value ?? {}) },
  }
  const form = {
    getSnapshot: () => snapshot,
    subscribe: (listener) => { calls.listeners.add(listener); return () => calls.listeners.delete(listener) },
    mutate: async (ops) => {
      if (options.rejectWrites === true) return false
      calls.mutations.push(ops)
      for (const op of ops) {
        const field = op.path[0]
        if (op.op === 'set') snapshot.value = { ...snapshot.value, [field]: op.value }
        if (op.op === 'unset') snapshot.value = { ...snapshot.value, [field]: field === 'size' ? 0 : '' }
      }
      snapshot.revision += 1
      for (const listener of [...calls.listeners]) listener()
      return true
    },
  }

  const ctx = {
    effect: (fn, label) => { calls.effects.push(label); fn() },
    slots: {
      inject: (key, cb) => { if (key !== 'settings.section') throw new Error(`wrong slot ${key}`); cb() },
      register: (opts, component) => {
        if (opts.name !== 'settings.section' || opts.id !== 'fonts') throw new Error('settings.section entry not registered')
        if (typeof opts.label() !== 'string') throw new Error('label must be a string')
        if (typeof component !== 'function') throw new Error('component missing')
        calls.page = component
        return () => {}
      },
    },
    inject: (services, cb) => {
      if (!services.includes('configForms')) throw new Error('configForms must be a soft dependency')
      if (options.withForms === false) return
      cb({ configForms: { get: () => form }, effect: (fn) => { fn() } })
    },
  }
  surface.apply(ctx)
  return { surface, react, ctx, form, snapshot, calls, styleTags }
}

/** Settle the debounced write and the microtask queue. */
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 400))
  await new Promise((resolve) => setImmediate(resolve))
}

await check('client half registers the settings section', async () => {
  const { calls, styleTags } = loadClient({ withForms: false })
  if (calls.page === null) throw new Error('settings.section entry not registered')
  if (!calls.effects.some((label) => String(label).includes('dsh-custom-fonts'))) {
    throw new Error('unload cleanup effect missing')
  }
  if (styleTags.length !== 0) throw new Error('empty settings must not inject a stylesheet')
})

await check('stored values are applied on load', async () => {
  const { styleTags } = loadClient({ value: { en: 'Maple Mono Normal NL CN' } })
  if (styleTags.length !== 1) throw new Error('expected one stylesheet for stored fonts')
  const css = styleTags[0].textContent
  if (!css.includes("'Maple Mono Normal NL CN'")) throw new Error('stored font not applied: ' + css)
})

await check('the page shows the stored values, not a private copy', async () => {
  const { react, calls } = loadClient({
    value: { en: 'Maple Mono Normal NL CN', zh: 'Maple Mono Normal NL CN', code: 'Consolas', size: 2 },
  })
  const tree = react.render(calls.page)
  const inputs = textInputs(tree)
  if (inputs.length !== 3) throw new Error(`expected three text inputs, got ${inputs.length}`)
  const values = inputs.map((input) => input.props.value)
  if (values[0] !== 'Maple Mono Normal NL CN') throw new Error('English input not adopted: ' + values[0])
  if (values[1] !== 'Maple Mono Normal NL CN') throw new Error('Chinese input not adopted: ' + values[1])
  if (values[2] !== 'Consolas') throw new Error('code input not adopted: ' + values[2])
  const slider = findAll(tree, (node) => node.type === 'input' && node.props?.type === 'range')[0]
  if (Number(slider.props.value) !== 2) throw new Error('size slider not adopted: ' + slider.props.value)
})

await check('a control writes exactly its own field', async () => {
  const { react, calls } = loadClient({ value: { en: 'Segoe UI' } })
  const tree = react.render(calls.page)
  const inputs = textInputs(tree)
  inputs[2].props.onChange({ target: { value: 'Maple Mono Normal NL CN' } })
  await settle()
  if (calls.mutations.length !== 1) throw new Error(`expected one mutation, got ${calls.mutations.length}`)
  const ops = calls.mutations[0]
  if (ops.length !== 1) throw new Error('a single edit must send a single op')
  if (ops[0].op !== 'set' || ops[0].path[0] !== 'code' || ops[0].value !== 'Maple Mono Normal NL CN') {
    throw new Error('wrong op: ' + JSON.stringify(ops))
  }
})

await check('typing coalesces into one write, and clearing unsets', async () => {
  const { react, calls } = loadClient({})
  const tree = react.render(calls.page)
  const inputs = textInputs(tree)
  for (const value of ['M', 'Ma', 'Maple Mono Normal NL CN']) {
    inputs[0].props.onChange({ target: { value } })
  }
  await settle()
  if (calls.mutations.length !== 1) throw new Error(`expected one coalesced mutation, got ${calls.mutations.length}`)
  const ops = calls.mutations[0]
  if (ops.length !== 1 || ops[0].path[0] !== 'en') throw new Error('wrong coalesced ops: ' + JSON.stringify(ops))
  if (ops[0].value !== 'Maple Mono Normal NL CN') throw new Error('last keystroke not written')

  // Clearing the field removes the override instead of storing an empty value.
  inputs[0].props.onChange({ target: { value: '' } })
  await settle()
  const clearOps = calls.mutations.at(-1)
  if (clearOps[0].op !== 'unset' || clearOps[0].path[0] !== 'en') {
    throw new Error('clearing must unset the field: ' + JSON.stringify(clearOps))
  }
})

await check('reset clears every control', async () => {
  const { react, calls } = loadClient({ value: { en: 'Arial', code: 'Consolas', size: 3 } })
  const tree = react.render(calls.page)
  const reset = findAll(tree, (node) => node.type === 'button' && node.props?.children === '恢复默认')[0]
  if (reset === undefined) throw new Error('reset button missing')
  reset.props.onClick()
  await settle()
  const ops = calls.mutations.at(-1)
  const fields = ops.map((op) => op.path[0]).sort()
  if (fields.join(',') !== 'code,en,size,zh') throw new Error('reset did not clear every field: ' + fields)
  if (!ops.every((op) => op.op === 'unset')) throw new Error('reset must unset, not store defaults')
})

await check('a refused write surfaces an error and re-syncs', async () => {
  const { react, calls } = loadClient({ rejectWrites: true })
  const tree = react.render(calls.page)
  const inputs = textInputs(tree)
  inputs[0].props.onChange({ target: { value: 'Nope' } })
  await settle()
  const after = react.render(calls.page)
  const error = findAll(after, (node) => node.type === 'p' && String(node.props?.children ?? '').includes('保存失败'))
  if (error.length === 0) throw new Error('refused write produced no error message')
  const values = textInputs(after).map((input) => input.props.value)
  if (values[0] !== '') throw new Error('refused write left a value the document never stored: ' + values[0])
})

await check('a non-writable namespace says so', async () => {
  const { react, calls } = loadClient({ writable: false })
  const tree = react.render(calls.page)
  const notice = findAll(tree, (node) => node.type === 'p' && String(node.props?.children ?? '').includes('不可写'))
  if (notice.length === 0) throw new Error('read-only notice missing')
})

// --- manifest self-consistency -------------------------------------------
await check('package.json dsh fields are consistent', async () => {
  const manifest = require(join(root, 'package.json'))
  for (const file of [manifest.main, manifest.dsh?.bundle?.patch, manifest.exports?.['./client']]) {
    if (typeof file !== 'string' || !file.startsWith('./')) throw new Error(`bad artifact ref: ${file}`)
    if (!existsSync(join(root, file))) throw new Error(`missing artifact: ${file}`)
  }
  if (manifest.dsh?.client?.platform !== 'web') throw new Error('dsh.client.platform must be web')
  if (manifest.dependencies?.['@deepseek-ai/schemastery'] === undefined) {
    throw new Error('@deepseek-ai/schemastery must be a dependency of the host half')
  }
})

if (failures > 0) {
  console.error(`${failures} check(s) failed`)
  process.exit(1)
}
console.log('all checks passed')
