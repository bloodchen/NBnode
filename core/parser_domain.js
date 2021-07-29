
const { Util, CMD_BASE } = require("./util.js");
const { CMD, DEF } = require("./def")
//const DomainTool = require('./domainTool')

class Parser_Domain {

    static parse(rtx) {
        let ret = {
            code: -1, msg: ""
        }
        try {
            const handler = Parser_Domain.getAllCommands()[rtx.command]
            if(handler)
                rtx.output = handler.parseTX(rtx)
           /* if (rtx.command === CMD.REGISTER) {
                // rtx.output = new RegisterOutput(rtx);
                rtx.output = CMD_REGISTER.parseTX(rtx)
            }
            if (rtx.command === CMD.SELL) {
                //rtx.output = new SellOutput(rtx);
                rtx.output = CMD_SELL.parseTX(rtx)
            }
            if (rtx.command === CMD.NOP) {
                //rtx.output = new NopOutput(rtx);
                rtx.output = CMD_NOP.parseTX(rtx);
            }
            if (rtx.command === CMD.BUY) {
                //rtx.output = new BuyOutput(rtx);
                rtx.output = CMD_BUY.parseTX(rtx)
            }
            if (rtx.command === CMD.ADMIN) {
                //rtx.output = new AdminOutput(rtx);
                rtx.output = CMD_ADMIN.parseTX(rtx)
            }
            if (rtx.command === CMD.KEY || rtx.command === CMD.USER) {
                //rtx.output = new MetaDataOutput(rtx);
                rtx.output = CMD_KEYUSER.parseTX(rtx)
            }
            if (rtx.command === CMD.TRANSFER) {
                //rtx.output = new TransferOutput(rtx);
                rtx.output = CMD_TRANSER.parseTX(rtx)
            } */
            if (!rtx.output) {
                ret.msg = `Not a valid output: ${rtx.txid}`;
                return ret;
            }
        } catch (err) {
            ret.msg = err.message;
            console.error(err);
            return ret;
        }
        if (rtx.output.err) {
            console.error("parse domain:", rtx.output.err)
        }
        ret.code = 0;
        ret.obj = rtx;
        return ret;
    }
    static getAllCommands(){
        return {[CMD.KEY]:CMD_KEYUSER,[CMD.USER]:CMD_KEYUSER, [CMD.NOP]:CMD_NOP, [CMD.REGISTER]:CMD_REGISTER, 
            [CMD.BUY]:CMD_BUY, [CMD.SELL]:CMD_SELL, [CMD.ADMIN]:CMD_ADMIN, [CMD.TRANSFER]:CMD_TRANSER}
    }
}
class CMD_REGISTER {
    static parseTX(rtx) {
        let output = CMD_BASE.parseTX(rtx);
        try {
            // Suppose the output array has a fixed order.
            // output 0 - OP_RETURN.
            output.owner_key = rtx.out[0].s5;
            var extra = JSON.parse(rtx.out[0].s6);
            output.payTx = extra["pay_txid"];

            if (rtx.out[0].s7)
                output.agent = rtx.out[0].s7;
        } catch (err) {
            console.log(err);
            output.err = "Invalid format for RegisterOutput class."
            return output
        }

        if (output.owner_key == null || output.owner_key == "") {
            output.err = "Invalid format for RegisterOutput class1."
            return output
        }

        try {
            Util.getAddressFromPublicKey(output.owner_key);
        } catch (err) {
            output.err = "Invalid format for RegisterOutput class2."
        }
        let addr = Util.getAddressFromPublicKey(rtx.publicKey);
        let authorsities = Util.getAdmins(output.protocol, rtx.height);
        if (!authorsities.includes(addr)) {
            output.err = "Input address not in authorities.";
        }
        return output
    }
    static fillObj(nidObj, rtx) {
        try {
            if (nidObj.owner_key) return null //can't register twice
            nidObj.nid = rtx.output.nid;
            nidObj.owner_key = rtx.output.owner_key;
            nidObj.owner = Util.getAddressFromPublicKey(nidObj.owner_key)
            nidObj.txid = rtx.txid;
            nidObj.status = DEF.STATUS_VALID;
            nidObj.domain = rtx.output.domain;
            nidObj.lastUpdateheight = rtx.height;
        } catch (e) {
            return null //some data is invalid, probably owner_key is not a valid public key
        }
        return nidObj
    }
}
class CMD_BUY {
    static parseTX(rtx) {
        let output = CMD_BASE.parseTX(rtx);
        try {
            var extra = JSON.parse(rtx.out[0].s6);
            output.transferTx = extra["sell_txid"];
            output.payTxid = extra["pay_txid"];
            output.agent = rtx.out[0].s7;
            output.owner_key = rtx.out[0].s5;
        } catch (err) {
            output.err = "Invalid format for BuyOutput class."
            return output
        }
        let addr = Util.getAddressFromPublicKey(rtx.publicKey);
        let authorsities = Util.getAdmins(
            output.protocol,
            rtx.height
        );
        if (!authorsities.includes(addr)) {
            output.err = "Input address not in authorities.";
            return output
        }
        return output
    }
    static fillObj(nidObj, rtx) {
        if(nidObj.owner_key == null) return null
        if (nidObj.status == DEF.STATUS_TRANSFERING && nidObj.sell_info) {
            //TODO validate
            {
                if (rtx.time != -1 && rtx.time * 1000 > Number(nidObj.sell_info.expire)) return null //expired
                let clearData = nidObj.sell_info.clear_data;
                if (nidObj.sell_info.buyer != 'any') { //check if it's the right buyer
                    if (Util.getAddressFromPublicKey(rtx.output.owner_key) != nidObj.sell_info.buyer)
                        return null
                }
                nidObj = Util.resetNid(nidObj, rtx.output.owner_key, rtx.txid, DEF.STATUS_VALID, clearData);
            }
        }
        return nidObj
    }
}
class CMD_SELL {
    static parseTX(rtx) {
        let output = CMD_BASE.parseTX(rtx);
        try {
            var extra = JSON.parse(rtx.out[0].s5);
            output.buyer = extra["buyer"];
            output.note = extra["note"];
            output.price = Number(extra["price"]);
            output.expire = Number(extra["expire"]);
            output.clear_data = extra["clear_data"];
        } catch (err) {
            output.err = "Invalid format for SellOutput class."
        }
        return output
    }
    static fillObj(nidObj, rtx) {
        if(nidObj.owner_key == null) return null
        if (nidObj.owner_key == rtx.publicKey) {
            nidObj.status = DEF.STATUS_TRANSFERING
            //nidObj = DomainTool.updateNidObjFromRX(nidObj, rtx);
            nidObj.sell_info = {
                price: rtx.output.price,
                buyer: rtx.output.buyer,
                expire: rtx.output.expire,
                note: rtx.output.note,
                clear_data: rtx.output.clear_data,
                seller: Util.getAddressFromPublicKey(rtx.publicKey).toString(),
                sell_txid: rtx.txid
            };
            nidObj.tf_update_tx = rtx.txid;
        }
        return nidObj
    }
}
class CMD_NOP {
    static parseTX(rtx) {
        let output = CMD_BASE.parseTX(rtx);
        return output
    }
    static fillObj(nidObj, rtx) {
        if(nidObj.owner_key == null) return null
        return nidObj
    }
}
class CMD_TRANSER {
    static parseTX(rtx) {
        let output = CMD_BASE.parseTX(rtx);
        try {
            output.owner_key = rtx.out[0].s5.toLowerCase();
            output.transfer_fee = rtx.out[3].e.v;
            output.payment_addr = rtx.out[3].e.a;
            Util.getAddressFromPublicKey(output.owner_key) //test public key
        } catch (err) {
            output.err = "Invalid format for Transfer command."
            return output
        }
        if (output.transfer_fee < 1000) {
            output.err = "Transfer command must pay admin fee 1000 satoshi."
            return output
        }

        let adminAddr = Util.getTLDFromRegisterProtocol(output.protocol)[1];
        if (output.payment_addr != adminAddr) {
            output.err = "Payment failed, admin address is incorrect."
        }
        return output
    }
    static fillObj(nidObj, rtx) {
        if(nidObj.owner_key == null) return null
        try {
            if (nidObj.owner_key == rtx.publicKey) {
                //nidObj = DomainTool.updateNidObjFromRX(nidObj, rtx)
                nidObj.owner_key = rtx.output.owner_key;
                nidObj.owner = Util.getAddressFromPublicKey(rtx.output.owner_key).toString();
            }
        } catch (e) {
            console.error("fillObj: Transfer command invalid")
            return null
        }
        return nidObj
    }
}
class CMD_ADMIN {
    static parseTX(rtx) {
        let output = CMD_BASE.parseTX(rtx);
        try {
            var extra = JSON.parse(rtx.out[0].s5);
            output.key = Object.keys(extra)[0];
            output.value = extra[output.key];
        } catch (err) {
            output.err = "Invalid format for MetaDataOutput class."
        }
        return output
    }
    static fillObj(nidObj, rtx) {
        if(nidObj.owner_key == null) return null
        if (nidObj.owner_key == rtx.publicKey)
            //nidObj = DomainTool.updateNidObjFromRX(nidObj, rtx);
            nidObj.admins = rtx.output.value;
        nidObj.admin_update_tx = rtx.txid;
        return nidObj
    }
}
class CMD_KEYUSER {
    static parseTX(rtx) {
        let output = CMD_BASE.parseTX(rtx);
        try {
            if (rtx.out[0].s5 != null) {
                var extra = JSON.parse(rtx.out[0].s5);
                output.value = extra;
            } else if (rtx.out[0].ls5 != null) {
                var extra = JSON.parse(rtx.out[0].ls5);
                output.value = extra;
            }
        } catch (e) {
            output.err = e.message
        }
        if (rtx.out[0].s6) {
            try {
                const tags = JSON.parse(rtx.out[0].s6).tags;
                if (tags)
                    output.cmd == "key"
                        ? (output.tags = tags)
                        : (output.utags = tags);
            } catch (e) { }
        }
        if (typeof output.value != "object") {
            output.err = "Invalid key transaction record. Record must be object!"
        }
        return output;
    }
    static fillObj(nidObj, rtx) {
        if(nidObj.owner_key == null) return null
        if (nidObj.owner_key != rtx.publicKey) { //different owner
            let authorized = false; //check admin
            for (var name in nidObj.admins) {
                var adminAddress = nidObj.admins[name];
                if (adminAddress == Util.getAddressFromPublicKey(rxOwner)) {
                    authorized = true;
                }
            }
            if (!authorized)
                return null;
        }
        //nidObj = DomainTool.updateNidObjFromRX(nidObj, rx);
        if (rtx.command == CMD.KEY) {
            // Change deep merge to shallow merge.
            for (const key in rtx.output.value) {
                let lowerKey = key.toLowerCase();
                nidObj.keys[lowerKey] = rtx.output.value[key];
                nidObj.update_tx[lowerKey + '.'] = rtx.txid;
                if (rtx.output.tags) {
                    nidObj.tag_map[lowerKey + '.'] = rtx.output.tags;
                }
            }

        }
        if (rtx.command == CMD.USER) {
            // Change deep merge to shallow merge.
            for (const key in rtx.output.value) {
                let lowerKey = key.toLowerCase();
                nidObj.users[lowerKey] = rtx.output.value[key];
                nidObj.update_tx[lowerKey + '@'] = rtx.txid;
                if (rtx.output.tags) {
                    nidObj.tag_map[lowerKey + '@'] = rtx.output.tags;
                }
            }
        }
        return nidObj
    }
}
/**
* A class represents for transaction output scripts.
*/
class TransactionOutput {
    /**
     * @param {Array} rtx Array of tx output.
     */
    constructor(rtx) {

        this.protocol = rtx.out[0].s2;
        this.nid = rtx.out[0].s3.toLowerCase();
        this.cmd = rtx.out[0].s4.toLowerCase();
        this.domain = this.nid + "." + Util.getTLDFromRegisterProtocol(this.protocol)[0];
        //this.agent = rtx.out[0].s6; // optional agent in s6.
        if (!Util.isValidString(this.nid)) {
            throw ("Invalid NID string");
        }
    }
}
/**
 * Transaction output for metadata tx.
 * @extends {TransactionOutput}
 */
