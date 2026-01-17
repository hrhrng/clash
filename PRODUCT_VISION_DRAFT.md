# Product Vision Draft

Use this file to brainstorm and draft the product vision.

## Vision Notes

- **Core Philosophy**: AI should empower humans to produce higher quality content (Creative Democratization), rather than generating mass-produced, low-quality content ("slop") for passive consumption.
- **Human-Agent Relationship**: The relationship is defined as **Co-creators**. The Agent acts as a partner in the creative process, working alongside the Human.

## Evolution & Strategy

- **Historical Context**: Previous generation tools (TikTok, CapCut) lowered creation barriers but introduced "AI Slop" through repetitive templates.
- **Next-Gen Goal**: Further lower the barrier for creating **High-Quality** content, breaking free from template limitations.
- **Key Directions**:
    1.  **Idea Co-creation**: Focus on discussing and refining **Ideas** with AI before production, ensuring quality starts at the concept stage.
    2.  **AI Production & Editing**: AI handles content generation and editing tasks based on the refined idea.
    3.  **Comprehensive Realization**: Utilizing various means including assisted editing, AIGC content generation, and **Motion Graphics** to fully realize creative visions.

## Technical Philosophy & Architecture

- **Minimalist Architecture**: A future-proof, evolvable architecture where the **Canvas** serves as the shared context (Environment) for both Human and Agent.
- **Agent Interaction**: The Agent's interaction with the environment is reduced to simple **Read** and **Write** operations on the Canvas state.
- **Skill-Based System**:
    - **SOP as Skills**: Industrial best practices (e.g., AI Short Drama workflows, Director SOPs) are encapsulated as reusable **Skills**.
    - **Dynamic Loading**: Skills can be manually loaded by users or dynamically activated by Agents based on intent.
    - **Sub-agents**: Specialized tasks are handled by dedicated Sub-agents.
        - *Example*: **Motion Graph** is handled by a **Coding Agent** that writes HTML/CSS to render dynamic visuals.
- **Lightweight Core**: The Agent skeleton remains lightweight, deriving its power from the extensible Skills system.


