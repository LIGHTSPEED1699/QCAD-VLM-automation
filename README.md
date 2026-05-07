# VLM-Based GUI Automation Toolkit for QCAD/LibreCAD

Vision-Language Model (VLM) driven GUI automation for CAD applications. Replaces brittle coordinate-clicking with AI that can "see" and reason about the UI.

## What You Get

- **`qcad_vlm_agent.py`** — Main automation loop: Screenshot → VLM → Action → Execute → Repeat
- **`x11_controller.py`** — Pure Python X11 control (no xdotool needed). Window finding, clicking, typing, dragging
- **`ollama_client.py`** — Ollama API client (local + cloud)
- **`coordinate_cache.py`** — Hybrid cache: VLM discovers once, instant replay forever

## Prerequisites

```bash
# Already done — virtual environment at vlm-gui-automation/venv/
# Python packages installed: Pillow, mss, opencv-python-headless, python-xlib, pynput

# System requirement: ImageMagick (for screenshots)
sudo apt-get install -y imagemagick   # or already installed
```

## Quick Start

### 1. Test X11 Controller

```bash
cd /home/hongbin/.openclaw/workspace/vlm-gui-automation
source venv/bin/activate

# Find a window
python x11_controller.py find "QCAD"
# Output: 12345678  (window ID)

# Get window geometry
python x11_controller.py geometry 12345678
# Output: {'x': 100, 'y': 50, 'width': 1200, 'height': 800}

# Click somewhere
python x11_controller.py click 200 300

# Take screenshot
python x11_controller.py screenshot 12345678 /tmp/qcad_test.png
```

### 2. Test VLM with Screenshot

```bash
# Using your default kimi-k2.6:cloud model
python ollama_client.py vision kimi-k2.6:cloud \
  "What CAD tools do you see in this screenshot? List the toolbar buttons." \
  /tmp/qcad_test.png
```

### 3. Run Full Automation

```bash
# Basic task — VLM will find and click the Line tool
python qcad_vlm_agent.py \
  --task "Select the line tool" \
  --model kimi-k2.6:cloud \
  --window-name "QCAD"

# Drawing task (multi-step)
python qcad_vlm_agent.py \
  --task "Draw a rectangle from (0,0) to (100,100)" \
  --model kimi-k2.6:cloud \
  --max-steps 15 \
  --delay 3.0

# Use local model instead (no cloud dependency)
python qcad_vlm_agent.py \
  --task "Select the circle tool" \
  --use-local \
  --local-model gemma3:4b
```

### 4. Coordinate Cache

After VLM discovers coordinates once, they're cached for instant replay:

```bash
# View cache
python coordinate_cache.py list

# Clear cache
python coordinate_cache.py clear

# Manual entry (if you know the coords)
python coordinate_cache.py set "QCAD" 1200x800 "Line Tool" 45 30
```

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   User Task     │────▶│  VLM Agent      │────▶│  X11 Controller │
│ (e.g. "Draw     │     │                 │     │                 │
│  rectangle")     │     │ 1. Screenshot   │     │ • find window   │
└─────────────────┘     │ 2. Send to VLM  │     │ • raise window  │
                        │ 3. Parse action   │     │ • click/type    │
                        │ 4. Execute        │     │ • drag/screenshot│
                        │ 5. Cache coords   │     │                 │
                        │ 6. Loop/verify   │     │                 │
                        └─────────────────┘     └─────────────────┘
                                 ▲
                                 │ screenshot feedback
                                 └─────────────────┘
```

## VLM Prompt Template

The agent sends screenshots with this structured prompt:

```
You are a GUI automation assistant. You can see a screenshot of a CAD application.

Task: {user_task}

Analyze the screenshot and:
1. Identify the relevant toolbar buttons, menus, or canvas areas
2. Provide the approximate center coordinates of UI elements to click
3. If text input is needed, specify the exact text to type
4. If the task appears complete, indicate completion

Return your response in this exact format:
OBSERVATION: <what you see>
ACTION: <click|type|drag|menu_select|key_press|done>
TARGET: <description of element>
COORDINATES: (x, y)
TEXT: <text to type>
REASONING: <why you chose this action>
```

## Model Options

### Cloud (via Ollama Cloud)
- `kimi-k2.6:cloud` — Your current default, native multimodal
- `qwen3.5:cloud` — Tuned for UI agents
- `gemma3:cloud` / `gemma4:cloud` — Lightweight options

### Local (RTX 3060 12GB)
- `gemma3:4b` (~3–5GB VRAM) — Recommended starter
- `qwen3.5:7b` (~5–7GB VRAM)
- `llava:latest` (~5GB VRAM) — Classic VLM

## Files

```
vlm-gui-automation/
├── qcad_vlm_agent.py      # Main agent
├── x11_controller.py      # X11 automation
├── ollama_client.py       # API client
├── coordinate_cache.py      # Coordinates cache
├── venv/                  # Virtual environment
└── coords_cache.json      # Generated cache file
```

## Troubleshooting

**"Window not found"**
- Check window name: `xwininfo -tree -root | grep -i qcad`
- Try alternate names: `QCAD`, `LibreCAD`, `qcad`

**"Cannot connect to X display"**
- Ensure you're running on the same X11 session (not SSH without -X)
- Check `$DISPLAY` is set

**"VLM returns wrong coordinates"**
- HiDPI scaling can confuse coordinates. The agent converts relative → absolute using window geometry
- Add `--delay 3.0` to give UI time to settle between steps

**"Model not responding"**
- Check Ollama: `curl http://localhost:11434/api/tags`
- For cloud models, verify Ollama Cloud key is configured

## Next Steps

1. **Benchmark latency**: Time a simple task (e.g., "click the line tool") with different models
2. **Build command library**: Cache common operations (select line, draw rectangle, zoom extents)
3. **Integrate with OpenClaw**: Add `/qcad` slash command that calls this agent
4. **Qt accessibility bridge**: If modifying QCAD source, expose toolbar metadata to skip VLM entirely for known elements

## Reference

- Original proposal: `/home/hongbin/Documents/openclaw-shared/vlm-gui-automation-proposal.md`
- X11 docs: https://python-xlib.readthedocs.io/
- Ollama vision models: https://ollama.com/search?c=vision
