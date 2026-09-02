import { getCurrentTokenPeriod, getMonthlyCode } from "../middleware/WaveTokenLogic.js";
import { listEmailRecipients, sendEmailNotification } from "./NotificationLogic.js";
import { tokenExists, getStoredToken, storeWaveToken } from "../database/DatabaseLogic.js";

export async function runNotificationJob(force = false) {
  const { year, month } = getCurrentTokenPeriod();

  try {
    if (!force && await tokenExists(year, month)) {
      console.log("NotificationJob: wave token already generated for this month — skipping job.");
      const existing = await getStoredToken(year, month);
      return existing; // only return stored value
    }
  } catch (err) {
    console.error("NotificationJob: failed to check existing tokens:", err);
  }

  let token;
  try {
    if (force) {
      const existing = await getStoredToken(year, month);
      if (existing) {
        token = existing; // reuse existing token when forcing
      } else {
        token = getMonthlyCode({ year, month });
        await storeWaveToken(token, year, month);
      }
    } else {
      token = getMonthlyCode({ year, month });
      await storeWaveToken(token, year, month);
    }
  } catch (err) {
    console.error("NotificationJob: error while preparing/storing token:", err);
    throw err;
  }

  // Standard message
  const standardMessage = process.env.STANDARD_NOTIFICATION_MESSAGE || "Neuer WaveToken wurde generiert. Verwende ihn zum Login.";
  const message = `${standardMessage}\n\nWaveToken: ${token}`;

  // Fetch all email recipients
  let emails = [];
  try {
    emails = await listEmailRecipients();
  } catch (err) {
    console.error("NotificationJob: failed to list email recipients:", err);
  }

  for (const e of emails) {
    try {
      const res = await sendEmailNotification(e, message);
      if (!res.ok) console.warn(`NotificationJob: failed to send email to ${e}`, res);
    } catch (err) {
      console.error("Error sending email to", e, err);
    }
  }

  return token;
}

export default { runNotificationJob };
