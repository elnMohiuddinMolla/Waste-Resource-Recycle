// ==============================================================================
// Waste Resource Recycle (WRR) - Static frontend check (prompt.md D1)
// No browser needed. For every page in frontend/ it checks that:
//   - the viewport meta tag is present (mobile layout, NFR-06),
//   - there is no inline code the Content-Security-Policy would block,
//   - every script, stylesheet and local link points to a file that exists,
//   - every JS import resolves, and every page linked from JS exists,
//   - no script uses innerHTML / document.write (NFR-03).
// Usage (from backend/):   npm run check:frontend
// ==============================================================================

const fs = require('fs');
const path = require('path');

const FRONTEND = path.join(__dirname, '..', '..', 'frontend');
const problems = [];
let checks = 0;

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]);
}

const rel = (file) => path.relative(FRONTEND, file).replace(/\\/g, '/');
const exists = (urlPath) => fs.existsSync(path.join(FRONTEND, urlPath.split(/[?#]/)[0]));

function expect(ok, file, message) {
  checks++;
  if (!ok) problems.push(`${rel(file)}: ${message}`);
}

const files = walk(FRONTEND);
const htmlFiles = files.filter((f) => f.endsWith('.html'));
const jsFiles = files.filter((f) => f.endsWith('.js'));

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  expect(/<meta name="viewport" content="width=device-width, initial-scale=1">/.test(html), file, 'missing viewport meta');
  expect(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html), file, 'inline <script> (blocked by the CSP)');
  expect(!/<style[\s>]/i.test(html), file, 'inline <style> (blocked by the CSP)');
  expect(!/\sstyle="/i.test(html), file, 'style="" attribute (blocked by the CSP)');
  expect(!/\son[a-z]+="/i.test(html), file, 'onclick-style attribute (blocked by the CSP)');
  for (const [, src] of html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)) expect(exists(src), file, `script not found: ${src}`);
  for (const [, href] of html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)) expect(exists(href), file, `stylesheet not found: ${href}`);
  for (const [, href] of html.matchAll(/<a[^>]*\bhref="(\/[^"]*)"/g)) {
    expect(href === '/' || exists(href), file, `link to a missing page: ${href}`);
  }
}

for (const file of jsFiles) {
  const js = fs.readFileSync(file, 'utf8');
  expect(!/\.innerHTML\s*=|insertAdjacentHTML|document\.write/.test(js), file, 'uses innerHTML / document.write');
  for (const [, spec] of js.matchAll(/from\s+'(\.[^']+)'/g)) {
    expect(fs.existsSync(path.resolve(path.dirname(file), spec)), file, `import not found: ${spec}`);
  }
  // Page links written in JS, e.g. '/user/requests.html' or `/collector/record-weight.html?id=…`
  for (const [, page] of js.matchAll(/['`](\/(?:[a-z-]+\/)?[a-z-]+\.html)/g)) {
    expect(exists(page), file, `link to a missing page: ${page}`);
  }
}

console.log(`Pages: ${htmlFiles.length}, scripts: ${jsFiles.length}, checks: ${checks}`);
if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  problems.forEach((p) => console.log(`  - ${p}`));
  process.exitCode = 1;
} else {
  console.log('All frontend checks passed.');
}
