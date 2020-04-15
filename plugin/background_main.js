/*
 * 
 *   	ROSI - Raltime Online Streaming with IOTA
 * 
 * 				MAIN THREAD - MAIN FUNCTIONS
 * 
 * 
 * 		Updated: 26.03.2020
 * 
 * */
 
 
////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////		DEFINE CONSTANTS AND GLOBAL VARIABLES		////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////  

// Define requests which are just relayed
const reqs_to_walletworker = 	[	'get_settlement_address', 
									'fund_deposit_address', 
									'closed_channel_bundles', 
									'watch_deposit',
									'get_deposit_balance'
								];
								
const reqs_to_mainworker = 		[	'new_settlement_address', 
									'deposit_funds_sent', 
									'deposit_funds_sent_confirmed', 
									'deposit_not_yet_sent', 
									'funds_sent_saved_task',
									'got_deposit_balance'
								];

const URL_STD_PAYSERV = '/payserver';

var initializedProviders = []; 	// [{providerId, provider, urlWebserver, urlPayserver, rosiVersion}, ...]
var initializedStreams = []; 	// [{streamId, provider, tabId, ppm, initPaySent, played, playing, starttime, latestPayments}, ...];
								// where streamId is random id for this session
var currentStream = false; 		// currently playing stream; copy of element of initializedStreams; false if not playing

var managedProviders = []; 		// When many elements of same provider are available on site, only work once per provider
var pendingNewChannels = []; 	// [provider1, provider2 ...]

var rosiStatus = { 				// var because external access from popup.js
    openChannelCnt: -1,
    openChannelBal: -1,
    openChannelBalUnconf: -1,
    walletBalance: -1,
    pendingCnt: -1,
    pendingBal: -1,
    currentPPM: -1
};

let openPromises = [];			// promises which are resolved after messages from workers come in
let waitingPayments = [];		// Payments scheduled to be processed after a new channel is created

var inputAddress = ""; 			// Current input address, as shown to the user
var dlWallet = false; 			// String object of wallet, if requested by backup function

var worker_wallet;				// worker handle for wallet worker
var worker_main;				// worker handle for payment worker
var interval10s;				// handle for interval for channel/wallet status updates

let channellist_buffer = false;	// channels info is stored here while worker cannot response






////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////					HELPERS							////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////

// Get new ID for a request
var newRequestId = function() 
{
    return Date.now();
}

var getNewSecureId = function() 
{
    return ncrypto.randomBytes(32).toString('hex');
}

var addOpenPromise = function(reqId, resolve, reject) 
{
    openPromises.push({
        reqId: reqId,
        resolve: resolve,
        reject: reject
    });
}

var setRosiStatusLoading = function() 
{
    rosiStatus.openChannelCnt = -1;
    rosiStatus.openChannelBal = -1;
    rosiStatus.openChannelBalUnconf = -1;
    rosiStatus.walletBalance = -1;
    rosiStatus.pendingCnt = -1;
    rosiStatus.pendingBal = -1;
    rosiStatus.currentPPM = -1;
}

// Returns promise of reqId and deletes it from the array
getOpenPromise = function(reqId) 
{
    let promise = openPromises.filter(promise => promise.reqId === reqId);
    openPromises = openPromises.filter(promise => promise.reqId !== reqId);

    return promise.length === 0 ? false : promise[0];
}

// Toolbar icon change
var setToolbarIcon = function(mode) {
    let icon;

    switch (mode) {
        case 'play':
            icon = 'rosi_icon_green.svg';
            browser.browserAction.setIcon({
                path: 'images/icons/' + icon
            });
            break;

        case 'provinit':
            icon = 'rosi_icon_red.svg';
            browser.browserAction.setIcon({
                path: 'images/icons/' + icon
            });

            break;

        case 'streaminit':
            icon = 'rosi_icon_orange.svg';
            browser.browserAction.setIcon({
                path: 'images/icons/' + icon
            });
            break;

        case 'sleep':
        default:
            getCurrentThemeInfo();
            break;
    }
}

// Check initialized Providers and initialized Streams arrays and set toolbar icon accordingly
var updateToolbarIcon = function() 
{
    if (initializedStreams.filter(s => s.playing === true).length > 0) 
    {
        setToolbarIcon('play');
    } 
    else if (initializedStreams.length > 0) 
    {
        setToolbarIcon('streaminit');
    } 
    else if (initializedProviders.length > 0)
    {
        setToolbarIcon('provinit');
    } 
    else 
    {
        setToolbarIcon('sleep');
    }
}

async function getCurrentThemeInfo() 
{
    var themeInfo = await browser.theme.getCurrent();
    if (themeInfo.colors) 
    {
        let icon;
        if (("" + themeInfo.colors.toolbar) == "hsl(240, 1%, 20%)") 
        {
            icon = 'rosi_icon_gray_light.svg';
        } 
        else if (("" + themeInfo.colors.toolbar) == "#f5f6f7") 
        {
            icon = 'rosi_icon_gray_dark.svg';
        } 
        else 
        {
            icon = 'rosi_icon_gray.svg';
        }
        browser.browserAction.setIcon({
            path: 'images/icons/' + icon
        });
    }
}

var sendUserQuestion = function(tabId, text)
{
	return new Promise((resolve, reject) => {
		let reqId = newRequestId();
		let answerObj = {
			request: 'question',
			reqId: reqId,
			accepted: false
		};
		
		browser.tabs.sendMessage(tabId, {
			request: 'question',
			text: text,
			answer: answerObj
		});
		
		addOpenPromise(reqId, resolve, reject);
	});
}


var readdWaitingPayments = function(provider)
{
	waitingPayments.filter(p => p.provider == provider).forEach(p => {
				
		worker_main.postMessage({
			request: p.request,
			reqId: p.reqId,
			timestamp: p.timestamp,
			tabId: p.tabId,
			streamId: p.streamId,
			provider: p.provider,
			amount: p.amount
		});
		
	});
}


