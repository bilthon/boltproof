<script setup>
import { ref, computed } from 'vue'
import { decodeInvoice, sha256Hex, hexToBytes } from './bolt11.js'

const accent = '#f7931a'

const phase = ref('idle')          // 'idle' | 'verifying' | 'result'
const invoice = ref('')
const preimage = ref('')
const help = ref(null)             // null | 'invoice' | 'preimage'
const error = ref(null)
const outcome = ref(null)          // null | 'verified' | 'mismatch'
const decoded = ref(null)
const saved = ref(false)

const canVerify = computed(() => invoice.value.trim().length > 0 && preimage.value.trim().length > 0)

function toggleHelp(k) { help.value = help.value === k ? null : k }

async function verify() {
  if (!canVerify.value || phase.value === 'verifying') return
  error.value = null
  let d, preBytes
  try { d = decodeInvoice(invoice.value) }
  catch { error.value = "That doesn't look like a valid Lightning invoice — check you copied all of it."; return }
  try { preBytes = hexToBytes(preimage.value) }
  catch { error.value = 'The preimage should be 64 hexadecimal characters (the secret).'; return }

  help.value = null
  phase.value = 'verifying'
  // ponytail: sha256 is instant; the min-delay just lets the "verifying" animation land.
  const [hash] = await Promise.all([
    sha256Hex(preBytes),
    new Promise((r) => setTimeout(r, 750)),
  ])
  decoded.value = d
  outcome.value = hash === d.paymentHash ? 'verified' : 'mismatch'
  saved.value = false
  phase.value = 'result'
}

function reset() {
  phase.value = 'idle'
  invoice.value = ''
  preimage.value = ''
  outcome.value = null
  decoded.value = null
  help.value = null
  error.value = null
  saved.value = false
}

function fillExample() {
  invoice.value = 'lnbc500u1p49ynagpp5cw22xc3ges5j6lgvte095z4v47ymk72gtl277rqz4hjlcskmwgfqdpggdhkven9v5sxzapq2dshgmmndp5jwueqgdskdsafqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq9nyher'
  preimage.value = '4c7f3a91e2b8d05f6a1c9e3b7d24f80a5e6c1b9384f7a2d0e5c8b1a6f39d47e2'
  help.value = null
  error.value = null
}

function saveProof() {
  const d = decoded.value
  const text = [
    'boltproof — Lightning payment proof',
    '',
    'Result:          PAYMENT PROVEN',
    'Amount:          ' + amountText.value,
    'Paid for:        ' + memoText.value,
    'Invoice created: ' + whenText.value,
    'Network:         ' + d.network,
    '',
    'Payment hash:    ' + d.paymentHash,
    'Preimage:        ' + preimage.value.trim().toLowerCase(),
    'Invoice:         ' + invoice.value.trim(),
    '',
    'Verified locally: sha256(preimage) == payment_hash',
  ].join('\n')
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'payment-proof.txt'
  a.click()
  URL.revokeObjectURL(url)
  saved.value = true
  setTimeout(() => (saved.value = false), 1800)
}

const amountText = computed(() => {
  const m = decoded.value?.amountMsat
  if (m == null) return 'Any amount'
  return (m / 1000).toLocaleString('en-US', { maximumFractionDigits: 3 }) + ' sats'
})
const btcText = computed(() => {
  const m = decoded.value?.amountMsat
  if (m == null) return 'Amount not fixed in this invoice'
  return '≈ ' + (m / 1e11).toLocaleString('en-US', { maximumFractionDigits: 8 }) + ' BTC'
})
const memoText = computed(() => decoded.value?.description || '—')
const whenText = computed(() => {
  const t = decoded.value?.timestamp
  return t ? new Date(t * 1000).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
})

const verifyBtnStyle = computed(() => ({
  width: '100%',
  padding: '14px',
  border: 'none',
  borderRadius: '14px',
  background: canVerify.value ? `linear-gradient(150deg, #ffb648, ${accent})` : '#f0e7da',
  color: canVerify.value ? '#fff' : '#c3b6a4',
  fontSize: '15px',
  fontWeight: 700,
  letterSpacing: '-.2px',
  cursor: canVerify.value ? 'pointer' : 'not-allowed',
  boxShadow: canVerify.value ? '0 8px 20px -8px rgba(247,147,26,.6)' : 'none',
  transition: 'filter .15s',
}))

