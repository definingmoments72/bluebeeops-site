// Mid-call page flow for public/demo/demo.js (2026-10-08, Sheri's call), run against a stubbed DOM, fake clock,
// mocked fetch/Turnstile/WebSocket (no network, no lease, no calls):
//  - a tap on call sends heartbeat { tap: true } once (re-sent if that heartbeat fails); normal beats never carry it;
//  - if no call reaches this page within the 90 s grace, the page keeps its live layout (no snap-back) and says
//    "We can't see your call on this page..." with Call again; a late real call state or a new tap clears it;
//  - going back to "before" never leaves the stale "Call coming in..." status.
// Run: node tools/test_demo_call_not_seen.js
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
  api.wsSend({ type: "hello", call: "idle", card: {} });
  await clock.advance(10);
  return api;
}

const results = [];
const check = (name, cond, info) => results.push({ name, ok: !!cond, info });
const NOT_SEEN = "We can't see your call on this page\u2026";

(async () => {
  // A) Sheri's case: the call never reaches this page
  {
    const t = await boot();
    check("A leased, before layout", t.view().flow === "before" && t.sockets.length === 1, t.view());
    const before = t.hb().length;
    t.tap();
    await t.clock.advance(10);
    const tapBeat = t.hb().slice(before);
    check("A tap sends exactly one heartbeat with tap:true", tapBeat.length === 1 && tapBeat[0].body.tap === true, tapBeat.map((x) => x.body.tap));
    t.setVisible(false); await t.clock.advance(16000);
    t.setVisible(true); await t.clock.advance(500);
    t.wsSend({ type: "hello", call: "idle", card: {} }); await t.clock.advance(10);
    const v1 = t.view();
    check("A back on page: optimistic live view", v1.flow === "live" && v1.bar && v1.title.startsWith("Live") && /Call coming in/.test(v1.status), v1);
    const periodic = t.hb().filter((x) => x.at > t.clock.now() - 15000);
    await t.clock.advance(60000);
    check("A periodic heartbeats never carry tap", t.hb().slice(before + 1).every((x) => x.body.tap === undefined), t.hb().map((x) => x.body.tap));
    const scrollsBefore = t.scrolls;
    await t.clock.advance(31000); // past the 90 s grace
    const v2 = t.view();
    check("A no snap-back after 90 s: layout stays live", v2.flow === "live" && v2.bar, v2);
    check("A says the call isn't on this page", v2.label === NOT_SEEN && /demo page you opened earlier/.test(v2.status) && v2.seen === "no", v2);
    check("A Call again shown, timer hidden, title reset", v2.again && v2.timerHidden && !v2.title.startsWith("Live"), v2);
    check("A no scroll jump when it flips", t.scrolls === scrollsBefore, { scrolls: t.scrolls, scrollsBefore });
    await t.clock.advance(120000);
    check("A still stable 2 min later", t.view().flow === "live" && t.view().label === NOT_SEEN, t.view());
    t.setVisible(false); await t.clock.advance(1000); const s0 = t.scrolls; t.setVisible(true); await t.clock.advance(5000);
    check("A returning to the tab while not seen: no scroll jump", t.scrolls === s0 && t.view().label === NOT_SEEN, { s0, s: t.scrolls });
    // retry from this view
    const n = t.hb().length;
    t.tap("live-again"); await t.clock.advance(10);
    const v3 = t.view();
    check("A Call again: tap heartbeat sent, layout stays live, message cleared", t.hb().slice(n)[0]?.body.tap === true && v3.flow === "live" && v3.seen === null && /Call coming in/.test(v3.status) && v3.label.startsWith("Live call"), v3);
    // this time the call does arrive
    t.wsSend({ type: "state", call: "live", card: {} }); await t.clock.advance(100000);
    const v4 = t.view();
    check("A real call state after retry: normal live view past 90 s", v4.flow === "live" && v4.seen === null && v4.title.startsWith("Live") && /On the call/.test(v4.status), v4);
  }
  // B) control: the call reaches this page -> plain live flow, unchanged
  {
    const t = await boot();
    t.tap(); t.setVisible(false); await t.clock.advance(16000);
    t.wsSend({ type: "state", call: "live", card: {} });
    t.setVisible(true); await t.clock.advance(95000);
    const v = t.view();
    check("B call on this page: live flow, no not-seen message", v.flow === "live" && v.seen === null && v.label.startsWith("Live call") && !v.again && !v.timerHidden, v);
    t.wsSend({ type: "state", call: "ended", card: { name: "Sheri", issue: "Toilet overflowing" } }); await t.clock.advance(10);
    check("B ended -> after", t.view().flow === "after", t.view());
  }
  // C) late call state while "not seen" clears it
  {
    const t = await boot();
    t.tap(); t.setVisible(false); await t.clock.advance(10000); t.setVisible(true); await t.clock.advance(95000);
    check("C not seen", t.view().label === NOT_SEEN, t.view());
    t.wsSend({ type: "state", call: "live", card: {} }); await t.clock.advance(10);
    const v = t.view();
    check("C late live state clears the message", v.flow === "live" && v.seen === null && v.label.startsWith("Live call") && /On the call/.test(v.status), v);
  }
  // D) a failed tap heartbeat is re-sent on the next beat (within 60 s), then never again
  {
    const t = await boot();
    t.failNextHeartbeat();
    const n = t.hb().length;
    t.tap(); await t.clock.advance(25000);
    const taps = t.hb().slice(n).map((x) => x.body.tap === true);
    check("D failed tap heartbeat re-sent once", taps[0] === true && taps[1] === true && taps.slice(2).every((x) => !x), taps);
    await t.clock.advance(60000);
    check("D no further taps", t.hb().slice(n + 2).every((x) => x.body.tap === undefined), t.hb().slice(n).map((x) => x.body.tap));
  }
  // E) lease ends (unknown session) while "not seen" -> before, with the idle status (no stale "Call coming in...")
  {
    let dead = false;
    const t = await boot({ heartbeatReply: () => (dead ? { ok: false, reason: "unknown-session" } : { ok: true, number: "+13605550100" }) });
    t.tap(); t.setVisible(false); await t.clock.advance(10000); t.setVisible(true); await t.clock.advance(95000);
    check("E not seen first", t.view().label === NOT_SEEN, t.view());
    dead = true; await t.clock.advance(21000);
    const v = t.view();
    check("E lease gone -> before with idle status, message cleared", v.flow === "before" && !v.bar && v.seen === null && v.status === "Both texts fill in live during your call.", v);
  }
  let fail = 0;
  for (const r of results) { if (!r.ok) fail++; console.log((r.ok ? "ok   " : "FAIL ") + r.name + (r.ok ? "" : "  " + JSON.stringify(r.info))); }
  console.log(fail ? fail + " failing" : "all passed (" + results.length + ")");
  process.exitCode = fail ? 1 : 0;
})();
