# Google Play listing — Mahalaxmi Electricals

Everything to paste into Play Console. Graphics are in this folder:
`icon-512.png`, `feature-graphic.png`, `screenshots/1-shop.png` … `4-professionals.png`
(regenerate with `node scripts/generate-store-assets.mjs`).

---

## 1. App details

| Field | Value |
|---|---|
| Application ID (package name) | `com.mahalaxmi.electricals` — permanent, cannot be changed later |
| App name (max 30) | Mahalaxmi Electricals |
| Default language | English (India) – en-IN |
| App or game | App |
| Free or paid | Free |

## 2. Store listing

**Short description** (79 of 80 characters)

```
Shop electricals with live stock, get quotations and book trusted electricians.
```

**Full description** (paste as is; about 2,000 of 4,000 characters)

```
Mahalaxmi Electricals brings our store to your phone. See what is in stock right now, order electrical materials, get a priced quotation for your whole list, and get trusted electricians for repairs and installations.

SHOP WITH LIVE STOCK
• Browse thousands of products by category: lighting, fans, switches and sockets, wires and cables, MCBs and distribution boards, water heaters, coolers, inverters, pumps, tools and more.
• Stock is updated from our store every 15 minutes, so you know what is available before you order.
• Add items to your cart and send your order with your delivery address. We confirm it and keep you updated at every step.

QUOTATIONS IN MINUTES
• Take a photo of your handwritten list, pick products, or simply describe what you need.
• Our team sends you a priced quotation with every item and the total.
• Accept it with one tap and it becomes an order.

COMPLAINTS AND INSTALLATIONS
• Raise a complaint or an installation request.
• Electricians nearby offer to take the job and you choose who does it.

FOR ELECTRICIANS AND ARCHITECTS
• Make product selections for your customers' jobs and share them in the app or on WhatsApp. Your customer can order them in one tap.
• See your customers' orders and get notified at every step.
• Earn incentives and points on every delivered order, with Bronze to Diamond tiers.
• Find new complaint and installation jobs.

MORE
• Wallet, savings plans with bonus points, and referral rewards.
• Notifications for orders, quotations, jobs and incentives.
• Verified electricians and architects directory.

Sign in with your mobile number. Your data is protected and you can delete your account at any time from the app.
```

| Field | Value |
|---|---|
| App category | **Shopping** |
| Tags (up to 5) | Shopping, Home improvement, Home services, Hardware store, Local business |
| Contact email | your business email (required, shown publicly) |
| Contact phone | optional — your shop number |
| Website | https://app-rho-one-49.vercel.app |
| App icon | `icon-512.png` (512 × 512) |
| Feature graphic | `feature-graphic.png` (1024 × 500) |
| Phone screenshots | `screenshots/1-shop.png`, `2-quotation.png`, `3-orders.png`, `4-professionals.png` (1080 × 1920) |

The screenshots are designed from the app's real screens (the example orders and prices are samples). You can also add real screenshots from a phone: open the screen and press Power + Volume down.

## 3. App content (Policy → App content)

### Privacy policy
`https://app-rho-one-49.vercel.app/privacy`

### App access → "All or some functionality is restricted"
Sign-in uses SMS codes that reviewers cannot receive, so give them an email + password account:

1. Sign up once in the app or on the website with an **email address and password** you control (use a real mobile number you own for the required phone field), e.g. `playreview@yourdomain.com`.
2. In Play Console add instructions:
   - Name: `Reviewer account`
   - Username: the email above · Password: the password you set
   - Instructions: `Open the app, tap "Continue with email", sign in with these details. You can browse the shop, request a quotation and place an order (orders are confirmed manually by the shop; nothing is charged).`
3. Optional: if you want reviewers to see the electrician features, promote that account to Electrician in Admin → Users.

### Ads
**No**, the app does not contain ads.

### Content rating (IARC questionnaire)
- Category: **Utility, Productivity, Communication, or Other**
- Violence, sex, language, drugs, gambling: **No** to all
- Users interact or exchange content: **Yes** — customers share service requests and product lists with electricians/architects and the shop (no public posting, no chat with strangers)
- Shares the user's location: **No**
- Digital purchases: **No** (physical goods only; payments go through Razorpay)
- Expected result: rated for everyone (3+)

### Target audience and content
- Age groups: **18 and over** only
- Appeals to children: **No**

### News app: **No** · COVID-19 app: **No** · Government app: **No** · Health app: **No**

### Financial features
The app takes payments for goods and savings-plan instalments through Razorpay, and has a wallet and savings plans that give bonus points for purchases at the store. It does **not** give loans, credit, investments, crypto or bank accounts.
- If the savings plan is purely a store purchase scheme (customers redeem it for products, no cash interest): choose **"My app doesn't provide any of these financial features"**.
- If customers can withdraw the money as cash or earn interest, declare it under the relevant savings option instead. When unsure, ask a CA — a wrong answer can get the app removed.

### Data safety
**Overview answers**
- Does your app collect or share any of the required user data types? **Yes**
- Is all user data encrypted in transit? **Yes** (HTTPS everywhere)
- Do you provide a way for users to request that their data is deleted? **Yes** — in the app (Home → Delete my account) and at `https://app-rho-one-49.vercel.app/delete-account`

**Data collected** (none of it is *shared* in Play's sense — the services we use are processors acting for us; nothing is sold)

| Data type | Collected | Required? | Purposes |
|---|---|---|---|
| Personal info → Name | Yes | Required | App functionality, Account management |
| Personal info → Email address | Yes | Optional | App functionality, Account management |
| Personal info → User IDs (username) | Yes | Required | App functionality, Account management |
| Personal info → Address (delivery/site address) | Yes | Optional | App functionality |
| Personal info → Phone number | Yes | Required | App functionality, Account management, Fraud prevention & security (sign-in codes) |
| Financial info → Purchase history (orders, quotations, savings instalments) | Yes | Required | App functionality |
| Financial info → Payment info | **No** — card/UPI details are entered with Razorpay, never stored by the app |
| Photos and videos → Photos | Yes | Optional | App functionality (photos of requirement lists for quotations) |
| Messages → Other in-app messages (service request details, notes) | Yes | Optional | App functionality |
| App activity → Other user-generated content (product selections) | Yes | Optional | App functionality |
| Device or other IDs (push notification token) | Yes | Optional | App functionality (notifications) |
| Location, contacts, SMS, calendar, health, web history, audio | **No** |

For every type: **processed ephemerally? No** · **users can choose not to provide?** as marked Optional above.

### Account deletion
- Delete account URL: `https://app-rho-one-49.vercel.app/delete-account`
- In-app: Home → **Delete my account** (mobile) or **Account & privacy → Delete my account** (website)
- Data deleted: sign-in, name, contact details, address, uploaded photos, notification tokens
- Data kept: order, payment and invoice records without personal details, as tax law requires (up to 8 years)

### Permissions used
- **Camera** — only when the user taps "Take photo" to photograph a requirement list.
- **Notifications** (POST_NOTIFICATIONS) — order, quotation and job updates. No Play declaration is needed for this one.
- No location, SMS, call log, contacts, microphone, storage or photo-library permissions (photos are chosen through Android's photo picker, which needs none).

## 4. Release
1. Create the app in Play Console with the package name above.
2. Testing → **Internal testing** → Create release → upload the latest `.aab` → add yourself as a tester → roll out.
3. New personal developer accounts: run a **closed test with at least 12 testers for 14 days** before you can apply for production.
4. Keep **Play App Signing** on (default). Future builds from EAS upload without changes.
