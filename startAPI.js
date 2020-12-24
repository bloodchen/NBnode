var express = require('express');
var bodyParser = require("body-parser");
var cors = require('cors');
var app = express();
var glob = require('glob');
const { createProxyMiddleware } = require('http-proxy-middleware');

const config = require('./core/config.js');
const defaultConfig = config[config.env];

var module_dict = {};


 
//glob.sync( './modules/**/index.js' ).forEach( function( file ) {
/*  let dash = file.split("/");
  if(dash.length == 4) {
  	let module_name = dash[2];
    module_dict[module_name] = require(file);
    module_dict[module_name](random_port);
    port_dict[module_name] = random_port;
    random_port += 10;
  }
}); */




app.listen(defaultConfig.node_port,async function(){
  console.log(`NBnode server started on port ${defaultConfig.node_port}...`)

var proxyPassConfig = defaultConfig.proxy_map;

  for (uri in proxyPassConfig) {
    let env = {node_port:defaultConfig.node_port}
    let service_folder = proxyPassConfig[uri];
    const service = require('./modules/'+service_folder+'/index.js');
    const port = await service(env);
    const localAddr = 'http://localhost:'+port;
    const pa = '^' + uri;
    app.use(uri, createProxyMiddleware({ target: localAddr, changeOrigin: true, pathRewrite: { [pa]: '' } }));
  }
    app.use(cors());
    app.use(bodyParser.urlencoded({ extended: false }));
    app.use(bodyParser.json());


});

