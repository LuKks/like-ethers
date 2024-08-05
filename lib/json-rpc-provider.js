const http = require('http')
const https = require('https')
const debounceify = require('debounceify')
const ethRequest = require('./eth-request.js')
const toChecksumAddress = require('./eth-checksum.js')

const BATCH_MAX_REQUESTS = 6

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

    this._httpAgent = http.Agent({ keepAlive: true, timeout: 30000 })
    this._httpsAgent = https.Agent({ keepAlive: true, timeout: 30000 })
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
      const txs = block.transactions.map(tx => {
        return {
          blockNumber: Number(tx.blockNumber, 16),
          blockHash: tx.blockHash,
          index: Number(tx.transactionIndex, 16),
          hash: tx.hash,
          type: Number(tx.type, 16),
          from: toChecksumAddress(tx.from),
          to: tx.to ? toChecksumAddress(tx.to) : null,
          nonce: Number(tx.nonce, 16),
          v: Number(tx.v),
          gasLimit: BigInt(tx.gas),
          gasPrice: tx.gasPrice ? BigInt(tx.gasPrice, 16) : null,
          maxPriorityFeePerGas: tx.maxPriorityFeePerGas ? BigInt(tx.maxPriorityFeePerGas, 16) : null,
          maxFeePerGas: tx.maxFeePerGas ? BigInt(tx.maxFeePerGas, 16) : null,
          data: tx.input,
          value: BigInt(tx.value, 16),
          chainId: tx.chainId ? BigInt(tx.chainId, 16) : null,
          signature: {
            r: tx.r,
            s: tx.s,
            yParity: tx.yParity ? Number(tx.yParity, 16) : null
          },
          accessList: tx.accessList
            ? tx.accessList.map(al => {
              return {
                address: toChecksumAddress(al.address),
                storageKeys: al.storageKeys
              }
            })
            : null
        }
      })

      block.prefetchedTransactions = txs
      block.transactions = txs.map(tx => tx.hash)
    }

    return {
      number: Number(block.number, 16),
      hash: block.hash,
      timestamp: Number(block.timestamp, 16),
      parentHash: block.parentHash,
      parentBeaconBlockRoot: block.parentBeaconBlockRoot,
      nonce: block.nonce,
      difficulty: BigInt(block.difficulty, 16),
      totalDifficulty: block.totalDifficulty ? BigInt(block.totalDifficulty, 16) : null,
      gasLimit: BigInt(block.gasLimit, 16),
      gasUsed: BigInt(block.gasUsed, 16),
      stateRoot: block.stateRoot,
      receiptsRoot: block.receiptsRoot,
      blobGasUsed: block.blobGasUsed ? BigInt(block.blobGasUsed, 16) : null,
      excessBlobGas: block.excessBlobGas ? BigInt(block.excessBlobGas, 16) : null,
      miner: toChecksumAddress(block.miner),
      extraData: block.extraData,
      baseFeePerGas: block.baseFeePerGas ? BigInt(block.baseFeePerGas, 16) : null,
      transactions: block.transactions,
      prefetchedTransactions: block.prefetchedTransactions
    }
  }

  async getLogs (param) {
    const logs = await this.api('eth_getLogs', [{
      address: param.address || null,
      topics: param.topics || [],
      fromBlock: toHex(param.fromBlock),
      toBlock: toHex(param.toBlock)
    }])

    for (let i = 0; i < logs.length; i++) {
      const log = logs[i]

      logs[i] = {
        transactionHash: log.transactionHash,
        blockHash: log.blockHash,
        blockNumber: Number(log.blockNumber, 16),
        removed: false,
        address: toChecksumAddress(log.address),
        data: log.data,
        topics: log.topics,
        index: Number(log.logIndex),
        transactionIndex: Number(log.transactionIndex, 16)
      }
    }

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
          req.reject(new Error('Missing response for request (' + req.body.id + ')'))
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

  static BATCH_MAX_REQUESTS = BATCH_MAX_REQUESTS
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
