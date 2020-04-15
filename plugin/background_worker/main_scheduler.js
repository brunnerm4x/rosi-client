/*
 * 
 *   	ROSI - Raltime Online Streaming with IOTA
 * 
 * 			PAYMENT / ONCHANNEL MAIN WORKER
 * 					TASK SCHEDULER
 * 
 * 
 * 		Updated: 26.03.2020
 * 
 * */
 

let task_processing = false;		// Flag that currently a task is being processed

let task_queue = [];				// { taskname, params:{} }
let currentTask = {};

let taskQueuePush = function(taskname, params)
{
	task_queue.push({taskname: taskname, params: params });
	taskQueueStartNext();
}

let taskQueueStartNext = function()
{
	if(!task_processing && task_queue.length > 0)
	{
		task_processing = true;
		currentTask = task_queue.shift();
		
		let t = currentTask;
		
		console.log("Starting task: ", t.taskname, "with params:", t.params);
		
		switch(t.taskname)
		{
			case "depositSuccess":
				depositSuccess(t.params.m);
				break;
				
			case "setChannelFunded":
				setChannelFunded(t.params.address);
				break;
							
			case "pay":
				pay(t.params.m);
				break;	

			case "resolveConflicts":
				resolveConflicts(t.params.m);
				break;	
			
			case "getDirectAddress":
				getDirectAddress(t.params.m);
				break;	
			
				
			default: 
				console.error("UNKNWON TASK " + t.taskname);
				break;
		}
	}
}

let currentTaskFinished = function()
{
	task_processing = false;
	setTimeout(taskQueueStartNext, 50);		// Give "instant" tasks a chance to execute
}


