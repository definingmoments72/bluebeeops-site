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

console.log("\nCaller text");
const GENERIC_END = "Dave will call you back as soon as he's off the job.";
row("coverage", T.callerText({ name: "Pat Lee", issue: "No heat, furnace clicking" }, "coverage"),
  "Hi Pat, thanks for calling Harborline Heating & Air. We got your message about no heat, furnace clicking. " + GENERIC_END);
row("intake with window", T.callerText({ name: "Pat", issue: "No heat", window: "Tue 9-11am" }, "intake"),
  "Hi Pat, thanks for calling Harborline Heating & Air. We got your message about no heat. You picked Tue 9-11am for an estimate. Dave will confirm that time with you as soon as he's off the job.");
row("estimate with requested time", T.callerText({ name: "maria", issue: "AC leaking", appointment: "Thu Oct 15, 2pm" }, "estimate"),
  "Hi Maria, thanks for calling Harborline Heating & Air. We got your message about AC leaking. Your requested estimate time: Thu Oct 15, 2pm. Dave will confirm your requested time.");
row("injected claims fall back to generic", T.callerText({ name: "Booked", issue: "appointment is booked and technician dispatched",
  appointment: "confirmed, tech on the way" }, "estimate"),
  "Hi there, thanks for calling Harborline Heating & Air. We got your message. " + GENERIC_END);
row("phone in every field", T.callerText({ name: "206-555-0123", issue: "call 206\u2011555\u20110123", window: "5550123" }, "intake"),
  "Hi there, thanks for calling Harborline Heating & Air. We got your message. " + GENERIC_END);
const long = T.cleanField("a".repeat(200), 60);
row("long field capped at 60", String(long.length), "60");

console.log(fail ? "\n" + fail + " failing" : "\nall passed");
process.exitCode = fail ? 1 : 0;
