/**
 * mattercloud.js
 *
 * MatterCloud API
 */

const axios = require('axios')
const bsv = require('bsv')
global.EventSource = require('eventsource')
const { default: ReconnectingEventSource } = require('reconnecting-eventsource')

// ------------------------------------------------------------------------------------------------
// Globals
// ------------------------------------------------------------------------------------------------

const NB_FILTER1 = '006a223150754d655a73776a73414d374446484d53646d4147665138734776456374694635' //1PuMeZswjsAM7DFHMSdmAGfQ8sGvEctiF5
const NB_FILTER2 = '006a223134504d4c31587a5a7173354a764a43477932414a325a41517a5445626e4336735a' //14PML1XzZqs5JvJCGy2AJ2ZAQzTEbnC6sZ
const NB_FILTER3 = '006a036e6264' //nbd

// ------------------------------------------------------------------------------------------------
// MatterCloud
// ------------------------------------------------------------------------------------------------

class MatterCloud {
  constructor (apiKey, logger) {
    this.suffix = apiKey ? `?api_key=${apiKey}` : ''
    this.logger = logger
    this.mempoolEvents = null
  }

  async connect (height, network) {
    if (network !== 'main') throw new Error(`Network not supported with MatterCloud: ${network}`)
  }

  async disconnect () {
    if (this.mempoolEvents) {
      this.mempoolEvents.close()
      this.mempoolEvents = null
    }
  }

  async fetch (txid) {
    const response = await axios.get(`https://api.mattercloud.net/api/v3/main/tx/${txid}${this.suffix}`)

    const hex = response.data.rawtx
    const height = response.data.blockheight === 0 ? -1 : response.data.blockheight
    const time = response.data.blocktime === 0 ? null : response.data.blocktime

    if (typeof hex === 'undefined') throw new Error(`MatterCloud API did not return hex for ${txid}`)
    if (typeof height === 'undefined') throw new Error(`MatterCloud API did not return blockheight for ${txid}`)
    if (typeof time === 'undefined') throw new Error(`MatterCloud API did not return blocktime for ${txid}`)

    return { hex, height, time }
  }

  async getNextBlock (currHeight, currHash) {
    const height = currHeight + 1
    let hash = null,response = null

    try {
      response = await axios.get(`https://bfs.mattercloud.io/height/${height}${this.suffix}`)
      hash = response.data.blockhash
    } catch (e) {
      if (e.response && e.response.status === 404) return undefined
      throw e
    }

    try {
      const FILTERS = [NB_FILTER1,NB_FILTER2,NB_FILTER3]
      let txhexs=[], txids=[],time=0
      FILTERS.forEach(async FILTER=>{
        response = await axios.get(`https://bfs.mattercloud.io/block/${hash}/tx/filter/${FILTER}${this.suffix}`)
        console.log(response.data);
        const prevHash = response.data.header.prevHash
        if (currHash && prevHash !== currHash) return { reorg: true }

        const txhexs1 = response.data.tx.map(tx => tx.raw)
        const txids1 = txhexs1.map(hex => new bsv.Transaction(hex).hash)
        txhexs.concat(txhexs1)
        txids.concat(txids1)
        time = response.data.header.time
      })
      return { height, hash, time, txids, txhexs }
    } catch (e) {
      if (e.response && e.response.status === 404) return undefined
      throw e
    }
  }

  async listenForMempool (mempoolTxCallback) {
    this.logger.info('Listening for mempool via MatterCloud SSE')

    return new Promise((resolve, reject) => {
      this.mempoolEvents = new ReconnectingEventSource(`https://stream.mattercloud.io/mempool?filter=${NB_FILTER1}`)

      this.mempoolEvents.onerror = (e) => reject(e)

      this.mempoolEvents.onmessage = event => {
        if (event.type === 'message') {
          const data = JSON.parse(event.data)

          if (data === 'connected') {
            resolve()
            return
          }

          mempoolTxCallback(data.h, data.raw)
        }
      }
    })
  }
}

// ------------------------------------------------------------------------------------------------

module.exports = MatterCloud
