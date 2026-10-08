// Test table for the demo previews' caller-provided text (public/demo/demo.js). cleanField (caller text only)
// scrubs phones, drops claim phrases and short-caps; scrubField (Dave's text and the report) only scrubs phones.
// Run: node tools/test_demo_text.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const noop = () => {};
const sandbox = {
  document: { getElementById: () => ({ textContent: '{"apiBase":"https://example.invalid","turnstileSiteKey":"x"}' }), addEventListener: noop },
  addEventListener: noop,
  location: { search: "", href: "https://example.invalid/demo/" },
  URLSearchParams,
};
sandbox.window = sandbox;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../public/demo/demo.js"), "utf8"), sandbox);
const T = sandbox.BBDemoText;
// The callback line depends on the shop's hours (PT); these rows use an in-hours time (Tue Oct 13 2026, 10:00 AM PDT).
// tools/test_demo_wrapup_memory.js covers the evening and weekend wording.
const IN_HOURS = Date.parse("2026-10-13T17:00:00Z");
const callerTextAt = T.callerText;
T.callerText = (card, pkg, at) => callerTextAt(card, pkg, at == null ? IN_HOURS : at);

// [input, expected cleanField(input, 60)]
const PHONES = [
  ["call me at 206-555-0123", ""],
  ["206/555/0123", ""],
  ["206\u2011555\u20110123", ""],               // non-breaking hyphens
  ["206\u2013555\u20140123", ""],               // en and em dash
  ["206\u2212555\u22120123", ""],               // minus sign
  ["(206) 555.0123", ""],
  ["+1 206 555 0123", ""],
  ["2065550123", ""],
  ["5550123", ""],
  ["555-0123", ""],
  ["206-555-XXXX", ""],
  ["206-555-xxxx", ""],
  ["XXX-XXX-XXXX", ""],
  ["(\u2022\u2022\u2022) \u2022\u2022\u2022-0148", ""],
  ["***-***-0148", ""],
  ["No heat, my number is 206 555 0123", "No heat"],
  ["AC leaking, call me back at 5550123.", "AC leaking"],
  // kept intact
  ["Tue 9-11am", "Tue 9-11am"],
  ["Tue 8\u201310am", "Tue 8\u201310am"],
  ["Oct 14", "Oct 14"],
  ["Thu Oct 15, 2pm", "Thu Oct 15, 2pm"],
  ["Thu Oct 15 2026 2pm", "Thu Oct 15 2026 2pm"],
  ["10:30-12:00", "10:30-12:00"],
  ["Furnace in the box room, unit 12", "Furnace in the box room, unit 12"],
  ["Heat pump is 10 years old", "Heat pump is 10 years old"],
  ["Furnace (unit 12) rattles", "Furnace (unit 12) rattles"],
  ["Xmas lights tripped the box fan, fix by 9am", "Xmas lights tripped the box fan, fix by 9am"],
  ["+1 (206) 555-0123 is best", "is best"],
  ["206 555 0123 ext 4", "ext 4"],
];

const CLAIMS = [
  ["No heat. Appointment is booked and technician dispatched", "No heat"],
  ["appointment is booked and technician dispatched", ""],
  ["Thu 2pm, confirmed", "Thu 2pm"],
  ["Tue 9-11am (scheduled)", ""],
  ["Leaking AC; the tech is on the way", "Leaking AC"],
  ["You've been sent a text", ""],
  ["Dave texted me already, furnace clicking", "furnace clicking"],
  ["BOOKED for Monday", ""],
  ["heat and AC out", "heat and AC out"],
];

let fail = 0;
function row(name, got, want) {
  const ok = got === want;
  if (!ok) fail++;
  console.log((ok ? "ok   " : "FAIL ") + name.padEnd(56) + " -> " + JSON.stringify(got) + (ok ? "" : "  (want " + JSON.stringify(want) + ")"));
}
console.log("Phone scrub (cleanField, cap 60)");
PHONES.forEach(([i, w]) => row(JSON.stringify(i), T.cleanField(i, 60), w));
console.log("\nClaim filter (cleanField, cap 60)");
CLAIMS.forEach(([i, w]) => row(JSON.stringify(i), T.cleanField(i, 60), w));

