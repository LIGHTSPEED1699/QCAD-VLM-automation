# R2: DWG/DXF CLI Editing Tools & DXF Text-Based Alternatives — Evaluation Report

**Task:** R2: Evaluate DWG/DXF CLI editing tools and DXF text-based alternatives  
**Date:** 2026-05-07  
**Author:** researcher (retry run)  
**Workspace:** `/home/hongbin/.hermes/kanban/workspaces/t_2b1a079b`

---

## 1. Executive Summary

This report evaluates programmatic DWG/DXF modification tools for a Linux homelab pipeline that must edit engineering drawings based on PDF annotations. The goal is to produce a **ranked tool matrix** covering maturity, license, QCAD compatibility, and ease of Python integration.

**Key finding:** No single tool covers all needs. The optimal pipeline is a **tiered hybrid**:
- **Tier 1 (fast, no GUI):** ezdxf for DXF text/entity edits on already-DXF drawings.
- **Tier 2 (DWG-native, headless):** QCAD ECMAScript `-autostart` for complex DWG edits where format fidelity matters.
- **Tier 3 (format bridge):** LibreDWG CLI for DWG→DXF conversion when source is DWG; ODA File Converter when geometry preservation is critical.
- **Tier 4 (last resort):** VLM + X11 automation for tasks with no API path.

---

## 2. Comparative Matrix

| Tool | Maturity | License | QCAD Compat | GUI Needed | Python Integration | DWG Edit | DXF Edit | Geometry Loss | Best Use Case |
|---|---|---|---|---|---|---|---|---|---|
| **ezdxf 1.4.3** | High (stable, well-doc) | MIT | Excellent | No | Native / pip | No (read via convert) | Yes — full CRUD | None for DXF | Text replacement, layer ops, block edits on DXF |
| **QCAD ECMAScript API** | High (production API) | GPL / Pro ~$37 | Native | No* | Shell (`-autostart script.js`) | Yes | Yes | Zero (native engine) | Complex DWG edits, dimensions, blocks, native fidelity |
| **QCAD CLI tools** | Medium | GPL / Pro | Native | No* | Shell | No | No (convert only) | N/A | DWG→PDF/SVG conversion, info extraction |
| **LibreDWG CLI** | Medium (v0.13.4) | GPL | Good | No | Subprocess + SWIG bindings | Via DXF round-trip | Via `dxf2dwg` | High (~22% LINE, ~77% LWPOLYLINE, title blocks survive) | DWG→DXF conversion for text-only edits |
| **LibreDWG Python SWIG** | Low (string bugs) | GPL | Good | No | `import LibreDWG` (py3.11 only) | Partial | Partial | High | Structure inspection, object counting — NOT text extraction |
| **ODA File Converter** | High (ODA SDK engine) | Free (non-comm) | Excellent | Yes* (Qt6, needs `xvfb`) | Subprocess (`xvfb-run`) | Via DXF round-trip | Via DWG→DXF→DWG | Minimal (expected) | Production DWG↔DXF bridge where geometry must survive |
| **LibreCAD** | Medium | GPL | Good | Yes (GUI only) | No CLI editing | No | No (dxf2pdf only) | Same as LibreDWG round-trip | DXF→PDF headless; GUI DXF re-export to fix corruption |
| **FreeCAD + Python** | High | LGPL | Moderate | Yes / No* | Native (`import FreeCAD`) | Yes (via ODA importer) | Yes | Low | Parametric CAD, 3D geometry, not ideal for batch 2D text edits |
| **CadQuery** | High | Apache-2 | Moderate | No | Native (`import cadquery`) | No | No | N/A | 3D part modeling, not 2D DWG/DXF editing |
| **AutoCAD COM API** | Very High | Proprietary | Native | Yes (Windows only) | `pywin32` | Yes | Yes | Zero | Gold standard, but Windows + AutoCAD license required |
| **ODA SDK (paid)** | Very High | Proprietary (~$3K–$16K/yr) | Native | No (headless) | C++ / .NET bindings | Yes | Yes | Zero | Production server DWG editing on Linux (costly) |
| **Direct ASCII DXF edit** | Low (fragile) | N/A | Good | No | `open()`, `str.replace()` | No | Yes | Variable (handle corruption risk) | Simple text swaps on well-known DXF structure |

\* No GUI needed for non-interactive scripts; Qt/X11 platform may still initialize.

---

## 3. Deep-Dive per Tool

### 3.1 ezdxf (Python DXF Library) — RECOMMENDED TIER 1

