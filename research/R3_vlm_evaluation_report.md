# R3: VLM Evaluation Report — Local CAD Screenshot Understanding

**Date:** 2026-05-07
**Evaluator:** researcher (Hermes Kanban)
**Hardware Constraint:** RTX 3060 12GB VRAM
**Target:** >90% accuracy on CAD-specific visual reasoning + precise screen coordinates

---

## 1. Executive Summary

**RTX 3060 12GB is viable for a 2-model VLM stack, but a single model cannot hit the >90% accuracy target.**

Recommended production stack:
1. **Primary VLM:** `qwen2.5vl:3b` (Q4_K_M, ~5–7GB VRAM) — best balance of OCR accuracy, object grounding, and speed
2. **OCR Specialist (fallback):** `glm-ocr:latest` (~2.2GB, 0.9B params) — highest OCR accuracy on OmniDocBench
3. **Cloud fallback:** `kimi-k2.6:cloud` (via Ollama Cloud) — when local accuracy is insufficient

For a unified >90% accuracy solution, a **GPU upgrade to RTX 4060 Ti 16GB or RTX 4070 Ti Super 16GB** is the minimum viable path. This enables `qwen2.5vl:7b` or `gemma4:26b` to run fully in VRAM.

---

## 2. Model Comparison Table

| Model | Size (file) | Params | Est. VRAM (Q4, 8K ctx) | Ollama Tag | OCR | Object Grounding | Coordinates | CAD/Diagram | Speed* | License |
|---|---|---|---|---|---|---|---|---|---|---|
| **qwen2.5vl:3b** | 3.2GB | 3.75B | ~5–7GB | `qwen2.5vl:3b` | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ (bbox/points) | ✅ JSON coords | ⭐⭐⭐⭐⭐ | ~25–40 tok/s | Apache 2.0 |
| **qwen2.5vl:7b** | ~6GB | 7B | ~10–12GB | `qwen2.5vl:7b` | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ✅ JSON coords | ⭐⭐⭐⭐⭐ | ~15–25 tok/s | Apache 2.0 |
| **qwen3-vl:4b** | 3.3GB | 4B | ~5–7GB | `qwen3-vl:4b` | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ (rel. coords) | ✅ 2D/3D grounding | ⭐⭐⭐⭐⭐ | ~25–40 tok/s | Apache 2.0 |
| **qwen3-vl:8b** | 6.1GB | 8B | ~9–11GB | `qwen3-vl:8b` | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ✅ | ⭐⭐⭐⭐⭐ | ~15–22 tok/s | Apache 2.0 |
| **gemma4:e4b** | 9.6GB | 4.5B eff. | ~10–11GB | `gemma4:e4b` | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ❌ No native bbox | ⭐⭐⭐⭐ | ~20–30 tok/s | Apache 2.0 |
| **gemma4:e2b** | 7.2GB | 2.3B eff. | ~8–9GB | `gemma4:e2b` | ⭐⭐⭐ | ⭐⭐⭐ | ❌ | ⭐⭐⭐ | ~30–40 tok/s | Apache 2.0 |
| **llava:7b-v1.6** | 4.7GB | 7.24B | ~6–7GB | `llava:7b` | ⭐⭐⭐ | ⭐⭐ | ❌ | ⭐⭐ | ~20–30 tok/s | Apache 2.0 |
| **moondream:1.8b** | 1.7GB | 1.6B | ~3–4GB | `moondream` | ⭐⭐⭐ | ⭐⭐⭐ (point objs) | ⚠️ Basic | ⭐⭐ | ~40–60 tok/s | Apache 2.0 |
| **glm-ocr:latest** | 2.2GB | 0.9B | ~3–4GB | `glm-ocr` | ⭐⭐⭐⭐⭐ (#1 OmniDocBench) | ⭐⭐ | ❌ | ⭐⭐⭐ | ~50–80 tok/s | MIT |
| **minicpm-v:8b** | ~6GB | 8B | ~9–11GB | `minicpm-v:8b` | ⭐⭐⭐⭐⭐ (700+ OCRBench) | ⭐⭐⭐⭐ | ⚠️ | ⭐⭐⭐⭐ | ~15–25 tok/s | Apache 2.0 |

*Speed estimates on RTX 3060 12GB via Ollama/llama.cpp CUDA, Q4_K_M, 8K context. Vision models are slower than pure text models due to image encoder overhead (typically +0.5–2s per image).

---

## 3. Detailed Assessment per Capacity

### 3.1 Read PDF Annotations (OCR + Text Understanding)
**Best:** `glm-ocr` (94.62 OmniDocBench) → `qwen3-vl:4b` / `qwen2.5vl:3b`

- `glm-ocr` is purpose-built for document OCR; it will read "Replace NT111 with NT-110" with near-perfect accuracy.
- `qwen2.5vl:3b` and `qwen3-vl:4b` both have strong OCR but are generalists. Qwen3-VL specifically expanded from 10 to 32 languages and improved rare-character/technical-term recognition.

### 3.2 Understand PDF Context Crops (Zoomed Regions)
**Best:** `qwen2.5vl:3b` / `qwen3-vl:4b`

- Both support dynamic resolution handling and can process arbitrary aspect ratios.
- Qwen2.5-VL uses "naive dynamic resolution" — maps images to dynamic visual token counts.
- Qwen3-VL adds relative (instead of absolute) coordinate grounding, which is better for cropped regions.

### 3.3 Understand QCAD Rendered DWG Screenshots
**Best:** `qwen2.5vl:3b` / `qwen3-vl:4b`

- Both trained on diagrams, charts, and technical drawings.
- Qwen2.5-VL-3B outperformed previous-generation Qwen2-VL-7B on document/diagram benchmarks.
- Qwen3-VL adds "visual coding" — generates Draw.io/HTML/CSS from screenshots, indicating strong spatial structure understanding.

### 3.4 Return Precise Screen Coordinates for X11 Actions
**Critical finding:** Only Qwen VL models and Moondream natively support structured coordinate output.

| Model | Coordinate Format | Accuracy |
|---|---|---|
| `qwen2.5vl:3b/7b` | JSON bounding boxes or points | ⭐⭐⭐⭐⭐ — designed for visual agent/grounding |
| `qwen3-vl:4b/8b` | Relative 2D/3D coordinates | ⭐⭐⭐⭐⭐ — upgraded spatial understanding |
| `moondream` | Point-to-object (basic) | ⭐⭐⭐ — limited precision |
| `llava`, `gemma4`, `minicpm-v` | Text-only descriptions | ❌ No native coordinate output |

**Implication:** For X11 click automation, you need a model that can return `(x, y)` in JSON. Qwen2.5-VL and Qwen3-VL are the only viable local options. Gemma 4 and LLaVA would require a secondary parsing layer (e.g., ask "where is the button?" then run OCR + template matching), which drops accuracy below target.

### 3.5 Handle Engineering Drawings (Text Labels, Lines, Blocks)
**Best:** `qwen2.5vl:3b` / `qwen3-vl:4b`

- Both excel at "document and diagram understanding" per official benchmarks.
- `glm-ocr` is excellent at reading text labels but does not understand line/block spatial relationships.

---

## 4. VRAM Analysis for RTX 3060 12GB

### What fits fully in VRAM (no CPU offload)

| Model | VRAM Need | Fits? | Headroom |
|---|---|---|---|
| `qwen2.5vl:3b` | ~5–7GB | ✅ Yes | 5–7GB for KV cache + second model |
| `qwen3-vl:4b` | ~5–7GB | ✅ Yes | 5–7GB headroom |
| `moondream:1.8b` | ~3–4GB | ✅ Yes | 8–9GB headroom |
| `glm-ocr:latest` | ~3–4GB | ✅ Yes | 8–9GB headroom |
| `llava:7b-v1.6` | ~6–7GB | ✅ Yes | 5–6GB headroom |
| `gemma4:e2b` | ~8–9GB | ⚠️ Tight | 3–4GB headroom |
| `qwen2.5vl:7b` | ~10–12GB | ❌ No / marginal | Spills to CPU |
| `qwen3-vl:8b` | ~9–11GB | ❌ No / marginal | May fit with Q3 |
| `gemma4:e4b` | ~10–11GB | ❌ No / marginal | Too tight |
| `minicpm-v:8b` | ~9–11GB | ❌ No / marginal | Spills to CPU |

**Key insight:** RTX 3060 12GB can comfortably run **one** strong VLM (`qwen2.5vl:3b` or `qwen3-vl:4b`) plus a tiny specialist (`glm-ocr` or `moondream`) simultaneously, but cannot fit any 7B+ vision model fully in VRAM without aggressive Q3 quantization or CPU offloading (which destroys speed).

### Speed Reality Check on RTX 3060

From benchmark data (llama.cpp CUDA, Q4_K_M, 16K context):
- Pure text 8B models: ~42 tok/s
- Pure text 14B models: ~23 tok/s

Vision models incur additional overhead:
- Image encoding: ~0.5–2.0s per image (resolution dependent)
- Vision tower memory: adds ~0.5–1GB VRAM
- Effective throughput: roughly **60–80% of pure-text speed** for the same param count

Expected real-world speeds on RTX 3060 12GB:
| Model | Est. tok/s | Image encode | Total per query (256 tokens) |
|---|---|---|---|
| `qwen2.5vl:3b` | 30–40 | ~0.8s | ~1.5–2.5s |
| `qwen3-vl:4b` | 30–40 | ~0.8s | ~1.5–2.5s |
| `moondream` | 40–60 | ~0.3s | ~0.8–1.2s |
| `glm-ocr` | 50–80 | ~0.3s | ~0.6–1.0s |
| `qwen2.5vl:7b` (CPU spill) | 5–10 | ~1.5s | ~5–10s |

---

## 5. Recommendation: Production Model Stack

### Option A: Best on Current Hardware (RTX 3060 12GB)
**Stack:** `qwen2.5vl:3b` (primary) + `glm-ocr:latest` (OCR fallback)

| Role | Model | Why |
|---|---|---|
| Primary VLM | `qwen2.5vl:3b` | Native JSON coordinate output, best 3B vision model for diagrams, proven on visual-agent benchmarks |
| OCR Specialist | `glm-ocr:latest` | #1 OmniDocBench score (94.62), 0.9B params, tiny VRAM footprint |
| Routing Logic | Custom | If image is mostly text → `glm-ocr`; if spatial reasoning needed → `qwen2.5vl:3b` |

**Pros:** Fits in 12GB with room to spare; fast inference; no cloud dependency.
**Cons:** 3B model may struggle with >90% accuracy on complex CAD screenshots; may miss fine-grained spatial relationships in dense drawings.

### Option B: Unified High-Accuracy (Requires GPU Upgrade)
**Minimum viable upgrade:** RTX 4060 Ti 16GB (~$450 USD) or RTX 4070 Ti Super 16GB (~$800 USD)

| Model | Why | Est. Cost |
|---|---|---|
| `qwen2.5vl:7b` | Outperforms GPT-4o-mini on many vision tasks; full coordinate grounding | GPU upgrade |
| `qwen3-vl:8b` | Even stronger spatial reasoning + 3D grounding; 256K context | GPU upgrade |
| `gemma4:26b` | MoE (3.8B active) — high accuracy with moderate VRAM (~16–20GB) | GPU upgrade to 24GB (RTX 4090) |

With 16GB VRAM:
- `qwen2.5vl:7b` fits comfortably (~10–12GB) with KV cache headroom
- `qwen3-vl:8b` fits at Q4 (~9–11GB)

Expected accuracy jump: 3B → 7B/8B typically yields **+10–20% absolute improvement** on vision reasoning benchmarks (e.g., MMMU Pro 52.6% → 76.9% for Gemma 4 E4B vs 31B).

### Option C: Hybrid Cloud Fallback
**Stack:** `qwen2.5vl:3b` (local) + `kimi-k2.6:cloud` (remote fallback)

- Run 3B locally for 80% of queries (speed + privacy)
- Fall back to cloud Kimi K2.6 for ambiguous/dense CAD screenshots
- Kimi K2.6 is an open-source native multimodal agentic model with strong long-horizon reasoning

**Cons:** Latency hit (~2–5s vs ~1–2s); cost per query; privacy leakage for proprietary drawings.

---

## 6. Fine-Tuning Feasibility

### Can we fine-tune a custom model on RTX 3060 12GB?
**Answer: Barely for LoRA, realistically no for full fine-tuning.**

| Approach | VRAM Need on 3B VLM | Feasible? |
|---|---|---|
| Full fine-tuning | ~20–30GB | ❌ No |
| LoRA (rank 16) | ~8–12GB | ⚠️ Marginal — may need gradient checkpointing + Q4 base |
| QLoRA (4-bit base + LoRA) | ~6–8GB | ✅ Yes |

**Recommendation:** If fine-tuning is desired:
1. Use **QLoRA** on `qwen2.5vl:3b` or `qwen3-vl:4b`
2. Target ~500–1,000 labeled CAD screenshot examples (screenshot + instruction + expected JSON output)
3. Data format: `{image: "cad_screenshot.png", instruction: "Find NT111 and return its center coordinate", output: {"bbox": [x1,y1,x2,y2], "center": [cx,cy]}}`
4. Expected improvement: +5–15% accuracy on domain-specific tasks with 1K examples

### Data Requirements for Custom Fine-Tuning
| Item | Requirement |
|---|---|
| Min. examples | 300–500 for noticeable improvement |
| Target examples | 1,000–2,000 for production-level accuracy |
| Label format | JSON with bounding boxes + action labels |
| Annotation time | ~30–60 sec per screenshot (manual) |
| Automated augmentation | Rotate, crop, scale CAD screenshots (10× multiplier possible) |

---

## 7. Decision Matrix

| Goal | Recommended Model | Hardware | Est. Accuracy |
|---|---|---|---|
| Fast prototype, minimal cost | `qwen2.5vl:3b` + `glm-ocr` | RTX 3060 12GB | 75–85% |
| Production >90% accuracy | `qwen2.5vl:7b` or `qwen3-vl:8b` | RTX 4070 Ti Super 16GB+ | 85–92% |
| Best possible accuracy | `qwen3-vl:30b` / `gemma4:31b` | RTX 4090 24GB or dual GPU | 90–95% |
| Edge/low-power | `moondream` or `glm-ocr` | 4–8GB VRAM | 60–75% |

---

## 8. Actionable Next Steps

1. **Immediate (no spend):** Pull `qwen2.5vl:3b` and `glm-ocr` into Ollama. Run a 50-image benchmark on real QCAD screenshots + PDF crops from your dataset. Measure:
   - OCR accuracy (Levenshtein distance on known labels)
   - Coordinate precision (pixel distance from ground-truth click targets)
   - Inference latency (end-to-end per image)

2. **If accuracy <85%:** Evaluate `qwen3-vl:4b` (newer, better spatial reasoning) as a drop-in replacement.

3. **If accuracy <90% after #2:** Plan GPU upgrade to 16GB. RTX 4060 Ti 16GB is the price/performance sweet spot (~$450). This enables `qwen2.5vl:7b` fully in VRAM.

4. **If proprietary data is abundant:** Collect 500–1,000 labeled CAD screenshots and run QLoRA fine-tuning on `qwen2.5vl:3b`.

---

## 9. Sources & References

- Ollama Library: https://ollama.com/search?c=vision
- Qwen2.5-VL Technical Report: https://arxiv.org/abs/2502.13923
- Qwen3-VL Documentation: https://ollama.com/library/qwen3-vl
- GLM-OCR Benchmarks: https://ollama.com/library/glm-ocr
- Gemma 4 Benchmarks: https://ollama.com/library/gemma4
- PhotoPrism Vision Model Comparison: https://docs.photoprism.app/developer-guide/vision/model-comparison/
- RTX 3060 Benchmarks: https://singhajit.com/llm-inference-speed-comparison/
- Ollama VRAM Guide 2026: https://localllm.in/blog/ollama-vram-requirements-for-local-llms
- GUI Grounding Research (R-VLM): https://arxiv.org/html/2507.05673v1
