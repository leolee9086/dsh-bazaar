import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TaskStore } from '../src/tasks.js'

const row = id => ({ requestId: id, done: false, phase: 'awaiting-session', log: [] })
async function fixture(t, options) {
  const dir = await mkdtemp(join(tmpdir(), 'bazaar-test-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  return new TaskStore(dir, options)
}

test('one active task is reserved synchronously and results persist', async t => {
  const store = await fixture(t)
  await store.load()
  assert.equal(store.latest(), null)
  const first = row('one')
  store.add(first)
  assert.throws(() => store.add(row('two')), /active/)
  first.done = true
  first.phase = 'restart-required'
  first.result = { application: 'restart-required', bundle: '@someone/plugin', packageResult: { exitCode: 0, output: 'done' } }
  store.append(first, 'stdout', 'retained diagnostics')
  await store.save()
  const restored = new TaskStore(store.dir)
  await restored.load()
  assert.deepEqual(restored.get('one'), first)
  assert.equal(restored.busy(), null)
  assert.equal(restored.get('not-found'), null)
})

test('restart turns in-flight work into unconfirmed interruption', async t => {
  const store = await fixture(t)
  const task = row('active')
  task.phase = 'installing'
  task.approval = 'allowed-once'
  store.add(task)
  await store.save()
  const restored = new TaskStore(store.dir)
  await restored.load()
  assert.equal(restored.get('active').phase, 'interrupted')
  assert.equal(restored.get('active').done, true)
  assert.equal(restored.busy(), null)
})

test('serialized snapshots retain the newest state and bound history', async t => {
  const store = await fixture(t, { taskLimit: 2 })
  const task = row('one')
  store.add(task)
  const old = store.save()
  task.done = true
  task.phase = 'applied'
  const latest = store.save()
  await Promise.all([old, latest])
  assert.equal(JSON.parse(await readFile(store.file, 'utf8'))[0].phase, 'applied')
  store.add({ ...row('two'), done: true })
  store.add({ ...row('three'), done: true })
  assert.deepEqual(store.list().map(task => task.requestId), ['two', 'three'])
})

test('single oversized and multibyte chunks respect exact byte bounds', async t => {
  const store = await fixture(t, { logBytes: 5 })
  const task = row('unicode')
  store.append(task, 'stdout', 'abcdefghij')
  assert.equal(task.log[0].text, 'fghij')
  store.append(task, 'stderr', '中文中文')
  assert.equal(task.log[0].text, '文')
  assert.ok(task.log.every(entry => !entry.text.includes('\uFFFD')))
  assert.ok(task.log.reduce((sum, entry) => sum + Buffer.byteLength(entry.text), 0) <= 5)
  assert.equal(task.logTruncated, true)
  const tiny = await fixture(t, { logBytes: 1 })
  const smaller = row('tiny')
  tiny.append(smaller, 'stdout', '中')
  assert.equal(smaller.log[0].text, '')
})

test('malformed durable journals fail visibly without overwrite', async t => {
  const store = await fixture(t)
  await writeFile(store.file, 'invalid-json')
  await assert.rejects(store.load())
  assert.equal(await readFile(store.file, 'utf8'), 'invalid-json')
})
