const {Parser_Domain} = require('./parser_domain')
const BitID = require("bitidentity");
const TXO = require("./txo.js");
const {DEF} = require("./def")

class Parser {
    static verifySig(rawtx) { //retuen publicKey or null
        let rtxVerified = BitID.verifyID(rawtx)
        if (!rtxVerified) {
            return null
        }
        let keyArray = BitID.getBitID(rawtx)
        if (keyArray.length > 0) {
            return keyArray[0].publicKey.toString()
        }
        return null
    }
    static _reArrage(rtx){
        if (rtx.out[0].s2 === "nbd") {
			for (let i = 2; i < rtx.out[0].len; i++) {
				rtx.out[0]["s" + (i + 2)]
					? (rtx.out[0]["s" + i] = rtx.out[0]["s" + (i + 2)])
					: "";
				rtx.out[0]["b" + (i + 2)]
					? (rtx.out[0]["b" + i] = rtx.out[0]["b" + (i + 2)])
					: "";
				rtx.out[0]["h" + (i + 2)]
					? (rtx.out[0]["h" + i] = rtx.out[0]["h" + (i + 2)])
					: "";
				rtx.out[0]["f" + (i + 2)]
					? (rtx.out[0]["f" + i] = rtx.out[0]["f" + (i + 2)])
					: "";
			}
		}
    }
    static parseRaw(rawtx, height, timestamp) {
        const tx = TXO.fromRaw(rawtx);
        let rtx = {
            height: height,
            ts: timestamp,
            txid: tx.tx.h,
            publicKey: tx.in[0].h1.toString(),
            command: tx.out[0].s2 == "nbd" ? tx.out[0].s6 : tx.out[0].s4,
            inputAddress: tx.in[0].e.a.toString(),
            output: null,
            in: tx.in,
            out: tx.out,
        };
       
        if (!rtx.height ||rtx.height==-1|| rtx.height > DEF.BLOCK_SIGNATURE_UPDATE) {
            rtx.publicKey = Parser.verifySig(rawtx)
            if(!rtx.publicKey) {
                return {code:-1,msg:`Failed to verify transaction signature.: ${rtx.txid}`}
            }
        }
        Parser._reArrage(rtx)
        //return Parser_Domain.parse(rtx);
        const handler = Parser_Domain.getAllCommands()[rtx.command]
        if(handler)
            rtx.output = handler.parseTX(rtx)
        if (!rtx.output) {
            return {code:-1,msg:`Not a valid output: ${rtx.txid}`};
        }
        return {code:0,obj:rtx}
    }
    static fillObj(nidObj,rx){
        let retObj = null
        nidObj.lastUpdateheight = rx.height;
        const handler = Parser_Domain.getAllCommands()[rx.command]
        if(handler)
            retObj = handler.fillObj(nidObj,rx)
        else {

        }
        if(retObj==null){
            console.error("Skipped one tx:",rx)
            return null
        }
        console.log("applying cmd",rx.command," to:",nidObj.domain)
        retObj.last_txid = rx.txid
        return JSON.parse(JSON.stringify(retObj))
    }
}
module.exports = Parser