import { randomUUID } from 'node:crypto'
import { installOutcome, githubTarget } from './protocol.js'

export const INSTALL_TOOL = 'bazaar_install'

/** GUI commands carry human intent; Agent tools must obtain their own official approval. */
export function createInstaller(ctx, store, forkAndPin) {
  const running = new Map()
  let managerScope = null
  let closing = false
  const messageOf = error => error instanceof Error ? error.message : String(error)
  const finish = async (task, phase, error) => {
    task.phase = phase
    task.done = true
    task.finishedAt = Date.now()
    if (error) task.error = messageOf(error).slice(-65536)
    try { await store.save() }
    catch (failure) {
      task.journalError = messageOf(failure)
      ctx.logger.warn('Could not persist bazaar task result', failure)
    }
  }
  const stop = async entries => {
    const drained = []
    for (const [id, entry] of entries) {
      // Applying belongs to the manager: its reload may be disposing this plugin.
      if (entry.managerOwned && store.get(id)?.phase === 'applying') continue
      entry.abort.abort()
      drained.push(entry.settled)
    }
    await Promise.allSettled(drained)
  }
  const validate = args => {
    if (!args || typeof args !== 'object' || Array.isArray(args)
      || Object.keys(args).some(key => key !== 'spec' && key !== 'mode')) throw new Error('Installation accepts only spec and mode')
    const { spec, mode = 'direct' } = args
    if (typeof spec !== 'string' || !spec.trim() || spec.length > 8192) throw new Error('A non-empty installation spec is required')
    if (mode !== 'direct' && mode !== 'fork') throw new Error('Invalid installation mode')
    if (mode === 'fork' && !githubTarget(spec)) throw new Error('Fork requires github:owner/repo#ref')
    return { spec, mode }
  }

  const createTask = (args, exec) => {
    if (!managerScope || closing) throw new Error('Plugin manager unavailable')
    const { spec, mode } = validate(args)
    const task = { requestId: randomUUID(), source: exec ? 'agent' : 'human-ui',
      ...(exec ? { sessionId: exec.agent.id } : {}), mode, requestedSpec: spec, spec,
      phase: exec ? 'awaiting-approval' : 'installing', createdAt: Date.now(), done: false, log: [] }
    // Reserve before any await: HTTP and tool requests share one installation slot.
    store.add(task)
    return task
  }

  const start = (task, scope, authorization) => {
    const manager = scope.pluginManager
    const abort = new AbortController()
    const signal = authorization ? AbortSignal.any([abort.signal, authorization.exec.signal]) : abort.signal
    const entry = { abort, settled: null, scope, authorization, managerOwned: false }
    running.set(task.requestId, entry)
    const admitted = store.save()
    const operation = (async () => {
      try {
        await admitted
        signal.throwIfAborted()
        // Only the tool registration can supply this context; task/input fields cannot skip approval.
        if (authorization) {
          const { approval, exec } = authorization
          const outcome = await approval.request({
            agent: exec.agent, callId: exec.callId, toolName: INSTALL_TOOL, signal,
            reason: `${task.mode === 'fork' ? 'Create or reuse your GitHub fork and install its pinned requested commit' : 'Install'} ${task.requestedSpec}. This changes the current profile for every session. Installed Host code runs outside the workspace sandbox. No additional build-script permissions will be granted.`,
            displayReason: { en: `Install ${task.requestedSpec} (${task.mode}) in the current profile?`,
              zh: `在当前配置安装 ${task.requestedSpec}（${task.mode === 'fork' ? 'Fork 后锁定提交' : '直接安装'}）？会影响所有会话，宿主代码在工作区沙箱之外运行。不会追加构建脚本授权。` },
          })
          signal.throwIfAborted()
          if (outcome !== 'allowed-once') {
            await finish(task, outcome === 'rejected' ? 'rejected' : outcome === 'cancelled' ? 'cancelled' : 'approval-unavailable')
            return
          }
          task.approval = 'allowed-once'
          await store.save()
          signal.throwIfAborted()
        }
        if (task.mode === 'fork') {
          task.phase = 'forking'
          store.append(task, 'note', `Fork: ${task.requestedSpec}\n`)
          const fork = await forkAndPin(task.requestedSpec, signal)
          task.fork = fork.target
          task.commit = fork.sha
          task.spec = `github:${fork.target}#${fork.sha}`
          store.append(task, 'note', `Pinned: ${task.spec}\n`)
        }
        task.phase = 'installing'
        await store.save()
        signal.throwIfAborted()
        let cancellation = Promise.resolve()
        const cancel = () => {
          cancellation = manager.cancelInstall(task.requestId).catch(error => {
            store.append(task, 'stderr', `Cancellation failed: ${messageOf(error)}\n`)
          })
        }
        signal.addEventListener('abort', cancel, { once: true })
        try {
          entry.managerOwned = true
          const result = await manager.installBundle(task.spec, { requestId: task.requestId })
          task.result = result
          const output = result.packageResult?.output
          if (task.log.length === 0 && output) store.append(task, 'stdout', output)
          await finish(task, installOutcome(result), result.error?.diagnostic ?? result.error?.code)
        } finally {
          signal.removeEventListener('abort', cancel)
          await cancellation
        }
      } catch (error) {
        await finish(task, signal.aborted ? 'cancelled' : 'failed', error)
      }
    })()
    entry.settled = operation.finally(() => running.delete(task.requestId))
    return { admitted, settled: entry.settled }
  }

  // The GUI works even when sessions, tools, models or the approval service are absent.
  ctx.inject(['pluginManager'], scope => {
    managerScope = scope
    scope.inject(['tools', 'approval'], toolScope => {
      toolScope.tools.register({
        name: INSTALL_TOOL,
        description: 'Request installation of a DeepSeek Harness plugin using the official package manager. spec preserves the complete package source, version or Git ref; mode defaults to direct, or fork creates/reuses your GitHub fork and pins the requested commit. Every Agent invocation requires official approval before any fork or package changes. Rejected, cancelled or unavailable approval installs nothing. Never grants build-script permissions. GUI installations are separate human commands, not tool requests to claim or replay.',
        parameters: { type: 'object', properties: {
          spec: { type: 'string', description: 'Exact package source, including any version or Git ref.' },
          mode: { type: 'string', enum: ['direct', 'fork'], description: 'Defaults to direct. Fork requires a GitHub spec.' },
        }, required: ['spec'], additionalProperties: false },
        output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
        presentCall: args => ({ card: 'generic', title: 'Install plugin with approval', kind: 'other', rawInput: args }),
        async execute(args, exec) {
          if (!exec.agent || !exec.callId) throw new Error('Agent installation requires a real tool execution context')
          exec.signal.throwIfAborted()
          const task = createTask(args, exec)
          await start(task, scope, { exec, approval: toolScope.approval, owner: toolScope }).settled
          return JSON.stringify({ requestId: task.requestId, phase: task.phase, spec: task.spec,
            ...(task.result ? { result: task.result } : {}), ...(task.error ? { error: task.error } : {}),
            ...(task.journalError ? { journalError: task.journalError } : {}) })
        },
      })
      toolScope.effect(() => () => stop([...running].filter(([, entry]) => entry.authorization?.owner === toolScope)))
    })
    scope.effect(() => async () => {
      if (managerScope === scope) managerScope = null
      await stop([...running].filter(([, entry]) => entry.scope === scope))
    })
  })

  ctx.on('plugin-manager/install-log', chunk => {
    const task = store.get(chunk.requestId)
    if (task && !task.done) store.append(task, chunk.stream, chunk.text)
  })
  ctx.on('plugin-manager/install-state', state => {
    const task = store.get(state.requestId)
    if (task && !task.done) { task.phase = state.phase; task.attempt = state.attempt ?? null }
  })
  ctx.effect(() => async () => {
    closing = true
    await stop([...running])
    for (const task of store.list()) {
      if (!task.done && !running.has(task.requestId)) await finish(task, 'interrupted', 'Bazaar unloaded before this request finished')
    }
    try { await store.save() }
    catch (error) { ctx.logger.warn('Could not persist bazaar tasks during unload', error) }
  })

  return {
    available: () => !!managerScope && !closing,
    /** Only authenticated, same-origin GUI command routes call this human-intent entry. */
    async begin(args) {
      const task = createTask(args)
      const operation = start(task, managerScope)
      try { await operation.admitted }
      catch (error) {
        await operation.settled
        throw Object.assign(new Error(messageOf(error), { cause: error }), { requestId: task.requestId })
      }
      return task
    },
    async cancel(requestId) {
      const task = store.get(requestId)
      if (!task || task.done) return { status: 'not-running' }
      if (task.phase === 'applying') return { status: 'too-late' }
      const active = running.get(requestId)
      if (!active) { await finish(task, 'cancelled'); return { status: 'cancelled' } }
      active.abort.abort()
      await active.settled
      return { status: task.phase === 'cancelled' ? 'cancelled' : 'too-late' }
    },
  }
}
