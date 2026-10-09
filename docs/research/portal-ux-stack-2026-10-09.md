# Portal sign-in and payment stack

Research only. Written 9 October 2026 for the Blue Bee Ops client portal (`app.bluebeeops.com`), a Cloudflare Workers app. A visitor creates a free account, then picks Coverage ($149/month), Intake ($249/month), or Estimate Request ($349/month) and pays monthly. The reader is a US trades-shop owner, often on a phone, who is not technical. Sign-up, sign-in, and payment have to feel easy, professional, and safe.

No site code was changed for this note. Prices below are from vendor pages fetched on 9 October 2026. Where a page did not show a number cleanly, the figure is marked unverified and is not used in the recommendation.

## The short answer

**Sign-in, first choice: Clerk, on the Pro plan ($25/month).** The screens are already built, they look like a finished product, and the path that fits a phone is a six-digit email code, with Google as a second button and Face ID offered only after the first login. At a few hundred users the bill stays $25. The custom domain is included even on the free Hobby plan; taking Clerk’s name off the screen, passkeys, and custom email wording start at Pro.

**Sign-in, runner-up: the current plan, Supabase Auth with a six-digit code sent by Resend.** The method is right. The database comes with it. The cost is $0 until you need the project to stay awake, then $25/month. Supabase does not hand you a polished login screen. If the screen Blue Bee builds is as calm as the marketing site, this is enough to ship. If a shop owner hesitates, move the glass to Clerk and keep a database beside it.

**Payments, first choice: Stripe Checkout, plus the Stripe Customer Portal.** Link, Apple Pay, and Google Pay sit on that same page at the same card rate. The owner updates a card or cancels without Blue Bee building a billing site. This is the current plan, and it is the right one.

**Payments, runner-up: Square, and only if that shop already runs cards through Square.** The online rate on Square’s free column is a bit higher than Stripe, and Square is built for a counter, not a subscription portal. It is the familiar name, not the smoother checkout.

Do not put Paddle, Lemon Squeezy, or Polar in front of a Kitsap plumber. They are merchants of record: the receipt is theirs, the fee is about 5% plus 50¢, and they are built for software sold worldwide. Do not add Chargebee or Recurly on top of Stripe at this size.

## What “easy” means on a phone

A shop owner should be able to do this without a password and without leaving the page they already have open:

1. Type an email address.
2. Read a short code in Mail, from `jase@bluebeeops.com`.
3. Type the code. They are in.

A magic link (tap the link in the email) feels shorter until the phone gets in the way. If the portal is saved to the iPhone home screen, Mail opens the link in Safari, and the home-screen icon stays logged out. Safari and the installed home-screen app do not share cookies or storage. That limitation is documented by Progressier (20 January 2025): magic links work for an Android installed app and for desktop, and they do not log the person into an iOS home-screen app. A code typed into the page that is already open avoids that.

Face ID and passkeys are the right *second* visit, not the front door. The first time, “create a passkey” is a strange sentence. After one successful email login, offering “next time, use Face ID” is a gift. Apple’s developer forums have a thread (iOS 18.6.2) about passkey prompts misbehaving when a login page is opened from an iPhone home-screen shortcut, so do not make a passkey the only way back in.

Google is worth a button, under the email field, not instead of it. Many owners live in Gmail and will tap it. Some will not want the shop tied to a Google account. Apple is worth the same treatment on an iPhone, once an Apple Developer setup exists. Clerk’s Apple guide says production needs your own Apple Services ID, private key, Team ID, and Key ID. This pass did not re-check the Apple Developer Program fee.

The address bar during login and checkout should stay on `bluebeeops.com`. A jump to a vendor’s domain, at the moment someone is about to trust you with a card, feels like a different company.

## A. Sign-in and sign-up

### First choice: Clerk

Clerk’s prebuilt sign-up, sign-in, and account screens are the closest thing on this list to “it already feels like a product.” Email codes and email links are on every plan, including the free Hobby plan. Google and other social buttons are on Hobby, up to three providers, so Google and Apple both fit. Passkeys, biometric sign-in for native apps, multi-factor authentication, and custom email wording are Pro.

