export function getMonthlyCode() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();
  return `MW${year}${month}-RADIO`;
}