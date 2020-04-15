/*
 * IOTA PAY - Payment client 
 * 
 * 
 * 	flashchannel
 * 
 * 	with browserify --> rosi_main (rosi_main.browser.js) in plugin/background_worker
 * 
 *  browserify client_pay_main.js --standalone rosi_main -o plugin/background_worker/rosi_main.browser.js
 * 
 * 
 * 		ATTENTION: 		Comments with DTOF == Differences to original flash 
 * 
 * 					Added an addional layer: the deposit address is now different from 
 * 						the flash tree root, this means:
 * 
 * 							-> 1 additional multisig address (deposit)
 * 							-> 1 additional field in flash object for this new address & bundles (depositObject)
 * 							-> 1 additional transaction when channel is started (from deposit to root)
 * 							-> while channel active, everything is like in original library
 * 							-> when channel closes, an additional/different to normal bundle is crated (2nd outgoing transaction from deposit):
 * 									=> the closing bundle which takes input from deposit address (outputs are same as original)
 * 									=> the original closing transaction can also be crated, but is not planned to be used (more addional bundles down the tree would be necessary to be attached
 * 							
 * 						=> advantage: only one bundle to be attached to tangle when channel is closed normally (without disputes)
 * 
 * 	ChannelID: deposit address of flash-channel 
 * 
 * */

const request = require('request');
const crypto = require('crypto');

const multisig = require('iota.flash.js').multisig;
const transfer = require('iota.flash.js').transfer;
const IOTA = require('iota.lib.js');
var iota = new IOTA();

// Must be provided by website script in final product! for testing purposes with nodejs the 
// functions can be called directly by requiring this file:
// const comm_webserv = require('./website_function.nodejs.dev.js');

// Communication with webserver functions
const comm_webserv = require('./client_pay_communication.js');

// Only nodejs when debugging
// const fs = require('fs');
const fs = require('./localstorage.js');
const __flash_object_prefix = ""; //  "__dev_flash_objects/" //  for nodejs version


// System Constants
const ALLOWED_SEED_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ9";
const IOTA_SECURITY = 2;
const IOTA_STDMSG = 'SENT9WITH9ROSI9PLUGIN';
const IOTA_STDTAG = '9SENT9WITH9ROSI9PLUGIN99999';


// Create a new flash channel
// callback optional callback(flash) with new flash object
var createChannel = function(url_payserv, tx_cnt_min, collateral, usrSettlement, callback_create)
{
	usrSettlement = iota.utils.noChecksum(usrSettlement);
	var flash = createFlashObject(url_payserv, tx_cnt_min, collateral, usrSettlement);
	
	createSendDigests(flash, function(flash, digests){
		
		if(flash != false)
		{
			constructMultisigs(flash, digests, (err)=>{
				if(err)
				{
					callback_create(false)
					return -1;
				}
				
				if(typeof callback_create == 'function'){
					callback_create(flash);
				}
			});
		}
		else
		{
			callback_create(false);
		}
		
		return false;
	});	
}

// Close the flash channel, distribute remaining collateral back to owner
// callback(signedBundles), callback(false) if error
// depositAddressBalance = real balance on deposit Address, if because of some (user)
// error there has been sent more than the channel balance, and server is not malicious 
// the remaining balance is sent back to client wallet (-1 means ignore reality and
// proceed with setup flash channel balance)
var closeChannel = function(depositAddress, depositAddressBalance = -1, callback)
{
	if(typeof depositAddressBalance == 'function')
	{
		callback = depositAddressBalance;
		depositAddressBalance = -1;
	}
	
	fs.readFile(__flash_object_prefix + depositAddress, (err, data)=>{
		var flash = JSON.parse(data);
		closeFlashTree(flash, depositAddressBalance, function(e, bundles){
			if(!e)
			{
				callback(bundles);
			}else{
				console.error('Error closing channel:', e);
				callback(false);
			}
		});
	});
}

