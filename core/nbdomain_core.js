/**
 * BSVName SDK - A BSV based naming system.
 * Server side SDK. The SDK provides interface to write and read NID to BSV nodes, as well as related
 * functionility to interact with NID.
 */
var NAMEBSV_SCRIPT_VERSION = 0.1
const BLOCK_SIGNATURE_UPDATE = 637628;

const filepay = require('filepay');
const fetch = require('node-fetch');
const axios = require('axios');
const config = require('./config.js');
//const sqlDB = require('./sqldb.js');
const sqlDB = require('./dbMgr.js');
const Util = require('./util.js');
const BSVUtil = require('./bsvutil.js');
const CMD = require('./cmd.js');
const Minercraft = require('minercraft');
const BitID = require('bitidentity');
const NBLib = require('nblib');
const defaultConfig = config[config.env];
/**
 * Constants for configurations.
 */
const ERROR_INVALID_OWNER = 10;
const ERROR_INVALID_REGISTER = 12;
const ERROR_PERMISSION_DENIED = 13;
const ERROR_NID_NOT_VALID = 14;
const ERROR_NID_NOT_AVAILALE = 15
const ERROR_NOTFOUND = 100;
const ERROR_DOMAIN_RESERVED = 101;
const ERROR_KEY_NOTFOUND = 102;
const ERROR_BITFS = 17;
const ERROR_UNKNOWN = -1;
const NO_ERROR = 0;

/**
 * Protocol ID of NameBSV project.
 */
const DEFAULT_AGENT = "";

const SUB_PROTOCOL_MAP_ = defaultConfig.tld_config;
const NID_CHECK_ENDPOINT = defaultConfig.nidcheck_endpoint;


// nid.lenth < 2 is invalid.
const BATCH_READ_CONFIG = '$$$';

const CONFIG_KEY = '_pay';
const PUBLICKEY = 'public_key';
const ADDRESS = 'address';


 NBLib.init({
  // API: "https://manage.nbdomain.com/node/", //resolver endpoint 
  API: "http://localhost:" + defaultConfig.node_port + "/api/",
  adminAPI: "http://localhost:" + defaultConfig.node_port + "/admin/",
  minerAPI: "https://merchantapi.taal.com", //endpoint of miner API
  token: "111", //api token required by resolver
  debug: true, //enable debug or not. 
  tld_config: defaultConfig.tld_config,
  sendByNode: false,
  enable_write: true  //enable functions that can update and write value to NBdomain
});
/**
 * Class to write data to BSV network.
 */
class BSVWriter {

  /**
   * @param {!string} endPoint An endpoint to connect.
   * @param {!string>} minerFee Miner fee to record each transaction.
   */
  constructor() {
  }

 

  writeTxToBSV(exportedTx, sign, callback) {
    // Later import exportedTxHex and sign it with privatkey, and broadcast, all in one method:
    let resp = { code: NO_ERROR };
    this.sendTxToMinder(exportedTx).then(r => {
      if (r.returnResult !== "success") {
        resp.code = ERROR_UNKNOWN;
        resp.message = r.resultDescription;
      } else {
        resp.tx = r.txid;
        resp.message = "Transation succeed. tx=" + r.txid;
      }
      callback(resp);
    }).catch(err => {
      console.log(err);
      callback({ code: ERROR_UNKNOWN, message: err });
    });
  }

  static async sendTxToMinder(exportedTx) {
    const miner = new Minercraft({
       url: "https://merchantapi.matterpool.io",
      //url: "https://www.ddpurse.com/openapi",
      headers: {
        "Content-Type": "application/json",
        token: "561b756d12572020ea9a104c3441b71790acbbce95a6ddbf7e0630971af9424b"
      }
    })

    return await miner.tx.push(exportedTx);
  }

}

class NidFetcher {

  constructor() {
    this.lastBlkId = 0;
  }

