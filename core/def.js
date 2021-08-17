const ERR = {
    NO_ERROR: 0,
    UNKNOWN: -1000,
    INVALID_OWNER: 10,
    INVALID_REGISTER: 12,
    PERMISSION_DENIED: 13,
    DOMAIN_NOT_VALID: 14,
    DOMAIN_NOT_AVAILALE: 15,
    NOTFOUND: 100,
    DOMAIN_RESERVED: 101,
    KEY_NOTFOUND: 102
};
const CMD = {
    "REGISTER": "register",
    "KEY": "key",
    "USER": "user",
    "ADMIN": "admin",
    "SELL": "sell",
    "BUY": "buy",
    "TRANSFER": "transfer",
    "NOP": "nop",
    "PAY_REGISTER": "pay_register",
    "PAY_BUY": "pay_buy",
    NFT_CREATE: "nft.create",
    NFT_TRANSFER: "nft.transfer",
    NFT_SELL: "nft.sell",
    NFT_BUY: "nft.buy",
    NFT_REFILL: "nft.refill"
};
const DEF = {
    BLOCK_SIGNATURE_UPDATE: 637628,
    STATUS_EXPIRED: 0x00,
    STATUS_VALID: 0x01,
    STATUS_TRANSFERING: 0x11  // (code:17)
}
class NIDObject {
    constructor(domain) {
        this.domain = domain;
        const ids = domain.split(".");
        if (ids.length < 2) throw ("NIDOBject init with:", domain);
        this.nid = ids[0];
        this.tld = ids[1];
        this.owner_key = null;
        this.owner = null;
        this.txid = 0;
        this.status = DEF.STATUS_EXPIRED;
        this.expire = 0;
        this.lastTxTs = 0;
        this.keys = {};
        this.key_update_tx = {};
        this.tag_map = {};
        this.users = {};
        this.user_update_tx = {};
        this.admins = [];
        this.admin_update_tx = 0;
        this.nft_log = {};
        this.sell_info = null;
        this.tf_update_tx = 0;
        this.lastUpdateBlockId = 0;
        this.last_txid = 0;
        this.truncated = false;
    }
};

module.exports = {
    ERR, CMD, NIDObject, DEF
}