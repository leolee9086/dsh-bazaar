import assert from 'node:assert/strict'
import { test } from 'node:test'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { createInstaller, INSTALL_TOOL } from '../src/install.js'
import { TaskStore } from '../src/tasks.js'
import { createCatalog } from '../src/catalog.js'
import { registerDiscovery, SEARCH_TOOL, INSTALLED_TOOL, DISCOVERY_SECTION } from '../src/discovery.js'

// The artifact suite consumes official public exports, never source aliases or service replicas.
const root = process.env.DSH_TEST_ROOT
if (!root) throw new Error('Set DSH_TEST_ROOT to a built Harness checkout before running installer.test.js')
async function official(directory, name) {
  const require = createRequire(join(resolve(root), 'packages', directory, 'package.json'))
  return import(pathToFileURL(require.resolve(name)).href)
}
const { boot } = await official('boot/app-boot', '@deepseek-ai/dsh-app-boot')
const Hmr = (await official('bundle/base', '@deepseek-ai/dsh-hmr')).default
const Timer = (await official('bundle/base', '@deepseek-ai/cordis-plugin-timer')).default
const plugins = {}
for (const [builtin, name] of [
  ['llm', 'llm'], ['sessions', 'session'], ['projections', 'session-projection'],
  ['prompt', 'system-prompt'], ['tools', 'tools'], ['agents', 'agent'], ['loop', 'agent-loop'],
  ['approval', 'user-approval'], ['manager', 'plugin-manager'],
]) {
  plugins[builtin] = (await official('bundle/base', `@deepseek-ai/dsh-${name}`)).default
}

async function fixture(t, { openTurn = true, live = false, ai = true, mode = 'direct', spec = 'github:example/uninstalled#keep-this-ref' } = {}) {
  const dir = await mkdtemp(join(fileURLToPath(new URL('../.test-build/', import.meta.url)), 'installer-'))
  await mkdir(join(dir, 'home'))
  let ctx
  t.after(async () => { await ctx?.fiber.dispose(); await rm(dir, { recursive: true, force: true }) })
  const config = join(dir, 'cordis.yml')
  await copyFile(new URL('./installer.cordis.yml', import.meta.url), config)
  const manifest = JSON.stringify({ name: 'bazaar-test-profile', private: true, type: 'module',
    dependencies: {}, dsh: { profile: { bundles: [] } } })
  await writeFile(join(dir, 'package.json'), manifest)
  const patches = live ? [{ id: 'timer', disabled: false }, { id: 'hmr', disabled: false }] : []
  if (!ai) patches.push(...['llm', 'sessions', 'projections', 'system-prompt', 'tools', 'agents', 'agent-loop', 'approval'].map(id => ({ id, disabled: true })))
  const initialPatch = `${JSON.stringify(patches)}\n`
  await writeFile(join(dir, 'cordis.patch.yml'), `${JSON.stringify(patches)}\n`)
  const store = new TaskStore(join(dir, 'journal'))
  await store.load()
  let installer
  let forkCalls = 0
  const readyListeners = new Set()
  const catalog = createCatalog({
    readSources: async () => [],
    searchTopic: async () => ({ items: [{ repo: 'community/archived-fork', stars: 0, archived: true, fork: true }],
      total: 1, incomplete: false }),
    readSubscription: async () => { throw new Error('No subscription source in this fixture') },
  })
  ctx = await boot('bazaar-test', config, patches, inner => {
    // Embedding-host readiness is an external startup input, not a replicated manager.
    if (live) inner.provide('appReady', { onReady(listener) {
      readyListeners.add(listener)
      return () => readyListeners.delete(listener)
    } })
    inner.loader.builtins.hmr = Hmr
    inner.loader.builtins.timer = Timer
    inner.provide('profileContext', { name: 'test', dir, patchPath: join(dir, 'cordis.patch.yml'),
      installAnchor: join(dir, 'package.json'), cwd: dir, home: join(dir, 'home'), startedBundles: [], overlays: [],
      telemetryDisabledEnv: undefined })
    Object.assign(inner.loader.builtins, plugins, {
      'bazaar-installer': { name: 'bazaar-installer', apply(owner) {
        registerDiscovery(owner, catalog)
        installer = createInstaller(owner, store, async () => {
          forkCalls += 1
          throw new Error('A denied test request must not reach GitHub')
        })
      } },
    })
  })
  for (const listener of readyListeners) listener()
  if (ai) assert.ok(ctx.tools.get(INSTALL_TOOL), 'Loader activates the registered tool')
  const agent = ai ? await ctx.agentLoop.create(randomUUID(), {}, { cwd: dir }) : null
  if (agent && openTurn) agent.session.append('turn/start', { turn: 1 })
  const execute = (signal = new AbortController().signal, subject = agent) => ctx.tools.execute({
    callId: randomUUID(), name: INSTALL_TOOL, arguments: { spec, mode }, agent: subject, signal,
  })
  const audit = () => agent?.session.snapshotEvents().filter(event => event.type.startsWith('approval/')) ?? []
  const unchanged = async () => {
    assert.equal(await readFile(join(dir, 'package.json'), 'utf8'), manifest)
    assert.equal(forkCalls, 0)
    assert.equal(await readFile(join(dir, 'cordis.patch.yml'), 'utf8'), initialPatch)
  }
  return { ctx, dir, agent, get task() { return store.latest() }, store, installer, execute, audit, unchanged, catalog,
    setSpec: value => { spec = value }, forkCalls: () => forkCalls }
}

