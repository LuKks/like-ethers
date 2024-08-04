const http = require('http')
const stream = require('stream')
const httpProxy = require('http-proxy')
const { SocksProxyAgent } = require('socks-proxy-agent')

module.exports = async function proxyForward (opts = {}) {
  const {
    port = 0,
    address = '127.0.0.1',
    target = null,
    proxy = null
  } = opts

  const middle = httpProxy.createProxyServer()

  const server = http.createServer((req, res) => {
    let body = ''

    req.on('data', chunk => {
      body += chunk.toString()
    })

    req.on('end', () => {
      console.log('- Middle request:', JSON.parse(body))

      middle.web(req, res, {
        target,
        agent: proxy ? new SocksProxyAgent(proxy) : null,
        changeOrigin: true,
        buffer: new stream.Readable({
          read () {
            this.push(body)
            this.push(null)
          }
        })
      })
    })
  })

  middle.on('proxyRes', (proxyRes, req, res) => {
    let body = ''

    proxyRes.on('data', chunk => {
      body += chunk.toString()
    })

    proxyRes.on('end', () => {
      try {
        body = JSON.parse(body)

        for (let i = 0; i < body.length; i++) {
          const data = body[i]

          // Block number
          if (typeof data.result === 'string') {
            continue
          }

          // Block
          if (data.result && typeof data.result === 'object' && data.result.transactions) {
            data.result = {
              number: data.result.number
            }
            continue
          }

          // Logs
          if (data.result && Array.isArray(data.result)) {
            data.result = []
            continue
          }
        }
      } catch {}

      console.log('- Middle response:', body)
    })
  })

  const listening = new Promise((resolve, reject) => {
    server.listen(port, address, function (err) {
      if (err) reject(err)
      else resolve(server)
    })
  })

  return listening
}
