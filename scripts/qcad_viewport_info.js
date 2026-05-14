/*
 * QCAD Pro Viewport Extraction: Dump the model-to-paper transformation.
 * Usage: qcad-bin -no-gui -platform offscreen \
 *                -autostart qcad_viewport_info.js <input.dxf>
 */
include("scripts/library.js");

function main() {
    var dxfPath = args.length > 0 ? args[args.length - 1] : null;
    if (!dxfPath) { qcad.quit(1); return; }

    var fi = new QFileInfo(dxfPath);
    var doc = new RDocument(new RMemoryStorage(), new RSpatialIndexNavel());
    var di = new RDocumentInterface(doc);
    
    var result = di.importFile(fi.absoluteFilePath());
    if (result !== RDocumentInterface.IoErrorNoError) {
        print("Import error: " + result);
        qcad.quit(1); return;
    }

    // Get layer info
    var layers = doc.queryAllLayers();
    print("LAYERS: " + layers.length);
    for (var i = 0; i < layers.length; i++) {
        var layer = doc.queryLayer(layers[i]);
        if (!layer) continue;
        var color = layer.getColor();
        var off = layer.isOff() ? "OFF" : "ON";
        var frozen = layer.isFrozen() ? "FROZEN" : "THAWED";
        print("  " + layer.getName() + ": color=" + color.getColor() + " " + off + "/" + frozen);
    }

    // Get all TEXT entity positions for calibration
    var texts = doc.queryAllEntities(false, true, RS.EntityText);
    print("\nTEXT ENTITIES:");
    for (var i = 0; i < texts.length; i++) {
        var e = doc.queryEntity(texts[i]);
        var pos = e.getPosition();
        print("  " + e.getId() + ": '" + e.getPlainText() + "' at (" + pos.x + ", " + pos.y + ")");
    }

    // Bounding box of entire document
    var bbox = doc.getBoundingBox();
    print("\nDOCUMENT BBOX: " + bbox.getCorner1().x + ", " + bbox.getCorner1().y + " to " + bbox.getCorner2().x + ", " + bbox.getCorner2().y);

    if (typeof(QCoreApplication) !== 'undefined') QCoreApplication.quit(0);
}

if (typeof(including) === 'undefined' || including === false) {
    main();
}