// deposit Address serves as ID
// callback(error);
// DTOF: close is not used anymore -> new close function with special bundle
var pay = function(channelId, amount, message = "", callback = function(e){}, close = false)						// CHANGED deposit->channelID!!!!
{
	var flash;
	
	if(typeof message == "function")	// exchange optional parameters
	{		
		callback = message;
		message = "";
	}
	
	try{
			let toUse;
			
			fs.readFile(__flash_object_prefix + channelId, (err, data)=>{
			// 1. check if flash object could be restored
			if(err){
				console.error("pay open file error:",err);
				callback('Cannot open channel file!');
				return;
			}
			
			// Enough multisigs are created and rightly appended to toUse
			// Now the bundles can be created, signed, sent to payserver,
			// there also signed, sigs sent back, bundles signed and then 
			// appended to the flash object
			var toUseOK_continue = function()
			{
				var bundles;
				var newTansfers;
				var transfers = [{
						value: amount,
						address: flash.settlementAddresses[1]
					}];
						
				try {
					
					if(close === false)
					{
						// Prepare the transfer.
						newTansfers = transfer.prepare(flash.settlementAddresses, flash.deposits, 0, transfers);
					}else
					{
						// Prepare transfer back to user -> close channel
						newTansfers = transfer.close(flash.settlementAddresses, flash.deposits);
					}
					
					// Construct bundle for next state of channel
					bundles = transfer.compose( flash.balance, 		// The total amount of iotas in the channel
												flash.deposits, 	// The amount of iotas still available to each user to spend from
												flash.outputs, 		// The accurred outputs through the channel
												toUse.multisig,		// history the leaf bundles
												flash.remainderAddress,		// String says online doc!
												flash.transfers,	// Transfer History
												newTansfers,		// Array of Outputs for transfer
												close);				// Close
												
				} catch (e) {
					if((""+e).indexOf("2") > -1)		// Unsufficient balance, but obviously not detected in main.js
					{
						console.warn("Error 2 - unsufficient balance not detected by main.js");
						callback('PAYMENT_NOT_ACCEPTED');
						return false;
					}
					console.error("Error: ", e);
					callback('Error paying 1:' + e);
					return false;
				}
				
				// Bundles are now generated
				// Bundles must now be signed by both parties
				var signatures = [];
				signatures[0] = transfer.sign(flash.root, flash.seed, bundles);

				
				exchangeSignatures(flash, bundles, signatures, close, message, function(accepted, signatures, error = false)
				{
					if(accepted)
					{
						try
						{
							// Sign the bundle
							var signedBundles = transfer.appliedSignatures(bundles, signatures[0]);
							signedBundles = transfer.appliedSignatures(signedBundles, signatures[1]);
							
							// Apply bundles, update flash object
							transfer.applyTransfers(flash.root,			// Representation of the current state of the Flash tree
													flash.deposits,		// The amount of iotas still available to each user to spend from
													flash.outputs,		// The accrued outputs through the channel
													flash.remainderAddress,	//The remainder address of the Flash channel
													flash.transfers,	//  Transfer history of the channel
													signedBundles);		// Signed bundle
							
							 console.log("Transfers applied.");

							 fs.writeFile(__flash_object_prefix + flash.depositAddress, JSON.stringify(flash), (err)=>{
								 
								// callback
								callback(err?true:false);
							 });
						}catch (e){
							console.error("Error:", e);
							callback('Error paying 2:' + e);
						}
					}else{
						console.warn("Payment was NOT accepted! Error:" + error);
						if(	error === false || 
							error == 'not enough multisigs available.')
						{
							callback('PAYMENT_NOT_ACCEPTED');	// try resolving ...
						}
						else if(error == 'Deposit to flash root has not happened yet, channel is not correctly initialized!')
						{
							// DEBUG ...
							if(typeof flash.deltedFlashToRootBundles == 'undefined')
								flash.deltedFlashToRootBundles = [];
							flash.deltedFlashToRootBundles.push(flash.depositObject.bundles);
							flash.depositObject.bundles = [];
							initializeFlashTree(flash, (e) => {
								if(e)
								{
									console.error("Re-Initialization of channel failed. Error: ", e);
									callback("REINIT_FAILED");
									return;
								}
								
								// continue / retry
								toUseOK_continue();				
							});
						}
						else
						{
							callback('Unhandled, payment not accepted:' + error);
						}
					}
				});
			}
			
			
			let check_multisigs = () => {
					
				//////////////////////////////
				/// Check for a Branch
				// From the LEAF recurse up the tree to the ROOT
				// and find how many new addresses need to be
				// generated if any.
				toUse = multisig.updateLeafToRoot(flash.root);
				
				if (toUse.generate != 0) 
				{
					// put multisigs to right place in tree
					var digestPoolOK_continue = function()
					{
						// Tell the server to generate new addresses, attach to the multisig you give
						console.log("Need to get", toUse.generate, "new multisigs for the tree.");
						
						let last_multisig = null;
						for( let i = 0; i < toUse.generate; i++) {

							// check if digests are still available from pool
							if( flash.multisig_digest_pool.length == 0 ) {
								console.error('ERROR: multisig pool: not enough multisigs available!');
								// This should never happen, as there should always enough
								// multisigs generated in previous step
								callback('ERROR_MULTISIGPOOL_EMPTY');
								return;
							}

							let new_multisig = flash.multisig_digest_pool.shift();
							console.log("Using new address from pool.");

							// chain branch
							if (last_multisig != null){
								new_multisig.children.push(last_multisig);
							}
							last_multisig = new_multisig;
						}
						toUse.multisig.children.push(last_multisig);
						
						// continue execution with the now correctly appended multisigs
						toUseOK_continue();
					};


					if(toUse.generate - flash.multisig_digest_pool.length > 0)
					{
						console.log("Increasing digest pool ...");
						increaseDigest_pool(flash, toUse.generate - flash.multisig_digest_pool.length, 
							digestPoolOK_continue, (e) => { callback('Error adding digests:' + e); });
					}else{
						digestPoolOK_continue();		// Enough multisigs generated, but not all are appended to the tree
					}
					
				}else{
					toUseOK_continue();		// enough multisig addresses in active tree, can directly continue
				}
			};
			

			// START HERE
			// Flash object file is read, now it can be parsed to get real json object
			flash = JSON.parse(data);		// Restore flash object
			
			// Check if channel opening bundle has been received (transfer from deposit to root)
			if(flash.depositObject.bundles.length < 1)
			{
				console.warn('Deposit to flash root has not happened yet, channel is not ' + 
								'correctly initialized! Will now start init.');
								
				initializeFlashTree(flash, (e) => {
					if(e)
					{
						console.error("Initialization of channel failed. Error: ", e);
						callback("INIT_FAILED");
						return;
					}
					
					// continue
					check_multisigs();					
				});
				return;
			}
			else
			{
				// continue
				check_multisigs();
			}
		 });
	}catch(e){
		console.error("ERROR: cannot continue channel", channelId, ". No flash object file found.");
		callback('NO_FLASH_FILE_FOUND');
		return 0;
	}
}


