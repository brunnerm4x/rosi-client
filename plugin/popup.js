/*
 *
 *  ROSI Settings popup main script
 *
 *
 * */


// HELPERS
// Download file
var download = function(filename, text) 
{
    var element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
    element.setAttribute('download', filename);

    element.style.display = 'none';
    document.body.appendChild(element);

    element.click();

    document.body.removeChild(element);
}

getCurrentSettingsFromDatabase((err) => {
    if (currentSettings.backup.setup_valid !== true) 
    {
        document.getElementById('backupsetting').classList.add("backupsettingVisible");
        document.getElementById('backupsetting').classList.remove("backupsettingInvisible");
        document.getElementById('backupsetting').classList.remove("backupsettingInvisibleNA");
    }
});


// SETTINGS
document.getElementById('save_settings').onclick = function(event) 
{
    event.preventDefault();
    setSettings();
};

document.getElementById('restore_settings').onclick = function(event) 
{
    event.preventDefault();
    restoreDefaultSettings();
};

document.getElementById('save_backup_settings').onclick = function(event) 
{
    event.preventDefault();
    testBackupSettings();
};

// Backup create
document.getElementById('create_online_backup').onclick = function(event) 
{
    event.preventDefault();
    getCurrentSettingsFromDatabase((err) => {
        if (currentSettings.backup.setup_valid != true) 
        {
            if (confirm("RosiConserver backup is not set up yet, would you like to set it up now?")) {
                document.getElementById('backupsetting').classList.remove("backupsettingInvisible");
                document.getElementById('backupsetting').classList.remove("backupsettingInvisibleNA");
                document.getElementById('backupsetting').classList.add("backupsettingVisible");
                document.getElementById('settings').classList.add('settingsUnRotate');
                document.getElementById('settings').classList.remove('settingsRotate');
                document.getElementById('settingspage').classList.add('settingsPageUnShow');
                document.getElementById('settingspage').classList.remove('settingsPageShow');
                document.getElementById('backupContent').classList.remove("swipeLeft");
                document.getElementById('backupContent').classList.add("swipeRight");
            }
        } else {
            document.getElementById('create_online_backup').disabled = true;
            document.getElementById('backupIcon').style.display = "none";
            document.getElementById('backupLoading').style.display = "block";
            let oldText = document.getElementById('backupTextInner').innerText;
            document.getElementById('backupTextInner').innerText = "saving...";
            browser.extension.getBackgroundPage().createBackup().then(() => {
                alert("Successfully created backup.");
                document.getElementById('backupLoading').style.display = "none";
                document.getElementById('backupIcon').style.display = "block";
                document.getElementById('backupTextInner').innerText = oldText;
                document.getElementById('create_online_backup').disabled = false;
                loadBackupRestoreInfo();
            }).catch((e) => {
                alert("Error occurred while creating Backup:" + e);
                document.getElementById('backupLoading').style.display = "none";
                document.getElementById('backupIcon').style.display = "block";
                document.getElementById('create_online_backup').disabled = false;
                document.getElementById('backupTextInner').innerText = oldText;
                loadBackupRestoreInfo();
            });
        }
    });
};


