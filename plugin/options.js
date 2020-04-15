/*
 * 
 *   	ROSI - Raltime Online Streaming with IOTA
 * 
 * 				 PREFERENCES PAGE SCRIPT
 * 
 * 
 * 		Updated: 26.03.2020
 * 
 * */
 


/*  Tab switching */
function openTab(event, tabName) 
{
  let i, tabcontent, tablinks;

  // Get all elements with class="tabcontent" and hide them
  tabcontent = document.getElementsByClassName("tabcontent");
  for (i = 0; i < tabcontent.length; i++) {
    tabcontent[i].style.display = "none";
  }

  // Get all elements with class="tablinks" and remove the class "active"
  tablinks = document.getElementsByClassName("tablinks");
  for (i = 0; i < tablinks.length; i++) {
    tablinks[i].className = tablinks[i].className.replace(" active", "");
  }

  // Show the current tab, and add an "active" class to the button that opened the tab
  document.getElementById(tabName).style.display = "block";
  event.currentTarget.className += " active";
} 

tablinks = document.getElementsByClassName("tablinks");
for (i = 0; i < tablinks.length; i++) 
{
	let tabId = tablinks[i].id;
	let tabName = tabId.slice(3);
	document.getElementById(tabId).onclick = function(e){ openTab(e, tabName); };
}


/* Loading settings from backend */
function loadCurrentSettings()
{	
	getCurrentSettingsFromDatabase((err)=>{
		
		if(err)
		{
			alert('Error occurred loading settings from database.');
			return;
		}
		
		let gSettings = currentSettings.general;
		let cSettings = currentSettings.channel;
		let wSettings = currentSettings.wallet;
		let bSettings = currentSettings.backup;
		let fSettings = currentSettings.frontend;
		
		// Set visible elements...
		// Tab general
		document.getElementById('max_ppm').value = gSettings.max_ppm;
		document.getElementById('ppm_avg_t').value = gSettings.ppm_avg_t;
		document.getElementById('prepay_t').value = gSettings.prepay_t;
		
		// Tab Channel
		document.getElementById('ask_new_prov').checked = cSettings.ask_new_prov;
		document.getElementById('ask_new_channel').checked = cSettings.ask_new_channel;
		document.getElementById('use_sugg_coll').checked = cSettings.use_sugg_coll;
		document.getElementById('warn_sugg_coll').checked = cSettings.warn_sugg_coll;
		document.getElementById('factor_sg_first').value = cSettings.factor_sg_first;
		document.getElementById('first_ch_coll').value = cSettings.first_ch_coll;
		document.getElementById('later_ch_coll').value = cSettings.later_ch_coll;
		document.getElementById('new_ch_threshold').value = cSettings.new_ch_threshold;
		document.getElementById('channel_min_tx').value = cSettings.channel_min_tx;
		
		// Tab Wallet
		document.getElementById('security').value = wSettings.security;
		document.getElementById('std_depth').value = wSettings.std_depth;
		document.getElementById('promote_depth').value = wSettings.promote_depth;
		document.getElementById('reattach_depth').value = wSettings.reattach_depth;
		document.getElementById('minweightmag').value = wSettings.minweightmag;
		document.getElementById('std_msg').value = wSettings.std_msg;
		document.getElementById('std_tag').value = wSettings.std_tag;
		document.getElementById('task_timeout_ms').value = wSettings.task_timeout_ms;
		document.getElementById('task_scheduler_rate').value = wSettings.task_scheduler_rate;
		document.getElementById('wallet_name').value = wSettings.wallet_name;
		document.getElementById('ec_max').value = wSettings.ec_max;
		document.getElementById('cyclic_update_rate').value = wSettings.cyclic_update_rate;
		document.getElementById('nodelist').value = wSettings.nodelist.join('\n');
		
		// Tab Backup
		document.getElementById('backup_server').value = bSettings.server;
		document.getElementById('backup_user').value = bSettings.user;
		document.getElementById('backup_password').value = bSettings.password;
		document.getElementById('backup_closed_channels').checked = bSettings.backup_closed_channels;
		document.getElementById('auto_backup').checked = bSettings.auto_backup;
		
		// Tab Frontend
		document.getElementById('design').value = fSettings.design;
	});
};