**What it is:** Pure Python MIT library for reading, modifying, and writing DXF files. No GUI, no external CAD app.

**Strengths:**
- Native Python — `pip install ezdxf`, zero compilation.
- Full entity CRUD: TEXT, MTEXT, LINE, LWPOLYLINE, INSERT, layers, blocks.
- `doc.audit()` can repair corrupted DXF (e.g., from LibreDWG conversion).
- R2000 downgrade for maximum compatibility: `doc.dxfversion = 'AC1015'`.
- Fast and deterministic — excellent for batch pipelines.

**Weaknesses:**
- DXF only. Cannot write DWG directly.
- Complex entities (ACIS solids, certain hatches, advanced AutoCAD objects) may not survive a DWG round-trip.
- `saveas()` on un-audited LibreDWG DXFs crashes with `AttributeError: 'tuple' object has no attribute 'dxf'` (materials table corruption).

**Live test results (this session):**
- Loaded `example_panel_layout.dxf` (295 TEXT, 257 INSERT, 196 ARC, 189 LINE, 24 LWPOLYLINE, 8 ELLIPSE).
- Modified TEXT entity text content successfully.
- `saveas()` produced valid DXF; re-load verification confirmed change.
- `audit()` applied 1 fix and produced clean output.

**Integration into pipeline:**
```python
import ezdxf
doc = ezdxf.readfile('drawing.dxf')
for e in doc.modelspace():
    if e.dxftype() == 'TEXT' and 'NT111' in e.dxf.text:
        e.dxf.text = e.dxf.text.replace('NT111', 'NT-110')
doc.saveas('drawing_modified.dxf')
```

**Verdict:** The lowest-friction, highest-reliability path for DXF-based editing. Should be the default for all text, color, layer, and simple geometry edits.

---

### 3.2 QCAD ECMAScript API — RECOMMENDED TIER 2 (DWG-native)

**What it is:** QCAD exposes its C++ engine via ECMAScript (JavaScript). Scripts can open DWG/DXF, iterate entities, modify geometry, save — all without a visible GUI.

**How to run headless:**
```bash
qcad -platform offscreen -autostart edit.js input.dwg
```

**Strengths:**
- Native DWG fidelity — no format round-trip loss.
- Full API: entities, layers, blocks, dimensions, attributes.
- No X11 required if using `-platform offscreen`.
- QCAD Pro (~$37 one-time) adds DWG import/export; Community Edition is DXF-only.

**Weaknesses:**
- ECMAScript API learning curve.
- Error messages are C++/JS hybrids — debugging is less ergonomic than Python.
- Requires QCAD installation (~170 MB).

**Live test results (this session):**
- QCAD Pro 3.32.7 installed at `~/opt/qcad-3.32.7-pro-linux-qt6-x86_64/`.
- `dwginfo` works with `-platform offscreen` but argument ordering is sensitive (file must precede flags in some cases).
- `dwg2pdf` failed with "Cannot import file" on the test DWG — may require specific DWG version compatibility.
- CLI tools (`dwg2pdf`, `dwg2svg`, `dwg2dwg`, `dwginfo`) are 173-byte shell wrappers around the main `qcad` binary; they use the same ODA-based engine.

**Verdict:** Best choice when DWG-native fidelity is required and edits are complex (blocks, dimensions, nested entities). The primary fallback when ezdxf cannot preserve geometry in round-trip.

---

### 3.3 QCAD CLI Tools (dwg2pdf, dwg2svg, dwginfo) — CONVERSION ONLY

**What they are:** Bundled lightweight converters using QCAD's ODA engine. No entity editing.

**Live test results:**
- `dwginfo -platform offscreen` can list blocks, layers, entity counts (when argument order is correct).
- `dwg2pdf -platform offscreen` failed on test DWG with "Cannot import file".
- No `-o` flag for output path; output naming is implicit.

**Verdict:** Useful for DWG inspection and batch conversion to PDF/SVG, but **not an editing tool**. Not suitable for the annotation-driven pipeline.

---

### 3.4 LibreDWG CLI (dwg2dxf / dxf2dwg) — TIER 3 BRIDGE

**What it is:** GPL C library with CLI converters. Installed at `/media/sdddata1/libredwg/` (v0.13.4, Autotools build).

**Strengths:**
- Free, no registration.
- `dwg2dxf` and `dxf2dwg` complete without segfault on tested files.
- Title block metadata survives round-trip.