// Set settings parameters on visible elements to saved values
function loadCurrentSettings() 
{
    getCurrentSettingsFromDatabase((err) => 
    {

        if (err) 
        {
            alert('Error occurred loading settings from database.');
            return;
        }

        // Set visible elements...
        document.getElementById('ask_new_prov').checked = currentSettings.channel.ask_new_prov;
        currentSettings.channel.ask_new_prov ? 
			document.getElementById('ask_new_prov').parentElement.classList.add("is-checked") : 
				document.getElementById('ask_new_prov').parentElement.classList.remove("is-checked");
        document.getElementById('ask_new_channel').checked = currentSettings.channel.ask_new_channel;
        currentSettings.channel.ask_new_channel ? 
			document.getElementById('ask_new_channel').parentElement.classList.add("is-checked") : 
				document.getElementById('ask_new_channel').parentElement.classList.remove("is-checked");
        document.getElementById('use_suggested_collateral').checked = currentSettings.channel.use_sugg_coll;
        currentSettings.channel.use_sugg_coll ? 
			document.getElementById('use_suggested_collateral').parentElement.classList.add("is-checked") : 
				document.getElementById('use_suggested_collateral').parentElement.classList.remove("is-checked");
        document.getElementById('warn_suggested_collateral').checked = currentSettings.channel.warn_sugg_coll;
        currentSettings.channel.warn_sugg_coll ? 
			document.getElementById('warn_suggested_collateral').parentElement.classList.add("is-checked") : 
				document.getElementById('warn_suggested_collateral').parentElement.classList.remove("is-checked");
				
        document.getElementById('max_ppm').value = printIota(currentSettings.general.max_ppm, true);
        document.getElementById('first_channel_bal').value = printIota(currentSettings.channel.first_ch_coll, true);
        document.getElementById('later_channel_bal').value = printIota(currentSettings.channel.later_ch_coll, true);
        document.getElementById('create_new_channel_threshold').value = (currentSettings.channel.new_ch_threshold > 1) ?
				printIota(currentSettings.channel.new_ch_threshold, true) : String(currentSettings.channel.new_ch_threshold);
        document.getElementById('channel_min_tx').value = currentSettings.channel.channel_min_tx;
        document.getElementById('factor_sugg_coll_fist').value = currentSettings.channel.factor_sg_first;

        var providerList = browser.extension.getBackgroundPage().currentSettings.wallet.nodelist;
        if (typeof providerList == 'undefined' || providerList.length == 0) 
        {
            document.getElementById('provider_list').value = 'LOADING...';
            return;
        }
        document.getElementById('provider_list').value = providerList.join('\n');

        // Backup settings
        document.getElementById('backup_sw_auto').checked = currentSettings.backup.auto_backup;
        currentSettings.backup.auto_backup ? document.getElementById('backup_sw_auto').parentElement.classList.add("is-checked") : document.getElementById('backup_sw_auto').parentElement.classList.remove("is-checked");
        document.getElementById('backup_server_url').value = currentSettings.backup.server;
        document.getElementById('backup_usr_id').value = currentSettings.backup.user;
        document.getElementById('backup_pw').value = currentSettings.backup.password;
        document.getElementById('backup_closed_channels').checked = currentSettings.backup.backup_closed_channels;
        currentSettings.backup.backup_closed_channels ? document.getElementById('backup_closed_channels').parentElement.classList.add("is-checked") : document.getElementById('backup_closed_channels').parentElement.classList.remove("is-checked");

        if (currentSettings.backup_setup === true) 
        {
            loadBackupRestoreInfo();
        }
    });
};

function restoreDefaultSettings() 
{
    if (confirm('This will also delete backup login data and settings!')) {
        currentSettings = JSON.parse(JSON.stringify(defSettings)); // copy default settings
        safeSettingsToDatabase(currentSettings, (err) => {
            if (err) {
                alert('Error occurred setting settings in database.');
                return;
            }

            loadCurrentSettings();
        });
    }
};


// Request if username is available on conserver server -> if everything OK, setSettings() is called
function testBackupSettings() 
{
    let url = document.getElementById('backup_server_url').value;
    let usrId = document.getElementById('backup_usr_id').value;
    let pw = document.getElementById('backup_pw').value;

    browser.extension.getBackgroundPage().testBackupSetup(url, usrId, pw).then((user_type) => {

        alert("Settings OK. [" + user_type + "]");
        currentSettings.backup.setup_valid = true;
        setSettings();

        if (user_type == "KNOWN_USER" && confirm("Do you now want to restore a backup?")) {
            loadBackupRestoreInfo();
            document.getElementById('backupContent').classList.remove("swipeRight");
            document.getElementById('backupContent').classList.add("swipeLeft");
        } else {
            document.getElementById('backupsetting').classList.remove("backupsettingVisible");
            document.getElementById('backupsetting').classList.add("backupsettingInvisible");
        }
    }).catch((e) => {

        alert("Invalid Settings detected: " + e);
    });
}


