/*
 * ROSI - Backup Server communication
 *
 * */


const RETRY_MAX = 3;

let retry_cnt = 0;
let toserver = function(url, head, data, callback_finished)
{
	console.log('[CONSERVER] Sending Data to URL:' + url);
	
	if(retry_cnt > RETRY_MAX)
	{
		retry_cnt = 0;
		if(typeof callback_finished === 'function'){	
			callback_finished(false);
		}
		return;
	}
	
	try
	{
		let xhr = new XMLHttpRequest();
		if(xhr) {
			xhr.open('POST', url, true);
			xhr.setRequestHeader('Content-type', 'text/text');
			
			for(let property in head) 
			{
				if(head.hasOwnProperty(property))
				{
					xhr.setRequestHeader(property, head[property]);
				}
			}
			
			xhr.onreadystatechange =  function() {
				if (xhr.readyState == 4) 		// Request done
				{
					try
					{
						
						if(xhr.status == 200)
						{
							retry_cnt = 0;
							if(typeof callback_finished === 'function'){	
								callback_finished(xhr.responseText, parseHeaders(xhr.getAllResponseHeaders()));	
							}		
						}else{
							console.log('toserver communication error. No1 Status:'+xhr.status);
							
							// retry
							retry_cnt++;
							toserver(url, head, data, callback_finished);
						}
					}catch(e)
					{
						console.log('toserver communication error. No02'+e);	
						// retry
						retry_cnt++;
						toserver(url, head, data, callback_finished);	
					}	
				}
			};
			
			// Send request
			xhr.send(data);
		}
			
	}catch(e)
	{
		console.log('toserver communication error. No3');		
		// retry
		retry_cnt++;
		toserver(url, head, data, callback_finished);
	}
}

var parseHeaders = function(rawHeaders)
{
	let headerArray = rawHeaders.split("\r\n");
	let parsedHeaders = {};
	headerArray.forEach((header) => {
		let hsplit = header.split(":");
		let name = hsplit.shift().toLowerCase();		// For compatibility with new xhr specs
		let value = hsplit.join("");
		
		parsedHeaders[name] = value;
	});
	
	return parsedHeaders;
}


module.exports = {
	'toserver'	: toserver
}

