// Narrator wrap-up + repeat-caller memory on the demo page (SITE-SPEC 2026-10-08), run against a stubbed DOM, fake clock
// and mocked fetch/WebSocket (no network, no lease, no calls):
//  - /lease features: missing -> today's footer, no toggle; wrapup -> footer A; memory -> footer B, data note and toggle;
//  - the walkthrough toggle posts /lease/fresh, reverts on a non-200, is spaced ~1 s apart and unchecks on a new round;
//  - phase "wrapup": scroll to both texts + glow once when seen live; hidden -> on return; cached on load -> nothing;
//  - repeat callers: status line, no wrap-up scroll, no "straight to the live call" line after a repeat call;
//  - caller text callback timing in America/Los_Angeles (in hours, evenings, weekends, around both DST changes).
// Run: node tools/test_demo_wrapup_memory.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const SRC = fs.readFileSync(process.env.DEMO_JS || path.join(__dirname, "../public/demo/demo.js"), "utf8");
const HTML = fs.readFileSync(path.join(__dirname, "../public/demo/index.html"), "utf8");
const STATIC_FINE = HTML.match(/<span id="fine-text">([^<]*)<\/span>/)[1].replace(/&amp;/g, "&");

function makeClock(start) {
  let now = start || Date.parse("2026-10-13T17:00:00Z"), seq = 0;
  const timers = new Map();
  const add = (fn, ms, every) => { const id = ++seq; timers.set(id, { fn, at: now + Math.max(0, ms || 0), every }); return id; };
  return {
    now: () => now,
    setTimeout: (fn, ms) => add(fn, ms, 0), clearTimeout: (id) => timers.delete(id),
    setInterval: (fn, ms) => add(fn, ms, ms || 1), clearInterval: (id) => timers.delete(id),
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
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
}

function stubEl(id, extra) {
  const attrs = {}, listeners = {}, classes = new Set();
  const store = Object.assign({ id, textContent: "", hidden: false, disabled: false, checked: false, children: [] }, extra || {});
  const self = new Proxy(store, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === "_attrs") return attrs;
      if (k === "_classes") return classes;
      if (k === "_fire") return (type) => (listeners[type] || []).slice().forEach((fn) => fn({ currentTarget: self, preventDefault() {} }));
      if (k === "classList") return { add: (c) => classes.add(c), remove: (c) => classes.delete(c), toggle: (c, on) => (on === undefined ? (classes.has(c) ? classes.delete(c) : classes.add(c)) : on ? classes.add(c) : classes.delete(c)), contains: (c) => classes.has(c) };
      if (k === "addEventListener") return (type, fn, o) => {
        const list = (listeners[type] = listeners[type] || []);
        const wrapped = o && o.once ? function (e) { list.splice(list.indexOf(wrapped), 1); fn(e); } : fn;
        list.push(wrapped);
      };
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
  return self;
}

async function boot(opts = {}) {
  const clock = makeClock(opts.start);
  const posts = [], docListeners = {}, sockets = [], els = {}, scrolls = [];
  const html = stubEl("html");
  const davePhone = stubEl("dave-phone"), callerPhone = stubEl("caller-phone");
  const freshWraps = [stubEl("fresh-wrap-1"), stubEl("fresh-wrap-2")];
  const freshBoxes = [stubEl("fresh-lease"), stubEl("fresh-again")];
  freshWraps.forEach((w) => { w.hidden = true; });
  const document = {
    documentElement: html, body: Object.assign(stubEl("body"), { children: [] }), visibilityState: "visible", title: "Harborline demo line",
    getElementById: (id) => id === "demo-config"
      ? { textContent: '{"apiBase":"https://api.example","turnstileSiteKey":"x"}' }
      : (els[id] = els[id] || stubEl(id)),
    querySelectorAll: (sel) => sel === "[data-fresh]" ? freshWraps : sel === "[data-fresh-box]" ? freshBoxes : [],
    querySelector: (sel) => sel === "#dave-side .sms-phone" ? davePhone : stubEl("q"),
    createElement: () => stubEl("c"), createElementNS: () => stubEl("c"), createTextNode: () => stubEl("t"),
    addEventListener: (type, fn) => { (docListeners[type] = docListeners[type] || []).push(fn); },
  };
  els["caller-msg"] = stubEl("caller-msg", { closest: (sel) => (sel === ".sms-phone" ? callerPhone : null) });
  els["owner-text"] = stubEl("owner-text", { scrollIntoView: () => { scrolls.push("owner-text"); } });
  ["memory-note", "sw-memory", "next-memory"].forEach((id) => { els[id] = stubEl(id); els[id].hidden = true; });
  freshBoxes.forEach((b) => { els[b.id] = b; });
  function FakeWS() { this.readyState = 1; this.sent = []; sockets.push(this); }
  FakeWS.prototype.send = function (d) { this.sent.push(d); };
  FakeWS.prototype.close = function () { this.readyState = 3; };
  const FakeDate = function () { return new Date(clock.now()); };
  FakeDate.now = clock.now; FakeDate.parse = Date.parse;
  const leaseBody = { ok: true, sessionId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", sessionToken: "t".repeat(43), number: "+13605550100", heartbeatSeconds: 20 };
  if (opts.features !== undefined) leaseBody.features = opts.features;
  const sandbox = {
    document, URL, URLSearchParams, JSON, Math, Blob, Promise, Intl,
    Date: FakeDate, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, setInterval: clock.setInterval, clearInterval: clock.clearInterval,
    location: { search: "?package=coverage", href: "https://bluebeeops.com/demo/?package=coverage", replace() {} },
    navigator: {}, localStorage: { getItem: () => null, setItem() {} },
    crypto: { randomUUID: () => "11111111-2222-4333-8444-555555555555" },
    history: { replaceState() {} }, matchMedia: () => ({ matches: false }),
    scrollTo: (o) => { if (o && typeof o === "object") scrolls.push("both:" + o.behavior); },
    innerHeight: 900, scrollY: 0, getComputedStyle: () => ({ scrollMarginTop: "144px" }),
    addEventListener() {},
    performance: { now: () => clock.now() },
    turnstile: { render: (_el, o) => { clock.setTimeout(() => o.callback("tok"), 0); return 1; }, reset() {}, isExpired: () => false },
    fetch: (url, init) => {
      const p = url.replace("https://api.example", "");
      if (init && init.method === "POST") posts.push({ path: p, body: JSON.parse(init.body), at: clock.now() });
      let body = { ok: false, reason: "test" }, status = 200;
      if (p === "/status") body = { state: "open", mode: "open" };
      if (p === "/lease") body = leaseBody;
      if (p === "/lease/heartbeat") body = { ok: true, number: "+13605550100" };
      if (p === "/lease/fresh") {
        const r = opts.freshReply ? opts.freshReply(JSON.parse(init.body)) : { status: 200, body: { ok: true, fresh: JSON.parse(init.body).fresh } };
        body = r.body; status = r.status;
      }
      return Promise.resolve({ status, json: () => Promise.resolve(body) });
    },
    WebSocket: FakeWS,
  };
  sandbox.window = sandbox;
  vm.runInNewContext(SRC, sandbox);
  (docListeners.DOMContentLoaded || []).forEach((fn) => fn());
  await clock.advance(100);
  let seq = 0;
  const api = {
    clock, posts, els, document, davePhone, callerPhone, freshWraps, freshBoxes, scrolls,
    fresh: () => posts.filter((x) => x.path === "/lease/fresh"),
    wsSend: (m) => { const ws = sockets[sockets.length - 1]; ws.onmessage({ data: JSON.stringify({ seq: seq++, ...m }) }); },
    setVisible: (v) => { document.visibilityState = v ? "visible" : "hidden"; (docListeners.visibilitychange || []).forEach((fn) => fn()); },
    toggle: (i, v) => { freshBoxes[i].checked = v; freshBoxes[i]._fire("change"); },
    glowing: () => davePhone._classes.has("wrapup-glow") && callerPhone._classes.has("wrapup-glow"),
    anyGlow: () => davePhone._classes.has("wrapup-glow") || callerPhone._classes.has("wrapup-glow"),
    status: () => els["call-status"].textContent,
    leased: () => sockets.length > 0,
  };
  return api;
}
const results = [];
const check = (name, cond, info) => results.push({ name, ok: !!cond, info });
const FOOT_A = "Harborline Heating & Air is a fictional demo shop. This demo line sends no texts, books nothing real, and can't transfer calls. Calls last up to 8 minutes, with a limit of 3 calls per phone per day. Call details are wiped after about a day. If you ask to have a question passed along at the end of the call, your question and the number you called from are emailed to the Blue Bee Ops team so someone can call you back.";
const FOOT_B = "Harborline Heating & Air is a fictional demo shop. This demo line sends no texts, books nothing real, and can't transfer calls. Calls last up to 8 minutes, with a limit of 3 calls per phone per day. Call details are wiped after about a day, except a short note that lets the line greet you as a returning caller: what your last demo call was about and, only if you choose to give it at the end of the call, your name. That note is kept for 30 days after your last demo call, then deleted. If you ask to have a question passed along at the end of the call, your question and the number you called from are emailed to the Blue Bee Ops team so someone can call you back.";
const WRAP_ON = { wrapup: true, memory: false, maxCallSeconds: 480, memoryDays: 0 };
const MEM_ON = { wrapup: true, memory: true, maxCallSeconds: 480, memoryDays: 30 };

(async () => {
  // Pure helpers
  const pure = (() => {
    const noop = () => {};
    const sb = { document: { getElementById: () => ({ textContent: '{"apiBase":"https://example.invalid","turnstileSiteKey":"x"}' }), addEventListener: noop },
      addEventListener: noop, location: { search: "", href: "https://example.invalid/demo/" }, URLSearchParams, Intl };
    sb.window = sb;
    vm.runInNewContext(SRC, sb);
    return sb.BBDemoText;
  })();
  check("fineText(no features) equals today's static footer", pure.fineText(pure.parseFeatures(undefined)) === STATIC_FINE, pure.fineText(pure.parseFeatures(undefined)));
  check("fineText(wrapup) equals footer A", pure.fineText(pure.parseFeatures(WRAP_ON)) === FOOT_A, pure.fineText(pure.parseFeatures(WRAP_ON)));
  check("fineText(memory) equals footer B", pure.fineText(pure.parseFeatures(MEM_ON)) === FOOT_B, pure.fineText(pure.parseFeatures(MEM_ON)));
  check("minutes come from maxCallSeconds", /up to 6 minutes/.test(pure.fineText(pure.parseFeatures({ wrapup: true, maxCallSeconds: 365 }))));
  check("days come from memoryDays", /kept for 14 days/.test(pure.fineText(pure.parseFeatures({ wrapup: true, memory: true, maxCallSeconds: 480, memoryDays: 14 }))));
  check("wrapup:false -> today's text with 5", pure.fineText(pure.parseFeatures({ wrapup: false, memory: false, maxCallSeconds: 300, memoryDays: 0 })) === STATIC_FINE);
  check("no AI wording, no contact@", ![FOOT_A, FOOT_B, HTML].some((s) => /\bAI\b/.test(s.replace(/an AI call assistant/, ""))) && !/contact@/.test(HTML + SRC));

  // Caller text callback timing (PT). [label, UTC instant, expected timing]
  const TIMES = [
    ["Tue 10:00 PDT", "2026-10-13T17:00:00Z", "soon"],
    ["Tue 19:00 PDT", "2026-10-14T02:00:00Z", "morning"],
    ["Wed 06:30 PDT", "2026-10-14T13:30:00Z", "morning"],
    ["Fri 16:59 PDT", "2026-10-16T23:59:00Z", "soon"],
    ["Fri 18:00 PDT", "2026-10-17T01:00:00Z", "monday"],
    ["Sat 12:00 PDT", "2026-10-17T19:00:00Z", "monday"],
    ["Sun 21:00 PDT", "2026-10-19T04:00:00Z", "monday"],
    ["Mon 06:30 PDT (before 8 AM -> in the morning)", "2026-10-19T13:30:00Z", "morning"],
    ["Mon 08:00 PDT", "2026-10-19T15:00:00Z", "soon"],
    ["Thu 17:00 PDT", "2026-10-16T00:00:00Z", "morning"],
    // DST ends Sun Nov 1 2026: a fixed -7 offset would get these wrong
    ["Fri Oct 30 18:00 PDT", "2026-10-31T01:00:00Z", "monday"],
    ["Mon Nov 2 07:30 PST (PDT math says 08:30)", "2026-11-02T15:30:00Z", "morning"],
    ["Mon Nov 2 16:30 PST (PDT math says 17:30)", "2026-11-03T00:30:00Z", "soon"],
    ["Tue Nov 3 19:00 PST", "2026-11-04T03:00:00Z", "morning"],
    // DST starts Sun Mar 14 2027
    ["Fri Mar 12 16:30 PST", "2027-03-13T00:30:00Z", "soon"],
    ["Mon Mar 15 07:30 PDT (PST math says 06:30)", "2027-03-15T14:30:00Z", "morning"],
    ["Mon Mar 15 08:30 PDT (PST math says 07:30)", "2027-03-15T15:30:00Z", "soon"],
    ["Mon Mar 15 17:30 PDT (PST math says 16:30)", "2027-03-16T00:30:00Z", "morning"],
  ];
  for (const [label, iso, want] of TIMES) {
    const got = pure.callbackTiming(Date.parse(iso));
    check("timing " + label + " -> " + want, got === want, got);
  }
  const LINE = { soon: "He'll call you back as soon as he's off the job.", morning: "He'll give you a call back first thing in the morning.", monday: "He'll give you a call back first thing Monday morning." };
  const OFF = { soon: "Heating and air is what we do, but he'll call you back as soon as he's off the job.",
    morning: "Heating and air is what we do, but he'll give you a call back first thing in the morning.",
    monday: "Heating and air is what we do, but he'll give you a call back first thing Monday morning." };
  const AT = { soon: Date.parse("2026-10-13T17:00:00Z"), morning: Date.parse("2026-10-14T02:00:00Z"), monday: Date.parse("2026-10-17T19:00:00Z") };
  for (const k of Object.keys(AT)) {
    const t = pure.callerText({ name: "Pat", issue: "No heat" }, "coverage", AT[k]);
    check("caller text (" + k + ")", t === "Hi Pat, thanks for calling Harborline Heating & Air. We passed your message along to Dave: No heat. " + LINE[k] + " If anything changes before then, just give us a call.", t);
    const o = pure.callerText({ name: "Bob", issue: "Cat up a tree", callerSummary: "your cat stuck up a tree", offTopic: true }, "coverage", AT[k]);
    check("off-topic caller text (" + k + ")", o === "Hi Bob, thanks for calling Harborline Heating & Air. We passed your message about your cat stuck up a tree along to Dave. " + OFF[k], o);
    const w = pure.callerText({ name: "Pat", issue: "No heat", window: "Tue 9-11am" }, "intake", AT[k]);
    check("intake window line unchanged (" + k + ")", /You asked for Tue 9-11am for an estimate, and Dave will confirm the time when he calls you back\./.test(w) && !/first thing|off the job/.test(w), w);
    check("never 'within a couple of hours' (" + k + ")", !/couple of hours|usually/.test(t + o));
    let maxLen = 0, gsm = true;
    const longIssue = "Furnace short-cycles every ten minutes since the filter change last week and the upstairs vents blow cold air all night long";
    for (const pkg of ["coverage", "intake", "estimate"]) for (const urgency of ["normal", "emergency"]) for (const offTopic of [false, true]) {
      const s = pure.callerText({ name: "Maximiliana-Josephine Q", issue: longIssue + " gas smell", urgency, window: "x".repeat(60) + " y", appointment: "Thursday afternoon, between one and three or so",
        callerSummary: offTopic ? "your " + "z".repeat(70) : undefined, offTopic }, pkg, AT[k]);
      maxLen = Math.max(maxLen, s.length); gsm = gsm && pure.isGsm(s);
    }
    check("worst cases <= 306 chars and GSM-7 (" + k + ")", maxLen <= 306 && gsm, maxLen);
  }

  const pageResults = await pageTests();
  results.push(...pageResults);

  let fail = 0;
  for (const r of results) { if (!r.ok) fail++; console.log((r.ok ? "ok   " : "FAIL ") + r.name + (r.ok ? "" : "  " + JSON.stringify(r.info))); }
  console.log(fail ? fail + " failing" : "all passed (" + results.length + ")");
  process.exitCode = fail ? 1 : 0;
})();

async function pageTests() {
  const out = [];
  const ck = (name, cond, info) => out.push({ name, ok: !!cond, info });
  const lease = async (opts, hello) => {
    const t = await boot(opts);
    t.wsSend(hello || { type: "hello", call: "idle", card: {} });
    await t.clock.advance(10);
    return t;
  };
  // A) features missing (older Worker)
  {
    const t = await lease({});
    ck("A leased", t.leased());
    ck("A footer = today's text", t.els["fine-text"].textContent === STATIC_FINE, t.els["fine-text"].textContent);
    ck("A no memory note", t.els["memory-note"].hidden === true);
    ck("A no toggle", t.freshWraps.every((w) => w.hidden) && t.els["sw-memory"].hidden === true);
    t.wsSend({ type: "state", call: "live", round: 1, card: {} }); await t.clock.advance(10);
    t.wsSend({ type: "state", call: "live", round: 1, phase: "wrapup", repeat: true, card: {} }); await t.clock.advance(3000);
    ck("A repeat ignored without memory", !/Welcome back/.test(t.status()), t.status());
  }
  // B) wrapup on, memory off: footer A, no toggle
  {
    const t = await lease({ features: WRAP_ON });
    ck("B footer A", t.els["fine-text"].textContent === FOOT_A, t.els["fine-text"].textContent);
    ck("B no memory note", t.els["memory-note"].hidden === true);
    ck("B no toggle", t.freshWraps.every((w) => w.hidden) && t.els["sw-memory"].hidden === true);
  }
  // C) memory on: footer B, data note, toggle posts /lease/fresh
  {
    const t = await lease({ features: MEM_ON });
    ck("C footer B", t.els["fine-text"].textContent === FOOT_B, t.els["fine-text"].textContent);
    ck("C memory/data note shown", t.els["memory-note"].hidden === false);
    ck("C both toggles shown", t.freshWraps.every((w) => !w.hidden) && t.els["sw-memory"].hidden === false);
    ck("C unchecked by default", t.freshBoxes.every((b) => !b.checked));
    t.toggle(0, true); await t.clock.advance(10);
    const f = t.fresh();
    ck("C one post", f.length === 1, f);
    ck("C body is sessionId + sessionToken + fresh:true", f.length === 1 && JSON.stringify(f[0].body) === JSON.stringify({ sessionId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", sessionToken: "t".repeat(43), fresh: true }), f[0] && Object.keys(f[0].body));
    ck("C both boxes checked", t.freshBoxes.every((b) => b.checked));
    // quick off/on/off: spaced about a second apart, ends with the latest choice
    t.toggle(1, false); await t.clock.advance(100);
    ck("C second post waits for the 1 s gap", t.fresh().length === 1, t.fresh().length);
    await t.clock.advance(1200);
    ck("C then sends fresh:false", t.fresh().length === 2 && t.fresh()[1].body.fresh === false && t.fresh()[1].at - t.fresh()[0].at >= 1000, t.fresh().map((x) => [x.body.fresh, x.at]));
    ck("C both boxes unchecked", t.freshBoxes.every((b) => !b.checked));
    // check, then a new call (new round) starts: unchecked locally, no extra post
    t.toggle(0, true); await t.clock.advance(1500);
    const n = t.fresh().length;
    t.wsSend({ type: "state", call: "connecting", round: 1, card: {} }); await t.clock.advance(10);
    ck("C new round unchecks both", t.freshBoxes.every((b) => !b.checked));
    await t.clock.advance(3000);
    ck("C no post for the local uncheck", t.fresh().length === n, t.fresh().length - n);
    t.wsSend({ type: "state", call: "live", round: 1, card: {} }); await t.clock.advance(10);
    t.toggle(1, true); await t.clock.advance(1500);
    t.wsSend({ type: "state", call: "live", round: 1, card: { name: "Sam" } }); await t.clock.advance(10);
    ck("C same round keeps a choice made mid-call", t.freshBoxes.every((b) => b.checked));
  }
  // D) memory on, /lease/fresh 401 -> revert quietly
  {
    const t = await lease({ features: MEM_ON, freshReply: () => ({ status: 401, body: { ok: false } }) });
    t.toggle(0, true); await t.clock.advance(10);
    ck("D posted", t.fresh().length === 1);
    ck("D reverted on 401", t.freshBoxes.every((b) => !b.checked));
    ck("D no alarming status", !/error|wrong|fail/i.test(t.status() + t.els["start-err"].textContent));
    await t.clock.advance(3000);
    ck("D not retried", t.fresh().length === 1, t.fresh().length);
  }
  // D2) a call can start while /lease/fresh is still resolving: the consumed one-shot stays unchecked and
  // the stale response must not enqueue a fresh:false request.
  {
    const t = await lease({ features: MEM_ON });
    t.toggle(0, true);
    t.wsSend({ type: "state", call: "connecting", round: 1, card: {} });
    await t.clock.advance(3000);
    ck("D2 new call wins race with in-flight fresh request", t.freshBoxes.every((b) => !b.checked));
    ck("D2 stale fresh response sends no compensating request", t.fresh().length === 1 && t.fresh()[0].body.fresh === true, t.fresh().map((x) => x.body.fresh));
  }
  // E) wrap-up flip while visible: one scroll to both texts, glow added then removed
  {
    const t = await lease({ features: WRAP_ON });
    t.wsSend({ type: "state", call: "connecting", round: 1, phase: "setup", card: {} }); await t.clock.advance(10);
    t.wsSend({ type: "state", call: "live", round: 1, phase: "setup", card: {} }); await t.clock.advance(1000);
    t.wsSend({ type: "state", call: "live", round: 1, phase: "shop", card: { name: "Sam" } }); await t.clock.advance(1000);
    const before = t.scrolls.length;
    ck("E shop status unchanged", /^On the call\./.test(t.status()), t.status());
    t.wsSend({ type: "state", call: "live", round: 1, phase: "wrapup", card: { name: "Sam" } }); await t.clock.advance(5);
    ck("E glow on both cards", t.glowing());
    t.davePhone._fire("animationend"); // a field's fill-in animation bubbling up (not wrapup-glow)
    ck("E bubbled child animationend keeps the glow", t.glowing());
    ck("E wrap-up status line", t.status() === "Behind the scenes: here's what Dave got.", t.status());
    await t.clock.advance(200);
    ck("E one scroll to both texts", t.scrolls.length - before === 1 && t.scrolls[t.scrolls.length - 1] === "both:smooth", t.scrolls.slice(before));
    t.wsSend({ type: "state", call: "live", round: 1, phase: "wrapup", card: { name: "Sam", issue: "No heat" } }); await t.clock.advance(3000);
    ck("E not repeated for the same call", t.scrolls.length - before === 1, t.scrolls.slice(before));
    ck("E glow removed after ~2.5 s", !t.anyGlow());
    t.wsSend({ type: "state", call: "ended", round: 1, phase: null, card: { name: "Sam", issue: "No heat" } }); await t.clock.advance(300);
    ck("E end-of-call scroll unchanged", t.scrolls[t.scrolls.length - 1] === "owner-text", t.scrolls.slice(before));
    ck("E no memory line with memory off", t.els["next-memory"].hidden === true);
  }
  // F) hidden when the wrap-up starts: nothing while away, once on return
  {
    const t = await lease({ features: WRAP_ON });
    t.wsSend({ type: "state", call: "live", round: 1, phase: "shop", card: {} }); await t.clock.advance(10);
    t.setVisible(false); await t.clock.advance(1000);
    const before = t.scrolls.length;
    t.wsSend({ type: "state", call: "live", round: 1, phase: "wrapup", card: {} }); await t.clock.advance(3000);
    ck("F no scroll or glow while hidden", t.scrolls.length === before && !t.anyGlow(), t.scrolls.slice(before));
    t.setVisible(true); await t.clock.advance(200);
    ck("F scrolls to both texts on return", t.scrolls.slice(before).filter((s) => s.startsWith("both")).length === 1, t.scrolls.slice(before));
    ck("F glow on return", t.glowing());
    t.wsSend({ type: "hello", call: "live", round: 1, phase: "wrapup", card: {} }); await t.clock.advance(5000);
    ck("F fresh socket state doesn't repeat it", t.scrolls.slice(before).filter((s) => s.startsWith("both")).length === 1, t.scrolls.slice(before));
  }
  // G) cached wrap-up state on load: no scroll, no glow
  {
    const t = await lease({ features: WRAP_ON }, { type: "hello", call: "live", round: 1, phase: "wrapup", card: { name: "Sam" } });
    await t.clock.advance(3000);
    ck("G no wrap-up scroll from a cached state", !t.scrolls.some((s) => s.startsWith("both")), t.scrolls);
    ck("G no glow", !t.anyGlow());
    t.wsSend({ type: "state", call: "live", round: 1, phase: "wrapup", card: { name: "Sam", issue: "x" } }); await t.clock.advance(3000);
    ck("G later states for that call don't fire it either", !t.scrolls.some((s) => s.startsWith("both")), t.scrolls);
    // the next call's wrap-up does
    t.wsSend({ type: "state", call: "ended", round: 1, card: { name: "Sam" } }); await t.clock.advance(300);
    t.wsSend({ type: "state", call: "live", round: 2, phase: "shop", returning: true, card: {} }); await t.clock.advance(10);
    t.wsSend({ type: "state", call: "live", round: 2, phase: "wrapup", returning: true, card: {} }); await t.clock.advance(300);
    ck("G next call's wrap-up scrolls", t.scrolls.filter((s) => s.startsWith("both")).length === 1, t.scrolls);
    ck("G returning prefix kept", t.status() === "Returning caller. Behind the scenes: here's what Dave got.", t.status());
  }
  // H) hidden flip with a dropped socket: the fresh state after return (seq advanced) fires it
  {
    const t = await lease({ features: WRAP_ON });
    t.wsSend({ type: "state", call: "live", round: 1, phase: "shop", card: {} }); await t.clock.advance(10);
    t.setVisible(false); await t.clock.advance(60000);
    t.setVisible(true); await t.clock.advance(10);
    const before = t.scrolls.length;
    t.wsSend({ type: "hello", call: "live", round: 1, phase: "wrapup", card: {} }); await t.clock.advance(300);
    ck("H fresh wrap-up state after return scrolls once", t.scrolls.slice(before).filter((s) => s.startsWith("both")).length === 1, t.scrolls.slice(before));
  }
  // I) repeat caller (memory on): status line, no wrap-up scroll, no "straight to the live call" line after
  {
    const t = await lease({ features: MEM_ON });
    t.wsSend({ type: "state", call: "connecting", round: 1, phase: "shop", repeat: true, returning: true, card: {} }); await t.clock.advance(10);
    ck("I repeat status line", t.status() === "Welcome back. This time it's just the live call.", t.status());
    t.wsSend({ type: "state", call: "live", round: 1, phase: "shop", repeat: true, returning: true, card: { name: "Sam" } }); await t.clock.advance(10);
    ck("I repeat status line while live", t.status() === "Welcome back. This time it's just the live call.", t.status());
    t.wsSend({ type: "state", call: "live", round: 1, phase: "wrapup", repeat: true, returning: true, card: { name: "Sam" } }); await t.clock.advance(300);
    ck("I no wrap-up scroll on a repeat call", !t.scrolls.some((s) => s.startsWith("both")) && !t.anyGlow(), t.scrolls);
    t.wsSend({ type: "state", call: "ended", round: 1, phase: null, repeat: true, returning: true, card: { name: "Sam", issue: "No heat" } }); await t.clock.advance(300);
    ck("I end-of-call scroll", t.scrolls[t.scrolls.length - 1] === "owner-text", t.scrolls);
    ck("I no 'straight to the live call' line after a repeat call", t.els["next-memory"].hidden === true);
    ck("I toggle still offered", t.els["sw-memory"].hidden === false && t.freshWraps.every((w) => !w.hidden));
  }
  // J) first-time call ends with memory on: the line under Call again
  {
    const t = await lease({ features: MEM_ON });
    t.wsSend({ type: "state", call: "live", round: 1, phase: "shop", repeat: false, card: { name: "Sam" } }); await t.clock.advance(10);
    ck("J line hidden during the call", t.els["next-memory"].hidden === true);
    t.wsSend({ type: "state", call: "ended", round: 1, phase: null, repeat: false, card: { name: "Sam", issue: "No heat" } }); await t.clock.advance(300);
    ck("J line shown after a first-time call", t.els["next-memory"].hidden === false);
    ck("J switcher shown", t.els["switcher"].hidden === false);
  }
  // K) caller text uses the time the call ended: live Friday 4:55 PM PT -> "off the job"; ended after 5 PM -> Monday
  {
    const t = await lease({ features: WRAP_ON, start: Date.parse("2026-10-16T23:55:00Z") });
    t.wsSend({ type: "state", call: "live", round: 1, card: { name: "Pat", issue: "No heat" } }); await t.clock.advance(10);
    ck("K live Fri 4:55 PM -> off the job", /He'll call you back as soon as he's off the job\./.test(t.els["caller-msg"].textContent), t.els["caller-msg"].textContent);
    await t.clock.advance(8 * 60 * 1000);
    t.wsSend({ type: "state", call: "ended", round: 1, card: { name: "Pat", issue: "No heat" } }); await t.clock.advance(10);
    ck("K ended Fri 5:03 PM -> Monday", /He'll give you a call back first thing Monday morning\./.test(t.els["caller-msg"].textContent), t.els["caller-msg"].textContent);
  }
  return out;
}
