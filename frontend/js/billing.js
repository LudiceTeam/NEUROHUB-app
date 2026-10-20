import { api } from "./api.js";
import { h, icon, modal, toast, errorText, confirmModal } from "./dom.js";
import { lang } from "./i18n.js";
import { PLANS, rubles } from "./plans.js";
import { CONTACT_EMAIL } from "./legal.js";

const PLAN_NAMES = Object.fromEntries(PLANS.map((p) => [p.id, p.name]));
// Payments go through YooKassa (Russian cards and SBP). false shows a "coming soon" notice instead.
const PAYMENTS_READY = true;

/** Pricing dialog with the ruble prices. */
export function openPlans(profile) {
  const currentPlan = PLANS.find((p) => profile?.[p.name])?.id;
  return modal("Choose your plan", () => {
    const note = h("p", { class: "muted small" },
      currentPlan
        ? `You're on ${PLAN_NAMES[currentPlan]}. To switch plans, cancel it in "Manage subscription" first.`
        : "Prices in rubles for 30 days. Cancel anytime.");
    const soon = (!PAYMENTS_READY || null) && h("div", { class: "plans-soon", role: "status" },
      h("span", { class: "plans-soon-icon", "aria-hidden": "true" }, icon("spark")),
      h("span", { class: "plans-soon-text" },
        h("strong", {}, "Online payment is coming very soon"),
        h("span", {}, "We're connecting payment by Russian cards and SBP. Subscriptions will open in the next few days.")));

    const grid = h("div", { class: "plans-grid" }, PLANS.map((plan) => {
      const current = plan.id === currentPlan;
      const label = current ? "Current plan" : PAYMENTS_READY ? `Choose ${plan.name}` : "Coming soon";
      const btn = h("button", {
        class: `plan-btn${plan.popular ? " primary" : ""}${PAYMENTS_READY || current ? "" : " soon"}`, type: "button",
        // One plan at a time: switching means turning off auto-renewal and waiting for the period to end.
        disabled: current || (PAYMENTS_READY && Boolean(currentPlan)),
        onclick: async () => {
          if (!PAYMENTS_READY) {
            toast("Online payment is coming very soon. Subscriptions will open in the next few days.", "info");
            return;
          }
          btn.disabled = true;
          btn.textContent = "Opening payment…";
          try {
            const { payment_url } = await api.yookassaCheckout(plan.id);
            location.href = payment_url;
          } catch (e) {
            toast(errorText(e));
            btn.disabled = false;
            btn.textContent = label;
          }
        },
      }, label);
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

/** Subscription management: plan, next charge, saved card, auto-renewal. */
export function openPortal() {
  return modal("Subscription", (close) => {
    const body = h("div", { class: "sub" },
      h("div", { class: "sub-hero skeleton" }, h("span", { class: "skel" }), h("span", { class: "skel skel-small" })),
      h("span", { class: "skel" }));
    const date = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

    async function setAutoRenew(sub, on, input) {
      if (!on && !(await confirmModal("Turn off auto-renewal?",
        `Your plan stays active until ${date(sub.period_end)}, then it switches to Free. No more charges.`, { confirm: "Turn off", danger: true }))) {
        input.checked = true;
        return;
      }
      input.disabled = true;
      try {
        await (on ? api.yookassaResume() : api.yookassaCancel());
        toast(on ? "Auto-renewal is on" : "Auto-renewal is off", "ok");
      } catch (e) { toast(errorText(e)); }
      load();
    }

    async function unlink(sub) {
      if (!(await confirmModal("Unlink card?",
        `The card will be removed from Veora and won't be charged again. Your plan stays active until ${date(sub.period_end)}.`,
        { confirm: "Unlink", danger: true }))) return;
      try {
        await api.yookassaUnlink();
        toast("Card unlinked", "ok");
        load();
      } catch (e) { toast(errorText(e)); }
    }

    function empty() {
      return h("div", { class: "sub-empty" },
        h("span", { class: "sub-empty-icon" }, icon("card")),
        h("h3", {}, "No active subscription"),
        h("p", { class: "muted" }, "Pick a plan to unlock every model, the studios and more requests."),
        h("button", { class: "plan-btn primary", type: "button", onclick: () => { close(); openPlans(null); } }, "Choose a plan"),
        h("p", { class: "muted small" }, `Paid another way or need help? Write to ${CONTACT_EMAIL}.`));
    }

    async function load() {
      let sub = null;
      try { sub = (await api.yookassaSubscription())?.result; } catch (e) { body.replaceChildren(h("p", { class: "muted" }, errorText(e))); return; }
      if (!sub) { body.replaceChildren(empty()); return; }

      const plan = PLANS.find((p) => p.id === sub.plan);
      const hasCard = Boolean(sub.card || sub.can_renew);
      const toggle = h("input", {
        type: "checkbox", class: "vs-switch", checked: sub.auto_renew, disabled: !sub.auto_renew && !sub.can_renew,
        "aria-label": "Auto-renewal", onchange: (e) => setAutoRenew(sub, e.target.checked, e.target),
      });

      body.replaceChildren(
        h("div", { class: "sub-hero" },
          h("div", { class: "sub-hero-top" },
            h("div", {}, h("small", {}, "Your plan"), h("strong", { class: "sub-plan" }, plan?.name || sub.plan)),
            h("span", { class: `sub-status ${sub.auto_renew ? "on" : "off"}` }, sub.auto_renew ? "Active" : "Ends soon")),
          sub.price && h("div", { class: "sub-price" }, h("strong", {}, rubles(sub.price)), h("span", {}, "/ month")),
          plan && h("div", { class: "sub-limits" },
            h("span", {}, `${plan.requests} credits / day`),
            h("span", {}, `${plan.premium} premium / month`),
            plan.videos > 0 && h("span", {}, `${plan.videos} video${plan.videos === 1 ? "" : "s"} / month`))),

        h("div", { class: "sub-rows" },
          h("div", { class: "sub-row" },
            h("span", { class: "sub-row-icon" }, icon("calendar")),
            h("div", { class: "sub-row-text" },
              h("small", {}, sub.auto_renew ? "Next charge" : "Active until"),
              h("strong", {}, date(sub.period_end)))),
          h("div", { class: "sub-row" },
            h("span", { class: "sub-row-icon" }, icon("card")),
            h("div", { class: "sub-row-text" },
              h("small", {}, "Payment card"),
              h("strong", { class: hasCard ? "" : "muted" }, hasCard ? sub.card || "Linked" : "Not linked")),
            hasCard && h("button", { class: "sub-link danger-text", type: "button", onclick: () => unlink(sub) }, "Unlink card")),
          h("label", { class: "sub-row sub-toggle" },
            h("span", { class: "sub-row-icon" }, icon("refresh")),
            h("div", { class: "sub-row-text" },
              h("small", {}, "Auto-renewal"),
              h("strong", {}, sub.auto_renew ? "Renews every 30 days" : sub.can_renew ? "Off" : "Off — no saved card")),
            toggle)),

        h("p", { class: "sub-note muted small" }, sub.auto_renew
          ? "You can turn auto-renewal off at any time: the plan stays until the end of the paid period."
          : "When the paid period ends, your account switches to the Free plan. Nothing will be charged."),
        h("div", { class: "sub-actions" }, h("button", { class: "plan-btn", type: "button", onclick: () => close() }, "Close")));
    }

    load();
    return body;
  });
}

/**
 * Handles ?checkout=success|cancel and ?portal=return after the payment page sends the user back.
 * YooKassa returns here even if the payment page was just closed, so success is confirmed by polling.
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

  toast("Checking your payment…", "info");
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    await reloadProfile();
    if (hasPlan()) { toast("Your plan is active. Enjoy Veora!", "ok"); return; }
  }
  toast("We couldn't confirm the payment yet. If you paid, the plan will appear in a minute; if you closed the payment page, nothing was charged.", "info");
}

// Required before paying: the offer, auto-renewal and refunds (opens in a new tab so checkout isn't lost).
function plansConsent() {
  const link = (hash, text) => h("a", { href: `${location.pathname}#${hash}`, target: "_blank", rel: "noopener" }, text);
  return h("p", { class: "muted small plans-legal" }, ...(lang === "ru"
    ? ["Оформляя подписку, вы принимаете ", link("offer", "договор-оферту"), ", соглашаетесь на автоматическое продление раз в 30 дней и ", link("refund", "условия возврата"), "."]
    : ["By subscribing you accept the ", link("offer", "public offer"), ", agree to automatic renewal every 30 days and the ", link("refund", "refund policy"), "."]));
}
