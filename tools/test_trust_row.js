// Trust badge row checks (2026-10-10), no network: home, /faq/ and /demo/ footers carry the four badges,
// each with an aria-hidden inline SVG and visible text, and no external image requests.
// Run: node tools/test_trust_row.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const LABELS = ["Protected by Cloudflare", "Secured by Clerk", "Payments secured by Stripe", "256-bit SSL encryption"];
let failures = 0;
for (const page of ["public/index.html", "public/faq/index.html", "public/demo/index.html"]) {
  try {
    const footer = fs.readFileSync(path.join(__dirname, "..", page), "utf8").match(/<footer[\s\S]*?<\/footer>/)[0];
    const row = footer.match(/<ul class="trust-row" aria-label="[^"]+">[\s\S]*?<\/ul>/);
    assert.ok(row, "no trust row in footer");
    const badges = row[0].match(/<li class="trust-badge">[\s\S]*?<\/li>/g);
    assert.strictEqual(badges.length, 4);
    badges.forEach((b, i) => {
      assert.ok(b.includes(`<span>${LABELS[i]}</span>`), `label ${LABELS[i]}`);
      assert.ok(/<svg [^>]*aria-hidden="true"/.test(b), "svg aria-hidden");
    });
    assert.ok(!/<img|https?:\/\//.test(row[0].replace(/xmlns="[^"]+"/g, "")), "no external requests");
    console.log(`ok   ${page}`);
  } catch (e) { failures++; console.log(`FAIL ${page}\n     ${e.message}`); }
}
if (failures) process.exit(1);
console.log("\nall trust row checks passed");
