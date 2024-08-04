# like-ethers

Ethereum library for Node.js

Warning: Incomplete but efficient implementation of Ethers.

```
npm i like-ethers
```

## Usage

```js
const ethers = require('like-ethers')

const provider = new ethers.JsonRpcProvider('https://eth.llamarpc.com')

const blockNumber = await provider.getBlockNumber()
const block = await provider.getBlock(blockNumber, true)
const logs = await provider.getLogs({ fromBlock: blockNumber, toBlock: blockNumber })
```

## API

#### `const provider = new ethers.JsonRpcProvider(url)`

Create a provider to make RPC requests over HTTPS.

#### `await provider.destroy()`

Close all resources.

#### `const blockNumber = await provider.getBlockNumber()`

Get the current block number.

#### `const block = await provider.getBlock(tag, [prefetchTxs])`

Get the block.

#### `const logs = await provider.getLogs(filter)`

Get the list of logs.

## License

MIT
