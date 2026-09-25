const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  buildCart,
  mapHardware,
  needsLead,
  setupNextStep,
  buildIdentity,
  checkoutPath,
  landingPath,
  canPostToProCheckout,
  beginCheckout
} = require("../public/assets/program-checkout.js");

test("Find Your Setup sends Sonos, tablet, computer, and wired to checkout confirmation", () => {
  assert.equal(setupNextStep("sonos").action, "checkout");
  assert.equal(setupNextStep("sonos").playerKey, "app");
  assert.equal(setupNextStep("sonos").hardwareValue, "Sonos");
  assert.match(setupNextStep("sonos").blurb, /Sonos/i);
  assert.equal(setupNextStep("sonos").image, "assets/sonos_soundtrack.png");
  assert.equal(setupNextStep("bluetooth").hardwareValue, "iPad / phone app");
  assert.match(setupNextStep("bluetooth").blurb, /phone or tablet/i);
  assert.equal(setupNextStep("bluetooth").image, "assets/ipad_soundtrack_app.png");
  assert.equal(setupNextStep("computer").hardwareValue, "PC / Mac");
  assert.match(setupNextStep("computer").blurb, /PC or Mac/i);
  assert.equal(setupNextStep("computer").image, "assets/store-computer.png");
  assert.equal(setupNextStep("wired").action, "checkout");
  assert.equal(setupNextStep("wired").playerKey, "playerone");
  assert.equal(setupNextStep("wired").hardwareValue, "Wired speakers / amplifier");
  assert.match(setupNextStep("wired").blurb, /PlayerOne/i);
  assert.equal(setupNextStep("wired").image, "assets/playerone_wp_white.png");
  assert.match(setupNextStep("wired").note, /\$129/);
  assert.match(setupNextStep("wired").note, /one-time/i);
});

test("unknown setups still go to the sales form, not checkout", () => {
  assert.equal(setupNextStep("unknown").action, "lead");
  assert.equal(needsLead("Wired speakers / amplifier"), true);
});

const program = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../public/programs/brokenyolk.json"), "utf8")
);

test("wired confirmation hands off a PlayerOne cart", () => {
  const step = setupNextStep("wired");
  const cart = buildCart(program, {
    playerKey: step.playerKey,
    hardwarePreference: step.hardwareValue
  });
  assert.equal(cart.playerKey, "playerone");
  assert.equal(cart.hasShipping, true);
  assert.equal(cart.items[0].crmPartId, 91144);
});

test("Broken Yolk catalog is marked placeholder at $27.95", () => {
  assert.equal(program.placeholders, true);
  assert.equal(program.salesmanEmail, "JSpangler@dm-us.com");
  assert.equal(program.music.skuCode, "9BY1");
  assert.equal(program.music.crmPartId, 91010);
  assert.equal(program.music.price, 27.95);
  assert.equal(program.players.playerone.price, 129);
  assert.equal(program.players.playerone.recurring, false);
});

test("mapHardware routes PlayerOne, app, and speakers", () => {
  assert.equal(mapHardware("PlayerOne (wired system)"), "playerone");
  assert.equal(mapHardware("iPad / phone app"), "app");
  assert.equal(mapHardware("PC / Mac"), "app");
  assert.equal(mapHardware("Sonos"), "app");
  assert.equal(mapHardware("Need New Audio System / Speakers"), "speakers");
  assert.equal(needsLead("Need New Speakers / Commercial Audio Quote"), true);
  assert.equal(needsLead("PlayerOne (wired system)"), false);
});

test("app cart is music + free player, not shippable", () => {
  const cart = buildCart(program, {
    hardwarePreference: "iPad / phone app",
    locationName: "San Clemente (#14)",
    contactEmail: "gm@example.com"
  });
  assert.equal(cart.placeholders, true);
  assert.equal(cart.playerKey, "app");
  assert.equal(cart.hasShipping, false);
  assert.equal(cart.billingCycle, "monthly");
  assert.equal(cart.locationCount, 1);
  assert.equal(cart.items[0].crmPartId, 91025);
  assert.equal(cart.items[1].price, 27.95);
  assert.equal(cart.dueToday, 27.95);
  assert.equal(cart.recurringMonthly, 27.95);
  assert.equal(cart.subtotal, 27.95);
});

test("PlayerOne not covered by corporate is a one-time $129 fee per player", () => {
  const cart = buildCart(program, { hardwarePreference: "PlayerOne (wired system)", warranty: false });
  assert.equal(cart.playerKey, "playerone");
  assert.equal(cart.hasShipping, true);
  assert.equal(cart.items[0].crmPartId, 91144);
  assert.equal(cart.items[0].price, 129);
  assert.equal(cart.items[0].recurring, false);
  assert.equal(cart.dueToday, 156.95);
  assert.equal(cart.recurringMonthly, 27.95);

  const two = buildCart(program, { playerKey: "playerone", locationCount: 2, warranty: false });
  assert.equal(two.items.filter((item) => item.role === "player").length, 2);
  assert.equal(two.dueToday, Math.round((129 * 2 + 27.95 * 2) * 100) / 100);
  assert.equal(two.recurringMonthly, 55.9);
});

test("optional messaging add-on uses placeholder PartID", () => {
  const cart = buildCart(program, {
    hardwarePreference: "PlayerOne",
    messaging: true,
    warranty: false
  });
  assert.equal(cart.items.length, 3);
  assert.equal(cart.items[2].crmPartId, 90166);
  assert.equal(cart.dueToday, 161.95);
  assert.equal(cart.recurringMonthly, 32.95);
});