var exchangeSignatures = function(flash, bundles, signatures, close, message, callback)
{
	var get_signature_data = {
		action: 'pay',
		depositAddress: flash.depositAddress,
		bundles: bundles,
		signature: signatures[0],
		close: close,
		message: message
	}

	// === WEBSITE FUNCTIONS CALLED!
	comm_webserv.topayserver(flash.url_payserv, get_signature_data, function(receive_json){
		
		// save received data
		if(receive_json.accepted == true)
		{
			signatures[1] = receive_json.signature;
			
			callback(true, signatures);
			return;
		}
		
		callback(false, false, (typeof receive_json.error != 'undefined') ? receive_json.error : false);
		return;
	});
}


// Create Flash Object with secure new seed and return this object
var createFlashObject = function(url_payserv, tx_cnt_min, collateral, usrSettlement)
{
	// Define flash object, 
	// when array for both user and service provider, user is index 0, serv. is index 1!
	var flash = {
		url_payserv: url_payserv,				// url (to webserver relay) to payserver
		seed: "",								// Channel seed, new one for every session!
		multisig_digest_inx: 0,
		multisig_digest_pool: [],
		tree_depth: Math.ceil(Math.log2(tx_cnt_min)) + 1,
		signersCount: 2, 						// Number of signers in a channel
		balance: collateral, 					// total channel balance
		deposits: [collateral,0], 				// individual user deposits 
		settlementAddresses: [usrSettlement, ""], // user's output addresses
		depositAddress: "", 					// Address at index 1 with checksum
		depositObject: {},						// DTOF: Deposit address bundles and data
		remainderAddress: "", 				    // Index 0 of the multisig addresses generated
		root: {},								// Index 1+ of the multisig addresses generated
		outputs: {},							// Channel's output history 
		transfers: [] 							// History of transfers within the channel
	};
	

	// Generate new seed for flash channel 
	crypto.randomBytes(81).forEach((value) => { 
		while(value > 243){ 		// against 'modulo biasing'
			value = crypto.randomBytes(1)[0]; 
		} 
		flash.seed += ALLOWED_SEED_CHARS.charAt(value%27); 
	});
	
	return flash;
}


// Create partial digests for user, send to service provider and receive provider digests
// and additional information
// Callback Functions: OK: callback(flash, digests); ERROR: callback(false,false);
var createSendDigests = function(flash, callback)
{
	// Create digests for the start of the channel
	var digests = [];
	digests[0] = [];
	var numDigest = Math.pow(2, flash.tree_depth + 1);		// DTOF: +1 (removed -1) multisig for new deposit address
	
	let i;
	for (i = flash.multisig_digest_inx; i <= flash.tree_depth + flash.multisig_digest_inx + 1 && i <= numDigest; i++) 	// DTOF: +1 multisig
	{
	  digests[0].push(multisig.getDigest(flash.seed, i, IOTA_SECURITY));
	}
	flash.multisig_digest_inx = i;
	
	// Connect with payserver
	// Send: 
	//		-> settlement Address user
	//		-> tree depth
	//		-> amount of collateral (balance)
	//		-> partial digests (created above) for user
	// Get (if no error):
	// 		<- settlement address service provider
	//		<- partial digests from service provider
	//	
	// Format (body, both directions): json
	var create_channel_data = {
		action: 'create',				// information to server -> channel is new
		tree_depth: flash.tree_depth,
		balance: flash.balance,
		settlement: flash.settlementAddresses[0],
		digests: digests[0]
	}

	// === WEBSITE FUNCTIONS CALLED!
	try{
		comm_webserv.topayserver(flash.url_payserv, create_channel_data, function(receive_json){
				if(receive_json.accepted == true)
				{
					// save received data
					flash.settlementAddresses[1] = receive_json.settlement;
					digests[1] = receive_json.digests;
					
					callback(flash, digests);		// Continue with constructMultisigs ...
					return;
				}else{
					console.error("digsend not accepted.");
					callback(false, false);
				}
		});
	}catch(e)
	{
		console.error("client pay main error: " + e);
		callback(false, false);
	}
}


