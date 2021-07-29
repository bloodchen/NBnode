const { Util,CMD_BASE}  = require("./util.js");
const { CMD } = require("./def")

class Parser_NFT {
    static getAllCommands(){
        return {}
    }
}

class CMD_NFT_Create{
    static parseTX(rtx){
        let output = CMD_BASE.parseTX(rtx);
        output.symbol = rtx.out[0].s5
        output.meta = rtx.out[0].s6
        output.fee = rtx.out[3].e.v
        output.payment = rtx.out[3].e.a
        let adminAddr = Util.getTLDFromRegisterProtocol(output.protocol)[1];
        if (address != adminAddr) {
            output.err = "nft.create failed, payment address incorrect."
        }
        return output
    }
    static fillObj(NIDObject,rtx){

    }
}
module.exports = { Parser_NFT,CMD_NFT_Create }