test("annual billing swaps monthly music for annual PartID", () => {
  const { applyOptions } = require("../public/assets/program-checkout.js");
  const cart = buildCart(program, { playerKey: "app", billingCycle: "annual" });
  assert.equal(cart.billingCycle, "annual");
  assert.equal(cart.items[1].crmPartId, 91011);
  assert.equal(cart.items[1].price, 335.4);
  assert.equal(cart.dueToday, 335.4);
  assert.equal(cart.recurringMonthly, 0);
  const monthly = applyOptions(program, cart, { locationCount: 1, billingCycle: "monthly" });
  assert.equal(monthly.items[1].crmPartId, 91010);
});

test("two locations duplicate player + music lines", () => {
  const cart = buildCart(program, { playerKey: "app", locationCount: 2 });
  assert.equal(cart.locationCount, 2);
  assert.equal(cart.items.length, 4);
  assert.equal(cart.items.filter((i) => i.role === "music").length, 2);
  assert.equal(cart.dueToday, 55.9);
  assert.equal(cart.locations.length, 2);
});

test("shipping can go to each location or one batch address", () => {
  const { shippingPlan } = require("../public/assets/program-checkout.js");
  const locations = [
    { siteName: "Store 14", address1: "1 Main", city: "San Diego", state: "CA", zip: "92101" },
    { siteName: "Store 15", address1: "2 Oak", city: "Irvine", state: "CA", zip: "92602" }
  ];
  const each = shippingPlan(locations, "each");
  assert.equal(each.mode, "each");
  assert.equal(each.destinations[0].address, "1 Main, San Diego, CA 92101");
  assert.equal(each.destinations[1].address, "2 Oak, Irvine, CA 92602");
  assert.notEqual(each.destinations[0].address, each.destinations[1].address);

  const batch = shippingPlan(locations, "batch", "9 Warehouse, Phoenix, AZ 85001");
  assert.equal(batch.mode, "batch");
  assert.equal(batch.shippingString, "9 Warehouse, Phoenix, AZ 85001");
  assert.equal(batch.destinations[0].address, batch.destinations[1].address);
});

test("PlayerOne warranty starts selected and can be removed", () => {
  const cart = buildCart(program, { playerKey: "playerone" });
  assert.equal(cart.warranty, true);
  assert.equal(cart.items.filter((item) => item.role === "warranty").length, 1);
  assert.equal(cart.dueToday, Math.round((129 + 27.95 + 59.99) * 100) / 100);

  const { applyOptions } = require("../public/assets/program-checkout.js");
  const declined = applyOptions(program, cart, {
    locationCount: 1,
    billingCycle: "monthly",
    warranty: false
  });
  assert.equal(declined.warranty, false);
  assert.equal(declined.items.some((item) => item.role === "warranty"), false);
  assert.equal(declined.dueToday, 156.95);
});

test("PlayerOne warranty add-on is one-time per location", () => {
  const cart = buildCart(program, {
    playerKey: "playerone",
    warranty: true,
    locationCount: 2
  });
  assert.equal(cart.warranty, true);
  assert.equal(cart.items.filter((i) => i.role === "warranty").length, 2);
  assert.equal(cart.dueToday, Math.round((129 * 2 + 27.95 * 2 + 59.99 * 2) * 100) / 100);
});

test("needsPlayerOne upgrades an app cart and unlocks warranty", () => {
  const { applyOptions } = require("../public/assets/program-checkout.js");
  const cart = buildCart(program, { playerKey: "app" });
  const next = applyOptions(program, cart, {
    locationCount: 1,
    billingCycle: "monthly",
    needsPlayerOne: true,
    warranty: true
  });
  assert.equal(next.originalPlayerKey, "app");
  assert.equal(next.playerKey, "playerone");
  assert.equal(next.hasShipping, true);
  assert.equal(next.items.find((i) => i.role === "player").price, 129);
  assert.equal(next.warranty, true);
  assert.ok(next.items.some((i) => i.role === "warranty"));
});

test("speaker quotes cannot build a checkout cart", () => {
  assert.throws(
    () => buildCart(program, { hardwarePreference: "Need New Audio System / Speakers" }),
    /lead form/i
  );
});

test("identity payload never stores a password", () => {
  const identity = buildIdentity("create", {
    businessName: "Broken Yolk Cafe",
    emailAddress: "gm@example.com",
    password: "secret123"
  });
  assert.equal(identity.path, "create");
  assert.equal(identity.accountMode, "new");
  assert.equal(identity.emailAddress, "gm@example.com");
  assert.equal(identity.passwordPresent, true);
  assert.equal(identity.password, undefined);
});

test("returning identity is sign-in only", () => {
  const identity = buildIdentity("signin", { username: "gm@example.com", password: "x" });
  assert.equal(identity.path, "signin");
  assert.equal(identity.accountMode, "returning");
  assert.equal(identity.username, "gm@example.com");
  assert.equal(identity.password, undefined);
});

test("landing player choice hands off to checkout, not production", () => {
  const url = beginCheckout(program, { playerKey: "playerone" });
  assert.equal(url, "/checkout/?program=brokenyolk");
  assert.equal(checkoutPath("brokenyolk"), "/checkout/?program=brokenyolk");
  assert.equal(landingPath("brokenyolk"), "/brokenyolk/?setup=1");
  const built = buildCart(program, { playerKey: "app" });
  assert.equal(canPostToProCheckout(built), false);
  assert.equal(canPostToProCheckout({ placeholders: false, items: [{ skuCode: "x" }] }), true);
});
