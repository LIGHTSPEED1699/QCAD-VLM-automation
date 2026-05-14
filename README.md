# QCAD-VLM Automation
Vision-Language Model (VLM) driven automation for QCAD/LibreCAD engineering workflows. Two complementary pipelines: (1) **DXF text-based editing** for batch entity operations (deletion, cloning, resizing, renaming) and (2) **VLM GUI automation** for screenshot-driven control.

## Current Status (2026-05-14)
- **Pair 1** (1.dwg + 1.pdf): 102 deletions (cloud + strikethrough), clean DWG delivered
- **Pair 2** (2.dwg + 2.pdf): 17 deletions (LEFT-BOTTOM cloud relay cluster), clean DWG delivered
- **Pair 3** (3.dwg + 3.pdf): T4/T5/T6 cloned to T7/T8/T9, `3_cloned_v2.dxf` ready for QCAD GUI verification. DXF→DWG conversion blocked by QCAD ODA handle-range bug.

## Pipelines
### Pipeline A — DXF Text-Based Editing (Production Ready)
Fast, zero-dependency text editing of DXF files via group-code patterns. No ezdxf or library parsing needed.

**Core scripts:**
- `dxf_editor.py` — Entity deletion by handle (group code 5), layer color fixes, coordinate transforms
- `pair1_fixed_executor.py` — Orchestrates full Pair N pipeline: PDF annotation extraction → coordinate mapping → entity matching → deletion → layer fix → DWG export
- `coordinate_transformer.py` — PDF→DXF coordinate mapping (swap_xy confirmed for 1224×792 landscape)
- `dwg_markup_pipeline.py` — PDF annotation parser + DXF entity matcher + handle list generation

**ECMAScript helpers:**
- `scripts/qcad_entity_dump.js` — QCAD headless entity dump for debugging
- `scripts/qcad_layer_diagnostic.js` — QCAD layer visibility diagnostic
- `scripts/qcad_viewport_info.js` — QCAD viewport info export

```bash
# Example: delete entities by handle list
python pair1_fixed_executor.py \
  --pdf 1.pdf --dxf 1.dxf \
  --instructions "delete all entities inside the 4 cloud polygons and the strikethrough line" \
  --output 1_FINAL.dwg
```

### Pipeline B — VLM GUI Automation (Experimental)
Screenshot → VLM reasoning → X11 control for hands-free QCAD manipulation.

**Core scripts:**
- `qcad_vlm_agent.py` — Main automation loop
- `x11_controller.py` — Pure Python X11 control
- `ollama_client.py` — Ollama API client (local + cloud)
- `coordinate_cache.py` — Cache discovered coordinates for instant replay

```bash
cd /home/hongbin/.openclaw/workspace/vlm-gui-automation
source venv/bin/activate

# Basic task
python qcad_vlm_agent.py \
  --task "Select the line tool" \
  --model kimi-k2.6:cloud \
  --window-name "QCAD"
```

## Known Issues & Workarounds
| Issue | Cause | Workaround |
|---|---|---|
| QCAD ODA drops cloned entities in DXF→DWG | Handle range collision (reassigns handles >0xFFFF or outside original space) | Use QCAD GUI "Open DXF → Save As DWG" manually; or accept DXF deliverables |
| QCAD ODA strips BLOCK data (revision history) | ODA writer discards BLOCK section | Manual GUI Save As; or edit original DWG directly |
| ezdxf `saveas()` crashes on this DXF | Malformed MATERIALS table | Use text-based `fix_layer_visibility.py` |
| LibreDWG `dxf2dwg` corrupts output | Incompatible with AutoCAD 2018+; destroys HATCH handles | Never use; use QCAD ODA instead |

## File Map
```
├── dxf_editor.py                 # DXF text-based entity editor
├── dwg_markup_pipeline.py        # Full pipeline: PDF → DXF matching
├── pair1_fixed_executor.py       # Pair N orchestrator
├── coordinate_transformer.py     # PDF↔DXF coordinate math
├── dxf_action_pipeline.py        # DXF action dispatcher
├── vlm_cloud_interpreter_v3.py   # VLM instruction parser (latest)
├── vlm_disambiguator.py          # Cloud ambiguity resolver
├── visual_verifier.py            # Overlay generation for human review
├── confidence_scorer.py          # Match confidence scoring
├── audit_logger.py               # Audit trail for all operations
├── e2e_test_runner.py            # End-to-end test harness
├── execute_and_review.py         # Execute + human review loop
├── review_queue.py               # Pending review queue
├── tier_router.py              # Tiered matching strategy router
├── qcad_vlm_agent.py             # VLM GUI automation (Pipeline B)
├── x11_controller.py             # X11 automation
├── ollama_client.py              # Ollama API client
├── coordinate_cache.py           # Coordinate cache
├── scripts/                      # QCAD ECMAScript helpers
│   ├── qcad_entity_dump.js
│   ├── qcad_layer_diagnostic.js
│   └── qcad_viewport_info.js
└── references/                   # Documentation & ECMAScript API reference
```

## Prerequisites
```bash
# Python venv already configured at ./venv/
source venv/bin/activate
# Packages: Pillow, opencv-python-headless, python-xlib, pynput

# External tools
# QCAD Pro 3.32.7 — ~/opt/qcad-3.32.7-pro-linux-qt6-x86_64/
#   CRITICAL: use qcad-bin directly with -platform offscreen
# ODA File Converter — extracted AppImage in QCAD directory
# LibreCAD 2.2.0 — rendering verification
# LibreDWG 0.13.4 — dxf2dwg (NOT RECOMMENDED, corrupts)
```

## Coordinate Mapping (Confirmed)
For 1224×792 landscape PDF → DXF:
- `x_dxf = y_pdf / 72`
- `y_dxf = (1224 - x_pdf) / 72`
This is `swap_xy` with vertical flip. Confirmed across Pairs 1, 2, 3.

## Next Steps
- Resolve QCAD ODA handle bug for Pair 3 DWG export
- Restore title-block revision rows (BLOCK data) in Pair 3
- Build text-based DXF cloning without handle collisions
- Integrate Pipeline A output with OpenClaw `/qcad` command

## Reference
- Original proposal: `/home/hongbin/Documents/openclaw-shared/vlm-gui-automation-proposal.md`
- ECMAScript API: `references/QCAD_ECMAScript_Reference.md`
- X11 docs: https://python-xlib.readthedocs.io/
