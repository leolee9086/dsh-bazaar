import { test } from 'node:test'
import assert from 'node:assert/strict'
import { searchParameters, parseSearchResponse, pageMetadata, sortCompleteItems, ghProbeState,
  githubTarget, verifiedFork, isOwnRepository, installOutcome, recoverTask } from '../src/protocol.js'

 test('search ordering and pages are sent to GitHub unchanged', () => {
  const params = searchParameters('language:js archived:true fork:true', 'updated', 3)
  assert.equal(params.get('sort'), 'updated')
  assert.equal(params.get('page'), '3')
  assert.equal(params.get('q'), 'topic:dsh-plugin language:js archived:true fork:true')
  assert.equal(searchParameters('', 'stars', 1).get('sort'), 'stars')
})

test('partial, capped, empty and last pages remain distinguishable', () => {
  assert.equal(pageMetadata(10, 10, 1, false).complete, true)
  assert.equal(pageMetadata(10, 10, 1, true).complete, false)
  assert.equal(pageMetadata(200, 100, 1, false).nextPage, 2)
  assert.equal(pageMetadata(5000, 100, 10, false).nextPage, null)
  assert.equal(pageMetadata(5000, 100, 10, false).capped, true)
  assert.equal(pageMetadata(0, 0, 1, false).complete, true)
  assert.equal(pageMetadata(100, 0, 1, true).nextPage, null)
})

test('error JSON is never presented as an empty catalog', () => {
  assert.throws(() => parseSearchResponse('{"message":"rate limited"}'))
  assert.throws(() => parseSearchResponse('{"items":[],"total_count":0}'))
  assert.throws(() => parseSearchResponse('invalid'))
  assert.deepEqual(parseSearchResponse('{"items":[],"total_count":0,"incomplete_results":false}'), { repos: [], total: 0, incomplete: false })
})

test('complete local ordering uses GitHub updated_at rather than pushed_at', () => {
  const rows = [{ repo: 'a/a', stars: 100, updatedAt: '2026-01-01', pushedAt: '2026-10-01' },
    { repo: 'b/b', stars: 0, updatedAt: '2026-10-01', pushedAt: '2026-01-01' }]
  assert.equal(sortCompleteItems(rows, 'updated')[0].repo, 'b/b')
  assert.equal(sortCompleteItems(rows, 'stars')[0].repo, 'a/a')
  assert.equal(rows[0].repo, 'a/a')
})

test('installed CLI failures do not claim CLI absence', () => {
  const probe = (stderr, extra = {}) => ghProbeState({ code: 1, stdout: '', stderr, ...extra }).status
  assert.equal(probe('gh auth login'), 'auth-required')
  assert.equal(probe('HTTP 401 Bad credentials'), 'auth-required')
  assert.equal(probe('HTTP 403 Resource not accessible'), 'permission-denied')
  assert.equal(probe('dial tcp connection refused'), 'network-error')
  assert.equal(probe('', { timedOut: true }), 'network-error')
  assert.equal(probe('unexpected failure'), 'unavailable')
  assert.deepEqual(ghProbeState({ code: 0, stdout: 'my-account\n', stderr: '' }), { status: 'ready', login: 'my-account' })
})

test('fork source refs and actual repository identity are validated', () => {
  assert.deepEqual(githubTarget('github:author/repo#feature/my-work'), { repo: 'author/repo', ref: 'feature/my-work' })
  assert.equal(githubTarget('https://github.com/author/repo/tree/main'), null)
  const fork = { full_name: 'me/renamed', owner: { login: 'me' }, source: { id: 42 }, fork: true }
  assert.equal(verifiedFork({ id: 42 }, fork, 'ME'), 'me/renamed')
  assert.throws(() => verifiedFork({ id: 43 }, fork, 'me'))
  assert.throws(() => verifiedFork({ id: 42 }, { ...fork, fork: false }, 'me'))
  assert.throws(() => verifiedFork({ id: 42 }, fork, 'elsewhere'))
})

test('self-owned repositories use case-insensitive account identity without excluding other owners', () => {
  assert.equal(isOwnRepository('My-Account/plugin', 'my-account'), true)
  assert.equal(isOwnRepository('other/plugin', 'my-account'), false)
  assert.equal(isOwnRepository('org/plugin', 'member-of-org'), false)
  assert.equal(isOwnRepository('My-Account/plugin', null), false)
  assert.equal(isOwnRepository('My-Account/plugin', ''), false)
})

test('resolved manager calls retain all distinct terminal outcomes', () => {
  for (const phase of ['applied', 'restart-required', 'overridden', 'failed', 'cancelled']) {
    assert.equal(installOutcome({ application: phase }), phase)
  }
  assert.equal(installOutcome({ application: 'applied', error: { code: 'operation-error' } }), 'failed')
  assert.equal(installOutcome({ application: 'failed', pendingBuilds: ['native-package'] }), 'awaiting-build-approval')
  assert.equal(installOutcome({ application: 'applied', packageResult: { exitCode: 1 } }), 'failed')
  assert.equal(installOutcome({ application: 'unknown' }), 'unknown-result')
})

test('interrupted tasks cannot replay stored approval', () => {
  const pending = recoverTask({ done: false, phase: 'installing', approval: 'allowed-once' })
  assert.equal(pending.done, true)
  assert.equal(pending.phase, 'interrupted')
  const terminal = { done: true, phase: 'rejected' }
  assert.equal(recoverTask(terminal), terminal)
})
