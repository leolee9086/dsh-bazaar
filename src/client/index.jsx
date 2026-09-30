/**
 * 集市浏览器侧：侧栏一格 + 一个主区面板。
 *
 * 面板只做三件事：搜索、排序、把每个仓库的安装按钮交给宿主自己的包管理器。
 * 没有评分、没有推荐、没有「已审核」标记——列表里的每一行都是打了官方那个
 * topic 的仓库，我们的意见不在其中。
 *
 * 安装有两种：直接装原仓库，或者先 fork 到自己账号再装那个锁定的提交。
 * 后者依赖本机的 gh：没有就如实标成「需要 gh」，不弹错误、也不找别的路。
 */
import { useCallback, useEffect, useState } from 'react'

const PANEL_ID = 'bazaar'

/** 侧栏那一格的图标。只吃宿主给的 size；选中态由侧栏自己画。 */
export function BazaarIcon({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M1.8 5.6h12.4L12.9 2.4H3.1L1.8 5.6Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M3.1 5.6v8h9.8v-8" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M6.3 13.6v-3.3h3.4v3.3" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  )
}

/** 星数：四位数以上压成 k，卡片上够用就行。 */
function formatStars(count) {
  return count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count)
}

/** 日期只显示到天：这一行需要说明的只是「最近有没有动」。 */
function formatDay(iso) {
  return typeof iso === 'string' ? iso.slice(0, 10) : '—'
}

/**
 * fork 按钮的鼠标提示：说清楚它现在为什么点不了。
 * 「没探测到」和「确认没有」分开说，因为前者可能只是宿主还没重启、
 * 那条能力路由还不存在——把自己的问题说成用户没装工具是错的。
 */
function ghHint(gh) {
  if (gh.status === 'ready') return gh.login === '' ? 'fork 到你的 GitHub 账号再安装' : `fork 到 ${gh.login} 再安装`
  if (gh.status === 'missing') return '需要 CLI 工具支持'
  if (gh.status === 'unknown') return '暂时无法确认本机是否有 gh'
  return '正在检测 gh…'
}

/** 安装阶段的说法，取自宿主自己的 install-state。 */
function phaseLabel(phase) {
  return {
    forking: '正在 fork',
    installing: '正在安装',
    applying: '正在应用',
    cancelling: '正在取消',
    done: '完成',
    failed: '失败',
  }[phase] ?? phase
}

const BORDER = '1px solid var(--dsw-alias-border-secondary, rgba(127,127,127,0.22))'

