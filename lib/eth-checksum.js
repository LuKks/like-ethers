const keccak = require('keccak')

module.exports = function toChecksumAddress (address) {
  if (typeof address !== 'string') {
    throw new Error('Address must be a string')
  }

  if (!/^(0x)?[0-9a-f]{40}$/i.test(address)) {
    throw new Error('Invalid address')
  }

  const addr = removeHexStart(address).toLowerCase()
  const hash = keccak('keccak256').update(addr).digest('hex')

  let out = '0x'

  for (let i = 0; i < addr.length; i++) {
    const shouldUpperCase = parseInt(hash[i], 16) > 7

    out += shouldUpperCase ? addr[i].toUpperCase() : addr[i]
  }

  return out
}

function removeHexStart (value) {
  if (value[0] === '0' && value[1] === 'x') return value.slice(2)
  return value
}