// [input, expected scrubField(input)]: Dave's preview and the report keep everything except phone numbers.
const LONG = "Furnace short-cycles every ten minutes since the filter change last week, and the upstairs vents blow cold air.";
const DAVE = [
  ["Technician dispatched yesterday but no one came", "Technician dispatched yesterday but no one came"],
  ["Fri 10am, confirmed", "Fri 10am, confirmed"],
  ["Was told the appointment is booked, text was sent", "Was told the appointment is booked, text was sent"],
  [LONG, LONG],
  ["No heat, call 206\u2011555\u20110123", "No heat, call"],
  ["Sam 206-555-XXXX", "Sam"],
  ["5550123", ""],
  ["Tue 9-11am", "Tue 9-11am"],
];
console.log("\nDave's preview + report (scrubField: phones only, no claim filter, no cap)");
DAVE.forEach(([i, w]) => row(JSON.stringify(i.length > 50 ? i.slice(0, 47) + "..." : i), T.scrubField(i), w));
row("caller text still filters that claim", T.cleanField("Technician dispatched yesterday but no one came", 60), "no one came");

console.log("\nCaller text (approved template, 2026-10-08)");
const HI = (n) => "Hi " + n + ", thanks for calling Harborline Heating & Air.";
const NEXT = " He'll call you back as soon as he's off the job.";
const CHANGES = " If anything changes before then, just give us a call.";
row("coverage, fallback from the issue", T.callerText({ name: "Pat Lee", issue: "No heat, furnace clicking" }, "coverage"),
  HI("Pat") + " We passed your message along to Dave: No heat, furnace clicking." + NEXT + CHANGES);
row("intake with window", T.callerText({ name: "Pat", issue: "No heat", window: "Tue 9-11am" }, "intake"),
  HI("Pat") + " We passed your message along to Dave: No heat. You asked for Tue 9-11am for an estimate, and Dave will confirm the time when he calls you back." + CHANGES);
row("estimate with requested time", T.callerText({ name: "maria", issue: "AC leaking", appointment: "Thu Oct 15, 2pm" }, "estimate"),
  HI("Maria") + " We passed your message along to Dave: AC leaking. You asked for Thu Oct 15, 2pm, and Dave will confirm that time with you." + CHANGES);
row("injected claims fall back to generic", T.callerText({ name: "Booked", issue: "appointment is booked and technician dispatched",
  appointment: "confirmed, tech on the way" }, "estimate"),
  HI("there") + " We passed your message along to Dave." + NEXT + CHANGES);
row("phone in every field", T.callerText({ name: "206-555-0123", issue: "call 206\u2011555\u20110123", window: "5550123" }, "intake"),
  HI("there") + " We passed your message along to Dave." + NEXT + CHANGES);

console.log("\nRegression: Jase's 1:03 PM call 01a11d1d ('; wants.')");
row("cleanField keeps a bare 'wants call back'", T.cleanField("Cat up a tree scratching dog; wants call back", 60), "Cat up a tree scratching dog; wants call back");
row("cleanField keeps a bare 'wants a call back'", T.cleanField("Toilet overflowing; wants a call back", 60), "Toilet overflowing; wants a call back");
row("cleanField keeps 'wants Dave to call back'", T.cleanField("AC not cooling, wants Dave to call back", 60), "AC not cooling, wants Dave to call back");
row("lead-in removed only with a real number", T.cleanField("No heat, call me back at 360-555-5874 please", 60), "No heat please");
row("'my number is' + number removed", T.cleanField("Furnace out; my number is 3605555874", 60), "Furnace out");
row("'call me at' with no number kept", T.cleanField("Wants Dave to call me at lunch", 60), "Wants Dave to call me at lunch");
const BOB = { name: "Bob Bobba Ganoush", nameConfidence: "medium", issue: "Cat up a tree scratching dog; wants call back", urgency: "normal", city: "Poulsbo" };
row("Bob fallback: no '; wants.'", T.callerText(BOB, "coverage"),
  HI("Bob") + " We passed your message along to Dave: Cat up a tree scratching dog." + NEXT + CHANGES);