const styles = {
  wrap: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, padding: '18px 22px', gap: 14 },
  head: { display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' },
  title: { fontSize: 18, fontWeight: 600, margin: 0, letterSpacing: '0.2px' },
  note: { fontSize: 12, opacity: 0.6 },
  controls: { display: 'flex', gap: 8, alignItems: 'center' },
  input: { flex: '1 1 auto', minWidth: 180, padding: '8px 12px', fontSize: 13, borderRadius: 8, border: BORDER, background: 'transparent', color: 'inherit' },
  button: { padding: '7px 14px', fontSize: 13, borderRadius: 8, border: BORDER, background: 'transparent', color: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' },
  buttonDisabled: { padding: '7px 14px', fontSize: 13, borderRadius: 8, border: BORDER, background: 'transparent', color: 'inherit', cursor: 'not-allowed', whiteSpace: 'nowrap', opacity: 0.45 },
  buttonPrimary: { padding: '7px 14px', fontSize: 13, borderRadius: 8, border: '1px solid transparent', background: 'var(--dsw-alias-brand-primary, #4f6ef7)', color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' },
  list: { flex: '1 1 auto', minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 2 },
  card: { border: BORDER, borderRadius: 12, padding: '13px 15px', display: 'flex', gap: 14, alignItems: 'flex-start', background: 'var(--dsw-alias-bg-layer-1, transparent)' },
  cardMain: { flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 },
  desc: { fontSize: 12.5, opacity: 0.78, lineHeight: '19px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' },
  metaRow: { display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11.5, opacity: 0.62, alignItems: 'center' },
  chip: { padding: '1px 7px', borderRadius: 999, border: BORDER, fontSize: 11, opacity: 0.9 },
  actions: { display: 'flex', flexDirection: 'column', gap: 7, flex: '0 0 auto' },
  state: { fontSize: 11.5, marginTop: 2 },
  log: { marginTop: 8, border: BORDER, borderRadius: 8, overflow: 'hidden' },
  logHead: { padding: '5px 10px', fontSize: 11.5, opacity: 0.75, borderBottom: BORDER, display: 'flex', gap: 8, flexWrap: 'wrap' },
  logBody: { margin: 0, padding: '8px 10px', fontSize: 11, lineHeight: '16px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 220, overflowY: 'auto', background: 'rgba(127,127,127,0.06)' },
  cardHover: { borderColor: 'var(--dsw-alias-brand-primary, #4f6ef7)', background: 'rgba(127,127,127,0.045)' },
  repoLink: { fontSize: 14, fontWeight: 600, color: 'var(--dsw-alias-brand-primary, #4f6ef7)', textDecoration: 'none', wordBreak: 'break-all' },
  external: { fontSize: 11, opacity: 0.7, marginLeft: 4 },
}

/**
 * 一张仓库卡片。
 *
 * 抽成组件是为了 hover：内联样式没有 :hover 选择器，而把鼠标事件挂在整张列表上
 * 会让每一次划过都重渲染整页。这样只有被划过的那一张重渲染。
 * 仓库名是链接——列表里最重要的一件事就是「让我去看看它」。
 */
function RepoCard({ item, direct, forked, running, progress, gh, onInstall }) {
  const [hover, setHover] = useState(false)
  const states = [direct, forked].filter(state => state !== undefined)
  return (
    <div
      style={hover ? { ...styles.card, ...styles.cardHover } : styles.card}
      onMouseEnter={() => { setHover(true) }}
      onMouseLeave={() => { setHover(false) }}
    >
      <div style={styles.cardMain}>
        <a
          style={hover ? { ...styles.repoLink, textDecoration: 'underline' } : styles.repoLink}
          href={item.url}
          target="_blank"
          rel="noreferrer"
          title={`在 GitHub 打开 ${item.repo}`}
        >{item.repo}<span style={styles.external}>↗</span></a>
        {item.description !== '' && <div style={styles.desc}>{item.description}</div>}
        <div style={styles.metaRow}>
          <span>★ {formatStars(item.stars)}</span>
          <span>最近推送 {formatDay(item.pushedAt)}</span>
          {item.archived && <span style={styles.chip}>已归档</span>}
          {item.fork && <span style={styles.chip}>fork</span>}
        </div>
        {states.map((state, index) => (
          <div key={index} style={{ ...styles.state, color: state.status === 'failed' ? '#c0392b' : undefined }}>
            {state.status === 'busy' ? '正在提交…' : state.message}
          </div>
        ))}
        {running && progress !== null && (
          <div style={styles.log}>
            <div style={styles.logHead}>
              <span>{phaseLabel(progress.phase)}</span>
              {typeof progress.spec === 'string' && <span style={{ opacity: 0.7 }}>{progress.spec}</span>}
            </div>
            <pre style={styles.logBody}>
              {Array.isArray(progress.log) && progress.log.length > 0
                ? progress.log.map(entry => entry.text).join('')
                : '等待输出…'}
            </pre>
          </div>
        )}
      </div>
      <div style={styles.actions}>
        <button
          style={styles.buttonPrimary}
          type="button"
          disabled={direct?.status === 'busy' || direct?.status === 'installing' || direct?.status === 'done'}
          onClick={() => { onInstall(item.repo, 'direct') }}
        >{direct?.status === 'done' ? '已安装' : direct?.status === 'installing' ? '安装中…' : '安装'}</button>
        <button
          // 名字始终是它要做的事；能不能点是状态，不该改它的名字。
          style={gh.status === 'ready' ? styles.button : styles.buttonDisabled}
          type="button"
          disabled={gh.status !== 'ready' || forked?.status === 'busy' || forked?.status === 'installing' || forked?.status === 'done'}
          title={ghHint(gh)}
          onClick={() => { onInstall(item.repo, 'fork') }}
        >{forked?.status === 'done' ? '已装' : forked?.status === 'installing' ? '安装中…' : 'Fork 安装'}</button>
      </div>
    </div>
  )
}

/** 主区面板：替换对话和右侧边栏，跟官方「插件」那一格的行为一致。 */
export function BazaarPanel() {
  const [draft, setDraft] = useState('')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('stars')
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [installs, setInstalls] = useState({})
  /**
   * gh 的可用性：`{status: 'probing' | 'ready' | 'missing' | 'unknown', login}`。
   * 四种状态分开是有意的——「还没问到」不等于「没有」。
   */
  const [gh, setGh] = useState({ status: 'probing', login: '' })
  /** 正在跑的那一次安装：`{key, repo, requestId}`。宿主一次只跑一个。 */
  const [active, setActive] = useState(null)
  /** 轮询回来的安装详情：阶段与 pnpm 的输出。 */
  const [progress, setProgress] = useState(null)

  const load = useCallback(async (signal) => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/dsh-bazaar/list?q=${encodeURIComponent(query)}&sort=${sort}`, {
        signal, headers: { accept: 'application/json' },
      })
      if (!response.ok) {
        const detail = await response.json().catch(() => null)
        throw new Error(detail?.error ?? `HTTP ${response.status}`)
      }
      setData(await response.json())
    } catch (caught) {
      if (caught?.name === 'AbortError') return
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setLoading(false)
    }
  }, [query, sort])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => { controller.abort() }
  }, [load])

  // 能力探测只做一次：它决定 fork 安装那个按钮是能点、还是写着「需要 gh」。
  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const response = await fetch('/dsh-bazaar/capabilities', { headers: { accept: 'application/json' } })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const body = await response.json()
        if (!alive) return
        setGh(body?.gh === true
          ? { status: 'ready', login: typeof body.login === 'string' ? body.login : '' }
          : { status: 'missing', login: '' })
      } catch {
        // 问不出来就问不出来，别替用户下结论。
        if (alive) setGh({ status: 'unknown', login: '' })
      }
    })()
    return () => { alive = false }
  }, [])

  /**
   * 两种安装走两条路由，其余一样：直接安装装原仓库；fork 安装先把它复制到自己的
   * 账号并锁住那个提交，本机跑的就是自己账号下的那份代码，上游之后怎么推都改不了它。
   * 两条都立刻返回 requestId，细节靠下面的轮询显示。
   */
  const install = useCallback(async (repo, mode) => {
    const key = `${mode}:${repo}`
    setProgress(null)
    setInstalls(previous => ({ ...previous, [key]: { status: 'busy' } }))
    try {
      const response = await fetch(mode === 'fork' ? '/dsh-bazaar/fork-install' : '/dsh-bazaar/install', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ repo }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error ?? `HTTP ${response.status}`)
      setInstalls(previous => ({ ...previous, [key]: { status: 'installing' } }))
      setActive({ key, repo, requestId: body?.requestId })
    } catch (caught) {
      setInstalls(previous => ({ ...previous, [key]: { status: 'failed', message: caught instanceof Error ? caught.message : String(caught) } }))
    }
  }, [])

  // 安装期间的轮询：拿阶段和 pnpm 的每一行输出，装完把结果落到对应的那张卡上。
  useEffect(() => {
    if (active === null) return
    let alive = true
    const tick = async () => {
      try {
        const response = await fetch('/dsh-bazaar/install-status', { headers: { accept: 'application/json' } })
        const body = response.ok ? await response.json() : null
        const install = body?.install
        if (!alive || !install) return
        setProgress(install)
        if (install.done !== true) return
        const detail = typeof install.error === 'string'
          ? install.error
          : install.fork
            ? `已 fork 到 ${install.fork}，装下 ${String(install.commit ?? '').slice(0, 8)}（${install.result?.application ?? 'ok'}）`
            : `已装（${install.result?.application ?? 'ok'}）`
        setInstalls(previous => ({ ...previous, [active.key]: { status: typeof install.error === 'string' ? 'failed' : 'done', message: detail } }))
        setActive(null)
      } catch {
        // 一次轮询失败不是错误：下一次再问就是了。
      }
    }
    const timer = setInterval(() => { void tick() }, 500)
    void tick()
    return () => { alive = false; clearInterval(timer) }
  }, [active])

  const items = Array.isArray(data?.items) ? data.items : []
  const subscribed = Array.isArray(data?.subscribed) ? data.subscribed : []

  return (
    <div style={styles.wrap}>
      <div style={styles.head}>
        <h2 style={styles.title}>集市</h2>
        <span style={styles.note}>
          按官方 <code>dsh-plugin</code> 话题收录{data?.total ? ` · 共 ${data.total} 个仓库` : ''}
          {gh.status === 'ready' && gh.login !== '' ? ` · fork 会落在 ${gh.login}` : ''}
        </span>
      </div>
      <form style={styles.controls} onSubmit={(event) => { event.preventDefault(); setQuery(draft.trim()) }}>
        <input
          style={styles.input}
          value={draft}
          placeholder="搜索仓库名、描述或话题"
          onChange={(event) => { setDraft(event.target.value) }}
        />
        <button style={styles.button} type="submit">搜索</button>
        <button
          style={styles.button}
          type="button"
          onClick={() => { setSort(sort === 'stars' ? 'updated' : 'stars') }}
        >{sort === 'stars' ? '按 star' : '按最近更新'}</button>
      </form>
      {error !== null && <div style={{ fontSize: 12, color: '#c0392b' }}>读取失败：{error}</div>}
      <div style={styles.list}>
        {loading && items.length === 0 && <div style={{ ...styles.card, opacity: 0.7 }}>正在读取…</div>}
        {!loading && items.length === 0 && error === null && <div style={{ ...styles.card, opacity: 0.7 }}>这个条件下没有仓库。</div>}
        {items.map(item => (
          <RepoCard
            key={item.repo}
            item={item}
            direct={installs[`direct:${item.repo}`]}
            forked={installs[`fork:${item.repo}`]}
            running={active !== null && active.repo === item.repo}
            progress={progress}
            gh={gh}
            onInstall={install}
          />
        ))}
      </div>
      {subscribed.length > 0 && (
        <div style={styles.note}>
          订阅清单里还有 {subscribed.length} 个地址：{subscribed.slice(0, 6).join('、')}
          {subscribed.length > 6 ? ' …' : ''}
        </div>
      )}
    </div>
  )
}

export const inject = ['slots']

/**
 * 注册侧栏那一格和它的主区面板。两个插槽是一对：`sidebar.panellist` 画那一格，
 * 它的 id 就是 `main` 的 key。都用 slots.inject，宿主没声明这两个插槽时这段代码不跑。
 */
export function apply(ctx) {
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID }, BazaarPanel))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: 30,
    label: () => '集市',
  }, BazaarIcon))
}
