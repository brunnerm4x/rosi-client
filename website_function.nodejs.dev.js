/*
 * IOTA PAY - Payment client website communication part
 * 
 * 
 * 	flashchannel - transport and status functions
 *   
 *		NODEJS FUNCTIONS FOR DEVELOPMENT - DO NOT USE IN PLUGIN - request lib does not work with browserify!
 * */

const request = require('request');


var topayserver = function(url_payserv, send_json, callback_finished)
{
	try
	{
		request.post(url_payserv, {json: true, body: send_json}, (err, res, body) => {
			try
			{ 
			
				if (!err && res.statusCode === 200) {

					callback_finished(body);			
				}else{
					console.log("digsend Request error.");
					console.log(err);
					console.log(res);
					
					callback_finished({accepted:false, error:'topayserver communication error. No1'+err});
				}
			}catch(e)
			{
				callback_finished({accepted:false, error:'topayserver communication error. No02'+e});		
			}
		});	
	}catch(e)
	{
		callback_finished({accepted:false, error:'topayserver communication error. No3'+e});		
	}
}


module.exports = {
	'topayserver'	: topayserver
}

