// generiert den aktuellen Monatscode
export function getMonthlyCode() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  
  return `MW${year}${month.toString().padStart(2, "0")}-RADIO`;
}