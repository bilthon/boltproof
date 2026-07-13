// Test-only BOLT11 encoder. Builds signed invoices (and lets tests tamper them)
// so we can exercise decodeInvoice() against known inputs. NOT used by the app.
import * as secp from '@noble/secp256k1'

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]

function polymod(values) {
  let chk = 1
  for (const v of values) {
    const top = chk >>> 25
    chk = ((chk & 0x1ffffff) << 5) ^ v
    for (let i = 0; i < 5; i++) if ((top >> i) & 1) chk ^= GEN[i]
  }
  return chk >>> 0
}
function hrpExpand(hrp) {
  const out = []
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) >> 5)
  out.push(0)
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) & 31)
  return out
}
function createChecksum(hrp, dataWords) {
  const values = hrpExpand(hrp).concat(dataWords).concat([0, 0, 0, 0, 0, 0])
  const mod = polymod(values) ^ 1
  const out = []
  for (let i = 0; i < 6; i++) out.push((mod >> (5 * (5 - i))) & 31)
  return out
}

export function encodeBech32(hrp, dataWords) {
  const cs = createChecksum(hrp, dataWords)
  return hrp + '1' + dataWords.concat(cs).map((w) => CHARSET[w]).join('')
}

export function decodeBech32(str) {
  const s = str.toLowerCase()
  const pos = s.lastIndexOf('1')
  const hrp = s.slice(0, pos)
  const words = []
  for (const ch of s.slice(pos + 1)) words.push(CHARSET.indexOf(ch))
  return { hrp, words }
}

// convert 5-bit words -> bytes, zero-padding trailing bits (drops nothing).
export function wordsToBytesPadded(words) {
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

// convert bytes -> 5-bit words, zero-padding trailing bits.
export function bytesToWords(bytes) {
  let acc = 0, bits = 0
  const out = []
  for (const b of bytes) {
    acc = (acc << 8) | b
    bits += 8
    while (bits >= 5) { bits -= 5; out.push((acc >> bits) & 31) }
  }
  if (bits > 0) out.push((acc << (5 - bits)) & 31)
  return out
}

function tagWords(type, bodyWords) {
  const len = bodyWords.length
  return [type, Math.floor(len / 32), len % 32, ...bodyWords]
}

function intToWords(value, count) {
  const out = new Array(count).fill(0)
  for (let i = count - 1; i >= 0; i--) { out[i] = value & 31; value = Math.floor(value / 32) }
  return out
}

// Build and sign a BOLT11 invoice from parts. Includes the `n` (payee pubkey)
// tag so the signature is a real integrity check under decodeInvoice().
export async function encodeSignedInvoice({ hrp, timestamp, paymentHash, description }, privKey) {
  const pubkey = secp.getPublicKey(privKey) // 33-byte compressed
  const signingWords = [
    ...intToWords(timestamp, 7),
    ...tagWords(1, bytesToWords(paymentHash)),                 // p: payment_hash
    ...tagWords(13, bytesToWords(new TextEncoder().encode(description))), // d: description
    ...tagWords(19, bytesToWords(pubkey)),                     // n: payee pubkey
  ]
  const hrpBytes = Uint8Array.from(hrp, (c) => c.charCodeAt(0))
  const dataBytes = wordsToBytesPadded(signingWords)
  const msg = new Uint8Array(hrpBytes.length + dataBytes.length)
  msg.set(hrpBytes, 0)
  msg.set(dataBytes, hrpBytes.length)

  const recovered = await secp.signAsync(msg, privKey, { format: 'recovered', prehash: true })
  // noble: recovery || R || S  ->  BOLT11: R || S || recovery
  const sigBytes = new Uint8Array(65)
  sigBytes.set(recovered.slice(1), 0)
  sigBytes[64] = recovered[0]

  const dataWords = [...signingWords, ...bytesToWords(sigBytes)]
  return encodeBech32(hrp, dataWords)
}
