import db from "../database/DatabaseLogic.js";
import { spawn } from "child_process";
import nodemailer from "nodemailer";
import { getMonthlyCode } from "../middleware/WaveTokenLogic.js";
import { getStoredToken, storeWaveToken } from "../database/DatabaseLogic.js";

// DB Table Signal Notification Groups
const GROUPS_TABLE = "signal_notificationgroup";

// DB Table Email Notification Recipients
const EMAIL_TABLE = "email_notificationrecipient";

export async function addGroup(groupId) {
  if (!groupId) throw new Error("INVALID_GROUP_ID");

  try {
    await db.execute(`INSERT INTO ${GROUPS_TABLE} (group_id) VALUES (?)`, [groupId]);
    return { success: true, groupId };
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") throw new Error("GROUP_EXISTS");
    throw err;
  }
}

export async function removeGroup(groupId) {
  if (!groupId) throw new Error("INVALID_GROUP_ID");

  try {
    const result = await db.execute(`DELETE FROM ${GROUPS_TABLE} WHERE group_id = ?`, [groupId]);
    if (result && result.affectedRows === 0) throw new Error("GROUP_NOT_FOUND");
    return { success: true, groupId };
  } catch (err) {
    throw err;
  }
}

export async function listGroups() {
  const rows = await db.execute(`SELECT group_id FROM ${GROUPS_TABLE}`);
  return rows.map(r => r.group_id);
}

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

function sendViaSignalCli(groupId, message) {
  const cmd = process.env.SIGNAL_CLI_CMD || null;
  if (!cmd) return Promise.resolve({ ok: false, reason: "NO_SIGNAL_CLI_CMD" });

  return new Promise((resolve) => {
    const full = `${cmd} send -g ${groupId} "${message.replace(/"/g, '\\"')}"`;
    const child = spawn(full, { shell: true });
    let out = "";
    child.stdout.on("data", d => out += d.toString());
    child.stderr.on("data", d => out += d.toString());
    child.on("exit", code => resolve({ ok: code === 0, code, output: out }));
  });
}

async function sendViaSignalRest(groupId, message) {
  const base = process.env.SIGNAL_REST_API_URL || null;
  if (!base) return { ok: false, reason: "NO_SIGNAL_REST_API_URL" };

  const cleanBase = base.replace(/\/$/, "");
  const sendPath = `${cleanBase}/v1/send`;
  const groupPath = `${cleanBase}/v1/groups/${encodeURIComponent(groupId)}/send`;

  if (typeof fetch !== "function") {
    try {
      const { default: fetchPoly } = await import("node-fetch");
      global.fetch = fetchPoly;
    } catch (err) {
      return { ok: false, reason: "NO_FETCH_AVAILABLE", error: String(err) };
    }
  }

  const senderNumber = process.env.SIGNAL_FROM_NUMBER || process.env.SIGNAL_NUMBER || null;

  try {
    // try /v1/send (signal-cli-rest-api common endpoint)
    // required body: { message, number, recipients }
    let payload = { message, recipients: [groupId] };
    if (senderNumber) payload.number = senderNumber;

    let res = await fetch(sendPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const text = await res.text();
    return { ok: res.ok, status: res.status, output: text };
  } catch (err) {
    return { ok: false, reason: "REQUEST_FAILED", error: String(err) };
  }
}

export async function sendMessageToGroup(groupId, message) {
  if (process.env.SIGNAL_REST_API_URL) {
    return await sendViaSignalRest(groupId, message);
  }

  if (process.env.SIGNAL_CLI_CMD) {
    return await sendViaSignalCli(groupId, message);
  }

  console.log(`(NotificationLogic) Would send to ${groupId}: ${message}`);
  return { ok: true, output: "logged" };
}

export async function sendWaveTokenToGroup(groupId) {
  if (!groupId) throw new Error("INVALID_GROUP_ID");

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  let token = null;
  try {
    token = await getStoredToken(year, month);
    if (!token) {
      token = getMonthlyCode();
      await storeWaveToken(token);
    }
  } catch (err) {
    console.error("sendWaveTokenToGroup: failed to obtain or store token", err);
    throw err;
  }

  const standardMessage = process.env.STANDARD_NOTIFICATION_MESSAGE || "Neuer WaveToken wurde generiert. Verwende ihn zum Login.";
  const message = `${standardMessage}\n\nWaveToken: ${token}`;

  try {
    const res = await sendMessageToGroup(groupId, message);
    return res;
  } catch (err) {
    console.error("sendWaveTokenToGroup: failed to send message", err);
    throw err;
  }
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

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  let token = null;
  try {
    token = await getStoredToken(year, month);
    if (!token) {
      token = getMonthlyCode();
      await storeWaveToken(token);
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
