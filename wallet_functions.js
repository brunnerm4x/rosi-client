/*
 * ROSI
 * 
 * 
 * 	'lower level' functions for wallet functionalities
 *
 * 		DIFFERENCES WHEN USING NODE INSTEAD OF BROWSER:
 * 	
 * 			fs = require('fs'); instead of fs = require('./localstorage.js');
 * 
 * */

const REATTACH_MAX_CNT = 25;

const crypto = require('crypto');
const IOTA = require('iota.lib.js');

// Only nodejs version:
// const fs = require('fs');	
const fs = require('./localstorage.js');	// For browser version
const task = require('./wallet_task.js');	// to strip wallet tasks

var __dev_backup_prefix = 'wallet_backup';

if(typeof process.browser == 'undefined')
{
	__dev_backup_prefix = 'wallet_backup/';
}else{
	__dev_backup_prefix = 'wallet_backup';
}

// System constants
const ALLOWED_SEED_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ9";

let ws = false;

// IOTA object
var iota = new IOTA();

let updateSettings = function(settings)
{
	ws = settings;
}

// Connects to Node and checks if ok
// callback(error)	(calls back even without error)
// error: 0 OK, 1 out of date, 2 api call returns error, 3 fatal js error
var setupCheckNode = function(provider, callback)
{
	try
	{
		iota = new IOTA({provider: provider});
		
		iota.api.getNodeInfo(function(error, success) 
		{
			if (error) 
			{
				console.error("iota api getNodeInfo error:", error);
				callback(2);
			} else 
			{
				if(success.latestMilestone == success.latestSolidSubtangleMilestone)
				{
					callback(0);	// OK
				}else{
					console.warn("WARNING: node mybe out of date!");
					callback(1);
				}
			}
		});
	}catch(e)
	{
		console.error("An error occurred when requesting node info!");
		callback(3);
	}
}


// Store wallet to disk/database
// callback(err);
var storeWalletToFile = function(wallet, callback)
{
	var writeNewWalletToDisk = function()
	{
		let strippedWallet = task.makeTaskSerializeable(wallet);
		fs.writeFile(ws.wallet_name, JSON.stringify(strippedWallet), (err) => {
				callback(err);
		});
	}
	
	getWalletFromFile(function(oldwallet, err){
		if(!err && oldwallet.seed != wallet.seed)		// Backup wallet if this is no update
		{
			fs.writeFile(__dev_backup_prefix + ws.wallet_name + oldwallet.seed.substring(0,10), 
							JSON.stringify(oldwallet), 
							(err) => 
			{
				console.log('Backed up old wallet.');
				writeNewWalletToDisk();
			});
		}else if(err == 'ENOENT' || oldwallet.seed == wallet.seed)	// OK, no wallet created yet / wallet update
		{
			writeNewWalletToDisk();
		}else{		// Something's fishy, abort
			callback(new Error('Unexpected error when checking for older wallet.' + err));
		}
	});
}


// restore Wallet from File
// callback(wallet, err)
var getWalletFromFile = function(callback)
{
	try
	{
		fs.readFile(ws.wallet_name, (err, data)=>{
			// 1. check if wallet object could be restored
			if(err){

				if(err.code == 'ENOENT')
				{
					callback(false, 'ENOENT');
					return;
				}else{
					console.error("Unexpected getWalletFromFile Error:", err);
				}
		
				callback(false, err);
			}else
			{
				callback(JSON.parse(data), false);
			}	
		});
	}catch(e)
	{
		if(e.code == 'ENOENT')
		{
			callback(false, 'ENOENT');
		}else{
			console.error("Unexpected getWalletFromFile Error:", e);
		}
	}
}


