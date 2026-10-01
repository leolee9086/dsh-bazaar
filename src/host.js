import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'

/**
 * 集市 host 侧。
 *
 * 只做两件事：把官方 topic 能发现的仓库读出来，把订阅清单里的地址并进来。
 * 不收录、不审核、不判断哪个插件「值得」——列表里出现的每个地址，要么是它自己
 * 打了官方那个 topic，要么是被某份订阅清单写了进去，而那份清单是订阅者自己选的。
 *
 * 安装不在这里实现：包操作一律交给宿主自己的包管理器服务（ctx.pluginManager），
 * 它负责 pnpm、锁文件快照、回滚和激活。集市只负责「让人看见」。
 */

/** 官方唯一的要求：给仓库打这个 topic（deepseek-harness README「社区与支持」）。 */
const OFFICIAL_TOPIC = 'dsh-plugin'

/** GitHub 搜索接口的单页上限。 */
const PAGE_SIZE = 100

/** 同一个查询在这段时间内不再打 GitHub：未认证的搜索额度是每分钟十次。 */
const CACHE_MS = 5 * 60 * 1000

/** 订阅清单存在 profile 下的这个文件里。 */
const STATE_DIR = '.dsh-bazaar'
const STATE_FILE = 'subscriptions.json'

export const name = 'dsh-bazaar'

/** 需要宿主提供的服务。profileContext 是可选的，取不到就不提供订阅功能。 */
export const inject = ['webServer']

/** 缓存：键是「查询|排序|页」，值是 {at, body}。 */
const cache = new Map()

/**
 * 一个仓库地址的身份，取 `owner/repo`；不是仓库地址就返回 null。
 * 接受三种写法，因为订阅清单是手写和脚本各半：`owner/repo`、
 * `https://github.com/owner/repo...`、`github:owner/repo`。
 * @param {string} line
 * @returns {string | null}
 */
