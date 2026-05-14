/*
 * QCAD Pro Layer Diagnostic: Export DWG to DXF and print layer states.
 * Usage: qcad-bin -no-gui -platform offscreen -allow-multiple-instances \
 *                -autostart qcad_layer_diagnostic.js <input.dwg>
 */
include("scripts/library.js");

function main() {
    var inputFile = args[args.length - 1];
    if (!inputFile || inputFile.indexOf("-") === 0) {
        print("ERROR: Please provide a DWG or DXF file path.");
        qcad.quit(1);
        return;
    }

    var fi = new QFileInfo(inputFile);
    if (!fi.isAbsolute()) {
        inputFile = RSettings.getLaunchPath() + QDir.separator + inputFile;
    }

    print("Loading: " + inputFile);

    var doc;
    try {
        doc = new RDocument(new RMemoryStorage(), new RSpatialIndexSimple());
    } catch (e) {
        doc = new RDocument();
    }

    var di = new RDocumentInterface(doc);
    var result = di.importFile(inputFile);
    if (result !== RDocumentInterface.IoErrorNoError) {
        qWarning("ERROR: Failed to import file (code " + result + ")");
        qcad.quit(1);
        return;
    }

    var layers = doc.queryAllLayers();
    print("Layers: " + layers.length);
    var hiddenCount = 0;
    for (var i = 0; i < layers.length; i++) {
        var layer = doc.queryLayer(layers[i]);
        if (!layer) continue;
        var name = layer.getName();
        var color = layer.getColor();
        var colorValue = color.getColor(); // may be negative
        var alpha = color.getAlpha();
        var visible = layer.isOff() ? "OFF" : "ON";
        var frozen = layer.isFrozen() ? "FROZEN" : "THAWED";
        print("  " + name + ": colorCode=" + colorValue + " visible=" + visible + " state=" + frozen);
        if (layer.isOff() || layer.isFrozen() || colorValue < 0) {
            hiddenCount++;
        }
    }
    print("Hidden/frozen layers: " + hiddenCount);
    if (typeof(QCoreApplication) !== 'undefined') QCoreApplication.quit(0);
}

if (typeof(including) === 'undefined' || including === false) {
    main();
}
