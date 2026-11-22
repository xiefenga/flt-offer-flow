/** @param {string | null | undefined} value */
export function formatDateTime(value, precision = "second") {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  const pad = (n) => String(n).padStart(2, "0");
  const day = [
    String(date.getFullYear()).padStart(4, "0"),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-");
  const time = [pad(date.getHours()), pad(date.getMinutes())];
  if (precision === "second") {
    time.push(pad(date.getSeconds()));
  }
  return day + " " + time.join(":");
}