  /**
   * Convert transation JSON array to <privateKey. transations> map.
   * Input transaction array format:
   * [
   *  { 
   *    publicKey: userPublicKey1, 
   *    block: blockIndex1,
   *    out: outScript1,
   *    address: incomingEdge1
   *  },
   *  { 
   *    publicKey: userPublicKey2, 
   *    block: blockIndex2,
   *    out: outScript2,
   *    address: incomingEdge2
   *  } 
   *  ...
   * ]
   * 
   * Output/Return array format:
   * [
   *    {
   *      publicKey: tx.publicKey,
   *      blockId: tx.block,
   *      command: tx.out[0].s4,
   *      inputAddress: tx.address,
   *      output: TransactionOutput
   *    },
   *    ...
   * ]
   * @param {!JSONArray} transations Array of json objects for bit query result.
   */
  convertToRTX(transations, callback) {
    if (transations == null) {
      callback([]);
    }
    var readableTranscations = [];
    for (let i = 0; i < transations.length; i++) {
      let tx = transations[i];
      let rtx = null;
      if (!tx) continue;

      if ('block' in tx) {
        // Confirmed transactions has a block number;
        if (this.lastBlkId < tx.block) {
          this.lastBlkId = tx.block;
        }

        rtx = {
          blkTs: Number(tx.ts * 1000), // Block timestamp is in seconds, convert to milliseconds.
          hash: tx.txHash,
          publicKey: tx.publicKey,
          blockId: tx.block,
          command: tx.out[0].s4,
          inputAddress: tx.address,
          output: null,
          in: tx.in,
          out: tx.out
        };
      } else {
        rtx = {
          blkTs: Util.tsNowTime(), // Block timestamp is empty for unconfirmed transation, set as now().
          hash: tx.txHash,
          publicKey: tx.publicKey,
          // blockId: -1,
          command: tx.out[0].s4,
          inputAddress: tx.address,
          output: null,
          in: tx.in,
          out: tx.out
        };
      }

      if (!this.validateSign(rtx)) {
        continue;
      }

      try {
        if (rtx.command === CMD.REGISTER) {
          rtx.output = new RegisterOutput(tx.out);
          let addr = BSVUtil.getAddressFromPublicKey(rtx.publicKey);
          let authorsities = Util.getAdmins(rtx.output.protocol, rtx.blockId);
          if (!(authorsities.includes(addr))) {
            // Input address not in authorities.
            continue;
          }
        }
        if (rtx.command === CMD.SELL) {
          rtx.output = new SellOutput(tx.out);
        }
        if (rtx.command === CMD.NOP) {
          rtx.output = new NopOutput(tx.out);
        }
        if (rtx.command === CMD.BUY) {
          rtx.output = new BuyOutput(tx.out);
          let addr = BSVUtil.getAddressFromPublicKey(rtx.publicKey);
          let authorsities = Util.getAdmins(rtx.output.protocol, rtx.blockId);
          if (!(authorsities.includes(addr))) {
            // Input address not in authorities.
            continue;
          }
        }
        if (rtx.command === CMD.ADMIN) {
          rtx.output = new AdminOutput(tx.out);
        }
        if (rtx.command === CMD.KEY || rtx.command === CMD.USER) {
          rtx.output = new MetaDataOutput(tx.out).resolveBitFsWhenNeeded();
        }
        if (rtx.command === CMD.TRANSFER) {
          rtx.output = new TransferOutput(tx.out);
        }
      } catch (err) {
        // throw err;
        // // Skip invalid output.
        console.log(`Invalid transaction output record: ${err.message}`);
        continue;
      }

      if (rtx.output != null) {
        readableTranscations.push(rtx);
      }
    }

    // console.log(`Successfully generated ${readableTranscations.length} TransactionOutputs.`)
    // return readableTranscations;

    if (readableTranscations.length > 0) {
      let returnList = [];
      Promise.allSettled(readableTranscations.map(rtx => rtx.output)).then((outputs) => {
        for (let i = 0; i < readableTranscations.length; i++) {
          let rtx = readableTranscations[i];
          if (outputs[i].status == 'fulfilled') {
            rtx.output = outputs[i].value;
            // Verify signature after block 637342
            if (!rtx.blockId || rtx.blockId > BLOCK_SIGNATURE_UPDATE) {
              for (var j = 0; j < rtx.out.length; j++) {
                let out = rtx.out[j];
                for (let k = 0; k < out.len; k++) {
                  if (out["f" + k]) {
                    out["s" + k] = JSON.stringify(rtx.output.value);
                    let buf = filepay.bsv.deps.Buffer.from(out["s" + k]);
                    out["b" + k] = buf.toString('base64');
                    out["h" + k] = buf.toString('hex');
                  }
                }
              }
              let rtxVerified = BitID.verifyIDFromBitbus(rtx);
              if (!rtxVerified) {
                console.error(`Failed to verify transaction signature.: ${rtx.hash}`);
                continue;
                // throw new SignatureValationError("Failed to verify transaction signature.");
              } else {
                let keyArray = BitID.getBitIDFromBitbus(rtx);
                if (keyArray.length > 0) {
                  rtx.publicKey = keyArray[0].publicKey.toString();
                  returnList.push(rtx);
                }
              }
            } else {
              returnList.push(rtx);
            }
          } else if (outputs[i].status == 'rejected') {
            rtx.output = outputs[i].reason;
            returnList.push(rtx);
          }
        }
        callback(returnList);
      }).catch(err => {
        console.log(JSON.stringify(err));
      });
    } else {
      callback(readableTranscations);
    }
  }

  convertToRTXPromise(rtxArray) {
    return new Promise((resolve, reject) => {
      this.convertToRTX(rtxArray, function (resp) {
        resolve(resp);
      })
    })
  }

  validateSign(rtx) {
    return true;
  }

}

/**
 * Provide interface and functionilities to manage NID.
 */
class NIDManager {

  /**
   * Constructor for NID manager.
   */
  constructor(protocol) {
    this.nidFetcher = new NidFetcher();
    this.bsvWriter = new BSVWriter();
    this.transMap = null;
    this.singleInstCache = {};
    this.nidObjMap = {};  // Only used when load fetch all NIDs.
    this.lastBlockId = 0;
    this.ownershipTrack = {};
    this.nidObj = new NIDObject(null);
    this.rxArray = [];
    this.updateService = false;
    this.subDomain = null;
    this.domain = null;
    this.protocol = protocol; // By default, tld is ".bsv";
    this.paymentProtocol = null;
    this.tld = null;
    this.sql = null;

    if (this.protocol != null) {
      this.sql = new sqlDB.SQLDB(this.protocol);  
    }

    this.initSync();
  }

  async initSync() {
    
  }

  parseNid(nbdomain) {
    nbdomain = nbdomain.toLowerCase();
    this.domain = nbdomain;
    if (nbdomain.lastIndexOf(".") === -1) {
      throw new IllegalNBDomainError("Illegal top level domain, must have '.'.!");
    }

    let strArray = Util.parseNid(nbdomain);
    if (strArray != null) {
      this.nid = strArray[1];
      this.nidObj.nid = strArray[1];
      this.subDomain = strArray[0];
      this.tld = strArray[2];

      if (this.tld in SUB_PROTOCOL_MAP_) {
        this.protocol = SUB_PROTOCOL_MAP_[this.tld].address.protocol;
        this.paymentProtocol = SUB_PROTOCOL_MAP_[this.tld].address.payment;
        this.sql = new sqlDB.SQLDB(this.protocol);  
      } else {
        throw new IllegalNBDomainError("Illegal top level domain!");
      }
    } else {
      throw new IllegalNBDomainError("Can not parse given domain.");
    }
  }