class MetaDataOutput extends TransactionOutput {
    /**
     * @param {Array} rtx.out Array of tx output.
     */
    constructor(rtx) {
        super(rtx);
        this.bitfs = null;
        try {
            if (rtx.out[0].s5 != null) {
                var extra = JSON.parse(rtx.out[0].s5);
                this.value = extra;
            } else if (rtx.out[0].ls5 != null) {
                var extra = JSON.parse(rtx.out[0].ls5);
                this.value = extra;
            } else if (rtx.out[0].f5 != null) {
                this.bitfs = rtx.out[0].f5;
                this.value = {};
            }
            if (rtx.out[0].s6) {
                try {
                    const tags = JSON.parse(rtx.out[0].s6).tags;
                    if (tags)
                        this.cmd == "key"
                            ? (this.tags = tags)
                            : (this.utags = tags);
                } catch (e) { }
            }

            if (typeof this.value != "object") {
                throw new InvalidFormatOutputError(
                    "Invalid key transaction record. Record must be object!"
                );
            }
        } catch (err) {
            throw new InvalidFormatOutputError(
                "Invalid format for MetaDataOutput class."
            );
        }
    }
}
/**
 * Transaction output for admin tx.
 * @extends {TransactionOutput}
 */
class AdminOutput extends TransactionOutput {
    /**
     * @param {Array} rtx.out Array of tx output.
     */
    constructor(rtx) {
        super(rtx);
        try {
            var extra = JSON.parse(rtx.out[0].s5);
            this.key = Object.keys(extra)[0];
            this.value = extra[this.key];
        } catch (err) {
            throw new InvalidFormatOutputError(
                "Invalid format for MetaDataOutput class."
            );
        }
    }
}

