---
name: one-sheet
description: Builds a short, tracked pricing one-sheet website for a Dynamic Media prospect from call notes, in the same format as the Phenix partnership proposal (title cover, prepared for/by, numbered contents, pricing table, FAQ, contacts). Use when someone asks for a one-sheet, pricing sheet, simple proposal page, or quick customer proposal site.
---

# Pricing one-sheet

A one-sheet is a single page a customer can read in two minutes: what we're offering, what it costs, and how to start. It uses the Phenix proposal format, and visits are tracked when the customer opens their personal link.

Template: `public/one-sheet-template/index.html`. Every word on the page comes from the `SHEET` block at the top of that file. Do not edit the layout below it.

## Workflow

```
- [ ] 1. Get the inputs
- [ ] 2. Copy the template
- [ ] 3. Fill in SHEET
- [ ] 4. Add noindex headers to firebase.json
- [ ] 5. Preview at desktop and phone width
- [ ] 6. Hand off the tracked link
```

### 1. Get the inputs

Ask for anything missing, using AskQuestion:
- Customer name and who will read it (for "Prepared for").
- Prices actually quoted on the call. These override [pricing.md](../program-showcase/pricing.md). Never invent a price or a term.
- Term (month to month, or a set length) and who gets billed.
- The sender's name, title, email, and phone. The one-sheet goes out under the name of whoever is sending it. Start from `git config user.name` and `git config user.email`, and confirm title and phone with them.
- Which extras to show (PlayerOne, messaging, custom playlist, audio systems). Show only what was discussed.

### 2. Copy the template

Slug: lowercase customer name with hyphens, for example `acme-fitness`.

```powershell
Copy-Item -Recurse public\one-sheet-template public\<slug>
```

### 3. Fill in SHEET

Edit only the `SHEET` object in `public/<slug>/index.html`:
- `customer` is used everywhere `{customer}` appears.
- `eyebrow` is the label above the title: "Pricing proposal" by default, "Partnership proposal" for corporate or franchise programs.
- `summary` is one or two short paragraphs. Say what the customer asked for in their words.
- `keyTerms` rows are the deal at a glance: service, price, term, billing. Use `**bold**` for the price.
- `pricing` rows are `[name, description, price]`. Put the standard price comparison in `pricingNote` only if it was discussed.
- `faqs` answer the questions asked on the call. Remove the defaults that don't apply.
- Set any list to `[]` to drop that section. Numbering and contents update automatically.

Voice: plain, short sentences. State facts, don't sell. Nothing the contact would be embarrassed to forward to their boss.

### 4. Headers

Copy the four `one-sheet-template` blocks in `firebase.json` and change the path to `/<slug>`. Keep the `noindex` meta tag in the page.

### 5. Preview

Run `npx serve public -l 3123` and open `http://localhost:3123/<slug>/`. Check at desktop width and at 390px phone width. Nothing should scroll sideways. Local previews are never tracked.

### 6. Hand off

Production URL: `https://dm-customer-programs.web.app/<slug>/`.

Only Ryan publishes. A deploy replaces the entire live site with the `public/` folder on the deploying computer, so deploying from any other copy of the repo would take down live pages that copy doesn't have. If the person asking isn't Ryan, never run `firebase deploy`. Instead:
1. Zip the one-sheet folder: `Compress-Archive public\<slug> <slug>.zip`.
2. Write the four `firebase.json` header blocks into a text file next to it.
3. Tell them to email both to Ryan, who unzips into `public\`, adds the headers, and deploys.

When Ryan asks to publish: commit only the new folder and its `firebase.json` blocks, then run `firebase deploy --only hosting --project default --non-interactive`.

Tracked links:
- Send each reader their own link: `https://dm-customer-programs.web.app/<slug>/?r=first-last`. Visits show up under that name, with sections read and time spent.
- If they forward it, the forwarded visits show as "forwarded from" that person.
- Before opening the page yourself, open any page once with `?notrack=1` in each browser you use, so your own visits aren't counted.