var getActiveChannelList = function(forceRequest = false)
{
    return new Promise((resolve, reject) => {

        if (!forceRequest && channellist_buffer !== false && channellist_buffer.queue.length > 0 &&
            Date.now() - channellist_buffer.timestamp < 180000) {
            // main.js is working, just return buffered data
            resolve(channellist_buffer);
            return;
        }

        let reqId = newRequestId();
        worker_main.postMessage({
            request: 'get_active_channels',
            reqId: reqId
        });

        addOpenPromise(reqId, resolve, reject);
    });
}

// Save updated Settings to db and send new settings to workers
var updateSettings = function(settings) 
{
    currentSettings = settings;
    safeSettingsToDatabase(currentSettings, (e) => {
        if (e) {
            console.log('Error saving setting to databse!');
        }
        worker_main.postMessage({
            request: 'update_settings',
            settings: currentSettings.wallet
        });
        /// TODO channel settings!
    });
}


////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////		MESSAGES FROM WEBSITE / CONTENT SCRIPT		////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////


// Messagehandler for content script / website realy
browser.runtime.onMessage.addListener(function(message, sender, sendResponse) 
{
	
///////////////////////////////   INITIALIZATION 	////////////////////////////////////////////////
	
    if (message.request == 'initialize_provider') 				//// PROVIDER 
    {
        return new Promise((resolve, reject) => {

            let provider = message.provider;
            let urlWebserv = message.url;
            let suggestedCollateral = message.suggestedCollateral;
            let options = message.options;
            let version = message.options.version;

            let urlPayserv;
            if (typeof options.urlPayserv === 'string') {
                urlPayserv = options.urlPayserv;
            } else {
                urlPayserv = urlWebserv + URL_STD_PAYSERV;
            }
			
			getCurrentSettingsFromDatabase((e) => {
				
				let reqId = newRequestId();
				
				// SuggestedCollater of -1 means using Plugin Preference value
				if(suggestedCollateral < 0)
					suggestedCollateral = currentSettings.channel.later_ch_coll;
					
				try {
					worker_main.postMessage({
						request: 'initcheck_provider',
						reqId: reqId,
						provider: provider,
						tabId: sender.tab.id,
						urlPayserv: urlPayserv,
						urlWebserv: urlWebserv,
						suggestedCollateral: suggestedCollateral,
						version: version
					});
				} catch (e) {
					reject(e);
					return;
				}
				addOpenPromise(reqId, resolve, reject);
			});
        });
    } 
    else if (message.request == 'initialize_stream') 			//// STREAM
    {
        return new Promise((resolve, reject) => {

            let providerId = message.providerId;
            let ppm = message.ppm;
            let options = message.options;
            let version = message.options.version;

            let providerObj = initializedProviders.filter(p => p.providerId === providerId);
            if (providerObj.length !== 1) {
                // Provider not initialized
                reject(new Error('INVALID_PROVIDERID'));
                return;
            }
            providerObj = providerObj[0];
            let provider = providerObj.provider;
            
            getCurrentSettingsFromDatabase((e) => {
				if(e) {
					reject(e);
					return;
				}
				
				let validRequestContinue = function()
				{
					let streamId = getNewSecureId();
					
					initializedStreams.push({
						streamId: streamId,
						provider: provider,
						tabId: sender.tab.id,
						ppm: ppm,
						initPaySent: false,
						played: false,
						playing: false,
						starttime: 0,
						latestPayments: []		// latest payments needed to calculate
												// average ppm [{timestamp (ms), amount}]
					});

					updateToolbarIcon();
						resolve({
							result: 'STREAM_INITIALIZED',
							streamId: streamId
						});
				};
				
				if(ppm > currentSettings.general.max_ppm)
				{
					// high ppm stream requested, ask user before continuing...
					sendUserQuestion(sender.tab.id, "The provider " + provider + " requests a new" + 
						" stream with a higher price per minute (" + ppm + "iota) than the maximum " +
						"defined in settings (" + currentSettings.general.max_ppm + "iota). Do you want " + 
						"to allow this stream?").then(accepted => {
							
							if(accepted === true)
							{
								validRequestContinue();
								return;
							}
							else
							{
								reject(new Error("USER_REJECT_HIGHPPM"));
								return;
							}
					}).catch(e => {
						reject(e);
						return;
					});
				}
				else
				{
					validRequestContinue();
				}
            return;
			});
        });
    } 
    
//////////////////////////////			START		 ///////////////////////////////////////////////
    
    else if (message.request == 'start_stream')
    {
        return new Promise((resolve, reject) => {

            let streamId = message.streamId;
            let options = message.options;
            let version = message.options.version;

            let stream = initializedStreams.filter(s => s.streamId === streamId);
            if (stream.length !== 1) {
                // Provider not initialized
                reject(new Error('INVALID_STREAMID'));
                return;
            }
            stream = stream[0];

            // Check if other stream is playing
            if (initializedStreams.filter(s => s.playing === true).length > 0) {
                reject(new Error('OTHER_STREAM_PLAYING'));
                return;
            }
            
            // set global current stream
            currentStream = stream;
            
            stream.playing = true;
            stream.starttime = Date.now();

            updateToolbarIcon();
            resolve({
                result: 'STREAM_STARTED'
            });
            return;
        });
    } 
    
//////////////////////////////			STOP		 ///////////////////////////////////////////////
    
    else if (message.request == 'stop_stream') 
    {
        return new Promise((resolve, reject) => {

            let streamId = message.streamId;
            let options = message.options;
            let version = message.options.version;

            let stream = initializedStreams.filter(s => s.streamId === streamId);
            if (stream.length !== 1) {
                // Provider not initialized
                reject(new Error('INVALID_STREAMID'));
                return;
            }
            stream = stream[0];

            currentStream = false;

            stream.playing = false;
            // Only set stream played if it played at least for 1 second, should prevent
            // initPay attack of provider
            if (Date.now() - stream.starttime > 1000) {
                stream.played = true;
                resolve({
                    result: 'STREAM_STOPPED'
                });
            } else {
                resolve({
                    result: 'STREAM_STOPPED_SHORTDUR'
                });
            }

            updateToolbarIcon();
            return;
        });
    } 
    else if (message.request == 'close_stream') 						//// CLOSE
    {
        return new Promise((resolve, reject) => {

            let streamId = message.streamId;
            let options = message.options;
            let version = message.options.version;

            let stream = initializedStreams.filter(s => s.streamId === streamId);
            if (stream.length !== 1) {
                // Provider not initialized
                reject(new Error('INVALID_STREAMID'));
                return;
            }
            stream = stream[0];

            if (stream.playing == true) {
                reject(new Error('STREAM_NOT_STOPPED'));
                return;
            }
            if (stream.played == false) {
                reject(new Error('STREAM_NOT_PLAYED'));
                return;
            }

            initializedStreams = initializedStreams.filter(s => s.streamId !== streamId);

            updateToolbarIcon();

            resolve({
                result: 'STREAM_CLOSED'
            });
            return;
        });
    } 
    
//////////////////////////////			PAYMENTS		 ///////////////////////////////////////////

    else if (message.request == 'pay_stream') 					//// STREAM
    {
        return new Promise((resolve, reject) => 
        {
			
			getCurrentSettingsFromDatabase((e) => 
			{
				if(e)
				{
					reject(e);
					return;
				}
				
				let reqId = newRequestId();

				let streamId = message.streamId;
				let amount = Number(message.amount);

				try 
				{
					
					let stream = initializedStreams.filter(s => s.streamId === streamId);
					if (stream.length !== 1) {
						reject(new Error('INVALID_STREAMID'));
						return;
					}

					stream = stream[0];

					if (stream.playing !== true) 
					{
						if(stream.initPaySent === false && amount <= currentSettings.general.prepay_t * stream.ppm / 60)
						{
							stream.initPaySent = true;
						}
						else
						{
							reject(new Error('STREAM_NOT_PLAYING'));
							return;
						}
					}

					// Calculate average ppm of current stream
					let oldpalen = stream.latestPayments.length;
					
					stream.latestPayments = stream.latestPayments.filter(p => p.timestamp 
						> Date.now() - currentSettings.general.ppm_avg_t * 1000);
					
					if(oldpalen > stream.latestPayments.length)
					{
						console.log("Removed payment from list.");
					}
					
					let latest_amount = stream.latestPayments.reduce((acc, p) => 
														{	return acc + p.amount; }, 0);
														
					latest_amount += amount;	// Calculate as if current payment would be allowed					
					rosiStatus.currentPPM = latest_amount * 60 / currentSettings.general.ppm_avg_t;

					if(latest_amount > stream.ppm * currentSettings.general.ppm_avg_t / 60)
					{
						// Payment amount too high -> INFORM user
						sendUserQuestion(stream.tabId, "The current stream of provider " + stream.provider + " has exceeded it's price per minute!" + 
							"It used " + rosiStatus.currentPPM + " i/min instead of the registered/allowed " + 
							stream.ppm + " i/min in the latest " + currentSettings.general.ppm_avg_t + " seconds of stream." + 
							"This could mean this provider is betraying! Please be careful. You can reload the webpage to reset the timer. If this error " + 
							"persits, please contact the content provider or ROSI team for help. " + 
							"ROSI will not allow any more payments until enough time has passed to put the average price back in allowed range." + 
							"\n[INFO: This error sometimes appeares when playlist is changed (song skipping etc...) this is due to suboptimal" +
							"Payment timing of streaming website / player and will be improved in future.]");
							
						reject(new Error('STREAM_PPM_MAX_REACHED'));
						return;
					}
					
					// Payment has to be deleted from latest payments if it failed!
					let timestamp = Date.now();
					stream.latestPayments.push({ timestamp: Date.now(), amount: amount });
				
					worker_main.postMessage({
						request: 'send_channel_payment',
						reqId: reqId,
						timestamp: timestamp,
						streamId: streamId,
						provider: stream.provider,
						amount: amount
					});
				} catch (e) 
				{
					console.error('pay_stream background error:', e);
					reject(e);
					return;
				}

				addOpenPromise(reqId, resolve, reject);
            
			});
        });
    } 
    else if (message.request == 'pay_single') 						//// SINGLE PAYMENT
    {	
        return new Promise((resolve, reject) => {
            
            let reqId = newRequestId();
            let providerId = message.providerId;
            let amount = Number(message.amount);
            let options = message.options;
            let paymentId = typeof options.paymentId == "undefined" ? "SINGLE_PAYMENT" : String(options.paymentId);

			let providerObj = initializedProviders.filter(p => p.providerId === providerId);
            if (providerObj.length !== 1)
            {
                // Provider not initialized
                reject(new Error('INVALID_PROVIDERID'));
                return;
            }
            
            providerObj = providerObj[0];
            let provider = providerObj.provider;

            sendUserQuestion(sender.tab.id, "Do you want to SEND " + amount + " iota to " + provider + "?").then(accepted => {
				if(accepted === true)
				{
					try {
						let chp_reqId = newRequestId();
						
						(new Promise((chp_resolve, chp_reject) => {
							
						// if amount is more than half of the suggested channel Collateral, request direct payment
						if(amount * 2 > providerObj.suggestedCollateral)
							throw new Error('UNSUFFICIENT_BALANCE');
						
						let timestamp = Date.now();
							worker_main.postMessage({
								request: 'send_channel_payment',
								reqId: chp_reqId,
								timestamp: timestamp,
								streamId: paymentId,
								provider: provider,
								amount: amount
							});
							
							addOpenPromise(chp_reqId, chp_resolve, chp_reject);
						
						})).then(result => {
							resolve(result);
						}).catch(e => {
							if( e.message == 'UNSUFFICIENT_BALANCE')
							{
								let dtxa_reqId = newRequestId();
								
								(new Promise((dtxa_resolve, dtxa_reject) => {
									console.log("Detected unsufficient balance in single send. Trying to send direct transfer ...");

									worker_main.postMessage({
										request: 'get_direct_address',
										reqId: dtxa_reqId,
										txId: 'DIRECTTX_' + newRequestId(),		/// TODO: ID System
										providerObj : providerObj
									});
									
									addOpenPromise(dtxa_reqId, dtxa_resolve, dtxa_reject);
								
								})).then(address => {
									console.log('Now sending funds to', provider, 'via direct transfer to IOTA address', address);
									
									worker_wallet.postMessage({
										request: 'fund_withdraw',
										reqId: reqId,
										amount: amount,
										address: address
									});
									
									// Wait for worker...
									addOpenPromise(reqId, resolve, reject);
									
								}).catch(e => {
									reject(e);	
								});
							}
							else
							{
								reject(e);
							}
						});
					} catch (e) {
						console.log('pay_single background error:', e);
						reject(e);
						return;
					}
				}
				else
				{
					reject(new Error('NOT_ACCEPTED_BY_USER'));
					return;
				}
			}).catch(e => {
				reject(e);
				return;
			});
        });
    }
    
//////////////////////////////			STATUS 			 ///////////////////////////////////////////

	// get channel ids for provider
    else if (message.request == 'get_provider_channels') 			//// 	CHANNELS 
    {
        return new Promise((resolve, reject) => {

            var reqId = newRequestId();

            try {
                let provider = initializedProviders.filter(p => p.providerId == message.providerId)[0].provider;
                worker_main.postMessage({
                    request: 'get_provider_channels',
                    reqId: reqId,
                    provider: provider
                });
            } catch (e) {
                console.error('Error sending message to main worker:', e);
                reject(e);
                return;
            }

            // Promise is resolved when answer from worker arrives
            // openPromises.push({reqid: reqid, resolve: resolve, reject: reject});
            addOpenPromise(reqId, resolve, reject);
        });
    } 
     // get info about plugin state	
    else if (message.request == 'status')										//// STATUS
    {
        return new Promise((resolve, reject) => {

            var reqId = newRequestId();

            try {
				let status = {
					version: ROSI_VERSION,											// string version of rosi plugin
					initialized: rosiStatus.openChannelCnt >= 0 ? true : false,		// is plugin initialized, ready to work?
					funded: rosiStatus.walletBalance > 0 ? true : false, 			// is wallet funded, true if at least 1 iota balance
					
					provider: false,		// set to object if providerID has been transmitted
					stream: false			// set to object if streamID has been transmitted
				};
				
				getActiveChannelList().then(channels => {

					if(message.providerId)
					{
						let provider = initializedProviders.filter(p => p.providerId === message.providerId)[0].provider;
						
						let activeChannels = channels.active.filter(c => c.provider === provider).map(c => {
							return {
								id : c.depositAddress, 
								balance: Math.max(c.availableBalance, c.availableUnconfirmed), 
								isConfirmed: (c.availableBalance > 0 ? true : false) 
							}});
						
						status.provider = {
								name : provider,
								channelsAvailable: activeChannels.length,
								channelsCreating: channels.queue.filter(c => c.provider === provider).length,
								channels: activeChannels
							};
					}
					
					if(message.streamId)
					{
						status.stream = {
								initialized: initializedStreams.filter(s => s.streamId === message.streamId).length == 1 ? true : false,
								currentStream: currentStream.streamId === message.streamId ? true : false
							};
					}

					// finished, return results
					resolve(status);
				}).catch(e => {
					console.error("Error getting channellist:", e);
					reject(e);
					return;
				});

            } catch (e) {
                console.error(e);
                reject(e);
                return;
            }

        });
    } 
    
/////////////////////////////			HELPER REQUESTST			////////////////////////////////
    
    else if (message.request == 'new_channel')		 // Answer from user question
    {
        createChannel(message);
    } 
    else if (message.request === 'question')	 	 // Answer from user question general
    {		
		
		let promiseObj = getOpenPromise(message.reqId);

        if (promiseObj === false) {
            // Unknown promise --> ERROR ??
            console.log('Unknown promise!');
            return;
        }
    
        promiseObj.resolve(message.accepted === true ? true : false);	
	}
	else if (message.request == 'unloading') 
	{
        console.log('Unloading tab with ID: ' + sender.tab.id);
        // remove all available Products with sender tabId

        initializedStreams = initializedStreams.filter(s => s.tabId !== sender.tab.id);
        initializedProviders = initializedProviders.filter(p => p.tabId !== sender.tab.id);

        updateToolbarIcon();
        /// TODO: better management/shutdown of streams when tab closes??
    }
});






