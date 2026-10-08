// ?package= auto-start rules for public/demo/demo.js, run against a stubbed DOM, fetch and Turnstile:
// only a live package (Coverage) auto-starts a lease; intake/estimate open the page with no lease.
// Run: node tools/test_demo_package_fallback.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const SRC = fs.readFileSync(path.join(__dirname, "../public/demo/demo.js"), "utf8");

function stubEl() {
  const store = { textContent: "", hidden: false, disabled: false, children: [] };
  return new Proxy(store, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === "classList") return { add() {}, remove() {}, toggle() {}, contains: () => false };
      if (k === "getBoundingClientRect") return () => ({ top: 0, left: 0, right: 0, bottom: 0 });
      if (k === "getAttribute") return () => null;
      if (k === "firstChild") return null;
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

async function run(search) {
  const posts = [], listeners = {}, replaced = [];
  const els = {};
  const document = {
    documentElement: stubEl(), body: Object.assign(stubEl(), { children: [] }), visibilityState: "visible", title: "Demo",
    getElementById: (id) => id === "demo-config"
      ? { textContent: '{"apiBase":"https://api.example","turnstileSiteKey":"x"}' }
      : (els[id] = els[id] || stubEl()),
    querySelectorAll: () => [], querySelector: () => stubEl(), createElement: stubEl, createElementNS: stubEl, createTextNode: stubEl,
    addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
  };
  const href = "https://bluebeeops.com/demo/" + search;
  const sandbox = {
    document, URL, URLSearchParams, JSON, Date, Math, Blob, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
    location: { search, href }, navigator: {}, localStorage: { getItem: () => null, setItem() {} },
    crypto: { randomUUID: () => "11111111-2222-4333-8444-555555555555" },
    history: { replaceState: (_s, _t, url) => replaced.push(url) },
    matchMedia: () => ({ matches: false }), scrollTo() {}, addEventListener() {},
    performance: { now: () => 1000 },
    turnstile: { render: (_el, o) => { setTimeout(() => o.callback("tok"), 0); return 1; }, reset() {}, isExpired: () => false },
    fetch: (url, init) => {
      if (init && init.method === "POST") posts.push({ path: url.replace("https://api.example", ""), body: JSON.parse(init.body) });
      const body = url.endsWith("/status") ? { state: "open", mode: "on" } : { ok: false, reason: "test" };
      return Promise.resolve({ status: 200, json: () => Promise.resolve(body) });
    },
    WebSocket: function () {},
  };
  sandbox.window = sandbox;
  sandbox.window.location = sandbox.location;
  vm.runInNewContext(SRC, sandbox);
  (listeners.DOMContentLoaded || []).forEach((fn) => fn());
  await new Promise((r) => setTimeout(r, 50));
  return { leases: posts.filter((p) => p.path === "/lease").map((p) => p.body.package), replaced };
}

const CASES = [
  // [search, expected /lease packages, expected URL rewrites]
  ["?package=coverage", ["coverage"], []],
  ["?package=intake", [], ["/demo/"]],
  ["?package=estimate", [], ["/demo/"]],
  ["", [], []],
];

(async () => {
  let fail = 0;
  for (const [search, wantLeases, wantUrls] of CASES) {
    const got = await run(search);
    const ok = JSON.stringify(got.leases) === JSON.stringify(wantLeases) && JSON.stringify(got.replaced) === JSON.stringify(wantUrls);
    if (!ok) fail++;
    console.log((ok ? "ok   " : "FAIL ") + JSON.stringify(search || "(none)").padEnd(22) + " leases=" + JSON.stringify(got.leases) + " urlRewrites=" + JSON.stringify(got.replaced));
  }
  console.log(fail ? fail + " failing" : "all passed");
  process.exitCode = fail ? 1 : 0;
})();
