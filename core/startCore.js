const config = require('./config.js');
const BSVName = require('./nbdomain_core.js');
const sqlDB = require('./sqldb.js');
const CMD = require('./cmd.js');
const Util = require('./util.js')
const cron = require('node-cron');
const AsyncLock = require('async-lock');
var lock = new AsyncLock({maxPending: 5000});

const defaultConfig = config[config.env];

const TOKEN = "eyJhbGciOiJFUzI1NksiLCJ0eXAiOiJKV1QifQ.eyJzdWIiOiIxQzc5M0RkVjI0Q3NORTJFUDZNbVZmckhqVlNGVmc2dU4iLCJpc3N1ZXIiOiJnZW5lcmljLWJpdGF1dGgifQ.SUJlYUc2TGNGdFlZaGk3amxwa3ZoRGZJUEpFcGhObWhpdVNqNXVBbkxORTdLMWRkaGNESC81SWJmM2J1N0V5SzFuakpKTWFPNXBTcVJlb0ZHRm5uSi9VPQ";
const DB_SEQ_LOCK = 'DB_SEQUENCE_LOCK';	

(async () => {
	const bitSync = require('./bitSync');
	const bit = new bitSync;
	const fetcher = new BSVName.NidFetcher();
	let tx_c = [];
	let tx_u = [];
	var bFinish = false;
	bit.on("initGetFinish", () => {
		console.log("AllFinish");
		bFinish = true;
	});

	bit.on("NewBlock", (status) => {
		console.log("------NewBlock--------");
		console.log(status);
	})

	let allProtocols = Util.getAllRegProtocols();
	let nbQuery = {
		"v": 3,
		"q": {
			"find": {
				"out.s2": { "$in" : allProtocols }
			},
			"sort": { "blk.i": 1, "i": 1 }
		}
	};

	await bit.run(TOKEN, nbQuery, async (tx, type) => {
		lock.acquire(DB_SEQ_LOCK, async function () {
			if (tx.tx.h == "8cc9473ca3287a2c3cfca422a671a8f06b1abe125755654b5a28d295ef550cba") {
				console.log('debug');
			}
			if (type == "c") {
				let newTx = {
					txHash: tx.tx.h,
					publicKey: tx.in[0].h1,
					block: tx.blk.i,
					ts: tx.blk.t,
					out: tx.out,
					address: tx.in[0].e.a,
					in: tx.in
				}
				let rtxList = await fetcher.convertToRTXPromise([newTx]);
				// fetcher.convertToRTX([newTx], function(rtxList) {
				if (rtxList.length > 0) {
					let only = rtxList[0];
					tx_c.push(only);

					let sql = new sqlDB.SQLDB(only.output.protocol);
					if (only.output.protocol == "17mJU9XaV7KbY3n8Up4LHFQHh5x82eEThL") {
						console.log('--------------------17mJU9XaV7KbY3n8Up4LHFQHh5x82eEThL');
					}
					sql.appendLog([only]);
					console.log(`Save confirmed ${only.hash}.`);
					if (bFinish) {
						let i = tx_u.findIndex(tx1 => tx1.hash === rtxList[0].hash);
						if (i != -1) {
							console.log(`Found in unconfirmed tx,delete ${only.hash}`);
							tx_u.splice(i, 1);
							sql.deleteUnconfirmedLog(rtxList[0].hash);
						}
					}
				}
				// });
			}
			if (type === "u" || type === "r") {
				let newTx = {
					txHash: tx.tx.h,
					publicKey: tx.in[0].h1,
					// block: tx.blk.i, unconfirmed tx has no block id.
					out: tx.out,
					address: tx.in[0].e.a,
					in: tx.in
				}
				console.log("Get unconfirmed tx." + tx.tx.h)
				try {
					let rtxList = await fetcher.convertToRTXPromise([newTx]);
					// fetcher.convertToRTX([newTx], function(rtxList) {
					if (rtxList.length > 0) {
						let only = rtxList[0];
						tx_u.push(only);

						let sql = new sqlDB.SQLDB(only.output.protocol);
						sql.appendUnconfirmedLog([only]);
						console.log(`Save unconfirmed ${only.hash}.`);
					}

					// });
				} catch (e) {
					console.log("Error", e.stack);
					console.log("Error", e.name);
					console.log("Error", e.message);
				}
			}}).catch(function (err) {	
				console.log(err.message) // output: error	
			});
	}, true);
})();

cron.schedule('*/3 * * * *', () => {
	console.log("updating Failed BitFS link");
	let protocols = Util.getAllRegProtocols();
	protocols.forEach( function(protocol) {
		let sql = new sqlDB.SQLDB(protocol);

		let retryList = sql.queryFailedBitFSLog();
		if (retryList != null && retryList.length != 0) {
			// Try Key/User command and update tx db;
			const fetcher = new BSVName.NidFetcher();
			retryList.forEach(async (rtx, _) => {
				let newTx = {
					txHash: rtx.hash,
					publicKey: rtx.publicKey,
					block: rtx.blockId,
					out: JSON.parse(rtx.out),
					address: rtx.inputAddress,
					in: JSON.parse(rtx.in)
				}
				console.log(`Found tx to update: ${newTx.txHash}`);
				let rtxList = await fetcher.convertToRTXPromise([newTx]);
				// fetcher.convertToRTX([newTx], function(rtxList) {
				if (rtxList.length > 0) {
					let only = rtxList[0];
					if (Object.keys(only.output.value).length > 0) {
						console.log(`Updating tx hash ${newTx.txHash}`);
						sql.updateLog([only]);
						// TODO(xd): check logic.
						const nidSyncer = new BSVName.NidSynchronizer(null, protocol);
						nidSyncer.updateNidFiles(function (data) {
							console.log(data);
						});
					}
				} else {
					// This is an invalid tx, remove from DB.
					sql.deleteLog(newTx.txHash);
				}
				// });
			});
		}
	});
	
});

let fetchingTx = {};

cron.schedule('*/1 * * * *', () => {
    console.log("updating NID nidSyncer");
    let protocols = Util.getAllRegProtocols();
	protocols.forEach( function(protocol) {
        if (!protocol in fetchingTx) {
            fetchingTx[protocol] = false;
        }
        if (!fetchingTx[protocol]) {
            fetchingTx[protocol] = true;
            const nidSyncer = new BSVName.NidSynchronizer(null, protocol);
            nidSyncer.updateNidFiles(function(data) {
                fetchingTx[protocol] = false;
                // if (data.code == 0) {
                //     log(`<<<Complete fetching NidObj: Successfully updated ${Object.keys(data.obj).length} nid object!`);
                // } else {
                //     log(`<<<Complete fetching NidObj: ${data.message}`);
                // }
            });
        }
    });
});
