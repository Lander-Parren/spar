import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { Stats } from '../core/aggregate.js'

/**
 * Render the dashboard as one self-contained file.
 *
 * No CDN, no build step, no chart library, no network of any kind — the page must
 * open in five years, offline, from a double-click. The charts are hand-written SVG
 * for the same reason.
 */
export function renderHtml(stats: Stats, generated = new Date()): string {
  const template = readFileSync(templatePath(), 'utf8')
  return template
    .replace('{{GENERATED}}', escapeHtml(generated.toISOString().replace('T', ' ').slice(0, 16)))
    .replace('{{STATS}}', embedJson(stats))
}

/**
 * Embed JSON inside a <script> tag safely.
 *
 * A concept named `</script>` would otherwise close the tag and the rest of the page
 * would render as text — and concept names are free text the user types. Escaping the
 * three characters that can start a tag boundary keeps the JSON valid either way.
 */
function embedJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    // U+2028 and U+2029 are valid in JSON strings but are line terminators in JS source.
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}

function templatePath(): string {
  // dist/render/html.js -> ../../templates/dashboard.html
  const here = dirname(fileURLToPath(import.meta.url))
  return join(here, '..', '..', 'templates', 'dashboard.html')
}
