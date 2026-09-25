/**
 * Program landing page → staging checkout handoff.
 * Builds a CRM-shaped cart from program JSON. Placeholder PartIDs must not be posted to production ProCheckout.
 */
(function (root) {
  const STORAGE_KEY = "dmProgramCart";
  const IDENTITY_KEY = "dmProgramIdentity";
  const SECRET_FIELDS = { password: true, ccNumber: true, ccCVV: true };
  const MAX_LOCATIONS = 10;

  function mapHardware(value) {
    const v = String(value || "").toLowerCase();
    if (v.includes("speaker") || v.includes("need new")) return "speakers";
    if (v.includes("playerone")) return "playerone";
    if (v.includes("sonos") || v.includes("ipad") || v.includes("tablet") || v.includes("app") || v.includes("pc") || v.includes("mac")) return "app";
    if (v.includes("unsure") || v.includes("not sure") || v.includes("existing")) return "app";
    return "app";
  }

  function needsLead(hardwareValue) {
    return mapHardware(hardwareValue) === "speakers";
  }

  const SETUP_NEXT_STEP = {
    sonos: { action: "checkout", playerKey: "app", hardwareValue: "Sonos", label: "Sonos" },
    bluetooth: { action: "checkout", playerKey: "app", hardwareValue: "iPad / phone app", label: "phone or tablet" },
    computer: { action: "checkout", playerKey: "app", hardwareValue: "PC / Mac", label: "store computer" },
    wired: { action: "lead", hardwareValue: "Wired speakers / amplifier" },
    unknown: { action: "lead", hardwareValue: "Not sure — help me choose" },
    new: { action: "lead", hardwareValue: "New location — audio system design" }
  };

  function setupNextStep(key) {
    return SETUP_NEXT_STEP[key] || { action: "lead", hardwareValue: "" };
  }

  function line(part, extras) {
    return Object.assign({
      skuCode: part.skuCode,
      crmPartId: part.crmPartId,
      name: part.name,
      price: Number(part.price) || 0,
      recurring: !!part.recurring,
      shippable: !!part.shippable,
      quantity: 1
    }, extras || {});
  }

  function clampLocations(n) {
    const count = parseInt(n, 10);
    if (!count || count < 1) return 1;
    return Math.min(MAX_LOCATIONS, count);
  }

  function basePlayerKey(program, selections) {
    let playerKey = selections.originalPlayerKey || selections.playerKey || mapHardware(selections.hardwarePreference);
    if (playerKey === "speakers") throw new Error("Speaker quotes stay on the lead form");
    if (!program.players[playerKey]) playerKey = "app";
    return playerKey;
  }

  function resolvePlayerKey(program, selections) {
    const base = basePlayerKey(program, selections || {});
    if (selections && selections.needsPlayerOne) return "playerone";
    return base;
  }

  function normalizeOptions(selections) {
    const billingCycle = selections.billingCycle === "annual" ? "annual" : "monthly";
    return {
      locationCount: clampLocations(selections.locationCount),
      billingCycle,
      warranty: !!selections.warranty,
      messaging: !!selections.messaging,
      needsPlayerOne: !!selections.needsPlayerOne
    };
  }

  function buildItems(program, playerKey, options) {
    const player = program.players[playerKey] || program.players.app;
    const musicMonthly = program.music;
    const musicAnnual = program.music && program.music.annual;
    const items = [];

    for (let i = 0; i < options.locationCount; i++) {
      items.push(line(player, {
        locationIndex: i,
        role: "player",
        shippable: !!player.shippable
      }));

      if (options.billingCycle === "annual" && musicAnnual) {
        items.push(line(musicAnnual, {
          locationIndex: i,
          role: "music",
          shippable: false,
          billingCycle: "annual",
          recurring: false
        }));
      } else {
        items.push(line(musicMonthly, {
          locationIndex: i,
          role: "music",
          shippable: false,
          billingCycle: "monthly",
          recurring: true
        }));
      }

      if (options.warranty && playerKey === "playerone" && program.addons && program.addons.warranty) {
        items.push(line(program.addons.warranty, {
          locationIndex: i,
          role: "warranty",
          shippable: false
        }));
      }

      if (options.messaging && program.addons && program.addons.messaging) {
        items.push(line(program.addons.messaging, {
          locationIndex: i,
          role: "messaging",
          shippable: false,
          recurring: true
        }));
      }
    }

    return items;
  }

  function totalsFromItems(items, billingCycle) {
    let dueToday = 0;
    let recurringMonthly = 0;
    items.forEach((item) => {
      const amount = Number(item.price || 0) * (item.quantity || 1);
      if (item.recurring) recurringMonthly += amount;
      else dueToday += amount;
    });
    if (billingCycle === "monthly") dueToday += recurringMonthly;
    const due = Math.round(dueToday * 100) / 100;
    return {
      dueToday: due,
      recurringMonthly: Math.round(recurringMonthly * 100) / 100,
      subtotal: due
    };
  }

  function emptyLocations(count, seed) {
    const locations = [];
    for (let i = 0; i < count; i++) {
      locations.push({
        siteName: i === 0 && seed && seed.locationName ? seed.locationName : "",
        clientKey: "",
        address1: i === 0 && seed && seed.locationAddress ? seed.locationAddress : "",
        city: "",
        state: "",
        zip: "",
        industry: "restaurant"
      });
    }
    return locations;
  }

  function buildCart(program, selections) {
    if (!program || !program.music || !program.players) {
      throw new Error("Invalid program config");
    }
    const options = normalizeOptions(selections || {});
    const playerKey = resolvePlayerKey(program, selections || {});
    const items = buildItems(program, playerKey, options);
    const money = totalsFromItems(items, options.billingCycle);
    const contact = {
      locationName: (selections && selections.locationName) || "",
      locationAddress: (selections && selections.locationAddress) || "",
      contactName: (selections && selections.contactName) || "",
      contactTitle: (selections && selections.contactTitle) || "",
      contactEmail: (selections && selections.contactEmail) || "",
      contactPhone: (selections && selections.contactPhone) || "",
      notes: (selections && selections.notes) || ""
    };

    return {
      programId: program.programId,
      programName: program.programName,
      salesmanEmail: program.salesmanEmail || "",
      placeholders: program.placeholders === true,
      placeholderNote: program.placeholderNote || "",
      crmCustomerId: program.crmCustomerId,
      playerKey,
      originalPlayerKey: basePlayerKey(program, selections || {}),
      locationCount: options.locationCount,
      billingCycle: options.billingCycle,
      warranty: options.warranty && playerKey === "playerone",
      messaging: options.messaging,
      items,
      locations: emptyLocations(options.locationCount, contact),
      dueToday: money.dueToday,
      recurringMonthly: money.recurringMonthly,
      subtotal: money.dueToday,
      hasShipping: items.some((item) => item.shippable),
      contact,
      hdcartLines: items.map((item) => ({
        label: "PartID",
        skuCode: item.skuCode,
        crmPartId: item.crmPartId,
        name: item.name,
        price: item.price,
        locationIndex: item.locationIndex
      }))
    };
  }

  function applyOptions(program, cart, options) {
    const originalPlayerKey = (cart && cart.originalPlayerKey) || (cart && cart.playerKey) || "app";
    const next = buildCart(program, Object.assign({}, cart && cart.contact, {
      originalPlayerKey,
      playerKey: originalPlayerKey,
      hardwarePreference: originalPlayerKey === "playerone" ? "PlayerOne" : "app",
      locationCount: options && options.locationCount,
      billingCycle: options && options.billingCycle,
      warranty: options && options.warranty,
      messaging: options && options.messaging,
      needsPlayerOne: !!(options && options.needsPlayerOne),
      locationName: cart && cart.contact && cart.contact.locationName,
      locationAddress: cart && cart.contact && cart.contact.locationAddress,
      contactName: cart && cart.contact && cart.contact.contactName,
      contactTitle: cart && cart.contact && cart.contact.contactTitle,
      contactEmail: cart && cart.contact && cart.contact.contactEmail,
      contactPhone: cart && cart.contact && cart.contact.contactPhone,
      notes: cart && cart.contact && cart.contact.notes
    }));

    if (cart && Array.isArray(cart.locations) && cart.locations.length) {
      next.locations = emptyLocations(next.locationCount, cart.contact).map((loc, i) => {
        const prev = cart.locations[i] || (i > 0 ? null : cart.locations[0]);
        return prev ? Object.assign({}, loc, prev) : loc;
      });
    }
    return next;
  }

  function storage() {
    try {
      return typeof sessionStorage === "undefined" ? null : sessionStorage;
    } catch (err) {
      return null;
    }
  }

  function saveCart(cart) {
    const store = storage();
    if (store) store.setItem(STORAGE_KEY, JSON.stringify(cart));
  }

  function loadCart() {
    try {
      const store = storage();
      return store ? JSON.parse(store.getItem(STORAGE_KEY) || "null") : null;
    } catch (err) {
      return null;
    }
  }

  function buildIdentity(path, fields) {
    const identity = {
      path: path === "signin" ? "signin" : "create",
      accountMode: path === "signin" ? "returning" : "new"
    };
    Object.keys(fields || {}).forEach((key) => {
      if (SECRET_FIELDS[key]) {
        identity[key + "Present"] = !!String(fields[key] || "").trim();
        return;
      }
      identity[key] = fields[key];
    });
    return identity;
  }

  function saveIdentity(identity) {
    const store = storage();
    if (store) store.setItem(IDENTITY_KEY, JSON.stringify(identity));
  }

  function loadIdentity() {
    try {
      const store = storage();
      return store ? JSON.parse(store.getItem(IDENTITY_KEY) || "null") : null;
    } catch (err) {
      return null;
    }
  }

  function clearIdentity() {
    const store = storage();
    if (store) store.removeItem(IDENTITY_KEY);
  }

  function checkoutPath(programId) {
    return "/checkout/?program=" + encodeURIComponent(programId || "brokenyolk");
  }

  function landingPath(programId) {
    return "/" + (programId || "brokenyolk") + "/?setup=1";
  }

  function canPostToProCheckout(cart) {
    return !!(cart && cart.placeholders === false && cart.items && cart.items.length);
  }

  function beginCheckout(program, selections) {
    const cart = buildCart(program, selections);
    saveCart(cart);
    clearIdentity();
    return checkoutPath(program.programId);
  }

  async function startFromForm(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    if (needsLead(data.hardwarePreference)) return false;
    const programId = data.programId || "brokenyolk";
    const res = await fetch("/programs/" + programId + ".json", { cache: "no-store" });
    if (!res.ok) throw new Error("Could not load program catalog");
    const program = await res.json();
    window.location.href = beginCheckout(program, data);
    return true;
  }

  const api = {
    STORAGE_KEY,
    IDENTITY_KEY,
    MAX_LOCATIONS,
    mapHardware,
    needsLead,
    setupNextStep,
    buildCart,
    applyOptions,
    saveCart,
    loadCart,
    buildIdentity,
    saveIdentity,
    loadIdentity,
    clearIdentity,
    checkoutPath,
    landingPath,
    canPostToProCheckout,
    beginCheckout,
    startFromForm
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.ProgramCheckout = api;
})(typeof window !== "undefined" ? window : globalThis);
