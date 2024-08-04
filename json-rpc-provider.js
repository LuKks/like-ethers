const http = require('http')
const https = require('https')
const debounceify = require('debounceify')
const ethRequest = require('./lib/eth-request.js')

const BATCH_MAX_REQUESTS = 3

module.exports = class JsonRpcProvider {
  constructor (url, opts = {}) {
    this.rpc = url
    this.networkId = 0
    this.chainId = 0

    this._id = 1
    this._destroying = false
    this._verbose = opts.verbose || false

    this._batch = []
    this._batchTimeout = null
    this._sendBatchBound = debounceify(this._sendBatch.bind(this))

    this._httpAgent = http.Agent({ keepAlive: true, timeout: 30 })
    this._httpsAgent = https.Agent({ keepAlive: true, timeout: 30 })
  }

  get agent () {
    const isHTTPS = this.rpc.startsWith('https:')

    return isHTTPS ? this._httpsAgent : this._httpAgent
  }

  async ready () {
    const network = await this.getNetwork()

    this.networkId = network.networkId
    this.chainId = network.chainId
  }

  async destroy () {
    if (this._destroying) {
      return
    }

    this._destroying = true

    try {
      await this._sendBatchBound()
    } catch {}

    this._httpAgent.destroy()
    this._httpsAgent.destroy()
  }

  async getNetwork () {
    let networkId = await this.api('net_version')
    let chainId = await this.api('eth_chainId')

    if (typeof networkId === 'string') {
      networkId = Number(networkId, 16)
    }

    if (typeof chainId === 'string') {
      chainId = Number(chainId, 16)
    }

    return {
      networkId,
      chainId
    }
  }

  async getBlockNumber () {
    const blockNumber = await this.api('eth_blockNumber')

    if (typeof blockNumber === 'string') {
      return Number(blockNumber, 16)
    }

    return blockNumber
  }

  async getBlock (tag, prefetchTxs) {
    const block = await this.api('eth_getBlockByNumber', [toHex(tag), prefetchTxs])

    if (block && prefetchTxs) {
      block.prefetchedTransactions = block.transactions
    }

    return block
  }

  async getLogs (param) {
    const logs = await this.api('eth_getLogs', [{
      address: param.address || null,
      topics: param.topics || [],
      fromBlock: toHex(param.fromBlock),
      toBlock: toHex(param.toBlock)
    }])

    return logs
  }

  async api (method, params) {
    if (this._destroying) {
      throw new Error('Provider is destroyed')
    }

    if (!params) params = []

    const req = new Request({
      id: this._nextId(),
      method,
      params
    })

    if (this._batchTimeout) {
      clearTimeout(this._batchTimeout)
    }

    this._batch.push(req)

    this._batchTimeout = setTimeout(this._sendBatchBound, 1)

    const out = await req.promise

    if (out instanceof Error) {
      throw out
    }

    return out
  }

  async _sendBatch () {
    if (this._batchTimeout) {
      clearTimeout(this._batchTimeout)
      this._batchTimeout = null
    }

    if (this._batch.length === 0) {
      return
    }

    const batch = this._batch.splice(0, BATCH_MAX_REQUESTS)

    try {
      const bodies = batch.map(req => req.body)
      const out = await ethRequest(this.rpc, bodies, { agent: this.agent, verbose: this._verbose })

      if (this._verbose) console.log('out', out)

      while (batch.length) {
        const req = batch.shift()
        const res = out.get(req.body.id)

        if (!res) {
          req.reject(new Error('No result found: ' + req.body.id))
          continue
        }

        if (res.err) {
          req.reject(res.err)
          continue
        }

        req.resolve(res.result)
      }
    } catch (err) {
      for (const req of batch) {
        req.reject(err)
      }
    }

    if (this._batch.length > 0) {
      this._sendBatchBound().catch(noop)
    }
  }

  _nextId () {
    if (this._id === 0xffffffff) {
      this._id = 1
    }

    return this._id++
  }
}

class Request {
  constructor (body) {
    this.body = body

    this.promise = new Promise((resolve, reject) => {
      this.resolve = resolve
      this.reject = reject
    })
  }
}

function toHex (int) {
  return '0x' + int.toString(16)
}

function noop () {}
