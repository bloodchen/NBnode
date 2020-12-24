const planariette = require("planariette");
const axios = require("axios");
const EventEmitter = require("events");
const es = require("event-stream");
const bitsocket = require("bitsocket-connect");

class bitSync extends EventEmitter {
  constructor() {
    super();
    this.status = {};
    this.callback = null;
    this.bFinish = false;
    this.cmap = {};
    setInterval(() => this.updateStatus(), 3000);
  }
  async updateStatus() {
    const res = await axios.get("https://txo.bitbus.network/status");
    //console.log(this.bFinish);
    if (!this.bFinish || this.status.height === undefined) {
      this.status = res.data;
      // console.log(this.status);
      return;
    }
    if (this.status.height != res.data.height) {
      this.status = res.data;

      //console.log(this.status);
      // console.log("new block");
      // console.log(res.data);

      if (this.callback) {
        let query = this.query;
        query.q.sort = { "blk.i": 1, "i": 1 };
        query.q.find["blk.i"] = { $gt: res.data.height - 1 };
        delete query.q.find.timestamp;
        // console.log("update confirmed tx");
        // console.log(JSON.stringify(query));
        await this._get_t(this.token, query, this.callback, true);
      }
      this.emit("NewBlock", this.status);
    }
  }
  async _get_t(token, query, callback, isConfirm = true) {
    return new Promise(async (resolve, reject) => {
      const self = this;
      let url = "https://txo.bitbus.network/block";
      if (!isConfirm) {
        url = "https://txo.bitsocket.network/crawl";
        query.q.sort = { timestamp: 1 };
        query.q.find["timestamp"] = {
          $gt: Date.now() - 3600 * 1000 * 10, //3 hours
        };
        delete query.q.find["blk.i"];
        if (query.u && query.u.limit) query.q.find.limit = query.u.limit;
        //console.log(JSON.stringify(query));
      }
      let res = await axios.post(url, JSON.stringify(query), {
        headers: {
          "Content-type": "application/json; charset=utf-8",
          Accept: "application/json; charset=utf-8",
          token:
            "eyJhbGciOiJFUzI1NksiLCJ0eXAiOiJKV1QifQ.eyJzdWIiOiIxQzc5M0RkVjI0Q3NORTJFUDZNbVZmckhqVlNGVmc2dU4iLCJpc3N1ZXIiOiJnZW5lcmljLWJpdGF1dGgifQ.SUJlYUc2TGNGdFlZaGk3amxwa3ZoRGZJUEpFcGhObWhpdVNqNXVBbkxORTdLMWRkaGNESC81SWJmM2J1N0V5SzFuakpKTWFPNXBTcVJlb0ZHRm5uSi9VPQ",
        },
        responseType: "stream", // important
      });

      res.data.on("end", function () {
        resolve(isConfirm);
        // console.log("end of stream confirmed=" + isConfirm);
      });
      res.data.pipe(es.split()).pipe(
        es.map((data, callback) => {
          if (data) {
            let d = JSON.parse(data);
            if (isConfirm) {
              self.cmap[d.tx.h] = true;
              self.callback(d, "c");
            } else {
              //console.log(self.cmap[d.tx.h]);
              if (self.cmap[d.tx.h] === undefined) self.callback(d, "u");
            }

            //console.log(d);
          }
        })
      );
    });
  }

  async run(token, query, callback, listen = false) {
    if (query.q.limit !== undefined) {
      throw Error("No limit shall be set");
    }
    query.q.sort = { "blk.i": 1, i: 1 }; //from old to new
    const self = this;
    this.callback = callback;
    this.query = query;
    this.token = token;
    let ret = await this._get_t(token, query, callback, true);
    ret = await this._get_t(token, query, callback, false);
    this.bFinish = true;
    this.cmap = [];
    console.log("emit initGetFinish");
    this.emit("initGetFinish");
    if (listen) {
      bitsocket.connect(query, function (tx) {
        self.callback(tx, "r");
      });
    }
  }
}

module.exports = bitSync;