function saveGSettings()
{
	getCurrentSettingsFromDatabase((err)=>{
		
		let gSettings = currentSettings.general;
		
		gSettings.max_ppm = Number(document.getElementById('max_ppm').value);
		gSettings.ppm_avg_t = Number(document.getElementById('ppm_avg_t').value);
		gSettings.prepay_t = Number(document.getElementById('prepay_t').value);
		
		browser.extension.getBackgroundPage().updateSettings(currentSettings);
	});
}

function saveCSettings()
{
	getCurrentSettingsFromDatabase((err)=>{
			
		let cSettings = currentSettings.channel;

		cSettings.ask_new_prov = document.getElementById('ask_new_prov').checked;
		cSettings.ask_new_channel = document.getElementById('ask_new_channel').checked;
		cSettings.use_sugg_coll = document.getElementById('use_sugg_coll').checked;
		cSettings.warn_sugg_coll = document.getElementById('warn_sugg_coll').checked;
		cSettings.factor_sg_first = Number(document.getElementById('factor_sg_first').value);
		cSettings.first_ch_coll = Number(document.getElementById('first_ch_coll').value);
		cSettings.later_ch_coll = Number(document.getElementById('later_ch_coll').value);
		cSettings.new_ch_threshold = Number(document.getElementById('new_ch_threshold').value);
		cSettings.channel_min_tx = Number(document.getElementById('channel_min_tx').value);

		browser.extension.getBackgroundPage().updateSettings(currentSettings);
	});
}

function saveWSettings()
{
	getCurrentSettingsFromDatabase((err)=>{
			
		let wSettings = currentSettings.wallet;
		
		wSettings.security = Number(document.getElementById('security').value);
		wSettings.std_depth = Number(document.getElementById('std_depth').value);
		wSettings.promote_depth = Number(document.getElementById('promote_depth').value);
		wSettings.reattach_depth = Number(document.getElementById('reattach_depth').value);
		wSettings.minweightmag = Number(document.getElementById('minweightmag').value);
		wSettings.std_msg = document.getElementById('std_msg').value;
		wSettings.std_tag = document.getElementById('std_tag').value;
		wSettings.task_timeout_ms = Number(document.getElementById('task_timeout_ms').value);
		wSettings.task_scheduler_rate = Number(document.getElementById('task_scheduler_rate').value);
		wSettings.wallet_name = document.getElementById('wallet_name').value;
		wSettings.ec_max = Number(document.getElementById('ec_max').value);
		wSettings.cyclic_update_rate = Number(document.getElementById('cyclic_update_rate').value);
		wSettings.nodelist = document.getElementById('nodelist').value.split("\n").filter(url => url.length > 0);
		
		browser.extension.getBackgroundPage().updateSettings(currentSettings);
	});
}

function saveBSettings()
{
	getCurrentSettingsFromDatabase((err)=>{
				
		let bSettings = currentSettings.backup;
		
		bSettings.server = document.getElementById('backup_server').value;
		bSettings.user = document.getElementById('backup_user').value;
		bSettings.password = document.getElementById('backup_password').value;
		bSettings.backup_closed_channels = document.getElementById('backup_closed_channels').checked;
		bSettings.auto_backup = document.getElementById('auto_backup').checked;
		
		browser.extension.getBackgroundPage().updateSettings(currentSettings);
	});
}

function saveFSettings()
{
	getCurrentSettingsFromDatabase((err)=>{
			
		let fSettings = currentSettings.frontend;
		
		fSettings.design = Number(document.getElementById('design').value);
		
		browser.extension.getBackgroundPage().updateSettings(currentSettings);	
	});
}

