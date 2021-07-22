/**
 * indexer.js
 *
 * Main object that discovers, downloads, executes and stores RUN transactions
 */

//const bsv = require('bsv')
const Database = require('./database')
const Downloader = require('./downloader')
const Crawler = require('./crawler')
const Resolver = require('./resolver')
const NBSDK = require('nbsdk');

// ------------------------------------------------------------------------------------------------
// Indexer
// ------------------------------------------------------------------------------------------------

class Indexer {
  constructor (txdb,dmdb, api, network, numParallelDownloads, numParallelExecutes, logger, startHeight, mempoolExpiration) {
    this.logger = logger || {}
    this.logger.info = this.logger.info || (() => {})
    this.logger.warn = this.logger.warn || (() => {})
    this.logger.error = this.logger.error || (() => {})
    this.logger.debug = this.logger.debug || (() => {})

    this.onDownload = null
    this.onFailToDownload = null
    this.onIndex = null
    this.onFailToIndex = null
    this.onBlock = null
    this.onReorg = null

    this.api = api
    this.network = network
    this.startHeight = startHeight
    this.mempoolExpiration = mempoolExpiration

    const fetchFunction = this.api.fetch ? this.api.fetch.bind(this.api) : null

    this.database = new Database(txdb,dmdb, this.logger)
    this.downloader = new Downloader(fetchFunction, numParallelDownloads)
    
    this.crawler = new Crawler(api)
    this.resolver = new Resolver(this.database)

    this.database.onReadyToExecute = this._onReadyToExecute.bind(this)
    this.database.onAddTransaction = this._onAddTransaction.bind(this)
    this.database.onDeleteTransaction = this._onDeleteTransaction.bind(this)
    this.database.onTrustTransaction = this._onTrustTransaction.bind(this)
    this.database.onUntrustTransaction = this._onUntrustTransaction.bind(this)
    this.database.onBanTransaction = this._onBanTransaction.bind(this)
    this.database.onUnbanTransaction = this._onUnbanTransaction.bind(this)
    this.database.onUnindexTransaction = this._onUnindexTransaction.bind(this)
    this.downloader.onDownloadTransaction = this._onDownloadTransaction.bind(this)
    this.downloader.onFailedToDownloadTransaction = this._onFailedToDownloadTransaction.bind(this)
    this.downloader.onRetryingDownload = this._onRetryingDownload.bind(this)
    
    this.crawler.onCrawlError = this._onCrawlError.bind(this)
    this.crawler.onCrawlBlockTransactions = this._onCrawlBlockTransactions.bind(this)
    this.crawler.onRewindBlocks = this._onRewindBlocks.bind(this)
    this.crawler.onMempoolTransaction = this._onMempoolTransaction.bind(this)
    this.crawler.onExpireMempoolTransactions = this._onExpireMempoolTransactions.bind(this)
  }

  async start () {
   
    this.database.open()
    const height = this.database.getHeight() || this.startHeight
    const hash = this.database.getHash()
    if (this.api.connect) await this.api.connect(height, this.network)
    this.database.getTransactionsToDownload().forEach(txid => this.downloader.add(txid))
    this.crawler.start(height, hash)
    this.resolver.start()
  }

  async stop () {
    this.logger.info('stopping...')
    this.resolver.stop()
    this.crawler.stop()
    if (this.api.disconnect) await this.api.disconnect()
    this.downloader.stop()
    this.database.close()
  }

  add (txid, hex = null, height = null, time = null) {
    txid = this._parseTxid(txid)
    this._addTransactions([txid], [hex], height, time)
  }

  remove (txid) {
    txid = this._parseTxid(txid)
    this.downloader.remove(txid)
    this.database.deleteTransaction(txid)
  }

  jig (location) {
    return this.database.getJigState(location)
  }

  spends (location) {
    return this.database.getSpend(location)
  }

  berry (location) {
    return this.database.getBerryState(location)
  }

  tx (txid) {
    txid = this._parseTxid(txid)
    return this.database.getTransactionHex(txid)
  }

  time (txid) {
    txid = this._parseTxid(txid)
    return this.database.getTransactionTime(txid)
  }

  trust (txid) {
    txid = this._parseTxid(txid)
    this.database.trust(txid)
  }

  untrust (txid) {
    txid = this._parseTxid(txid)
    this.database.untrust(txid)
  }

  ban (txid) {
    txid = this._parseTxid(txid)
    this.database.ban(txid)
  }

  unban (txid) {
    txid = this._parseTxid(txid)
    this.database.unban(txid)
  }

  untrusted (txid) {
    if (txid) {
      txid = this._parseTxid(txid)
      return this.database.getTransactionUntrusted(txid)
    } else {
      return this.database.getAllUntrusted()
    }
  }

