import { randomUUID } from 'node:crypto'
import { readFile, writeFile, rename, unlink } from 'node:fs/promises'
import { join } from 'node:path'

export const PNPM_TOOL = 'bazaar_pnpm'
export const RECOMMENDED_PNPM = '11.28.2'
const exactVersion = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/

/** A version selection is project data; it never replaces the bundled executable. */
function describe(manifest) {
  const engine = manifest.devEngines?.packageManager
  const legacy = manifest.packageManager
  const legacyVersion = typeof legacy === 'string' ? /^pnpm@([^+]+)(?:\+.*)?$/.exec(legacy)?.[1] : undefined
  return {
    version: engine?.name === 'pnpm' ? engine.version ?? null : legacyVersion ?? null,
    onFail: engine?.name === 'pnpm' ? engine.onFail ?? null : null,
    packageManager: legacy ?? null,
    recommended: RECOMMENDED_PNPM,
    localLinks: Object.entries(manifest.dependencies ?? {}).filter(([, spec]) => typeof spec === 'string' && spec.startsWith('link:')).map(([name]) => name),
  }
}

function validateVersion(version) {
  if (version !== null && (typeof version !== 'string' || !exactVersion.test(version))) {
    throw new Error('Choose an exact pnpm release such as 11.28.2, or null to restore the launcher default')
  }
}

/** Read only the actual profile declaration; a configured version is not a running-version probe. */
export async function readPnpmSelection(profile) {
  if (!profile?.dir) throw new Error('Current profile unavailable')
  return describe(JSON.parse(await readFile(join(profile.dir, 'package.json'), 'utf8')))
}

/**
 * Commit under the same package.json.lock convention used by the official manager.
 * Fail on contention rather than stealing an installation's lock. Only pnpm selection
 * fields change; dependencies, build-script permissions and dependency layout are retained.
 */
export async function selectPnpmVersion(profile, version, signal) {
  validateVersion(version)
  if (!profile?.dir) throw new Error('Current profile unavailable')
  const file = join(profile.dir, 'package.json')
  const lock = `${file}.lock`
  const temporary = `${file}.bazaar-${randomUUID()}.tmp`
  signal?.throwIfAborted()
  try { await writeFile(lock, `${process.pid}\n`, { flag: 'wx', mode: 0o600 }) }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error('The official package manager is busy; retry after its operation finishes')
    throw error
  }
  try {
    const before = await readFile(file, 'utf8')
    const manifest = JSON.parse(before)
    const previous = describe(manifest)
    if (manifest.devEngines !== undefined && (!manifest.devEngines || typeof manifest.devEngines !== 'object' || Array.isArray(manifest.devEngines))) {
      throw new Error('The profile devEngines declaration is not an object')
    }
    const engine = manifest.devEngines?.packageManager
    if (engine !== undefined && (!engine || typeof engine !== 'object' || Array.isArray(engine) || engine.name !== 'pnpm')) {
      throw new Error('The profile selects another package manager; its declaration was retained')
    }
    if (manifest.packageManager !== undefined && (typeof manifest.packageManager !== 'string' || !manifest.packageManager.startsWith('pnpm@'))) {
      throw new Error('The profile selects another package manager; its declaration was retained')
    }
    if (version === null) {
      if (manifest.devEngines) {
        delete manifest.devEngines.packageManager
        if (Object.keys(manifest.devEngines).length === 0) delete manifest.devEngines
      }
      delete manifest.packageManager
    } else {
      manifest.devEngines = { ...manifest.devEngines, packageManager: { name: 'pnpm', version, onFail: 'download' } }
      // Keep an existing legacy pnpm declaration consistent with the native selector.
      if (manifest.packageManager !== undefined) manifest.packageManager = `pnpm@${version}`
    }
    const current = describe(manifest)
    if (JSON.stringify(current) === JSON.stringify(previous)) return { changed: false, selection: current }
    signal?.throwIfAborted()
    await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
    // Editors outside the official manager do not take its lock. Retain their changes.
    if (await readFile(file, 'utf8') !== before) throw new Error('The profile changed while selecting pnpm; retry with the current declaration')
    signal?.throwIfAborted()
    await rename(temporary, file)
    return { changed: true, previous, selection: current }
  } finally {
    try {
      try { await unlink(temporary) } catch (error) { if (error.code !== 'ENOENT') throw error }
    } finally { await unlink(lock) }
  }
}

