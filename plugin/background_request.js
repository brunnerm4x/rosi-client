/*
 * 
 *   	ROSI - Raltime Online Streaming with IOTA
 * 
 * 					AJAX REQUEST HELPER
 * 
 * 
 * 		Updated: 26.03.2020
 * 
 * */


// xhr request to webserver with data as object, 
// callback({accepted: bool, data}), data is object, accepted is transmit no error

// CONSTANTS & GLOBAL VARIABLES 

const RETRY_MAX = 3;
var retry_cnt = 0;


////	REQUEST

var webservRequest = function(url, data, callback)
{
	if(retry_cnt > RETRY_MAX)
	{
		retry_cnt = 0;
		callback({accepted:false});
		return;
	}
	
	try
	{
		var xhr = new XMLHttpRequest();
		if(xhr) 
		{
			xhr.open('POST', url, true);
			xhr.setRequestHeader('Content-type', 'application/json');
			
			xhr.onreadystatechange =  function() {
				if (xhr.readyState == 4) 		// Request done
				{
					try
					{
						if(xhr.status == 200)
						{
							retry_cnt = 0;
							callback({accepted: true, data: JSON.parse(xhr.responseText)});			
						}else{
							console.error('webservRequest error 1 Status:'+xhr.statusText);
							
							// retry
							retry_cnt++;
							webservRequest(url, data, callback);
						}
					}catch(e)
					{
						console.error('webservRequest error 2' + e);	
						// retry
						retry_cnt++;
						webservRequest(url, data, callback);
					}	
				}
			};
			
			// Send request
			xhr.send(JSON.stringify(data));
		}
			
	}catch(e)
	{
		console.error('webservRequest error 3');		
		// retry
		retry_cnt++;
		webservRequest(url, data, callback);
	}
}
