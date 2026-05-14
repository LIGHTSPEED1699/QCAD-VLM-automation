/*
 * QCAD Pro Entity Position Export
 * Usage: qcad-bin -no-gui -platform offscreen -allow-multiple-instances \
 *                -autostart qcad_entity_dump.js <input.dxf>
 */
include("scripts/library.js");

function main() {
    var dxfPath = args[args.length - 1];
    var fi = new QFileInfo(dxfPath);
    var doc = new RDocument(new RMemoryStorage(), new RSpatialIndexNavel());
    var di = new RDocumentInterface(doc);
    var result = di.importFile(fi.absoluteFilePath());
    if (result !== RDocumentInterface.IoErrorNoError) {
        print("Import error: " + result);
        qcad.quit(1); return;
    }

    // Bounding box
    var bbox = doc.getBoundingBox();
    var c1 = bbox.getCorner1();
    var c2 = bbox.getCorner2();
    print("BBOX: " + c1.x + " " + c1.y + " " + c2.x + " " + c2.y);

    // All entities with positions
    var ids = doc.queryAllEntities(false, true);
    print("TOTAL_ENTITIES: " + ids.length);

    for (var i = 0; i < ids.length; i++) {
        var e = doc.queryEntity(ids[i]);
        var pos = e.getPosition();
        if (pos && pos.x !== undefined) {
            var typeName = "";
            try { typeName = e.getType().toString(); } catch(ex) {}
            var layerName = "";
            try { layerName = e.getLayerName(); } catch(ex) {}
            // Get color as integer
            var cInt = -1;
            try {
                var col = e.getColor();
                if (col && typeof col.toName === 'function') {
                    // RColor in v3.32
                    cInt = col.toName();
                }
            } catch(ex) {}
            var text = "";
            try {
                if (e.getPlainText) text = e.getPlainText();
            } catch(ex) {}

            print("ENTITY: id=" + ids[i] + " pos=" + pos.x + "," + pos.y + 
                  " type=" + typeName + " layer=" + layerName +
                  " text='" + text + "'");
        }
    }

    if (typeof(QCoreApplication) !== 'undefined') QCoreApplication.quit(0);
}

if (typeof(including) === 'undefined' || including === false) {
    main();
}
