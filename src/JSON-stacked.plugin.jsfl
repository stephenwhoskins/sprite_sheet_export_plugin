var		haveAFrame;
var doc;
var DOC_DATA_ARRAY_NAME = "spriteExportZData";
var DOC_DATA_LAYER_NAME = "spriteExportLayerName";
var DOC_DATA_SCALE      = "spriteExportScale";
var DEBUG = false;
var zHeight;
var layerName;
var exportScale;

//------------------------------------------

debugTrace = function(str)
{
    if(DEBUG)
        fl.trace("JSON-STACKED: " + str);
}

//------------------------------------------

function getPluginInfo(lang)
{
	debugTrace("==== getPluginInfo");
	debugTrace(lang);
	debugTrace("---- getPluginInfo");
	
	pluginInfo = new Object();
	pluginInfo.id = "JSON-Stacked";
	pluginInfo.name = "JSON-Stacked";
	pluginInfo.ext = "json";
	pluginInfo.encoding = "utf8";
	pluginInfo.capabilities = new Object();
	pluginInfo.capabilities.canRotate = true;
	pluginInfo.capabilities.canTrim = true;
	pluginInfo.capabilities.canShapePad = true;
	pluginInfo.capabilities.canBorderPad = true;
	pluginInfo.capabilities.canStackDuplicateFrames = true;
	
	return pluginInfo;
}

function AddKey(key)
{
	return "\t\"" + key + "\": ";
}

function AddKeyStr(key, val)
{
	var s = AddKey(key);
	s += "\"";
	s += val;
	s += "\",\n";
	
	return s;
}

function AddKeySize(key, width, height, doComma)
{
	var s = AddKey(key);
	s += "{\"w\":";
	s += width;
	s += ",\"h\":";
	s += height;
	s += doComma ? "},\n" : "}\n";

	return s;
}

function AddKeyNum(key, val, doComma)
{
	var s = AddKey(key);
	s += "\"";
	s += val;
	s += doComma ? "\", " : "\"";

	return s;
}

function AddKeyRect(key, val)
{
	var s = AddKey(key);
	s += "{\"x\":";
	s += val.x;
	s += ",\"y\":";
	s += val.y;
	s += ",\"w\":";
	s += val.w;
	s += ",\"h\":";
	s += val.h;
	s += "},\n";

	return s;
}

function AddKeyBool(key, val)
{
	var s = AddKey(key);
	s += val;
	s += ",\n";

	return s;
}

function beginExport(meta)
{
    debugTrace("==== beginExport");
    debugTrace(meta.app);
    debugTrace(meta.version);
    debugTrace(meta.image);
    debugTrace(meta.format);
    debugTrace("---- beginExport");
	
    haveAFrame = false;
    doc = fl.getDocumentDOM();
    
    // Will this work? Can we pass data from the IDE to this script through document metadata?
    // Retrieve the z height array from the document
    zHeight = doc.getDataFromDocument(DOC_DATA_ARRAY_NAME);
    layerName = doc.getDataFromDocument(DOC_DATA_LAYER_NAME);
    exportScale = doc.getDataFromDocument(DOC_DATA_SCALE) || 1;
    
    debugTrace("Z height fetched from the doc: " + zHeight);
    debugTrace("                   Layer name: " + layerName);
    return "{\"frames\": {\n";
}

function frameExport(frame)
{
//	debugTrace("==== frameExport");
//	debugTrace(frame.id);
//	debugTrace(frame.frame.x);
//	debugTrace(frame.frame.y);
//	debugTrace(frame.frame.w);
//	debugTrace(frame.frame.h);
//	debugTrace(frame.offsetInSource.x);
//	debugTrace(frame.offsetInSource.y);
//	debugTrace(frame.sourceSize.w);
//	debugTrace(frame.sourceSize.h);
//	debugTrace(frame.rotated);
//	debugTrace(frame.trimmed);
//	debugTrace(frame.frameNumber);
//	debugTrace(frame.symbolName);
//	debugTrace(frame.frameLabel);
//	debugTrace(frame.lastFrameLabel);
//	debugTrace("---- frameExport");
	
    debugTrace("Exporting frame " + frame.frameNumber);
    var s = "";
    if (haveAFrame)
        s += ",";

    s += "\n\"" + frame.id + "\":\n";
    s += "{\n";
    s += AddKeyRect("frame", frame.frame);
    s += AddKeyBool("rotated", frame.rotated);
    s += AddKeyBool("trimmed", frame.trimmed);
    s += AddKeyBool("zHeight", zHeight[frame.frameNumber]);
    var spriteSourceSize = new Object();
    spriteSourceSize.x = frame.offsetInSource.x;
    spriteSourceSize.y = frame.offsetInSource.y;
    spriteSourceSize.w = frame.sourceSize.w;
    spriteSourceSize.h = frame.sourceSize.h;
    s += AddKeyRect("spriteSourceSize", spriteSourceSize);
    s += AddKeySize("sourceSize", frame.sourceSize.w, frame.sourceSize.h, false);
    s += "}";

    haveAFrame = true;

    debugTrace("Exporting frame " + frame.frameNumber + " finished.");
    return s;
}

function endExport(meta)
{
	debugTrace("==== endExport");
	debugTrace(meta.app);
	debugTrace(meta.version);
	debugTrace(meta.image);
	debugTrace(meta.format);
//	debugTrace(meta.size.w);
//	debugTrace(meta.size.h);
//	debugTrace(meta.scale);
	debugTrace("---- endExport");
	
	var s = "},\n\"meta\": {\n";
	s += AddKeyStr("app", meta.app);
	s += AddKeyStr("version", meta.version);
	s += AddKeyStr("image", meta.image);
	s += AddKeyStr("format", meta.format);
	s += AddKeySize("size", meta.sheetWidth, meta.sheetHeight, true);
	s += AddKeyStr("layerName", layerName);
	s += AddKeyNum("scale", exportScale, false);    
	s += "\n}\n}\n";

	return s;
}
