/*
 * 		rosi client plugin - storage database functions
 * 
 * 		iota wallet and flash channel management
 * 
 * 		wraps needed database functions to writeFile and readFile equivalents
 * 
 * */
 
 // IndexedDB
if (!self.indexedDB) {
    self.alert("Your browser doesn't support a stable version of IndexedDB. The plugin does not work!");
}

var readData;

var db_available;		// let undefined...
var db;

var request = self.indexedDB.open("flash_objects", 1);

request.onerror = function(event) {
  // Do something with request.errorCode!
	console.log("Database creation error!");
	db_available = false;
};

request.onsuccess = function(event) {
  // Do something with request.result!
	
	db = event.target.result;
	db_available = true;
	
};

request.onupgradeneeded = function(event) { 
	// Save the IDBDatabase interface 
	console.log("Database upgrade needed.");
	var db = event.target.result;

	// Create an objectStore for this database
	var objectStore = db.createObjectStore("flash");
};


// Write flash object to database
// callback (err), err is new error when error has occurred, false if success
var writeFile = function(str_filename, str_data, callback)
{
	if(typeof db_available == 'undefined')
	{
		setTimeout(()=>{ writeFile(str_filename, str_data, callback); }, 10);
	}else if(db_available == false){
		callback(new Error('Cannot write flashobject file to database!'));
	}else{
		try
		{
			// create Transaction
			var transaction = db.transaction(["flash"], "readwrite");
			
			var objectStore = transaction.objectStore('flash');
			var req = objectStore.put(str_data, str_filename);
			
			transaction.oncomplete = function(event) {
				// Finished
				callback(false);
			};
			
			transaction.onerror = function(event) {
			  callback(new Error('Error updating DB'));
			};
		}catch(e)
		{
			callback(e);
		}
	}
}


// Get flash object from database
// callback (err, data)
var readFile = function(str_filename, callback)
{
	if(typeof db_available == 'undefined')
	{
		setTimeout(()=>{ readFile(str_filename, callback); }, 10);
	}
	else if(db_available == false)
	{
		callback(new Error('Cannot read flashobject file from database!'), false);
	}else{
		try
		{
			var transaction = db.transaction(["flash"]);
			var objectStore = transaction.objectStore("flash");
			
			var req = objectStore.get(str_filename);
			
			req.onerror = function(event) {
				callback(new Error('Error reading DB.'), false);
				return;
			};
			
			req.onsuccess = function(event) {
				if(typeof event.target.result != 'undefined')
				{
					callback(false, event.target.result.toString());
				}else
				{
					// DB Entry not found, return File not found
					callback({code:'ENOENT'}, false);
				}
			};
			
		}catch(e)
		{
			callback(e, false);
		}
	}
}

if(typeof module != 'undefined')
{
	module.exports = {
		'writeFile'		: writeFile,
		'readFile'		: readFile
	}
}






















