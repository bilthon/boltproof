// Guards the public claims. A preimage match shows an invoice was paid, not
// who paid, and privacy copy must say that — not that nothing leaves the machine.
import { readFileSync } from 'node:fs'

const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1) } console.log('ok:', m) }
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')

const app = read('./App.vue')
const readme = read('../README.md')
const html = read('../index.html')
const all = [app, readme, html].join('\n')

const overclaims = [
  'Did they really pay you',
  'Only the person who actually paid',
  'Only the party who actually paid',
  'Only whoever actually paid',
  'real money, received',
  'PAYMENT PROVEN',
  'no data leaves the browser',
  'Nothing is sent to a server',
  'really paid',
  'all local',
  'no data stored',
]
for (const phrase of overclaims) {
  assert(!all.toLowerCase().includes(phrase.toLowerCase()), 'copy does not overclaim: ' + phrase)
}

assert(app.includes('not who paid'), 'app states a preimage does not show who paid')
assert(readme.includes('not who paid'), 'readme states a preimage does not show who paid')
assert(html.includes('not who paid'), 'noscript/page states a preimage does not show who paid')
assert(app.includes('does not prove how much'), 'app states an amountless invoice does not prove the amount')
assert(/mixed case/i.test(readme) && /lowercase/i.test(readme) && /uppercase/i.test(readme), 'readme documents the bech32 case rule')
assert(app.includes('never transmitted'), 'app privacy claim is that the invoice and preimage are never transmitted')
assert(readme.includes('never transmitted'), 'readme privacy claim is that the invoice and preimage are never transmitted')
assert(html.includes('never transmitted'), 'page privacy claim is that the invoice and preimage are never transmitted')
assert(/sensitive/i.test(app), 'the proof download warns that the file is sensitive')
assert(app.includes('the node that signed the invoice'), 'app does not treat the invoice signature as a payer identity')

console.log('\nall passed')
