const f3tch = require('./fetch.js')

module.exports = async function ethRequest (rpc, body, opts = {}) {
  if (!Array.isArray(body)) {
    body = [body]
  }

  body = body.map(req => {
    return {
      jsonrpc: req.jsonrpc || '2.0',
      id: req.id || 1,
      method: req.method,
      params: req.params
    }
  })

  if (opts.verbose) {
    console.log('ethRequest', rpc, body.map(req => [req.id, req.method, typeof req.params[0] === 'object' ? (req.params[0].fromBlock) : (req.params[0] || null)]))
  }

  const response = await f3tch(rpc, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body),
    agent: opts.agent || null
  })

  if (response.status === 403) {
    await gc(response)

    const err = new Error('Forbidden')
    err.rpc = rpc
    throw err
  }

  if (response.status === 429) {
    await gc(response)

    const err = new Error('Rate limit')
    err.rpc = rpc
    throw err
  }

  const datas = await response.json()
  const out = new Map()

  for (let i = 0; i < datas.length; i++) {
    const res = datas[i]
    const req = body.find(req => req.id === res.id)

    if (!res.id) {
      // TODO: Tmp debug
      console.error(res, res.error)
      throw new Error('Response has empty id')
    }

    if (res.error) {
      const err = new Error(res.error.message)

      err.code = res.error.code
      err.data = res.error.data

      err.rpc = rpc
      err.method = req?.method || null
      err.params = req?.params || null

      out.set(req?.id || res.id, { err })

      continue
    }

    if (!req) {
      out.set(res.id, { err: new Error('Missing response for request') })
      continue
    }

    out.set(req.id, { result: res.result })
  }

  return out
}
async function gc (response) {
  // Consume body to avoid mem leak
  try {
    for await (const _ of response.body) {} // eslint-disable-line
  } catch {}
}