var constructMultisigs = function(flash, digests, callback)
{
	let multisigs = digests[0].map((digest, index) => {

	  // Create address
	  let addy = multisig.composeAddress(
		digests.map(userDigests => userDigests[index])	// -> [digests[0][index], digests[1][index]]
	  )
	  // Add key index in
	  addy.index = digest.index; 
	  // Add the signing index to the object IMPORTANT
	  addy.signingIndex = 0;		// flashObj.userIndex * digest.security --> flash.userIndex = 0
	  // Get the sum of all digest security to get address security sum
	  addy.securitySum = digests
		.map(userDigests => userDigests[index])
		.reduce((acc, v) => acc + v.security, 0)
	  // Add Security
	  addy.security = digest.security

	  return addy
	  
	});

	// Set remainder address (Same on both users)
	flash.remainderAddress = multisigs.shift();		// multisigs index 0
	flash.depositObject = multisigs.shift();		// DTOF: new deposit at index 1
	flash.depositAddress = iota.utils.addChecksum(flash.depositObject.address);	// DTOF: get deposit not from flash root

	let initial_multisigs = multisigs.slice(0, flash.tree_depth + 1);
	flash.multisig_digest_pool = multisigs.slice(flash.tree_depth + 1);
	
	// Nest initial tree
	for (let i = 1; i < initial_multisigs.length; i++)
	{
	  initial_multisigs[i - 1].children.push(initial_multisigs[i]);
	}

	flash.root = initial_multisigs.shift();			// multisigs index >= 1
	
	// Created everything needed for flash channel,
	// Save flash object to disk/database
	fs.writeFile(__flash_object_prefix + flash.depositAddress, JSON.stringify(flash), (err) => {
	
		console.log("Setup finished, deposit Address:", flash.depositAddress);
		
		// Now classical setup is finished, but the first bundle, from deposit address
		// to flash tree root has to be generated and signed!
		initializeFlashTree(flash, callback);
	});
}


// Generate bundles for transaction from deposit to root address,
// send it to server, there sign it and save to depositObject
// When everything is finished, save flash object to file.
var initializeFlashTree = function(flash, callback)
{
	// check if deposit to root hasn't already been done
	if(typeof flash.depositObject.bundles != 'undefined' && flash.depositObject.bundles.length != 0)
	{
		console.warn('ERROR: Flash deposit already sent! (Bundles.length != 0)');
		callback('ERROR: Flash deposit already sent! (Bundles.length != 0)');
		return;
	}
		
	sendSpecialBundle(flash, 'depositToRoot', (err, flash)=>{ callback(err); });
}


// Generates bundles for transaction from deposit address to users,
// takes available input and distributes it to users.
var closeFlashTree = function(flash, depositAddressBalance, callback)
{
	// check if deposit to root has even occurred (channel is correctly initialized)
	if(flash.depositObject.bundles.length == 0)
	{
		console.warn('WARNING: Flash deposit to root has not happened yet!');
	}
		
	sendSpecialBundle(flash, 'closeChannel', depositAddressBalance, callback);
}


