// Plain-date helpers, all dates are 'YYYY-MM-DD' strings in local time.

function todayStr(d = new Date()) {
  return toStr(d);
}

function toStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parse(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(dateStr, n) {
  const d = parse(dateStr);
  d.setDate(d.getDate() + n);
  return toStr(d);
}

// Monday = 0 ... Sunday = 6
function weekday(dateStr) {
  const jsDay = parse(dateStr).getDay(); // Sun=0..Sat=6
  return (jsDay + 6) % 7;
}

function isMonday(dateStr) {
  return weekday(dateStr) === 0;
}

function startOfWeek(dateStr) {
  return addDays(dateStr, -weekday(dateStr));
}

function startOfMonth(dateStr) {
  const d = parse(dateStr);
  return toStr(new Date(d.getFullYear(), d.getMonth(), 1));
}

function daysInMonth(year, month1to12) {
  return new Date(year, month1to12, 0).getDate();
}

function monthKey(dateStr) {
  return dateStr.slice(0, 7); // YYYY-MM
}

module.exports = { todayStr, toStr, parse, addDays, weekday, isMonday, startOfWeek, startOfMonth, daysInMonth, monthKey };
