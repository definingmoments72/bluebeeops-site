#!/usr/bin/env python3
"""Generates public/index.html, sms-consent.html, privacy.html, terms.html from shared sections.
Static assets on Workers serve /privacy -> privacy.html (html_handling: auto-trailing-slash).
Run: python3 tools/build_pages.py"""
import os
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public")
UPDATED = "October 6, 2026"
EMAIL = '<a href="mailto:definingmoments72@gmail.com">definingmoments72@gmail.com</a>'
# Public business email. Shown on the home page header/footer only. The /sms-consent, /privacy and
# /terms pages (and the matching policy sections) keep EMAIL until the A2P campaign review is finished.
BIZ_EMAIL = '<a href="mailto:jase@bluebeeops.com">jase@bluebeeops.com</a>'
PROGRAM = "Jase Nations call-message confirmations"
SCRIPT = ("Would you like one text confirming your message reached Jase Nations? It comes from this number, "
          "206-855-3743. It's optional. Msg and data rates may apply. Reply STOP to opt out or HELP for help. "
          "Terms and privacy are at bluebeeops.com. Is that okay?")
CLAUSE = ("No mobile information will be shared with third parties or affiliates for marketing or promotional purposes. "
          "Text messaging originator opt-in data and consent will not be shared with any third parties.")
SAMPLE1 = ("Jase Nations (Blue Bee Ops): Hi [first name], your message was passed to Jase. He'll get back to you "
           "[timeframe]. Msg &amp; data rates may apply. Reply HELP for help, STOP to opt out.")
SAMPLE2 = ("Jase Nations (Blue Bee Ops): Confirming we received your message for Jase at [time] on [date]. "
           "No further texts will be sent. Reply HELP for help or STOP to opt out.")

STYLE = """
    :root { --text:#1a1a1a; --muted:#555; --border:#e2e2e2; --bg:#fafafa; --accent:#1a5f7a; --script-bg:#f0f7fa; }
    * { box-sizing: border-box; }
    body { margin:0; font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; line-height:1.55; color:var(--text); background:#fff; }
    header { background:var(--bg); border-bottom:1px solid var(--border); padding:1.75rem 1.25rem; }
    .wrap { max-width:42rem; margin:0 auto; }
    main { max-width:42rem; margin:0 auto; padding:1.5rem 1.25rem 3rem; }
    h1 { margin:0 0 0.35rem; font-size:1.65rem; font-weight:700; color:var(--accent); }
    h2 { margin:2.25rem 0 0.75rem; font-size:1.2rem; font-weight:650; padding-top:0.5rem; border-top:1px solid var(--border); }
    h2:first-of-type { border-top:none; padding-top:0; }
    h3 { font-size:1rem; margin:1.5rem 0 0.5rem; }
    .lede { color:var(--muted); margin:0.25rem 0 0; }
    .phone { font-weight:600; }
    nav { margin-top:1rem; font-size:0.9rem; }
    nav a { color:var(--accent); margin-right:1rem; text-decoration:none; }
    nav a:hover { text-decoration:underline; }
    .script { background:var(--script-bg); border-left:4px solid var(--accent); padding:1rem 1.1rem; margin:1rem 0; font-size:1.05rem; }
    .script strong { display:block; margin-bottom:0.4rem; font-size:0.8rem; text-transform:uppercase; letter-spacing:0.04em; color:var(--muted); }
    .convo p { margin:0.4rem 0; }
    ul { padding-left:1.25rem; } li { margin:0.35rem 0; }
    footer { max-width:42rem; margin:0 auto; padding:0 1.25rem 2.5rem; font-size:0.85rem; color:var(--muted); }
    a { color:var(--accent); }
"""

def page(title, desc, body, home=False):
    email_line = f'\n      <p class="lede phone">Email: {BIZ_EMAIL}</p>' if home else ""
    footer_email = BIZ_EMAIL if home else EMAIL
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title}</title>
  <meta name="description" content="{desc}">
  <style>{STYLE}  </style>