export function repoIdentity(line) {
  const trimmed = line.trim()
  if (trimmed === '') return null
  const bare = trimmed
    .replace(/^github:/i, '')
    .replace(/^https?:\/\/(?:www\.)?github\.com\//i, '')
    .replace(/^git@github\.com:/i, '')
    .replace(/[#?].*$/s, '')
    .replace(/\.git$/i, '')
  // 尾部的路径（/tree/main、/blob/...）一律丢掉：清单里写的是仓库，
  // 版本由安装时的 spec 决定，不由清单决定。
  const match = /^([A-Za-z0-9][A-Za-z0-9-]*)\/([A-Za-z0-9._-]+)(?:\/.*)?$/.exec(bare)
  if (match === null) return null
  return `${match[1]}/${match[2]}`
}

/**
 * 解析一份订阅清单：一行一个仓库地址，空行忽略，`#` 开头是注释。
 * 格式故意只要求这一件事——任何脚本 curl 一下就能生成，谁都能托管，
 * 我们不需要为它定 schema，也就不需要为它负责。
 * @param {string} text
 * @returns {string[]} 去重后的 owner/repo 列表
 */
export function parseSubscription(text) {
  const seen = new Set()
  for (const line of text.split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue
    const repo = repoIdentity(line)
    if (repo !== null) seen.add(repo)
  }
  return [...seen]
}

/**
 * 把一个 GitHub 仓库对象压成列表项。只留渲染和支持安装用得上的字段：
 * 目录里不放任何我们自己的判断（评分、推荐度、安全标记），因为没有。
 * @param {any} repo
 */
function toItem(repo) {
  return {
    repo: String(repo.full_name ?? ''),
    url: String(repo.html_url ?? ''),
    description: typeof repo.description === 'string' ? repo.description : '',
    stars: Number.isFinite(repo.stargazers_count) ? repo.stargazers_count : 0,
    pushedAt: typeof repo.pushed_at === 'string' ? repo.pushed_at : null,
    archived: repo.archived === true,
    fork: repo.fork === true,
    topics: Array.isArray(repo.topics) ? repo.topics.filter(t => typeof t === 'string') : [],
  }
}

/**
 * 把搜索响应压成列表要的东西；不是搜索结果就返回 null。
 * @param {string} text
 */
function parseSearchBody(text) {
  try {
    const body = JSON.parse(text)
    const items = Array.isArray(body?.items) ? body.items.map(toItem) : []
    return { items, total: Number.isFinite(body?.total_count) ? body.total_count : items.length }
  } catch {
    return null
  }
}

/**
 * 列表顺序。两种都在本地排：拉回来的那一页够看两种顺序，切换排序不该再打一次 GitHub。
 *
 * `updated` 用 pushedAt 降序，同一时刻再按 star 降序——没有这个次级次序，
 * 同一天推送的一批仓库之间就只剩 GitHub 的返回顺序，看起来是乱的。
 * @param {{stars: number, pushedAt: string | null}[]} items
 * @param {string} sort
 */
function sortItems(items, sort) {
  const byPushed = (a, b) => String(b.pushedAt ?? '').localeCompare(String(a.pushedAt ?? '')) || b.stars - a.stars
  const copy = [...items]
  copy.sort(sort === 'updated' ? byPushed : (a, b) => b.stars - a.stars || byPushed(a, b))
  return copy
}

/**
 * 按官方 topic 搜仓库，固定按 star 拉一页。
 *
 * 先走 gh：它带着自己的登录态，搜索额度是认证后的（每小时 5000 次），而匿名 HTTP
 * 只有每分钟十次——浏览几下就用光了，之后整个列表都是空的。没有 gh 才退回匿名请求。
 * @param {string} query 关键词，空串表示不带关键词（即最热的那一批）
 * @param {number} page
 * @param {AbortSignal} signal
 */
async function searchTopic(query, page, signal) {
  const parts = [`topic:${OFFICIAL_TOPIC}`]
  if (query.trim() !== '') parts.push(query.trim())
  const params = new URLSearchParams({
    q: parts.join(' '),
    sort: 'stars',
    order: 'desc',
    per_page: String(PAGE_SIZE),
    page: String(Math.max(1, Math.trunc(page))),
  })
  const viaGh = await runGh(['api', `search/repositories?${params.toString()}`], { timeoutMs: 40000 })
  if (viaGh.code === 0) {
    const body = parseSearchBody(viaGh.stdout)
    if (body !== null) return body
  }
  const url = new URL('https://api.github.com/search/repositories')
  url.search = params.toString()
  const response = await fetch(url, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'dsh-bazaar' },
    signal,
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    const suffix = detail === '' ? '' : `: ${detail.slice(0, 200)}`
    throw new Error(`GitHub ${response.status}${suffix}`)
  }
  const body = parseSearchBody(await response.text())
  if (body === null) throw new Error('GitHub 返回的不是搜索结果')
  return body
}

/**
 * 读一份订阅清单并解析。失败只影响这一份：清单托管方挂了不该让整个列表空掉。
 * @param {string} url
 * @param {AbortSignal} signal
 * @returns {Promise<{url: string, repos: string[], error?: string}>}
 */
async function readSubscription(url, signal) {
  try {
    const response = await fetch(url, { headers: { 'user-agent': 'dsh-bazaar' }, signal })
    if (!response.ok) return { url, repos: [], error: `HTTP ${response.status}` }
    return { url, repos: parseSubscription(await response.text()) }
  } catch (error) {
    return { url, repos: [], error: error instanceof Error ? error.message : String(error) }
  }
}

/** 订阅清单文件路径；没有 profileContext 时返回 null。 */
function statePath(ctx) {
  const profile = ctx.get('profileContext')
  const dir = typeof profile?.dir === 'string' ? profile.dir : ''
  return dir === '' ? null : { dir: `${dir}/${STATE_DIR}`, file: `${dir}/${STATE_DIR}/${STATE_FILE}` }
}

/**
 * 读订阅清单地址。文件不存在就是「还没订阅过」，返回空数组——
 * 那是一个正常的初始状态，不是错误。
 */
async function readSubscriptions(ctx) {
  const paths = statePath(ctx)
  if (paths === null) return []
  try {
    const text = await (await import('node:fs/promises')).readFile(paths.file, 'utf8')
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed.filter(u => typeof u === 'string') : []
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
}

/** 写订阅清单地址。 */
async function writeSubscriptions(ctx, urls) {
  const paths = statePath(ctx)
  if (paths === null) throw new Error('这个宿主没有提供 profileContext，集市无法保存订阅')
  const fs = await import('node:fs/promises')
  await fs.mkdir(paths.dir, { recursive: true })
  await fs.writeFile(paths.file, `${JSON.stringify(urls, null, 2)}\n`, { mode: 0o600 })
}

/**
 * 变更类端点只认同源请求。浏览器之外没有谁需要它，而这条检查挡住的是
 * 「另一个页面替本机用户点安装」这类事。
 * @param {any} request
 */
function sameOrigin(request) {
  const origin = request.headers.origin
  const host = request.headers.host
  if (typeof origin !== 'string' || origin === '' || typeof host !== 'string') return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

/**
 * 读请求体，带上限：变更端点的 body 只有几十字节，不该被一个巨大的请求拖住。
 * @param {any} request
 * @param {number} limit
 */
async function readBody(request, limit = 64 * 1024) {
  let size = 0
  const chunks = []
  for await (const chunk of request) {
    size += chunk.length
    if (size > limit) throw new Error('request body too large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/** gh 探测结果的缓存时长：它要起一个进程，不该每渲染一次列表就跑一次。 */
const GH_PROBE_MS = 30 * 1000

/** 最近一次 gh 探测：`undefined` 表示还没探过，`null` 表示不可用。 */
let ghProbe = { at: 0, value: undefined }

/**
 * gh 可执行文件的候选位置。
 *
 * 只有第一个走 PATH。GUI 启动的宿主进程拿到的 PATH 常常不含 GitHub CLI 的安装目录
 * （本机实测就是这样：终端里 `gh` 好用，宿主进程里 spawn 直接 ENOENT），
 * 于是「装了 gh」被误判成「没装」。其余是这个工具在各平台的常规安装位置。
 */
const GH_CANDIDATES = [
  'gh',
  'C:\\Program Files\\GitHub CLI\\gh.exe',
  'C:\\Program Files (x86)\\GitHub CLI\\gh.exe',
  '/opt/homebrew/bin/gh',
  '/usr/local/bin/gh',
  '/usr/bin/gh',
]

/** 找到的 gh 路径；`undefined` 还没找过，`null` 找过但没有。 */
let ghPath

/**
 * 找到能用的 gh。只找一次，之后记住——它不会中途换地方。
 * @returns {Promise<string | null>}
 */
async function ghCommand() {
  if (ghPath !== undefined) return ghPath
  for (const candidate of GH_CANDIDATES) {
    const probe = await runGhAt(candidate, ['--version'], { timeoutMs: 10000 })
    if (probe.code === 0) {
      ghPath = candidate
      return candidate
    }
  }
  ghPath = null
  return null
}

/**
 * 跑一条 gh 命令，用找到的那个可执行文件。`shell: false`：仓库名来自界面，
 * shell 会把它当代码。
 * @param {string[]} args
 * @param {{timeoutMs?: number}} [options]
 * @returns {Promise<{code: number|null, stdout: string, stderr: string}>}
 */
async function runGh(args, options = {}) {
  const command = await ghCommand()
  if (command === null) return { code: 127, stdout: '', stderr: '找不到 gh 可执行文件' }
  return runGhAt(command, args, options)
}

/**
 * 用指定的可执行文件跑一条 gh 命令。
 * @param {string} executable
 * @param {string[]} args
 * @param {{timeoutMs?: number}} [options]
 * @returns {Promise<{code: number|null, stdout: string, stderr: string}>}
 */
function runGhAt(executable, args, options = {}) {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(executable, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (error) {
      resolve({ code: 127, stdout: '', stderr: String(error?.message ?? error) })
      return
    }
    let stdout = ''
    let stderr = ''
    let settled = false
    const finish = (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code, stdout, stderr })
    }
    const timer = setTimeout(() => { child.kill() }, options.timeoutMs ?? 120000)
    child.stdout?.on('data', (chunk) => { stdout += chunk.toString('utf8') })
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString('utf8') })
    child.on('error', (error) => { stderr += error.message; finish(127) })
    child.on('close', (code) => { finish(code) })
  })
}

/**
 * 本机能不能用 gh、登的是哪个账号。
 *
 * 这是 fork 安装的前置条件，界面上要如实显示：没有 gh 就把那个按钮标成「需要 gh」，
 * 而不是点了以后报一个看不懂的错，也不是找一条别的路 —— 那不是我们该有的行为。
 * @returns {Promise<{login: string} | null>} 已登录的账号，或 null
 */
async function ghIdentity() {
  if (ghProbe.value !== undefined && Date.now() - ghProbe.at < GH_PROBE_MS) return ghProbe.value
  const probe = await runGh(['api', 'user', '--jq', '.login'], { timeoutMs: 20000 })
  const login = probe.stdout.trim()
  const value = probe.code === 0 && login !== '' ? { login } : null
  ghProbe = { at: Date.now(), value }
  return value
}

/**
 * fork 到自己的账号，并锁住那个 fork 的 HEAD 提交。
 *
 * 先 fork 再装，装的就是自己账号下的那份代码：上游之后怎么推都不会改变本机在跑的东西，
 * 而这份代码随时能在自己的仓库里读、能回退。
 * @param {string} repo `owner/repo`
 * @returns {Promise<{target: string, sha: string}>}
 */
async function forkAndPin(repo) {
  const identity = await ghIdentity()
  if (identity === null) throw new Error('需要 gh：先安装 GitHub CLI 并登录（gh auth login），再回来点这个按钮')
  const name = repo.split('/')[1]
  const forked = await runGh(['repo', 'fork', repo, '--clone=false', '--remote=false'])
  if (forked.code !== 0) throw new Error(`fork 失败：${forked.stderr.trim() || 'gh 没有说明原因'}`)
  const target = `${identity.login}/${name}`
  // fork 创建后要过一会儿才可读，所以这里等它，而不是把第一次的 404 当失败。
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const head = await runGh(['api', `repos/${target}/commits/HEAD`, '--jq', '.sha'], { timeoutMs: 30000 })
    const sha = head.stdout.trim()
    if (head.code === 0 && /^[0-9a-f]{40}$/.test(sha)) return { target, sha }
    await new Promise(resolve => setTimeout(resolve, 1500))
  }
  throw new Error(`fork ${target} 已经建好，但它的 HEAD 提交一直读不到`)
}

/**
/**
 * 变更类端点的公共前置：只收 POST、只认同源、body 必须是 JSON 对象。
 * 抽出来是因为这类端点会越来越多，而这三件事每处写一遍迟早会写出不一致。
 * @param {any} request
 * @returns {Promise<{ok: true, value: any} | {ok: false, status: number, error: string}>}
 */
async function readMutation(request) {
  if (request.method !== 'POST') return { ok: false, status: 405, error: 'method not allowed' }
  if (!sameOrigin(request)) return { ok: false, status: 403, error: 'untrusted origin' }
  try {
    const value = JSON.parse(await readBody(request))
    if (value === null || typeof value !== 'object') return { ok: false, status: 400, error: 'invalid JSON body' }
    return { ok: true, value }
  } catch {
    return { ok: false, status: 400, error: 'invalid JSON body' }
  }
}

/**
 * 当前这一次安装。只放一个槽，因为一次只跑一个：包操作会改 profile 的
 * node_modules，两次并发互相踩没有意义，而人也只会一次点一个。
 * 界面靠轮询它拿到「正在做什么」和 pnpm 的每一行输出。
 * @type {null | {requestId: string, repo: string, spec: string | null, phase: string, log: {stream: string, text: string}[], done: boolean, fork?: string, commit?: string, result?: any, error?: string}}
 */
let currentInstall = null

/** 往当前安装的日志里追加一行；界面就是靠这个看到细节的。 */
function appendLog(stream, text) {
  if (currentInstall === null) return
  currentInstall.log.push({ stream, text })
  // 上限：一次失败的安装可能吐出几兆的日志，界面只需要看尾部。
  if (currentInstall.log.length > 400) currentInstall.log.splice(0, currentInstall.log.length - 400)
}

/**
 * 把 spec 交给宿主自己的包管理器，并把过程记在当前安装上。
 *
 * 这里的 pnpm 输出有两条来源：包管理器通过 `plugin-manager/install-log` 事件
 * 实时转出来的每一行（apply 里订阅），以及返回值里那段收尾的输出——
 * 后者是兜底，免得事件在这台宿主上没接上时界面一片空白。
 * @param {any} ctx
 * @param {string} spec
 */
async function performInstall(ctx, spec) {
  const manager = ctx.get('pluginManager')
  if (manager === undefined || typeof manager.installBundle !== 'function') {
    if (currentInstall !== null) {
      currentInstall.phase = 'failed'
      currentInstall.done = true
      currentInstall.error = '这个宿主没有提供包管理器服务，集市无法安装'
    }
    return
  }
  try {
    const result = await manager.installBundle(spec, { requestId: currentInstall?.requestId })
    if (currentInstall === null) return
    const output = result?.packageResult?.output
    if (currentInstall.log.length === 0 && typeof output === 'string' && output !== '') appendLog('stdout', output)
    currentInstall.phase = 'done'
    currentInstall.done = true
    currentInstall.result = {
      application: result?.application ?? 'unknown',
      ...(result?.error === undefined ? {} : { error: result.error }),
    }
  } catch (error) {
    if (currentInstall === null) return
    currentInstall.phase = 'failed'
    currentInstall.done = true
    currentInstall.error = error instanceof Error ? error.message : String(error)
  }
}

/**
 * @param {any} ctx
 */
export function apply(ctx) {
  // 安装细节来自宿主自己的事件：包管理器把 pnpm 的每一行输出通过
  // `plugin-manager/install-log` 转出来，按 requestId 归到这一次安装上。
  // 状态事件同理。这两条都是宿主本来就发的，我们只是接住。
  ctx.on('plugin-manager/install-log', (chunk) => {
    if (currentInstall === null || chunk?.requestId !== currentInstall.requestId) return
    appendLog(typeof chunk.stream === 'string' ? chunk.stream : 'stdout', typeof chunk.text === 'string' ? chunk.text : '')
  })
  ctx.on('plugin-manager/install-state', (state) => {
    if (currentInstall === null || state?.requestId !== currentInstall.requestId) return
    if (typeof state.phase === 'string') currentInstall.phase = state.phase
  })

  ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-bazaar/list',
    handler: async (request, response) => {
      const send = (status, body) => {
        response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
        response.end(JSON.stringify(body))
      }
      if (request.method !== 'GET') {
        response.writeHead(405, { allow: 'GET' })
        response.end()
        return
      }
      const url = new URL(request.url ?? '/', 'http://localhost')
      const query = url.searchParams.get('q') ?? ''
      const sort = url.searchParams.get('sort') === 'updated' ? 'updated' : 'stars'
      const page = Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1
      // 缓存不含排序：一份数据两种顺序共用，所以切换排序不会再打 GitHub。
      const key = `${query}|${page}`
      // 界面上的刷新按钮带 refresh=1：人点它就是要看这一刻的结果，不该拿缓存糊弄他。
      const hit = url.searchParams.get('refresh') === '1' ? undefined : cache.get(key)
      if (hit !== undefined && Date.now() - hit.at < CACHE_MS) {
        send(200, { ...hit.body, sort, items: sortItems(hit.body.items, sort) })
        return
      }
      const controller = new AbortController()
      request.on('close', () => { controller.abort() })
      try {
        const [topic, ...subscriptions] = await Promise.all([
          searchTopic(query, page, controller.signal),
          ...(await readSubscriptions(ctx)).map(u => readSubscription(u, controller.signal)),
        ])
        // 订阅来的地址只作为「还有这些」附在结果里：它们是仓库名，不是搜索命中，
        // 也没有 star/描述可排。界面对它们单独成组，不去混进排序。
        const subscribed = [...new Set(subscriptions.flatMap(s => s.repos))]
        const body = {
          topic: OFFICIAL_TOPIC,
          sort,
          items: sortItems(topic.items, sort),
          total: topic.total,
          subscribed,
          subscriptions: subscriptions.map(s => ({ url: s.url, count: s.repos.length, ...(s.error === undefined ? {} : { error: s.error }) })),
        }
        cache.set(key, { at: Date.now(), body })
        send(200, body)
      } catch (error) {
        send(502, { error: error instanceof Error ? error.message : String(error) })
      }
    },
  })

  // 安装交给宿主自己的包管理器（ctx.pluginManager）：pnpm、锁文件快照、失败回滚、
  // 激活时机都是它的职责，集市只把 spec 交过去。集市不拼命令行、不碰 node_modules。
  ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-bazaar/install',
    handler: async (request, response) => {
      const send = (status, body) => {
        response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
        response.end(JSON.stringify(body))
      }
      const mutation = await readMutation(request)
      if (!mutation.ok) {
        if (mutation.status === 405) response.writeHead(405, { allow: 'POST' })
        send(mutation.status, { error: mutation.error })
        return
      }
      const repo = repoIdentity(typeof mutation.value?.repo === 'string' ? mutation.value.repo : '')
      if (repo === null) {
        send(400, { error: 'not a repository address' })
        return
      }
      if (currentInstall !== null && !currentInstall.done) {
        send(409, { error: `已经有一次安装在进行（${currentInstall.repo}），等它结束`, busy: true })
        return
      }
      // 不在这里等结果：安装可能跑上一分钟，而界面要一边装一边显示 pnpm 的输出。
      // 所以立即回 202 + requestId，活儿在后台跑，界面去轮询 install-status。
      const spec = `github:${repo}`
      const requestId = randomUUID()
      currentInstall = { requestId, repo, spec, phase: 'installing', log: [], done: false }
      void performInstall(ctx, spec)
      send(202, { requestId, repo, spec })
    },
  })

  // 能力探测。界面据它决定 fork 安装那个按钮长什么样：本机没有 gh 就写「需要 gh」，
  // 而不是让用户点下去再吃一个错误。
  ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-bazaar/capabilities',
    handler: async (request, response) => {
      if (request.method !== 'GET') {
        response.writeHead(405, { allow: 'GET' })
        response.end()
        return
      }
      const identity = await ghIdentity()
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({ gh: identity !== null, login: identity?.login ?? null }))
    },
  })

  // fork 安装：先 fork 到自己账号、锁住那个 fork 的 HEAD，再把那个提交交给包管理器。
  // 装的是自己账号下的一份代码：上游之后怎么推都改不了本机在跑的东西。
  ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-bazaar/fork-install',
    handler: async (request, response) => {
      const send = (status, body) => {
        response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
        response.end(JSON.stringify(body))
      }
      const mutation = await readMutation(request)
      if (!mutation.ok) {
        if (mutation.status === 405) response.writeHead(405, { allow: 'POST' })
        send(mutation.status, { error: mutation.error })
        return
      }
      const repo = repoIdentity(typeof mutation.value?.repo === 'string' ? mutation.value.repo : '')
      if (repo === null) {
        send(400, { error: 'not a repository address' })
        return
      }
      if (currentInstall !== null && !currentInstall.done) {
        send(409, { error: `已经有一次安装在进行（${currentInstall.repo}），等它结束`, busy: true })
        return
      }
      const requestId = randomUUID()
      currentInstall = { requestId, repo, spec: null, phase: 'forking', log: [], done: false }
      // fork 那几步也算进度：界面要能看到「正在 fork」和 fork 出来的提交，
      // 不然点击之后的几秒钟里它只是一片空白。
      void (async () => {
        try {
          appendLog('note', `正在把 ${repo} fork 到你的账号…`)
          const { target, sha } = await forkAndPin(repo)
          appendLog('note', `fork 完成：${target}，锁定提交 ${sha.slice(0, 8)}`)
          if (currentInstall === null) return
          currentInstall.fork = target
          currentInstall.commit = sha
          currentInstall.spec = `github:${target}#${sha}`
          currentInstall.phase = 'installing'
          await performInstall(ctx, currentInstall.spec)
        } catch (error) {
          if (currentInstall === null) return
          currentInstall.phase = 'failed'
          currentInstall.done = true
          currentInstall.error = error instanceof Error ? error.message : String(error)
        }
      })()
      send(202, { requestId, repo })
    },
  })

  // 安装进度：界面每半秒问一次，拿回阶段和到目前为止的输出。
  // 日志只发尾部——够看，而一次啰嗦的安装也不会把响应撑爆。
  ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-bazaar/install-status',
    handler: (request, response) => {
      if (request.method !== 'GET') {
        response.writeHead(405, { allow: 'GET' })
        response.end()
        return
      }
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      if (currentInstall === null) {
        response.end(JSON.stringify({ install: null }))
        return
      }
      response.end(JSON.stringify({
        install: {
          requestId: currentInstall.requestId,
          repo: currentInstall.repo,
          spec: currentInstall.spec,
          phase: currentInstall.phase,
          done: currentInstall.done,
          ...(currentInstall.fork === undefined ? {} : { fork: currentInstall.fork }),
          ...(currentInstall.commit === undefined ? {} : { commit: currentInstall.commit }),
          ...(currentInstall.result === undefined ? {} : { result: currentInstall.result }),
          ...(currentInstall.error === undefined ? {} : { error: currentInstall.error }),
          log: currentInstall.log.slice(-120),
        },
      }))
    },
  })
}
