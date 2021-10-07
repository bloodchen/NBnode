const { Parser_Domain } = require('./parser_domain')
const BitID = require("bitidentity");
const TXO = require("./txo.js");
const { DEF } = require("./def");
const { Parser_NFT } = require('./parser_nft');

class Parser {
    static init(db) {
        Parser_Domain.init(db)
        Parser_NFT.init(db)
    }
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
    static _reArrage(rtx) {
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
    static verify(rawtx, height) {
        if (!height || height == -1 || height > DEF.BLOCK_SIGNATURE_UPDATE) {
            const publicKey = Parser.verifySig(rawtx)
            if (!publicKey) {
                return { code: -1, msg: `Failed to verify transaction signature.` }
            }
        }
        return { code: 0 }
    }
    static parseRaw(rawtx, height,verify=false) {
        const tx = TXO.fromRaw(rawtx);
        let rtx = {
            height: height,
            //ts: timestamp,
            txid: tx.tx.h,
            publicKey: tx.in[0].h1.toString(),
            command: tx.out[0].s2 == "nbd" ? tx.out[0].s6 : tx.out[0].s4,
            inputAddress: tx.in[0].e.a.toString(),
            output: null,
            in: tx.in,
            out: tx.out,
        };

        /* if (!rtx.height ||rtx.height==-1|| rtx.height > DEF.BLOCK_SIGNATURE_UPDATE) {
             rtx.publicKey = Parser.verifySig(rawtx)
             if(!rtx.publicKey) {
                 return {code:-1,msg:`Failed to verify transaction signature.: ${rtx.txid}`}
             }
         } */
        try {
            Parser._reArrage(rtx)
            let handler = Parser_Domain.getAllCommands()[rtx.command]
            if (!handler) handler = Parser_NFT.getAllCommands()[rtx.command]
            if (handler) rtx.output = handler.parseTX(rtx,verify)
            delete rtx.in
            delete rtx.out
            if (!rtx.output) {
                return { code: -1, msg: `Not a valid output: ${rtx.txid}` };
            }
        } catch (e) {
            console.error(e)
            rtx.output.err = e.message
        }
        return { code: 0, obj: rtx, msg: rtx.output.err ? rtx.output.err : "success" }
    }
    static fillObj(nidObj, rx, objMap) {
        let retObj = null
        nidObj.lastUpdateheight = rx.height;
        nidObj.last_txid = rx.txid
        if(rx.txid=="5c23c8f8ed684ecb23b5a83b10507a4ef38de2fc3816acd0fdbbd312143dacda"){
            console.log("found")
        }
        if(rx.output.err){
            return null
        }
        let handler = Parser_Domain.getAllCommands()[rx.command]
        if (!handler) handler = Parser_NFT.getAllCommands()[rx.command]
        if (handler) retObj = handler.fillObj(nidObj, rx, objMap)
        else {

        }
        if (retObj == null) {
            console.error("Skipped one tx:", "msg:",rx.output.err,rx.command," txid:",rx.txid)
            return null
        }
        console.log("applying cmd", rx.command, " to:", nidObj.domain)
        return JSON.parse(JSON.stringify(retObj))
    }
}
module.exports = Parser