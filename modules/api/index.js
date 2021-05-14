/**
 * NBDomain HTTP server for 3rd party.
 */
var url = require('url');
const config = require('../../core/config.js');
const NbCore = require('../../core/nbdomain_core.js');
const fs = require('fs');
const defaultConfig = config[config.env];
var path = require('path');

var express = require('express');
var bodyParser = require("body-parser");
var cors = require('cors');
var app = express();

app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const auth = async (req,res) => {
    try {
        if (!fs.existsSync(defaultConfig.auth_file)) {
          return true;
        }
    } catch(err) {
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
        res.status(401).send({error:'Please authenticate!'})
    }
    return false;
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
            nidLoader.readLocalNid(nid, function(data) {
                res.json(data);
            })
        } else {
            if (nid.indexOf("@") !== -1) {
                nidLoader.readUserProperty(nid, function(data) {
                    res.json(data);
                })
            } else {
                nidLoader.readLocalPredictNid(nid, function(data) {
                    resp = data;
                    if (!f && resp.obj && resp.obj.keys) {
                        for (let k in resp.obj.keys) {
                            let v = resp.obj.keys[k];
                            if (v.length > 512) {
                                resp.obj.keys[k] = '$truncated';
                            }
                        }
                        resp.obj.truncated = true;
                    }
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

app.get(`/tld`, function (req, res, next) {
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
    return new Promise( (resolve)=>{
    const server = app.listen(0, function () {
        const port = server.address().port;
        console.log(`API server started on port ${port}...`)
        resolve(port);
    })
})}