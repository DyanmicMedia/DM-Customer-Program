const crypto = require("crypto");
const { onRequest } = require("firebase-functions/v2/https");

/** Proposals offered in the admin link builder. Any tracked page still reports, listed or not. */
const PROPOSALS = [
  { slug: "englewood", title: "Englewood Health Radio", customer: "Englewood Health" }
];

const SITE = "https://dm-customer-programs.web.app";
const ALERT_EVERY_MS = 30 * 60 * 1000;
const MAX_ALERTS_PER_HOUR = 40;
const SLUG = /^[a-z0-9][a-z0-9._-]{0,59}$/;
const VID = /^[a-z0-9]{8,40}$/;
/** PostHog session ids (UUIDv7). A visit can span more than one if it sits idle past 30 minutes. */
const SESSION = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let db;
function firestore() {
  if (!db) {
    const admin = require("firebase-admin");
    if (!admin.apps.length) admin.initializeApp();
    db = admin.firestore();
  }
  return db;
}

const pretty = (slug) => (slug || "").split(/[-_.]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
const slugOrNull = (v) => (typeof v === "string" && SLUG.test(v.trim().toLowerCase()) ? v.trim().toLowerCase() : null);
const proposalTitle = (slug, fallback) =>
  (PROPOSALS.find((p) => p.slug === slug) || {}).title ||
  String(fallback || slug).split("|")[0].trim().slice(0, 120);
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function parseBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  try {
    return JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString("utf8") : req.rawBody ? req.rawBody.toString("utf8") : req.body || "{}");
  } catch (e) {
    return {};
  }
}

function deviceLabel(ua) {
  ua = ua || "";
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" :
    /Windows/.test(ua) ? "Windows" : /Macintosh|Mac OS X/.test(ua) ? "Mac" : /CrOS/.test(ua) ? "Chromebook" : "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" :
    /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
  return browser ? `${os}, ${browser}` : os;
}