// Sends initial or closing bundle to server
// Server request accepted values:  'depositToRoot', 'closeChannel'
// callback(error, bundles)
var sendSpecialBundle = function(flash, server_request, depositAddressBalance, callback)
{
	if(typeof depositAddressBalance == 'function')	// depositAddressBalance is only needed for close
	{
		callback = depositAddressBalance;
		depositAddressBalance = -1;
	}
	
	var securitySum = flash.depositObject.securitySum;
	var inputAddress = flash.depositObject.address;
	var balance = depositAddressBalance < 0 ? flash.balance : depositAddressBalance;
	
	if(server_request == 'depositToRoot')
	{		
		var outputAddress = flash.root.address;
		// Send complete balance to flash root
		var transfers = [{address: outputAddress, value: balance, message: IOTA_STDMSG, tag: IOTA_STDTAG}];	
			
	}
	else if(server_request == 'closeChannel')
	{
		// get transfers that occurred in channel and deposits that are still to be distributed
		// and generate transfers object

		 var transfers = flash.settlementAddresses.map((address, i) => {
			var out = 0;
			if(typeof flash.outputs[address] != 'undefined')
			{
				 out = flash.outputs[address];
			}
			return { address: address, value: (flash.deposits[i] + out), message: IOTA_STDMSG, tag: IOTA_STDTAG };
		 }).filter(tx => tx.value > 0);
		 
		// Flash object is not updated, so it stays valid for debugging; after signing of closing
		// bundle it is alredy useless, as user as well as provider can attach it and therefore make transaction
		// to tree root invalid.

	}else{
		console.warn('Unknown request, aborting.');
		return;
	}
	
	var input = { address: inputAddress, securitySum: securitySum, balance: balance};
	var remainderAddress = flash.settlementAddresses[0];		// too-much-payed balance returned to user
	
	try
	{
		iota.multisig.initiateTransfer(input, remainderAddress, transfers, function(err, suc){
			
			if(err)
			{
				console.error('ERROR creating bundle:', err);
				callback(err, false);	
				return;
			}
			
			var bundle = suc;
			
			let key = iota.multisig.getKey(flash.seed, flash.depositObject.index, IOTA_SECURITY);
			
			try
			{
				iota.multisig.addSignature(bundle, inputAddress, key, function(err, suc){
					
					if(err)
					{
						console.error('ERROR signing bundle:', err);
						callback(err, false);	
						return;
					}
					
					var init_channel_data = {
						action: server_request,					// information to server
						depositAddress: flash.depositAddress,	// channel Id
						bundle: suc
					};
					
					// Send bundles to payserver...
					comm_webserv.topayserver(flash.url_payserv, init_channel_data, function(receive_json){
						
						if(receive_json.accepted == true)
						{
							// Save bundles to flash object
							let signedBundle = receive_json.signedBundles;
							// Check integrity by copying only signatures of signed bundle to unsigned bundle and check if
							// it is still valid
							let checkBundle =  bundle.map((tx, i) => { tx.signatureMessageFragment = signedBundle[i].signatureMessageFragment; return tx; });
							if(iota.utils.validateSignatures(checkBundle, iota.utils.noChecksum(flash.depositAddress)) == false)
							{
								// Something went wrong...
								console.warn('Bundles were manipulated by server, reject and start ATTACHING TREE! (NOT IMPLEMENTED)');
								callback('BUNDLE_MANIPULATED', false);
								return;
							}
							
							if(typeof flash.depositObject.bundles == "undefined")
								flash.depositObject.bundles = [];
								
							flash.depositObject.bundles.push(signedBundle);
							
							fs.writeFile(__flash_object_prefix + flash.depositAddress, JSON.stringify(flash), (err) => {
								// finished
								console.log('Special Bundle was successfully created and saved to disk.');
								callback(err, flash.depositObject.bundles[flash.depositObject.length - 1]);	
							});
							return;
						}else{
							console.error("special bundle not accepted.");
							callback('BUNDLE_NOT_ACCEPTED', false);
							return;
						}
					});	
				});
			}catch(e)
			{
				callback('addSignature Error:' + e, false);
				return;
			}
		});
	}catch(e)
	{
		callback('initiateTransfer Error:' + e, false);
		return;
	}
}

// callback() is only called when successful!
var increaseDigest_pool = function(flash, multisigs_cnt, callback, callbackError)
{
	console.log("creating", multisigs_cnt, "new multisigs.");
	
	// Create digests
	var digests = [];
	digests[0] = [];
	var numDigest = Math.pow(2, flash.tree_depth + 1) - 1;
	
	let i;
	for (i = flash.multisig_digest_inx; i < multisigs_cnt + flash.multisig_digest_inx  && i <= numDigest; i++) 
	{
	  digests[0].push(multisig.getDigest(flash.seed, i, IOTA_SECURITY));
	}
	
	// Exchange digests with server
	var add_digests_data = {
		action: 'add_digests',
		depositAddress: flash.depositAddress,
		old_index: flash.multisig_digest_inx,
		digests: digests[0]
	}
	
	// Set new index value
	flash.multisig_digest_inx = i;
	
	// === WEBSITE FUNCTIONS CALLED!
	try{
		comm_webserv.topayserver(flash.url_payserv, add_digests_data, function(receive_json){
			if(receive_json.accepted == true)
			{
				// save received data
				digests[1] = receive_json.digests;
				
				create_multisigs(digests);
				return;
			}else{
				console.warn("Add digests not accepted.");
				callbackError("Add digests not accepted by server." + receive_json.error);
				return;
			}
		});
	}catch(e)
	{
		console.error("Client pay main increase digest pool error:", e);
		callbackError("increase dig.pool failed:" + e);
	}
	
	// continue creating multisigs
	var create_multisigs = function(digests)
	{		
		let multisigs = digests[0].map((digest, index) => {

		  // Create address
		  let addy = multisig.composeAddress(
			digests.map(userDigests => userDigests[index])	// -> [digests[0][index], digests[1][index]]
		  )
		  // Add key index in
		  addy.index = digest.index; 
		  // Add the signing index to the object IMPORTANT
		  addy.signingIndex = 0;		// flashObj.userIndex * digest.security --> flash.userIndex = 0
		  // Get the sum of all digest security to get address security sum
		  addy.securitySum = digests
			.map(userDigests => userDigests[index])
			.reduce((acc, v) => acc + v.security, 0);
		  // Add Security
		  addy.security = digest.security;
			
		  return addy;
		  
		});
		
		// add to flash object multisig pool
		flash.multisig_digest_pool = flash.multisig_digest_pool.concat(multisigs);
		console.log('Multisig pool has now a lenght of', flash.multisig_digest_pool.length);
		callback(flash);
	}
}

