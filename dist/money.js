// Money is Mongolian tögrög (₮). Prices that were designed in US dollars convert at one rate, kept here so it
// is easy to update (Oct 2026 mid-market ≈ 3,600 ₮ per US$, XE / Wise).
export const MNT_PER_USD = 3600;
// US$ → ₮, rounded to a tidy amount (whole thousands from ₮10,000 up).
export const mnt = usd => { const v = usd * MNT_PER_USD; return v >= 10000 ? Math.round(v / 1000) * 1000 : Math.round(v); };
// 1800000 → "1,800,000₮"
export const money = n => Math.round(Number(n) || 0).toLocaleString('en-US') + '₮';
// Compact form for chips and buttons: 10K₮, 2.5M₮, 1.2B₮.
export const short = n => { const a = Math.abs(n = Math.round(Number(n) || 0)); const f = (v, s) => (Math.round(v * 10) / 10).toString().replace(/\.0$/, '') + s; return (a >= 1e9 ? f(n / 1e9, 'B') : a >= 1e6 ? f(n / 1e6, 'M') : a >= 1e3 ? f(n / 1e3, 'K') : String(n)) + '₮'; };
// Campaign budgets, prices and rewards are kept in US$ (the economy is balanced in those numbers) and shown in ₮.
export const usdMoney = usd => money(mnt(usd));
