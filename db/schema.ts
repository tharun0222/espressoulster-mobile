import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/sqlite-core";
const created = () =>
  text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`);
export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
  enabled: integer("enabled").notNull().default(1),
  image: text("image").notNull().default(""),
});
export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id),
    price: integer("price"),
    inventory: integer("inventory"),
    available: integer("available").notNull().default(0),
    archived: integer("archived").notNull().default(0),
    data: text("data").notNull(),
    createdAt: created(),
    updatedAt: text("updated_at").notNull().default(""),
  },
  (t) => [
    index("idx_products_category").on(t.categoryId),
    check(
      "product_price_nonnegative",
      sql`${t.price} IS NULL OR ${t.price} >= 0`,
    ),
    check(
      "inventory_nonnegative",
      sql`${t.inventory} IS NULL OR ${t.inventory} >= 0`,
    ),
  ],
);
export const profiles = sqliteTable("profiles", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name").notNull().default(""),
  phone: text("phone").notNull().default(""),
  dateOfBirth: text("date_of_birth").notNull().default(""),
  disabled: integer("disabled").notNull().default(0),
  createdAt: created(),
});
export const carts = sqliteTable("carts", {
  userId: text("user_id").primaryKey(),
  data: text("data").notNull(),
  createdAt: created(),
  updatedAt: text("updated_at").notNull().default(""),
});
export const addresses = sqliteTable(
  "addresses",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    data: text("data").notNull(),
  },
  (t) => [index("idx_addresses_user").on(t.userId)],
);
export const favorites = sqliteTable(
  "favorites",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
  },
  (t) => [uniqueIndex("idx_favorites_user_product").on(t.userId, t.productId)],
);
export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    status: text("status").notNull().default("pending"),
    fulfillment: text("fulfillment").notNull(),
    paymentStatus: text("payment_status").notNull().default("unpaid"),
    subtotal: integer("subtotal").notNull(),
    tax: integer("tax").notNull(),
    discount: integer("discount").notNull(),
    fee: integer("fee").notNull(),
    total: integer("total").notNull(),
    currency: text("currency").notNull(),
    contact: text("contact").notNull(),
    createdAt: created(),
  },
  (t) => [
    index("idx_orders_user").on(t.userId),
    index("idx_orders_status").on(t.status),
  ],
);
export const orderItems = sqliteTable(
  "order_items",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    name: text("name").notNull(),
    quantity: integer("quantity").notNull(),
    unitPrice: integer("unit_price").notNull(),
    selections: text("selections").notNull(),
    instructions: text("instructions").notNull().default(""),
  },
  (t) => [index("idx_order_items_order").on(t.orderId)],
);
export const orderEvents = sqliteTable(
  "order_events",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    status: text("status").notNull(),
    actor: text("actor").notNull(),
    createdAt: created(),
  },
  (t) => [index("idx_events_order").on(t.orderId)],
);
export const settings = sqliteTable("settings", {
  id: text("id").primaryKey(),
  data: text("data").notNull(),
});
export const suggestions = sqliteTable("suggestions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  status: text("status").notNull().default("pending"),
  data: text("data").notNull(),
  createdAt: created(),
});
export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  target: text("target").notNull(),
  createdAt: created(),
});
export const uploads = sqliteTable("uploads", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  createdAt: created(),
});
export const payments = sqliteTable("payments", {
  id: text("id").primaryKey(),
  orderId: text("order_id")
    .notNull()
    .unique()
    .references(() => orders.id),
  amount: integer("amount").notNull(),
  method: text("method").notNull(),
  reference: text("reference").notNull(),
  verifiedBy: text("verified_by").notNull(),
  createdAt: created(),
});

export const paymentIntents = sqliteTable("payment_intents", {
 id: text("id").primaryKey(),
 orderId: text("order_id").notNull().unique().references(()=>orders.id),
 userId: text("user_id").notNull(),
 providerOrderId: text("provider_order_id").unique(),
 amount: integer("amount").notNull(),
 currency: text("currency").notNull(),
 state: text("state").notNull().default("creating"),
 provider: text("provider").notNull().default("razorpay"),
 mode: text("mode").notNull().default("test"),
 merchantOrderId: text("merchant_order_id").unique(),
 checkoutUrl: text("checkout_url"),
 expiresAt: integer("expires_at"),
 createdAt: created(),
});

export const coffeeSubscriptions = sqliteTable("coffee_subscriptions", {
 id:text("id").primaryKey(), userId:text("user_id").notNull(),
 paymentId:text("payment_id").notNull().unique().references(()=>payments.id),
 planName:text("plan_name").notNull().default("1 Week Subscription"),
 totalCredits:integer("total_credits").notNull(),bonusCredits:integer("bonus_credits").notNull().default(0),planId:text("plan_id").notNull().default("weekly"),startsAt:text("starts_at").notNull(),expiresAt:text("expires_at").notNull(),
 revoked:integer("revoked").notNull().default(0),createdAt:created(),
});
export const coffeeRedemptions = sqliteTable("coffee_redemptions", {
 id:text("id").primaryKey(),subscriptionId:text("subscription_id").notNull().references(()=>coffeeSubscriptions.id),
 orderId:text("order_id").notNull().references(()=>orders.id),credits:integer("credits").notNull(),reversedAt:text("reversed_at"),createdAt:created(),
},t=>[uniqueIndex("idx_subscription_order_redemption").on(t.subscriptionId,t.orderId)]);

export const pinAccounts=sqliteTable("pin_accounts",{phone:text("phone").primaryKey(),userId:text("user_id").notNull().unique().references(()=>profiles.id),pinSalt:text("pin_salt").notNull(),pinHash:text("pin_hash").notNull(),createdAt:created()});
export const pinSessions=sqliteTable("pin_sessions",{tokenHash:text("token_hash").primaryKey(),userId:text("user_id").notNull().references(()=>profiles.id),expiresAt:integer("expires_at").notNull(),createdAt:created()},t=>[index("pin_sessions_user").on(t.userId),index("pin_sessions_expiry").on(t.expiresAt)]);
export const pinLoginAttempts=sqliteTable("pin_login_attempts",{id:text("id").primaryKey(),phoneHash:text("phone_hash").notNull(),ipHash:text("ip_hash").notNull(),createdAt:integer("created_at").notNull()},t=>[index("pin_attempts_phone").on(t.phoneHash,t.createdAt),index("pin_attempts_ip").on(t.ipHash,t.createdAt),index("pin_attempts_time").on(t.createdAt)]);
export const subscriptionTestPurchases=sqliteTable("subscription_test_purchases",{userId:text("user_id").primaryKey(),orderId:text("order_id").notNull().unique().references(()=>orders.id),createdAt:created()});

export const subscriptionDailyCodes=sqliteTable("subscription_daily_codes",{userId:text("user_id").notNull(),day:text("day").notNull(),subscriptionId:text("subscription_id").notNull().references(()=>coffeeSubscriptions.id),codeHash:text("code_hash").notNull(),expiresAt:integer("expires_at").notNull(),redeemedOrderId:text("redeemed_order_id").unique().references(()=>orders.id)},t=>[uniqueIndex("idx_daily_code_user_day").on(t.userId,t.day)]);

export const subscriptionPlanTestPurchases=sqliteTable("subscription_plan_test_purchases",{userId:text("user_id").notNull(),planId:text("plan_id").notNull(),orderId:text("order_id").notNull().unique().references(()=>orders.id),createdAt:created()},t=>[uniqueIndex("idx_user_plan_test_purchase").on(t.userId,t.planId)]);

export const subscriptionRenewalPurchases=sqliteTable("subscription_renewal_purchases",{userId:text("user_id").notNull(),planId:text("plan_id").notNull(),orderId:text("order_id").primaryKey().references(()=>orders.id),createdAt:created()},t=>[index("idx_subscription_renewal_user_plan").on(t.userId,t.planId),check("renewal_plan_id",sql`${t.planId} IN ('weekly','monthly')`)]);