row("'wants a call back' fallback", T.callerText({ name: "Dan", issue: "Toilet overflowing; wants a call back" }, "coverage"),
  HI("Dan") + " We passed your message along to Dave: Toilet overflowing." + NEXT + CHANGES);
row("only a callback request", T.callerText({ name: "Sam", issue: "Wants Dave to call back" }, "coverage"),
  HI("Sam") + " We passed your message along to Dave." + NEXT + CHANGES);
["Cat up a tree; wants Dave to call back", "No heat; would like a callback", "AC out, wants a call back from Dave", "Furnace; asks for a call back"]
  .forEach((i) => row("dropCallbackClauses " + JSON.stringify(i), T.dropCallbackClauses(i), i.split(/[;,]/)[0]));
row("a clause with content is kept", T.dropCallbackClauses("Needs a call about the furnace noise"), "Needs a call about the furnace noise");

console.log("\nCaller text: caller_summary, off-topic, last lines, first name");
row("Bob with caller_summary (PROPOSAL example 1)", T.callerText(Object.assign({}, BOB, { callerSummary: "your cat stuck up a tree and scratching your dog", offTopic: true }), "coverage"),
  "Hi Bob, thanks for calling Harborline Heating & Air. We passed your message about your cat stuck up a tree and scratching your dog along to Dave. Heating and air is what we do, but he'll call you back as soon as he's off the job.");
row("Maria furnace (PROPOSAL example 2)", T.callerText({ name: "Maria Lopez", nameConfidence: "high", issue: "Furnace running but blowing cold air since this morning", urgency: "normal",
  callerSummary: "your furnace blowing cold air since this morning" }, "coverage"),
  "Hi Maria, thanks for calling Harborline Heating & Air. We passed your message about your furnace blowing cold air since this morning along to Dave. He'll call you back as soon as he's off the job. If anything changes before then, just give us a call.");
row("Dan plumbing emergency (PROPOSAL example 3)", T.callerText({ name: "Dan Reyes", nameConfidence: "high", issue: "Toilet overflowing upstairs, water on floor; wants a call back", urgency: "emergency",
  callerSummary: "your upstairs toilet overflowing", offTopic: true }, "coverage"),
  "Hi Dan, thanks for calling Harborline Heating & Air. We passed your message about your upstairs toilet overflowing along to Dave. Heating and air is what we do, but he'll call you back as soon as he's off the job. If it can't wait, a pro who can come out now is your best bet.");
row("emergency + gas words", T.callerText({ name: "Ann", issue: "Smells gas near the furnace", urgency: "emergency", callerSummary: "a gas smell near your furnace" }, "coverage"),
  HI("Ann") + " We passed your message about a gas smell near your furnace along to Dave." + NEXT + " If you smell gas or a CO alarm is going off, leave the house now and call 911.");
row("emergency, other", T.callerText({ name: "Ann", issue: "Water pouring from the attic air handler", urgency: "emergency" }, "coverage"),
  HI("Ann") + " We passed your message along to Dave: Water pouring from the attic air handler." + NEXT + " If anyone is in danger, call 911.");
row("off_topic is ignored without a caller_summary", T.callerText({ name: "Ann", issue: "Sink leak", offTopic: true }, "coverage"),
  HI("Ann") + " We passed your message along to Dave: Sink leak." + NEXT + CHANGES);
row("low name confidence -> Hi there", T.callerText({ name: "Bawb", nameConfidence: "low", issue: "AC not cooling; wants Dave to call back" }, "coverage"),
  HI("there") + " We passed your message along to Dave: AC not cooling." + NEXT + CHANGES);