/** GUI and Agent commands share the installation slot but obtain authority separately. */
export function createPnpmController(ctx, store) {
  const running = new Map()
  let closing = false
  const profile = () => ctx.get('profileContext')
  const messageOf = error => error instanceof Error ? error.message : String(error)
  const start = (version, authorization) => {
    validateVersion(version)
    if (closing || !profile()?.dir) throw new Error('Current profile unavailable')
    const task = { requestId: randomUUID(), kind: 'pnpm', source: authorization ? 'agent' : 'human-ui',
      ...(authorization ? { sessionId: authorization.exec.agent.id } : {}), version,
      requestedSpec: version === null ? 'pnpm:launcher-default' : `pnpm@${version}`,
      phase: authorization ? 'awaiting-approval' : 'configuring', createdAt: Date.now(), done: false, log: [] }
    task.spec = task.requestedSpec
    store.add(task)
    const abort = new AbortController()
    const signal = authorization ? AbortSignal.any([abort.signal, authorization.exec.signal]) : abort.signal
    const operation = (async () => {
      try {
        await store.save()
        signal.throwIfAborted()
        if (authorization) {
          const { exec, approval } = authorization
          const target = version === null ? 'the launcher default' : `pnpm ${version}`
          const outcome = await approval.request({ agent: exec.agent, callId: exec.callId, toolName: PNPM_TOOL, signal,
            reason: `Select ${target} for the current profile's future official package operations. pnpm may download the selected executable on the next operation. This affects every session. No plugin installation, dependency-layout change or build-script permission is included.`,
            displayReason: { en: `Use ${target} for this profile's future package operations?`,
              zh: version === null ? '恢复当前配置的默认 pnpm？后续安装会使用启动器选择的版本。'
                : `将当前配置的 pnpm 固定到 ${version}？后续官方安装可能下载此版本，影响所有会话；不会安装插件或追加构建脚本授权。` } })
          signal.throwIfAborted()
          if (outcome !== 'allowed-once') {
            task.phase = outcome === 'rejected' ? 'rejected' : outcome === 'cancelled' ? 'cancelled' : 'approval-unavailable'
            return
          }
          task.approval = 'allowed-once'
          await store.save()
        }
        signal.throwIfAborted()
        task.phase = 'configuring'
        task.pnpmResult = await selectPnpmVersion(profile(), version, signal)
        task.phase = 'configured'
        store.append(task, 'note', `Selected ${task.requestedSpec} for future official package operations.\n`)
      } catch (error) {
        task.phase = signal.aborted ? 'cancelled' : 'failed'
        task.error = messageOf(error)
      } finally {
        task.done = true
        task.finishedAt = Date.now()
        try { await store.save() }
        catch (error) { task.journalError = messageOf(error); ctx.logger.warn('Could not persist pnpm selection', error) }
      }
    })()
    const settled = operation.finally(() => running.delete(task.requestId))
    running.set(task.requestId, { abort, settled, owner: authorization?.owner })
    return { task, settled }
  }
  ctx.inject(['tools', 'approval'], scope => {
    scope.tools.register({ name: PNPM_TOOL,
      description: 'Read or select the pnpm version used by future official package operations in the current profile. action=get is read-only. action=set requires official approval and an exact release version, or null to restore the launcher default. Does not install plugins or grant build-script permissions. Version selection alone does not fix cross-drive link replacement.',
      parameters: { type: 'object', properties: { action: { type: 'string', enum: ['get', 'set'] },
        version: { type: ['string', 'null'], description: 'For set: exact release such as 11.28.2, or null for the launcher default.' } }, required: ['action'], additionalProperties: false },
      output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
      presentCall: args => ({ card: 'generic', title: 'Profile pnpm version', kind: 'other', rawInput: args }),
      async execute(args, exec) {
        if (args.action === 'get') {
          if (Object.hasOwn(args, 'version')) throw new Error('Reading the version accepts no mutation fields')
          return JSON.stringify(await readPnpmSelection(profile()))
        }
        if (args.action !== 'set' || !exec.agent || !exec.callId) throw new Error('pnpm selection requires a real tool execution context')
        exec.signal.throwIfAborted()
        const operation = start(args.version, { exec, approval: scope.approval, owner: scope })
        await operation.settled
        return JSON.stringify(operation.task)
      },
    })
    scope.effect(() => async () => {
      const entries = [...running.values()].filter(entry => entry.owner === scope)
      for (const entry of entries) entry.abort.abort()
      await Promise.allSettled(entries.map(entry => entry.settled))
    })
  })
  ctx.effect(() => async () => {
    closing = true
    for (const entry of running.values()) entry.abort.abort()
    await Promise.allSettled([...running.values()].map(entry => entry.settled))
  })
  return {
    available: () => !closing && !!profile()?.dir,
    read: () => readPnpmSelection(profile()),
    async begin(version) { const operation = start(version); await operation.settled; return operation.task },
    async cancel(id) {
      const entry = running.get(id)
      if (!entry) return { status: 'not-running' }
      entry.abort.abort()
      await entry.settled
      return { status: store.get(id)?.phase === 'cancelled' ? 'cancelled' : 'too-late' }
    },
  }
}
