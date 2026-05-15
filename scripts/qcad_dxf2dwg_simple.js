
include("scripts/library.js");

function main() {
    var inputFile  = args[args.length - 2];
    var outputFile = args[args.length - 1];

    if (!inputFile || !outputFile || inputFile.indexOf("-") === 0) {
        print("Usage: qcad-bin -autostart script.js <input.dxf> <output.dwg>");
        qcad.quit(1);
        return;
    }

    if (!new QFileInfo(inputFile).isAbsolute()) {
        inputFile = RSettings.getLaunchPath() + QDir.separator + inputFile;
    }
    if (!new QFileInfo(outputFile).isAbsolute()) {
        outputFile = RSettings.getLaunchPath() + QDir.separator + outputFile;
    }

    print("Converting: " + inputFile + " -> " + outputFile);

    var storage = new RMemoryStorage();
    var spatialIndex = new RSpatialIndexSimple();
    var doc = new RDocument(storage, spatialIndex);
    var di = new RDocumentInterface(doc);

    var rc = di.importFile(inputFile);
    if (rc !== RDocumentInterface.IoErrorNoError) {
        qWarning("Import failed: code=" + rc);
        qcad.quit(1);
        return;
    }

    // Force all layers ON and THAWED
    var layerIds = doc.queryAllLayers();
    var op = new RModifyObjectsOperation();
    var fixedCount = 0;

    for (var i = 0; i < layerIds.length; i++) {
        var layer = doc.queryLayer(layerIds[i]);
        if (!layer) continue;
        var needsFix = false;
        
        if (layer.isOff()) {
            layer.setOff(false);
            needsFix = true;
        }
        if (layer.isFrozen()) {
            layer.setFrozen(false);
            needsFix = true;
        }
        if (needsFix) {
            op.addObject(layer, false);
            fixedCount++;
        }
    }

    if (fixedCount > 0) {
        di.applyOperation(op);
        print("Fixed " + fixedCount + " layer(s)");
    } else {
        print("All layers already visible");
    }

    // Export DWG
    if (di.exportFile(outputFile, "DWG")) {
        print("SUCCESS: " + outputFile);
    } else {
        qWarning("Export failed");
        qcad.quit(1);
        return;
    }

    if (typeof(QCoreApplication) !== 'undefined') {
        QCoreApplication.quit(0);
    }
}

if (typeof(including) === 'undefined' || including === false) {
    main();
}
