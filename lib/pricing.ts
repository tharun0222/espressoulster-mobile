export class BusinessError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function assert(
  condition: unknown,
  message: string,
  status = 400,
): asserts condition {
  if (!condition) throw new BusinessError(message, status);
}
export function whole(value: any, min = 0, max = 100000000) {
  assert(
    Number.isSafeInteger(value) && value >= min && value <= max,
    "Invalid numeric value",
  );
  return value as number;
}
export function text(value: any, max = 500, required = false) {
  assert(
    typeof value === "string" &&
      value.length <= max &&
      (!required || value.trim().length > 0),
    "Invalid or missing text",
  );
  return value.trim();
}
export function priceCart(
  lines: any[],
  products: any[],
  categories: any[],
  settings: any,
  code = "",
  fulfillment = "pickup",
) {
  assert(
    Array.isArray(lines) && lines.length > 0 && lines.length <= 100,
    "Your cart is empty or too large",
  );
  const seen = new Set();
  const items = lines.map((line) => {
    assert(line && typeof line.productId === "string", "Invalid cart item");
    const p = products.find((p) => p.id === line.productId);
    assert(
      p &&
        !p.archived &&
        p.available &&
        p.price !== null &&
        categories.some((c) => c.id === p.categoryId && c.enabled),
      "This item is unavailable",
    );
    assert(!p.testPrice || settings.testMode === true, "Temporary test prices cannot be used for real orders");
    const quantity = whole(line.quantity, 1, 99);
    const variantId = line.variantId || "";
    const addonIds = line.addonIds || [];
    assert(
      Array.isArray(addonIds) &&
        new Set(addonIds).size === addonIds.length &&
        addonIds.length <= 20,
      "Invalid add-ons",
    );
    const key = JSON.stringify([p.id, variantId, [...addonIds].sort()]);
    assert(!seen.has(key), "Duplicate cart lines");
    seen.add(key);
    let unitPrice = whole(p.price);
    let selections: any = { variant: null, addons: [] };
    if ((p.variants || []).length) {
      const v = p.variants.find((v: any) => v.id === variantId);
      assert(v, "Select a valid variant");
      unitPrice += whole(v.price);
      selections.variant = v;
    } else assert(!variantId, "Invalid variant");
    for (const id of addonIds) {
      const a = (p.addons || []).find((a: any) => a.id === id);
      assert(a, "Invalid add-on");
      unitPrice += whole(a.price);
      selections.addons.push(a);
    }
    assert(unitPrice <= 100000000, "Price exceeds maximum");
    return {
      productId: p.id,
      name: p.name,
      quantity,
      unitPrice,
      selections,
      instructions: text(line.instructions || "", 300),
    };
  });
  for (const p of products) {
    const needed = items
      .filter((i) => i.productId === p.id)
      .reduce((s, i) => s + i.quantity, 0);
    if (needed && p.inventory !== null)
      assert(p.inventory >= needed, `${p.name} has insufficient stock`);
  }
  const subtotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  let discount = 0;
  if (code) {
    const offer = (settings.offers || []).find(
      (o: any) =>
        o.code === code &&
        o.enabled &&
        (!o.expires || new Date(o.expires + "T23:59:59Z") >= new Date()),
    );
    assert(offer, "Offer is invalid or expired");
    assert(
      subtotal >= (offer.minimum || 0),
      "Order does not meet the offer minimum",
    );
    discount = Math.min(
      subtotal,
      offer.type === "percent"
        ? Math.round((subtotal * whole(offer.value, 0, 10000)) / 10000)
        : whole(offer.value),
    );
  }
  const tax = Math.round(
    ((subtotal - discount) * whole(settings.taxBps, 0, 10000)) / 10000,
  );
  const fee = fulfillment === "delivery" ? whole(settings.deliveryFee) : 0;
  assert(
    fulfillment === "pickup"
      ? settings.pickupEnabled
      : fulfillment === "dine_in" ? settings.dineInEnabled
      : fulfillment === "delivery" && settings.deliveryEnabled,
    "This fulfilment method is unavailable",
  );
  return {
    items,
    subtotal,
    discount,
    tax,
    fee,
    total: subtotal - discount + tax + fee,
    currency: settings.currency,
  };
}
export function validateProduct(p: any) {
  assert(p && typeof p === "object", "Invalid product");
  text(p.id, 80, true);
  text(p.name, 150, true);
  text(p.categoryId, 80, true);
  text(p.description || "", 2000);
  if (p.price !== null) whole(p.price);
  if (p.inventory !== null) whole(p.inventory, 0, 1000000);
  for (const k of ["variants", "addons"]) {
    assert(Array.isArray(p[k]) && p[k].length <= 20, "Invalid options");
    const ids = new Set();
    for (const o of p[k]) {
      text(o.id, 80, true);
      text(o.name, 100, true);
      whole(o.price);
      assert(!ids.has(o.id), "Duplicate option");
      ids.add(o.id);
    }
  }
  assert(
    !p.available || p.price !== null,
    "Set a price before making an item available",
  );
  const image = p.image ?? "";
  assert(typeof image === "string" && image.length <= 2000, "Use a secure image URL");
  if (image) {
    let validImage = /^\/api\/images\/[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(image) || /^\/images\/menu\/items\/[a-zA-Z0-9_-]+\.(?:webp|png|jpe?g)$/.test(image);
    if (!validImage && !/\s/.test(image)) {
      try {
        const url = new URL(image);
        validImage = url.protocol === "https:" && !!url.hostname && !url.username && !url.password;
      } catch {}
    }
    assert(validImage, "Use a secure image URL");
  }
  assert(
    Array.isArray(p.dietary) &&
      p.dietary.every((x: any) =>
        ["Veg", "Non-veg", "Vegan", "Egg", "Gluten-free"].includes(x),
      ),
    "Invalid dietary labels",
  );
  return p;
}
export const transitions: Record<string, string[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["ready", "out_for_delivery"],
  ready: ["completed"],
  out_for_delivery: ["completed"],
  completed: [],
  cancelled: [],
};
export function validTransition(from: string, to: string, fulfillment: string) {
  assert(Object.hasOwn(transitions, from) && transitions[from].includes(to), "Invalid order status transition");
  assert(["pickup", "dine_in", "delivery"].includes(fulfillment), "Invalid fulfilment method");
  assert(
    !(fulfillment !== "delivery" && to === "out_for_delivery") &&
      !(fulfillment === "delivery" && to === "ready"),
    "Status does not match fulfilment",
  );
}
