/*
 * 	IOTA PAY - Payment client 
 * 
 * 
 * 	Wallet library for Client (and Server)
 * 
 *  with browserify --> rosi_wallet (rosi_wallet.browser.js) in plugin/background_worker
 * 
 * 	browserify wallet_main.js --standalone rosi_wallet -o plugin/background_worker/rosi_wallet.browser.js
 *
 * */

let wf = require('./wallet_functions.js');
let tf = require('./wallet_task.js');

let ws = {};			// Wallet settings, need to be set before using wallet software
let nodeListIndex = 0;	// Currently connected node, index in ws.nodelist

// Standard priorities for requests tasks
const STDPRIORITY = {
	REATTACHUPDATE: 5,
	ATTACHADDRTOTANGLE: 2,
	GETBUFFERADDR: 1,
	GETMONITOREDADDR: 10,
	SENDFUNDS: 8,
	SENDEXTBUNDLES: 7,
	GETADDRBAL: 9,
	GETBUNDLETXHASHES: 11,
	GETBUNDLESTATE: 11,
	GETADDRTAILHASH: 11,
	COMMONQUICKREQ: 100
};

// const TIMEOUT_TASK_MS = 180000;	// Amount of time after which task return cannot be expected
var currentTask = false;		// Currently executing task		{startTime:int, task:{}}
var failedTasks = [];			// Timed out tasks

// const TASK_SCHEDULER_RATE = 500;	// Interval in ms when task scheduler is called
var taskSchedulerInterval;		// timer object for task scheduler interval

// wallet object
var wallet;

// global vars
var last_update_t = 0;				// Time of last executed reattach & update
var last_add_bufferadd_t = 0;		// Time of last check for adding new buffered address

// callback for important tasks which don't have valid Promise (eg after browser restart)
// Set functions with setInvalidPromiseCallback(callback)
var invalidPromise = {
	tasknames: ['sendFunds'],		// only for these the function will be called
	callback: function(taskObj, params){ console.warn("No invalid promise callback function set!"); }
}

// ================ IMMEDIATE FUNCTIONS - NOT TASKBASED ================

// Get current interesting wallet stats to show to user
var getWalletStatus = function()
{
	return {
			balance: wallet.balance,
			pendingCnt: wallet.pending_bal.length,
			pendingBal: wallet.pending_infobal.reduce((a, c)=> a + c, 0)
		};
}

// Get stringified wallet to download as text file
var getWalletBackup = function()
{
	let strippedWallet = tf.makeTaskSerializeable(wallet);
	return JSON.stringify(strippedWallet);
}

// Update current settings and restart affected parts
var updateSettings = function(settings)
{
	ws = settings;
	wf.updateSettings(settings);
	
	wallet.iota_provider_inx = 0;
	nextNode((e)=>{ ; });
}

// Add external bundle to reattach/promote until confirmed
var addExternalWatchOutput = function(txHash)
{
	wf.addReattachWatchBundle(wallet, txHash);
}

// Set callback function to be called on important finished tasks if no valid Promise is available
// callback(task object, params object)
var setInvalidPromiseCallback = function(callback)
{
	if(typeof callback === 'function')
	{
		invalidPromise.callback = callback;
		return true;
	}
	else
	{
		console.warn("Invalid callback function provided!");
		return false;
	}
}

// Check if there is a pending transaction to specific address
var hasPendingTransaction = function(address)
{
	let tasks = tf.getTasksWithName(wallet, 'sendFunds');
	
	return tasks.filter(t => t.params.address === address).length > 0 || 
		(currentTask !== false && currentTask.task.taskname === 'sendFunds' 
		&& currentTask.task.params.address === address) ? true : false;
}

// Get unused Address, attach it to tangle and
// put it on monitor array for inputs
// can be called immediately, because normally an address is buffered
var getMonitoredAddress = function()
{
	return new Promise((resolve, reject) => {
		getMonitoredAddress_exec((s, e) => {
			if(e) 
			{
				reject(e);
				return;
			}
			addNewAddressToBuffer(ws.address_buffer_size);
			resolve(s);
		});
	});
}

var getMonitoredAddress_ec = 0;
var getMonitoredAddress_exec = function(callback)
{
	console.log("Creating new attached, monitored address...");
	if(getMonitoredAddress_ec > ws.ec_max)
	{
		console.log("FATAL: more than", ws.ec_max, "requests failed, aborting.");
		
		getMonitoredAddress_ec = 0;
		callback(false, 'MAX REQUESTS FAILED');
		return;
	}
	
	wf.getAddress(wallet, function(w, e, addr){
		if(e)
		{
			console.log("err:", e);
			getMonitoredAddress_ec ++;
			nextNode((e)=>{ getMonitoredAddress_exec(callback); });
			return;
		}
		
		wallet.monitor_add.push(addr.address);
		wallet.monitor_keyinx.push(addr.index);
		// safe wallet to disk
		wf.storeWalletToFile(wallet, function(e){
			if(e)
			{
				console.log("FATAL: Cannot write wallet to disk!", e);
				getMonitoredAddress_ec = 0;
				callback(false, 'FATAL SAVE ERROR');
				return;
			}
			
			// Add task to later attach address to tangle - no promise needed
			console.log("Pushing task to attach new monitored address to tangle.");
			tf.taskPush(wallet, 'attachAddressToTangle', {address: addr.address}, 
													STDPRIORITY.ATTACHADDRTOTANGLE);
			// all done
			getMonitoredAddress_ec = 0;
			callback(addr.address, false);
			return;
		});
	});
}

