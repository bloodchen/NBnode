const config = require('./config.js');
const BSVName = require('./nbdomain_core.js');
const sqlDB = require('./sqldb.js');
const CMD = require('./cmd.js');
const Util = require('./util.js')
const cron = require('node-cron');
const plan = require('planariette');
const bitBus = require('run-bitbus');
const fs = require('fs');
const ipc = require('node-ipc');
const { isContext } = require('vm');
const TXO = require('./txo.js');
//const AsyncLock = require('async-lock');
//var lock = new AsyncLock({maxPending: 5000});

const defaultConfig = config[config.env];

const TOKEN = "eyJhbGciOiJFUzI1NksiLCJ0eXAiOiJKV1QifQ.eyJzdWIiOiIxQzc5M0RkVjI0Q3NORTJFUDZNbVZmckhqVlNGVmc2dU4iLCJpc3N1ZXIiOiJnZW5lcmljLWJpdGF1dGgifQ.SUJlYUc2TGNGdFlZaGk3amxwa3ZoRGZJUEpFcGhObWhpdVNqNXVBbkxORTdLMWRkaGNESC81SWJmM2J1N0V5SzFuakpKTWFPNXBTcVJlb0ZHRm5uSi9VPQ";
const DB_SEQ_LOCK = 'DB_SEQUENCE_LOCK';

async function sendRawTX(rawtx){
	let ret = {
		code:1,message:"error"
	}
	if(!rawtx)return ret;
	try{
		console.log("SendRawTx");
		const tx = TXO.fromRaw(rawtx);
		const res = await BSVName.BSVWriter.sendTxToMinder(rawtx);
		console.log(res);
		if(res.txid)
			processTX(tx,'r');
		ret.code = res.txid==="" ? 1:0;
		ret.txid = res.txid;
		ret.message = "success";
	}catch(e){
		console.log(e);
		ret.message = e.message;
	}
	return ret;
}
function rebuildDB(){ //rebuild whole database
	let protocols = Util.getAllRegProtocols();
	protocols.forEach(function (protocol) {
			let sql = new sqlDB.SQLDB(protocol);
			sql.emptyAllNID();
	});
	fs.writeFileSync(__dirname+"/.rebuildDB","none");
	console.log("remote_admin: rebuildDB, Exit...");
	process.exit(-1);
}
function startIPCSever(){
	ipc.config.silent = true;
	ipc.config.id = 'core';
	ipc.config.retry= 1500;
	ipc.config.maxConnections=1;
	ipc.serve(
		function(){
			ipc.server.on(
				'fromapi',
				async function(data,socket){
					const obj = JSON.parse(data);
					ipc.log('got obj : ', obj);
					if(obj.cmd==="sendtx"){
						let ret = await sendRawTX(obj.rawtx);
						ret.id = obj.id;
						ipc.server.emit(
							socket,
							'toapi',
							JSON.stringify(ret)
						);
					}
					if(obj.cmd==="radmin"){
						if(obj.para==='rebuilddb'){
							rebuildDB();
						}
					}
				})
		}
	)
	ipc.server.start();
}
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
		if(tx_u.findIndex(tx1=>tx1.hash===tx.tx.h)!=-1){
			console.log("already handled utx:",tx.tx.h);
			return;
		}
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
	try{
		fs.accessSync(__dirname+"/.rebuildDB",fs.constants.F_OK);
		fs.unlinkSync(__dirname+"/.rebuildDB");
		return;
	}catch(e){
		//console.log(e.message);
	}
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

/*const rawtx = "0100000002f6609920cbc91b3f51efabf25cd10f3b3493973e394fc49aad637f92ea740460020000006b483045022100eed060c2095730c70d39146a6040a3443c77c8f591ee7e47aa9950f4271a229b02203b9d3f746b2b17a2866e423dc1a369cab6a75a5ca9b0bc3d8164c6a8e92fb6424121030fb59a04df8fdedf258421f7bf3b47136ffc177c36b43c996bb14488598f9f1fffffffff7a7afaf8743b0a203e936c6bd5b231fa693086c2d2445d205431701847ce6945000000006a47304402206d76a0b655aca5c359100be38b2921a26d570dc51a209a18d6b3fa4e8de17fa902205f283b56446af158cb7efd13f21a3841f855331054e68bcfbaf4af22cb34855d4121030fb59a04df8fdedf258421f7bf3b47136ffc177c36b43c996bb14488598f9f1fffffffff04000000000000000041006a22313543777737697a456479723851736b4a6d717743354554715752455a436a777a34086a6f65626964656e087265676973746572046e6f6e65046e6f6e650000000000000000fd0001006a2231346b7871597633656d48477766386d36596753594c516b4743766e395172677239423033306662353961303464663866646564663235383432316637626633623437313336666663313737633336623433633939366262313434383835393866396631664c9633303435303232313030643163663738323530373364356537326337656534643963653330366364373134613831643932353862343362333165303532316262303138643365366335323032323032323932663935353065626636393166383733616633333434366137366136643234616365633737343133626533316238303861626563333738393939363364202020202020202080969800000000001976a9142e22ef3b8094cd911a8905e83f0fc4de613cd64788ace9a90200000000001976a9149cd812cf5623087935a0a6ee3c65e7e22c5eab3188ac00000000";
	
const tx = TXO.fromRaw(rawtx);
console.dir(JSON.stringify(tx,null,4)); */

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
startIPCSever();
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
			//console.log("got new confirmed tx", tx);
			await processTX(tx, 'c');
		}, null);
		
	}
	lastHeight = res.height;
	if(defaultConfig.exit_count&& (exit_counter++>defaultConfig.exit_count) ){ //exit process every hour, so the PM2 could restart it.
		console.log("exit_count:",exit_counter,"Exit...");
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
	//if(!bFinish)return;
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
			});
		}
	});
});
