const config = require('./config.js');
const BSVName = require('./nbdomain_core.js');
const sqlDB = require('./sqldb.js');
const CMD = require('./cmd.js');
const Util = require('./util.js')
const cron = require('node-cron');
const plan = require('planariette');
const bitBus = require('run-bitbus');
const fs = require('fs');
//const AsyncLock = require('async-lock');
//var lock = new AsyncLock({maxPending: 5000});

const defaultConfig = config[config.env];

const TOKEN = "eyJhbGciOiJFUzI1NksiLCJ0eXAiOiJKV1QifQ.eyJzdWIiOiIxQzc5M0RkVjI0Q3NORTJFUDZNbVZmckhqVlNGVmc2dU4iLCJpc3N1ZXIiOiJnZW5lcmljLWJpdGF1dGgifQ.SUJlYUc2TGNGdFlZaGk3amxwa3ZoRGZJUEpFcGhObWhpdVNqNXVBbkxORTdLMWRkaGNESC81SWJmM2J1N0V5SzFuakpKTWFPNXBTcVJlb0ZHRm5uSi9VPQ";
const DB_SEQ_LOCK = 'DB_SEQUENCE_LOCK';


async function processTX(tx, type) {
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

			sql.appendLog([only]);
			console.log(`Save confirmed ${only.hash}.`);
			if (bFinish) {
				console.log("in bFinish");
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
		console.log("Get unconfirmed tx.", tx.tx.h)
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
	};

}

function loadHeight() {
	try {
		let protocols = Util.getAllRegProtocols();
		protocols.forEach(function (protocol) {
			let sql = new sqlDB.SQLDB(protocol);
			let tx = sql.getLastLog();
			let newHeight = 0;
			if (tx != null) {
				newHeight = tx['blockId'];
			}
			if (!lastHeight||lastHeight < newHeight) {
				lastHeight = newHeight
			}
		});
	} catch (e) {
		console.log(e);
	}
}

let lastHeight = 0;
let bFinish = false;

const fetcher = new BSVName.NidFetcher();
let tx_c = [];
let tx_u = [];


let allProtocols = Util.getAllRegProtocols();
loadHeight(); 
let nbQuery = {
	"v": 3,
	"from":lastHeight,
	"q": {
		"find": {
			"out.s2": { "$in": allProtocols }
		},
		"sort": { "blk.i": 1, "i": 1 }
	}
};
plan.start(TOKEN, nbQuery, processTX, () => {
	console.log("AllFinish");
	bitBus.getStatus().then(res => {
		lastHeight = res.height - 1; //save current height but 1 less, in case miss a block
	});
	bFinish = true;
}, false);

//update confirmed tx
let exit_counter = 1;
cron.schedule('*/1 * * * *', async () => {
	if (!bFinish) return;
	//console.log("updating confirmed tx");
	const res = await bitBus.getStatus();
	//console.log(res);
	if (lastHeight < res.height && lastHeight != 0) {
		//console.log("found new block, height=", res.height);
		nbQuery.q.find['blk.i'] = { "$gt": lastHeight };
		//console.log(nbQuery);
		lastHeight = res.height;
		await bitBus.run(TOKEN, nbQuery, async tx => {
			console.log("got new confirmed tx", tx);
			await processTX(tx, 'c');
		}, null);
		
	}
	lastHeight = res.height;
	if(defaultConfig.exit_count&& (exit_counter++>defaultConfig.exit_count) ){ //exit process every hour, so the PM2 could restart it.
		process.exit(-2);
	}

});

//updating Failed BitFS link
cron.schedule('*/3 * * * *', () => {
	let protocols = Util.getAllRegProtocols();
	protocols.forEach(function (protocol) {
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

//Update NID 
let fetchingTx = {};
cron.schedule('*/1 * * * *', () => {
	let protocols = Util.getAllRegProtocols();
	protocols.forEach(function (protocol) {
		if (!protocol in fetchingTx) {
			fetchingTx[protocol] = false;
		}
		if (!fetchingTx[protocol]) {
			fetchingTx[protocol] = true;
			const nidSyncer = new BSVName.NidSynchronizer(null, protocol);
			nidSyncer.updateNidFiles(function (data) {
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
