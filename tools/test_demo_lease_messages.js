// /lease error copy + one lease per page action (2026-10-08, Jase's 12:36 PM PT "Too many tries" that was really ip-cap).
// Same stubbed DOM / fake clock / mocked fetch harness as test_demo_call_not_seen.js. Run: node tools/test_demo_lease_messages.js
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
    location: { search: "?package=coverage", href: "https://bluebeeops.com/demo/?package=coverage", replace() {} },
    navigator: {}, localStorage: { getItem: () => null, setItem() {} },
    crypto: { randomUUID: () => "11111111-2222-4333-8444-555555555555" },
    history: { replaceState() {} }, matchMedia: () => ({ matches: false }), scrollTo() {},
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
    clock, posts, sockets, els, html, document,
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
const leases = (t) => t.posts.filter((x) => x.path === "/lease");
(async () => {
  {
    const t = await boot();
    check("auto-start ?package=coverage sends exactly one /lease", leases(t).length === 1, leases(t).length);
    t.setVisible(false); t.setVisible(true); await t.clock.advance(65000);
    check("leaving/returning + 65 s of heartbeats send no extra /lease", leases(t).length === 1, leases(t).length);
    const ws = t.sockets[t.sockets.length - 1]; ws.onclose({ code: 1006 }); await t.clock.advance(5000);
    check("socket drop + reconnect sends no extra /lease", leases(t).length === 1, leases(t).length);
  }
  {
    const t = await boot({ leaseReply: () => ({ ok: false, reason: "ip-cap", _status: 429 }) });
    check("ip-cap: says other demo screens are open (not 'too many tries')", t.els["start-err"].textContent === "Too many demo screens are open from this network. Close one and try again.", t.els["start-err"].textContent);
    check("ip-cap: one /lease, no retry loop", leases(t).length === 1, leases(t).length);
    await t.clock.advance(60000);
    check("ip-cap: still one /lease after 60 s", leases(t).length === 1, leases(t).length);
  }
  {
    const t = await boot({ leaseReply: () => ({ ok: false, reason: "rate-limited", _status: 429 }) });
    check("rate-limited keeps 'Too many tries' wording", t.els["start-err"].textContent === "Too many tries from this network. Please wait a minute.", t.els["start-err"].textContent);
  }
  const bad = results.filter((r) => !r.ok);
  for (const r of results) console.log((r.ok ? "PASS " : "FAIL ") + r.name + (r.ok ? "" : "  " + JSON.stringify(r.info)));
  console.log(bad.length ? `${bad.length} failed` : `all passed (${results.length})`);
  process.exit(bad.length ? 1 : 0);
})();
