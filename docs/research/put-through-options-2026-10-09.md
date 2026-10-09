# Putting urgent calls through without Google Voice

Research date: 9 October 2026. Research only. No site code was changed.

This memo is for the setup where a shop owner's cell forwards every call to the Blue Bee Ops agent (Vapi on Twilio), and the agent then needs to reach the owner live for an urgent call. The public site still describes forwarding missed and after-hours calls. That is a different product, and it is called out below where it matters.

## The answer

**Use a text the owner taps, which places an ordinary outbound call from the cell they already have.** That removes Google Voice completely. Beyond the one-time forwarding code the owner already has to dial, there is no extra app, no second number, and no extra voicemail.

The owner cannot get a normal inbound ring on that same cell while "forward all" is on. Verizon says the mobile phone will not ring. The mobile-network spec says those calls are forwarded without being offered to the phone. A call from our Twilio number is still an incoming call, so it takes the same path and comes back to the agent.

**Runner-up, when a real ring on the job site matters more than zero setup:** a second voice line on the same iPhone (eSIM), answered in the Phone app they already use. The owner has to approve that line. A data-only eSIM does not do this job.

**Google Voice should not be the fallback.** It is another app, another alert stream, and another voicemail box, and its ring loses a race with Twilio's default dial timer. Shops already on it can stay there only until the text path is on. Do not offer it to a new shop.

## What "zero setup" can and cannot mean

Call forwarding on the cell is a carrier feature. AT&T (page updated 2 April 2025) and Verizon both say it can be changed only from the wireless phone, not from a website. Blue Bee cannot flip it remotely. The one dial code on the setup call stays.

After that code is on, anything that tries to **ring that same number** loops. The ways to reach the owner are:

1. They call out. Forwarding does not touch outbound calls.
2. We ring some other number that is not forwarded (a shop line they already have, or a new line on the phone).
3. We ring an app on the phone. That app has to be installed and allowed to notify them.

(1) is the only path with no added setup. (2) and (3) are how you get a ring.

## Ranked by how close they get to zero client setup

| Rank | Option | Removes Google Voice? | Minimum unavoidable client step | Extra apps |
| --- | --- | --- | --- | --- |
| 1 | Text, then the owner taps to call out | Yes | None at setup. On an urgent call they must see the text and tap it to call. | None |
| 2 | A number they already have that is not forwarded (shop landline, home line, a phone that is with them) | Yes | Say that number on the setup call. | None |
| 3 | Forward only when busy, unanswered, or unreachable, and stop transferring back to the cell | Yes | Dial the conditional code and cancel forward-all. | None |
| 4 | Second voice line on the same iPhone (eSIM or a line added to their current carrier) | Yes | Approve the new line on the phone (and unlock the iPhone if the line is a different carrier). | None. It rings in Phone. |
| 5 | A Blue Bee iPhone app using Twilio Voice, PushKit, and CallKit | Yes | Install the app, allow notifications, and sign in. We would have to build it. | One, ours |
| 6 | Quo (formerly OpenPhone), Dialpad, Grasshopper, a SIP app, or T-Mobile DIGITS Talk & Text | Yes, if they stop using Google Voice | Create an account, install that app, and allow its notifications. | One, someone else's |
| 7 | Keep Google Voice | No | Keep the Google Voice app, its alerts, and its voicemail. | Google Voice |

iPhone Focus plus "forward on no answer" is a variant of rank 3 with more steps (build a Focus that lets our number through). It is not close to zero setup. A home-screen web app is worse than the text: they must add the site to the Home Screen and allow notifications, and it still cannot show the iPhone call screen.

## Ratings

Ease, reliability, iPhone fit, and loop risk are judgments from the sources below, not measurements from a Blue Bee test call. Cost is cited only where a provider page stated a figure.

