/**
 * Headless DXF to DWG converter for QCAD Pro - with layer thaw
 * Usage:
 *   qcad-bin -no-gui -platform offscreen -allow-multiple-instances \
 *     -autostart convert_dxf2dwg_thaw.js input.dxf output.dwg
 */
include("scripts/library.js");

function main() {
    var inputFile  = args[args.length - 2];
    var outputFile = args[args.length - 1];

    if (!inputFile || !outputFile || inputFile.indexOf("-") === 0) {
        print("Usage: qcad-bin -autostart convert_dxf2dwg_thaw.js <input.dxf> <output.dwg>");
        qcad.quit(1);
        return;
    }

    if (!new QFileInfo(inputFile).isAbsolute()) {
        inputFile = RSettings.getLaunchPath() + QDir.separator + inputFile;
    }
    if (!new QFileInfo(outputFile).isAbsolute()) {
        outputFile = RSettings.getLaunchPath() + QDir.separator + outputFile;
    }

    print("Converting DXF -> DWG (with layer thaw)");
    print("  from: " + inputFile);
    print("  to  : " + outputFile);

    var storage = new RMemoryStorage();
    var spatialIndex = new RSpatialIndexSimple();
    var doc = new RDocument(storage, spatialIndex);
    var di = new RDocumentInterface(doc);

    print("Importing DXF...");
    var importResult = di.importFile(inputFile);
    if (importResult !== RDocumentInterface.IoErrorNoError) {
        qWarning("ERROR: Cannot import DXF (code " + importResult + ")");
        qcad.quit(1);
        return;
    }
    print("  Imported. Entities: " + doc.queryAllEntities().length);

    // THAW all layers using transaction
    print("Thawing all layers...");
    var layerIds = doc.queryAllLayers();
    print("  Layer count: " + layerIds.length);
    
    var op = new RModifyObjectsOperation();
    for (var i = 0; i < layerIds.length; i++) {
        var layer = doc.queryLayer(layerIds[i]);
        if (layer !== null) {
            var layerName = layer.getName();
            var wasFrozen = layer.isFrozen();
            if (wasFrozen) {
                layer.setFrozen(false);
                op.addObject(layer, false);
                print("    Thawed: " + layerName);
            } else {
                print("    OK: " + layerName);
            }
        }
    }
    di.applyOperation(op);
    print("  Applied thaw operation.");

    print("Exporting DWG...");
    var formats = ["DWG R32 (2018)", "R32 (2018) DWG", "DWG", "R32"];
    var success = false;
    for (var i = 0; i < formats.length; i++) {
        if (di.exportFile(outputFile, formats[i])) {
            print("  Exported with format: " + formats[i]);
            success = true;
            break;
        }
    }

    if (!success) {
        qWarning("ERROR: All DWG export attempts failed.");
        qcad.quit(1);
        return;
    }

    print("SUCCESS: " + outputFile);
    if (typeof(QCoreApplication) !== 'undefined') {
        QCoreApplication.quit(0);
    }
}

if (typeof(including) === 'undefined' || including === false) {
    main();
}
