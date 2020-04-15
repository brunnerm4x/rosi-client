/*
 * 
 *   	ROSI - Raltime Online Streaming with IOTA
 * 
 * 			PAYMENT / ONCHANNEL MAIN WORKER
 * 
 * 
 * 		Updated: 26.03.2020
 * 
 * */
 

importScripts('./rosi_main.browser.js');		// Import rosi main library
importScripts('./main_lists.js');				// Import lists helper
importScripts('./main_scheduler.js');			// Import scheduler helper
importScripts('./channel_worker_helper.js');	// Import external worker helpers

// Channel is closed, when manageActiveChannels() is called, and channel deposit 
// is confirmed and other channel with same user has confirmed(!) minimum 0.5*collateral balance
// and availableBalance < channelCollateral * FACTOR_CHANNEL_CLOSE_AMOUNT
const FACTOR_CHANNEL_CLOSE_AMOUNT = 0.05;		
												
												


 
////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////				CREATE CHANNEL				////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////// 


//////////////////////////// 	QUEUE CHANNEL   (SETUP PART 1)	////////////////////////////////////

var queueChannel = function(m)
{
	//queueChannel(m.provider, m.url_payserv, m.minTx, m.collateral);
	console.log("Requesting new channel .... ");
	
	let provider = m.provider;
	let url_payserv = m.url_payserv;
	let minTx = m.minTx;
	let bal = m.collateral;
	
	var newChannelData = {
		provider: provider,
		url_payserv: url_payserv,
		settlementAddress: "",
		minTxCnt: minTx,
		collateral: bal,
		preparedInExternalWorker: false	// true as soon as this channel is given to another worker
	};

	// first get new address from wallet for settlement
	postMessage({request:'get_settlement_address'});
	
	newChannelQueue.push(newChannelData);
	saveChannelQueue(newChannelQueue);
	
	sendActiveChannelList(0);	// Because main.js worker will not be responding while creating 
								// channel, list has to be buffered in main thread
}
 


//////////////////////////// 	CREATE CHANNEL   (SETUP PART 2)	////////////////////////////////////

var  setupChannel = function(settlementAddress)
{
	let newChannelData = newChannelQueue.shift();
	
	let params = {
		newChannelData: newChannelData,
		settlementAddress: settlementAddress
	};
	
	/// EXTERNAL WORKER
	createChannelWorker('createChannel', params).then(data => {
	
		console.log("Created channel with id:", data.depositAddress);
	
		activeChannelList.push({ 	provider: newChannelData.provider, 
									depositAddress : data.depositAddress,
									availableBalance: 0,		
									availableUnconfirmed: 0,
									channelCollateral: data.balance,
									depositTransaction: false,		// Tx hash of deposit tx
									preparedInExternalWorker: false	// flag/given to subworker
							 });
		
		saveActiveChannelList(activeChannelList);
		
		saveChannelQueue(newChannelQueue);
		sendActiveChannelList(0);
		
		// inform wallet to send deposit
		postMessage({	request: 'fund_deposit_address', 
						address: data.depositAddress,
						amount: data.balance,
						provider: newChannelData.provider
					});
		// inform background_main
		postMessage({request: 'new_channel_created', provider: newChannelData.provider});
		
	}).catch(e => {
	
		console.error("Error creating channel in external worker: " + e);
		postMessage({request: 'channel_create_error', error: e});
		return;
		
	});	
}


/////////////////////////	SET DEPOSIT TRANSACTION  (SETUP PART 3)	 ///////////////////////////////

// Channel setup part 3 ERROR
var depositErrorOccurred = function(depositAddress, error)
{
	console.error("Error occurred when depositing to address " + depositAddress + 
					". Putting on delay until next new deposit is sent and confirmed." + 
					"Error: " + error);
					
	postMessage({request: 'channel_create_error', error: error});
	
	// TODO: Do what is said ;)	// normally wallet should handle this .... 
}