Hobby is $0 and includes 50,000 monthly retained users per app. Clerk does not bill a normal monthly active user. A retained user is someone who comes back at least a day after signing up, so a person who creates an account and never returns is not billed. Pro is $25/month, or $20/month billed annually, and still includes those 50,000 before a $0.02 charge for each extra retained user. At 0–500 users, Pro is a flat $25. There is no app database. User records live at Clerk. Shop data, call reports, and plan status still need Supabase, Cloudflare D1, or something like them.

Branding, from Clerk’s pricing page (fetched 9 October 2026):

- Custom domain: included on Hobby.
- “Secured by Clerk” on the prebuilt screens: removed only on Pro.
- Custom email templates: Pro.
- Session length: fixed at 7 days on Hobby. Pro can set it from 5 minutes to 10 years.
- Social connections: up to 3 on Hobby, unlimited on Pro.

Clerk’s email deliverability guide says that once a production domain is connected, mail goes out as `notifications@your-domain.com` by default, and the part before the @ can be changed through their Backend API. Whether that local-part change is allowed on Hobby, specifically so the code can come from `jase@`, is not stated on the pricing page. The wording of the email is explicitly Pro. Treat “the code arrives from Jase, in Blue Bee’s voice” as a Pro feature unless a Hobby dashboard proves otherwise.

Cloudflare Workers: `@clerk/backend` is documented for V8 isolates, including Workers. `authenticateRequest` can verify the session with a local JWT key and no network call.

Security feel: bot protection, leaked-password checks, and device revocation are on Hobby. Real multi-factor (authenticator app, SMS, backup codes) is Pro. SMS in the US and Canada is $0.01 per message on Pro. For this audience, SMS as the *first* factor is a worse idea than email: shop phones are shared, and a text code is one more thing to mistype. Keep SMS off the front door.

Lock-in: you can export users. The screens, sessions, and webhooks are Clerk’s. Leaving later means rebuilding the login. That is acceptable at $25 if the feeling of the login is the priority.

Maturity: Clerk is a dedicated auth product with a long public pricing page and a Workers-capable backend SDK. It is not as old as Auth0 or Firebase. It is old enough, and much more aimed at this kind of app.

### Runner-up: Supabase Auth, with Resend sending the code

This is the current plan, and the *method* is the one this report recommends whoever the vendor is.

Supabase sends either a magic link or a six-digit code. They share one implementation. To send the code, the email template includes `{{ .Token }}` instead of a link. The person types that code with `verifyOtp`. Default limits: one code request per 60 seconds for the same user, and the code expires after one hour unless you change it. That is a normal, bank-like flow.

What you do not get: a hosted, polished login. You build the email box and the six digits yourself, on `app.bluebeeops.com`. That can look better than Clerk, because it can look exactly like Blue Bee. It can also look homemade. The whole UX risk of this plan sits in that screen.

Database: included. Every project is Postgres, plus storage. Free includes 50,000 monthly active users, 500 MB of database, and custom SMTP. Pro starts at $25/month, includes 100,000 monthly active users, then $0.00325 each, and includes $10 of compute credit that covers one Micro instance. A single Pro project on Micro is the $25 plan price.

Two production facts that matter more than the user meter:

- Free projects pause after one week of inactivity, and you can have two active free projects. A quiet portal will lock owners out. Paid projects do not pause. If this portal is real, budget the $25 Pro plan, not the free tier.
- Supabase’s own mail server is capped at 2 emails per hour and is not for production. Custom SMTP is included on Free. Point it at Resend and send from `jase@bluebeeops.com`.

On 3 June 2026 Supabase stopped letting *new* free projects edit auth email templates while they still use Supabase’s mail server. Paid plans are unaffected. Free projects that set their own SMTP can still edit templates. That matches the Resend plan. The pricing table also says “Remove Supabase branding from emails” is Pro only. This pass did not find a separate page saying whether a Supabase footer still appears after you write your own template over your own SMTP. Assume you control the body once Resend is connected, and check one real email before calling the footer done.

Passkeys exist and are marked experimental. The changelog calls them a beta, and the client has to opt in with `experimental: { passkey: true }`. The API may change. Fine as a later “use Face ID next time.” Not fine as the only login in week one.

Social login (Google, Apple, others) is included on Free. You still build the button and do the provider setup.

Workers: the client talks to Supabase over HTTPS, and the Worker checks the session JWT. The database is not inside Cloudflare. That is a normal and proven shape.