/**
 * Transaction output for register tx.
 * @extends {TransactionOutput}
 */
class RegisterOutput extends TransactionOutput {
    /**
     * @param {Array} rtx.out Array of tx output.
     */
    constructor(rtx) {
        super(rtx);

        try {
            // Suppose the output array has a fixed order.
            // output 0 - OP_RETURN.
            this.owner_key = rtx.out[0].s5;
            if (rtx.out[0].s6 != null) {
                var extra = JSON.parse(rtx.out[0].s6);
                this.payTx = extra["pay_txid"];
            }
            this.agent = rtx.out[0].s7;
        } catch (err) {
            console.log(err);
            throw new InvalidFormatOutputError(
                "Invalid format for RegisterOutput class."
            );
        }

        if (this.owner_key == null || this.owner_key == "") {
            throw new InvalidFormatOutputError(
                "Invalid format for RegisterOutput class1."
            );
        }

        try {
            Util.getAddressFromPublicKey(this.owner_key);
        } catch (err) {
            console.log(err);
            throw new InvalidFormatOutputError(
                "Invalid format for RegisterOutput class2."
            );
        }
        let addr = Util.getAddressFromPublicKey(rtx.publicKey);
        let authorsities = Util.getAdmins(
            this.protocol,
            rtx.height
        );
        if (!authorsities.includes(addr)) {
            throw "Input address not in authorities.";
        }
    }
}

