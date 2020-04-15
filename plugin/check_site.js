/*
 * 
 *   	ROSI - Raltime Online Streaming with IOTA
 * 
 * 					CONTENT SCRIPT 
 * 			  to be loaded into website
 * 
 * 
 * 		Updated: 26.03.2020
 * 
 * */
 
 
////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////				EVENTHANDLER  GENERAL				////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////// 

// Site is closed, inform background
window.onbeforeunload = function () 
{
	browser.runtime.sendMessage({
		request: 'unloading'
	});
}



////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////				SCAN SITE FOR ROSI PAY LINKS		////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////


paylinks = document.getElementsByClassName("rosi_paylink");
for(let i = 0; i < paylinks.length; i++)
{
	if(typeof paylinks[i].dataset.rosiProvider == "string" && 
		typeof paylinks[i].dataset.rosiPayServer == "string")
	{
		// Set variables 
		let provider = paylinks[i].dataset.rosiProvider;
		let urlPayserv = paylinks[i].dataset.rosiPayServer;
		
		let defaultAmount = 0;
		if(typeof paylinks[i].dataset.rosiAmount != "undefined")
			defaultAmount = scanIota(paylinks[i].dataset.rosiAmount);
					
		let amountFixed = false;
		if(typeof paylinks[i].dataset.rosiFixedAmount != "undefined")
			amountFixed = paylinks[i].dataset.rosiFixedAmount == 'true' ? true : false;
			
		let suggestedCollateral = -1;
		if(typeof paylinks[i].dataset.rosiSuggestedCollateral != "undefined")
			suggestedCollateral = scanIota(paylinks[i].dataset.rosiSuggestedCollateral);
			
		let paymentId = "NOID";
		if(typeof paylinks[i].dataset.rosiPaymentId == "string")
			paymentId = paylinks[i].dataset.rosiPaymentId;
			
		let preInitProvider = false;
		if(typeof paylinks[i].dataset.rosiInitProvider != "undefined")
			preInitProvider = paylinks[i].dataset.rosiInitProvider == 'true' ? true : false;
		
		let alertFinished = true;
		if(typeof paylinks[i].dataset.rosiAlertFinished != "undefined")
			alertFinished = paylinks[i].dataset.rosiAlertFinished == 'true' ? true : false;
		
		let styleLink = true;
		if(typeof paylinks[i].dataset.rosiNostyle != "undefined")
			styleLink = paylinks[i].dataset.rosiNostyle == 'true' ? false : true;
		
		let onPaymentFinished = (retval) => 
		{ 
			console.log(retval); 
			
			if(alertFinished)
				alert("Payment Finished. Success: " + retval.accepted + 
					(retval.accepted ? ( ", Type: " + retval.txInfo.txType ) :
					( ", " + retval.error ))); 
					
			let event = new CustomEvent("paymentFinished", { detail: JSON.stringify(retval) });	
			paylinks[i].dispatchEvent(event);
		};
			
		if(styleLink)
		{
			// Style link ...
			paylinks[i].style.color = "#FF3B30";
			paylinks[i].style.textDecoration = "underline";
			paylinks[i].style.cursor = "pointer";
		}
		
		// Set handler
		paylinks[i].onclick = (e) => 
		{ 	
			e.preventDefault();
			
			// get coordinates
			let rect = paylinks[i].getBoundingClientRect();
			let posPopup = { top: rect.top + "px", left: rect.left + "px" };
			
			// create popup
			let popup = document.createElement('div');
			popup.innerHTML = "Pay to provider <b>" + provider + "</b>: <br> Amount: ";
			popup.providerId = "";
			let inputAmount = document.createElement('INPUT');
			inputAmount.type = "text";
			inputAmount.value = printIota(defaultAmount, true);
			inputAmount.disabled = amountFixed;
			let btnPay = document.createElement('INPUT');
			btnPay.type = "button";
			btnPay.value = "Pay Now";
			let btnCancel = document.createElement('INPUT');
			btnCancel.type = "button";
			btnCancel.value="Cancel";
			let btnContainer = document.createElement('DIV');
			
			btnContainer.appendChild(btnCancel);
			btnContainer.appendChild(btnPay);
			popup.appendChild(inputAmount);
			popup.appendChild(document.createElement('BR'));
			popup.appendChild(btnContainer);
			
			// Style popup
			popup.style.position = "fixed";
			popup.style.color = "#000000";
			popup.style.backgroundColor = "#CCCCCC";
			popup.style.left = posPopup.left;
			popup.style.top = posPopup.top;
			popup.style.padding = "0.5em";
			popup.style.lineHeight = "1.8em";
			inputAmount.style.width = "7em";
			inputAmount.style.float = "right";
			inputAmount.style.fontWeight = "bold";
			btnContainer.style.width = "100%";
			btnContainer.style.height = "2em";
			btnContainer.style.marginTop = "0.8em";
			btnCancel.style.fontWeight = "bold";
			btnCancel.style.float = "left";
			btnPay.style.float = "right";
			
			// init provider handler
			let initProvider = (callbackOK = () => {}) => 
			{
				// Init provider
				let message = {
					request: 'initialize_provider',
					provider: provider,
					url: e.detail.url,		
					suggestedCollateral: suggestedCollateral,
					options: { urlPayserv: urlPayserv }
				};
				
				let reqId = e.detail.reqId;
				
				browser.runtime.sendMessage(message).then(function(retval)
				{
					popup.providerId = retval.providerId;
					callbackOK();
					
				}).catch(function(error)
				{
					btnPay.disabled = false;
					btnPay.value = "Pay Now";
					btnCancel.disabled = false;
					console.error("Cannot continue Initialization of Provider: ", error.message);
					onPaymentFinished({accepted: false, error: String(error)});
				});
			};
			
			// Add handlers
			btnCancel.onclick = (e) => 
			{ 
				e.preventDefault();
				document.body.removeChild(popup); 
			};
			
			btnPay.onclick = (e) => 
			{
				e.preventDefault();
				
				if(scanIota(inputAmount.value) <= 0)
				{
					alert("Invalid Amount!");
					return;
				}
				
				btnPay.value = "Paying ...";
				btnPay.disabled = true;
				btnCancel.disabled = true;
				
				let requestPayment = () => 
				{			
					// request payment
					let message = {
						request: 'pay_single',
						providerId: popup.providerId,
						amount: scanIota(inputAmount.value),
						options: { paymentId : paymentId }
					};
					
					browser.runtime.sendMessage(message).then((response) =>
					{
						btnPay.disabled = false;
						btnPay.value = "Pay Now";
						btnCancel.disabled = false;						
						onPaymentFinished({accepted: true, txInfo: response });
						
						document.body.removeChild(popup); 
					}).catch((error) => 
					{
						btnPay.disabled = false;
						btnPay.value = "Pay Now";
						btnCancel.disabled = false;
						console.log('Error paying to provider ' + provider + ' :' + error);
						onPaymentFinished({accepted: false, error: String(error) });
					});
				};
				
				// check if provider is initialized
				if(popup.providerId == "")
				{
					initProvider(() => { requestPayment(); });
				}
				else
				{
					requestPayment();
				}
			};
			
			// Open popup
			document.body.appendChild(popup);
			
			// if wanted, init provider
			if(preInitProvider)
				initProvider();
		};
	}
	else
		console.warn("Found rosi_paylink element without necessary attributes.");
}

 
////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////				MESSAGES FROM BACKGROUND SCRIPT		////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////// 