test('Agent search uses the browser catalog and installed query preserves the real manager list without mutations', async t => {
  const f = await fixture(t)
  const browser = await f.catalog({ query: 'test' })
  const call = (name, args = {}) => f.ctx.tools.execute({ callId: randomUUID(), name, arguments: args,
    agent: f.agent, signal: new AbortController().signal })
  const search = await call(SEARCH_TOOL, { query: 'test' })
  assert.equal(search.isError, false)
  assert.deepEqual(JSON.parse(search.value), { ...browser, cached: true })
  const installed = await call(INSTALLED_TOOL)
  assert.equal(installed.isError, false)
  assert.deepEqual(JSON.parse(installed.value), { bundles: await f.ctx.pluginManager.listBundles() })
  assert.deepEqual(f.audit(), [])
  await f.unchanged()
})

test('discovery cannot carry fork or installation actions and forged install requests never ask approval or mutate', async t => {
  const f = await fixture(t)
  const call = (name, args) => f.ctx.tools.execute({ callId: randomUUID(), name, arguments: args,
    agent: f.agent, signal: new AbortController().signal })
  for (const name of [SEARCH_TOOL, INSTALLED_TOOL]) {
    const output = await call(name, { mode: 'fork', spec: 'github:community/unrequested' })
    assert.equal(output.isError, true, `${name} rejects mutation parameters`)
  }
  for (const args of [{ requestId: randomUUID() }, { spec: 'github:community/unrequested', source: 'human-ui' },
    { spec: 'github:community/unrequested', approval: 'allowed-once' }]) {
    assert.equal((await call(INSTALL_TOOL, args)).isError, true, 'tool inputs cannot inherit human authorization')
  }
  assert.equal(f.task, null)
  assert.deepEqual(f.audit(), [])
  await f.unchanged()
})