Lock-in: Auth is GoTrue, which Supabase publishes, and you can self-host. User rows live in your Postgres. This is the lowest lock-in of the hosted options that also store the app’s data.

Resend, which this plan depends on: Free is 3,000 transactional emails a month, 100 a day, and 3 verified domains. Pro is $20/month for 50,000 emails, then $0.90 per extra 1,000, with no daily cap. A few hundred owners each requesting one code a month fits in Free. A launch day past 100 emails does not. The daily cap is a UTC day, not a rolling 24 hours.

Cost at 0–500 users, if the project must not sleep: about $25/month to Supabase, plus $0 or $20 to Resend, plus nothing to an auth vendor. Clerk Pro is the same $25 and then you still pay for a database.

### The other eight, and why they are not the pick

**WorkOS AuthKit** is the strongest hosted alternative. The login page is hosted and brandable. Magic Auth is a six-digit code that expires in 10 minutes, which is the right interaction. Passkeys, MFA, social login, and magic auth are included. The first 1 million monthly active users are free. Each extra million is $2,500/month. Production requires a card on file even when the user bill is $0. Staging is free.

The catch is the address bar. A custom domain for AuthKit is $99/month. Without it, the login host is WorkOS’s. Email is a separate knob: WorkOS can send through Resend, from an address on a domain you verified, including magic codes. So `jase@` does not require the $99. The login URL does. At this size, $99 to hide a vendor hostname is a worse deal than Clerk Pro at $25, which includes the custom domain.

No application database. Workers fit is the usual one: hosted login, verify the token in the Worker.

**Better Auth** is the strongest “it runs inside the Worker” option. It is an open-source library. Version 1.5 added first-class Cloudflare D1. Email OTP and passkeys are plugins. You send the email yourself, so Resend and `jase@` are natural. There is also a `one-tap` plugin for Google. The managed dashboard (audit logs, their email sending) is a separate product: Starter is $0, Pro is $20/month, and their transactional email is $0.001 per email on Pro if you use theirs. You do not need that dashboard to run the library.

You own the users, the code, and the bugs. There is no polished hosted screen unless you assemble one (community kits exist; they are not Clerk). For a portal whose owner’s top priority is the *feeling* of the login, this asks Blue Bee to become an auth company. It is the right pick later if vendor lock-in or a pure Cloudflare stack becomes the priority. It is not the easiest way to a trustworthy screen this month.

Workers Paid, if the account is on it, is a $5/month minimum (Cloudflare docs, updated 2 October 2026). The library itself is $0. D1 and KV have their own free allotments; this pass did not price a specific D1 bill for the portal.

**Auth0** is the mature enterprise name. Free is genuinely usable on paper: $0, up to 25,000 monthly active users, passwordless, passkeys, one custom domain (a credit card must be verified), unlimited social connections, and basic attack protection. What Free does not include, in both the B2C and B2B tables: email workflow, and customize signup and login. The login can be configured, but the deeper “make this email and this screen ours” work starts on Essentials.

B2C Essentials starts at $35/month for 500 monthly active users, $70 at 1,000, $175 at 2,500, $350 at 5,000. Those are the published tiers, and usage between tiers bills at the next tier up. Professional starts at $240/month. For a few hundred shop owners who need the email to sound like Jase, Auth0 is the expensive, IT-looking version of a problem Clerk and Supabase already solve. Universal Login is a redirect to Auth0’s page, which is polished and does not feel like a local shop.

Passwordless magic links on Auth0 do not return a refresh token; a code does. That is another point for codes.

**Kinde** is a real all-in-one (login, organizations, and its own billing). Free is $0 and includes 10,500 monthly active users, email, SMS, and social login, MFA, a custom domain, and attack protection. Pro is $25/month and adds uncapped users above the included 10,500 at $0.0175 each, removal of Kinde branding, and a SOC 2 report. Kinde’s own passkey doc says passkeys require a paid plan. Billing customers through Kinde is 0.7% per transaction on Free and Pro, and users on a paid subscription are not counted as monthly active users. That billing fee stacks on top of whatever processor actually charges the card. Using Kinde as a second billing system beside Stripe is how a simple portal grows a second source of truth.

Kinde is a credible runner-up to the runner-up if a hosted screen and a custom domain at $0 matter more than Clerk’s polish. This pass did not find evidence that US trades owners already recognize the Kinde login, and the passkey gate plus the branding gate mean the “feels finished” version is the $25 plan anyway.

