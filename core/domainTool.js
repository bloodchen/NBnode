const {Util} = require('./util')
const { CONFIG } = require('./config')
const { CMD,DEF } = require('./def')
const Parser = require('./parser')
var axios = require("axios");





class DomainTool {
    /**
   * Fetch NidOject from remote endpoint.
   * @param {!NidObject} domain 
   */
    static async fetchDomainAvailibility(domain) {
        try {
            let url = `${CONFIG.nidcheck_endpoint}${domain}`;
            console.log(`Sending request to URL ${url}`);
            let res = await axios.get(url, { timeout: 10000 });
            return res.data;
        } catch (error) {
            console.log(error);
            return { code: -1000, message: error };
        }
    }
    static fillNIDFromTX(nidObj, rx){
        
        return Parser.fillObj(nidObj,rx);
        
    }
    static fillNIDFromTX1(nidObj, rtxArray) {

        if (rtxArray == null) {
            return null;
        }
        try{
        let rxArray = [];
        let firstRegRtx = null;
        if (nidObj.owner_key == null) {
            nidObj = DomainTool.resetNid(nidObj, null, null, DEF.STATUS_EXPIRED);
            firstRegRtx = DomainTool.findFirstRegister_(rtxArray);
            if (firstRegRtx != null) {
               /* nidObj.nid = firstRegRtx.output.nid;
                nidObj.owner_key = firstRegRtx.output.owner_key;
                nidObj.txid = firstRegRtx.txid;
                nidObj.status = DEF.STATUS_VALID;
                nidObj.domain = firstRegRtx.output.domain;
                nidObj.lastUpdateheight = firstRegRtx.height;
                rxArray.push(firstRegRtx);*/
                nidObj = CMD_REGISTER.fillObj(nidObj,firstRegRtx)
            } else {
                return nidObj;
            }
        }

        rtxArray.forEach((rx, _) => {
            nidObj.lastUpdateheight = rx.height;
            if (rx.height < nidObj.lastUpdateheight) {
                // Only scan rtx newer than first Register RTX. (but may be older rtx by in same block);
                return;
            }

            // RTX owner key is different from current owner.
            let rxOwner = rx.publicKey;
            if (rx.command == CMD.REGISTER || rx.command == CMD.BUY) {
                // Only authorities can register a domain but not users.
                rxOwner = rx.output.owner_key;
            }
            if (rxOwner != nidObj.owner_key) {
                // Only register when domain expired case or accept a transfer.

                // Register after NID expired.
                if ((rx.command == CMD.REGISTER) && nidObj.status == DEF.STATUS_EXPIRED) {
                    nidObj = DomainTool.resetNid(nidObj, rxOwner, rx.txid, DEF.STATUS_VALID);
                    rxArray.push(rx);
                }

                // Accept NID transfer.
                if ((rx.command == CMD.BUY) && nidObj.status == DEF.STATUS_TRANSFERING) {
                    
                    /* if (DomainTool.validNIDTransfer_(nidObj, rx)) {
                        rxArray.push(rx);
                        let clearData = nidObj.sell_info.clear_data;
                        nidObj = DomainTool.resetNid(nidObj, rxOwner, rx.txid, STATUS_VALID, clearData);
                    }*/
                    nidObj = CMD_BUY.fillObj(nidObj,rx)
                }

                // Set Key.
                if (rx.command == CMD.KEY || rx.command == CMD.USER) {
                    CMD_KEYUSER.fillObj(nidObj,rx);
                    /*if (nidObj.status != DEF.STATUS_EXPIRED) {
                        let authorized = false;
                        for (var name in nidObj.admins) {
                            var adminAddress = nidObj.admins[name];
                            if (adminAddress == Util.getAddressFromPublicKey(rxOwner)) {
                                authorized = true;
                            }
                        }
                        if (authorized) {
                            rxArray.push(rx);
                            nidObj = DomainTool.updateNidObjFromRX(nidObj, rx);
                        }
                    }*/
                }

                // NOP.
                if (rx.command == CMD.NOP) {
                    // Check if it's from admin.
                    // let addr = Util.getAddressFromPublicKey(rx.publicKey);
                    rxArray.push(rx);
                }
                return;
            }

            // RTX public key is same as current owner.
            if (firstRegRtx != null && rx.txid == firstRegRtx.txid) {
                // Skip the first Register.
                return;
            }

            // Force update last_txid as long as tx is from owner (even it's not valid).
            nidObj.last_txid = rx.txid;
            if(rx.output.err) 
                return;
            if(rx.command == CMD.NFT_CREATE){
                CMD_NFT_Create.fillObj(nidObj,rx);
            }
            // Set Metadata or Admin.
            if (rx.command == CMD.ADMIN) {
                /*if (nidObj.status != DEF.STATUS_EXPIRED) {
                    rxArray.push(rx);
                    nidObj = DomainTool.updateNidObjFromRX(nidObj, rx);
                }*/
                nidObj = CMD_ADMIN.fillObj(nidObj,rx);
            }
            if(rx.command == CMD.KEY || rx.command == CMD.USER){
                nidObj = CMD_KEYUSER.fillObj(nidObj,rx);
            }

            // NOP.
            if (rx.command == CMD.NOP) {
                // Do nothing, just update last_txid;
                //rxArray.push(rx);
                nidObj = CMD_NOP.fillObj(nidObj,rx);
            }

            // Accept NID transfer.
            if ((rx.command == CMD.BUY) && nidObj.status == DEF.STATUS_TRANSFERING) {
                /*if (DomainTool.validNIDTransfer_(nidObj, rx)) {
                    rxArray.push(rx);
                    let clearData = nidObj.sell_info.clear_data;
                    nidObj = DomainTool.resetNid(nidObj, rxOwner, rx.txid, STATUS_VALID, clearData);
                } */
                nidObj = CMD_BUY.fillObj(nidObj,rx)
            }

            // Transfer NID.
            if (rx.command == CMD.SELL) {
                /*if (nidObj.status != DEF.STATUS_EXPIRED) {
                    if (nidObj.status == DEF.STATUS_VALID) {
                        // First valid transfer cmd.
                        nidObj.status = DEF.STATUS_TRANSFERING;
                    } else {
                        // Subsequent valid transfer cmds.
                        DomainTool.removeRtxByHash(rxArray, nidObj.sell_info.sell_txid);
                    }
                    rxArray.push(rx);
                    nidObj = DomainTool.updateNidObjFromRX(nidObj, rx);
                }*/
                nidObj = CMD_SELL.fillObj(nidObj,rx)
            }

            if (rx.command == CMD.TRANSFER) {
                //nidObj = DomainTool.updateNidObjFromRX(nidObj, rx);
                //rxArray.push(rx);
                nidObj = CMD_TRANSER.fillObj(nidObj,rx)
            }

        });

        nidObj.rxArray = rxArray; // For debug purpose only.
        if (rxArray.length != 0) {
            nidObj.last_txid = rxArray[rxArray.length - 1].txid;
        }
        if (nidObj.owner_key != null) {
            nidObj.owner = Util.getAddressFromPublicKey(nidObj.owner_key);
        }
    }catch(e){
        console.error(e)
        return null
    }
        // Return deep copy.
        return JSON.parse(JSON.stringify(nidObj));
    }

