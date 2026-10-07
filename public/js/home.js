(() => {
  const root = document.documentElement;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  root.classList.add("js");

  const header = document.querySelector("[data-header]");
  const onHeader = () => header.classList.toggle("scrolled", window.scrollY > 12);
  onHeader();
  window.addEventListener("scroll", onHeader, { passive: true });

  if (reduced) {
    root.classList.add("ready", "settled");
    return;
  }

  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add("ready")));
  setTimeout(() => root.classList.add("settled"), 1800);

  const counters = $$("[data-count]");
  counters.forEach((el) => { el.textContent = "0"; });
  const runCounter = (el) => {
    const target = Number(el.dataset.count);
    const duration = 1600;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(2, -10 * t);
      el.textContent = String(Math.round(target * (t === 1 ? 1 : eased)));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const phone = document.querySelector("[data-phone]");
  phone.dataset.seq = "0";
  const runPhone = () => {
    [1, 2, 3].forEach((step, i) => setTimeout(() => { phone.dataset.seq = String(step); }, [250, 1100, 2500][i]));
  };

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      el.classList.add("in");
      $$("[data-count]", el).forEach(runCounter);
      if (el === phone) runPhone();
      io.unobserve(el);
    });
  }, { threshold: 0.18, rootMargin: "0px 0px -6% 0px" });
  $$(".reveal").forEach((el) => io.observe(el));

  const parallax = $$("[data-parallax]").map((el) => ({ el, speed: Number(el.dataset.parallax) }));
  const steps = document.querySelector("[data-steps]");
  let ticking = false;
  const onScroll = () => {
    ticking = false;
    const vh = window.innerHeight;
    parallax.forEach(({ el, speed }) => {
      const box = el.parentElement.getBoundingClientRect();
      if (box.bottom < -200 || box.top > vh + 200) return;
      el.style.setProperty("--py", `${(-box.top * speed).toFixed(1)}px`);
    });
    const s = steps.getBoundingClientRect();
    const progress = Math.min(Math.max((vh * 0.75 - s.top) / s.height, 0), 1);
    steps.style.setProperty("--progress", progress.toFixed(3));
  };
  const requestScroll = () => {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  };
  onScroll();
  window.addEventListener("scroll", requestScroll, { passive: true });
  window.addEventListener("resize", requestScroll);

  if (!finePointer) return;

  const hero = document.querySelector("[data-hero]");
  const emblem = document.querySelector("[data-tilt]");
  hero.addEventListener("pointermove", (e) => {
    const r = hero.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    emblem.style.setProperty("--rx", `${(x * 18).toFixed(2)}deg`);
    emblem.style.setProperty("--ry", `${(-y * 18).toFixed(2)}deg`);
  });
  hero.addEventListener("pointerleave", () => {
    emblem.style.setProperty("--rx", "0deg");
    emblem.style.setProperty("--ry", "0deg");
  });

  $$(".plan").forEach((plan) => {
    plan.addEventListener("pointermove", (e) => {
      const r = plan.getBoundingClientRect();
      plan.style.setProperty("--mx", `${e.clientX - r.left}px`);
      plan.style.setProperty("--my", `${e.clientY - r.top}px`);
    });
  });
})();
