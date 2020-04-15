var showSettings = false;
var showWallet = false;

document.getElementById('settings').onclick = function(event) {
    if (!showSettings) {
        document.getElementById('settings').classList.add('settingsRotate');
        document.getElementById('settings').classList.remove('settingsUnRotate');
        document.getElementById('settingspage').classList.add('settingsPageShow');
        document.getElementById('settingspage').classList.remove('settingsPageUnShow');

        showSettings = true;
    } else {
        document.getElementById('settings').classList.add('settingsUnRotate');
        document.getElementById('settings').classList.remove('settingsRotate');
        document.getElementById('settingspage').classList.add('settingsPageUnShow');
        document.getElementById('settingspage').classList.remove('settingsPageShow');
        showSettings = false;
    }
}

document.getElementById("sw_wallet").onmouseover = function() {
    document.getElementById('sw_wallet').classList.add('walletButtonHover');
    document.getElementById('sw_wallet').classList.remove('walletButtonUnHover');
}
document.getElementById("sw_wallet").onmouseout = function() {
    document.getElementById('sw_wallet').classList.add('walletButtonUnHover');
    document.getElementById('sw_wallet').classList.remove('walletButtonHover');

}

document.getElementById('sw_wallet').onclick = function(event) {
    if (!showWallet) {
        document.getElementById('walletpage').classList.add('walletPageShow');
        document.getElementById('walletpage').classList.remove('walletPageUnShow');
        document.getElementById('walletButtonIcon').classList.add('close');
        document.getElementById('walletButtonIcon').classList.remove('qr');
        document.getElementById('walletButtonIcon').classList.add('qrtoclose');
        document.getElementById('walletButtonIcon').classList.remove('closetoqr');
        document.getElementById('walletButtonIcon').classList.remove('qr');
        document.getElementById('walletButtonText').textContent = "Close";
        showWallet = true;
    } else {
        document.getElementById('walletpage').classList.add('walletPageUnShow');
        document.getElementById('walletpage').classList.remove('walletPageShow');
        document.getElementById('walletButtonIcon').classList.add('qr');
        document.getElementById('walletButtonIcon').classList.remove('close');
        document.getElementById('walletButtonIcon').classList.remove('qrtoclose');
        document.getElementById('walletButtonIcon').classList.add('closetoqr');
        document.getElementById('walletButtonText').textContent = "Fund Wallet";
        showWallet = false;
    }
}

document.getElementById('close_backup_settings').onclick = function(event) {
    document.getElementById('backupsetting').classList.remove("backupsettingVisible");
    document.getElementById('backupsetting').classList.add("backupsettingInvisible");
    if (document.getElementById('backupContent').classList.contains("swipeLeft")) {
        document.getElementById('backupContent').classList.remove("swipeLeft");
        document.getElementById('backupContent').classList.add("swipeRight");
    }
}

document.getElementById('close_backup_restore').onclick = function(event) {
    document.getElementById('backupsetting').classList.remove("backupsettingVisible");
    document.getElementById('backupsetting').classList.add("backupsettingInvisible");
    document.getElementById('backupContent').classList.remove("swipeLeft");
    document.getElementById('backupContent').classList.add("swipeRight");
}


document.getElementById('sw_backup_settings').onclick = (e) => {
    document.getElementById('backupsetting').classList.remove("backupsettingInvisible");
    document.getElementById('backupsetting').classList.remove("backupsettingInvisibleNA");
    document.getElementById('backupsetting').classList.add("backupsettingVisible");
    document.getElementById('settings').classList.add('settingsUnRotate');
    document.getElementById('settings').classList.remove('settingsRotate');
    document.getElementById('settingspage').classList.add('settingsPageUnShow');
    document.getElementById('settingspage').classList.remove('settingsPageShow');
    document.getElementById('backupContent').classList.remove("swipeLeft");
    document.getElementById('backupContent').classList.add("swipeRight");

    showSettings = false;
};

