const test = require('brittle')
const ethers = require('./index.js')
const proxyForward = require('./lib/proxy-forward.js')

test('api', async function (t) {
  const provider = new ethers.JsonRpcProvider('https://eth.llamarpc.com')

  const networkId = await provider.api('net_version')

  t.is(networkId, '0x1')

  await provider.destroy()
})

test('get network', async function (t) {
  const provider = new ethers.JsonRpcProvider('https://eth.llamarpc.com')

  const network = await provider.getNetwork()

  t.is(network.networkId, 1)
  t.is(network.chainId, 1)

  await provider.destroy()
})

test('basic', async function (t) {
  const provider = new ethers.JsonRpcProvider('https://eth.llamarpc.com')

  const tag = 20455000
  const prefetchTxs = true

  const promise1 = provider.getBlock(tag, prefetchTxs)
  const promise2 = provider.getLogs({ address: null, topics: [], fromBlock: tag, toBlock: tag })
  const promise3 = provider.getBlockNumber()

  const [block, logs, blockNumber] = await Promise.all([promise1, promise2, promise3])

  t.ok(block.hash)
  t.ok(Array.isArray(logs))
  t.ok(typeof blockNumber === 'number')

  await provider.destroy()
})

test('batch many requests', async function (t) {
  const provider = new ethers.JsonRpcProvider('https://eth.llamarpc.com')

  const reqs = []
  const MAX = ethers.JsonRpcProvider.BATCH_MAX_REQUESTS

  for (let i = 0; i < MAX + 1; i++) {
    reqs.push(provider.getBlockNumber())
  }

  const all = await Promise.all(reqs)

  for (const res of all) {
    t.ok(typeof res === 'number')
  }

  await provider.destroy()
})

test.skip('proxy to intercept requests', { timeout: 9999999 }, async function (t) {
  const proxy = await proxyForward({
    target: 'https://eth.llamarpc.com'
  })

  const rpc = 'http://' + proxy.address().address + ':' + proxy.address().port
  const provider = new ethers.JsonRpcProvider(rpc)

  const tag = 20455000

  while (true) {
    console.log()

    const promise1 = provider.getBlock(tag, false)
    const promise2 = provider.getLogs({ address: null, topics: [], fromBlock: tag, toBlock: tag })
    const promise3 = provider.getBlockNumber()

    try {
      const all = await Promise.all([promise1, promise2, promise3])

      console.log(all)
    } catch {
      try {
        await promise1
      } catch (err) {
        console.error('(promise1)', err)
      }

      try {
        await promise2
      } catch (err) {
        console.error('(promise2)', err)
      }

      try {
        await promise3
      } catch (err) {
        console.error('(promise3)', err)
      }

      break
    }
  }

  await provider.destroy()
})
