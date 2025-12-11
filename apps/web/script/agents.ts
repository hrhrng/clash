import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

// Load environment variables from .env file
try {
    process.loadEnvFile();
} catch (e) {
    console.warn("No .env file found or failed to load it.");
}

let GLOBAL_DESIGNS: any = null;

// --- Configuration & Prompts ---

// Defined at the top for easy debugging and modification
const GLOBAL_ART_STYLE = "hyper-realistic cinematic";

const PROMPTS = {
    SCRIPT_GENERATOR: `
You are a professional scriptwriter. Your task is to convert the user's input (which can be a simple idea, a story summary, or raw text) into a structured animation script.

The output must be a JSON object containing a list of shots. Each shot must have the following fields:
- scene_id: The scene number.
- scene_atmosphere: The setting and time/mood.
- shot_id: The unique identifier for the shot (e.g., 1-1, 1-2).
- shot_type: Usually 'Animation' for this task.
- camera_movement: How the camera moves (Static, Pan, Zoom, etc.).
- shot_size: The scale of the shot (Close-up, Wide, etc.).
- content: A detailed description of what is happening visually.
- dialogue: Character speech or voiceover. Use '/' if there is no dialogue.
- sound_effects: Ambient sounds or specific SFX.

Reference style:
- Detailed visual descriptions.
- Clear separation of visual and audio elements.
- Logical flow of shots.
`,
    DESIGN_AGENT: `
You are a concept artist and art director. Your task is to analyze a script and generate detailed visual designs for characters, settings, and key items.
Maintain a **global art style** throughout: ${GLOBAL_ART_STYLE}.
For each character, setting, and item found in the script:
1. Create a detailed visual description.
2. Call the 'generate_image' tool to create a concept image for it.
`,
    STORYBOARD_AGENT: `
You are a storyboard artist. Your task is to visualize each shot in the script.
Use the **global art style** (${GLOBAL_ART_STYLE}) and the character/setting designs generated earlier to ensure consistency.
For each shot in the script:
1. Construct a comprehensive visual prompt that includes the setting, characters (with their specific designs), lighting, camera angle, and action.
2. Call the 'generate_storyboard_frame' tool to generate the image.
`
};

// --- Types & Schemas ---

const ShotSchema = z.object({
    scene_id: z.string().describe("Scene number, e.g., '1'"),
    scene_atmosphere: z.string().describe("Scene location and atmosphere, e.g., 'Old man's room - Morning'"),
    shot_id: z.string().describe("Shot number, e.g., '1-1'"),
    shot_type: z.string().describe("Type of shot, e.g., 'Animation'"),
    camera_movement: z.string().describe("Camera movement, e.g., 'Static', 'Slow push in'"),
    shot_size: z.string().describe("Shot size, e.g., 'Full shot', 'Close up'"),
    content: z.string().describe("Visual content of the shot"),
    dialogue: z.string().describe("Dialogue or monologue, use '/' if none"),
    sound_effects: z.string().describe("Sound effects and background audio"),
});

const ScriptSchema = z.object({
    shots: z.array(ShotSchema).describe("List of shots in the script"),
});

type Script = z.infer<typeof ScriptSchema>;

// --- Models ---

// Using 'model' instead of 'modelName' to fix previous error
const commonModelConfig = {
    model: "gemini-2.0-flash-exp", // Placeholder for gemini-3-pro-preview until available/confirmed
    temperature: 0.7,
};

const scriptModel = new ChatGoogleGenerativeAI(commonModelConfig);
const designModel = new ChatGoogleGenerativeAI(commonModelConfig);
const storyboardModel = new ChatGoogleGenerativeAI(commonModelConfig);

// --- Agent 1: Script Generator ---

const generateScript = async (input: string): Promise<Script> => {
    console.log("--- Agent 1: Generating Script ---");
    const structuredModel = scriptModel.withStructuredOutput(ScriptSchema);
    const response = await structuredModel.invoke([
        new SystemMessage(PROMPTS.SCRIPT_GENERATOR),
        new HumanMessage(input),
    ]);
    return response;
};

// --- Helper: Tool Executor ---

