// generiert den aktuellen Monatscode
import { getStoredToken } from "../database/DatabaseLogic.js";

export function getCurrentTokenPeriod(now = new Date()) {
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1
  };
}

// generiert den aktuellen Monatscode
export function getMonthlyCode({ year, month } = getCurrentTokenPeriod()) {
  
  return `MW${year}${month.toString().padStart(2, "0")}-RADIO`;
}

// Liefert den in der DB gespeicherten Token für den aktuellen Monat (oder null)
export async function getStoredTokenForCurrentMonth() {
  const { year, month } = getCurrentTokenPeriod();
  try {
    return await getStoredToken(year, month);
  } catch (err) {
    console.error("getStoredTokenForCurrentMonth: DB error", err);
    return null;
  }
}