function setSettings() 
{
    console.log('Saving new Settings...');

    // Get settings from visual elements...
    currentSettings.channel.ask_new_prov = document.getElementById('ask_new_prov').checked;
    currentSettings.channel.ask_new_channel = document.getElementById('ask_new_channel').checked;
    currentSettings.channel.use_sugg_coll = document.getElementById('use_suggested_collateral').checked;
    currentSettings.channel.warn_sugg_coll = document.getElementById('warn_suggested_collateral').checked;
    
    currentSettings.general.max_ppm = scanIota(document.getElementById('max_ppm').value);
    currentSettings.channel.first_ch_coll = scanIota(document.getElementById('first_channel_bal').value);
    currentSettings.channel.later_ch_coll = scanIota(document.getElementById('later_channel_bal').value);
    let cnctval = document.getElementById('create_new_channel_threshold').value;
    currentSettings.channel.new_ch_threshold = (isNaN(Number(cnctval)) || Number(cnctval) > 1) ? scanIota(cnctval) : Number(cnctval); 
    currentSettings.channel.channel_min_tx = parseInt(document.getElementById('channel_min_tx').value);
    currentSettings.channel.factor_sg_first = Number(document.getElementById('factor_sugg_coll_fist').value);

    var backgroundpage = browser.extension.getBackgroundPage();
    currentSettings.wallet.nodelist = document.getElementById('provider_list').value.split("\n").filter(url => url.length > 0);

    // Backup settings
    currentSettings.backup.auto_backup = document.getElementById('backup_sw_auto').checked;
    currentSettings.backup.backup_closed_channels = document.getElementById('backup_closed_channels').checked;
    currentSettings.backup.server = document.getElementById('backup_server_url').value;
    currentSettings.backup.user = document.getElementById('backup_usr_id').value;
    currentSettings.backup.password = document.getElementById('backup_pw').value;

    safeSettingsToDatabase(currentSettings, (err) => {
        if (err) {
            alert('Error occurred setting settings in database.');
            return;
        }
        console.log('Saved current settings.');
    });
};


// STATUS
function loadStatus() 
{
    var rosiStatus = browser.extension.getBackgroundPage().rosiStatus;
    document.getElementById('wallet_bal').innerText = rosiStatus.walletBalance < 0 ? 'loading' : printIota(rosiStatus.walletBalance);
    document.getElementById('pending_bal').innerText = rosiStatus.pendingBal < 0 ? 'loading' : printIota(rosiStatus.pendingBal);
    document.getElementById('open_channel_cnt').innerText = rosiStatus.openChannelCnt < 0 ? 'loading' : rosiStatus.openChannelCnt;
    document.getElementById('channel_bal').innerText = rosiStatus.openChannelBal < 0 ? 'loading' : printIota(rosiStatus.openChannelBal);
    document.getElementById('channel_bal_unconf').innerText = rosiStatus.openChannelBalUnconf < 0 ? 'loading' : printIota(rosiStatus.openChannelBalUnconf);
    document.getElementById('balance').innerHTML = (rosiStatus.walletBalance + rosiStatus.openChannelBal) < 0 ? '<div id="backupLoading" class="mdl-spinner mdl-spinner--single-color mdl-js-spinner is-active loadingStatus"></div>' : printIota(Number(rosiStatus.walletBalance) + Number(rosiStatus.openChannelBal));
    document.getElementById('balanceBar1').style.width = (rosiStatus.walletBalance + rosiStatus.openChannelBal) > 0 ? "" + (90 / (rosiStatus.walletBalance + rosiStatus.openChannelBal) * (rosiStatus.walletBalance)) + "vw" : "90vw";
    
    let currentStream = browser.extension.getBackgroundPage().currentStream;
    document.getElementById('curr_ppm').innerText = currentStream === false ? 'No stream.' : (printIota(currentStream.ppm)+ '/min');
   
    if (rosiStatus.walletBalance >= 0 &&
        (document.getElementById('provider_list').value == 'LOADING...' || document.getElementById('settings').style.display == "none")) {
        document.getElementById('provider_list').value = rosiStatus.providerList.join('\n');
    }
    if (typeof currentSettings.backup != 'undefined' && currentSettings.backup.setup_valid) {
        loadBackupRestoreInfo();
    }
};


