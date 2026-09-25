/**
 * Generic Dynamic Media checkout stand-in. Cart must already exist.
 * Field names follow ProCheckout; nothing posts to production while placeholders are true.
 */
(function () {
  const LABELS = {
    cart: "Order options",
    account: "Account",
    location: "Licensing",
    shipping: "Shipping",
    billing: "Billing & Payment",
    review: "Review Order"
  };

  const state = {
    step: "account",
    path: null,
    program: null,
    cart: null,
    form: {}
  };

  function $(id) {
    return document.getElementById(id);
  }

  function money(n) {
    return "$" + Number(n || 0).toFixed(2);
  }

  function collect(rootId) {
    const root = $(rootId);
    if (!root) return;
    root.querySelectorAll("input, select, textarea").forEach((el) => {
      if (!el.name) return;
      if (el.type === "checkbox") state.form[el.name] = el.checked;
      else if (el.type === "radio") {
        if (el.checked) state.form[el.name] = el.value;
      } else if (el.type === "password" || el.name === "ccNumber" || el.name === "ccCVV") {
        state.form[el.name + "Present"] = !!String(el.value || "").trim();
        el.value = "";
      } else {
        state.form[el.name] = el.value;
      }
    });
  }

  function afterLocation() {
    return state.cart && state.cart.hasShipping ? "shipping" : "billing";
  }

  function backFrom(step) {
    if (step === "cart") return "account";
    if (step === "location") return "cart";
    if (step === "shipping") return "location";
    if (step === "billing") return state.cart && state.cart.hasShipping ? "shipping" : "location";
    if (step === "review") return "billing";
    return "account";
  }

  function progressOrder() {
    const order = ["account", "cart", "location", "billing", "review"];
    if (state.cart && state.cart.hasShipping) order.splice(3, 0, "shipping");
    return order;
  }

  function renderProgress() {
    const order = progressOrder();
    const idx = Math.max(0, order.indexOf(state.step));
    const pct = Math.round(((idx + 1) / order.length) * 100);
    const steps = order.map((id, i) => {
      const cls = i < idx ? "is-done" : i === idx ? "is-current" : "is-todo";
      const mark = i < idx ? "✓" : String(i + 1);
      const current = i === idx ? ' aria-current="step"' : "";
      return `<li class="${cls}"${current}><span class="dm-step-mark" aria-hidden="true">${mark}</span><span class="dm-step-label">${LABELS[id]}</span></li>`;
    }).join("");
    $("progress").innerHTML =
      `<div class="dm-stepper-mobile">` +
        `<div class="dm-stepper-mobile-row"><span>Step ${idx + 1} of ${order.length}</span><strong>${LABELS[state.step]}</strong></div>` +
        `<div class="dm-stepper-bar" role="progressbar" aria-valuemin="1" aria-valuemax="${order.length}" aria-valuenow="${idx + 1}"><span style="width:${pct}%"></span></div>` +
      `</div>` +
      `<ol class="dm-stepper">${steps}</ol>`;
  }

  function itemRows(items) {
    return (items || []).map((item) => {
      const loc = typeof item.locationIndex === "number" ? ` · Loc ${item.locationIndex + 1}` : "";
      const rec = item.recurring ? " / mo" : "";
      return `<div class="dm-line-item"><span>${item.name}${loc}</span><span class="font-medium tabular-nums whitespace-nowrap">${money(item.price)}${rec}</span></div>`;
    }).join("");
  }

  function totalsHtml(cart) {
    const due = money(cart.dueToday != null ? cart.dueToday : cart.subtotal);
    let html = itemRows(cart.items);
    html += `<div class="dm-line-total"><span>Due today</span><span class="tabular-nums">${due}</span></div>`;
    if (cart.billingCycle === "monthly" && cart.recurringMonthly > 0) {
      html += `<div class="dm-line-note">Then ${money(cart.recurringMonthly)} / mo</div>`;
    } else if (cart.billingCycle === "annual" && cart.recurringMonthly > 0) {
      html += `<div class="dm-line-note">Plus ${money(cart.recurringMonthly)} / mo for add-ons</div>`;
    } else if (cart.billingCycle === "annual") {
      html += `<div class="dm-line-note">Music paid for 12 months</div>`;
    }
    return html;
  }

  function renderSummary() {
    const html = totalsHtml(state.cart);
    $("orderSummary").innerHTML = html;
    $("orderSummaryMobile").innerHTML = html;
    $("summaryMobileTotal").textContent = money(state.cart.dueToday != null ? state.cart.dueToday : state.cart.subtotal);
    $("cartBody").innerHTML = html;
  }

  function readOptionsFromForm() {
    const countEl = $("locationCount");
    const cycle = document.querySelector('input[name="billingCycle"]:checked');
    return {
      locationCount: countEl ? countEl.value : 1,
      billingCycle: cycle ? cycle.value : "monthly",
      warranty: $("warranty") ? $("warranty").checked : false,
      messaging: !!(state.cart && state.cart.messaging),
      needsPlayerOne: $("needsPlayerOne") ? $("needsPlayerOne").checked : false
    };
  }

  function syncOptionsUi() {
    const program = state.program;
    const opts = readOptionsFromForm();
    const monthly = program.music;
    const annual = program.music && program.music.annual;
    const warranty = program.addons && program.addons.warranty;
    const count = Math.max(1, parseInt(opts.locationCount, 10) || 1);

    if ($("monthlyMeta") && monthly) {
      $("monthlyMeta").textContent = money(monthly.price) + " / mo × " + count + " location" + (count > 1 ? "s" : "");
    }
    if ($("annualMeta") && annual) {
      $("annualMeta").textContent = money(annual.price) + " / yr × " + count + " location" + (count > 1 ? "s" : "");
    }
    if ($("warrantyMeta") && warranty) {
      $("warrantyMeta").textContent = money(warranty.price) + " one-time per PlayerOne";
    }

    const isPlayerOne = state.cart.playerKey === "playerone" || opts.needsPlayerOne;
    const showUpgrade = state.cart.playerKey !== "playerone";
    $("playerOneOption").classList.toggle("hidden", !showUpgrade);
    $("warrantyOption").classList.toggle("hidden", !isPlayerOne);
    if (!isPlayerOne && $("warranty")) $("warranty").checked = false;

    state.cart = window.ProgramCheckout.applyOptions(program, state.cart, opts);
    window.ProgramCheckout.saveCart(state.cart);
    renderSummary();
    updateRecurringAck();
  }

  function updateRecurringAck() {
    const label = $("chkRecurringLabel");
    if (!label) return;
    if (state.cart.billingCycle === "annual" && !(state.cart.recurringMonthly > 0)) {
      label.textContent = "I authorize the annual charge shown above";
    } else if (state.cart.billingCycle === "annual") {
      label.textContent = "I authorize the annual charge and any recurring monthly add-ons";
    } else {
      label.textContent = "I authorize the recurring monthly charge";
    }
  }

  function locationCard(loc, index, total) {
    const n = index + 1;
    const copyBtn = index > 0
      ? `<button type="button" class="dm-link text-xs" data-copy-location="${index}">Same address as location 1</button>`
      : "";
    return `<div class="dm-location-card" data-location-index="${index}">
      <div class="dm-location-card-head">
        <p class="text-sm font-semibold text-text-primary">Location ${n}${total > 1 ? " of " + total : ""}</p>
        ${copyBtn}
      </div>
      <div class="space-y-3">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="dm-label">Store / location name <span class="text-red-500 normal-case">*</span></label>
            <input type="text" name="siteName_${index}" data-field="siteName" required value="${escapeAttr(loc.siteName || "")}" placeholder="e.g. Store 14" autocomplete="organization" class="dm-input">
          </div>
          <div>
            <label class="dm-label">Store # / alias <span class="text-text-muted">(optional)</span></label>
            <input type="text" name="clientKey_${index}" data-field="clientKey" value="${escapeAttr(loc.clientKey || "")}" placeholder="Store number" class="dm-input">
          </div>
        </div>
        <div>
          <label class="dm-label">Street address <span class="text-red-500 normal-case">*</span></label>
          <input type="text" name="address1_${index}" data-field="address1" required value="${escapeAttr(loc.address1 || "")}" autocomplete="address-line1" class="dm-input">
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-6 gap-3">
          <div class="sm:col-span-3">
            <label class="dm-label">City <span class="text-red-500 normal-case">*</span></label>
            <input type="text" name="city_${index}" data-field="city" required value="${escapeAttr(loc.city || "")}" autocomplete="address-level2" class="dm-input">
          </div>
          <div class="sm:col-span-1">
            <label class="dm-label">State <span class="text-red-500 normal-case">*</span></label>
            <input type="text" name="state_${index}" data-field="state" required maxlength="2" value="${escapeAttr(loc.state || "")}" autocomplete="address-level1" class="dm-input uppercase">
          </div>
          <div class="sm:col-span-2">
            <label class="dm-label">Zip <span class="text-red-500 normal-case">*</span></label>
            <input type="text" name="zip_${index}" data-field="zip" required value="${escapeAttr(loc.zip || "")}" autocomplete="postal-code" inputmode="numeric" class="dm-input">
          </div>
        </div>
        <div>
          <label class="dm-label">Industry <span class="text-red-500 normal-case">*</span></label>
          <select name="industry_${index}" data-field="industry" required class="dm-input">
            <option value="restaurant"${loc.industry === "restaurant" ? " selected" : ""}>Restaurant</option>
            <option value="retail"${loc.industry === "retail" ? " selected" : ""}>Retail</option>
            <option value="other"${loc.industry === "other" ? " selected" : ""}>Other</option>
          </select>
        </div>
      </div>
    </div>`;
  }

  function escapeAttr(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  function renderLocationCards() {
    const locs = state.cart.locations || [];
    $("locationCards").innerHTML = locs.map((loc, i) => locationCard(loc, i, locs.length)).join("");
    $("productSites").innerHTML = state.cart.items.map((item, i) => {
      const locIdx = typeof item.locationIndex === "number" ? item.locationIndex : 0;
      return `<input type="hidden" name="product_${i}" value="location_${locIdx}">`;
    }).join("");

    $("locationCards").querySelectorAll("[data-copy-location]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = parseInt(btn.getAttribute("data-copy-location"), 10);
        const first = readLocationsFromDom()[0];
        if (!first) return;
        const card = $("locationCards").querySelector(`[data-location-index="${target}"]`);
        if (!card) return;
        ["siteName", "clientKey", "address1", "city", "state", "zip", "industry"].forEach((field) => {
          const input = card.querySelector(`[data-field="${field}"]`);
          if (input && field !== "siteName" && field !== "clientKey") input.value = first[field] || "";
        });
      });
    });
  }

  function readLocationsFromDom() {
    const cards = $("locationCards").querySelectorAll("[data-location-index]");
    return Array.from(cards).map((card) => {
      const loc = {};
      card.querySelectorAll("[data-field]").forEach((el) => {
        loc[el.getAttribute("data-field")] = el.value;
      });
      return loc;
    });
  }

  function showStep() {
    ["cart", "account", "location", "shipping", "billing", "review"].forEach((id) => {
      const el = $(id + "Step");
      if (!el) return;
      const hide = id !== state.step;
      el.classList.toggle("hidden", hide);
      el.toggleAttribute("hidden", hide);
    });
    renderProgress();
    const summaryMobile = $("summaryMobile");
    if (summaryMobile) summaryMobile.hidden = state.step === "account";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function go(step) {
    state.step = step;
    if (step === "cart") syncOptionsUi();
    if (step === "location") renderLocationCards();
    showStep();
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const programId = new URLSearchParams(location.search).get("program") || "brokenyolk";
    const cart = window.ProgramCheckout.loadCart();
    if (!cart || cart.programId !== programId) {
      window.location.replace(window.ProgramCheckout.landingPath(programId));
      return;
    }
    state.cart = cart;

    const res = await fetch("/programs/" + programId + ".json", { cache: "no-store" });
    state.program = await res.json();
    $("businessName").value = state.program.programName || "";
    $("contactInstead").href = "/" + programId + "/#contact";

    if ($("locationCount")) $("locationCount").value = state.cart.locationCount || 1;
    if (state.cart.billingCycle === "annual") {
      const annual = document.querySelector('input[name="billingCycle"][value="annual"]');
      if (annual) annual.checked = true;
    }
    if ($("needsPlayerOne") && state.cart.playerKey === "playerone") {
      $("needsPlayerOne").checked = true;
    }
    if ($("warranty")) $("warranty").checked = !!state.cart.warranty;

    syncOptionsUi();

    $("locationDec").addEventListener("click", () => {
      const el = $("locationCount");
      el.value = Math.max(1, (parseInt(el.value, 10) || 1) - 1);
      syncOptionsUi();
    });
    $("locationInc").addEventListener("click", () => {
      const el = $("locationCount");
      const max = window.ProgramCheckout.MAX_LOCATIONS || 10;
      el.value = Math.min(max, (parseInt(el.value, 10) || 1) + 1);
      syncOptionsUi();
    });
    $("locationCount").addEventListener("change", syncOptionsUi);
    document.querySelectorAll('input[name="billingCycle"]').forEach((el) => {
      el.addEventListener("change", syncOptionsUi);
    });
    $("needsPlayerOne").addEventListener("change", syncOptionsUi);
    $("warranty").addEventListener("change", syncOptionsUi);

    $("cartNext").addEventListener("click", () => {
      if (!$("formCartOptions").reportValidity()) return;
      syncOptionsUi();
      go("location");
    });

    function showAccountCard(which) {
      const signin = which === "signin";
      $("signinCard").classList.toggle("hidden", !signin);
      $("createCard").classList.toggle("hidden", signin);
      $("signinCard").toggleAttribute("hidden", !signin);
      $("createCard").toggleAttribute("hidden", signin);
    }

    $("showCreateAccount").addEventListener("click", () => showAccountCard("create"));
    $("showSignin").addEventListener("click", () => showAccountCard("signin"));

    $("forgotToggle").addEventListener("click", () => {
      $("formForgot").classList.toggle("hidden");
    });

    $("forgotSend").addEventListener("click", () => {
      const email = $("usernameForgot").value.trim();
      $("forgotStatus").textContent = email
        ? "If an account exists for that email, reset instructions will be sent."
        : "Enter the email on the account.";
    });

    $("signinNext").addEventListener("click", () => {
      if (!$("formExisting").reportValidity()) return;
      collect("formExisting");
      state.path = "signin";
      state.form.accountMode = "returning";
      window.ProgramCheckout.saveIdentity(window.ProgramCheckout.buildIdentity("signin", state.form));
      go("cart");
    });

    $("createNext").addEventListener("click", () => {
      if (!$("formNew").reportValidity()) return;
      collect("formNew");
      state.path = "create";
      state.form.accountMode = "new";
      window.ProgramCheckout.saveIdentity(window.ProgramCheckout.buildIdentity("create", state.form));
      go("cart");
    });

    $("locationNext").addEventListener("click", () => {
      if (!$("formLocationInfo").reportValidity()) return;
      const locations = readLocationsFromDom();
      state.cart.locations = locations;
      window.ProgramCheckout.saveCart(state.cart);
      collect("productSites");
      const first = locations[0] || {};
      state.form.siteName = first.siteName || "";
      state.form.address1 = first.address1 || "";
      state.form.city = first.city || "";
      state.form.state = first.state || "";
      state.form.zip = first.zip || "";
      state.form.industry = first.industry || "";
      state.form.locations = locations;
      $("shippingString").value = [
        first.address1,
        first.city,
        first.state,
        first.zip
      ].filter(Boolean).join(", ");
      go(afterLocation());
    });

    $("shippingNext").addEventListener("click", () => {
      collect("shippingStep");
      go("billing");
    });

    $("billingNext").addEventListener("click", () => {
      if (!$("formBilling").reportValidity()) return;
      collect("formBilling");
      const locs = (state.form.locations || state.cart.locations || [])
        .map((loc, i) => `<p>Location ${i + 1}: ${loc.siteName || ""} — ${loc.address1 || ""}, ${loc.city || ""} ${loc.state || ""} ${loc.zip || ""}</p>`)
        .join("");
      $("reviewBody").innerHTML = `
        <p>${state.form.accountMode === "returning" ? "Signed in" : "New account"} · ${state.form.emailAddress || state.form.username || ""}</p>
        ${locs}
        <p>${state.cart.billingCycle === "annual" ? "Annual music billing" : "Monthly music billing"} · Due today ${money(state.cart.dueToday)}</p>
        <p>${state.cart.hasShipping ? "Ship to " + (state.form.shippingString || "licensing address") : "No shipping on this cart"}</p>
        <p>Payment ${state.form.ccNumberPresent ? "entered (not stored)" : "not entered"}${state.form.billAddress2 ? " · " + state.form.billAddress2 : ""}</p>
      `;
      go("review");
    });

    document.querySelectorAll("[data-back]").forEach((btn) => {
      btn.addEventListener("click", () => go(backFrom(state.step)));
    });

    $("placeOrder").addEventListener("click", () => {
      if (!$("formAcknowledgements").reportValidity()) return;
    });

    showStep();
  });
})();
