/**
 * Contract smoke test for the published browser artifact (`lib/client.js`).
 *
 * Dev-only — excluded from `files`, never shipped. It exercises the module
 * protocol the web shell actually uses, without a browser or a build step:
 *
 *   1. the bundle registers exactly one handoff whose id is the package name;
 *   2. the factory returns the Cordis plugin namespace (`inject`/`name`/`apply`,
 *      no default) that the Loader mounts;
 *   3. `apply(ctx)` waits for `conversation.input.right` and registers this
 *      package's own cell there (`id: 'voice-input'`);
 *   4. with `react`/`react-dom/server` resolvable from the sibling checkout, the
 *      registered component is really rendered — supported and unsupported
 *      browser branches both assert on the visible affordance.
 *
 * Run: node test/contract.smoke.mjs   (from the package directory)
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const pkgRoot = new URL('../', import.meta.url)
const pkg = JSON.parse(readFileSync(new URL('package.json', pkgRoot), 'utf8'))

/** Anchors in the sibling dsh checkout whose node_modules can answer react. */
const REACT_ANCHORS = [
  '../../../source-code/apps/web/package.json',
  '../../../source-code/packages/client/ui-user-questions/package.json',
]

/** A minimal React stand-in, used only when the checkout cannot supply the real one. */
const ReactStub = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: (initial) => [initial, () => {}],
  useRef: (initial) => ({ current: initial }),
  useEffect: () => {},
}

/** Resolve the real react/react-dom from the sibling checkout. @returns the pair, or undefined when unavailable. */
function loadRealReact() {
  for (const anchor of REACT_ANCHORS) {
    try {
      const require = createRequire(fileURLToPath(new URL(anchor, import.meta.url)))
      return { React: require('react'), server: require('react-dom/server') }
    } catch {
      // Anchor without the dependency set (or no checkout beside this package):
      // try the next one; the caller degrades to the stub.
    }
  }
  return undefined
}

// ── 1. capture the registration handoff from a stubbed page ─────────────────
let handoff
globalThis.window = {
  __ModuleLoader__: {
    load: (value) => { handoff = value },
  },
  navigator: { language: 'zh-CN' },
  webkitSpeechRecognition: function FakeRecognition() {},
}
// The style-tag guard tests `typeof document`; Node has none, so the browser
// stylesheet injection is correctly skipped here.
globalThis.document = undefined

await import(new URL(pkg.exports['./client'], pkgRoot).href)

assert.ok(handoff !== undefined, 'lib/client.js must call window.__ModuleLoader__.load')
assert.equal(handoff.id, pkg.name, 'handoff id must equal the package name (graph row id)')

// ── 2. the factory returns the mountable Cordis plugin namespace ────────────
const real = loadRealReact()
const React = real === undefined ? ReactStub : real.React
const plugin = handoff.factory((spec) => {
  if (spec === 'react') return React
  throw new Error(`unexpected require("${spec}") — this bundle may only require platform modules`)
})

assert.deepEqual(plugin.inject, ['slots'], 'the client half needs the slot registry as a hard dependency')
assert.equal(typeof plugin.apply, 'function')
assert.equal(plugin.default, undefined, 'a default export would make the Loader drop inject (postmortem 0001)')

// ── 3. apply() registers this package's own cell in the right seat ──────────
let injectedKey
let registerOptions
let Component
plugin.apply({
  slots: {
    inject(key, callback) {
      injectedKey = key
      return callback()
    },
    register(options, component) {
      registerOptions = options
      Component = component
      return () => {}
    },
  },
})

assert.equal(injectedKey, 'conversation.input.right', 'the mic belongs in the composer tool row, before send')
assert.equal(registerOptions.name, 'conversation.input.right')
assert.equal(registerOptions.id, 'voice-input', 'a fresh cell id — reusing a shipped id would replace that cell')
assert.equal(typeof Component, 'function')

// ── 4. render the registered component (real React only) ────────────────────
const renderProps = {
  useInput: (selector) => selector({ draft: '已有草稿' }),
  inputActions: { setDraft: () => {} },
}

if (real === undefined) {
  console.log('SKIP render assertions: react/react-dom not resolvable from a sibling checkout')
} else {
  const supported = real.server.renderToStaticMarkup(React.createElement(Component, renderProps))
  assert.match(supported, /class="dshv-mic"/, 'the idle button renders')
  assert.match(supported, /aria-label="开始语音输入"/)
  assert.match(supported, /aria-pressed="false"/)
  assert.match(supported, /data-dsh-voice-input/)
  assert.doesNotMatch(supported, /disabled/, 'a supported browser leaves the button live')

  delete globalThis.window.webkitSpeechRecognition
  const unsupported = real.server.renderToStaticMarkup(React.createElement(Component, renderProps))
  assert.match(unsupported, /aria-label="当前浏览器不支持语音识别，请使用 Chrome 或 Edge"/)
  assert.match(unsupported, /disabled/, 'an unsupported browser disables the button instead of hiding it')

  console.log('render assertions ran against real react ' + real.React.version)
}

console.log('contract smoke OK: ' + pkg.name + '@' + pkg.version)