// Checks if sendFunds to specific address is currently queued and if, deletes task
// returns true if termination was successful, false if task was not found (was already executed
// or is currently executed)
// DO NOT call before wallet is initialized!
var abortQueuedSendFunds = function(address)
{
	try
	{
		let len_old = wallet.tasks.length;
		
		wallet.tasks = wallet.tasks.filter(t => 
						t.taskname !== 'sendFunds' || t.params.address !== address);
		
		return ((wallet.tasks - len_old) == 0) ? false : true;
	}catch(e){
		return false;
	}
}


// ================ TASK SCHEDULER ======================================

// has to be called with interval, to manage tasks
var taskScheduler = function()
{
	if(last_update_t < Date.now() - ws.cyclic_update_rate && 
									tf.hasTaskWithName(wallet, 'reattachUpdate') == 0)
	{
		// Add update & reattach task
		tf.taskPush(wallet, 'reattachUpdate', {}, STDPRIORITY.REATTACHUPDATE, false);
		console.log('Added update & reattach task.');
	}
	
	if(last_add_bufferadd_t < Date.now() - ws.cyclic_update_rate  &&  
								tf.hasTaskWithName(wallet, 'addNewAddressToBuffer') == 0)
	{
		// Add generate Address task
		addNewAddressToBuffer(ws.address_buffer_size);
		console.log('Added generate buffered address task.');
	}
	
	if(currentTask === false)
	{
		// Start next task
		let task = tf.taskPop(wallet);
		if(task === false)
		{
			return; 	// No task available
		}
		
		currentTask = { startTime: Date.now(), task: task };
		startTask(task);
		
	}else if(currentTask.startTime < Date.now() - ws.task_timeout_ms)
	{
		// Current Task timed Out
		console.warn('Task timed out.');
		failedTasks.push(currentTask.task);
		currentTask = false;
		taskScheduler();
	}
}

// Has to be called by task_execute function when completed
var taskFinished = function(task)
{
	if(currentTask !== false && task.timestamp == currentTask.task.timestamp)
	{
		console.log('Task finished: ' + task.taskname);
		currentTask = false;
	}
}

// Helper functions for optional promises and finishing task
var taskReject = function(task, param = false)
{
	if(typeof task.reject == 'function')
	{
		try
		{
			task.reject(param);
		}catch(e)
		{
			console.warn('Error when trying to reject promise of task:' + e);
		}
	}
	
	failedTasks.push(task);
	taskFinished(task);
}

var taskResolve = function(task, param = false)
{
	if(typeof task.resolve == 'function')
	{
		try
		{
			task.resolve(param);
		}catch(e)
		{
			console.warn('Error when trying to resolve promise of task:' + e);
			
			if(invalidPromise.tasknames.indexOf(task.taskname) > -1)
			{
				try
				{
					invalidPromise.callback(task, param);
				}catch(e) {
					console.warn('Error in invalid Promise callback function: ' + e);
				}
			}
		}
	}
	
	taskFinished(task);
}

// Executing matching task function
var startTask = function(task)
{
	console.log('Starting Task: ' + task.taskname);
	switch(task.taskname)
	{
		case 'attachAddressToTangle':
			attachAddressToTangle_exec(task);
			break;
			
		case 'addNewAddressToBuffer':
			last_add_bufferadd_t = Date.now() + 300000;		// Is set to real value when task finished
			addNewAddressToBuffer_exec(task);
			break;
				
		case 'sendFunds':
			sendFunds_exec(task);
			break;
			
		case 'reattachUpdate':
			last_update_t = Date.now() + 300000;	// Is set to real value when task finished
			cyclic_update_exec(task);
			break;
			
		case 'isPendingOutput':
			isPendingOutput_exec(task);
			break;
			
		case 'waitForConfirmation':
			waitForConfirmation_exec(task);
			break;
			
		case 'checkAddressBalance':
			checkAddressBalance_exec(task);
			break;
			
		case 'checkAddressBalanceUnconfirmed':
			checkAddressBalanceUnconfirmed_exec(task);
			break;
			
		case 'getBundleTailHashes':
			getBundleTailHashes_exec(task);
			break;
			
		case 'getAddressTailHashes':
			getAddressTailHashes_exec(task);
			break;
			
		case 'isBundleConfirmed':
			isBundleConfirmed_exec(task);
			break;
			
		case 'sendBundles':
			sendBundles_exec(task);
			break;
			
		default:
			console.log('Cannot execute unknown task ' + task.taskname);
			taskFinished(task);
			break;
	}
}

