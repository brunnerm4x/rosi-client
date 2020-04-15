/*
 * ROSI - Backup Server communication
 * 
 *   
 *			NODEJS FUNCTIONS FOR DEVELOPMENT - DO NOT USE IN PLUGIN - request lib does not work with browserify!
 * */

const request = require('request');


var toserver = function(url, send_head, send_json, callback_finished)
{
	try
	{
		request.post(url, {json: false, headers: send_head, body: send_json}, (err, res, body) => {
			try
			{ 
				if (!err && res.statusCode === 200) {

					callback_finished(body, res.headers);		
				}else{
					console.log("digsend Request error.");
					console.log(err);
					console.log(res);
					
					callback_finished(false);
				}
			}catch(e)
			{
				callback_finished(false);		
			}
		});	
	}catch(e)
	{
		callback_finished(false);		
	}
}


module.exports = {
	'toserver'	: toserver
}

