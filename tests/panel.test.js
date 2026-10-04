import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import React from 'react'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
globalThis.window = dom.window
globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const { render, screen, fireEvent, waitFor, cleanup, act } = await import('@testing-library/react')
const { BazaarPanel } = await import('../.test-build/panel.mjs')
after(() => dom.window.close())

const catalog = (name = 'author/plugin', page = 1, nextPage = null) => ({ items: [{ repo: name,
  url: `https://github.com/${name}`, stars: 0, description: '' }], total: 1, page, nextPage, subscribed: [], subscriptions: [] })
const task = (id = 'job-1', phase = 'installing') => ({ requestId: id, source: 'human-ui',
  requestedSpec: 'github:author/plugin', spec: 'github:author/plugin', phase, done: false, log: [] })
const json = body => ({ ok: true, json: async () => body })
function api(t, custom) {
  const previous = globalThis.fetch
  const calls = []
  let state = { install: null, busy: null, tasks: [] }
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options })
    const path = String(url).replace('/dsh-bazaar/', '')
    const override = custom?.(path, options)
    if (override) return await override
    if (path.startsWith('list?')) return json(catalog())
    if (path.startsWith('capabilities')) return json({ gh: { status: 'missing' }, installation: true, approval: 'agent-only' })
    if (path === 'installed') return json({ bundles: [] })
    if (path.startsWith('install-status')) return json(state)
    throw new Error(`Unexpected request: ${path}`)
  }
  t.after(() => { cleanup(); globalThis.fetch = previous })
  return { calls, setState: value => { state = value } }
}
async function mountPanel() {
  await act(async () => { render(React.createElement(BazaarPanel)) })
}
async function openPanel() {
  await mountPanel()
  await screen.findByText('author/plugin')
  assert.equal(screen.queryByLabelText('安装会话'), null)
  await waitFor(() => assert.ok(screen.getAllByRole('button', { name: '安装' }).some(button => !button.disabled)))
}

test('own-account Fork is hidden while other-account Fork remains available', async t => {
  const { calls } = api(t, path => {
    if (path.startsWith('capabilities')) return json({ gh: { status: 'ready', login: 'AUTHOR' }, installation: true, approval: 'agent-only' })
    if (path.startsWith('list?')) return json({ ...catalog(), items: [...catalog().items, ...catalog('community/other').items] })
  })
  await openPanel()
  const own = screen.getByText('author/plugin').closest('article')
  const other = screen.getByText('community/other').closest('article')
  assert.equal(own.querySelector('[aria-label^="Fork"]'), null)
  assert.equal(own.querySelector('button').disabled, false)
  assert.equal(other.querySelector('[aria-label^="Fork"]').getAttribute('aria-disabled'), 'false')
  assert.equal(calls.some(call => call.url.includes('/sessions')), false)
})

test('the complete GitHub ref is submitted by the GUI without session fields', async t => {
  const pending = task()
  const server = api(t, path => path === 'install' ? json({ requestId: pending.requestId, install: pending }) : null)
  await openPanel()
  const spec = 'github:author/plugin#v0.2.0'
  fireEvent.change(screen.getByLabelText('安装来源'), { target: { value: spec } })
  server.setState({ install: pending, busy: pending.requestId, tasks: [pending] })
  fireEvent.submit(screen.getByLabelText('安装来源').closest('form'))
  await waitFor(() => assert.equal(server.calls.filter(call => call.options?.method === 'POST').length, 1))
  assert.deepEqual(JSON.parse(server.calls.find(call => call.options?.method === 'POST').options.body), { spec })
  assert.equal(server.calls.some(call => call.url.includes('/sessions')), false)
})

test('a Host with the old session-bound capability shape cannot enable the new GUI', async t => {
  api(t, path => path.startsWith('capabilities') ? json({ gh: { status: 'ready', login: 'author' }, installation: true, approval: 'session-tool' }) : null)
  await mountPanel()
  await screen.findByText(/集市接口不兼容.*capabilities/)
  assert.ok(screen.getAllByRole('button', { name: '安装' }).every(button => button.disabled))
})

test('a still-running legacy host reports incompatibility without blanking the panel or enabling installation', async t => {
  const { calls } = api(t, path => {
    if (path.startsWith('install-status')) return Promise.resolve(json({ install: null }))
    if (path.startsWith('capabilities')) return Promise.resolve(json({ gh: true, login: 'legacy-account' }))
    if (path === 'sessions' || path === 'installed') return Promise.resolve({
      ok: false, status: 404, json: async () => { throw new SyntaxError('Empty legacy endpoint response') },
    })
  })
  await mountPanel()
  await screen.findByText(/集市接口不兼容.*install-status/)
  await waitFor(() => assert.equal(screen.getAllByRole('alert').length, 3))
  assert.equal(screen.getAllByText(/集市接口不兼容/).length, 2)
  assert.equal(calls.some(call => call.url.includes('/sessions')), false)
  assert.ok(screen.getByText(/HTTP 404.*installed/))
  assert.ok(screen.getByRole('heading', { name: '集市' }))
  assert.ok(screen.getByRole('heading', { name: '安装任务' }))
  assert.ok(screen.getByText('author/plugin'))
  assert.ok(screen.getAllByRole('button', { name: '安装' }).every(button => button.disabled))
  assert.equal(calls.filter(call => call.options?.method === 'POST').length, 0)
})

