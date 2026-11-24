"use client";
import TableBooking from '../table-booking';
import ProductOptions from './product-options';
import ProductRecipeEditor from './product-recipe-editor';
import OrderChat from "../order-chat";
import AdminSubscriptions from "./admin-subscriptions";
import AdvertisementManager from "./advertisement-manager";
import HomeDesignEditor from "./home-design-editor";
import SearchField from "../search-field";
import BottomNavRefreshWave from "../bottom-nav-refresh-wave";
import { HomePullRefresh } from "../home-pull-refresh";
import { hasNativeOrderAlerts, openNativeOrderAlertSettings } from "../../lib/native-order-alerts";
import { useCallback, useState, useEffect, useRef, type CSSProperties } from "react";
import {
  Coffee,
  LayoutDashboard,
  ShoppingBag,
  Utensils,
  Users,
  Settings,
  Tags,
  Lightbulb,
  ChevronDown,
  Plus,
  X,
  Check,
  Archive,
  LogOut,
  ArrowLeft,
  CalendarDays,
  Ticket,
  Menu,
  Bell,
  Megaphone,
  MapPin,
  PanelsTopLeft,
} from "lucide-react";
import "./admin-mobile.css";
import { api, money, ProductImage } from "../store-app";
import { useDialogAccessibility } from "../../lib/dialog";
import { transitions } from "../../lib/pricing";
import { useAdminOrderAlerts } from "./use-admin-order-alerts";
import { useAdminChatAlerts } from "./use-admin-chat-alerts";
import { onLiveUpdate, useLiveUpdates } from "../use-live-updates";
import { bottomNavOutline } from "../../lib/bottom-nav-glass";
import { paysAtCafe } from "../../lib/order-payment";
import { orderReference } from "../../lib/order-reference";
import {customerEmail} from '../../lib/public-message';
const orderActionLabels: Record<string, string> = {
  confirmed: "Accept order",
  preparing: "Start preparing",
  ready: "Mark ready",
  out_for_delivery: "Send out for delivery",
  completed: "Complete order",
  cancelled: "Cancel order",
};
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

function OrderFulfillmentBadge({ fulfillment }: { fulfillment: string }) {
  if (fulfillment !== "pickup" && fulfillment !== "dine_in") return null;
  const pickup = fulfillment === "pickup";
  const Icon = pickup ? ShoppingBag : Utensils;
  return (
    <span className="admin-fulfillment-badge" data-fulfillment={fulfillment}>
      <Icon size={14} aria-hidden="true" />{pickup ? "Pickup" : "Dine in"}
    </span>
  );
}

function OrderTableBadge({ fulfillment, table }: { fulfillment: string; table?: string }) {
  if (fulfillment !== "dine_in" || !table) return null;
  return <span className="admin-order-table"><MapPin size={14} aria-hidden="true" />Table {table}</span>;
}

function DineInTablePicker({ assigned, options, busy, accepting, onAssign }: {
  assigned?: string;
  options?: string[] | null;
  busy: boolean;
  accepting: boolean;
  onAssign: (table: string) => void;
}) {
  const [choice, setChoice] = useState(assigned || "");
  const table = options?.includes(choice) ? choice : "";
  const placeholder = options === undefined ? "Checking tables…" : options === null
    ? "Couldn’t check tables" : options.length ? "Choose a table" : "No tables available";

  return (
    <form className="admin-order-table-assignment" onSubmit={event => {
      event.preventDefault();
      if (table && !busy) onAssign(table);
    }}>
      <label>Dine-in table
        <select name="table" required value={table} onChange={event => setChoice(event.target.value)}
          disabled={busy || !options?.length}>
          <option value="" disabled>{placeholder}</option>
          {options?.map(id => <option key={id} value={id}>Table {id}</option>)}
        </select>
      </label>
      <button className="primary" disabled={busy || !table}>
        {accepting ? "Assign table & accept" : "Assign table"}
      </button>
    </form>
  );
}

function OrderStatusBadge({ status, fulfillment }: { status: string; fulfillment: string }) {
  const readyLabels = { pickup: "Ready for pickup", dine_in: "Ready to serve" };
  const readyLabel = status === "ready" && (fulfillment === "pickup" || fulfillment === "dine_in")
    ? readyLabels[fulfillment] : undefined;
  return (
    <span className={readyLabel ? "status admin-order-ready" : "status"} data-order-status={status}>
      {readyLabel || "Order: " + readable(status)}
    </span>
  );
}

