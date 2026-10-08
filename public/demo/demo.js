// Harborline demo page: lease a pool number (Turnstile-protected), keep it armed with heartbeats,
// and fill in the owner text preview live from the call card pushed over a WebSocket by the bluebee-demo Worker.
// No secrets here. All text is set with textContent (no HTML injection).
(function () {
  "use strict";
  var cfg = JSON.parse(document.getElementById("demo-config").textContent);
  var API = cfg.apiBase.replace(/\/$/, "");
  var WS_API = API.replace(/^http/, "ws");
  var HEARTBEAT_MS = 20000;

  var lease = null; // { sessionId, sessionToken, number }
  var hbTimer = null, pingTimer = null, wsTimer = null, ws = null, wsRetry = 0, wsClosedForGood = false;
  var callState = "idle", lastSeq = -1, ackedCallback = null, lastCallClick = 0;
  var turnstileToken = null, widgetId = null, widgetTimer = null, turnstileUnsupported = false;
  var pendingLease = false, leaseInFlight = false, lineClosed = false;

  // ---------- package picker (Coverage / Intake / Estimate Request) ----------
  var PKGS = {
    coverage: { name: "Coverage Service", live: true, hint: "Try it: describe a heating or cooling problem.", note: "" },
    intake: { name: "Intake Service", hint: "Try it: describe a problem, then pick one of the estimate windows Harborline offers.",
      note: "Dave confirms the requested window with one tap. Nothing is booked until he does." },
    estimate: { name: "Estimate Request Service", hint: "Try it: book the estimate slot Harborline offers, or say it's an emergency to hear the put-through.",
      note: "Demo schedule only: nobody will actually come out, and this demo line can't transfer calls." }
  };
  function validPkg(v) { return Object.prototype.hasOwnProperty.call(PKGS, v) ? v : null; }
  // Only live packages can be picked or leased; the others show as "Coming soon".
  function livePkg(v) { v = validPkg(v); return v && PKGS[v].live ? v : null; }
  // ?package= from the homepage plan cards ("Try a live demo call"). A live package also auto-starts the
  // lease flow once (same path as tapping that package's "Hear it live"); plain /demo/ waits for a tap.
  // A package that isn't live yet never leases: the param is dropped and the page opens like plain /demo/
  // with Coverage selected (the inline head script skips the loading overlay for it too).
  // The page stays at the top: the call button is already the first thing under the headline.
  var urlPkg = (function () {
    try {
      var v = validPkg(new URLSearchParams(window.location.search).get("package"));
      if (!v || livePkg(v)) return v;
      var u = new URL(window.location.href);
      u.searchParams.delete("package");
      window.history.replaceState(null, "", u.pathname + u.search);
      return null;
    } catch (e) { return null; }
  })();
  var chosenPkg = urlPkg || "coverage";
  var autoStartPkg = urlPkg, autoStarted = false;
  var IP_CAP_MSG = "Too many demo screens are open from this network. Close one and try again.";
  var IDLE_STATUS = "Pick a package and tap Hear it live. We'll hold a demo line for you for 15 minutes.";
  function gettingMsg() { return "Getting your " + PKGS[chosenPkg].name + " demo line\u2026"; }
  var lastMsg = null; // last card state from the Worker, re-rendered when the picker changes

  function $(id) { return document.getElementById(id); }
  // Leaves the ?package= loading state (html.pkg-auto, set by the inline head script): number shown or fallback.
  // The overlay fades out (html.pkg-auto-out); it is never held past AUTO_MIN_MS after page start.
  var AUTO_MIN_MS = 400, AUTO_FADE_MS = 350, autoEnding = false;
  function setAutoInert(on) {
    if (!document.body) return;
    var kids = document.body.children;
    for (var i = 0; i < kids.length; i++) {
      var node = kids[i];
      if (node.id === "bbl") continue;
      if (on) {
        if (!node.hasAttribute("inert")) {
          node.setAttribute("inert", "");
          node.setAttribute("data-pkg-auto-inert", "");
        }
      } else if (node.hasAttribute("data-pkg-auto-inert")) {
        node.removeAttribute("inert");
        node.removeAttribute("data-pkg-auto-inert");
      }
    }
  }
  function endAuto() {
    var d = document.documentElement;
    if (!d.classList.contains("pkg-auto")) { setAutoInert(false); return; }
    if (autoEnding) return;
    autoEnding = true;
    var age = window.performance && performance.now ? performance.now() : AUTO_MIN_MS;
    setTimeout(function () {
      setAutoInert(false);
      if (flow === "before") window.scrollTo(0, 0);
      d.classList.add("pkg-auto-out");
      d.classList.remove("pkg-auto");
      setTimeout(function () { d.classList.remove("pkg-auto-out"); }, AUTO_FADE_MS);
    }, Math.max(0, AUTO_MIN_MS - age));
  }
  function show(state) {
    var all = document.querySelectorAll("#line [data-state]");
    for (var i = 0; i < all.length; i++) all[i].hidden = all[i].getAttribute("data-state") !== state;
  }
  function fmt(e164) {
    var d = String(e164).replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
    return d.length === 10 ? "(" + d.slice(0, 3) + ") " + d.slice(3, 6) + "-" + d.slice(6) : e164;
  }
  function post(path, body, beacon) {
    var json = JSON.stringify(body || {});
    if (beacon && navigator.sendBeacon) {
      // text/plain keeps it a CORS "simple" request; the Worker parses the body as JSON.
      try {
        if (navigator.sendBeacon(API + path, new Blob([json], { type: "text/plain" }))) return true;
      } catch (e) { /* fall through to keepalive fetch */ }
    }
    return fetch(API + path, { method: "POST", headers: { "content-type": beacon ? "text/plain" : "application/json" },
      body: json, credentials: "omit", keepalive: !!beacon })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j._status = r.status; return j; }); });
  }

  // ---------- QR (tel: plain number) ----------
  function drawQr(e164) {
    var svg = $("qr");
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    if (typeof window.qrcode !== "function") return;
    var qr = window.qrcode(0, "M");
    qr.addData("tel:" + e164);
    qr.make();
    var n = qr.getModuleCount();
    svg.setAttribute("viewBox", "0 0 " + n + " " + n);
    svg.setAttribute("shape-rendering", "crispEdges");
    var d = "";
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (qr.isDark(r, c)) d += "M" + c + " " + r + "h1v1h-1z";
    var p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", d);
    p.setAttribute("fill", "#04060d");
    p.setAttribute("stroke", "none");
    svg.appendChild(p);
  }

  function showNumber(e164) {
    lease.number = e164;
    $("number").textContent = fmt(e164);
    var link = $("call-link");
    link.setAttribute("href", "tel:" + e164);
    link.textContent = "Tap to call " + fmt(e164);
    $("sw-call").setAttribute("href", "tel:" + e164);
    $("sw-call").textContent = "Call " + fmt(e164) + " again";
    $("live-again").setAttribute("href", "tel:" + e164);
    drawQr(e164);
    show("leased");
    endAuto();
  }

  // ---------- Call card -> Dave's text preview ----------
  var STATUS = { idle: "Both texts fill in live during your call.", connecting: "Call coming in\u2026 Both texts fill in as you talk.",
    live: "On the call. Watch both texts fill in as you talk.",
    ended: "Your call ended. These are the texts Dave and the caller would get, and your call is now at the top of Dave's end-of-day report below." };
  var CARD_FIELDS = ["name", "callback", "issue", "city", "zip", "urgency", "mood", "window", "appointment"];
  function cardHasData(card) { return CARD_FIELDS.some(function (f) { return !!card[f]; }); }
  // The package the card shows: the call's own package once a call has started, else the page's pick.
  function cardPkg(m) { return (m && m.call && m.call !== "idle" && validPkg(m.package)) || chosenPkg; }
  function showPkgRows(pkg) {
    var els = document.querySelectorAll("[data-pkg]");
    for (var i = 0; i < els.length; i++) els[i].hidden = els[i].getAttribute("data-pkg") !== pkg;
    var note = $("card-note");
    note.textContent = PKGS[pkg].note;
    note.hidden = !PKGS[pkg].note;
  }
  function render(m) {
    if (typeof m.seq === "number" && m.seq <= lastSeq) return;
    if (typeof m.seq === "number") lastSeq = m.seq;
    lastMsg = m;
    if (m.call !== "connecting" && m.call !== "live") $("pkg-next").hidden = true;
    var prevState = callState;
    if ((m.call || "idle") !== callState) { idleSince = Date.now(); idleVerifiedAt = 0; }
    callState = m.call || "idle";
    var card = m.card || {};
    var pkg = cardPkg(m);
    // A real call state (or a fresh end after the tap) replaces the optimistic "you just dialed" live view.
    if (inCall() || (callState === "ended" && typeof m.seq === "number" && m.seq > clickSeq)) { pendingCallUntil = 0; callNotSeen = false; }
    renderResults(m, card);
    showPkgRows(pkg);
    renderOwnerText(card, pkg);
    renderCallerText(card, pkg);
    renderDaily(callState === "ended" || (firstCallEnded && callState === "idle") ? card : {}, pkg);
    applyFlow(card);
    // Tell the Worker the confirmed callback is on screen (latency measurement, AC3).
    if (card.callback && card.callback !== ackedCallback && ws && ws.readyState === 1) {
      ackedCallback = card.callback;
      ws.send(JSON.stringify({ type: "ack", field: "callback", seq: m.seq }));
    }
    if (callState === "ended" && prevState !== "ended") callEnded();
  }

  // ---------- Results once a call ends ----------
  // Most visitors call from the same phone: they switch back to this tab right after dialing (mid-call) or
  // after hanging up, and land on Dave's text. Never claims a real text was sent (the owner text stays a PREVIEW).
  var firstCallEnded = false, awayForCall = false, endedWhileAway = false, awaySeq = -1, lastCaught = false;
  var returnCheckPending = false, returnCheckTimer = null, lastReturnAt = 0;
  function renderResults(m, card) {
    var ended = callState === "ended";
    var caught = lastCaught = cardHasData(card);
    $("call-status").textContent = (m.returning && callState !== "idle" ? "Returning caller. " : "") +
      (!ended ? STATUS[callState] || "" : caught ? STATUS.ended
        : "Harborline didn't catch any details that time. Call again and describe a heating or cooling problem.");
    var mood = ended && card.mood ? String(card.mood) : "";
    $("mood-note-v").textContent = mood;
    $("mood-note").hidden = !mood;
  }
  function reduceMotion() { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); }
  function scrollToText() {
    awayForCall = false;
    endedWhileAway = false;
    var target = $("owner-text");
    // Let layout settle first (iOS restores its own scroll position when the page comes back).
    setTimeout(function () {
      try { target.scrollIntoView({ behavior: reduceMotion() ? "instant" : "smooth", block: "start" }); }
      catch (e) { target.scrollIntoView(true); }
    }, 120);
  }
  function callEnded() {
    if (!firstCallEnded) { firstCallEnded = true; applySwitcher(); }
    if (document.visibilityState === "visible") scrollToText();
    else { awayForCall = true; endedWhileAway = true; }
  }

  // ---------- Page flow: before the call / live call / after the call ----------
  // html[data-flow] drives the layout (demo.css). "live" collapses the call block into #live-bar with an
  // elapsed timer and puts Dave's text first; "after" keeps that order and the bar shows how long the call took.
  // A tap on the call link followed by a return to this tab counts as live until the Worker says otherwise,
  // because iOS can drop the socket while Safari is in the background and the fresh state takes a moment.
  var BASE_TITLE = document.title, TITLE_LIVE = "Live: Dave's text is filling in", TITLE_DONE = "Dave got your message \u2713";
  var PENDING_CALL_MS = 90 * 1000;
  var flow = "before", callStartAt = 0, callEndAt = 0, sawLive = false, timerId = null;
  var pendingCallUntil = 0, pendingTimer = null, clickSeq = -1, pendingForClick = 0;
  // 2026-10-08 (Sheri's call): if no call ever reaches this page within the 90 s grace, don't silently snap back to
  // the "before" layout mid-call. Keep the layout, stop the timer and say so. Cleared by a real call state, a new
  // tap on call, or the lease ending.
  var callNotSeen = false, tapPending = false, backSent = false;
  var NOT_SEEN_LABEL = "We can't see your call on this page\u2026";
  var NOT_SEEN_STATUS = "If you're on the call now, it may be showing on a demo page you opened earlier. Hang up, then tap Call again to try from this page.";
  function inCall() { return callState === "connecting" || callState === "live"; }
  function computeFlow(card) {
    if (!lease) return "before";
    if (inCall() || pendingCallUntil > Date.now() || callNotSeen) return "live";
    if (callState === "ended" || firstCallEnded) return "after";
    return card && cardHasData(card) ? "live" : "before";
  }
  function fmtElapsed(ms) {
    var t = Math.max(0, Math.floor(ms / 1000)), sec = t % 60;
    return Math.floor(t / 60) + ":" + (sec < 10 ? "0" : "") + sec;
  }
  // Wall-clock based: timers are paused while Safari is in the background, so each tick recomputes.
  function tick() {
    var timer = $("live-timer");
    timer.hidden = !callStartAt || (flow === "after" && !sawLive) || notSeenNow();
    timer.textContent = fmtElapsed((flow === "live" ? Date.now() : callEndAt) - callStartAt);
  }
  function notSeenNow() { return callNotSeen && !inCall() && pendingCallUntil <= Date.now(); }
  function applyFlow(card) {
    var next = computeFlow(card || (lastMsg && lastMsg.card) || {}), prev = flow, now = Date.now();
    var notSeen = next === "live" && notSeenNow();
    if (inCall()) sawLive = true;
    if (next === "live" && prev !== "live") {
      var recentTap = lastCallClick > callEndAt && now - lastCallClick < 3 * 60 * 1000;
      callStartAt = recentTap ? lastCallClick : now;
      callEndAt = 0;
      sawLive = inCall();
    }
    if (next === "after" && prev === "live") callEndAt = now;
    if (next === "before") { callStartAt = 0; callEndAt = 0; sawLive = false; }
    flow = next;
    document.documentElement.setAttribute("data-flow", next);
    $("live-bar").hidden = next === "before";
    if (notSeen) document.documentElement.setAttribute("data-call-seen", "no");
    else document.documentElement.removeAttribute("data-call-seen");
    $("live-label").textContent = notSeen ? NOT_SEEN_LABEL : next === "after" ? "Your call to Harborline Heating & Air ended" : "Live call to Harborline Heating & Air";
    $("live-again").hidden = !(next === "after" || notSeen);
    clearInterval(timerId); timerId = null;
    if (next === "live" && !notSeen) timerId = setInterval(tick, 1000);
    tick();
    if (next === "live" && !inCall()) { $("call-status").textContent = notSeen ? NOT_SEEN_STATUS : STATUS.connecting; $("mood-note").hidden = true; }
    // Back to "before" (no call, nothing caught): never leave a stale "Call coming in..." on screen.
    if (next === "before") $("call-status").textContent = STATUS.idle;
    document.title = next === "live" && !notSeen ? TITLE_LIVE : next === "after" && lastCaught ? TITLE_DONE : BASE_TITLE;
    if (next === "live" && prev !== "live" && document.visibilityState === "visible") scrollToText();
  }
  // Back on the tab shortly after tapping the call link: show the live view right away (the phone agent tells
  // visitors to swipe back mid-call), then let the fresh socket state confirm or correct it.
  function assumeCallAfterTap() {
    var now = Date.now();
    if (!lease || inCall() || !lastCallClick || lastCallClick <= callEndAt || now - lastCallClick > 3 * 60 * 1000) return;
    if (pendingForClick === lastCallClick) return;
    pendingForClick = lastCallClick;
    pendingCallUntil = now + PENDING_CALL_MS;
    clearTimeout(pendingTimer);
    pendingTimer = setTimeout(function () {
      pendingCallUntil = 0;
      // Nothing from a call ever reached this page: say so instead of snapping back to the "before" layout.
      if (!inCall() && callState !== "ended" && !cardHasData((lastMsg && lastMsg.card) || {})) callNotSeen = true;
      applyFlow();
    }, PENDING_CALL_MS + 50);
  }
  // A tap on a call link: tell the Worker (heartbeat { tap: true }) so a call from this phone pairs with THIS page
  // even if the caller's number is still linked to a page they opened earlier that no longer holds a line.
  function noteCallTap() {
    lastCallClick = Date.now(); clickSeq = lastSeq; tapPending = true; backSent = false;
    if (callNotSeen) {
      // trying again from the "can't see your call" view: keep the live layout (no jump) while the new call starts
      callNotSeen = false;
      assumeCallAfterTap();
      applyFlow();
    }
    heartbeat();
  }
  // The visitor left (phone app, tab switch, bfcache) while a call was starting or just after tapping call.
  function leftPage() {
    if ((callState === "connecting" || callState === "live" || Date.now() - lastCallClick < 5 * 60 * 1000) && !awayForCall) {
      awayForCall = true;
      endedWhileAway = false;
      awaySeq = lastSeq;
    }
  }
  // Back on the page: decide once fresh call state arrives (or from the cached state if the socket can't reconnect).
  function cameBack() {
    var now = Date.now();
    if (now - lastReturnAt < 500) return;
    lastReturnAt = now;
    if (!lease) return;
    // Two-voice demo: tell the Worker once per call that this page is back in view. The Worker alone decides
    // (strong pairing, still in setup, early in the call) whether the narrator says "I can see you're on the demo page".
    if (awayForCall && !backSent) {
      backSent = true;
      post("/lease/heartbeat", { sessionId: lease.sessionId, sessionToken: lease.sessionToken, back: true }).catch(function () {});
    }
    assumeCallAfterTap();
    var wasLive = flow === "live";
    applyFlow();
    if (flow === "live" && wasLive && !notSeenNow()) scrollToText();
    returnCheckPending = true;
    clearTimeout(returnCheckTimer);
    returnCheckTimer = setTimeout(checkReturn, 4000);
    heartbeatQueued = true;
    refreshWsState();
  }
  function checkReturn() {
    if (!returnCheckPending) return;
    returnCheckPending = false;
    clearTimeout(returnCheckTimer);
    // A cached "ended" may belong to the previous call. Only scroll if ending was observed while away,
    // or a fresh socket state advanced beyond the sequence seen when the visitor left.
    var hasNewEnd = endedWhileAway || (wsStateReady && lastSeq > awaySeq);
    if (awayForCall && callState === "ended" && hasNewEnd) scrollToText();
    else { awayForCall = false; endedWhileAway = false; }
  }

  // How sure the phone agent is of the caller's name (card.nameConfidence + card.nameNote), e.g. "Low confidence \u00b7 heard unclearly twice; best guess".
  // High, medium and low are shown; unknown or missing values (including older Workers) give "".
  var NAME_CONF = { high: "High confidence", medium: "Medium confidence", low: "Low confidence" };
  function nameCheck(card) {
    var label = NAME_CONF[String(card.nameConfidence || "").trim().toLowerCase()];
    if (!label) return "";
    var note = card.nameNote ? String(card.nameNote).replace(/\s+/g, " ").trim() : "";
    if (note.length > 80) note = note.slice(0, 79).trim() + "\u2026";
    return note ? label + " \u00b7 " + note : label;
  }

  // ---------- Owner text preview (mockup only: the demo never sends a text) ----------
  // Built from the call card fields as they arrive. Values go in with textContent only.
  var SMS_TITLE = { coverage: "Harborline - new call (Blue Bee Ops)", intake: "Harborline - new call + estimate request", estimate: "Harborline - estimate booked (Blue Bee Ops)" };
  function renderOwnerText(card, pkg) {
    pkg = pkg || "coverage";
    var cityZip = [card.city, card.zip].filter(Boolean).map(String).join(" ");
    var urg = card.urgency ? String(card.urgency) : "";
    var vals = {
      name: scrubField(card.name),
      nameCheck: nameCheck(card),
      callback: card.callback ? String(card.callback) : "",
      city: cityZip,
      issue: scrubField(card.issue),
      urgency: urg ? urg.charAt(0).toUpperCase() + urg.slice(1) : "",
      tap: card.callback ? String(card.callback) : "",
      window: pkg === "intake" ? scrubField(card.window) : "",
      appointment: pkg === "estimate" ? scrubField(card.appointment) : "",
      mood: card.mood ? String(card.mood) : ""
    };
    var urgentPutThrough = pkg === "estimate" && urg === "emergency";
    $("sms-urgent").hidden = !urgentPutThrough;
    $("sms-namecheck").hidden = !vals.nameCheck;
    $("sms-title").textContent = urgentPutThrough ? "Harborline - URGENT call (Blue Bee Ops)"
      : (vals.window || vals.appointment) ? SMS_TITLE[pkg] : SMS_TITLE.coverage;
    var any = false;
    Object.keys(vals).forEach(function (k) {
      var el = document.querySelector('#sms-bubble [data-sms="' + k + '"]');
      if (!el) return;
      var v = vals[k], shown = v || "\u2014";
      if (v) any = true;
      if (el.textContent !== shown) {
        el.textContent = shown;
        el.classList.toggle("blank", !v);
        el.classList.remove("fresh"); void el.offsetWidth; if (v) el.classList.add("fresh");
      }
    });
    $("sms-bubble").classList.toggle("is-empty", !any);
  }

  // ---------- Caller-provided text going into the previews ----------
  // Phone numbers never show: every preview (Dave's text, the caller text, the report) scrubs them from the call's
  // name, issue, window and time. Only the caller text also short-caps those fields and drops phrases claiming a
  // booking, dispatch or sent text, because its template speaks to the caller; Dave's side keeps the full details.
  // Separators allowed inside a phone number: whitespace, . / ( ) + and every Unicode hyphen/dash/minus.
  var PHONE_SEP = "\\s./()+\\-\\u00ad\\u2010-\\u2015\\u2212\\ufe58\\ufe63\\uff0d";
  var PHONE_MASK = "xX*#\\u2022\\u00b7\\u25cf";
  var PHONE_RUN = new RegExp("[+(]*[0-9" + PHONE_MASK + "](?:[" + PHONE_SEP + "]*[0-9" + PHONE_MASK + "])*\\)?", "g");
  var PHONE_GROUP_SPLIT = new RegExp("[" + PHONE_SEP + "]+");
  function phoneLike(run) {
    var digits = (run.match(/[0-9]/g) || []).length, masks = run.length - run.replace(/[xX*#\u2022\u00b7\u25cf]/g, "").length;
    if (masks >= 3 && digits + masks >= 7) return true; // (•••) •••-0148, 206-555-XXXX, XXX-XXX-XXXX
    if (digits >= 10) return true;                       // 2065550123, +1 206 555 0123, 206/555/0123
    if (digits < 7) return false;                        // Tue 9-11am, Oct 14, 10:30, 8–10
    // 7-9 digits: one solid run (5550123) or a 3-digit group then 3-4 digits (555-0123, 206 555 01). Not "15 2026 2".
    var g = run.replace(/[^0-9]+$/, "").split(PHONE_GROUP_SPLIT).filter(Boolean);
    return g.some(function (x) { return x.length >= 7; }) || (g[0].length === 3 && g.length > 1 && g[1].length >= 3);
  }
  function scrubPhones(t) {
    // A mask letter (x/X) only counts when it isn't part of a word ("box", "Xmas" stay).
    return t.replace(PHONE_RUN, function (run, at, all) {
      var before = at > 0 ? all.charAt(at - 1) : "", after = all.charAt(at + run.length);
      if (/^[+(]*[xX]/.test(run) && /[A-Za-z]/.test(before)) return run;
      if (/[xX]\)?$/.test(run) && /[A-Za-z]/.test(after)) return run;
      return phoneLike(run) ? "" : run;
    });
  }
  var CLAIM = /\b(?:book(?:ed|ing)?|confirm(?:ed|s|ation)?|schedul(?:ed|e|ing)|dispatch(?:ed|ing|es)?|technicians?|techs?|on (?:the|his|her|their|my|its) way|en route|sent|send(?:ing)?|texted|texting)\b/i;
  function stripClaims(t) {
    if (!CLAIM.test(t)) return t;
    return t.split(/[.!?;\n]+|,|\s+(?:and|but|so|then)\s+/i).map(function (x) { return x.trim(); })
      .filter(function (x) { return x && !CLAIM.test(x); }).join(", ");
  }
  function cleanField(v, max) {
    if (v == null || v === "") return "";
    var t = stripClaims(scrubPhones(String(v)).replace(/\s+/g, " "))
      .replace(/[\s.,;:!?\-]+$/, "")
      .replace(/[\s.,;:!?\-]*\b(?:(?:call|text|reach)(?: me)?(?: back)?(?: at| on)?|my number(?: is)?|number(?: is)?)\s*$/i, "")
      .replace(/^[\s.,;:!?\-]+|[\s.,;:!?\-]+$/g, "");
    if (t.length > max) t = t.slice(0, max - 1).replace(/[\s.,;:!?\-]+$/, "") + "\u2026";
    return t;
  }
  var CAP = { name: 24, issue: 60, window: 40, appointment: 40 };
  function scrubField(v) {
    if (v == null || v === "") return "";
    var t = scrubPhones(String(v)).replace(/[ \t]{2,}/g, " ").trim();
    return /[A-Za-z0-9]/.test(t) ? t : "";
  }

  // ---------- Caller text preview (mockup only): the text back a caller gets in the real service ----------
  // Never includes a callback number, and a requested time stays a request for Dave to confirm.
  function callerText(card, pkg) {
    var first = cleanField(cleanField(card.name, CAP.name).split(" ")[0], CAP.name);
    first = first.charAt(0).toUpperCase() + first.slice(1);
    var issue = cleanField(card.issue, CAP.issue);
    if (issue && !/^[A-Z]{2}/.test(issue)) issue = issue.charAt(0).toLowerCase() + issue.slice(1);
    var win = pkg === "intake" ? cleanField(card.window, CAP.window) : "";
    var appt = pkg === "estimate" ? cleanField(card.appointment, CAP.appointment) : "";
    var msg = "Hi " + (first || "there") + ", thanks for calling Harborline Heating & Air. " +
      (issue ? "We got your message about " + issue + ". " : "We got your message. ");
    if (win) msg += "You picked " + win + " for an estimate. Dave will confirm that time with you as soon as he's off the job.";
    else if (appt) msg += "Your requested estimate time: " + appt + ". Dave will confirm your requested time.";
    else msg += "Dave will call you back as soon as he's off the job.";
    return msg;
  }
  // Pure helpers, exposed for tools/test_demo_text.js.
  window.BBDemoText = { scrubPhones: scrubPhones, stripClaims: stripClaims, cleanField: cleanField, scrubField: scrubField, callerText: callerText };
  function renderCallerText(card, pkg) {
    var p = $("caller-msg"), msg = callerText(card, pkg || "coverage");
    if (p.textContent === msg) return;
    p.textContent = msg;
    var any = !!(card.name || card.issue || card.window || card.appointment);
    $("caller-bubble").classList.toggle("is-empty", !any);
    p.classList.remove("fresh"); void p.offsetWidth; if (any) p.classList.add("fresh");
  }

  // ---------- Example end-of-day report: sample calls + this visitor's call on top once it ends (textContent only) ----------
  var DR_BASE = { answered: 4, urgent: 2, open: 1 };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function renderDaily(card, pkg) {
    var list = $("dr-list"), mine = $("dr-mine");
    var has = !!(card.name || card.issue);
    if (!has) {
      if (mine) mine.parentNode.removeChild(mine);
      $("dr-answered").textContent = DR_BASE.answered; $("dr-urgent").textContent = DR_BASE.urgent; $("dr-open").textContent = DR_BASE.open;
      return;
    }
    var urgent = String(card.urgency || "") === "emergency";
    var li = el("li", "dr-item dr-mine fresh");
    li.id = "dr-mine";
    var top = el("div", "dr-top");
    top.appendChild(el("span", "dr-time", "Just now"));
    top.appendChild(el("span", "dr-name", scrubField(card.name) || "Your call"));
    top.appendChild(el("span", "dr-tag yours", "Your call"));
    if (urgent) top.appendChild(el("span", "dr-tag urgent", "Urgent"));
    li.appendChild(top);
    li.appendChild(el("p", "dr-issue", scrubField(card.issue) || "\u2014"));
    function meta(k, v) { var p = el("p", "dr-meta"); p.appendChild(el("span", "k", k + " ")); p.appendChild(document.createTextNode(v)); li.appendChild(p); }
    var nc = nameCheck(card);
    if (nc) meta("Name check:", nc);
    meta("Mood:", card.mood ? String(card.mood) : "\u2014");
    var win = pkg === "intake" ? scrubField(card.window) : "";
    var appt = pkg === "estimate" ? scrubField(card.appointment) : "";
    if (win) meta("Wants an estimate:", win + " (Dave to confirm)");
    if (appt) meta("Estimate booked:", appt + " (demo)");
    meta("Callback:", "Needs a callback" + (card.callback ? " \u00b7 " + String(card.callback) : ""));
    var sig = li.textContent;
    if (mine && mine.getAttribute("data-sig") === sig) return;
    li.setAttribute("data-sig", sig);
    if (mine) list.replaceChild(li, mine); else list.insertBefore(li, list.firstChild);
    $("dr-answered").textContent = DR_BASE.answered + 1;
    $("dr-urgent").textContent = DR_BASE.urgent + (urgent ? 1 : 0);
    $("dr-open").textContent = DR_BASE.open + 1;
  }

  function applyPkgUi() {
    var rows = document.querySelectorAll("#pkg-picker [data-pkg-row]");
    for (var i = 0; i < rows.length; i++) rows[i].classList.toggle("selected", rows[i].getAttribute("data-pkg-row") === chosenPkg);
    var btns = document.querySelectorAll("#pkg-picker [data-pkg-go]");
    for (var j = 0; j < btns.length; j++) btns[j].disabled = !livePkg(btns[j].getAttribute("data-pkg-go")) || leaseInFlight || lineClosed;
    // The big picker only starts a lease; with a number held, switching lives in "Try another plan" at the bottom.
    $("pkg-picker").hidden = !!lease;
    $("hearing-name").textContent = PKGS[chosenPkg].name;
    $("pkg-hint").textContent = PKGS[chosenPkg].hint;
    applySwitcher();
    if (lastMsg) { var keep = lastSeq; lastSeq = -1; render(lastMsg); lastSeq = keep; }
    else { showPkgRows(chosenPkg); renderOwnerText({}, chosenPkg); renderCallerText({}, chosenPkg); }
  }
  // Hidden until the visitor's first call on a held number has ended.
  function applySwitcher() {
    $("switcher").hidden = !(lease && firstCallEnded);
    var opts = document.querySelectorAll("#switcher [data-pkg-switch]");
    for (var i = 0; i < opts.length; i++) {
      var on = opts[i].getAttribute("data-pkg-switch") === chosenPkg;
      opts[i].setAttribute("aria-pressed", on ? "true" : "false");
      opts[i].classList.toggle("selected", on);
      opts[i].disabled = !livePkg(opts[i].getAttribute("data-pkg-switch"));
    }
  }
  function switchPkg(v) {
    v = livePkg(v);
    if (!v || !lease) return;
    if (v !== chosenPkg) pickPkg(v);
    var inCall = callState === "connecting" || callState === "live";
    $("sw-status").textContent = inCall ? "" : "Now set to " + PKGS[v].name + ". Call " + fmt(lease.number) + " again to hear it.";
    $("sw-call").hidden = inCall;
  }
  function pickPkg(v) {
    v = livePkg(v);
    if (!v || v === chosenPkg) return;
    chosenPkg = v;
    try {
      var u = new URL(window.location.href);
      u.searchParams.set("package", v);
      window.history.replaceState(null, "", u.pathname + u.search + u.hash);
    } catch (e) { /* old browser: URL stays as is */ }
    applyPkgUi();
    if (lease) {
      // Already holding a number: switch the package for the next call on this line.
      post("/lease/package", { sessionId: lease.sessionId, sessionToken: lease.sessionToken, package: v }).catch(function () {});
      $("pkg-next").hidden = !(callState === "connecting" || callState === "live");
    }
  }

  // ---------- WebSocket ----------
  var wsStateReady = false;
  function connectWs() {
    if (!lease || wsClosedForGood) return;
    wsStateReady = false;
    try {
      ws = new WebSocket(WS_API + "/ws?s=" + encodeURIComponent(lease.sessionId), ["bbdemo.v1", lease.sessionToken]);
    } catch (e) { scheduleWs(); return; }
    var mine = ws;
    ws.onopen = function () { wsRetry = 0; };
    ws.onmessage = function (ev) {
      if (ws !== mine) return; // late message from an earlier lease's socket
      var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.type === "hello" || m.type === "state") {
        var firstFreshState = !wsStateReady;
        wsStateReady = true;
        render(m);
        if (callState !== "connecting" && callState !== "live") idleVerifiedAt = Date.now();
        if (firstFreshState && heartbeatQueued) { heartbeatQueued = false; heartbeat(); }
        if (firstFreshState) checkReturn();
      }
    };
    ws.onclose = function (ev) {
      if (ws !== mine) return; // a socket from an earlier lease: ignore
      ws = null;
      wsStateReady = false;
      if (ev.code === 4000) { wsClosedForGood = true; return; } // session wiped after 24 h
      scheduleWs();
    };
  }
  function scheduleWs() {
    wsRetry = Math.min(wsRetry + 1, 6);
    clearTimeout(wsTimer);
    wsTimer = setTimeout(connectWs, Math.min(30000, 500 * Math.pow(2, wsRetry)));
  }
  function refreshWsState() {
    wsStateReady = false;
    clearTimeout(wsTimer); wsTimer = null;
    if (ws) { var old = ws; ws = null; try { old.close(); } catch (e) {} }
    if (lease) connectWs();
  }

  // ---------- lease lifecycle ----------
  // A lease left idle for 15 minutes is released and the visitor goes back to the homepage.
  // Checked with wall-clock time on every heartbeat, since timers in hidden tabs or sleeping laptops are throttled.
  // Never during a call: connecting/live block it, and any call state change (e.g. ended) restarts the 15 minutes.
  var IDLE_RELEASE_MS = 15 * 60 * 1000, IDLE_STATE_FRESH_MS = 60 * 1000, idleSince = 0, idleVerifiedAt = 0;
  var heartbeatInFlight = false, heartbeatQueued = false, lastHeartbeatCheck = 0, heartbeatEveryMs = HEARTBEAT_MS;
  function releaseLease(goHome) {
    if (!lease) return false;
    var l = lease;
    stopLease();
    var sent = post("/lease/release", { sessionId: l.sessionId, sessionToken: l.sessionToken }, true);
    if (sent && typeof sent.catch === "function") sent.catch(function () {});
    if (goHome) window.location.replace("/");
    return true;
  }
  function releaseIfIdle() {
    if (!lease) return false;
    if (callState === "connecting" || callState === "live") return false;
    var now = Date.now();
    if (now - lastCallClick < 5 * 60 * 1000 || now - idleSince < IDLE_RELEASE_MS) return false;
    // Never trust a 15-minute-old cached call state. Reconnect and wait for hello/state before deciding.
    if (!wsStateReady || !ws || ws.readyState !== 1 ||
        idleVerifiedAt < idleSince || now - idleVerifiedAt > IDLE_STATE_FRESH_MS) {
      heartbeatQueued = true;
      refreshWsState();
      return true;
    }
    return releaseLease(true);
  }
  function heartbeat() {
    if (!lease) return;
    var now = Date.now();
    var staleAfterSleep = lastHeartbeatCheck && now - lastHeartbeatCheck > Math.max(60000, heartbeatEveryMs * 3);
    lastHeartbeatCheck = now;
    if (staleAfterSleep && document.visibilityState === "visible") {
      heartbeatQueued = true;
      refreshWsState();
      return;
    }
    if (heartbeatInFlight) { heartbeatQueued = true; return; }
    if (releaseIfIdle()) return;
    var mine = lease;
    heartbeatInFlight = true;
    var hbBody = { sessionId: mine.sessionId, sessionToken: mine.sessionToken }, sentTap = tapPending;
    if (sentTap) { hbBody.tap = true; tapPending = false; }
    post("/lease/heartbeat", hbBody).then(function (r) {
      if (!lease || lease.sessionId !== mine.sessionId) return;
      if (r.ok) { if (r.number !== lease.number) showNumber(r.number); return; }
      if (r.reason === "busy") return showBusy(r.nextFreeInMin);
      if (r.reason === "closed") return showClosed("off");
      if (r.reason === "unknown-session") { stopLease(); show("start"); resetTurnstile(); }
      if (r.reason === "ip-cap") {
        // another screen on this network holds the lines this network may use (review MF-1)
        stopLease(); show("start"); resetTurnstile();
        $("start-err").textContent = IP_CAP_MSG;
        $("start-err").hidden = false;
      }
    }).catch(function () {
      // transient; next beat retries (and re-sends the tap while it can still matter for routing)
      if (sentTap && Date.now() - lastCallClick < 60 * 1000) tapPending = true;
    }).then(function () {
      heartbeatInFlight = false;
      if (heartbeatQueued) { heartbeatQueued = false; heartbeat(); }
    });
  }
  function startLease(r) {
    // Review SF-5: a new lease starts with fresh WebSocket + card state (stopLease marked the old socket
    // closed-for-good, and the new session's seq numbers start again at 0).
    clearTimeout(wsTimer); wsTimer = null;
    wsClosedForGood = false; wsRetry = 0; lastSeq = -1; ackedCallback = null; callState = "idle";
    firstCallEnded = false; awayForCall = false; endedWhileAway = false; awaySeq = -1;
    pendingCallUntil = 0; clearTimeout(pendingTimer); clickSeq = -1; callEndAt = 0; callNotSeen = false; tapPending = false; backSent = false;
    returnCheckPending = false; clearTimeout(returnCheckTimer); returnCheckTimer = null;
    lease = { sessionId: r.sessionId, sessionToken: r.sessionToken, number: r.number };
    // A replacement lease must not briefly reuse the prior session's results or reveal its switcher.
    render({ call: "idle", card: {} });
    idleSince = Date.now(); idleVerifiedAt = 0;
    lastHeartbeatCheck = idleSince;
    heartbeatEveryMs = (r.heartbeatSeconds || 20) * 1000 || HEARTBEAT_MS;
    heartbeatInFlight = false; heartbeatQueued = false; wsStateReady = false;
    showNumber(r.number);
    clearInterval(hbTimer);
    hbTimer = setInterval(heartbeat, heartbeatEveryMs);
    clearInterval(pingTimer);
    pingTimer = setInterval(function () { if (ws && ws.readyState === 1) ws.send('{"type":"ping"}'); }, 30000);
    connectWs();
  }
  function stopLease() {
    clearInterval(hbTimer); clearInterval(pingTimer); clearTimeout(wsTimer); wsTimer = null;
    wsClosedForGood = true; wsStateReady = false; heartbeatQueued = false;
    if (ws) { var old = ws; ws = null; try { old.close(); } catch (e) {} }
    lease = null;
    pendingCallUntil = 0; clearTimeout(pendingTimer); callNotSeen = false; tapPending = false;
    applyPkgUi();
    applyFlow({});
  }
  function showBusy(min) {
    $("busy-msg").textContent = min ? "A line should free up in about " + min + " minute" + (min === 1 ? "" : "s") + "." : "Try again in a few minutes.";
    show("busy");
    endAuto();
  }
  function showClosed(mode) {
    lineClosed = true; pendingLease = false;
    applyPkgUi();
    $("closed-title").textContent = mode === "scheduled-only" ? "The demo line is open for scheduled demos right now." : "The demo line is closed right now.";
    $("closed-msg").textContent = "Please check back later.";
    show("closed");
    endAuto();
  }

  // A package's "Hear it live" button: select it, then (if no number is held yet) run the lease flow.
  // With a number already held it only switches the package for the next call (pickPkg -> /lease/package).
  function hearLive(pkg, auto) {
    if (!livePkg(pkg)) return;
    pickPkg(pkg);
    if (lease || lineClosed || leaseInFlight) return;
    show("start");
    if (turnstileUnsupported) {
      pendingLease = false;
      endAuto();
      $("start-status").textContent = IDLE_STATUS;
      $("start-err").hidden = false;
      return;
    }
    $("start-err").hidden = true;
    pendingLease = true;
    if (turnstileToken) return requestLease();
    $("start-status").textContent = auto ? gettingMsg() : "Quick check that you're a person\u2026";
    if (window.turnstile && widgetId !== null && !turnstileToken) {
      try { if (window.turnstile.isExpired && window.turnstile.isExpired(widgetId)) window.turnstile.reset(widgetId); } catch (e) {}
    }
    if (widgetId === null) renderTurnstile();
  }
  function leaseDone() { leaseInFlight = false; pendingLease = false; applyPkgUi(); }
  // Random per-browser id (localStorage only, no cookie, never shown) so the Worker can route a returning
  // visitor's call to the demo page they have open now. Blocked storage falls back to an id for this page only.
  // Only a CSPRNG may mint it (a guessable id would let someone claim another visitor's caller ID); with none
  // available we send no visitorId at all.
  var VID_KEY = "bb_demo_vid", memVid = null;
  function newVisitorId() {
    var c = window.crypto;
    if (!c) return null;
    try { if (typeof c.randomUUID === "function") return c.randomUUID(); } catch (e) {}
    try {
      if (typeof c.getRandomValues !== "function") return null;
      var b = new Uint8Array(16); c.getRandomValues(b);
      var h = "";
      for (var i = 0; i < b.length; i++) h += (b[i] < 16 ? "0" : "") + b[i].toString(16);
      return h;
    } catch (e) { return null; }
  }
  function validVisitorId(v) { return typeof v === "string" && /^[A-Za-z0-9_-]{22,64}$/.test(v); }
  function visitorId() {
    if (memVid) return memVid;
    var v = null;
    try {
      v = localStorage.getItem(VID_KEY);
      if (!validVisitorId(v)) { v = newVisitorId(); if (v) localStorage.setItem(VID_KEY, v); }
    } catch (e) {
      if (!validVisitorId(v)) v = newVisitorId();
    }
    if (!validVisitorId(v)) return null;
    memVid = v;
    return v;
  }
  function leaseBody() {
    var body = { turnstileToken: turnstileToken, package: chosenPkg };
    var vid = visitorId();
    if (vid) body.visitorId = vid;
    return body;
  }
  function requestLease() {
    if (leaseInFlight || !turnstileToken) return;
    leaseInFlight = true; pendingLease = false;
    applyPkgUi();
    $("start-err").hidden = true;
    $("start-status").textContent = gettingMsg();
    post("/lease", leaseBody()).then(function (r) {
      turnstileToken = null;
      leaseInFlight = false;
      $("start-status").textContent = IDLE_STATUS;
      if (r.ok) { startLease(r); leaseDone(); return; }
      leaseDone();
      endAuto();
      if (r.reason === "busy") return showBusy(r.nextFreeInMin);
      if (r.reason === "closed") return showClosed("off");
      resetTurnstile();
      // ip-cap = this network already holds its 2 demo lines (other open demo tabs), not "too many tries".
      var msg = r.reason === "ip-cap" ? IP_CAP_MSG
        : r.reason === "rate-limited" ? "Too many tries from this network. Please wait a minute." : "That didn't work. Please try again.";
      $("start-err").textContent = msg; $("start-err").hidden = false;
    }).catch(function () {
      leaseDone();
      endAuto();
      resetTurnstile();
      $("start-err").textContent = "Couldn't reach the demo line. Please try again."; $("start-err").hidden = false;
    });
  }

  // ---------- Turnstile (explicit render, action "lease") ----------
  function resetTurnstile() {
    turnstileToken = null;
    if (window.turnstile && widgetId !== null) window.turnstile.reset(widgetId);
  }
  function renderTurnstile() {
    if (widgetId !== null) return;
    if (!window.turnstile || typeof window.turnstile.render !== "function") {
      if (widgetTimer === null) widgetTimer = setTimeout(function () { widgetTimer = null; renderTurnstile(); }, 200);
      return;
    }
    widgetId = window.turnstile.render("#ts-widget", {
      sitekey: cfg.turnstileSiteKey,
      action: "lease",
      theme: "dark",
      // Shown only if Cloudflare needs the visitor to interact (developers.cloudflare.com/turnstile, appearance modes).
      appearance: "interaction-only",
      callback: function (t) { turnstileToken = t; if (pendingLease) requestLease(); },
      // Cloudflare wants the visitor to interact: the widget shows itself (interaction-only); say so.
      "before-interactive-callback": function () {
        if (pendingLease) $("start-status").textContent = "Please finish the quick check above, then we'll get your demo line.";
        endAuto();
      },
      "expired-callback": function () { resetTurnstile(); },
      "unsupported-callback": function () {
        turnstileUnsupported = true;
        pendingLease = false;
        endAuto();
        $("start-status").textContent = IDLE_STATUS;
        $("start-err").textContent = "This browser can't run the quick person check. Please try another browser."; $("start-err").hidden = false;
      },
      "error-callback": function () {
        turnstileToken = null;
        endAuto();
        if (pendingLease) {
          // Retry is "auto" by default; keep the requested lease pending so a successful retry can finish it.
          $("start-status").textContent = "The quick person check hit a problem. Retrying\u2026";
          $("start-err").textContent = "If it doesn't recover, refresh the page and try again."; $("start-err").hidden = false;
        }
      }
    });
  }

  // ---------- auto-start from ?package= (homepage "Try a live demo call") ----------
  // Runs once, only after /status says the line is open. The Turnstile widget already runs its check on
  // render (execution "render", the default), so this just asks for the lease as soon as that token arrives,
  // exactly like an early tap on "Hear it live". If Cloudflare needs interaction, the widget appears.
  function autoStart(status) {
    if (!autoStartPkg || autoStarted) return;
    autoStarted = true;
    if (status && status.mode === "scheduled-only") {
      // Public visitors can't call in scheduled-only mode: don't take a line; keep the scheduled-demo note
      // (#mode-note, shown above) and the normal buttons for people who have a demo booked.
      endAuto();
      return;
    }
    // An explicit click after the safety fallback while /status was loading wins over the original URL.
    if (pendingLease || leaseInFlight || lease) return;
    hearLive(autoStartPkg, true);
  }

  // Release the line when the visitor really leaves, but never while a call is starting or live
  // (a tap on the tel: link can hide the page; releasing then would break the pairing).
  window.addEventListener("pagehide", function () {
    leftPage();
    if (!lease || callState === "connecting" || callState === "live") return;
    if (Date.now() - lastCallClick < 5 * 60 * 1000) return;
    releaseLease(false);
  });
  // A hidden/sleeping tab can miss call-state messages. Reconnect before any idle decision when it returns,
  // and bring a visitor back from the phone app onto the results. iOS Safari's bfcache restore fires only pageshow.
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "visible") { leftPage(); return; }
    cameBack();
  });
  // iOS can return from another app via a bfcache restore (pageshow, persisted) without a visibilitychange.
  window.addEventListener("pageshow", function (ev) {
    if (ev.persisted) cameBack();
    else if (autoStartPkg && flow === "before") window.scrollTo(0, 0);
  });

  document.addEventListener("DOMContentLoaded", function () {
    var goBtns = document.querySelectorAll("#pkg-picker [data-pkg-go]");
    for (var i = 0; i < goBtns.length; i++) goBtns[i].addEventListener("click", function (ev) { hearLive(ev.currentTarget.getAttribute("data-pkg-go")); });
    applyPkgUi();
    applyFlow({});
    if (autoStartPkg) {
      setAutoInert(document.documentElement.classList.contains("pkg-auto"));
      // Same words as gettingMsg(), with the package name in gold; rewriting it also lets the live region announce it.
      var msg = $("bbl-msg"), name = PKGS[chosenPkg].name, at = gettingMsg().indexOf(name);
      msg.textContent = "";
      msg.appendChild(document.createTextNode(gettingMsg().slice(0, at)));
      msg.appendChild(el("span", "bbl-pkg", name));
      msg.appendChild(document.createTextNode(gettingMsg().slice(at + name.length)));
    }
    $("retry").addEventListener("click", function () { resetTurnstile(); hearLive(chosenPkg); });
    $("call-link").addEventListener("click", noteCallTap);
    $("sw-call").addEventListener("click", noteCallTap);
    $("live-again").addEventListener("click", noteCallTap);
    var swBtns = document.querySelectorAll("#switcher [data-pkg-switch]");
    for (var k = 0; k < swBtns.length; k++) swBtns[k].addEventListener("click", function (ev) { switchPkg(ev.currentTarget.getAttribute("data-pkg-switch")); });
    // /status is coarse only: { state: open|scheduled-only|busy|closed, mode, nextFreeInMin }
    fetch(API + "/status", { credentials: "omit" }).then(function (r) { return r.json(); }).then(function (s) {
      if (s.state === "closed" || s.mode === "off") return showClosed("off");
      if (s.state === "busy") { pendingLease = false; return showBusy(s.nextFreeInMin); }
      $("mode-note").hidden = s.mode !== "scheduled-only";
      show("start");
      renderTurnstile();
      autoStart(s);
    }).catch(function () {
      show("start");
      renderTurnstile();
      endAuto();
      if (autoStartPkg && !pendingLease) $("start-status").textContent = "We couldn't check whether the demo line is open. Tap Hear it live to try.";
    });
  });
})();
