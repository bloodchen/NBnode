/**
 * A helper class for NID transacations.
 */

const config = require('./config.js');

const defaultConfig = config[config.env];
const SUB_PROTOCOL_MAP = defaultConfig.tld_config;

class Util {

    /**
     * Convert NID string to unit array.
     * @param {!string} str A NID string.
     * @return {!Uint8Array} A unit represents for NID.
     */
    static strToUnitArray(str) {
        let arrayBuffer = new ArrayBuffer(str.length * 1);
        let unitArray = new Uint8Array(arrayBuffer);
        unitArray.forEach((_, i) => {
            unitArray[i] = str.charCodeAt(i);
        });
        return unitArray;
    }

    /**
     * Generate hex encoded nid from raw string.
     * @param {!string} nid Raw string of nid.
     * @return {!string} Hex encoded string of nid.
     */
    static hexEncode(nid) {
        nid = nid.toLowerCase();
        if (isBrowser()) {
            return BSVUtil.getNIDHash(Util.strToUnitArray(nid));
        } else {
            return BSVUtil.getNIDHash(Buffer.from(nid));
        }
    }

    /**
     * Generate base64 encoded query.
     * @param {!Object} query A BitQuery object.
     * @return {!string} A base64 encoded string.
     */
    static base64Encode(query) {
        if (isBrowser()) {
            return btoa(JSON.stringify(query));
        } else {
            return Buffer.from(JSON.stringify(query)).toString('base64');
        }
    }

    /**
     * Get timestamp one week after now.
     * @return {!number} A number represents timestamp (milliseconds) one week after now.
     */
    static tsOneWeekLater() {
        return Number(new Date().getTime()) + 7 * 24 * 60 * 60 * 1000;
    }

    /**
     * Get current timestamp.
     */
    static tsNowTime() {
        return Number(new Date().getTime());
    }

    /**
     * Get timestamp one week after now.
     * @return {!number} A number represents timestamp (milliseconds) one week after now.
     */
    static tsOneYearLater(ts) {
        return Number(ts) + 24 * 60 * 60 * 365 * 1000;
    }

    /**
     * Get timestamp one week after now.
     * @return {!number} A number represents timestamp (milliseconds) one week after now.
     */
    static tsOneYearAgo(ts) {
        return Number(ts) - 24 * 60 * 60 * 365 * 1000;
    }

    /**
     * Check if domain is valid.
     * @param {!string} domain NID to check.
     * @return {Boolean} True if nid is valid.
     */
    static isValidDomain(domain) {
        if (!domain || (typeof domain !== 'string') || (domain.length <= 0)) {
            return false
        }
        const regex = /([a-z0-9]+\.)?[a-zA-Z0-9-_]+(\.)[a-z]+/g;
        const found = domain.match(regex);
        return found;
    }

    /**
     * Check if given string is valid (without TLD).
     * @param {!string} nid 
     */
    static isValidString(nid) {
        if (!nid || (typeof nid !== 'string') || (nid.length <= 0)) {
            return false;
        }
        const regex = /[a-zA-Z\d\-._~\!$()*+,;=]+/g;
        const found = nid.match(regex);
        return found;
    }

    /**
     * Parse given domain.
     * @param {!string} nbdomain 
     * @returns array of [subdomian, domain, tld]
     */
    static parseNid(nbdomain) {
        let parts = nbdomain.split(".");
        let l = parts.length
        if (l == 1) {
            // Nid without tld.
            return [null, nbdomain, null];
        }
        if (l == 2) {
            // NBdomain.
            return [null, parts[l-2], parts[l-1]];
        }
        if (l > 2) {
            // NBdomain with subdomain.
            //return [parts[l-3], parts[l-2], parts[l-1]];
            const tld = parts.pop();
            const nid = parts.pop(); //delete tld and nid
            return [parts.join('.'),nid,tld]; //return subdomain, can handle case like 1.abc.1010.test
        } 
        return null;
    }

    /**
     * Check if a given variable is an object.
     * @param {*} item 
     * @returns true if variable is an object.
     */
    static isObject(item) {
        return (item && typeof item === 'object' && !Array.isArray(item));
    }

    static getRegisterProtocolFromPayment(payment) {
        for (let tld in SUB_PROTOCOL_MAP) {
            let tldcfg = SUB_PROTOCOL_MAP[tld];
            if (tldcfg.address.payment == payment) {
                return [tld, tldcfg.address.protocol];
            }
        }
        return [null, null];
    }
    static getProcotolFromTLD(tld){
        if(SUB_PROTOCOL_MAP[tld]){
            return SUB_PROTOCOL_MAP[tld].address.protocol;
        }
        return null;
    }
    static getTLDFromRegisterProtocol(register) {
        for (let tld in SUB_PROTOCOL_MAP) {
            let tldcfg = SUB_PROTOCOL_MAP[tld];
            if (tldcfg.address.protocol == register) {
                return [tld, tldcfg.address.payment];
            }
        }
        return [null, null];
    }

    static getAllRegProtocols(tlds=SUB_PROTOCOL_MAP) {
        let allProtocols = [];
        for (let tld in tlds) {
            allProtocols.push(SUB_PROTOCOL_MAP[tld].address.protocol);
        }
        if (allProtocols.length == 0) {
            throw new Error("No valid protocol found!");
        }
        return allProtocols;
    }

    static getAllPaymentProtocols(incTesting) {
        let allProtocols = [];
        for (let tld in SUB_PROTOCOL_MAP) {
            if (!incTesting && SUB_PROTOCOL_MAP[tld].testing) {
                continue;
            }
            allProtocols.push(SUB_PROTOCOL_MAP[tld].address.payment);
        }
        if (allProtocols.length == 0) {
            throw new Error("No valid protocol found!");
        }
        return allProtocols;
    }

    static getPaymentAddr(protocol) {
        for (let tld in SUB_PROTOCOL_MAP) {
            if (SUB_PROTOCOL_MAP[tld].address.protocol == protocol) {
                return SUB_PROTOCOL_MAP[tld].address.payment;
            }
        }
        return null;
    }

    static getAdmins(protocol, blockId) {
        let admins = [];
        for (let tld in SUB_PROTOCOL_MAP) {
            if (SUB_PROTOCOL_MAP[tld].address.protocol == protocol) {
                admins.push(SUB_PROTOCOL_MAP[tld].address.admin);
                let otherAdmins = SUB_PROTOCOL_MAP[tld].address.other_admins;
                if (blockId) {
                    for (let i=0; i<otherAdmins.length; i++){
                        if (blockId > otherAdmins[i].start_block && blockId <= otherAdmins[i].end_block) {
                            admins.push(otherAdmins[i].address);
                        }
                    }
                }
                return admins;
            }
        }
        return admins;
    }

    /**
     * Deep merge object for key command.
     * @param {Object} target 
     * @param  {...any} sources 
     */
    static mergeDeep(target, ...sources) {
        if (!sources.length) return target;
        const source = sources.shift();

        if (Util.isObject(target) && Util.isObject(source)) {
            for (const key in source) {
                if (!target[key] || (!Util.isObject(source[key]) || !Util.isObject(target[key]))) {
                    target[key] = source[key];
                } else {
                    Util.mergeDeep(target[key], source[key]);
                }
            }
        }

        return Util.mergeDeep(target, ...sources);
    }
}

module.exports = Util
