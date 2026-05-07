/**
 * Minimal test: verify QCAD script execution and entity access.
 */

function main() {
    var args = getArguments();
    if (args.length < 2) {
        print("Usage: test_qcad_script.js <input.dwg> <output.txt>");
        qApp.exit(1);
        return;
    }

    var inputFile = args[0];
    var outputFile = args[1];

    print("Test script starting...");
    print("Input: " + inputFile);

    var app = new RApplication([], false);
    var di = new RDocumentInterface(app.getDocument());

    print("Importing file...");
    if (!di.importFile(inputFile)) {
        print("ERROR: import failed");
        qApp.exit(1);
        return;
    }

    print("Import OK. Querying entities...");
    var doc = di.getDocument();
    var ids = doc.queryAllEntities();
    print("Entity count: " + ids.length);

    // Count text entities
    var textCount = 0;
    var mtextCount = 0;
    for (var i = 0; i < Math.min(ids.length, 50); i++) {
        var entity = doc.queryEntity(ids[i]);
        if (isTextEntity(entity)) textCount++;
        else if (isMTextEntity(entity)) mtextCount++;
    }
    print("TEXT: " + textCount + ", MTEXT: " + mtextCount);

    // Write simple output
    var file = new QFile(outputFile);
    var flags = makeQIODeviceOpenMode(QIODevice.WriteOnly, QIODevice.Text);
    if (file.open(flags)) {
        var ts = new QTextStream(file);
        ts.writeString("Entity count: " + ids.length + "\n");
        ts.writeString("TEXT: " + textCount + "\n");
        ts.writeString("MTEXT: " + mtextCount + "\n");
        file.close();
        print("Wrote output to: " + outputFile);
    } else {
        print("ERROR: cannot write output file");
    }

    qApp.exit(0);
}

main();
