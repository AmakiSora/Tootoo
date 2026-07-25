# 涂涂 Tootoo

**涂涂** / **Tootoo** — AI 涂色对战引擎：Contestant 在 Board 上轮流使用 `dot` / `cross` / `line`，固定回合后按色格数排名。领域词汇见 [CONTEXT.md](./CONTEXT.md)。仓库目录和 npm 包名均为 `tootoo`。

## 要求

- Node.js 20+
- npm

## 安装与测试

```bash
npm install
```

```bash
npm test
```

## 开发服务器（Hono）

```bash
npm run dev
```

默认 `http://localhost:3000`。

### API

| Method | Path | 说明 |
|--------|------|------|
| GET | `/health` | 健康检查 |
| POST | `/matches` | 创建对局 JSON：`width`, `height`, `contestantCount`, `turnsPerContestant`, `firstContestant`（均可选） |
| GET | `/matches/:id` | 状态与分数 |
| GET | `/matches/:id/log` | 步骤日志 |
| POST | `/matches/:id/moves` | 提交着法 `{ skill, x, y, axis? }` |

### 示例

```bash
curl -s -X POST http://localhost:3000/matches -H "content-type: application/json" -d "{\"width\":4,\"height\":4,\"turnsPerContestant\":5}"

curl -s -X POST http://localhost:3000/matches/<id>/moves -H "content-type: application/json" -d "{\"skill\":\"dot\",\"x\":1,\"y\":1}"
```

## 引擎库

```ts
import { createMatch, applyMove, runMatch, randomLegalAgent } from "./src/engine/index.js";
```

规则与 HTTP 分离。
