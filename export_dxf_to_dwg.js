/**
 * QCAD script: Convert DXF to DWG
 * Usage: qcad -exec dxf_to_dwg.js <input.dxf> <output.dwg>
 */

function main() {
    var args = getArguments();
    if (args.length < 2) {
        print("Usage: export_dxf_to_dwg.js <input.dxf> <output.dwg>");
        return 1;
    }

    var inputFile = args[0];
    var outputFile = args[1];

    print("Loading DXF: " + inputFile);

    var app = new RApplication([], false);
    var di = app.getDocumentInterface();
    if (!di) {
        print("Error: No document interface");
        return 1;
    }

    var success = di.importFile(inputFile);
    if (!success) {
        print("Error: Failed to import " + inputFile);
        return 1;
    }

    print("Saving as DWG: " + outputFile);
    success = di.exportFile(outputFile, "DWG Files (*.dwg)");
    if (!success) {
        print("Error: Failed to export to " + outputFile);
        return 1;
    }

    print("Done: " + outputFile);
    return 0;
}

main();
