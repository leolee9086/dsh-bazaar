import assert from 'node:assert/strict'
import { readFile, writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { PNPM_TOOL, readPnpmSelection } from '../src/pnpm.js'

// Registered by the real Loader suite, with its actual tools, approval and manager services.
export function registerPnpmCases(test, fixture) {
  const execute = (f, args) => f.ctx.tools.execute({ callId: crypto.randomUUID(), name: PNPM_TOOL,
    arguments: args, agent: f.agent, signal: new AbortController().signal })

  test('pnpm query reads the real profile without approval and rejected changes retain all files', async t => {
    const f = await fixture(t)
    const file = join(f.dir, 'package.json')
    const before = await readFile(file, 'utf8')
    const queried = await execute(f, { action: 'get' })
    assert.equal(queried.isError, false)
    assert.equal(JSON.parse(queried.value).version, null)
    assert.deepEqual(f.audit(), [])
    f.ctx.on('approval/request', () => Promise.resolve('rejected'))
    const changed = await execute(f, { action: 'set', version: '11.28.2' })
    assert.equal(JSON.parse(changed.value).phase, 'rejected')
    assert.equal(await readFile(file, 'utf8'), before)
    assert.equal(f.audit()[0].data.toolName, PNPM_TOOL)
    assert.equal(f.audit()[1].data.outcome, 'rejected')
    assert.equal((await execute(f, { action: 'get', version: '11.28.2' })).isError, true)
  })

  test('approved pnpm selection retains unrelated config and cannot race the official writer lock', async t => {
    const f = await fixture(t)
    const file = join(f.dir, 'package.json')
    const manifest = JSON.parse(await readFile(file, 'utf8'))
    manifest.devEngines = { runtime: { name: 'node', version: '>=22' } }
    manifest.packageManager = 'pnpm@11.7.0'
    await writeFile(file, JSON.stringify(manifest))
    await writeFile(join(f.dir, 'pnpm-workspace.yaml'), 'nodeLinker: hoisted\nautoInstallPeers: false\nallowBuilds:\n  retained-package: true\n')
    const workspace = await readFile(join(f.dir, 'pnpm-workspace.yaml'), 'utf8')
    f.ctx.on('approval/request', () => Promise.resolve('allowed-once'))
    const selected = JSON.parse((await execute(f, { action: 'set', version: '11.28.2' })).value)
    assert.equal(selected.phase, 'configured')
    assert.equal(selected.pnpmResult.selection.version, '11.28.2')
    const after = JSON.parse(await readFile(file, 'utf8'))
    assert.deepEqual(after.dependencies, manifest.dependencies)
    assert.deepEqual(after.dsh, manifest.dsh)
    assert.deepEqual(after.devEngines.runtime, manifest.devEngines.runtime)
    assert.equal(after.packageManager, 'pnpm@11.28.2')
    assert.equal(await readFile(join(f.dir, 'pnpm-workspace.yaml'), 'utf8'), workspace)
    await writeFile(`${file}.lock`, `${process.pid}\n`, { flag: 'wx' })
    try {
      const blocked = JSON.parse((await execute(f, { action: 'set', version: '11.7.0' })).value)
      assert.equal(blocked.phase, 'failed')
      assert.match(blocked.error, /package manager is busy/)
      assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), after)
    } finally { await unlink(`${file}.lock`) }
    const restored = JSON.parse((await execute(f, { action: 'set', version: null })).value)
    assert.equal(restored.phase, 'configured')
    const restoredManifest = JSON.parse(await readFile(file, 'utf8'))
    assert.equal(restoredManifest.packageManager, undefined)
    assert.deepEqual(restoredManifest.devEngines, manifest.devEngines)
    assert.equal(await readFile(join(f.dir, 'pnpm-workspace.yaml'), 'utf8'), workspace)
    const tools = f.ctx.tools
    await f.ctx.fiber.dispose()
    assert.equal(tools.get(PNPM_TOOL), undefined)
  })

  test('human pnpm selection works without any Agent or approval and shares the install slot', async t => {
    const f = await fixture(t, { ai: false })
    assert.equal(f.ctx.get('approval'), undefined)
    const pending = f.pnpm.begin('11.28.2')
    await assert.rejects(f.installer.begin({ spec: '-duplicate-package', mode: 'direct' }), /Another installation task is active/)
    const task = await pending
    assert.equal(task.source, 'human-ui')
    assert.equal(task.approval, undefined)
    assert.equal(task.phase, 'configured')
    assert.equal((await readPnpmSelection({ dir: f.dir })).version, '11.28.2')
    assert.equal((await f.pnpm.begin(null)).pnpmResult.selection.version, null)
  })

  test('pnpm selection without an answerer or exact version leaves the profile unchanged', async t => {
    const f = await fixture(t)
    const file = join(f.dir, 'package.json')
    const before = await readFile(file, 'utf8')
    for (const version of ['latest', '11', '^11.28.2', '11.28.2-preview', '01.28.2']) {
      assert.equal((await execute(f, { action: 'set', version })).isError, true)
    }
    assert.deepEqual(f.audit(), [])
    const unavailable = JSON.parse((await execute(f, { action: 'set', version: '11.28.2' })).value)
    assert.equal(unavailable.phase, 'approval-unavailable')
    assert.equal(f.audit()[1].data.outcome, 'unavailable')
    assert.equal(await readFile(file, 'utf8'), before)
    await writeFile(file, JSON.stringify({ ...JSON.parse(before), packageManager: 'npm@11.0.0' }))
    const foreign = await readFile(file, 'utf8')
    const refused = await f.pnpm.begin('11.28.2')
    assert.equal(refused.phase, 'failed')
    assert.match(refused.error, /another package manager/)
    assert.equal(await readFile(file, 'utf8'), foreign)
  })

  for (const dispose of [false, true]) {
    test(dispose ? 'pnpm tool unload cancels pending approval and removes its registration'
      : 'pnpm cancellation ignores late permission and releases the shared operation slot', async t => {
      const f = await fixture(t)
      const file = join(f.dir, 'package.json')
      const before = await readFile(file, 'utf8')
      const entered = Promise.withResolvers()
      const late = Promise.withResolvers()
      f.ctx.on('approval/request', () => { entered.resolve(); return late.promise })
      t.after(() => late.resolve('allowed-once'))
      const operation = execute(f, { action: 'set', version: '11.28.2' })
      await entered.promise
      if (dispose) {
        const entry = [...f.ctx.loader.entries()].find(row => row.options.id === 'bazaar-installer')
        await entry.fiber.dispose()
        assert.equal(f.ctx.tools.get(PNPM_TOOL), undefined)
      } else {
        const duplicate = await execute(f, { action: 'set', version: '11.7.0' })
        assert.equal(duplicate.isError, true)
        assert.deepEqual(await f.pnpm.cancel(f.task.requestId), { status: 'cancelled' })
      }
      const result = JSON.parse((await operation).value)
      late.resolve('allowed-once')
      assert.equal(result.phase, 'cancelled')
      assert.equal(f.audit()[1].data.outcome, 'cancelled')
      assert.equal(await readFile(file, 'utf8'), before)
      assert.equal(f.store.busy(), null)
      assert.equal(JSON.parse(await readFile(f.store.file, 'utf8'))[0].phase, 'cancelled')
    })
  }

  test('selected pnpm executes through the real launcher and official manager', { timeout: 180000,
    skip: !process.env.DSH_TEST_PNPM_ENTRY || !process.env.DSH_TEST_NODE }, async t => {
    const f = await fixture(t, { packageManager: { command: process.env.DSH_TEST_NODE,
      args: [process.env.DSH_TEST_PNPM_ENTRY], env: { PATH: process.env.PATH } },
      spec: 'dsh-bazaar@git+https://github.com/leolee9086/dsh-bazaar.git#v0.1.0' })
    await writeFile(join(f.dir, 'pnpm-workspace.yaml'), 'nodeLinker: hoisted\nautoInstallPeers: false\n')
    f.ctx.on('approval/request', () => Promise.resolve('allowed-once'))
    assert.equal(JSON.parse((await execute(f, { action: 'set', version: '11.28.2' })).value).phase, 'configured')
    const installed = JSON.parse((await f.execute()).value)
    assert.equal(installed.result.packageResult.exitCode, 0)
    assert.match(installed.result.packageResult.output, /using pnpm v11\.28\.2/)
    assert.equal(installed.result.bundle, 'dsh-bazaar')
    assert.equal(installed.phase, 'restart-required')
    assert.equal(JSON.parse(await readFile(join(f.dir, 'package.json'), 'utf8')).devEngines.packageManager.version, '11.28.2')
    const failed = await f.installer.begin({ spec: '-invalid-package-spec', mode: 'direct' })
    while (!failed.done) await new Promise(resolve => setTimeout(resolve, 20))
    assert.equal(failed.phase, 'failed')
    assert.equal((await readPnpmSelection({ dir: f.dir })).version, '11.28.2')
    assert.equal(await readFile(join(f.dir, 'pnpm-workspace.yaml'), 'utf8'), 'nodeLinker: hoisted\nautoInstallPeers: false\n')
  })
}
