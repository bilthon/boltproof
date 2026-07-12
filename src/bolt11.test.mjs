// Self-check for the BOLT11 decoder + verifier. Run: node src/bolt11.test.mjs
// No framework — plain assertions against BOLT11 spec vectors.
import { decodeInvoice, sha256Hex, hexToBytes } from './bolt11.js'

const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1) } console.log('ok:', m) }

// BOLT11 spec vector: "$3 for a cup of coffee" (lnbc2500u)
const inv = 'lnbc2500u1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4jsxqzpuaztrnwngzn3kdzw5hydlzf03qdgm2hdq27cqv3agm2awhz5se903vruatfhq77w3ls4evs3ch9zw97j25emudupq63nyw24cg27h2rspfj9srp'
const d = decodeInvoice(inv)
assert(d.paymentHash === '0001020304050607080900010203040506070809000102030405060708090102', 'payment_hash')
assert(d.amountMsat === 250000000, 'amount msat = ' + d.amountMsat)
assert(d.timestamp === 1496314658, 'timestamp = ' + d.timestamp)
assert(d.description === '1 cup coffee', 'description = ' + JSON.stringify(d.description))
assert(d.network === 'mainnet', 'network')

// sha256 of 32 zero bytes is a known constant
assert(await sha256Hex(new Uint8Array(32)) === '66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925', 'sha256(zeros)')

// hexToBytes rejects malformed preimages
let threw = false
try { hexToBytes('nothex') } catch { threw = true }
assert(threw, 'rejects non-hex preimage')

// end-to-end: the example pair verifies (sha256(preimage) === payment_hash)
const exInv = 'lnbc500u1p49ynagpp5cw22xc3ges5j6lgvte095z4v47ymk72gtl277rqz4hjlcskmwgfqdpggdhkven9v5sxzapq2dshgmmndp5jwueqgdskdsafqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq9nyher'
const exPre = '4c7f3a91e2b8d05f6a1c9e3b7d24f80a5e6c1b9384f7a2d0e5c8b1a6f39d47e2'
const exDecoded = decodeInvoice(exInv)
assert(await sha256Hex(hexToBytes(exPre)) === exDecoded.paymentHash, 'example pair verifies')

console.log('\nall passed')