</head>
<body>
  <header>
    <div class="wrap">
      <h1>Jase Nations (Blue Bee Ops)</h1>
      <p class="lede">AI call assistant for <strong>Jase Nations</strong>, sole proprietor (doing business as Blue Bee Ops), Washington</p>
      <p class="lede phone">Phone: <a href="tel:+12068553743">+1 206-855-3743</a></p>{email_line}
      <nav aria-label="Pages">
        <a href="/">Home</a>
        <a href="/sms-consent">SMS Consent</a>
        <a href="/privacy">Privacy Policy</a>
        <a href="/terms">SMS Terms</a>
      </nav>
    </div>
  </header>

  <main>
{body}
  </main>

  <footer>
    <p>Jase Nations (Blue Bee Ops) · sole proprietor · Washington · +1 206-855-3743 · {footer_email}</p>
    <p><a href="/sms-consent">SMS Consent</a> · <a href="/privacy">Privacy Policy</a> · <a href="/terms">SMS Terms</a></p>
    <p>Last updated: {UPDATED}</p>
  </footer>
</body>
</html>
"""

ABOUT = f"""    <section id="about" aria-labelledby="about-heading">
      <h2 id="about-heading">About</h2>
      <p>
        Jase Nations is a sole proprietor in Washington doing business as Blue Bee Ops.
        An AI call assistant answers calls to <strong>+1 206-855-3743</strong> when Jase can't pick up and takes messages for him.
        It is not used for marketing.
      </p>
      <p>
        Texting program: <strong>{PROGRAM}</strong>. After taking a message, the assistant asks the caller whether
        they'd like <strong>one text</strong> confirming their message reached Jase. A text is sent only if the caller says yes.
      </p>
    </section>
"""

def consent(hid):
    return f"""    <section id="sms-consent" aria-labelledby="{hid}">
      <h2 id="{hid}">SMS Consent ({PROGRAM})</h2>
      <p>
        There is one way to opt in: <strong>verbally, on a phone call</strong> to Jase Nations' business line,
        <strong>+1 206-855-3743</strong>. An AI call assistant answers and takes the caller's message.
        Only after the message is taken does the assistant ask this exact question:
      </p>
      <div class="script" role="note">
        <strong>Exact verbal consent script</strong>
        “{SCRIPT}”
      </div>
      <ul>
        <li><strong>A text is sent only if the caller clearly says yes.</strong> If they say no or don't answer, no text is sent.</li>
        <li><strong>Optional:</strong> agreeing to the text is not required to leave a message.</li>
        <li><strong>Frequency:</strong> one confirmation text per call in which the caller says yes. No recurring or marketing messages.</li>
        <li><strong>Rates:</strong> message and data rates may apply.</li>
        <li><strong>Help / opt-out:</strong> reply <strong>HELP</strong> for help or <strong>STOP</strong> to opt out at any time. Help is also available at {EMAIL}.</li>
        <li><strong>Sender:</strong> texts come from +1 206-855-3743 and are identified as “Jase Nations (Blue Bee Ops)”.</li>
      </ul>
      <h3>Sample conversation</h3>
      <div class="convo">
        <p><strong>Assistant:</strong> “Hi there! This is the assistant for Jase Nations. This call may be recorded. He's unavailable right now. May I ask who's calling?”</p>
        <p><strong>Caller:</strong> “This is Bob. I'm calling about a window cleaning estimate.”</p>
        <p><strong>Assistant:</strong> “Thanks, Bob! What's the best number for Jase to reach you?”</p>
        <p><strong>Caller:</strong> “[callback number].”</p>
        <p><strong>Assistant:</strong> “{SCRIPT}”</p>
        <p><strong>Caller:</strong> “Yes.”</p>
        <p><strong>Assistant:</strong> “Thanks, I've noted that. I'll let Jase know you called about the window cleaning estimate. He'll get back to you as soon as he can. Have a great day!”</p>
      </div>
      <h3>Confirmation text the caller receives</h3>
      <p><em>“{SAMPLE1}”</em></p>
      <h3>How consent is recorded</h3>
      <p>
        Every call starts with a notice that the call may be recorded. The call recording, transcript, date and time,
        the caller's phone number, and the caller's answer to the consent question are kept in the call log as the record of consent.
      </p>
      <p><strong>{CLAUSE}</strong> See the <a href="/privacy">Privacy Policy</a> and <a href="/terms">SMS Terms</a>.</p>
    </section>