**Stytch** is a specialist in passwordless login, with prebuilt components. Pay as you go is $0 and includes 10,000 monthly active users. The fetched pricing table lists an extra per-user cost past 10,000 and does not print the dollar amount. Do not invent one. Custom brand and login experience is a flat $99. Device fingerprinting past 10,000 fingerprints is $0.005 each. Stytch’s passkey doc says a passkey can be used to log in only after the person has already verified an email or phone with a code or a social login. That matches the “code first, Face ID later” advice, and the $99 brand fee does not.

**Firebase Authentication** is free for email, social, and anonymous sign-in up to 50,000 monthly active users, then Google Cloud Identity Platform rates ($0.0055 per user from 50,001 to 100,000). Phone and SMS are billed per message and, on the no-cost plan, are tightly capped. There is no Clerk-quality hosted login aimed at a custom brand. The Admin SDK is a poor fit for a Worker; checking an ID token is possible and is more awkward than Clerk or Supabase. Firebase is mature and fine for a mobile app that already lives in Google’s stack. It is not the easy, branded web login this portal wants. Auth does not include a general database; Firestore is a separate product in the same project.

**Descope** has a visual flow builder, email codes, magic links, passkeys, and social login. Free Forever is $0 for 7,500 monthly active users, with no Descope watermark, a 99% SLA, and “all auth methods.” The plan cards say custom domain and Google One Tap are added on Pro. The comparison table lower on the same page appeared, in the fetch, to mark those as included on Free. Those two parts of the page disagree. Trust the plan cards, and treat the table as conflicting until someone looks at a logged-in project. Pro starts at $249/month, billed annually. That price is for a customer-identity suite. It is the wrong amount of product for a few hundred shop owners.

**Also looked at and not ranked:** Logto, SuperTokens, and PropelAuth. They are real options. This pass did not pull their current price pages, so they are not in the table.

### Top 4 sign-in options

| | How the login feels | How safe it feels | Monthly cost at 0–500 users | The downside that matters |
| --- | --- | --- | --- | --- |
| **Clerk Pro** | Finished screens. Email code, Google, Apple, and later Face ID. Your domain. | Strong defaults. MFA and passkeys on Pro. A 7-day session on the free plan is short for a monthly portal. | **$25** flat. Hobby is $0 if you can live with “Secured by Clerk,” no passkeys, no custom email wording, and a 7-day session. | No database for shops and call reports. Leaving means rebuilding login. |
| **Supabase Auth + Resend** | Whatever screen Blue Bee builds. The code-in-email path is the right one. | Solid auth server. Passkeys are still a beta. Free projects sleep after a quiet week. | **$0** on Free, with the sleep risk. **$25** Pro so it stays up. Resend Free covers light use; **$20** if a day exceeds 100 emails. | You design every pixel. A clumsy form will feel less safe than Clerk, even if the crypto is fine. |
| **WorkOS AuthKit** | Hosted, brandable, six-digit code. Passkeys and social included. | Enterprise-grade, including MFA, at the free user tier. | **$0** for users. **$99** if the login URL must be `bluebeeops.com`. A card must be on file in production. | $99 to put your name in the address bar. No app database. The product is shaped for company SSO you do not need yet. |
| **Better Auth on Workers** | Yours, if you build or adopt a component kit. Email code and passkeys are in the library. | As safe as the implementation. You apply the updates. | **$0** for the library. Workers Paid is **$5** minimum if the account is on that plan. | No vendor screen, no vendor support for the login. The fastest way to ship a wobbly form. |

## B. Payments

The portal should charge a saved customer every month, let them switch among three plans, update a card, and cancel, without a phone call to Jase for ordinary billing. The first charge has to look obvious on a phone.

### First choice: Stripe Checkout and the Customer Portal

Stripe’s standard US online card rate is **2.9% + 30¢** per successful domestic card charge. No monthly fee and no setup fee on standard pricing. Checkout itself is included. Apple Pay is listed at the same **2.9% + 30¢**. Link card payments are listed at the same **2.9% + 30¢**. International cards add **1.5%**. A manually entered card adds **0.5%**.

