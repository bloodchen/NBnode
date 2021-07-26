/**
 * server.js
 *
 * Express server that exposes the Indexer
 */

const express = require('express')
const morgan = require('morgan')
const bodyParser = require('body-parser')
const cors = require('cors')
var dns = require("dns");
var axios = require("axios");
const { CONFIG } = require('./config')
const { createProxyMiddleware } = require("http-proxy-middleware");


// ------------------------------------------------------------------------------------------------
// Globals
// ------------------------------------------------------------------------------------------------
const SSLDir = "./ssl.d/";
let greenlock = null;
let domainMap = {};
let localWebGateway = null;
let localAPIGateway = null;
const verNode = require('../package.json').version;

async function proxyRequest(req, res, path, nbdomain) {
  try {
    const cookie = req.headers
      ? req.headers.cookie
        ? req.headers.cookie
        : ""
      : "";
    //const url = localGateway + nbdomain + path;
    const url = localWebGateway + nbdomain + path;
    console.log("getting url:", url);
    let res1 = await axios.get(url, {
      method: "GET",
      withCredentials: true,
      headers: { Cookie: cookie },
      responseType: "stream",
    });
    res.set(res1.headers);
    res1.data.pipe(res);
  } catch (e) {
    //console.log(e);
    res.status(e.response.status).send(e.response.message);
    //res.end(e.message);
  }
}
async function getNBLink(domain) {
  console.log("getting TXT of:", domain);
  return new Promise((resolve) => {
    dns.resolve(domain, "TXT", (err, data) => {
      try {
        for (let i = 0; i < data.length; i++) {
          if (data[i][0]) {
            const nblink = data[i][0].split("=");
            if (nblink[0] === "nblink") {
              console.log("found nblink:", nblink[1]);
              resolve(nblink[1]);
              return;
            }
          }
        }
      } catch (e) { }
      console.log(domain, ": No NBlink found");
      resolve(null);
    });
  });
}
function isAPICall(host) {
  return (
    host.indexOf("localhost") != -1 ||
    host.indexOf("127.0.0.1") != -1 ||
    host.indexOf(CONFIG.node_info.domain) != -1
  );
}

// ------------------------------------------------------------------------------------------------
// Server
// ------------------------------------------------------------------------------------------------

class Server {
  constructor(indexer, logger, port) {
    this.indexer = indexer
    this.logger = logger
    this.listener = null
    this.onListening = null
  }

