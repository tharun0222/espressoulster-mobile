// Run against the local app with a test order and separate customer/staff accounts.
// Requires playwright-core and Chrome. Supply credentials as environment variables,
// or point CHAT_CUSTOMER_STATE and CHAT_STAFF_STATE at Playwright storage states.
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { chromium, devices } = require(process.env.CHAT_PLAYWRIGHT_MODULE || "playwright-core");

const origin = "http://127.0.0.1:5173";
const orderId = process.env.CHAT_TEST_ORDER;
const customerState = process.env.CHAT_CUSTOMER_STATE;
const staffState = process.env.CHAT_STAFF_STATE;

function required(name) {
  const value = process.env[name];
  assert.ok(value, "Set " + name + " for the local test.");
  return value;
}

async function signIn(context, path, data) {
  const response = await context.request.post(origin + "/api/" + path, { data });
  assert.ok(response.ok(), "Test sign-in failed at " + path + " (HTTP " + response.status() + ").");
}

async function send(page, text, path) {
  await page.getByRole("textbox", { name: "Message", exact: true }).fill(text);
  const [response] = await Promise.all([
    page.waitForResponse(result => result.url() === origin + path && result.request().method() === "POST"),
    page.getByRole("button", { name: "Send message", exact: true }).click(),
  ]);
  assert.ok(response.ok(), "Chat send failed (HTTP " + response.status() + ").");
}

async function run() {
  assert.match(orderId || "", /^CH-[A-F0-9]{8}$/, "Set CHAT_TEST_ORDER to a local test order ID.");
  const customerCredentials = customerState ? null : {
    phone: required("CHAT_CUSTOMER_PHONE"),
    pin: required("CHAT_CUSTOMER_PIN"),
  };
  const staffCredentials = staffState ? null : {
    username: required("CHAT_STAFF_USERNAME"),
    password: required("CHAT_STAFF_PASSWORD"),
  };
  const browser = await chromium.launch(process.env.CHAT_QA_CHROME
    ? { executablePath: process.env.CHAT_QA_CHROME }
    : { channel: "chrome" });
  try {
    const mobile = { ...devices["Pixel 7"], viewport: { width: 393, height: 851 } };
    const customer = await browser.newContext({ ...mobile, storageState: customerState });
    const staff = await browser.newContext({ ...mobile, storageState: staffState });
    if (customerCredentials) await signIn(customer, "auth/pin/login", customerCredentials);
    if (staffCredentials) await signIn(staff, "auth/admin/login", staffCredentials);
    await customer.addInitScript(() => localStorage.setItem("espresso-permissions-reviewed-v1", "true"));

    const customerPage = await customer.newPage();
    await customerPage.goto(origin + "/#home");
    const nav = customerPage.getByRole("navigation", { name: "Main navigation" });
    await nav.getByRole("button", { name: "Profile", exact: true }).click();
    await customerPage.getByRole("button", { name: "My orders", exact: true }).click();
    await customerPage.locator(".order-card").filter({ hasText: orderId })
      .getByRole("button", { name: "Chat with the café" }).click();

    const staffPage = await staff.newPage();
    await staffPage.goto(origin + "/admin");
    await staffPage.locator(".admin-columns").first().waitFor();
    const adminNav = staffPage.getByRole("navigation", { name: "Mobile administrator navigation" });
    await adminNav.getByRole("button", { name: "Orders", exact: true }).click();
    await staffPage.getByRole("textbox", { name: "Search orders" }).fill(orderId);
    await staffPage.locator(".admin-order-list .admin-panel").filter({ hasText: orderId })
      .getByRole("button", { name: "Customer chat" }).click();

    const navigations = [];
    for (const page of [customerPage, staffPage]) {
      page.on("framenavigated", frame => {
        if (frame === page.mainFrame()) navigations.push(frame.url());
      });
    }

    const runId = randomUUID().slice(0, 8);
    const customerMessage = "Automated chat test " + runId + " from customer.";
    const staffMessage = "Automated chat test " + runId + " reply from staff.";
    await send(customerPage, customerMessage, "/api/orders/" + orderId + "/chat");
    await staffPage.getByRole("log").getByText(customerMessage, { exact: true }).waitFor({ timeout: 10000 });
    await send(staffPage, staffMessage, "/api/admin/orders/" + orderId + "/chat");
    await customerPage.getByRole("log").getByText(staffMessage, { exact: true }).waitFor({ timeout: 10000 });
    assert.deepEqual(navigations, [], "Both chat views must update without a page navigation.");
    console.log(orderId + " passed: customer message and staff reply arrived without a refresh.");
  } finally {
    await browser.close();
  }
}

run().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