////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////				MAIN FUNCTION OF SCRIPT				////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////



////////////////////////////////  			MANAGE CHANNELS			////////////////////////////////

// Got provider info -> see if new channel creation is needed...

var manageChannels = function(m) 
{
    if (m.hasChannel == false) 
    {
        requestCreateChannel(m.provider, true);
    } 
    else if ( m.hasOpenChannel == false || 
		m.openChannelBalance < ((currentSettings.channel.new_ch_threshold > 1) ? 
			currentSettings.channel.new_ch_threshold : 
			currentSettings.channel.new_ch_threshold * m.lastOpenChannelCollateral))
	{
        requestCreateChannel(m.provider, false);
    } 
    else // nothing to do for this provider
    {
        managedProviders = managedProviders.filter(prov => prov != m.provider);
    }
};



/////////////////////////	   REQUEST NEW CHANNEL	(CREATION PART 1)		////////////////////////

var requestCreateChannel = function(provider, isNewProvider) 
{
    if (pendingNewChannels.indexOf(provider) >= 0) 
    {
        console.log('New channel for this provider is already requested.');
		managedProviders = managedProviders.filter(prov => prov != provider);
        return;
    };

    let chSettings = currentSettings.channel; 	// get settings for flash channels

    if (isNewProvider) 							// unknown provider
    {
        console.log('No channel available, create one?');
        let provObj = initializedProviders.filter(p => p.provider == provider)[0];
        if (!provObj) 
        {
            console.log('Provider product not available anymore. Provider:' + provider);
            managedProviders = managedProviders.filter(prov => prov != provider);
            return;
        }

        let createChannelObj = {
            accepted: false, 		// to be manipulated through user interaction
            request: 'new_channel',
            tabId: provObj.tabId,
            provider: provider,
            url_payserv: provObj.urlPayserver,
            minTx: chSettings.channel_min_tx,
            collateral: (chSettings.use_sugg_coll && provObj.suggestedCollateral > 0) ? 
				Math.ceil(provObj.suggestedCollateral * chSettings.factor_sg_first)
				: chSettings.first_ch_coll
        };

        if (chSettings.ask_new_prov == true || (chSettings.warn_sugg_coll == true &&
				createChannelObj.collateral > chSettings.first_ch_coll)) 
		{
            // Ask user if channel should be created for new provider
            browser.tabs.sendMessage(provObj.tabId, {
                request: 'question',
                text: 'Create a new channel for NEW provider ' + provider + ' with ' +
					createChannelObj.collateral + ' iota collateral?' + 
					"INFO: Channel creation takes some time but is necessary to be able to stream" + 
					" Content from this provider. Please be patient ;).",
                answer: createChannelObj
            });
        } 
        else 
        {
            // create without asking
            createChannelObj.accepted = true;
            createChannel(createChannelObj);
        }
    } 
    else 											// Known provider
    {
        console.log('No open channel available, create one?');
        let provObj = initializedProviders.filter(p => p.provider == provider)[0];
        if (!provObj) 
        {
            console.log('Provider product not available anymore. Provider:' + provider);
            managedProviders = managedProviders.filter(prov => prov != provider);
            return;
        }
			
        let createChannelObj = {
            accepted: false, // to be manipulated through user interaction
            request: 'new_channel',
            tabId: provObj.tabId,
            provider: provider,
            url_payserv: provObj.urlPayserver,
            minTx: chSettings.channel_min_tx,
            collateral: (chSettings.use_sugg_coll && provObj.suggestedCollateral > 0) ?
						provObj.suggestedCollateral : chSettings.later_ch_coll
        };

        if (chSettings.ask_new_channel == true || (chSettings.warn_sugg_coll == true && 
				createChannelObj.collateral > chSettings.later_ch_coll)) 
		{
            // Ask user if new channel should be created for known provider
            browser.tabs.sendMessage(provObj.tabId, {
                request: 'question',
                text: 'Create a new channel for known provider ' + provider + ' with ' + 
						createChannelObj.collateral + ' iota collateral?' + 
					"INFO: Channel creation takes some time but is necessary to be able to stream" + 
					" Content from this provider. Please be patient ;).",
                answer: createChannelObj
            });
        }
        else {
            // create without asking
            createChannelObj.accepted = true;
            createChannel(createChannelObj);
        }
    }
}



