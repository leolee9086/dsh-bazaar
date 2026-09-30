# dsh-bazaar（集市）

按**官方唯一的收录规则**浏览并安装 DeepSeek Harness 插件的集市：谁给仓库打了
[`dsh-plugin`](https://github.com/topics/dsh-plugin) 话题，谁就出现在列表里。

## 这东西的定位

**我们没有任何裁量权。** 集市不收录、不审核、不评分、不承诺安全：

- 列表来自 GitHub 的 `topic:dsh-plugin` 查询 —— 那是官方在 `deepseek-harness`
  README「社区与支持」里提的唯一一条要求，判断标准是客观的、不需要人值守；
- 唯一的加工是**排序**（按 star / 按最近更新）；
- 额外的来源靠**订阅**：谁想组织一份清单谁自己维护、自己托管，我们只负责去读。
  所以我们不为任何清单背书，也就没有「申请收录」这个入口。

想做一份自己的清单？写一个纯文本文件，一行一个仓库地址，托管到任何地方即可：

```text
# 我的 DSH 插件清单
owner/repo
https://github.com/owner/another/tree/main
github:owner/third
```

三种写法都认；空行忽略，`#` 开头是注释；`/tree/...`、`/blob/...` 这类尾部路径会被丢掉。
任何脚本 `curl` 一下就能生成一份，GitHub raw、gist、自己的服务器都能托管。

## 安装

```sh
# 本地开发（改代码不用重装）
pnpm add link:<这个目录的绝对路径>
# 或用发布产物
pnpm add 'github:leolee9086/dsh-bazaar#<tag>'
```

装完把 `dsh-bazaar` 加进 profile 的 `dsh.profile.bundles`，重启 DSH。
侧栏顶部会出现「集市」一格，点开是主区面板（跟官方「插件」那一格一样，替换对话与右侧边栏）。

## 接口

两条同源路由，都在宿主自己的 web server 上：

| 路由 | 方法 | 作用 |
|---|---|---|
| `/dsh-bazaar/list` | GET | `?q=` 关键词、`?sort=stars\|updated`、`?page=`。返回官方 topic 的命中结果，外加各订阅清单的地址列表 |
| `/dsh-bazaar/capabilities` | GET | `{gh, login}`：本机有没有可用的 gh。界面据它把 fork 按钮标成「需要 gh」 |
| `/dsh-bazaar/install` | POST | `{repo}`。同源校验后把 `github:<owner>/<repo>` 交给宿主包管理器，**立即返回 202 + requestId** |
| `/dsh-bazaar/fork-install` | POST | `{repo}`。先 fork 到自己账号并锁住那个提交，再装 `github:<login>/<repo>#<sha>`，同样立即返回 |
| `/dsh-bazaar/install-status` | GET | 当前那次安装的阶段与 pnpm 输出（尾部 120 行）。界面每 500ms 轮询一次 |

安装**不在请求里等待**：它可能跑上一分钟，而界面要一边装一边显示细节。所以安装请求立即
返回 `requestId`，活儿在后台跑，界面轮询 `install-status`。细节有两条来源——宿主包管理器
通过 `plugin-manager/install-log` 事件转出来的每一行 pnpm 输出（我们只是接住），以及
`plugin-manager/install-state` 的阶段变化；返回值里的那段输出是兜底，
免得事件在某个宿主上没接上时界面一片空白。

`/dsh-bazaar/list` 对同一查询缓存 5 分钟：GitHub 未认证的搜索额度是每分钟十次。

## 边界

- **不实现包管理**：安装一律走 `ctx.pluginManager`，pnpm、锁文件快照、失败回滚、激活
  都是那个服务的职责。集市不拼命令行、不碰 `node_modules`。
- **不做安全判断**：列表里的东西是第三方代码，这一页只告诉你它存在。
- **不改别人的配置**：`cordis.patch.yml` 只 insert 自己一行。
- 订阅清单存在 profile 的 `.dsh-bazaar/subscriptions.json`（0600）。

## 结构

```
src/host.js           宿主侧：拉 topic、读订阅、把安装交给包管理器（纯 JS，不经过构建）
src/client/index.jsx  浏览器侧：侧栏一格 + 主区面板（tsdown 打成 lib/client.js）
tsdown.config.mjs     只打包浏览器侧；react 与 react/jsx-runtime 由宿主模块表提供
```

```sh
pnpm install    # 只装 tsdown 与 react-dom
pnpm run build  # 出 lib/client.js
pnpm run check  # node --check src/host.js
```