Checkout is a Stripe-hosted or embedded page. Stripe’s docs say Apple Pay and Google Pay work there with no extra integration, and Link is how a returning person reuses a card they saved at any Link checkout, not only at Blue Bee. For a first-time owner that means: type the card once, or double-click Apple Pay, or confirm a Link prompt if they have used Link elsewhere. The second month is a renewal, not a second checkout.

Subscriptions use Stripe Billing. Pay as you go is **0.7% of billing volume**. One-off invoices are excluded. The Customer Portal is included. A custom domain on the hosted checkout or the portal is **$10/month**; the default `stripe.com` page does not need it. “Powered by Stripe” on a Stripe page is a trust signal for a new local company. Pay the $10 only if a test shows the stripe.com hop bothers people.

What the portal can do, from Stripe’s docs: update the card, cancel, give a cancellation reason, change billing details, and (if you turn it on) switch plans. Cancellation is on by default. You still listen for webhooks so the Worker grants or removes the service. Stripe’s own doc says not to treat the billing email as the login. Keep Supabase or Clerk as the account, and Stripe as the card.

ACH Direct Debit is **0.8%**, capped at **$5**, for standard settlement. Instant bank-account validation is **$1.50**. A failed ACH payment is **$4**. A disputed ACH payment is **$15**. Card disputes are **$15** to receive and another **$15** if you fight one by hand; the fight fee comes back if you win. ACH is cheaper on a $149 charge and slower, and a failed debit has its own fee. Offer it as “pay from a bank account,” not as the only button.

Stripe Tax is optional. Tax Basic is **0.5% per transaction** where you are registered to collect, on Billing, Checkout, Invoicing, and Payment Links. This report does not decide whether a Washington answering service owes sales tax. That is a question for a Washington tax adviser or the Department of Revenue. Turn Tax on when that answer is yes. Do not turn on a merchant-of-record product just to avoid asking.

Fee on one **$149** US card, no tax product, standard pricing:

- Card: 2.9% × $149 = $4.321, plus $0.30 = **$4.621**.
- Billing, pay as you go: 0.7% × $149 = **$1.043**.
- Both: **$5.664**.
- ACH at 0.8% is $1.192, under the $5 cap, plus $1.043 Billing = **$2.235**, before any $1.50 validation or a $4 failure.

The same card math on $249 is 2.9% × $249 + $0.30 = $7.521, plus 0.7% × $249 = $1.743, together **$9.264**. On $349: 2.9% × $349 + $0.30 = $10.421, plus 0.7% × $349 = $2.443, together **$12.864**.

At a few dozen shops, pay as you go is cheaper than Stripe’s $620/month Billing contract (that contract covers up to $100,000 of billing volume, then 0.67%). Even 500 shops all on the $149 plan is $74,500 of volume, and 0.7% of that is about $522, still under $620. The contract starts to matter if the book approaches the higher plans at that headcount. It does not matter at launch.

Stripe also sells Managed Payments, its own merchant-of-record product. The add-on rate did not render on the pricing pages fetched here, so it is not in the math. Secondary write-ups quote an extra 3.5%. Unverified here, and not needed for US shops you already know how to invoice.

### Runner-up: Square

Square is the name a trades owner may already trust, because the card reader on the counter is often Square. That familiarity is the entire case.

On Square’s pricing page, the free-column **online** rate (online payments or an invoice) is **3.3% + 30¢**. **Online API** payments inside your own app are **2.9% + 30¢** on the free, Plus, and Premium columns. A Square help article also lists subscription payments at **3.3% + 30¢** and ACH by API at **1%** with a **$1** minimum and a **$5** cap. On a $149 charge, 3.3% + 30¢ is **$5.217** before any subscription-billing software. That is in the same neighborhood as Stripe’s card-plus-Billing total, and the online-API rate matches Stripe’s card rate alone.

What Square does not match is the subscription portal. Stripe’s Customer Portal is a documented, self-serve place to change a card and cancel. Square can take a card and run a subscription charge. It is not the product you point a Cloudflare Worker at when the requirement is “feels as finished as Checkout.” Use Square if you are already paying Square and the owner will pay an invoice they already understand. Do not start a new portal on it for the checkout experience.

### The others