// Channel setup part 3 SUCCESS
var depositSuccess = function(m)
{
	if(m.request === 'funds_sent_saved_task')
	{
		// old sent request was probably finished (from last session/ before browser restart
		if(getChannelObjectArrayIndex(m.address) > -1)
		{
			m.success = true;
		}
		else
		{
			// No channel with this deposit address, probably manual transfer -> ignore
			m.success = false;	
		}
	}
	
	if(m.success != true)
	{
		depositErrorOccurred(m.address, m.error);
	}
	else
	{
		let arr_inx = getChannelObjectArrayIndex(m.address);
		
		if(arr_inx < 0)
		{
			console.warn('DEPOSIT SENT SUCCESS request: UNKNOWN CHANNEL ID!');
			return;
		}
		
		rosi_main.hasAllowedUnconfirmedBalance(m.address, (amount)=>{
			
			// Set unconfirmed balance
			activeChannelList[arr_inx].depositTransaction = m.txHash;
			
			activeChannelList[arr_inx].availableUnconfirmed = 
				(amount < activeChannelList[arr_inx].channelCollateral) ? 
					amount : activeChannelList[arr_inx].channelCollateral;
			saveActiveChannelList(activeChannelList);
			
			postMessage({ request: 'channel_useable', channelId:  m.address,
							provider: activeChannelList[arr_inx].provider });
			
			currentTaskFinished();			// Inform Task Scheduler
		});
	}
}


////////////////////////	SET DEPOSIT TX CONFIRMED   (SETUP PART 4)	////////////////////////////

// Channel setup part 4
var setChannelFunded = function(depositAddress)
{
	let inx = getChannelObjectArrayIndex(depositAddress);
	if(inx == -1)
	{
		console.error('Set channel funded: channelId not available anymore: ' + depositAddress);
		return;
	}
	
	// (+) because of probably unconfirmed txs
	activeChannelList[inx].availableBalance += activeChannelList[inx].channelCollateral;	
	
	// When unconfirmed < 0 -> indicator that channel is already confirmed
	activeChannelList[inx].availableUnconfirmed = -1;	
	
	let provider = activeChannelList[inx].provider;
	postMessage({request: 'channel_funded_available', provider: provider});
	
	saveActiveChannelList(activeChannelList);
	
	currentTaskFinished();			// Inform Task Scheduler
}



 
////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////				CLOSE CHANNEL				////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////// 


