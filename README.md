# dsh-bazaar（集市）

DeepSeek Harness 的独立插件集市。侧栏的「集市」打开主区视图，替换对话与右侧栏。默认发现来源是 GitHub 的 [`dsh-plugin`](https://github.com/topics/dsh-plugin) 话题；话题是发现约定，不是收录资格、审核结果或安全保证。

集市不按作者、Star 数、许可证、归档状态或 Fork 身份排除仓库，不要求申请收录。搜索与排序由当前操作决定。没有话题的插件仍可通过完整安装来源安装，集市不为第三方代码背书。

## Agent 发现插件

`bazaar_search` 是只读搜索工具，接受可选的 `query`、`sort=stars|updated`、`page=1..10` 和 `refresh`，与主区界面调用同一个目录实例，共享 topic、订阅来源、五分钟缓存、排序、分页及来源错误。工具返回 `nextPage`、`incomplete`、`capped` 等覆盖范围；订阅仓库仍是独立链接，不混入 topic 的排序结果。查询不需要浏览器 Cookie，不提供 Fork 或安装动作。

`bazaar_installed` 只读官方插件管理器的 bundle 列表，返回实际包名及安装状态。需要新能力、查找或推荐插件时，Agent 的提示段会指引它先发现并调用集市工具；会话屏蔽搜索工具时不显示这段指引。目录命中不证明仓库包含可安装的 `dsh.bundle`，推荐前仍需核对包声明和实现。

发现工具与提示段随插件卸载清理。发现、查询和推荐都不授权安装；Agent 发起变更时调用 `bazaar_install({spec,mode})`，`mode` 默认为 `direct`，也可为 `fork`。每次调用都必须经过官方审批，不能认领或重放界面的安装任务，也不能通过浏览器、界面路由或命令行绕过审批。查询参数不能携带 Fork 或安装动作。

## 安装与审批

通过 Harness 的官方插件管理入口安装 `link:<本项目绝对路径>`，或选定的 `github:leolee9086/dsh-bazaar#<ref>`；使用同一入口启用 bundle，需要时重启。仓库包含客户端构建产物，宿主入口是直接执行的 ESM JavaScript。

人类在已认证的界面主动点击安装，就是对所提交操作的明确授权：集市直接调用官方 `ctx.pluginManager`，不选择会话、不运行模型、不再请求工具审批。界面安装不依赖会话、工具或审批服务。

只有 AI 发起的安装或 Fork 需要正式 `ctx.approval` 审批。审批绑定真实工具调用与 Agent 会话，只有本次 `allowed-once` 可以执行；拒绝、取消或审批不可用都不执行 Fork 或包变更。工具参数不能声明自己是人类或伪造已批准状态。两种入口共享任务、日志和取消，但不共享授权。安装会影响当前 profile 的所有会话，安装的 Host 代码在工作区沙箱之外运行。

直接安装保留输入的完整 spec，包括版本、Git ref、本地路径或压缩包地址。Fork 安装解析请求的上游提交，创建或复用当前 GitHub 账号的 Fork，核对来源与实际仓库身份，再安装 `github:<实际 Fork>#<完整 SHA>`。当前 GitHub 账号自己拥有的仓库不显示 Fork 安装按钮，账号与 owner 忽略大小写比较；宿主也拒绝对自身仓库发起 Fork，直接安装仍可用。这不会过滤仓库列表。Fork 需要 GitHub CLI：缺失时按钮保持可聚焦并显示「需要 CLI 工具支持」；登录、网络和权限错误分别呈现，不冒充 CLI 缺失。

包下载、锁文件恢复和 bundle 应用委托给官方 `ctx.pluginManager`。集市不追加构建脚本许可；`pendingBuilds` 保留在结果中，必须另行明确授权。已应用、需重启、配置覆盖、失败和取消分别显示。应用阶段不能取消；安装中的取消要等官方包管理器停止并完成恢复才确认。

## pnpm 版本切换

集市里的「安装使用的 pnpm」读取当前 profile 的版本声明，可以保存完整版本号或恢复启动器默认版本。推荐值 `11.28.2` 已在 Windows 桌面启动器与官方插件管理器中实测；保存不立即下载或运行 pnpm，后续官方包操作按声明选择版本，必要时下载该版本的可执行包。界面显示的是配置声明，实际执行版本以安装日志为准。

Agent 使用 `bazaar_pnpm({action:"get"})` 只读查询；修改使用 `bazaar_pnpm({action:"set",version:"11.28.2"})`，恢复默认传 `version:null`。每次修改都经过正式审批，审批说明后续下载与 profile 内所有会话的影响；它不包含插件安装或构建脚本授权。已认证界面的主动保存直接执行人类命令，与安装共用任务、日志和忙状态。

选择写入 profile 的 `package.json` 中 `devEngines.packageManager={name:"pnpm",version,onFail:"download"}`，并同步已有的 `pnpm@...` 旧式 `packageManager` 声明；恢复默认移除这两项。其他依赖、组合与运行时声明不变，`pnpm-workspace.yaml` 和构建许可不变。写入使用官方包管理器相同的 `package.json.lock`，占锁时报告忙，不抢锁；落盘前检测配置文本是否被外部编辑，发现变化则拒绝本次写入。

本地 `link:` 依赖会在版本区域列出。pnpm 版本切换本身不能修复 Windows 跨盘链接替换：`11.28.2` 在 `hoisted` 布局下仍可触发 EPERM。本功能不会自动临时切换布局或重命名 Junction；此类迁移需另行处理。配置成功、安装成功与 Host 加载成功是独立的结果。

## 浏览与恢复

Star 与最近更新排序交给 GitHub，不能拿一页 Star 命中伪装成全局更新时间排序。每页 100 条，最多访问 GitHub 搜索提供的前 1000 条；不完整和截断标记在界面显示。查询、排序、页码与订阅来源参与缓存，缓存五分钟，刷新会重新请求。GitHub CLI 查询失败后尝试原生 HTTPS；原生请求不会自动采用 CLI 的代理配置。

任务按请求编号保存在 profile 的 `.dsh-bazaar/tasks.json`，保留最近 100 项及每项最多 128 KiB 的日志文本尾部。界面卸载不丢任务，终态与包管理器诊断持续可读。重启后的未完成任务标记为中断、结果未确认，不重放动作或保存过的审批。安装状态由官方 bundle 列表与结果中的实际包名核对，不猜仓库名。记录写入失败单独报告，不能把真实安装成功改报成失败。

安装应用时可能通过 bundle 配置卸载集市自身。此时包管理器继续持有已不能取消的应用操作，集市清理不阻塞它的重载，最终结果仍尝试落盘；不能依靠已卸载的页面继续显示进度。卸载发生在审批、Fork 或安装阶段则取消并等待操作结束。

## 订阅清单

订阅地址保存在 profile 的 `.dsh-bazaar/subscriptions.json`，内容是 URL 字符串数组。清单为纯文本，一行一个 GitHub 仓库，空行和 `#` 开头的注释忽略，例如：

```text
owner/repo
https://github.com/owner/another
github:owner/third
```

当前订阅读取器只提取 GitHub 仓库身份，不能作为保留 Git ref、npm 版本或其他 spec 的安装清单；无法解析的行会被忽略。订阅仓库作为链接单独展示，不混进 topic 结果制造排序或收录假象。读取错误保留来源地址与诊断。

## 接口

路由挂在 Harness 自身 Web 服务，均要求正式浏览器认证；POST 还校验同源、JSON 对象和大小。

| 路由 | 方法 | 请求与结果 |
|---|---|---|
| `/dsh-bazaar/list` | GET | `q`、`sort=stars\|updated`、`page=1..10`、`refresh=1`；返回仓库、分页标记及订阅诊断 |
| `/dsh-bazaar/capabilities` | GET | CLI 状态、官方管理器是否可用、`approval=agent-only` 与单独构建脚本授权标记 |
| `/dsh-bazaar/sessions` | GET | 兼容旧客户端的只读会话列表；当前界面不查询它 |
| `/dsh-bazaar/installed` | GET | 官方 bundle 列表 |
| `/dsh-bazaar/pnpm` | GET | 当前 pnpm 版本声明、推荐版本和本地 link 依赖；只读 |
| `/dsh-bazaar/pnpm` | POST | `{version:"11.28.2"}` 或 `{version:null}`；提交人类版本选择，200 返回 `{requestId,install}`，终态与配置结果保存在任务中 |
| `/dsh-bazaar/install` | POST | `{spec}`；提交人类的安装命令，202 返回 `{requestId,install}`，后台继续官方管理器操作 |
| `/dsh-bazaar/fork-install` | POST | 同上，spec 必须为 `github:owner/repo#ref`，ref 可省略 |
| `/dsh-bazaar/install-status` | GET | `requestId` 查指定任务，省略则查最新；同时返回全局忙状态和历史摘要 |
| `/dsh-bazaar/cancel-install` | POST | `{requestId}`；返回 `cancelled`、`too-late` 或 `not-running` |

## 开发与验证

```sh
pnpm install
pnpm run build
pnpm run check
pnpm test
# 人类无会话安装及真实审批、Agent、工具、包管理器和 HMR 的 Loader 组合测试：
DSH_TEST_ROOT=/path/to/built/deepseek-harness pnpm run test:integration
```

PowerShell 中用 `$env:DSH_TEST_ROOT='D:/path/to/built/deepseek-harness'` 设置集成测试根目录。该套测试只消费官方构建产物的公开导出，使用真实 Loader、工具、审批、包管理器与临时配置，不调用模型 API。默认安装用自行创建的本地插件；提供 `DSH_TEST_NODE` 与 `DSH_TEST_PNPM_ENTRY`（桌面 Node 与 pnpm 入口）后，还会通过真实启动器验证版本选择和 GitHub tag 安装。只验证版本切换可运行 `node --test --test-name-pattern=pnpm tests/installer.test.js`；未提供启动器路径时外部安装项会明确跳过。运行时代码不导入 Harness 实现。已有组件测试使用 HTTP 响应样本，不替代真实宿主验证。

客户端通过 tsdown 打包，React 与 JSX runtime 由宿主模块表提供；Lucide 按需打包，许可见 [第三方声明](THIRD_PARTY_NOTICES.md)。宿主修改需要重启加载；仅构建客户端并不保证正在运行的 GUI 会自动更新。

`pnpm run test:visual` 使用 Playwright 在隔离的临时浏览器中加载实际客户端构建产物，检查 1440、768、390、320 像素宽度的布局、图标和 CLI 缺失提示，并在桌面与手机尺寸验证自身仓库隐藏 Fork、其他仓库按钮可用及旧 Host 不兼容提示，并将截图与报告写入 [渲染结果目录](test-results/)。它使用 HTTP 响应样本，不验证宿主认证、模型或审批链。先运行 `pnpm run build` 更新产物。Windows 默认使用已安装的 Edge；可设置 `PLAYWRIGHT_CHANNEL=chrome` 选择 Chrome。在其他平台默认使用 Playwright Chromium，需先执行 `pnpm exec playwright install chromium` 准备浏览器。

## 已知限制

当前界面仅有中文词典；订阅编辑、完整 spec 清单、统一已安装管理视图及显示偏好的持久化另有实施计划。Host 与 Client 需要使用相同的接口版本；更新 Host 后须重启 Harness，新 Client 遇到旧 Host 会明确提示不兼容，不误启用安装按钮。临时组合及视觉测试不等同于当前桌面 GUI 的认证或真实外部 Fork 安装验收。
