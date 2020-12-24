const fs = require('fs');
const Database = require('better-sqlite3');

const BSV_DB_PATH = __dirname + `/sqldb/`;
const DB_FILE_NAME = 'nbdomain.db';

class SQLDB {
    constructor(protocolId) {
        this.path = BSV_DB_PATH + protocolId + '/';
        fs.mkdir(this.path, { recursive: true }, (err) => {
            if (err) throw err;
        });
    }

    getDBPath() {
        return this.path + DB_FILE_NAME;
    }

    loadJson(nid) {
        if (nid != null) {
            let result = this.getOne(`SELECT * FROM "nidobj" WHERE "nid" = ?`, nid);
            if (result != null) {
                return JSON.parse(result.jsonString);
            }
        }
        return null;
    };

    queryBy(field, value) {
        if (field != null) {
            return this.getOne(`SELECT * FROM "nidobj" WHERE ${field} = ?`, value);
        }
        return null;
    }

    queryAll(field, value) {
        if (field != null) {
            return this.getAll(`SELECT * FROM "nidobj" WHERE ${field} = ?`, value);
        }
        return null;
    }

    getAllMatches(field, value) {
        if (field != null) {
            let self = this;
            return this.getAll(`SELECT * FROM "nidobj" WHERE ${field} LIKE ?`, value);
        }
        return null;
    }

    saveJson(nidObj) {
        if (nidObj != null) {
            let db = new Database(this.path + DB_FILE_NAME, { verbose: null });
            let sql = `INSERT INTO "nidobj" 
                ("nid", "owner", "owner_key", "status", "last_txid", "lastUpdateBlockId", "jsonString") 
                VALUES (?, ?, ?, ?, ?, ?, ?);`

            // insert one row into the langs table
            const insert = db.prepare(sql).run(nidObj.nid, nidObj.owner, nidObj.owner_key, nidObj.status, nidObj.last_txid, nidObj.lastUpdateBlockId, JSON.stringify(nidObj));
            // console.log(insert.changes);
            // close the database connection
            db.close();
        }
    }

    savePayTx(payTx) {
        if (payTx != null) {
            let db = new Database(this.path + DB_FILE_NAME, { verbose: null });
            let sql = `INSERT INTO "paytx" 
                ("nid", "publicKey", "tld", "protocol", "payment_txid", "raw_tx", "type", "ts") 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?);`

            const insert = db.prepare(sql).run(payTx.nid, payTx.owner_key, payTx.tld, payTx.protocol, 
                payTx.payment_txid, payTx.raw_tx, "register", Number(new Date().getTime()));
            db.close();
        }
    }

    saveBuyTx(payTx) {
        if (payTx != null) {
            let db = new Database(this.path + DB_FILE_NAME, { verbose: null });
            let sql = `INSERT INTO "paytx" 
                ("nid", "publicKey", "tld", "protocol", "payment_txid", "raw_tx", "type", "ts") 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?);`

            const insert = db.prepare(sql).run(payTx.nid, payTx.owner_key, payTx.tld, payTx.protocol, 
                payTx.payment_txid, payTx.raw_tx, "buy", Number(new Date().getTime()));
            db.close();
        }
    }

    getPayTx(nid) {
        return this.getOne(`SELECT * FROM "paytx" WHERE "nid" = ? and "type" = 'register'`, nid);
    }


    getBuyTx(nid) {
        return this.getOne(`SELECT * FROM "paytx" WHERE "nid" = ? and "type" = 'buy'`, nid);
    }

    deletePayTx(nid) {
        if (nid != null) {
            let db = new Database(this.path + DB_FILE_NAME, { verbose: null });
            let sql = `DELETE FROM "paytx" where "nid" = ? and "type" = 'register';`
            const rm = db.prepare(sql).run(nid);
            db.close();
        }
    }

    deleteBuyTx(nid) {
        if (nid != null) {
            let db = new Database(this.path + DB_FILE_NAME, { verbose: null });
            let sql = `DELETE FROM "paytx" where "nid" = ? and "type" = 'buy';`
            const rm = db.prepare(sql).run(nid);
            db.close();
        }
    }

    saveOrUpdateConfig(key, val) {
        if (key != null) {
            let db = new Database(this.path + DB_FILE_NAME, { verbose: null });
            const row = db.prepare(`SELECT * FROM "config" WHERE "key" = ?`).get(key);
            if (row == null) {
                let sql = `INSERT INTO "config" ("key", "value") VALUES (?, ?);`;

                // insert one row into the langs table
                const insert = db.prepare(sql).run(key, JSON.stringify(val));
                // console.log(insert.changes);
            } else {
                let sql = `UPDATE "config" SET "value" = ? WHERE "key" = ?`

                // insert one row into the langs table
                const update = db.prepare(sql).run(JSON.stringify(val), key);
                // console.log(update.changes);
            }
            db.close();
        }
    }

