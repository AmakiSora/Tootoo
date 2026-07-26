# 涂涂 Tootoo 版本说明

本文档按版本倒序整理主要改动。仓库当前没有 git tag，因此版本边界以明确的版本基线提交为准。

## 0.0.3

- **房间制对局流程**（参照同类项目的大厅设计）：`POST /matches` 创建空房间并签发 `hostToken`；选手经 `POST /matches/:id/join` 逐个加入，各自领取独立的席位令牌；人齐后房主凭 `Authorization: Bearer <hostToken>` 调 `POST /matches/:id/start` 开局。`POST /matches` 新增 `participate` 选项，房主可直接占用 1 号席位参战。
- **选手令牌隔离**：`POST /matches/:id/moves` 必须携带 `Authorization: Bearer <token>`，服务端校验令牌归属与回合顺序（令牌比对使用 `timingSafeEqual`）。每个玩家只持有自己的令牌，无法替他人出招。
- 新增错误码：`token_required` / `token_invalid`（401）、`host_token_required` / `host_token_invalid`（401）、`not_your_turn`（403）、`match_not_started` / `match_already_started` / `match_full` / `not_enough_players`（409）。
- 大厅与观战端点保持开放：`GET /matches/:id/lobby` 返回席位占用（不含令牌）；`GET /matches/:id` 未开局时返回大厅视图、开局后返回对局状态；`GET /matches/:id/log` 观战可用，所有响应均不泄漏令牌。
- 前端拆分为两个页面：`/lobby.html`（站点首页 `/`）承担创建/加入双 Tab 大厅、Host 与 Player 令牌展示与一键复制、席位占用实时轮询、人满后房主一键开局；`/index.html` 为对局页，绑定单一身份，非己方回合自动轮询同步对手落子，无令牌时进入观战模式。开局后大厅页自动跳转对局页；对局页「新对局」「再来一局」返回大厅；对局页遇到未开局房间自动跳回大厅；会话存 localStorage，刷新自动恢复身份。

## 0.0.2

- 新增浏览器前端 `public/index.html`（零依赖单文件中文页面）：创建对局、按 ID 加载、轮流落子、计分排名、日志回看全流程可视化，覆盖 0.0.1 全部 HTTP API。
- 棋盘交互：按选中技能悬停预览影响范围，前端镜像服务端合法性校验提前拦截非法落子，落子后播放范围闪烁动画。
- 侧栏面板：技能冷却状态与行/列方向切换、选手得分与冷却实时展示、终局结算弹窗（含并列排名）、点击日志回看棋盘快照。
- 体验细节：健康检查轮询、localStorage 记住 API 地址并自动续局、服务端错误码映射为中文提示、快捷键 `1/2/3` 切技能、`Q` 切方向、`Esc` 退出弹窗/快照。
- 服务端通过 `@hono/node-server/serve-static` 托管 `./public`，`/` 即游戏页面，前后端同源无需跨域配置。

## 0.0.1

- 建立「涂涂 Tootoo」AI 涂色对战引擎：多名 Contestant 在矩形 Board 上轮流使用 `dot` / `cross` / `line` 三种 Skill 涂色，固定回合后按占据 Cell 数量排名；领域词汇统一收录于 `CONTEXT.md`。
- 核心规则为纯函数状态机，与 LLM / HTTP 完全解耦（ADR 0001）：`src/engine/` 提供 `createMatch`、`applyMove`、`getScores`、`getRanking`、`listLegalMoveHints` 等纯库接口，可单测、可替换选手实现。
- 技能与冷却规则落地：`dot` 涂单点无冷却；`cross` 要求中心非空，清空中心并把四邻染成中心方颜色，冷却 1 己方回合；`line` 沿整行/整列把空格染为己方、敌方格清空，冷却 2 己方回合；非法着统一返回 `IllegalReason`（越界、冷却中、缺少 axis、cross 中心为空等）。
- 对局配置支持棋盘宽高（1-32）、2-4 名选手、每人 1-200 回合与先手席位指定；回合按席位轮转，每位选手出满 `turnsPerContestant` 手后对局结束，排名采用同分并列的竞赛排名（1, 2, 2, 4）。
- 着法日志 `MatchLog` 逐步记录选手、着法、棋盘快照、冷却与得分，供回放与排查使用。
- 新增 Hono HTTP 适配层（ADR 0002）：`GET /health`、`POST /matches`（zod 校验配置）、`GET /matches/:id`（状态与分数，终局附 ranking）、`GET /matches/:id/log`、`POST /matches/:id/moves`；对局存于进程内 Map，开发服务器默认 `http://localhost:3000`。
- 新增 PlayerAgent 抽象与 `runMatch` 跑局器：LLM、随机 bot、HTTP 提交都是出招适配器；非法着不代下、不跳过、不判负，由 runner 将拒绝原因反馈给出招者无限重试至合法（ADR 0003），可通过 `maxIllegalRetries` 限制每回合重试次数。
- 附带 `randomLegalAgent`（随机合法着）与 `fixedMoveAgent`（脚本化着法）两个内置适配器，用于测试与本地跑局。
- 移除服务端自动跑局端点 `POST /matches/:id/run`：跑局逻辑收敛回引擎库层，HTTP 只保留手动提交着法路径，避免服务端被长跑对局阻塞。
- 工程基础：TypeScript + ESM、tsx 开发启动、Vitest 测试（引擎与 HTTP 双套）、`npm run typecheck` 双 tsconfig 校验。
