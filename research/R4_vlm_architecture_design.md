# R4: VLM Architecture for PDF Annotation → DWG Modification Pipeline

**Task:** R4 — Design the VLM reasoning architecture needed for full production pipeline
**Date:** 2026-05-07
**Researcher:** Hermes Kanban Worker (researcher profile)
**Status:** Complete

---

## Executive Summary

Current pipeline testing achieved 2/3 entity match success. **Task 1 (replace NT111 block with NT-110) failed** while Tasks 2–3 succeeded. Root cause: **blocks are visually near-invisible in QCAD screenshots** — only the block's internal entities render, not a bounding box or label. The VLM sees scattered lines and text but cannot associate them with the block name "NT111". This is a **fundamental visual grounding problem**, not a prompt failure.

The recommended architecture is a **3-phase VLM call sequence**: Phase 1 parses PDF annotations into structured action plans, Phase 2 disambiguates targets using metadata (DXF layer + attribute search), and Phase 3 executes via coordinates with self-verification. A **confidence scoring layer** (per VAUQ research) gates execution and triggers retry/human-in-the-loop on low confidence.

---

## 1. Root Cause Analysis of Task 1 Failure

### What Went Wrong

The task was: *"Replace NT111 block with NT-110"*

The VLM was given:
1. PDF annotation text: "Replace NT111 with NT-110"
2. A full-page QCAD screenshot
3. A context crop (zoomed region around the annotation)

The VLM matched 2/3 entities on other tasks (text labels "Blu" and row markers), but **failed to find NT111**.

### Why It Failed — Three Contributing Factors

| Factor | Explanation | Severity |
|--------|-------------|----------|
| **A. Block visual invisibility** | In QCAD (and AutoCAD), an INSERT entity is just a reference point with scale/rotation. The block's content renders at that location, but **no visible bounding box or label says "NT111"**. The VLM sees lines, text, and geometry that belong to the block definition, not a labeled object. | **Critical** |
| **B. Ambiguous entity type** | "NT111" is a block name, not text on the drawing. Unlike text entities (which the VLM can read visually), block names are metadata invisible to screenshot analysis. The VLM has no visual cue to ground "NT111". | **Critical** |
| **C. Prompt confusion between text and blocks** | The prompt asks the VLM to "find the entity called NT111" — but from the screenshot, NT111 does not appear as text. The VLM likely hallucinated a coordinate or clicked on unrelated geometry. | Moderate |

### What Would Have Worked Instead

To replace a block by name, the pipeline **must not rely solely on VLM visual matching**. It needs one of:

1. **DXF/entity metadata pre-search**: Before screenshot analysis, search the DXF for INSERT entities with `name == "NT111"`, get their insertion coordinates, then zoom to that region for VLM confirmation.
2. **OCR + annotation anchor**: Parse the PDF annotation to extract the target name, then use DXF metadata (not vision) to locate it. Use VLM only for confirmation that the right region is visible.
3. **Hybrid prompt**: Send the VLM a screenshot **plus** a list of candidate coordinates from DXF metadata. Ask the VLM to pick the correct one based on context (e.g., "which of these locations contains the block annotated by the red arrow?").

### Conclusion on Task 1

This failure is **architectural**, not a model deficiency. No VLM — local or cloud — can find "NT111" from a QCAD screenshot because the information is not visually present. The fix is a **metadata-first, vision-confirmation** hybrid approach.

---

## 2. PDF Annotation Comprehension

### Can a VLM Reliably Parse Multi-Step Instructions?

Yes, with structured output constraints. Current VLMs (Qwen2.5-VL, GPT-4o, Gemini 2.0, Kimi k2.6) are strong at reading markup text in PDF images. Reliability improves with:

- **Bounding box hints**: Cropping to the annotation region (not full page) reduces noise
- **Schema enforcement**: Using `response_format: {type: "json_schema"}` eliminates freeform hallucinations
- **One instruction per crop**: If a PDF page has 5 annotations, process them individually rather than asking the VLM to output 5 plans at once

### Handling Ambiguous Annotations

The example annotation "change Blu to Wht" is ambiguous because multiple entities might contain "Blu". Resolution strategies:

| Strategy | How It Works | Best For |
|----------|--------------|----------|
| **Proximity anchor** | Use the annotation's location on the PDF page to infer which entity on the DWG it refers to (closest spatial match) | Simple markups on matching-coordinate PDFs |
| **Context crop pairing** | Send the VLM both the PDF annotation crop and the QCAD screenshot crop of the same region; ask "what entity in the CAD view corresponds to this annotation?" | When PDF and DWG share geometry/space |
| **DXF pre-filter** | Search DXF for entities containing "Blu" before asking the VLM; present candidates | Text labels, attributes, MTEXT |
| **Interactive disambiguation** | When multiple candidates exist, ask VLM to rank them with confidence scores; threshold triggers human review | Production with human-in-the-loop |

### Recommended Structured Output for Annotation Parsing

```json
{
  "annotation_id": "ann_001",
  "instruction_text": "Replace NT111 with NT-110",
  "action_type": "replace_block",
  "target_name": "NT111",
  "replacement_name": "NT-110",
  "target_type": "INSERT",
  "page_number": 3,
  "pdf_region": {"x": 120, "y": 340, "w": 200, "h": 40},
  "ambiguity_note": "target is block name, not visible text; requires DXF metadata lookup",
  "confidence": 0.92,
  "requires_human_review": false
}
```

---

## 3. PDF Context Crop Understanding

### Are Context Crops Sufficient?

**Yes for text labels, no for block names.** Context crops (zoomed-in screenshots of the annotated region) work well when the target entity is visually identifiable — text strings, dimension lines, leader arrows, hatches. They fail when the target is metadata-only (block names, layer names, handle IDs).

### Full Page vs. Crop Only

| Mode | Pros | Cons | Recommendation |
|------|------|------|----------------|
| **Full page + crop** | VLM has global context for disambiguation; can verify relative position | 2× token cost; slower | Use when annotations are sparse and spatial context matters |
| **Crop only** | Faster; cheaper; forces focus | Loses global context; risk of wrong-region match | Use when annotation is precise and region is unambiguous |
| **Full page + annotated overlay** | Best of both; annotation bounding boxes drawn on full page | Requires pre-processing to draw boxes | Ideal for complex drawings with many annotations |

### Optimal Image Resolution

Based on Computer Use / GUI agent research (2026):

- **Minimum**: 1024×768 for full-page screenshots
- **Optimal**: 1920×1080 or native QCAD window resolution
- **Context crops**: 400×400 to 800×800 pixels around the annotation
- **JPEG quality**: 85 (balance between token cost and OCR fidelity)

Higher resolutions help with small text but increase API latency and cost. For CAD screenshots, 1080p is the sweet spot.

---

## 4. QCAD Screenshot Understanding

### Why Task 1 Failed Specifically

As established in Section 1, the VLM cannot see block names. But more broadly, QCAD screenshots present these challenges:

| Challenge | Cause | Mitigation |
|-----------|-------|------------|
| Block names invisible | INSERT entities render their content, not their name | Metadata-first lookup (Section 1) |
| Overlapping entities | Engineering drawings have dense geometry | Use context crops; zoom in before screenshot |
| Similar-looking entities | Multiple identical blocks or repeated text labels | Disambiguate via DXF metadata or spatial anchors |
| Small text at default zoom | Labels may be unreadable in full-page view | Pre-zoom to annotation region before capture |
| Selection state invisible | Unless entity is highlighted, it looks identical to neighbors | Use QCAD's "select similar" or property query before screenshot |

### Does the Model Understand Engineering Drawing Conventions?

Partially. Modern VLMs (Kimi k2.6, Qwen2.5-VL, GPT-4o) recognize:
- Title blocks, revision tables, BOMs
- Dimension lines, leaders, arrowheads
- Layer colors (if visible)
- Text labels and callouts

They do **not** reliably understand:
- Block hierarchies (nested INSERTs)
- Invisible attributes (ATTRIB inside INSERT)
- Layer semantics (which layer implies which function)
- Engineering symbols without legend

**Recommendation**: Do not rely on the VLM to infer technical meaning. Provide explicit instruction types ("replace_block", "change_text", "move_entity") and let the VLM confirm visual presence, not interpret engineering logic.

---

## 5. Modification Planning — Structured Action Plans

### Can VLM Output Structured Action Plans?

Yes, and this is **strongly recommended** over raw coordinate predictions. A structured action plan separates intent from execution, enabling:
- Validation before acting
- Retry with different parameters
- Human review of the plan without re-running
- Audit logs for compliance

### Recommended Action Schema

