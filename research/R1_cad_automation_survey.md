# CAD GUI Automation Survey — Comparative Matrix & Recommendations

**Task:** R1: Survey state-of-the-art GUI automation for CAD applications  
**Date:** 2026-05-07  
**Deliverable:** comparative matrix + top 3 recommended approaches

---

## 1. Executive Summary

For batch CAD automation on Linux, the landscape splits cleanly into:

- **File-level / API-driven scripting** (fast, deterministic, no GUI)  
- **Visual GUI agents** (slow, probabilistic, requires display server)  
- **Hybrid pipelines** (Python DXF editing + DWG converter round-trip)

The most robust production path is a **Python DXF pipeline** (`ezdxf` + `ODA File Converter`), with **QCAD ECMAScript headless scripting** as the heavyweight fallback for complex DWG-native edits.

---

## 2. Comparative Matrix

| Approach | Reliability | Speed | Cost | Integration Ease | Vendor Lock-in |
|---|---|---|---|---|---|
| **1. Screenshot + VLM + X11** | *Low* (~4% success on CAD per IJCAI-24 / GUI-EDA) | *Very slow* (seconds per action, LLM inference) | *Low* if open-source VLM; high if cloud API | *Poor* — fragile mapping from PDF annotation -> pixel coordinates | *Low* |
| **2. QCAD headless / CLI** | *Medium-High* for conversion; *Low* for editing | *Fast* for conversions | *Low* (GPL Community Edition) | *Good* — shell call `qcad -autostart script.js` | *Low* |
| **3. QCAD ECMAScript API** | *High* — direct geometry API | *Very fast* (native C++) | *Low* (Community Edition free) | *Excellent* — JSON-in, DWG-out via script | *Low* |
| **4a. AutoCAD COM API** | *High* | *Fast* | *Very high* (AutoCAD license required) | *Medium* — Windows-only, Python via `pyautocad` | *Very high* (Autodesk) |
| **4b. ODA File Converter** | *High* for DWG<->DXF; *none* for editing | *Fast* (C++) | *Low* (free download) | *Good* — callable from Python (`ezdxf` addon) | *Medium* (free but proprietary ODA) |
| **4c. LibreCAD console** | *Medium* — DXF only, no DWG editing | *Fast* | *Low* (GPL) | *Medium* — `librecad dxf2pdf` only, no entity edit | *Low* |
| **4d. ezdxf (Python DXF)** | *High* for DXF entity editing | *Fast* (pure Python) | *Low* (MIT) | *Excellent* — native Python, zero external deps for DXF | *Low* |
| **5. Browser-based CAD viewers** | *Low-Medium* for viewing; *very low* for editing | *Fast* rendering | *Mixed* (free viewers; paid APIs) | *Medium* — web component or REST API | *Medium-High* |
| **6. RPA (UiPath, etc.)** | *Low* — image/keystroke heuristics on CAD menus | *Medium* | *High* (UiPath licensing) | *Poor* — no semantic CAD selectors | *Very high* |

---

## 3. Deep-Dive per Approach

### 1. Screenshot + VLM + X11 Action
- **How it works:** Capture screen -> VLM reasons -> output click coordinates / keystrokes -> controller executes.
- **State of art:** Research agents (ScreenAgent, CogAgent, GUI-EDA) show this works for general desktop tasks but fails on precision CAD toolbars. The GUI-EDA benchmark (IJCAI-24) found only ~4% success on CAD workflows vs. much higher rates on Office/Web suites.
- **Why it fails for CAD:** CAD UIs rely on exact coordinate input, entity snapping, and non-standard widget layouts. VLM spatial localization errors compound at pixel-level precision.
- **Verdict:** Not viable for production CAD automation.

### 2. QCAD Headless / CLI Mode
- **Available:** `qcad -autostart script.js` runs without GUI. Command-line tools (`dwg2pdf`, `dwg2svg`) exist for conversion only.
- **Limitation:** There is **no headless CLI for entity-level DWG editing**. You must write an ECMAScript and invoke it via `-autostart` or `-exec`.
- **Verdict:** Useful for conversions, but not a standalone editing solution.

### 3. QCAD ECMAScript Automation API
- **How it works:** QCAD exposes almost its entire C++ API via ECMAScript (JavaScript). You can open drawings, iterate entities, modify attributes, add geometry, and save — all without GUI (`-autostart`).
- **Strengths:** Native DWG/DXF fidelity; no format round-trip loss. Direct access to layers, blocks, dimensions.
- **Weakness:** Learning curve of QCAD API; error messages are C++/JS hybrids.
- **Verdict:** Excellent for complex DWG-native edits where format fidelity matters.

### 4a. AutoCAD COM API (pyautocad)
- **Strengths:** The gold standard for DWG automation. Full programmatic control.
- **Weaknesses:** Requires Windows + licensed AutoCAD. Not AutoCAD LT. COM threading is brittle.
- **Verdict:** Infeasible for a Linux homelab pipeline.

