// Harborline demo page: lease a pool number (Turnstile-protected), keep it armed with heartbeats,
// and render the Live Capture card pushed over a WebSocket by the bluebee-demo Worker.
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
    coverage: { name: "Coverage Service", hint: "Try it: describe a heating or cooling problem.", note: "" },
    intake: { name: "Intake Service", hint: "Try it: describe a problem, then pick one of the estimate windows Ara offers.",
      note: "Dave confirms the requested window with one tap. Nothing is booked until he does." },
    estimate: { name: "Estimate Request Service", hint: "Try it: book the estimate slot Ara offers, or say it's an emergency to hear the put-through.",
      note: "Demo schedule only: nobody will actually come out, and this demo line can't transfer calls." }
  };
  function validPkg(v) { return Object.prototype.hasOwnProperty.call(PKGS, v) ? v : null; }
  // ?package= from the homepage plan cards ("Hear this package"). A valid value also auto-starts the
  // lease flow once (same path as tapping that package's "Hear it live"); plain /demo/ waits for a tap.
  var urlPkg = (function () {
    try { return validPkg(new URLSearchParams(window.location.search).get("package")); } catch (e) { return null; }
  })();
  var chosenPkg = urlPkg || "coverage";
  var autoStartPkg = urlPkg, autoStarted = false;
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
    drawQr(e164);
    show("leased");
    endAuto();
  }

  // ---------- Live Capture card ----------
  var STATUS = { idle: "Waiting for your call.", connecting: "Call coming in\u2026", live: "On the call. Watch the card fill in.", ended: "Here's what Ara took down from your call, and below it, a preview of the text Dave would get." };
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
    $("live-badge").hidden = callState !== "live";
    var card = m.card || {};
    var pkg = cardPkg(m);
    renderResults(m, card);
    showPkgRows(pkg);
    // "city" row shows City/ZIP together: card.city and card.zip (5 digits) from capture_update.
    ["name", "callback", "issue", "city", "urgency", "mood", "window", "appointment"].forEach(function (f) {
      var el = document.querySelector('.field[data-field="' + f + '"]');
      var dd = el.querySelector("dd");
      var v = f === "city"
        ? [card.city, card.zip].filter(Boolean).map(String).join(" ")
        : (card[f] ? String(card[f]) : "");
      var shown = v || "\u2014";
      if (dd.textContent !== shown) {
        dd.textContent = shown;
        el.classList.toggle("filled", !!v);
        el.classList.remove("fresh"); void el.offsetWidth; if (v) el.classList.add("fresh");
      }
      if (f === "urgency") dd.className = v === "emergency" ? "urgency-emergency" : "";
    });
    renderOwnerText(card, pkg);
    renderDaily(card, pkg);
    // Tell the Worker the confirmed callback is on screen (latency measurement, AC3).
    if (card.callback && card.callback !== ackedCallback && ws && ws.readyState === 1) {
      ackedCallback = card.callback;
      ws.send(JSON.stringify({ type: "ack", field: "callback", seq: m.seq }));
    }
    if (callState === "ended" && prevState !== "ended") callEnded();
  }

  // ---------- Results view: "Here's what Ara caught" once a call ends ----------
  // Most visitors call from the same phone, so they can't watch: when they come back to the browser after
  // hanging up, they land on the results. Never claims a real text was sent (the owner text stays a PREVIEW).
  var firstCallEnded = false, awayForCall = false, returnCheckPending = false, returnCheckTimer = null, lastReturnAt = 0;
  function renderResults(m, card) {
    var ended = callState === "ended";
    var caught = ["name", "callback", "issue", "city", "zip", "urgency", "mood", "window", "appointment"].some(function (f) { return !!card[f]; });
    $("capture").classList.toggle("is-results", ended);
    $("cap-h").textContent = !ended ? "Live Capture" : caught ? "Here's what Ara caught" : "Call ended";
    $("ended-tag").hidden = !ended || !caught;
    $("call-status").textContent = (m.returning && callState !== "idle" ? "Returning caller. " : "") +
      (!ended ? STATUS[callState] || "" : caught ? STATUS.ended
        : "Ara didn't catch any details that time. Call again and describe a heating or cooling problem.");
    var mood = ended && card.mood ? String(card.mood) : "";
    $("mood-note-v").textContent = mood;
    $("mood-note").hidden = !mood;
    $("results-next").hidden = !ended || !caught;
  }
  function reduceMotion() { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); }
  function scrollToResults() {
    awayForCall = false;
    var target = $("capture");
    // Let layout settle first (iOS restores its own scroll position when the page comes back).
    setTimeout(function () {
      try { target.scrollIntoView({ behavior: reduceMotion() ? "instant" : "smooth", block: "start" }); }
      catch (e) { target.scrollIntoView(true); }
    }, 120);
  }
  function callEnded() {
    if (!firstCallEnded) { firstCallEnded = true; applySwitcher(); }
    if (document.visibilityState === "visible") scrollToResults();
    else awayForCall = true;
  }
  // The visitor left (phone app, tab switch, bfcache) while a call was starting or just after tapping call.
  function leftPage() {
    if (callState === "connecting" || callState === "live" || Date.now() - lastCallClick < 5 * 60 * 1000) awayForCall = true;
  }
  // Back on the page: decide once fresh call state arrives (or from the cached state if the socket can't reconnect).
  function cameBack() {
    var now = Date.now();
    if (now - lastReturnAt < 500) return;
    lastReturnAt = now;
    if (!lease) return;
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
    if (awayForCall && callState === "ended") scrollToResults();
  }

  // ---------- Owner text preview (mockup only: the demo never sends a text) ----------
  // Built from the same card fields as Live Capture. Values go in with textContent only.
  var SMS_TITLE = { coverage: "Harborline - new call (Blue Bee Ops)", intake: "Harborline - new call + estimate request", estimate: "Harborline - estimate booked (Blue Bee Ops)" };
  function renderOwnerText(card, pkg) {
    pkg = pkg || "coverage";
    var cityZip = [card.city, card.zip].filter(Boolean).map(String).join(" ");
    var urg = card.urgency ? String(card.urgency) : "";
    var vals = {
      name: card.name ? String(card.name) : "",
      callback: card.callback ? String(card.callback) : "",
      city: cityZip,
      issue: card.issue ? String(card.issue) : "",
      urgency: urg ? urg.charAt(0).toUpperCase() + urg.slice(1) : "",
      tap: card.callback ? String(card.callback) : "",
      window: pkg === "intake" && card.window ? String(card.window) : "",
      appointment: pkg === "estimate" && card.appointment ? String(card.appointment) : "",
      mood: card.mood ? String(card.mood) : ""
    };
    var urgentPutThrough = pkg === "estimate" && urg === "emergency";
    $("sms-urgent").hidden = !urgentPutThrough;
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

  // ---------- Example daily report: sample calls + this visitor's call on top (textContent only) ----------
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
    top.appendChild(el("span", "dr-name", card.name ? String(card.name) : "Your call"));
    top.appendChild(el("span", "dr-tag yours", "Your call"));
    if (urgent) top.appendChild(el("span", "dr-tag urgent", "Urgent"));
    li.appendChild(top);
    li.appendChild(el("p", "dr-issue", card.issue ? String(card.issue) : "\u2014"));
    function meta(k, v) { var p = el("p", "dr-meta"); p.appendChild(el("span", "k", k + " ")); p.appendChild(document.createTextNode(v)); li.appendChild(p); }
    meta("Mood:", card.mood ? String(card.mood) : "\u2014");
    if (pkg === "intake" && card.window) meta("Wants an estimate:", String(card.window) + " (Dave to confirm)");
    if (pkg === "estimate" && card.appointment) meta("Estimate booked:", String(card.appointment) + " (demo)");
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
    for (var j = 0; j < btns.length; j++) btns[j].disabled = leaseInFlight || lineClosed;
    // The big picker only starts a lease; with a number held, switching lives in "Try another plan" at the bottom.
    $("pkg-picker").hidden = !!lease;
    $("hearing-name").textContent = PKGS[chosenPkg].name;
    $("pkg-hint").textContent = PKGS[chosenPkg].hint;
    applySwitcher();
    if (lastMsg) { var keep = lastSeq; lastSeq = -1; render(lastMsg); lastSeq = keep; }
    else { showPkgRows(chosenPkg); renderOwnerText({}, chosenPkg); }
  }
  // Hidden until the visitor's first call on a held number has ended.
  function applySwitcher() {
    $("switcher").hidden = !(lease && firstCallEnded);
    var opts = document.querySelectorAll("#switcher [data-pkg-switch]");
    for (var i = 0; i < opts.length; i++) {
      var on = opts[i].getAttribute("data-pkg-switch") === chosenPkg;
      opts[i].setAttribute("aria-pressed", on ? "true" : "false");
      opts[i].classList.toggle("selected", on);
    }
  }
  function switchPkg(v) {
    v = validPkg(v);
    if (!v || !lease) return;
    if (v !== chosenPkg) pickPkg(v);
    var inCall = callState === "connecting" || callState === "live";
    $("sw-status").textContent = inCall ? "" : "Now set to " + PKGS[v].name + ". Call " + fmt(lease.number) + " again to hear it.";
    $("sw-call").hidden = inCall;
  }
  function pickPkg(v) {
    v = validPkg(v);
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
    post("/lease/heartbeat", { sessionId: mine.sessionId, sessionToken: mine.sessionToken }).then(function (r) {
      if (!lease || lease.sessionId !== mine.sessionId) return;
      if (r.ok) { if (r.number !== lease.number) showNumber(r.number); return; }
      if (r.reason === "busy") return showBusy(r.nextFreeInMin);
      if (r.reason === "closed") return showClosed("off");
      if (r.reason === "unknown-session") { stopLease(); show("start"); resetTurnstile(); }
      if (r.reason === "ip-cap") {
        // another screen on this network holds the lines this network may use (review MF-1)
        stopLease(); show("start"); resetTurnstile();
        $("start-err").textContent = "Too many demo screens are open from this network. Close one and try again.";
        $("start-err").hidden = false;
      }
    }).catch(function () { /* transient; next beat retries */ }).then(function () {
      heartbeatInFlight = false;
      if (heartbeatQueued) { heartbeatQueued = false; heartbeat(); }
    });
  }
  function startLease(r) {
    // Review SF-5: a new lease starts with fresh WebSocket + card state (stopLease marked the old socket
    // closed-for-good, and the new session's seq numbers start again at 0).
    clearTimeout(wsTimer); wsTimer = null;
    wsClosedForGood = false; wsRetry = 0; lastSeq = -1; ackedCallback = null; callState = "idle";
    lease = { sessionId: r.sessionId, sessionToken: r.sessionToken, number: r.number };
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
    applyPkgUi();
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
  function requestLease() {
    if (leaseInFlight || !turnstileToken) return;
    leaseInFlight = true; pendingLease = false;
    applyPkgUi();
    $("start-err").hidden = true;
    $("start-status").textContent = gettingMsg();
    post("/lease", { turnstileToken: turnstileToken, package: chosenPkg }).then(function (r) {
      turnstileToken = null;
      leaseInFlight = false;
      $("start-status").textContent = IDLE_STATUS;
      if (r.ok) { startLease(r); leaseDone(); if (autoStarted) scrollToLine(); return; }
      leaseDone();
      endAuto();
      if (r.reason === "busy") return showBusy(r.nextFreeInMin);
      if (r.reason === "closed") return showClosed("off");
      resetTurnstile();
      var msg = r.reason === "rate-limited" || r.reason === "ip-cap" ? "Too many tries from this network. Please wait a minute." : "That didn't work. Please try again.";
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

  // ---------- auto-start from ?package= (homepage "Hear this package") ----------
  function scrollToLine() {
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    try { $("line").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }); } catch (e) { $("line").scrollIntoView(); }
  }
  // Runs once, only after /status says the line is open. The Turnstile widget already runs its check on
  // render (execution "render", the default), so this just asks for the lease as soon as that token arrives,
  // exactly like an early tap on "Hear it live". If Cloudflare needs interaction, the widget appears.
  function autoStart(status) {
    if (!autoStartPkg || autoStarted) return;
    autoStarted = true;
    scrollToLine();
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
  window.addEventListener("pageshow", function (ev) { if (ev.persisted) cameBack(); });

  document.addEventListener("DOMContentLoaded", function () {
    var goBtns = document.querySelectorAll("#pkg-picker [data-pkg-go]");
    for (var i = 0; i < goBtns.length; i++) goBtns[i].addEventListener("click", function (ev) { hearLive(ev.currentTarget.getAttribute("data-pkg-go")); });
    applyPkgUi();
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
    $("call-link").addEventListener("click", function () { lastCallClick = Date.now(); heartbeat(); });
    $("sw-call").addEventListener("click", function () { lastCallClick = Date.now(); heartbeat(); });
    var swBtns = document.querySelectorAll("#switcher [data-pkg-switch]");
    for (var k = 0; k < swBtns.length; k++) swBtns[k].addEventListener("click", function (ev) { switchPkg(ev.currentTarget.getAttribute("data-pkg-switch")); });
    // /status is coarse only: { state: open|scheduled-only|busy|closed, mode, nextFreeInMin }
    fetch(API + "/status", { credentials: "omit" }).then(function (r) { return r.json(); }).then(function (s) {
      if (s.state === "closed" || s.mode === "off") { if (autoStartPkg) scrollToLine(); return showClosed("off"); }
      if (s.state === "busy") { pendingLease = false; if (autoStartPkg) scrollToLine(); return showBusy(s.nextFreeInMin); }
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