/////////////////////////	   CREATE NEW CHANNEL	(CREATION PART 2)		////////////////////////

// 	Request channel -> Question to check_site -> 
//  website/user OK -> message handler -> createChannel
var createChannel = function(m) 
{
    managedProviders = managedProviders.filter(prov => prov != m.provider);
    
    if (pendingNewChannels.indexOf(m.provider) >= 0) 
    {
        // Do nothing
        return;
    }
    
    if (m.accepted == false) {
        // delete request, do nothing
        return;
    }
    
    let CheckInformLowBalance = function() {
		if(rosiStatus.walletBalance > -1)
		{
			if(rosiStatus.walletBalance < m.collateral)
			{
				browser.tabs.sendMessage(m.tabId, {
						request: 'alert',
						text: 'Your wallet balance is lower than the selected collateral for the requested channel.' + 
								'The channel is still prepared in the background, but will only be useable after you' + 
								' increase your ROSI wallet balance.'
					});
			}
			else if(rosiStatus.walletBalance < 2 * m.collateral)
			{
				browser.tabs.sendMessage(m.tabId, {
						request: 'alert',
						text: 'INFO: Your wallet balance is getting low.'
					});
			}
		}
		else
		{
			worker_main.postMessage({
				request: 'get_channels_status'
			});
			
			setTimeout(CheckInformLowBalance, 1000);
		}
	}
    
	CheckInformLowBalance();
	
    pendingNewChannels.push(m.provider);

    // Create new channel
    console.log('Informing worker to create new channel ...');
    worker_main.postMessage(m);
}