function helpBtnStyle(active) {
  return {
    width: '16px', height: '16px', borderRadius: '50%', border: 'none',
    background: active ? accent : '#f1e7d8',
    color: active ? '#fff' : '#a58a63',
    fontSize: '10px', fontWeight: 700, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    lineHeight: 1, padding: 0, transition: 'background .15s,color .15s',
  }
}

// 15 radial sparks for the "verified" burst
const sparks = computed(() => Array.from({ length: 15 }, (_, i) => {
  const dist = 42 + (i % 3) * 16
  const dot = i % 2 === 0
  const col = i % 3 === 0 ? accent : (i % 3 === 1 ? '#ffb648' : '#ffd28f')
  return {
    key: i,
    wrap: { position: 'absolute', left: '50%', top: '50%', transform: `rotate(${(i / 15) * 360}deg)` },
    inner: {
      position: 'absolute', left: dot ? '-3px' : '-1.5px', top: 0,
      width: dot ? '6px' : '3px', height: dot ? '6px' : '11px',
      background: col, borderRadius: dot ? '50%' : '3px',
      '--d': dist + 'px', opacity: 0,
      animation: `lvSpark .85s ${0.45 + (i % 5) * 0.03}s ease-out forwards`,
    },
  }
}))
</script>

<template>
  <div class="lv-page">
    <div style="width: 100%; max-width: 452px;">

      <div style="display: flex; align-items: center; gap: 10px; justify-content: center; margin-bottom: 22px;">
        <div style="width: 30px; height: 30px; border-radius: 9px; background: linear-gradient(150deg, #ffb648, #f7931a); display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(247,147,26,.32);">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="#fff"><path d="M13 2L4.5 13.5H11L10 22l8.5-11.5H12L13 2z" /></svg>
        </div>
        <span style="font-weight: 700; font-size: 17px; letter-spacing: -.3px; color: #2b2622;">boltproof</span>
      </div>

      <div style="background: #ffffff; border: 1px solid #efe6d9; border-radius: 24px; padding: 26px 24px 24px; box-shadow: 0 1px 2px rgba(43,38,34,.04), 0 18px 44px -22px rgba(120,80,20,.22); position: relative; overflow: hidden;">

        <!-- FORM -->
        <div v-if="phase !== 'result'">
          <h1 style="margin: 0 0 5px; font-size: 21px; font-weight: 700; letter-spacing: -.4px; color: #2b2622;">Did they really pay you?</h1>
          <p style="margin: 0 0 22px; font-size: 14px; line-height: 1.5; color: #857b6f;">Paste the invoice and the secret they gave you. We'll confirm the payment is real.</p>

          <div style="margin-bottom: 16px; position: relative;">
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 7px;">
              <label style="font-size: 12.5px; font-weight: 600; color: #4a423a;">Lightning invoice</label>
              <button @click="toggleHelp('invoice')" aria-label="What is this?" :style="helpBtnStyle(help === 'invoice')">?</button>
            </div>
            <textarea v-model="invoice" rows="2" placeholder="lnbc500u1p3…" spellcheck="false" class="lv-input"
              style="width: 100%; resize: none; font-family: 'Space Mono', monospace; font-size: 12.5px; line-height: 1.5; word-break: break-all;"></textarea>
            <div v-if="help === 'invoice'" class="lv-tip">
              <span class="lv-tip-arrow" style="left: 96px;"></span>
              The invoice is the payment request you sent — a long code starting with <span style="font-family: 'Space Mono', monospace; color: #ffc477;">lnbc</span>. It contains the amount and a locked fingerprint of the payment.
            </div>
          </div>

          <div style="margin-bottom: 22px; position: relative;">
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 7px;">
              <label style="font-size: 12.5px; font-weight: 600; color: #4a423a;">Preimage <span style="font-weight: 400; color: #a89c8c;">(the secret)</span></label>
              <button @click="toggleHelp('preimage')" aria-label="What is this?" :style="helpBtnStyle(help === 'preimage')">?</button>
            </div>
            <input v-model="preimage" placeholder="64-character secret…" spellcheck="false" class="lv-input"
              style="width: 100%; font-family: 'Space Mono', monospace; font-size: 12.5px;" />
            <div v-if="help === 'preimage'" class="lv-tip">
              <span class="lv-tip-arrow" style="left: 132px;"></span>
              Only the person who actually paid receives this secret. If it unlocks the invoice's fingerprint, the payment truly happened — no bank or receipt needed.
            </div>
          </div>

          <p v-if="error" style="margin: 0 0 14px; font-size: 12.5px; line-height: 1.45; color: #cc5b47;">{{ error }}</p>

          <button @click="verify" :disabled="!canVerify" :style="verifyBtnStyle" class="lv-hover-bright">
            <span v-if="phase === 'verifying'" style="display: inline-flex; align-items: center; gap: 9px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff" style="animation: lvBolt 1s ease-in-out infinite;"><path d="M13 2L4.5 13.5H11L10 22l8.5-11.5H12L13 2z" /></svg>
              Verifying…
            </span>
            <span v-else>Verify payment</span>
          </button>

          <div style="text-align: center; margin-top: 13px;">
            <button @click="fillExample" class="lv-example">Try it with an example →</button>
          </div>
        </div>

        <!-- RESULT -->
        <div v-else style="position: relative;">

          <div v-if="outcome === 'verified'" style="text-align: center;">
            <div style="position: relative; width: 92px; height: 92px; margin: 6px auto 4px;">
              <div style="position: absolute; inset: 0; pointer-events: none;">
                <span v-for="s in sparks" :key="s.key" :style="s.wrap"><span :style="s.inner"></span></span>
              </div>
              <div style="position: absolute; inset: 0; border-radius: 50%; background: radial-gradient(circle, rgba(247,147,26,.28), transparent 70%); animation: lvHalo .9s ease-out .1s forwards;"></div>
              <svg width="92" height="92" viewBox="0 0 92 92" style="position: relative;">
                <circle cx="46" cy="46" r="40" fill="none" stroke="#f7931a" stroke-width="4" stroke-dasharray="252" stroke-dashoffset="252" stroke-linecap="round" style="animation: lvDraw .55s cubic-bezier(.65,0,.35,1) .15s forwards; transform: rotate(-90deg); transform-origin: 46px 46px;"></circle>
                <path d="M30 47.5 L41 58 L63 34" fill="none" stroke="#f7931a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="60" stroke-dashoffset="60" style="animation: lvDraw .4s cubic-bezier(.65,0,.35,1) .5s forwards;"></path>
              </svg>
            </div>
            <h2 style="margin: 8px 0 4px; font-size: 22px; font-weight: 800; letter-spacing: -.4px; color: #2b2622; animation: lvRise .4s ease .5s both;">Payment proven</h2>
            <p style="margin: 0 0 20px; font-size: 13.5px; color: #857b6f; animation: lvRise .4s ease .58s both;">The secret unlocked the invoice. This is real money, received.</p>

            <div style="position: relative; background: #fffdf9; border: 1px solid #f1e6d3; border-radius: 18px; padding: 20px 20px 16px; text-align: left; animation: lvPop .5s cubic-bezier(.34,1.3,.64,1) .62s both;">
              <div style="display: flex; align-items: center; gap: 7px; margin-bottom: 14px;">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="#f7931a"><path d="M13 2L4.5 13.5H11L10 22l8.5-11.5H12L13 2z" /></svg>
                <span style="font-size: 10.5px; font-weight: 700; letter-spacing: 1.2px; color: #c88a2e;">PAYMENT PROVEN</span>
              </div>
              <div style="font-size: 32px; font-weight: 800; letter-spacing: -1px; color: #2b2622; line-height: 1;">{{ amountText }}</div>
              <div style="font-size: 13px; color: #a89c8c; margin-top: 3px;">{{ btcText }}</div>

              <div style="height: 1px; background: repeating-linear-gradient(90deg, #e8ddca 0 6px, transparent 6px 12px); margin: 16px -20px;"></div>
              <div style="position: absolute; left: -8px; width: 16px; height: 16px; border-radius: 50%; background: #ffffff; border: 1px solid #f1e6d3; margin-top: -8px;"></div>
              <div style="position: absolute; right: -8px; width: 16px; height: 16px; border-radius: 50%; background: #ffffff; border: 1px solid #f1e6d3; margin-top: -8px;"></div>

              <div style="display: flex; justify-content: space-between; gap: 12px; margin-bottom: 8px;">
                <span style="font-size: 12.5px; color: #a89c8c;">Paid for</span>
                <span style="font-size: 12.5px; font-weight: 600; color: #4a423a; text-align: right;">{{ memoText }}</span>
              </div>
              <div style="display: flex; justify-content: space-between; gap: 12px;">
                <span style="font-size: 12.5px; color: #a89c8c;">Invoice created</span>
                <span style="font-size: 12.5px; font-weight: 600; color: #4a423a; text-align: right;">{{ whenText }}</span>
              </div>
            </div>
          </div>

          <div v-else style="text-align: center; padding: 6px 0;">
            <div style="width: 76px; height: 76px; margin: 4px auto 12px; border-radius: 50%; background: #fdeeea; display: flex; align-items: center; justify-content: center; animation: lvPop .45s cubic-bezier(.34,1.3,.64,1) both;">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#cc5b47" stroke-width="2.6" stroke-linecap="round"><path d="M8 8l8 8M16 8l-8 8" /></svg>
            </div>
            <h2 style="margin: 0 0 5px; font-size: 21px; font-weight: 800; letter-spacing: -.4px; color: #2b2622;">These don't match</h2>
            <p style="margin: 0 auto; max-width: 320px; font-size: 13.5px; line-height: 1.55; color: #857b6f;">This secret doesn't unlock this invoice. It doesn't prove <em>this</em> payment — double-check you copied both from the same transaction.</p>
          </div>

          <div style="display: flex; gap: 10px; margin-top: 22px;">
            <button v-if="outcome === 'verified'" @click="saveProof" class="lv-save"
              style="flex: 1; padding: 13px; border-radius: 13px; border: 1.5px solid #ece2d3; background: #ffffff; color: #4a423a; font-size: 14px; font-weight: 600; cursor: pointer;">{{ saved ? 'Saved ✓' : 'Save proof' }}</button>
            <button @click="reset" class="lv-hover-bright"
              style="flex: 1; padding: 13px; border: none; border-radius: 13px; background: linear-gradient(150deg, #ffb648, #f7931a); color: #fff; font-size: 14px; font-weight: 700; cursor: pointer; box-shadow: 0 8px 18px -9px rgba(247,147,26,.6); transition: filter .15s;">Verify another</button>
          </div>
        </div>

      </div>

      <p style="text-align: center; margin: 16px 0 0; font-size: 11.5px; color: #b3a794;">No account, no data stored — everything happens in your browser.</p>
    </div>
  </div>