| Option | Client ease | Reliability | Cost | iPhone fit | Loop risk |
| --- | --- | --- | --- | --- | --- |
| Text, tap to call out | Best. No install. | Good if they see the text. Weaker than a ring on a loud job. | One text plus their outbound call. Twilio's current rates were not pulled. | Uses Messages and Phone, which they already have. | None, as long as we do not also dial the cell. |
| Existing other number | Best when they have one. | High if that phone is with them. Low if it sits at an empty shop. | None from us beyond the transfer. | Native ring if it is a phone they carry. | None if that number is not forwarded to us. |
| Conditional forward only | One code change. | High for "missed calls." It does not screen-then-ring. | Carrier forwarding. Verizon: no monthly fee on most plans. | Native. | High if we then dial the cell and they do not answer, are on a call, or have no signal. |
| Second voice eSIM | Several steps, once. | Best ring. Cellular voice, no app in the background. | Tello lists an introductory $10/month new-customer price for 2 GB with unlimited talk and text. Renewal price was not readable. Carrier add-a-line prices were not pulled. | Native Phone app on iPhone XS or later. | None if that line is not forwarded. |
| Our own CallKit app | App Store install plus notification permission. | High on Wi-Fi or data when the app is built correctly. Weak in a dead zone. | Build and Apple developer costs were not priced. Voice minutes are Twilio. | CallKit can look like a normal call. | None. We ring the app, not the cell. |
| Quo, Dialpad, Grasshopper, SIP, DIGITS | Same class of hassle as Google Voice. | Depends on the app staying registered and on data. | DIGITS Talk & Text is $10/month with AutoPay on T-Mobile's business page. Others not priced here. | A second inbox and a second alert style. | None if the app is the target. High if that product is also set to forward to the cell. |
| Google Voice | Worst of the set we would still ship. Separate app, alerts, and voicemail. | The voicemail answers before Twilio's default dial gives up. See the timing section. | Not priced here. | Separate from Phone. | None if the Google Voice app is the only thing we ring, and Google Voice itself is not forwarding back to the cell. |

## (a) Forward-all cannot be bypassed by calling from our number

Unconditional forwarding ("forward all") is done by the carrier before the handset is involved.

- Verizon's call-forwarding FAQ: when it is on, "your mobile phone won't ring when you receive a call. The call will be sent straight to the phone number that's receiving your forwarded calls." Turn it on with `*72` plus the 10-digit number. `*71` forwards "only the calls you don't answer." `*73` turns forwarding off. Texts are not forwarded. There is no monthly fee on most plans. It can be managed only from the mobile phone. Destination must be an active US voice number.
- AT&T's wireless article (updated 2 April 2025): the designated number receives the forwarded incoming calls, the owner can still make outgoing calls, forwarding overrides wireless voicemail, and forwarding cannot be managed online.
- T-Mobile's short-code page: `**21*1` + number + `#` is unconditional forwarding and "prevents calls to your number." `##21#` turns it off.
- The 3GPP service definition, TS 22.082 (this memo used the v19.0.0 text): when unconditional forwarding is active, incoming calls "will be forwarded without being offered to the served mobile subscriber." Originating calls are unaffected. The network rejects a registration that forwards the number to itself. The spec lists no exception for calls that come from the forwarded-to number.

So a transfer from our Twilio number to the owner's cell is just another incoming call. The carrier forwards it to us again. That is the loop.

What people sometimes confuse with a bypass:

- **Selective call forwarding does the opposite.** Verizon's landline calling-features guide lets you list six or twelve numbers, and only those callers are forwarded. Everyone else rings through. It is not a "forward everyone except Blue Bee" list. T-Mobile's published short codes and AT&T's wireless article do not offer a caller exception list either.
- **A same-building phone system can override this.** Avaya IP Office documentation says an internal user on the same system can transfer back and override Forward Unconditional. Twilio calling a Verizon, AT&T, or T-Mobile cell is not that situation.
- **Outbound calls keep working.** The 3GPP text and AT&T both say the owner can still place calls. That is the opening the text-tap path uses.
- **Texts keep working, at least on Verizon.** Verizon's FAQ says call forwarding does not forward text messages. AT&T's and T-Mobile's forwarding pages do not discuss texts. The 3GPP forwarding spec is a voice service. This memo did not place a test text on AT&T or T-Mobile.

This was not lab-tested this week by calling a forwarded Verizon, AT&T, and T-Mobile line from Twilio. The conclusion follows from those carriers' descriptions and from the service definition. No consumer feature was found that lets one caller skip forward-all.

## (b) A second line on the phone

This is the cleanest way to get a real ring without an extra app.

Apple's dual-SIM article, published 17 September 2026:

- iPhone XS, XS Max, XR, or later. iPhone 13 and later can use two eSIMs.
- Both numbers can make and receive calls, in the Phone app. The owner labels them (for example Business and Personal).
- To use two carriers, the iPhone must be unlocked, or both plans must be from the same carrier.
- If they are already on a call, the other line can fail to ring unless Wi-Fi calling or Allow Cellular Data Switching is on. If they ignore the second line and voicemail is on, the call goes to voicemail. Apple also says that in one on-a-call case you do not get a missed-call notification for the secondary number.

**Data-only is the wrong product.** Apple treats a data plan and a voice plan as different things. US Mobile's plans page prices a Multi-Network add-on at $10 a month, or $90 a year, to put another network on the same phone. A secondary write-up says that add-on does not include calls or texts. US Mobile's own extracted page did not say "no voice" in those words. Do not buy a data eSIM and expect the Phone app to ring.

**Cheap voice eSIM.** Tello's eSIM page lists a "2 GB, Unlimited talk & text" plan at an introductory $10 a month for new customers, with no contract and early termination of $0. The page says the phone must be carrier-unlocked. The price after the intro period was labeled on the page and was not readable in the extract, so the ongoing price is unverified. Tello also says the owner scans a QR from their Tello account. That scan-and-confirm is the client's step. We can talk them through it. We cannot finish it on a phone we do not hold.

**Same-carrier add-a-line.** Adding a line to the owner's existing Verizon, AT&T, or T-Mobile account avoids the unlock problem, because Apple allows two plans from the same carrier on a locked phone. The monthly add-a-line price was not pulled. The owner still has to accept the eSIM on the device.

**T-Mobile DIGITS is not this.** See section (c). DIGITS Talk & Text rings inside the DIGITS app.

**Verizon Number Share and T-Mobile paired DIGITS share one number** across devices (watches, a second phone). The carrier still applies forwarding to that number. Verizon's Number Share – Home ended 1 April 2026. Number Share – Mobile remains and is the same-number product. Verizon lists $15 a month for Number Share on a wearable or Palm. That does not create an unforwarded path to the owner.

**Voicemail on the second line** can recreate the Google Voice race: if the line's voicemail answers before we give up, the transfer looks "answered" and the owner never heard it. Whether each carrier will turn voicemail off was not verified. Until that is checked with the carrier, set our dial to give up before typical voicemail, and test it.

**Minimum client step:** on the phone, approve the new cellular plan, label it, and leave forwarding off on that line. If the plan is not from their current carrier, the phone must already be unlocked.

## (c) VoIP apps, including one we would build

### Our own app (Twilio Voice SDK, CallKit)

Twilio's iOS Voice SDK receives incoming calls by a VoIP push. Apple's PushKit documentation says a VoIP app uses PushKit to wake and CallKit to show the system call screen. Twilio's docs and their iOS quickstart history say the app must report every VoIP push to CallKit immediately. If it does not, iOS stops delivering those pushes, and reinstalling the app is the recovery. Twilio also notes that a push can arrive late, after the call is already over, and the phone can chirp for a dead call.

Done right, the owner sees the same kind of incoming-call screen as a cellular call, and we simply never build a second voicemail box. The agent takes a message if they do not pick up.

**Minimum client step:** install the app from the App Store, allow notifications, and sign in. The app needs a data or Wi-Fi path. A basement with no data will not ring. We would be taking on an iPhone app, an Apple push certificate, and that PushKit failure mode.

### A web app / PWA

Safari and a Home Screen web app do not get PushKit or CallKit. A WebKit bug tracks the missing ringtone when a WebRTC call arrives while Safari is in the background; a comment on that bug treats background ringing as unavailable because the tab is suspended and autoplay is blocked. Secondary 2026 write-ups say an iOS web app can show a push notification after it is on the Home Screen (iOS 16.4 and later), and that every push must be visible. That is a banner, not the phone-call screen. It asks the owner to install something and then behaves like a weaker version of the text.

A secondary blog describes an iOS 26.4 PushKit delegate change (`mustReport`). That detail was not on the Apple PushKit page retrieved for this memo. Treat it as unverified.

**Minimum client step:** Add to Home Screen, tap to allow notifications, and keep the web app installed. Still no reliable ring. Do not use this for urgent put-through.

### Quo (formerly OpenPhone)

OpenPhone's rebrand to Quo was announced 23 September 2025. Quo's help center says the iOS app can notify for incoming calls when the app is closed, if the phone has an internet connection and notifications are on. The call is labeled as Quo, with the Quo icon, not as a normal carrier call. Quo also says iOS limits the app to two calls at once (one live, one on hold), which Quo attributes to Apple.

