// /faq/ page checks (2026-10-08), no network:
//  - every "### N. Question" heading in the web version of docs/faq/blue-bee-ops-faq.md is a <summary> on /faq/, in order;
//  - the FAQPage JSON-LD lists the same questions, and each answer matches the visible answer text;
//  - links to /faq/ from the home page header and footer and the /demo/ footer;
//  - call buttons use tel:+12068553743 and "Call us about the Coverage plan"; jase@ is the only email; never "AI".
// Run: node tools/test_faq_page.js
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
const doc = read("docs/faq/blue-bee-ops-faq.md");
const faq = read("public/faq/index.html");
const home = read("public/index.html");
const demo = read("public/demo/index.html");

const decode = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
const text = (s) => decode(s.replace(/<\/?(p|div)\b[^>]*>/g, "\n").replace(/<[^>]+>/g, ""))
  .split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");

let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log(`ok   ${name}`); } catch (e) { failures++; console.log(`FAIL ${name}\n     ${e.message}`); }
};

const web = doc.split("\n## Spoken version")[0];
const docQuestions = [...web.matchAll(/^### \d+\. (.+)$/gm)].map((m) => m[1].trim());
const summaries = [...faq.matchAll(/<summary>([\s\S]*?)<\/summary>/g)].map((m) => decode(m[1]).trim());
const answers = [...faq.matchAll(/<div class="faq-answer">([\s\S]*?)<\/div>\s*<\/details>/g)].map((m) => text(m[1]));
const ld = JSON.parse(faq.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);

check("doc has questions", () => assert.ok(docQuestions.length >= 20, `only ${docQuestions.length} found`));
check("every doc question heading is on /faq/", () => {
  const missing = docQuestions.filter((q) => !summaries.includes(q));
  assert.deepStrictEqual(missing, [], `missing: ${missing.join(" | ")}`);
});
check("/faq/ questions match the doc in order", () => assert.deepStrictEqual(summaries, docQuestions));
check("JSON-LD is an FAQPage with the same questions", () => {
  assert.strictEqual(ld["@type"], "FAQPage");
  assert.deepStrictEqual(ld.mainEntity.map((q) => q.name), docQuestions);
});
check("JSON-LD answers match the visible answers", () => {
  assert.strictEqual(answers.length, docQuestions.length);
  ld.mainEntity.forEach((q, i) => assert.strictEqual(q.acceptedAnswer.text.split("\n").map((l) => l.trim()).join("\n"), answers[i], q.name));
});
check("home header and footer link to /faq/", () => {
  const nav = home.match(/<nav class="site-nav"[\s\S]*?<\/nav>/)[0];
  const footer = home.match(/<footer[\s\S]*?<\/footer>/)[0];
  assert.ok(nav.includes('href="/faq/"'), "header nav");
  assert.ok(footer.includes('href="/faq/"'), "footer");
});
check("/demo/ footer links to /faq/", () => assert.ok(demo.match(/<footer[\s\S]*?<\/footer>/)[0].includes('href="/faq/"')));
check("call buttons: tel link and label, no personal name", () => {
  const buttons = [...faq.matchAll(/<a class="btn[^"]*" href="tel:[^"]*"[\s\S]*?<\/a>/g)].map((m) => m[0]);
  assert.ok(buttons.length >= 2, "expected header and finale call buttons");
  buttons.forEach((b) => {
    assert.ok(b.includes('href="tel:+12068553743"'), b);
    assert.ok(b.includes("Call us about the Coverage plan"), b);
    assert.ok(!/Jase/.test(text(b)), b);
  });
});
check("only jase@bluebeeops.com as email", () => {
  const emails = new Set(faq.match(/[\w.+-]+@[\w-]+\.[\w.]+/g));
  assert.deepStrictEqual([...emails], ["jase@bluebeeops.com"]);
  assert.ok(!/contact@/i.test(faq));
});
check('never says "AI"', () => assert.ok(!/\bAI\b/.test(text(faq.replace(/<script[\s\S]*?<\/script>/g, ""))) && !/\bAI\b/.test(JSON.stringify(ld))));
check("does not load home.js", () => assert.ok(!faq.includes("/js/home.js")));

if (failures) { console.log(`\n${failures} check(s) failed`); process.exit(1); }
console.log("\nall /faq/ checks passed");
