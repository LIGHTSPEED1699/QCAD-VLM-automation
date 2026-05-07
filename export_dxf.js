/**
 * QCAD script to export DWG to DXF
 * Usage: qcad -exec export_dxf.js <input.dwg> <output.dxf>
 */

function main() {
    var args = getArguments();
    if (args.length < 2) {
        print("Usage: export_dxf.js <input.dwg> <output.dxf>");
        return 1;
    }
    
    var inputFile = args[0];
    var outputFile = args[1];
    
    print("Loading: " + inputFile);
    
    // Create application
    var app = new RApplication([], false);
    
    // Open the DWG file
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
    
    print("Loaded successfully, saving as DXF...");
    
    // Save as DXF
    success = di.exportFile(outputFile, "DXF Files (*.dxf)");
    if (!success) {
        print("Error: Failed to export to " + outputFile);
        return 1;
    }
    
    print("Exported: " + outputFile);
    return 0;
}

main();