```json
{
  "plan_id": "plan_20260507_001",
  "source_annotation": "ann_001",
  "status": "pending",
  "steps": [
    {
      "step_number": 1,
      "action": "metadata_lookup",
      "description": "Find INSERT entity with block name NT111",
      "tool": "ezdxf_search",
      "parameters": {
        "entity_type": "INSERT",
        "block_name": "NT111",
        "output": "insertion_point"
      },
      "expected_result": "[(x1, y1), (x2, y2)]",
      "retry_on_empty": true,
      "fallback": "human_review"
    },
    {
      "step_number": 2,
      "action": "zoom_to_region",
      "description": "Center QCAD view on candidate coordinate",
      "tool": "qcad_x11",
      "parameters": {
        "center": "{{step_1.result[0]}}",
        "zoom_factor": 2.0
      }
    },
    {
      "step_number": 3,
      "action": "vlm_verify",
      "description": "Ask VLM: is this the entity annotated for replacement?",
      "tool": "vlm_vision",
      "parameters": {
        "image": "screenshot_crop",
        "prompt": "The annotation says 'Replace NT111 with NT-110'. Is the highlighted region the correct target? Answer yes/no with confidence."
      },
      "confidence_threshold": 0.80,
      "on_reject": "try_next_candidate"
    },
    {
      "step_number": 4,
      "action": "execute_replace",
      "description": "Use QCAD block replacement or DXF pipeline",
      "tool": "dwg_edit",
      "parameters": {
        "operation": "replace_block",
        "target_block": "NT111",
        "replacement_block": "NT-110",
        "location": "{{step_1.result[0]}}"
      }
    },
    {
      "step_number": 5,
      "action": "verify_change",
      "description": "Post-modification screenshot + VLM confirmation",
      "tool": "vlm_vision",
      "parameters": {
        "image": "post_screenshot",
        "prompt": "Confirm the entity now shows NT-110, not NT111."
      }
    }
  ],
  "overall_confidence": 0.85,
  "requires_human_review": false
}
```

### Should Action Planning Be a Separate VLM Call?

**Yes — two-phase is better than one-shot.**

| Approach | Pros | Cons |
|----------|------|------|
| **One-shot** (single VLM call returns coordinates) | Simple; fewer API calls | Brittle; no recoverability; hallucinated coordinates are catastrophic |
| **Two-phase** (Phase 1: plan JSON, Phase 2: verify/execute) | Auditable; retryable; metadata can augment vision; human-reviewable | More API calls; higher latency; more code |

For production, use **two-phase**. Phase 1 can run on a fast/cheap model (e.g., gemma4:e2b or Qwen2.5-VL-7B). Phase 2 (verification) should use the strongest model available (Kimi k2.6:cloud or GPT-4o).

---

## 6. Failure Handling & Confidence Scoring

### What to Do When VLM Cannot Find Entity

A robust pipeline needs **four layers of failure handling**:

```
Layer 1: Metadata pre-search (DXF/ezdxf)
    ↓ if no match
Layer 2: Broader VLM search (zoom out, full page, different crop)
    ↓ if still no match
Layer 3: Prompt reformulation (rephrase target description, add examples)
    ↓ if still no match
Layer 4: Human-in-the-loop (queue for manual review, skip with flag)
```

### Confidence Scoring Approach

Based on **VAUQ** (Vision-Aware Uncertainty Quantification, 2026 research) and practical deployment patterns:

| Score Type | How to Compute | Threshold | Action Below Threshold |
|------------|---------------|-----------|------------------------|
| **VLM self-reported confidence** | Ask VLM to include `"confidence": 0.0–1.0` in JSON output | < 0.75 | Retry with reformulated prompt |
| **Visual grounding score** | Use VAUQ's Image-Information Score (IS): compare model entropy with/without visual input | IS < 0.3 | Likely language-prior hallucination; reject |
| **Coordinate consistency** | Run VLM 3× on same image; compute variance of predicted coordinates | σ > 50 px | Prediction is unstable; require human review |
| **Metadata-verification match** | Compare VLM coordinates with DXF metadata search results | Distance > 100 px | VLM and metadata disagree; flag for review |
| **Post-action verification** | After click/selection, take new screenshot and ask VLM "did the action succeed?" | < 0.80 | Rollback + human review |

### Recommended Confidence Thresholds

| Pipeline Stage | Accept Threshold | Review Threshold | Reject Threshold |
|----------------|------------------|-------------------|------------------|
| Annotation parsing | ≥ 0.90 | 0.70–0.89 | < 0.70 |
| Entity disambiguation | ≥ 0.85 | 0.65–0.84 | < 0.65 |
| Coordinate prediction | ≥ 0.80 | 0.60–0.79 | < 0.60 |
| Post-action verification | ≥ 0.90 | 0.75–0.89 | < 0.75 |