// ================ TASK SCHEDULED FUNCTIONS ============================

// FOR ALL FUNCTIONS:
//	 -> priorityOffset: optional parameter: int, is added to standard priority of task; 
//			positive value increases priority, negative decreases priority, default: 0


// Add new address to buffer if nothing else is to do.
var addNewAddressToBuffer = function(bufferMax, priorityOffset = 0)
{
	return new Promise((resolve, reject) => {
		tf.taskPush(wallet, 'addNewAddressToBuffer', {bufferMax: bufferMax}, 
			STDPRIORITY.GETBUFFERADDR + priorityOffset, false, resolve, reject);
	});	
}

var addNewAddressToBuffer_ec = 0;
var addNewAddressToBuffer_exec = function(task)
{
	console.log("Creating new address to buffer for later use...");
	if(addNewAddressToBuffer_ec > ws.ec_max)
	{
		console.error("ERROR: more than", ws.ec_max, "requests failed, aborting.");
		
		addNewAddressToBuffer_ec = 0;
		taskReject(task, 'MAX REQUESTS FAILED');
		return;
	}
	
	if(wallet.addresses.length >= task.params.bufferMax)
	{
		// nothing to do, quit
		console.log("Do not need new address, buffer is of length", wallet.addresses.length);
		addNewAddressToBuffer_ec = 0;
		last_add_bufferadd_t = Date.now();
		taskResolve(task);
		return;
	}
	
	console.log("Generating new address, buffer is of length", wallet.addresses.length);
	
	wf.generateAddress(wallet, function(e){
		if(e)
		{
			addNewAddressToBuffer_ec++;
			nextNode((e)=>{ addNewAddressToBuffer_exec(task); });
			return;
		}
		
		// safe wallet to disk
		wf.storeWalletToFile(wallet, function(e){
			if(e)
			{
				console.error("FATAL: Cannot write wallet to disk!", e);
				addNewAddressToBuffer_ec = 0;
				taskReject(task, e);
				return;
			}
			
			// all done
			addNewAddressToBuffer_ec = 0;
			last_add_bufferadd_t = Date.now();
			taskResolve(task);
			return;
		});
	});
}


// Attach given address to tangle (with 0 val tx)
var attachAddressToTangle = function(address, priorityOffset = 0)
{
	return new Promise((resolve, reject) => {
		tf.taskPush(wallet, 'attachAddressToTangle', {address: address}, 
				STDPRIORITY.ATTACHADDRTOTANGLE + priorityOffset, true, resolve, reject);
	});
}

var attachAddressToTangle_ec = 0;
var attachAddressToTangle_exec = function(task)
{
	if(attachAddressToTangle_ec > ws.ec_max)
	{
		console.error("FATAL: more than", ws.ec_max, "requests failed, aborting.");
		attachAddressToTangle_ec = 0;
		taskReject(task, 'MAX REQUESTS FAILED');
		return;
	}
	
	wf.attachAddressToTangle(wallet, task.params.address, function(e, w)
	{
		if(e)
		{
			// try again
			attachAddressToTangle_ec++;
			nextNode((e)=>{ attachAddressToTangle_exec(task); });
			return;
		}
		
		taskResolve(task, task.params.address);
	});
}


// send funds to address provided
// tx is attached to pending array -> call reattach cyclic
// param: waitForFunds: if set to true, task is added, regardless of sufficient funds.
// -> task waits until funds are added to wallet and is then executed, if set to false and 
// -> wallet has insufficient funds, Promise is rejected immediately with error 'INSUFFICIENT_FUNDS'
// resolve(txHash)
var sendFunds = function(address, amount, priorityOffset = 0, waitForFunds = false)
{
	return new Promise((resolve, reject) => {
		// Always add request if wallet is not ready yet
		if(typeof wallet == 'object' && !waitForFunds && 
			(wallet.balance - wallet.pending_infobal.reduce((acc, val) => acc + val, 0) - 
			tf.getTasksWithName(wallet, 'sendFunds').reduce((acc, t) => acc + t.params.amount, 0)) 
			< amount)
		{
			console.error("Insufficient funds detected when looking on inputs array.");
			reject('INSUFFICIENT_FUNDS');
		}
		else
		{
			tf.taskPush(wallet, 'sendFunds', {address: address, amount: amount}, 
				STDPRIORITY.SENDFUNDS + priorityOffset, true, resolve, reject);
		}
	});
}