  isValid(domain) {
    try {
      this.parseNid(domain);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Get public key of NID owner.
   * @return {string} Public key of the NID owner.
   */
  getNidOwner() {
    return this.nidObj.owner_key;
  }

  getRegKey() {
    return this.reg_key;
  }

  setRetKey(key) {
    this.reg_key = key;
  }

  /**
   * Check if NID has expired.
   * @return {Boolean} True if NID has expired.
   */
  isNidExpired_() {
    // return Util.tsNowTime() > Number(this.nidObj.expire);
    return this.nidObj.owner == null;
  }

  // RegisterNid & BuyNid are register only methods, remove when packing third party npm;
  async registerNid(payTxHash, callback = null) {
    let ownerPublicKey = this.owner_key;
    this.getPredictNidObj().then(async resp => {
      if (ownerPublicKey == this.getNidOwner() || this.isNidExpired_()) {
        let ext = {
          pay_txid: payTxHash
        }
        const addr = filepay.bsv.PublicKey.fromHex(ownerPublicKey).toAddress().toString();
        let resp = {code: NO_ERROR};
        let r = await NBLib.admin_regDomain(this.domain, this.getRegKey(), ownerPublicKey, payTxHash, null)
        if (r.returnResult !== "success") {
          resp.code = ERROR_UNKNOWN;
          resp.message = r.resultDescription;
          resp.broadcasted = true;
        } else {
          resp.tx = r.txid;
          resp.message = "Transation succeed. tx=" + r.txid;
          resp.broadcasted = true;
        }
        callback(resp);
        
      } else {
        callback({ code: ERROR_INVALID_REGISTER, message: 'You are not qualified to purchase the NID.' });
      }
    }).catch(err => {
      console.log(err);
      callback({ code: ERROR_UNKNOWN, message: err });
    });
  }

  async buyNid(payTxHash, sellTxid, callback = null) {
    let ownerPublicKey = this.owner_key;
    let ext = {
      pay_txid: payTxHash,
      sell_txid: sellTxid
    }
    const addr = filepay.bsv.PublicKey.fromHex(ownerPublicKey).toAddress().toString();
    let resp = {code: NO_ERROR};
    let r = await NBLib.admin_buyDomain(this.domain,this.getRegKey(),ownerPublicKey,sellTxid,payTxHash)
    if (r.returnResult !== "success") {
      resp.code = ERROR_UNKNOWN;
      resp.message = r.resultDescription;
      resp.broadcasted = true;
    } else {
      resp.tx = r.txid;
      resp.message = "Transation succeed. tx=" + r.txid;
      resp.broadcasted = true;
    }
    callback(resp);

  }

  fetchRTXFromDB_(callback) {
    if (this.nid != null) {
      // Refresh single NID.
      let list = this.sql.queryLog(this.nid, 0);
      let maxBlkId = 0;
      if (list != null) {
        for (let i = 0; i < list.length; i++) {
          let rtx = list[i];
          rtx.output = JSON.parse(rtx.output);
          if (maxBlkId < Number(rtx.blockId)) {
            maxBlkId = Number(rtx.blockId);
          }
        }
        if (this.nidObj.lastUpdateBlockId < maxBlkId) {
          this.nidObj.lastUpdateBlockId = maxBlkId;
        }
      }
      callback(list);
    } else {
      // Update All NIDs.
      // User block id to save dbTxId, since 2020/11/16;
      this.lastBlockId = this.loadBatchReadLastBlockId();
      let list = this.sql.queryLogById(this.lastBlockId);
      let maxBlkId = 0;
      if (list != null) {
        for (let i = 0; i < list.length; i++) {
          let rtx = list[i];
          let dbTxId = rtx.id;
          rtx.output = JSON.parse(rtx.output);
          if (maxBlkId < Number(dbTxId)) {
            maxBlkId = Number(dbTxId);
          }
        }
        if (this.lastBlockId < maxBlkId) {
          this.lastBlockId = maxBlkId;
        }
      }

      callback(list);
    }
  }

  /**
   * Fetch all transactions for given NID.
   */
  fetchRTXsPromise_() {
    return new Promise((resolve, reject) => {
      this.fetchRTXFromDB_((data) => {
        if (data == null) {
          resolve(null);
        } else {
          resolve(data);
        }
      });
    });
  }

  /**
   * Fetch NidOject from remote endpoint.
   * @param {!NidObject} domain 
   */
  static fetchDomainAvailibility(domain, callback) {
    try {
      let url = `${NID_CHECK_ENDPOINT}${domain}`;
      console.log(`Sending request to URL ${url}`);
      fetch(url).then((r) => {
        return r.json();
      }).then((respJson) => {
        callback(respJson);
        return;
      }).catch(err => console.log(err));
    } catch (error) {
      console.log(error);
      callback({ code: ERROR_UNKNOWN, message: error });
    }
  }

  /**
   * Process NID object according to the transactions
   * @param {NIDObject} nidObj The NIDObject instane.
   * @param {Array} rtxArray Array of ReadableTransactions.
   * @return {NIDObject} Updated NIDObject.
   */
  static fillNIDFromTX(nidObj, rtxArray) {

    if (rtxArray == null) {
      return null;
    }
    let rxArray = [];
    let firstRegRtx = null;
    if (nidObj.owner_key == null) {
      nidObj = NIDManager.resetNid(nidObj, null, null, STATUS_EXPIRED);
      firstRegRtx = NIDManager.findFirstRegister_(rtxArray);
      if (firstRegRtx != null) {
        nidObj.nid = firstRegRtx.output.nid;
        nidObj.owner_key = firstRegRtx.output.owner_key;
        nidObj.txid = firstRegRtx.hash;
        nidObj.status = STATUS_VALID;
        nidObj.lastUpdateBlockId = firstRegRtx.blockId;
        rxArray.push(firstRegRtx);
      } else {
        return nidObj;
      }
    }

    rtxArray.forEach((rx, _) => {
      nidObj.lastUpdateBlockId = rx.blockId;
      if (rx.blockId < nidObj.lastUpdateBlockId) {
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
        if ((rx.command == CMD.REGISTER) && nidObj.status == STATUS_EXPIRED) {
          nidObj = NIDManager.resetNid(nidObj, rxOwner, rx.hash, STATUS_VALID);
          rxArray.push(rx);
        }

        // Accept NID transfer.
        if ((rx.command == CMD.BUY) && nidObj.status == STATUS_TRANSFERING) {
          /**
           *  Validation for domain expiration at accept time.
           */
          if (NIDManager.validNIDTransfer_(nidObj, rx)) {
            rxArray.push(rx);
            let clearData = nidObj.sell_info.clear_data;
            nidObj = NIDManager.resetNid(nidObj, rxOwner, rx.hash, STATUS_VALID, clearData);
          }
        }

        // Set Key.
        if (rx.command == CMD.KEY || rx.command == CMD.USER) {
          if (nidObj.status != STATUS_EXPIRED) {
            let authorized = false;
            for (var name in nidObj.admins) {
              var adminAddress = nidObj.admins[name];
              if (adminAddress == BSVUtil.getAddressFromPublicKey(rxOwner)) {
                authorized = true;
              }
            }
            if (authorized) {
              rxArray.push(rx);
              nidObj = NIDManager.updateNidObjFromRX(nidObj, rx);
            }
          }
        }

        // NOP.
        if (rx.command == CMD.NOP) {
          // Check if it's from admin.
          // let addr = BSVUtil.getAddressFromPublicKey(rx.publicKey);
          rxArray.push(rx);
        }
        return;
      }

      // RTX public key is same as current owner.
      if (firstRegRtx != null && rx.hash == firstRegRtx.hash) {
        // Skip the first Register.
        return;
      }

      // Force update last_txid as long as tx is from owner (even it's not valid).
      nidObj.last_txid = rx.hash;

      // Set Metadata or Admin.
      if (rx.command == CMD.ADMIN || rx.command == CMD.KEY || rx.command == CMD.USER) {
        if (nidObj.status != STATUS_EXPIRED) {
          rxArray.push(rx);
          nidObj = NIDManager.updateNidObjFromRX(nidObj, rx);
        }
      }

      // NOP.
      if (rx.command == CMD.NOP) {
        // Do nothing, just update last_txid;
        rxArray.push(rx);
      }

      // Accept NID transfer.
      if ((rx.command == CMD.BUY) && nidObj.status == STATUS_TRANSFERING) {
        /**
         *  Validation for domain expiration at accept time.
         */
        if (NIDManager.validNIDTransfer_(nidObj, rx)) {
          rxArray.push(rx);
          let clearData = nidObj.sell_info.clear_data;
          nidObj = NIDManager.resetNid(nidObj, rxOwner, rx.hash, STATUS_VALID, clearData);
        }
      }

      // Transfer NID.
      if (rx.command == CMD.SELL) {
        if (nidObj.status != STATUS_EXPIRED) {
          if (nidObj.status == STATUS_VALID) {
            // First valid transfer cmd.
            nidObj.status = STATUS_TRANSFERING;
          } else {
            // Subsequent valid transfer cmds.
            NIDManager.removeRtxByHash(rxArray, nidObj.sell_info.sell_txid);
          }
          rxArray.push(rx);
          nidObj = NIDManager.updateNidObjFromRX(nidObj, rx);
        }
      }

      if (rx.command == CMD.TRANSFER) {
        nidObj = NIDManager.updateNidObjFromRX(nidObj, rx);
        rxArray.push(rx);
      }

    });

    nidObj.rxArray = rxArray; // For debug purpose only.
    if (rxArray.length != 0) {
      nidObj.last_txid = rxArray[rxArray.length - 1].hash;
    }
    if (nidObj.owner_key != null) {
      nidObj.owner = BSVUtil.getAddressFromPublicKey(nidObj.owner_key);
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
  static resetNid(nidObj, newOwner, newOnwerTxid, newStatus, clearData=true) {
    nidObj.owner_key = newOwner;
    if (newOwner != null) {
      nidObj.owner = BSVUtil.getAddressFromPublicKey(nidObj.owner_key);
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
      nidObj.key_update_tx = {};
      nidObj.user_update_tx = {};
      nidObj.admin_update_tx = 0;
    }
    nidObj.tf_update_tx = 0
    nidObj.sell_info = null;
    return nidObj;
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
        nidObj.admin_update_tx = rtx.hash;
      }
      if (rtx.command == CMD.KEY) {
        // Change deep merge to shallow merge.
        for (const key in rtx.output.value) {
          let lowerKey = key.toLowerCase();
          nidObj.keys[lowerKey] = rtx.output.value[key];
          nidObj.key_update_tx[lowerKey] = rtx.hash;
          if(rtx.output.tags){
            nidObj.tag_map[lowerKey] = rtx.output.tags;
          }
        }
        
      }
      if (rtx.command == CMD.USER) {
        // Change deep merge to shallow merge.
        for (const key in rtx.output.value) {
          let lowerKey = key.toLowerCase();
          nidObj.users[lowerKey] = rtx.output.value[key];
          nidObj.user_update_tx[lowerKey] = rtx.hash;
        }
      }
      if (rtx.command == CMD.SELL) {
        nidObj.sell_info = {
          price: rtx.output.price,
          buyer: rtx.output.buyer,
          expire: rtx.output.expire,
          note: rtx.output.note,
          clear_data: rtx.output.clear_data,
          seller: BSVUtil.getAddressFromPublicKey(rtx.publicKey).toString(),
          sell_txid: rtx.hash
        };
        nidObj.tf_update_tx = rtx.hash;
      }
      if (rtx.command == CMD.TRANSFER) {
        nidObj.owner_key = rtx.output.owner_key;
        nidObj.owner = BSVUtil.getAddressFromPublicKey(rtx.output.owner_key).toString();
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
      if (rtxArray[i].hash === hash) {
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

  /**
   * Check if a pair of trasfer/accept RTX are valid.
   * @param {ReadableTranscation} acceptRx The accept RTX.
   * @return {Boolean} True if the transfer/accept RTX pair are valid.
   */
  static validNIDTransfer_(nidObj, acceptRx) {
    return true;
  }


  /**
   * Fetch entire NID network RTX.
   */
  populateAllNid() {
    return new Promise((resolve, reject) => {
      this.getAllValidNidRtx_((data) => {
        resolve(data)
      });
    });
  }

  /**
   * Get valid RTX for all transactions in NID network.
   * @param {Function} callback The callback function.
   */
  getAllValidNidRtx_(callback) {
    this.fetchRTXsPromise_().then(rtxArray => {
      this.nidObjMap = {};
      var resp = {
        code: NO_ERROR,
      };
      if (rtxArray == null || rtxArray.length == 0) {
        resp.code = ERROR_NOTFOUND,
          resp.message = `No more NID found!`
      } else {
        // Add transaction to Nid one by one in their creation order;
        rtxArray.forEach((rtx, _) => {
          let nid = rtx.output.nid;
//          if(nid=="bloodchen"){
//            console.log("found");
//         }
          if (!(nid in this.nidObjMap)) {
            let onDiskNid = this.loadNIDObjFromDB(nid);
            if (onDiskNid == null) {
              this.nidObjMap[nid] = new NIDObject(nid);
            } else {
              this.nidObjMap[nid] = onDiskNid;
            }
          }
          this.nidObjMap[nid] = NIDManager.fillNIDFromTX(this.nidObjMap[nid], [rtx]);
        });

        for (let nid in this.nidObjMap) {
          if (this.nidObjMap[nid].owner_key != null) {
            this.saveNidObjectToDB(this.nidObjMap[nid]);
          }
        }

        resp.message = "SUCCEED";
        resp.obj = this.nidObjMap;
      }
      // console.log(`Sync to block id ${this.lastBlockId}.`);
      this.saveBatchReadLastBlockId(this.lastBlockId);
      // this.saveLog(rtxArray);


      callback(resp);
    }).catch(err => {
      console.log(err);
      callback({ code: ERROR_UNKNOWN, message: err });
    });
  }

  /**
   * Add config key.
   * @param {Object} keys object stands for key attributes of a NBdomain.
   * @param {*} pubKey public key of the domain owner.
   */
  addConfigKey(keys, pubKey) {
    if (!(CONFIG_KEY in keys)) {
      keys[CONFIG_KEY] = {};
      if (!(PUBLICKEY in keys[CONFIG_KEY])) {
        keys[CONFIG_KEY][PUBLICKEY] = pubKey;
      }

      if (!(ADDRESS in keys[CONFIG_KEY])) {
        keys[CONFIG_KEY][ADDRESS] = BSVUtil.getAddressFromPublicKey(pubKey);
      }
    }
  }

  /**
   * Get a response with unconfimred transactions in the obj field.
   * @returns a promise of response.
   */
  getLocalURTX() {
    return new Promise((resolve, reject) => {
      let data = this.loadURTX();
      let urtxMap = this.outputArrayToMap_(data);

      var resp = {
        code: NO_ERROR,
      };

      if (data.length == 0 || !(this.nid in urtxMap)) {
        resp.code = ERROR_NOTFOUND,
          resp.message = `No unconfirmed transaction found!`
      } else {
        resp.message = "SUCCEED";
        resp.obj = urtxMap[this.nid];
      }
      resolve(resp);
    });
  }

  /**
   * Predict NIDObject with unconfirmed transactions.
   * @returns a promise of response.
   */
  getPredictNidObj() {
    return new Promise((resolve, reject) => {
      let data = this.loadURTX();
      let urtxMap = this.outputArrayToMap_(data);

      this.getLocalNidObject().then(resp => {
        if (data.length == 0 || !(this.nid in urtxMap) || urtxMap[this.nid].length == 0) {
          if ('obj' in resp && resp.obj.owner_key != null) {
            resp.obj.has_unconfirmed = false;
          }
          // No unconfirmed transaction on this nid.
        } else {
          let predictNidObj = NIDManager.fillNIDFromTX(this.nidObj, urtxMap[this.nid]);
          predictNidObj.has_unconfirmed = true;
          if (predictNidObj.owner_key != null) {
            resp.code = NO_ERROR;
            resp.message = "SUCCEED";
            resp.obj = predictNidObj;
          }
        }
        resolve(resp);
      }).catch(err => {
        console.log(err);
        reject({ code: ERROR_UNKNOWN, message: err });
      });
    });
  }

  /**
   * Get NID object from local cache.
   * @returns a promise of response.
   */
  getLocalNidObject() {
    return new Promise((resolve, reject) => {
      let data = this.loadNIDObjFromDB(this.nid);
      if (data == null) {
        this.nidObj = new NIDObject(this.nid);
      } else {
        this.nidObj = data;
      }

      var resp = {
        code: NO_ERROR,
      };
      if (data == null || data.owner_key == null) {
        resp.code = ERROR_NOTFOUND,
          resp.message = `NID [${this.nid}] not found!`
      } else {
        resp.message = "SUCCEED";
        resp.obj = data;

      }
      resolve(resp);
    });
  }

  /**
   * Get valid Readable transactions.
   * ONLY used when a NID object was removed unexpected. Please use populateAllNid() to udpate.
   * @param {Function} callback The callback function.
   */
  updateNidObject_(callback) {

    let onDiskNid = this.loadNIDObjFromDB(this.nid);
    if (onDiskNid == null) {
      this.nidObj = new NIDObject(this.nid);
    } else {
      this.nidObj = onDiskNid;
    }

    let nidRef = this;
    this.fetchRTXsPromise_().then(rtxArray => {
      if (rtxArray != null && rtxArray.length > 0) {
        // Update nidObj with fetched data.
        nidRef.nidObj = NIDManager.fillNIDFromTX(this.nidObj, rtxArray);
        if (nidRef.nidObj.owner_key != null) {
          nidRef.saveNidObjectToDB(nidRef.nidObj);
        }
      }

      var resp = {
        code: NO_ERROR,
      };
      if (nidRef.nidObj == null || nidRef.nidObj.owner_key == null) {
        resp.code = ERROR_NOTFOUND,
          resp.message = `NID [${nidRef.nid}] not found!`
      } else {
        resp.message = "SUCCEED";
        resp.obj = nidRef.nidObj;
      }
      callback(resp);

    }).catch(err => {
      console.log(err);
      callback({ code: ERROR_UNKNOWN, message: err });
    });

  }

  /**
   * Filter out private keys from object.
   * @param {object} data The object to filter.
   * @returns {object} the object with public keys only.
   */
  reduceKeys_(data, hasUserKey) {

    let allowed = ['nid', 'owner_key', 'tld', 'owner', 'txid', 'truncated', 'status', 'admins', 'sell_info', 'has_unconfirmed', 'last_txid'];
    if (hasUserKey) {
      allowed.push('users');
      allowed.push('keys');
    }

    const filtered = Object.keys(data)
      .filter(key => allowed.includes(key) && (key in data))
      .reduce((obj, key) => {
        obj[key] = data[key];
        return obj;
      }, {});

    return filtered;
  }

  /**
   * 
   * @param {*} nid 
   */
  stringifyKeyCmd_(keys) {
    for (let key in keys) {
      if (typeof keys[key] == "object") {
        keys[key] = JSON.stringify(keys[key]);
      }
    }
    return keys;
  }

  objectifyKeyCmd_(keys) {
    for (let key in keys) {
      if (typeof keys[key] == "string") {
        try {
          keys[key] = JSON.parse(keys[key]);
        } catch (e) {
          // not json string;
        }
      }
    }
    return keys;
  }

  /**
   * Load NidObject from db.
   * @param {!NidObject} nid 
   */
  loadNIDObjFromDB(nid) {
    if (nid == null) {
      return null;
    }
    let nidObj = this.sql.loadJson(nid);
    if (nidObj != null) {
      nidObj.tld = Util.getTLDFromRegisterProtocol(this.protocol)[0];
      nidObj.truncated = false;
    }
    return nidObj;
  }

  /**
   * Save NidOject to db.
   * @param {!NidOject} nidObj 
   */
  saveNidObjectToDB(nidObj) {
    if (nidObj == null) {
      return;
    }
    // this.db.saveJson(nidObj);
    nidObj.tld = Util.getTLDFromRegisterProtocol(this.protocol)[0];
    this.sql.saveOrUpdateJson(nidObj);
  }

  /**
   * Get last updated blockid.
   */
  loadBatchReadLastBlockId() {
    let data = this.sql.getLastParsedBlockID();
    if (data != null) {
      return data.blockId;
    }
    return 0;
  }

  /**
   * Save last updated block id.
   * @param {!Number} lastBlkId 
   */
  saveBatchReadLastBlockId(lastBlkId) {
   /* this.sql.saveOrUpdateConfig(BATCH_READ_CONFIG, {
      "blockId": lastBlkId,
      "version": NAMEBSV_SCRIPT_VERSION,
      "nid": BATCH_READ_CONFIG
    });*/
    this.sql.saveLastParsedBlockID(lastBlkId);
  }

  // saveLog(rtxArray) {
  //   this.db.appendLog(rtxArray);
  //   this.sql.appendLog(rtxArray);
  // }
  /**
   * Load unconfirmed transactions from cache.
   * @return Array of unconfirmed transactions.
   */
  loadURTX() {
    // let data = this.db.loadJson(UNCONFIRMED_TRANSACTION_FILE);
    // if (data != null) {
    //   return data.urtx;
    // }
    // return [];
    let list = this.sql.queryUnconfirmedLog();
    if (list != null) {
      for (let i = 0; i < list.length; i++) {
        list[i].output = JSON.parse(list[i].output);
        list[i].blockId = 0;
        list[i].blkTs = Util.tsNowTime();
      }
      return list;
    }
    return null;

  }

  /**
   * Save unconfirmed transactions to cache.
   * @param {Array} urtxList Array of unconfirmed transactions.
   */
  saveURTX(urtxList) {
    // this.db.saveJson({
    //   "urtx": urtxList,
    //   "nid": UNCONFIRMED_TRANSACTION_FILE
    // });
  }

  /**
   * Convert RTX Array to RTX Map with public key as the key of the map.
   * @param {Array} rxArray Array of RTX.
   * @return {Object} Map of RTX, with nid as the key.
   */
  outputArrayToMap_(rxArray) {
    let outputMap = {};
    for (let i = 0; i < rxArray.length; i++) {
      let rx = rxArray[i];
      if (!(rx.output.nid in outputMap)) {
        outputMap[rx.output.nid] = [];
      }
      outputMap[rx.output.nid].push(rx);
    }
    return outputMap;
  }
}


/**
 * A class represents for transaction output scripts.
 */
class TransactionOutput {
  /**
   * @param {Array} txOutArray Array of tx output.
   */
  constructor(txOutArray) {
    this.protocol = txOutArray[0].s2;
    this.nid = txOutArray[0].s3.toLowerCase();
    this.cmd = txOutArray[0].s4.toLowerCase();
    //this.agent = txOutArray[0].s6; // optional agent in s6.
    if (!Util.isValidString(this.nid)) {
      throw new InvalidFormatOutputError("Invalid NID string");
    }
  }
}

/**
 * Transaction output for metadata tx.
 * @extends {TransactionOutput}
 */
class MetaDataOutput extends TransactionOutput {

  /**
   * @param {Array} txOutArray Array of tx output.
   */
  constructor(txOutArray) {
    super(txOutArray);
    this.bitfs = null;
    try {
      if(this.nid=='10200'){
        console.log('found');
      }
      if (txOutArray[0].s5 != null) {
        var extra = JSON.parse(txOutArray[0].s5);
        this.value = extra;
      } else if (txOutArray[0].ls5 != null) {
        var extra = JSON.parse(txOutArray[0].ls5);
        this.value = extra;
      } else if (txOutArray[0].f5 != null) {
        this.bitfs = txOutArray[0].f5;
        this.value = {};
      }
      if(txOutArray[0].s6){
        const tags = JSON.parse(txOutArray[0].s6).tags;
        if(tags)
          this.cmd=="key"? this.tags = tags : this.utags = tags;
      }

      if (typeof this.value != "object") {
        throw new InvalidFormatOutputError("Invalid key transaction record. Record must be object!");
      }

    } catch (err) {
      throw new InvalidFormatOutputError("Invalid format for MetaDataOutput class.");
    }
  }

  resolveBitFsWhenNeeded() {
    if (this.bitfs) {
      return new Promise((resolve, reject) => {
        fetchBtFS(this.bitfs).then(r => {
          if (typeof r != "object") {
            throw new InvalidFormatOutputError("Invalid key transaction record. Record must be object!");
          }
          this.value = r;
          resolve(this);
        }).catch(err => {
          this.code = ERROR_BITFS;
          this.message = err;
          reject(this);
        })
      })
    } else {
      return this;
    }
  }
}

async function fetchBtFS(address) {
  let url = `https://x.bitfs.network/${address}`;
  let res = await axios.get(url);
  let value = res.data;
  return value;
}
/**
 * Transaction output for admin tx.
 * @extends {TransactionOutput}
 */
class AdminOutput extends TransactionOutput {

  /**
   * @param {Array} txOutArray Array of tx output.
   */
  constructor(txOutArray) {
    super(txOutArray);
    try {
      var extra = JSON.parse(txOutArray[0].s5);
      this.key = Object.keys(extra)[0];
      this.value = extra[this.key];
    } catch (err) {
      throw new InvalidFormatOutputError("Invalid format for MetaDataOutput class.");
    }
  }
}

/**
 * Transaction output for register tx.
 * @extends {TransactionOutput}
 */
class RegisterOutput extends TransactionOutput {

  /**
   * @param {Array} txOutArray Array of tx output.
   */
  constructor(txOutArray) {
    super(txOutArray);

    try {
      // Suppose the output array has a fixed order.
      // output 0 - OP_RETURN.
      this.owner_key = txOutArray[0].s5;
      if (txOutArray[0].s6 != null) {
        var extra = JSON.parse(txOutArray[0].s6);
        this.payTx = extra["pay_txid"]
      }
      this.agent = txOutArray[0].s7;
    } catch (err) {
      throw new InvalidFormatOutputError("Invalid format for RegisterOutput class.");
    }

    if (this.owner_key == null || this.owner_key == "") {
      throw new InvalidFormatOutputError("Invalid format for RegisterOutput class.");
    }

    try {
      BSVUtil.getAddressFromPublicKey(this.owner_key);
    } catch (err) {
      throw new InvalidFormatOutputError("Invalid format for RegisterOutput class.");
    }
  }
}

/**
 * Transaction output for nop tx.
 * @extends {TransactionOutput}
 */
class NopOutput extends TransactionOutput {

  /**
   * @param {Array} txOutArray Array of tx output.
   */
  constructor(txOutArray) {
    super(txOutArray);
    this.agent = null;
  }
}


/**
 * Transaction output for sell tx.
 * @extends {TransactionOutput}
 */
class SellOutput extends TransactionOutput {

  /**
   * @param {Array} txOutArray Array of tx output.
   */
  constructor(txOutArray) {
    super(txOutArray);
    try {
      var extra = JSON.parse(txOutArray[0].s5);
      this.buyer = extra["buyer"];
      this.note = extra["note"];
      this.price = Number(extra["price"]);
      this.expire = Number(extra["expire"]);
      this.clear_data = extra["clear_data"];
    } catch (err) {
      throw new InvalidFormatOutputError("Invalid format for SellOutput class.");
    }
  }
}

/**
 * Transaction output for buy tx.
 * @extends {TransactionOutput}
 */
class BuyOutput extends TransactionOutput {

  /**
   * @param {Array} txOutArray Array of tx output.
   */
  constructor(txOutArray) {
    super(txOutArray);

    // Suppose the output array has a fixed order.
    // output 0 - OP_RETURN.
    try {
      var extra = JSON.parse(txOutArray[0].s6);
      this.transferTx = extra['sell_txid'];
      this.payTxid = extra['pay_txid'];
      this.agent = txOutArray[0].s7;
      this.owner_key = txOutArray[0].s5;
    } catch (err) {
      throw new InvalidFormatOutputError("Invalid format for BuyOutput class.");
    }
  }
}

/**
 * Transaction output for transfer tx.
 * @extends {TransactionOutput}
 */
class TransferOutput extends TransactionOutput {

  /**
   * @param {Array} txOutArray Array of tx output.
   */
  constructor(txOutArray) {
    super(txOutArray);

    // Suppose the output array has a fixed order.
    // output 0 - OP_RETURN.
    // output 1:Identity
    // output 2:nUTXO to new owner
    // output 3:1000 sat admin fee to payment address
    try {
      this.owner_key = txOutArray[0].s5.toLowerCase();
      this.transfer_fee = txOutArray[3].e.v;
      this.payment_addr = txOutArray[3].e.a;
    } catch (err) {
      throw new InvalidFormatOutputError("Invalid format for BuyOutput class.");
    }

    if (this.transfer_fee < 1000) {
      throw new InvalidFormatOutputError("Transfer command must pay admin fee 1000 satoshi.");
    }

    let adminAddr = Util.getTLDFromRegisterProtocol(this.protocol)[1]
    if (this.payment_addr != adminAddr) {
      throw new InvalidFormatOutputError("Payment failed, admin address is incorrect.");
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

const STATUS_EXPIRED = 0x00;
const STATUS_VALID = 0x01;
const STATUS_TRANSFERING = 0x11;  // (code:17)

/**
 * Class to represent a NBDomain object.
 */
class NIDObject {
  constructor(nid) {
    this.nid = nid;
    this.owner_key = null;
    this.owner = null;
    this.txid = 0;
    this.status = STATUS_EXPIRED;
    this.expire = 0;
    this.lastTxTs = 0;
    this.keys = {};
    this.key_update_tx = {};
    this.tag_map = {};
    this.users = {};
    this.user_update_tx = {};
    this.admins = [];
    this.admin_update_tx = 0;
    this.sell_info = null;
    this.tf_update_tx = 0;
    this.lastUpdateBlockId = 0;
    this.last_txid = 0;
  }
}

/**
 * NidLoader developer API.
 */
class NidLoader {
  constructor(nbdomain, protocol) {
    if (nbdomain != null) {
      this.nidManager = new NIDManager(null);
      if (!this.nidManager.isValid(nbdomain)) {
        throw new Error("Invalid NBDomain!");
      }
    } else if (protocol != null) {
      // Init NidManager even protocol is null;
      this.nidManager = new NIDManager(protocol);
    } else {
      throw new Error("At least one of the following needs to be set [nbdomain, protocol].");
    }
  }

  /**
   * Server side function that read local NidObject cache.
   * @param {*} domain NBDomain.
   * @param {*} callback callback method.
   */
  readLocalNid(domain, callback) {
    if (!Util.isValidDomain(domain) || !this.nidManager.isValid(domain)) {
      var resp = {
        code: ERROR_NID_NOT_VALID,
        message: `NID [${domain}] is not valid!`
      };
      callback(resp);
      return;
    }

    this.nidManager.getLocalNidObject().then(resp => {
      // Deep copy since keys will be output as strings.
      resp.obj = JSON.parse(JSON.stringify(resp.obj));
      resp = this.getSubDomain(resp);
      callback(resp);
    }).catch(err => {
      console.log(err);
      callback({ code: ERROR_UNKNOWN, message: err });
    });
  }

  getSubDomain(resp) {
    if (this.nidManager.subDomain != null && resp.code == NO_ERROR) {
      if (this.nidManager.subDomain in resp.obj.keys) {
        resp.txid = resp.obj.key_update_tx[this.nidManager.subDomain];
        resp.obj = resp.obj.keys[this.nidManager.subDomain];
        if(resp.obj==="$truncated"){
          resp.obj = this.nidManager.sql.readKey(this.nidManager.subDomain+"."+this.nidManager.nid);
        }
      } else {
        resp = {
          code: ERROR_KEY_NOTFOUND,
          message: "No such key in this domain!"
        }
      }
    } else if (this.nidManager.user != null && resp.code == NO_ERROR) {
      // Pass entire response to next step to process for user command.
    } else {
      // Reduce key when it's not a subdomain query.
      resp.obj = this.nidManager.reduceKeys_(resp.obj, true);
    }
    return resp;
  }

  /**
   * Server side function that read local NidObject cache.
   * @param {*} domain NBDomain.
   * @param {*} callback callback method.
   */
  readLocalPredictNid(domain, callback) {
    if (!Util.isValidDomain(domain) || !this.nidManager.isValid(domain)) {
      var resp = {
        code: ERROR_NID_NOT_VALID,
        message: `NID [${domain}] is not valid!`
      };
      callback(resp);
      return;
    }

    this.nidManager.getPredictNidObj().then(resp => {
      if (resp.code == NO_ERROR) {
        resp.obj = JSON.parse(JSON.stringify(resp.obj));
        let nidObj = resp.obj;
        if (nidObj.status == STATUS_TRANSFERING && nidObj.sell_info.expire < Util.tsNowTime()) {
          nidObj.sell_info = null;
          nidObj.tf_update_tx = 0;
          nidObj.status = STATUS_VALID;
        }
        resp = this.getSubDomain(resp);
      }
      if (resp.code == ERROR_NOTFOUND && this.nidManager.subDomain == null && this.nidManager.user == null) {
        NIDManager.fetchDomainAvailibility(this.nidManager.domain, function (r) {
          for (let k in r) {
            if (!(k in resp)) {
              resp[k] = r[k];
            }
            if (k == 'type' && r[k] == "100") {
              // Reseved domain
              resp.code = ERROR_DOMAIN_RESERVED; 
            }
          }
          callback(resp);
        });
        return;
      }
      callback(resp);
    }).catch(err => {
      console.log(err);
      callback({ code: ERROR_UNKNOWN, message: err });
    });
  }

  readUserProperty(nid, callback) {
    let pos = nid.indexOf("@");
    let user = nid.substr(0, pos);
    this.nidManager.user = user;
    let domain = nid.substr(pos + 1);
    let self = this;
    this.readLocalPredictNid(domain, function (resp) {
      if (resp.code == NO_ERROR) {
        resp = self.getUserProperty(resp, user);
      }
      callback(resp);
    });
  }

  getUserProperty(resp, user) {
    if (user in resp.obj.users) {
      resp.txid = resp.obj.user_update_tx[user];
      resp.obj = resp.obj.users[user];
    } else {
      resp = {
        code: ERROR_KEY_NOTFOUND,
        message: "No such user in this domain!"
      }
    }
    return resp;
  }

  /**
   * Server side function that read local unconfirmed transaction cache.
   * @param {*} domain NBDomain.
   * @param {*} callback callback method.
   */
  readLocalURTX(domain, callback) {
    if (!Util.isValidDomain(domain) || !this.nidManager.isValid(domain)) {
      var resp = {
        code: ERROR_NID_NOT_VALID,
        message: `NID [${domain}] is not valid!`
      };
      callback(resp);
      return;
    }

    this.nidManager.getLocalURTX().then(resp => {
      callback(resp);
    }).catch(err => {
      console.log(err);
      callback({ code: ERROR_UNKNOWN, message: err });
    });
  }
}

class NidSynchronizer {
  constructor(nbdomain, protocol) {
    if (nbdomain != null) {
      this.nidManager = new NIDManager(null);
      if (!this.nidManager.isValid(nbdomain)) {
        throw new Error("NidSynchronizer class needs either a valid nbdomain or protocol!");
      }
    } else if (protocol != null) {
      // Init NidManager even protocol is null;
      this.nidManager = new NIDManager(protocol);
    } else {
      throw new Error("At least one of the following needs to be set [nbdomain, protocol].");
    }
  }

  /**
   * Server side function that update local NidObject cache.
   * @param {!function} callback callback method.
   */
  updateNidFiles(callback) {
    this.nidManager.populateAllNid().then(resp => {
      callback(resp);
    }).catch(err => {
      console.log(err);
      callback({ code: ERROR_UNKNOWN, message: err });
    });
  }
}


class CrossDBReader {
  constructor(tlds=null) {
    if (tlds == null) {
      this.protocols = Util.getAllRegProtocols();
    } else {
      let tldMap = {};
      for (let i=0; i<tlds.length; i++) {
        tldMap[tlds[i]] = tlds[i];
      }
      this.protocols = Util.getAllRegProtocols(tldMap);
    }
  }

  searchNid(k, v, truncated) {
      let allDBresults = []
      this.protocols.forEach(function (protocol) {
          let nidManager = new NIDManager(protocol);
          let result = nidManager.sql.queryAll(k, v);
          if (result == null) {
              return;
          }
          allDBresults = allDBresults.concat(result.map(function (val, index) {
              let nidObj = nidManager.reduceKeys_(JSON.parse(val.jsonString), false);
              // if (truncated) {
              //   if (truncated && nidObj.keys) {
              //     for (let k in nidObj.keys) {
              //       let v = nidObj.keys[k];
              //       if (v.length > 512) {
              //         nidObj.keys[k] = '$truncated';
              //       }
              //     }
              //   }
              // }
              return nidObj;
          }));
      });

      return allDBresults;
  }
}


module.exports = {
  NidSynchronizer: NidSynchronizer,
  NidFetcher: NidFetcher,
  NidLoader: NidLoader,
  NIDManager: NIDManager,
  CrossDBReader: CrossDBReader,
  BSVWriter:BSVWriter,
}