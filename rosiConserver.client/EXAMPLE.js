
const rosi_conserver = require('./conserver.request.js');

let rawData = 'DATADATADATADATADATA';
let pw = "password";

// input values
let request = {
		name: 'Add-Backup',
		rosiVersion: 'ROSI-Plugin Vers. 0.1',
		userId: 'maxi',
		data: rosi_conserver.encrypt(rawData, pw)
	};
	
// console.log("Data decrypted: ", rosi_conserver.decrypt(request.data, pw));


rosi_conserver.submit('http://localhost:12000', request).then((response) => {
	
	console.log("Server returned data: ", response.data, '\nHeader: ', response.header);
	
	console.log("Now restoring...");
	
	let request = {
		name: 'Restore-Backup',
		rosiVersion: 'ROSI-Plugin Vers. 0.1',
		userId: 'maxi',
		data: 'Restore-Number: 0'
	};
	
	rosi_conserver.submit('http://localhost:12000', request).then((response) => {
		console.log("Server returned data: ", response.data, '\nHeader: ', response.header);
		console.log("Data decrypted: ", rosi_conserver.decrypt(response.data, pw));
	});
}).catch(e => {
	console.log("Connection error - Is the selected RosiConserver server online?");
});

