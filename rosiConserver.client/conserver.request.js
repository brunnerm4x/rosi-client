/*
 * 		ROSI Conserver - low level request and crypto
 * 
 * 		Helpers for sending data to backup server & encrypting and decrypting data
 * 
 * 		This file needs to be browserified!
 * 
 * 		browserify: 
 * 			browserify conserver.request.js --standalone rosi_conserver -o ../plugin/background_worker/rosi_conserver.browser.js
 * 
 * */

/*

// EXAMPLE REQUEST OBJECT
	let request = {
		name: 'Add-Backup',
		rosiVersion: 'ROSI-Plugin Vers. 0.1',
		userId: 'maxi',
		data: 'DATADATADATADATA'
	};
*/

let ENCRYPTALGORITHM = 'aes256';

let comm = require('./servercomm.browser.js');		// use servercomm.browser.js in production!
let crypto = require('crypto');


// Calculate checksum and send request to backup-server
let submit = function(url, request)
{
	return new Promise((resolve, reject) => {

		// Calculate checksum
		let hash = crypto.createHash('sha256');
		hash.update(request.name + request.rosiVersion + request.userId + request.pwHash + request.data);
		let checksum = hash.digest('hex');
		
		let head =  {	'User-Agent': request.rosiVersion, 
						'Rosi-Request' : request.name,
						'User-Id' : request.userId,
						'Pw-Hash' : request.pwHash,
						'Request-Checksum' : checksum 
					};
		
		comm.toserver(url, head, request.data, (data, header) => {	
				if(data === false)
				{
					reject("Communication Error!");
					return;
				}
				
				resolve({data: data, header: header});
		});	
	});
}

// Create key of rigth length for cipher
let createPwHash = function(pw)
{
	let hash = crypto.createHash('sha256');
	hash.update(pw);
	let c = hash.digest('hex');
	
	return c.slice(0, 32);
}

// Create hash for sending to server to prevent multiple users with same name
let createPwServerChecksum = function(pw)
{
	let hash = crypto.createHash('sha256');
	hash.update(pw);
	let c = hash.digest('utf8');
	
	hash = crypto.createHash('sha256');
	hash.update(c);
	
	return hash.digest('hex');
}

// Encrypt data with provided password (/hash)
let encrypt = function(data, pw)
{
	let iv = crypto.randomBytes(8).toString('hex');
	
	let crypted = iv;
	let cipher = crypto.createCipheriv(ENCRYPTALGORITHM, createPwHash(pw), iv);
	crypted += cipher.update(data, 'utf8', 'hex');
	crypted += cipher.final('hex');
	
	return crypted;
}

// Decrypt data with provided password (/hash)
let decrypt = function(crypted, pw)
{	
	let iv = crypted.substring(0, 16);
	crypted = crypted.substring(16);
	
	let decipher = crypto.createDecipheriv(ENCRYPTALGORITHM, createPwHash(pw), iv);
	let data = decipher.update(crypted,'hex','utf8');
	data += decipher.final('utf8');
	
	return data;
}


module.exports = {
	'submit'	: submit,
	'encrypt'	: encrypt,
	'decrypt'	: decrypt,
	'createPwServerChecksum' : createPwServerChecksum
}