function cleanSections(input) {
  const out = {};
  if (!input || typeof input !== "object") return out;
  for (const [k, v] of Object.entries(input).slice(0, 40)) {
    const name = String(k).replace(/[.\[\]*~/`]/g, " ").trim().slice(0, 80);
    const secs = Math.max(0, Math.min(3600, Math.round(Number(v) || 0)));
    if (name && secs) out[name] = secs;
  }
  return out;
}

async function sendAlert({ proposal, title, person, via, device, visitNumber }) {
  if ((process.env.GCLOUD_PROJECT || "") !== "dm-customer-programs") return;
  const to = (process.env.ALERT_TO || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!to.length || !process.env.SMTP_USER || !process.env.SMTP_PASS) return;

  const fs = firestore();
  const key = `${proposal}__${person ? "p-" + person : "f-" + via}`;
  const hour = new Date().toISOString().slice(0, 13);
  const allowed = await fs.runTransaction(async (tx) => {
    const logRef = fs.collection("proposalAlerts").doc(key);
    const capRef = fs.collection("proposalAlertCaps").doc(hour);
    const [log, cap] = await Promise.all([tx.get(logRef), tx.get(capRef)]);
    if (log.exists && Date.now() - log.get("lastAt") < ALERT_EVERY_MS) return false;
    if ((cap.exists ? cap.get("count") : 0) >= MAX_ALERTS_PER_HOUR) return false;
    tx.set(logRef, { lastAt: Date.now() });
    tx.set(capRef, { count: (cap.exists ? cap.get("count") : 0) + 1 });
    return true;
  });
  if (!allowed) return;

  const when = new Date().toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " ET";
  const headline = person
    ? `${pretty(person)} opened ${title}${visitNumber > 1 ? ` (visit ${visitNumber})` : ""}`
    : `Someone opened ${title}, forwarded by ${pretty(via)}`;
  const adminUrl = `${SITE}/admin/#activity`;
  const pageUrl = `${SITE}/${proposal}/`;

  const nodemailer = require("nodemailer");
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: `[Proposal] ${headline}`,
    text: `${headline}\n\n${when}\n${device}\n\nProposal: ${pageUrl}\nActivity: ${adminUrl}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;color:#0f172a">
  <p style="font-size:18px;font-weight:700;margin:0 0 6px">${escapeHtml(headline)}</p>
  <p style="margin:0;color:#475569">${escapeHtml(when)} &middot; ${escapeHtml(device)}</p>
  <p style="margin:18px 0 0"><a href="${adminUrl}" style="color:#0f766e;font-weight:700">See activity</a> &nbsp;&middot;&nbsp; <a href="${pageUrl}" style="color:#0f766e">Open the proposal</a></p>
  <p style="margin:18px 0 0;font-size:12px;color:#94a3b8">One alert per person per proposal every 30 minutes. Reading time and sections appear in the activity view as the visit goes on.</p>
</div>`
  });
}

/**
 * POST /api/proposal-event. Sent by assets/dm-track.js for tracked visitors only.
 * type "open": a visit started (alerts the team). type "update": cumulative reading time for that visit.
 */
exports.proposalEvent = onRequest({ cors: false, memory: "256MiB", maxInstances: 5 }, async (req, res) => {
  if (req.method !== "POST") return res.status(405).send("POST only");
  const b = parseBody(req);
  const proposal = slugOrNull(b.proposal);
  const vid = typeof b.vid === "string" && VID.test(b.vid) ? b.vid : null;
  const person = slugOrNull(b.person);
  const via = person ? null : slugOrNull(b.via);
  if (!proposal || !vid || (!person && !via)) return res.status(204).end();

  const fs = firestore();
  const ref = fs.collection("proposalVisits").doc(vid);
  const now = Date.now();
  try {
    if (b.type === "open") {
      const snap = await ref.get();
      if (snap.exists) return res.status(204).end();
      const ua = String(req.get("user-agent") || "").slice(0, 300);
      const title = proposalTitle(proposal, b.title);
      const device = deviceLabel(ua);
      let visitNumber = 1;
      if (person) {
        const prior = await fs.collection("proposalVisits").where("proposal", "==", proposal).where("person", "==", person).count().get();
        visitNumber = prior.data().count + 1;
      }
      // Proposal Studio's site reports here too, and the two can share a slug.
      const site = String(req.get("x-forwarded-host") || req.get("host") || "").split(",")[0].trim().toLowerCase().slice(0, 100);
      await ref.set({ proposal, title, person, via, device, ua, site, startedAt: now, lastAt: now, seconds: 0, sections: {}, printed: false, emailClicked: false, visitNumber });
      try {
        await sendAlert({ proposal, title, person, via, device, visitNumber });
      } catch (err) {
        console.error("proposal alert failed", err);
      }
    } else if (b.type === "update") {
      const update = { lastAt: now, seconds: Math.max(0, Math.min(14400, Math.round(Number(b.seconds) || 0))) };
      const sections = cleanSections(b.sections);
      if (Object.keys(sections).length) update.sections = sections;
      if (b.printed === true) update.printed = true;
      if (b.emailClicked === true) update.emailClicked = true;
      if (typeof b.session === "string" && SESSION.test(b.session)) {
        update.sessions = require("firebase-admin").firestore.FieldValue.arrayUnion(b.session.toLowerCase());
      }
      // An update that beats its "open" is dropped (the next one, 30 seconds on, lands) rather than
      // creating a visit with no proposal or person on it.
      await ref.update(update).catch((err) => { if (err.code !== 5) throw err; });
    }
  } catch (err) {
    console.error("proposalEvent failed", err);
  }
  return res.status(204).end();
});

function authorized(req) {
  const given = Buffer.from(String(req.get("x-admin-key") || ""));
  const expected = Buffer.from(String(process.env.ADMIN_PASSCODE || ""));
  return expected.length > 0 && given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

/** GET /api/admin/proposals and /api/admin/activity?days=N, for public/admin/. Requires the x-admin-key header. */
exports.proposalAdmin = onRequest({ cors: false, memory: "256MiB", maxInstances: 3 }, async (req, res) => {
  res.set("Cache-Control", "no-store");
  if (!authorized(req)) return res.status(401).json({ error: "Wrong passcode" });
  const path = req.path.replace(/^\/api\/admin/, "");

  if (path === "/proposals") return res.json({ site: SITE, proposals: PROPOSALS });

  if (path === "/activity") {
    const days = Math.max(1, Math.min(365, Number(req.query.days) || 60));
    const snap = await firestore().collection("proposalVisits")
      .where("startedAt", ">=", Date.now() - days * 86400000)
      .orderBy("startedAt", "desc").limit(1000).get();
    const visits = snap.docs.map((d) => {
      const v = d.data();
      return { id: d.id, proposal: v.proposal, title: v.title, person: v.person, personName: v.person ? pretty(v.person) : null,
        via: v.via, viaName: v.via ? pretty(v.via) : null, device: v.device, startedAt: v.startedAt, lastAt: v.lastAt,
        seconds: v.seconds || 0, sections: v.sections || {}, printed: !!v.printed, emailClicked: !!v.emailClicked, sessions: v.sessions || [] };
    });
    return res.json({ days, visits });
  }
  return res.status(404).json({ error: "Not found" });
});