////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////		HELPERS FOR POPUP / OPTIONS			////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////


///////////////////////////////		 FILE UPLOAD 		////////////////////////////////////////////

// callback(fileContent)
var initiate_upload = function(callback) 
{
    var element = document.getElementById('file_upload');

    element.onchange = function() {
        if (element.files.length) {
            var reader = new FileReader();

            reader.onload = function(e) {
                callback(JSON.parse(JSON.stringify(e.target.result)));
            };

            reader.readAsBinaryString(element.files[0]);
        }
    };

    element.click();
}

///////////////////////////////		RESTORE WALLET FROM FILE	////////////////////////////////////

// Requests file from user and sends it to wallet worker
var restoreUploadWallet = function() 
{
    initiate_upload((data) => {
        try {
            if (JSON.parse(data).seed.length == 81) {
                // Seems like correct data
                worker_wallet.postMessage({
                    request: 'restore_wallet_backup',
                    wallet: data
                });
            }
        } catch (e) {
            console.warn('Wallet file is corrupt. Wallet is not restored!', e);
        }
    });
}






////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////		MESSAGES FROM MAIN PAYMENT WORKER 		////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////


var main_messageHandler = function(e) 
{

    var request = e.data.request;

///////////////////////////////		ROUTE WALLET MESSAGES		////////////////////////////////////

    if (reqs_to_walletworker.indexOf(request) > -1) 
    {
        worker_wallet.postMessage(e.data);
    } 
 
 
///////////////////////////////		PAYMENT FINISHED			////////////////////////////////////

    else if (request == 'channel_pay_successful') 				//// SUCCESS
    {
        let reqId = e.data.reqId;
        let provider = e.data.provider;
        let streamId = e.data.streamId;
        let paymentAmount = e.data.paymentAmount;
        let promiseObj = getOpenPromise(reqId);
        
        console.log("Removing potential waitingPayment from queue");
        waitingPayments = waitingPayments.filter(p => p.reqId != e.data.reqId);

        if (promiseObj === false) 
        {
            // Unknown promise --> ERROR ??
            console.warn('Unknown promise! e.data:', e.data);
            return;
        }

        var data = {
			txType: 'ONCHANNELTX',
            channelId: e.data.channelId,
            available: e.data.available		// instantly available channel balance (if confirmed,
											// real remaining, else unconfirmed remaining )
        };
		
		// Resolve Promise so that client can begin to work ... 
		promiseObj.resolve(data);
		
        // Create new Flash-Channel? - Only when there isn't already one requested.
        if (pendingNewChannels.indexOf(provider) < 0 && managedProviders.indexOf(e.data.provider) < 0) 
        {
            getCurrentSettingsFromDatabase((err) => {
                if (e.data.provAvailable < (currentSettings.channel.new_ch_threshold > 1 ? 
					currentSettings.channel.new_ch_threshold : 
					currentSettings.channel.new_ch_threshold * e.data.channelCollateral))
                {
                    managedProviders.push(provider);
                    requestCreateChannel(provider, false);
                }
            });
        } 
        else 
        {
            console.log('Channel creation pending!');
        };
    } 
    else if (request == 'unsufficient_channel_balance') 	//// UNSUFFICIENT BALANCE
    {
		console.log("Worker responded insufficient channel balance.");

		let pdata = {
			request : "send_channel_payment",
			reqId : e.data.reqId,
			timestamp : e.data.timestamp,
			streamId: e.data.streamId,
			provider: e.data.provider,
			amount: e.data.amount
		};
		
		if(waitingPayments.filter(p => p.reqId == pdata.reqId).length > 0)
		{
			console.warn("This payments has failed the second time despite waiting for channel!");
			
			// delete tx from history of ppm -checker
			let stream = initializedStreams.filter(s => s.streamId === e.data.streamId);
			if (stream.length === 1) 
			{
				stream[0].latestPayments = stream[0].latestPayments.filter(p => p.timestamp != e.data.timestamp);
			}
			else
			{
				console.log("Failed payment was for unknown streamId.");
			}
			var promiseObj = getOpenPromise(e.data.reqId);

			if (promiseObj === false) 
			{
				// Unknown promise --> ERROR ??
				console.warn('Unknown promise!');
				return;
			}
			promiseObj.reject(new Error('UNSUFFICIENT_BALANCE'));
			return;
		}
		else
		{
			waitingPayments.push(pdata);
		}
        
		console.log("Checking if channel is already requested...");
        if (pendingNewChannels.indexOf(e.data.provider) < 0 && managedProviders.indexOf(e.data.provider) < 0) 
        {
			if(initializedStreams.filter(s => s.streamId === e.data.streamId).length !== 1)
			{
				// no stream found - probably single payment - do not create channel, just send 
				// direct payment
				console.log("Will not create channel for unknown streamId.");
				waitingPayments.pop();	// Delete just added payment request 
				var promiseObj = getOpenPromise(e.data.reqId);
				if (promiseObj === false) 
				{
					// Unknown promise --> ERROR ??
					console.warn('Unknown promise!');
					return;
				}
				promiseObj.reject(new Error('UNSUFFICIENT_BALANCE'));
				return;
			}
            console.log("Requested new channel.");
			managedProviders.push(e.data.provider);
			requestCreateChannel(e.data.provider, false);
        } 
        else 
        {
            console.log('Channel creation already pending.');
        }
    } 
    else if (request == 'general_pay_error') 			//// GENERAL ERROR WHEN PAYING
    {
        var reqId = e.data.reqId;
        var provider = e.data.provider;
        var promiseObj = getOpenPromise(reqId);
        
        console.log("Removing potential waitingPayment from queue");
        waitingPayments = waitingPayments.filter(p => p.reqId != e.data.reqId);

        if (promiseObj === false) {
            // Unknown promise --> ERROR ??
            console.warn('Unknown promise!');
            return;
        }
               
        // delete tx from history of ppm -checker
        let stream = initializedStreams.filter(s => s.streamId === e.data.streamId);
		if (stream.length === 1) 
		{
			stream[0].latestPayments = stream[0].latestPayments.filter(p => p.timestamp != e.data.timestamp);
		}
		else
		{
			console.warn("Failed payment was for unknown streamId.");
		}

        promiseObj.reject(new Error('GENERAL_PAY_ERROR'));
    } 
    else if (request == 'get_direct_address') 			//// DIRECT PAY IOTA ADDRESS
    {
        let reqId = e.data.reqId;
        let accepted = e.data.accepted;
        let address = e.data.address;
		let promiseObj = getOpenPromise(reqId);
		 
        if (promiseObj === false) {
            // Unknown promise --> ERROR ??
            console.log('Unknown promise!');
            return;
        }
        
		if(accepted){
			promiseObj.resolve(address);
		}else{
			promiseObj.reject();
		}
    }
    
///////////////////////////////			STATUS MESSAGES			////////////////////////////////////

    else if (request == 'new_channel_created') 
    {
        console.log('New channel created, requesting deposit...');
    } 
    else if (request == 'provider_info') 						////  PROVIDER INFO
    {
        getCurrentSettingsFromDatabase((err) => {				// --> manage channels
            manageChannels(e.data);
        });
    } 
    else if (request == 'channels_status') 						////  CHANNEL STATUS
    {
        rosiStatus.openChannelCnt = e.data.status.openChannelCnt;
        rosiStatus.openChannelBal = e.data.status.openChannelBal;
        rosiStatus.openChannelBalUnconf = e.data.status.openChannelBalUnconf;
    } 
    else if (request == 'provider_channels') 					////  PROVIDER CHANNELS
    {
        let reqId = e.data.reqId;
        let provider = e.data.provider;
        let channelIds = e.data.channelIds;
        let promiseObj = getOpenPromise(reqId);

        if (promiseObj === false) 
        {
            // Unknown promise --> ERROR ??
            console.log('Unknown promise!');
            return;
        }

        promiseObj.resolve(channelIds); 	// Return channelIds to check_site.js
    } 
    else if (request == 'channel_list')							////  CHANNEL LIST
    {
        let reqId = e.data.reqId;

        channellist_buffer = {};
        channellist_buffer.queue = e.data.queue;
        channellist_buffer.active = e.data.active;
        channellist_buffer.closed = e.data.closed;
        channellist_buffer.timestamp = Date.now();
        
        if (reqId == 0) 
        {
            // just buffer
            return;
        }

        let promiseObj = getOpenPromise(reqId);

        if (promiseObj === false) 
        {
            // Unknown promise --> ERROR ??
            console.log('Unknown promise!');
            return;
        }
		
		// Return channelIds to check_site.js
        promiseObj.resolve(channellist_buffer); 		
    }
    else if (request == 'channel_useable') 						////  CHANNEL CREATION FINISHED
    {
        console.log('New channel now useable.');
        pendingNewChannels = pendingNewChannels.filter(p => p != e.data.provider);
        
        //  CONTINUE WAITING PAYMENTS ...
        readdWaitingPayments(e.data.provider);
        
        // Time for automatic backup ....
		checkCreateAutoBackup();
    } 
    else if (request == 'initcheck_provider') 					////  PROVIDER SECURITY CHECK
    {
        let reqId = e.data.reqId;
        let result = e.data.result;
        let provider = e.data.provider;
        let urlWebserv = e.data.urlWebserv;
        let urlPayserv = e.data.urlPayserv;
        let suggestedCollateral = e.data.suggestedCollateral;
        let tabId = e.data.tabId;
        let version = e.data.version;

        let promiseObj = getOpenPromise(reqId);

        if (promiseObj === false) {
            // Unknown promise --> ERROR ??
            console.log('Unknown promise!');
            return;
        }

        if (result === 'NEW' || result === 'KNOWN_OK') {
            let providerId = getNewSecureId();

            initializedProviders.push({
                provider: provider,
                urlWebserver: urlWebserv,
                urlPayserver: urlPayserv,
                version: version,
                providerId: providerId,
                tabId: tabId,
                suggestedCollateral: suggestedCollateral
            });

            updateToolbarIcon();
            promiseObj.resolve({
                providerId: providerId,
                result: result
            });

            // Check availability of active channel for this provider
            if (managedProviders.indexOf(provider) < 0) {
                worker_main.postMessage({
                    request: 'get_provider_info',
                    provider: provider
                });
                managedProviders.push(provider);
                console.log('Requested provider info from background.');
            }
        } else {
            promiseObj.reject(new Error(e.data.error));
        }
    } 
    
    ////  ------ 	UNKNOWN REQUEST    --------
    else 
    {
        // standard message
        console.log('Received message to background_main:', e.data);
    }
}