const executeTools = async (response: any, tools: Record<string, any>) => {
    if (response.tool_calls && response.tool_calls.length > 0) {
        const results = [];
        for (const call of response.tool_calls) {
            const tool = tools[call.name];
            if (tool) {
                console.log(`> Executing tool: ${call.name}`);
                const result = await tool.invoke(call.args);
                results.push({ call, result });
            }
        }
        return results;
    }
    return null;
};

// --- Agent 2: Setting & Character Designer ---

// Tool for generating images
const generateImageTool = tool(
    async ({ prompt, type, name }: { prompt: string; type: string; name: string }) => {
        console.log(`  [Generative AI] Generating ${type} image for '${name}'...`);
        // In a real scenario, this would call the image generation API
        return `[Image Artifact: ${name}_${type}.png]`;
    },
    {
        name: "generate_image",
        description: "Generates an image based on a prompt. Use this for characters, settings, and items.",
        schema: z.object({
            prompt: z.string().describe("The detailed visual prompt for the image"),
            type: z.string().describe("Type of image: 'character', 'setting', or 'item'"),
            name: z.string().describe("Name of the subject"),
        }),
    }
);

const designAgentModel = designModel.bindTools([generateImageTool]);

const generateDesigns = async (script: Script) => {
    console.log("--- Agent 2: Generating Designs ---");
    const scriptText = JSON.stringify(script, null, 2);
    const messages = [
        new SystemMessage(PROMPTS.DESIGN_AGENT),
        new HumanMessage(`Analyze this script and generate designs:\n${scriptText}`),
    ];

    const response = await designAgentModel.invoke(messages);

    // Execute tools
    const toolResults = await executeTools(response, { generate_image: generateImageTool });

    return { response, toolResults };
};

// --- Agent 3: Storyboard Artist ---

const generateStoryboardFrameTool = tool(
    async ({ prompt, shot_id }: { prompt: string; shot_id: string }) => {
        console.log(`  [Generative AI] Generating storyboard frame for Shot ${shot_id}...`);
        return `[Storyboard Artifact: shot_${shot_id}.png]`;
    },
    {
        name: "generate_storyboard_frame",
        description: "Generates a storyboard frame image.",
        schema: z.object({
            prompt: z.string().describe("The detailed visual prompt for the frame, combining character, setting, and action"),
            shot_id: z.string().describe("The ID of the shot"),
        }),
    }
);

const storyboardAgentModel = storyboardModel.bindTools([generateStoryboardFrameTool]);

const generateStoryboards = async (script: Script, designs: any) => {
    console.log("--- Agent 3: Generating Storyboards ---");
    const scriptText = JSON.stringify(script, null, 2);
    // designs might be complex now, just passing script for simplicity in this demo
    // In a real app, we'd pass the design descriptions back

    const messages = [
        new SystemMessage(PROMPTS.STORYBOARD_AGENT),
        new HumanMessage(`Generate storyboards for this script using the generated designs.\nScript: ${scriptText}\nDesigns: ${JSON.stringify(designs.response, null, 2)}`),
    ];

    const response = await storyboardAgentModel.invoke(messages);

    // Execute tools
    const toolResults = await executeTools(response, { generate_storyboard_frame: generateStoryboardFrameTool });

    return { response, toolResults };
};


// --- Main Execution ---

async function main() {
    const input = process.argv[2] || "A lonely robot finds a flower in a wasteland.";
    console.log(`\nInput: "${input}"\n`);

    try {
        // Step 1: Generate Script
        const script = await generateScript(input);
        console.log("Script Generated (First shot preview):");
        console.log(script.shots[0]);
        console.log(`Total shots: ${script.shots.length}\n`);

        // Step 2: Generate Designs
        const designs = await generateDesigns(script);
        console.log(`Designs Generated: ${designs.toolResults?.length || 0} images created.\n`);

        // Step 3: Generate Storyboards
        const storyboards = await generateStoryboards(script, designs);
        console.log(`Storyboards Generated: ${storyboards.toolResults?.length || 0} frames created.\n`);

        console.log("--- Pipeline Complete ---");

    } catch (error) {
        console.error("Error in pipeline:", error);
    }
}

// Only run main if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export { generateScript, generateDesigns, generateStoryboards, PROMPTS };
