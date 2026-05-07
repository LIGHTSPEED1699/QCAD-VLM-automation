/**
 * QCAD script: DWG → DXF export using RGlobal.argv
 * Usage: qcad -allow-multiple-instances -exec export_dxf4.js /tmp/test.dwg /tmp/test.dxf
 */

function main() {
    // QCAD provides command-line args via RGlobal.argc / RGlobal.argv
    var argc = RGlobal.argc;
    var argv = RGlobal.argv;

    print("argc = " + argc);
    for (var i = 0; i < argc; i++) {
        print("argv[" + i + "] = " + argv[i]);
    }

    // Find input/output: look for files with .dwg/.dxf extensions
    var inputFile = null;
    var outputFile = null;

    for (var i = 0; i < argc; i++) {
        var arg = argv[i];
        if (arg.toLowerCase().endsWith(".dwg")) {
            inputFile = arg;
        } else if (arg.toLowerCase().endsWith(".dxf")) {
            outputFile = arg;
        }
    }

    if (!inputFile || !outputFile) {
        print("Usage: qcad -allow-multiple-instances -exec export_dxf4.js <input.dwg> <output.dxf>");
        print("DWG file: " + inputFile);
        print("DXF file: " + outputFile);
        qApp.exit(1);
        return;
    }

    print("Opening: " + inputFile);
    print("Output:  " + outputFile);

    var app = new RApplication([], false);
    var di = app.getDocumentInterface();
    if (!di) {
        print("Error: No document interface");
        qApp.exit(1);
        return;
    }

    var success = di.importFile(inputFile);
    if (!success) {
        print("Error: Failed to import " + inputFile);
        qApp.exit(1);
        return;
    }

    print("Import OK. Exporting...");

    success = di.exportFile(outputFile, "DXF Files (*.dxf)");
    if (!success) {
        print("Error: Failed to export to " + outputFile);
        qApp.exit(1);
        return;
    }

    print("SUCCESS: " + outputFile);
    qApp.exit(0);
}

main();
