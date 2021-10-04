/**
 * NBDomain HTTP server for 3rd party.
 */
var url = require('url');
const { CONFIG } = require('../../config')
var express = require('express');
var bodyParser = require("body-parser");
var cors = require('cors');
const { ERR } = require('../../def')
const { Util } = require('../../util.js')
const Parser = require('../../parser')
const bsv = require('bsv');
const { json } = require('body-parser');
const axios = require('axios');
var app = express();

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true, parameterLimit: 50000 }));

let resolver = null;

const auth = async (req, res) => {
    /*try {
        const token = req.header('Authorization').replace('Bearer ', '').trim()
        req.token = token
        let authConfig = JSON.parse(fs.readFileSync(CONFIG.auth_file));
        if (!(token in authConfig.keys && authConfig.keys[token].enable == 1)) {
            throw new Error()
        }
        return true;
    } catch (error) {
        console.log(error)
        res.status(401).send({ error: 'Please authenticate!' })
    }
    return false;*/
    return true;
}

app.get('/', async function (req, res, next) {
    if (!auth(req, res)) {
        return;
    }
    let domain = req.query['nid'];
    let f = req.query['full'] === 'true';

    if (!domain) {
        res.json({ code: ERR.NOTFOUND, message: `nid missing!` });
        return;
    }
    try {
        const ret = await resolver.readDomain(domain, f);
        res.json(ret);
    } catch (err) {
        console.error(err);
        res.json({ code: 99, message: err.message });
    }
});
app.get('/d/:domain/:his?', async function (req, res) {
    const domain = req.params['domain']
    const history = req.params['his']
    res.json(await resolver.readDomain(domain, false,history));
})
app.get('/df/:domain', async function (req, res) {
    const domain = req.params['domain']
    res.json(await resolver.readDomain(domain, true));
})
app.get('/address/:address/balance', async function (req, res) {
    const address = req.params['address']
    const url = `https://api.whatsonchain.com/v1/bsv/main/address/${address}/balance`;
    const json = (await axios.get(url)).data;
    res.json(json);
})
app.get('/util/verify', async function (req, res) {
    try {
        const domain = req.query['domain']
        let publicKey = req.query['publicKey']
        const strSig = req.query['sig']
        const data = req.query['data']
        if (domain) {
            const ret = await resolver.readDomain(domain, false)
            if (ret.code != 0) {
                res.json({ code: -1, message: ret.message })
                return
            }
            publicKey = ret.obj.owner_key
        }

        let sig = bsv.crypto.Signature.fromString(strSig)
        let pubKey = bsv.PublicKey.fromString(publicKey)
        let hash2 = bsv.crypto.Hash.sha256(bsv.deps.Buffer.from(data, 'hex'))
        res.json({ code: bsv.crypto.ECDSA.verify(hash2, sig, pubKey) ? 0 : -1 })

    } catch (e) {
        res.json({ code: -1, message: e.message })
    }
})

app.post('/sendTx', async function (req, res) {
    const obj = req.body;
    let ret = Parser.parseRaw(obj.rawtx, -1, true);
    if (ret.code != 0 || !ret.obj.output || ret.obj.output.err) {
        res.json({ code: -1, message: ret.msg })
        return
    }
    ret = await Util.sendRawtx(obj.rawtx);
    res.json(ret);
});
app.get('/queryKeys', function (req, res) {

    const num = req.query['num'] ? req.query['num'] : 50;
    const startID = req.query['startID'] ? req.query['startID'] : 0;
    const tags = req.query['tags'] ? req.query['tags'] : null;
    const result = resolver.db.queryKeys({ v: 1, num: num, startID: startID, tags: tags });
    res.json(result);
    return;
});
app.get('/queryTags', function (req, res) {
    const exp = req.query['exp'];
    const result = resolver.db.queryTags(exp ? exp : null);
    res.json(result);
    return;
});

app.get(`/tld`, function (req, res) {
    if (!auth(req, res)) {
        return;
    }
    res.json(CONFIG.tld_config);
});


app.get(`/find_domain`, function (req, res) {
    try {
        if (!auth(req, res)) {
            return;
        }
        var q = url.parse(req.url, true).query;
        var addr = q.address;
        let f = (q.full == 'true');
        let result = resolver.findDomain('owner', addr, !f);
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
        console.log(err);
        res.json(resp);
        return;
    }
});
module.exports = function (env) {
    resolver = env.indexer.resolver;
    return new Promise((resolve) => {
        const server = app.listen(0, function () {
            const port = server.address().port;
            console.log(`API server started on port ${port}...`)
            resolve(port);
        })
    })
}