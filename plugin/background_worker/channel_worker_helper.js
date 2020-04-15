/*
 * 
 *   	ROSI - Raltime Online Streaming with IOTA
 * 
 * 					BACKGROUND WORKER
 * 	HELPER FUNCTION FOR CREATING CHANNEL CREATE - CLOSE WORKERS
 * 
 * 
 * 		Updated: 26.03.2020
 * 
 * */


let externalWorkers = [];	// all active external workers handles


let createChannelWorker = function(task, params)
{
	return new Promise((resolve, reject) => {
		
		// Create worker
		externalWorkers.push(new Worker("channel_worker.js"));
		
		// Messages from worker
		externalWorkers[externalWorkers.length - 1].onmessage = (e) => 
		{
			let m = e.data;
			let request = m.request;
			
			switch(request)
			{
				case "finished":
					resolve(m.data);
					break;
					
				case "error":
					reject(m.error);
					break;
				
				default:
					console.warn("Received unknown request from worker: " + request);
					break;
			}
		};
		
		// Give work to the worker
		externalWorkers[externalWorkers.length - 1].postMessage({
            request: task,
            params: params
        });
	});
}
