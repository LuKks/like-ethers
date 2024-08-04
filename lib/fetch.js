const http = require('http')
const https = require('https')

module.exports = function f3tch (url, opts = {}) {
  return new Promise((resolve, reject) => {
    url = new URL(url)

    const headers = opts.headers || {}

    if (opts.body) {
      headers['Content-Length'] = Buffer.byteLength(opts.body)
    }

    const isHTTP = url.protocol === 'http:'
    const proto = isHTTP ? http : https

    const req = proto.request(url, {
      method: opts.method || 'GET',
      headers,
      agent: opts.agent || null
    }, onresponse)

    req.on('error', function (err) {
      reject(err)
    })

    if (opts.body) {
      req.write(opts.body)
    }

    req.end()

    function onresponse (res) {
      let data = ''

      // TODO: Could not listen to 'data' to avoid consuming it
      res.on('data', function (chunk) {
        data += chunk.toString()
      })

      res.on('end', function () {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          statusText: res.statusMessage,
          body: {
            [Symbol.asyncIterator] () {
              return {
                next () {
                  // TODO
                  return Promise.resolve({ done: true, value: undefined })
                }
              }
            }
          },
          text: () => Promise.resolve(data),
          json: () => Promise.resolve(JSON.parse(data))
        })
      })
    }
  })
}