**Minimum client step:** create a Quo account, install Quo, and turn notifications on. Tell them not to forward the Quo number to the cell. This is another inbox. It does not beat a second carrier line or the text.

### Dialpad and Grasshopper

Dialzara's help center shows both products as systems you can forward **from**, toward an AI number. That is the inbound direction. It does not give the owner a ring that skips carrier forward-all. Using either product as the thing we transfer **to** means the owner installs that app, or the product forwards to the cell and loops. A third-party comparison describes Grasshopper as call forwarding at its core. That page is not Grasshopper's own documentation.

**Minimum client step:** an account and their app, or a forward to the cell. The second of those loops. Not a fit for the standard setup.

## (d) The owner's existing landline

If the shop has a separate line that is not forwarded to us, we transfer urgent calls there. The owner tells us the number on the setup call. No app, no Google Voice, no loop.

This fails when the owner is on a job and the phone is on the shop wall. A lot of trades shops publish the cell and have no second line. Ask on the setup call. Use it when someone is actually next to that phone. Otherwise use the text.

**Minimum client step:** tell us the number. If they have no such number, this option does not exist for them.

## (e) SIP-to-mobile apps

Acrobits (Groundwire and Acrobits Softphone) documents iOS push for incoming calls when the app is closed: turn on push for the SIP account, allow notifications, and show alerts on the lock screen. Their FAQ says push does not work if the phone system is only on a private IP. The owner would need a SIP username, password, and server, plus the app.

That is more setup than Google Voice, for the same kind of result (a second calling app). Loop risk is none if we dial the SIP endpoint. Reliability follows data coverage and whether push stays registered.

**Minimum client step:** install Groundwire or similar, type in SIP credentials, and allow notifications. Do not make this the standard path.

## (f) Forward only on busy, no answer, or unreachable

This is the product the public site describes: the owner answers when they can, and the agent gets the rest. It is one code change, and it needs no Google Voice.

It does **not** do "the agent answers every caller, then rings the owner only for urgent calls." With this setting the owner's phone is offered the customer's call first. The customer waits through the carrier's ring before the agent picks up.

Codes, from the carriers:

- Verizon: `*71` plus the number for calls they don't answer. `*73` clears forwarding. Verizon's FAQ does not say whether `*71` also covers a busy line. A secondary 2026 guide claims it covers no-answer and busy, and that Verizon does not let you set the ring length in seconds. That ring-length claim was not on Verizon's FAQ.
- T-Mobile: no-reply `**61*`, unreachable `**62*`, busy `**67*`, each with `1` + number + `#`. The no-reply delay can be set to 5, 10, 15, or up to 30 seconds, for example `**61*18056377243**10#` for 10 seconds. `##004#` resets forwarding.
- AT&T: the wireless article points owners at on-device settings and says conditional forwarding, when the carrier supports it, is something to ask the carrier about. An AT&T iPhone 17 article lists Always, When busy, When unanswered, and When unreachable. It says "after a few rings" and does not give a seconds value.

Loop risk if the agent also dials that same cell:

- **No answer.** The agent's call rings, then the carrier forwards it back to the agent. T-Mobile's timer is configurable. Twilio's `<Dial timeout>` defaults to 30 seconds, minimum 5, maximum 600, and Twilio adds about a 5-second buffer (a timeout of 10 runs closer to 15). So the practical shortest Twilio ring is about 10 seconds. A T-Mobile delay of 5 seconds would fire first and loop. A T-Mobile delay of 30 seconds, with Twilio timeout set to 20 (about 25 seconds of real ringing), is the pairing the docs suggest. It was not test-called.
- **Busy.** T-Mobile's busy forward has no delay in the short-code description. Dialing an owner who is already on the phone forwards immediately. That is an instant loop.
- **Unreachable.** Phone off, airplane mode, or no signal forwards without ringing. Dialing them from a dead zone loops.
- **Focus or Do Not Disturb.** The phone is still on the network, so "unreachable" does not apply. The call is offered, the phone stays quiet, then the no-answer timer runs. The customer hears ringing the whole time. The owner's screen fills with missed calls.

**Minimum client step:** from their phone, turn off forward-all and turn on the conditional code. For the "agent answers everyone" product, do not choose this. For the "I answer, you catch the misses" product, this is the whole design, and live transfer back to that cell should stay off.

