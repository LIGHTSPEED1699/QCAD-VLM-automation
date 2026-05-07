# QCAD-VLM Production Architecture v2.0

**Date:** 2026-05-07  
**Status:** Production-Ready Design (synthesized from R1–R4 findings)  
**Hardware Target:** RTX 3060 12GB (Phase 1) → RTX 4070 Ti Super 16GB (Phase 2)

---

## 1. Executive Summary

This architecture synthesizes four research streams into a unified production pipeline for automated DWG/DXF editing based on PDF markup annotations.

**Core Insight from R1–R4:** No single approach is sufficient. The production pipeline must be a **hybrid tiered system** that routes each annotation to the most reliable execution path based on entity type and edit complexity.

| Research Stream | Key Finding | Architecture Impact |
|---|---|---|
| **R1** (GUI Automation Survey) | ezdxf is fastest/reliable; QCAD ECMAScript preserves DWG fidelity; VLM+X11 is ~4% CAD success | Tiered execution: file-level first, GUI last |
| **R2** (CLI Tool Evaluation) | ezdxf handles 295+ entities cleanly; LibreDWG loses 77% LWPOLYLINE; ODA needs xvfb | ezdxf = default editor; QCAD ECMAScript = DWG-native fallback |
| **R3** (VLM Evaluation) | qwen2.5vl:3b fits RTX 3060 (5–7GB); 7B+ models need 16GB+; glm-ocr = #1 OCR accuracy | 2-model VLM stack on current hardware; upgrade path defined |
| **R4** (VLM Architecture) | Block names are metadata invisible to vision; 3-phase pipeline fixes Task 1 failure | Metadata-first routing for blocks; confidence scoring gates execution |

---

## 2. Production Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PDF INPUT (marked-up drawing)                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│  PHASE 0: ROUTER ── Determine execution tier per annotation                 │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Input:   PDF annotation text + annotation type                               │
│  Logic:   Rule-based classifier (no VLM needed for routing)                   │
│  Output:  Tier assignment: T1 / T2 / T3 / T4                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ↓
                    ┌─────────────────┼─────────────────┐
                    ↓                 ↓                 ↓
              ┌─────────┐      ┌─────────┐      ┌─────────┐
              │  TIER 1 │      │  TIER 2 │      │  TIER 3 │
              │ ezdxf   │      │ QCAD    │      │ VLM+X11 │
              │ Python  │      │ ECMAScript│      │ (last   │
              │ DXF edit│      │ headless │      │ resort) │
              └─────────┘      └─────────┘      └─────────┘
                    ↓                 ↓                 ↓
              ┌─────────┐      ┌─────────┐      ┌─────────┐
              │  TIER 4 │      │  TIER 4 │      │  TIER 4 │
              │ Verify  │      │ Verify  │      │ Verify  │
              │ (VLM)   │      │ (VLM)   │      │ (VLM)   │
              └─────────┘      └─────────┘      └─────────┘
                    ↓                 ↓                 ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                      OUTPUT: Modified DWG/DXF + Audit Report                │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Tiered Execution System

### Tier 1: ezdxf Python Pipeline (Default, ~80% of annotations)

**When to use:** Text replacement, color change, layer move, simple block attribute edits on DXF files.

**Pipeline:**
```
PDF annotation → parse instruction → ezdxf.readfile() → modify entity → doc.audit() → saveas()
```

**R2 validation:** Successfully modified TEXT entities in `example_panel_layout.dxf` (295 TEXT, 257 INSERT). `audit()` fixed 1 corruption issue. Re-load verification confirmed changes.

**Performance:** <1s per edit. Zero GUI. Fully deterministic.

**Limitation:** DXF only. For DWG input, requires Tier 3 bridge first.

---

### Tier 2: QCAD ECMAScript Headless (Fallback, ~15% of annotations)

**When to use:** Native DWG edits, complex geometry, blocks with nested entities, dimensions, any case where format fidelity matters.

**Pipeline:**
```
PDF annotation → generate edit.js → qcad -platform offscreen -autostart edit.js input.dwg
```

**R1/R2 validation:** QCAD Pro 3.32.7 installed. `-platform offscreen` works. Full C++ API exposed via JavaScript. No format round-trip loss.

**Performance:** 3–10s startup + edit time. No X11 needed for offscreen mode.

**Cost:** QCAD Pro ~$37 one-time (or use Community Edition for DXF-only).

---

### Tier 3: ODA File Converter Bridge (Preprocessing, ~5% of files)

**When to use:** Input is DWG but edit is simple (text-only). Convert to DXF → ezdxf edit → convert back to DWG.

**Pipeline:**
```
input.dwg → ODAFileConverter (xvfb-run) → temp.dxf → ezdxf edit → temp_modified.dxf → ODAFileConverter → output.dwg
```