**Paddle** is a merchant of record. The published Checkout price is **5% + 50¢** per transaction, no monthly fee, and that price is meant to include tax collection and remittance. On $149 that is **$7.95**. Products under $10, and merchants who need invoicing, are told to contact sales. The buyer’s receipt is Paddle’s sale, not “Blue Bee Ops.” For a sole proprietorship whose whole pitch is Jase setting the shop up himself, that is the wrong name on the charge. Worth it when customers are in many countries and sales-tax registration is the expensive problem. These customers are US shops, mostly one county.

**Lemon Squeezy** is also a merchant of record, aimed at digital products, and Stripe has been reported as its owner since 2024 (secondary source; the product still sells under its own name and its own fee page). The sticker is **5% + 50¢**. The fee doc adds **1.5%** for cards outside the US, **1.5%** for PayPal, and **0.5%** for subscription payments, calculated on the total order value. A US subscription with no tax in the total is 5.5% × $149 + $0.50 = **$8.695**. US bank payouts via Stripe are free. The extra half point on every renewal makes it worse than Paddle for this plan, and the same “someone else is the seller” problem remains.

**Polar** is a newer merchant of record with a public ladder. New organizations (on or after 27 May 2026) start at **5% + 50¢** with no monthly fee. Pro is $20/month at 3.8% + 40¢, Growth $100/month at 3.6% + 35¢, Scale $400/month at 3.4% + 30¢. Non-US cards add 1.5%. The extra 0.5% subscription fee applies only to the older Early Member rate, not to these plans. A dispute is $15. On a US $149 subscription, Starter matches Paddle at **$7.95**. Polar is a developer product. It is not a better phone checkout than Stripe for a local service, and it has the same merchant-of-record receipt.

**PayPal and Braintree.** PayPal’s US merchant fee page, last updated 1 October 2026, lists PayPal Checkout and Venmo at **3.49% + a fixed fee**, and standard credit and debit cards at **2.99% + a fixed fee**. The fixed fee for US dollars is **$0.49**. On $149, PayPal Checkout is **$5.690** and a PayPal card payment is **$4.945**. International commercial transactions add 1.50%. PayPal’s own advanced card product is 2.89% plus the fixed fee, with no monthly fee on that line; Payments Pro is $30/month. Braintree was not given a separate current rate page in this pass; treat it as PayPal’s gateway, not a friendlier checkout.

Some owners trust the PayPal button more than a card form. Stripe can be the platform and still offer wallets. A PayPal-only portal means a clunkier return visit, a higher rate on the PayPal button, and a second place to go when a subscription fails. If a test shows owners bouncing off the card form, add PayPal as a method. Do not make PayPal the billing system.

**Chargebee and Recurly on top of Stripe.** These are subscription ledgers, not the card network. Chargebee’s public Flow page, fetched 9 October 2026, starts from a $0 control and shows a **$66,000** monthly-volume breakeven against the next step. The exact percentages did not render cleanly, so this report does not quote them. A secondary comparison dated 7 October 2026 says Flow is $0 + 0.80% or $99 + 0.65%, and that Recurly Starter is $249/month plus 0.9% after the first $40,000. Those two percentages and the Recurly figure are secondary, not confirmed on the vendors’ pages here.

Either way, the product is a second billing brain in front of a processor that already renews cards, retries failures, and hosts a cancel page. At three public prices and a few hundred customers, that second brain is a place for the portal and the ledger to disagree. Revisit if metered overage, quotes, and multiple entities show up. They are not the launch.

### Top 4 payment options

| | How checkout feels | How safe it feels | What a $149 US card costs | The downside that matters |
| --- | --- | --- | --- | --- |
| **Stripe Checkout + Customer Portal** | The page people already trust. Apple Pay, Google Pay, and Link on the same form. Portal for card changes and cancel. | Stripe is the brand on the charge. You remain the seller. Radar is included on standard pricing. | **$4.621** card, plus **$1.043** Billing = **$5.664**. ACH about **$2.235** plus Billing, before a validation or a failed-debit fee. $0 monthly. | You handle tax once you are told you must collect it. A failed ACH debit is $4. |
| **Square** | Familiar if they already use the reader. Fine for an invoice. Weaker as a self-serve subscription portal. | A known counter brand. You remain the seller. | Free-column online rate **3.3% + 30¢ = $5.217**. In-app API rate **2.9% + 30¢ = $4.621**. | Subscription UX is not Checkout. Easy to mix up the 3.3% and 2.9% schedules. |
| **Paddle** | A hosted checkout aimed at software. Competent, not “my local guy.” | Paddle is the seller on the receipt. Tax filing is their job. | **5% + 50¢ = $7.95**, tax handling included in that price. | Wrong name on the charge for a personal service. Costs more than Stripe on a US card. |
| **PayPal Checkout** | A button many owners recognize. The PayPal flow itself feels like a detour. | Old, familiar, and noisier than Stripe when something fails. | **3.49% + $0.49 = $5.690** for PayPal Checkout. A card through PayPal is **2.99% + $0.49 = $4.945**, and that is before a separate subscription tool. | Higher rate, weaker portal. Use as a button inside a real billing system if a test proves you need it. |