// Setup new Wallet for user
// return wallet object
// Set seed param to false for automatic creation of new seed
var createWallet = function(seed)
{
	if(!seed)
	{
		seed = "";
		// Generate new seed for wallet
		crypto.randomBytes(81).forEach((value) => { 
			while(value > 243){ 		// against 'modulo biasing'
				value = crypto.randomBytes(1)[0]; 
			} 
			seed += ALLOWED_SEED_CHARS.charAt(value%27); 
		});
		
		console.log("New Seed:", seed);
	}
	
	wallet = {
		seed: seed,
		balance: 0,				// latest balance, this is an estaminated value, only reliable after updateBalance() call!
		index: -1,				// Address index for current address
		security: ws.security,	// IOTA address security
		addresses: [],			// buffer of new addresses in format {address: IOTA 90 tryte address, index: index in seed}
		inputs: [],				// Owned addresses with balance, which can be used for new outgoing transactions [{address, balance, security, keyIndex}]
		monitor_add: [],		// Input addresses which should be checked for a new transaction
		monitor_keyinx: [],		// Key indexes of monitored inputs
		pending_out: [],		// (probably) unconfirmed outputs, array of transactions hashes of the tail transaction
		pending_bal: [],		// balance of pending outputs (all tx inputs summed up)
		pending_infobal: [], 	// balance of pending outputs (real value, as requested when calling sendTransfer)
		pending_reattached: {},	// pending_reattached[tx_hash] = ["oldhash1", "oldhash2", ...]
		invalid_reattached: [],	// Transactions that have to be found reattached REATTACH_MAX_CNT times 
		tasks: []				// array of sceduled tasks [{taskname, params:{}, priority, timestamp}, ...]  
								// (Splitted function in task name and params to make it serializeable)
	}
	
	return wallet;
}


// check if address has been used before
// callback (error, isused)
var checkIfAddressUsed = function(wallet, address, callback)
{
	// Check if address is already monitored ( == used)
	if(wallet.monitor_add.indexOf(address) >= 0)
	{
		callback(false, true);
		return;
	}
	
	iota.api.findTransactionObjects({'addresses': [address]}, function(e,s)
	{
		if(e)
		{
			console.log("Error occurred when trying to get transactions to check if addr is used:", e);
			callback(true, false);	
		}else{
			if(s.length == 0)
			{
				// Address is unused and can be used
				callback(false, false);
			}
			else
			{
				callback(false, true);
				return;
			}
		}
	});
}
	
// generate Address for address buffer
// callback(error)
var generateAddress = function(wallet, callback)
{	
	wallet.index ++;
	iota.api.getNewAddress(wallet.seed, {index: wallet.index, checksum:true, total:1, security: wallet.security}, function(e, s)
	{
		if(e)
		{
			console.log("Error occurred when getting new address:", e);
			callback(true);	
		}else{
			checkIfAddressUsed(wallet, s[0], (e, isused) => {
				if(e)
				{
					callback(e);
					return;
				}
				if(isused)
				{
					// get next address
					generateAddress(wallet, callback);
					return;
				}
				// address ok, push to buffer
				wallet.addresses.push({address: s[0], index: wallet.index});
				callback(false);
			});
		}
	});
}


// Check if all buffered addresses are unused,
// this should only be necessary after startup when it is not sure that the application
// has been shut down ordinarily
// callback(e)
let checkBufferedAddresses_index = 0;
var checkBufferedAddresses = function(wallet, callback)
{
	if(checkBufferedAddresses_index >= wallet.addresses.length)
	{
		// everything ok
		checkBufferedAddresses_index = 0;
		callback(false);
		return;
	}
	
	checkIfAddressUsed(wallet, wallet.addresses[checkBufferedAddresses_index].address, (e, isused) => {
		if(e)
		{
			callback(e);
			return;
		}
		if(isused)
		{
			// Found used address that is not monitored -> add to monitor list and delete from addresses
			let usedaddr = wallet.addresses.splice(checkBufferedAddresses_index, 1);
			addMonitoredAddress(wallet, usedaddr[0].address, usedaddr[0].index);
		}
		else
		{
			// check next address in next cycle
			checkBufferedAddresses_index ++;
		}
		setTimeout(() => {
			// start next cycle
			checkBufferedAddresses(wallet, callback);
		}, 20);	// timeout to prevent server from blocking requests
	});
}


// Gets address of buffer if possible, else generate new and returnes that
// callback(wallet, error, addrobj)
var getAddress = function(wallet, callback)
{
	// Check if prebuffered address exit
	if(wallet.addresses.length == 0)
	{
		generateAddress(wallet, (e) => {
			if(e) 
			{
				callback(wallet, true, false);
				return;
			}
			// Now try again with new generated address
			getAddress(wallet, callback);
		});
	}
	else
	{
		let addr = wallet.addresses.shift();
		console.log("OK returning address: " + addr.address);
		callback(wallet, false, addr);
	}
}