////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////			MESSAGES FROM WALLET WORKER 			////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////


var wallet_messageHandler = function(e) 
{
    var request = e.data.request;

//////////////////////////////		ROUTE MAIN PAYMENT MESSAGES		////////////////////////////////

    if (reqs_to_mainworker.indexOf(request) > -1) 
    {
        worker_main.postMessage(e.data);
    } 
    
//////////////////////////////			PAYMENT FINISHED			////////////////////////////////

	else if (request == 'fund_withdraw_sent') 
    {
        let reqId = e.data.reqId;
        let address = e.data.address;
        let txHash = e.data.txHash;
        let promiseObj = getOpenPromise(reqId);
        
        if (promiseObj === false) {
            // Unknown promise --> ERROR ??
            console.log('Unknown promise!');
            return;
        }
        
		promiseObj.resolve({txType: 'DIRECTTX', 
							address: address,
							txHash: txHash
						   });
    }
    
    
///////////////////////////////			STATUS MESSAGES			////////////////////////////////////
  
    else if (request == 'wallet_status') 						//// WALLET STATUS
    {
        rosiStatus.walletBalance = e.data.status.balance;
        rosiStatus.pendingCnt = e.data.status.pendingCnt;
        rosiStatus.pendingBal = e.data.status.pendingBal;
    } 	
    else if (request == 'new_input_address') 					//// WALLET INPUT ADDRESS
    {
		// When error: address === false
        inputAddress = e.data.address; 		
    } 
    else if (request == 'wallet_backup') 						//// WALLET BACKUP
    {
        dlWallet = e.data.wallet;
    } 

/////////////////////////////////			ERRORS				////////////////////////////////////     

    else if (request == 'unhandled_error')						//// UNHANDLED ERROR
     {
		if(typeof e.data.reqId !== 'undefined')
		{
			let reqId = e.data.reqId;
			let promiseObj = getOpenPromise(reqId);
			
			if (promiseObj === false) {
				// Unknown promise --> ERROR ??
				console.log('Unknown promise!');
				return;
			}
			
			promiseObj.reject(new Error(e.data.text));
		}else
		{
			console.error('WALLET ERROR: ' + e.data.text);
		}
    } 
    
    
    ////  ------ 	UNKNOWN REQUEST    --------
    else
    {
        // standard message
        console.log('Received message to background_main:', e.data);
    }
}