var sendFunds_ec = 0;
var sendFunds_exec = function(task)
{
	if(sendFunds_ec > ws.ec_max)
	{
		console.error("FATAL: more than", ws.ec_max, "requests failed, aborting.");
		sendFunds_ec = 0;
		taskReject(task, 'ERR_MAX_FAILED');
		return;
	}
	
	if(typeof callbackConfirmed != 'function')
	{
		callbackConfirmed = function(){};
	}
	
	wf.sendTransfer(wallet, task.params.address, task.params.amount, function(e, txHash){
		
		if(e && e == 'INSUFFICIENT_FUNDS')
		{
			console.error("Insufficient funds detected when already trying to send.");
			sendFunds_ec = 0;
			// insufficient balance available, check if balance will be available when
			// current transactions are confirmed
			if(wallet.balance - wallet.pending_infobal.reduce((acc, val) => acc + val, 0) 
				>= task.params.amount)
			{
				// retry when pending outputs confirm
				// => readd job
				tf.taskPush(wallet, 'sendFunds', 
					{address: task.params.address, amount: task.params.amount}, 
					task.priority, true, task.resolve, task.reject);
				taskFinished(task);
				return;
			}
						
			taskReject(task, 'INSUFFICIENT_FUNDS');
			return;
		}else if(e){
			// probably network error -> try again with new node
			sendFunds_ec++;
			nextNode((e)=>{ sendFunds_exec(task); });
			return;
		}
		// Successfully sent transfer
		wf.storeWalletToFile(wallet, function(e){
			if(e)
			{
				console.error("FATAL: Cannot write wallet to disk!", e);
				sendFunds_ec = 0;
				taskReject(task, 'UNABLE_TO_WRITE_WALLET_FILE');
				return;
			}
			// all done
			sendFunds_ec = 0;
			taskResolve(task, txHash);
			return;
		});
	});
}


// Checks if txHash corresponds with pending wallet output
// promise resolves with values true/false, no reject
var isPendingOutput = function(txHash, priorityOffset = 0)
{
	return new Promise((resolve, reject) => {
		tf.taskPush(wallet, 'isPendingOutput', {txHash: txHash}, 
			STDPRIORITY.COMMONQUICKREQ + priorityOffset, false, resolve, reject);
	});
}

// Cannot be called while reattaching, etc; (when functions tampering with pending array)
var isPendingOutput_sync = function(txHash)
{
	for(let i = 0; i < wallet.pending_out.length; i++)
	{
		let tx = wallet.pending_out[i];
		if(tx == txHash)
		{
			return true;
		}
		
		if(typeof wallet.pending_reattached[tx] != 'undefined' && 
			wallet.pending_reattached[tx].indexOf(txHash) >= 0)
		{
			return true;
		}
	}
	
	return false;
}

var isPendingOutput_exec = function(task)
{
	taskResolve(task, isPendingOutput_sync(task.params.txHash));
}


// Wait for confirmation of transaction
// Polls isPendingOutput, resolves when tx is confirmed/not existant in pending array
var waitForConfirmation = function(txHash, pollInterval = 5000, priorityOffset = 0)
{
	return new Promise((resolve, reject) => {
		tf.taskPush(wallet, 'waitForConfirmation', {txHash: txHash, pollInterval: pollInterval}, 
			STDPRIORITY.COMMONQUICKREQ + priorityOffset, false, resolve, reject);
	});
}

var waitForConfirmation_exec = function(task)
{
	isPendingOutput(task.params.txHash).then((isPending) => {
		if(isPending)
		{
			// Re-add task after timeout
			setTimeout(()=>{
				tf.taskPush(wallet, 'waitForConfirmation', 
					{txHash: task.params.txHash, pollInterval: task.params.pollInterval}, 
					task.priority, false, task.resolve, task.reject);
			}, task.params.pollInterval);
		}
		else
		{
			taskResolve(task);
		}
	});
	
	taskFinished(task);
}


// Gets balance of single Address
// Wrapper for getBalanceOfAddress to retry when error
// resolve(balance)
var checkAddressBalance = function(address, priorityOffset = 0)
{
	return new Promise((resolve, reject) => {
		tf.taskPush(wallet, 'checkAddressBalance', {address: address}, 
			STDPRIORITY.GETADDRBAL + priorityOffset, false, resolve, reject);
	});
}

var checkAddressBalance_ec = 0;
var checkAddressBalance_exec = function(task)
{
	if(checkAddressBalance_ec > ws.ec_max)
	{
		console.error("FATAL: more than", ws.ec_max, "requests failed, aborting.");
		checkAddressBalance_ec = 0;
		taskReject(task, 'ERR_MAX_FAILED');
		return;
	}
	
	wf.getBalanceOfAddress(task.params.address, function(balance){
		if(balance === false)	// error
		{
			checkAddressBalance_ec++;
			checkAddressBalance_exec(task);
		}else{
			taskResolve(task, balance);
		}
	});
}



// Returns complete balance of address, as if all pending transactions 
// are confirmed. (checks for reattaches)
// Returns 0 if there are some confirmed and some unconfirmed inputs 
// returns 0 if there are no inputs / there is no valid unconfirmed input
// returns confirmed balance if every input is confirmed
var checkAddressBalanceUnconfirmed = function(address, priorityOffset = 0)
{
	return new Promise((resolve, reject) => {
		tf.taskPush(wallet, 'checkAddressBalanceUnconfirmed', {address: address}, 
			STDPRIORITY.GETADDRBAL + priorityOffset, false, resolve, reject);
	});
}

