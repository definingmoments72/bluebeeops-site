# Harborline demo: polished narrator script (wrap-up and setup add)

Spoken lines for the male narrator (unnamed) in the Harborline Heating and Air phone demo, plus the per-package caller-text sentences. Everything here is meant to be read aloud by text-to-speech. Slots in square brackets are filled from what was actually captured on the call. Lines marked ⚑ use a callback timing our documents don't state, so they need Jase's OK before use.

---

## 1. Full script, in call order

### Setup add (goes into the steps 3 and 4 reply, right before "Are you ready to start the live demo?")

> And here's the fun part. This whole call, me included, is a live demo of the receptionist we build for shops. Nothing you'll hear is pre-recorded.

The full steps 3 and 4 reply then reads:

> Perfect. Notice how the page shows what Dave, the shop owner, sees during the call, plus the texts both Dave and the caller get once it's over. Here's how it works. In a moment, a different voice will answer the phone for a made-up shop, Harborline Heating and Air. Feel free to play a homeowner with a heating or cooling problem, and just talk like you would with any shop. As you talk, the page will show a preview of the text Dave, the owner, would get. And here's the fun part. This whole call, me included, is a live demo of the receptionist we build for shops. Nothing you'll hear is pre-recorded. Are you ready to start the live demo?

Handoff (unchanged): "Alright, from here on it's live."

### Shop close (receptionist, unchanged)

> I'll pass this along to Dave, and he'll call you back.

Suggested handback (build note, not a spoken line): leave a short beat, about one second, after the receptionist's close before the narrator speaks. The change of voice plus the return line below does the handback on its own, so the receptionist doesn't need to add anything, and there's still no goodbye from her.

### Return [line 3]

> And that's the end of the live part. Nicely done. Now I'd love to show you what was happening behind the scenes while you were talking.

### Recap [line 4]

Template:

> If you could, take a look back at your screen for a moment. While you were talking, Dave got a text with your name, [issue], [city], and [urgency]. There's even a short note that [mood], so he knows how you're feeling before he calls.

Filled example:

> If you could, take a look back at your screen for a moment. While you were talking, Dave got a text with your name, the furnace that's clicking but won't light, that you're in Silverdale, and that it's urgent. There's even a short note that you sounded a bit stressed, so he knows how you're feeling before he calls.

Slot values:

- [issue]: short issue phrase, for example "the furnace that's clicking but won't light".
- [city]: "that you're in Silverdale", or leave it out.
- [urgency]: "that it's urgent" or "that it can wait for a regular visit", or leave it out.
- [mood]: "you sounded a bit stressed", or leave out the whole mood sentence.
- [window or time] (Intake and Estimate Request only, once they're live): "and the estimate window you picked" goes after [issue]. Don't use this in the Coverage demo.

Rules when a slot is missing:

- **Joining the list.** Keep only the slots that were captured, and put "and" before the last one. Two items: "your name and the furnace that's clicking but won't light." One item: "your name."
- **No mood captured.** Drop the whole mood sentence. Don't swap in a guess.
- **Caller wouldn't give a name.** Don't mention the name at all. Use: "While you were talking, Dave got a text with [issue] and [urgency], plus the number to reach you on." Never say the number itself.
- **Short or message-only call** (little more than a quick message): "While you were talking, Dave got a text with your name and the message you left, so he knows what it's about before he calls." Drop the mood sentence unless it was captured.
- **Off-topic call** (for example, a plumbing problem at a heating and air shop): describe it plainly and don't comment on the mismatch. "While you were talking, Dave got a text with your name and the leak under the kitchen sink. Even when a call isn't quite his line of work, he still knows who called and why."
- **Nothing usable captured:** "If you could, take a look back at your screen for a moment. That's where Dave's text shows up, with who called and what they need, so he's ready before he calls back."
- Never say the caller's name, even if it was captured. It's always "your name".

### Caller text [line 5, Coverage demo]

> And on a real call, the shop's receptionist would offer to send you a quick text. It lets you know your message made it to Dave, with a rough idea of when he'll call you back. It's a small thing, but it means you're not left wondering.

### Junk calls [line 6]

> Something you won't see on the page is the calls that never reach Dave. Robocalls and sales pitches get screened out, so his phone isn't buzzing for those.

### Put-through [line 7]

> And for the people who matter most, like family or his best customers, Dave can pick them ahead of time, and they get put right through.

### Questions invite [line 8a]

> I'd love to answer any questions you have about how it all works, if you've got any.

### Can't-answer line [line 8b]

> Honestly, I don't have a clear enough answer on that, and I'd rather not guess. If you'd like, I can take your question down and pass it along to the Blue Bee Ops team, and someone will call you back. Would that help?

If they say yes, the follow-up is: "Sure thing. Go ahead whenever you're ready, and I'll take it down." Then: "Thank you. I'll make sure the team sees it." (Worded so it doesn't echo the "Thanks, got it." used after the name ask.)

### Repeat-caller invite and name ask [line 9]

> Feel free to call back anytime, and you'll hear how the shop's receptionist handles someone who's called before. If you think you might, could I get your name? That way she'll have it when you call.

If they give a name (never repeat it back):

> Thanks, got it.

If they decline or hesitate:

> No problem at all.

### Goodbye (the only goodbye on the call)

> Thanks so much for trying it. Take care, and have a great day.

---

## 2. Alternates

Use these to vary across calls, so repeat callers don't hear the exact same phrasing.

### Return

1. "And that's where the live part ends. You did great. Now let me show you what was going on behind the scenes while you were talking."
2. "And that wraps up the live part. Thanks for playing along. I'd love to show you what was happening on Dave's side while you were talking."

### Caller text (Coverage demo)

1. "On a real call, she'd also offer to text you a quick note, just to let you know your message got to Dave, and about when you can expect to hear from him. That way you're not sitting by the phone wondering."
2. "And on a real call, the shop's receptionist would offer you a short text of your own. It confirms your message reached Dave, and gives you a rough sense of when he'll be calling back. It's a nice bit of peace of mind."

Note: alternate 1 uses "she'd". It works because it follows the recap, but if it ever plays right after the return line, use "the shop's receptionist" instead so it's clear who "she" is.

### Repeat-caller invite and name ask

1. "If you'd like, feel free to call back sometime and hear how the shop's receptionist treats a caller she's talked to before. If you're thinking of doing that, would you mind sharing your name? I'll make sure she has it."
2. "One more thing you might enjoy: if you call back later, you'll hear how the shop's receptionist handles a returning caller. If you plan to try that, could I get your name for her?"

Follow-up variants (never repeat the name):

- Name given: "Thanks, got it." / "Thank you, that's saved." / "Lovely, thank you."
- Declined: "No problem at all." / "That's totally fine." / "No worries at all."

### Goodbye

1. "Thanks so much for giving it a try. Take care, and enjoy the rest of your day."
2. "Thanks again for calling in and trying it out. Take good care, and have a wonderful day."

---

## 3. Caller-text sentences per package

Plain text, no emoji, each under 160 characters. These are what the caller would get on a real line. Nothing is sent from the demo.

| Package | Sentence | Characters | Timing |
| --- | --- | --- | --- |
| Coverage, during shop hours | Thanks for calling Harborline Heating and Air. Your message is with Dave, and he'll call you back as soon as he's off the job. | 126 | Grounded |
| Coverage, during shop hours (softer timing) | Thanks for calling Harborline Heating and Air. Your message is with Dave, and he'll usually call you back within a couple of hours. | 131 | ⚑ needs Jase's OK |
| Coverage, after hours (weeknights) | Thanks for calling Harborline Heating and Air. Your message is with Dave, and he'll give you a call back first thing in the morning. | 132 | ⚑ needs Jase's OK |
| Coverage, after hours (Friday nights and weekends) | Thanks for calling Harborline Heating and Air. Your message is with Dave, and he'll give you a call back first thing Monday morning. | 132 | ⚑ needs Jase's OK |
| Intake (coming soon) | Thanks for calling Harborline. You asked for [window] for an estimate, and Dave will give you a call to confirm the time. | 113 plus window | Grounded |
| Intake, with timing (coming soon) | Thanks for calling Harborline. You asked for [window] for an estimate, and Dave will usually call later today to confirm the time. | 122 plus window | ⚑ needs Jase's OK |
| Estimate Request (coming soon) | Thanks for calling Harborline. You're down for an estimate [time], and Dave will reach out ahead of time to confirm. | 110 plus time | Grounded |
| Estimate Request, urgent (coming soon) | Thanks for calling Harborline. Your call is marked urgent, so Dave's been flagged right away, and he'll reach out as soon as he can. | 132 | Grounded |

Notes:

- The urgent Estimate Request text never says the call was put through, since the demo can't transfer.
- Keep [window] and [time] short (for example "Tuesday morning" or "Thursday at ten"), so the Intake and Estimate Request sentences stay under 160 characters.
- The after-hours lines come from the demo shop's Monday to Friday, eight to five hours. A real client's text would follow that client's own hours.

---

## 4. Wrap-up length (return through put-through, before the questions invite)

Measured with the filled recap example from section 1 (name, issue, city, urgency and mood all captured):

| Line | Words |
| --- | --- |
| Return | 26 |
| Recap (filled example) | 59 |
| Caller text | 47 |
| Junk calls | 28 |
| Put-through | 26 |
| **Total** | **186** |

At a relaxed spoken pace of about 150 words a minute, that's about 74 seconds, at the top of the 60 to 75 second target. A call with fewer captured slots (no city or no mood) comes in around 160 to 170 words, about 64 to 68 seconds. If the full version runs long in the actual voice, the easiest trim is the last sentence of the caller-text line ("It's a small thing, but it means you're not left wondering."), which saves 11 words, about 4 seconds.

---

## 5. Rules bent

None. A few things to flag for the build, none of which break a rule:

- **Recap pause.** The recap asks the caller to look back at the screen but doesn't wait for a confirmation. Rule 8 covers setup steps, and the caller is already on the demo page by then, so a pause felt like it would break the flow. If you'd rather have one, add "Let me know when you've got it in front of you." after the first sentence.
- **Put-through and Coverage.** Section 1 of the brief doesn't list put-through as a Coverage feature, but Jase confirmed every package will have it, so the line stays as approved.
- **"Nothing you'll hear is pre-recorded."** This is kept from Jase's approved line. It's only true as long as no part of the call, including the recording notice, plays from an audio file. Worth checking against the build.
- **The name ask follow-up.** "That way she'll have it when you call" is as far as it goes. It doesn't promise she'll greet them by name, since that depends on how confidently the name was captured.
