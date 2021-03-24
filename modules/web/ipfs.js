const axios = require("axios");
const fs = require('fs')
const endpoint = "https://cloudflare-ipfs.com/ipfs/";
class ipfs{
  async handle_Data(res, obj){
    let url = endpoint+obj.cid + (obj.home?'/'+obj.home:'');

    console.log("ipfs read:"+url);
    //iframe version
    let frame_file=fs.readFileSync(__dirname + "/template/frame.html").toString();
    frame_file=frame_file.replace('**frame_url**',url);
    if(obj.title){
      frame_file=frame_file.replace('**title**',obj.title);
    }
    res.send(frame_file);
    /*try {
      let res1 = await axios.get(url,{
        method: "GET",
        responseType: "stream"});
      //console.log(res1.headers);
      res.set(res1.headers);
      //res.send(res1.data);
      res1.data.pipe(res);
      
      return true;
    } catch (e) {
      //console.log(e);
      return false; 
    }*/
  }
}

module.exports = new ipfs();