// Close flash channel
var closeChannel = function(channelId, balance = -1)
{
	// Check if channel is funded ...
	
	let inx = getChannelObjectArrayIndex(channelId);
	if(inx >= 0)
	{
		if(activeChannelList[inx].preparedInExternalWorker === true)
		{
			console.warn("This channel is already processed in external worker.");
			return;
		}
		
		activeChannelList[inx].preparedInExternalWorker = true;
		
		/// EXTERNAL WORKER
			
		let params = {
			channelId: channelId,
			balance : balance
		}
		
		let manageError = (e) => 
		{
			inx = getChannelObjectArrayIndex(channelId);
			
			if(inx >= 0)
			{
				activeChannelList[inx].failedToClose = 
					typeof activeChannelList[inx].failedToClose == 'undefined' ? 
					1 :  activeChannelList[inx].failedToClose + 1;
					
				if(activeChannelList[inx].failedToClose > 5)
				{
					restoreClosedChannelList((err)=>{
						if(err){
							console.error('Error restoring closed channel list:', err);
						}
						
						closedChannelList.push(activeChannelList.splice(inx, 1)[0]);
						saveActiveChannelList(activeChannelList);
						saveClosedChannelList(closedChannelList);
						
						// to background_main
						postMessage({request: 'closed_channel', success: true, 
									info: "MAX Error -> deleted from list." });
					});
					
					activeChannelList[inx].preparedInExternalWorker = false;
					return;
				}
				
				////	Try to resolve conflicts that can prevent the channel to close ...
				// Note that .preparedInExternalWorker is left true to prevent closing
				// before the conflicts are resolved!
				
				console.warn("------------------- WARNING -----------------------------\n" + 
							 "         NOW REQUESTING RESOLVE CONFLICTS 				\n" +
							 "---------------------------------------------------------\n");
				console.log("Resolve Conflicts should be a pure debugging tool and not" +
							"included in the Release Version. This means in Release the" + 
							"Program would now fail to operate!" );
							
				task_queue.splice(0, 0, { taskname: 'resolveConflicts', params: 
										{ m: { channelId: channelId } } });
				taskQueueStartNext();
										
			}
			
			// To background main
			postMessage({request: 'closed_channel', success: false, info: e });			
		};
		
			/// EXTERNAL WORKER
		
		createChannelWorker("closeChannel", params).then(data => {
			
			signedBundles = data.signedBundles;
			
			inx = getChannelObjectArrayIndex(channelId);
			if(inx >= 0)
			{
				activeChannelList[inx].preparedInExternalWorker = false;
				
				if(signedBundles === false)
				{
					console.error('Error when closing channel.');
					manageError(false);
				}
				else
				{
					console.log('Channel closed successfully, can now withdraw.');
										
					activeChannelList[inx].availableBalance = 0;
					activeChannelList[inx].availableUnconfirmed = 0;
					
					restoreClosedChannelList((err)=>{
						if(err){
							console.error('Error restoring closed channel list:', err);
						}
						
						closedChannelList.push(activeChannelList.splice(inx, 1)[0]);
						saveActiveChannelList(activeChannelList);
						saveClosedChannelList(closedChannelList);
						
						// to wallet -> let provider do this (comment out)
						// postMessage({request: 'closed_channel_bundles', bundles: signedBundles});	

						// to background_main
						postMessage({request: 'closed_channel', success: true });
					});
				}		
			}
			else
			{
				// to background_main
				postMessage({request: 'closed_channel', success: true, 
					info: "Invalid channelId returned.", channelId: channelId});
			}	
		}).catch(e => {
			manageError(e);
		});
	}
	else
	{
		// to background_main
		postMessage({request: 'closed_channel', success: true, 
			info: "ChannelID not found in activeChannels", channelId: channelId});	
	}
}



 
////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////				SEND PAYMENT				////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////// 