/**
 * Transaction output for nop tx.
 * @extends {TransactionOutput}
 */
class NopOutput extends TransactionOutput {
    /**
     * @param {Array} rtx.out Array of tx output.
     */
    constructor(rtx) {
        super(rtx);
        this.agent = null;
    }
}

/**
 * Transaction output for sell tx.
 * @extends {TransactionOutput}
 */
class SellOutput extends TransactionOutput {
    /**
     * @param {Array} rtx.out Array of tx output.
     */
    constructor(rtx) {
        super(rtx);
        try {
            var extra = JSON.parse(rtx.out[0].s5);
            this.buyer = extra["buyer"];
            this.note = extra["note"];
            this.price = Number(extra["price"]);
            this.expire = Number(extra["expire"]);
            this.clear_data = extra["clear_data"];
        } catch (err) {
            throw new InvalidFormatOutputError(
                "Invalid format for SellOutput class."
            );
        }
    }
}

/**
 * Transaction output for buy tx.
 * @extends {TransactionOutput}
 */
class BuyOutput extends TransactionOutput {
    /**
     * @param {Array} rtx.out Array of tx output.
     */
    constructor(rtx) {
        super(rtx);

        // Suppose the output array has a fixed order.
        // output 0 - OP_RETURN.
        try {
            var extra = JSON.parse(rtx.out[0].s6);
            this.transferTx = extra["sell_txid"];
            this.payTxid = extra["pay_txid"];
            this.agent = rtx.out[0].s7;
            this.owner_key = rtx.out[0].s5;
        } catch (err) {
            throw new InvalidFormatOutputError(
                "Invalid format for BuyOutput class."
            );
        }
        let addr = Util.getAddressFromPublicKey(rtx.publicKey);
        let authorsities = Util.getAdmins(
            this.protocol,
            rtx.height
        );
        if (!authorsities.includes(addr)) {
            ret.msg = "Input address not in authorities.";
            return ret;
        }
    }
}

