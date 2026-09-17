const { onRequest } = require("firebase-functions/v2/https");

/**
 * Nodemailer is loaded lazily so Firebase deploy analysis does not time out.
 * Supports GMAIL_USER/GMAIL_PASS or SMTP_* vars from functions/.env
 */
function getMailTransporter() {
  const nodemailer = require("nodemailer");
  const user = process.env.GMAIL_USER || process.env.SMTP_USER;
  const pass = process.env.GMAIL_PASS || process.env.SMTP_PASS;

  if (!user || !pass) {
    return null;
  }

  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 465),
      secure: String(process.env.SMTP_SECURE || "true").toLowerCase() === "true",
      auth: { user, pass }
    });
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass }
  });
}

function getMailFromAddress() {
  return process.env.SMTP_FROM || process.env.GMAIL_USER || process.env.SMTP_USER;
}

const PROD_PROJECT_ID = "dm-customer-programs";

function getProjectId() {
  return process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "";
}

function isProductionProject() {
  return getProjectId() === PROD_PROJECT_ID;
}

function getLeadRecipients(salesmanEmail) {
  if (!isProductionProject()) {
    return { to: process.env.LEAD_TO_EMAIL || null, cc: [], subjectPrefix: "[STAGING] " };
  }

  const to = process.env.LEAD_TO_EMAIL || "sales@dm-us.com";
  const cc = (salesmanEmail && salesmanEmail !== to) ? [salesmanEmail] : [];
  return { to, cc, subjectPrefix: "" };
}

/**
 * Cloud Function: submitLead
 * Receives form submission from customer program landing pages,
 * validates data, rejects honeypot spam, and emails sales@dm-us.com + assigned rep.
 */
exports.submitLead = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed. Use POST." });
  }

  try {
    const {
      _hp_company,
      programId = "general",
      programName = "Customer Music Program",
      locationName,
      locationAddress = "Not provided",
      contactName,
      contactTitle = "Franchisee / Location Manager",
      contactEmail,
      contactPhone,
      hardwarePreference = "PlayerOne ($199)",
      currentAudio = "Not specified",
      notes = "None",
      salesmanEmail
    } = req.body || {};

    if (_hp_company) {
      return res.status(200).json({ success: true, message: "Lead received." });
    }

    if (!contactName || !contactEmail || !locationName) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: contactName, contactEmail, and locationName are required."
      });
    }

    const plainTextBody = `
=============================================
NEW CUSTOMER PROGRAM LEAD: ${programName.toUpperCase()}
=============================================

Program ID: ${programId}
Location Name / Store #: ${locationName}
Location Address: ${locationAddress}

CONTACT DETAILS:
Contact Name: ${contactName}
Title / Role: ${contactTitle}
Email: ${contactEmail}
Phone: ${contactPhone || "Not provided"}

AUDIO & HARDWARE REQUIREMENTS:
Hardware Preference: ${hardwarePreference}
Current Audio System: ${currentAudio}
Special Notes / Requests: ${notes}

ROUTING:
Assigned Sales Rep: ${salesmanEmail || "sales@dm-us.com"}
Submitted At: ${new Date().toISOString()}
=============================================
`.trim();

    const htmlBody = `
<div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; color: #1a202c;">
  <div style="background-color: #0d1b2a; padding: 20px; color: #ffffff;">
    <h2 style="margin: 0; font-size: 20px; font-weight: 700;">New Customer Program Lead</h2>
    <p style="margin: 4px 0 0; color: #94a3b8; font-size: 14px;">Program: <strong>${programName}</strong></p>
  </div>
  
  <div style="padding: 24px; background-color: #ffffff;">
    <div style="background-color: #f8fafc; border-left: 4px solid #0284c7; padding: 14px 18px; margin-bottom: 20px; border-radius: 4px;">
      <h3 style="margin: 0 0 4px; font-size: 16px; color: #0f172a;">${locationName}</h3>
      <p style="margin: 0; font-size: 14px; color: #64748b;">${locationAddress}</p>
    </div>

    <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 24px;">
      <tr>
        <td style="padding: 8px 0; color: #64748b; width: 140px;"><strong>Contact Person:</strong></td>
        <td style="padding: 8px 0; color: #0f172a;">${contactName} (${contactTitle})</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #64748b;"><strong>Email:</strong></td>
        <td style="padding: 8px 0;"><a href="mailto:${contactEmail}" style="color: #0284c7; text-decoration: none;">${contactEmail}</a></td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #64748b;"><strong>Phone:</strong></td>
        <td style="padding: 8px 0; color: #0f172a;">${contactPhone || "Not provided"}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #64748b;"><strong>Hardware Choice:</strong></td>
        <td style="padding: 8px 0; color: #0f172a;"><strong>${hardwarePreference}</strong></td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #64748b;"><strong>Current Audio:</strong></td>
        <td style="padding: 8px 0; color: #0f172a;">${currentAudio}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; color: #64748b;"><strong>Notes / Requests:</strong></td>
        <td style="padding: 8px 0; color: #0f172a;">${notes}</td>
      </tr>
    </table>

    <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 13px; color: #64748b;">
      <p style="margin: 0;">Hit <strong>Reply</strong> to respond directly to <strong>${contactName}</strong> at ${contactEmail}.</p>
    </div>
  </div>
</div>
`.trim();

    const transporter = getMailTransporter();
    const recipients = getLeadRecipients(salesmanEmail);

    if (transporter && recipients.to) {
      await transporter.sendMail({
        from: `"Dynamic Media Programs" <${getMailFromAddress()}>`,
        to: recipients.to,
        cc: recipients.cc,
        replyTo: contactEmail,
        subject: `${recipients.subjectPrefix}[Lead] ${programName} - ${locationName}`,
        text: plainTextBody,
        html: htmlBody
      });
    } else {
      console.log("--- LOCAL / STAGING LEAD RECEIVED (SMTP credentials not set or non-prod inbox missing) ---");
      console.log(plainTextBody);
    }

    return res.status(200).json({
      success: true,
      message: "Thank you! Your location request has been received. A Dynamic Media specialist will be in touch shortly."
    });
  } catch (err) {
    console.error("Error submitting lead:", err);
    return res.status(500).json({
      success: false,
      error: "An unexpected error occurred while processing your request. Please call 1-844-229-1217 directly."
    });
  }
});