var hasAllowedUnconfirmedBalance = function(depositAddress, callback)
{
	fs.readFile(__flash_object_prefix + depositAddress, (err, data)=>{
		// 1. check if flash object could be restored
		if(err){
			console.error("pay open file error:",err);
			callback(false);
			return;
		}
		
		let flash = JSON.parse(data);		// Restore flash object
		
		comm_webserv.topayserver(flash.url_payserv, {action:'has_allowed_unconfirmed_balance'}, 
			function(receive_json){
				if(receive_json.accepted == true)
				{
					callback(receive_json.amount);
				}else
				{
					callback(0);
				}
		});
	});
}


// Sets a new url for communication with payserver in flash object
var updatePayServUrl = function(depositAddress, url_payserv)
{
	return new Promise((resolve, reject) =>
	{
		if(err){
			console.error("Open file error:",err);
			reject('Open file error:' + err);
			return;
		}
		
		let flash = JSON.parse(data);		// Restore flash object
		
		flash.url_payserv = url_payserv;
		
		fs.writeFile(__flash_object_prefix + flash.depositAddress, JSON.stringify(flash), (err) => {
			if(!err){
				resolve(true);
			}else
			{
				reject(false);
			}
		});
	});
}


// Sends getProviderKey request to server and checks the key
// optional param url_payserv: sets new url to payserver before requesting key
// promise resolve(true) if provider OK, resolve(false) if provider returned false Key
// reject(error) if any error occurred while requesting key
var checkProviderAuthenticity = function(depositAddress, url_payserv = false)
{
	return new Promise((resolve, reject) => 
	{
		
		fs.readFile(__flash_object_prefix + depositAddress, (err, data)=>{
			
			if(err){
				console.error("Open file error:",err);
				reject('Open file error:' + err);
				return;
			}
			
			let flash = JSON.parse(data);		// Restore flash object
			
			if(url_payserv !== false)
			{
				flash.url_payserv = url_payserv;
			}
			var getRandomIndex = function()
			{
				let value = 255;
				while(value > 244){ 		// against 'modulo biasing'
					value = crypto.randomBytes(1)[0]; 
				}
				return value % 61;
			};
			let request = {
					action: 'getproviderkey',
					channelId: depositAddress,
					index: getRandomIndex()
				};

			comm_webserv.topayserver(flash.url_payserv, request, 
				function(receive_json){
					if(receive_json.accepted == true)
					{
						var keyOK = false;
						if(flash.root.address.slice(request.index, request.index + 20) == receive_json.key)
						{
							keyOK = true;
						}
						
						fs.writeFile(__flash_object_prefix + flash.depositAddress, JSON.stringify(flash), (err) => {
							if(!err){
								
								resolve(keyOK);
							}else
							{
								reject('Write file error:' + err);
							}
						});
					}else
					{
						reject('Communication error occurred or server could not find file.');
					}
			});
		});
	});
}


var getDirectAddress = function(urlPayServ, txId)
{
	return new Promise((resolve, reject) => {

		let request = {
				action: 'getdirectaddress',
				txId: txId
			};

		comm_webserv.topayserver(urlPayServ, request, 
			function(receive_json){
				if(receive_json.accepted == true)
				{
					// Return address
					resolve(receive_json.address);
					
				}else
				{
					reject('Communication error occurred or server could not find file.');
				}
		});			
	});
}




var calcualteDiffsTwoHistoryTransfers = function(bundle1, bundle2, settlementAddresses, deposits)
{
	let out1 = bundle1.filter(t => t.value > 0);
	let out2 = bundle2.filter(t => t.value > 0);
	
	let outputDiffs = settlementAddresses.map(addr => { 
			let v1 = out1.filter(t => t.address == addr);
			
			if(v1.length < 1){
				v1 = 0;
			}else{
				v1 = v1.reduce((a, v) => a + v.value, 0);
			}
				
			let v2 = out2.filter(t => t.address == addr);
			if(v2.length < 1){
				v2 = 0;
			}else{
				v2 = v2.reduce((a, v) => a + v.value, 0);
			}	
			
			return {
				address: addr,
				value: (v2 - v1)
			};
		});
		
	let totalDeposits = deposits.reduce((a,v) => a+v, 0);
	let factorDeposits = deposits.map(d => d/totalDeposits);
	let outputTotal = outputDiffs.reduce((a,c) => a+c.value, 0);
	let depositDiffs = factorDeposits.map(f => f * outputTotal);
	
	return {
		outputDiffs: outputDiffs,
		depositDiffs: depositDiffs
	};
}


let findlastbundle = (node, bundleHash) => 
{
	if(node.bundles.filter(b => (b[0].bundle == bundleHash) ).length > 0)
	{
		return node;
	}
	
	if(node.children.length == 0)
	{
		return false;
	}
	
	for(let i = 0; i < node.children.length; i++)
	{
		let cval = findlastbundle(node.children[i], bundleHash);
		if(cval != false)
			return cval;
	}
}