## (g) Anything else, and what other companies do

### The text path, in operating terms

1. The customer is already on the line with the agent, because the cell forwarded to us.
2. The agent decides the call is urgent and tells the customer they are reaching the owner.
3. We hold the customer (a conference or a hold) and text the owner's cell: who is calling, why it is urgent, and a phone number to tap.
4. The owner taps that number. Their iPhone places a normal outbound call into our number, which joins the customer.
5. If they do not tap in time, the agent takes a message. We do not dial the cell.

Apple's iPhone guide warns that iPhone blocks links in messages that ask the person to turn on call forwarding, because those are a scam pattern. The urgent text has to be a normal phone number to call, not a link that changes forwarding.

The per-call tap is the whole remaining burden. A ringing phone is harder to miss under a sink or on a roof. A text can sit under Focus, a muted thread, or a full lock screen. How many taps iOS 26 needs to complete a call from Messages was not re-tested. SMS delivery time was not measured.

### Competitors

None of them publish a way to ring a cell that is unconditionally forwarded to themselves. They all end at "transfer to a number you give us" or "text the owner."

- **Smith.ai.** Their glossary defines unconditional forwarding as every call going to Smith, and the phone no longer ringing. A warm transfer means they call the recipient, the caller waits on hold, and they introduce the caller if the recipient accepts. Their warm-transfer page also offers "transfer request alerts via SMS, Slack & Microsoft Teams" so the business can say whether they are available without being rung first. Extra transfer destinations are $15 a line after the ones included on the plan. They do not describe the owner calling outbound to escape a loop. If the number they dial is the forwarded cell, they have the same loop we have.
- **Ruby.** Ruby's blog describes three transfer styles: connect without screening, screen and announce ("I have Jim on the line, do you want the call?"), or take a message. All three go to a person or a line. Ruby's answering-service page says they can send the call back to you, take a message, or send it to voicemail, and that you can use Ruby only as the backup if you do not answer. Same model. No bypass of a forwarded cell.
- **Goodcall.** Their FAQ says you choose "ring my phone first" (conditional) or "send every call" (forward-all). Escalation is a transfer to a person's number. They retry a busy line and can try up to three contacts. They say Google Voice and Ooma can forward every call only, because unanswered calls go to those products' own voicemail, so "ring my phone first" does not work there. Plans on the FAQ: Starter $79 a month, Growth $129, Scale $299, priced per unique customer rather than per minute. That pricing is Goodcall's, not a recommendation to use them.
- **Rosie (heyrosie.com).** Rosie is aimed at home-service businesses. Their pages say you forward your existing number, Rosie answers, and you are notified by email and/or text. Higher tiers add warm transfer, live transfer, and "waterfall" transfer across multiple numbers. The homepage says starting at $49 a month. The transfer target is still a phone number. A forwarded cell loops. The text notification is the same idea as our rank-1 path.
- **Dialzara.** Their transfer article (updated 12 October 2025) says: enable Transfer Calls, enter the phone number, write what the agent should say, then it dials that number. Their Google Voice article (updated 24 March 2026) has the owner link the agent as a Google Voice number, turn voicemail options off, and stay out of Do Not Disturb. Their missed-call article says to turn off visual voicemail or the carrier voicemail wins. They know about the voicemail race. They do not document a fix for a cell that forwards every call back to the agent.

### Carrier second-number apps, restated

T-Mobile DIGITS Talk & Text is a separate number whose calls, texts, and voicemail stay in the DIGITS app. T-Mobile's business page lists it at $10 a month with AutoPay. The support article says a new T-Mobile ID cannot sign into DIGITS for 24 hours, and the app wants location permission. Cellular Fallback can move a call that missed the app into the Phone dialer. T-Mobile does not say whether that fallback dials the primary cell. If it does, a primary cell that forwards to us would loop. Treat that as an open risk. Proxy by DIGITS, the free extra number, was reported discontinued for new users on 9 April 2025 (trade press, not a T-Mobile page retrieved here).

AT&T NumberSync was not found as a current product that rings a second number in the Phone app while the primary number is forwarded. Unverified.

## The Google Voice timing race

Two documented timers explain the "Twilio rings about 35 seconds, Google Voice voicemail answers first" report.

