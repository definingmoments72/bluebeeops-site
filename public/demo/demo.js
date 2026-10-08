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
  var turnstileToken = null, widgetId = null;

  // ---------- package picker (Coverage / Intake / Estimate Request) ----------
  var PKGS = {
    coverage: { name: "Coverage Service", hint: "Try it: describe a heating or cooling problem like a homeowner would.", note: "" },
    intake: { name: "Intake Service", hint: "Try it: describe a problem, then pick one of the estimate windows the assistant offers.",
      note: "Dave confirms the requested window with one tap. Nothing is booked until he does." },
    estimate: { name: "Estimate Request Service", hint: "Try it: book the estimate slot the assistant offers, or say it's an emergency to hear the put-through.",
      note: "Demo schedule only: nobody will actually come out, and this demo line can't transfer calls." }
  };
  function validPkg(v) { return Object.prototype.hasOwnProperty.call(PKGS, v) ? v : null; }
  var chosenPkg = (function () {
    try { return validPkg(new URLSearchParams(window.location.search).get("package")) || "coverage"; } catch (e) { return "coverage"; }
  })();
  var lastMsg = null; // last card state from the Worker, re-rendered when the picker changes

  function $(id) { return document.getElementById(id); }
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
      return navigator.sendBeacon(API + path, new Blob([json], { type: "text/plain" }));
    }
    return fetch(API + path, { method: "POST", headers: { "content-type": "application/json" }, body: json, credentials: "omit" })
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
    drawQr(e164);
    show("leased");
  }

  // ---------- Live Capture card ----------
  var STATUS = { idle: "Waiting for your call.", connecting: "Call coming in\u2026", live: "On the call. Watch the card fill in.", ended: "Call ended. Here's what the shop would get." };
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
    callState = m.call || "idle";
    $("call-status").textContent = (m.returning && callState !== "idle" ? "Returning caller. " : "") + (STATUS[callState] || "");
    $("live-badge").hidden = callState !== "live";
    var card = m.card || {};
    var pkg = cardPkg(m);
    showPkgRows(pkg);
    // "city" row shows City/ZIP together: card.city and card.zip (5 digits) from capture_update.
    ["name", "callback", "issue", "city", "urgency", "window", "appointment"].forEach(function (f) {
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
    // Tell the Worker the confirmed callback is on screen (latency measurement, AC3).
    if (card.callback && card.callback !== ackedCallback && ws && ws.readyState === 1) {
      ackedCallback = card.callback;
      ws.send(JSON.stringify({ type: "ack", field: "callback", seq: m.seq }));
    }
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
      appointment: pkg === "estimate" && card.appointment ? String(card.appointment) : ""
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

  function applyPkgUi() {
    var radios = document.querySelectorAll('#pkg-picker input[name="package"]');
    for (var i = 0; i < radios.length; i++) radios[i].checked = radios[i].value === chosenPkg;
    $("hearing-name").textContent = PKGS[chosenPkg].name;
    $("pkg-hint").textContent = PKGS[chosenPkg].hint;
    if (lastMsg) { var keep = lastSeq; lastSeq = -1; render(lastMsg); lastSeq = keep; }
    else { showPkgRows(chosenPkg); renderOwnerText({}, chosenPkg); }
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
  function connectWs() {
    if (!lease || wsClosedForGood) return;
    try {
      ws = new WebSocket(WS_API + "/ws?s=" + encodeURIComponent(lease.sessionId), ["bbdemo.v1", lease.sessionToken]);
    } catch (e) { scheduleWs(); return; }
    var mine = ws;
    ws.onopen = function () { wsRetry = 0; };
    ws.onmessage = function (ev) {
      if (ws !== mine) return; // late message from an earlier lease's socket
      var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.type === "hello" || m.type === "state") render(m);
    };
    ws.onclose = function (ev) {
      if (ws !== mine) return; // a socket from an earlier lease: ignore
      ws = null;
      if (ev.code === 4000) { wsClosedForGood = true; return; } // session wiped after 24 h
      scheduleWs();
    };
  }
  function scheduleWs() {
    wsRetry = Math.min(wsRetry + 1, 6);
    clearTimeout(wsTimer);
    wsTimer = setTimeout(connectWs, Math.min(30000, 500 * Math.pow(2, wsRetry)));
  }

  // ---------- lease lifecycle ----------
  function heartbeat() {
    if (!lease) return;
    post("/lease/heartbeat", { sessionId: lease.sessionId, sessionToken: lease.sessionToken }).then(function (r) {
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
    }).catch(function () { /* transient; next beat retries */ });
  }
  function startLease(r) {
    // Review SF-5: a new lease starts with fresh WebSocket + card state (stopLease marked the old socket
    // closed-for-good, and the new session's seq numbers start again at 0).
    clearTimeout(wsTimer); wsTimer = null;
    wsClosedForGood = false; wsRetry = 0; lastSeq = -1; ackedCallback = null; callState = "idle";
    lease = { sessionId: r.sessionId, sessionToken: r.sessionToken, number: r.number };
    showNumber(r.number);
    clearInterval(hbTimer);
    hbTimer = setInterval(heartbeat, (r.heartbeatSeconds || 20) * 1000 || HEARTBEAT_MS);
    clearInterval(pingTimer);
    pingTimer = setInterval(function () { if (ws && ws.readyState === 1) ws.send('{"type":"ping"}'); }, 30000);
    connectWs();
  }
  function stopLease() {
    clearInterval(hbTimer); clearInterval(pingTimer); clearTimeout(wsTimer); wsTimer = null;
    wsClosedForGood = true;
    if (ws) { var old = ws; ws = null; try { old.close(); } catch (e) {} }
    lease = null;
  }
  function showBusy(min) {
    $("busy-msg").textContent = min ? "A line should free up in about " + min + " minute" + (min === 1 ? "" : "s") + "." : "Try again in a few minutes.";
    show("busy");
  }
  function showClosed(mode) {
    $("closed-title").textContent = mode === "scheduled-only" ? "The demo line is open for scheduled demos right now." : "The demo line is closed right now.";
    $("closed-msg").textContent = "Please check back later.";
    show("closed");
  }

  function requestLease() {
    var btn = $("get-number");
    btn.disabled = true;
    $("start-err").hidden = true;
    post("/lease", { turnstileToken: turnstileToken, package: chosenPkg }).then(function (r) {
      turnstileToken = null;
      if (r.ok) return startLease(r);
      if (r.reason === "busy") return showBusy(r.nextFreeInMin);
      if (r.reason === "closed") return showClosed("off");
      resetTurnstile();
      var msg = r.reason === "rate-limited" || r.reason === "ip-cap" ? "Too many tries from this network. Please wait a minute." : "That didn't work. Please try again.";
      $("start-err").textContent = msg; $("start-err").hidden = false;
    }).catch(function () {
      resetTurnstile();
      $("start-err").textContent = "Couldn't reach the demo line. Please try again."; $("start-err").hidden = false;
    });
  }

  // ---------- Turnstile (explicit render, action "lease") ----------
  function resetTurnstile() {
    turnstileToken = null; $("get-number").disabled = true;
    if (window.turnstile && widgetId !== null) window.turnstile.reset(widgetId);
  }
  function renderTurnstile() {
    if (!window.turnstile || typeof window.turnstile.render !== "function") return setTimeout(renderTurnstile, 200);
    widgetId = window.turnstile.render("#ts-widget", {
      sitekey: cfg.turnstileSiteKey,
      action: "lease",
      theme: "dark",
      callback: function (t) { turnstileToken = t; $("get-number").disabled = false; },
      "expired-callback": function () { resetTurnstile(); },
      "error-callback": function () { $("get-number").disabled = true; }
    });
  }

  // Release the line when the visitor really leaves, but never while a call is starting or live
  // (a tap on the tel: link can hide the page; releasing then would break the pairing).
  window.addEventListener("pagehide", function () {
    if (!lease || callState === "connecting" || callState === "live") return;
    if (Date.now() - lastCallClick < 5 * 60 * 1000) return;
    post("/lease/release", { sessionId: lease.sessionId, sessionToken: lease.sessionToken }, true);
  });
  // Heartbeats are throttled in background tabs; send one as soon as the page is visible again.
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") heartbeat(); });

  document.addEventListener("DOMContentLoaded", function () {
    $("get-number").addEventListener("click", requestLease);
    var radios = document.querySelectorAll('#pkg-picker input[name="package"]');
    for (var i = 0; i < radios.length; i++) radios[i].addEventListener("change", function (ev) { if (ev.target.checked) pickPkg(ev.target.value); });
    applyPkgUi();
    $("retry").addEventListener("click", function () { show("start"); resetTurnstile(); });
    $("call-link").addEventListener("click", function () { lastCallClick = Date.now(); heartbeat(); });
    // /status is coarse only: { state: open|scheduled-only|busy|closed, mode, nextFreeInMin }
    fetch(API + "/status", { credentials: "omit" }).then(function (r) { return r.json(); }).then(function (s) {
      if (s.state === "closed" || s.mode === "off") return showClosed("off");
      if (s.state === "busy") return showBusy(s.nextFreeInMin);
      $("mode-note").hidden = s.mode !== "scheduled-only";
      show("start");
      renderTurnstile();
    }).catch(function () { show("start"); renderTurnstile(); });
  });
})();