  status () {
    return {
      height: this.crawler.height,
      hash: this.crawler.hash,
      downloading: this.downloader.remaining()
    }
  }

  _onDownloadTransaction (txid, hex, height, time) {
    this.logger.info(`Downloaded ${txid} (${this.downloader.remaining()} remaining)`)
    if (!this.database.hasTransaction(txid)) return
    if (height) this.database.setTransactionHeight(txid, height)
    if (time) this.database.setTransactionTime(txid, time)
    this._parseAndStoreTransaction(txid, hex)
    if (this.onDownload) this.onDownload(txid)
  }

  _onFailedToDownloadTransaction (txid, e) {
    this.logger.error('Failed to download', txid, e.toString())
    if (this.onFailToDownload) this.onFailToDownload(txid)
  }

  _onRetryingDownload (txid, secondsToRetry) {
    this.logger.info('Retrying download', txid, 'after', secondsToRetry, 'seconds')
  }


  _onReadyToExecute (txid) {
    this.executor.execute(txid)
  }

  _onAddTransaction (txid) {
    this.logger.info('Added', txid)
  }

  _onDeleteTransaction (txid) {
    this.logger.info('Removed', txid)
  }

  _onTrustTransaction (txid) {
    this.logger.info('Trusted', txid)
  }

  _onUntrustTransaction (txid) {
    this.logger.info('Untrusted', txid)
  }

  _onBanTransaction (txid) {
    this.logger.info('Banned', txid)
  }

  _onUnbanTransaction (txid) {
    this.logger.info('Unbanned', txid)
  }

  _onUnindexTransaction (txid) {
    this.logger.info('Unindexed', txid)
  }


  _onCrawlError (e) {
    this.logger.error(`Crawl error: ${e.toString()}`)
  }

  _onCrawlBlockTransactions (height, hash, time, txids, txhexs) {
    this.logger.info(`Crawled block ${height} for ${txids.length} transactions`)
    this._addTransactions(txids, txhexs, height, time)
    this.database.setHeightAndHash(height, hash)
    if (this.onBlock) this.onBlock(height)
  }

  _onRewindBlocks (newHeight) {
    this.logger.info(`Rewinding to block ${newHeight}`)

    const txids = this.database.getTransactionsAboveHeight(newHeight)

    this.database.transaction(() => {
      // Put all transactions back into the mempool. This is better than deleting them, because
      // when we assume they will just go into a different block, we don't need to re-execute.
      // If they don't make it into a block, then they will be expired in time.
      txids.forEach(txid => this.database.unconfirmTransaction(txid))

      this.database.setHeightAndHash(newHeight, null)
    })

    if (this.onReorg) this.onReorg(newHeight)
  }

  _onMempoolTransaction (txid, hex) {
    this._addTransactions([txid], [hex], Database.HEIGHT_MEMPOOL, null)
  }

  _onExpireMempoolTransactions () {
    const expirationTime = Math.round(Date.now() / 1000) - this.mempoolExpiration

    const expired = this.database.getMempoolTransactionsBeforeTime(expirationTime)
    const deleted = new Set()
    this.database.transaction(() => expired.forEach(txid => this.database.deleteTransaction(txid, deleted)))
  }

  _addTransactions (txids, txhexs, height, time) {
    this.database.transaction(() => {
      txids.forEach((txid, i) => {
        this.database.addNewTransaction(txid)
        if (height) this.database.setTransactionHeight(txid, height)
        if (time) this.database.setTransactionTime(txid, time)
      })

      txids.forEach((txid, i) => {
        const downloaded = this.database.isTransactionDownloaded(txid)
        if (downloaded) return

        const hex = txhexs && txhexs[i]
        if (hex) {
          this._parseAndStoreTransaction(txid, hex)
        } else {
          this.downloader.add(txid)
        }
      })
    })
  }

  _parseAndStoreTransaction (txid, rawtx) {
    if (this.database.isTransactionDownloaded(txid)) return
     
      if (!rawtx) {
        this.logger.warn(txid,":","no rawtx");
        return
      }
      const height = this.database.getTransactionHeight(txid);
      const ts = this.database.getTransactionTime(txid);
      const meta = NBSDK.parseRaw(rawtx,height,ts);
      if(meta.code!=0){
        this.logger.warn(txid,":"+meta.msg);
        this.database.deleteTransaction(txid);
        return;
      }

      this.database.setTransaction(txid, meta.obj)
      return
    

    
  }

  _parseTxid (txid) {
    txid = txid.trim().toLowerCase()
    if (!/^[0-9a-f]{64}$/.test(txid)) throw new Error('Not a txid: ' + txid)
    return txid
  }
}

// ------------------------------------------------------------------------------------------------

module.exports = Indexer