test('missing CLI exposes its reason on a focusable disabled fork command', async t => {
  const { calls } = api(t)
  await openPanel()
  const fork = screen.getByRole('button', { name: /Fork 安装: 需要 CLI 工具支持/ })
  assert.equal(fork.getAttribute('aria-disabled'), 'true')
  fork.focus()
  fireEvent.click(fork)
  assert.equal(calls.filter(call => call.options?.method === 'POST').length, 0)
  assert.ok(screen.getByRole('tooltip').textContent.includes('需要 CLI 工具支持'))
})

test('sort and pagination preserve server order and reject a late older response', async t => {
  let resolveFirst
  const first = new Promise(resolve => { resolveFirst = resolve })
  api(t, path => {
    if (path.startsWith('list?')) {
      const params = new URLSearchParams(path.split('?')[1])
      if (params.get('sort') === 'stars') return first
      return Promise.resolve(json(catalog(params.get('page') === '2' ? 'second/page' : 'newest/plugin', Number(params.get('page')), 2)))
    }
  })
  await mountPanel()
  fireEvent.change(screen.getByLabelText('排序'), { target: { value: 'updated' } })
  await screen.findByText('newest/plugin')
  await act(async () => { resolveFirst(json(catalog('obsolete/plugin'))) })
  assert.equal(screen.queryByText('obsolete/plugin'), null)
  fireEvent.click(screen.getByRole('button', { name: '下一页' }))
  await screen.findByText('second/page')
  assert.ok(screen.getByText('第 2 页'))
})

test('refresh reprobes CLI without mislabeling authentication or network errors', async t => {
  const { calls } = api(t, path => path.startsWith('capabilities')
    ? Promise.resolve(json({ gh: { status: path.includes('refresh') ? 'network-error' : 'auth-required' }, installation: true, approval: 'agent-only' })) : null)
  await openPanel()
  assert.ok(screen.getByRole('button', { name: /Fork 安装: GitHub CLI 尚未登录/ }))
  fireEvent.click(screen.getByRole('button', { name: '刷新' }))
  await screen.findByRole('button', { name: /Fork 安装: GitHub 网络连接失败/ })
  fireEvent.change(screen.getByLabelText('排序'), { target: { value: 'updated' } })
  await waitFor(() => assert.ok(calls.some(call => call.url.includes('sort=updated'))))
  const lastList = calls.filter(call => call.url.includes('/list?')).at(-1).url
  assert.ok(!lastList.includes('refresh=1'))
})

test('human GUI installation needs no session or second approval and is never submitted twice', async t => {
  let accept
  const receipt = new Promise(resolve => { accept = resolve })
  const server = api(t, path => path === 'install' ? receipt : null)
  await openPanel()
  const button = screen.getAllByRole('button', { name: '安装' }).find(button => !button.disabled)
  fireEvent.click(button)
  fireEvent.click(button)
  assert.equal(server.calls.filter(call => call.url.endsWith('/install')).length, 1)
  const body = JSON.parse(server.calls.find(call => call.url.endsWith('/install')).options.body)
  assert.deepEqual(body, { spec: 'github:author/plugin' })
  const pending = task()
  server.setState({ install: pending, busy: 'job-1', tasks: [pending] })
  await act(async () => { accept(json({ requestId: 'job-1', install: pending })) })
  await screen.findByText('正在安装')
  assert.equal(server.calls.some(call => call.url.includes('/sessions')), false)
  assert.equal(screen.queryByText('等待审批'), null)
  assert.ok(screen.getAllByRole('button', { name: '安装' }).every(button => button.disabled))
})

test('completed recovered tasks retain restart outcome, diagnostics and actual package identity', async t => {
  const completed = { ...task('retained', 'restart-required'), done: true,
    log: [{ stream: 'stdout', text: 'pnpm output retained' }],
    result: { application: 'restart-required', changed: true, bundle: '@scope/actual-package' } }
  api(t, path => {
    if (path.startsWith('install-status')) return Promise.resolve(json({ install: completed, busy: null, tasks: [completed] }))
    if (path === 'installed') return Promise.resolve(json({ bundles: [{ name: '@scope/actual-package', installed: true, enabled: true }] }))
  })
  await openPanel()
  await screen.findByText('已安装，需重启')
  await screen.findByText(/@scope\/actual-package · 已安装 · 已启用/)
  assert.ok(screen.getByText('pnpm output retained'))
  assert.ok(screen.getByText('retained'))
  assert.equal(screen.queryByText('完成'), null)
})

test('mismatched progress keeps the prior task and disables new installation', async t => {
  let wrong = false
  const pending = task('exact')
  api(t, path => {
    if (path.startsWith('install-status')) return Promise.resolve(json({ install: wrong ? task('unrelated') : pending, busy: 'exact', tasks: [pending] }))
  })
  await mountPanel()
  await screen.findByText('正在安装')
  wrong = true
  fireEvent.change(screen.getByLabelText('任务历史'), { target: { value: 'exact' } })
  await screen.findByText(/Installation request identity mismatch/)
  assert.equal(screen.queryByText('unrelated'), null)
  assert.ok(screen.getAllByRole('button', { name: '安装' }).every(button => button.disabled))
})