// TabId is just relayed through to later send information to right tab.
var pay = function(message)	
{
	let provider = message.provider;
	let amount = message.amount;
	let reqId = message.reqId;
	let streamId = message.streamId;
	
	console.log('Request to pay', amount, 'iota to', provider);
	
	var channelId = getProviderChannelWithBalance(provider, amount);
	if(channelId == false)	// No channel with sufficient balance
	{
		channelId = getProviderChannelWithUnconfirmedBalance(provider, amount);
		if(channelId == false)
		{
			console.warn('No channel with sufficient balance available.');
			postMessage({request: 'unsufficient_channel_balance', reqId: reqId, provider: provider, 
						streamId: message.streamId, timestamp: message.timestamp, amount:amount});
						
			currentTaskFinished();			// Inform Task Scheduler
			return;
		}
	}
	
	var arr_inx = getChannelObjectArrayIndex(channelId);
	
	
	// Prepare transaction
	rosi_main.pay(activeChannelList[arr_inx].depositAddress, amount, {paymentReference: streamId}, 
	function(e)
	{
		if(e)
		{
			// Handle error
			console.log('PAY ERROR:', e);
			if(e == "PAYMENT_NOT_ACCEPTED")
			{
				console.warn("------------------- WARNING -----------------------------\n" + 
							 "         NOW REQUESTING RESOLVE CONFLICTS 				\n" +
							 "---------------------------------------------------------\n");
				console.log("Resolve Conflicts should be a pure debugging tool and not" +
							"included in the Release Version. This means in Release the" + 
							"Program would now fail to operate!" );
							
				task_queue.splice(0, 0, currentTask);
				task_queue.splice(0, 0, { taskname: 'resolveConflicts', params: 
										{ m: { channelId: channelId } } });
			}
			else
			{
				postMessage({	request: 'general_pay_error', 
								error: e, 
								reqId: reqId, 
								provider: provider, 
								streamId: message.streamId, 
								timestamp: message.timestamp, 
								amount: amount
							});
			}
			currentTaskFinished();			// Inform Task Scheduler
			return;
		}
		else
		{
			// transaction successful			
			arr_inx = getChannelObjectArrayIndex(channelId);
			try
			{
				activeChannelList[arr_inx].availableUnconfirmed -= amount;
				activeChannelList[arr_inx].availableBalance -= amount;
				saveActiveChannelList(activeChannelList);
				
				console.log('Payment successful. StreamID: ' + message.streamId);
					
				let provInfo = providerChannelInfo(provider);
				postMessage({request: 'channel_pay_successful', 
							reqId: reqId,
							provider: provider, 
							channelId: channelId, 
							paymentAmount: amount,
							streamId: message.streamId,
							timestamp: message.timestamp,
							amount : amount,
							// instantly available channel balance (if confirmed, 
							// real remaining, else unconfirmed remaining
							available: (activeChannelList[arr_inx].availableBalance < 0) ? 
										activeChannelList[arr_inx].availableUnconfirmed :
											activeChannelList[arr_inx].availableBalance,
							provAvailable: provInfo.openChannelBalance,
							channelCollateral: activeChannelList[arr_inx].channelCollateral
							});
						
			} catch(e) {
					console.error("Error managing channellists:" + e);
					postMessage({request: 'general_pay_error', 
						error: e, reqId: reqId, provider: provider, 
						streamId: message.streamId, timestamp: message.timestamp, amount:amount });
			};
			
			currentTaskFinished();			// Inform Task Scheduler
		}
	});
}


 
////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////				HELPERS						////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////// 


//////////////////////////// 	CHANNEL LISTS HELPERS			////////////////////////////////////

// get the already funded Channel with the best fitting balance
var getProviderChannelWithBalance = function(provider, minBalance)
{
	var channels = getProviderChannelId(provider);
	
	var channelId = false;
	var channelBal = 0;
	
	for(let i = 0; i < channels.channelIds.length; i++)
	{
		if(channels.balances[i] >= minBalance && (
			(channels.balances[i] < channelBal) || channelBal == 0))
		{
			channelId = channels.channelIds[i];
			channelBal = channels.balances[i];
		}
	}
	
	return channelId;
}

// get the already funded Channel with the best fitting balance
var getProviderChannelWithUnconfirmedBalance = function(provider, minBalance)
{
	var channels = getProviderChannelId(provider);
	
	var channelId = false;
	var channelBal = 0;
	
	for(let i = 0; i < channels.channelIds.length; i++)
	{
		if(channels.unconfirmedBalances[i] >= minBalance && (
			(channels.unconfirmedBalances[i] < channelBal) || channelBal == 0))
		{
			channelId = channels.channelIds[i];
			channelBal = channels.unconfirmedBalances[i];
		}
	}
	
	return channelId;
}

var getChannelObject = function(channelId)
{
	for(let i = 0; i < activeChannelList.length; i++)
	{
		if(activeChannelList[i].depositAddress == channelId)
		{
			return activeChannelList[i];
		}
	}
	
	return false;	
}

var getChannelObjectArrayIndex = function(channelId)
{
	for(let i = 0; i < activeChannelList.length; i++)
	{
		if(activeChannelList[i].depositAddress == channelId)
		{
			return i;
		}
	}
	
	return -1;	
}

