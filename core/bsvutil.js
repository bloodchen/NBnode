/**
 * A helper class to manipulater BSV entities.
 */

var isBrowser = isBrowser || new Function("try {return this===window;}catch(e){ return false;}");

if (isBrowser() === false) {
    filepay = require('filepay');
};

class BSVUtil {

    /**
     * Get hash code of NID.
     * @param {!string} nid A NID string.
     * @returns {!string} Hex encoded NID hash.
     */
    static getNIDHash(nid) {
        return filepay.bsv.crypto.Hash.sha256(nid).toString("hex");
    }

    /**
     * Get PrivateKey from string.
     * @param {!string} privateKey User private key in string.
     * @returns {PrivateKey} User's private key object.
     */
    static getPrivateKey(privateKey) {
        return filepay.bsv.PrivateKey(privateKey);
    }

    /**
     * Generate user public key from his private key object.
     * @param {!PrivateKey} privateKey The private key of a user.
     * @return {!PublicKey} Public key of the user.
     */
    static getPublicKey(privateKey) {
        return filepay.bsv.PublicKey(privateKey);
    }

    /**
     * Get Address from public key.
     * @param {string} publicKey public key of a user.
     * @returns {string} Address of given user.
     */
    static getAddressFromPublicKey(publicKey) {
        if (publicKey == null || publicKey == "") {
            return null;
        }
        return filepay.bsv.Address.fromPublicKey(filepay.bsv.PublicKey.fromString(publicKey)).toString();
    }

    static getInputAddressFromTx(txHash) {
        try {
            let tx = new filepay.bsv.Transaction(txHash);
            return tx.inputs[0].script.toAddress().toString();
        } catch (err) {
            return null;
        }
    }

    static getPublicKeyFromRegTx(txHash) {
        try {
            let tx = new filepay.bsv.Transaction(txHash);
            return tx.inputs[0].script.chunks[1].buf.toString('hex');
        } catch (err) {
            return null;
        }
    }

    static validPublicKey(pubKey) {
        try {
            let key = filepay.bsv.PublicKey.fromString(pubKey);
            return true;
        } catch (err) {
            // pass
        }
        return false;
    }
};

if (isBrowser() == false) {
    module.exports = BSVUtil
}
