import { h, icon, modal, toast } from "./dom.js";
import { lang } from "./i18n.js";
import { PLANS, rubles } from "./plans.js";
import { CONTACT_EMAIL } from "./legal.js";

const PLAN_NAMES = Object.fromEntries(PLANS.map((p) => [p.id, p.name]));
// Online payment is being moved to YooKassa; until it's live the buttons show a "coming soon" notice.
const PAYMENTS_READY = false;

/** Pricing dialog with the ruble prices. */
export function openPlans(profile) {
  const currentPlan = PLANS.find((p) => profile?.[p.name])?.id;
  return modal("Choose your plan", () => {
    const note = h("p", { class: "muted small" },
      currentPlan
        ? `You're on ${PLAN_NAMES[currentPlan]}. To switch plans, cancel it in "Manage subscription" first.`
        : "Prices in rubles for 30 days. Cancel anytime.");
    const soon = !PAYMENTS_READY && h("div", { class: "plans-soon", role: "status" },
      h("span", { class: "plans-soon-icon", "aria-hidden": "true" }, icon("spark")),
      h("span", { class: "plans-soon-text" },
        h("strong", {}, "Online payment is coming very soon"),
        h("span", {}, "We're connecting payment by Russian cards and SBP. Subscriptions will open in the next few days.")));

    const grid = h("div", { class: "plans-grid" }, PLANS.map((plan) => {
      const current = plan.id === currentPlan;
      const btn = h("button", {
        class: `plan-btn${plan.popular ? " primary" : ""}${PAYMENTS_READY || current ? "" : " soon"}`, type: "button", disabled: current,
        onclick: () => {
          if (!PAYMENTS_READY) {
            toast("Online payment is coming very soon. Subscriptions will open in the next few days.", "info");
            return;
          }
        },
      }, current ? "Current plan" : PAYMENTS_READY ? `Choose ${plan.name}` : "Coming soon");
      return h("div", { class: `plan-card${plan.popular ? " popular" : ""}${current ? " current" : ""}` },
        h("div", { class: "plan-head" }, h("h3", {}, plan.name),
          plan.popular && h("span", { class: "plan-badge" }, "Popular")),
        h("p", { class: "plan-note" }, plan.note),
        h("div", { class: "plan-price" }, h("strong", {}, rubles(plan.rub)), h("span", {}, "/ month")),
        h("ul", {},
          h("li", {}, `${plan.requests} credits / day · all models`),
          h("li", {}, `${plan.premium} premium requests / month`),
          h("li", {}, plan.videos ? `${plan.videos} video${plan.videos === 1 ? "" : "s"} / month` : "No video generation"),
          h("li", {}, plan.voices ? `${plan.voices} cloned voice${plan.voices === 1 ? "" : "s"}` : "No voice cloning"),
          h("li", {}, `${plan.photos} photos per message`),
          plan.voices ? h("li", {}, "Custom themes & message colors") : null),
        btn);
    }));
    // Soft light that follows the cursor, like the cards on the landing page.
    grid.addEventListener("pointermove", (e) => {
      const card = e.target.closest(".plan-card");
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - r.left}px`);
      card.style.setProperty("--my", `${e.clientY - r.top}px`);
    });

    return h("div", { class: "stack plans" }, soon, grid, h("div", { class: "plans-foot" }, note, plansConsent()));
  }, { wide: true });
}

/** Subscription management: a placeholder until YooKassa subscriptions are live. */
export async function openPortal() {
  toast(`Subscription management is coming soon. If you need help with your plan, write to ${CONTACT_EMAIL}.`, "info");
}

/**
 * Handles ?checkout=success|cancel and ?portal=return after Stripe redirects back.
 * The plan is switched on by the webhook, so on success we poll the profile until it shows up.
 */
export async function handleBillingReturn({ reloadProfile, hasPlan }) {
  const params = new URLSearchParams(location.search);
  const checkout = params.get("checkout");
  const portal = params.get("portal");
  if (!checkout && !portal) return;
  history.replaceState(null, "", location.pathname + location.hash);

  if (checkout === "cancel") { toast("Checkout canceled — no charge was made.", "info"); return; }
  if (portal) { await reloadProfile(); toast("Subscription settings updated.", "info"); return; }

  toast("Payment received — activating your plan…", "info");
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    await reloadProfile();
    if (hasPlan()) { toast("Your plan is active. Enjoy Veora!", "ok"); return; }
  }
  toast("Payment received. Your plan will appear in a minute — refresh if it doesn't.", "info");
}

// Required before paying: the offer, auto-renewal and refunds (opens in a new tab so checkout isn't lost).
function plansConsent() {
  const link = (hash, text) => h("a", { href: `${location.pathname}#${hash}`, target: "_blank", rel: "noopener" }, text);
  return h("p", { class: "muted small plans-legal" }, ...(lang === "ru"
    ? ["Оформляя подписку, вы принимаете ", link("offer", "договор-оферту"), ", соглашаетесь на автоматическое продление раз в 30 дней и ", link("refund", "условия возврата"), "."]
    : ["By subscribing you accept the ", link("offer", "public offer"), ", agree to automatic renewal every 30 days and the ", link("refund", "refund policy"), "."]));
}
