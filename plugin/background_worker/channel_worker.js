/*
 * 
 *   	ROSI - Raltime Online Streaming with IOTA
 * 
 * 					BACKGROUND WORKER
 * 			 	  CHANNEL CREATE - CLOSE
 * 
 * 
 * 		Updated: 26.03.2020
 * 
 * */

importScripts('./rosi_main.browser.js');		// Import rosi main library

	
////////////////////////////////  		 CREATE CHANNEL			////////////////////////////////////

let createChannel = function(m)
{
	try
	{
		let params = m.params;
		let newChannelData = params.newChannelData;
		let settlementAddress = params.settlementAddress;
		
		rosi_main.createChannel(   newChannelData.url_payserv, 
								   newChannelData.minTxCnt, 
								   newChannelData.collateral, 
								   settlementAddress, 
								   function(flash)
		{		
			if(flash != false)
			{
				let data = {
					depositAddress: flash.depositAddress,
					balance: flash.balance
				};
				
				postMessage({	request: 'finished', 
								data : data
							});
			}
			else
			{
				postMessage({	request: 'error', 
								error: "Error requesting createChannel from rosi_main."
							});
			}		
			
			// kill the worker
			close();	
		});
	}catch(e)
	{
		postMessage({	request: 'error', 
						error: e
					});
					
		// kill the worker
		close();
	}
};

	
////////////////////////////////  		 CLOSE CHANNEL			////////////////////////////////////

let closeChannel = function(m)
{
	let params = m.params;
	let channelId = params.channelId;
	let balance = params.balance;
	
	try
	{
		rosi_main.closeChannel(channelId, balance, function(signedBundles) 
		{
			
			let data = {
				signedBundles: signedBundles
			};
			
			postMessage({	request: 'finished', 
							data : data
						});
						
			// kill the worker
			close();
		});
	}
	catch(e)
	{
		postMessage({	request: 'error', 
						error: e
					});
		// kill the worker
		close();
	};
};



////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////    		MESSAGE HANDLER				////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////

onmessage = function(e) 
{
	
	var m = e.data;
	var request = m.request;
	
	switch(request)
	{
		case "createChannel":
			createChannel(m);
			break;
			
		case "closeChannel":
			closeChannel(m);
			break;
			
		default:
			console.error("CHANNEL WORKER GOT UNKOWN REQUEST: " + request);
			break;
	}	
}


