const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("path");

const html = fs.readFileSync(
  path.join(__dirname, "../public/checkout/index.html"),
  "utf8"
);

const required = [
  "username",
  "usernameForgot",
  "businessName",
  "firstName",
  "lastName",
  "phoneNumber",
  "Phone2",
  "emailAddress",
  "city",
  "state",
  "zip",
  "chkSMSBilling",
  "chkSMSPromotion",
  "chkSMSService",
  "siteName",
  "address1",
  "industry",
  "shippingString",
  "shipContactName",
  "shipContactPhone",
  "bgName",
  "ccNumber",
  "ccName",
  "ccMonth",
  "ccYear",
  "ccCVV",
  "billAddress1",
  "billAddress2",
  "billCity",
  "billState",
  "billZip",
  "chkToS",
  "chkSYBToS",
  "chkRecurring",
  "DM_logo-black-blue.svg",
  "Dynamic Media"
];

test("checkout is Dynamic Media branded, not program-specific", () => {
  assert.match(html, /DM_logo-black-blue\.svg/);
  assert.match(html, /Dynamic Media/);
  assert.doesNotMatch(html, /text-by-orange|bg-by-orange|Broken Yolk Cafe header/);
  assert.doesNotMatch(html, /programKicker/);
  assert.doesNotMatch(html, /planChip/);
  assert.doesNotMatch(html, /Staging stand-in|placeholder PartIDs|placeholderNote/i);
});

test("checkout HTML includes ProCheckout field names", () => {
  const missing = required.filter((name) => !html.includes(name));
  assert.deepEqual(missing, []);
});

test("checkout starts on login, with create-account as a follow-on option", () => {
  const flow = fs.readFileSync(
    path.join(__dirname, "../public/assets/checkout-flow.js"),
    "utf8"
  );
  assert.match(html, /id="accountStep"/);
  assert.match(html, /id="cartStep" class="hidden/);
  assert.match(html, /Create a new account/);
  assert.match(html, /id="showCreateAccount"/);
  assert.match(html, /Order options/);
  assert.match(html, /name="billingCycle"/);
  assert.match(html, /name="locationCount"/);
  assert.match(html, /name="shippingMode"/);
  assert.match(html, /value="each"/);
  assert.match(html, /value="batch"/);
  assert.match(html, /Ship to each location/);
  assert.match(html, /Batch shipping/);
  assert.match(html, /name="warranty"/);
  assert.match(html, /id="warrantyInfo"/);
  assert.match(html, /id="warrantyModal"/);
  assert.match(html, /A replacement ships first/);
  assert.match(flow, /setWarrantyModal/);
  assert.match(html, /id="locationCards"/);
  assert.match(flow, /step: "account"/);
  assert.match(flow, /go\("cart"\)/);
  assert.match(flow, /\["account", "cart", "location"/);
  assert.match(flow, /dm-stepper/);
  assert.match(flow, /applyOptions/);
});

test("checkout footer matches live support content in the new layout", () => {
  assert.match(html, /dm-checkout-footer/);
  assert.match(html, /1-844-229-1217/);
  assert.match(html, /sales@dm-us\.com/);
  assert.match(html, /Mon\. - Fri\. 9AM - 6PM ET/);
  assert.match(html, /privacy-policy/);
  assert.match(html, /terms-and-conditions/);
  assert.match(html, /DM-logo-white-blue\.svg/);
});
