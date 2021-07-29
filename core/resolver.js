const { DomainTool } = require('./domainTool')
const { ERR } = require('./def')
const Parser = require('./parser')



const MAX_RESOLVE_COUNT = 10000
let g_nidObjMap = {}

/**
   * Filter out private keys from object.
   * @param {object} data The object to filter.
   * @returns {object} the object with public keys only.
   */
function reduceKeys_(data, includeKeyUser) {

    let allowed = ['nid', 'owner_key', 'tld', 'owner', 'txid', 'status', 'admins', 'sell_info', 'has_unconfirmed', 'last_txid'];
    if (includeKeyUser) {
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

class NIDObject {
    constructor(domain) {
        this.domain = domain
        const ids = domain.split('.')
        if (ids.length < 2) throw ("NIDOBject init with:", domain)
        this.nid = ids[0]
        this.tld = ids[ids.length - 1]
        this.owner_key = null
        this.owner = null
        this.txid = 0
        this.status = 0
        this.expire = 0
        this.lastTxTs = 0
        this.keys = {}
        this.update_tx = {}
        this.tag_map = {}
        this.users = {}
        this.admins = []
        this.admin_update_tx = 0
        this.sell_info = null
        this.tf_update_tx = 0
        this.lastUpdateBlockId = 0
        this.last_txid = 0
    }
}

class Resolver {
    constructor(database) {
        this.db = database
        this.resolveNextBatchInterval = 5000
        this.resolveNextBatchTimerId = 0

    }
    start() {
        if (this.started) return
        this.started = true
        this.resolveNextBatch()
    }
    stop() {
        this.started = false
        clearTimeout(this.resolveNextBatchTimerId)
        this.pollForNewBlocksTimerId = null
    }
    findDomain(k, v) {
        let result = this.db.queryDomains(k, v);
        if (result == null) {
            return {};
        }
        const all = result.map(function (val) {
            let nidObj = reduceKeys_(JSON.parse(val.jsonString), false);
            return nidObj;
        });
        return all;
    }
    readSubdomain(fullDomain) {
        let baseDomain, subDomain;
        const dd = fullDomain.split('.');
        if (dd.length < 2) return null;
        const lastAT = fullDomain.lastIndexOf('@');
        if (lastAT != -1 && dd.length == 2) { //an email like address
            baseDomain = fullDomain.slice(lastAT + 1);
            subDomain = fullDomain.slice(0, lastAT + 1); //includes @
        } else {
            baseDomain = dd[dd.length - 2] + '.' + dd[dd.length - 1];
            dd.pop(); dd.pop();
            subDomain = dd.join('.') + '.'; //incluses .
        }
        const obj = this.db.loadDomain(baseDomain)
        if (obj) {
            const subObj = this.db.readKey(fullDomain)
            if (subObj) {
                return { code: 0, obj: subObj, txid: obj.update_tx[subDomain] }
            }
        }
        return null;
    }
    async readDomain(fullDomain, forceFull) {
        const dd = fullDomain.split('.')
        if (dd.length < 2) return null;
        let obj = null
        if (dd.length === 2) {
            if (fullDomain.indexOf('@') != -1) { //an email like address
                return this.readSubdomain(fullDomain);
            }
            obj = this.db.loadDomain(fullDomain)
            if (obj) {
                obj = reduceKeys_(obj, true)
                obj.truncated = Object.values(obj.keys).indexOf('$truncated') != -1 ? true : false
                if (forceFull) { //expand $truncated keys
                    for (const key in obj.keys) {
                        if (obj.keys[key] === "$truncated") {
                            obj.keys[key] = this.db.readKey(key + "." + fullDomain);
                        }
                    }
                }
                return { code: 0, obj: obj }
            }
            let ret = await DomainTool.fetchDomainAvailibility(fullDomain);
            ret.code = ERR.NOTFOUND;
            return ret;
        }
        const ret = this.readSubdomain(fullDomain);
        if (ret) return ret;
        return { code: ERR.KEY_NOTFOUND, message: fullDomain + " not found" }

    }
    resolveNextBatch() {
        if (!this.started) return
        const rtxArray = this.db.getUnresolvedTX(MAX_RESOLVE_COUNT)

        try {
            if (rtxArray == null || rtxArray.length == 0) {
                if (!this.firstFinish) {
                    console.warn("------Handled All current TX from DB-------")
                    this.firstFinish = true
                    g_nidObjMap = {}; //release memory
                }
            } else {
                let lastResolvedId = 0;
                console.log("get ", rtxArray.length, " txs from DB")
                // Add transaction to Nid one by one in their creation order
                try {
                    rtxArray.forEach((rtx, _) => {
                        if (!rtx.output||rtx.output.err) return;
                        let domain = rtx.output.domain
                        if (!(domain in g_nidObjMap)) {
                            let onDiskNid = this.db.loadDomain(domain)
                            if (!onDiskNid) {
                                g_nidObjMap[domain] = new NIDObject(domain)
                            } else {
                                g_nidObjMap[domain] = onDiskNid
                            }
                        }
                        //const obj = DomainTool.fillNIDFromTX(g_nidObjMap[domain], [rtx])
                        //const obj = DomainTool.fillNIDFromTX(g_nidObjMap[domain], rtx)
                        const obj = Parser.fillObj(g_nidObjMap[domain],rtx)
                        if (obj){
                            g_nidObjMap[domain] = obj
                            g_nidObjMap[domain].dirty = true

                        }
                            
                        lastResolvedId = rtx.id
                    })
                } catch (e) {
                    console.error(e);
                }

                for (let domain in g_nidObjMap) {
                    if (g_nidObjMap[domain].owner_key != null && g_nidObjMap[domain].dirty === true) {
                        console.log("updating:", domain)
                        this.db.saveDomainObj(g_nidObjMap[domain])
                        g_nidObjMap[domain].dirty = false
                    }
                }
                if (lastResolvedId != 0)
                    this.db.saveLastResolvedId(lastResolvedId)
            }

        } catch (err) {
            console.log(err)
        }
        this.resolveNextBatchTimerId = setTimeout(this.resolveNextBatch.bind(this), this.resolveNextBatchInterval)
    }
}
// ------------------------------------------------------------------------------------------------

module.exports = Resolver