////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////				BACKUP MANAGEMENT 					////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////


//////////////////////////////			CREATE BACKUP			////////////////////////////////////  

var createBackup = function() 
{
    return new Promise((resolve, reject) => {
        (new Promise((res_req, rej_req) => {
            let bworker = new Worker("background_worker/backup.js");
            bworker.onmessage = (e) => {
                let m = e.data;
                if (m.request == 'backup_created') {
                    res_req();
                } else if (m.request == 'error') {
                    rej_req(m.retval);
                } else {
                    console.warn("Received unknown request from backup worker: " + m.request);
                }
            };
            getCurrentSettingsFromDatabase((err) => {
                if (err) {
                    rej_req("Cannot retreive current settings.");
                    return;
                }

                let backSettings = currentSettings.backup;

                bworker.postMessage({
                    request: 'create',
                    usrId: backSettings.user,
                    url: backSettings.server,
                    pw: backSettings.password,
                    backupClosedChannels: backSettings.backup_closed_channels
                });
            });
        })).then(() => {
            console.log("Backup finished.");
            // Do something ...
            resolve();
        }).catch((e) => {
            console.error("Error occurred creating backup: " + e);
            reject(e);
        });
    });
}


//////////////////////////////			RESTORE BACKUP			////////////////////////////////////  

