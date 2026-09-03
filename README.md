# dsh-ollama-cloud-usage

在 DSH 侧边栏底部常驻显示 **Ollama Cloud 配额进度圈**（默认展示 5 小时窗口），
点击弹出详情页查看 **5 小时 + 7 天** 两个窗口的已用比例，并在弹窗里填写 API Key。

```
侧边栏底部（设置按钮旁）:
  [◔] Ollama
   └─ 点击 →
      Ollama Cloud 配额
      5 小时窗口   98% 已用
      7 天窗口     98.3% 已用
      ─────────────
      API Key  [ollama-…]  [保存]
```

## 原理（纯插件，零核心改动）

- **数据通道**：宿主插件用 `webServer.register` 挂一个 `GET /api/ollama-usage` 路由，
  客户端点击时 `fetch` 它拿实时配额。DSH 的 `webServer` 服务本来就是给插件用的，
  不需要改任何核心包。
- **配额来源**：`GET https://ollama.com/api/usage`（Bearer API Key），与
  [ollama.com/settings](https://ollama.com/settings) 面板同源。
- **API Key**：在弹窗里填写 → 客户端 `api.credentials.set` 存进宿主凭据 →
  宿主 `credentials.resolve` 读取。Key 只单向写入，符合 DSH 安全模型。
- **刷新**：点击时实时 fetch；进度圈日常展示上一次结果。

## 目录结构

```
src/usage.ts    宿主端：配额抓取 + 解析（无依赖，可独立测试）
src/host.ts     宿主插件：注册 /api/ollama-usage 路由
src/index.ts    宿主入口（re-export host.ts）
src/client.tsx  客户端插件：侧边栏进度圈 + 弹窗 + key 输入
build.mjs       构建脚本（esbuild）
lib/index.js    构建产物：宿主插件
lib/client.js   构建产物：客户端插件
```

## 构建

```bash
npm install --legacy-peer-deps
npm run bundle
# 产出 lib/index.js（宿主）和 lib/client.js（客户端）
```

> 宿主端 `lib/index.js` 是普通 ESM（导出 `apply`）；客户端 `lib/client.js` 是
> `window.__ModuleLoader__.load({...})` 打包格式，由 esbuild 生成。

## 安装（本机 + 其他电脑通用）

```bash
# 方式一：从 GitHub 安装
dsh plugin --profile web add github:<你的用户名>/dsh-ollama-cloud-usage

# 方式二：从本地目录安装
dsh plugin --profile web add /path/to/dsh-ollama-cloud-usage
```

装完刷新 `http://127.0.0.1:3080`，侧边栏底部（设置按钮旁）会出现 Ollama 进度圈。

## 使用

1. 点击进度圈 → 弹出详情页
2. 在 API Key 输入框粘贴你的 Ollama Cloud Key（在 [ollama.com/settings/keys](https://ollama.com/settings/keys) 申请）
3. 点「保存」→ 立即抓取并显示 5h / 7d 配额
4. 之后每次点击都会实时刷新

## 多机部署方案

1. 把本仓库推到 GitHub（见下）
2. 每台电脑执行 `dsh plugin --profile web add github:<用户名>/dsh-ollama-cloud-usage`
3. 每台电脑各自在弹窗里填自己的 API Key（Key 存在本机凭据，不随仓库走）

## 上传到 GitHub

```bash
cd dsh-ollama-cloud-usage
git init
git add .
git commit -m "feat: Ollama Cloud quota ring plugin"
git branch -M main
git remote add origin https://github.com/<你的用户名>/dsh-ollama-cloud-usage.git
git push -u origin main
```

> 注意：`lib/` 是构建产物，建议一并提交（这样别人 `dsh plugin add` 时无需本地构建）；
> 也可以只提交 `src/` 并让使用者自行 `npm run bundle`。

## 说明

- 进度圈颜色：<90% 业务色，≥90% 红色（提示即将耗尽）
- 未配置 Key 时，进度圈显示灰色，点击弹窗提示填写
- 配额接口 `ollama.com/api/usage` 是 Ollama 的非官方端点，可能随 Ollama 调整而失效