var checkAddressBalanceUnconfirmed_ec = 0;
var checkAddressBalanceUnconfirmed_exec = function(task)
{
	if(checkAddressBalanceUnconfirmed_ec > ws.ec_max)
	{
		console.error("FATAL: more than", ws.ec_max, "requests failed, aborting.");
		checkAddressBalanceUnconfirmed_ec = 0;
		taskReject(task);
		return;
	}
	
	wf.getUnconfirmedBalance(task.params.address, function(balance){
		if(balance === false)
		{
			console.error("Error occurred getting unconfirmed balance, retrying...");
			checkAddressBalanceUnconfirmed_ec++;
			checkAddressBalanceUnconfirmed_exec(task);
			return;
		}
		checkAddressBalanceUnconfirmed_ec = 0;
		taskResolve(task, balance);
		return;
	});
}


// takes finished and signed bundles and attaches them tangle
// reattach: bool, true to add bundle to be reattached until confirmed
// resolve(tx tail hashes)
var sendBundles = function(bundles, reattach, priorityOffset = 0)
{
	return new Promise((resolve, reject) => {
		tf.taskPush(wallet, 'sendBundles', {bundles: bundles, reattach: reattach}, 
			STDPRIORITY.SENDEXTBUNDLES + priorityOffset, true, resolve, reject);
	});
}

var sendBundles_ec = 0;
var sendBundles_exec = function(task)
{
	if(sendBundles_ec > ws.ec_max)
	{
		console.error("FATAL: more than", ws.ec_max, "requests failed, aborting.");
		sendBundles_ec = 0;
		taskReject(task);
		return;
	}	
	
	wf.sendBundles(task.params.bundles, (err, suc)=>{
		if(err)
		{
			console.error('Error sending bundles, trying again:', err);
			sendBundles_ec++;
			sendBundles_exec(task);
			return;
		}else{
			sendBundles_ec = 0;
			let txHashes = [];
			suc.forEach(function(bundle) {
				if(task.params.reattach == true)
				{
					addExternalWatchOutput(bundle[0].hash);
				}
				txHashes.push(bundle[0].hash);
			});
			
			// All done.
			taskResolve(task, txHashes);
			return;
		}
	});
}


// Takes Bundle hash and gets the tail transaction hashes for each reattachment
var getBundleTailHashes = function(bundleHash, priorityOffset = 0)
{
	return new Promise((resolve, reject) => {
		tf.taskPush(wallet, 'getBundleTailHashes', {bundleHash: bundleHash}, 
			STDPRIORITY.GETBUNDLETXHASHES + priorityOffset, false, resolve, reject);
	});
}

var getBundleTailHashes_ec = 0;
var getBundleTailHashes_exec = function(task)
{
	if(getBundleTailHashes_ec > ws.ec_max)
	{
		console.log("FATAL: more than", ws.ec_max, "requests failed, aborting.");
		getBundleTailHashes_ec = 0;
		taskReject(task);
		return;
	}
	
	wf.getBundleTailHashes(wallet, task.params.bundleHash, (e, txHashes)=>{
		if(e)
		{
			console.error('Error getting bundle transactions, trying again:', e);
			getBundleTailHashes_ec++;
			getBundleTailHashes_exec(task);
			return;
		}else{
			// All done.
			taskResolve(task, txHashes);
			return;
		}
	});
}


// Takes iota address and returns tail transaction hashes of (non-zero) bundles
// -> resolve([{txHash, value}, ...]);
var getAddressTailHashes = function(address, priorityOffset = 0)
{
	return new Promise((resolve, reject) => {
		tf.taskPush(wallet, 'getAddressTailHashes', {address: address}, 
			STDPRIORITY.GETADDRTAILHASH + priorityOffset, false, resolve, reject);
	});
}

var getAddressTailHashes_ec = 0;
var getAddressTailHashes_exec = function(task)
{
	if(getAddressTailHashes_ec > ws.ec_max)
	{
		console.error("FATAL: more than", ws.ec_max, "requests failed, aborting.");
		getAddressTailHashes_ec = 0;
		taskReject(task);
		return;
	}
	
	wf.getAddressTailHashes(wallet, task.params.address, (e, txArray)=>{
		if(e)
		{
			console.error('Error getting address transactions, trying again:', e);
			getAddressTailHashes_ec++;
			getAddressTailHashes_exec(task);
			return;	
		}
		
		// All done.
		taskResolve(task, txArray);
		return;
	});
}


// Takes Bundle hash and returns if it has been confirmed
// RETURNS ONLY TRUE IF NODE HAS NOT CLEARED IT'S DB (Snapshot!)
var isBundleConfirmed = function(bundleHash, priorityOffset = 0)
{
	return new Promise((resolve, reject) => {
		tf.taskPush(wallet, 'isBundleConfirmed', {bundleHash: bundleHash}, 
			STDPRIORITY.GETBUNDLESTATE + priorityOffset, false, resolve, reject);
	});
}