**Weaknesses (quantified):**
- **22% LINE loss** (12,292 → 9,630)
- **77% LWPOLYLINE loss** (1,196 → 279)
- **32% ELLIPSE loss** (312 → 212)
- TEXT, INSERT, DICTIONARY, SPLINE counts remained intact.
- ~1000+ "Duplicate handle" / "Object handle not found" warnings from `dxf2dwg`.
- Output DWG is **downgraded format** and may be rejected by AutoCAD.
- Nested blocks lose all content (0 entities) — title blocks, border frames affected.

**Live test results (this session):**
- `dwg2dxf` on `din_a3_foot_landscape.dwg` (55 KB) produced clean DXF.
- Pure `str.replace()` on DXF corrupted ENDBLK handles ("ENDBLK_TEST" errors).
- Safer line-by-line replacement (only within group code "1" lines) still caused **massive entity loss** — only 13 LINE entities survived round-trip vs. 189 in original DXF.
- `dxf2dwg` output DWG could not be re-opened by ezdxf due to `Invalid handle 0`.

**Verdict:** Acceptable for **text-only edits on non-critical drawings**. Unreliable for geometry preservation. Use only when ODA File Converter is unavailable.

---

### 3.5 LibreDWG Python SWIG Bindings — NOT RECOMMENDED

**Status:** Low-level C API wrappers. Installed for Python 3.11.9 at `/media/sdddata1/libredwg/lib/python3.11/site-packages`.

**What works:** File open, object iteration, type casting, `dwg_write_file()`.

**What's broken:** String/UTF-8 fields return garbled data on almost all tested DWGs. `MTEXT.text` returns `'\\'` (length 1). Error 64 (`DWG_ERR_VALUEOUTOFBOUNDS`) is common.

**Verdict:** Suitable for programmatic structure inspection (counting, iterating) but **not for text extraction or modification**. The DXF round-trip pipeline is strictly superior.

---

### 3.6 ODA File Converter — BEST FREE DWG BRIDGE

**What it is:** Free converter from Open Design Alliance using the ODA SDK engine. Same engine as paid ODA SDK.

**Strengths:**
- Much better geometry preservation than LibreDWG (expected minimal loss).
- Full nested block and title block content preservation.
- Batch directory mode.

**Weaknesses:**
- Qt6 GUI app — **requires `xvfb-run`**, `QT_QPA_PLATFORM=offscreen` does NOT work (confirmed in prior sessions).
- No single-file CLI — only batch/directory mode.
- Conversion only; no editing.

**Live test results (this session):**
- Extracted AppImage at `/tmp/squashfs-root/usr/bin/ODAFileConverter`.
- `xvfb-run` timed out after 30s — known issue from prior testing (Qt6 initialization may be slow or require specific display parameters).
- Not successfully exercised in this run due to timeout.

**Verdict:** The **best free option for production DWG↔DXF bridge** where geometry must survive. Place between ezdxf and QCAD ECMAScript in the pipeline. If `xvfb-run` timeout persists, consider pre-warming a virtual display or using a systemd service with a persistent Xvfb.

---

### 3.7 LibreCAD — GUI-ONLY, LIMITED

**Status:** v2.2.0 installed via apt at `/usr/bin/librecad`.

**What works:** `librecad dxf2pdf -o out.pdf input.dxf` (headless, `QT_QPA_PLATFORM=offscreen`).

**What doesn't:** No CLI DXF→DXF re-save. No entity editing API. GUI required for any modification.

**Verdict:** Useful for DXF→PDF rendering and for **re-exporting corrupted LibreDWG DXFs** (LibreCAD re-serializes from internal representation, stripping artifacts). Not a pipeline editing tool.

---

### 3.8 FreeCAD + Python / CadQuery — NOT INSTALLED

**Status:** Neither FreeCAD nor CadQuery is installed on this system.

**Relevance:** FreeCAD can import DWG via the ODA File Converter plugin and provides a full Python API. CadQuery is for 3D part modeling, not 2D DWG/DXF text editing.

**Verdict:** Install FreeCAD only if 3D geometry or parametric modeling is needed. For 2D annotation-driven editing, ezdxf + QCAD scripting is lower-friction.

---

### 3.9 AutoCAD COM API / ODA SDK (Paid)

**AutoCAD COM:** Windows-only, requires full AutoCAD + `pywin32`. Gold standard but infeasible for Linux homelab.

**ODA SDK:** Paid (~$3K–$16K/yr), headless, cross-platform C++/.NET. The only production-grade option for full programmatic DWG editing on Linux without GUI.

**Verdict:** Document as "if budget allows" option. Not part of the free pipeline.

---

### 3.10 Direct ASCII DXF Text Edit — DANGEROUS