// Attach input address to tangle
var attachAddressToTangle = function(wallet, address, callback)
{
	sendTransfer(wallet, address, 0, function(error, wallet){
		
		if(!error)
		{
			callback(false, wallet);
		}else{
			console.log('An error occurred when attaching address to tangle.');
			callback(error, wallet);
		}
	});
}

// send amount iota to address (eg fund channel)
// callback(error, txHash), latest transaction is last object in pending_out
var sendTransfer = function(wallet, address, amount, callback)
{
	console.log("SendTransfer of " + amount + " iota to " + address);
	
	let options = {};
	let takenInputs = [];
	let availableAmount;
	
	var revertTakenInputs = function()
	{
		takenInputs.forEach((input) => {
			wallet.inputs.push(input);
		});
	};

	var preparedSend = function()
	{
		try
		{
			iota.api.sendTransfer(wallet.seed, ws.std_depth, ws.minweightmag, 
				[{address: address, value: amount, message: ws.std_msg, tag: ws.std_tag}],
				options,
				function(err, bundles){
					if(err)
					{
						revertTakenInputs();
						if(err.toString().indexOf('balance') > -1)
						{
							console.warn("Insufficient funds.");
							callback('INSUFFICIENT_FUNDS', wallet);
							return;
						}
						console.error("Error sending transfer:", err);
						callback(err, false);
					}else{
						// Append transfer objects to wallet!
						if(amount > 0)
						{
							// get tail transaction hash and put in wallet outputs array
							wallet.pending_out.push(bundles[0].hash);
							wallet.pending_bal.push(availableAmount);
							wallet.pending_infobal.push(amount);
						}
						callback(false, bundles[0].hash);
					}
			});
		}catch(e)
		{
			console.error("sendTransfer and error has ocurred:", e);
			revertTakenInputs();
			callback(e, wallet);
		}
	};
	
	if(amount > 0)
	{
		options = {inputs: []};
		// get inputs
		availableAmount = 0;
		while(availableAmount < amount)
		{
			let input = wallet.inputs.shift();
			if(typeof input != 'object')	// no more inputs available
			{
				// insufficient funds
				revertTakenInputs();
				console.warn("Insufficient funds.");
				callback('INSUFFICIENT_FUNDS');
				return;
			}
			availableAmount += input.balance;
			// options remainder address throws unhandled exception in crypto/converter 
			// 'Invalid trytes length' when given address with checksum
			input.address = iota.utils.noChecksum(input.address);		
			options.inputs.push(input);
			takenInputs.push(input);
		}
		
		// set remainder address, if needed
		if(availableAmount > amount)
		{
			// Get remainder Address
			getAddress(wallet, (w, e, addrobj) => {		
				options.address = iota.utils.noChecksum(addrobj.address);
				addMonitoredAddress(wallet, addrobj.address, addrobj.index);
			
				// Continue
				preparedSend();
			});
		}
		else
		{
			// Continue
			preparedSend();	
		}		
	}else
	{
		// Continue without options
		preparedSend();
	}
} 


