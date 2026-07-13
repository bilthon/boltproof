// Self-check for the BOLT11 decoder + verifier. Run: node src/bolt11.test.mjs
// No framework — plain assertions against BOLT11 spec vectors and a crafted
// tamper regression that swaps the payment_hash while keeping the signature.
import { decodeInvoice, sha256Hex, hexToBytes } from './bolt11.js'
import { encodeSignedInvoice, decodeBech32, encodeBech32, bytesToWords, wordsToBytesPadded } from './bolt11.testutil.mjs'

const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1) } console.log('ok:', m) }
async function assertThrows(fn, re, m) {
  let err = null
  try { await fn() } catch (e) { err = e }
  assert(err && re.test(err.message), m + (err ? ` (threw: ${err.message})` : ' (did not throw)'))
}

// BOLT11 spec vector: "1 cup coffee" (lnbc2500u). No `n` field, so the payee
// pubkey is recovered from the signature; check it matches the spec's node id.
const inv = 'lnbc2500u1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4jsxqzpuaztrnwngzn3kdzw5hydlzf03qdgm2hdq27cqv3agm2awhz5se903vruatfhq77w3ls4evs3ch9zw97j25emudupq63nyw24cg27h2rspfj9srp'
const d = await decodeInvoice(inv)
assert(d.paymentHash === '0001020304050607080900010203040506070809000102030405060708090102', 'payment_hash')
assert(d.amountMsat === 250000000, 'amount msat = ' + d.amountMsat)
assert(d.timestamp === 1496314658, 'timestamp = ' + d.timestamp)
assert(d.description === '1 cup coffee', 'description = ' + JSON.stringify(d.description))
assert(d.network === 'mainnet', 'network')
assert(d.nodePubkey === '03e7156ae33b0a208d0744199163177e909e80176e55d97a2f221ede0f934dd9ad', 'recovered payee pubkey')

// sha256 of 32 zero bytes is a known constant
assert(await sha256Hex(new Uint8Array(32)) === '66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925', 'sha256(zeros)')

// hexToBytes rejects malformed preimages
let threw = false
try { hexToBytes('nothex') } catch { threw = true }
assert(threw, 'rejects non-hex preimage')

// A bech32 string with a broken checksum must be rejected.
await assertThrows(() => decodeInvoice(inv.slice(0, -1) + (inv.slice(-1) === 'p' ? 'q' : 'p')), /checksum/, 'rejects bad bech32 checksum')

// Build our own signed invoice (with an `n` payee-pubkey tag) and a matching
// preimage. This is the demo pair used by the app's "Try an example" button.
const priv = hexToBytes('e126f68f7eafcc8b74f54d269fe206be715000f94dac067d1c04a8ca3b2db734')
const preimage = '4c7f3a91e2b8d05f6a1c9e3b7d24f80a5e6c1b9384f7a2d0e5c8b1a6f39d47e2'
const paymentHash = await sha256Hex(hexToBytes(preimage))
const signed = await encodeSignedInvoice(
  { hrp: 'lnbc500u', timestamp: 1496314658, paymentHash: hexToBytes(paymentHash), description: "Coffee at Satoshi's" },
  priv,
)
const sd = await decodeInvoice(signed)
assert(sd.signatureValid === true, 'signed invoice: signature valid')
assert(sd.paymentHash === paymentHash, 'signed invoice: payment_hash')
assert(await sha256Hex(hexToBytes(preimage)) === sd.paymentHash, 'signed invoice: preimage verifies')

// ---- Primary regression: tampered payment_hash ----
// Swap ONLY the payment_hash body for sha256(attacker_preimage), leave the
// timestamp, description, `n` tag, and the original 65-byte signature intact,
// then recompute only the bech32 checksum so the string is syntactically valid.
const attackerPreimage = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'
const attackerHash = await sha256Hex(hexToBytes(attackerPreimage))

const { hrp, words } = decodeBech32(signed)
const data = words.slice(0, words.length - 6)   // drop old checksum
const tamperedData = data.slice()
// Layout after separator: timestamp(7) then the p tag: type(1)+len(2)+body(52).
const pBodyStart = 7 + 3
const attackerBody = bytesToWords(hexToBytes(attackerHash))
for (let i = 0; i < 52; i++) tamperedData[pBodyStart + i] = attackerBody[i]
const tampered = encodeBech32(hrp, tamperedData)

// 1) The tampered invoice must be rejected by signature verification.
await assertThrows(() => decodeInvoice(tampered), /invalid invoice signature/, 'tampered payment_hash fails signature check')

// 2) Independently parse the tampered payment_hash (no signature check) and
//    confirm it now equals the attacker's hash...
const tamperedHash = Array.from(
  wordsToBytesPadded(decodeBech32(tampered).words.slice(pBodyStart, pBodyStart + 52)).slice(0, 32),
  (b) => b.toString(16).padStart(2, '0'),
).join('')
assert(tamperedHash === attackerHash, 'tampered invoice carries the attacker payment_hash')

// 3) ...and that the attacker's preimage matches it. Without signature
//    verification, this pair would have been a false "Payment proven".
assert(await sha256Hex(hexToBytes(attackerPreimage)) === tamperedHash, 'attacker preimage matches tampered hash (would false-positive without sig check)')

// 4) Control: the untouched invoice still decodes fine.
assert((await decodeInvoice(signed)).signatureValid === true, 'control: original invoice still verifies')

console.log('\nall passed')