---

## 7. Recommended VLM Call Sequence

### Phase Architecture: 3-Phase Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 1: INSTRUCTION EXTRACTION                                │
│  ─────────────────────────────────────────────────────────────  │
│  Input:  PDF page screenshot + annotation crop                  │
│  Model:   Fast/cheap VLM (gemma4:e2b, Qwen2.5-VL-7B)           │
│  Output:  Structured JSON action plan (Section 5 schema)        │
│  Fallback: If confidence < 0.70, flag for human review         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 2: TARGET DISAMBIGUATION                                 │
│  ─────────────────────────────────────────────────────────────  │
│  Input:  Action plan + DXF metadata + QCAD screenshot          │
│  Model:   Strong VLM (kimi-k2.6:cloud, GPT-4o)                  │
│  Logic:   If action_type == "replace_block" or "find_metadata": │
│              → Use ezdxf/DXF search FIRST to get candidates     │
│              → Present candidates to VLM for visual confirmation   │
│           Else (text label, visible entity):                     │
│              → VLM direct visual grounding on screenshot         │
│  Output:  Verified target with coordinates + confidence score     │
│  Fallback: If no match, retry with zoomed crop / full page     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 3: EXECUTION + VERIFICATION                              │
│  ─────────────────────────────────────────────────────────────  │
│  Input:  Verified action + QCAD window                           │
│  Tool:    X11 action injection (click, type, scroll)            │
│  Verify:  Post-action screenshot → VLM "did it work?"           │
│  Output:  Success/failure + before/after screenshots              │
│  Fallback: If verification fails, rollback + queue for human    │
└─────────────────────────────────────────────────────────────────┘
```

### Why This Fixes Task 1

Task 1 would now flow through the pipeline as:

1. **Phase 1**: Parses "Replace NT111 with NT-110" → action_type=`replace_block`, target=`NT111`
2. **Phase 2**: DXF search finds INSERT with name="NT111" at coordinates (x,y). VLM is shown a zoomed screenshot of (x,y) and asked: "Does this region contain the block referenced by the annotation?" The VLM sees geometry and confirms. No need to "find NT111" visually.
3. **Phase 3**: QCAD selects the INSERT at (x,y), replaces block reference with NT-110. Post-action screenshot confirms change.

---

## 8. Gap Analysis — What VLM Capability Is Missing?

| Missing Capability | Available Now? | Workaround |
|-------------------|----------------|------------|
| **Reading invisible metadata from screenshots** (block names, handles, layers) | ❌ No | Use DXF/ezdxf metadata search; don't ask VLM |
| **Precise coordinate prediction on dense CAD screenshots** | ⚠️ Partial (±5–15 px error) | Combine metadata coordinates with VLM confirmation |
| **Understanding engineering drawing conventions without legend** | ⚠️ Partial | Provide explicit instruction types in prompt |
| **Self-evaluation of visual grounding quality** | ✅ Yes (VAUQ, 2026) | Implement IS scoring in pipeline |
| **Structured JSON output with coordinates** | ✅ Yes (OpenAI, vLLM, Ollama) | Use `response_format: json_schema` |
| **Multi-turn reasoning for complex plans** | ✅ Yes (Claude, GPT-4o, Kimi) | Use 3-phase architecture |
| **Local deployment without cloud dependency** | ✅ Yes (gemma4, Qwen2.5-VL, InternVL) | Benchmarked: gemma4:e4b is viable |

### Do We Need Fine-Tuning?

**Probably not for Phase 1 and 2.** Off-the-shelf VLMs handle annotation parsing and visual confirmation well enough for production, especially with:
- Good prompt engineering
- Structured output constraints
- Metadata augmentation

**Possible exception**: If the pipeline needs to recognize domain-specific symbols (P&ID symbols, electrical schematic conventions) that general VLMs miss, a small LoRA fine-tune on ~1,000 labeled CAD screenshots could help. But this is a last resort, not a prerequisite.

---

## 9. Model Recommendations

| Role | Model | Why | Fallback |
|------|-------|-----|----------|
| **Phase 1** (instruction parsing) | gemma4:e4b (local) or Qwen2.5-VL-7B | Fast, cheap, good at OCR | gemma4:e2b |
| **Phase 2** (disambiguation + verification) | kimi-k2.6:cloud or GPT-4o | Best visual reasoning, follows schemas reliably | Qwen2.5-VL-72B |
| **Phase 3** (execution) | N/A — X11 tool use | Deterministic, no model needed | — |
| **Confidence scoring** | Same as Phase 2 model | Ask VLM to self-evaluate | Rule-based heuristics |

### Cost/Latency Estimate (per annotation)

| Phase | Model | Tokens | Latency | Cost |
|-------|-------|--------|---------|------|
| 1 | gemma4:e4b (local) | ~2K | 3–8s | $0 |
| 2 | kimi-k2.6:cloud | ~4K | 8–15s | ~$0.03 |
| 3 | X11 actions | N/A | 5–10s | $0 |
| **Total** | | **~6K** | **16–33s** | **~$0.03** |

---

## 10. Deliverables Summary

| Deliverable | Location in This Document | Key Finding |
|-------------|---------------------------|-------------|
| **Root cause analysis of Task 1 failure** | Section 1 | Block names are metadata, not visually present; VLM cannot ground them from screenshots |
| **Suggested fixes for Task 1** | Sections 1, 7 | Use DXF metadata search to find INSERT by name, then VLM confirms the visual region |
| **Recommended VLM call sequence** | Section 7 | 3-phase: (1) parse annotation → JSON plan, (2) metadata+vision disambiguation, (3) execute+verify |
| **Structured output schema for action plans** | Section 5 | JSON schema with steps, tools, parameters, expected results, fallbacks, confidence |
| **Confidence scoring approach** | Section 6 | Multi-layer: VLM self-report + VAUQ IS score + coordinate consistency + metadata match + post-action verify |
| **Gap analysis** | Section 8 | No fine-tuning needed for current scope; metadata search covers the main gap (invisible block names) |

---

## Appendix A: Prompt Templates

### Phase 1 Prompt (Annotation Parsing)

```
You are a CAD instruction parser. Read the attached PDF annotation and output a structured JSON plan.