// takes transaction tail hashes stored in wallet
// checks if confirmed (then removes them)
// and reattaches unconfirmed transactions
// callback(error, wallet)
var reattachPending = function(wallet, callback)
{
	if(wallet.pending_out.length == 0)
	{
		callback(false, wallet);
		return;
	}
	
	try
	{
		// get inclusion states of the functions 
		iota.api.getLatestInclusion(wallet.pending_out, function(e, inclutionstate)
		{
			if(!e)
			{
				var pending_new = [];
				var pending_bal_new = [];
				var pending_infobal_new = [];
				var pending_bal_old = wallet.pending_bal.reduce((acc, curr) => {return acc + curr;}, 0);
				var error_cnt = 0;
				
				var finalize_pending = function()
				{
					wallet.pending_out = pending_new;
					wallet.pending_bal = pending_bal_new;
					wallet.pending_infobal = pending_infobal_new;
					let pending_sum = wallet.pending_bal.reduce((acc, curr) => {return acc + curr;}, 0);
					let pending_diff = (pending_bal_old - pending_sum);
					if(pending_diff > 0)
					{
						console.log('Outputs confirmed, removing', pending_diff + 'i from wallet balance.');
					}
					wallet.balance -= pending_diff;
					
					if(error_cnt <= (wallet.pending_out.length / 2))
						callback(false, wallet);
					else
						callback(error_cnt, wallet);
				};
				
				(function processNext()
				{
					if(wallet.pending_out.length == 0)
					{
						finalize_pending();
						return;
					}
					
					// Get next hash and corresponding confirmation state
					tx_hash = wallet.pending_out.shift();
					tx_bal = wallet.pending_bal.shift();
					tx_infobal = wallet.pending_infobal.shift();
					is_conf = inclutionstate.shift();
					
					if(is_conf == true)
					{
						if(typeof wallet.pending_reattached[tx_hash] != 'undefined')
						{
							delete wallet.pending_reattached[tx_hash];
						}
						processNext();
						return;
					}
					
					var continue_promotion = function()
					{	
						// Promote if promoteable, else reattach if reattachable
						iota.api.isPromotable(tx_hash).then((isPromotable) =>
						{
							if(isPromotable == true)
							{
								try
								{
									// Promote
									console.log("Promoting bundle...");
									iota.api.promoteTransaction(tx_hash, ws.promote_depth, ws.minweightmag, 
									[{address: '9'.repeat(81), value: 0, message: ws.std_msg, tag: ws.std_tag}], {}, function(e,s)
									{
										if(e)
										{
											console.error("Error occurred while promoting:", e);
											error_cnt++;
										}else{
											console.log("Successfully promoted.");
										}
										pending_new.push(tx_hash);	// tx_hash did not change with promotion
										pending_bal_new.push(tx_bal);
										pending_infobal_new.push(tx_infobal);
										processNext();
									});
								}catch(e)
								{
									console.error("Error occurred while promoting:", e);
									pending_new.push(tx_hash);	// tx_hash did not change with promotion
									pending_bal_new.push(tx_bal);
									pending_infobal_new.push(tx_infobal);
									processNext();
								}
							}else
							{
								// check if reattachable
								try
								{
									iota.api.isReattachable(tx_hash, function(e, isReattachable)
									{
										if(!e)
										{
											if(isReattachable)
											{
												// Reattach
												try
												{
													console.log("Reattaching bundle...");
													iota.api.replayBundle(tx_hash, ws.reattach_depth, ws.minweightmag, (e,s)=>{
														if(e)
														{
															console.error("Error occurred when reattaching:", e);
															if(('' + e).indexOf("Invalid Bundle provided") > -1)
															{
																console.log("Removed invalid Bundle from pending list.");
																error_cnt++;
																processNext();
																
															}else{
																pending_new.push(tx_hash);
																pending_bal_new.push(tx_bal);
																pending_infobal_new.push(tx_infobal);
																processNext();
															}
														}else{
															console.log("Successfully reattached.");
															pending_new.push(s[0].hash);	// Replace old tx hash with new one
															if(typeof wallet.pending_reattached[tx_hash] != 'undefined')
															{
																wallet.pending_reattached[s[0].hash] = wallet.pending_reattached[tx_hash];
																wallet.pending_reattached[s[0].hash].push(tx_hash);
																delete wallet.pending_reattached[tx_hash];
																if(wallet.pending_reattached[s[0].hash].length > REATTACH_MAX_CNT)
																{
																	// Max reattachments -> give up and do not try to reattach further
																	// add tx to list of unable to reattach transactions
																	if(typeof wallet.invalid_reattached == "undefined")
																		 wallet.invalid_reattached = [];
																		 
																	wallet.invalid_reattached.push(s[0].hash);
																	delete wallet.pending_reattached[s[0].hash];
																	pending_new.pop();
																	console.warn("Deleted " + s[0].hash + 
																		" from wallet reattach queue, because of the amount of reattachments.");
																}
															}else{
																wallet.pending_reattached[s[0].hash] = [tx_hash];
															}
															pending_bal_new.push(tx_bal);
															pending_infobal_new.push(tx_infobal);
															processNext();
														}
													});
												}catch(e)
												{
													console.error("Error occurred when reattaching:", e);
													error_cnt++;
													pending_new.push(tx_hash);
													pending_bal_new.push(tx_bal);
													pending_infobal_new.push(tx_infobal);
													processNext();
												}
											}else
											{
												console.error("WARNING: Transaction is not reattachable!");
												error_cnt++;
												pending_new.push(tx_hash);
												pending_bal_new.push(tx_bal);
												pending_infobal_new.push(tx_infobal);
												processNext();
											}
										}else{
											// ERROR
											console.error("Error occurred when checking reattachability.");
											error_cnt++;
											pending_new.push(tx_hash);
											pending_bal_new.push(tx_bal);
											pending_infobal_new.push(tx_infobal);
											processNext();
										}
									});
								}catch(e){
									console.error("Error occurred when checking reattachability:", e);
									error_cnt++;
									pending_new.push(tx_hash);
									pending_bal_new.push(tx_bal);
									pending_infobal_new.push(tx_infobal);
									processNext();
								}
							}
						}).catch((error)=>
						{
							// ERROR
							console.error("Error occurred when checking promotiability.", error);
							error_cnt++;
							pending_new.push(tx_hash);
							pending_bal_new.push(tx_bal);
							pending_infobal_new.push(tx_infobal);
							processNext();
						});	
					};
					
					if(typeof wallet.pending_reattached[tx_hash] != 'undefined')	
					{	
						console.log("Checking reattached transactions...");
						// Check if a reattachment has confirmed...		
						try
						{
							iota.api.getLatestInclusion(wallet.pending_reattached[tx_hash], function(e, attis)
							{
								if(e)
								{
									console.error("Error occurred when checking inclusionstate of previously attached transactions. E2:", e);
									continue_promotion();
								}else{
									for(let i = 0; i < attis.length; i++)
									{
										if(attis[i] == true)
										{
											// already confirmed
											console.log("Found reattached confirmed transaction.");	
											delete wallet.pending_reattached[tx_hash];
											processNext();
											return;
										}
									}
									continue_promotion();
								}
							});	
						}catch(e)
						{
							console.error("Error occurred when checking inclusionstate of previously attached transactions. E1:", e);
							error_cnt++;
							continue_promotion();
						}
					}else{
						// No previously created reattachments
						continue_promotion();
					}						
				}());
			}else
			{
				console.error("Error occurred getting inclusion states.");
				callback(e, wallet);
			}
		});
	}catch(e)
	{
		console.error("An error occurred while reattaching:", e);
		callback(e, wallet);
	}
}


