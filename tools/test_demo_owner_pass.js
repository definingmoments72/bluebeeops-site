// Owner pass on the demo page (2026-10-08): ?owner= is stored in localStorage, stripped from the URL at once,
// and sent with /lease; malformed values are stripped but not stored; no pass -> no ownerPass field.
// Same stubbed harness as test_demo_call_not_seen.js (no network). Run: node tools/test_demo_owner_pass.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const SRC = fs.readFileSync(process.env.DEMO_JS || path.join(__dirname, "../public/demo/demo.js"), "utf8");

function makeClock() {
  let now = Date.parse("2026-10-08T15:14:00Z"), seq = 0;
  const timers = new Map();
  const add = (fn, ms, every) => { const id = ++seq; timers.set(id, { fn, at: now + Math.max(0, ms || 0), every }); return id; };
  const clock = {
    now: () => now,
    setTimeout: (fn, ms) => add(fn, ms, 0), clearTimeout: (id) => timers.delete(id),
    setInterval: (fn, ms) => add(fn, ms, ms || 1), clearInterval: (id) => timers.delete(id),
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); // let fetch/promise chains schedule timers
        let next = null;
        for (const [id, t] of timers) if (t.at <= end && (!next || t.at < next[1].at)) next = [id, t];
        if (!next) break;
        const [id, t] = next;
        now = t.at;
        if (t.every) t.at = now + t.every; else timers.delete(id);
        t.fn();
        await new Promise((r) => setImmediate(r));
      }
      now = end;
      for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
    },
  };
  return clock;
}

function stubEl(id) {
  const attrs = {}, listeners = {};
  const store = { id, textContent: "", hidden: false, disabled: false, children: [] };
  return new Proxy(store, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === "_attrs") return attrs;
      if (k === "_fire") return (type) => (listeners[type] || []).forEach((fn) => fn({ currentTarget: this, preventDefault() {} }));
      if (k === "classList") return { add() {}, remove() {}, toggle() {}, contains: () => false };
      if (k === "addEventListener") return (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); };
      if (k === "setAttribute") return (n, v) => { attrs[n] = String(v); };
      if (k === "removeAttribute") return (n) => { delete attrs[n]; };
      if (k === "getAttribute") return (n) => (n in attrs ? attrs[n] : null);
      if (k === "getBoundingClientRect") return () => ({ top: 0, left: 0, right: 0, bottom: 0 });
      if (k === "firstChild") return null;
      if (k === "parentNode") return { removeChild() {}, insertBefore() {}, appendChild() {} };
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

