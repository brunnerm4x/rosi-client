/*
 * 
 *   	ROSI - Raltime Online Streaming with IOTA
 * 
 * 				CHANNEL LISTS HELPERS
 * 
 * 
 * 		Updated: 26.03.2020
 * 
 * */


var newChannelQueue = [];

// {provider: "", depositAddress: "", availableBalance, availableUnconfirmed, channelCollateral}
var activeChannelList = [];		

// {provider: "", depositAddress: "", availableBalance, availableUnconfirmed, channelCollateral}
var closedChannelList = [];		

// Save current newChannelQueue variable to disk
var saveChannelQueue = function(nq)
{
	newChannelQueue = nq;
	rosi_main.fs.writeFile("NEWCHANNEL_QUEUE", JSON.stringify(newChannelQueue), (err) => {
		// finished
		if(err){
			console.log(err);
		}
	});
}

var restoreChannelQueue = function()
{
	rosi_main.fs.readFile("NEWCHANNEL_QUEUE", (err, data)=>{
		if(err){
			// console.log(err);
		}else{
			newChannelQueue.push.apply(JSON.parse(data));
			if(typeof newChannelQueue !== 'object')
			{
				console.error("Stored New Channel list is corrupt. Channels cannot be restored.");
				newChannelQueue = [];
			}
		}
	});
}

var saveActiveChannelList = function(aq)
{
	activeChannelList = aq;
	rosi_main.fs.writeFile("ACTIVECHANNEL_QUEUE", JSON.stringify(activeChannelList), (err) => {
		// finished
		if(err){
			console.log(err);
		}
	});
}

var restoreActiveChannelList = function()
{
	rosi_main.fs.readFile("ACTIVECHANNEL_QUEUE", (err, data)=>{
		if(err){
			// console.log(err);
		}else{
			activeChannelList = JSON.parse(data);
			if(typeof activeChannelList !== 'object')
			{
				console.error("Stored Active Channel list is corrupt. Channels cannot be restored.");
				activeChannelList = [];
			}
		}
	});	
}

// optional callback(error)
var saveClosedChannelList = function(cq, callback)
{
	closedChannelList = cq;
	rosi_main.fs.writeFile("CLOSEDCHANNEL_QUEUE", JSON.stringify(closedChannelList), (err) => {
		// finished
		if(err){
			console.log(err);
		}
		if(typeof callback == 'function')
		{
			callback(err);
		}
	});
}

// optional callback(error)
var restoreClosedChannelList = function(callback)
{
	rosi_main.fs.readFile("CLOSEDCHANNEL_QUEUE", (err, data)=>{
		if(err){
			// console.log(err);
		}else{
			closedChannelList = JSON.parse(data);
			if(typeof closedChannelList !== 'object')
			{
				console.error("Stored Closed Channel list is corrupt. Channels cannot be restored.");
				closedChannelList = [];
			}
		}
		
		if(typeof callback == 'function')
		{
			callback(err);
		}
	});	
}
