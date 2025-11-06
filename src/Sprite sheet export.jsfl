//////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////
//
//  Sprite Sheet Exporter
//  v1.2
//  By David Hernston
//  Last modified September 27 2025
//
//  Exports separate sprite sheets for each layer in a symbol, with the option of
//  exporting layers in sub-symbols separately (for instance, to export lines and 
//  fills separately).
//
//  For this script to work, the following files are needed:
//
//  In Windows, place the following files in C:\Users\[user]\AppData\Local\Adobe\Animate 2024\en_US\Configuration:
//
//  Sprite Sheet Export.jsfl (this file)
//  Zero Transform.include 
//  auto tween.include
//  Art brush.include
//
//  In Windows the following file goes in C:\Program Files\Adobe\Adobe Animate 2024\Common\Configuration\Sprite Sheet Plugins:
//
//  JSON-Stacked.plugin.jsfl
//
//  REVISIONS
//
//  1.2     9/27/2025 Removed some extraneous debugging output
//  1.1     9/27/2025 Fixed a bug that broke exports when symbols were in folders in the library
//  1       9/26/2025 Initial release 
//
//////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////

// Load helper libraries
fl.runScript( fl.configURI + "Commands/auto tween.include");
fl.runScript( fl.configURI + "Commands/Zero Transform.include");

// Set this to different values to get different sets of debug messages
// Set it to 0 for no debug messages
// Set it to -1 for all debug messages
// Set it to 7 to see profile timing output
var DEBUG = 0;

// These determine whether the tool will look for symbols from the library's selection and/or the stage's
var EXPORT_FROM_LIBRARY = false;
var EXPORT_FROM_STAGE = true;

// Constants to define whether folders should be created based on filename, scene name, and symbol name
var CREATE_FOLDER_FILENAME = true;
var CREATE_FOLDER_SCENE = false;
var CREATE_FOLDER_SYMBOL = true;
var TRIM_LIBRARY_FOLDERS_FOR_FILENAME = true;

// Set this to an empty string to not export to a single subfolder
var SPRITES_SUBFOLDER = "Exported sprites/"

// IDs to store data in the doc for communicating with the metadata output script
var DOC_DATA_ARRAY_NAME = "spriteExportZData";
var DOC_DATA_LAYER_NAME = "spriteExportLayerName";
var DOC_DATA_SCALE      = "spriteExportScale";

var LAYER_ASSIGNMENT_UNINITIALIZED = -1;
var CONSTANT_SUFFIX = "_CONST";
var HASH_PREFIX = "HASH_";
var DIALOG_ID_PREFIX = "ID_";
var IGNORE_PREFIX = "X_";
var SCALED_NAME_SUFFIX = "____TEMP_SCALED";

DIALOG_EXPLANATORY_TEXT = ["This tool exports all the symbols that are currently selected " + (EXPORT_FROM_STAGE? "on the stage " : "") + 
                            ((EXPORT_FROM_STAGE && EXPORT_FROM_LIBRARY) ? "and " : "") + (EXPORT_FROM_LIBRARY ? "in the library " : "") + 
                            "to PNG sprite sheets using the JSON_Stacked metadata encoder.",
                        "Layers with names starting with '" + IGNORE_PREFIX + "' will be ignored",
                        "Layers that end in '" + CONSTANT_SUFFIX + "' will be exported with every sprite sheet"];

var DIALOG_XML_FILENAME = fl.configURI + "Commands/Sprite_Sheet_Export.xml"

var doc = fl.getDocumentDOM();
var timer;

//------------------------------------------

trace = function(str)
{
    fl.outputPanel.trace("SPRITE EXPORTER: " + str);
}

//------------------------------------------

debugTrace = function(str, debugLevel)
{
    if(!debugLevel)
        debugLevel = 1;
    if(DEBUG === debugLevel || DEBUG === -1)
        fl.outputPanel.trace("SPRITE EXPORTER: " + str);
}

//------------------------------------------

debugAlert = function(str, debugLevel)
{
    if(!debugLevel)
        debugLevel = 1;
    if(DEBUG === debugLevel || DEBUG === -1)
        alert("SPRITE EXPORTER: " + str);
}

//------------------------------------------

fillArray = function(arr, value, start, end)
{
    for(n = start; n<end; n++)
        arr[n] = value;
}

//------------------------------------------

