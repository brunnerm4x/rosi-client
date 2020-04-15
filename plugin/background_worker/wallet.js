/*
 * 		rosi client plugin - background worker
 * 
 * 		iota wallet management
 * 
 * */
 
 
// import rosi main library
importScripts('./rosi_wallet.browser.js');

// initialize wallet --	make sure to wait a bit before requesting anything
// rosi_wallet.init_wallet();

rosi_wallet.setInvalidPromiseCallback((task, param) => {
	if(task.taskname === 'sendFunds')
	{
		postMessage({request: 'funds_sent_saved_task', address: task.params.address, amount: task.params.amount, txHash: param });
	}
});

// Message from background_main script
onmessage = function(e) 
{
	var m = e.data;
	var request = m.request;
	
//	console.log("message received:", m);
	
	if(request == 'init_wallet')
	{
		rosi_wallet.init_wallet(m.settings);
	}
	else if(request == 'get_settlement_address')			// Get new monitored Address and send back
	{
		rosi_wallet.getMonitoredAddress().then(address => {
			postMessage({request: 'new_settlement_address', address: address});
		}).catch(error => {
			console.error('Cannot get settlement Address! Error:' + error);
			postMessage({request: 'unhandled_error', code: 'CANNOT_GET_ADDRESS', text: 'Cannot get new monitored Address! ' + error});
		});
	}
	else if(request == 'get_input_address')			// like get_settlement_address, but is 
													// not automatically forwarded to main worker.
	{
		rosi_wallet.getMonitoredAddress().then(address => {
			postMessage({request: 'new_input_address', address: address});
		}).catch(error => {
			console.error('Cannot get input Address! Error:' + error);
			postMessage({request: 'unhandled_error', code: 'CANNOT_GET_ADDRESS', text: 'Cannot get new monitored Address! ' + error});
		});
	}
	else if(request == 'fund_deposit_address')		// m.address, m.amount!
	{
		console.log("Got request to fund deposit address " + m.address);
		
		rosi_wallet.sendFunds(m.address, m.amount, 1, true).then(txHash => {
			postMessage({request: 'deposit_funds_sent', success: true, address: m.address, provider: m.provider, txHash: txHash });
			
			rosi_wallet.waitForConfirmation(txHash).then(()=>{
				postMessage({request: 'deposit_funds_sent_confirmed', address: m.address, provider: m.provider, txHash: txHash });				
			}).catch(e => {
				postMessage({request: 'unhandled_error', code: 'ERROR_CONFIRMING_FUNDS', text: 'Error confirming transaction: ' + e });
			});
		}).catch(e => {
			postMessage({request: 'deposit_funds_sent', success: false, address:  m.address, provider: m.provider, error: e });
			console.error('Error sending funds:', e);
		});
	}
	else if(request == 'watch_deposit')			// m.address, m.provider, m.amount
	{
		console.log("Got request to watch deposit ...");
		rosi_wallet.checkAddressBalance(m.address).then((balance) => {
			console.log("Balance of address: " + balance);
			if(balance >= m.amount)
			{
				postMessage({request: 'deposit_funds_sent_confirmed', address: m.address, provider: m.provider, info: 'Found matching balance.' });	
				return;
			}
			console.log("Getting tail hashes ...");
			rosi_wallet.getAddressTailHashes(m.address).then((txArray) => {
				// Only interested in inputs with right value
				txArray = txArray.filter(tx => tx.value == m.amount);
				console.log("Got transactions. Length:" + txArray.length);
				if(txArray.length == 0)
				{
					// No transaction found -> not yet sent
					console.log("Informing main thread that no transaction is sent yet.");
					postMessage({ request: 'deposit_not_yet_sent', address: m.address, isPending: rosi_wallet.hasPendingTransaction(m.address) });
					return;
				}else if(txArray.length > 1)
				{
					// More than 1 transaction to address ...
					postMessage({request: 'unhandled_error', code: 'ERROR_CONFIRMING_FUNDS', text: 'Watch request: Address does have more than 1 input!'});
					return;
				}
				
				rosi_wallet.waitForConfirmation(txArray.txHash).then(()=>{
					postMessage({request: 'deposit_funds_sent_confirmed', address: m.address, provider: m.provider });				
				}).catch(e => {
					postMessage({request: 'unhandled_error', code: 'ERROR_CONFIRMING_FUNDS', text: 'Error confirming transaction: ' + e });
				});
				
			}).catch(e => {
				postMessage({request: 'unhandled_error', code: 'ERROR_CONFIRMING_FUNDS', text: 'Error watching transaction: ' + e });
			});
		}).catch(e => {
			postMessage({request: 'unhandled_error', code: 'ERROR_CONFIRMING_FUNDS', text: 'Error watching transaction, getting address balance failed: ' + e });
		});
	}
	else if(request == 'fund_withdraw')			// m.address, m.amount!
	{
		rosi_wallet.sendFunds(m.address, m.amount).then(txHash => {
			postMessage({request: 'fund_withdraw_sent', reqId: m.reqId, address: m.address, txHash: txHash });
			
			rosi_wallet.waitForConfirmation(txHash).then(()=>{
				postMessage({request: 'fund_withdraw_confirmed', address: m.address , txHash: txHash, reqId: m.reqId });				
			}).catch(e => {
				postMessage({request: 'unhandled_error', reqId: m.reqId, code: 'ERROR_CONFIRMING_FUNDS', text: 'Error confirming transaction: ' + e });
			});
		}).catch(e => {
			postMessage({request: 'unhandled_error', reqId: m.reqId, code: 'ERROR_SENDING_FUNDS', text: 'Error sending funds: ' + e });
		});
	}
	else if(request == 'get_unconfirmed_balance')		// m.address
	{		// returns 0 if multiple inputs and some of them are confirmed and some unconfirmed!
		rosi_wallet.checkAddressBalanceUnconfirmed(m.address).then((balance)=>{
			postMessage({request: 'address_unconfirmed_balance', address: m.address, balance: balance});
		}).catch(e => {
			postMessage({request: 'unhandled_error', code: 'ERROR_CHECKUNCONFBAL', text: 'Error getting unconfirmed wallet balance: ' + e });
		});
	}
	else if(request == 'get_deposit_balance')			// m.address
	{
		rosi_wallet.checkAddressBalance(m.address).then((balanceConf)=>{
			// Also get unconfirmed balance
			rosi_wallet.checkAddressBalanceUnconfirmed(m.address).then((balanceUnconf)=>
			{
				if(balanceConf == balanceUnconf)
					postMessage({request: 'got_deposit_balance', address: m.address, balance: balanceConf});
				else
					postMessage({request: 'unhandled_error', code: 'ERROR_GETDEPOSITBAL', 
						text: 'There is unconfirmed balance on the deposit address! Please wait ' +
						'until everything confirms until closing bundle! Confirmed balance: ' + balanceConf + 
						', unconfirmed balance: ' + balanceUnconf });
			}).catch(e => {
				postMessage({request: 'unhandled_error', code: 'ERROR_CHECKUNCONFBAL', text: 'Error getting unconfirmed wallet balance: ' + e });
			});
		}).catch(e => {
			postMessage({request: 'unhandled_error', code: 'ERROR_CHECKUNCONFBAL', text: 'Error getting unconfirmed wallet balance: ' + e });
		});
	}
	else if(request == 'get_wallet_status')
	{
		postMessage({request: 'wallet_status', status: rosi_wallet.getWalletStatus() });
	}
	else if(request == 'update_settings')		// Send new settings to worker
	{
		rosi_wallet.updateSettings(m.settings);
	}
	else if(request == 'closed_channel_bundles')		// m.bundles
	{
		// Attach bundles to tangle
		rosi_wallet.sendBundles(m.bundles, true).then((txHashes)=>{
			console.log('Channel finished, bundles attached to tangle.');
			postMessage({ request: 'channel_close_bundles_sent', txHashes:txHashes });
			// Confirmation check possible with waitForConfirmation or isPendingOutput
		}).catch(e => {
			console.error('Error attachting flash cannel bundles to tangle.' + e);
			postMessage({request: 'unhandled_error', code: 'ERROR_SENDBUNDLE', text: 'Error attaching channel close bundles to tangle: ' + e });
		});
	}
	else if(request == 'get_wallet_backup')
	{
		postMessage({request: 'wallet_backup', wallet: rosi_wallet.getWalletBackup() });
	}
	else if(request == 'restore_wallet_backup')			// m.wallet
	{
		rosi_wallet.restoreWalletBackup(m.wallet);
	}
	else if(request == 'reinit_balance_from_inputs')
	{
		rosi_wallet.reInitBalance().then(w => {
			postMessage({request: 'reinit_balance_from_inputs_success' });
		}).catch(e => {
			postMessage({request: 'unhandled_error', code: 'ERROR_WALLET_BALANCE_REINIT', text: 'Error Reinitializing Wallet balance from inputs: ' + e });
		});
	}
	else if(request == 'reinit_inputs_complete')
	{
		rosi_wallet.reInitWalletInputs().then(w => {
			postMessage({request: 'wallet_reinit_success' });
		}).catch(e => {
			postMessage({request: 'unhandled_error', code: 'ERROR_WALLET_REINIT', text: 'Error Reinitializing Wallet Inputs: ' + e });
		});
	}
	else
	{
		console.warn('Unknown request received, ignoring.');
	} 
}


