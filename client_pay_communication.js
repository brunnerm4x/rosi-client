/*
 * IOTA PAY - Payment client website communication part
 * 
 * 
 * 	flashchannel - transport and status functions
 *
 * */

const RETRY_MAX = 3;

var retry_cnt = 0;
var topayserver = function(url_payserv, send_json, callback_finished)
{
	if(retry_cnt > RETRY_MAX)
	{
		retry_cnt = 0;
		callback_finished({accepted:false, commerr:true, error:'topayserver communication error.'});
		return;
	}
	
	try
	{
		var xhr = new XMLHttpRequest();
		if(xhr) {
			xhr.open('POST', url_payserv, true);
			xhr.setRequestHeader('Content-type', 'application/json');
			
			xhr.onreadystatechange =  function() {
				if (xhr.readyState == 4) 		// Request done
				{
					try
					{
						if(xhr.status == 200)
						{
							let retObj;
							
							try
							{
								retObj = JSON.parse(xhr.responseText);
							}catch(e)
							{
								retry_cnt = RETRY_MAX + 1;		// Dont retry if data sent is corrupted
								topayserver(url_payserv, send_json, callback_finished);	
								return;
							}
							
							callback_finished(retObj);
							return;	
						}else{
							console.error('topayserver communication error. No1 Status:'+xhr.statusText);
							
							// retry
							retry_cnt++;
							topayserver(url_payserv, send_json, callback_finished);
						}
					}catch(e)
					{
						console.error('topayserver communication error. No02'+e);	
						// retry
						retry_cnt++;
						topayserver(url_payserv, send_json, callback_finished);	
					}	
				}
			};
			
			// Send request
			xhr.send(JSON.stringify(send_json));
		}
			
	}catch(e)
	{
		console.error('topayserver communication error. No3');		
		// retry
		retry_cnt++;
		topayserver(url_payserv, send_json, callback_finished);
	}
}


module.exports = {
	'topayserver'	: topayserver
}

