// Paid plans: one place for prices (rubles per 30 days) and limits.
// Limits mirror SUBSCRIPTIONS in backend/api/config.py.
export const FREE_PLAN = { requests: 25 };

export const PLANS = [
  { id: "starter", name: "Starter", rub: 499, requests: 40, premium: 8, videos: 0, voices: 0, photos: 3, note: "Unlock every model" },
  { id: "basic", name: "Basic", rub: 890, requests: 80, premium: 18, videos: 0, voices: 1, photos: 5, note: "For everyday chats" },
  { id: "plus", name: "Plus", rub: 1890, requests: 150, premium: 40, videos: 2, voices: 3, photos: 5, note: "Add video & voices", popular: true },
  { id: "premium", name: "Premium", rub: 2990, requests: 260, premium: 75, videos: 4, voices: 5, photos: 5, note: "For power users" },
  { id: "max", name: "Max", rub: 5990, requests: 520, premium: 150, videos: 8, voices: 10, photos: 5, note: "For heavy creators" },
  { id: "elite", name: "Elite", rub: 12990, requests: 1100, premium: 330, videos: 18, voices: 15, photos: 5, note: "No compromises" },
];

// "1 890 ₽": thin space between thousands, the ruble sign never wraps away from the number.
export const rubles = (n) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ₽`;
