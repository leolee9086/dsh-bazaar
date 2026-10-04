const text = {
  title: '集市', search: '搜索', searchLabel: '搜索仓库', searchPlaceholder: '仓库名、描述或话题',
  refresh: '刷新', sort: '排序', stars: 'Star 数量', updated: '最近更新',
  install: '安装', forkInstall: 'Fork 安装', installed: '已安装',
  installSource: '安装来源', sourcePlaceholder: '包名、路径、压缩包或 Git 地址',
  githubAccount: 'GitHub 账号', enterSource: '请输入安装来源',
  submitting: '正在提交安装', statusChecking: '正在确认安装状态', statusUnconfirmed: '安装状态未确认',
  installationBusy: '已有安装任务正在进行', capabilityChecking: '正在读取安装能力', managerUnavailable: '官方包管理器不可用',
  previous: '上一页', next: '下一页', pagination: '分页', loading: '正在读取', empty: '没有匹配的仓库',
  topic: '话题', archived: '已归档', fork: 'Fork', pushed: '最近推送',
  subscriptions: '订阅来源', subscriptionRepos: '订阅仓库',
  partial: 'GitHub 返回了不完整的搜索结果', capped: 'GitHub 搜索最多提供前 1000 条结果',
  catalogError: '仓库读取失败', capabilityError: '安装能力读取失败',
  connectionError: '任务连接中断，安装状态尚未确认', bundleError: '已安装列表读取失败',
  retry: '重试', tasks: '安装任务', taskHistory: '任务历史', latest: '最新任务',
  requested: '请求来源', actual: '实际来源', package: '安装包', requestId: '请求编号',
  taskSession: '会话', diagnostics: '诊断', output: '安装输出', noOutput: '暂无输出',
  logTruncated: '仅保留输出尾部', cancel: '取消任务', cancelling: '正在取消',
  tooLate: '已进入应用阶段，无法取消', pendingBuilds: '待单独授权的构建脚本',
  warnings: '包管理器提示', inspecting: '正在核对安装状态', notInstalled: '包管理器未确认已安装',
  enabled: '已启用', disabled: '未启用', changed: '已变更', unchanged: '未变更',
  managerResult: '包管理器结果', journalError: '任务记录保存失败，重启后可能无法恢复',
  hostProtocolError: '集市接口不兼容；若刚更新插件，请重启 Harness 后重试',
}
const phases = {
  'awaiting-session': '等待会话执行', 'awaiting-approval': '等待审批',
  forking: '正在 Fork', installing: '正在安装', applying: '正在应用', cancelling: '正在取消',
  applied: '已应用', 'restart-required': '已安装，需重启', overridden: '已安装，配置被覆盖',
  'awaiting-build-approval': '构建脚本待授权', failed: '失败', cancelled: '已取消',
  rejected: '审批已拒绝', 'approval-unavailable': '审批不可用', interrupted: '执行中断，结果未确认',
  'unknown-result': '包管理器结果未确认',
}
export const t = key => text[key] ?? key
export const phaseLabel = phase => phases[phase] ?? phase
export const countLabel = total => `共 ${total} 个仓库`
export const pageLabel = page => `第 ${page} 页`
export function ghHint(gh) {
  switch (gh.status) {
    case 'ready': return `Fork 到 ${gh.login}`
    case 'missing': return '需要 CLI 工具支持'
    case 'auth-required': return 'GitHub CLI 尚未登录'
    case 'permission-denied': return 'GitHub CLI 权限不足'
    case 'network-error': return 'GitHub 网络连接失败'
    case 'probing': return '正在检测 GitHub CLI'
    default: return 'GitHub CLI 状态暂不可用'
  }
}