### 4b. ODA File Converter
- **Strengths:** Converts between DWG/DXF versions headlessly (Linux needs `xvfb`). Free.
- **Weaknesses:** Conversion only — no entity editing. Round-trip via DXF can lose complex entities (per your notes: ~22% LINE, ~77% LWPOLYLINE loss).
- **Verdict:** Best used as a bridge in a hybrid pipeline, not a primary editor.

### 4c. LibreCAD Console Tool
- **Strengths:** `librecad dxf2pdf` converts DXF to PDF headlessly. Free.
- **Weaknesses:** No DWG editing. No entity modification API in console mode.
- **Verdict:** Too limited for annotation-driven editing workflows.

### 4d. ezdxf (Python DXF Library)
- **Strengths:** Pure Python, MIT license. Can read, modify, and write DXF entities with full programmatic control. Great for batch operations (color changes, text replacement, layer manipulation). Integrates perfectly with Python pipelines.
- **Weaknesses:** DXF only. Cannot write DWG natively. Complex entities (ACIS solids, certain hatches) may not survive a DWG round-trip.
- **Verdict:** Ideal for text-only or simple-geometry edits in a Python pipeline.

### 5. Browser-Based CAD Viewers
- **Examples:** `mlightcad/cad-viewer` (Vue 3 component, client-side DXF/DWG parsing), `BlinkCAD`.
- **Strengths:** No installation, drag-and-drop viewing.
- **Weaknesses:** Open-source viewers are primarily **viewers**, not editors. Programmatic entity modification APIs are immature or nonexistent. Commercial viewers (CADViewer JS) have REST APIs but require licensing.
- **Verdict:** Not suitable for backend batch editing.

### 6. RPA for Desktop CAD
- **How it works:** UiPath/Blue Prism record mouse clicks and keystrokes.
- **Strengths:** Works with any application without an API.
- **Weaknesses:** Extremely brittle on CAD UIs (toolbar rearrangement, dialog sizing, zoom state). No semantic understanding of CAD entities. High licensing cost.
- **Verdict:** Avoid for CAD. Same fragility as VLM agents, but without the reasoning layer.

---

## 4. Top 3 Recommended Approaches

### 🥇 Primary: ezdxf + ODA File Converter (Python DXF Pipeline)
**Use when:** You need batch, reliable, cost-free automation and your edits are entity-level (text, lines, layers, colors, blocks).

**Pipeline:**
1. PDF annotation -> Python script parses instructions.
2. `ezdxf` reads DXF (or `odafc` converts DWG -> DXF).
3. Python script modifies entities deterministically.
4. `odafc` converts DXF -> DWG if DWG output required.

**Pros:** Zero GUI, zero license cost, fast, reproducible, excellent testability.  
**Cons:** DWG round-trip may drop complex entities. Not suitable for ACIS solids or advanced AutoCAD-specific objects.

---

### 🥈 Fallback: QCAD ECMAScript API (`-autostart`)
**Use when:** You need native DWG fidelity, complex geometric edits, or entity types that ezdxf cannot preserve in round-trip.

**Pipeline:**
1. Generate an ECMAScript (`edit.js`) containing the edit logic.
2. Shell out: `qcad -autostart edit.js`
3. QCAD loads DWG, applies edits, saves.

**Pros:** No format loss. Full native API. Headless (no X11 needed if script is non-interactive).  
**Cons:** QCAD-specific API knowledge required. Error handling is less ergonomic than Python.

---

### 🥉 Last Resort: Screenshot + VLM + X11
**Use when:** No API exists for the specific task, and the operation is a one-off interactive exploration.

**Pipeline:**
1. Launch QCAD in a virtual framebuffer (Xvfb).
2. VLM observes screenshot and decides actions based on natural-language instruction.
3. Controller executes click/keyboard commands.

**Pros:** Works on any GUI application without modification.  
**Cons:** ~4% success rate on CAD workflows (per GUI-EDA). Extremely slow. Brittle.

---

## 5. Decision Flowchart

```
Does your edit involve simple entities (text, lines, layers, blocks)?
  Yes -> Use ezdxf + ODA File Converter (Primary)
  No  -> Does it require complex DWG-native features (ACIS, dimensions, blocks with attributes)?
          Yes -> Use QCAD ECMAScript -autostart (Fallback)
          No  -> Is this a one-off exploratory task?
                  Yes -> Use Screenshot + VLM (Last Resort)
                  No  -> Re-evaluate if CAD is the right tool
```

---

## 6. Key Findings & Notes

- **ezdxf 1.4.3** is already installed on your system and is the lowest-friction starting point.
- **QCAD Community Edition** is available in Ubuntu repos; its ECMAScript API is comprehensive.
- **ODA File Converter** on Linux requires `xvfb` for headless mode and may have Qt6 GUI issues (per your notes).
- **LibreDWG** (`/media/sdddata1/libredwg/`) is an alternative C library for DWG, but its Python bindings require pyenv 3.11.9 and round-trip fidelity is poor.
- The GUI-EDA academic benchmark (2024) is the strongest evidence against relying on VLM agents for CAD workflows.

---

*End of report*