var restoreBackup = function(restoreNo) 
{
    return new Promise((resolve, reject) => {
        (new Promise((res_req, rej_req) => {
            // Terminate workers before restoring backup
            console.log("Terminating workers...");
            terminateWorkers();

            let bworker = new Worker("background_worker/backup.js");
            bworker.onmessage = (e) => {
                let m = e.data;
                
                if (m.request == 'backup_restored') {
                    res_req();
                } else if (m.request == 'error') {
                    rej_req(m.retval);
                } else {
                    console.warn("Received unknown request from backup worker: " + m.request);
                }
            };
            getCurrentSettingsFromDatabase((err) => {
                if (err) {
                    rej_req("Cannot retreive current settings.");
                    return;
                }

                let backSettings = currentSettings.backup;

                bworker.postMessage({
                    request: 'restore',
                    usrId: backSettings.user,
                    url: backSettings.server,
                    pw: backSettings.password,
                    restoreNo: restoreNo
                });
            });
        })).then(() => {
            console.log("Backup restore finished.");
            // Restart workers
            createConnectWorkers();
            resolve();
        }).catch((e) => {
            // Also restart workers with old data...
            createConnectWorkers();
            console.error("Error occurred restoring backup: " + e);
            reject(e);
        });
    });
}


//////////////////////////////			TEST BACKUP SETUP		////////////////////////////////////  

var testBackupSetup = function(url, usrId, pw) 
{
    return new Promise((resolve, reject) => {

        let request = {
            name: 'Test-User',
            rosiVersion: ROSI_VERSION,
            userId: usrId,
            pwHash: rosi_conserver.createPwServerChecksum(pw),
            data: 'PING'
        };

        rosi_conserver.submit(url, request).then((response) => {

            if (response.data == "NEW_USER") 
            {
                resolve("NEW_USER");
            } 
            else if (response.data == "KNOWN_USER") 
            {
                resolve("KNOWN_USER");
            } 
            else if (response.data == "WRONG_USER") 
            {
                reject("WRONG_USER");
            } 
            else 
            {
                reject("UNKOWN_ERROR");
            }

        }).catch(e => {
            console.log("Connection error - Is the selected RosiConserver server online?");
            reject("CONNECTION_ERROR");
        });
    });
}


//////////////////////////////			LOAD BACKUP LIST		////////////////////////////////////  

var loadBackupList = function() 
{
    return new Promise((resolve, reject) => {
        getCurrentSettingsFromDatabase((err) => {

            let backSettings = currentSettings.backup;

            let request = {
                name: 'List-Backups',
                rosiVersion: ROSI_VERSION,
                userId: backSettings.user,
                pwHash: rosi_conserver.createPwServerChecksum(backSettings.password),
                data: 'PING'
            };

            rosi_conserver.submit(backSettings.server, request).then((response) => {

                try {
                    let list = response.data.split("\r\n");
                    let sum = list.shift();
                    sum = Number(sum.split(":")[1]);
                    if (list.length == sum) {
                        resolve(list);
                    } else {
                        reject("RESPONSE FORMAT ERROR");
                    }
                } catch (e) {
                    reject(e);
                }
            }).catch(e => {
                console.log("Connection error - Is the selected RosiConserver server online?");
                reject("CONNECTION_ERROR");
            });
        });
    });
}



//////////////////////////////		AUTOMATIC BACKUP HELPER		////////////////////////////////////  

var checkCreateAutoBackup = function()
{
	getCurrentSettingsFromDatabase((err) => {
		if (err) {
			console.error("Cannot retreive current settings.");
			return;
		}
		if(currentSettings.backup.auto_backup)
		{
			console.log("Will request backup creation in about 1 sec...");
			setTimeout(() => 
			{
					console.log("Now requesting automatic backup...");
					createBackup().then(r => {
						console.log("Automatic backup successful.");
					}).catch(e => {
						console.error("Automatic backup FAILED: " + e); 
					});
			}, 1000);
		}
	});
}

 
////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////					INITIALIZATION					////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////// 


//////////////////////////////			WORKERS						////////////////////////////////

var createConnectWorkers = function() 
{
    // Setup wallet worker
    worker_wallet = new Worker("background_worker/wallet.js");
    worker_wallet.onmessage = wallet_messageHandler;

    // Setup channel worker
    worker_main = new Worker("background_worker/main.js");
    worker_main.onmessage = main_messageHandler;

    // Init workers
    getCurrentSettingsFromDatabase((e) => {
        if (e) {
            console.warn(e);
        }
        worker_wallet.postMessage({
            request: 'init_wallet',
            settings: currentSettings.wallet
        });
        /// TODO channel settings!
    });

    clearInterval(interval10s);
    interval10s = setInterval(() => {
        // get data and channel info
        worker_main.postMessage({
            request: 'get_channels_status'
        });
        worker_wallet.postMessage({
            request: 'get_wallet_status'
        });
    }, 10000);
}


var terminateWorkers = function() {
    if (typeof worker_wallet != 'undefined') {
        worker_wallet.terminate();
    }
    if (typeof worker_main != 'undefined') {
        worker_main.terminate();
    }
}


//////////////////////////////			INIT EXECUTION				////////////////////////////////

getCurrentThemeInfo();
createConnectWorkers();