var isBundleConfirmed_ec = 0;
var isBundleConfirmed_exec = function(task)
{
	if(isBundleConfirmed_ec > ws.ec_max)
	{
		console.error("FATAL: more than", ws.ec_max, "requests failed, aborting.");
		isBundleConfirmed_ec = 0;
		taskReject(task);
		return;
	}
	
	wf.isBundleConfirmed(wallet, task.params.bundleHash, (e, state)=>{
		if(e)
		{
			console.error('Error getting bundle inclusion state, trying again:', e);
			isBundleConfirmed_ec++;
			isBundleConfirmed_exec(task);
			return;
		}else{
			// All done.
			taskResolve(task, state);
			return;
		}
	});
}

// ----- INTERNAL WALLET MANAGEMENT -- TASK BASED ----------

// promote/reattach pending transaction
// [ if everything is confirmed, call callback_txConfirmed  ]
// callback(error) optional, is called without parameters when finished.
var reattachPending_ec = 0;
var reattachPending_exec = function(callback)
{
	if(typeof callback != 'function'){
		callback = (error)=>{};
	}
	
	if(reattachPending_ec > ws.ec_max)
	{
		console.error("FATAL: more than", ws.ec_max, "requests failed, aborting.");
		reattachPending_ec = 0;
		callback(true);
		return;
	}
	
	wf.reattachPending(wallet, function(e, w){
		if(e)
		{
			// try again
			console.error('An error occurred reattaching:', e);
			reattachPending_ec++;
			nextNode((e)=>{ reattachPending_exec(callback); });
			return;
		}

		// save wallet to file
		wf.storeWalletToFile(wallet, function(e){
			// Ignore possible error, the probability is very low and when updateSaveWallet() 
			// is called the next cycle it is saved anyway
			reattachPending_ec = 0;
			callback(false);
		});
	});
}


// check for inputs
// save to file
// callback (error)
var updateSaveWallet_ec = 0;
var updateSaveWallet_exec = function(callback)
{
	if(updateSaveWallet_ec > ws.ec_max)
	{
		console.error("FATAL: more than", ws.ec_max, "requests failed, aborting.");
		// Callback
		updateSaveWallet_ec = 0;
		callback('Max error counter value reached!');
		return;
	}
	
	if(typeof callback != 'function')
	{
		callback = function(e){  
			if(e){
				console.error('Update Wallet error:',e);
			}else{
				console.log('Update SUCCESSFUL.');
			} 
		};
	}
	
	// wallet = w;
	wf.checkMonitorList(wallet, function(e, removedAddrs){
		if(e){
			console.error("Error updating, checkMonitorList:", e);
			updateSaveWallet_ec++;
			nextNode((e)=>{ updateSaveWallet_exec(callback); });
			return;
		}
		// Add inputs to wallet balance
		let newInputs = removedAddrs.reduce((acc, val) => { return acc + Number(val.balance); }, 0);
		if(newInputs > 0){
			console.log("New confirmed inputs, added", newInputs + "i to wallet balance.");
			// Update balance
			wallet.balance += Number(newInputs);
			// Update input addresses
			removedAddrs.forEach((item) => {
				wallet.inputs.push({ 	address: item.address, 
										balance: Number(item.balance),
										security: Number(item.security),
										keyIndex: Number(item.keyIndex) 
									});
			});
		}
		
		// save wallet to file
		wf.storeWalletToFile(wallet, function(e){
			if(e)
			{
				console.error("FATAL: Cannot write wallet to disk!", e);
				// Callback
				updateSaveWallet_ec = 0;
				callback('Cannot write to disk!');
				return;
			}else{
				// all done
				updateSaveWallet_ec = 0;
				callback(false);
				return;
			}
		});
	});
}

// check for already used addresses
// callback (error)
var checkBufferedAddresses_ec = 0;
var checkBufferedAddresses_exec = function(callback)
{
	if(checkBufferedAddresses_ec > ws.ec_max)
	{
		console.error("FATAL: more than", ws.ec_max, "requests failed, aborting.");
		// Callback
		checkBufferedAddresses_ec = 0;
		callback('Max error counter value reached!');
		return;
	}
	
	wf.checkBufferedAddresses(wallet, (e) => {
		if(e){
			checkBufferedAddresses_ec++;
			checkBufferedAddresses_exec(callback);
			return;
		}
		checkBufferedAddresses_ec = 0;
		callback(false);
	});
}


// Function that is called every TIMEOUT_UPDATE ms
var cyclic_update_exec = function(task)
{
	console.log("\nReattaching pending transactions and updating node");
	reattachPending_exec((err)=>{
		console.log("--> Reattaching finished.");	
		updateSaveWallet_exec((e)=>{
			if(e){
				console.error('--> Update Wallet error:', e);
			}else{
				console.log('--> Update successful. monit.:', wallet.monitor_add.length, 
				'pend.:', wallet.pending_out.length,
				 '(' + wallet.pending_infobal.reduce((acc, val)=>acc+val, 0) + 'i)',
				 'bal.:', wallet.balance + 'i');
				 
				 last_update_t = Date.now();
				 taskResolve(task);
			}
		});
	});
}


