// Client login link checks (2026-10-09), no network:
//  - the home, /faq/ and /demo/ pages link to https://app.bluebeeops.com/sign-in from the header and the footer;
//  - the header link sits next to the gold call button and keeps a "Client login" label for screen readers;
//  - the /sms-consent, /privacy and /terms pages stay untouched (no login link).
// Run: node tools/test_client_login.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
const URL = "https://app.bluebeeops.com/sign-in";

let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log(`ok   ${name}`); } catch (e) { failures++; console.log(`FAIL ${name}\n     ${e.message}`); }
};

for (const page of ["public/index.html", "public/faq/index.html", "public/demo/index.html"]) {
  const html = read(page);
  const header = html.match(/<header class="site-header[\s\S]*?<\/header>/)[0];
  const footer = html.match(/<footer[\s\S]*?<\/footer>/)[0];
  check(`${page}: header login link next to the call button`, () => {
    const actions = header.match(/<div class="header-actions">[\s\S]*?<\/div>/)[0];
    const login = actions.match(/<a class="btn btn-login[^"]*" href="([^"]+)">[\s\S]*?<\/a>/);
    assert.ok(login, "no .btn-login in .header-actions");
    assert.strictEqual(login[1], URL);
    assert.ok(/<span class="login-label">Client login<\/span>/.test(login[0]), "label");
    assert.ok(/class="btn btn-gold[^"]*" href="tel:\+12068553743"/.test(actions), "gold call button");
  });
  check(`${page}: footer login link`, () => assert.ok(footer.includes(`<a href="${URL}">Client login</a>`)));
}

for (const page of ["public/sms-consent.html", "public/privacy.html", "public/terms.html"]) {
  check(`${page}: no login link`, () => assert.ok(!read(page).includes("app.bluebeeops.com")));
}

if (failures) { console.log(`\n${failures} check(s) failed`); process.exit(1); }
console.log("\nall client login checks passed");
