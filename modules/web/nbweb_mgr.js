

const NBLib = require("nblib");
const fs = require("fs");
const url = require("url");
const axios = require("axios");
const punCode = require('punycode');
//const bitfs = require("./bitfs.js");
const ipfs = require("./ipfs.js");
const u = require('./util.js');
require('dotenv').config();

class nbweb_mgr {
  async init(env){
    console.log(env);
    await NBLib.init({
      API:"http://localhost:"+env.node_port+"/api/",
      token:process.env.NBToken, 
      debug:true,
      enable_write:false
      });
  }
  output_md(res,jsonReturn){
    let text_template =fs.readFileSync(__dirname + "/template/text.html").toString();
    let text = text_template.replace("**OBJ**",JSON.stringify(jsonReturn));
    //console.log(text);
    res.send(text);
  }
  async handleURL(res, addr) {
    addr = "https://" + addr;
    let q = url.parse(addr, true);
    console.log(q);
    //let res_content = await reader.read_domain(q.hostname);
    //console.log(res_content);
    let hostname = punCode.toUnicode(q.hostname); //support unicode name
    console.log(hostname);
    const dots = hostname.split('.').length-1;
    if(dots==1) hostname="*."+hostname;
    //hostname = encodeURI(hostname);
    let res_content = await NBLib.readDomain(hostname);
    //console.log(res_content);
    if (res_content != null) {
      if (res_content.code == 0) {
        
        let obj = {};
        try{
          obj=JSON.parse(res_content.obj);
        }catch(e){
          this.output_md(res,res_content)
          return;
        }
        
        //console.log(obj)
        if (obj.t == "web") {
          await this._handle_data(res, obj, q);
          return;
        }else {
          this.output_md(res,res_content)
          return
        }
        //iframe version
        //let frame_file=fs.readFileSync(__dirname + "/template/frame.html").toString();
        //frame_file=frame_file.replace('**frame_url**',"https://dweb.link/ipfs/QmSThARuU9xbMkMRwrT2EyB2dFnHBsqJyfJ48zVV9yQzCC");
        //res.send(frame_file);
        
      } else {
        if(res_content.code != 102){
          const domain = q.hostname.split('.');
          const redirectUrl = "https://app.nbdomain.com/#/search?nid=" + domain[0] + "&tld=." + domain[1];
          res.redirect(redirectUrl);
        }
        else {
          res.send("No website at: "+q.hostname+".<p><a href='https://app.nbdomain.com'>Manage</a>");
        }
        //res.sendFile(__dirname + "/template/welcome.html");
        return;
      }
    } else {
      res.sendFile(__dirname + "/template/welcome.html");
      return;
    }
  }
  _parse_data(data) {
    data = data.replace(/bitfs:\/\//gi, "/bitfs/");
    data = data.replace(/ipfs:\/\//gi, "/ipfs/");
    return data;
  }
  async _handle_data(res, obj, q) {
    console.log(q.path);
    let map_url = obj.urlmap[q.path];
    
    if(!map_url){ 
      map_url = obj.urlmap['/']+q.path;
    }
    console.log(map_url);
    if (map_url != undefined) {
      if (map_url.indexOf("/bitfs/") == 0) { //bitfs protocol
        let bit = new bitfs;
        let handled = await bitfs.handle_Data(res, map_url.slice(6));
        if (handled == false) {
          res.end("bitfs not found");
        }
        return;
      }
      if (map_url.indexOf("/ipfs/") == 0) { //ipfs protocol
        console.log("got ipfs url:"+map_url);
        //res.writeHead(302, {'Location': map_url+'/'});
        //res.end();
        await ipfs.handle_Data(res,map_url.slice(6));
        return;
      }
     // let r = await axios.get(map_url); //other protocol
      //res.end(r.data);
      return;
    }

    res.end("404");
  }
}

module.exports = new nbweb_mgr();
