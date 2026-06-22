// ============================================================
// Blackwood Landscaping — front-end script
// Loaded by index.html as <script src="app.js" defer></script>
// Externalized so edits no longer require recomputing a CSP hash.
// ============================================================
"use strict";
(function () {
  // ============================================================
  //  SECURITY & VALIDATION LAYER
  // ============================================================

  // ---- Sanitization helpers -------------------------------------------------
  // Strip zero-width, BOM, and control chars. Never use innerHTML with user data.
  function sanitize(str) {
    if (typeof str !== "string") return "";
    return str
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, "") // control chars
      .replace(/[\u200B-\u200F\uFEFF]/g, "")        // zero-width / BOM
      .trim()
      .slice(0, 5000);                              // hard ceiling
  }

  // ---- Reveal observer ------------------------------------------------------
  // Respect prefers-reduced-motion: skip animations entirely (WCAG 2.3.3).
  const prefersReducedMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (prefersReducedMotion) {
    // Just make everything visible immediately, no animation
    document.querySelectorAll(".reveal").forEach(function (el) {
      el.classList.add("in");
    });
  } else {
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
    document.querySelectorAll(".reveal").forEach(function (el) { io.observe(el); });
    // Make `io` available to other modules (review card rendering)
    window.__revealObserver = io;
  }

  // ============================================================
  //  REVIEW CARDS — rendered via textContent (XSS-safe)
  // ============================================================
  // (Reviews are added by hand below — see the `reviews` array near the end.)
  function renderReview(r) {
    // every field passes through textContent — no innerHTML, no template strings into HTML
    const card = document.createElement("div");
    card.className = "review-card reveal";

    const stars = document.createElement("div");
    stars.className = "review-stars";
    const s = Math.max(1, Math.min(5, parseInt(r.rating, 10) || 5));
    stars.textContent = "★".repeat(s) + "☆".repeat(5 - s);

    const text = document.createElement("p");
    text.className = "review-text";
    text.textContent = sanitize(r.message).slice(0, 1500);

    const author = document.createElement("div");
    author.className = "review-author";

    const name = document.createElement("div");
    name.className = "reviewer-name";
    name.textContent = sanitize(r.name).slice(0, 80);

    const date = document.createElement("div");
    date.className = "review-date";
    date.textContent = sanitize(r.date).slice(0, 30);

    author.appendChild(name);
    author.appendChild(date);
    card.appendChild(stars);
    card.appendChild(text);
    card.appendChild(author);
    return card;
  }

  const grid = document.getElementById("reviewsGrid");
  const aggregateScore = document.querySelector(".aggregate-score");
  const aggregateMeta  = document.querySelector(".aggregate-meta");

  // ============================================================
  //  MANUAL REVIEWS LIST
  //  Add real customer reviews here one at a time as they come in.
  //  Each entry: { rating: 1-5, message: "what they said", name: "First L.", date: "Spring 2026" }
  //  Push to deploy and they appear on the site within ~30 seconds.
  //  Leave the array empty to show the "Be the first." empty state.
  // ============================================================
  const reviews = [
    // Example (uncomment when you have a real review):
    // { rating: 5, message: "They did a great job on my front yard...", name: "Pat M.", date: "Spring 2026" },
  ];

  if (reviews.length > 0) {
    reviews.forEach(function (r) {
      const c = renderReview(r);
      grid.appendChild(c);
      if (prefersReducedMotion) {
        c.classList.add("in");
      } else if (window.__revealObserver) {
        window.__revealObserver.observe(c);
      }
    });

    let total = 0;
    reviews.forEach(function (r) {
      total += Math.max(1, Math.min(5, parseInt(r.rating, 10) || 5));
    });
    const avg = (total / reviews.length).toFixed(1);
    if (aggregateScore) aggregateScore.textContent = avg + " / 5.0";
    if (aggregateMeta)  aggregateMeta.textContent  =
      "From " + reviews.length + " happy customer" + (reviews.length === 1 ? "" : "s");
  }
  // If reviews array is empty, the "Be the first." empty state stays.


  // ============================================================
  //  VALIDATION
  // ============================================================
  function showError(input, show) {
    const err = document.querySelector('[data-for="' + input.id + '"]');
    if (err) err.classList.toggle("show", show);
    input.classList.toggle("invalid", show);
  }

  function validateField(input) {
    if (!input.id) return true;
    const val = input.value.trim();
    if (input.hasAttribute("required") && val.length === 0) { showError(input, true); return false; }
    if (input.type === "email" && val) {
      // Conservative RFC-5322-ish check; final validation happens server-side
      const ok = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/.test(val) && val.length <= 120;
      showError(input, !ok); return ok;
    }
    if (input.pattern && val) {
      const ok = new RegExp("^(?:" + input.pattern + ")$").test(val);
      showError(input, !ok); return ok;
    }
    if (input.minLength && val.length > 0 && val.length < input.minLength) { showError(input, true); return false; }
    showError(input, false); return true;
  }

  function validateForm(form) {
    let ok = true;
    form.querySelectorAll("input[required], textarea[required]").forEach(function (el) {
      if (el.type === "checkbox") {
        if (!el.checked) ok = false;
      } else {
        if (!validateField(el)) ok = false;
      }
    });
    return ok;
  }

  // live validation on blur
  document.querySelectorAll("input, textarea").forEach(function (el) {
    if (el.type === "checkbox" || el.type === "hidden") return;
    el.addEventListener("blur", function () { validateField(el); });
  });

  // ---- character counters ---------------------------------------------------
  function wireCount(textareaId, counterId) {
    const ta = document.getElementById(textareaId);
    const c  = document.getElementById(counterId);
    if (!ta || !c) return;
    const max = parseInt(ta.getAttribute("maxlength"), 10) || 1000;
    function update() { c.textContent = ta.value.length + " / " + max; }
    ta.addEventListener("input", update); update();
  }
  wireCount("ct_notes", "ct_count");

  // ============================================================
  //  BOT DEFENSE: honeypot + minimum-time-to-submit
  // ============================================================
  const formLoadedAt = Date.now();
  const MIN_FILL_MS = 3000; // less than 3s == almost certainly a bot

  function failsHumanCheck(form) {
    const trap = form.querySelector('input[name="_gotcha"]');
    if (trap && trap.value.trim() !== "") return "honeypot";
    if (Date.now() - formLoadedAt < MIN_FILL_MS) return "too-fast";
    return null;
  }

  // ============================================================
  //  SUBMISSION HANDLERS — fetch + JSON, no redirect, debounced
  // ============================================================
  function submitJSON(form, successEl, errorEl, submitBtn) {
    return new Promise(function (resolve) {
      const data = new FormData(form);
      // embed page-load timestamp so the SERVER can run its own
      // timing-based bot check (client checks alone are bypassable)
      data.set("_t", String(formLoadedAt));
      // sanitize free-text fields client-side before transmission
      ["message", "notes", "name", "firstName", "lastName", "city", "town", "address"].forEach(function (k) {
        if (data.has(k)) data.set(k, sanitize(data.get(k)));
      });

      fetch(form.action, {
        method: "POST",
        body: data,
        headers: { "Accept": "application/json" },
        // no credentials, no cookies
        credentials: "omit",
        referrerPolicy: "strict-origin-when-cross-origin"
      })
      .then(function (res) {
        if (res.ok) {
          successEl.classList.add("show");
          errorEl.classList.remove("show");
          form.reset();
          // (no per-form reset state needed — contract form has no star picker)
          successEl.scrollIntoView({ behavior: "smooth", block: "center" });
          setTimeout(function () { successEl.classList.remove("show"); }, 8000);
        } else {
          errorEl.classList.add("show");
          successEl.classList.remove("show");
        }
        resolve();
      })
      .catch(function () {
        errorEl.classList.add("show");
        successEl.classList.remove("show");
        resolve();
      })
      .finally(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = submitBtn.dataset.label || submitBtn.textContent;
      });
    });
  }

  function bindForm(formId, successId, errorId, submitId) {
    const form = document.getElementById(formId);
    const successEl = document.getElementById(successId);
    const errorEl = document.getElementById(errorId);
    const submitBtn = document.getElementById(submitId);
    if (!form) return;
    submitBtn.dataset.label = submitBtn.textContent;

    let submitting = false;

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (submitting) return;

      // bot checks: drop silently to avoid teaching bots
      const failure = failsHumanCheck(form);
      if (failure) {
        // fake success so bots don't retry, but don't actually send
        successEl.classList.add("show");
        return;
      }

      if (!validateForm(form)) {
        errorEl.classList.remove("show");
        return;
      }

      submitting = true;
      submitBtn.disabled = true;
      submitBtn.textContent = "Sending…";
      submitJSON(form, successEl, errorEl, submitBtn).then(function () {
        // debounce: 5s lockout before another submit is even possible
        setTimeout(function () { submitting = false; }, 5000);
      });
    });
  }

  // (Review form removed in DB-less deployment — only the contract form is wired.)
  bindForm("contractForm", "contractSuccess", "contractError", "ct_submit");
})();
