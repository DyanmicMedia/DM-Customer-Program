# Generic program checkout — scope for IT review

**Audience:** Dynamic Media IT / CRM (ProCheckout)  
**Status:** Frontend prototype on staging. Not live. Does not place real orders.  
**Staging demo:** [https://dm-customer-programs-staging.web.app/brokenyolk/](https://dm-customer-programs-staging.web.app/brokenyolk/)

This is a scope brief, not a technical implementation plan. The attached HTML/CSS/JS is the look, step order, and form fields we want on the checkout server.

---

## 1. What we are trying to accomplish

Today, a franchisee on a program page (Broken Yolk first) fills a “talk to us” form. Sales then creates the account and order by hand.

We want a **self-serve path** for locations that already know how they will play music:

1. They choose their setup on the **program landing page**.
2. They continue into **checkout**.
3. Checkout creates the account (or signs them in), takes payment, and opens the location in CRM — **on the correct program / parent customer**, at the **program rate**, not the public Soundtrack rate.

Locations that need speakers, a new audio design, or are not sure still go to the **sales form**. That path does not change.

Checkout itself should be **generic Dynamic Media**. It should not say “Broken Yolk” (or any other program). The program is identified only by the **products / PartIDs** in the cart.

---

## 2. How we want customers to get into checkout

The program page is the product picker. Checkout is not a catalog.

**Find Your Setup** on the landing page:

| Customer choice | Next step |
|---|---|
| Sonos, phone/tablet, or store computer | Modal: **Set up your account** (checkout) or **Talk to a representative** (sales form) |
| Wired speakers / not sure / new location audio plan | Sales form, with that hardware choice already filled in |

If they choose checkout, the program page builds a cart from that program’s catalog and sends them to a **generic checkout URL** (today: `/checkout/?program=brokenyolk`).

**Important:** the `?program=` value is only a landing-page id so our prototype can load the right catalog. Live ProCheckout should **not** rely on that query string. The cart — SKUs / PartIDs — is what should identify the program on the checkout server, the same way WordPress already posts `hdcartjson` into AccountInfo.

A bare checkout link with no cart should not open someone else’s leftover cart.

---

## 3. How we want checkout to work on the backend server

Use the **same ProCheckout steps and field names** we already have. We are asking to restyle and host this flow as a generic Dynamic Media checkout, not to invent a new order engine.

Suggested order (matches production, with login first):

1. **Account** — log in, or create a new account (forgot password stays)
2. **View cart** — show the items that came in with the customer
3. **Licensing** — assign each product to a location (saved address or add new)
4. **Shipping** — only if something in the cart ships (PlayerOne). Skip for app-only.
5. **Billing & payment**
6. **Review order** — Dynamic Media ToS, Soundtrack ToS, recurring-charge authorization, then place order

Please keep every question and field we included in the HTML. Layout and styling can match the prototype; the backend still needs the current CRM field names (`username`, `CreateNewLead` fields, `siteName` / address, card fields, `chkToS`, `chkSYBToS`, `chkRecurring`, and so on).

What we need the checkout server to do that the prototype does **not** do yet:

- Accept a cart from a program page the same way WordPress does today (`hdcartjson` post, or an equivalent ingest you already support). Query-string PartIDs will not populate ProCheckout.
- Sign in / create account / reset password against live CRM.
- Attach a **new franchisee** to the correct **parent customer / program** (this is the open CRM question — public SYB checkout does not send a program id today).
- Price and bill using **program PartIDs**, not public SYB retail parts (`0561` / `1025` / `1144`, etc.).
- Run address validate, save site, save billing group, and `ProcessOrder` as you do now.

Until real catalog PartIDs exist, **do not post this prototype cart to production**. Staging uses fictitious placeholders (see below).

---

## 4. How this ties to program pages

- Each program keeps its own landing page (Broken Yolk first; more later).
- Each program gets a **catalog file** of that program’s music, player, and add-on PartIDs (example: `public/programs/brokenyolk.json`).
- The landing page decides checkout vs sales form.
- Checkout is shared. It shows Dynamic Media branding only. Line items are whatever PartIDs were handed off.

When we add Plato Coffee or another program, we should not rebuild checkout. We add a landing page + catalog with **that** program’s PartIDs.

### Placeholder catalog (replace with live values)

| Role | Placeholder SKU | Placeholder PartID | Price in prototype |
|---|---|---|---|
| Program music (monthly) | `9BY1` | 91010 | $27.95 |
| App / PC / Sonos player | `9BY2` | 91025 | $0 |
| PlayerOne (not corporate-covered) | `9BY3` | 91144 | $129 one-time per player |
| Overhead messaging (monthly) | `9BY4` | 90166 | $5 |

We need IT to confirm the **real** SKUs / PartIDs and how a new location is parented to the program customer.

---

## 5. What to click on staging

1. Open [https://dm-customer-programs-staging.web.app/brokenyolk/](https://dm-customer-programs-staging.web.app/brokenyolk/).
2. Use **Find Your Setup**.
3. Pick Sonos, phone/tablet, or computer → **Set up your account**.
4. Walk checkout. Login/create do not call live Authenticate. **Place order does not process a real order.**

Wired / not sure still opens the existing sales form.

---

## 6. Files to use as the frontend reference

These are the files to copy or restyle against on the checkout server. They are also in `docs/it-handoff/`.

| File | What it is |
|---|---|
| `public/checkout/index.html` | Checkout page: steps, labels, and form fields |
| `public/assets/checkout.css` | Checkout layout (desktop + mobile) |
| `public/assets/checkout-flow.js` | Step order and which screen comes next |
| `public/assets/dm-app.css` | Dynamic Media colors, inputs, buttons |
| `public/assets/brand/DM_logo-black-blue.svg` | Header logo |
| `public/assets/brand/DM-logo-white-blue.svg` | Footer logo |
| `public/assets/program-checkout.js` | How a program page builds the cart |
| `public/assets/self-serve-modal.js` | Set up account vs talk to a rep |
| `public/programs/brokenyolk.json` | Example program catalog (placeholders) |

Deeper CRM field notes from the live walkthrough (optional): `docs/procheckout-field-contract.md`.

---

## 7. What we need back from IT

1. Can ProCheckout use this HTML/CSS as the generic checkout skin (same steps and fields, new layout)?
2. What is the supported way for a **program page** to hand a cart into AccountInfo (same `hdcartjson` post, or something else)?
3. Real **PartIDs / SKUs** for Broken Yolk (music, app player, PlayerOne, messaging if used).
4. How a **new franchisee account** is attached to the program’s parent customer.
5. Anything we must not change in the current Vue/ProCheckout field names.

We are not asking to turn on live ordering from this staging site.