- Twilio's TwiML `<Dial>` timeout defaults to 30 seconds. Twilio "always adds a five-second timeout buffer," so a value of 10 behaves closer to 15, and a default of 30 can run closer to 35. If voicemail answers, Twilio treats the dial as answered, not as no-answer.
- An official Google help page stating a 31-second consumer Google Voice ring was not found. On Google's own Voice community forum, a long-time product expert (not a Google help article) says the ring is fixed at about 25 seconds plus network delay, and that users cannot change it. The "~31 seconds" figure is unverified. It is consistent with "about 25 seconds plus delay," and it was not measured here.
- Google Workspace ring groups are a different product. One Workspace help page discusses unanswered calls after 30 seconds. Do not apply that number to consumer Google Voice.

If a shop is still on Google Voice for a short transition, set the Twilio dial timeout so the real ring (including the buffer) ends before Google Voice takes the call, then confirm with one test call. The right timeout value was not proven on a live Google Voice line in this research.

## Recommendation

**Ship the text tap-to-call as the standard urgent path.** The owner keeps forwarding every call with the one code on the setup call. We never dial that cell for a transfer. We text it, they tap, they call out, they join the customer. Google Voice comes off the phone. There is no second voicemail and no second set of app alerts.

Say this to the owner in plain words: "Your phone can't ring for a call to your own number while every call is sent to us. We'll text you when a call is urgent. You tap the number, your phone calls us back, and you're talking to the customer. You don't install anything."

**Offer the second voice line when they tell us they will miss a text on a job.** Same Phone app, a real ring, no Google Voice. They have to accept the line once. Prefer a line on the carrier they already use so a locked iPhone still works. A Tello-style eSIM is the fallback only if the phone is unlocked, and only after someone reads the renewal price, which this memo could not.

**Use a shop landline when a person is there to answer it.** It is the least machinery of all, and it is useless in a truck.

**Do not keep Google Voice as the fallback.** It loses on setup, on clutter, and on the voicemail race. Leave it in place only for a shop that already has it, and only until the text path is tested on their phone.

## What this memo did not verify

- A live test call from Twilio into a Verizon, AT&T, or T-Mobile line that was forwarded to Twilio.
- AT&T and T-Mobile behavior for text messages while voice forwarding is on. Verizon's "texts are not forwarded" line was read on Verizon's site.
- How many taps iOS 26 needs to call a number inside Messages, and how fast those texts arrive.
- Verizon's no-answer ring length, and whether Verizon `*71` includes busy.
- Postpaid "add a line" prices for Verizon, AT&T, and T-Mobile.
- Tello's price after the introductory month.
- Whether US Mobile's Multi-Network add-on includes voice. A secondary source says it does not.
- Whether any carrier will disable voicemail on a second line.
- A current AT&T NumberSync page that would change the conclusion above.
- The iOS 26.4 PushKit `mustReport` API. It appeared in a secondary blog, not in the Apple page we retrieved.
- Twilio's current SMS and voice price list.

## Sources