stringToFileSafe = function(str)
{
    // Replace invalid characters with an underscore
    // This regex targets common invalid characters:
    // / (forward slash), \ (backslash), : (colon), * (asterisk),
    // ? (question mark), " (double quote), < (less than),
    // > (greater than), | (pipe)
    var safeFilename = str.replace(/[/\:*?"<>|]/g, '_');

    // Optionally, remove or replace leading/trailing spaces or periods
    // This can prevent issues on some systems (especially Windows)
    safeFilename = safeFilename.replace(/^\s+|\s+$/g, ''); // Trim leading/trailing spaces
    safeFilename = safeFilename.replace(/\.+$/, ''); // Remove trailing periods

    // Optionally, handle reserved Windows filenames if needed
    // (e.g., CON, PRN, AUX, NUL, COM1-9, LPT1-9)
    // For most general cases, the above replacements are sufficient.
    const reservedWindowsNames = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
    if (reservedWindowsNames.test(safeFilename)) 
    {
        safeFilename = "_" + safeFilename; // Prepend an underscore
    }

    // Limit the length to a reasonable maximum (e.g., 255 characters)
    // This helps prevent issues with file system limitations
    safeFilename = safeFilename.substring(0, 255);

    return safeFilename;
}

//=====================================================================================
// I didn't want to do this, but I need to assemble a data structure with
// layer information for the symbols we're operating on
// It's going to be a bunch of hash tables and arrays
//
// The structure is going to look like this:
//
// symbolStructure.symbolHasChild(symbolA, symbolB) --> true if symbolA contains an instance of symbolB
// symbolStructure.symbolHasChildLayer(symbolA, layer) --> true if one of the children of symbolA has a layer by that name
// symbolStructure.symbolLayerHasChild(symbolA, layer, symbolB) --> true if symbolA's layer of that name contains symbolB
//=====================================================================================

function SymbolStructureType()
{
    // Not sure we need to do anything here
    this.initialized = true;
}

var symbolStructure = new SymbolStructureType;

//------------------------------------------

SymbolStructureType.prototype.initSymbol = function(symbolName)
{
    if(this[stringToHash(symbolName)] === undefined)
    {
        this[stringToHash(symbolName)] = new Object;
        this[stringToHash(symbolName)].child = new Object; // Hashtable of whether a particular symbol appears in the main symbol
        this[stringToHash(symbolName)].childLayer = new Object; // Hashtable of whether any of the symbol's children has a particular layer
        this[stringToHash(symbolName)].layer = []; // Array of hashtables that record whether the layer (by index) has particular child symbols
    }
}

//------------------------------------------

SymbolStructureType.prototype.initSymbolLayer = function(symbolName, layerNum, layerName)
{
    if(!this.getSymbol(symbolName).layer[layerNum])
    {
        var thisLayer = this.getSymbol(symbolName).layer[layerNum] = new Object;
        thisLayer.hasChild = new Object;
        thisLayer.hasChildWithLayer = new Object;
        thisLayer.name = layerName;
    }
}

//------------------------------------------

SymbolStructureType.prototype.getSymbol = function(symbolName)
{
    this.initSymbol(symbolName);
    return this[stringToHash(symbolName)];
}

//------------------------------------------
// Get a refference to a layer in a symbol

SymbolStructureType.prototype.getSymbolLayer = function(symbolName, layerNum)
{
    if(this.getSymbol(symbolName).layer[layerNum] === undefined)
        this.initSymbolLayer(symbolName, layerNum, "");
    return this.getSymbol(symbolName).layer[layerNum];
}

//------------------------------------------
// Get whether a symbol has a particular child

SymbolStructureType.prototype.getSymbolChild = function(symbolName, childName)
{
    return this.getSymbol(symbolName).child[stringToHash(childName)];
}

//------------------------------------------
// Set whether a symbol has a particular child

SymbolStructureType.prototype.setSymbolChild = function(symbolName, childName)
{
    this.getSymbol(symbolName).child[stringToHash(childName)] = true;
}

//------------------------------------------
// Find whether a symbol has a child with a particular layer name

SymbolStructureType.prototype.getSymbolHasChildWithLayer = function(symbolName, layerName)
{
    retVal = this.getSymbol(symbolName).childLayer[stringToHash(layerName)];
    //debugTrace("getSymbolHasChildWithLayer('" + symbolName + "', '" + layerName + "'): " + retVal, 10);
    return (retVal || false); // This will return false if retVal is undefined
}

//------------------------------------------
// Set whether a symbol has a child with a particular layer name

SymbolStructureType.prototype.setSymbolHasChildWithLayer = function(symbolName, layerName)
{
    //debugTrace("setSymbolHasChildWithLayer('" + symbolName + "', '" + layerName + "')", 10);
    this.getSymbol(symbolName).childLayer[stringToHash(layerName)] = true;
}

//------------------------------------------
// Set whether a symbol's particular layer has a particular child

SymbolStructureType.prototype.setSymbolLayerHasChild = function(symbolName, layerNum, layerName, childName)
{
    debugTrace("setSymbolLayerHasChild('" + symbolName + "', '" + layerNum + "', '" + layerName + "', '" + childName + "')", 10);
    this.setSymbolChild(symbolName, childName); // Set that this child is in this symbol
    this.initSymbolLayer(symbolName,layerNum, layerName)
    this.getSymbol(symbolName).layer[layerNum].hasChild[stringToHash(childName)] = true; // Set that this symbol has childName on layerNum
}

//------------------------------------------
// Get whether a symbol's particular layer has a particular child

SymbolStructureType.prototype.getSymbolLayerHasChild = function(symbolName, layerNum, layerName, childName)
{
    this.initSymbolLayer(symbolName, layerNum, layerName);
    var retVal = this.getSymbolLayer(symbolName, layerNum).hasChild[stringToHash(childName)]
    debugTrace("setSymbolLayerHasChild('" + symbolName + "', '" + layerNum + "', '" + layerName + "', '" + childName + "') = ", 10);
    return retVal;
}

//------------------------------------------
// Set whether a symbol's particular layer has a child with a particular layer

SymbolStructureType.prototype.setSymbolLayerHasChildWithLayer = function(symbolName, layerNum, layerName, childName, childLayerName)
{
    debugTrace("setSymbolLayerHasChildWithLayer('" + symbolName + "', '" + layerNum + "', '" + layerName + "', '" + childName + "', '" + childLayerName + "')", 10);
    this.setSymbolChild(symbolName, childName); // Set that this child is in this symbol
    this.initSymbolLayer(symbolName, layerNum, layerName);
    this.getSymbolLayer(symbolName, layerNum).hasChildWithLayer[stringToHash(childLayerName)] = true;
}

//------------------------------------------
// Get whether a symbol's particular layer has a child with a particular layer

SymbolStructureType.prototype.getSymbolLayerHasChildWithLayer = function(symbolName, layerNum, childLayerName)
{
    debugTrace("getSymbolLayerHasChildWithLayer('" + symbolName + "', '" + layerNum + "', '" + childLayerName + "')", 10);
    return this.getSymbolLayer(symbolName, layerNum).hasChildWithLayer[stringToHash(childLayerName)];
}

//=====================================================================================
// End SymbolStructureType
//=====================================================================================

//------------------------------------------

function createSymbolExportDialog(librarySymbols) 
{
    var dialog;
    if(FLfile.exists(DIALOG_XML_FILENAME))
    {
        var dialogString = FLfile.read(DIALOG_XML_FILENAME);
        if(dialogString)
            dialog = new XML(dialogString);
    }
    if(!dialog)
    {
        debugTrace("Generating new dialog XML", 3);
        
        // Create the main dialog structure using E4X
        dialog = 
            <dialog title="Export Sprites from Selected Symbols" buttons="accept, cancel">
                <vbox/>
                <separator />
                <hbox id="scale">
                    <label value="Export at scale:" />
                    <textbox id="exportScale" type="number" value="100" size="5" />
                </hbox>
                <hbox id="exportSeparately">
                    <checkbox id="exportSeparately" label="Export subsymbols by layer name" checked="false" />
                    <label value="<------- Select this option, for instance, if you want to export lines and fills separately."/>
                </hbox>
                <separator />
                <label value="Symbols to export:" />
                <vbox></vbox>
            </dialog>;
    
        dialog.vbox[0].appendChild(<label value={DIALOG_EXPLANATORY_TEXT[0]}/>)
        dialog.vbox[0].appendChild(<separator />)
        for(var i = 1; i < DIALOG_EXPLANATORY_TEXT.length; i++)
            dialog.vbox[0].appendChild(<label value={DIALOG_EXPLANATORY_TEXT[i]}/>)
    }
    // Add checkboxes for each library symbol
    // First, make sure it's empty. It's going to replace the one that's already there.
    var symbolListNode = dialog.vbox[1] = <vbox/>;
    
    //for(var j = 0; j < 20; j++)
        for (var i = 0; i < librarySymbols.length; i++) 
        {
            var symbol = librarySymbols[i];
            var symbolName = symbol.name || "Unnamed Symbol " + (i + 1);
            
            // Create checkbox for this symbol
            var symbolCheckbox = <checkbox id={DIALOG_ID_PREFIX + symbolName} label={symbolName} checked="true" />;
            
            // Append to the symbol list
            symbolListNode.appendChild(symbolCheckbox);
        }
    
    return dialog;
}

//------------------------------------------

function showDialogBox(symbolList)
{
    var dialog = createSymbolExportDialog(symbolList);
    
    FLfile.write(DIALOG_XML_FILENAME, dialog.toXMLString());
    
    var panelResult = doc.xmlPanel(DIALOG_XML_FILENAME);
    
    if(panelResult.dismiss === "accept")
    {
        // Save the changed values in the XML file for next time. For now, this will include only scale and exportSeparately
        dialog.hbox.(@id == "exportSeparately").checkbox.@checked = panelResult.exportSeparately;
        dialog.hbox.(@id == "scale").textbox.(@id == "exportScale").@value = panelResult.exportScale;
        debugTrace("New XML:\n" + dialog.toXMLString(), 2);
        FLfile.write(DIALOG_XML_FILENAME, dialog.toXMLString());
    }
    
    for (var prop in panelResult) 
    {
        debugTrace("property " + prop + " = " + panelResult[prop]);
    }
    
    return panelResult
}

//------------------------------------------

applyDialogToExportList = function(panelResult, itemsToExport)
{
    var returnList = [];
    for(var i = 0; i < itemsToExport.length; i++)
    {
        if(panelResult[DIALOG_ID_PREFIX + itemsToExport[i].name] === "true")
            returnList.push(itemsToExport[i]);
    }
    return returnList;
}

//------------------------------------------


guideAll = function(layers)
{
    for(i =0; i < layers.length; i++)
    {
		// Only operate on it if it's not already guided out and it doesn't end with the CONST string
        if(layers[i].layerType !== "guide" &&
            layers[i].layerType !== "mask" &&
            layers[i].layerType !== "folder" &&
		 layers[i].name.slice(-CONSTANT_SUFFIX.length) !== CONSTANT_SUFFIX)
        {
            debugTrace("guideAll: guiding " + layers[i].name);
            layers[i].parentLayer = null;
            layers[i].layerType = "guide";
        }
    }
}

//------------------------------------------
// Unguide all layers of a particular name and their parent layers

unguideLayerByName = function(layers, name, originalStates)
{
    var i;
 
    debugTrace("unguideLayerByName: Called to unguide " + name, 5);
  
    debugTrace("unguideLayerByName: num layers: " + layers.length, 5);

    for(i = 0; i < layers.length; i++)
    {
        var layer = layers[i]
        
        debugTrace("unguideLayerByName: Is this the right layer? " + name + " ?= " + layer.name, 5);
        // If this is [one of] the layer[s] we're looking for
        if(layer.name.toLowerCase() === name.toLowerCase() && name.slice(0, IGNORE_PREFIX.length) !== IGNORE_PREFIX)
        {
            debugTrace("unguideLayerByName: On layer " + layer.name + ", About to Restore layer type: " + originalStates.types[i], 8);

            // Now unguide this layer
            debugTrace("unguideLayerByName: ========= Unguiding layer " + i + ": " + layer.name, 5);
            
            debugTrace("unguideLayerByName: On layer " + layer.name + ", Restoring layer type: " + originalStates.types[i], 8);
            layer.layerType = originalStates.types[i];
            layer.parentLayer = originalStates.parents[i];
        }
    }
}

//------------------------------------------

stringToHash = function(str)
{
    /*
    var CONSTANT_SUFFIX = "_CONST";
    var HASH_PREFIX = "HASH_";
    var DIALOG_ID_PREFIX = "ID_";
    var IGNORE_PREFIX = "X_";
    var LINE_PREFIX = "L_";
    var FILL_PREFIX = "F_";
    var SCALED_NAME_SUFFIX = "_TEMP_SCALED";
    */
    
    var hash = str.toLowerCase();
    /*
    var firstUnderscore = str.indexOf("_");
    var lastUnderscore = str.lastIndexOf("_");
    var prefix = str.slice(0,firstUnderscore + 1).toLowerCase();
    var suffix = str.slice(lastUnderscore).toLowerCase();
    
    if(prefix === IGNORE_PREFIX)
    {
        hash = hash.slice(firstUnderscore + 1);
    }
    else if(suffix === CONSTANT_SUFFIX)
    {
        hash = hash.slice(0, firstUnderscore);
    }
    */
    return HASH_PREFIX + hash;
}

//------------------------------------------

isolateLayer = function(symbol, isolateLayerName, originalLayerStatus)
{
    var lib = doc.library;

//  We don't really need to save the edit place because the calling function doesn't rely on it.
//    var originalSymbol = doc.getTimeline().libraryItem; // if we're in a scene, this will be undefined
//    var originalTimeline = doc.getTimeline().name;

    var retVal = false;
    debugTrace("~~~~~~~~~~~~~~~~~~~~~~isolateLayer: Trying to edit " + symbol.name,2)
 //   if(lib.editItem(symbol.name))
    {
        debugTrace("~~~~~~~~~~~~~~~~~~~~~~isolateLayer: Isolating " + isolateLayerName + " in " + symbol.name,2)
        var layers = symbol.timeline.layers;
        for(var i = 0; i < layers.length; i++)
        {
            debugTrace("~~~~~~~~~~~~~~~~~~~~~~isolateLayer: " + isolateLayerName + " ?= " + layers[i].name,2)
            
            if(layers[i].name.toLowerCase() === isolateLayerName.toLowerCase())
            {
                debugTrace("~~~~~~~~~~~~~~~~~~~~~~isolateLayer: Restoring " + isolateLayerName + " on layer " + i, 8)
                debugTrace("~~~~~~~~~~~~~~~~~~~~~~isolateLayer: Type = " + originalLayerStatus.types[i] + ", parent = " + originalLayerStatus.parents[i], 8)

                // Restore original layer type and parent
                 layers[i].layerType = originalLayerStatus.types[i];
                 layers[i].parent = originalLayerStatus.parents[i];
                 
                 retVal = true;
            }
            else 
            {
                debugTrace("~~~~~~~~~~~~~~~~~~~~~~isolateLayer: Guiding out layer " + layers[i].name + " in " + symbol.name);
                layers[i].layerType = "guide"; 
            }
        }
    }

    //if(originalSymbol)
    //    lib.editItem(originalSymbol.name)
    //else doc.editScene(originalTimeline);
    
    // Return true if we found the layer
    return retVal;
}

//------------------------------------------
// Find all the symbols that are visible (that is, not in guide or mask layers) on the current timeline

getVisibleSymbols = function(timeline)
{
    var visibleSymbols = [];
    var symbolHash = new Object;
    
    var layers = timeline.layers;
    
    for(var lay = 0; lay < layers.length; lay++)
    {
        // Only find the symbol instances in this layer if the layer is visible when exported
        if(layers[lay].layerType !== "guide" && layers[lay].layerType !== "folder" && layers[lay].layerType !== "mask")
        {
            var frames = layers[lay].frames;
            var fr = 0;
            while(fr < layers[lay].frameCount)
            {
                var elements = frames[fr].elements;
                for(var el = 0; el < elements.length; el++)
                {
                    if(elements[el].libraryItem)
                    {
                        var symbolHashKey = stringToHash(elements[el].libraryItem.name)
                        // If it isn't already in the hashtable
                        if(symbolHash[symbolHashKey] === undefined)
                        {
                            // Add it to the return array and to the hashtable
                            visibleSymbols.push(elements[el].libraryItem);
                            symbolHash[symbolHashKey] = [];
                        }
                        // Record that that symbol appears on this layer in this symbol
                        symbolStructure.setSymbolLayerHasChild(timeline.libraryItem.name, lay, layers[lay].name, elements[el].libraryItem.name);
                        symbolHash[symbolHashKey][lay] = true;
                    }
                }
                fr += frames[fr].duration;
            }
        }
    }
    
    visibleSymbols.presentOnLayer = symbolHash;
    return visibleSymbols;
}

//------------------------------------------

exportSymbolSprites = function(libItem, byLayerName, exportScale)
{
    var i;
    var lay;
    var f;
    var sse;
    var exportList = [];
    var subsymbolHasLayer = [];
    
    library = doc.library;
    //    Edit the library item
    //library.editItem(libItem.name);
    var timeline = libItem.timeline;
    var layers = timeline.layers;
    
    debugTrace("exportSymbolSprites: Now in " + libItem.name, 2);
    
    // First let's save the state of all the layers
    var layerState = saveLayerProperties(false, libItem.timeline);
    debugTrace("exportSymbolSprites: Saved layer properties", 2);
    for(i = 0; i < layers.length; i++)
        debugTrace("\t" + layers[i].name + ": type = " + layerState.types[i] + " parent = " + (layerState.parents[i] ? layerState.parents[i].name : "null"), 8);
    
    var visibleLayerTimelineIdx = [];
    
    debugTrace("exportSymbolSprites: Finding visible layers from " + layers.length + " layers in " + libItem.name, 2);
    
    var exported = false;
    
    if(byLayerName)
    {
        debugTrace("exportSymbolSprites: Starting 'isolateLayer' calculations", 2);
        var sym;
        // what all the visible symbols are in this timeline
        var visibleSymbols = getVisibleSymbols(timeline);
        debugTrace("exportSymbolSprites: visibleSymbols = " + visibleSymbols, 6);

        // Okay, now we have a list of symbols that are visible and for each of those, a list of layers they appear on.
        // Now we need to assemble a list of which subsymbol layers appear on which of the main symbol's layers
       
        // Get a list of all the layer names in the visible symbols
        var symbolLayerNames = getSymbolLayerNames(visibleSymbols, libItem);
        
        timer.mark("Got symbol layer names");
        
        // Save the layer states for all those symbols
        var layerProperties = [];
        for(sym = 0; sym < visibleSymbols.length; sym++)
        {
            //if(library.editItem(visibleSymbols[sym].name))
            //{
                debugTrace("exportSymbolSprites: Saving layer properties in " + visibleSymbols[sym].name, 2);
                layerProperties[sym] = saveLayerProperties(false, visibleSymbols[sym].timeline);
            //}
            //else
            //{
                //alert("exportSymbolSprites: Error saving layer properties on " + visibleSymbols[sym].name);
            //}
        }
        timer.mark("Saved layer states on all those. Names found: "+ symbolLayerNames);
        
        debugTrace("exportSymbolSprites: names found: " + symbolLayerNames, 2);
        
        if(symbolLayerNames.length === 0)
            trace("Warning! No subsymbols found in " + libItem.name + ". Proceeding with simple sprite sheet export.");
        else
        {
            // For each layer name we found in subsymbol
            for(var lay = 0; lay < symbolLayerNames.length; lay++)
            {
                timer.mark("exportSymbolSprites: Starting " + libItem.name + "-->" + symbolLayerNames[lay]);
                debugTrace("exportSymbolSprites: DOING THE EXPORT ON " + symbolLayerNames[lay], 2);
                // Refresh the layers array
                //layers = doc.getTimeline().layers;
                
                // For each symbol in the list of visible Symbols
                for(var sym = 0; sym < visibleSymbols.length; sym++)
                {
                    debugTrace("exportSymbolSprites: Isolating " + symbolLayerNames[lay] + " in " + visibleSymbols[sym].name, 6);

                    timer.mark("exportSymbolSprites: Isolating " + symbolLayerNames[lay] + " in " + visibleSymbols[sym].name);

                    // Turn off all layers other than the ones with the current name in the subsymbol
                    subsymbolHasLayer[sym] = isolateLayer(visibleSymbols[sym], symbolLayerNames[lay], layerProperties[sym]);

                    timer.mark("Done isolating " + symbolLayerNames[lay] + " in " + visibleSymbols[sym].name);

                    debugTrace("exportSymbolSprites: Symbol " + visibleSymbols[sym].name + " has layer " + symbolLayerNames[lay] + ": " + subsymbolHasLayer[sym], 6);
                }
                debugTrace("exportSymbolSprites: subsymbolHasLayer is " + subsymbolHasLayer, 6);
                //debugAlert("Isolated all " + symbolLayerNames[lay] + " layers in subsymbols of " + timeline.name + ". Exporting.", 2);

                // Export sprite with the symbols as they currently are
                debugTrace("exportSymbolSprites:      Exporting " + libItem.name + ", layer name " + symbolLayerNames[lay], 2);
                timer.mark("exportSymbolSprites:      Exporting " + libItem.name + ", layer name " + symbolLayerNames[lay]);
                exportLayers(libItem, layers, visibleLayerTimelineIdx, symbolLayerNames[lay], layerState, exportList, exportScale, symbolLayerNames.layerTable);
                timer.mark("exportSymbolSprites: Done Exporting " + libItem.name + ", layer name " + symbolLayerNames[lay]);
                
                for( sym = 0; sym < visibleSymbols.length; sym++)
                {
                    exported = true;
                    debugTrace("exportSymbolSprites: Restoring layer properties on " + visibleSymbols[sym].name);
                    //library.editItem(visibleSymbols[sym].name);
                    restoreLayerProperties(layerProperties[sym], visibleSymbols[sym].timeline.layers);
                    debugTrace("exportSymbolSprites: Restored layer properties on " + symbolLayerNames[lay]);
                }
                timer.mark("exportSymbolSprites: Done restoring layer props in subsymbols of " + libItem.name);
                // Return to editing the master symbol
                //library.editItem(libItem.name);
                restoreLayerProperties(layerState, libItem.timeline.layers);
                timer.mark("exportSymbolSprites: Returned to and restored layer props in " + libItem.name);
            }        
        }
    }
    
    // If byLayerName is false or if nothing was exported in 
    // the previous block, do a plain export without lines 
    // and fills and stuff
    if(!exported)
    {
        debugTrace("exportSymbolSprites: Exporting " + libItem.name, 5);
        timer.mark("exportSymbolSprites:      Exporting " + libItem.name);
        exportLayers(libItem, layers, visibleLayerTimelineIdx, "", layerState, exportList, exportScale);
        timer.mark("exportSymbolSprites: Done Exporting " + libItem.name);
    }
    
    //        
    //    Unguide all the visible layers
    debugTrace("About to restore layer properties");
    for(i = 0; i < layers.length; i++)
        debugTrace("\t" + layers[i].name + ": type = " + layerState.types[i] + " parent = " + (layerState.parents[i] ? layerState.parents[i].name : "null"));
    //library.editItem(libItem.name);
    restoreLayerProperties(layerState, libItem.timeline.layers);
    // Remove the old data from the doc
    timer.mark("exportSymbolSprites:      Removing data from doc");
    doc.removeDataFromDocument(DOC_DATA_ARRAY_NAME);
    doc.removeDataFromDocument(DOC_DATA_LAYER_NAME);
    doc.removeDataFromDocument(DOC_DATA_SCALE);
    timer.mark("exportSymbolSprites: Done Removing data from doc");

    // Report export list
    exportReport = "Exported sprites:\n";
    for(i = 0; i < exportList.length; i++)
        exportReport += exportList[i] + "\n";
    trace(exportReport);
}

//---------------------------------------------------------------

exportLayers = function(libItem, layers, visibleLayerTimelineIdx, symbolLayerName, layerState, exportList, exportScale, layerTable)
{
    var library = doc.library;
    var i;
    var timeline = libItem.timeline;
    var hash;

    debugTrace("-----------exportLayers: Working with " + libItem.name + ", looking for layers called \"" + symbolLayerName + "\"", 5);
    
    // Let's make sure we're in the right symbol First
    //library.editItem(libItem.name);
    
    //    layerAssignments = hashtable of visible layers, with the hash being the layer name
    var layerAssignments = new Object;
    
    //    visibleLayers = array of all the layers that aren't guided out
    var visibleLayers = [];

    timer.mark(libItem.name + ": Filling out visibleLayers and layerAssignments");
    // Fill out visibleLayers and layerAssignments
    for(lay = 0; lay < layers.length; lay++)
    {
        if(layers[lay].layerType !== "guide" && 
			layers[lay].layerType !== "mask" && 
			layers[lay].layerType !== "folder" && 
			layers[lay].name.slice(-CONSTANT_SUFFIX.length) !== CONSTANT_SUFFIX &&
                layers[lay].name.slice(0, IGNORE_PREFIX.length) !== IGNORE_PREFIX)
        {
            debugTrace("-----------exportLayers: " + layers[lay].name + " is a visible layer in " + libItem.name, 6);
            var hash = stringToHash(layers[lay].name); 
            
            visibleLayers.push(layers[lay]);
            visibleLayerTimelineIdx.push(lay); // the index into the layer list for this entry in visibleLayers
             
            // Create an array for this layer name in the hashtable
            layerAssignments[hash] = [];
            layerAssignments[hash].exported = false;
            // Fill it with -1 for every frame
            fillArray(layerAssignments[hash], LAYER_ASSIGNMENT_UNINITIALIZED, 0, layers[lay].frameCount);
        }
    }

    timer.mark(libItem.name + ": Finding Z heights");
    //    For each in visibleLayers
    for(i = 0; i < visibleLayers.length; i++)
    {
        var fr = 0;
        hash = stringToHash(visibleLayers[i].name);
        var frames = visibleLayers[i].frames;
        debugTrace("-----------exportLayers: visible layer " + i + ": " + visibleLayers[i].name, 6);
        if(visibleLayers[i].name.slice(0, IGNORE_PREFIX.length) !== IGNORE_PREFIX)
        {
            //for each frame, record the Z height in its layer hash entry
            debugTrace("-----------exportLayers: Iterating through " + frames.length + " frames", 2);
            for(f = 0; f < frames.length; f++ )
            {
                debugTrace("-----------exportLayers: " + visibleLayers[i].name + " Frame " + f + " layer " + visibleLayerTimelineIdx[i] + " has " + frames[f].elements.length + " elements", 5);
                // Save the layer height in the layer assignments hashtable
                // Only save the data if this frame isn't empty and the data for this frame hasn't been assigned yet (i.e. it's currently -1)
                if ( frames[f].elements.length !== 0 && layerAssignments[hash][f] === LAYER_ASSIGNMENT_UNINITIALIZED)
                {
                    debugTrace("-----------exportLayers: hash = " + hash + ", f = " + f + ", i = " + i + ", visibleLayerTimelineIdx[i] = " + visibleLayerTimelineIdx[i], 5);
                    layerAssignments[hash][f] = visibleLayerTimelineIdx[i];
                }
            }
        }
        debugTrace("-----------exportLayers: layerAssignments[hash] = " + layerAssignments[hash], 5);
    }
    
    debugTrace("-----------exportLayers: There are " + visibleLayers.length + " visible layers", 2);
    
    debugTrace("-=-=-=-=-=-=-=-=-=-= exportLayers: guiding out all layers in " + timeline.libraryItem.name, 10);

    for(i = 0; i < visibleLayers.length; i++)
    {
        debugTrace("-----------exportLayers: Looping through visible layers " + (i + 1) + " of  " + visibleLayers.length, 6);
        debugTrace("-----------exportLayers: This layer is " + visibleLayers[i].name, 6);
        debugTrace("-----------exportLayers: This layer's index is " + visibleLayerTimelineIdx[i], 6);
        debugTrace("-----------exportLayers: symbolLayerName is " + symbolLayerName, 6);
        debugTrace("-----------exportLayers: symbolStructure.getSymbolLayerHasChildWithLayer('" + libItem.name + "', " + 
                    visibleLayerTimelineIdx[i] + ", '" + symbolLayerName + "') is " +
                    symbolStructure.getSymbolLayerHasChildWithLayer(libItem.name, visibleLayerTimelineIdx[i], symbolLayerName), 10);
        
        if(symbolLayerName === "" || symbolStructure.getSymbolLayerHasChildWithLayer(libItem.name, visibleLayerTimelineIdx[i], symbolLayerName))
        {
            var layerName = visibleLayers[i].name
            hash = stringToHash(layerName);
            
            debugTrace("-----------exportLayers: Exporting #" + (i + 1) + ": " + layerName, 6);
            
            debugTrace("-----------exportLayers: Has #" + (i+1) + ", '" + layerName + "' been exported yet? " + (layerAssignments[hash].exported ? "yes" : "no"), 2);
            // If this hash hasn't been exported yet....
            if( layerAssignments[hash].exported !== true )
            {
                debugTrace("-----------exportLayers: Nope. Let's do it. Starting " + (i+1) + " of " + visibleLayers.length + " visible layers",2);

                //    Guide out all the visible layers
                timer.mark(libItem.name + ": Guiding everything");
                guideAll(layers);
                
                debugTrace("-----------exportLayers: 1 visibleLayers lenght: " + visibleLayers.length,5);

                //Unguide this layer and any with the same name
                timer.mark(libItem.name + ": Unguiding " + layers[visibleLayerTimelineIdx[i]].name);
                unguideLayerByName(layers, layers[visibleLayerTimelineIdx[i]].name, layerState);
                // export sprite sheet from this library item with the layer number metadata included
                // This is a bit of a kludge but I don't see how else I can pass data to the metadata encoder
                
                debugTrace("-----------exportLayers: 2 visibleLayers lenght " + visibleLayers.length + " visible layers",5);

                // Add the layer height data to the document
                debugTrace("-----------exportLayers: Adding data to document: " + layerAssignments[hash]);
                debugTrace("-----------exportLayers:              Layer name: " + layerName);
                timer.mark(libItem.name + ": Adding data to the doc");
                doc.addDataToDocument(DOC_DATA_ARRAY_NAME, "integerArray", layerAssignments[hash]);
                doc.addDataToDocument(DOC_DATA_LAYER_NAME, "string", layerName);
                doc.addDataToDocument(DOC_DATA_SCALE, "double", exportScale);

                debugTrace("-----------exportLayers: 3 visibleLayers lenght " + visibleLayers.length + " visible layers",5);
                
                try
                {
                    sse = new SpriteSheetExporter;

                    sse.beginExport();
                    var docFolder = doc.pathURI.slice(0, doc.pathURI.lastIndexOf("/") + 1);
                    var saveFolder = docFolder + SPRITES_SUBFOLDER;
                    
                    if(CREATE_FOLDER_FILENAME)
                        // Add the Flash file's base name as a folder
                        saveFolder += doc.pathURI.slice(doc.pathURI.lastIndexOf("/") + 1, doc.pathURI.lastIndexOf(".")) + "/"; 
                    if(CREATE_FOLDER_SCENE)
                        // Add the scene name as a folder
                        saveFolder += stringToFileSafe(doc.timelines[doc.currentTimeline].name) + "/";
                    if(CREATE_FOLDER_SYMBOL)
                        // Add the symbol name as a folder
                        saveFolder += stringToFileSafe(libItem.name) + "/";
                        
                    timer.mark(libItem.name + ": Creating missing folders");
                    if(CREATE_FOLDER_FILENAME || CREATE_FOLDER_SCENE || CREATE_FOLDER_SYMBOL)
                        FLfile.createFolder(saveFolder);

                    var folderExists = FLfile.exists(saveFolder);
                    
                    var filesafeLibItemName;
                    if(TRIM_LIBRARY_FOLDERS_FOR_FILENAME)
                        filesafeLibItemName = libItem.name.slice(libItem.name.lastIndexOf("/") + 1)
                    else
                        filesafeLibItemName = stringToFileSafe(libItem.name);
                    
                    debugTrace("filesafe libItem name: " + filesafeLibItemName, 9);

                    sse.addSymbol(libItem, 0, libItem.timeline.frameCount);
                    
                    var exportFile;
                    if(folderExists)
                    {
                        debugTrace("Folder already exists: " + saveFolder, 9);
                        exportFile = saveFolder + filesafeLibItemName + "_" + layerName;
                    }
                    else
                    {
                        exportFile = docFolder + filesafeLibItemName + "_" + layerName;
                        debugTrace("Warning: couldn't create folder " + saveFolder + ". Exporting to " + docFolder + " instead.", 9);
                    }
                    
                    if(symbolLayerName)
                        exportFile += "_" + symbolLayerName;

                    debugTrace("-----------exportLayers: 4 visibleLayers lenght " + visibleLayers.length + " visible layers",2);

                    sse.layoutFormat = "JSON-Stacked";
                    sse.allowTrimming = false;
                    
                    var exportFormat = {format: "png", backgroundColor: "#00000000", bitDepth: 32};

                    debugTrace("-----------exportLayers: Exporting to: " + exportFile + ".png", 5);
                    debugAlert("About to export " + filesafeLibItemName + " on symbol " + layerName + " with isolated layer " + symbolLayerName, 5);
                    timer.mark(libItem.name + ": Exporting sublayer " + exportFile);
                    sse.exportSpriteSheet(exportFile, exportFormat, true);
                    timer.mark(libItem.name + ": Exported sublayer " + exportFile);
                    debugTrace("-----------exportLayers: Exported sprites: " + exportFile, 2);

                    debugTrace("-----------exportLayers: 5 visibleLayers lenght " + visibleLayers.length + " visible layers",2);
                    
                    exportList.push(exportFile);
                    
                    // Clean up
                    layerAssignments[hash].exported = true;
                    sse = null;
                    debugTrace("-----------exportLayers: 6 visibleLayers lenght " + visibleLayers.length + " visible layers",2);
                } catch(e) {
                    fl.trace("Error in exportDocument: " + e.toString());
                    fl.trace("We were trying to export to " + exportFile);
                    return false;
                }      
            }
            debugTrace("-----------exportLayers: Done with " + (i+1) + " of " + visibleLayers.length, 2);
            debugTrace("-----------exportLayers: 7 visibleLayers lenght " + visibleLayers.length + " visible layers",2);
        }
        debugTrace("-----------exportLayers: 8 visibleLayers lenght " + visibleLayers.length + " visible layers",2);
    }    
}

//---------------------------------------------------------------

adjustExportScale = function(symbolsToExport, scale)
{
    var tl = doc.getTimeline();
    var lib = doc.library;
    var newSymbolList = []
    var originalName;

    // Duplicate all those symbols
    for(var i = 0; i < symbolsToExport.length; i++)
    {
        originalName = symbolsToExport[i].name;
        debugTrace("adjustExportScale: Adjusting scale on " + originalName,4)
        // Select it in the lib
        lib.selectItem(originalName);
        debugTrace("adjustExportScale: Library selection length: " + lib.getSelectedItems().length + "; selected item 0: " + lib.getSelectedItems()[0].name,4)
        // Let's save that one for later
        if(!(lib.renameItem(originalName + SCALED_NAME_SUFFIX)))
        {
            alert("Error: unable to rename selected item " + originalName);
            return null;
        }
        //debugAlert("renamed original " + originalName);
        //Duplicate
        if(!(lib.duplicateItem()))
        {
            alert("Error: unable to duplicate selected item " + originalName);
            return null;
        }
        //debugAlert("duplicated original " + originalName);
        
        // and rename it to the original name for temp manipulation
        // (I do it like this on the very small chance that the original symbol has data saved in it)
        if(!(lib.renameItem(originalName)))
        {
            alert("Error: unable to rename temp library item from " + lib.getSelectedItems()[0].name+ " to " + originalName);
            return null;
        }
        //debugAlert("Renamed " + (originalName + SCALED_NAME_SUFFIX) + " to " + originalName);
        
        var newSymbol = lib.getSelectedItems()[0];
        
        // Add the new duplicate to the return list
        newSymbolList.push(lib.getSelectedItems()[0]);
        //Save the edit place, just to be safe
        //var editPlace = save_edit_place();
        // Edit the symbol and scale its timeline
        //lib.editItem();
        transformTimeline({a: scale, b: 0, c: 0, d: scale, tx: 0, ty: 0}, true);
        //restore_edit_place(editPlace);
    }  

    // Return new symbol list
    return newSymbolList;
}

//---------------------------------------------------------------

getSymbolLayerNames = function(symbols, mainSymbol)
{
    // Keep track of which layer names have been recorded
    var layerTable = new Object;
    var layerNameList = [];
    // One entry for each symbol in symbols.
    // Each entry is an array with an entry for each unique layer name inside the symbol
    var symbolTable = new Object;
    var library = doc.library;

    debugTrace("-----------------getSymbolLayerNames", 2);
    //var editPlace = save_edit_place();
    for(var i = 0; i < symbols.length; i++)
    {
        var symbolHash = stringToHash(symbols[i].name);
        if(symbolTable[symbolHash] !== true)
        {
            var tl = symbols[i].timeline;
            var layers = tl.layers;
            for(var lay = 0; lay < layers.length; lay++)
            {
                // Only look for layers that display outside the symbol, and exclude anything starting with IGNORE_PREFIX
                if(layers[lay].layerType !== "guide" &&
                    layers[lay].layerType !== "folder" &&
                    layers[lay].layerType !== "mask" &&
                    layers[lay].name.slice(0, IGNORE_PREFIX.length) !== IGNORE_PREFIX)
                {
                    var layerHash = stringToHash(layers[lay].name);
                    debugTrace("getSymbolLayerNames: next layer name: " + layers[lay].name + ", layer hash is " + layerHash + ", value is " + layerTable[layerHash], 6);
                    if(layerTable[layerHash] === undefined)
                    {
                        layerTable[layerHash] = new Object;
                        layerNameList.push(layers[lay].name);
                    }
                    var mainLayers = mainSymbol.timeline.layers;
                    for(var mainLayer = 0; mainLayer < mainLayers.length; mainLayer++)
                    {
                        debugTrace("getSymbolLayerNames: symbolStructure.getSymbolLayerHasChild('" + 
                            mainSymbol.name + "', " + mainLayer + ", '" + mainLayers[mainLayer].name + 
                            "', '" + symbols[i].name + "') is " + 
                            symbolStructure.getSymbolLayerHasChild(mainSymbol.name, mainLayer, mainLayers[mainLayer].name, symbols[i].name), 10);
                        if(symbolStructure.getSymbolLayerHasChild(mainSymbol.name, mainLayer, mainLayers[mainLayer].name, symbols[i].name))
                            symbolStructure.setSymbolLayerHasChildWithLayer(mainSymbol.name, mainLayer, mainLayers[mainLayer].name, symbols[i].name, layers[lay].name);
                    }
                    // Record relevant information into the symbol structure object
                    symbolStructure.setSymbolHasChildWithLayer(mainSymbol.name, layers[lay].name);
                }
            }
            symbolTable[symbolHash] = true;
        }
    }

    // Now layerTable is a [hashtable keyed to subsymbol names] containing 
    // [an array of main timeline layer indices] indicating whether the 
    // subsymbol layer name appears within that main layer. Man, this is 
    // convoluted.

    //restore_edit_place(editPlace);
    debugTrace("layerNameList: " + layerNameList, 2)
    
    return layerNameList;
}

//---------------------------------------------------------------

exportSelectedSprites = function()
{
    var i;
    var byLayerName = true;
    var exportScale;

    var selectionRect = doc.getSelectionRect()
    //var progress = new ProgBar((selectionRect.left + selectionRect.right) / 2,
     //                           (selectionRect.top + selectionRect.bottom) / 2);
                                
    if(DEBUG)
    {
        fl.outputPanel.clear();
    }
    selectedStageElements = doc.selection;
    var itemsToExport = [];
    
    debugTrace("Number of stage items selected: " + selectedStageElements.length);
    
    if(EXPORT_FROM_LIBRARY)
    {
        var librarySelectedItems = doc.library.getSelectedItems();

        debugTrace("Number of library items selected: " + librarySelectedItems.length);

        // Add the selected library items to the list of things to export
        itemsToExport = itemsToExport.concat(librarySelectedItems);
    }
    
    if(EXPORT_FROM_STAGE)
    {
        // For each selected stage item that is an instance of a library symbol
        for(i = 0; i < selectedStageElements.length; i++)
        {
            if(selectedStageElements[i].libraryItem)
            {
                // Add that to the list of items to export
                itemsToExport.push(selectedStageElements[i].libraryItem);
            }
        }
        
        // Now make sure I haven't included the same symbol twice
        var symbolIncluded = new Object;
        for(i = 0; i < itemsToExport.length; i++)
        {
            if(symbolIncluded[HASH_PREFIX + itemsToExport[i].name])
            {
                debugTrace("There was a duplicate library item selected: " + itemsToExport[i].name + ". Removing it.");
                // It appearedearlier in the list, so remove this one.
                itemsToExport.splice(i, 1);
            }
            else
                symbolIncluded[HASH_PREFIX + itemsToExport[i].name] = true;
        }

    }

    debugTrace("Between the stage and the library, I found " + itemsToExport.length + " symbols to export");
    
    if(itemsToExport.length === 0)
    {
        if(EXPORT_FROM_STAGE)
        {
            if(EXPORT_FROM_LIBRARY)
                alert("Please select one or more symbols on the stage and/or in the library from which to generate sprites.");
            else
                alert("Please select one or more symbols on the stage from which to generate sprites.");
        }
        else if(EXPORT_FROM_LIBRARY)
            alert("Please select one or more symbols in the library from which to generate sprites.");
        else // neither EXPORT_FROM_STAGE nor EXPORT_FROM_LIBRARY is true
        {
            alert("Error: One or both of EXPORT_FROM_LIBRARY and EXPORT_FROM_STAGE must be set to true in the script.");
            return;
        }
    }
    else
    {
        var panelResult = showDialogBox(itemsToExport);
        timer = new Profiler();
        if(panelResult.dismiss === "accept")
        {
            if(isNaN(panelResult.exportScale))
                alert("Please enter a positive number for export scale. A value of 100 indicates the sprites should be exported as-is.");
            else
            {
                itemsToExport = applyDialogToExportList(panelResult, itemsToExport);
                byLayerName = (panelResult.exportSeparately === "true");
                exportScale = Number(panelResult.exportScale) / 100.0;

                timer.mark("Saving edit place");
                edit_stack = save_edit_place();
                timer.mark("Saved edit place");
                
                var tempLayerIndex = -1;
                if(exportScale !== 1)
                {
                    itemsToExport = adjustExportScale(itemsToExport, exportScale);
                }
                
                //alert("boo!");
                //For each selected library item:
                for(i = 0; i < itemsToExport.length; i++)
                {
                    timer.mark("Exporting " + itemsToExport[i].name);
                    debugTrace("=========================Exporting " + itemsToExport[i].name,8);
                    exportSymbolSprites(itemsToExport[i], byLayerName, exportScale);
                    debugTrace("=========================Exported " + itemsToExport[i].name,8);

                    //progress.setProgress(i+1 / itemsToExport.length);
                 
                    // Now delete temp symbol if we used one
                    if(exportScale !== 1)
                    {
                        library.deleteItem(itemsToExport[i].name);
                        library.selectItem(itemsToExport[i].name + SCALED_NAME_SUFFIX);
                        if(!(library.renameItem(itemsToExport[i].name)))
                            fl.trace("Warning: unable to revert temp symbol name. " + 
                                        itemsToExport[i].name + " has been accidentally renamed to " + (itemsToExport[i].name));
                    }
                }
                //progress.end();
                timer.mark("Done Exporting symbols");
                restore_edit_place(edit_stack);
                timer.mark("Restored edit place");
            }
        }
    }
}

//====================================================================================

debugTrace("Exprting sprites for selected symbols", 8);
exportSelectedSprites();
debugTrace("Exported sprites for selected symbols", 8);
timer.mark("Done");
debugTrace(timer, 7);