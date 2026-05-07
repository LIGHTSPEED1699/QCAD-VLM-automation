/**
 * Minimal QCAD script to export DWG to DXF
 * Usage: qcad -allow-multiple-instances -exec export_dxf2.js <input.dwg> <output.dxf>
 */

function main() {
    var args = getArguments();
    if (args.length < 2) {
        print("Usage: export_dxf2.js <input.dwg> <output.dxf>");
        qApp.exit(1);
        return;
    }

    var inputFile = args[0];
    var outputFile = args[1];

    print("Opening: " + inputFile);

    // Create app (without GUI)
    var app = new RApplication([], false);

    // Create document interface
    var di = new RDocumentInterface(app.getDocument());

    // Import the DWG file
    var success = di.importFile(inputFile);
    if (!success) {
        print("Error: Failed to import " + inputFile);
        qApp.exit(1);
        return;
    }

    print("Import successful. Exporting to DXF...");

    // Export as DXF
    success = di.exportFile(outputFile, "DXF Files (*.dxf)");
    if (!success) {
        print("Error: Failed to export to " + outputFile);
        qApp.exit(1);
        return;
    }

    print("SUCCESS: Exported to " + outputFile);
    qApp.exit(0);
}

main();