    getConfig(key) {
        let cfg = this.getOne(`SELECT * FROM 'config' WHERE "key" = ?`, key);
        if (cfg != null) {
            return JSON.parse(cfg.value);
        }
        return null;
    }

    updateJson(nidObj) {
        if (nidObj != null) {
            let db = new Database(this.path + DB_FILE_NAME, { verbose: null });
            let sql = `UPDATE "nidobj" 
                SET "owner" = ?, 
                    "owner_key" = ?, 
                    "status" = ?,
                    "last_txid" = ?,
                    "lastUpdateBlockId" = ?,
                    "jsonString" = ?
                WHERE "nid" = ?`

            // insert one row into the langs table
            const update = db.prepare(sql).run(nidObj.owner, nidObj.owner_key, nidObj.status, nidObj.last_txid, nidObj.lastUpdateBlockId, JSON.stringify(nidObj), nidObj.nid);
            // console.log(update.changes);
            // close the database connection
            db.close();
        }
    }

    queryLog(nid, blockId) {
        if (nid != null) {
            // Not implemented yet.
            return null;
        } else {
            return this.getAll(`SELECT * FROM "transac" WHERE blockId > ? ORDER BY id ASC LIMIT 2000`, blockId);
        }
    }

    queryLogById(dbTxId) {        
        return this.getAll(`SELECT * FROM "transac" WHERE id > ? ORDER BY id ASC LIMIT 2000`, dbTxId);
    }

    queryUnconfirmedLog() {
        return this.getAll(`SELECT * FROM "unconfirmed_transac"`);
    }

    queryFailedBitFSLog() {
        return this.getAll(`SELECT * FROM "transac" where "command" = 'key' and "output" LIKE '%value":{}%' and NOT "output" LIKE '%"bitfs":null,%'`);
    }

    checkLog(table, hash) {
        return this.getOne(`SELECT * FROM ${table} WHERE "hash" = ?`, hash) != null;
    }

    getLog(table, hash) {
        return this.getOne(`SELECT * FROM ${table} WHERE "hash" = ?`, hash);
    }

    appendLog(rtxArray) {
        if (rtxArray != null) {
            let db = new Database(this.path + DB_FILE_NAME, { verbose: null });
            for (let i in rtxArray) {
                let rtx = rtxArray[i];
                if (this.checkLog("transac", rtx.hash)) {
                    continue;
                }
                let sql = `INSERT INTO "transac" 
                    ("blkTs", "hash", "publicKey", "blockId", "command", "inputAddress", "output", "in", "out") 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`

                // insert one row into the langs table
                const insert = db.prepare(sql).run(rtx.blkTs, rtx.hash, rtx.publicKey, rtx.blockId, 
                    rtx.command, rtx.inputAddress, JSON.stringify(rtx.output),
                    JSON.stringify(rtx.in), JSON.stringify(rtx.out));
                // console.log(insert.changes);
            }
            db.close();
        }
    }

    updateLog(rtxArray) {
        let notFound = [];
        if (rtxArray != null) {
            let db = new Database(this.path + DB_FILE_NAME, { verbose: null });
            for (let i in rtxArray) {
                let rtx = rtxArray[i];
                if (!this.checkLog("transac", rtx.hash)) {
                    notFound.push(rtx);
                }
                let sql = `UPDATE "transac" 
                SET "blkTs" = ?, 
                    "publicKey" = ?, 
                    "blockId" = ?,
                    "command" = ?,
                    "inputAddress" = ?,
                    "output" = ?,
                    "in" = ?,
                    "out" = ?
                WHERE "hash" = ?`

                // insert one row into the langs table
                const update = db.prepare(sql).run(rtx.blkTs, rtx.publicKey, rtx.blockId, 
                    rtx.command, rtx.inputAddress, JSON.stringify(rtx.output),
                    JSON.stringify(rtx.in), JSON.stringify(rtx.out), rtx.hash);
                // console.log(update.changes);
            }
            db.close();
        }
        this.appendLog(notFound);
    }

    updateUnLog(rtxArray) {
        let notFound = [];
        if (rtxArray != null) {
            let db = new Database(this.path + DB_FILE_NAME, { verbose: null });
            for (let i in rtxArray) {
                let rtx = rtxArray[i];
                if (!this.checkLog("unconfirmed_transac", rtx.hash)) {
                    notFound.push(rtx);
                }
                let sql = `UPDATE "unconfirmed_transac" 
                SET "publicKey" = ?, 
                    "command" = ?,
                    "inputAddress" = ?,
                    "output" = ?,
                    "in" = ?,
                    "out" = ?
                WHERE "hash" = ?`

                // insert one row into the langs table
                const update = db.prepare(sql).run(rtx.publicKey,
                    rtx.command, rtx.inputAddress, JSON.stringify(rtx.output),
                    JSON.stringify(rtx.in), JSON.stringify(rtx.out), rtx.hash);
                // console.log(update.changes);
            }
            db.close();
        }
        this.appendUnconfirmedLog(notFound);
    }