// returns array of channel Ids with given provider
var getProviderChannelId = function(provider)
{
	var channelIds = [];
	var balances = [];
	var unconfirmedBalances = [];
	var lastOpenChannelCollateral = 0;
	
	for(let i = 0; i < activeChannelList.length; i++)
	{
		if(activeChannelList[i].provider == provider)
		{
			channelIds.push(activeChannelList[i].depositAddress);
			balances.push(activeChannelList[i].availableBalance);
			unconfirmedBalances.push(activeChannelList[i].availableUnconfirmed);
			lastOpenChannelCollateral = activeChannelList[i].channelCollateral;
		}
	}
	
	return {channelIds: channelIds, balances: balances, unconfirmedBalances: unconfirmedBalances, 
			lastOpenChannelCollateral: lastOpenChannelCollateral};
}


// Check if provider has an open or closed channel
// openChannelBalance is available amount, if confirmed remaining channel collateral,
// if unconfirmed remaining unconfirmed allowed balance
var providerChannelInfo = function(provider)
{
	let channels = getProviderChannelId(provider);
	let has_open = channels.channelIds.length > 0 ? true : false;
	
	if(has_open)
	{
		let balance = channels.balances.reduce((acc, val, inx) => {
			let bal = 0;
			
			if(val > 0)
			{
				bal = val;		// channel deposit confirmed
			}else if(val < 0 || channels.unconfirmedBalances[inx] > 0)
			{
				bal = channels.unconfirmedBalances[inx];	// channel deposit unconfirmed
			}		// else: channel bal is 0
			
			return acc + bal;
		}, 0);
		
		return {hasChannel: true, hasOpenChannel: true, openChannelBalance: balance, 
				lastOpenChannelCollateral:  channels.lastOpenChannelCollateral};
	}
	
	// Check closed channels
	let has_closed = closedChannelList.filter(channel => channel !== null && 
		channel.provider == provider).length > 0 ? true : false;
		
	return {hasChannel: has_closed, hasOpenChannel: false, openChannelBalance: 0, 
			lastOpenChannelCollateral:  channels.lastOpenChannelCollateral};
}


// 	Send active channels to background
var sendActiveChannelList = function(reqId)
{
	postMessage({	request: 'channel_list', 
					reqId: reqId,
					active: activeChannelList,
					closed: closedChannelList,
					queue: newChannelQueue
				});
}



//////////////////////////// 		CHANNEL MANAGER				////////////////////////////////////


// Check channels to be closed...
var manageActiveChannels = function()
{
	for(let i = 0; i < activeChannelList.length; i++)
	{
		let channel = activeChannelList[i];
		
		if(channel.availableBalance <= 0 && channel.availableUnconfirmed >= 0)
		{
			return;		// Do nothing, channel deposit hasn't even confirmed yet
		}
		else if(channel.availableBalance == 0 && channel.availableUnconfirmed < 0)
		{
			console.log('Channel balance is 0, requesting to close...');
//			closeChannel(channel.depositAddress);
			// Get balance of deposit address so that no balance
			// gets lost
			postMessage({	
					request: 'get_deposit_balance', 
					address: channel.depositAddress
				});
					
			// Only request 1 close channel per call of manageActiveChannels, to prevent overload
			return; 	
		}
		else if(channel.availableBalance < channel.channelCollateral * FACTOR_CHANNEL_CLOSE_AMOUNT)
		{
			if(activeChannelList.filter(ac => ac.provider == channel.provider && 
									ac.availableBalance > ac.channelCollateral * 0.5).length > 0)
			{
				 console.log('Channel balance below threshold, requesting to close...');
				// closeChannel(channel.depositAddress);
				
				// Get balance of deposit address so that no balance
				// gets lost
				postMessage({	
						request: 'get_deposit_balance', 
						address: channel.depositAddress
					});
				
			// Only request 1 close channel per call of manageActiveChannels, to prevent overload
				 return; 	
			}				
		}
	};
}



