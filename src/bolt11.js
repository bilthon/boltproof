// Minimal BOLT11 decoder + preimage verifier. Pure, no deps.
// Verified against BOLT11 spec test vectors — see bolt11.test.mjs.
// It intentionally does NOT verify the invoice signature: proof of payment
// comes solely from sha256(preimage) === payment_hash, which needs no signature.
const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'

function bech32Words(str) {
  const s = str.toLowerCase()
  const pos = s.lastIndexOf('1')
  if (pos < 1) throw new Error('not a bech32 string')
  const hrp = s.slice(0, pos)
  const words = []
  for (const ch of s.slice(pos + 1)) {
    const v = CHARSET.indexOf(ch)
    if (v === -1) throw new Error('invalid character')
    words.push(v)
  }
  return { hrp, words }
}

// regroup 5-bit words -> 8-bit bytes, no padding (drops trailing partial bits)
function wordsToBytes(words) {
  let acc = 0, bits = 0
  const out = []
  for (const w of words) {
    acc = (acc << 5) | w
    bits += 5
    while (bits >= 8) { bits -= 8; out.push((acc >> bits) & 0xff) }
  }
  return Uint8Array.from(out)
}

const wordsToIntBE = (words) => words.reduce((a, w) => a * 32 + w, 0)
const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

const MULT_TO_MSAT = { '': 1e11, m: 1e8, u: 1e5, n: 1e2, p: 0.1 }
const NETWORKS = { bc: 'mainnet', tb: 'testnet', bcrt: 'regtest', tbs: 'signet', sb: 'simnet' }

function parseHrp(hrp) {
  const m = /^ln(bcrt|bc|tbs|tb|sb)(\d*)([munp]?)$/.exec(hrp)
  if (!m) throw new Error('unrecognized invoice prefix')
  const [, cur, digits, mult] = m
  let amountMsat = null
  if (digits) amountMsat = Math.round(Number(digits) * MULT_TO_MSAT[mult])
  return { network: NETWORKS[cur], amountMsat }
}

export function decodeInvoice(raw) {
  const clean = raw.trim().replace(/^lightning:/i, '').replace(/\s+/g, '')
  const { hrp, words } = bech32Words(clean)
  if (!hrp.startsWith('ln')) throw new Error('not a lightning invoice')
  if (words.length < 7 + 104 + 6) throw new Error('invoice too short')
  const { network, amountMsat } = parseHrp(hrp)

  const data = words.slice(0, words.length - 6)      // drop bech32 checksum
  const timestamp = wordsToIntBE(data.slice(0, 7))
  const tagWords = data.slice(7, data.length - 104)  // drop 65-byte signature

  const tags = {}
  for (let i = 0; i + 3 <= tagWords.length;) {
    const type = tagWords[i]
    const len = tagWords[i + 1] * 32 + tagWords[i + 2]
    const body = tagWords.slice(i + 3, i + 3 + len)
    if (body.length < len) break
    if (type === 1 && !tags.payment_hash) tags.payment_hash = toHex(wordsToBytes(body))
    else if (type === 13 && tags.description === undefined) tags.description = new TextDecoder().decode(wordsToBytes(body))
    else if (type === 6 && tags.expiry === undefined) tags.expiry = wordsToIntBE(body)
    i += 3 + len
  }
  if (!tags.payment_hash) throw new Error('invoice has no payment hash')

  return {
    network,
    amountMsat,
    timestamp,
    paymentHash: tags.payment_hash,
    description: tags.description ?? null,
    expiry: tags.expiry ?? 3600,
  }
}

export async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return toHex(new Uint8Array(digest))
}

export function hexToBytes(hex) {
  const clean = hex.trim().replace(/^0x/i, '').replace(/\s+/g, '')
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) throw new Error('preimage must be 64 hex characters')
  return Uint8Array.from(clean.match(/../g).map((h) => parseInt(h, 16)))
}