Rules:
- action_type must be one of: ["change_text", "replace_block", "move_entity", "delete_entity", "add_text", "unknown"]
- target_name is the entity identifier as written in the annotation
- ambiguity_note: describe anything unclear (e.g., "which entity?", "block name not visible")
- confidence: 0.0–1.0

Output format: <JSON schema from Section 5>
```

### Phase 2 Prompt (Disambiguation with Metadata)

```
You are a CAD entity verifier. The annotation says: "{instruction}".

I found these candidate entities in the drawing data:
- Candidate A: INSERT "NT111" at (120.5, 340.2)
- Candidate B: TEXT "NT111" at (125.0, 345.0)

Attached is a zoomed screenshot of Candidate A's region.
Question: Is Candidate A the correct target for this annotation? Answer yes/no with confidence 0.0–1.0 and explain briefly.

Output JSON: {"correct": true/false, "confidence": float, "reason": "..."}
```

### Phase 3 Prompt (Post-Action Verification)

```
Attached is a before/after screenshot pair of a CAD modification.
The intended change was: "{change_description}".

Did the change succeed? Answer yes/no with confidence 0.0–1.0.
If no, describe what went wrong.

Output JSON: {"success": true/false, "confidence": float, "issue": "..."}
```

---

## Appendix B: References

1. **VAUQ** — Park et al., "Vision-Aware Uncertainty Quantification for LVLM Self-Evaluation," arXiv:2602.21054v2, 2026. Code: https://github.com/deeplearning-wisc/vauq
2. **Claude Computer Use Architecture** — Reverse-engineered architecture analysis, 2026. Screenshot-based feedback loop with tool schema and tiered safety.
3. **Zylos Research** — "Computer Use and GUI Agents in 2026: State of the Art," 2026. Benchmarks: OSWorld human 72.36% vs SOTA agent ~20.58%. Hybrid architectures (vision + accessibility tree + DOM) are the consensus.
4. **GUI-Actor** — NeurIPS 2025. Coordinate-free visual grounding for GUI agents via attention-based action heads.
5. **ODA File Converter** — Open Design Alliance. Free DWG↔DXF converter with better geometry preservation than LibreDWG.
6. **ezdxf** — Python DXF library. Audit + save fixes corrupted LibreDWG DXFs for TrueView compatibility.
7. **QCAD Documentation** — QCAD.org. Blocks are INSERT entities referencing named block definitions; names are not visually rendered.

---

*End of Document*