    /**
     * Reset NidObject to initial state.
     * @param {NIDObject!} nidObj 
     * @param {!string} newOwner 
     * @param {!Number} newStatus 
     */
    static resetNid(nidObj, newOwner, newOnwerTxid, newStatus, clearData = true) {
        nidObj.owner_key = newOwner;
        if (newOwner != null) {
            nidObj.owner = Util.getAddressFromPublicKey(nidObj.owner_key);
            nidObj.txid = newOnwerTxid;
        } else {
            nidObj.owner = null;
            nidObj.txid = 0;
        }
        nidObj.status = newStatus;
        if (clearData) {
            nidObj.admins = [];
            nidObj.keys = {};
            nidObj.users = {};
            nidObj.update_tx = {};
            nidObj.admin_update_tx = 0;
        }
        nidObj.tf_update_tx = 0
        nidObj.sell_info = null;
        return nidObj;
    }
    /**
       * Check if a pair of trasfer/accept RTX are valid.
       * @param {ReadableTranscation} acceptRx The accept RTX.
       * @return {Boolean} True if the transfer/accept RTX pair are valid.
       */
    static validNIDTransfer_(nidObj, acceptRx) {
        return true;
    }
    /**
     * Update NidObject according to transaction.
     * @param {!NIDObject} nidObj 
     * @param {!ReadableTranscation} rtx 
     */
    static updateNidObjFromRX(nidObj, rtx) {
        if (rtx != null) {
            if (rtx.command == CMD.ADMIN) {
                nidObj.admins = rtx.output.value;
                nidObj.admin_update_tx = rtx.txid;
            }
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
            if (rtx.command == CMD.SELL) {
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
            if (rtx.command == CMD.TRANSFER) {
                nidObj.owner_key = rtx.output.owner_key;
                nidObj.owner = Util.getAddressFromPublicKey(rtx.output.owner_key).toString();
            }
        }
        return nidObj;
    }

    /**
     * Delete a transaction from rtxArry by hash.
     * @param {!Array} rtxArray 
     * @param {!string} hash 
     */
    static removeRtxByHash(rtxArray, hash) {
        for (var i = 0; i < rtxArray.length; i++) {
            if (rtxArray[i].txid === hash) {
                rtxArray.splice(i, 1);
            }
        }
        return rtxArray;
    }

    /**
     * Find first vaild register transactions.
     * @param {Array<Object>} rxArray Array of readable transaction objects. 
     * @return {ReadableTranscation} The first RTX for register command.
     */
    static findFirstRegister_(rxArray) {
        for (let i = 0; i < rxArray.length; i++) {
            let rx = rxArray[i];
            if (rx.command !== CMD.REGISTER) {
                continue;
            }
            return rx;
        }
        return null;
    }
}

// ------------------------------------------------------------------------------------------------

module.exports = {
    DomainTool
}