let findInputSourceNode = (node, searchAddr) => {
	
	if(node.bundles.filter(b => b.filter(tx => (tx.value > 10 && tx.address == searchAddr)).length > 0 ).length > 0)
	{
		return node;
	}
	
	if(node.children.length == 0)
	{
		return false;
	}
	
	for(let i = 0; i < node.children.length; i++)
	{
		let cval = findInputSourceNode(node.children[i], searchAddr);
		if(cval != false)
			return cval;
	}
}

let cleanRoot = (flash, bundleHashLastValid) => 
{
	let lastbundle = findlastbundle(flash.root, bundleHashLastValid);
	
	let addr = lastbundle.address;
	let inx,linx,source;
	do
	{
		source = findInputSourceNode(flash.root, addr);
		inx = source.children.findIndex(tx => tx.address == addr) + 1;
		linx = source.children.length;
		
		console.log("delete:", source.children.splice(inx));
		console.log("deleted items cnt:", linx - inx);
	}while(inx != linx);
};



// Deletes the last transaction from flash object -> ONLY DEBUGGING, NOT SECURE !!
var revertChannelState = function(flash)
{
	// Calculate output diffs ...
	let bundle2 = flash.transfers.pop();		// bundle2 == bundle to delete from history
	let bundle1 = flash.transfers[flash.transfers.length - 1];
	
	let diffs = calcualteDiffsTwoHistoryTransfers(	bundle1, 
													bundle2, 
													flash.settlementAddresses, 
													flash.deposits
												);
	let outputDiffs = diffs.outputDiffs;
	let depositDiffs = diffs.depositDiffs;
	
	for(let i = 0; i < outputDiffs.length; i++) 
	{
      if(outputDiffs[i].address in flash.outputs) 	// if not in outputs it should be 0 ... 
      {
        flash.outputs[outputDiffs[i].address] -= outputDiffs[i].value;
      }
    }
    
	flash.deposits = flash.deposits.map((d,i) => d + depositDiffs[i]);
	
	// now revert / clean flash.root ...
	/*
	console.log("Cleaning root ... ");
	try{
		let bundle1 = flash.transfers[flash.transfers.length - 1];
		console.log("Cleaning root ... ");
		cleanRoot(flash, bundle1[0].bundle);		// test before leaving in permanently!
	}catch(e){
		console.warn("new function cleanRoot does not work as espected: ", e);
	};
	*/
	
	// return the amount of transaction to user 1 -> provider => this calculation is designed for the use
	// in ROSI, the rest until here should work with every constellation.
		
	if(typeof flash.reverted == 'undefined')
		flash.reverted = [];
		
		
	let result = { 
		amountToZero : (outputDiffs.filter(d => d.address == flash.settlementAddresses[1])
							.reduce((a,v) => a+v.value,0) - depositDiffs[1]),
		deletedTransfer : bundle2
	}
	
	console.log("AmountToZero: ", result.amountToZero);
	
	flash.reverted.push(result);
	
	return result;
}


// Try to request that the provider should revert the state of the channel, so conflicts
// with transfers over multiple layers of the tree can be restored.
var requestRevertFromProvider = function(flash)
{
	return new Promise((resolve, reject) => 
	{

		let request = {
				action: 'revertFlashRequest',
				channelId: flash.depositAddress
			};
			
		console.log("Request to revert channel with ID:", request.channelId);
							
		comm_webserv.topayserver(flash.url_payserv, request, 
			function(receive_json){
				if(receive_json.accepted == true)
				{
					
					let deletedTransfer = receive_json.deletedTransfer;
					// Check that deleted Transfer is a valid bundle with valid signature!!!
					
					// Check diff calculation
					let diffs = calcualteDiffsTwoHistoryTransfers(
									flash.transfers[flash.transfers.length -1], 
									deletedTransfer, 
									flash.settlementAddresses, 
									flash.deposits
								);
					
					if((diffs.outputDiffs.filter(d => d.address == flash.settlementAddresses[1])
						.reduce((a,v) => a+v.value, 0) - diffs.depositDiffs[1]) == receive_json.amountToZero)
					{
						console.log("Revert successful.");
						resolve(receive_json.amountToZero);		// Return the amount of the reverted transaction
					}
					else
					{
						// try reverting more ? ...
						console.error("Revert balance not OK.");
						reject("DIFFS_NOT_OK");
					}
				}
				else
					reject("REVET_NOT_ACCEPTED");
			});
	});
}


