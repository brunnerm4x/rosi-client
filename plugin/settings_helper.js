/*
 * 
 *   	ROSI - Raltime Online Streaming with IOTA
 * 
 * 				SETTINGS HELPER FUNCTIONS
 * 
 * 
 * 		Updated: 26.03.2020
 * 
 * */
 

const DB_FILENAME = 'rosi_global_settings';
const DB_RETRY_MAX = 2;



/////////////////////////////   DEFAULT SETTINGS OBJECT STRUCTURE    ///////////////////////////////

const defSettings = {

    general: {
        max_ppm: 30,	 // Maximum allowed price per minute of stream (without manual confirmation)
		ppm_avg_t: 210,		// timespan in seconds to calculate average
		prepay_t: 60		// timespan in seconds to allow prepayment of stream (single payment before stream is started)
    },

    channel: {
        ask_new_prov: true, // Ask user before initializing channel with unknown provider
        ask_new_channel: false, // Ask user before initializing any channel (also with known provider)
        use_sugg_coll: true, // Use suggested collateral from payment receiver server instead of own settings
        warn_sugg_coll: true, // If using suggested collateral, ask if amount is higher than client collateral setting
        factor_sg_first: 0.5, // Factor for suggested collateral in first channel with new provider
        first_ch_coll: 100, // First channel (with unknown provider) balance / collateral
        later_ch_coll: 200, // Channel with known provider balance / collateral
        new_ch_threshold: 0.3, // Create new channel with provider when channel balance is below new_ch_threshold * channel-collateral, or,
								// if new_ch_threshold > 1 when channel balance is below new_ch_threshold
        channel_min_tx: 200, // Make sure to create channel with at least the depth to allow this amount of transactions
    },

    wallet: {
        security: 2, // IOTA transaction security level (default for trinity: 2), do not change at this time
        std_depth: 3, // Transaction tip selection depth for default transactions
        promote_depth: 4, // Tx depth for promote transactions
        reattach_depth: 4, // Tx depth for reattachment transactions
        minweightmag: 14, // Minimum weight magnitude for transactions (difficulty of PoW)
        std_msg: "REALTIME9ONLINE9STREAMING9WITH9IOTA", // Message sent with value transactions
        std_tag: "ROSI99999ROSI99999ROSI99999", // Tag sent with value transactions
        task_timeout_ms: 180000, // Amount of time after which task return cannot be expected
        task_scheduler_rate: 500, // Interval in ms when task scheduler is called
        wallet_name: 'ROSI_WALLET', // Name of wallet as file or db entry
        ec_max: 4, // Every request is repeated EC_MAX times before aborting (0 -> after first error)
        cyclic_update_rate: 30000, // Time in ms between two reattach & updates
        address_buffer_size: 4,		// Amount of addresses which should be pre-buffered for faster usage
        nodelist: [ // Nodes to connect wallet to
				"https://nodes.iota.cafe:443",
				"https://node1.rosipay.net:443",
				"https://hanspetzersnode.org:14267",
				"https://iotanode.us:14267",
				"https://ultranode.iotatoken.nl:443",
        ]
    },

    backup: {
        server: 'http://conserver.rosipay.net:12000', // Backup server to connect to
        user: 'localuser', // username for backup server
        password: 'localuser', // password for backup server
        backup_closed_channels: true, // also backup already closed channels
        auto_backup: false, // automatically create backup after specific events (not implemented)
        setup_valid: false // above settings are valid (set to true after completing setup)
    },

    frontend: {
        design: 0
    }
};




///////////////////////////			GET SETTINGS FROM DB			////////////////////////////////

var currentSettings = {};

// callback(error)
let dbRetryCnt = 0;

function getCurrentSettingsFromDatabase(callback) 
{
    if (dbRetryCnt > DB_RETRY_MAX) {
        dbRetryCnt = 0;
        alert("Error getting current settings from database!");
        callback('CANNOT_OPEN_DB');
        return;
    }

    readFile(DB_FILENAME, (err, data) => {
        if (err && err.code != 'ENOENT') {
            // retry after a few ms
            dbRetryCnt++;
            setTimeout(window.setTimeout(() => {
                getCurrentSettingsFromDatabase(callback);
            }, 50));
            return;
        } else if (err.code == 'ENOENT') {
            safeSettingsToDatabase(defSettings);
            currentSettings = JSON.parse(JSON.stringify(defSettings)); // copy default settings
            callback(false);
            return;
        }

        currentSettings = JSON.parse(data);
        callback(false);
        return;
    });
};



///////////////////////////			SAVE SETTINGS TO DB				////////////////////////////////

// callback(error)
let dbSetRetryCnt = 0;

function safeSettingsToDatabase(settings, callback) 
{
    if (dbSetRetryCnt > DB_RETRY_MAX) {
        dbSetRetryCnt = 0;
        console.err("Error setting settings in database!");
        callback('CANNOT_WRITE_DB');
        return;
    }

    writeFile(DB_FILENAME, JSON.stringify(settings), (err) => {
        if (err) {
            // retry after a few ms
            dbSetRetryCnt++;
            setTimeout(window.setTimeout(() => {
                safeSettingsToDatabase(settings, callback);
            }, 50));
        }
        if (typeof callback == 'function') {
            callback(false);
        }
    });
}



