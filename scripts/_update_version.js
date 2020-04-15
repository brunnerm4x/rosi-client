/*
 * 
 * 		SCRIPT TAKES VERSION OF manifest.json 
 * 
 * 		Increases MINOR version and writes new version to 
 * 	
 *			plugin/manifest.json AND 
 * 			plugin/version.js
 * 			package.json 			
 * */


let fs = require("fs");

try
{
	let manifest = JSON.parse(fs.readFileSync("../plugin/manifest.json"));
	let package = JSON.parse(fs.readFileSync("../package.json"));
	
	let version = manifest.version.split(".");
	console.log("Current version: ", manifest.version);
	
	version[2] = String(Number(version[2]) + 1);
	manifest.version = version.join('.');
	package.version = manifest.version;
	console.log("New version:", manifest.version);

	fs.writeFileSync("../plugin/manifest.json", JSON.stringify(manifest, null, 2));	
	fs.writeFileSync("../package.json", JSON.stringify(package, null, 2));	
	
	// Now create version file for use in plugin background ...
	fs.writeFileSync("../plugin/version.js", 
		"// This script is created automatically when calling\n" + 
		"// node _update_version.js\n" + 
		"var ROSI_VERSION = '" + manifest.version + "';");
}
catch(e)
{
	console.error("Error occurred updating manifest: ", e);
}

