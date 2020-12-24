const axios = require("axios");
const endpoint = "https://cloudflare-ipfs.com/ipfs/";
class ipfs{
  async handle_Data(res, path){
    let url = endpoint+path;
    console.log("ipfs read:"+url);
    try {
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
    }
  }
}

module.exports = new ipfs();