**R2 validation:** Best free DWG↔DXF bridge for geometry preservation. Qt6 GUI requires `xvfb-run` (30s timeout issue — needs pre-warmed display or systemd service with persistent Xvfb).

**Limitation:** Conversion only; no editing. Round-trip still risks entity loss for complex objects.

---

### Tier 4: VLM + X11 Automation (Last Resort, <1% of annotations)

**When to use:** No API path exists for the specific edit (e.g., interactive menu-driven operation, custom QCAD plugin behavior).

**Pipeline:**
```
PDF annotation → VLM Phase 1 (instruction parsing) → VLM Phase 2 (metadata+vision disambiguation) → X11 actions → VLM Phase 3 (verification)
```

**R3/R4 validation:** 3-phase architecture fixes Task 1 failure. Block names resolved via DXF metadata search before VLM confirmation. Confidence scoring gates execution.

**Performance:** 16–33s per annotation (3 VLM calls + X11 actions).

**Warning:** GUI-EDA benchmark shows ~4% success on CAD workflows. Use only when all other tiers fail.

---

## 4. VLM Model Stack

### Phase 1 Hardware (RTX 3060 12GB) — Immediate

| Role | Model | VRAM | Why |
|---|---|---|---|
| **Primary VLM** | `qwen2.5vl:3b` (Q4_K_M) | ~5–7GB | Native JSON coordinate output, best 3B vision model for diagrams |
| **OCR Specialist** | `glm-ocr:latest` | ~3–4GB | #1 OmniDocBench (94.62), 0.9B params |
| **Router/Fast parse** | `gemma4:e2b` | ~7–8GB | Quick instruction classification |

**Constraint:** Only one large model + one small model fits simultaneously. `qwen2.5vl:3b` + `glm-ocr` is the optimal pair.

**Expected accuracy:** 75–85% on CAD screenshots (below 90% target).

---

### Phase 2 Hardware (RTX 4070 Ti Super 16GB) — Upgrade Path

| Role | Model | VRAM | Why |
|---|---|---|---|
| **Primary VLM** | `qwen2.5vl:7b` or `qwen3-vl:8b` | ~10–12GB | +10–20% absolute accuracy over 3B |
| **OCR Specialist** | `glm-ocr:latest` | ~3–4GB | Unchanged |

**Cost:** RTX 4070 Ti Super 16GB ≈ $800 USD.  
**Power:** ~285W TDP (vs RTX 3060 170W) — PSU check required.  
**Readiness:** Drop-in PCIe 4.0 replacement; no other hardware changes needed.  
**Expected accuracy:** 85–92% (approaching 90% target).

---

### Phase 3 Hardware (RTX 4090 24GB or dual GPU) — Future

| Role | Model | VRAM | Why |
|---|---|---|---|
| **Primary VLM** | `qwen3-vl:30b` or `gemma4:31b` | ~18–22GB | Best possible local accuracy |

**Expected accuracy:** 90–95%.

---

## 5. 3-Phase VLM Call Sequence (for Tier 4 only)

Per R4 findings, when Tier 4 is invoked:

### Phase 1: Instruction Extraction
- **Input:** PDF annotation crop
- **Model:** `gemma4:e4b` or fast local model
- **Output:** Structured JSON action plan (action_type, target_name, replacement_name, confidence)
- **Threshold:** <0.70 → flag for human review

### Phase 2: Target Disambiguation
- **Input:** Action plan + DXF metadata + QCAD screenshot
- **Logic:**
  - If `action_type == "replace_block"` → ezdxf search INSERT by name FIRST → present candidates to VLM for visual confirmation
  - If `action_type == "change_text"` → VLM direct visual grounding on screenshot
- **Model:** `kimi-k2.6:cloud` (strongest visual reasoning)
- **Output:** Verified target coordinates + confidence score

### Phase 3: Execution + Verification
- **Tool:** X11 action injection
- **Verify:** Post-action screenshot → VLM "did it work?"
- **Threshold:** <0.80 → rollback + human review

---

## 6. Confidence Scoring & Safety Gates

Per R4 VAUQ-inspired multi-layer scoring:

| Layer | Score | Threshold | Action Below Threshold |
|---|---|---|---|
| Annotation parsing | VLM self-reported | <0.70 | Human review |
| Metadata-verification match | Distance VLM vs DXF coords | >100px | Human review |
| Coordinate consistency | 3× run variance | σ>50px | Human review |
| Post-action verification | VLM self-reported | <0.80 | Rollback + human review |

**Human-in-the-loop queue:** Any annotation scoring below threshold on ≥2 layers gets queued for manual review with before/after screenshots and the action plan JSON.

