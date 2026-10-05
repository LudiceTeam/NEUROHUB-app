import { MODEL_GROUPS } from "./config.js";
import { mountCrystal } from "./crystal.js";

// Mirrors SUBSCRIPTIONS in backend/api/config.py (requests / premium requests).
const FREE_PLAN = { requests: 10, premium: 1 };
const PLANS = [
  { name: "Starter", requests: 20, premium: 5, note: "To get going" },
  { name: "Basic", requests: 25, premium: 10, note: "For light use" },
  { name: "Plus", requests: 70, premium: 20, note: "For everyday work" },
  { name: "Premium", requests: 100, premium: 30, note: "For power users", popular: true },
  { name: "Max", requests: 200, premium: 60, note: "For heavy creators" },
  { name: "Elite", requests: 500, premium: 150, note: "No compromises" },
];

const FEATURES = [
  { icon: "M12 3l2.5 5.5L20 9l-4.2 4 1 5.8L12 16l-4.8 2.8 1-5.8L4 9l5.5-.5z", title: "Every top model", text: "GPT, Claude, Gemini, Llama, Mistral, Qwen and more — switch in one tap, mid-conversation.", wide: true, accent: true },
  { icon: "M13 2L4 14h7l-1 8 9-12h-7z", title: "Auto mode", text: "Not sure which model to use? Veora picks the best one for every request." },
  { icon: "M4 6h16v12H4zM8 13l2.5-3 3 4 2-2.5L19 16", title: "Vision", text: "Attach up to five photos and ask anything about them." },
  { icon: "M4 5h16v14H4zM8 10a1.5 1.5 0 1 0 0-.01M20 15l-5-5-9 9", title: "Image generation", text: "Create images from a sentence with Gemini image models." },
  { icon: "M4 6h12v12H4zM16 10l4-2v8l-4-2", title: "Video generation", text: "Turn ideas into short clips with Google Veo 3.1." },
  { icon: "M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4", title: "Voice studio", text: "Lifelike speech in Russian, English and more — six voices, three models.", wide: true },
  { icon: "M12 3a4 4 0 0 1 4 4v1a4 4 0 0 1-8 0V7a4 4 0 0 1 4-4zM5 21a7 7 0 0 1 14 0", title: "Custom GPTs", text: "Build your own assistants with custom instructions." },
  { icon: "M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM12 7v5l3 2", title: "Memory", text: "Veora remembers what matters about you, so answers get more personal." },
  { icon: "M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v7a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5z", title: "Folders & pins", text: "Keep chats organized with folders, tags and pinned threads — drag and drop included.", wide: true },
  { icon: "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z", title: "Encrypted history", text: "Messages are encrypted before they're stored. Delete any chat — with its images — whenever you want.", wide: true },
  { icon: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1", title: "Share chats", text: "Send a link to any conversation in one click." },
  { icon: "M5 4h9v16H5zM9 17h1M16 8h3v12h-6", title: "Web + iPhone", text: "Start on your phone, continue on the web. Everything stays in sync." },
];

const FAQ = [
  ["Is there a free plan?", "Yes. Every account gets 10 requests and 1 premium request every day, with access to all models."],
  ["What is a premium request?", "Top-tier models like Claude Opus and Sonnet, GPT-4o and Mistral Large — plus image, video and voice generation — use premium requests. Everything else uses regular requests."],
  ["When do requests refill?", "Every day. Your quota is topped back up to your plan's limit automatically."],
  ["Where do I subscribe?", "Plans are purchased in the Veora iOS app through the App Store. Your subscription works on the web too — just sign in with the same account."],
  ["Is my chat history private?", "Messages are encrypted before they're saved to our database, and you can delete any chat — including its images — at any time."],
  ["Do I need a password?", "No. Sign in with Google or with a one-time code sent to your email. Sign in with Apple is coming to the web soon."],
];

const svgIcon = (d) => `<svg viewBox="0 0 24 24" class="l-icon" aria-hidden="true"><path d="${d}"/></svg>`;
const ARROW = `<svg viewBox="0 0 24 24" class="l-icon" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`;

export function renderLanding(root, { onLogin, onSignup }) {
  const modelIds = MODEL_GROUPS.flatMap(([, ids]) => ids).filter((id) => id !== "auto");
  // "bytedance" and "bytedance-seed" are one lab.
  const providers = new Set(modelIds.map((id) => id.split("/")[0].replace(/-seed$/, "")));
  // Count distinct models: ":free" variants and voices of one TTS model aren't separate models.
  const unique = new Set(modelIds.map((id) => id.replace(/:[^/]+$/, "")));
  const modelCount = `${Math.floor(unique.size / 5) * 5}+`;
  const textGroups = MODEL_GROUPS.filter(([g]) => !["Smart", "Image generation", "Voice"].includes(g));

  const page = document.createElement("div");
  page.className = "landing";
  page.innerHTML = `
    <div class="l-bg" aria-hidden="true"><span class="l-orb a"></span><span class="l-orb b"></span><span class="l-grid"></span></div>

    <header class="l-nav">
      <a class="l-brand" href="#top"><img src="logo.png" alt="" width="30" height="30"><span>Veora</span></a>
      <nav class="l-links" aria-label="Sections">
        <a href="#features">Features</a><a href="#models">Models</a><a href="#plans">Plans</a><a href="#faq">FAQ</a>
      </nav>
      <div class="l-actions">
        <button class="l-btn ghost" type="button" data-action="login">Log in</button>
        <button class="l-btn primary" type="button" data-action="signup">Sign up</button>
      </div>
    </header>

    <main id="top">
      <section class="l-hero">
        <div class="l-hero-copy">
          <span class="l-eyebrow"><span class="l-dot"></span>${modelCount} models · images · video · voice</span>
          <h1>All AI.<br><span class="l-gradient">One place.</span></h1>
          <p class="l-lead">Chat with GPT, Claude, Gemini, Llama and dozens more. Generate images, videos and lifelike speech — in one beautifully simple app, on the web and on iPhone.</p>
          <div class="l-cta">
            <button class="l-btn primary lg" type="button" data-action="signup">Get started — it's free ${ARROW}</button>
            <button class="l-btn ghost lg" type="button" data-action="login">I have an account</button>
          </div>
          <p class="l-fine">No credit card. 10 free requests every day.</p>
        </div>
        <div class="l-hero-art">
          <div class="l-halo" aria-hidden="true"></div>
          <div class="l-crystal" aria-label="Veora crystal, drag to spin" role="img"></div>
          <div class="l-float f1"><span class="l-chip-dot" style="background:#10a37f"></span>GPT-4o</div>
          <div class="l-float f2"><span class="l-chip-dot" style="background:#d97757"></span>Claude Opus</div>
          <div class="l-float f3"><span class="l-chip-dot" style="background:#4285f4"></span>Gemini 3</div>
        </div>
      </section>

      <section class="l-stats reveal" aria-label="Veora in numbers">
        <div><strong>${modelCount}</strong><span>AI models</span></div>
        <div><strong>${providers.size}</strong><span>AI labs</span></div>
        <div><strong>4</strong><span>Modalities: text, image, video, voice</span></div>
        <div><strong>1</strong><span>Subscription for everything</span></div>
      </section>

      <section class="l-section" id="features">
        <div class="l-head reveal">
          <span class="l-kicker">Features</span>
          <h2>Everything you'd want from AI.<br>Nothing you'd have to juggle.</h2>
        </div>
        <div class="l-bento">
          ${FEATURES.map((f) => `
            <article class="l-card reveal${f.wide ? " wide" : ""}${f.accent ? " accent" : ""}">
              <span class="l-card-icon">${svgIcon(f.icon)}</span>
              <h3>${f.title}</h3>
              <p>${f.text}</p>
            </article>`).join("")}
        </div>
      </section>

      <section class="l-section" id="models">
        <div class="l-head reveal">
          <span class="l-kicker">Models</span>
          <h2>The world's best models,<br>side by side.</h2>
          <p>New models land in Veora as soon as they're out. Pick one yourself or let Auto decide.</p>
        </div>
        <div class="l-marquee reveal" aria-hidden="true">
          <div class="l-marquee-track">
            ${[...modelIds, ...modelIds].filter((id) => !id.endsWith(":free")).map((id) => `<span class="l-model">${pretty(id)}</span>`).join("")}
          </div>
        </div>
        <div class="l-model-groups">
          ${textGroups.map(([group, ids]) => `
            <div class="l-group reveal">
              <h3>${group}</h3>
              <ul>${ids.filter((id) => !id.endsWith(":free")).map((id) => `<li>${pretty(id)}</li>`).join("")}</ul>
            </div>`).join("")}
        </div>
      </section>

      <section class="l-section" id="how">
        <div class="l-head reveal">
          <span class="l-kicker">How it works</span>
          <h2>From sign-up to answer in a minute.</h2>
        </div>
        <ol class="l-steps">
          <li class="reveal"><span>01</span><h3>Sign up with email</h3><p>Enter your email, type the 6-digit code. No passwords to remember.</p></li>
          <li class="reveal"><span>02</span><h3>Pick a model — or Auto</h3><p>Choose from ${modelCount} models or let Veora route each request to the best one.</p></li>
          <li class="reveal"><span>03</span><h3>Chat, create, listen</h3><p>Ask questions, send photos, generate images, videos and speech.</p></li>
        </ol>
      </section>

      <section class="l-section" id="plans">
        <div class="l-head reveal">
          <span class="l-kicker">Plans</span>
          <h2>Start free. Upgrade when you're ready.</h2>
          <p>Requests refill every day. Premium requests cover top-tier models and image, video and voice generation.</p>
        </div>
        <div class="l-free reveal">
          <div><strong>Free</strong><span>${FREE_PLAN.requests} requests and ${FREE_PLAN.premium} premium request every day, all models included.</span></div>
          <button class="l-btn ghost" type="button" data-action="signup">Start free</button>
        </div>
        <div class="l-plans">
          ${PLANS.map((p) => `
            <article class="l-plan reveal${p.popular ? " popular" : ""}">
              ${p.popular ? '<span class="l-badge">Most popular</span>' : ""}
              <h3>${p.name}</h3>
              <p class="l-plan-note">${p.note}</p>
              <div class="l-plan-num"><strong>${p.requests}</strong><span>requests / day</span></div>
              <div class="l-plan-num small"><strong>${p.premium}</strong><span>premium / day</span></div>
              <ul>
                <li>All ${modelCount} models</li>
                <li>Vision & encrypted history</li>
                <li>Images, video & voice</li>
              </ul>
              <button class="l-btn ${p.popular ? "primary" : "ghost"} block" type="button" data-action="signup">Get ${p.name}</button>
            </article>`).join("")}
        </div>
        <p class="l-plans-more reveal">Subscriptions are purchased in the Veora iOS app and work on the web with the same account.</p>
      </section>

      <section class="l-section" id="faq">
        <div class="l-head reveal">
          <span class="l-kicker">FAQ</span>
          <h2>Questions, answered.</h2>
        </div>
        <div class="l-faq">
          ${FAQ.map(([q, a]) => `<details class="reveal"><summary>${q}<span class="l-plus" aria-hidden="true"></span></summary><p>${a}</p></details>`).join("")}
        </div>
      </section>

      <section class="l-final reveal">
        <img src="logo.png" alt="" width="72" height="72">
        <h2>Your AI, all in one place.</h2>
        <p>Join Veora and get 10 free requests every day.</p>
        <div class="l-cta center">
          <button class="l-btn primary lg" type="button" data-action="signup">Create free account ${ARROW}</button>
          <button class="l-btn ghost lg" type="button" data-action="login">Log in</button>
        </div>
      </section>
    </main>

    <footer class="l-footer">
      <div class="l-brand"><img src="logo.png" alt="" width="24" height="24"><span>Veora</span></div>
      <nav aria-label="Footer"><a href="#features">Features</a><a href="#models">Models</a><a href="#plans">Plans</a><a href="#faq">FAQ</a></nav>
      <span>© ${new Date().getFullYear()} Veora. All AI in one place.</span>
    </footer>`;

  root.replaceChildren(page);
  document.documentElement.classList.add("landing-mode");

  // Buttons → auth screens.
  page.addEventListener("click", (e) => {
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (action === "login") onLogin();
    if (action === "signup") onSignup();
    // Section links scroll smoothly without touching the auth hash routes.
    const link = e.target.closest('a[href^="#"]');
    if (link) {
      e.preventDefault();
      const target = page.querySelector(link.getAttribute("href"));
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  // Sticky nav gets a backdrop once you scroll.
  const nav = page.querySelector(".l-nav");
  const onScroll = () => nav.classList.toggle("scrolled", scrollY > 12);
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Reveal-on-scroll.
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("in");
        io.unobserve(entry.target);
      }
    }
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  page.querySelectorAll(".reveal").forEach((el, i) => {
    el.style.setProperty("--d", `${(i % 4) * 70}ms`);
    io.observe(el);
  });

  // Cursor glow on cards.
  page.querySelectorAll(".l-card, .l-plan").forEach((card) => {
    card.addEventListener("pointermove", (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - r.left}px`);
      card.style.setProperty("--my", `${e.clientY - r.top}px`);
    });
  });

  let destroyCrystal = null;
  let destroyed = false;
  mountCrystal(page.querySelector(".l-crystal")).then((destroy) => {
    if (destroyed) destroy(); else destroyCrystal = destroy;
  });

  return () => {
    destroyed = true;
    destroyCrystal?.();
    io.disconnect();
    removeEventListener("scroll", onScroll);
    document.documentElement.classList.remove("landing-mode");
  };
}

function pretty(id) {
  const name = id.split("/").pop().replace(/:free$/, "");
  return name
    .replace(/-/g, " ")
    .replace(/\b(gpt|glm|vl|it|ui|tts)\b/gi, (w) => w.toUpperCase())
    .replace(/\b([a-z])/g, (c) => c.toUpperCase());
}
