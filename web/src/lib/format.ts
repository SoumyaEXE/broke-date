// Indian-grouped rupees from integer paise. Same rules as engine/brokedate/money.py.

export function groupIndian(n: number): string {
  const neg = n < 0;
  let s = String(Math.abs(Math.trunc(n)));
  if (s.length > 3) {
    let head = s.slice(0, -3);
    const tail = s.slice(-3);
    const parts: string[] = [];
    while (head.length > 2) {
      parts.unshift(head.slice(-2));
      head = head.slice(0, -2);
    }
    if (head) parts.unshift(head);
    s = parts.join(",") + "," + tail;
  }
  return (neg ? "-" : "") + s;
}

export function inr(paise: number, decimals?: boolean): string {
  const neg = paise < 0;
  const abs = Math.abs(Math.round(paise));
  const rupees = Math.floor(abs / 100);
  const p = abs % 100;
  const show = decimals ?? p !== 0;
  return (neg ? "-" : "") + "₹" + groupIndian(rupees) + (show ? "." + String(p).padStart(2, "0") : "");
}

/** Whole rupees, for averages and model outputs where paise would be false precision. */
export function inr0(paise: number): string {
  return inr(Math.round(paise / 100) * 100);
}

export function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 10 && v <= 20) return `${n}th`;
  return n + ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] || `${n}th`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function parseISO(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

export function shortDate(d: string): string {
  const x = parseISO(d);
  return `${ordinal(x.getUTCDate())} ${MONTHS[x.getUTCMonth()]}`;
}

export function dow(d: string): string {
  return DOW[parseISO(d).getUTCDay()];
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000);
}

export function addDays(d: string, n: number): string {
  const x = parseISO(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

export function days(n: number, digits = 1): string {
  const v = Number(n.toFixed(digits));
  return `${v} day${Math.abs(v - 1) < 1e-9 ? "" : "s"}`;
}

export function pct(p: number): string {
  return `${Math.round(p * 100)}%`;
}