  start() {
    const app = express()

    if (this.logger) app.use(morgan('tiny'))


    app.get('/nblink/add/', this.addNBlink.bind(this))
    app.get('/nodeInfo', this.getNodeInfo.bind(this))
    app.get('/', this.getIndex.bind(this))
    app.get('/welcome.md', this.getWelcome.bind(this))
    app.get('/*', this.getAll.bind(this))

    app.post("/*", async (req, res, next) => {
      console.log("got post");
      next();
    });
    setInterval(() => {
      //console.log("clear domainMap cache");
      domainMap = []; //clear domainMap cache
    }, 60 * 1000);

    this.startProxyServer(app);
    this.startWebServer();
  }
  async startWebServer() {
    //Start HTTPS server
    if (CONFIG.node_info.domain) {
        var appSSL = express();
        const localAPI = "http://localhost:" + CONFIG.node_port;
        appSSL.use(createProxyMiddleware("**", { target: localAPI }));
        let domainError = {};
        greenlock = require("@root/greenlock").create({
          packageRoot: __dirname+"/../",
          configDir: SSLDir,
          maintainerEmail: CONFIG.node_info.contact,
          notify: async function (event, details) {
            if ("error" === event) {
              // `details` is an error object in this case
             /*gr console.error("GL Error, subject:", details);
              console.log("DE:", domainError);
              !domainError[details.subject] && (domainError[details.subject] = 0);
              //if (++domainError[details.subject] > 2) {
              console.log("GL remove, subject:", details.subject);
              // const res = await greenlock.sites.get({ subject: details.subject });
              // console.log("get result:",res);
              greenlock.remove({ subject: details.subject });
              */
            }
          },
        });
        const res = await greenlock.sites.add({
          subject: CONFIG.node_info.domain,
          altnames: [CONFIG.node_info.domain],
        });
        console.log("sites.add", res);
        const green = require("greenlock-express").init(() => {
          return {
            greenlock,
            cluster: false,
          };
        });
        // Serves on 80 and 443
        // Get's SSL certificates magically!
        green.serve(appSSL);
    }
  }
  startProxyServer(app) {
    const self = this;
    this.listener = app.listen(CONFIG.node_port, async function () {
      console.log(`NBnode server started on port ${CONFIG.node_port}...`);

      var proxyPassConfig = CONFIG.proxy_map;

      for (let uri in proxyPassConfig) {
        uri = uri.trim().toLowerCase();
        console.log("uri", uri);
        let env = CONFIG;
        env.indexer = self.indexer;
        let service_folder = proxyPassConfig[uri];
        const service = require("./modules/" + service_folder + "/index.js");
        const port = await service(env);
        const localAddr = "http://localhost:" + port;
        const pa = "^" + uri;
        if (uri === "/web/") localWebGateway = localAddr + "/";
        if (uri === "/api/") localAPIGateway = localAddr + "/";
        app.use(
          uri,
          createProxyMiddleware({
            target: localAddr,
            changeOrigin: true,
            pathRewrite: { [pa]: "" },
          })
        );
      }
      console.log(localWebGateway, localAPIGateway);
      app.use(cors());

      app.use(bodyParser.json({ limit: '50mb' }));
      app.use(bodyParser.urlencoded({ limit: '50mb', extended: false, parameterLimit: 50000 }));
      app.use((err, req, res, next) => {
        if (this.logger) this.logger.error(err.stack)
        res.status(500).send('Something broke!')
      })
    })
  }

  stop() {
    if (!this.listener) return
    this.listener.close()
    this.listener = null
  }

  async addNBlink(req, res, next) {
    try {
      if (!isAPICall(req.get("host"))) {
        next();
        return;
      }
      const domain = req.query["domain"];
      console.log("Adding domain:", domain);
      const nbLink = await getNBLink(domain);
      const ret = {
        code: nbLink ? 0 : 1,
        message: nbLink ? nbLink : domain + ":No NBlink found in DNS record",
      };
      res.json(ret);
      console.log("nbLink:", nbLink);
      if (ret.code == 0 && greenlock) { //add ssl
        const res = await greenlock.sites.add({
          subject: domain,
          altnames: [domain],
        });
      }
      return;
    } catch (e) { next(e) }
  }

  async getNodeInfo(req, res, next) {
    try {
      if (!isAPICall(req.get("host"))) {
        next();
        return;
      }
      let info = CONFIG.node_info;
      info.endpoints = Object.keys(CONFIG.proxy_map);
      info.version = verNode;
      res.json(info);
    } catch (e) { next(e) }
  }

  async getIndex(req, res, next) {
    try {
      if (!isAPICall(req.get("host"))) {
        next();
        return;
      }
      console.log("sending:" , __dirname + "/index.html")
      res.sendFile(__dirname + "/index.html");
    } catch (e) { next(e) }
  }

  async getWelcome(req, res, next) {
    try {
      if (!isAPICall(req.get("host"))) {
        next();
        return;
      }
      res.sendFile(__dirname + "/welcome.md");
    } catch (e) { next(e) }
  }

  async getAll(req, res, next) {
    try {
      const host = req.get("host");
      console.log(host);
      if (isAPICall(host)) {
        console.log("got local call, ignore...");
        next();
        return;
      }
      let nbdomain = domainMap[host];
      if (nbdomain === "none") {
        //already checked
        next();
        return;
      }
      if (!nbdomain) {
        nbdomain = await getNBLink(host);
        if (nbdomain) domainMap[host] = nbdomain;
        else {
          domainMap[host] = "none";
          next();
          return;
        }
      }
      proxyRequest(req, res, req.path, nbdomain);
    } catch (e) { next(e) }
  }

  
}

// ------------------------------------------------------------------------------------------------

module.exports = Server
