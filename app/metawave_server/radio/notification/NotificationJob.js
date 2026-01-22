import db from "../database/DatabaseLogic.js";
import { getMonthlyCode } from "../middleware/WaveTokenLogic.js";
import { listGroups, sendMessageToGroup } from "./NotificationLogic.js";
import { tokenExists, getStoredToken, storeWaveToken } from "../database/DatabaseLogic.js";

const GROUPS_TABLE = "signal_notificationgroup";

export async function runNotificationJob(force = false) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

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
        token = getMonthlyCode();
        await storeWaveToken(token);
      }
    } else {
      token = getMonthlyCode();
      try {
        await storeWaveToken(token);
      } catch (err) {
        console.error("Failed to store wave token:", err);
      }
    }
  } catch (err) {
    console.error("NotificationJob: error while preparing/storing token:", err);
    if (!token) token = getMonthlyCode();
  }

  // Standard message
  const standardMessage = process.env.STANDARD_NOTIFICATION_MESSAGE || "Neuer WaveToken wurde generiert. Verwende ihn zum Login.";
  const message = `${standardMessage}\n\nWaveToken: ${token}`;

  // Fetch all groups
  let groups = [];
  try {
    groups = await listGroups();
  } catch (err) {
    const rows = await db.execute(`SELECT group_id FROM ${GROUPS_TABLE}`);
    groups = rows.map(r => r.group_id);
  }

  for (const g of groups) {
    try {
      const res = await sendMessageToGroup(g, message);
      if (!res.ok) console.warn(`NotificationJob: failed to send to ${g}`, res);
    } catch (err) {
      console.error("Error sending to group", g, err);
    }
  }

  return token;
}

export default { runNotificationJob };
