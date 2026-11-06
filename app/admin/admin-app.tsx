import TableBooking from '../table-booking';
import ProductOptions from './product-options';
import ProductRecipeEditor from './product-recipe-editor';
"use client";
import AdminSubscriptions from "./admin-subscriptions";
import { useState, useEffect, useRef } from "react";
import {
  Coffee,
  LayoutDashboard,
  ShoppingBag,
  Package,
  Users,
  Settings,
  Tags,
  Upload,
  Lightbulb,
  Search,
  Plus,
  X,
  Check,
  Archive,
  LogOut,
  RefreshCw,
  ClipboardList,
} from "lucide-react";
import { api, money, ProductImage } from "../store-app";
import { useDialogAccessibility } from "../../lib/dialog";
import { transitions } from "../../lib/pricing";
const blankProduct = () => ({
  id: "product-" + crypto.randomUUID(),
  name: "",
  categoryId: "coffee",
  description: "",
  price: null,
  inventory: null,
  available: false,
  archived: false,
  featured: false,
  image: "",
  imageAtlas: false,
  imagePosition: "center",
  dietary: [],
  variants: [],
  addons: [],
});
function minor(value: string) {
  if (!value.trim()) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(value))
    throw Error("Enter a nonnegative amount with at most two decimal places.");
  return Math.round(Number(value) * 100);
}
function readable(value: string = "") {
  return value.replaceAll("_", " ").replaceAll(".", " · ");
}
function activityLabel(action: string) {
  const labels: Record<string, string> = {
    "product.save": "Item details saved", "products.import": "Menu items imported",
    "category.save": "Category saved", "settings.save": "Store settings saved",
    "customer.status": "Customer access updated", "payment.cash_collected": "Cash payment collected",
    "payment.collected": "Payment collected", "suggestion.approved": "Suggested item approved",
    "suggestion.rejected": "Suggested item rejected",
  };
  return labels[action] || (action.startsWith("order.") ? "Order marked " + readable(action.slice(6)) : readable(action));
}
function paymentLabel(order: any) {
  const method = order.collection_method || order.payment_method;
  const labels: Record<string, string> = {cash: "Cash", upi: "UPI", card: "Card", pay_at_counter: "Pay at counter", pay_in_store: "Pay in store", phonepe: "PhonePe", stripe_test: "Stripe test — no real money", simulated: "Simulated payment (test)"};
  return labels[method] || (method ? readable(method) : "Not recorded");
}
function CustomerOrders({ customer, currency }: {customer: any; currency: string}) {
  const [rows, setRows] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(false);
  const [total, setTotal] = useState(customer.order_count || 0);
  const [error, setError] = useState("");
  async function fetchOrders(append = false) {
    setLoading(true); setError("");
    try {
      const result = await api("admin/customers/" + encodeURIComponent(customer.id) + "/orders?offset=" + (append ? rows.length : 0));
      setRows(old => append ? [...old, ...result.orders] : result.orders);
      setMore(result.hasMore); setTotal(result.total); setLoaded(true);
    } catch (e: any) {setError(e.message);} finally {setLoading(false);}
  }
  return <details onToggle={e => {if (e.currentTarget.open && !loaded && !loading) fetchOrders();}}>
    <summary>{total} orders</summary>
    {rows.map(o => <div key={o.id}>
      <p><strong>{o.id}</strong> · {money(o.total, o.currency || currency)} · {readable(o.status)}</p>
      {o.items.map((item: any) => <p className="fine-print" key={item.id}>{item.quantity} × {item.name}
        {item.selections?.variant?.name && " · " + item.selections.variant.name}
        {item.selections?.addons?.map((a: any) => " · " + a.name).join("")}
      </p>)}
    </div>)}
    {error && <p role="alert">{error} <button className="text-button" onClick={() => fetchOrders()}>Retry</button></p>}
    {loading && <p role="status">Loading orders…</p>}
    {more && <button className="text-button" disabled={loading} onClick={() => fetchOrders(true)}>Load older orders</button>}
  </details>;
}
export default function AdminApp() {
  const orderRequest = useRef(0);
  const overviewRequest = useRef(0);
  const [tab, setTab] = useState("overview"),
    [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("all"),
    [editing, setEditing] = useState<any>(null),
    [category, setCategory] = useState<any>(null),
    [settings, setSettings] = useState<any>(null),
    [variants, setVariants] = useState("[]"),
    [addons, setAddons] = useState("[]"),
    [importText, setImportText] = useState(""),
    [offers, setOffers] = useState("[]"),
    [approving, setApproving] = useState(""),
    [orderRows, setOrderRows] = useState<any[]>([]),
    [moreOrders, setMoreOrders] = useState(false),
    [loadingOrders, setLoadingOrders] = useState(false),
    [loadingOverview, setLoadingOverview] = useState(false);
  useDialogAccessibility(!!editing || !!category, () => {
    setEditing(null);
    setCategory(null);
  });
  async function load() {
    const request = ++overviewRequest.current;
    setLoadingOverview(true);
    setError("");
    try {
      const b = await api("admin/overview");
      if (request !== overviewRequest.current) return;
      setData(b);
      if (!settings) {
        setSettings(b.settings);
        setOffers(JSON.stringify(b.settings.offers, null, 2));
      }
    } catch (e: any) {
      if (request === overviewRequest.current) setError(e.message);
    } finally {
      if (request === overviewRequest.current) setLoadingOverview(false);
    }
  }
  useEffect(() => {
    void load();
    return () => { overviewRequest.current++; };
  }, []);
  async function loadOrders(append = false) {
    const request = ++orderRequest.current;
    setLoadingOrders(true);
    try {
      const b = await api(
        "admin/orders?offset=" +
          (append ? orderRows.length : 0) +
          "&q=" +
          encodeURIComponent(search) +
          "&status=" +
          encodeURIComponent(status),
      );
      if (request !== orderRequest.current) return;
      setOrderRows((old) => (append ? [...old, ...b.orders] : b.orders));
      setMoreOrders(b.orders.length === 50);
    } catch (e: any) {
      if (request === orderRequest.current) setError(e.message);
    } finally {
      if (request === orderRequest.current) setLoadingOrders(false);
    }
  }
  useEffect(() => {
    if (tab !== "orders") return;
    setLoadingOrders(true);
    const timer = setTimeout(() => { void loadOrders(); }, 200);
    return () => { clearTimeout(timer); orderRequest.current++; };
  }, [tab, search, status, data]);
  async function run(fn: () => Promise<any>, success = "Saved") {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
      setMessage(success);
      setTimeout(() => setMessage(""), 4500);
      return true;
    } catch (e: any) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  function edit(p: any) {
    setEditing({ ...p });
    setVariants(JSON.stringify(p.variants || [], null, 2));
    setAddons(JSON.stringify(p.addons || [], null, 2));
  }
  const currency = data?.settings.currency || "INR";
  const nav = [
    { id: "bookings", label: "Table bookings", icon: Users },
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "products", label: "Products", icon: Coffee },
    { id: "categories", label: "Categories", icon: Tags },
    { id: "orders", label: "Orders", icon: ShoppingBag },
    { id: "customers", label: "Customers", icon: Users },
    { id: "subscriptions", label: "Subscriptions", icon: Coffee },
    { id: "suggestions", label: "Suggestions", icon: Lightbulb },
    { id: "import", label: "Import catalog", icon: Upload },
    { id: "settings", label: "Store settings", icon: Settings },
    { id: "audit", label: "Activity log", icon: ClipboardList },
  ];
  return (
    <div className="admin-app">
      <aside className="admin-sidebar">
        <a className="admin-brand" href="/">
          <Coffee size={27} />
          <span>
            {data?.settings.brand || "Espressoulster Coffee"}
            <small>CAFÉ MANAGEMENT</small>
          </span>
        </a>
        <nav aria-label="Administrator navigation">
          {nav.map((n) => (
            <button
              key={n.id}
              className={tab === n.id ? "active" : ""}
              onClick={() => {
                setTab(n.id);
                setSearch("");
                setStatus("all");
                setError("");
              }}
            >
              <n.icon size={19} />
              {n.label}
              {n.id === "suggestions" &&
                data?.suggestions.filter((s: any) => s.status === "pending")
                  .length > 0 && (
                  <b>
                    {
                      data.suggestions.filter(
                        (s: any) => s.status === "pending",
                      ).length
                    }
                  </b>
                )}
            </button>
          ))}
        </nav>
        <button type="button" className="back-to-store admin-signout" disabled={busy} onClick={async()=>{setBusy(true);try{await api("auth/admin/logout","POST",{});location.assign("/admin")}catch(e){setError((e as Error).message);setBusy(false)}}}>
          <LogOut size={17} />
          Sign out
        </button>
      </aside>
      <main className="admin-main" aria-busy={loadingOverview}>
        <header className="admin-header">
          <div>
            <span className="eyebrow">YOUR CAFÉ, AT A GLANCE</span>
            <h1>{nav.find((n) => n.id === tab)?.label}</h1>
          </div>
          <button className="secondary" disabled={loadingOverview || busy} onClick={load}>
            <RefreshCw size={15} />
            Refresh
          </button>
        </header>
        {error && (
          <div className="error" role="alert">
            {error}
            <button onClick={() => setError("")} aria-label="Dismiss">
              <X size={17} />
            </button>
          </div>
        )}
        {message && (
          <div className="admin-success" role="status">
            <Check size={18} />
            {message}
          </div>
        )}
        {!data ? (
          <div className="empty-state">
            <Coffee size={40} />
            <h2>Opening the café dashboard…</h2>
            <button className="primary" disabled={loadingOverview} onClick={load}>
              Try again
            </button>
          </div>
        ) : (
          <>
            {tab === "bookings" && <TableBooking admin/>}
            {tab === "overview" && (
              <>
                <div className="stat-grid">
                  {[
                    { label: "Total orders", value: data.stats.total },
                    { label: "Pending orders", value: data.stats.pending || 0 },
                    {
                      label: "Completed orders",
                      value: data.stats.completed || 0,
                    },
                    {
                      label: "Collected revenue",
                      value: money(data.stats.revenue || 0, currency),
                    },
                  ].map((s) => (
                    <div className="stat-card" key={s.label}>
                      <span>{s.label}</span>
                      <strong>{s.value}</strong>
                    </div>
                  ))}
                </div>
                <div className="admin-columns">
                  <section className="admin-panel">
                    <h2>Before you open</h2>
                    <div className="alert-row">
                      <span className="alert-count">
                        {
                          data.products.filter(
                            (p: any) => p.price === null && !p.archived,
                          ).length
                        }
                      </span>
                      <div>
                        <strong>Products awaiting prices</strong>
                        <p>Unpriced items cannot be ordered.</p>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => setTab("products")}
                      >
                        Review
                      </button>
                    </div>
                    <div className="alert-row">
                      <span className="alert-count">
                        {
                          data.products.filter(
                            (p: any) =>
                              p.inventory !== null &&
                              p.inventory <= 5 &&
                              !p.archived,
                          ).length
                        }
                      </span>
                      <div>
                        <strong>Low-stock items</strong>
                        <p>Inventory of five or fewer.</p>
                      </div>
                    </div>
                    <div className="alert-row">
                      <Package size={24} />
                      <div>
                        <strong>{data.paymentConfig?.enabled ? data.paymentConfig.provider === "stripe" && data.paymentConfig.mode === "test" ? "Payments: Stripe sandbox enabled" : "Payments: online checkout enabled" : "Payments: collect at fulfilment"}</strong>
                        <p>{data.paymentConfig?.provider === "stripe" && data.paymentConfig?.enabled
                          ? "Dummy card payments are available for dine-in and take-away. No real money is collected. Stripe test payments are excluded from collected revenue."
                          : "Collected revenue reflects recorded payments. Staff can record payment at fulfilment."}</p>
                      </div>
                    </div>
                  </section>
                  <section className="admin-panel">
                    <h2>Best sellers</h2>
                    {data.bestSellers.length ? (
                      data.bestSellers.map((s: any) => (
                        <div className="seller-row" key={s.name}>
                          <span>{s.name}</span>
                          <strong>{s.quantity}</strong>
                        </div>
                      ))
                    ) : (
                      <p className="muted">
                        Your most ordered products will appear here after the
                        first order.
                      </p>
                    )}
                  </section>
                </div>
                <section className="admin-panel">
                  <div className="panel-heading">
                    <h2>Recent orders</h2>
                    <button
                      className="text-button"
                      onClick={() => setTab("orders")}
                    >
                      View all orders
                    </button>
                  </div>
                  {data.orders.length ? (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Order</th>
                            <th>Customer</th>
                            <th>Status</th>
                            <th>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.orders.slice(0, 6).map((o: any) => (
                            <tr key={o.id}>
                              <td>{o.id}</td>
                              <td>{o.contact.name}</td>
                              <td>
                                <span className="status">
                                  Order: {readable(o.status)}
                                </span>
                              </td>
                              <td>{money(o.total, o.currency)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="muted">No orders yet.</p>
                  )}
                </section>
              </>
            )}
            {tab === "products" && (
              <>
                <div className="admin-tools">
                  <button className="secondary" type="button" disabled={busy}
                    onClick={() => run(() => api("admin/products/restore-prices", "POST", {}), "Previous item prices restored. Existing orders are unchanged.")}>
                    Restore previous item prices
                  </button>
                  <label className="search-field">
                    <Search size={18} />
                    <input
                      aria-label="Search products"
                      placeholder="Search products"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  <button
                    className="primary"
                    onClick={() => {
                      setApproving("");
                      edit(blankProduct());
                    }}
                  >
                    <Plus size={17} />
                    Add product
                  </button>
                </div>
                <div className="admin-tools">
                  <button className="secondary" type="button" disabled={busy}
                    onClick={() => run(() => api("admin/products/test-price", "POST", {price:100}), "All item prices set to ₹1. Previous prices backed up.")}>
                    Set all item prices to ₹1 for testing
                  </button>
                </div>
                <section className="admin-panel table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Category</th>
                        <th>Price</th>
                        <th>Stock</th>
                        <th>Status</th>
                        <th>Manage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.products
                        .filter((p: any) =>
                          p.name.toLowerCase().includes(search.toLowerCase()),
                        )
                        .map((p: any) => (
                          <tr key={p.id}>
                            <td>
                              <div className="table-product">
                                <ProductImage product={p} />
                                <div>
                                  <strong>{p.name}</strong>
                                  <small>Item ID: <code>{p.id}</code></small>
                                  {p.featured && <small>Featured</small>}
                                </div>
                              </div>
                            </td>
                            <td>
                              {
                                data.categories.find(
                                  (c: any) => c.id === p.categoryId,
                                )?.name
                              }
                            </td>
                            <td>
                              {p.price === null ? (
                                <span className="pending-price">Pending</span>
                              ) : (
                                money(p.price, currency)
                              )}
                            </td>
                            <td>
                              {p.inventory === null ? "Unlimited" : p.inventory}
                            </td>
                            <td>
                              <span className="status">
                                {p.archived
                                  ? "Archived"
                                  : p.inventory !== null && p.inventory <= 0
                                    ? "Out of stock"
                                  : p.available
                                    ? "Available"
                                    : "Out of stock"}
                              </span>
                            </td>
                            <td>
                              <div className="product-manage-actions">
                              <button
                                className="text-button"
                                type="button"
                                aria-label={"Edit " + p.name}
                                onClick={() => {
                                  setApproving("");
                                  edit(p);
                                }}
                              >
                                Edit
                              </button>
                              {!p.archived && <label className="product-availability">
                                <span>Availability</span>
                                <select aria-label={"Availability for " + p.name} disabled={busy}
                                  value={p.available && (p.inventory === null || p.inventory > 0) ? "available" : "out-of-stock"}
                                  onChange={(event) => {
                                    const available = event.target.value === "available";
                                    if (available && (p.price === null || (p.inventory !== null && p.inventory <= 0))) {
                                      edit(p); setError("Set a price and stock above zero (or leave stock blank for unlimited), then enable Available to order."); return;
                                    }
                                    run(() => api("admin/products/" + encodeURIComponent(p.id) + "/availability", "PATCH", {available}), available ? "Item marked available" : "Item marked out of stock");
                                  }}>
                                  <option value="available">Available</option>
                                  <option value="out-of-stock">Out of stock</option>
                                </select>
                              </label>}
                              <button
                                className="text-button"
                                type="button"
                                disabled={busy}
                                aria-label={
                                  (p.archived ? "Restore item " : "Remove item ") +
                                  p.name
                                }
                                onClick={() =>
                                  run(
                                    () =>
                                      api("admin/products", "POST", {
                                        ...p,
                                        archived: !p.archived,
                                        available: p.archived
                                          ? false
                                          : p.available,
                                      }),
                                    p.archived
                                      ? "Item restored — set availability when ready"
                                      : "Item removed from menu",
                                  )
                                }
                              >
                                {p.archived ? "Restore item" : "Remove item"}
                              </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </section>
              </>
            )}
            {tab === "categories" && (
              <>
                <div className="admin-tools">
                  <p className="muted">
                    Disable categories to hide them. Existing orders keep their
                    item history.
                  </p>
                  <button
                    className="primary"
                    onClick={() =>
                      setCategory({
                        id: "category-" + crypto.randomUUID(),
                        name: "",
                        enabled: true,
                        position: data.categories.length,
                        image: "",
                      })
                    }
                  >
                    <Plus size={17} />
                    Add category
                  </button>
                </div>
                <div className="category-admin-grid">
                  {data.categories.map((c: any) => (
                    <section className="admin-panel" key={c.id}>
                      <Tags size={24} />
                      <h2>{c.name}</h2>
                      <p className="muted">
                        {
                          data.products.filter(
                            (p: any) => p.categoryId === c.id && !p.archived,
                          ).length
                        }{" "}
                        products · Position {c.position}
                      </p>
                      <span className="status">
                        {c.enabled ? "Enabled" : "Disabled"}
                      </span>
                      <button
                        className="secondary"
                        onClick={() => setCategory({ ...c })}
                      >
                        Edit category
                      </button>
                    </section>
                  ))}
                </div>
              </>
            )}
            {tab === "orders" && (
              <>
                <div className="admin-tools">
                  <label className="search-field">
                    <Search size={18} />
                    <input
                      aria-label="Search orders"
                      placeholder="Order ID or customer name"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  <select
                    aria-label="Filter order status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="all">All statuses</option>
                    {Object.keys(transitions).map((s) => (
                      <option key={s} value={s}>
                        {s.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="admin-order-list">
                  {orderRows.map((o: any) => (
                    <article className="admin-panel" key={o.id}>
                      <div className="order-top">
                        <div>
                          <strong>{o.id}</strong>
                          <small>
                            {o.contact.name} · {o.contact.phone} ·{" "}
                            {o.fulfillment === "dine_in" ? "Dine in" : o.fulfillment === "pickup" ? "Take away" : "Delivery"}
                          </small>
                          <small>
                            {new Date(o.created_at + "Z").toLocaleString()}
                          </small>
                        </div>
                        <span className="status">
                          Order: {readable(o.status)}
                        </span>
                      </div>
                      {o.contact.address && <p>{o.contact.address}</p>}
                      {o.contact.notes && <p>Notes: {o.contact.notes}</p>}
                      <div className="admin-order-items">
                        {o.items.map((i: any) => (
                          <p key={i.id}>
                            <span>
                              {i.quantity} × {i.name}
                              {i.selections.variant && (
                                <small>{i.selections.variant.name}</small>
                              )}
                              {i.selections.addons.map((a: any) => (
                                <small key={a.id}>{a.name}</small>
                              ))}
                              {i.instructions && (
                                <small>Note: {i.instructions}</small>
                              )}
                            </span>
                            <strong>
                              {money(i.unit_price * i.quantity, o.currency)}
                            </strong>
                          </p>
                        ))}
                      </div>
                      <div className="fine-print">
                        <p>Subtotal: {money(o.subtotal, o.currency)} · Discount: −{money(o.discount, o.currency)}</p>
                        <p>Tax: {money(o.tax, o.currency)} · Fees: {money(o.fee, o.currency)}</p>
                      </div>
                      <div className="order-total">
                        <strong>{money(o.total, o.currency)}</strong>
                        <span>Payment: {o.payment_status === "paid" ? "Paid — payment received" : o.payment_status === "unpaid" ? "Unpaid — payment pending" : readable(o.payment_status)}</span>
                        <span>Method: {paymentLabel(o)}</span>
                      </div>
                      <div className="order-buttons">
                        {transitions[o.status]
                          ?.filter(
                            (s) =>
                              !(
                                s === "cancelled" && o.payment_status === "paid"
                              ) &&
                              !(
                                o.fulfillment !== "delivery" &&
                                s === "out_for_delivery"
                              ) &&
                              !(o.fulfillment === "delivery" && s === "ready"),
                          )
                          .map((s) => (
                            <button
                              key={s}
                              className={
                                s === "cancelled"
                                  ? "secondary danger"
                                  : "secondary"
                              }
                              disabled={busy}
                              onClick={() =>
                                run(
                                  () =>
                                    api("admin/orders/" + o.id, "PATCH", {
                                      status: s,
                                    }),
                                  "Order status updated",
                                )
                              }
                            >
                              {s.replaceAll("_", " ")}
                            </button>
                          ))}
                      </div>
                      {o.payment_status === "unpaid" &&
                        o.status !== "cancelled" && (
                          <form
                            className="cash-form"
                            onSubmit={(e) => {
                              e.preventDefault();
                              const form = e.currentTarget;
                              const f = new FormData(form);
                              run(
                                () =>
                                  api("admin/payments/" + o.id, "POST", {
                                    reference: f.get("reference"),
                                    collection_method: f.get("collection_method"),
                                  }),
                                "Payment collection recorded",
                              ).then((ok) => {
                                if (ok) form.reset();
                              });
                            }}
                          >
                            <label>
                              Payment method
                              <select name="collection_method" required>
                                <option value="cash">Cash</option>
                                <option value="upi">UPI</option>
                                <option value="card">Card</option>
                              </select>
                            </label>
                            <label>
                              Payment receipt reference
                              <input
                                name="reference"
                                required
                                maxLength={150}
                                placeholder="Receipt / counter reference"
                              />
                            </label>
                            <label className="checkbox-label">
                              <input type="checkbox" required />I confirm the
                              full amount has been collected.
                            </label>
                            <button className="primary" disabled={busy}>
                              Record collected payment
                            </button>
                          </form>
                        )}
                      <details>
                        <summary>Status history</summary>
                        {o.events.map((e: any, i: number) => (
                          <p key={i} className="fine-print">
                            {e.status} · {e.created_at}
                          </p>
                        ))}
                      </details>
                    </article>
                  ))}
                  {!orderRows.length && (
                    <section className="admin-panel">
                      <p className="muted">
                        {loadingOrders
                          ? "Loading orders…"
                          : "No matching orders."}
                      </p>
                    </section>
                  )}
                </div>
                {moreOrders && (
                  <button
                    className="secondary wide"
                    disabled={loadingOrders}
                    onClick={() => loadOrders(true)}
                  >
                    Load older orders
                  </button>
                )}
              </>
            )}
            {tab === "subscriptions" && <AdminSubscriptions/>}
            {tab === "customers" && (
              <section className="admin-panel table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Contact</th>
                      <th>Orders</th>
                      <th>Account</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.customers.map((c: any) => (
                      <tr key={c.id}>
                        <td>
                          <strong>{c.name || "Customer"}</strong>
                          <small>{c.created_at}</small>
                        </td>
                        <td>
                          {c.email}
                          <small>{c.phone}</small>
                        </td>
                        <td>
                          <CustomerOrders key={c.id + ":" + c.order_count} customer={c} currency={currency} />
                        </td>
                        <td>
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={() =>
                              run(
                                () =>
                                  api("admin/customers/" + c.id, "PATCH", {
                                    disabled: !c.disabled,
                                  }),
                                c.disabled
                                  ? "Customer enabled"
                                  : "Customer disabled",
                              )
                            }
                          >
                            {c.disabled ? "Enable" : "Disable"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!data.customers.length && (
                  <p className="muted">
                    Customer profiles appear when saved or an order is placed.
                  </p>
                )}
              </section>
            )}
            {tab === "suggestions" && (
              <div className="admin-order-list">
                {data.suggestions.length ? (
                  data.suggestions.map((s: any) => (
                    <article className="admin-panel" key={s.id}>
                      <div className="panel-heading">
                        <h2>{s.name}</h2>
                        <span className="status">{s.status}</span>
                      </div>
                      {s.image && (
                        <img
                          className="suggestion-reference"
                          src={s.image}
                          alt="Customer reference"
                        />
                      )}
                      <p>{s.description}</p>
                      <p className="muted">
                        Suggested category: {s.category || "Unspecified"}
                        <br />
                        {s.notes}
                      </p>
                      <small>Submitted {s.created_at}</small>
                      <div className="order-buttons">
                        <button
                          className="primary"
                          disabled={busy || s.status === "approved"}
                          onClick={() => {
                            setApproving(s.id);
                            edit({
                              ...blankProduct(),
                              name: s.name,
                              description: s.description,
                              image: s.image || "",
                              categoryId:
                                data.categories.find(
                                  (c: any) =>
                                    c.name.toLowerCase() ===
                                    s.category.toLowerCase(),
                                )?.id ||
                                data.categories[0]?.id ||
                                "",
                            });
                          }}
                        >
                          Review & approve as draft
                        </button>
                        <button
                          className="secondary danger"
                          disabled={busy || s.status === "approved"}
                          onClick={() =>
                            run(
                              () =>
                                api("admin/suggestions/" + s.id, "PATCH", {
                                  status: "rejected",
                                }),
                              "Suggestion rejected",
                            )
                          }
                        >
                          Reject
                        </button>
                      </div>
                    </article>
                  ))
                ) : (
                  <section className="admin-panel">
                    <p className="muted">No customer suggestions yet.</p>
                  </section>
                )}
              </div>
            )}
            {tab === "import" && (
              <section className="admin-panel import-panel">
                <h2>Import the full catalog</h2>
                <p>
                  Upload JSON with a <code>products</code> array. Prices and
                  option prices use minor currency units (₹100 = 10000). Missing
                  prices must be <code>null</code> with{" "}
                  <code>available: false</code>. Existing IDs are updated.
                  Validation finishes before the import transaction starts.
                </p>
                <div className="order-buttons">
                  <button
                    className="secondary"
                    onClick={() => {
                      const blob = new Blob(
                        [JSON.stringify({ products: data.products }, null, 2)],
                        { type: "application/json" },
                      );
                      const a = document.createElement("a");
                      a.href = URL.createObjectURL(blob);
                      a.download = "coffee-catalog.json";
                      a.click();
                      URL.revokeObjectURL(a.href);
                    }}
                  >
                    Export catalog / template
                  </button>
                  <label>
                    Choose JSON file
                    <input
                      type="file"
                      accept=".json,application/json"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          if (f.size > 1000000) {
                            setError("Import file must be under 1 MB");
                            return;
                          }
                          setImportText(await f.text());
                        }
                      }}
                    />
                  </label>
                </div>
                <label>
                  Catalog JSON
                  <textarea
                    className="code-input"
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    spellCheck={false}
                  />
                </label>
                <button
                  className="primary"
                  disabled={busy || !importText}
                  onClick={() =>
                    run(async () => {
                      const result = await api(
                        "admin/import",
                        "POST",
                        JSON.parse(importText),
                      );
                      setImportText("");
                      return result;
                    }, "Catalog imported. All rows validated and saved.")
                  }
                >
                  Validate & import
                </button>
                <div className="import-report">
                  <h3>Reference import</h3>
                  <p>30 products · 3 categories · 0 skipped</p>
                  <p>
                    30 original products require verified prices and
                    availability. Descriptions, recipes, add-ons, dietary
                    labels, and nutrition were not supplied by the source.
                    Source images are illustrative and access may be restricted.
                  </p>
                  <p>
                    Original category assignments are preserved, including items
                    categorised under “More drinks”. Review these before opening
                    ordering.
                  </p>
                  <a
                    className="text-button"
                    href="https://espressoulster-coffee.nagendra80.chatgpt.site/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    View catalog source
                  </a>
                </div>
              </section>
            )}
            {tab === "settings" && settings && (
              <form
                className="admin-settings"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(
                    () =>
                      api("admin/settings", "PUT", {
                        ...settings,
                        offers: JSON.parse(offers),
                      }),
                    "Store settings saved",
                  );
                }}
              >
                <section className="admin-panel">
                  <h2>Your café</h2>
                  <label>
                    Brand name
                    <input
                      required
                      maxLength={100}
                      value={settings.brand}
                      onChange={(e) =>
                        setSettings({ ...settings, brand: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Logo
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        await run(async () => {
                          const form = new FormData();
                          form.set("file", f);
                          const b = await api("upload", "POST", form);
                          setSettings({ ...settings, logo: b.url });
                        }, "Logo uploaded. Save settings to apply.");
                      }}
                    />
                  </label>
                  {settings.logo && (
                    <img
                      src={settings.logo}
                      className="store-logo-preview"
                      alt="Store logo"
                    />
                  )}
                  <label>
                    Contact details
                    <input
                      maxLength={200}
                      value={settings.contact}
                      onChange={(e) =>
                        setSettings({ ...settings, contact: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Pickup location label
                    <input
                      maxLength={200}
                      value={settings.location}
                      onChange={(e) =>
                        setSettings({ ...settings, location: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Café address
                    <textarea
                      maxLength={1000}
                      value={settings.address}
                      onChange={(e) =>
                        setSettings({ ...settings, address: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Opening hours
                    <textarea
                      maxLength={500}
                      value={settings.openingHours}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          openingHours: e.target.value,
                        })
                      }
                    />
                  </label>
                </section>
                <section className="admin-panel">
                  <h2>Ordering & fulfilment</h2>
                  <label>
                    Currency (ISO code)
                    <input
                      required
                      pattern="[A-Z]{3}"
                      maxLength={3}
                      value={settings.currency}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          currency: e.target.value.toUpperCase(),
                        })
                      }
                    />
                  </label>
                  <label>
                    Tax rate (%)
                    <input
                      required
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={settings.taxBps / 100}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          taxBps: Math.round(Number(e.target.value) * 100),
                        })
                      }
                    />
                  </label>
                  <label>
                    Delivery fee ({currency})
                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      value={settings.deliveryFee / 100}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          deliveryFee: Math.round(Number(e.target.value) * 100),
                        })
                      }
                    />
                  </label>
                  {[
                    ["dineInEnabled", "Allow dine in"],
                    ["pickupEnabled", "Allow take away"],
                    ["deliveryEnabled", "Allow delivery"],
                    ["cancelPending", "Customers may cancel pending orders"],
                  ].map(([key, name]) => (
                    <label className="checkbox-label" key={key}>
                      <input
                        type="checkbox"
                        checked={settings[key]}
                        onChange={(e) =>
                          setSettings({ ...settings, [key]: e.target.checked })
                        }
                      />
                      {name}
                    </label>
                  ))}
                  <h3>Payments</h3>
                  <p className="muted">
                    {data.paymentConfig?.provider === "stripe" && data.paymentConfig?.enabled
                      ? "Stripe sandbox is configured for dummy card payments. Verified test receipts appear in Order History and are excluded from collected revenue. Live payments and automatic refunds are not enabled."
                      : "Staff can record payment at collection with a receipt reference. Online checkout availability depends on the configured payment provider."}
                  </p>
                </section>
                <section className="admin-panel">
                  <h2>Home banner</h2>
                  <label>
                    Banner title
                    <textarea
                      maxLength={100}
                      value={settings.bannerTitle}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          bannerTitle: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Banner subtitle
                    <input
                      maxLength={200}
                      value={settings.bannerSubtitle}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          bannerSubtitle: e.target.value,
                        })
                      }
                    />
                  </label>
                  <h3>Subscription offers &amp; Ads</h3>
                  <p className="fine-print">Add as many banners as you need. Only enabled banners with an image appear on Home. No banners are shown while this list is empty. Save store settings to publish your changes.</p>
                  {!(settings.promotionBanners||[]).length&&<label className="admin-banner-image-picker"><span className="banner-picker-symbol" aria-hidden="true">＋</span><strong>Choose banner image</strong><span>Upload a photo or offer artwork from your device</span><small>PNG, JPG or WebP · up to 3 MB</small><input type="file" aria-label="Choose first banner image" disabled={busy} accept="image/png,image/jpeg,image/webp" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;const input=e.currentTarget;await run(async()=>{if(file.size>3*1024*1024)throw Error("Choose an image smaller than 3 MB.");const form=new FormData();form.set("file",file);const result=await api("upload","POST",form);setSettings((current:any)=>({...current,promotionBanners:[...(current.promotionBanners||[]),{id:crypto.randomUUID(),image:result.url,tag:"",title:"",copy:"",action:"",search:"",destination:"menu",enabled:true}]}));},"Image uploaded. Save store settings to show your banner.");input.value="";}}/></label>}
                  <div className="admin-ad-actions">{[{label:'Add subscription offer',destination:'subscriptions'},{label:'Add ad',destination:'menu'}].map(option=><button key={option.destination} type="button" className="secondary" onClick={()=>setSettings((current:any)=>({...current,promotionBanners:[...(current.promotionBanners||[]),{id:crypto.randomUUID(),image:"",tag:"",title:"",copy:"",action:"",search:"",destination:option.destination,enabled:false}]}))}>{option.label}</button>)}</div>
                  {(settings.promotionBanners||[]).map((banner:any,index:number)=>{
                    const update=(patch:any)=>setSettings((current:any)=>({...current,promotionBanners:current.promotionBanners.map((item:any)=>item.id===banner.id?{...item,...patch}:item)}));
                    return <fieldset key={banner.id} className="admin-ad-banner"><legend>{banner.destination==='subscriptions'?'Subscription offer':'Ad'}</legend>
                      <label>Show banner<input type="checkbox" checked={banner.enabled} onChange={e=>update({enabled:e.target.checked})}/></label>
                      <label className="admin-banner-image-picker">{banner.image?<img src={banner.image} alt="Advertisement preview"/>:<span className="banner-picker-symbol" aria-hidden="true">＋</span>}<strong>{banner.image?"Change banner image":"Choose banner image"}</strong><span>PNG, JPG or WebP · up to 3 MB</span><input type="file" aria-label={"Choose image for advertisement "+(index+1)} disabled={busy} accept="image/png,image/jpeg,image/webp" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;const input=e.currentTarget;await run(async()=>{if(file.size>3*1024*1024)throw Error("Choose an image smaller than 3 MB.");const form=new FormData();form.set("file",file);const result=await api("upload","POST",form);update({image:result.url});},"Banner uploaded. Save settings to apply.");input.value="";}}/></label>
                      <details className="admin-banner-url"><summary>Use an image link instead</summary><label>Image URL<input type="url" value={banner.image.startsWith("/")?"":banner.image} placeholder={banner.image.startsWith("/")?"Uploaded image selected":"https://…"} onChange={e=>update({image:e.target.value})}/></label></details>
                      <label>Label (optional)<input maxLength={100} value={banner.tag} onChange={e=>update({tag:e.target.value})}/></label>
                      <label>Headline (optional)<input maxLength={200} value={banner.title} onChange={e=>update({title:e.target.value})}/></label>
                      <label>Description (optional)<textarea maxLength={500} value={banner.copy} onChange={e=>update({copy:e.target.value})}/></label>
                      <label>Button text (optional)<input maxLength={60} value={banner.action} onChange={e=>update({action:e.target.value})}/></label>
                      <label>Button destination<select value={banner.destination} onChange={e=>update({destination:e.target.value})}><option value="menu">Menu</option><option value="subscriptions">Subscription offers</option></select></label>
                      {banner.destination==="menu"&&<label>Menu search (optional)<input maxLength={150} value={banner.search} onChange={e=>update({search:e.target.value})}/></label>}
                      <div className="admin-ad-actions">{index>0&&<button type="button" onClick={()=>{const list=[...settings.promotionBanners];[list[index-1],list[index]]=[list[index],list[index-1]];setSettings({...settings,promotionBanners:list});}}>Move up</button>}<button type="button" onClick={()=>setSettings({...settings,promotionBanners:settings.promotionBanners.filter((item:any)=>item.id!==banner.id)})}>Remove banner</button></div>
                    </fieldset>;
                  })}
                </section>
                <section className="admin-panel"><h2>Coffee club rules</h2><p>Configure your future rewards programme. These rules are saved as a draft; reward issuance and redemption are not activated by this form.</p>{[{key:'qualifyingRupees',label:'Minimum qualifying order (₹)',max:100000},{key:'silverOrders',label:'Orders to reach the second tier',max:1000},{key:'goldOrders',label:'Orders to reach the highest tier',max:1000},{key:'silverCashbackPercent',label:'Second-tier reward percentage',max:100},{key:'goldCashbackPercent',label:'Highest-tier reward percentage',max:100},{key:'referralRupees',label:'Referral benefit (₹)',max:10000},{key:'birthdayRupees',label:'Birthday benefit (₹)',max:10000}].map(field=><label key={field.key}>{field.label}<input type="number" min="0" max={field.max} step="1" value={settings.clubRules?.[field.key]??''} placeholder="Not configured" onChange={e=>setSettings({...settings,clubRules:{...(settings.clubRules||{}),[field.key]:e.target.value===''?null:Number(e.target.value)}})}/></label>)}<p>One coffee per day and the existing 10% subscriber app discount remain unchanged. Wallet and gift-card payments remain sandbox-only.</p></section><button className="primary save-settings" disabled={busy}>
                  {busy ? "Saving…" : "Save store settings"}
                </button>
              </form>
            )}
            {tab === "audit" && (
              <section className="admin-panel table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>What changed</th>
                      <th>Affected record</th>
                      <th>Changed by (user ID)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.audit.map((a: any) => (
                      <tr key={a.id}>
                        <td>{a.created_at}</td>
                        <td>{activityLabel(a.action)}</td>
                        <td>{data.products.find((p: any) => p.id === a.target)?.name || data.customers.find((c: any) => c.id === a.target)?.name || a.target}<small>{a.target}</small></td>
                        <td>
                          <code>{a.actor}</code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!data.audit.length && (
                  <p className="muted">
                    Administrator changes and order actions appear here. “What changed” describes the activity; “Affected record” identifies the item, order, customer or store setting.
                  </p>
                )}
              </section>
            )}
          </>
        )}
      </main>
      {editing && (
        <div className="admin-modal-backdrop">
          <form
            className="admin-editor"
            role="dialog"
            aria-modal="true"
            aria-label="Edit product"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await run(
                () => {
                  const {recipeMeasurements,recipeSuggestion,...stored}=editing;
                  const p = {
                    ...stored,
                    variants: JSON.parse(variants),
                    addons: JSON.parse(addons),
                  };
                  return approving
                    ? api("admin/suggestions/" + approving, "PATCH", {
                        status: "approved",
                        product: p,
                      })
                    : api("admin/products", "POST", p);
                },
                approving
                  ? "Suggestion approved as an unavailable draft"
                  : "Product saved",
              );
              if (ok) {
                setEditing(null);
                setApproving("");
              }
            }}
          >
            <div className="editor-heading">
              <h2>{approving ? "Review suggestion" : "Product details"}</h2>
              <button
                type="button"
                className="icon-button"
                aria-label="Close product editor"
                onClick={() => setEditing(null)}
              >
                <X size={22} />
              </button>
            </div>
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            <p className="fine-print">Item ID: <code>{editing.id}</code></p>
            <div className="editor-grid">
              <label>
                Product name
                <input
                  required
                  maxLength={150}
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                />
              </label>
              <label>
                Category
                <select
                  value={editing.categoryId}
                  onChange={(e) =>
                    setEditing({ ...editing, categoryId: e.target.value })
                  }
                >
                  {data.categories.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Price ({currency}, blank if unknown)
                <input
                  inputMode="decimal"
                  key={editing.id + "price"}
                  defaultValue={
                    editing.price === null
                      ? ""
                      : (editing.price / 100).toFixed(2)
                  }
                  onChange={(e) => {
                    try {
                      setEditing({ ...editing, price: minor(e.target.value) });
                      e.target.setCustomValidity("");
                    } catch (err: any) {
                      e.target.setCustomValidity(err.message);
                    }
                  }}
                />
              </label>
              <label>
                Inventory (blank = unlimited)
                <input
                  type="number"
                  min="0"
                  max="1000000"
                  step="1"
                  value={editing.inventory === null ? "" : editing.inventory}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      inventory:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </label>
            </div>
            <label>
              Description
              <textarea
                maxLength={2000}
                value={editing.description}
                onChange={(e) =>
                  setEditing({ ...editing, description: e.target.value })
                }
              />
            </label>
            <label>
              Upload product photo
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  await run(async () => {
                    const form = new FormData();
                    form.set("file", f);
                    const b = await api("upload", "POST", form);
                    setEditing({
                      ...editing,
                      image: b.url,
                      imageAtlas: false,
                      imagePosition: "center",
                    });
                  }, "Image uploaded. Save the product to apply.");
                }}
              />
            </label>
            <label>
              Image URL
              <input
                value={editing.image}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    image: e.target.value,
                    imageAtlas: false,
                  })
                }
              />
            </label>
            <div className="editor-checks">
              {[
                ["available", "Available to order"],
                ["featured", "Featured on home"],
                ["archived", "Archived"],
              ].map(([key, name]) => (
                <label className="checkbox-label" key={key}>
                  <input
                    type="checkbox"
                    checked={editing[key]}
                    onChange={(e) =>
                      setEditing({ ...editing, [key]: e.target.checked })
                    }
                  />
                  {name}
                </label>
              ))}
            </div>
            <fieldset>
              <legend>Verified dietary labels</legend>
              <div className="editor-checks">
                {["Veg", "Non-veg", "Egg"].map((d) => (
                  <label className="checkbox-label" key={d}>
                    <input
                      type="checkbox"
                      checked={editing.dietary.includes(d)}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          dietary: e.target.checked
                            ? [...editing.dietary, d]
                            : editing.dietary.filter((i: string) => i !== d),
                        })
                      }
                    />
                    {d}
                  </label>
                ))}
              </div>
            </fieldset>
            <ProductRecipeEditor key={editing.id} value={editing.recipeOverride??null} suggested={editing.recipeSuggestion||editing.recipeMeasurements} ingredients={editing.ingredients} onChange={recipeOverride=>setEditing({...editing,recipeOverride})}/>
            <ProductOptions variants={variants} addons={addons} onVariants={setVariants} onAddons={setAddons}/>
            <div className="editor-footer">
              <button
                type="button"
                className="secondary"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              <button className="primary" disabled={busy}>
                {busy
                  ? "Saving…"
                  : approving
                    ? "Approve as draft"
                    : "Save product"}
              </button>
            </div>
          </form>
        </div>
      )}
      {category && (
        <div className="admin-modal-backdrop">
          <form
            className="admin-editor small-editor"
            role="dialog"
            aria-modal="true"
            aria-label="Edit category"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await run(
                () => api("admin/categories", "POST", category),
                "Category saved",
              );
              if (ok) setCategory(null);
            }}
          >
            <div className="editor-heading">
              <h2>Category details</h2>
              <button
                type="button"
                className="icon-button"
                aria-label="Close category editor"
                onClick={() => setCategory(null)}
              >
                <X size={22} />
              </button>
            </div>
            <label>
              Category name
              <input
                required
                maxLength={100}
                value={category.name}
                onChange={(e) =>
                  setCategory({ ...category, name: e.target.value })
                }
              />
            </label>
            <label>
              Position
              <input
                type="number"
                min="0"
                max="1000"
                required
                value={category.position}
                onChange={(e) =>
                  setCategory({ ...category, position: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Category image
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  await run(async () => {
                    const form = new FormData();
                    form.set("file", f);
                    const b = await api("upload", "POST", form);
                    setCategory({ ...category, image: b.url });
                  }, "Image uploaded. Save category to apply.");
                }}
              />
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={category.enabled}
                onChange={(e) =>
                  setCategory({ ...category, enabled: e.target.checked })
                }
              />
              Enabled
            </label>
            <button className="primary" disabled={busy}>
              Save category
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
