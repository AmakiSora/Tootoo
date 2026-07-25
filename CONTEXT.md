# 涂涂（Tootoo）

产品名 **涂涂** / **Tootoo**。本仓库目录与 npm 包名均为 `tootoo`。

AI 涂色对战：多名 Contestant 在 Board 上轮流使用 Skill 改变 Cell 颜色，固定回合后按 Score 排名。

## Language

**Match（对局）**:
一场有固定配置与完整步骤历史的涂色对战。
_Avoid_: Game, Session（除非指 HTTP 会话）

**Contestant（选手）**:
对局中的一名参赛方，拥有唯一颜色编号与技能冷却。
_Avoid_: Player（易与人类操作者混淆）, Side

**Board（棋盘）**:
矩形网格，由 Cell 组成；坐标原点在左上，x 向右，y 向下。
_Avoid_: Map, Grid（可作实现别名，领域叙述用 Board）

**Cell（格子）**:
棋盘上的最小单位，状态为空或属于某一 Contestant 的颜色。
_Avoid_: Tile, Square（非本项目主词）

**Skill（技能）**:
着法可选的效果类型：`dot`（单点）、`cross`（十字）、`line`（行列）。
_Avoid_: Card, Spell, Ability

**Move（着法）**:
一次行动：选择 Skill、锚点坐标，以及 `line` 所需的 axis。
_Avoid_: Action, Play, Turn（Turn 指轮到谁，不是单次着法内容）

**Cooldown（冷却）**:
某 Skill 对某 Contestant 在若干「己方回合」内不可再用的剩余值。
_Avoid_: Delay, Timer（除非实现细节）

**Score（色格分）**:
某 Contestant 当前占据的 Cell 数量。
_Avoid_: Territory（易暗示连通/区域块而非格数）, Points（过泛）

**Spectator（观战方）**:
配置或观看 Match、不作为 Contestant 出招的人类角色。
_Avoid_: User, Admin（过泛）

**PlayerAgent（出招者）**:
根据局面提出 Move 的抽象接口；LLM 与规则 bot 都是其适配器。
_Avoid_: Bot（特指非 LLM 实现时可用）, Model（指权重而非出招端口）

**MatchLog（对局日志）**:
按时间顺序记录的每一步着法及其应用后的关键状态。
_Avoid_: History, Replay（Replay 是消费日志的方式）