    appendUnconfirmedLog(rtxArray) {
        if (rtxArray != null) {
            let db = new Database(this.path + DB_FILE_NAME, { verbose: null });
            for (let i in rtxArray) {
                let rtx = rtxArray[i];
                if (this.checkLog("unconfirmed_transac", rtx.hash)) {
                    continue;
                }
                let sql = `INSERT INTO "unconfirmed_transac" 
                    ("hash", "publicKey", "command", "inputAddress", "output", "in", "out") 
                    VALUES (?, ?, ?, ?, ?, ?, ?);`

                // insert one row into the langs table
                const insert = db.prepare(sql).run(rtx.hash, rtx.publicKey, rtx.command, rtx.inputAddress, 
                    JSON.stringify(rtx.output), JSON.stringify(rtx.in), JSON.stringify(rtx.out));
                // console.log(insert.changes);
            }
            db.close();
        }
    }

    deleteLog(hash) {
        if (hash != null) {
            let db = new Database(this.path + DB_FILE_NAME, { verbose: null });
            let sql = `DELETE FROM "transac" where "hash" = ?;`

            // insert one row into the langs table
            const rm = db.prepare(sql).run(hash);
            // console.log(insert.changes);
            db.close();
        }
    }

    deleteUnconfirmedLog(hash) {
        if (hash != null) {
            let db = new Database(this.path + DB_FILE_NAME, { verbose: null });
            let sql = `DELETE FROM "unconfirmed_transac" where "hash" = ?;`

            // insert one row into the langs table
            const rm = db.prepare(sql).run(hash);
            // console.log(insert.changes);
            db.close();
        }
    }

    emptyDB() {
        let db = new Database(this.path + DB_FILE_NAME, { verbose: null });
        let sql = `DELETE FROM "nidobj";`
        let sql2 = `DELETE FROM "config"`;
        let sql3 = `DELETE FROM "unconfirmed_transac"`;

        // empty table
        const rm = db.prepare(sql).run();
        const rm2 = db.prepare(sql2).run();
        const rm3 = db.prepare(sql3).run();
        // console.log(rm.changes);

        let sql4 = `DELETE FROM "transac";`

        // // empty table
        const rm4 = db.prepare(sql4).run();

        // close the database connection
        db.close();
    }

    saveOrUpdateJson(nidObj) {
        if (nidObj != null) {
            let db = new Database(this.path + DB_FILE_NAME, { verbose: null });
            const row = db.prepare(`SELECT * FROM "nidobj" WHERE "nid" = ?`).get(nidObj.nid);
            if (row == null) {
                let sql = `INSERT INTO "nidobj" 
                ("nid", "owner", "owner_key", "status", "last_txid", "lastUpdateBlockId", "jsonString", "tld") 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?);`

                // insert one row into the langs table
                const insert = db.prepare(sql).run(nidObj.nid, nidObj.owner, nidObj.owner_key, nidObj.status, nidObj.last_txid, nidObj.lastUpdateBlockId, JSON.stringify(nidObj), nidObj.tld);
                // console.log(insert.changes);
            } else {
                let sql = `UPDATE "nidobj" 
                SET "owner" = ?, 
                    "owner_key" = ?, 
                    "status" = ?,
                    "last_txid" = ?,
                    "lastUpdateBlockId" = ?,
                    "jsonString" = ?,
                    "tld" =?
                WHERE "nid" = ?`

                // insert one row into the langs table
                const update = db.prepare(sql).run(nidObj.owner, nidObj.owner_key, nidObj.status, nidObj.last_txid, nidObj.lastUpdateBlockId, JSON.stringify(nidObj), nidObj.tld, nidObj.nid);
                // console.log(update.changes);
            }
            db.close();
        }
    }

    getAll(sql, ...options) {
        if (sql != null) {
            // open the database
            let db = new Database(this.path + DB_FILE_NAME, { verbose: null });
            let rows = null;
            try {
                rows = db.prepare(sql).all(...options);
                db.close();
                return rows;
            } catch(e) {
                console.log(e);
            } finally {
                db.close();
            }
        }
        return null;
    }

    getOne(sql, ...options) {
        if (sql != null) {
            // open the database
            let db = new Database(this.path + DB_FILE_NAME, { verbose: null });
            try {
                const row = db.prepare(sql).get(...options);
                db.close();
                return row;
            } catch(e) {
                console.log(e);
            } finally {
                db.close();
            }
        }
        return null;
    }
}

module.exports = {
    SQLDB: SQLDB
}