/**
 * Transaction output for transfer tx.
 * @extends {TransactionOutput}
 */
class TransferOutput extends TransactionOutput {
    /**
     * @param {Array} rtx.out Array of tx output.
     */
    constructor(rtx) {
        super(rtx);

        // Suppose the output array has a fixed order.
        // output 0 - OP_RETURN.
        // output 1:Identity
        // output 2:nUTXO to new owner
        // output 3:1000 sat admin fee to payment address
        try {
            this.owner_key = rtx.out[0].s5.toLowerCase();
            this.transfer_fee = rtx.out[3].e.v;
            this.payment_addr = rtx.out[3].e.a;
        } catch (err) {
            throw new InvalidFormatOutputError(
                "Invalid format for BuyOutput class."
            );
        }

        if (this.transfer_fee < 1000) {
            throw new InvalidFormatOutputError(
                "Transfer command must pay admin fee 1000 satoshi."
            );
        }

        let adminAddr = Util.getTLDFromRegisterProtocol(this.protocol)[1];
        if (this.payment_addr != adminAddr) {
            throw new InvalidFormatOutputError(
                "Payment failed, admin address is incorrect."
            );
        }
    }
}

/**
 * InvalidFormatOutputError
 */
class InvalidFormatOutputError extends Error {
    //...
}

/**
 * Signature Verification Failed Error
 */
class SignatureValationError extends Error {
    //...
}

/**
 * IllegalOutputError
 */
class IllegalOutputError extends Error {
    //...
}

/**
 * IllegalCommandError
 */
class IllegalCommandError extends Error {
    //...
}

/**
 *
 */
class IllegalNBDomainError extends Error {
    //...
}
module.exports = { Parser_Domain, CMD_KEYUSER, CMD_NOP, CMD_REGISTER, CMD_BUY, CMD_SELL, CMD_ADMIN, CMD_TRANSER }