document.getElementById('sw_backup_restore').onclick = (e) => {
    loadBackupRestoreInfo();
    document.getElementById('backupsetting').classList.remove("backupsettingInvisible");
    document.getElementById('backupsetting').classList.remove("backupsettingInvisibleNA");
    document.getElementById('backupsetting').classList.add("backupsettingVisible");
    document.getElementById('settings').classList.add('settingsUnRotate');
    document.getElementById('settings').classList.remove('settingsRotate');
    document.getElementById('settingspage').classList.add('settingsPageUnShow');
    document.getElementById('settingspage').classList.remove('settingsPageShow');

    document.getElementById('backupContent').classList.remove("swipeRight");
    document.getElementById('backupContent').classList.add("swipeLeft");
    showSettings = false;
};

document.getElementById("infoButton").onmouseover = function() {
    document.getElementById('statusInfo').classList.add('statusShow');
    document.getElementById('statusInfo').classList.remove('statusUnShow');
    document.getElementById('statusInfo').classList.remove('statusUnShowNA');
};
document.getElementById("infoButton").onmouseout = function() {
    document.getElementById('statusInfo').classList.add('statusUnShow');
    document.getElementById('statusInfo').classList.remove('statusShow');

};

document.getElementById("balanceBarMouseHandler").onmouseover = function() {
    document.getElementById('statusInfoBalance').classList.add('statusShow');
    document.getElementById('statusInfoBalance').classList.remove('statusUnShow');
    document.getElementById('statusInfoBalance').classList.remove('statusUnShowNA');
};
document.getElementById("balanceBarMouseHandler").onmouseout = function() {
    document.getElementById('statusInfoBalance').classList.add('statusUnShow');
    document.getElementById('statusInfoBalance').classList.remove('statusShow');

};

document.getElementById('sw_withdraw').onclick = (e) => {
    document.getElementById('withdrawpage').classList.add('withdrawPageShow');
    document.getElementById('withdrawpage').classList.remove('withdrawPageUnShow');
    document.getElementById('withdrawpage').classList.remove('withdrawPageUnShowNA');
    document.getElementById('withdrawBack').classList.add('withdrawBackShow');
    document.getElementById('withdrawBack').classList.remove('withdrawBackUnShow');
    document.getElementById('withdrawBack').classList.remove('withdrawBackUnShowNA');


};

document.getElementById('closewithdraw').onclick = (e) => {
    document.getElementById('withdrawpage').classList.remove('withdrawPageShow');
    document.getElementById('withdrawpage').classList.add('withdrawPageUnShow');
    document.getElementById('withdrawBack').classList.remove('withdrawBackShow');
    document.getElementById('withdrawBack').classList.add('withdrawBackUnShow');

};

document.getElementById('withdrawBack').onclick = (e) => {
    document.getElementById('withdrawpage').classList.remove('withdrawPageShow');
    document.getElementById('withdrawpage').classList.add('withdrawPageUnShow');
    document.getElementById('withdrawBack').classList.remove('withdrawBackShow');
    document.getElementById('withdrawBack').classList.add('withdrawBackUnShow');

};

document.getElementById("create_online_backup").onmouseover = function() {
    document.getElementById('create_online_backup').classList.add('backupButtonHover');
    document.getElementById('create_online_backup').classList.remove('backupButtonUnHover');
    document.getElementById('iconContainer').classList.remove('backupIconUnHover');
    document.getElementById('iconContainer').classList.add('backupIconHover');
    //document.getElementById('backupLoading').classList.remove('backupLoadingUnHover');
    //document.getElementById('backupLoading').classList.add('backupLoadingHover');
    document.getElementById('backupButtonText').classList.remove('backupTextUnHover');
    document.getElementById('backupButtonText').classList.add('backupTextHover');

};
document.getElementById("create_online_backup").onmouseout = function() {
    document.getElementById('create_online_backup').classList.add('backupButtonUnHover');
    document.getElementById('create_online_backup').classList.remove('backupButtonHover');
    document.getElementById('iconContainer').classList.add('backupIconUnHover');
    document.getElementById('iconContainer').classList.remove('backupIconHover');
    //document.getElementById('backupLoading').classList.add('backupLoadingUnHover');
    //document.getElementById('backupLoading').classList.remove('backupLoadingHover');
    document.getElementById('backupButtonText').classList.add('backupTextUnHover');
    document.getElementById('backupButtonText').classList.remove('backupTextHover');

};