function OrderStamp({ state }: { state: "paid" | "cancelled" }) {
  const cancelled = state === "cancelled";
  const Icon = cancelled ? X : Check;

  return (
    <div className="admin-order-stamp" data-stamp={state} role="img"
      aria-label={"Espressoulster Coffee, " + (cancelled ? "Cancelled" : "Paid")}>
      <img src={`/images/admin-order-stamp-${state}.png`} width={360} height={360} alt="" />
      <span className="admin-order-stamp-face" aria-hidden="true">
        <Icon size={17} aria-hidden="true" />
        <strong>{cancelled ? "CANCELLED" : "PAID"}</strong>
      </span>
    </div>
  );
}

function paymentLabel(order: any) {
  const method = order.collection_method || order.payment_method || order.checkout_payment_method;
  const labels: Record<string, string> = {cash: "Cash", upi: "UPI", card: "Card", pay_at_counter: "Pay at counter", pay_at_pickup: "Pay at pickup", pay_in_store: "Pay in store", phonepe: "PhonePe", cashfree: "Cashfree", stripe_test: "Stripe test — no real money", cashfree_test: "Cashfree test — no real money", simulated: "Simulated payment (test)"};
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
      <p><strong>{orderReference(o)}</strong> · {money(o.total, o.currency || currency)} · {readable(o.status)}</p>
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
export default function AdminApp({ receiveOrderAlerts = false, canManageOrders = true, canManageDuty = canManageOrders, staffSession = false, signOutToApp = false, initialTab = "overview", initialOrder = "", previewAdvertisingSamples = false }: {
  receiveOrderAlerts?: boolean;
  canManageOrders?: boolean;
  canManageDuty?: boolean;
  staffSession?: boolean;
  signOutToApp?: boolean;
  initialTab?: "overview" | "orders" | "subscriptions" | "advertising";
  initialOrder?: string;
  previewAdvertisingSamples?: boolean;
}) {
  const [chatOrderId, setChatOrderId] = useState<string | null>(null);
  const [nativeAlerts, setNativeAlerts] = useState(false);
  useEffect(() => {
    const check = () => setNativeAlerts(hasNativeOrderAlerts());
    check();
    window.addEventListener("espresso-native-ready", check);
    return () => window.removeEventListener("espresso-native-ready", check);
  }, []);
  useLiveUpdates("admin", !previewAdvertisingSamples);
  const { ordersToday, alertCount, clearAlert } = useAdminOrderAlerts(receiveOrderAlerts);
  const chatAlerts = useAdminChatAlerts(receiveOrderAlerts && canManageOrders);
  const orderRequest = useRef(0);
  const overviewRequest = useRef(0);
  const mobileMenu = useRef<HTMLDetailsElement>(null);
  const bottomNav = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [tab, setTab] = useState<string>(initialTab),
    [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(initialOrder),
    [status, setStatus] = useState("all"),
    [editing, setEditing] = useState<any>(null),
    [category, setCategory] = useState<any>(null),
    [settings, setSettings] = useState<any>(null),
    [variants, setVariants] = useState("[]"),
    [addons, setAddons] = useState("[]"),
    [offers, setOffers] = useState("[]"),
    [approving, setApproving] = useState(""),
    [orderRows, setOrderRows] = useState<any[]>([]),
    [moreOrders, setMoreOrders] = useState(false),
    [loadingOrders, setLoadingOrders] = useState(false),
    [loadingOverview, setLoadingOverview] = useState(false),
    [sectionRefresh, setSectionRefresh] = useState(0);
  const [tableOptions, setTableOptions] = useState<Record<string, string[]> | null>({});
  const openDineInOrders = canManageOrders && tab === "orders" ? orderRows
    .filter(order => order.fulfillment === "dine_in" && !["cancelled", "completed"].includes(order.status))
    .map(order => order.id).sort().join(",") : "";

  useEffect(() => {
    setTableOptions({});
    if (!openDineInOrders) return;
    const controller = new AbortController();
    const ids = openDineInOrders.split(",");
    const queries: URLSearchParams[] = [];
    for (let start = 0; start < ids.length; start += 50) {
      queries.push(new URLSearchParams(ids.slice(start, start + 50).map(id => ["order", id])));
    }
    let checking = false;
    let timer: ReturnType<typeof setTimeout>;

    async function refresh() {
      if (checking || document.hidden || controller.signal.aborted) return;
      clearTimeout(timer);
      checking = true;
      try {
        const batches = await Promise.all(queries.map(query =>
          api("admin/orders/table-options?" + query, "GET", undefined, controller.signal),
        ));
        if (!controller.signal.aborted) setTableOptions(Object.assign({}, ...batches.map(batch => batch.tables)));
      } catch {
        if (!controller.signal.aborted) setTableOptions(null);
      } finally {
        checking = false;
        if (!controller.signal.aborted) timer = setTimeout(refresh, 5000);
      }
    }

    void refresh();
    document.addEventListener("visibilitychange", refresh);
    const stopLiveUpdates = onLiveUpdate(["orders", "bookings"], () => void refresh());
    return () => {
      controller.abort();
      clearTimeout(timer);
      stopLiveUpdates();
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [openDineInOrders]);
  useEffect(() => {
    function closeMenu(event: PointerEvent) {
      const menu = mobileMenu.current;
      if (menu?.open && event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
    }
    document.addEventListener("pointerdown", closeMenu);
    return () => document.removeEventListener("pointerdown", closeMenu);
  }, []);
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
      if (request !== overviewRequest.current) return false;
      setData(b);
      if (!settings) {
        setSettings(b.settings);
        setOffers(JSON.stringify(b.settings.offers, null, 2));
      }
      return true;
    } catch (e: any) {
      if (request === overviewRequest.current) setError(e.message);
      return false;
    } finally {
      if (request === overviewRequest.current) setLoadingOverview(false);
    }
  }
  useEffect(() => {
    void load();
    return () => { overviewRequest.current++; };
  }, []);
  async function loadOrders(append = false, background = false) {
    const request = ++orderRequest.current;
    if (!background) setLoadingOrders(true);
    try {
      const b = await api(
        "admin/orders?offset=" +
          (append ? orderRows.length : 0) +
          "&q=" +
          encodeURIComponent(search) +
          "&status=" +
          encodeURIComponent(status),
      );
      if (request !== orderRequest.current) return false;
      setOrderRows((old) => (append ? [...old, ...b.orders] : b.orders));
      setMoreOrders(b.orders.length === 50);
      return true;
    } catch (e: any) {
      if (request === orderRequest.current) setError(e.message);
      return false;
    } finally {
      if (request === orderRequest.current) setLoadingOrders(false);
    }
  }
  useEffect(() => {
    if (tab !== "orders") return;
    setLoadingOrders(true);
    const timer = setTimeout(() => { void loadOrders(); }, 200);
    return () => { clearTimeout(timer); orderRequest.current++; };
  }, [tab, search, status]);
  useEffect(() => {
    if (tab === "orders") {
      const refresh = () => { if (!document.hidden && !loadingOrders) void loadOrders(false, true); };
      const stopLiveUpdates = onLiveUpdate(["orders"], refresh);
      const timer = setInterval(refresh, 15000);
      return () => { stopLiveUpdates(); clearInterval(timer); };
    }
    if (tab === "overview") return onLiveUpdate(["orders", "intake"], () => void load());
  }, [tab, search, status, settings, loadingOrders]);
  async function refreshAdmin() {
    if (busy) return false;
    const [overview, orders] = await Promise.all([load(), tab === "orders" ? loadOrders() : true]);
    if (tab === "bookings" || tab === "subscriptions") setSectionRefresh((value) => value + 1);
    return overview && orders;
  }
  async function run(fn: () => Promise<any>, success = "Saved") {
    setBusy(true);
    setError("");
    try {
      await fn();
      await Promise.all([load(), tab === "orders" ? loadOrders() : true]);
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
    setEditing(p.testPrice && data?.settings.testMode !== true ? { ...p, price: null, available: false } : { ...p });
    setVariants(JSON.stringify(p.variants || [], null, 2));
    setAddons(JSON.stringify(p.addons || [], null, 2));
  }
  const currency = data?.settings.currency || "INR";
  const nav = [
    { id: "bookings", label: "Table bookings", mobileLabel: "Bookings", icon: CalendarDays },
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "products", label: "Products", icon: Coffee },
    { id: "categories", label: "Categories", icon: Tags },
    { id: "orders", label: "Orders", icon: ShoppingBag },
    { id: "customers", label: "Customers", icon: Users },
    { id: "subscriptions", label: "Subscriptions", icon: Ticket },
    { id: "suggestions", label: "Suggestions", icon: Lightbulb },
    { id: "advertising", label: "Advertising", icon: Megaphone },
    { id: "home-design", label: "Home design", icon: PanelsTopLeft },
    { id: "settings", label: "Store settings", icon: Settings },
  ];
  const mobileTabs = ["orders", "subscriptions", "overview", "products", "bookings"];
  const currentSection = nav.find((section) => section.id === tab)?.label;

  const applySection = useCallback((id: string, mobile = false) => {
    setTab(id);
    setSearch("");
    setStatus("all");
    setError("");
    if (mobile) {
      if (mobileMenu.current) mobileMenu.current.open = false;
      heading.current?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
  }, []);
  function selectSection(id: string, mobile = false) {
    if (id !== tab) window.history.pushState({ ...window.history.state, espressoAdminTab: id }, "");
    applySection(id, mobile);
  }
  useEffect(() => {
    const restoreSection = () => applySection(window.history.state?.espressoAdminTab ?? initialTab, true);
    const back = (event: Event) => {
      if (!mobileMenu.current?.open) return;
      mobileMenu.current.open = false;
      event.preventDefault();
    };
    if (window.history.state?.espressoAdminTab) restoreSection();
    window.addEventListener("popstate", restoreSection);
    window.addEventListener("espresso-android-back", back);
    return () => {
      window.removeEventListener("popstate", restoreSection);
      window.removeEventListener("espresso-android-back", back);
    };
  }, [applySection, initialTab]);

  function reviewPendingOrders() {
    if (tab === "orders" && status === "pending" && !search) void loadOrders();
    selectSection("orders", true);
    setStatus("pending");
  }

  async function changeOrderStatus(id: string, nextStatus: string, table?: string) {
    const saved = await run(() => api("admin/orders/" + id, "PATCH", { status: nextStatus, table }),
      table ? `Order accepted · Table ${table}` : "Order status updated");
    if (saved && status !== "all" && status !== nextStatus) {
      setSearch(id);
      setStatus("all");
    }
  }

  function changeDuty() {
    const acceptingOrders = data.acceptingOrders === false;
    void run(async () => {
      const result = await api("admin/order-intake", "PUT", { acceptingOrders });
      setData((current: any) => ({ ...current, acceptingOrders: result.acceptingOrders }));
    }, acceptingOrders ? "New orders are open" : "New orders are paused");
  }

  async function signOut() {
    setBusy(true);
    try {
      await api("auth/admin/logout", "POST", {});
      location.assign(signOutToApp ? "/#home" : "/admin");
    } catch (error) {
      setError((error as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="admin-app" data-can-manage-orders={canManageOrders}>
      <HomePullRefresh onRefresh={refreshAdmin} bottomNav={bottomNav} errorMessage="Admin could not be refreshed" />
      <div className="admin-mobile-brand">
        <img className="admin-mobile-brand-icon" src="/icon-192.png" width={42} height={42} alt="" />
        <div className="admin-mobile-brand-name">
          <strong>{data?.settings.brand || "Espressoulster Coffee"}</strong>
          <small>Café Admin</small>
        </div>
        {!staffSession && <a href="/#home"><ArrowLeft size={16} aria-hidden="true" />Customer app</a>}
        <details ref={mobileMenu} className="admin-mobile-menu" onKeyDown={(event) => {
          if (event.key === "Escape" && event.currentTarget.open) {
            event.currentTarget.open = false;
            event.currentTarget.querySelector("summary")?.focus();
          }
        }}>
          <summary aria-label="Admin menu" className={mobileTabs.includes(tab) ? "" : "active"}>
            <Menu size={21} aria-hidden="true" />
          </summary>
          <nav className="admin-mobile-menu-panel" aria-label="Additional administrator sections">
            {nav.filter((item) => !mobileTabs.includes(item.id)).map((section) => (
              <button key={section.id} type="button" aria-current={tab === section.id ? "page" : undefined} onClick={() => selectSection(section.id, true)}>
                <section.icon size={19} aria-hidden="true" />{section.label}
                {section.id === "suggestions" && !!data?.suggestions.some((item: any) => item.status === "pending") &&
                  <span className="admin-mobile-pending">Pending</span>}
              </button>
            ))}
            {receiveOrderAlerts && nativeAlerts && <button type="button" onClick={openNativeOrderAlertSettings}>
              <Bell size={19} aria-hidden="true" />Order alerts
            </button>}
            <button type="button" disabled={busy} onClick={signOut}><LogOut size={19} aria-hidden="true" />Sign out</button>
          </nav>
        </details>
      </div>
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <Coffee size={27} aria-hidden="true" />
          <span>
            {data?.settings.brand || "Espressoulster Coffee"}
            <small>CAFÉ MANAGEMENT</small>
          </span>
        </div>
        <nav aria-label="Administrator navigation">
          {nav.map((n) => (
            <button
              key={n.id}
              className={tab === n.id ? "active" : ""}
              aria-current={tab === n.id ? "page" : undefined}
              onClick={() => selectSection(n.id)}
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
        {!staffSession && <a className="admin-customer-link" href="/#home"><ArrowLeft size={17} aria-hidden="true" />Customer app</a>}
        <button type="button" className="back-to-store admin-signout" disabled={busy} onClick={signOut}>
          <LogOut size={17} />
          Sign out
        </button>
      </aside>
      <main className="admin-main" aria-busy={loadingOverview}>
        <header className="admin-header">
          <div>
            <span className="eyebrow">YOUR CAFÉ, AT A GLANCE</span>
            <h1 ref={heading} tabIndex={-1}>{currentSection}</h1>
            {tab === "overview" && data?.settings.openingHours && (
              <p className="admin-overview-hours">{data.settings.openingHours}</p>
            )}
          </div>
        </header>
        {tab === "overview" && data && canManageDuty && (
          <button type="button" className="admin-duty-switch" role="switch"
            aria-label="Café duty" aria-checked={data.acceptingOrders !== false}
            disabled={busy || loadingOverview} onClick={changeDuty}>
            <span><strong>Café duty</strong><small>{data.acceptingOrders !== false ? "On duty" : "Off duty"}</small></span>
            <span className="admin-duty-track" aria-hidden="true" />
          </button>
        )}
        {chatAlerts.total > 0 && <section className="admin-chat-notice" aria-label="Unread customer messages" role="status">
          <Bell size={19} aria-hidden="true"/><div><strong>Customer chat · {chatAlerts.total} unread</strong><span>New messages from your customers</span></div>
          <button type="button" onClick={()=>setChatOrderId(chatAlerts.orders[0].orderId)}>Read message</button>
        </section>}
        {!canManageOrders && <p className="fine-print admin-access-note">Live order changes and chat replies are handled by the café operator.</p>}
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
        {alertCount > 0 && (
          <div className="admin-success admin-order-alert" role="status">
            <Bell size={18} aria-hidden="true" />
            <span>{alertCount === 1 ? '1 new order' : `${alertCount} new orders`}</span>
            <button className="text-button" onClick={() => { clearAlert(); reviewPendingOrders(); void load(); }}>View orders</button>
            <button className="text-button" aria-label="Dismiss order alert" onClick={clearAlert}><X size={17} /></button>
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
            {tab === "bookings" && <TableBooking admin refreshVersion={sectionRefresh} />}
            {tab === "overview" && (
              <>
                <div className="stat-grid">
                  {[
                    { label: "Orders today", value: ordersToday ?? '…' },
                    { label: "Pending orders", value: data.stats.pending || 0 },
                    {
                      label: "Completed today",
                      value: data.stats.completed || 0,
                    },
                    {
                      label: "Revenue today",
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
                    <div className="panel-heading admin-recent-heading">
                      <h2>Recent orders</h2>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => selectSection("orders", true)}
                      >
                        <ShoppingBag size={16} aria-hidden="true" /> Open orders
                      </button>
                    </div>
                    {data.orders.length ? (
                      <div className="table-wrap">
                        <table className="admin-record-table" role="table">
                          <thead role="rowgroup">
                            <tr role="row">
                              <th role="columnheader" scope="col">Order</th>
                              <th role="columnheader" scope="col">Customer</th>
                              <th role="columnheader" scope="col">Status</th>
                              <th role="columnheader" scope="col">Total</th>
                            </tr>
                          </thead>
                          <tbody role="rowgroup">
                            {data.orders.slice(0, 6).map((o: any) => (
                              <tr role="row" key={o.id}>
                                <td role="cell" data-label="Order">
                                  <span className="admin-order-reference">
                                    {orderReference(o)}<OrderFulfillmentBadge fulfillment={o.fulfillment} />
                                    <OrderTableBadge fulfillment={o.fulfillment} table={o.contact.table} />
                                  </span>
                                </td>
                                <td role="cell" data-label="Customer">{o.contact.name}</td>
                                <td role="cell" data-label="Status">
                                  <OrderStatusBadge status={o.status} fulfillment={o.fulfillment} />
                                </td>
                                <td role="cell" data-label="Total">{money(o.total, o.currency)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="muted">No orders yet.</p>
                    )}
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
                        Your most ordered products will appear here after the first order.
                      </p>
                    )}
                  </section>
                </div>
              </>
            )}
            {tab === "products" && (
              <>
                <div className="admin-tools admin-search-tools">
                  <SearchField label="Search products" placeholder="Search products"
                    value={search} onChange={setSearch} />
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
                <section className="admin-panel table-wrap admin-products">
                  <table role="table" aria-label="Products">
                    <thead role="rowgroup">
                      <tr role="row">
                        <th scope="col">Product</th>
                        <th>Category</th>
                        <th>Price</th>
                        <th>Stock</th>
                        <th>Status</th>
                        <th>Manage</th>
                      </tr>
                    </thead>
                    <tbody role="rowgroup">
                      {data.products
                        .filter((p: any) =>
                          p.name.toLowerCase().includes(search.toLowerCase()),
                        )
                        .map((p: any) => (
                          <tr key={p.id} role="row">
                            <td role="cell">
                              <div className="table-product">
                                <ProductImage product={p} />
                                <div>
                                  <strong>{p.name}</strong>
                                  {p.featured && <small>Featured</small>}
                                </div>
                              </div>
                            </td>
                            <td role="cell">
                              <span className="admin-product-label" aria-hidden="true">Category</span>
                              {data.categories.find(
                                  (c: any) => c.id === p.categoryId,
                                )?.name
                              }
                            </td>
                            <td role="cell">
                              <span className="admin-product-label" aria-hidden="true">Price</span>
                              {p.price === null ? (
                                <span className="pending-price">Pending</span>
                              ) : (
                                money(p.price, currency)
                              )}
                            </td>
                            <td role="cell">
                              <span className="admin-product-label" aria-hidden="true">Stock</span>
                              {p.inventory === null ? "Unlimited" : p.inventory}
                            </td>
                            <td role="cell">
                              <span className="admin-product-label" aria-hidden="true">Status</span>
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
                            <td role="cell">
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
                                    if (available && (p.price === null || (p.testPrice && settings.testMode !== true) || (p.inventory !== null && p.inventory <= 0))) {
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
                <div className="admin-tools admin-search-tools">
                  <SearchField label="Search orders" placeholder="Order ID or name"
                    value={search} onChange={setSearch} />
                  <div className="admin-status-filter">
                    <select aria-label="Filter order status" value={status}
                      onChange={(event) => setStatus(event.target.value)}>
                      <option value="all">All statuses</option>
                      {Object.keys(transitions).map((entry) => (
                        <option key={entry} value={entry}>{readable(entry).replace(/^./, (letter) => letter.toUpperCase())}</option>
                      ))}
                    </select>
                    <ChevronDown size={16} aria-hidden="true" />
                  </div>
                </div>
                <div className="admin-order-list">
                  {orderRows.map((o: any) => {
                    const cancelled = o.status === "cancelled";
                    const unpaid = o.payment_status === "unpaid" && !cancelled;
                    const paymentRequiredToComplete = paysAtCafe(o) && o.payment_status !== "paid";
                    const showPaymentReminder = paymentRequiredToComplete && transitions[o.status]?.includes("completed");
                    const acceptWithTable = o.fulfillment === "dine_in" && o.status === "pending";
                    const unreadChat = chatAlerts.orders.find(notice=>notice.orderId===o.id)?.unread ?? 0;
                    return <article className="admin-panel" key={o.id} data-order-status={o.status} data-unpaid={unpaid} data-chat-unread={unreadChat > 0 ? "true" : undefined}>
                      <div className="order-top">
                        <div className="admin-order-identity">
                          <div className="admin-order-reference">
                            <strong>{orderReference(o)}</strong><OrderFulfillmentBadge fulfillment={o.fulfillment} />
                            <OrderTableBadge fulfillment={o.fulfillment} table={o.contact.table} />
                          </div>
                          <small className="admin-order-contact">
                            <strong>{o.contact.name}{o.contact.phone && " · " + o.contact.phone}</strong>
                            {o.fulfillment === "delivery" && " · Delivery"}
                          </small>
                          <small>
                            {new Date(o.created_at + "Z").toLocaleString()}
                          </small>
                        </div>
                        <div className="admin-order-badges">
                          {(cancelled || o.payment_status === "paid") &&
                            <OrderStamp state={cancelled ? "cancelled" : "paid"} />}
                          {!cancelled && <OrderStatusBadge status={o.status} fulfillment={o.fulfillment} />}
                          {unpaid && <span className="admin-unpaid-badge">Unpaid</span>}
                        </div>
                      </div>
                      {canManageOrders && o.fulfillment === "dine_in" && !cancelled && o.status !== "completed" && (
                        <DineInTablePicker key={o.contact.table || "unassigned"} assigned={o.contact.table} busy={busy}
                          options={tableOptions === null ? null : tableOptions[o.id]} accepting={acceptWithTable}
                          onAssign={table => {
                            if (acceptWithTable) void changeOrderStatus(o.id, "confirmed", table);
                            else void run(() => api(`admin/orders/${o.id}/table`, "PATCH", { table }), `Table ${table} assigned`);
                          }} />
                      )}
                      {canManageOrders && transitions[o.status]?.length > 0 && (
                        <div className="order-buttons admin-order-status-actions" aria-label="Order management" role="group">
                          {transitions[o.status].filter(s =>
                            !(s === "confirmed" && acceptWithTable) &&
                            !(s === "cancelled" && o.payment_status === "paid") &&
                            !(o.fulfillment !== "delivery" && s === "out_for_delivery") &&
                            !(o.fulfillment === "delivery" && s === "ready")
                          ).map(s => (
                            <button key={s} type="button" className={s === "cancelled" ? "secondary danger" : "primary"}
                              disabled={busy || (s === "completed" && paymentRequiredToComplete)}
                              aria-describedby={s === "completed" && showPaymentReminder ? "payment-reminder-" + o.id : undefined}
                              onClick={() => void changeOrderStatus(o.id, s)}>
                              {orderActionLabels[s]}
                            </button>
                          ))}
                        </div>
                      )}
                      {canManageOrders && showPaymentReminder && <p className="admin-payment-reminder" id={"payment-reminder-" + o.id}>
                        Record collected payment to complete this order.
                      </p>}
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
                        {o.payment_status !== "paid" && (
                          <>
                            <span>Payment: {o.payment_status === "unpaid" ? "Unpaid — payment pending" : readable(o.payment_status)}</span>
                            <span>Method: {paymentLabel(o)}</span>
                          </>
                        )}
                      </div>
                      <div className="order-buttons">
                        <button type="button" className="secondary admin-chat-button" onClick={() => setChatOrderId(o.id)}>Customer chat{unreadChat > 0 && <span className="admin-chat-count" aria-label={unreadChat+" unread messages"}>{unreadChat}</span>}</button>
                      </div>
                      {canManageOrders && o.payment_status === "unpaid" &&
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
                    </article>;
                  })}
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
            {tab === "subscriptions" && <AdminSubscriptions refreshVersion={sectionRefresh}
              checkoutEnabled={settings.testMode === true && ["stripe","cashfree"].includes(data.paymentConfig?.provider) && data.paymentConfig.enabled === true} />}
            {tab === "customers" && (
              <section className="admin-panel table-wrap">
                <table className="admin-record-table" role="table">
                  <thead role="rowgroup">
                    <tr role="row">
                      <th role="columnheader" scope="col">Customer</th>
                      <th role="columnheader" scope="col">Contact</th>
                      <th role="columnheader" scope="col">Orders</th>
                      <th role="columnheader" scope="col">Account</th>
                    </tr>
                  </thead>
                  <tbody role="rowgroup">
                    {data.customers.map((c: any) => (
                      <tr role="row" key={c.id}>
                        <td role="cell" data-label="Customer">
                          <strong>{c.name || "Customer"}</strong>
                          <small>{c.created_at}</small>
                        </td>
                        <td role="cell" data-label="Contact">
                          {customerEmail(c.email)}
                          <small>{c.phone}</small>
                        </td>
                        <td role="cell" data-label="Orders">
                          <CustomerOrders key={c.id + ":" + c.order_count} customer={c} currency={currency} />
                        </td>
                        <td role="cell" data-label="Account">
                          {c.staff ? <span className="fine-print">Staff account</span> : <button
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
                          </button>}
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
            {tab === "advertising" && <AdvertisementManager previewSamples={previewAdvertisingSamples} />}
            {tab === "home-design" && data?.homeDesign && <HomeDesignEditor design={data.homeDesign} busy={busy}
              onPublish={design => void run(() => api("admin/home-design", "PUT", design), "Home design published")} />}
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
                          const b = await api("admin/upload", "POST", f);
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
                  <label>
                    Daily order count reset (IST)
                    <input type="time" required value={settings.orderDayOpeningTime}
                      onChange={(e) => setSettings({ ...settings, orderDayOpeningTime: e.target.value })} />
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
                    {["stripe","cashfree"].includes(data.paymentConfig?.provider) && data.paymentConfig?.enabled
                      ? "Test payments enabled. No real money is collected."
                      : "Record payments when customers pay at the café."}
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
                  {!(settings.promotionBanners||[]).length&&<label className="admin-banner-image-picker"><span className="banner-picker-symbol" aria-hidden="true">＋</span><strong>Choose banner image</strong><span>Upload a photo or offer artwork from your device</span><small>PNG, JPG or WebP · up to 3 MB</small><input type="file" aria-label="Choose first banner image" disabled={busy} accept="image/png,image/jpeg,image/webp" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;const input=e.currentTarget;await run(async()=>{if(file.size>3*1024*1024)throw Error("Choose an image smaller than 3 MB.");const result=await api("admin/upload","POST",file);setSettings((current:any)=>({...current,promotionBanners:[...(current.promotionBanners||[]),{id:crypto.randomUUID(),image:result.url,tag:"",title:"",copy:"",action:"",search:"",destination:"menu",enabled:true}]}));},"Image uploaded. Save store settings to show your banner.");input.value="";}}/></label>}
                  <div className="admin-ad-actions">{[{label:'Add subscription offer',destination:'subscriptions'},{label:'Add ad',destination:'menu'}].map(option=><button key={option.destination} type="button" className="secondary" onClick={()=>setSettings((current:any)=>({...current,promotionBanners:[...(current.promotionBanners||[]),{id:crypto.randomUUID(),image:"",tag:"",title:"",copy:"",action:"",search:"",destination:option.destination,enabled:false}]}))}>{option.label}</button>)}</div>
                  {(settings.promotionBanners||[]).map((banner:any,index:number)=>{
                    const update=(patch:any)=>setSettings((current:any)=>({...current,promotionBanners:current.promotionBanners.map((item:any)=>item.id===banner.id?{...item,...patch}:item)}));
                    return <fieldset key={banner.id} className="admin-ad-banner"><legend>{banner.destination==='subscriptions'?'Subscription offer':'Ad'}</legend>
                      <label>Show banner<input type="checkbox" checked={banner.enabled} onChange={e=>update({enabled:e.target.checked})}/></label>
                      <label className="admin-banner-image-picker">{banner.image?<img src={banner.image} alt="Advertisement preview"/>:<span className="banner-picker-symbol" aria-hidden="true">＋</span>}<strong>{banner.image?"Change banner image":"Choose banner image"}</strong><span>PNG, JPG or WebP · up to 3 MB</span><input type="file" aria-label={"Choose image for advertisement "+(index+1)} disabled={busy} accept="image/png,image/jpeg,image/webp" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;const input=e.currentTarget;await run(async()=>{if(file.size>3*1024*1024)throw Error("Choose an image smaller than 3 MB.");const result=await api("admin/upload","POST",file);update({image:result.url});},"Banner uploaded. Save settings to apply.");input.value="";}}/></label>
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
                <section className="admin-panel"><h2>Coffee club rules</h2><p>Configure your future rewards programme. These rules are saved as a draft; reward issuance and redemption are not activated by this form.</p>{[{key:'qualifyingRupees',label:'Minimum qualifying order (₹)',max:100000},{key:'silverOrders',label:'Orders to reach the second tier',max:1000},{key:'goldOrders',label:'Orders to reach the highest tier',max:1000},{key:'silverCashbackPercent',label:'Second-tier reward percentage',max:100},{key:'goldCashbackPercent',label:'Highest-tier reward percentage',max:100},{key:'referralRupees',label:'Referral benefit (₹)',max:10000},{key:'birthdayRupees',label:'Birthday benefit (₹)',max:10000}].map(field=><label key={field.key}>{field.label}<input type="number" min="0" max={field.max} step="1" value={settings.clubRules?.[field.key]??''} placeholder="Not configured" onChange={e=>setSettings({...settings,clubRules:{...(settings.clubRules||{}),[field.key]:e.target.value===''?null:Number(e.target.value)}})}/></label>)}<p>Each subscription item uses a separate redemption code. Subscribers receive 10% off app orders.</p></section><button className="primary save-settings" disabled={busy}>
                  {busy ? "Saving…" : "Save store settings"}
                </button>
              </form>
            )}
          </>
        )}
      </main>
      <nav ref={bottomNav} className="admin-mobile-nav glass-tab-bar" aria-label="Mobile administrator navigation"
        style={{ "--glass-tab-index": Math.max(0, mobileTabs.indexOf(tab)) } as CSSProperties}>
        <span className="admin-nav-glass" aria-hidden="true" />
        <svg className="admin-nav-outline" viewBox="0 0 380 64" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <clipPath id="admin-nav-glass-clip" clipPathUnits="objectBoundingBox">
              <use href="#admin-nav-profile" transform="scale(.002631579 .015625)" />
            </clipPath>
          </defs>
          <path id="admin-nav-profile" d={bottomNavOutline} className="admin-nav-edge" vectorEffect="non-scaling-stroke" />
          <BottomNavRefreshWave outline="admin-nav-profile"
            onEnd={() => bottomNav.current?.removeAttribute("data-refresh-impact")} />
        </svg>
        <span className="glass-tab-selection" aria-hidden="true" />
        {mobileTabs.map((id) => {
          const section = nav.find((item) => item.id === id)!;
          return <button key={id} type="button" aria-label={section.label} aria-current={tab === id ? "page" : undefined}
            data-raised-tab={id === "overview" ? "" : undefined} onClick={() => selectSection(id, true)}>
            <span className="admin-nav-icon">
              <section.icon size={23} strokeWidth={tab === id ? 2.2 : 1.7} aria-hidden="true" />
              {id === "orders" && chatAlerts.total > 0 && <span className="admin-chat-nav-dot" aria-label="Unread customer messages"/>}
            </span>
            {id === "subscriptions" ? (
              <>
                <span className="admin-nav-full-label">Subscriptions</span>
                <span className="admin-nav-short-label">Plans</span>
              </>
            ) : section.mobileLabel ?? section.label}
          </button>;
        })}
      </nav>
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
                      const price = minor(e.target.value);
                      setEditing({ ...editing, price, ...(price !== null && settings.testMode !== true ? { testPrice: false } : {}) });
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
                    const b = await api("admin/upload", "POST", f);
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
                    const b = await api("admin/upload", "POST", f);
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
      {chatOrderId && <OrderChat key={chatOrderId} orderId={chatOrderId}
        orderNumber={orderRows.find((order) => order.id === chatOrderId)?.order_number ?? chatAlerts.orders.find(order=>order.orderId===chatOrderId)?.orderNumber}
        staff readOnly={!canManageOrders} request={api} onRead={chatAlerts.markRead} onClose={() => setChatOrderId(null)} />}
    </div>
  );
}