// put function on list to be monitored
var addMonitoredAddress = function(wallet, address, keyInx)
{
	if(typeof address === 'undefined')
	{
		console.warn("Wanted to add undefined address! Aborting.");
		return;
	}
	
	console.log("Adding", address);
	
	if(wallet.monitor_add.indexOf(address) > -1)
	{
		console.log("Address already in list, skipping.");
		return;
	}
	
	wallet.monitor_add.push(address);
	wallet.monitor_keyinx.push(keyInx);
	console.log("Address added to monitor list.");
}


// remove address from monitored addresses array
var removeMonitoredAddress = function(wallet, address)
{
	let index = wallet.monitor_add.indexOf(address);
	if(index < 0)
	{
		console.warn("Address cannot be found on monitor list.");
		return false;
	}else 
	{
		wallet.monitor_add.splice(index, 1);
		wallet.monitor_keyinx.splice(index, 1);
		console.log("Removed address from monitor list.");
		return address;
	}
}


// Loops through all addresses on monitor list,
// checks if there is an confirmed value input on any of that addresses
// if so, deletes this address from the list and calls
// callback(err, [{address: removedAddr, balance: confirmedInput},...]), 
// with error false (if no error)
// and array of addresses with confirmed inputs
var checkMonitorList = function(wallet, callback)
{
	try
	{
		iota.api.getBalances(wallet.monitor_add, 100, function(error, success)
		{
			if(!error)
			{
				var balances = success.balances;
				
				var removedList = [];
				var monitor_add_new = [];
				var monitor_keyinx_new = [];
				for(let i = 0; i < balances.length; i++)
				{
					if(balances[i] > 0)
					{
						removedList.push({	address:wallet.monitor_add[i], 
											balance:balances[i], 
											keyIndex: wallet.monitor_keyinx[i], 
											security: wallet.security });
					}else
					{
						monitor_add_new.push(wallet.monitor_add[i]);
						monitor_keyinx_new.push(wallet.monitor_keyinx[i]);
					}
				}
				
				wallet.monitor_add = monitor_add_new;
				wallet.monitor_keyinx = monitor_keyinx_new;
				callback(false, removedList);
			}else
			{
				console.error("Error getting Balances No 1:", error);
				callback(error, false);
			}
		});
	}catch(e)
	{
		console.error("Error getting Balances No 2:", e);
		callback(e, false);
	}
}