function restoreGSettings()
{
	getCurrentSettingsFromDatabase((err)=>{
		currentSettings.general = JSON.parse(JSON.stringify(defSettings.general));
		browser.extension.getBackgroundPage().updateSettings(currentSettings);
		setTimeout(loadCurrentSettings, 50);
	});
}

function restoreCSettings()
{
	getCurrentSettingsFromDatabase((err)=>{
		currentSettings.channel = JSON.parse(JSON.stringify(defSettings.channel));
		browser.extension.getBackgroundPage().updateSettings(currentSettings);	
		setTimeout(loadCurrentSettings, 50);
	});
}

function restoreWSettings()
{
	getCurrentSettingsFromDatabase((err)=>{
		currentSettings.wallet = JSON.parse(JSON.stringify(defSettings.wallet));
		browser.extension.getBackgroundPage().updateSettings(currentSettings);	
		setTimeout(loadCurrentSettings, 50);
	});
}

function restoreBSettings()
{
	getCurrentSettingsFromDatabase((err)=>{
		currentSettings.backup = JSON.parse(JSON.stringify(defSettings.backup));
		browser.extension.getBackgroundPage().updateSettings(currentSettings);	
		setTimeout(loadCurrentSettings, 50);
	});
}

function restoreFSettings()
{
	getCurrentSettingsFromDatabase((err)=>{
		currentSettings.frontend = JSON.parse(JSON.stringify(defSettings.frontend));
		browser.extension.getBackgroundPage().updateSettings(currentSettings);	
		setTimeout(loadCurrentSettings, 50);
	});
}


// Channel manager
function init_channelmanager(forceReload = false)
{	
	document.getElementById("open_channel_list").innerHTML = "Loading...";
	document.getElementById("mc_sel_channelid").innerText = '[No channel selected]';
	document.getElementById("mc_sel_provider").innerText = '';
	document.getElementById("mc_sel_collateral").innerText = '';
	document.getElementById("mc_sel_available_coll").innerText = '';
	document.getElementById("mc_sel_available_unconf").innerText = '';
	document.getElementById("mc_sel_funding_tx").innerText = '';
	
	browser.extension.getBackgroundPage().getActiveChannelList(forceReload).then((channels) => {
		document.getElementById("open_channel_list").innerHTML = "";
		for(i = 0; i < channels.queue.length; i++)
		{
			let chElement = document.createElement("div");
			chElement.className += " channellistitem";
			chElement.innerText = "[New] Provider: " + channels.queue[i].provider + " (No ID created yet)";
			chElement.onclick = (e) => { cm_handle_marking(e, channels.queue[i]); };
			document.getElementById("open_channel_list").appendChild(chElement);
		}
		for(i = 0; i < channels.active.length; i++)
		{
			let channel = channels.active[i];
			let chElement = document.createElement("div");
			chElement.className += " channellistitem";
			chElement.innerText = "[Active] Provider: " + channel.provider + " ID: " + 
			 ((typeof channel.depositAddress == "undefined") ? "NOT SET" : (channel.depositAddress.slice(0,15) + "..."));
			chElement.onclick = (e) => { cm_handle_marking(e, channel); };
			document.getElementById("open_channel_list").appendChild(chElement);
		}
	});
	
	tabcontent = document.getElementsByClassName("channellistitem");
	for (i = 0; i < tabcontent.length; i++) {
		tabcontent[i].onclick = cm_handle_marking;
	}
}