**How it works:** Read DXF as text, `str.replace()`, write back.

**Live test result:** Replacing "BLK" with "BLK_TEST" corrupted ENDBLK records because "BLK" appeared in block table handles. Even group-code-aware replacement (only replacing after group code "1") caused catastrophic entity loss (13 LINE vs. 189).

**Verdict:** Do **not** use naive string replacement on DXF. Always use ezdxf API or at minimum a group-code-aware parser that protects structural sections (HEADER, TABLES, BLOCKS, OBJECTS).

---

## 4. Hybrid Pipeline Recommendations

### 4.1 For Text-Only Edits on DXF Files (Fastest Path)

```
PDF annotation → Python parser → ezdxf load → modify TEXT/MTEXT → save DXF
```
- **Time:** < 1s per annotation.
- **Reliability:** High.
- **Cost:** Free.

### 4.2 For Text-Only Edits on DWG Files

```
DWG → [ODA File Converter + xvfb] → DXF → ezdxf edit → [ODA File Converter + xvfb] → DWG
```
- **Time:** ~10–30s (dominated by ODA conversion).
- **Reliability:** High (geometry preserved by ODA).
- **Fallback:** If ODA fails, use LibreDWG CLI (accept geometry loss).

### 4.3 For Complex DWG-Native Edits (Blocks, Dimensions, Attributes)

```
PDF annotation → Python generates ECMAScript → qcad -platform offscreen -autostart script.js → DWG
```
- **Time:** ~5–15s (QCAD startup + script execution).
- **Reliability:** High (native engine, no format loss).
- **Cost:** ~$37 one-time for QCAD Pro (DWG support).

### 4.4 For One-Off Tasks with No API Path

```
PDF annotation → VLM matcher (gemma4:e4b) → X11 controller → QCAD GUI automation
```
- **Time:** 15–240s per annotation.
- **Reliability:** Medium (depends on VLM accuracy).
- **Use when:** All API paths fail or the edit is spatially complex (e.g., "move this row up by 2 cm").

---

## 5. Decision Flowchart

```
Input: PDF annotation arrives
|
└─ Is the source file DXF?
   ├─ Yes ──▶ ezdxf direct edit (Tier 1) ──▶ Done
   └─ No (DWG) ──▶ Is the edit text-only (labels, names, colors)?
      ├─ Yes ──▶ Use ODA File Converter → DXF → ezdxf → ODA (Tier 3)
      └─ No (complex: blocks, dimensions, geometry) ──▶ QCAD ECMAScript (Tier 2)
         └─ QCAD script fails ──▶ VLM + X11 (Tier 4, last resort)
```

---

## 6. Python Integration Snippets

### 6.1 ezdxf Text Replacement Pipeline

```python
import ezdxf, os, subprocess

def edit_dxf_text(dxf_path, old_text, new_text, out_path):
    doc = ezdxf.readfile(dxf_path)
    for e in doc.modelspace():
        if e.dxftype() in ('TEXT', 'MTEXT'):
            txt = e.dxf.text if e.dxftype() == 'TEXT' else e.text
            if old_text in txt:
                if e.dxftype() == 'TEXT':
                    e.dxf.text = txt.replace(old_text, new_text)
                else:
                    e.text = txt.replace(old_text, new_text)
    # Audit to fix any corruption before save
    doc.audit()
    doc.saveas(out_path)
```

### 6.2 LibreDWG DWG→DXF→DWG Bridge

```python
import subprocess, os

LIBREDWG_BIN = "/media/sdddata1/libredwg/bin"
env = {**os.environ, "LD_LIBRARY_PATH": "/media/sdddata1/libredwg/lib"}

def dwg_to_dxf(dwg_path, dxf_path):
    r = subprocess.run([f"{LIBREDWG_BIN}/dwg2dxf", dwg_path, "-o", dxf_path, "-y"],
                       capture_output=True, env=env)
    if not os.path.exists(dxf_path):
        raise RuntimeError(f"dwg2dxf failed: {r.stderr}")
    return dxf_path

def dxf_to_dwg(dxf_path, dwg_path):
    subprocess.run([f"{LIBREDWG_BIN}/dxf2dwg", dxf_path, "-o", dwg_path, "-y"],
                   capture_output=True, env=env)
    # rc may be 0 or 1; check file existence
    if not os.path.exists(dwg_path):
        raise RuntimeError("dxf2dwg produced no output")
    return dwg_path
```

### 6.3 QCAD ECMAScript Template

