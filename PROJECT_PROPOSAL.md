# Master Clash: AI 导演与无限画布 —— 视听叙事的新一代生产力工具

## 1. 场景及痛点分析 (Scene & Pain Point Analysis)

### 核心场景
面向专业影视创作者、广告导演及短视频内容团队的 **AI 辅助视听创作（AI-Assisted Visual Storytelling）**。具体聚焦于从“文字剧本”到“分镜故事板（Storyboard）”及“动态预演（Pre-viz）”的转化环节。

### 核心痛点
1.  **语义鸿沟与“翻译”成本**：
    *   创作者擅长的是自然语言叙事（如“悲伤的雨夜”），而 AI 模型需要的是复杂的工程化提示词（如 `cinematic lighting, blue tone, 8k, detailed...`）。
    *   将剧本“翻译”为 Prompt 的过程极度依赖人工试错，耗时耗力，打断创作心流。
2.  **碎片化生成与效率低下**：
    *   现有的 AI 工具多为“单点抽卡”模式（一次生成一张图）。
    *   无法快速生成连贯的场景序列（Sequence），难以从整体上把控叙事节奏和蒙太奇效果。
3.  **一致性难以维持**：
    *   在连续的镜头生成中，保持角色形象（Character Consistency）、场景空间关系及光影风格的统一是极大的挑战。

---

## 2. 解决方案设计 (Solution Design)

### 核心创新：Director Agent + Canvas as Context
我们提出了一种全新的**人机协作范式**：将 AI 从单纯的“画师”升级为懂视听语言的“导演”，将画布从单纯的“展示区”升级为“人机对齐的共享上下文”。

### 技术实现方案
1.  **Director Agent (导演智能体)**：
    *   **大脑**：基于 `Gemini 2.5 Flash` 的多模态推理核心。
    *   **能力**：
        *   **剧本解析**：理解剧本中的潜台词、情绪和视觉隐喻。
        *   **自动规划**：将模糊需求拆解为结构化的图操作（创建分组 -> 编写剧本 -> 生成分镜）。
        *   **视听转译**：自动将自然语言转化为包含镜头语言（景别、运镜）的专业 Prompt。

2.  **无限画布 (Infinite Canvas)**：
    *   **技术栈**：`Next.js` + `ReactFlow`。
    *   **上下文管理**：画布上的节点（Node）即为 Agent 的“短期记忆”。Agent 在生成新镜头时，会检索画布上已有的上游节点（Upstream Nodes），从而实现风格和内容的一致性。
    *   **语义化分组**：引入 `Group Node` 概念，对应剧本中的“场次”，实现场景级的素材管理。

3.  **流式交互协议 (Streaming Interaction)**：
    *   **SSE (Server-Sent Events)**：后端不仅流式传输文本，还传输结构化的 `node_proposal`（节点提议）事件。
    *   **人机对齐**：Agent 提出建议（“我建议创建这三个镜头...”），用户拥有最终决策权（Accept/Reject），确保 AI 的创作符合人类意图。

---

## 3. 运行 Demo (Demo Operation)

### 运行说明
*   **环境要求**：Node.js 18+, Python 3.10+
*   **启动方式**：
    1.  后端：`cd backend && uv run uvicorn master_clash.api.main:app --reload`
    2.  前端：`cd frontend && npm run dev`
    3.  访问：`http://localhost:3000`

### 核心演示流程
1.  **自然语言输入**：在 Copilot 中输入：“设计一场赛博朋克风格的街道戏，主角是一个孤独的黑客。”
2.  **Agent 规划**：侧边栏实时显示 Director Agent 的思考过程（Thinking Process）。
3.  **节点提议**：系统自动在画布上规划出：
    *   一个 `Group Node`（场景组）。
    *   一个 `Text Node`（包含生成的剧本描述）。
    *   多个 `Image Generation Node`（关键帧）。
4.  **一键执行**：用户点击“Accept All”，系统并发调用 AI 模型，实时生成并填充画面。

---

## 4. 预期收益及可行性预估 (Expected Benefits & Feasibility)

### 预期收益
1.  **效率提升 10x**：从“写一句提示词 -> 生成一张图”变为“输入一段戏 -> 生成一套分镜”。
2.  **门槛降低**：导演无需学习 Prompt Engineering，只需专注于故事本身。
3.  **一致性保障**：通过 Graph 结构传递上下文，大幅减少角色崩坏和场景跳跃的问题。

### 可行性分析
*   **技术可行性**：
    *   **模型能力**：Gemini 2.5 Flash 具备足够的上下文窗口和多模态理解能力来处理剧本解析。
    *   **生成质量**：现有的生图（Imagen/Midjourney）和生视频（Kling/Runway）API 已达到商用级别。
    *   **架构验证**：目前的 Demo 已跑通了“Agent 规划 -> 前端渲染 -> 异步生成”的全链路。
*   **资源需求**：主要依赖云端大模型 API，本地计算资源需求低，易于规模化部署。

---

## 5. 创新性 (Innovation)

1.  **从“生成”到“规划”**：
    *   传统工具是“你让它画什么它画什么”（执行层）。
    *   Master Clash 是“你告诉它想拍什么，它告诉你该怎么画”（规划层）。

2.  **Canvas as Context (画布即上下文)**：
    *   利用节点图（Node Graph）作为显式的上下文载体，解决了 LLM 隐式上下文难以控制和可视化的难题。

3.  **白盒化的人机协作**：
    *   通过 `Node Proposal` 机制，将 AI 的黑盒思考过程具象化为画布上的操作建议，让创作者在享受自动化的同时不失控。
