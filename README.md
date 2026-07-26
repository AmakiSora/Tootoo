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

对局采用**房间制**：先创建房间拿到 Host 令牌，选手逐个加入领取各自的选手令牌，人齐后房主开局。每个前端页面只持有一个选手令牌，只能操作自己的席位。

| Method | Path | 说明 | 需要 Token |
|--------|------|------|-----------|
| GET | `/health` | 健康检查 | 否 |
| POST | `/matches` | 创建房间 JSON：`width`, `height`, `contestantCount`, `turnsPerContestant`, `firstContestant`, `participate`, `name`（均可选；`participate:true` 时房主占首座并获选手令牌，`name` 为房主昵称）。响应含 `id`、`hostToken`、`player`、`lobby` | 否 |
| GET | `/matches/:id/lobby` | 大厅状态（席位占用与昵称，不含任何令牌） | 否 |
| POST | `/matches/:id/join` | 加入房间，可传 JSON `{"name":"昵称"}`（可空 body），领取 `{ contestant, token, name }`；满员 409 `match_full`，已开局 409 `match_already_started` | 否 |
| POST | `/matches/:id/start` | 人满后开局 | **Host 令牌** |
| GET | `/matches/:id` | 状态与分数（观战可用；未开局时返回大厅视图；含 `names` 昵称表，未填者回退为「选手 N」） | 否 |
| GET | `/matches/:id/log` | 步骤日志（观战可用；未开局 409 `match_not_started`） | 否 |
| POST | `/matches/:id/moves` | 提交着法 `{ skill, x, y, axis? }` | **选手令牌** |

出招与开局须携带对应令牌：

```
Authorization: Bearer <token>
```

错误码：`token_required` / `token_invalid`（401 选手令牌缺失或无效）、`host_token_required` / `host_token_invalid`（401 房主令牌缺失或无效）、`not_your_turn`（403 非当前选手回合）、`match_not_started` / `match_already_started` / `match_full` / `not_enough_players`（409 房间状态冲突）。

### 示例

```bash
# 创建房间（房主参战，占用 1 号席位，昵称为 Alice）
curl -s -X POST http://localhost:3000/matches -H "content-type: application/json" -d "{\"width\":4,\"height\":4,\"turnsPerContestant\":5,\"participate\":true,\"name\":\"Alice\"}"
# → {"id":"...","hostToken":"...","player":{"contestant":0,"token":"...","name":"Alice"},"lobby":{...}}

# 另一位玩家加入（把房间 ID 发给他；name 可选）
curl -s -X POST http://localhost:3000/matches/<id>/join -H "content-type: application/json" -d "{\"name\":\"Bob\"}"
# → {"player":{"contestant":1,"token":"...","name":"Bob"}, ...}

# 房主开局
curl -s -X POST http://localhost:3000/matches/<id>/start -H "authorization: Bearer <hostToken>"

# 各自回合内出招
curl -s -X POST http://localhost:3000/matches/<id>/moves -H "content-type: application/json" -H "authorization: Bearer <playerToken>" -d "{\"skill\":\"dot\",\"x\":1,\"y\":1}"
```

## 引擎库

```ts
import { createMatch, applyMove, runMatch, randomLegalAgent } from "./src/engine/index.js";
```

规则与 HTTP 分离。
