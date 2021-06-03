var express = require("express");
var bodyParser = require("body-parser");
var cors = require("cors");
var dns = require("dns");
var axios = require("axios");
var app = express();
var appSSL = express();
const { createProxyMiddleware } = require("http-proxy-middleware");

const config = require("./core/config.js");

//const core = require("./core/startCore.js");

const defaultConfig = config[config.env];
let greenlock = null;
let domainMap = {};
let localWebGateway = null;
let localAPIGateway = null;
const verNode = require('./package.json').version;

const SSLDir = "./ssl.d/";
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
function connectToCore() {
  ipc.config.id = 'apiService';
  ipc.config.retry = 1500;
  ipc.connectTo(
    'core',
    function () {
      ipc.of.core.on(
        'connect',
        function (data) {
          console.log("connected to core");
          //if data was a string, it would have the color set to the debug style applied to it
          ipc.of.core.emit(
            'message',
            'hello'
          );
        }
      );
    }
  );
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
    host.indexOf(defaultConfig.node_info.domain) != -1
  );
}


app.get("/nblink/add/", async (req, res, next) => {
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
});

app.get("/nodeInfo", (req, res, next) => {
  if (!isAPICall(req.get("host"))) {
    next();
    return;
  }
  let info = defaultConfig.node_info;
  info.endpoints = Object.keys(defaultConfig.proxy_map);
  info.version = verNode;
  res.json(info);
});
app.get("/", (req, res, next) => {
  if (!isAPICall(req.get("host"))) {
    next();
    return;
  }
  res.sendFile(__dirname + "/index.html");
});
app.get("/welcome.md", (req, res, next) => {
  if (!isAPICall(req.get("host"))) {
    next();
    return;
  }
  res.sendFile(__dirname + "/welcome.md");
});
app.post("/*", async (req, res, next) => {
  console.log("got post");
  next();
});

app.get("/*", async (req, res, next) => {
  const host = req.get("host");
  console.log(host);
  if (
    host.indexOf("localhost") != -1 ||
    host.indexOf("127.0.0.1") != -1 ||
    host.indexOf(defaultConfig.node_info.domain) != -1
  ) {
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
});

setInterval(() => {
  //console.log("clear domainMap cache");
  domainMap = []; //clear domainMap cache
}, 60 * 1000);



app.listen(defaultConfig.node_port, async function () {
  console.log(`NBnode server started on port ${defaultConfig.node_port}...`);

  var proxyPassConfig = defaultConfig.proxy_map;

  for (uri in proxyPassConfig) {
    uri = uri.trim().toLowerCase();
    console.log("uri", uri);
    let env = defaultConfig;
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
});

//Start HTTPS server
if (defaultConfig.node_info.domain) {
  (async () => {
    const localAPI = "http://localhost:" + defaultConfig.node_port;
    appSSL.use(createProxyMiddleware("**", { target: localAPI }));
    let domainError = {};
    greenlock = require("@root/greenlock").create({
      packageRoot: __dirname,
      configDir: SSLDir,
      maintainerEmail: defaultConfig.node_info.contact,
      notify: async function (event, details) {
        if ("error" === event) {
          // `details` is an error object in this case
          console.error("GL Error, subject:", details);
          console.log("DE:", domainError);
          !domainError[details.subject] && (domainError[details.subject] = 0);
          //if (++domainError[details.subject] > 2) {
          console.log("GL remove, subject:", details.subject);
          // const res = await greenlock.sites.get({ subject: details.subject });
          // console.log("get result:",res);
          greenlock.remove({ subject: details.subject });
          //}
        }
      },
    });
    const res = await greenlock.sites.add({
      subject: defaultConfig.node_info.domain,
      altnames: [defaultConfig.node_info.domain],
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
  })();
}