// ================= INIT FUNCTIONS - NO TASK =================


// Increase iota provider index
// init node
// Tries nodes until it finds a healthy one
// if no healthy node is found, it selects old index +1 node
// callback(error) (error == 0 -> healthy)
var nextNode_cnt = 0;
var nextNodelastError = 0;
var nextNode = function(callback)
{
	console.log('Searching for new healthy node ...');
	if(typeof ws.nodelist == 'undefined' || ws.nodelist.length == 0)
	{
		console.warn('wallet has no providers set, cannot continue.');
		callback('NO_NODES_SET');
		return;
	}
	
	if(nextNode_cnt >= ws.nodelist.length)
	{
		nextNode_cnt = 0;
		callback(nextNodelastError);
		return;
	}
	
	nodeListIndex ++;
	if(nodeListIndex >= ws.nodelist.length){
		nodeListIndex = 0;
	}
	
	wf.setupCheckNode(ws.nodelist[nodeListIndex], function(e){
		if(!e){
			console.log(ws.nodelist[nodeListIndex], 'looks healthy.');
			nextNode_cnt = 0;
			callback(0);
			return;
		}else{
			nextNodelastError = e;
			nextNode_cnt++;
			nextNode(callback);
			return;
		}
	});
}

// restores wallet from stringified JSON object
var restoreWalletBackup = function(walletString)
{
	try{
		clearInterval(taskSchedulerInterval);
	}catch(e) {};
	
	wallet = JSON.parse(walletString);
	wf.storeWalletToFile(wallet, (err)=>{
		if(err){
			console.error('ERROR occurred storing wallet to file.');
		}else{
			console.log('Successfully restored wallet and stored in file.');
		}
		
		nextNode( function(e){
		
			if(e)
			{
				console.error("Error occurred when checking node.");
			}

			wallet_initialized();
		});
	});
}

// reads wallet inputs from tangle...
var reInitWalletInputs = function(manres = false, manrej = false)
{
	return new Promise((resolve, reject) => {
		try{
			clearInterval(taskSchedulerInterval);
		}catch(e) {};
		
		if(manres !== false && manrej !== false)
		{
			resolve("USING MANRESOLVE");
			resolve = manres;
			reject = manrej;
		}
		
		if(currentTask !== false)
		{
			// Wait for last task to finish ...
			console.log("Waiting for current Task to finish ... ");
			setTimeout(() => {  reInitBalance(resolve, reject);  }, 1000);
			return;
		}
		
		let options = {
			start : 0,
			end : wallet.index + 10,
			security : wallet.security,
			threshold : 0
		};
		
		console.log("Stopped Scheduler, Reinitializing Inputs with parameters:", options);
		wf.searchReInitializeInputs(wallet, options, (e) => {
			
			if(e)
			{
				console.error("Error occurred when trying to reinitializing inputs: " + e);
				console.log("Restarting Scheduler...");
				taskSchedulerInterval = setInterval(taskScheduler, ws.task_scheduler_rate);
				reject(e);
				return;
			}
			
			console.log("Successfully finished Reinit. Restarting Scheduler ... ");
			taskSchedulerInterval = setInterval(taskScheduler, ws.task_scheduler_rate);
			resolve(wallet);
			return;
		}); 
	});
}

// reads wallet inputs from tangle...
var reInitBalance = function(manres = false, manrej = false)
{
	return new Promise((resolve, reject) => {
		try{
			clearInterval(taskSchedulerInterval);
		}catch(e) {};
		
		if(manres !== false && manrej !== false)
		{
			resolve("USING MANRESOLVE");
			resolve = manres;
			reject = manrej;
		}
				
		if(currentTask !== false)
		{
			// Wait for last task to finish ...
			console.log("Waiting for current Task to finish ... ");
			setTimeout(() => {  reInitBalance();  }, 1000);
			return;
		}
		
		console.log("Stopped Scheduler, Reinitializing Balance...");
		wf.reInitializeBalance(wallet, (e) => {
			
			if(e)
			{
				console.error("Error occurred when trying to reinitializing balance: " + e);
				console.log("Restarting Scheduler...");
				taskSchedulerInterval = setInterval(taskScheduler, ws.task_scheduler_rate);
				reject(e);
				return;
			}
			
			console.log("Successfully finished reinit balance. Restarting Scheduler ... ");
			taskSchedulerInterval = setInterval(taskScheduler, ws.task_scheduler_rate);
			resolve(wallet);
			return;
		}); 
	});
}

// Init done
var wallet_initialized = function()
{
	console.log('Checking buffered addresses ...');
	checkBufferedAddresses_exec((e) => {
		if(e){
			console.error("Failed to initalize wallet (checkBufferedAddresses). Aborting.");
			return;
		}
		
		console.log('Updating wallet data...');
		updateSaveWallet_exec(function(e){
			if(e){
				console.error("Failed to initalize wallet (updateSaveWallet). Aborting.");
				return;
			}
			console.log("--> Wallet updated and stored on disk.");
			
			// Start task scheduler interval
			taskSchedulerInterval = setInterval(taskScheduler, ws.task_scheduler_rate);
			
			// Make tasks, which were received until now, executeable
			tf.pushBufferedTasks(wallet);
		});
	});
}

