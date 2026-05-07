/**
 * QCAD script: DWG → DXF export with qApp.arguments()
 * Usage: qcad -allow-multiple-instances -exec export_dxf3.js /tmp/test.dwg /tmp/test.dxf
 */

function main() {
    var args = qApp.arguments();
    // args[0] = qcad binary path
    // args[1] = "-allow-multiple-instances" (if used)
    // args[2] = "-exec"
    // args[3] = script path
    // args[4] = input file
    // args[5] = output file

    // Find -exec index and take args after script path
    var execIdx = -1;
    for (var i = 0; i < args.length; i++) {
        if (args[i] === "-exec") {
            execIdx = i;
            break;
        }
    }

    var inputFile, outputFile;
    if (execIdx >= 0 && args.length > execIdx + 2) {
        // After script path
        inputFile = args[execIdx + 2];
        outputFile = args[execIdx + 3];
    }

    if (!inputFile || !outputFile) {
        print("Usage: qcad -allow-multiple-instances -exec export_dxf3.js <input.dwg> <output.dxf>");
        print("Arguments found: " + args.join(", "));
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