test('assembled guidance advertises discovery, respects scoped restrictions and disappears on unload', async t => {
  const f = await fixture(t)
  const assemble = () => f.ctx.systemPrompt.assemble({ scope: f.agent })
  const before = await assemble()
  assert.ok(before.tools.some(tool => tool.name === SEARCH_TOOL))
  assert.match(before.sections.find(section => section.name === DISCOVERY_SECTION).text, /Search the bazaar before/)
  const restore = f.agent.ctx.get('tools').restrict({ deny: [SEARCH_TOOL] })
  const restricted = await assemble()
  assert.equal(restricted.tools.some(tool => tool.name === SEARCH_TOOL), false)
  assert.equal(restricted.sections.find(section => section.name === DISCOVERY_SECTION)?.text ?? '', '')
  restore()
  const entry = [...f.ctx.loader.entries()].find(row => row.options.id === 'bazaar-installer')
  await entry.fiber.dispose()
  assert.equal(f.ctx.tools.get(SEARCH_TOOL), undefined)
  assert.equal(f.ctx.tools.get(INSTALLED_TOOL), undefined)
  assert.equal((await assemble()).sections.some(section => section.name === DISCOVERY_SECTION), false)
})

for (const [answer, phase] of [['unavailable', 'approval-unavailable'], ['rejected', 'rejected']]) {
  test(`${answer} is audited and performs neither fork nor package changes`, async t => {
    const f = await fixture(t, { mode: 'fork' })
    if (answer === 'rejected') f.ctx.on('approval/request', () => Promise.resolve('rejected'))
    const output = await f.execute()
    assert.equal(output.isError, false)
    assert.equal(JSON.parse(output.value).phase, phase)
    assert.equal(f.task.phase, phase)
    assert.equal(f.task.done, true)
    assert.deepEqual(f.audit().map(event => event.type), ['approval/asked', 'approval/decided'])
    assert.equal(f.audit()[1].data.outcome, answer)
    assert.equal(f.audit()[0].data.id, f.audit()[1].data.id)
    assert.equal(f.audit()[0].data.toolName, INSTALL_TOOL)
    const saved = JSON.parse(await readFile(f.store.file, 'utf8'))
    assert.equal(saved[0].phase, phase)
    assert.equal(saved[0].requestedSpec, 'github:example/uninstalled#keep-this-ref')
    await f.unchanged()
  })
}

test('another real Agent still needs its own audited approval', async t => {
  const f = await fixture(t)
  const other = await f.ctx.agentLoop.create(randomUUID(), {}, { cwd: f.dir })
  other.session.append('turn/start', { turn: 1 })
  assert.equal((await f.execute(undefined, other)).isError, false)
  assert.equal(f.task.source, 'agent')
  assert.equal(f.task.sessionId, other.id)
  assert.equal(f.task.phase, 'approval-unavailable')
  assert.equal(other.session.snapshotEvents().filter(event => event.type.startsWith('approval/')).length, 2)
  assert.deepEqual(f.audit(), [])
  await f.unchanged()
})

test('idle execution fails before an unaudited installation can start', async t => {
  const f = await fixture(t, { openTurn: false })
  await f.execute()
  assert.equal(f.task.phase, 'failed')
  assert.match(f.task.error, /outside an open turn/)
  assert.deepEqual(f.audit(), [])
  await f.unchanged()
})

test('cancellation withdraws approval, drains the request and refuses duplicate execution', async t => {
  const f = await fixture(t)
  const entered = Promise.withResolvers()
  const late = Promise.withResolvers()
  f.ctx.on('approval/request', () => { entered.resolve(); return late.promise })
  t.after(() => late.resolve('allowed-once'))
  const operation = f.execute()
  await entered.promise
  const duplicate = await f.execute()
  assert.equal(duplicate.isError, true)
  assert.equal(f.audit().length, 1)
  assert.deepEqual(await f.installer.cancel(f.task.requestId), { status: 'cancelled' })
  await operation
  late.resolve('allowed-once')
  assert.equal(f.task.phase, 'cancelled')
  assert.equal(f.audit()[1].data.outcome, 'cancelled')
  await f.unchanged()
})

test('disposing the Loader entry drains approval and removes the tool registration', async t => {
  const f = await fixture(t)
  const entered = Promise.withResolvers()
  const late = Promise.withResolvers()
  f.ctx.on('approval/request', () => { entered.resolve(); return late.promise })
  t.after(() => late.resolve('allowed-once'))
  const operation = f.execute()
  await entered.promise
  const entry = [...f.ctx.loader.entries()].find(row => row.options.id === 'bazaar-installer')
  await entry.fiber.dispose()
  await operation
  assert.equal(f.ctx.tools.get(INSTALL_TOOL), undefined)
  assert.equal(f.task.phase, 'cancelled')
  assert.equal(f.audit()[1].data.outcome, 'cancelled')
  await f.unchanged()
})