</template>

<style>
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: 'Figtree', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
a { color: #b96b0a; text-decoration: none; }
a:hover { color: #8f520a; }
textarea, input, button { font-family: inherit; }
::placeholder { color: #b8ada0; }

.lv-page {
  min-height: 100vh; width: 100%;
  display: flex; align-items: center; justify-content: center;
  padding: 28px 18px;
  background: radial-gradient(120% 90% at 50% -10%, #fff6ea 0%, #faf4ec 45%, #f6efe4 100%);
}

.lv-input {
  border: 1.5px solid #ece2d3; border-radius: 13px; padding: 11px 13px;
  color: #2b2622; background: #fdfaf5;
}
.lv-input:focus { outline: none; border-color: #f7931a; background: #fffdf9; }

.lv-tip {
  position: absolute; z-index: 20; top: 26px; left: 0; right: 0;
  padding: 12px 14px; background: #43382c; border-radius: 13px;
  font-size: 12.5px; line-height: 1.55; color: #f3e7d3;
  box-shadow: 0 12px 30px -10px rgba(43,38,34,.45);
  animation: lvTip .22s cubic-bezier(.34,1.3,.64,1) both;
}
.lv-tip-arrow {
  position: absolute; top: -5px; width: 11px; height: 11px;
  background: #43382c; transform: rotate(45deg); border-radius: 2px;
}

.lv-example { background: none; border: none; font-size: 12.5px; color: #a89c8c; cursor: pointer; font-weight: 500; }
.lv-example:hover { color: #b96b0a; }

.lv-hover-bright:not(:disabled):hover { filter: brightness(1.04); }
.lv-save:hover { border-color: #f7931a; color: #b96b0a; }

@keyframes lvPop { 0% { transform: scale(.85); opacity: 0; } 60% { transform: scale(1.03); } 100% { transform: scale(1); opacity: 1; } }
@keyframes lvRise { 0% { transform: translateY(14px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
@keyframes lvDraw { to { stroke-dashoffset: 0; } }
@keyframes lvSpark { 0% { transform: translateY(0) scale(1); opacity: 0; } 12% { opacity: 1; } 100% { transform: translateY(calc(-1 * var(--d))) scale(.4); opacity: 0; } }
@keyframes lvBolt { 0%,100% { opacity: .35; transform: scale(.9); } 50% { opacity: 1; transform: scale(1.12); } }
@keyframes lvHalo { 0% { transform: scale(.6); opacity: .55; } 100% { transform: scale(2.2); opacity: 0; } }
@keyframes lvTip { 0% { transform: translateY(-6px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
</style>
