/**
 * DWG Entity Export: Extract text entities from DWG for annotation matching.
 * Outputs JSON compatible with dxf_entity_lookup.py format.
 *
 * Usage:
 *   qcad -exec dwg_entity_export.js <input.dwg> <output.json>
 *
 * Works with QCAD Pro 3.32.7+ (Qt6). Uses RSettings.getOriginalArguments()
 * because RSettings.getArguments() returns undefined in Qt6 builds.
 *
 * Entity types extracted: TEXT, MTEXT, INSERT (block ref), DIMENSION.
 * Block references are expanded to include text entities inside blocks.
 */

function main() {
    // Cross-version arg parsing: Pro 3.32.7/Qt6 needs getOriginalArguments()
    var rawArgs = null;
    try {
        if (typeof(RSettings.getArguments) === 'function') {
            rawArgs = RSettings.getArguments();
        }
    } catch(e) {}

    if (!rawArgs || rawArgs.length === 0) {
        try {
            if (typeof(RSettings.getOriginalArguments) === 'function') {
                rawArgs = RSettings.getOriginalArguments();
            }
        } catch(e) {}
    }

    if (!rawArgs || rawArgs.length === 0) {
        print("ERROR: Cannot retrieve command-line arguments");
        qApp.exit(1);
        return;
    }

    // Filter out QCAD flags to find script args
    var args = [];
    for (var i = 0; i < rawArgs.length; i++) {
        var a = String(rawArgs[i]);
        if (a === "-exec" || a === "-allow-multiple-instances") {
            i++; // skip next element too (the script path after -exec)
            continue;
        }
        if (a.endsWith("dwg_entity_export.js")) continue;
        if (a.endsWith("qcad") || a.endsWith("qcad-bin")) continue;
        args.push(a);
    }

    if (args.length < 2) {
        print("Usage: dwg_entity_export.js <input.dwg> <output.json>");
        print("  Raw args count: " + rawArgs.length);
        for (var i = 0; i < rawArgs.length; i++) {
            print("    [" + i + "] " + rawArgs[i]);
        }
        print("  Filtered args count: " + args.length);
        qApp.exit(1);
        return;
    }

    var inputFile = args[0];
    var outputFile = args[1];

    print("Loading DWG: " + inputFile);

    // Create application without GUI
    var app = new RApplication([], false);
    var di = new RDocumentInterface(app.getDocument());

    // Import DWG natively (no DXF conversion)
    if (!di.importFile(inputFile)) {
        print("ERROR: Failed to import " + inputFile);
        qApp.exit(1);
        return;
    }

    print("Import successful. Extracting entities...");

    var doc = di.getDocument();
    var ids = doc.queryAllEntities();
    print("  Modelspace entities: " + ids.length);

    var entities = [];

    // First pass: collect block definitions for later expansion
    var blockDefs = {};
    var blockIds = doc.queryBlockIds();
    for (var b = 0; b < blockIds.length; b++) {
        var bId = blockIds[b];
        var block = doc.queryBlock(bId);
        if (!isNull(block)) {
            var blockName = block.getName();
            var blockEntIds = block.queryEntityIds();
            var blockTexts = [];
            for (var e = 0; e < blockEntIds.length; e++) {
                var be = doc.queryEntity(blockEntIds[e]);
                if (isNull(be)) continue;
                var bed = extractEntityData(be, doc, true);
                if (bed && (bed.entity_type === "TEXT" || bed.entity_type === "MTEXT")) {
                    blockTexts.push(bed);
                }
            }
            if (blockTexts.length > 0) {
                blockDefs[blockName] = blockTexts;
            }
        }
    }

    // Second pass: modelspace entities + block expansion
    for (var i = 0; i < ids.length; i++) {
        var id = ids[i];
        var entity = doc.queryEntity(id);
        if (isNull(entity)) continue;

        var entData = extractEntityData(entity, doc, false);
        if (entData) {
            entities.push(entData);
        }

        // Expand block references
        if (isBlockReferenceEntity(entity)) {
            var blockId = entity.getReferencedBlockId();
            if (!isNull(blockId)) {
                var block = doc.queryBlock(blockId);
                if (!isNull(block)) {
                    var blockName = block.getName();
                    var refPos = entity.getPosition();
                    var refLayerId = entity.getLayerId();
                    var refLayerName = "";
                    if (!isNull(refLayerId)) {
                        var refLayer = doc.queryLayer(refLayerId);
                        if (!isNull(refLayer)) {
                            refLayerName = refLayer.getName();
                        }
                    }

                    if (blockDefs.hasOwnProperty(blockName)) {
                        var blockTexts = blockDefs[blockName];
                        for (var t = 0; t < blockTexts.length; t++) {
                            var bt = blockTexts[t];
                            var shifted = cloneBlockText(bt, refPos, entData.handle, blockName, refLayerName);
                            entities.push(shifted);
                        }
                    }
                }
            }
        }
    }

    // Build JSON output matching dxf_entity_lookup.py format
    var output = {
        dwg_path: inputFile,
        entity_count: entities.length,
        entities: entities
    };

    // Write JSON file
    var file = new QFile(outputFile);
    var flags = makeQIODeviceOpenMode(QIODevice.WriteOnly, QIODevice.Text);
    if (!file.open(flags)) {
        print("ERROR: Cannot open output file " + outputFile);
        qApp.exit(1);
        return;
    }

    var ts = new QTextStream(file);
    setUtf8Codec(ts);
    ts.writeString(JSON.stringify(output, null, 2));
    file.close();

    print("Exported " + entities.length + " searchable entities to " + outputFile);
    qApp.exit(0);
}