- Verizon Call Forwarding FAQs: https://www.verizon.com/support/call-forwarding-faqs/
- Verizon, turn forwarding off: https://www.verizon.com/support/knowledge-base-17268/
- Verizon Number Share – Home discontinued 1 April 2026: https://www.verizon.com/support/no-longer-supported-number-share-home/
- Verizon Number Share – Mobile FAQs: https://www.verizon.com/support/numbershare-faqs/
- Verizon landline calling-features user guide (Select Call Forwarding): https://www.verizon.com/content/dam/verizon/support/consumer/documents/phone/user-guides/calling-features-user-guide.pdf
- AT&T wireless call forwarding, updated 2 April 2025: https://www.att.com/support/article/wireless/KM1011513/
- AT&T, iPhone 17 call forwarding (Always / busy / unanswered / unreachable): https://www.att.com/device-support/article/140337/apple/iphone-17/
- T-Mobile self-service short codes, including the 5-to-30-second no-reply delay: https://www.t-mobile.com/support/plans-features/self-service-short-codes
- T-Mobile DIGITS business page ($10/month Talk & Text with AutoPay; paired DIGITS shares one number): https://www.t-mobile.com/business/solutions/digits
- T-Mobile DIGITS support (calls stay in the DIGITS app; Cellular Fallback): https://www.t-mobile.com/support/plans-features/get-started-with-digits and https://www.t-mobile.com/support/plans-features/using-digits
- 3GPP TS 22.082 v19.0.0, Call Forwarding supplementary services (friendly rendering used for the quote): https://whatthespec.net/friendlyspec/spec/22.082/19.0.0
- Avaya IP Office, Forward Unconditional, internal transfer exception: https://documentation.avaya.com/en-us/home/bundle/ip-office/IPOfficeManager_12_3/configuring-ip-office/Telephone_Redirecting_Calls/Telephone_Forward_Unconditional_.html
- Apple, Using Dual SIM with an eSIM, published 17 September 2026: https://support.apple.com/en-us/109317
- Apple, set up call forwarding on iPhone, including the warning about forwarding links in messages: https://support.apple.com/guide/iphone/set-up-call-forwarding-iph7405291c4/ios
- Apple, Responding to VoIP Notifications from PushKit: https://developer.apple.com/documentation/pushkit/responding-to-voip-notifications-from-pushkit
- Twilio, TwiML `<Dial>` timeout, default 30 seconds, five-second buffer: https://www.twilio.com/docs/voice/twiml/dial
- Twilio Voice iOS SDK FAQ: https://www.twilio.com/docs/voice/sdks/ios/faq
- Twilio iOS quickstart discussion of the PushKit/CallKit rule: https://github.com/twilio/voice-quickstart-ios/issues/275
- Vapi, debug call forwarding drops (transfer mechanics, not a forwarding bypass): https://docs.vapi.ai/phone-calling/in-call-control/transfer-calls/debug-forwarding-drops.mdx
- WebKit bug 238388, no ringtone for background WebRTC in Safari: https://bugs.webkit.org/show_bug.cgi?id=238388
- Tello eSIM plans, introductory $10 for 2 GB with unlimited talk and text: https://tello.com/buy/esim
- US Mobile plans, Multi-Network add-on $10/month or $90/year: https://www.usmobile.com/plans
- Quo, receiving calls: https://support.quo.com/core-concepts/calling/receiving-calls
- Quo rebrand announcement, 23 September 2025: https://www.prnewswire.com/news-releases/openphone-becomes-quo-new-name-updated-products-and-105-million-in-growth-financing-mark-major-inflection-point-for-ai-driven-front-office-solution-302562915.html
- Acrobits, iOS push notifications: https://faq.acrobits.net/activating-push-notifications-ios
- Smith.ai terms (unconditional vs conditional, warm transfer): https://docs.smith.ai/article/45tig5wscr-terms-and-definitions
- Smith.ai warm transfer and SMS or Slack availability alerts, extra line $15: https://smith.ai/features/warm-transfer-answering-service
- Ruby, three ways they transfer: https://www.ruby.com/blog/3-ways-rubys-virtual-receptionists-can-transfer-calls-to-you/
- Ruby answering service (forward back, or Ruby as backup): https://www.ruby.com/answering-service/
- Goodcall FAQ (ring first vs every call, Google Voice limitation, escalation, prices): https://www.goodcall.com/faq
- Rosie home page and call handling (forward, text or email, warm and waterfall transfer, from $49/month): https://heyrosie.com/ and https://heyrosie.com/solutions/call-handling-service
- Dialzara, transfer to a phone number, updated 12 October 2025: https://guide.dialzara.com/en/article/training-your-ai-receptionist-to-transfer-calls-to-another-phone-number-17hs4x6/
- Dialzara, connect Google Voice, updated 24 March 2026: https://guide.dialzara.com/en/article/how-to-connect-your-dialzara-agent-to-google-voice-1oiesh0/
- Dialzara, forward all, including from Dialpad and Grasshopper: https://guide.dialzara.com/en/article/forwarding-all-your-calls-to-your-ai-receptionist-1rfamag/
- Google Voice community thread on the fixed ring time (not an official help article): https://support.google.com/voice/thread/1926376/need-to-adjust-the-number-of-rings-before-voicemail-answers?hl=en

Secondary only, and not used as a price or a timer we would quote to a customer:

- Safina and VettedCalls carrier-code guides (Verizon ring length, `*71` scope).
- TmoNews on Proxy by DIGITS ending for new users on 9 April 2025.
- A third-party note that US Mobile's Multi-Network add-on is data-only.
- A 2026 blog on an iOS 26.4 PushKit delegate. Not confirmed on Apple's documentation page.
