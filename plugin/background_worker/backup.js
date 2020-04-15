/*
 * 
 *   	ROSI - Raltime Online Streaming with IOTA
 * 
 * 
 * 				BACKUP WORKER SCRIPT
 * 
 * 
 * 		Updated: 26.03.2020
 * 
 * */


importScripts('./rosi_conserver.browser.js');
importScripts('../localstorage.js');
importScripts('../version.js');


/////////////////////////////		CREATE BACKUP 				////////////////////////////////////

// Create, encrypt and send backup to RosiConserver server
// Backups the following parts:
// 	-> wallet
//  -> channel information files
//  -> Active channel queue
//  -> closed channel queue
//  -> new channel queue
//  
//	==> DOES NOT BACKUP OLD WALLET BACKUPS
var createBackup = function(url, usrId, pw, backupClosedChannels)
{
	// Wallet
	return new Promise((resolve, reject) => {
		
		let files = 	[	"ROSI_WALLET", 
							"NEWCHANNEL_QUEUE", 
							"ACTIVECHANNEL_QUEUE", 
							"rosi_global_settings"
						];
						
		if(backupClosedChannels){
			files.push("CLOSEDCHANNEL_QUEUE");
		}
		let data = {};
		
		(function getData(){
			let file = files.shift();
			readFile(file, (e, jsondata) => {
				let skip = false;
				if(e) {
					if(e.code !== 'ENOENT')
					{
						reject("Error Opening file! Is database initialized?");
						return;
					}
					else if(files.length > 0)
					{
						skip = true;
					}
				}
				
				if(skip === false)
				{
					data[file] = JSON.parse(jsondata);
					
					if(file === "ACTIVECHANNEL_QUEUE" || file === "CLOSEDCHANNEL_QUEUE" && 
						typeof data[file] === 'object')
					{
						data[file].forEach((c) => {
							if(c !== null && typeof c ===  'object' && 
								typeof c.depositAddress === 'string')
							{
								files.push(c.depositAddress);
							}
						});
					}
				}
				
				if(files.length > 0)
				{
					getData();
					return;
				}
				else
				{
					// all data read -> backup
					let backupString = JSON.stringify(data);
					
					let request = {
						name: 'Add-Backup',
						rosiVersion: ROSI_VERSION,
						userId: usrId,
						pwHash: rosi_conserver.createPwServerChecksum(pw),
						data: rosi_conserver.encrypt(backupString, pw)
					};
					
					rosi_conserver.submit(url, request).then((response) => {
						
						console.log("Server returned data: ", response.data, 
										'\nHeader: ', response.header);
						
						if(response.data == "BACKUP_SAVED")
						{
							console.log("RosiConserver has saved backup successfully.");
							resolve("BACKUP_SAVED");
						}
					
					}).catch(e => {
						console.log("Connection error - Is the selected server online?");
						reject("SAVE_ON_SERVER_ERROR");
					});
				}
			});
		})();
	});
}


/////////////////////////			RESTORE BACKUP 			////////////////////////////////////////

var restoreBackup = function(url, usrId, pw, restoreNo)
{
	console.warn('url: ' + url, 'usrId: ' + usrId, 'pw: ' + pw, 'restoreNo: ' + restoreNo);
	return new Promise((resolve, reject) => {
		let request = {
			name: 'Restore-Backup',
			rosiVersion: ROSI_VERSION,
			userId: usrId,
			pwHash: rosi_conserver.createPwServerChecksum(pw),
			data: 'Restore-Number: ' + restoreNo
		};
	
		rosi_conserver.submit(url, request).then((response) => {
		//	console.log("Server returned data: ", response.data, '\nHeader: ', response.header);
			let data;
			try
			{
				data = JSON.parse(rosi_conserver.decrypt(response.data, pw));
			}catch(e)
			{
				console.log("Data decryption failed; correct password submitted? Error: " + e);
				reject("DECRYPTION_ERROR");
			}
			
			console.log("Received data:", data);
			let files = [];
			for (var filename in data) {
			   if (data.hasOwnProperty(filename)) {
					console.log(filename, JSON.stringify(data[filename]));
					files.push({name: filename, data: JSON.stringify(data[filename])});
			   }
			}
			
			(function putData(){
				let file = files.shift();
				writeFile(file.name, file.data, (err) => {
					if(err)
					{
						reject("WRITE_FILE_ERROR");
					}
					else if(files.length > 0)
					{
						putData();
						return;
					}
					// Restart/Init workers
					resolve("FILES_WRITTEN");
					return;
				});
			})();
		});
		
	});
}



/////////////////////////			MESSAGES FROM BACKGOUND		////////////////////////////////////

onmessage = function(e) 
{
	let m = e.data;
	let request = m.request;
	
	if(request == 'create')				// Create new backup
	{
		createBackup(m.url, m.usrId, m.pw, (typeof m.backupClosedChannels == 'undefined') ? true 
			: m.backupClosedChannels).then(retval => {
				
			postMessage({ request: 'backup_created' });
		}).catch( e => {
			postMessage({ request: 'error', retval: e.toString() });
		});
	}
	else if(request == 'restore')		// restore backup
	{
		restoreBackup(m.url, m.usrId, m.pw, (typeof m.restoreNo == 'undefined') ? 0 : m.restoreNo
			).then(retval => {
				
			postMessage({ request: 'backup_restored' });
		}).catch( e => {
			postMessage({ request: 'error', retval: e.toString() });
		});
	}
}














