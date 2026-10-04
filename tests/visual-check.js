import * as fs from 'node:fs/promises'
import * as path from 'node:path'

export default async function visualCheck(page, root) {
  const runtime = await fs.readFile(path.join(root, '.test-build/visual-runtime.iife.js'), 'utf8')
  const artifact = await fs.readFile(path.join(root, 'lib/client.js'), 'utf8')
  const output = path.join(root, 'test-results')
  await fs.mkdir(output, { recursive: true })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setContent('<!doctype html><html lang="zh"><head><meta charset="UTF-8"><style>html,body,#root{height:100%;margin:0}body{font-family:Arial,"Microsoft YaHei",sans-serif;color:#25272b;background:#fff;--dsw-alias-border-secondary:#dce0e5;--dsw-alias-bg-layer-1:#fff;--dsw-alias-bg-layer-2:#f3f5f7;--dsw-alias-brand-primary:#087f79;--dsw-alias-text-primary:#25272b;--dsw-alias-text-error:#b32935}</style></head><body><div id="root"></div></body></html>')
  await page.addScriptTag({ content: runtime })
  await page.evaluate(() => {
    const task = { requestId: 'visual-task-123', sessionId: 'visual-session-123', requestedSpec: 'github:example/plugin#feature/keep-exact-ref', spec: 'github:example/plugin#feature/keep-exact-ref',
      phase: 'restart-required', done: true, log: [{ stream: 'stdout', text: 'Package installed. Restart required.\n' }],
      result: { application: 'restart-required', changed: true, bundle: '@example/actual-package', pendingBuilds: ['native-addon'], warnings: ['Build scripts were not approved.'] } }
    const repos = ['example/agent-workspace-tools', 'community/plugin-with-a-very-long-repository-name-for-responsive-checking', 'example/archived-fork']
    const values = {
      list: { items: repos.map((repo, i) => ({ repo, url: `https://github.com/${repo}`, description: i === 1 ? 'A repository description with a long URL https://example.org/a/very/long/unbroken/value and Chinese text.' : 'Community plugin repository', stars: 12 + i, pushedAt: '2026-10-01T00:00:00Z', archived: i === 2, fork: i === 2 })), total: 103, nextPage: 2, subscriptions: [], subscribed: [] },
      capabilities: { gh: { status: 'missing' }, installation: true, approval: 'agent-only' },
      installed: { bundles: [{ name: '@example/actual-package', installed: true, enabled: true }] },
      'install-status': { install: task, busy: null, tasks: [task] },
    }
    window.fixtureEndpoints = []
    window.fetch = async (input) => {
      const url = new URL(String(input), 'http://fixture.local')
      window.fixtureEndpoints.push(url.pathname.split('/').at(-1))
      return new Response(JSON.stringify(values[url.pathname.split('/').at(-1)] ?? { error: 'No fixture response' }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    // Only adapt the Client module loader and slot callback to obtain its rendered component.
    window.__ModuleLoader__ = { load({ factory }) {
      const modules = { react: window.bazaarVisualRuntime.React, 'react/jsx-runtime': window.bazaarVisualRuntime.jsxRuntime }
      const plugin = factory(name => { if (!modules[name]) throw new Error(`Unexpected bundled external ${name}`); return modules[name] })
      let Panel
      plugin.apply({ slots: { inject(_slot, callback) { callback() }, register(meta, component) { if (meta.name === 'main') Panel = component } } })
      const root = window.bazaarVisualRuntime.createRoot(document.getElementById('root'))
      root.render(window.bazaarVisualRuntime.React.createElement(Panel))
      window.renderAccountBazaarFixture = () => {
        values.capabilities.gh = { status: 'ready', login: 'EXAMPLE' }
        root.render(window.bazaarVisualRuntime.React.createElement(Panel, { key: 'account-ready' }))
      }
      window.renderLegacyBazaarFixture = () => {
        const modernFetch = window.fetch
        window.legacyMutationCount = 0
        window.fetch = async (input, options) => {
          if (options?.method === 'POST') window.legacyMutationCount += 1
          const endpoint = new URL(String(input), 'http://fixture.local').pathname.split('/').at(-1)
          if (endpoint === 'sessions' || endpoint === 'installed') return new Response('', { status: 404 })
          if (endpoint === 'install-status') return Response.json({ install: null })
          if (endpoint === 'capabilities') return Response.json({ gh: true, login: 'legacy-account' })
          return modernFetch(input, options)
        }
        root.render(window.bazaarVisualRuntime.React.createElement(Panel, { key: 'legacy-host' }))
      }
    } }
  })
  await page.addScriptTag({ content: artifact })
  try { await page.getByRole('status').filter({ hasText: '已安装，需重启' }).waitFor({ timeout: 10000 }) }
  catch (error) { throw new Error(JSON.stringify({ errors, body: await page.locator('body').innerText(), cause: error.message })) }
  const reports = []
  for (const [width, height] of [[1440, 900], [768, 1024], [390, 844], [320, 760]]) {
    await page.setViewportSize({ width, height })
    await page.getByRole('button', { name: 'Fork 安装: 需要 CLI 工具支持' }).first().focus()
    const report = await page.evaluate(() => {
      const surface = document.querySelector('.bazaar')
      const controls = [...document.querySelectorAll('button,input,select')]
      const outside = controls.filter(element => { const r = element.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1 }).map(element => element.outerHTML.slice(0, 160))
      const overlapping = []
      for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++) {
        const a = controls[i].getBoundingClientRect(), b = controls[j].getBoundingClientRect()
        if (a.width && b.width && Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) overlapping.push([i, j])
      }
      const tooltip = document.querySelector('.bazaar-hint:focus-within [role=tooltip]')
      return { width: innerWidth, horizontalOverflow: surface.scrollWidth > surface.clientWidth + 1,
        outside, overlapping, icons: document.querySelectorAll('svg.lucide').length,
        tooltip: tooltip?.textContent, cards: document.querySelectorAll('.bazaar-card').length }
    })
    if (report.horizontalOverflow || report.outside.length || report.overlapping.length || report.icons < 10 || report.tooltip !== '需要 CLI 工具支持') throw new Error(JSON.stringify(report))
    await page.screenshot({ path: path.join(output, `bazaar-${width}.png`), fullPage: true })
    reports.push(report)
  }
  await page.evaluate(() => window.renderAccountBazaarFixture())
  await page.getByText('GitHub 账号: EXAMPLE', { exact: true }).waitFor()
  await page.waitForFunction(() => [...document.querySelectorAll('.bazaar-card .bazaar-primary')].every(button => !button.disabled))
  const accountReports = []
  for (const [width, height] of [[1440, 900], [320, 760]]) {
    await page.setViewportSize({ width, height })
    const report = await page.evaluate(() => {
      const surface = document.querySelector('.bazaar')
      const controls = [...document.querySelectorAll('button,input,select')]
      const outside = controls.filter(element => { const r = element.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1 }).map(element => element.outerHTML.slice(0, 160))
      const overlapping = []
      for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++) {
        const a = controls[i].getBoundingClientRect(), b = controls[j].getBoundingClientRect()
        if (a.width && b.width && Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) overlapping.push([i, j])
      }
      const cards = [...document.querySelectorAll('.bazaar-card')]
      return { width: innerWidth, horizontalOverflow: surface.scrollWidth > surface.clientWidth + 1, outside, overlapping,
        ownForkHidden: cards.filter(card => card.querySelector('.bazaar-repo').textContent.startsWith('example/')).every(card => !card.querySelector('[aria-label^="Fork"]')),
        foreignForkEnabled: cards.filter(card => card.querySelector('.bazaar-repo').textContent.startsWith('community/')).every(card => card.querySelector('[aria-label^="Fork"]')?.getAttribute('aria-disabled') === 'false'),
        directEnabled: cards.length === 3 && cards.every(card => !card.querySelector('.bazaar-primary').disabled),
        forkButtons: document.querySelectorAll('[aria-label^="Fork"]').length,
        sessionRequests: window.fixtureEndpoints.filter(endpoint => endpoint === 'sessions').length }
    })
    if (report.horizontalOverflow || report.outside.length || report.overlapping.length || !report.ownForkHidden || !report.foreignForkEnabled || !report.directEnabled || report.forkButtons !== 1 || report.sessionRequests) throw new Error(JSON.stringify(report))
    await page.screenshot({ path: path.join(output, `bazaar-account-${width}.png`), fullPage: true })
    accountReports.push(report)
  }
  // Replay the old Host response shape observed on the running desktop, using the production Client.
  await page.evaluate(() => window.renderLegacyBazaarFixture())
  await page.getByRole('alert').filter({ hasText: /install-status/ }).waitFor()
  await page.waitForFunction(() => document.querySelectorAll('[role=alert]').length === 3)
  const legacyReports = []
  for (const [width, height] of [[1440, 900], [320, 760]]) {
    await page.setViewportSize({ width, height })
    const report = await page.evaluate(() => {
      const surface = document.querySelector('.bazaar')
      const buttons = [...document.querySelectorAll('button')].filter(button => button.textContent.trim() === '\u5b89\u88c5')
      return { width: innerWidth, alerts: document.querySelectorAll('[role=alert]').length,
        cards: document.querySelectorAll('.bazaar-card').length,
        horizontalOverflow: surface.scrollWidth > surface.clientWidth + 1,
        installationDisabled: buttons.length > 0 && buttons.every(button => button.disabled),
        mutationCount: window.legacyMutationCount }
    })
    if (report.alerts !== 3 || report.cards !== 3 || report.horizontalOverflow || !report.installationDisabled || report.mutationCount) throw new Error(JSON.stringify(report))
    await page.screenshot({ path: path.join(output, `bazaar-legacy-${width}.png`), fullPage: true })
    legacyReports.push(report)
  }
  if (errors.length) throw new Error(errors.join('\n'))
  await fs.writeFile(path.join(output, 'visual-report.json'), JSON.stringify({ productionArtifact: 'lib/client.js', fixtureOnly: true, reports, accountReports, legacyReports, errors }, null, 2))
  return { fixtureOnly: true, reports, accountReports, legacyReports, errors,
    screenshots: [...reports.map(row => `test-results/bazaar-${row.width}.png`), ...accountReports.map(row => `test-results/bazaar-account-${row.width}.png`), ...legacyReports.map(row => `test-results/bazaar-legacy-${row.width}.png`)] }
}