---

## 7. Component Inventory (Updated from v1.0)

| # | Component | File | Role | Tier | Status |
|---|---|---|---|---|---|
| 1 | **Tier Router** | `tier_router.py` | Rule-based classifier: annotation → T1/T2/T3/T4 | All | 🆕 NEW |
| 2 | **PDF Parser** | `pdf_annotation_parser.py` | Extract annotations from PDF | All | ✅ Existing |
| 3 | **ezdxf Editor** | `dxf_editor.py` | Programmatic DXF editing | T1 | ✅ Existing |
| 4 | **QCAD Script Generator** | `qcad_script_generator.py` | Generate ECMAScript from action plan | T2 | 🆕 NEW |
| 5 | **ODA Bridge** | `oda_bridge.py` | DWG↔DXF conversion wrapper with xvfb | T3 | 🆕 NEW |
| 6 | **VLM Phase 1** | `vlm_instruction_parser.py` | Parse annotation → JSON plan | T4 | 🆕 NEW |
| 7 | **VLM Phase 2** | `vlm_disambiguator.py` | Metadata+vision target verification | T4 | 🆕 NEW |
| 8 | **VLM Phase 3** | `vlm_verifier.py` | Post-action screenshot verification | T4 | 🆕 NEW |
| 9 | **X11 Controller** | `x11_controller.py` | Mouse/keyboard automation | T4 | ✅ Existing |
| 10 | **Confidence Scorer** | `confidence_scorer.py` | Multi-layer scoring + gate logic | All | 🆕 NEW |
| 11 | **Human Review Queue** | `review_queue.py` | SQLite queue for below-threshold tasks | All | 🆕 NEW |
| 12 | **Audit Logger** | `audit_logger.py` | Immutable action log for compliance | All | 🆕 NEW |

---

## 8. Implementation Roadmap

### Phase A: Foundation (Week 1–2)
- [ ] Implement `tier_router.py` — rule-based classifier
- [ ] Enhance `dxf_editor.py` with batch annotation processing
- [ ] Write `qcad_script_generator.py` — ECMAScript template engine
- [ ] Test Tier 1 + Tier 2 end-to-end on 10 sample DWGs

### Phase B: VLM Integration (Week 3–4)
- [ ] Implement 3-phase VLM pipeline (T4 only)
- [ ] Add `confidence_scorer.py` with all 4 scoring layers
- [ ] Integrate `glm-ocr` for OCR specialist role
- [ ] Benchmark qwen2.5vl:3b vs gemma4:e4b on 50 CAD screenshots

### Phase C: Production Hardening (Week 5–6)
- [ ] Implement `review_queue.py` with Discord/email notification
- [ ] Add `audit_logger.py` with tamper-evident log
- [ ] Stress test: 100 annotation batch with mixed tiers
- [ ] Document ODA File Converter xvfb pre-warming solution

### Phase D: Hardware Upgrade (Month 2, optional)
- [ ] Install RTX 4070 Ti Super 16GB
- [ ] Migrate to `qwen2.5vl:7b` or `qwen3-vl:8b`
- [ ] Re-benchmark accuracy target: >90%

---

## 9. Key Decisions & Trade-offs

| Decision | Rationale | Trade-off |
|---|---|---|
| ezdxf as default editor | Fastest, most reliable, zero GUI | DXF-only; DWG requires round-trip |
| QCAD ECMAScript as fallback | Native DWG fidelity, no format loss | Requires ECMAScript knowledge, $37 Pro license |
| qwen2.5vl:3b on RTX 3060 | Fits in VRAM, native coordinate output | 75–85% accuracy (below 90% target) |
| Metadata-first for blocks | Block names are invisible to vision | Adds DXF parsing step, but fixes Task 1 |
| 3-phase VLM only for T4 | Most annotations don't need VLM | Simplifies common case, complexifies edge case |
| Confidence scoring gates | Prevents catastrophic edits | Adds ~10–20% latency, requires human review queue |

---

## 10. References

1. **R1 Deliverable:** `research/R1_cad_automation_survey.md` — GUI automation comparative matrix
2. **R2 Deliverable:** `research/R2_dwg_dxf_cli_tools_evaluation.md` — CLI tool evaluation with live test results
3. **R3 Deliverable:** `research/R3_vlm_evaluation_report.md` — VLM model comparison + hardware requirements
4. **R4 Deliverable:** `research/R4_vlm_architecture_design.md` — 3-phase pipeline + confidence scoring + Task 1 root cause
5. **VAUQ** — Park et al., arXiv:2602.21054v2, 2026
6. **GUI-EDA** — IJCAI 2024 benchmark (4% CAD workflow success for VLM agents)

---

*End of Architecture Document v2.0*