Lemon Squeezy and Polar land beside Paddle on price and on the merchant-of-record problem. They are not a better fit than Paddle, so they are not a fifth and sixth row.

## Verdict on the current plan

The current plan is Supabase Auth, a six-digit email code sent through Resend, then Stripe Checkout and the Customer Portal.

**Keep the payment half as it is.** Checkout plus the Customer Portal is the best combination on this list for a non-technical person on a phone. Turn on Link, Apple Pay, and Google Pay. They do not add a fee on top of the domestic card rate. Offer bank debit as a second choice and expect a few-day wait and a $4 fee when a debit fails. Leave the hosted page on Stripe’s domain until a real owner stumbles; then consider the $10 custom domain. Do not insert Paddle, Lemon Squeezy, Polar, Square, PayPal-as-platform, Chargebee, or Recurly unless the business itself changes (worldwide customers, or an accountant who wants a merchant of record).

**Keep the sign-in method. Decide the sign-in vendor with one phone test.** A six-digit code from `jase@bluebeeops.com` is the right first step for this audience, including a future iPhone home-screen icon. Magic links are the wrong default. Passwords are the wrong default. Google is a good second button. Face ID is a good offer after the first success, and Supabase’s passkeys are still a beta, so do not block launch on them.

Supabase will do that job if two things are true:

1. The project is on the **$25 Pro** plan, or something else keeps it from pausing after a quiet week. Free is the wrong place for a portal people pay $149 a month to use.
2. The email-and-code screen, on a phone, looks as finished as the public site. Large type, one field, then six digits, no password, no jargon.

If that screen is already that good, switching to Clerk spends $25 to replace something that is working and still leaves you paying for a database. If the screen looks like a settings page, Clerk Pro is the upgrade: same monthly ballpark as Supabase Pro, much less design risk, and Supabase or D1 remains the place shop data lives. WorkOS only wins if you want its hosted page and you refuse both Clerk and a custom screen; the $99 domain fee is why it is third.

Resend’s free tier is enough until a single UTC day needs more than 100 auth emails. Then it is $20, not a reason to change vendors.

Nothing in this comparison says the current plan is naive. The payment choice is the one this research would have made anyway. The auth choice is the right gesture on a platform that trusts you to build the glass.

## What this pass did not verify

- The Apple Developer Program’s current annual fee.
- Whether Clerk Hobby can set the email local-part to `jase` without Pro. Custom templates are Pro. The default from-address pattern is in Clerk’s deliverability guide.
- Whether a Supabase footer remains on Free after a fully custom template is sent through Resend.
- Stytch’s per-user price after 10,000 monthly active users. The table shows that a price exists and does not print it.
- Descope’s comparison table versus its plan cards, on custom domain and Google One Tap.
- Chargebee’s exact percentage, and Recurly’s current price, on their own pages.
- Stripe Managed Payments’ add-on rate.
- A separate current Braintree rate card.
- Logto, SuperTokens, and PropelAuth prices.
- Whether Washington sales tax applies to this service. Not a tax opinion.
- A live click-through of each vendor’s login on an iPhone. The iOS magic-link limitation is from Progressier’s help article and from long-standing WebKit storage isolation, not from a Blue Bee prototype.

## Sources

All fetched 9 October 2026 unless noted.

Sign-in:

- Clerk pricing: https://clerk.com/pricing and the 5 February 2026 plan change https://clerk.com/changelog/2026-02-05-new-plans-more-value
- Clerk Workers backend: https://clerk.com/docs/guides/development/sdk-development/backend-only
- Clerk Apple: https://clerk.com/docs/guides/configure/auth-strategies/social-connections/apple
- Clerk email from-address and templates: https://clerk.com/docs/guides/development/troubleshooting/email-deliverability and https://clerk.com/docs/guides/customizing-clerk/email-sms-templates
- Supabase pricing: https://supabase.com/pricing
- Supabase custom SMTP and the 2-per-hour built-in limit: https://supabase.com/docs/guides/auth/auth-smtp
- Supabase rate limits: https://supabase.com/docs/guides/auth/rate-limits
- Supabase passwordless email and the six-digit token: https://supabase.com/docs/guides/auth/auth-email-passwordless
- Supabase email-template change for new free projects, 3 June 2026: https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier
- Supabase passkeys beta: https://supabase.com/changelog/46458-passkeys-for-supabase-auth-beta and https://supabase.com/docs/guides/auth/passkeys
- Auth0 pricing: https://auth0.com/pricing
- Auth0 passwordless limitation (magic link does not return a refresh token): https://auth0.com/docs/authenticate/passwordless/passwordless-connection-limitations
- WorkOS pricing, including the $99 custom domain: https://workos.com/pricing
- WorkOS Magic Auth (six-digit code, 10 minutes): https://workos.com/docs/authkit/magic-auth
- WorkOS custom email providers, including Resend: https://workos.com/docs/authkit/custom-email-providers
- Stytch pricing: https://stytch.com/pricing
- Stytch passkeys cannot be the first signup factor: https://stytch.com/docs/consumer-auth/authentication/passkeys/login-sdk
- Kinde pricing: https://kinde.com/pricing/
- Kinde passkeys require a paid plan: https://docs.kinde.com/authenticate/authentication-methods/passkeys/
- Firebase / Identity Platform pricing: https://firebase.google.com/pricing/ and https://cloud.google.com/identity-platform/pricing
- Descope pricing: https://www.descope.com/pricing
- Better Auth pricing: https://better-auth.com/pricing
- Better Auth on D1: https://better-auth.com/blog/1.5
- Better Auth email OTP: https://better-auth.com/docs/plugins/email-otp
- Better Auth Workers `waitUntil` and `nodejs_compat`: https://better-auth.com/docs/reference/options and https://better-auth.com/docs/1.6/installation
- Cloudflare Workers pricing, updated 2 October 2026: https://developers.cloudflare.com/workers/platform/pricing/
- Resend pricing and the 100-email daily cap: https://resend.com/pricing and https://resend.com/docs/knowledge-base/account-quotas-and-limits
- iOS home-screen apps and magic links: https://intercom.help/progressier/en/articles/10433517-can-you-use-magic-links-in-a-pwa (20 January 2025)
- Passkeys from an iPhone home-screen shortcut: https://developer.apple.com/forums/thread/815784

Payments:

- Stripe pricing: https://stripe.com/pricing
- Stripe local methods, including Apple Pay, Link, and ACH: https://stripe.com/pricing/local-payment-methods
- Stripe Billing pricing, including 0.7% and the portal’s $10 custom domain: https://stripe.com/billing/pricing
- Stripe Tax pricing, including 0.5% Tax Basic: https://stripe.com/tax/pricing
- Checkout wallets and Link: https://docs.stripe.com/payments/link/checkout-link and https://docs.stripe.com/payments/checkout/save-during-payment
- Customer Portal: https://docs.stripe.com/customer-management/configure-portal and https://docs.stripe.com/customer-management/integrate-customer-portal
- Paddle pricing: https://www.paddle.com/pricing
- Lemon Squeezy pricing and fee schedule: https://www.lemonsqueezy.com/pricing and https://docs.lemonsqueezy.com/help/getting-started/fees
- Polar fees: https://polar.sh/docs/merchant-of-record/fees
- Square US pricing: https://squareup.com/us/en/pricing
- PayPal US merchant fees, page dated 1 October 2026: https://www.paypal.com/us/business/paypal-business-fees
- Chargebee pricing page (percentages did not render cleanly): https://www.chargebee.com/pricing/

Secondary only, not used as the deciding numbers:

- Recurly and a cleaned-up Chargebee percentage, read by a third party on 7 October 2026: https://www.saassoftwaretools.com/compare/chargebee-vs-recurly/
- Stripe’s purchase of Lemon Squeezy, as retold on 17 September 2026: https://paymentreview.com/blog/merchant-of-record-fees-software-sellers/
