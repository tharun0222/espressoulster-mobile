import { cafeBusinessDay, cafeCheckoutOrders } from "./cafe-order-day.ts";
import type { priceCart } from "./pricing.ts";
import { paymentVerificationSource, type CheckoutMode } from "./sandbox-checkout.ts";

type Quote = ReturnType<typeof priceCart>;

type Placement = {
  id: string;
  userId: string;
  key: string;
  fulfillment: string;
  paymentMethod: string;
  quote: Quote;
  contact: { name: string; phone: string; email: string };
  openingTime: unknown;
  verifiedPayment?: { reference: string; cartSnapshot: string; mode: CheckoutMode };
};

export function reserveOrderStock(
  db: Pick<D1Database, "prepare">, items: Quote["items"],
  products: { id: string; price: number; _raw: string; inventory: number | null }[],
) {
  const quantities = new Map<string, number>();
  for (const { productId, quantity } of items) {
    quantities.set(productId, (quantities.get(productId) ?? 0) + quantity);
  }
  const holds: { productId: string; quantity: number }[] = [];
  const currentProduct = `price=? AND data=? AND available=1 AND archived=0
    AND EXISTS(SELECT 1 FROM categories WHERE id=products.category_id AND enabled=1)`;
  const statements = Array.from(quantities, ([productId, quantity]) => {
    const product = products.find((entry) => entry.id === productId)!;
    if (product.inventory === null) {
      // Leave valid unlimited stock untouched. Force the stock constraint to
      // reject a stale quote if price, availability or stock tracking changed.
      return db.prepare(`UPDATE products SET inventory=-1
        WHERE id=? AND CASE WHEN ${currentProduct} AND inventory IS NULL THEN 0 ELSE 1 END=1`)
        .bind(productId, product.price, product._raw);
    }
    holds.push({ productId, quantity });
    return db.prepare(`UPDATE products SET inventory=CASE
      WHEN ${currentProduct} AND inventory IS NOT NULL THEN inventory-? ELSE -1 END WHERE id=?`)
      .bind(product.price, product._raw, quantity, productId);
  });
  return { holds, statements };
}

export function orderPlacementStatements(db: Pick<D1Database, "prepare">, order: Placement) {
  const { id, userId, key, fulfillment, paymentMethod, quote, contact, verifiedPayment } = order;
  const now = new Date();
  const day = cafeBusinessDay(now, order.openingTime);
  const prefix = day.date.split("-").reverse().join("");
  const createdAt = now.toISOString().slice(0, 19).replace("T", " ");
  const statements = [
    db.prepare(`INSERT INTO cafe_order_sequences(business_day,last_number)
      VALUES (?, COALESCE(
        (SELECT last_number + 1 FROM cafe_order_sequences WHERE business_day=?),
        (SELECT COUNT(*) + 1 FROM orders WHERE created_at>=? AND ${cafeCheckoutOrders})
      ))
      ON CONFLICT(business_day) DO UPDATE SET last_number=cafe_order_sequences.last_number+1`)
      .bind(day.date, day.date, day.startsAt),
    db.prepare(`INSERT INTO orders (id,user_id,idempotency_key,fulfillment,checkout_payment_method,subtotal,tax,discount,fee,total,currency,contact,created_at,payment_status,order_number)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,? || '-' || printf('%03d', (SELECT last_number FROM cafe_order_sequences WHERE business_day=?)))
      RETURNING order_number`)
      .bind(id, userId, key, fulfillment, paymentMethod, quote.subtotal, quote.tax, quote.discount, quote.fee,
        quote.total, quote.currency, JSON.stringify(contact), createdAt, verifiedPayment ? "paid" : "unpaid", prefix, day.date),
    ...quote.items.map((item) => db.prepare(`INSERT INTO order_items
      (id,order_id,product_id,name,quantity,unit_price,selections,instructions) VALUES (?,?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(), id, item.productId, item.name, item.quantity, item.unitPrice,
        JSON.stringify(item.selections), item.instructions)),
    db.prepare("INSERT INTO order_events (id,order_id,status,actor) VALUES (?,?,?,?)")
      .bind(crypto.randomUUID(), id, "pending", userId),
    db.prepare("INSERT INTO profiles (id,email,name,phone) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,phone=excluded.phone")
      .bind(userId, contact.email, contact.name, contact.phone),
  ];
  if (verifiedPayment) {
    statements.push(
      db.prepare(`INSERT INTO payments (id,order_id,amount,method,reference,verified_by)
        VALUES (?,?,?,?,?,?)`)
        .bind(paymentMethod + ":" + verifiedPayment.reference, id, quote.total, paymentMethod, verifiedPayment.reference, paymentVerificationSource(verifiedPayment.mode)),
      db.prepare("DELETE FROM carts WHERE user_id=? AND data=?").bind(userId, verifiedPayment.cartSnapshot),
    );
  } else {
    statements.push(db.prepare("DELETE FROM carts WHERE user_id=?").bind(userId));
  }
  return statements;
}