// Try to resolve different indices on server and client, so payments can continue
var resolveIndexConflict = function(depositAddress, url_payserv = false)
{
	return new Promise((resolve, reject) => 
	{
		
		fs.readFile(__flash_object_prefix + depositAddress, (err, data)=>{
			
			if(err){
				console.error("Open file error:",err);
				reject('Open file error:' + err);
				return;
			}
			
			let flash = JSON.parse(data);		// Restore flash object
			
			if(url_payserv !== false)
			{
				flash.url_payserv = url_payserv;
			}
			
			let request = {
					action: 'resolveIndexConflict',
					channelId: depositAddress,
					digest_index: flash.multisig_digest_inx,
					transfers_length: flash.transfers.length
				};
								
			comm_webserv.topayserver(flash.url_payserv, request, 
				function(receive_json){
					if(receive_json.accepted == true)
					{
						if(receive_json.mode == 'revert')
						{
							console.warn("REVERT MODE NOT IMPLEMENTED!");
							return;
						}
						else if(receive_json.mode == 'add')
						{
							let multisig_cnt = receive_json.digest_index - flash.multisig_digest_inx;
							console.log("Need", multisig_cnt, "additional multisig digests...");
							
							increaseDigest_pool(flash, multisig_cnt < 0 ? 0 : multisig_cnt, (flash) => 
							{
								
								console.log("Digests added.");
								
								let finishedResolving = () => 
								{
									fs.writeFile(__flash_object_prefix + flash.depositAddress, JSON.stringify(flash), (err) => {
										if(!err){
											console.log("Added transfers, saved file, success.");
											resolve("Added transfers successfully.");
											return;
										}else
										{
											console.error("Write file error: " + err);
											reject('Write file error: ' + err);
											return;
										}
									});
								};
								
								let addTransfers = () => {
								
									try
									{	
					
										let signedBundles = [receive_json.transfer_objects.shift()];
																
										transfer.applyTransfers(flash.root,			// Representation of the current state of the Flash tree
																flash.deposits,		// The amount of iotas still available to each user to spend from
																flash.outputs,		// The accrued outputs through the channel
																flash.remainderAddress,	//The remainder address of the Flash channel
																flash.transfers,	//  Transfer history of the channel
																signedBundles );			// Signed bundle
																
										if(receive_json.transfer_objects.length > 0)
											addTransfers();
										else
											finishedResolving();

									}
									catch(e)
									{
										
										if((''+e).indexOf('6') > -1)	// address overuse
										{			
											// Try requesting revert ... 
											requestRevertFromProvider(flash).then(amountToZero => {
												
												console.log("Revert success. Now need to recreate reverted transaction.");
												// pay the amount to provider to return to normal channel state
												depositAddress = flash.depositAddress;
												
												fs.writeFile(__flash_object_prefix + flash.depositAddress, JSON.stringify(flash), (err) => {
													if(!err){
														
														// now pay ...
														pay(depositAddress, amountToZero, (e) => {
															if(e) 
															{
																console.error("Error repaying provider: " + e);
																reject("REVERT_ERROR_REPAY");
																return;
															}
															else
															{
																console.log("REVERT SUCCESS!");
																resolve("REVERT_SUCCESS");
																return;
															}
														});
														
														return;
													}else
													{
														console.error("Write file before repay provider error: " + err);
														reject('REVERT_FILE_WRITE_ERROR');
														return;
													}
												});
												
											}).catch(e => {
													console.error("Error occurred when trying to reuqest revert from provider: " + e);
													reject('REVERT_REQUEST_ERROR');
													return;
											});
										}
										else
										{
											console.error("Error occurred when trying to apply Bundle to flash object:" + e);
											reject('Error applying bundle to flash: ' + err);
											return;
										}										
									}
									
								};
								// Start adding ...
								addTransfers();
								
							} ,
							
							(e) => {
								console.error("Error adding digests: " + e);
								reject("Error adding digests: " + e);
							});
						}
						else
						{
							console.warn("Unknown mode", receive_json.mode);
							reject('Unkown mode: ' + err);
							return;
						}
					}else
					{
						reject('Server did not acceppt rejequest. Returned error: ' + receive_json.error);
						return;
					}
			});
		});
	});
}

var getChannelBalance = function(channelId)
{
	return new Promise((resolve, reject) => 
	{
		
		fs.readFile(__flash_object_prefix + channelId, (err, data)=>{
				
			if(err){
				console.error("Open file error:",err);
				reject('Open file error:' + err);
				return;
			}

			let flash = JSON.parse(data);		// Restore flash object
			
			// Return current balance of channel
			resolve(flash.deposits.reduce((acc, v) => acc + v));			
		});
	});
}


module.exports = {
	'createChannel' 	: createChannel,			// var createChannel = function(url_payserv, tx_cnt_min, collateral, usrSettlement, callback_create)
	'pay'				: pay,						// deposit Address serves as ID; var pay = function(depositAddress, amount)
	'closeChannel'		: closeChannel,				// closes flash channel, remaining deposits -> user (has deposited it)
	'increaseDigest_pool' : increaseDigest_pool,	// function(flash, multisigs_cnt, callback), callback()
	'fs'				: 		fs,
	'hasAllowedUnconfirmedBalance' 	: hasAllowedUnconfirmedBalance,
	'updatePayServUrl'	: updatePayServUrl,
	'checkProviderAuthenticity'		: checkProviderAuthenticity,
	'getDirectAddress' : getDirectAddress,
	'resolveIndexConflict' : resolveIndexConflict,
	'getChannelBalance' : getChannelBalance
}