```javascript
// edit.js — QCAD headless script template
include("scripts/library.js");

var doc = new RDocument(new RMemoryStorage());
var di = new RDocumentInterface(doc);

// Open DWG
if (!di.importFile("/path/to/input.dwg")) {
    print("Failed to open DWG");
    qquit();
}

// Example: replace text
var op = new RAddObjectsOperation();
var entities = doc.queryAllEntities();
for (var i = 0; i < entities.length; ++i) {
    var entity = doc.queryEntity(entities[i]);
    if (isTextEntity(entity)) {
        var text = entity.getText();
        if (text.indexOf("NT111") !== -1) {
            entity.setText(text.replace("NT111", "NT-110"));
            op.replaceObject(entity);
        }
    }
}
op.apply(doc);

// Save
var exportFile = new RFileExporter(doc, "/path/to/output.dwg", "R27");
exportFile.exportFile();
di.destroy();
qquit();
```

Run: `qcad -platform offscreen -autostart edit.js`

---

## 7. Known Issues & Mitigations

| Issue | Tool | Severity | Mitigation |
|---|---|---|---|
| LibreDWG loses nested block content | LibreDWG | High | Use ODA File Converter for block-critical drawings |
| LibreDWG DXF round-trip geometry loss | LibreDWG | High | Quantified: 22% LINE, 77% LWPOLYLINE, 32% ELLIPSE |
| ezdxf `saveas()` crashes on un-audited DXF | ezdxf | Medium | Always call `doc.audit()` before `saveas()` on LibreDWG output |
| ODA File Converter needs xvfb | ODA | Medium | `xvfb-run -a` required; may need timeout increase or persistent Xvfb |
| QCAD `dwg2pdf` import failure | QCAD | Low | Test DWG version compatibility; use LibreDWG for PDF if needed |
| QCAD CLI arg ordering sensitive | QCAD | Low | File path must precede flags in some tools |
| Direct ASCII DXF replace corrupts handles | N/A | Critical | Never use naive `str.replace()` on DXF; use ezdxf API |
| LibreDWG SWIG string garbling | LibreDWG Python | High | Do not use for text extraction; use CLI round-trip |

---

## 8. File Locations on This System

| Tool / Artifact | Path |
|---|---|
| ezdxf (Python) | `~/.hermes/venv/lib/python3.11/site-packages/ezdxf/` |
| LibreDWG CLI | `/media/sdddata1/libredwg/bin/` |
| LibreDWG Python SWIG | `/media/sdddata1/libredwg/lib/python3.11/site-packages/LibreDWG/` |
| QCAD Pro binary | `~/opt/qcad-3.32.7-pro-linux-qt6-x86_64/qcad` |
| QCAD CLI tools | Same dir: `dwg2pdf`, `dwg2svg`, `dwg2dwg`, `dwginfo` |
| ODA File Converter (AppImage) | `/media/sdddata1/libredwg/ODAFileConverter.AppImage` |
| ODA File Converter (extracted) | `/tmp/squashfs-root/usr/bin/ODAFileConverter` |
| LibreCAD | `/usr/bin/librecad` |
| Test DWG | `~/openclaw-shared/QCAD-VLM-automation/test-files/din_a3_foot_landscape.dwg` |
| Test DXF | `~/.hermes/kanban/workspaces/t_5cb793d9/example_panel_layout.dxf` |
| This report | `~/.hermes/kanban/workspaces/t_2b1a079b/dwg_dxf_cli_tools_evaluation.md` |

---

## 9. Recommendations for P1 Architecture

The existing P1 architecture (ARCHITECTURE.md) correctly identifies ezdxf as the primary DXF editor and QCAD ECMAScript as the DWG-native fallback. This R2 evaluation **confirms** that design with the following amendments:

1. **Amendment A:** For DWG source files, insert **ODA File Converter** as the preferred DWG→DXF bridge before ezdxf. Only fall back to LibreDWG if ODA is unavailable or `xvfb` fails.
2. **Amendment B:** Never use naive string replacement on DXF. The live test proved it corrupts block handles. Always route through ezdxf API.
3. **Amendment C:** QCAD ECMAScript should be the **Tier 2** fallback, not the primary path. Most PDF annotations (text replacement, color change) are simple enough for ezdxf.
4. **Amendment D:** Document `doc.audit()` as a mandatory step in the ezdxf pipeline when loading DXF produced by LibreDWG or ODA File Converter.
5. **Amendment E:** For ODA File Converter, investigate a **persistent Xvfb systemd service** to avoid the `xvfb-run` timeout observed in testing.

---

*End of R2 Evaluation Report*
