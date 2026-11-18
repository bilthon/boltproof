// The homepage is a static file. These checks lock the crawl signals that
// live in the repo: robots allows the apex, nothing emits noindex, and the
// sitemap lists only the canonical URL with a current lastmod.
import { readFileSync } from 'node:fs'

const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1) } console.log('ok:', m) }
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')

const robots = read('../public/robots.txt')
const sitemap = read('../public/sitemap.xml')
const html = read('../index.html')

assert(/User-agent:\s*\*/.test(robots), 'robots addresses all crawlers')
assert(/Allow:\s*\//.test(robots), 'robots allows crawling')
assert(!/Disallow:\s*\//.test(robots), 'robots does not disallow the site')
assert(!/noindex/i.test(robots), 'robots has no noindex')
assert(robots.includes('Sitemap: https://boltproof.app/sitemap.xml'), 'robots sitemap URL is the apex')
assert(!robots.includes('www.boltproof.app'), 'robots does not advertise www')

assert(sitemap.includes('<loc>https://boltproof.app/</loc>'), 'sitemap loc is the canonical apex')
assert(!sitemap.includes('www.boltproof.app'), 'sitemap does not list www')
assert(sitemap.includes('<lastmod>2026-11-18</lastmod>'), 'sitemap lastmod is current')
assert(sitemap.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'), 'sitemap uses the sitemap namespace')

assert(html.includes('rel="canonical" href="https://boltproof.app/"'), 'canonical is the apex')
assert(/name="robots" content="index, follow/.test(html), 'robots meta allows indexing')
assert(!/noindex/i.test(html), 'page has no noindex')

console.log('\nall passed')