// ======== START INITIALIZING ===============
// Start with initializing the wallet object
var init_wallet_ec = 0;
function init_wallet(settings)
{
	
	console.log("Setting up client wallet...");
	
	ws = settings;
	wf.updateSettings(ws);
	
	
	try{
		clearInterval(taskSchedulerInterval);
	}catch(e) {};
	
	if(init_wallet_ec > ws.ec_max)
	{
		console.error("FATAL: more than", ws.ec_max, "requests failed, aborting.");
		init_wallet_ec = 0;
		return;
	}
	
	wf.getWalletFromFile(function(oldwallet, err)
	{
		if(!err)
		{	
			wallet = oldwallet;
		}else if(err == 'ENOENT')	// OK, no wallet created yet
		{
			wallet = wf.createWallet(false);
		}else
		{
			console.error("FATAL: unexpected error when initializing wallet. Aborting.");
			init_wallet_ec = 0;
			return;
		}
		
			// Next node initializes node with provider and gets iota object
		nextNode( function(e){
			
			if(e)
			{
				console.error("Error occurred when checking node. Trying again in 2 sec.");
				setTimeout(()=>{ init_wallet(settings); }, 2000);
				init_wallet_ec++;
				return;
			}
			
			// continue
			init_wallet_ec = 0;		// reset error counter as request successful
			wallet_initialized();
			
		});
	});
};


// =================  NODE MODULE  ==============

module.exports = {
	'init_wallet': init_wallet,
	'getMonitoredAddress': getMonitoredAddress,
	'sendFunds': sendFunds,
	'checkAddressBalance': checkAddressBalance,
	'sendBundles': sendBundles,
	'checkAddressBalanceUnconfirmed': checkAddressBalanceUnconfirmed,
	'addExternalWatchOutput': addExternalWatchOutput,
	'getWalletStatus': getWalletStatus,
	'getWalletBackup': getWalletBackup,
	'restoreWalletBackup': restoreWalletBackup,
	'isPendingOutput' : isPendingOutput,
	'waitForConfirmation' : waitForConfirmation,
	'getBundleTailHashes' : getBundleTailHashes,
	'isBundleConfirmed' : isBundleConfirmed,
	'getAddressTailHashes' : getAddressTailHashes,
	'setInvalidPromiseCallback' : setInvalidPromiseCallback,
	'hasPendingTransaction' : hasPendingTransaction,
	'updateSettings' : updateSettings,
	'abortQueuedSendFunds' : abortQueuedSendFunds,
	'reInitWalletInputs' : reInitWalletInputs,
	'reInitBalance' : reInitBalance
}


////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////				TESTS - EXAMPLES			////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////


/*
// tests
init_wallet();

*/

/*
getMonitoredAddress().then((addr)=>{
	console.log('gotAddr 1:', addr); 
}).catch((e)=>{ console.log('Error getting monitored Address:' + e); });
*/

/*
console.log('Requesting task 1...'); 
getMonitoredAddress().then((addr)=>{ 
	console.log('gotAddr 1:', addr); 
	sendFunds(addr, 2).then((txHash) => {
			console.log(' --> Transaction 1 sent. Hash:' + txHash);
			waitForConfirmation(txHash).then(isPending => {
				if(!isPending){
					console.log('===========================================');
					console.log('  -> Transaction 1 has confirmed!');
					console.log('===========================================');
				}
			});
	}).catch((e)=>{ console.log('======> Error sending Funds 1:' + e); });
}).catch((e)=>{ console.log('Error getting monitored Address 1:' + e); });



console.log('Requesting task 2...'); 
getMonitoredAddress().then((addr)=>{ 
	console.log('gotAddr 2:', addr); 
	sendFunds(addr, 2).then((txHash) => {
			console.log(' --> Transaction 2 sent. Hash:' + txHash);
			waitForConfirmation(txHash).then(isPending => {
				if(!isPending){
					console.log('===========================================');
					console.log('  -> Transaction 2 has confirmed!');
					console.log('===========================================');
				}
			});
	}).catch((e)=>{ console.log('======> Error sending Funds 2:' + e); });
}).catch((e)=>{ console.log('Error getting monitored Address 2:' + e); });

console.log('Requesting task 3...'); 
getMonitoredAddress().then((addr)=>{ 
	console.log('gotAddr 3:', addr); 
	sendFunds(addr, 1).then((txHash) => {
			console.log(' --> Transaction 3 sent. Hash:' + txHash);
			waitForConfirmation(txHash).then(isPending => {
				if(!isPending){
					console.log('===========================================');
					console.log('  -> Transaction 3 has confirmed!');
					console.log('===========================================');
				}
			});
	}).catch((e)=>{ console.log('======> Error sending Funds 3:' + e); });
}).catch((e)=>{ console.log('Error getting monitored Address 3:' + e); });

*/