// Request balance from channelobject and set value in channelList
var updateChannelBalance = function(channelId)
{
	let inx = getChannelObjectArrayIndex(channelId);
	if(inx < 0)
		return inx;
	
	rosi_main.getChannelBalance(channelId).then(balance => {
		console.log("Current balance: ", balance);
		let payed = activeChannelList[inx].channelCollateral - balance;
		if(activeChannelList[inx].availableBalance < 0)		// unconfirmed inputs
		{
			let unconfirmedCollateral = activeChannelList[inx].availableUnconfirmed - 
												activeChannelList[inx].availableBalance;
			activeChannelList[inx].availableBalance = -1 * payed;
			activeChannelList[inx].availableUnconfirmed = unconfirmedCollateral - payed;
		}
		else
		{
			activeChannelList[inx].availableBalance = balance;
		}
		
		saveActiveChannelList(activeChannelList);
	});
}


// Tries to resolve conflicts on channel transactions with provider
var resolveConflicts = function(m)
{
	console.log("Resole Conflicts requested.");
	rosi_main.resolveIndexConflict(m.channelId).then(r => {
		
		console.log("Resolve Conflicts success.");
		updateChannelBalance(m.channelId);
		postMessage({ request: 'resolve_index_conflicts_finished', retval:r }); 
		
		let inx = getChannelObjectArrayIndex(m.channelId);
		if(inx >= 0)
		{	
			activeChannelList[inx].preparedInExternalWorker = false;
		}
		
		currentTaskFinished();			// Inform Task Scheduler
	}).catch(e => {
		
		console.error("Resolve Conflicts Error:" + e);
		updateChannelBalance(m.channelId);
		postMessage({ request: 'resolve_index_conflicts_finished', retval:e }); 
		
		let inx = getChannelObjectArrayIndex(m.channelId);
		if(inx >= 0)
		{	
			activeChannelList[inx].preparedInExternalWorker = false;
			if(typeof activeChannelList[inx].resolveErrorCnt == 'undefined')
				activeChannelList[inx].resolveErrorCnt = 1;
			else
				activeChannelList[inx].resolveErrorCnt ++;
		}
		
		if(activeChannelList[inx].resolveErrorCnt > 3 || (''+e).indexOf('REVERT') > -1)
		{
			// chance to fix this channel is very low - try to at least close it so the 
			// funds aren't stuck ...
			
			// set available funds to zero so that channel isn't used anymore 
			activeChannelList[inx].availableBalance = 0;
			activeChannelList[inx].availableUnconfirmed = -1;
			
			saveActiveChannelList(activeChannelList);
			
			// request current balance of input address & close channel ...
			postMessage({	
				request: 'get_deposit_balance', 
				address: m.channelId
			});
			
			// reminder: if channel closing failes 4 times, channel will be moved to 
			// closedChannelList and not be used anymore -> user has best possible experience
			// because new channel will be created ... 
			// old channel issue can later be resolved manually ... (hopefully ;))
		}
		
		currentTaskFinished();			// Inform Task Scheduler
	});
}



//////////////////////////// 			STATUS					////////////////////////////////////

// Add a waitForConfirmation job for every channel marked as pending deposit input
// Should only be called on startup and when absolutly necessary
var checkConfirmationStatus = function()
{
	activeChannelList.forEach((channel) => {
		if(channel.availableBalance >= 0 && channel.availableUnconfirmed < 0)
		{
			return;		// Already confirmed, do nothing
		}
		// This will add a wallet wait for confirm job that returns with 
		// 'deposit_funds_sent_confirmed' message as soon as deposit is confirmed.
		postMessage({	request: 'watch_deposit', 
						provider: channel.provider,
						address: channel.depositAddress,
						amount: channel.channelCollateral
					});
					
		console.log('Requested wallet to watch deposit on address ' + 
						channel.depositAddress + '...');
	});
}

//////////////////////////// 			SECURITY CHECK			////////////////////////////////////