test('an approved exact spec reaches the real manager and retains its refusal diagnostics', async t => {
  const f = await fixture(t, { spec: '-invalid-package-spec' })
  f.ctx.on('approval/request', () => Promise.resolve('allowed-once'))
  const result = await f.execute()
  assert.equal(result.isError, false)
  assert.equal(f.audit()[1].data.outcome, 'allowed-once')
  assert.equal(f.task.approval, 'allowed-once')
  assert.equal(f.task.spec, '-invalid-package-spec')
  assert.equal(f.task.phase, 'failed')
  assert.equal(f.task.result.application, 'failed')
  assert.equal(f.task.result.error.code, 'invalid-spec')
  assert.equal(f.task.result.target, '-invalid-package-spec')
  await f.unchanged()
})

test('a local bundle can unload the installer while applying without deadlocking or losing its result', { timeout: 60000 }, async t => {
  const f = await fixture(t, { live: true })
  assert.ok(f.ctx.get('hmr'))
  const local = join(f.dir, 'local-bundle')
  await mkdir(local)
  await writeFile(join(local, 'package.json'), JSON.stringify({
    name: 'bazaar-local-test', version: '1.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } },
  }))
  await writeFile(join(local, 'cordis.patch.yml'), '[{"id":"bazaar-installer","disabled":true}]\n')
  f.setSpec(`link:${local}`)
  f.ctx.on('approval/request', () => Promise.resolve('allowed-once'))
  const output = await f.execute()
  assert.equal(output.isError, false)
  assert.equal(f.task.phase, 'applied')
  assert.equal(f.task.result.bundle, 'bazaar-local-test')
  assert.equal(f.ctx.tools.get(INSTALL_TOOL), undefined)
  assert.equal(f.task.done, true)
  const saved = JSON.parse(await readFile(f.store.file, 'utf8'))
  assert.equal(saved[0].phase, 'applied')
  assert.equal(saved[0].result.bundle, 'bazaar-local-test')
  assert.equal(f.audit()[1].data.outcome, 'allowed-once')
  assert.ok((await f.ctx.pluginManager.listBundles()).some(row => row.name === 'bazaar-local-test' && row.installed))
})

test('a journal failure after successful installation preserves the real manager result', { timeout: 60000 }, async t => {
  const f = await fixture(t)
  const local = join(f.dir, 'local-bundle')
  await mkdir(local)
  await writeFile(join(local, 'package.json'), JSON.stringify({
    name: 'bazaar-journal-test', version: '1.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } },
  }))
  await writeFile(join(local, 'cordis.patch.yml'), '[]\n')
  f.setSpec(`link:${local}`)
  f.ctx.on('approval/request', () => Promise.resolve('allowed-once'))
  f.ctx.on('plugin-manager/install-state', state => {
    if (state.requestId !== f.task.requestId || state.phase !== 'applying') return
    // Fail the task journal only after the real manager has finished package installation.
    rmSync(f.store.dir, { recursive: true })
    writeFileSync(f.store.dir, 'not a directory')
  })
  const output = await f.execute()
  const value = JSON.parse(output.value)
  assert.equal(output.isError, false)
  assert.equal(value.phase, 'restart-required')
  assert.equal(value.result.application, 'restart-required')
  assert.equal(value.result.bundle, 'bazaar-journal-test')
  assert.match(value.journalError, /EEXIST|ENOTDIR/)
  assert.equal(f.task.done, true)
  assert.equal(f.task.error, undefined)
  assert.equal(f.audit()[1].data.outcome, 'allowed-once')
  assert.ok((await f.ctx.pluginManager.listBundles()).some(row => row.name === 'bazaar-journal-test' && row.installed))
})

