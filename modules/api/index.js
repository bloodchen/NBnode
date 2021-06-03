/**
 * NBDomain HTTP server for 3rd party.
 */
var url = require('url');
const config = require('../../core/config.js');
const NbCore = require('../../core/nbdomain_core.js');
const fs = require('fs');
const defaultConfig = config[config.env];
var path = require('path');
const ipc = require('node-ipc');
const sqldb = require('../../core/dbMgr.js');
const UTIL = require('../../core/util.js');

var express = require('express');
var bodyParser = require("body-parser");
var cors = require('cors');
const { stringify } = require('querystring');
const { request } = require('express');
var app = express();

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true, parameterLimit: 50000 }));

const auth = async (req, res) => {
    try {
        if (!fs.existsSync(defaultConfig.auth_file)) {
            return true;
        }
    } catch (err) {
        console.error(err)
        return true;
    }
    try {
        const token = req.header('Authorization').replace('Bearer ', '').trim()
        req.token = token
        let authConfig = JSON.parse(fs.readFileSync(defaultConfig.auth_file));
        if (!(token in authConfig.keys && authConfig.keys[token].enable == 1)) {
            throw new Error()
        }
        return true;
    } catch (error) {
        console.log(error)
        res.status(401).send({ error: 'Please authenticate!' })
    }
    return false;
}
let eventMap = {};
async function getResultFromCore(eventID){
    return new Promise(resolve=>{
        const timer = setInterval(()=>{
            if(eventMap[eventID]){
                clearInterval(timer);
                resolve(eventMap[eventID]);
            }
        },100);
    });
}
function connectToCore() {
    let result = "";
    ipc.config.id = 'apiService';
    ipc.config.retry = 1500;
    ipc.config.debug = false;
    ipc.connectTo(
        'core',
        function () {
            ipc.of.core.on(
                'connect',
                async function (data) {
                    console.log("connected to core");
                }
            );
            ipc.of.core.on(
                'toapi',
                function (data) {
                    const objEvent = JSON.parse(data);
                    eventMap[objEvent.id] = objEvent;
                    console.log("get return:",objEvent);
                }
            );
        }
    );
}

app.get('/', function (req, res, next) {
    if (!auth(req, res)) {
        return;
    }
    let q = url.parse(req.url, true).query;
    let nid = q.nid;
    let predict = q.p;
    let f = (q.full == 'true');

    if (nid == null) {
        let resp = {
            code: NbCore.ERROR_NID_NOT_VALID,
            message: `NID [${nid}] is not valid!`
        };
        res.json(resp);
        return;
    }



    try {
        const nidLoader = new NbCore.NidLoader(nid, null);

        if (predict == "0") {
            nidLoader.readLocalNid(nid, function (data) {
                res.json(data);
            })
        } else {
            if (nid.indexOf("@") !== -1) {
                nidLoader.readUserProperty(nid, function (data) {
                    res.json(data);
                })
            } else {
                nidLoader.readLocalPredictNid(nid, function (data) {
                    resp = data;
                   /* if (!f && resp.obj && resp.obj.keys) {
                        for (let k in resp.obj.keys) {
                            let v = resp.obj.keys[k];
                            if (v.length > 512) {
                                resp.obj.keys[k] = '$truncated';
                            }
                        }
                        resp.obj.truncated = true;
                    } */
                    res.json(resp);
                })
            }
        }

    } catch (err) {
        let resp = {
            code: 99,
            message: err.message
        };
        console.log(`Error reading nbdomain: ${err.message}`);
        res.json(resp);
    }
});
app.post('/sendTx',async function(req,res){
    let ret = {
        code:1,
        message:"error"
    }
    const eventID = Date.now().toString();
    const obj = req.body;
    obj.id = eventID;
    obj.cmd = "sendtx";
    const r1 = ipc.of.core.emit(
        'fromapi',
        JSON.stringify(obj)
    );
    ret = await getResultFromCore(eventID);
    console.log("return from core:",ret);
    res.json(ret);
});
app.get('/queryKeys',function(req,res){
    const tld = req.query['tld']?req.query['tld']:'b';
    const protocol = UTIL.getProcotolFromTLD(tld);
    if(protocol){
        const sql = new sqldb.SQLDB(protocol);
        const num = req.query['num']?req.query['num']:50;
        const startID = req.query['startID']?req.query['startID']:0;
        const tags = req.query['tags']?req.query['tags']:null;
        const result = sql.queryKeys({v:1,num:num,startID:startID,tags:tags});
        res.json(result);
        return;
    }
    res.json({code:1,message:'error'});
});
app.get('/queryTags',function(req,res){
    const tld = req.query['tld']?req.query['tld']:'b';
    const protocol = UTIL.getProcotolFromTLD(tld);
    if(protocol){
        const sql = new sqldb.SQLDB(protocol);
        const exp = req.query['exp'];
        const result = sql.queryTags(exp?exp:null);
        res.json(result);
        return;
    }
    res.json({code:1,message:'error'});
});
app.get('/radmin',function(req,res){
    const eventID = Date.now().toString();
    const obj = req.body;
    obj.id = eventID;
    obj.cmd = "radmin";
    obj.para = req.query['para'];
    if(!defaultConfig.remote_admin.enable){
        console.error("remote_admin: not enabled");
        return;
    }
    if(req.query['passcode']!==defaultConfig.remote_admin.passcode){
        console.error("remote_admin: wrong passcode");
        return;
    }
    const r1 = ipc.of.core.emit(
        'fromapi',
        JSON.stringify(obj)
    );
    res.end("ok");
});
app.get(`/tld`, function (req, res) {
    if (!auth(req, res)) {
        return;
    }

    let tld_config = defaultConfig.tld_config;
    let output = {}
    for (let tld in tld_config) {
        output[tld] = {
            'testing': tld_config[tld].testing,
            'address': {
                'protocol': tld_config[tld].address.protocol,
                'payment': tld_config[tld].address.payment,
                'admin': tld_config[tld].address.admin,
                'other_admins': tld_config[tld].address.other_admins,
            }
        }
    }

    res.json(output);

});


app.get(`/find_domain`, function (req, res, next) {
    try {
        if (!auth(req, res)) {
            return;
        }
        var q = url.parse(req.url, true).query;
        var addr = q.address;
        let f = (q.full == 'true');

        const xDbReader = new NbCore.CrossDBReader();
        let result = xDbReader.searchNid('owner', addr, !f);
        res.json({
            code: 0,
            message: "OK",
            obj: result
        })
    } catch (err) {
        let resp = {
            code: 99,
            message: err.message
        };
        console.log(`Exception when processing request: ${err.message}`);
        res.json(resp);
        return;
    }
});

app.get(`/query`, function (req, res, next) {
    try {
        if (!auth(req, res)) {
            return;
        }
        var q = url.parse(req.url, true).query;
        var s = JSON.parse(q.s);
        let tlds = s.tld;
        let status = Number(s.status);

        const xDbReader = new NbCore.CrossDBReader(tlds);
        let result = xDbReader.searchNid('status', status, true);
        res.json({
            code: 0,
            message: "OK",
            domains: result
        })
    } catch (err) {
        let resp = {
            code: 99,
            message: err.message
        };
        console.log(`Exception when processing request: ${err.message}`);
        res.json(resp);
        return;
    }
});


module.exports = function (env) {
    return new Promise((resolve) => {
        const server = app.listen(0, function () {
            const port = server.address().port;
            console.log(`API server started on port ${port}...`)
            connectToCore();
            resolve(port);
        })
    })
}