// Checks a single address for balance
// callback(balance), callback(false) if error
var getBalanceOfAddress = function(address, callback)
{
	try
	{
		iota.api.getBalances([address], 100, function(error, success)
		{
			if(!error)
			{
				callback(success.balances[0]);
			}else
			{
				console.error("Error getting address balances 1:", error);
				callback(false);
			}
		});
	}catch(e)
	{
		console.error("Error getting address balance 2:", e);
		callback(false);
	}
}

// check if bundle is valid (sum = 0, etc)
// check if all inputs are from addresses with confirmed balance
// callback(ok), ok === true if balance found, 0 if no balance found, false if network error, etc
// returns 0 & warning for already confirmed Bundles!!
var checkBundleUnconfirmedInputs = function(bundleHashes, bundleTransactionObjects, callback)
{
	// Sort transactionObjects to bundle
	bundles = [];	// bundles[bundle]
	bundleTransactionObjects.forEach((transaction)=>{
		
		var bundleNo = bundleHashes.indexOf(transaction.bundle);

		if(typeof bundles[bundleNo] == 'undefined')
		{
			bundles[bundleNo] = [];
		}
		
		bundles[bundleNo][transaction.currentIndex] = transaction;
	});
	
	bundles.forEach((bundle)=>{
		if(!iota.utils.isBundle(bundle))
		{
			callback(0);		// Cannot be accepted
		}
	});
	
	// Now check inputs of bundles
	var inputAddresses = [];
	var inputValues = [];	// Values to check corresponding to inputAddresses
	bundles.forEach((bundle)=>{
		bundle.forEach((transaction)=>{
			if(transaction.value < 0)		// input to bundle
			{
				inputAddresses.push(transaction.address);
				inputValues.push((-1)*transaction.value);
			}
		});
	});
	
	try
	{
		// get confirmed balances of input addresses
		iota.api.getBalances(inputAddresses, 100, function(error, success)
		{
			if(error)
			{
				console.error('Error getting input address balance.');
				callback(false);
				return;
			}
						
			if(inputValues.every((val, inx)=>{ return val == success.balances[inx] }))		// all balances ok
			{
				// all ok
				console.log('Balances OK.');
				callback(true);
			}
			else
			{
				console.warn('Not all balances are confirmed or real!');
				callback(0);
				return;
			}
		});
	}catch(e)
	{
		console.error('Error getting input address balance.');
		callback(false);
		return;
	}
}

