# Dynamic Media Customer Program Landing Pages

A lightweight, zero-build system for deploying customized B2B franchise and multi-location music program landing pages on Firebase.

---

## 🚀 Quick Preview & Development

To test and preview the landing pages locally:

```bash
# Start local preview server (port 3000)
npm start
```
Then visit:
- **Broken Yolk Cafe Showcase:** [http://localhost:3000/brokenyolk/](http://localhost:3000/brokenyolk/)
- **Master Reusable Template:** [http://localhost:3000/_template/](http://localhost:3000/_template/)
- **Hub Index:** [http://localhost:3000/](http://localhost:3000/)

---

## ⚡ How to Create a New Landing Page in 2 Minutes (Using Cursor)

When your BDR or sales team lands a new account (e.g., **Plato Coffee**):

1. **Duplicate the Template Folder:**
   Copy `public/_template/` to `public/platocoffee/`.

2. **Add Company Assets:**
   Save their logo into `public/platocoffee/assets/logo.png`.

3. **Prompt Cursor:**
   Open Cursor and paste this prompt:
   > *"Here is the brief and information for Plato Coffee. Update `public/platocoffee/index.html` with their brand colors, headlines, Spotify playlist embed URL, and assign sales rep Jane Doe (jdoe@dm-us.com)."*

4. **Deploy to Firebase:**
   ```bash
   npm run deploy:hosting
   ```
   The page is instantly live at `yourdomain.com/platocoffee/`!

---

## 📬 Lead Capture & CRM Routing

Every page features an AJAX lead registration form connected to the shared Firebase Cloud Function (`/api/submitLead`).

- **Spam Defense:** Includes an invisible honeypot field (`_hp_company`) that silently drops automated bot submissions without annoying users with CAPTCHAs.
- **Routing:** Leads are emailed via Gmail SMTP directly to `sales@dm-us.com` (for CRM auto-ingest) and automatically CC'd to the assigned sales representative.
- **Direct Reply:** The email's `Reply-To` header is set to the restaurant manager's email so sales reps can reply directly in one click.

### Deploying the Cloud Function
```bash
cd functions
npm install
npm run deploy
```
To enable live Gmail delivery, set Google App Password credentials in Firebase environment secrets or `functions/.env`:
```
GMAIL_USER=your-account@gmail.com
GMAIL_PASS=your-16-char-app-password
```
*(In local development without credentials, leads are safely logged to the console so you can test forms immediately).*