function loadBackupRestoreInfo() {
    browser.extension.getBackgroundPage().loadBackupList().then((list) => {
        let formatlist = "";
        document.getElementById('backups').innerHTML = "";
        list.forEach((item) => {
            let aline = item.split(":");
            let date = new Date(Number(aline[1]) * 1000);
            let formatItem = ("00" + date.getDate()).slice(-2) + "." +
                ("00" + (date.getMonth() + 1)).slice(-2) + "." +
                date.getFullYear() + " - " +
                ("00" + date.getHours()).slice(-2) + ":" +
                ("00" + date.getMinutes()).slice(-2) + ":" +
                ("00" + date.getSeconds()).slice(-2);
            formatlist += formatItem + "\r\n";
            let button = document.createElement("button");
            button.innerHTML = formatItem;
            button.classList.add('mdl-button', 'mdl-js-button', 'mdl-button--raised', 'mdl-js-ripple-effect', 'mdl-button--colored', 'wfull', 'mb1');
            button.id = 'backup_restore' + aline[0];
            document.getElementById('backups').appendChild(button);
            button.addEventListener("click", function() 
            {
                let backupNo = aline[0];
                document.getElementById('backup_restore' + backupNo).disabled = true;
                let oldButtonText = document.getElementById('backup_restore' + backupNo).innerText;
                document.getElementById('backup_restore' + backupNo).innerText = "Restoring ...";
                let backgroundpage = browser.extension.getBackgroundPage();
                backgroundpage.restoreBackup(backupNo).then(() => {
                    alert("Successfully restored backup.");
                    backgroundpage.setRosiStatusLoading();
                    loadStatus();
                    loadCurrentSettings();

                    document.getElementById('backupsetting').classList.remove("backupsettingVisible");
                    document.getElementById('backupsetting').classList.add("backupsettingInvisible");
                    document.getElementById('backupContent').classList.remove("swipeLeft");
                    document.getElementById('backupContent').classList.add("swipeRight");
                    document.getElementById('backup_restore' + backupNo).innerText = oldButtonText;
                    document.getElementById('backup_restore' + backupNo).disabled = false;
                }).catch((e) => {
                    alert("Error occurred while restoring:" + e);
                    document.getElementById('backup_restore' + backupNo).innerText = oldButtonText;
                    document.getElementById('backup_restore' + backupNo).disabled = false;
                });
            });
        });
        
        // Update value on status page...
        document.getElementById('last_backup').innerText = formatlist.split("\r\n")[0];
    }).catch(e => {
        alert("Error getting backup list: " + e);
    });
}


// WALLET

function showAddress() 
{
    var backgroundpage = browser.extension.getBackgroundPage();
    if (backgroundpage.inputAddress === false) {
        // Error occurred
        document.getElementById('addressText').innerText = 'Error occurred creating Address. Try again later.';
        return;
    } else if (backgroundpage.inputAddress.length != 90) {
        // Wait for wallet ...
        setTimeout(showAddress, 1000);
        return;
    }

    document.getElementById('qrcode').innerHTML = "";

    // Address available -> show
    var qrwidth = document.getElementById('qrcode').offsetWidth;
    var qrcode = new QRCode("qrcode", {
        text: backgroundpage.inputAddress,
        width: qrwidth,
        height: qrwidth,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
    });

    document.getElementById('addressText').innerText = backgroundpage.inputAddress;
    document.getElementById('addressText').classList.add("copyable");
    document.getElementById('addressText').onclick = function(event) {
        document.execCommand('copy');
    };
}