async function waitTask(task) {
  const until = Date.now() + 55000
  while (!task.done && Date.now() < until) await delay(20)
  assert.equal(task.done, true, 'installation settled')
}

test('human GUI installs a real bundle without any sessions, model, tools or approval service', { timeout: 60000 }, async t => {
  const f = await fixture(t, { ai: false })
  for (const service of ['sessions', 'sessionController', 'agentLoop', 'llm', 'tools', 'approval']) assert.equal(f.ctx.get(service), undefined)
  assert.equal(f.installer.available(), true)
  const local = join(f.dir, 'human-bundle')
  await mkdir(local)
  await writeFile(join(local, 'package.json'), JSON.stringify({ name: 'bazaar-human-test', version: '1.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } } }))
  await writeFile(join(local, 'cordis.patch.yml'), '[]\n')
  const task = await f.installer.begin({ spec: `link:${local}`, mode: 'direct' })
  await waitTask(task)
  assert.equal(task.source, 'human-ui')
  assert.equal(task.sessionId, undefined)
  assert.equal(task.approval, undefined)
  assert.equal(task.phase, 'restart-required')
  assert.equal(task.result.bundle, 'bazaar-human-test')
  assert.ok((await f.ctx.pluginManager.listBundles()).some(row => row.name === 'bazaar-human-test' && row.installed))
})

test('human GUI requests reserve the shared slot synchronously and can cancel before mutation', async t => {
  const f = await fixture(t, { ai: false })
  const admission = f.installer.begin({ spec: '-invalid-package-spec', mode: 'direct' })
  const task = f.store.latest()
  await assert.rejects(f.installer.begin({ spec: '-duplicate-package', mode: 'direct' }), /Another installation task is active/)
  assert.deepEqual(await f.installer.cancel(task.requestId), { status: 'cancelled' })
  assert.equal(await admission, task)
  assert.equal(task.result, undefined)
  assert.equal(task.source, 'human-ui')
  await f.unchanged()
})

test('only AI Fork requests ask approval before reaching the external Fork operation', async t => {
  const f = await fixture(t, { mode: 'fork' })
  const entered = Promise.withResolvers()
  const response = Promise.withResolvers()
  f.ctx.on('approval/request', () => { entered.resolve(); return response.promise })
  t.after(() => response.resolve('rejected'))
  const operation = f.execute()
  await entered.promise
  assert.equal(f.forkCalls(), 0)
  assert.equal(f.task.source, 'agent')
  response.resolve('allowed-once')
  await operation
  assert.equal(f.forkCalls(), 1)
  assert.equal(f.task.approval, 'allowed-once')
  assert.equal(f.task.result, undefined)
  assert.equal(f.audit()[1].data.outcome, 'allowed-once')
})

test('a human Fork command runs directly without an Agent or second approval', async t => {
  const f = await fixture(t, { ai: false })
  const task = await f.installer.begin({ spec: 'github:example/plugin#keep-this-ref', mode: 'fork' })
  await waitTask(task)
  assert.equal(task.source, 'human-ui')
  assert.equal(task.sessionId, undefined)
  assert.equal(task.approval, undefined)
  assert.equal(f.forkCalls(), 1)
  assert.match(task.error, /must not reach GitHub/)
  assert.equal(task.result, undefined)
})

test('an unwritable journal after approval stops before manager mutation and reports persistence failure', async t => {
  const f = await fixture(t)
  f.ctx.on('approval/request', async () => {
    await rm(f.store.dir, { recursive: true })
    await writeFile(f.store.dir, 'not a directory')
    return 'allowed-once'
  })
  await f.execute()
  assert.equal(f.audit()[1].data.outcome, 'allowed-once')
  assert.equal(f.task.phase, 'failed')
  assert.equal(f.task.result, undefined)
  assert.match(f.task.journalError, /EEXIST|ENOTDIR/)
  await f.unchanged()
})
