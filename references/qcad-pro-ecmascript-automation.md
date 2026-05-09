# QCAD Pro ECMAScript Automation Reference

## Headless QCAD Pro Execution

Use the **Pro** binary (`qcad-bin`), not the trial GUI wrapper. Always set LD_LIBRARY_PATH:

```bash
export QCAD_HOME="/home/hongbin/opt/qcad-3.32.7-pro-linux-qt6-x86_64"
export LD_LIBRARY_PATH="$QCAD_HOME:$QCAD_HOME/plugins"

$QCAD_HOME/qcad-bin -no-gui -platform offscreen -allow-multiple-instances \
  -autostart script.js input.dxf output.dwg
```

**Why `-platform offscreen`:** Prevents Qt display connection errors on headless systems.
**Why `-allow-multiple-instances`:** Allows parallel/concurrent runs.

## DXF → DWG Conversion (Clean ODA Engine)

Use `qcad_dxf2dwg.js` in this repo. It:
1. Imports DXF via QCAD's ODA reader
2. Exports DWG via QCAD's ODA writer (R32/2018 format)
3. Produces AutoCAD-compatible files without LibreDWG corruption

```bash
qcad-bin -no-gui -platform offscreen -allow-multiple-instances \
  -autostart scripts/qcad_dxf2dwg.js input.dxf output.dwg
```

**Do NOT use LibreDWG `dxf2dwg`** for production files targeting AutoCAD — it produces 34+ errors and object loss.

## Layer Visibility Fix (Pre-Conversion)

If DXF layers are hidden (only XY axis visible in QCAD/AutoCAD), check:

1. **Freeze bit** (group code 70 bit 1): frozen layers don't display
2. **OFF state** (group code 62 negative): `62 = -7` means "color 7, layer OFF"

The freeze bit and OFF state are **independent**. Use the appropriate fix:

| Problem | Check | Fix |
|---------|-------|-----|
| Frozen | `flags & 1 == 1` | `convert_dxf2dwg_thaw.js` (thaw via QCAD API) |
| OFF | `color < 0` | `fix_layer_visibility.py` (strip negative sign) |

Run `fix_layer_visibility.py` **before** conversion if AutoCAD/QCAD show blank canvas with all layers present:

```bash
python3 scripts/fix_layer_visibility.py input.dxf fixed.dxf
```

## ECMAScript Layer Thaw Pattern

For programmatic thawing (freeze bit), use `RModifyObjectsOperation`:

```js
var op = new RModifyObjectsOperation();
var layerIds = doc.queryAllLayers();
for (var i = 0; i < layerIds.length; i++) {
    var layer = doc.queryLayer(layerIds[i]);
    if (layer !== null && layer.isFrozen()) {
        layer.setFrozen(false);
        op.addObject(layer, false);  // false = modify, not add new
    }
}
di.applyOperation(op);
```

**Pitfall:** Direct property assignment (`layer.frozen = false`) does **not** work — must use transaction-based `RModifyObjectsOperation`.

## Known Issues & Workarounds

| Issue | Cause | Workaround |
|-------|-------|------------|
| AutoCAD Recovers with "34 errors / 36 objects removed" | LibreDWG `dxf2dwg` writer corruption | Use QCAD Pro ODA engine instead |
| Blank canvas, layers present | All layer colors negative (OFF state) | Run `fix_layer_visibility.py` |
| Blank canvas after thaw | Still frozen or OFF | Check both freeze bit AND color sign |
| QCAD script fails to load `libqcadcore.so` | Wrong binary or missing LD_LIBRARY_PATH | Use `qcad-bin` with `LD_LIBRARY_PATH` set |

## Pipeline Summary (Recommended)

```
1. Edit DXF (text replacement, etc.)
2. python3 scripts/fix_layer_visibility.py edited.dxf fixed.dxf
3. qcad-bin -autostart scripts/qcad_dxf2dwg.js fixed.dxf output.dwg
4. Verify in AutoCAD TrueView — should open clean, all visible
```

## Files in This Repo

- `scripts/fix_layer_visibility.py` — DXF layer OFF-state fixer
- `scripts/qcad_dxf2dwg.js` — headless DXF→DWG via ODA engine
- `scripts/convert_dxf2dwg_thaw.js` — DXF→DWG with layer thaw (freeze bit fix)