// Checks a single address for balance, accepts unconfirmed transactions
// checks also balance of input addresses of bundle, which have to have confirmed
// balances with value of corresponding input
// callback(balance), callback(false) if error
// callback(0) if no unconfirmed balance or some confirmed & some unconfirmed balance (multiple 
// bundles)
// returns confirmed balance if every input is confirmed.
var getUnconfirmedBalance = function(address, callback)
{
	try
	{
		iota.api.findTransactionObjects({'addresses': [address]}, (e, s)=>{
			
			if(e)
			{
				console.error('Cannot get TransactionObjects to check for unconfirmed balance. :', e);
				callback(false);
				return;
			}
			else
			{
				var bundles = [];		// [bundleHash1, bundleHash2, ...]
				var balance = 0;
					
				s.forEach((transaction) =>
				{ 
					if(bundles.indexOf(transaction.bundle) < 0 && transaction.value != 0)
					{ 
							bundles.push(transaction.bundle); 
							balance += transaction.value;
					}
				});

				getBalanceOfAddress(address, (balanceConf) => 
				{
					// Now get transaction objects of bundles...
					try
					{
						if(balanceConf === false)
							throw Error("Error getting Balance");
						
						if(balanceConf == balance)
						{
							// Everything confirmed, no need to do anything more
							callback(balance);
							return;
						}
						
						iota.api.findTransactionObjects({'bundles': bundles}, (e, s) =>
						{ 
							if(e)
							{
								console.error('Cannot get bundle TransactionObjects to check for unconfirmed balance. :', e);
								callback(false);
								return;
							}
							
							checkBundleUnconfirmedInputs(bundles, s, (ok) =>
							{
								if(ok === false)	// error getting values (network errors ...)
								{					// can be retried...
									callback(false);
								}
								else if(ok === true)
								{				
									callback(balance);
								}
								else
								{				// just no unconfirmed balance (ok === 0)
									callback(0);
								}
							});
						});
					}catch(e)
					{
						console.error('Cannot get bundle transactionObjects to check for unconfirmed balance. :', e);
						callback(false);
					}
				});
			}
		});
	}catch(e)
	{
		console.error("Error getting unconfirmed address balance 2:", e);
		callback(false);
	}
}


// takes signed bundles (from flash channel)
// and appends it to the tangle
// callback(err, sentBundles)
var sendBundles = function(bundles, callback)
{
	try
	{
		// var bundle = bundles[0];
		let sentBundles = [];
		
		(function sendBundle()
		{
			if(bundles.length == 0)
			{
				if(sentBundles !== false)
				{
					callback(false, sentBundles);
				}
				return;
			}
			
			let bundle = bundles.shift();
			
			let bundleTrytes = [];
			bundle.forEach(function (tx) {
				bundleTrytes.push(iota.utils.transactionTrytes(tx))
			});
			
			bundleTrytes = bundleTrytes.reverse();
			
			iota.api.sendTrytes(bundleTrytes, ws.std_depth, ws.minweightmag, (e, s)=>{
				
				if(e)
				{
					console.error("Error sending bundles to tangle:", e);
					callback(e, false);
					sentBundles = false;
					return;
				}else{
					console.log('Sent bundle successfully to tangle.');
					sentBundles.push(s);
					sendBundle();
				}
			});
		}());
	}catch(e)
	{
		console.error("Error sending tryte Bundle:", e);
		callback(e);
	}
}


// Add external bundle to reattach/promote until confirmed
// txHash = bundles[0].hash
var addReattachWatchBundle = function(wallet, tailTxHash)
{
	// get tail transaction hash and put in wallet outputs array
	wallet.pending_out.push(tailTxHash);
	wallet.pending_bal.push(0);
	wallet.pending_infobal.push(0);
}


// Takes bundleHash and requests the tail hash of each (reattached) bundle
// callback(error, hashesArray)
var getBundleTailHashes = function(wallet, bundleHash, callback)
{
	try
	{
		iota.api.findTransactionObjects({'bundles': [bundleHash]}, function(e, s){
			if(e){
				callback(e, false);
				return;
			}
			
			callback(false, s.filter(tx => tx.currentIndex == 0).map(tx => tx.hash));
		});
	}catch(e)
	{
		console.error('Error getting bundle transactions');
		callback(e, false);
	}
}

// Takes bundleHash and requests the tail hash of each bundle of an address
// callback(error, [{txHash, value}]), where value is value of bundle as seen of address (input > 0, output < 0)
var getAddressTailHashes = function(wallet, address, callback)
{
	try
	{
		iota.api.findTransactionObjects({'addresses': [address]}, function(e, s){
			if(e){
				callback(e, false);
				return;
			}
			
			// Sort to bundles
			let bundles = [];
			s.forEach(tx => {
				if(typeof bundles[tx.bundle] === 'undefined')
				{
					bundles[tx.bundle] = [];
				}
				bundles[tx.bundle].push(tx);
			});
			// Only interested in non zero - bundles
			bundles = bundles.filter(bundle => bundle.some(tx => tx.value != 0));
			// Get sorted out values
			callback(false, bundles.map(bundle => {
				let value = bundle.filter(tx => tx.address == address).reduce((acc, tx) => acc + tx.value, 0);
				let tailTxHash = bundle.filter(tx => tx.currentIndex == 0)[0].hash;	// exactly one tx should have index 0
				
				return {txHash: tailTxHash, value: value};
			}));
		});
	}catch(e)
	{
		console.error('Error getting address transactions');
		callback(e, false);
	}
}