"""

def privacy(hid):
    return f"""    <section id="privacy" aria-labelledby="{hid}">
      <h2 id="{hid}">Privacy Policy</h2>
      <p><strong>{CLAUSE}</strong></p>
      <p>We do not sell, rent, or share your phone number or personal information with anyone for their marketing.</p>
      <p>What we collect and why:</p>
      <ul>
        <li><strong>Call information</strong>: caller ID, the callback number you give, and the message you leave, so Jase can follow up.</li>
        <li><strong>Call recordings and transcripts</strong>: calls may be recorded (announced at the start of every call) for message-taking, quality, and as the record of any texting consent.</li>
        <li><strong>SMS</strong>: used only for the {PROGRAM} program, which sends one confirmation text to callers who say yes on the call.</li>
        <li><strong>Frequency</strong>: one text per call in which the caller says yes.</li>
        <li><strong>Rates</strong>: message and data rates may apply from your carrier.</li>
        <li><strong>Opt-out</strong>: reply STOP to any text to stop receiving texts; reply HELP for help.</li>
      </ul>
      <p>
        Questions about this policy or your data: email {EMAIL}.
        See also the <a href="/terms">SMS Terms</a>.
      </p>
    </section>
"""

def terms(hid):
    return f"""    <section id="sms-terms" aria-labelledby="{hid}">
      <h2 id="{hid}">SMS Terms ({PROGRAM})</h2>
      <ul>
        <li><strong>Program:</strong> {PROGRAM}, sent by Jase Nations (sole proprietor, doing business as Blue Bee Ops) from +1 206-855-3743.</li>
        <li><strong>What you get:</strong> one text confirming that your phone message reached Jase. It is sent only if you say yes when the assistant asks on the call.</li>
        <li><strong>Optional:</strong> saying yes is not required to leave a message.</li>
        <li><strong>Frequency:</strong> one text per call in which you say yes. No recurring or marketing messages.</li>
        <li><strong>Rates:</strong> message and data rates may apply.</li>
        <li><strong>Opt-out:</strong> reply <strong>STOP</strong> to any text to opt out. You'll get one confirmation of the opt-out, and no further texts will be sent unless you opt in again on a future call.</li>
        <li><strong>Help:</strong> reply <strong>HELP</strong> for help, or email {EMAIL}.</li>
        <li>Carriers are not liable for delayed or undelivered messages.</li>
        <li><strong>Privacy:</strong> see our <a href="/privacy">Privacy Policy</a>. {CLAUSE}</li>
      </ul>
    </section>
"""

RECORDING = """    <section id="recording" aria-labelledby="recording-heading">
      <h2 id="recording-heading">Call Recording Notice (Washington)</h2>
      <p>
        Calls to +1 206-855-3743 <strong>may be recorded</strong> for message-taking, quality, and consent records.
        Washington is a two-party consent state. The assistant announces recording at the
        start of every call so you can choose whether to continue.
      </p>
    </section>
"""

pages = {
    "index.html": page("Jase Nations (Blue Bee Ops): SMS Consent, Privacy &amp; Terms",
                       "Jase Nations (Blue Bee Ops) AI call assistant (+1 206-855-3743): SMS consent script, privacy policy, and SMS terms.",
                       ABOUT + consent("consent-heading") + privacy("privacy-heading") + terms("terms-heading") + RECORDING,
                       home=True),
    "sms-consent.html": page("SMS Consent | Jase Nations (Blue Bee Ops)",
                             "How callers opt in to one confirmation text from Jase Nations (Blue Bee Ops), +1 206-855-3743.",
                             consent("consent-heading") + RECORDING),
    "privacy.html": page("Privacy Policy | Jase Nations (Blue Bee Ops)",
                         "Privacy policy for Jase Nations (Blue Bee Ops) call assistant and texts.",
                         privacy("privacy-heading")),
    "terms.html": page("SMS Terms | Jase Nations (Blue Bee Ops)",
                       "SMS terms for the Jase Nations call-message confirmations program.",
                       terms("terms-heading")),
}
for name, html in pages.items():
    with open(os.path.join(OUT, name), "w") as f:
        f.write(html)
print("wrote", ", ".join(pages))