browser.runtime.onMessage.addListener((message,sender) => 
{

	try{
		let request = message.request;

		if(request == 'question')
		{
			if(window.confirm(message.text))
			{
				let answer = message.answer;
				answer.accepted = true;
				browser.runtime.sendMessage(answer);
			}else{
				let answer = message.answer;
				answer.accepted = false;
				browser.runtime.sendMessage(answer);
			}
		}
		else if(request == 'alert')
		{
			window.alert(message.text);
		}
		else
		{
			console.log('Unknown request:', request);
		}
	}catch(e)
	{
		console.log("checksite message listener error:", JSON.stringify(e));
	}
});


 
////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////				MESSAGES TO WEBSITE					////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////// 


let messageToWebsite = function(eventName, data)
{
	try
	{	
		// Stringify because of firefox security settings (firefox deepClone would be alternative)
		let event = new CustomEvent(eventName, { detail: JSON.stringify(data) });	
		document.getElementById('rosi_communication_to_website').dispatchEvent(event);
	}
	catch(e)
	{
		console.log('Could not send Message to Website ' + eventName + ': ' + e);
		return;
	}
}

////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////				MESSAGES FROM WEBSITE				////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////// 

if(document.getElementById('rosi_communication_to_plugin') != null)
{
	
////////////////////////////////////  		 PING 		////////////////////////////////////////////
	
	document.getElementById('rosi_communication_to_plugin').addEventListener('ping', 
	function(e)
	{
		messageToWebsite('ping', {accepted: true, reqId: e.detail.reqId });
	});
	
	
////////////////////////////////////  		 INITIALIZE			////////////////////////////////////

																//// 	PROVIDER
	document.getElementById('rosi_communication_to_plugin').addEventListener('initialize_provider',
	function(e)
	{
		let message = {
			request: 'initialize_provider',
			provider: e.detail.provider,
			url: e.detail.url,		
			suggestedCollateral: e.detail.suggestedCollateral,
			options: e.detail.options
		};
		
		let reqId = e.detail.reqId;
		
		browser.runtime.sendMessage(message).then(function(retval)
		{
			messageToWebsite('initialize_provider', 
			{accepted: true, reqId: reqId, state: retval.result, providerId: retval.providerId });
			
		}).catch(function(error)
		{
			console.error(error.message);
			messageToWebsite('initialize_provider', 
				{accepted: false, reqId: reqId, error: error.message});
		});
	});
	
																//// 	STREAM
	document.getElementById('rosi_communication_to_plugin').addEventListener('initialize_stream', 
	function(e)
	{
		let message = {
			request: 'initialize_stream',
			providerId: e.detail.providerId,
			ppm: e.detail.ppm,
			options: e.detail.options
		};
		
		let reqId = e.detail.reqId;
		
		browser.runtime.sendMessage(message).then(function(retval)
		{
			messageToWebsite('initialize_stream', 
				{accepted: true, reqId: reqId, streamId: retval.streamId, state: retval.result });
			
		}).catch(function(error)
		{
			messageToWebsite('initialize_stream', 
				{accepted: false, reqId: reqId, error: error.message });
		});
	});
	

//////////////////////////////			START		 ///////////////////////////////////////////////	

																//// 	STREAM
	document.getElementById('rosi_communication_to_plugin').addEventListener('start_stream', 
	function(e)
	{
		let message = {
			request: 'start_stream',
			streamId: e.detail.streamId,
			options: e.detail.options
		};
		
		let reqId = e.detail.reqId;
		
		browser.runtime.sendMessage(message).then(function(retval)
		{
			messageToWebsite('start_stream', 
				{accepted: true, reqId: reqId, state: retval.result });
			
		}).catch(function(error)
		{
			messageToWebsite('start_stream',
				{accepted: false, reqId: reqId, error: error.message });
		});
	});


//////////////////////////////			STOP		 ///////////////////////////////////////////////

	document.getElementById('rosi_communication_to_plugin').addEventListener('stop_stream', 
	function(e)
	{
		let message = {
			request: 'stop_stream',
			streamId: e.detail.streamId,
			options: e.detail.options
		};
		
		let reqId = e.detail.reqId;
		
		browser.runtime.sendMessage(message).then(function(retval)
		{
			messageToWebsite('stop_stream', {accepted: true, reqId: reqId, state: retval.result });
			
		}).catch(function(error)
		{
			messageToWebsite('stop_stream', {accepted: false, reqId: reqId, error: error.message });
		});
	});
	
																//// CLOSE
	document.getElementById('rosi_communication_to_plugin').addEventListener('close_stream', 
	function(e)
	{

		let message = {
			request: 'close_stream',
			streamId: e.detail.streamId,
			options: e.detail.options
		};
		
		let reqId = e.detail.reqId;
		
		browser.runtime.sendMessage(message).then(function(retval)
		{
			messageToWebsite('close_stream', {accepted: true, reqId: reqId, state: retval.result });
			
		}).catch(function(error)
		{
			messageToWebsite('close_stream', {accepted: false, reqId: reqId, error: error.message });
		});
	});

//////////////////////////////			PAYMENTS		 ///////////////////////////////////////////

																//// 	STREAM
	document.getElementById('rosi_communication_to_plugin').addEventListener('pay_stream', 
	function(e)
	{
		let message = {
			request: 'pay_stream',
			streamId: e.detail.streamId,
			amount: e.detail.amount,
			options: e.detail.options
		};
		
		let reqId = e.detail.reqId;
		
		browser.runtime.sendMessage(message).then(function(response)
		{
			messageToWebsite('pay_stream', {accepted: true, reqId: reqId, channelInfo: response });
			
		}).catch(function(error)
		{
			console.log('Error paying for stream:' + error);
			messageToWebsite('pay_stream', {accepted: false, reqId: reqId, error: "" + error });
		});
	});

																//// 	SINGLE PAYMENT
	document.getElementById('rosi_communication_to_plugin').addEventListener('pay_single', 
	function(e)
	{
		let message = {
			request: 'pay_single',
			providerId: e.detail.providerId,
			amount: e.detail.amount,
			options: e.detail.options
		};
		
		let reqId = e.detail.reqId;
		
		browser.runtime.sendMessage(message).then(function(response)
		{
			messageToWebsite('pay_single', {accepted: true, reqId: reqId, txInfo: response });
			
		}).catch(function(error)
		{
			console.log('Error paying to provider:' + error);
			messageToWebsite('pay_single', {accepted: false, reqId: reqId, error: "" + error});
		});
	});
	
	
//////////////////////////////			STATUS 			 ///////////////////////////////////////////	

																//// 	CHANNELS 
	document.getElementById('rosi_communication_to_plugin').addEventListener('get_provider_channels', 
	function(e)
	{
		let message = {
			request: 'get_provider_channels',
			providerId: e.detail.providerId,
			options: e.detail.options
		};
		
		let reqId = e.detail.reqId;
		
		browser.runtime.sendMessage(message).then(function(response)
		{
			messageToWebsite('get_provider_channels',
				{accepted: true, reqId: reqId, channelIds: response });
			
		}).catch(function(error)
		{
			console.log('Error getting provider channels:' + error);
			messageToWebsite('get_provider_channels', 
				{accepted: false, reqId: reqId, error: "" + error });
		});
	});

																//// STATUS
	document.getElementById('rosi_communication_to_plugin').addEventListener('status', 
	function(e)
	{
		let message = {
			request: 'status',
			streamId: e.detail.streamId,
			providerId: e.detail.providerId,
			options: e.detail.options
		};
		
		let reqId = e.detail.reqId;
		
		browser.runtime.sendMessage(message).then(function(response)
		{
			messageToWebsite('status', {accepted: true, reqId: reqId, status: response });
			
		}).catch(function(error)
		{
			console.log('Error getting status:' + error);
			messageToWebsite('status', {accepted: false, reqId: reqId, error: "" + error });
		});
	});
}