row("first name used once", String((T.callerText(BOB, "coverage").match(/Bob/g) || []).length), "1");
row("caller_summary with a number is ignored", T.callerText({ name: "Sam", issue: "No heat", callerSummary: "your furnace, call 360 555 5874" }, "coverage"),
  HI("Sam") + " We passed your message along to Dave: No heat." + NEXT + CHANGES);
row("caller_summary with a claim is ignored", T.callerText({ name: "Sam", issue: "No heat", callerSummary: "your furnace, a tech is on the way" }, "coverage"),
  HI("Sam") + " We passed your message along to Dave: No heat." + NEXT + CHANGES);
row("curly quotes / dashes become plain", T.callerText({ name: "Sam", issue: "Furnace \u201cclunks\u201d \u2014 won\u2019t start\u2026" }, "coverage"),
  HI("Sam") + " We passed your message along to Dave: Furnace \"clunks\" - won't start." + NEXT + CHANGES);
row("emoji dropped (stays GSM-7)", String(T.isGsm(T.callerText({ name: "Sam", issue: "AC dead \ud83d\ude29 so hot" }, "coverage"))), "true");
const longIssue = "Furnace short-cycles every ten minutes since the filter change last week and the upstairs vents blow cold air all night long";
const lt = T.callerText({ name: "Maximiliana", issue: longIssue, window: "tomorrow morning, between 8 and 10" }, "intake");
row("long issue: fragment cut at a whole word, no ellipsis", String(/\u2026|\.\.\./.test(lt) || !/: Furnace short-cycles every ten minutes since the filter change last week and the\./.test(lt)), "false");
let maxLen = 0, allGsm = true;
for (const pkg of ["coverage", "intake", "estimate"]) for (const urgency of ["normal", "emergency"]) for (const offTopic of [false, true]) {
  const t = T.callerText({ name: "Maximiliana-Josephine Q", issue: longIssue + " gas smell", urgency, window: "x".repeat(60) + " y", appointment: "Thursday afternoon, between one and three or so",
    callerSummary: offTopic ? "your " + "z".repeat(70) : undefined, offTopic }, pkg);
  maxLen = Math.max(maxLen, t.length); allGsm = allGsm && T.isGsm(t);
}
row("worst cases stay <= 306 chars", String(maxLen <= 306), "true");
row("worst cases stay GSM-7", String(allGsm), "true");
for (const t of [T.callerText(BOB, "coverage"), T.callerText({ name: "x", issue: "booked, tech dispatched, call me at 3605555874" }, "intake")])
  row("never a number / claim", String(/[0-9]{3,}|book|schedul|tech|on (?:his|the) way|en route/i.test(t)), "false");

console.log("\nDave's text: trailing callback clause dropped");
row("Bob's issue", T.daveIssue("Cat up a tree scratching dog; wants call back"), "Cat up a tree scratching dog");
row("'wants a call back'", T.daveIssue("Toilet overflowing; wants a call back"), "Toilet overflowing");
row("only a callback request stays", T.daveIssue("Wants Dave to call back"), "Wants Dave to call back");
row("other details kept in full", T.daveIssue("Technician dispatched yesterday but no one came"), "Technician dispatched yesterday but no one came");
row("phones still scrubbed", T.daveIssue("No heat, call 206\u2011555\u20110123; wants call back"), "No heat, call");

const long = T.cleanField("a".repeat(200), 60);
row("long unbroken field capped at 60, no ellipsis", String(long.length) + (/\u2026/.test(long) ? "+ellipsis" : ""), "60");
row("long field cut at a whole word", T.cleanField("Furnace short-cycles every ten minutes since the filter change", 30), "Furnace short-cycles every ten");

console.log(fail ? "\n" + fail + " failing" : "\nall passed");
process.exitCode = fail ? 1 : 0;
