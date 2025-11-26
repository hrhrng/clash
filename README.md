# AI Video Production System

An AI-powered video production pipeline that generates complete video storyboards from simple story ideas.

## Philosophy

This project follows a **modular architecture**:
- **Core modules** (`.py` files) provide reusable functions and data structures
- **Workflow logic** stays in **Jupyter Notebooks** for interactive development
- Command-line tools are optional for simple use cases

## Features

- **Automated Script Generation**: Convert story ideas into structured production scripts
- **Asset Generation**: Automatically create character and location reference images
- **Shot Generation**: Generate individual shot keyframes with consistent visual style
- **Multiple AI Backends**: Support for Google Gemini and Nano Banana Pro
- **Modular Design**: Functions are separated from workflow logic

## Project Structure

```
master-clash/
├── config.py              # Configuration and environment variables
├── models.py              # Pydantic data models (Script, Shot, Character, etc.)
├── utils.py               # Utility functions (file I/O, conversions)
├── image_generation.py    # Image generation backends (Gemini, Nano Banana)
├── agents.py              # Core agent functions (generate_script, generate_assets, etc.)
├── main.py                # Optional CLI tool
├── example_workflow.py    # Example workflow (copy to notebook)
├── video.ipynb            # Main interactive workflow (Jupyter)
├── production_assets/     # Generated images
└── output/                # Script JSON and other outputs
```

## Installation

1. Clone the repository
2. Install dependencies:

```bash
pip install -r requirements.txt
# or using uv
uv pip install -r requirements.txt
```

3. Set up environment variables:

Create a `.env` file with:

```env
GOOGLE_API_KEY=your_google_api_key
GEMINI_API_KEY=your_gemini_api_key
NANO_BANANA_API_KEY=your_nano_banana_api_key
```

## Usage

### Primary Method: Jupyter Notebook (Recommended)

Open `video.ipynb` and run cells interactively:

```python
# Import core functions
from config import print_config
from agents import generate_script, generate_assets, generate_shots

# Step 1: Generate script
script = generate_script("A sci-fi short about a robot finding a flower")

# Step 2: Generate assets (you can modify script before this step)
assets = generate_assets(script)

# Step 3: Generate shots (full control over which shots to generate)
shots = generate_shots(script, assets)
```

This gives you:
- Full control over each step
- Ability to inspect and modify data between steps
- Interactive debugging and experimentation
- Access to all generated data in memory

### Alternative: Example Workflow Script

See `example_workflow.py` for a complete example that can be:
- Run directly as a Python script
- Copied into a new Jupyter notebook
- Modified for your specific needs

```bash
python example_workflow.py
```

### Optional: Command Line Tool

For quick script generation only:

```bash
# Generate script only
python main.py "Your story idea"

# Generate script and save JSON
python main.py "Your story idea" --output-json output/script.json

# Run full production (script + assets + shots)
python main.py "Your story idea" --full
```

Note: CLI is provided for convenience, but notebook workflow is recommended for full control.

## Module Documentation

### config.py
Contains all configuration settings:
- Model names (TEXT_MODEL_NAME, IMAGE_MODEL_NAME)
- API keys and URLs
- Directory paths

### models.py
Pydantic data models:
- `ScriptOutput`: Complete script structure
- `Shot`: Individual shot specifications
- `Character`, `Location`: Asset definitions
- `Camera`, `VisualSpec`, `Performance`, `Audio`: Shot components

### utils.py
Utility functions:
- `save_binary_file()`: Save binary data
- `image_to_base64()`: Convert images to base64
- `load_input_data()`: Load text/CSV input
- `ensure_directory()`: Create directories
- `create_reference_image_dict()`: Create image reference data

### image_generation.py
Image generation functions:
- `generate_image()`: Gemini-based image generation
- `generate_image_nano()`: Nano Banana Pro generation
- `create_nano_banana_task()`: Create async tasks
- `query_nano_banana_task()`: Poll for results

### agents.py
Production pipeline agents (these are the main functions you'll use):
- `generate_script(user_input)`: Convert story ideas to structured scripts
- `generate_assets(script)`: Generate character/location reference images
- `generate_shots(script, asset_images)`: Generate shot keyframes
- `print_production_summary(script, assets, shots)`: Print summary
- `SCRIPT_GENERATION_SYSTEM_PROMPT`: System prompt for script generation

## Output

The system generates:

1. **Script JSON**: Structured screenplay with shots, characters, locations
2. **Character References**: Multi-angle character design sheets
3. **Location References**: Environment concept art
4. **Shot Keyframes**: Individual frames for each shot in the sequence

All images are saved to `production_assets/` directory.

## Example Workflow

1. **Input**: "A boy finds a mysterious robot in the rain"

2. **Script Generation**:
   - Story outline
   - Character definitions (Boy, Robot)
   - Location definitions (Rainy Street, Alley)
   - Shot breakdown (15-20 shots)

3. **Asset Generation**:
   - `char_1_reference.png` (Boy character sheet)
   - `char_2_reference.png` (Robot character sheet)
   - `loc_1_reference.png` (Rainy street environment)

4. **Shot Generation**:
   - `shot_001.png` through `shot_015.png`
   - Each maintains visual consistency using asset references

## Requirements

- Python 3.8+
- Google Gemini API access
- Nano Banana Pro API access (optional)
- Dependencies: see `pyproject.toml`

## License

MIT

## Contributing

Contributions welcome! Please ensure code follows the modular structure.