async function boot(opts = {}) {
  const clock = makeClock();
  const store = opts.store || {}, replaced = [];
  const posts = [], docListeners = {}, winListeners = {}, sockets = [], els = {};
  let failNextHeartbeat = false, scrolls = 0;
  const html = stubEl("html");
  const document = {
    documentElement: html, body: Object.assign(stubEl("body"), { children: [] }), visibilityState: "visible", title: "Harborline demo line",
    getElementById: (id) => id === "demo-config"
      ? { textContent: '{"apiBase":"https://api.example","turnstileSiteKey":"x"}' }
      : (els[id] = els[id] || stubEl(id)),
    querySelectorAll: () => [], querySelector: () => stubEl("q"), createElement: () => stubEl("c"), createElementNS: () => stubEl("c"), createTextNode: () => stubEl("t"),
    addEventListener: (type, fn) => { (docListeners[type] = docListeners[type] || []).push(fn); },
  };
  // scrollIntoView counts as a "jump" (owner-text)
  els["owner-text"] = new Proxy(stubEl("owner-text"), { get(t, k) { if (k === "scrollIntoView") return () => { scrolls++; }; return t[k]; } });
  function FakeWS() { this.readyState = 1; this.sent = []; sockets.push(this); }
  FakeWS.prototype.send = function (d) { this.sent.push(d); };
  FakeWS.prototype.close = function () { this.readyState = 3; };
  const FakeDate = function () { return new Date(clock.now()); };
  FakeDate.now = clock.now; FakeDate.parse = Date.parse;
  const sandbox = {
    document, URL, URLSearchParams, JSON, Math, Blob, Promise,
    Date: FakeDate, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, setInterval: clock.setInterval, clearInterval: clock.clearInterval,
    location: { search: opts.search || "?package=coverage", href: "https://bluebeeops.com/demo/" + (opts.search || "?package=coverage"), replace() {} },
    navigator: {}, localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    crypto: { randomUUID: () => "11111111-2222-4333-8444-555555555555" },
    history: { replaceState: (_s, _t, url) => { replaced.push(url); } }, matchMedia: () => ({ matches: false }), scrollTo() {},
    addEventListener: (type, fn) => { (winListeners[type] = winListeners[type] || []).push(fn); },
    performance: { now: () => clock.now() },
    turnstile: { render: (_el, o) => { clock.setTimeout(() => o.callback("tok"), 0); return 1; }, reset() {}, isExpired: () => false },
    fetch: (url, init) => {
      const p = url.replace("https://api.example", "");
      if (init && init.method === "POST") posts.push({ path: p, body: JSON.parse(init.body), at: clock.now() });
      if (p === "/lease/heartbeat" && failNextHeartbeat) { failNextHeartbeat = false; return Promise.reject(new Error("offline")); }
      let body = { ok: false, reason: "test" };
      if (p === "/status") body = { state: "open", mode: "open" };
      if (p === "/lease" && opts.leaseReply) { const r = opts.leaseReply(); return Promise.resolve({ status: r._status || 200, json: () => Promise.resolve(r) }); }
      if (p === "/lease") body = { ok: true, sessionId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", sessionToken: "t".repeat(43), number: "+13605550100", heartbeatSeconds: 20 };
      if (p === "/lease/heartbeat") body = opts.heartbeatReply ? opts.heartbeatReply() : { ok: true, number: "+13605550100" };
      return Promise.resolve({ status: 200, json: () => Promise.resolve(body) });
    },
    WebSocket: FakeWS,
  };
  sandbox.window = sandbox;
  vm.runInNewContext(SRC, sandbox);
  (docListeners.DOMContentLoaded || []).forEach((fn) => fn());
  await clock.advance(100);
  let seq = 0;
  const api = {
    clock, posts, sockets, els, html, document, store, replaced,
    get scrolls() { return scrolls; },
    hb: () => posts.filter((x) => x.path === "/lease/heartbeat"),
    failNextHeartbeat: () => { failNextHeartbeat = true; },
    wsSend: (m) => { const ws = sockets[sockets.length - 1]; ws.onmessage({ data: JSON.stringify({ seq: seq++, ...m }) }); },
    tap: (id = "call-link") => els[id]._fire("click"),
    setVisible: (v) => { document.visibilityState = v ? "visible" : "hidden"; (docListeners.visibilitychange || []).forEach((fn) => fn()); },
    view: () => ({
      flow: html.getAttribute("data-flow"), seen: html.getAttribute("data-call-seen"), title: document.title,
      label: els["live-label"].textContent, status: els["call-status"].textContent,
      bar: !els["live-bar"].hidden, again: !els["live-again"].hidden, timerHidden: !!els["live-timer"].hidden,
    }),
  };
  if (sockets.length) api.wsSend({ type: "hello", call: "idle", card: {} });
  await clock.advance(10);
  return api;
}

const results = [];
const check = (name, cond, info) => results.push({ name, ok: !!cond, info });
const PASS = "v1.1.1806969600.Ab_-Ab_-Ab_-Ab_-Ab_-Ab_-Ab_-Ab_-Ab_-Ab_-xyz";
const leases = (t) => t.posts.filter((x) => x.path === "/lease");
(async () => {
  {
    const t = await boot({ search: "?package=coverage&owner=" + PASS });
    check("pass stored in localStorage", t.store.bb_owner_pass === PASS, t.store);
    check("first URL rewrite already has no owner param", t.replaced.length >= 1 && !/owner/.test(t.replaced[0]) && /package=coverage/.test(t.replaced[0]), t.replaced);
    check("no later URL rewrite brings it back", t.replaced.every((u) => !/owner|v1\./.test(u)), t.replaced);
    check("auto-lease sends ownerPass once", leases(t).length === 1 && leases(t)[0].body.ownerPass === PASS, leases(t).map((x) => x.body.ownerPass));
  }
  {
    const t = await boot({ search: "?package=coverage", store: { bb_owner_pass: PASS } });
    check("later visit without ?owner= still sends the stored pass", leases(t)[0] && leases(t)[0].body.ownerPass === PASS);
    check("no URL rewrite needed when there is no owner param", t.replaced.length === 0, t.replaced);
  }
  {
    const t = await boot({ search: "?package=coverage&owner=not-a-pass" });
    check("malformed ?owner= is stripped from the URL", t.replaced.length >= 1 && !/owner/.test(t.replaced[0]), t.replaced);
    check("malformed ?owner= is not stored", !("bb_owner_pass" in t.store), t.store);
    check("malformed: /lease has no ownerPass", leases(t)[0] && !("ownerPass" in leases(t)[0].body));
  }
  {
    const t = await boot({ search: "?package=coverage", store: { bb_owner_pass: "tampered<script>" } });
    check("bad stored value is never sent", leases(t)[0] && !("ownerPass" in leases(t)[0].body));
  }
  {
    const t = await boot();
    check("no pass at all: /lease body unchanged (no ownerPass)", leases(t).length === 1 && !("ownerPass" in leases(t)[0].body));
  }
  const bad = results.filter((r) => !r.ok);
  for (const r of results) console.log((r.ok ? "PASS " : "FAIL ") + r.name + (r.ok ? "" : "  " + JSON.stringify(r.info)));
  console.log(bad.length ? `${bad.length} failed` : `all passed (${results.length})`);
  process.exit(bad.length ? 1 : 0);
})();