// Takes bundlehash and checks if any (re) attachments have been confirmed
var isBundleConfirmed = function(wallet, bundleHash, callback)
{
	getBundleTailHashes(wallet, bundleHash, (e, txHashes)=>{
		try
		{
			if(e){
				callback(e, undefined);
				return;
			}
			
			iota.api.getLatestInclusion(txHashes, (e, s)=>{
				if(e){
					callback(e, undefined);
					return;
				}
				
				callback(false, s.some(state => state));
				return;
			});
		}catch(e)
		{
			callback(e, undefined);
		}
	});
}


// searches inputs to seed on tangle, if sarch finishes without error, it deletes
// all inputs from wallet and replaces them with the found inputs
// then also updates balance of wallet.
// callback (error), false if success
var searchReInitializeInputs = function(wallet, options = {}, callback = false)
{
	if(typeof options === 'function'){
		callback = options;
		options = {};
	}
	
	options.security = wallet.security;
	
	try
	{
		iota.api.getInputs(wallet.seed, options, (e, s) => {
			
			if(e)
			{
				console.warn("Error occurred when getting Inputs from tangle:", e);
				callback(e);
				return;
			}
			
			wallet.inputs = [];
			s.inputs.forEach(item => {
				wallet.inputs.push({ 	address: item.address, 
										balance: Number(item.balance),
										security: Number(item.security),
										keyIndex: Number(item.keyIndex) 
									});
				});
				
			let maxInx = Math.max(...wallet.inputs.map(i => i.keyIndex));
			if(maxInx > wallet.index)
			{
				console.log("Resetting wallet index to " + maxInx + 
								"(old index: " + wallet.index + ").");
								
				wallet.index = maxInx;
			}
			
			wallet.balance = s.totalBalance;
			console.log("Success. Set Inputs:", s, "new wallet balance:", wallet.balance);
			
			callback(false);		// finished
		});
	}catch(e)
	{
		callback(e);
	}
}


// Calculate current wallet balance from inputs
var reInitializeBalance = function(wallet, callback = false)
{
	try
	{
		
		wallet.balance = wallet.inputs.reduce((acc, input) => { return input.balance; }, 0);
		
		callback(false);

	}catch(e)
	{
		callback(e);
	}
}


module.exports = {
	'updateSettings'		: updateSettings,
	'setupCheckNode'		: setupCheckNode,		// Has to be called to initialize iota object!
	'storeWalletToFile'		: storeWalletToFile,
	'getWalletFromFile'		: getWalletFromFile,
	'createWallet'			: createWallet,
	'getAddress'			: getAddress,
	'generateAddress'		: generateAddress,
	'checkBufferedAddresses': checkBufferedAddresses,
	'attachAddressToTangle' : attachAddressToTangle,
	'sendTransfer'			: sendTransfer,
	'reattachPending'		: reattachPending,
	'addMonitoredAddress'	: addMonitoredAddress,
	'removeMonitoredAddress': removeMonitoredAddress,
	'checkMonitorList'		: checkMonitorList,
	'getBalanceOfAddress'	: getBalanceOfAddress,
	'sendBundles'			: sendBundles,
	'getUnconfirmedBalance'	: getUnconfirmedBalance,
	'addReattachWatchBundle': addReattachWatchBundle,
	'getBundleTailHashes'	: getBundleTailHashes,
	'isBundleConfirmed'		: isBundleConfirmed,
	'getAddressTailHashes'	: getAddressTailHashes,
	'searchReInitializeInputs'	: searchReInitializeInputs,
	'reInitializeBalance'	: reInitializeBalance
}