document.getElementById('generate_input_address').onclick = function(event) {
    event.preventDefault();
    document.getElementById('addressText').innerText = 'Creating new Address...';

    var backgroundpage = browser.extension.getBackgroundPage();
    backgroundpage.inputAddress = "";
    document.getElementById('qrcode').innerHTML = "";

    // Request creation of new address
    backgroundpage.worker_wallet.postMessage({
        request: 'get_input_address'
    });
    setTimeout(showAddress, 1000);
};

document.getElementById('show_input_address').onclick = function(event) {
    event.preventDefault();
    document.getElementById('addressText').innerText = 'Requesting Address...';
    document.getElementById('qrcode').innerHTML = "";

    var backgroundpage = browser.extension.getBackgroundPage();

    if (backgroundpage.inputAddress !== false && backgroundpage.inputAddress.length == 90) // Address already available
    {
        showAddress();
        return;
    }

    // Request creation of new address
    backgroundpage.worker_wallet.postMessage({
        request: 'get_input_address'
    });
    setTimeout(showAddress, 1000);
};

// WALLET WITHDRAW

document.getElementById('btn_withdraw_now').onclick = function(event) {
    var amount = scanIota(document.getElementById('withdraw_amount').value);
    var address = document.getElementById('withdraw_address').value;

    if (confirm('Do you really want to send ' + amount + ' iota to ' + address)) {
        var backgroundpage = browser.extension.getBackgroundPage();
        backgroundpage.worker_wallet.postMessage({
            request: 'fund_withdraw',
            reqId: 0,		// Set to something when using promises
            amount: amount,
            address: address
        });

        alert('Request has been transmitted to wallet worker thread.\nPayment will be sent as soon as the wallet can handle the request.');
        document.getElementById('withdrawpage').classList.remove('withdrawPageShow');
        document.getElementById('withdrawpage').classList.add('withdrawPageUnShow');
        document.getElementById('withdrawBack').classList.remove('withdrawBackShow');
        document.getElementById('withdrawBack').classList.add('withdrawBackUnShow');

    }
};


// WALLET Backup/Restore
document.getElementById('dl_wallet_backup').onclick = function(event) {
    if (confirm('Please store file securly!\nThis DOES NOT CONTAIN flash-channel data!\nPlease CLOSE ALL CHANNELS BEFORE DELETING the extension!')) {
        var backgroundpage = browser.extension.getBackgroundPage();
        backgroundpage.worker_wallet.postMessage({
            request: 'get_wallet_backup'
        });
        setTimeout(checkDownloadWallet, 250);
    }
};

document.getElementById('restore_wallet').onclick = function(event) {
    if (confirm('Before continuing, make sure current \nBALANCE IS ZERO or you have a BACKUP of your\ncurrent active wallet!')) {
        var backgroundpage = browser.extension.getBackgroundPage();
        backgroundpage.restoreUploadWallet();
    }
};

var checkDownloadWallet = function() {
    var backgroundpage = browser.extension.getBackgroundPage();

    if (backgroundpage.dlWallet !== false) {
        download("rosi_wallet.json", backgroundpage.dlWallet);
        backgroundpage.dlWallet = false;
        return;
    } else {
        // Wait for wallet a bit longer
        setTimeout(checkDownloadWallet, 250);
        return;
    }
}

// Preferences Page link
document.getElementById("openPreferences").onclick = function(event) 
{
	if(confirm("ATTENTION! Wrong settings can crash the Application and/or lead to lost funds!"))
	{
		browser.runtime.openOptionsPage();	
	}
}

// ---------------- INIT ------------
// Startup load current values
loadCurrentSettings();
loadStatus();
var backgroundpage = browser.extension.getBackgroundPage();
backgroundpage.worker_main.postMessage({
    request: 'get_channels_status'
});
backgroundpage.worker_wallet.postMessage({
    request: 'get_wallet_status'
});

setInterval(loadStatus, 1000);
