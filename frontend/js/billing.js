import { api } from "./api.js";
import { h, modal, toast, errorText } from "./dom.js";

const PLAN_NAMES = { starter: "Starter", basic: "Basic", plus: "Plus", premium: "Premium", max: "Max", elite: "Elite" };
const POPULAR = "plus";

function price(plan) {
  if (plan.amount == null) return "—";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: plan.currency.toUpperCase() }).format(plan.amount / 100);
}

/** Pricing dialog: picks a plan and sends the user to Stripe Checkout. */
export function openPlans(profile) {
  const currentPlan = Object.keys(PLAN_NAMES).find((id) => profile?.[PLAN_NAMES[id]]);
  return modal("Choose your plan", () => {
    const grid = h("div", { class: "plans-grid" },
      Array.from({ length: 6 }, () => h("div", { class: "plan-card skeleton" }, h("span", { class: "skel" }), h("span", { class: "skel" }))));
    const note = h("p", { class: "muted small" },
      currentPlan
        ? `You're on ${PLAN_NAMES[currentPlan]}. To switch plans, cancel it in "Manage subscription" first.`
        : "Billed monthly through Stripe. Cancel anytime.");

    api.stripePlans().then((res) => {
      const plans = res?.result || [];
      if (!plans.length) { grid.replaceChildren(h("p", { class: "muted" }, "Plans are unavailable right now.")); return; }
      grid.replaceChildren(...plans.map((plan) => {
        const current = plan.id === currentPlan;
        const btn = h("button", {
          class: `btn ${plan.id === POPULAR ? "primary" : ""} block`, type: "button", disabled: Boolean(currentPlan) || plan.amount == null,
          onclick: async () => {
            btn.disabled = true;
            btn.textContent = "Opening checkout…";
            try {
              const { payment_url } = await api.checkout(plan.id);
              location.href = payment_url;
            } catch (e) {
              toast(errorText(e));
              btn.disabled = false;
              btn.textContent = `Choose ${PLAN_NAMES[plan.id]}`;
            }
          },
        }, current ? "Current plan" : `Choose ${PLAN_NAMES[plan.id] || plan.id}`);
        return h("div", { class: `plan-card${plan.id === POPULAR ? " popular" : ""}${current ? " current" : ""}` },
          h("div", { class: "plan-head" }, h("h3", {}, PLAN_NAMES[plan.id] || plan.id),
            plan.id === POPULAR && h("span", { class: "plan-badge" }, "Popular")),
          h("div", { class: "plan-price" }, h("strong", {}, price(plan)), plan.interval && h("span", {}, `/ ${plan.interval}`)),
          h("ul", {},
            h("li", {}, `${plan.requests} credits / day · all models`),
            h("li", {}, `${plan.premium_requests} premium requests / month`),
            h("li", {}, plan.videos ? `${plan.videos} video${plan.videos === 1 ? "" : "s"} / month` : "No video generation"),
            h("li", {}, plan.voices ? `${plan.voices} cloned voice${plan.voices === 1 ? "" : "s"}` : "No voice cloning"),
            h("li", {}, `${plan.photos ?? 5} photos per message`),
            plan.voices ? h("li", {}, "Custom themes & message colors") : null),
          btn);
      }));
    }).catch((e) => grid.replaceChildren(h("p", { class: "muted" }, errorText(e))));

    return h("div", { class: "stack" }, grid, note);
  }, { wide: true });
}

/** Opens the Stripe Customer Portal (cancel, change card, invoices). */
export async function openPortal(button) {
  if (button) { button.disabled = true; button.textContent = "Opening…"; }
  try {
    const { portal_url } = await api.portal();
    location.href = portal_url;
  } catch (e) {
    toast(errorText(e));
    if (button) { button.disabled = false; button.textContent = "Manage subscription"; }
  }
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
    if (hasPlan()) { toast("Your plan is active. Enjoy Veora! 🎉", "ok"); return; }
  }
  toast("Payment received. Your plan will appear in a minute — refresh if it doesn't.", "info");
}
