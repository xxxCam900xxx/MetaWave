import { getCurrentTokenPeriod, getMonthlyCode } from "../middleware/WaveTokenLogic.js";
import db from "../database/DatabaseLogic.js";
import nodemailer from "nodemailer";
import { getStoredToken, storeWaveToken } from "../database/DatabaseLogic.js";

// DB Table Email Notification Recipients
const EMAIL_TABLE = "email_notificationrecipient";

export async function addEmail(email) {
  if (!email || typeof email !== "string") throw new Error("INVALID_EMAIL");

  const trimmed = email.trim();
  if (!trimmed || !trimmed.includes("@")) throw new Error("INVALID_EMAIL");

  try {
    await db.execute(`INSERT INTO ${EMAIL_TABLE} (email) VALUES (?)`, [trimmed]);
    return { success: true, email: trimmed };
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") throw new Error("EMAIL_EXISTS");
    throw err;
  }
}

export async function removeEmail(email) {
  if (!email || typeof email !== "string") throw new Error("INVALID_EMAIL");

  const trimmed = email.trim();
  if (!trimmed) throw new Error("INVALID_EMAIL");

  try {
    const result = await db.execute(`DELETE FROM ${EMAIL_TABLE} WHERE email = ?`, [trimmed]);
    if (result && result.affectedRows === 0) throw new Error("EMAIL_NOT_FOUND");
    return { success: true, email: trimmed };
  } catch (err) {
    throw err;
  }
}

export async function listEmailRecipients() {
  const rows = await db.execute(`SELECT email FROM ${EMAIL_TABLE}`);
  return rows.map(r => r.email);
}

let emailTransporter = null;

async function getEmailTransporter() {
  if (emailTransporter) return emailTransporter;

  const host = process.env.SMTP_HOST || null;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465;
  const user = process.env.SMTP_USER || null;
  const pass = process.env.SMTP_PASS || null;

  if (!host || !user || !pass) {
    console.warn("Email transport not fully configured (SMTP_HOST/SMTP_USER/SMTP_PASS missing)");
    return null;
  }

  emailTransporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass }
  });

  return emailTransporter;
}

async function sendEmailInternal(to, subject, text) {
  const transporter = await getEmailTransporter();
  if (!transporter) return { ok: false, reason: "NO_SMTP_CONFIG" };

  const from = process.env.EMAIL_FROM || process.env.SMTP_USER;

  try {
    const info = await transporter.sendMail({ from, to, subject, text });
    return { ok: true, messageId: info.messageId, response: info.response };
  } catch (err) {
    console.error("Failed to send email:", err);
    return { ok: false, reason: "SEND_FAILED", error: String(err) };
  }
}

const EMAIL_NOTIFICATION_SUBJECT = process.env.EMAIL_NOTIFICATION_SUBJECT || "Dein neuer MetaWave WaveToken";

export async function sendEmailNotification(to, message) {
  return await sendEmailInternal(to, EMAIL_NOTIFICATION_SUBJECT, message);
}

export async function sendWaveTokenToEmail(email) {
  if (!email || typeof email !== "string") throw new Error("INVALID_EMAIL");

  const trimmed = email.trim();
  if (!trimmed) throw new Error("INVALID_EMAIL");

  const { year, month } = getCurrentTokenPeriod();

  let token = null;
  try {
    token = await getStoredToken(year, month);
    if (!token) {
      token = getMonthlyCode({ year, month });
      await storeWaveToken(token, year, month);
    }
  } catch (err) {
    console.error("sendWaveTokenToEmail: failed to obtain or store token", err);
    throw err;
  }

  const standardMessage = process.env.STANDARD_NOTIFICATION_MESSAGE || "Neuer WaveToken wurde generiert. Verwende ihn zum Login.";
  const message = `${standardMessage}\n\nWaveToken: ${token}`;

  try {
    const res = await sendEmailNotification(trimmed, message);
    return res;
  } catch (err) {
    console.error("sendWaveTokenToEmail: failed to send email", err);
    throw err;
  }
}
