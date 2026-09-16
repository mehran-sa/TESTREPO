# Verification harness (development only)

Nothing here is shipped or loaded by `index.html`. The application remains a
zero-dependency static site.

## Why a bundle step

jsdom cannot execute `<script type="module">`. `build-test.mjs` therefore uses
esbuild to bundle the real module graph into a classic script and inlines the
split stylesheets, producing `out/test-page.html`. `test-entry.js` additionally
re-exposes module functions under the names the harness uses, so **the same
harness drives both the original single-file build and the modular build
unchanged** — which is what makes the two directly comparable.

## Setup

    npm install
    node build-test.mjs

## Comparing against the original build

    # snapshot the modular build
    node capture.mjs  out/test-page.html out/after.json
    node interact.mjs out/test-page.html out/after-interact.json
    node edge.mjs     out/test-page.html out/after-edge.json

    # snapshot a reference build the same way, then
    node diff.mjs out/before.json out/after.json

`diff.mjs` prints `IDENTICAL` and exits 0 when nothing observable changed.

### Canonicalising the print stylesheet

Splitting one `<style>` element into eight files changes the *text* of the print
document's stylesheet without changing its meaning. `canon.mjs` reduces that text
to a sorted multiset of CSS rules (and normalises the moved font path), so a
reordering is not reported while any lost, added or altered rule still is:

    node canon.mjs out/before.json out/before-canon.json
    node canon.mjs out/after.json  out/after-canon.json
    node diff.mjs  out/before-canon.json out/after-canon.json

## Scripts

| Script | What it checks |
|---|---|
| `capture.mjs` | 24 render cases (4 templates x 6 data shapes): invoice DOM, editors, totals, serialized snapshot, and the full print document |
| `interact.mjs` | 37 sequential user interactions against one live instance |
| `edge.mjs` | `<dialog>` overwrite prompt, logo validation, JSON export, calc clamping |
| `css-compare.mjs` | computed styles for every invoice element under every template, inline stylesheet vs split stylesheets (loads the real files from disk) |
| `globals.mjs` | the `window` surface, for namespace-pollution and compatibility checks |
| `unknown-tpl.mjs` | the corrupt-import path |
| `canon.mjs` | canonicalises print CSS for cross-architecture diffs |
| `eslint.config.mjs` | lint config for the module tree (`npx eslint js/` from the project root) |

## Caveat

jsdom does not lay out or paint. These checks prove the DOM and the effective CSS
are equivalent. They cannot prove pixel positions or PDF page counts — open the
app in a browser and compare printed PDFs for that.