// If provider is not new, perform getproviderkey request to payserver
// return values: resolve('KNOWN_OK'), resolve('NEW'); reject('KNOWN_FAIL'), reject('ERROR')
var initCheckProvider = function(url, provider)
{
	return new Promise((resolve, reject) => {
		let channelId = getProviderChannelId(provider).channelIds;
		if(channelId.length > 0)
		{
			channelId = channelId[0];
		}
		else
		{
			// No open channel, check closed channels
			let closedChannels = closedChannelList.filter(c => c !== null && c.provider == provider);
			if(closedChannels.length > 0)
			{
				channelId = closedChannels[0].depositAddress;
			}
			else
			{
				channelId = false;
			}
		}
		
		if(channelId === false)
		{
			resolve('NEW');
			return;
		}
		
		console.log('Checking authenticity of channelId: ' + channelId + ' of provider: ' + 
			provider + ' with url: ' + url);
		rosi_main.checkProviderAuthenticity(channelId, url).then((keyOK) => {
			if(keyOK === true)
			{
				resolve('KNOWN_OK');
			}
			else
			{
				reject(new Error('KNOWN_FAIL'));
			}
		}).catch(e => {
			reject(e);
		});
	});
}



//////////////////////////// 		GET IOTA DIRECT ADDRESS		////////////////////////////////////

var getDirectAddress = function(m)
{
	console.log("providerObj:", m.providerObj);
	rosi_main.getDirectAddress(m.providerObj.urlPayserver, m.txId).then(result => {
	
		postMessage({	request: 'get_direct_address', 
						reqId: m.reqId,
						accepted: true,
						address: result
		}); 
		currentTaskFinished();			// Inform Task Scheduler
	}).catch(e => {
		
		postMessage({	request: 'get_direct_address', 
						reqId: m.reqId,
						accepted: false,
						address: false
		});
		currentTaskFinished();			// Inform Task Scheduler
	});
}



 
////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////			MESSAGES FROM BACKGROUND MAIN		////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////// 