function cm_handle_marking(e, channeldata)
{
	tablinks = document.getElementsByClassName("channellistitem");
	for (i = 0; i < tablinks.length; i++) {
		tablinks[i].className = tablinks[i].className.replace(" channellistitem_marked", "");
	}
	
	e.currentTarget.className += " channellistitem_marked";
	
	document.getElementById("mc_sel_channelid").innerText = 
		(typeof channeldata.depositAddress !== 'undefined') ? channeldata.depositAddress : 'No ID set';
	document.getElementById("mc_sel_provider").innerText = channeldata.provider;
	document.getElementById("mc_sel_collateral").innerText = channeldata.channelCollateral + ' iota';
	document.getElementById("mc_sel_available_coll").innerText = channeldata.availableBalance + ' iota';
	document.getElementById("mc_sel_available_unconf").innerText = channeldata.availableUnconfirmed + ' iota';
	document.getElementById("mc_sel_funding_tx").innerText = channeldata.depositTransaction ? channeldata.depositTransaction : 'Not funded yet.';
	
	
	document.getElementById("channel_close").onclick = (e) => {
		if(channeldata.depositAddress == 'undefined')
		{
			alert("No channel id yet, cannot close.");
		}
		else
		{
			browser.extension.getBackgroundPage().worker_main.postMessage({
				request: 'close_channel',
				channelId: channeldata.depositAddress
			});
		}
	};
	
	document.getElementById("channel_retry_funding").onclick = (e) => {
		if(channeldata.depositAddress == 'undefined')
		{
			alert("No channel id yet, cannot retry funding on unknown address.");
		}
		else
		{
			alert("This command is requesting to get funding on ALL channels. You do NOT need " +
					"to call this on every channel!");
			
			browser.extension.getBackgroundPage().worker_main.postMessage({
				request: 'check_confirmation_status',
				channelId: channeldata.depositAddress
			});
		}
	};
	
	document.getElementById("channel_resolve_conflict").onclick = (e) => {
		if(channeldata.depositAddress == 'undefined')
		{
			alert("No channel id yet, cannot resolve conflicts when channel creation not finished.");
		}
		else
		{
			alert("Trying to resolve conflicts ... this may take some time ... ");
			
			browser.extension.getBackgroundPage().worker_main.postMessage({
				request: 'resolve_conflicts',
				channelId: channeldata.depositAddress
			});
		}		
	};	
}


// Wallet manager
function init_walletmanager(forceReload = false)
{	
	document.getElementById("wallet_reinit_complete").onclick = (e) => {

		if(confirm("This will try to read every transaction of this wallet from the tangle. " + 
								"This can take some time! Do you really want to reinit wallet?"))
		{
			browser.extension.getBackgroundPage().worker_wallet.postMessage({
				request: 'reinit_inputs_complete'
			});	
		}
	};	
	document.getElementById("wallet_reinit_balance").onclick = (e) => {

		if(confirm("This will calculate the current wallet balance from the inputs saved in the " + 
					"Wallet. This may not be the exact amount of iotas available because of " + 
					"Currently pending transactions. Do you want to reinit the balance?"))
		{
			browser.extension.getBackgroundPage().worker_wallet.postMessage({
				request: 'reinit_balance_from_inputs'
			});	
		}
	};	
}


// Connect buttons

document.getElementById('save_settings_general').onclick = saveGSettings;
document.getElementById('save_settings_channel').onclick = saveCSettings;
document.getElementById('save_settings_wallet').onclick = saveWSettings;
document.getElementById('save_settings_backup').onclick = saveBSettings;
document.getElementById('save_settings_frontend').onclick = saveFSettings;

document.getElementById('restore_settings_general').onclick = restoreGSettings;
document.getElementById('restore_settings_channel').onclick = restoreCSettings;
document.getElementById('restore_settings_wallet').onclick = restoreWSettings;
document.getElementById('restore_settings_backup').onclick = restoreBSettings;
document.getElementById('restore_settings_frontend').onclick = restoreFSettings;

document.getElementById('cm_refresh_list').onclick = (e) => { init_channelmanager(true); };

// Open first tab
loadCurrentSettings();
document.getElementsByClassName("tablinks")[0].click();

// Initialize Channel manger page
init_channelmanager();
init_walletmanager();
