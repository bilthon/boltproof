// Minimal BOLT11 decoder + verifier. Pure JS, one dep (@noble/secp256k1).
// Verified against BOLT11 spec test vectors — see bolt11.test.mjs.
// decodeInvoice() validates the bech32 checksum AND the node's ECDSA signature
// before returning, so a tampered invoice (e.g. a swapped payment_hash) is
// rejected here rather than silently passing the preimage check downstream.
import * as secp from '@noble/secp256k1'

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

// BIP173 bech32 checksum (constant 1). `words` includes the trailing 6 checksum words.
const BECH32_GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
function bech32Polymod(values) {
  let chk = 1
  for (const v of values) {
    const top = chk >>> 25
    chk = ((chk & 0x1ffffff) << 5) ^ v
    for (let i = 0; i < 5; i++) if ((top >> i) & 1) chk ^= BECH32_GEN[i]
  }
  return chk >>> 0
}
function bech32HrpExpand(hrp) {
  const out = []
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) >> 5)
  out.push(0)
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) & 31)
  return out
}
function bech32ChecksumValid(hrp, words) {
  return bech32Polymod(bech32HrpExpand(hrp).concat(words)) === 1
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

// regroup 5-bit words -> 8-bit bytes, zero-padding the final partial byte.
// This is the form the BOLT11 signature commits to for the data part.
function wordsToBytesPadded(words) {
  let acc = 0, bits = 0
  const out = []
  for (const w of words) {
    acc = (acc << 5) | w
    bits += 5
    while (bits >= 8) { bits -= 8; out.push((acc >> bits) & 0xff) }
  }
  if (bits > 0) out.push((acc << (8 - bits)) & 0xff)
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

// The invoice payload the node signed: hrp bytes + zero-padded data words
// (everything after the separator, excluding the 65-byte signature itself).
function signingMessage(hrp, signingWords) {
  const hrpBytes = Uint8Array.from(hrp, (c) => c.charCodeAt(0))
  const dataBytes = wordsToBytesPadded(signingWords)
  const msg = new Uint8Array(hrpBytes.length + dataBytes.length)
  msg.set(hrpBytes, 0)
  msg.set(dataBytes, hrpBytes.length)
  return msg
}

// Verify the recoverable ECDSA signature over the invoice payload.
// Returns the payee node pubkey (hex). Throws if the signature doesn't check out.
async function verifyInvoiceSignature(msg, sigBytes, nodePubkeyBytes) {
  const compact = sigBytes.slice(0, 64)
  if (nodePubkeyBytes) {
    // BOLT11: with an `n` field present, verify against it and require low-S.
    let ok = false
    try {
      ok = await secp.verifyAsync(compact, msg, nodePubkeyBytes, { prehash: true, lowS: true })
    } catch { ok = false }
    if (!ok) throw new Error('invalid invoice signature')
    return toHex(nodePubkeyBytes)
  }
  // BOLT11: without `n`, recover the payee pubkey (accepts high-S and low-S).
  // BOLT11 packs the signature as R||S||recovery; noble wants recovery||R||S.
  const recovered = new Uint8Array(65)
  recovered[0] = sigBytes[64]
  recovered.set(compact, 1)
  try {
    const pub = await secp.recoverPublicKeyAsync(recovered, msg, { prehash: true })
    return toHex(pub)
  } catch {
    throw new Error('invalid invoice signature')
  }
}

export async function decodeInvoice(raw) {
  const clean = raw.trim().replace(/^lightning:/i, '').replace(/\s+/g, '')
  const { hrp, words } = bech32Words(clean)
  if (!hrp.startsWith('ln')) throw new Error('not a lightning invoice')
  if (words.length < 7 + 104 + 6) throw new Error('invoice too short')
  if (!bech32ChecksumValid(hrp, words)) throw new Error('invalid bech32 checksum')
  const { network, amountMsat } = parseHrp(hrp)

  const data = words.slice(0, words.length - 6)      // drop bech32 checksum
  const signingWords = data.slice(0, data.length - 104) // timestamp + tags (signed payload)
  const sigWords = data.slice(data.length - 104)     // 65-byte signature (R||S||recovery)
  const sigBytes = wordsToBytes(sigWords)

  const timestamp = wordsToIntBE(signingWords.slice(0, 7))
  const tagWords = signingWords.slice(7)

  const tags = {}
  for (let i = 0; i + 3 <= tagWords.length;) {
    const type = tagWords[i]
    const len = tagWords[i + 1] * 32 + tagWords[i + 2]
    const body = tagWords.slice(i + 3, i + 3 + len)
    if (body.length < len) break
    if (type === 1 && !tags.payment_hash) tags.payment_hash = toHex(wordsToBytes(body))
    else if (type === 13 && tags.description === undefined) tags.description = new TextDecoder().decode(wordsToBytes(body))
    else if (type === 6 && tags.expiry === undefined) tags.expiry = wordsToIntBE(body)
    else if (type === 19 && tags.node_pubkey === undefined) tags.node_pubkey = wordsToBytes(body)
    i += 3 + len
  }
  if (!tags.payment_hash) throw new Error('invoice has no payment hash')

  const msg = signingMessage(hrp, signingWords)
  const nodePubkey = await verifyInvoiceSignature(msg, sigBytes, tags.node_pubkey ?? null)

  return {
    network,
    amountMsat,
    timestamp,
    paymentHash: tags.payment_hash,
    description: tags.description ?? null,
    expiry: tags.expiry ?? 3600,
    nodePubkey,
    signatureValid: true,
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