onmessage = function(e) 
{

	var m = e.data;
	var request = m.request;
	
	
//////////////////////////// 		MAIN FUNCTIONS			////////////////////////////////////////


	if(request == 'new_channel')							//// CREATE CHANNEL
	{
		/// INSTANT
		queueChannel(m);
	}
	
	else if(request == 'send_channel_payment')				//// SEND PAYMENT
	{
		/// SCHEDULED
		taskQueuePush("pay", { m: m });
	}
	
	else if(request == 'get_direct_address')				//// GET DIRECT ADDRESS
	{
		/// SCHEDULED
		taskQueuePush("getDirectAddress", { m: m });
	}
	
	else if(request == 'close_channel')						////  CLOSE CHANNEL
	{
		// Intended for debugging use only
				
		// Get balance of deposit address so that no balance
		// gets lost
		postMessage({	
				request: 'get_deposit_balance', 
				address: m.channelId
			});
	}
		
	else if(request == 'resolve_conflicts')					////  CONFLICTS RESOLVE
	{
		// Intended for debugging use only
		/// SCHEDULED - NEXT TASK !!
		task_queue.splice(0, 0, { taskname: 'resolveConflicts', params: { m: m} });
		taskQueueStartNext();
	}
	

//////////////////////////// 			SECURITY CHECK		////////////////////////////////////////
	
	else if(request == 'initcheck_provider')
	{
		/// INSTANT
		initCheckProvider(m.urlPayserv, m.provider).then(result => {

			postMessage({	request: 'initcheck_provider', 
					result: result,
					reqId: m.reqId,
					urlWebserv: m.urlWebserv,
					urlPayserv: m.urlPayserv,
					provider: m.provider,
					tabId: m.tabId,
					suggestedCollateral: m.suggestedCollateral,
					version: m.version
			});
		
		}).catch(e => {

			postMessage({	request: 'initcheck_provider', 
					result: 'FAIL', 
					error: e.toString(),
					reqId: m.reqId,
					urlWebserv: m.urlWebserv,
					urlPayserv: m.urlPayserv,
					provider: m.provider,
					tabId: m.tabId,
					suggestedCollateral: m.suggestedCollateral,
					version: m.version
			});
		});
	}
	

//////////////////////////// 			STATUS				////////////////////////////////////////	
	
	else if(request == 'get_provider_info')					//// PROVIDER
	{
		/// INSTANT
		let provInfo = providerChannelInfo(m.provider);
		postMessage({	request: 'provider_info', 
						provider: m.provider,
						hasChannel: provInfo.hasChannel,
						hasOpenChannel: provInfo.hasOpenChannel,
						openChannelBalance:  provInfo.openChannelBalance,
						lastOpenChannelCollateral: provInfo.lastOpenChannelCollateral
					});
	}
	
	else if(request == 'get_channels_status')				//// CHANNELS STATUS
	{
		/// INSTANT
		postMessage({	request: 'channels_status', 
						status: {
							openChannelCnt: activeChannelList.length,
							openChannelBal: activeChannelList.reduce((a, c) => 
								a + (c.availableBalance > 0 ? c.availableBalance : 0), 0),
							openChannelBalUnconf:  activeChannelList.reduce((a, c) =>
								a + (c.availableUnconfirmed > 0 ? c.availableUnconfirmed : 0), 0)
						}
					});
	}
	
	else if(request == 'get_active_channels')				//// CHANNELS ACTIVE
	{
		/// INSTANT
		sendActiveChannelList(m.reqId);
	}
	
	
	else if(request == 'get_provider_channels')				//// CHANNELS OF PROVIDER
	{
		/// INSTANT
		let provInfo = providerChannelInfo(m.provider);
		postMessage({	request: 'provider_channels', 
						reqId: m.reqId,
						provider: m.provider,
						channelIds: getProviderChannelId(m.provider).channelIds
					});
	}
	
	
	else if(request == 'check_confirmation_status')				//// CHANNELS OF PROVIDER
	{
		/// INSTANT
		console.log("Requesting to check confirmation of deposits ...");
		checkConfirmationStatus();
	}


//////////////////////////// 	RESPONSES (FROM WALLET)			////////////////////////////////////


	else if(request == 'new_settlement_address')				//// NEW ADDRESS
	{
		/// INSTANT - EXTERNAL WORKER
		setupChannel(m.address);
	}
																//// WALLET TX SENT
	else if(request == 'deposit_funds_sent' || request == 'funds_sent_saved_task')
	{
		/// SCHEDULED
		taskQueuePush("depositSuccess", { m : m });
	}
	
	else if(request == 'deposit_funds_sent_confirmed')			//// WALLET TX CONFIRMED
	{
		/// SCHEDULED
		taskQueuePush("setChannelFunded", { address : m.address });
	}
	
	else if(request == 'got_deposit_balance')					//// GOT ADDR. BAL. FOR CLOSING
	{
		/// INSTANT - EXTERNAL WORKER
		closeChannel(m.address, m.balance);	
	}
	
	else if(request == 'deposit_not_yet_sent')					//// WALLET TX NOT SENT
	{
		/// INSTANT
		console.log("Deposit has not yet been sent. Is pending: " + m.isPending);
		
		if(m.isPending == false)
		{
			// Request transaction
			var channel = getChannelObject(m.address);
		
			postMessage({	request: 'fund_deposit_address', 
							address: m.address,
							amount: channel.channelCollateral,
							provider: channel.provider
						});
		}
	}
}


 
////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////				INITIALIZE					////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////// 


restoreChannelQueue();
restoreActiveChannelList();
restoreClosedChannelList();
setTimeout(checkConfirmationStatus, 1000);

var intervalManageActiveChannels = setInterval(manageActiveChannels, 30000);




