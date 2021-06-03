const fs = require('fs');
const Database = require('better-sqlite3');

const BSV_DB_PATH = __dirname + `/sqldb/`;
//cons = 'nbdomain.db';
const DB_TX = 'tx.db';
const DB_DOMAIN = 'domain.db';
const BATCH_READ_CONFIG = '$$$';
const VERSION_DOMIANDB = "2";
const VERSION_TXDB = "2";

class TXDB {
    constructor(path, protocolId) {
        this.path = path;
        this.protocolId = protocolId;
    }
    getAll(sql, ...options) {
        if (sql != null) {
            // open the database
            let db = new Database(this.path, { verbose: null });
            let rows = null;
            try {
                rows = db.prepare(sql).all(...options);
                db.close();
                return rows;
            } catch (e) {
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
            let db = new Database(this.path, { verbose: null });
            try {
                const row = db.prepare(sql).get(...options);
                db.close();
                return row;
            } catch (e) {
                console.log(e);
            } finally {
                db.close();
            }
        }
        return null;
    }
    savePayTx(payTx) {
        if (payTx != null) {
            let db = new Database(this.path, { verbose: null });
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
            let db = new Database(this.path, { verbose: null });
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
            let db = new Database(this.path, { verbose: null });
            let sql = `DELETE FROM "paytx" where "nid" = ? and "type" = 'register';`
            const rm = db.prepare(sql).run(nid);
            db.close();
        }
    }

    deleteBuyTx(nid) {
        if (nid != null) {
            let db = new Database(this.path, { verbose: null });
            let sql = `DELETE FROM "paytx" where "nid" = ? and "type" = 'buy';`
            const rm = db.prepare(sql).run(nid);
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

    getLastLog() {
        return this.getOne(`SELECT * FROM "transac" ORDER BY id DESC LIMIT 1`);
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
            let db = new Database(this.path, { verbose: null });
            for (let i in rtxArray) {
                let rtx = rtxArray[i];

                if (this.checkLog("transac", rtx.hash)) {
                    continue; //already has it
                }
                //delete from unconfirmed tx
                let sql_delete = `DELETE FROM "unconfirmed_transac" where "hash" = ?;`
                const rm = db.prepare(sql_delete).run(rtx.hash);

                let sql = `INSERT INTO "transac" 
                    ("blkTs", "hash", "publicKey", "blockId", "command", "inputAddress", "output", "in", "out") 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`

                // insert one row into the langs table
                const insert = db.prepare(sql).run(rtx.blkTs, rtx.hash, rtx.publicKey, rtx.blockId,
                    rtx.command, JSON.stringify(rtx.inputAddress), JSON.stringify(rtx.output),
                    JSON.stringify(rtx.in), JSON.stringify(rtx.out));
                // console.log(insert.changes);
            }
            db.close();
        }
    }

    updateLog(rtxArray) {
        let notFound = [];
        if (rtxArray != null) {
            let db = new Database(this.path, { verbose: null });
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
            let db = new Database(this.path, { verbose: null });
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
            let db = new Database(this.path, { verbose: null });
            for (let i in rtxArray) {
                let rtx = rtxArray[i];
                if (this.checkLog("unconfirmed_transac", rtx.hash)) {
                    continue;
                }
                let sql = `INSERT INTO "unconfirmed_transac" 
                    ("hash", "publicKey", "command", "inputAddress", "output", "in", "out") 
                    VALUES (?, ?, ?, ?, ?, ?, ?);`

                // insert one row into the langs table
                const insert = db.prepare(sql).run(rtx.hash, rtx.publicKey, rtx.command, JSON.stringify(rtx.inputAddress),
                    JSON.stringify(rtx.output), JSON.stringify(rtx.in), JSON.stringify(rtx.out));
                // console.log(insert.changes);
            }
            db.close();
        }
    }

    deleteLog(hash) {
        if (hash != null) {
            let db = new Database(this.path, { verbose: null });
            let sql = `DELETE FROM "transac" where "hash" = ?;`

            // insert one row into the langs table
            const rm = db.prepare(sql).run(hash);
            // console.log(insert.changes);
            db.close();
        }
    }

    deleteUnconfirmedLog(hash) {
        if (hash != null) {
            let db = new Database(this.path, { verbose: null });
            let sql = `DELETE FROM "unconfirmed_transac" where "hash" = ?;`

            // insert one row into the langs table
            const rm = db.prepare(sql).run(hash);
            // console.log(insert.changes);
            db.close();
        }
    }

    emptyDB(onlyUnconfirmed) {
        let db = new Database(this.path, { verbose: null });
        let sql1 = `DELETE FROM "transac";`
        let sql2 = `DELETE FROM "unconfirmed_transac"`;

        // empty table
        if (!onlyUnconfirmed)
            db.prepare(sql1).run();

        db.prepare(sql2).run();
        // console.log(rm.changes);

        // close the database connection
        db.close();
    }
}
class DOMAINDB {
    constructor(path, protocolId) {
        this.path = path;
        this.protocolId = protocolId;
    }
    saveOrUpdateConfig(key, val) {
        if (key != null) {
            let db = new Database(this.path, { verbose: null });
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
    emptyDB() {
        let db = new Database(this.path, { verbose: null });
        let sql = `DELETE FROM "nidobj";`
        let sql1 = `DELETE FROM "config";`
        // empty table
        db.prepare(sql).run();
        db.prepare(sql1).run();
        // close the database connection
        db.close();
    }
    getAll(sql, ...options) {
        if (sql != null) {
            // open the database
            let db = new Database(this.path, { verbose: null });
            let rows = null;
            try {
                rows = db.prepare(sql).all(...options);
                db.close();
                return rows;
            } catch (e) {
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
            let db = new Database(this.path, { verbose: null });
            try {
                const row = db.prepare(sql).get(...options);
                db.close();
                return row;
            } catch (e) {
                console.log(e);
            } finally {
                db.close();
            }
        }
        return null;
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
    queryKeys({ v, num, startID, tags }) {
        let sql = "select id,key,value,tags from keys ";
        if (v != "1") {
            return { code: 1, message: "invalid v" };
        }
        if (tags != null) {
            let hasOr = (tags.indexOf(';') != -1);
            const hasAnd = (tags.indexOf('+') != -1);
            if (hasOr && hasAnd) {
                return { code: 1, message: "Using both ; and + is not supported yet" };
            }
            if (!hasAnd && !hasOr) hasOr = true;
            if (hasOr) {
                const orTag = tags.split(';').join("','");
                sql += "where key in (select key from tags where tag in ('" + orTag + "')) ";
            }
            if (hasAnd) {
                const addTag = tags.split('+').join("','");
                const count = tags.split('+').length;
                sql += "where key in (select key from tags where tag in ('" + addTag + "') group by key having count(*)>=" + count + ") "
            }
        }
        if (startID != 0) {
            sql += "and id>" + startID + " ";
        }
        if (num) {
            sql += "limit " + num;
        }
        sql += ";";
        return {
            code: 0,
            data: this.getAll(sql)
        }
    }
    queryTags(expression = null) {
        let sql = "select DISTINCT tag from tags";
        if (expression)
            sql += " where tag like '" + expression + "'";
        sql += ";";
        return this.getAll(sql);
    }
    saveTags(nidObj) {
        if (nidObj != null) {
            let db = new Database(this.path, { verbose: null });
            for (var item in nidObj.tag_map) {
                const keyName = item + "." + nidObj.nid;
                try {
                    let sql_delete = `DELETE FROM "tags" WHERE "key" = ? ;`
                    const insert = db.prepare(sql_delete).run(keyName);
                } catch (e) {
                    console.error(e);
                }

                const tags = nidObj.tag_map[item].split(";");
                tags.map(tag => {
                    try {
                        let sql = `INSERT INTO "tags" 
                        ("tag", "key") 
                        VALUES (?, ?);`
                        const insert = db.prepare(sql).run(tag, keyName);
                    } catch (e) {
                        console.error(e);
                    }
                })
            }
        }
    }
    readKey(key) {
        let result = this.getOne(`SELECT * FROM "keys" WHERE "key" = ?`, key);
        if (result != null) {
            return result.value;
        }
        return "";
    }
    saveKeys(nidObj) {
        if (nidObj != null) {
            let db = new Database(this.path, { verbose: null });
            for (var item in nidObj.keys) {
                const value = JSON.stringify(nidObj.keys[item]);

                const keyName = item + "." + nidObj.nid;
                const row = db.prepare(`SELECT * FROM "keys" WHERE "key" = ?`).get(keyName);
                if (row == null) {
                    let sql = `INSERT INTO "keys" 
                    ("key", "value", "tags") 
                    VALUES (?, ?, ?);`

                    const insert = db.prepare(sql).run(keyName, value, nidObj.tag_map[item]);
                } else {
                    let sql = `UPDATE "keys" 
                    SET "value" = ?,
                        "tags" = ?
                    where "key" = ? `
                    const update = db.prepare(sql).run(value, "", keyName);
                }
                if (value.length > 512) {
                    nidObj.keys[item] = '$truncated';
                }

            }
            db.close();
        }
    }
    saveOrUpdateJson(nidObj) {
        if (nidObj != null) {
            this.saveKeys(nidObj);
            this.saveTags(nidObj);
            let db = new Database(this.path, { verbose: null });
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
}
class SQLDB {
    constructor(protocolId) {
        this.txDB = new TXDB(BSV_DB_PATH + protocolId + '/' + DB_TX);
        this.domainDB = new DOMAINDB(BSV_DB_PATH + protocolId + '/' + DB_DOMAIN);

        this.path = BSV_DB_PATH;// + protocolId + '/';
        fs.mkdir(this.path, { recursive: true }, (err) => {
            if (err) throw err;
        });
    }
    queryKeys(s) {
        return this.domainDB.queryKeys(s);
    }
    queryTags(expression = null) {
        return this.domainDB.queryTags(expression);
    }
    readKey(key) {
        return this.domainDB.readKey(key);
    }
    loadJson(nid) {
        return this.domainDB.loadJson(nid);
    };

    queryBy(field, value) {
        return this.domainDB.queryBy(field, value);
    }

    queryAll(field, value) {
        return this.domainDB.queryAll(field, value);
    }

    getAllMatches(field, value) {
        return this.domainDB.getAllMatches(field, value);
    }

    saveOrUpdateJson(nidObj) {
        return this.domainDB.saveOrUpdateJson(nidObj);
    }

    savePayTx(payTx) {
        return this.txDB.savePayTx(payTx);
    }

    saveBuyTx(payTx) {
        return this.txDB.saveBuyTx(payTx);
    }

    getPayTx(nid) {
        return this.txDB.getPayTx(nid);
    }


    getBuyTx(nid) {
        return this.txDB.getBuyTx(nid);
    }

    deletePayTx(nid) {
        return this.txDB.deletePayTx(nid);
    }

    deleteBuyTx(nid) {
        return this.txDB.deleteBuyTx(nid);
    }

    saveOrUpdateConfig(key, val) {
        return this.domainDB.saveOrUpdateConfig(key, val);
    }

    getConfig(key) {
        return this.domainDB.getConfig(key);
    }
    getLastParsedBlockID() {
        return this.domainDB.getConfig(BATCH_READ_CONFIG)
    }
    saveLastParsedBlockID(id) {
        this.domainDB.saveOrUpdateConfig(BATCH_READ_CONFIG, {
            "blockId": id,
            "version": VERSION_DOMIANDB,
            "nid": BATCH_READ_CONFIG
        });
    }



    queryLog(nid, blockId) {
        return this.txDB.queryLog(nid, blockId);
    }

    getLastLog() {
        return this.txDB.getLastLog();
    }

    queryLogById(dbTxId) {
        return this.txDB.queryLogById(dbTxId);
    }

    queryUnconfirmedLog() {
        return this.txDB.queryUnconfirmedLog();
    }

    queryFailedBitFSLog() {
        return this.txDB.queryUnconfirmedLog();
    }

    checkLog(table, hash) {
        return this.txDB.checkLog(table, hash);
    }

    getLog(table, hash) {
        return this.txDB.getLog(table, hash);
    }

    appendLog(rtxArray) {
        return this.txDB.appendLog(rtxArray);
    }

    updateLog(rtxArray) {
        return this.txDB.updateLog(rtxArray);
    }

    updateUnLog(rtxArray) {
        return this.txDB.updateUnLog(rtxArray);
    }

    appendUnconfirmedLog(rtxArray) {
        return this.txDB.appendUnconfirmedLog(rtxArray);
    }

    deleteLog(hash) {
        return this.txDB.deleteLog(hash);
    }

    deleteUnconfirmedLog(hash) {
        return this.txDB.deleteUnconfirmedLog(hash);
    }
    emptyAllNID() {
        this.txDB.emptyDB(true);
        this.domainDB.emptyDB();

    }
}

module.exports = {
    SQLDB: SQLDB
}