/**
 * Extract entity data into a plain JS object.
 * If isBlockInternal=true, layer name lookup is skipped (will be overridden by caller).
 */
function extractEntityData(entity, doc, isBlockInternal) {
    var layerName = "";
    if (!isBlockInternal) {
        var layerId = entity.getLayerId();
        if (!isNull(layerId)) {
            var layer = doc.queryLayer(layerId);
            if (!isNull(layer)) {
                layerName = layer.getName();
            }
        }
    }

    var handle = String(entity.getId());
    var type = entity.getType();

    // TEXT entity (RS::EntityText)
    if (isTextEntity(entity)) {
        var pos = entity.getPosition();
        return {
            handle: handle,
            entity_type: "TEXT",
            text: cleanText(entity.getText()),
            insertion_point: [pos.x, pos.y],
            layer: layerName,
            text_height: entity.getHeight(),
            rotation: entity.getAngle(),
            block_name: null,
            attachment_point: null,
            dimension_type: null,
            source_block: null
        };
    }

    // MTEXT entity (RS::EntityMText)
    if (isMTextEntity(entity)) {
        var mpos = entity.getAlignmentPoint();
        if (isNull(mpos)) {
            mpos = entity.getPosition();
        }
        return {
            handle: handle,
            entity_type: "MTEXT",
            text: cleanText(entity.getText()),
            insertion_point: [mpos.x, mpos.y],
            layer: layerName,
            text_height: entity.getTextHeight(),
            rotation: null,
            block_name: null,
            attachment_point: entity.getAttachmentPoint(),
            dimension_type: null,
            source_block: null
        };
    }

    // DIMENSION entity
    if (isDimensionEntity(entity)) {
        var dpos = entity.getTextPosition();
        var dimText = entity.getText();
        if (dimText === "<>") dimText = "[DIM]";
        return {
            handle: handle,
            entity_type: "DIMENSION",
            text: cleanText(dimText),
            insertion_point: [dpos.x, dpos.y],
            layer: layerName,
            text_height: null,
            rotation: null,
            block_name: null,
            attachment_point: null,
            dimension_type: entity.getDimensionType(),
            source_block: null
        };
    }

    // BLOCK REFERENCE (INSERT)
    if (isBlockReferenceEntity(entity)) {
        var bpos = entity.getPosition();
        var blockId = entity.getReferencedBlockId();
        var blockName = "";
        if (!isNull(blockId)) {
            var block = doc.queryBlock(blockId);
            if (!isNull(block)) {
                blockName = block.getName();
            }
        }
        return {
            handle: handle,
            entity_type: "INSERT",
            text: "[BLOCK: " + blockName + "]",
            insertion_point: [bpos.x, bpos.y],
            layer: layerName,
            text_height: null,
            rotation: null,
            block_name: blockName,
            attachment_point: null,
            dimension_type: null,
            source_block: null
        };
    }

    return null;
}

/** Clone a block-internal text entity with shifted coordinates. */
function cloneBlockText(bt, refPos, parentHandle, blockName, refLayerName) {
    var shiftedPos = [
        refPos.x + bt.insertion_point[0],
        refPos.y + bt.insertion_point[1]
    ];
    return {
        handle: parentHandle + "#" + bt.handle,
        entity_type: bt.entity_type,
        text: bt.text,
        insertion_point: shiftedPos,
        layer: refLayerName || bt.layer,
        text_height: bt.text_height,
        rotation: bt.rotation,
        block_name: blockName,
        attachment_point: bt.attachment_point,
        dimension_type: bt.dimension_type,
        source_block: blockName
    };
}

/** Remove MTEXT formatting codes (\P, \H, etc.). */
function cleanText(raw) {
    if (isNull(raw) || raw === "") return "";
    var t = raw;
    t = t.replace(/\\[Hh]\d+(?:\.\d+)?[;\s]/g, "");
    t = t.replace(/\\[Pp]/g, " ");
    t = t.replace(/\\[LlOoKkQqWw]\d+;?/g, "");
    t = t.replace(/\\[Ff]\w+;?/g, "");
    t = t.replace(/\\[Ss]\d+x\d+;?/g, "");
    t = t.replace(/\\~/g, " ");
    t = t.replace(/\\[Ll]/g, "");
    return t.trim();
}

main();
