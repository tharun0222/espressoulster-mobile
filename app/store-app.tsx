import UpiScanner from './upi-scanner';
import {unlockCelebrationAudio,celebrationSound} from '../lib/celebration-audio';
import MovableCart from "./movable-cart";
import PromotionBanners from "./promotion-banners";
import FavouriteCelebration from "./favourite-celebration";
import CategoryIcon from "./category-icon";
import {filterMenu} from "../lib/menu-filters";
"use client";
import { useState, useEffect, useCallback, useRef, useLayoutEffect } from "react";
import {
  Coffee,
  Croissant,
  Sandwich,
  Cookie,
  House,
  BookOpen,
  ScanLine,
  ShoppingBag,
  UserRound,
  Search,
  ChevronRight,
  ChevronLeft,
  Plus,
  Minus,
  X,
  Heart,
  HeartCrack,
  MapPin,
  SlidersHorizontal,
  Check,
  ShoppingCart,
  ShoppingBasket,
  Clock,
  LogOut,
  Settings,
  Package,
  Lightbulb,
  Phone,
  Mail,
  RefreshCw,
  Trash2,
  ArrowLeft,
  CheckCircle2,
} from "lucide-react";
import { signOutSession } from "../lib/sign-out";
import { useDialogAccessibility } from "../lib/dialog";
import MobileInstall from "./mobile-install";
import CoffeeSubscriptions from "./coffee-subscriptions";
import SubscriptionTracker from "./subscription-tracker";
import OnlinePayment from "./online-payment";
import {paymentRequest} from "../lib/payment-request";
import { defaultSettings } from "../lib/catalog";
type Item = {
  productId: string;
  quantity: number;
  variantId: string;
  addonIds: string[];
  instructions: string;
};
export async function api(
  path: string,
  method = "GET",
  data?: any,
): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const r = await fetch("/api/" + path, {
      method,
      signal: controller.signal,
      headers: data instanceof FormData ? undefined : { "Content-Type": "application/json" },
      body: data === undefined ? undefined : data instanceof FormData ? data : JSON.stringify(data),
    });
    const b: any = r.headers.get("Content-Type")?.includes("application/json")
      ? await r.json() : {error:"The café is temporarily unavailable. Please try again."};
    if (!r.ok) throw new Error(b.error || "Something went wrong. Please retry.");
    return b;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("The request timed out. Check your connection and try again.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
export function money(value: number, currency = "INR") {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value / 100);
  } catch {
    return (value / 100).toFixed(2) + " " + currency;
  }
}
export function ProductImage({
  product,
  className = "",
}: {
  product: any;
  className?: string;
}) {
  return (
    <div
      className={"product-image " + className}
      role="img"
      aria-label={product.name + " · illustrative image"}
    >
      <CategoryIcon id={product.categoryId} />
      {product.image && (product.imageAtlas ? (
        <div className="photo-layer" style={{backgroundImage:`url("${product.image}")`,backgroundPosition:product.imagePosition || "center",backgroundSize:"500% 200%"}} />
      ) : (
        <img className="photo-layer menu-photo" src={product.image} alt="" loading="lazy" decoding="async" style={{objectPosition:product.imagePosition || "center"}} onError={(event)=>{event.currentTarget.style.display="none";}} />
      ))}
    </div>
  );
}
const initialItem = (id: string): Item => ({
  productId: id,
  quantity: 1,
  variantId: "",
  addonIds: [],
  instructions: "",
});
const itemKey = (i: Item) =>
  JSON.stringify([i.productId, i.variantId, [...i.addonIds].sort()]);
export default function StoreApp() {
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const profilePhotoInput = useRef<HTMLInputElement>(null);
  const profileDetailsRef = useRef<HTMLFormElement>(null);
  const floatingCartRef = useRef<HTMLButtonElement>(null);
  const headerCartRef = useRef<HTMLButtonElement>(null);
  const [cartFlights, setCartFlights] = useState<any[]>([]);
  const [cartArrival, setCartArrival] = useState(0);
  const flightTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => flightTimers.current.forEach(clearTimeout), []);
  function flyToCart(product: any, origin?: HTMLElement) {
    if (!origin || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const target = floatingCartRef.current || headerCartRef.current;
    if (!target) return;
    const source = origin.closest("article")?.querySelector(".product-image") || origin;
    const start = source.getBoundingClientRect(), end = target.getBoundingClientRect();
    const id = crypto.randomUUID();
    const x = start.left + start.width / 2 - 30, y = start.top + start.height / 2 - 30;
    setCartFlights(old => [...old.slice(-7), {id, product, x, y, dx: end.left + end.width / 2 - x - 30, dy: end.top + end.height / 2 - y - 30}]);
    const timer = setTimeout(() => {
      setCartFlights(old => old.filter(flight => flight.id !== id));
      setCartArrival(old => old + 1);
      flightTimers.current = flightTimers.current.filter(value => value !== timer);
    }, 760);
    flightTimers.current.push(timer);
  }
  const [favouriteCelebration, setFavouriteCelebration] = useState(0);
  const [route, setRoute] = useState("home"),
    [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [cart, setCart] = useState<Item[]>([]),
    [cartReady, setCartReady] = useState(false),
    [favoriteIds, setFavoriteIds] = useState<string[]>([]),
    [category, setCategory] = useState("all"),
    [search, setSearch] = useState(""),
    [sort, setSort] = useState("default"),
    [priceRange, setPriceRange] = useState("all"),
    [diet, setDiet] = useState("all"),
    [showFilters, setShowFilters] = useState(false),
    [visibleCount, setVisibleCount] = useState(24),
    [selected, setSelected] = useState<any>(null),
    [editIndex, setEditIndex] = useState(-1),
    [selection, setSelection] = useState<Item>(initialItem("")),
    [orders, setOrders] = useState<any[]>([]),
    [moreOrders, setMoreOrders] = useState(false),
    [addresses, setAddresses] = useState<any[]>([]),
    [suggestions, setSuggestions] = useState<any[]>([]),
    [quote, setQuote] = useState<any>(null),
    [code, setCode] = useState(""),
    [fulfillment, setFulfillment] = useState("pickup"),
    [confirmation, setConfirmation] = useState(""),
    [splash, setSplash] = useState(true),
    [info, setInfo] = useState("");
  const [onlineConfig,setOnlineConfig]=useState<any>({enabled:false});
  const [payOnline,setPayOnline]=useState(false);
  useEffect(()=>{if(data?.authentication==="pin"&&!data?.user)window.dispatchEvent(new Event("espresso-pin-signedout"))},[data?.authentication,data?.user]);
  useEffect(()=>{if(!data?.user)return;paymentRequest("config").then(setOnlineConfig).catch(()=>setOnlineConfig({enabled:false}));},[data?.user?.userId]);
  const [signingOut, setSigningOut] = useState(false);
  const [contact, setContact] = useState<any>({
    name: "",
    phone: "",
    address: "",
    notes: "",
  });
  const [suggestion, setSuggestion] = useState<any>({
    name: "",
    category: "",
    description: "",
    notes: "",
    image: "",
  });
  const keyRef = useRef(""),
    cartSerial = useRef<Promise<void> | null>(null);
  const pendingCart = useRef<Item[] | null>(null);
  const savedCart = useRef("");
  const cartSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function flushCart(items?: Item[]): Promise<void> {
    if (cartSaveTimer.current) clearTimeout(cartSaveTimer.current);
    if (items) pendingCart.current = items;
    if (!cartSerial.current) {
      cartSerial.current = Promise.resolve().then(async () => {
        while (pendingCart.current) {
          const next = pendingCart.current;
          pendingCart.current = null;
          const signature = JSON.stringify(next);
          if (signature === savedCart.current) continue;
          try {
            await api("cart", "PUT", {items: next});
            savedCart.current = signature;
          } catch (error) {
            // Keep the latest unsaved state for an explicit checkout retry.
            if (!pendingCart.current) pendingCart.current = next;
            throw error;
          }
        }
      }).finally(() => { cartSerial.current = null; });
    }
    return cartSerial.current;
  }
  const settings = data?.settings || defaultSettings,
    user = data?.user,
    products = data?.products || [],
    categories = data?.categories?.filter((c: any) => c.enabled && data.products.some((p:any)=>!p.archived && p.categoryId===c.id)) || [];
  const menuProductsRef = useRef<HTMLElement>(null);
  const categoryPositions = useRef<Record<string, {top:number; count:number}>>({});
  const selectMenuCategory = (next:string) => {
    if (next === category) return;
    categoryPositions.current[category] = {top:menuProductsRef.current?.scrollTop || 0, count:visibleCount};
    setVisibleCount(categoryPositions.current[next]?.count || 24);
    setCategory(next);
  };
  useLayoutEffect(() => {
    if (menuProductsRef.current) menuProductsRef.current.scrollTop = categoryPositions.current[category]?.top || 0;
  }, [category]);
  const qty = cart.reduce((s, i) => s + i.quantity, 0);
  const previousRoute = useRef("home");
  const [pageDirection, setPageDirection] = useState("forward");
  const navigate = useCallback((r: string) => {
    const tabs = ["home", "menu", "pay", "subscriptions", "profile"];
    setPageDirection(tabs.indexOf(r) < tabs.indexOf(previousRoute.current) ? "backward" : "forward");
    previousRoute.current = r;
    setRoute(r);
    setError("");
    window.history.replaceState(null, "", "#" + r);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);
  const notify = (s: string) => {
    setNotice(s);
    setTimeout(() => setNotice(""), 4000);
  };
  const load = useCallback(async () => {
    try {
      setError("");
      const b = await api("bootstrap");
      setData(b);
      if (b.user) {
        const [c, f] = await Promise.all([api("cart"), api("favorites")]);
        savedCart.current = JSON.stringify(c.items);
        setCart(c.items);
        setFavoriteIds(f.ids);
        setContact((v: any) => ({
          ...v,
          name: b.user.profile.name || b.user.fullName || "",
          phone: b.user.profile.phone || "",
        }));
      }
      setCartReady(true);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);
  useEffect(() => {
    if (!splash) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [splash]);
  useEffect(() => {
    load();
    const r = window.location.hash.slice(1);
    if (
      [
        "home",
        "menu",
        "pay",
        "packs",
        "subscriptions",
        "profile",
        "cart",
        "checkout",
        "orders",
        "favorites",
        "suggest",
        "addresses",
      ].includes(r)
    )
      setRoute(r);
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, [load]);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const fresh = await api("bootstrap");
        if (!active) return;
        setData(fresh);
        setSelected((current:any) => current ? fresh.products.find((p:any)=>p.id===current.id) || null : null);
      } catch { /* Keep browsing with the last loaded catalog during a connection interruption. */ }
    };
    const timer = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);
  useEffect(()=>{
    if(!data)return;
    const timer=setTimeout(()=>setSplash(false),5200);
    return()=>clearTimeout(timer);
  },[!!data]);
  useEffect(() => {
    if (!user || !cartReady || JSON.stringify(cart) === savedCart.current) return;
    pendingCart.current = cart;
    cartSaveTimer.current = setTimeout(() => {
      flushCart().catch((e) => setError("Cart could not be saved. " + e.message));
    }, 250);
    return () => { if (cartSaveTimer.current) clearTimeout(cartSaveTimer.current); };
  }, [cart, user?.userId, cartReady]);
  useEffect(() => {
    if (!["cart", "checkout"].includes(route) || !user || !cart.length) {
      setQuote(null);
      return;
    }
    let active = true;
    setQuote(null);
    api("quote", "POST", { items: cart, code, fulfillment })
      .then((b) => {
        if (active) setQuote(b);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [route, cart, code, fulfillment, user?.userId]);
  useEffect(() => {
    if (!user) return;
    if (["orders", "profile"].includes(route))
      api("orders")
        .then((b) => {
          setOrders(b.orders);
          setMoreOrders(b.orders.length === 50);
        })
        .catch((e) => setError(e.message));
    if (["addresses", "checkout"].includes(route))
      api("addresses")
        .then((b) => setAddresses(b.addresses))
        .catch((e) => setError(e.message));
    if (route === "suggest")
      api("suggestions")
        .then((b) => setSuggestions(b.suggestions))
        .catch((e) => setError(e.message));
  }, [route, user?.userId, confirmation]);
  useEffect(() => {
    const context = (document as any).modelContext;
    if (!context?.registerTool) return;
    const life = new AbortController();
    Promise.resolve(
      context.registerTool(
        {
          name: "browse_coffee_menu",
          title: "Browse coffee menu",
          description:
            "Open the menu and filter it by a search term. Does not place an order.",
          inputSchema: {
            type: "object",
            properties: { search: { type: "string", maxLength: 150 } },
            required: ["search"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true },
          execute: async (input: any) => {
            if (typeof input?.search !== "string" || input.search.length > 150)
              throw Error("Invalid search");
            setSearch(input.search);
            setCategory("all");
            navigate("menu");
            return { view: "menu", search: input.search };
          },
        },
        { signal: life.signal },
      ),
    ).catch(() => {});
    return () => life.abort();
  }, [navigate]);
  useEffect(() => { setVisibleCount(24); categoryPositions.current = {}; if (menuProductsRef.current) menuProductsRef.current.scrollTop = 0; }, [search, diet, sort, priceRange]);
  useDialogAccessibility(!!selected || !!info, () => {
    setSelected(null);
    setInfo("");
  });
  function authRequired() {
    if (!user) {
      setInfo("Sign in to save your cart, favourites, and orders.");
      return true;
    }
    return false;
  }
  function add(item: Item, origin?: HTMLElement) {
    if (authRequired()) return;
    const p = products.find((p: any) => p.id === item.productId);
    if (!p?.available || p.inventory === 0 || p.price === null) {
      setError("This item is not available to order yet.");
      return;
    }
    setCart((previous) => {
      const old =
        editIndex >= 0 ? previous.filter((_, k) => k !== editIndex) : previous;
      const total = old.filter(i => i.productId === item.productId).reduce((sum, i) => sum + i.quantity, 0);
      const remaining = Math.min(99, p.inventory ?? 99) - total;
      if (remaining <= 0) return previous;
      const addition = {...item, quantity: Math.min(item.quantity, remaining)};
      const found = old.find((i) => itemKey(i) === itemKey(item));
      return found
        ? old.map((i) =>
            itemKey(i) === itemKey(item)
              ? {
                  ...i,
                  quantity: Math.min(99, i.quantity + addition.quantity),
                  instructions: item.instructions,
                }
              : i,
          )
        : [...old, addition];
    });
    if (editIndex < 0) flyToCart(p, origin);
    setSelected(null);
    keyRef.current = "";
  }
  function changeQty(index: number, delta: number) {
    setCart((old) => {
      const item = old[index];
      const product = products.find((p: any) => p.id === item?.productId);
      const total = old.filter(i => i.productId === item?.productId).reduce((sum, i) => sum + i.quantity, 0);
      if (delta > 0 && (!product?.available || product.price == null || total >= 99 ||
          (product.inventory != null && total + delta > product.inventory))) return old;
      return old.map((i, k) => k === index ? {...i, quantity: Math.min(99, i.quantity + delta)} : i)
        .filter(i => i.quantity > 0);
    });
    keyRef.current = "";
  }
  function adjustMenuQty(productId: string, delta: number, origin?: HTMLElement) {
    const product = products.find((p:any)=>p.id===productId);
    if (delta > 0 && (!product?.available || product.inventory === 0 || product.price === null)) return;
    const count = cart.filter(item => item.productId === productId).reduce((sum, item) => sum + item.quantity, 0);
    if (delta > 0 && count > 0 && count < 99) flyToCart(products.find((p: any) => p.id === productId), origin);
    setCart((previous) => {
      // Adjust the most recently added configuration without losing its options.
      let index = -1;
      for (let k = previous.length - 1; k >= 0; k--) {
        if (previous[k].productId === productId) { index = k; break; }
      }
      if (index < 0) return previous;
      const total = previous.filter((item) => item.productId === productId).reduce((sum, item) => sum + item.quantity, 0);
      if (delta > 0 && (total >= 99 || (product.inventory != null && total + delta > product.inventory))) return previous;
      return previous.map((item, k) => k === index ? {...item, quantity: Math.min(99, item.quantity + delta)} : item).filter((item) => item.quantity > 0);
    });
    keyRef.current = "";
  }
  function openProduct(p: any) {
    setEditIndex(-1);
    setSelected(p);
    setSelection({
      ...initialItem(p.id),
      variantId: p.variants?.[0]?.id || "",
    });
  }
  async function favorite(id: string) {
    if (authRequired()) return;
    try {
      const remove = favoriteIds.includes(id);
      await api("favorites", "POST", { productId: id, remove });
      setFavoriteIds((old) =>
        remove ? old.filter((i) => i !== id) : [...old, id],
      );
      if (!remove) setFavouriteCelebration((event) => event + 1);
      notify(remove ? "Removed from favourites" : "Saved to favourites");
    } catch (e: any) {
      setError(e.message);
    }
  }
  function unit(i: Item) {
    const p = products.find((p: any) => p.id === i.productId);
    return p?.price == null
      ? null
      : p.price +
          (p.variants?.find((v: any) => v.id === i.variantId)?.price || 0) +
          (p.addons || [])
            .filter((a: any) => i.addonIds.includes(a.id))
            .reduce((s: number, a: any) => s + a.price, 0);
  }
  async function submitOrder(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !quote) return;
    unlockCelebrationAudio();
    if(payOnline&&(!onlineConfig.enabled||quote.total<(onlineConfig.minimumAmount||50))){setError("Stripe sandbox needs an order of at least "+money(onlineConfig.minimumAmount||50,settings.currency));return;}
    setBusy(true);
    setError("");
    try {
      await flushCart(cart);
      if (!keyRef.current) keyRef.current = crypto.randomUUID();
      const b = await api("orders", "POST", {
        items: cart,
        code,
        fulfillment,
        contact,
        paymentMethod: payOnline ? "stripe_test" :
          fulfillment === "dine_in" ? "pay_at_counter" : fulfillment === "pickup" ? "pay_at_pickup" : "cash_on_delivery",
        expectedTotal: quote.total,
        idempotencyKey: keyRef.current,
      });
      celebrationSound("order");
      setConfirmation(b.id);
      setCart([]);
      navigate("orders");
      if(payOnline){
        const checkout=await paymentRequest(b.id+"/start",{});
        if(checkout.paid){window.location.assign("/payment-return?order="+b.id);return;}
        const target=new URL(checkout.redirectUrl);
        if(target.protocol!=="https:"||target.hostname!=="checkout.stripe.com"||target.port||target.username||target.password)throw Error("Untrusted Stripe checkout address");
        window.location.assign(target.href);
      }else notify("Order received. Follow its progress in My orders.");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const filtered = filterMenu(products,categories.map((c:any)=>c.id),{category,search,diet,sort,priceRange});
  function card(p: any, compact = false) {
    const outOfStock = !p.available || p.inventory === 0;
    const count = cart
      .filter((i) => i.productId === p.id)
      .reduce((s, i) => s + i.quantity, 0);
    return (
      <article
        key={p.id}
        className={"product-card " + (compact ? "compact " : "") + (outOfStock ? "product-out-of-stock" : "")}
      >
        <button
          className="image-button"
          onClick={() => openProduct(p)}
          aria-label={"View " + p.name}
        >
          <ProductImage product={p} />
        </button>
        <div className="product-copy">
          <div className="product-top">
            <span className="eyebrow">
              {categories.find((c: any) => c.id === p.categoryId)?.name}
            </span>
            <button
              className={
                "icon-button favorite " +
                (favoriteIds.includes(p.id) ? "saved" : "")
              }
              onClick={() => favorite(p.id)}
              aria-label={"Favourite " + p.name}
            >
              <Heart size={17} />
            </button>
          </div>
          <button className="product-title" onClick={() => openProduct(p)}>
            {p.name}
          </button>
          <div className="dietary-tags">{p.dietary?.length ? p.dietary.map((tag:string)=><span key={tag} className={tag==='Non-veg'?'diet-meat':tag==='Egg'?'diet-egg':'diet-veg'}>{tag}</span>) : <span>Dietary info pending</span>}{p.testPrice && <span className="diet-test">TEST PRICE</span>}</div>
          {outOfStock && <span className="stock-unavailable"><HeartCrack size={15} aria-hidden="true" /> Out of stock</span>}
          {p.description && <p className="description">{p.description}</p>}
          <div className="product-footer">
            <span className={"price " + (p.price === null ? "pending" : "")}>
              {p.price === null
                ? "Price pending"
                : money(p.price, settings.currency)}
            </span>
            {count > 0 ? (
              <div className="menu-quantity" role="group" aria-label={"Quantity for " + p.name}>
                <button type="button" onClick={() => adjustMenuQty(p.id, -1)} aria-label={"Decrease " + p.name + " quantity"}><Minus size={14} /></button>
                <span aria-live="polite" aria-atomic="true">{count}</span>
                <button type="button" onClick={(event) => adjustMenuQty(p.id, 1, event.currentTarget)} disabled={outOfStock || p.price === null || count >= Math.min(99, p.inventory ?? 99)} aria-label={"Increase " + p.name + " quantity"}><Plus size={14} /></button>
              </div>
            ) : (
            <button
              className="add-button"
              disabled={outOfStock}
              onClick={(event) =>
                p.available && p.price !== null
                  ? p.variants?.length || p.addons?.length
                    ? openProduct(p)
                    : add(initialItem(p.id), event.currentTarget)
                  : openProduct(p)
              }
            >
              {outOfStock
                ? "Out of stock"
                : p.price === null
                  ? "View"
                  : count
                    ? `${count} added`
                    : "Add"}
              {!outOfStock && p.price !== null && !count && <Plus size={14} />}
            </button>
            )}
          </div>
        </div>
      </article>
    );
  }
  function loginPanel() {
    return (
      <div className="empty-state">
        <UserRound size={44} />
        <h2>Your account</h2>
        <p>Sign in to keep your favourites, cart, and orders together.</p>
        <a
          className="primary"
          href={
            "/tester-login?return_to=" + encodeURIComponent("/#" + route)
          }
          target="_self"
          onClick={(event) => {
            if (process.env.NODE_ENV === "development") {
              event.preventDefault();
              window.location.assign(event.currentTarget.href);
            }
          }}
        >
          Start testing
        </a>
      </div>
    );
  }
  function totals() {
    return (
      quote && (
        <div className="totals">
          <div>
            <span>Subtotal</span>
            <span>{money(quote.subtotal, settings.currency)}</span>
          </div>
          {quote.discount > 0 && (
            <div>
              <span>{quote.discountLabel || "Discount"}</span>
              <span>−{money(quote.discount, settings.currency)}</span>
            </div>
          )}
          <div>
            <span>Tax ({settings.taxBps / 100}%)</span>
            <span>{money(quote.tax, settings.currency)}</span>
          </div>
          {quote.fee > 0 && (
            <div>
              <span>Delivery fee</span>
              <span>{money(quote.fee, settings.currency)}</span>
            </div>
          )}
          <div className="grand-total">
            <strong>Total</strong>
            <strong>{money(quote.total, settings.currency)}</strong>
          </div>
        </div>
      )
    );
  }
  return (
    <>
      <FavouriteCelebration event={favouriteCelebration} />
      <div className="cart-flight-layer" aria-hidden="true">
        {cartFlights.map(flight => <div key={flight.id} className="cart-flight" style={{left: flight.x, top: flight.y, "--flight-x": `${flight.dx}px`, "--flight-y": `${flight.dy}px`, "--arc-x": `${flight.dx * .4}px`, "--arc-y": `${Math.min(flight.dy * .4, 0) - 85}px`} as React.CSSProperties}><ProductImage product={flight.product} /></div>)}
      </div>
      <div className="app-shell">
        <header className={"header " + (route === "home" ? "home-header" : "")}>
          <div className="header-inner">
            <div className="brand-row">
              <button className="brand" onClick={() => navigate("home")}>
                {settings.logo ? (
                  <img src={settings.logo} className="brand-logo" alt="" />
                ) : null}
                <span>{settings.brand}</span>
              </button>
              <div className="header-actions">
                <button
                  className="icon-button"
                  onClick={() => navigate("favorites")}
                  aria-label="Favourites"
                >
                  <Heart size={20} />
                </button>
                <button
                  className="icon-button"
                  onClick={() => navigate("cart")}
                  aria-label="Shopping cart"
                  ref={headerCartRef}
                >
                  <ShoppingCart size={21} />
                  {qty > 0 && <span className="badge">{qty}</span>}
                </button>
              </div>
            </div>
            {route === "home" && (
              <h1 className="greeting">
                Hi {user?.profile?.name?.split(" ")[0] || "coffee lover"}!
              </h1>
            )}
            <button
              className="location"
              onClick={() =>
                setInfo(
                  [settings.location, settings.address, settings.openingHours]
                    .filter(Boolean)
                    .join("\n"),
                )
              }
            >
              <MapPin size={17} />
              <span>{fulfillment === "dine_in" ? "Enjoy at the café" : settings.location}</span>
              <small>
                {fulfillment === "dine_in" ? "Dine in" : fulfillment === "pickup" ? "Take away" : "Delivery"}
              </small>
              <ChevronRight size={18} />
            </button>
          </div>
        </header>
        <div className="order-mode segmented" role="group" aria-label="Order type">
          {settings.dineInEnabled && <button type="button" aria-pressed={fulfillment === "dine_in"} className={fulfillment === "dine_in" ? "active" : ""} onClick={() => setFulfillment("dine_in")}>Dine in</button>}
          {settings.pickupEnabled && <button type="button" aria-pressed={fulfillment === "pickup"} className={fulfillment === "pickup" ? "active" : ""} onClick={() => setFulfillment("pickup")}>Take away</button>}
          {settings.deliveryEnabled && <button type="button" aria-pressed={fulfillment === "delivery"} className={fulfillment === "delivery" ? "active" : ""} onClick={() => setFulfillment("delivery")}>Delivery</button>}
        </div>

        <main key={route} data-direction={pageDirection} className={"main page-enter route-" + route}>
          {error && (
            <div className="error" role="alert">
              <span>{error}</span>
              <button
                onClick={() => {
                  setError("");
                  load();
                }}
                aria-label="Retry"
              >
                <RefreshCw size={18} />
              </button>
              <button onClick={() => setError("")} aria-label="Dismiss error">
                <X size={18} />
              </button>
            </div>
          )}
          {!data ? (
            <div className="empty-state">
              <Coffee size={48} />
              <h2>
                {error
                  ? "The café is currently unavailable."
                  : "Brewing something good…"}
              </h2>
              <button className="primary" onClick={load}>
                Try again
              </button>
            </div>
          ) : (
            <>
              {route === "home" && (
                <>
                  <div className="home-content">
                    <PromotionBanners banners={settings.promotionBanners || []} onMenu={(term)=>{setSearch(term);setCategory("all");setDiet("all");setPriceRange("all");navigate("menu");}} onSubscriptions={()=>navigate("subscriptions")} />
                    <SubscriptionTracker userId={user?.userId} onOpen={() => navigate("subscriptions")} />
                    <button className="subscription-home-card" onClick={() => navigate("subscriptions")}>
                      <Coffee size={28} aria-hidden="true" />
                      <span><small>THE ESPRESSOULSTER COFFEE PASS</small><strong>8 coffees in one pass</strong><span>Explore subscriptions · ₹1,599</span></span>
                      <ChevronRight size={22} aria-hidden="true" />
                    </button>
                    {(settings.offers || []).some((o:any)=>o.enabled) && <section className="offers-section">
                      <div className="section-heading">
                        <h2>OFFERS &amp; LITTLE EXTRAS</h2>
                        <span>
                          {(settings.offers || []).filter((o: any) => o.enabled)
                            .length
                            ? "A little treat"
                            : "Made for your coffee break"}
                        </span>
                      </div>
                      <div className="offers-row">
                        {(settings.offers || [])
                          .filter((o: any) => o.enabled)
                          .map((o: any) => (
                            <button
                              key={o.code}
                              className="offer-card"
                              onClick={() => {
                                setCode(o.code);
                                navigate("cart");
                              }}
                            >
                              <strong>{o.title || "Café offer"}</strong>
                              <span>
                                CODE <b>{o.code}</b>
                              </span>
                              <small>
                                {o.expires
                                  ? "Valid until " + o.expires
                                  : "See offer at checkout"}
                              </small>
                            </button>
                          ))}
                      </div>
                    </section>}
                    <section>
                      <div className="section-heading">
                        <h2>CURATED FOR YOU</h2>
                        <button
                          onClick={() => {
                            setCategory("all");
                            navigate("menu");
                          }}
                        >
                          View menu <ChevronRight size={15} />
                        </button>
                      </div>
                      <div className="curated-grid">
                        {products
                          .filter(
                            (p: any) =>
                              p.featured &&
                              !p.archived &&
                              categories.some(
                                (c: any) => c.id === p.categoryId,
                              ),
                          )
                          .slice(0, 6)
                          .map((p: any) => card(p, true))}
                      </div>
                    </section>
                    <p className="catalog-note">
                      Menu images are illustrative. Prices and availability are
                      confirmed by the café.
                    </p>
                  </div>
                </>
              )}
              {route === "menu" && (
                <>
                  <div className="menu-toolbar">
                    <label className="search-field">
                      <Search size={19} />
                      <input
                        aria-label="Search menu"
                        placeholder="Search your next favourite"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                      {search && (
                        <button
                          onClick={() => setSearch("")}
                          aria-label="Clear search"
                        >
                          <X size={16} />
                        </button>
                      )}
                    </label>
                    <button
                      className={
                        "filter-button " + (showFilters ? "active" : "")
                      }
                      aria-label="Menu filters"
                      onClick={() => setShowFilters(!showFilters)}
                    >
                      <SlidersHorizontal size={19} />
                    </button>
                  </div>
                  {showFilters && (
                    <div className="filters">
                      <label>
                        Sort
                        <select
                          value={sort}
                          onChange={(e) => setSort(e.target.value)}
                        >
                          <option value="default">Featured first</option>
                          <option value="name">Name A–Z</option>
                          <option value="price-up">Price: low to high</option>
                          <option value="price-down">Price: high to low</option>
                        </select>
                      </label>
                      <label>Price range<select value={priceRange} onChange={e=>setPriceRange(e.target.value)}><option value="all">All prices</option><option value="under-250">Under ₹250</option><option value="250-500">₹250 to under ₹500</option><option value="500-plus">₹500 and above</option></select></label>
                      <label>
                        Dietary preference
                        <select
                          value={diet}
                          onChange={(e) => setDiet(e.target.value)}
                        >
                          <option value="all">All items</option>
                          {[
                            "Veg",
                            "Non-veg",
                            "Egg",
                            "Unknown",
                          ].map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}
                  <div className="menu-layout">
                    <aside className="category-rail">
                      <button
                        className={category === "all" ? "active" : ""}
                        onClick={() => selectMenuCategory("all")}
                      >
                        <BookOpen size={27} />
                        <span>All items</span>
                      </button>
                      {categories.map((c: any) => (
                        <button
                          key={c.id}
                          className={category === c.id ? "active" : ""}
                          onClick={() => selectMenuCategory(c.id)}
                        >
                          {c.image ? (
                            <img
                              src={c.image}
                              alt=""
                              style={{
                                width: 30,
                                height: 30,
                                objectFit: "cover",
                                borderRadius: 6,
                              }}
                            />
                          ) : (
                            <CategoryIcon id={c.id} />
                          )}
                          <span>{c.name}</span>
                        </button>
                      ))}
                    </aside>
                    <section className="menu-products" ref={menuProductsRef}>
                      <div className="menu-title">
                        <h2>
                          {category === "all"
                            ? "The café collection"
                            : categories.find((c: any) => c.id === category)
                                ?.name}
                        </h2>
                        <span>{filtered.length} items</span>
                      </div>
                      <div className="menu-grid">
                        {filtered
                          .slice(0, visibleCount)
                          .map((p: any) => card(p))}
                      </div>
                      {visibleCount < filtered.length && (
                        <button
                          className="secondary wide"
                          style={{ marginTop: 18 }}
                          onClick={() => setVisibleCount((c) => c + 24)}
                        >
                          Show more items
                        </button>
                      )}
                      {!filtered.length && (
                        <div className="empty-state">
                          <Search size={34} />
                          <h2>No matches just yet.</h2>
                          <p>Try another search or category.</p>
                          <button
                            className="secondary"
                            onClick={() => {
                              setSearch("");
                              setDiet("all");
                              setPriceRange("all");
                              setSort("default");
                              setCategory("all");
                            }}
                          >
                            Reset filters
                          </button>
                        </div>
                      )}
                      <p className="catalog-note">
                        Illustrative images · Items with pending prices cannot
                        be ordered.
                      </p>
                    </section>
                  </div>
                </>
              )}
              {route === "favorites" && (
                <div className="page-content">
                  <PageTitle
                    title="Your favourites"
                    onBack={() => navigate("profile")}
                  />
                  {!user ? (
                    loginPanel()
                  ) : favoriteIds.length ? (
                    <div className="curated-grid">
                      {products
                        .filter((p: any) => favoriteIds.includes(p.id))
                        .map((p: any) => card(p, true))}
                    </div>
                  ) : (
                    <Empty
                      icon={<Heart size={44} />}
                      title="Keep the good ones close."
                      text="Tap the heart on a menu item to save it."
                      action="Explore menu"
                      onAction={() => navigate("menu")}
                    />
                  )}
                </div>
              )}
              {route === "cart" && (
                <div className="page-content">
                  <PageTitle
                    title="Your cart"
                    onBack={() => navigate("menu")}
                  />
                  {!user ? (
                    loginPanel()
                  ) : !cart.length ? (
                    <Empty
                      icon={<ShoppingBag size={48} />}
                      title="A coffee break starts here."
                      text="Add something you love from the menu."
                      action="Explore menu"
                      onAction={() => navigate("menu")}
                    />
                  ) : (
                    <div className="checkout-grid">
                      <section className="cart-items">
                        {cart.map((i, index) => {
                          const p = products.find(
                            (p: any) => p.id === i.productId,
                          );
                          return (
                            <article className="cart-item" key={itemKey(i)}>
                              <ProductImage
                                product={p || { name: "Unavailable item" }}
                              />
                              <div>
                                <h3>{p?.name || "Unavailable item"}</h3>
                                <p>
                                  {
                                    p?.variants?.find(
                                      (v: any) => v.id === i.variantId,
                                    )?.name
                                  }
                                  {(p?.addons || [])
                                    .filter((a: any) =>
                                      i.addonIds.includes(a.id),
                                    )
                                    .map((a: any) => " · " + a.name)
                                    .join("")}
                                </p>
                                {i.instructions && (
                                  <small>{i.instructions}</small>
                                )}
                                <strong>
                                  {unit(i) === null
                                    ? "Price pending"
                                    : money(
                                        unit(i)! * i.quantity,
                                        settings.currency,
                                      )}
                                </strong>
                                <button
                                  className="text-button"
                                  onClick={() => {
                                    if (p) {
                                      openProduct(p);
                                      setSelection(i);
                                      setEditIndex(index);
                                    }
                                  }}
                                >
                                  Edit options
                                </button>
                              </div>
                              <div className="cart-actions">
                                <button
                                  className="icon-button"
                                  aria-label={"Remove " + p?.name}
                                  onClick={() =>
                                    setCart((old) =>
                                      old.filter((_, k) => k !== index),
                                    )
                                  }
                                >
                                  <Trash2 size={17} />
                                </button>
                                <div className="quantity">
                                  <button
                                    aria-label={"Decrease " + p?.name}
                                    onClick={() => changeQty(index, -1)}
                                  >
                                    <Minus size={15} />
                                  </button>
                                  <span>{i.quantity}</span>
                                  <button
                                    aria-label={"Increase " + p?.name}
                                    onClick={() => changeQty(index, 1)}
                                    disabled={!p?.available || p.price == null || cart.filter(item => item.productId === i.productId).reduce((sum, item) => sum + item.quantity, 0) >= Math.min(99, p.inventory ?? 99)}
                                  >
                                    <Plus size={15} />
                                  </button>
                                </div>
                              </div>
                            </article>
                          );
                        })}
                        <button
                          className="text-button"
                          onClick={() => navigate("menu")}
                        >
                          <Plus size={16} />
                          Add more items
                        </button>
                      </section>
                      <aside className="order-summary">
                        <h2>Your order</h2>
                        <label>
                          Offer code
                          <input
                            value={code}
                            onChange={(e) => {
                              setCode(e.target.value);
                              keyRef.current = "";
                            }}
                            placeholder="Enter a code"
                          />
                        </label>
                        {quote ? totals() : <p>Checking your order…</p>}
                        <button
                          className="primary wide"
                          disabled={!quote}
                          onClick={() => navigate("checkout")}
                        >
                          Continue to checkout
                        </button>
                        <p className="fine-print">
                          Choose Stripe sandbox at checkout to try an online test payment. No real money is collected.
                        </p>
                      </aside>
                    </div>
                  )}
                </div>
              )}
              {route === "checkout" && (
                <div className="page-content">
                  <PageTitle title="Checkout" onBack={() => navigate("cart")} />
                  {!user ? (
                    loginPanel()
                  ) : !cart.length ? (
                    <Empty
                      icon={<ShoppingBag size={44} />}
                      title="Your cart is empty"
                      text="Browse the menu to get started."
                      action="Explore menu"
                      onAction={() => navigate("menu")}
                    />
                  ) : (
                    <form className="checkout-grid" onSubmit={submitOrder}>
                      <section className="form-card">
                        <h2>How would you like it?</h2>
                        <div className="segmented">
                          {settings.dineInEnabled && (
                            <button type="button" className={fulfillment === "dine_in" ? "active" : ""} onClick={() => setFulfillment("dine_in")}>Dine in</button>
                          )}
                          {settings.pickupEnabled && (
                            <button
                              type="button"
                              className={
                                fulfillment === "pickup" ? "active" : ""
                              }
                              onClick={() => setFulfillment("pickup")}
                            >
                              Take away
                            </button>
                          )}
                          {settings.deliveryEnabled && (
                            <button
                              type="button"
                              className={
                                fulfillment === "delivery" ? "active" : ""
                              }
                              onClick={() => setFulfillment("delivery")}
                            >
                              Delivery
                            </button>
                          )}
                        </div>
                        <h3>Contact details</h3>
                        <label>
                          Your name
                          <input
                            required
                            maxLength={100}
                            autoComplete="name"
                            value={contact.name}
                            onChange={(e) =>
                              setContact({ ...contact, name: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          Phone number
                          <input
                            required
                            type="tel"
                            autoComplete="tel"
                            pattern="[+0-9 ()-]{7,25}"
                            value={contact.phone}
                            onChange={(e) =>
                              setContact({ ...contact, phone: e.target.value })
                            }
                          />
                        </label>
                        {user.email && !/@(?:tester|phone|pin)\.invalid$/.test(user.email) && (
                        <label>
                          Email
                          <input value={user.email} disabled type="email" />
                        </label>
                        )}
                        {fulfillment === "delivery" && (
                          <>
                            {addresses.length > 0 && (
                              <label>
                                Saved address
                                <select
                                  onChange={(e) =>
                                    setContact({
                                      ...contact,
                                      address: e.target.value,
                                    })
                                  }
                                >
                                  <option value="">Choose an address</option>
                                  {addresses.map((a) => (
                                    <option key={a.id} value={a.address}>
                                      {a.label} · {a.address}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            )}
                            <label>
                              Delivery address
                              <textarea
                                required
                                minLength={10}
                                maxLength={1000}
                                value={contact.address}
                                onChange={(e) =>
                                  setContact({
                                    ...contact,
                                    address: e.target.value,
                                  })
                                }
                              />
                            </label>
                          </>
                        )}
                        <label>
                          Order notes (optional)
                          <textarea
                            maxLength={500}
                            value={contact.notes}
                            onChange={(e) =>
                              setContact({ ...contact, notes: e.target.value })
                            }
                          />
                        </label>
                      </section>
                      <aside className="order-summary">
                        <h2>Order summary</h2>
                        {cart.map((i) => (
                          <p key={itemKey(i)}>
                            {i.quantity} ×{" "}
                            {
                              products.find((p: any) => p.id === i.productId)
                                ?.name
                            }
                          </p>
                        ))}
                        {totals()}
                        <fieldset className="sandbox-payment-options"><legend>Payment method</legend>
                          <label><input type="radio" name="paymentChoice" checked={!payOnline} onChange={()=>setPayOnline(false)}/><span><strong>Pay at the café</strong><small>{fulfillment==="dine_in"?"Pay at the counter":"Pay when you collect your order"}</small></span></label>
                          <label><input type="radio" name="paymentChoice" checked={payOnline} disabled={!onlineConfig.enabled} onChange={()=>setPayOnline(true)}/><span><strong>Stripe sandbox</strong><small>{onlineConfig.enabled?"Test cards only · no real money":"Sandbox setup is pending"}</small></span></label>
                          {onlineConfig.enabled&&<p>Stripe sandbox minimum: {money(onlineConfig.minimumAmount||50,settings.currency)}. Item prices stay unchanged.</p>}
                        </fieldset>
                        <button
                          className="primary wide"
                          disabled={busy || !quote || (payOnline && (!onlineConfig.enabled || quote.total < (onlineConfig.minimumAmount || 50)))}
                        >
                          {busy ? (payOnline?"Opening Stripe sandbox…":"Placing your order…") : payOnline?"Continue to Stripe sandbox":"Place order"}
                        </button>
                        <p className="fine-print">
                          Your order total and availability are checked by the
                          café’s server.
                        </p>
                      </aside>
                    </form>
                  )}
                </div>
              )}
              {route === "orders" && (
                <div className="page-content">
                  <PageTitle
                    title="My orders"
                    onBack={() => navigate("profile")}
                    extra={
                      <button
                        className="icon-button"
                        aria-label="Refresh orders"
                        onClick={() =>
                          api("orders")
                            .then((b) => {
                              setOrders(b.orders);
                              setMoreOrders(b.orders.length === 50);
                            })
                            .catch((e) => setError(e.message))
                        }
                      >
                        <RefreshCw size={19} />
                      </button>
                    }
                  />
                  {confirmation && (
                    <div className="success-message">
                      <CheckCircle2 />
                      <div>
                        <strong>Order {confirmation} received</strong>
                        <p>
                          Your order is received. Payment and preparation progress are shown below.
                        </p>
                      </div>
                    </div>
                  )}
                  {!user ? (
                    loginPanel()
                  ) : orders.length ? (
                    <div className="orders-list">
                      {orders.map((o) => (
                        <article key={o.id} className="order-card">
                          <div className="order-top">
                            <div>
                              <strong>{o.id}</strong>
                              <small>
                                {new Date(o.created_at + "Z").toLocaleString()}
                              </small>
                            </div>
                            <span className={"status " + o.status}>
                              {o.status.replaceAll("_", " ")}
                            </span>
                          </div>
                          <div className="order-progress">
                            {(o.fulfillment !== "delivery"
                              ? [
                                  "pending",
                                  "confirmed",
                                  "preparing",
                                  "ready",
                                  "completed",
                                ]
                              : [
                                  "pending",
                                  "confirmed",
                                  "preparing",
                                  "out_for_delivery",
                                  "completed",
                                ]
                            ).map((s, i) => (
                              <div
                                className={
                                  o.events.some((e: any) => e.status === s)
                                    ? "done"
                                    : ""
                                }
                                key={s}
                              >
                                <span>
                                  {o.events.some((e: any) => e.status === s) ? (
                                    <Check size={13} />
                                  ) : (
                                    i + 1
                                  )}
                                </span>
                                <small>{s.replaceAll("_", " ")}</small>
                              </div>
                            ))}
                          </div>
                          {o.items.map((i: any) => (
                            <p key={i.id}>
                              {i.quantity} × {i.name}
                              <span>
                                {money(i.unit_price * i.quantity, o.currency)}
                              </span>
                            </p>
                          ))}
                          <div className="order-total">
                            <strong>{money(o.total, o.currency)}</strong>
                            <span>
                              {o.fulfillment === "dine_in" ? "Dine in" : o.fulfillment === "pickup" ? "Take away" : "Delivery"} · {o.payment_status === "paid" ? (o.collection_method === "stripe_test" ? "Stripe test payment verified" : "Paid") : o.status === "cancelled" ? "Not paid · cancelled" : "Payment pending"}
                            </span>
                          </div>
                          <OnlinePayment order={o} onUpdate={() => { api("orders").then(b=>setOrders(b.orders)).catch(e=>setError(e.message)); }} />
                          <details>
                            <summary>Order details & timeline</summary>
                            <p>
                              {o.contact.name} · {o.contact.phone}
                            </p>
                            {o.contact.address && <p>{o.contact.address}</p>}
                            {o.events.map((e: any, i: number) => (
                              <small className="timeline-event" key={i}>
                                {e.status.replaceAll("_", " ")} ·{" "}
                                {new Date(e.created_at + "Z").toLocaleString()}
                              </small>
                            ))}
                          </details>
                          {o.status === "pending" &&
                            o.payment_status === "unpaid" &&
                            settings.cancelPending && (
                              <button
                                className="text-button danger"
                                onClick={async () => {
                                  try {
                                    await api("orders/" + o.id, "PATCH", {
                                      status: "cancelled",
                                    });
                                    setOrders((await api("orders")).orders);
                                    notify("Order cancelled");
                                  } catch (e: any) {
                                    setError(e.message);
                                  }
                                }}
                              >
                                Cancel order
                              </button>
                            )}
                        </article>
                      ))}
                      {moreOrders && (
                        <button
                          className="secondary"
                          onClick={async () => {
                            try {
                              const b = await api(
                                "orders?offset=" + orders.length,
                              );
                              setOrders((old) => [...old, ...b.orders]);
                              setMoreOrders(b.orders.length === 50);
                            } catch (e: any) {
                              setError(e.message);
                            }
                          }}
                        >
                          Load older orders
                        </button>
                      )}
                    </div>
                  ) : (
                    <Empty
                      icon={<Package size={44} />}
                      title="Explore the menu"
                      text="Your orders and their progress will appear here."
                      action="Explore menu"
                      onAction={() => navigate("menu")}
                    />
                  )}
                </div>
              )}
              {route === "profile" && (
                <div className="profile-page">
                  <section className="profile-hero">
                    <button type="button" className="avatar profile-avatar" aria-label="Change profile photo" disabled={!user || busy} onClick={()=>profilePhotoInput.current?.click()}>
                      {(profilePhoto ?? user?.profile?.avatar) ? <img src={profilePhoto ?? user?.profile?.avatar} alt="Your profile photo" /> : <UserRound size={34} />}
                      {user && <span className="avatar-edit"><Plus size={13}/></span>}
                    </button>
                    {user && <button type="button" className="profile-edit-button" onClick={()=>{profileDetailsRef.current?.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth",block:"start"});profileDetailsRef.current?.querySelector<HTMLInputElement>('input[name="profileName"]')?.focus({preventScroll:true});}}>Edit profile</button>}
                    <h1>
                      {user?.profile?.name || user?.fullName || "Coffee lover"}
                    </h1>
                    <p>{user?.email && !/@(?:tester|phone|pin)\.invalid$/.test(user.email) ? user.email : "Manage your profile"}</p>
                  </section>
                  <MobileInstall />
                  {!user ? (
                    loginPanel()
                  ) : (
                    <div className="profile-content">
                      <div className="profile-stats">
                        <button onClick={() => navigate("orders")}>
                          <Package size={19} />
                          <strong>{orders.length}</strong>
                          <span>Orders</span>
                        </button>
                        <button onClick={() => navigate("favorites")}>
                          <Heart size={19} />
                          <strong>{favoriteIds.length}</strong>
                          <span>Favourites</span>
                        </button>
                        <button onClick={() => navigate("cart")}>
                          <ShoppingBag size={19} />
                          <strong>{qty}</strong>
                          <span>In your cart</span>
                        </button>
                      </div>
                      <div className="profile-links">
                        {[
                          { icon: Package, name: "My orders", r: "orders" },
                          { icon: Coffee, name: "Coffee subscriptions", r: "subscriptions" },
                          {
                            icon: Heart,
                            name: "My favourites",
                            r: "favorites",
                          },
                          {
                            icon: MapPin,
                            name: "Saved addresses",
                            r: "addresses",
                          },
                          {
                            icon: Lightbulb,
                            name: "Suggest something delicious",
                            r: "suggest",
                          },
                        ].map((l) => (
                          <button key={l.r} onClick={() => navigate(l.r)}>
                            <l.icon size={20} />
                            <span>{l.name}</span>
                            <ChevronRight size={19} />
                          </button>
                        ))}
                        <button
                          onClick={() =>
                            setInfo(
                              [
                                settings.contact ||
                                  "Contact details have not been added yet.",
                                settings.address,
                                settings.openingHours,
                              ]
                                .filter(Boolean)
                                .join("\n"),
                            )
                          }
                        >
                          <Phone size={20} />
                          <span>Contact the café</span>
                          <ChevronRight size={19} />
                        </button>
                        {user.admin && (
                          <a href="/admin">
                            <Settings size={20} />
                            <span>Administrator dashboard</span>
                            <ChevronRight size={19} />
                          </a>
                        )}
                      </div>
                      <form
                        className="form-card profile-details-form"
                        ref={profileDetailsRef}
                        onSubmit={async (e) => {
                          e.preventDefault();
                          setBusy(true);
                          try {
                            await api("profile", "PUT", {...contact, ...(profilePhoto !== null ? {avatar: profilePhoto} : {})});
                            setProfilePhoto(null);
                            await load();
                            notify("Profile saved");
                          } catch (e: any) {
                            setError(e.message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        <h2>Edit your profile</h2>
                        <div className="profile-photo-controls">
                          <label>Display picture
                            <input ref={profilePhotoInput} type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={async event=>{const file=event.target.files?.[0];if(!file)return;if(file.size>5000000){setError("Choose an image smaller than 5 MB.");return;}setBusy(true);try{const form=new FormData();form.set("file",file);const result=await api("upload","POST",form);setProfilePhoto(result.url);notify("Photo ready. Save your profile to apply it.");}catch(error){setError((error as Error).message);}finally{setBusy(false);event.target.value="";}}}/>
                          </label>
                          {(profilePhoto ?? user.profile?.avatar) && <button type="button" className="text-button" disabled={busy} onClick={()=>setProfilePhoto("")}>Remove photo</button>}
                          <small>PNG, JPEG or WebP · up to 5 MB</small>
                        </div>
                        <label>
                          Name
                          <input
                            name="profileName"
                            required
                            maxLength={100}
                            value={contact.name}
                            onChange={(e) =>
                              setContact({ ...contact, name: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          Phone
                          <input
                            type="tel"
                            maxLength={25}
                            value={contact.phone}
                            onChange={(e) =>
                              setContact({ ...contact, phone: e.target.value })
                            }
                          />
                        </label>
                        <button className="secondary" disabled={busy}>
                          Save profile
                        </button>
                      </form>
                      <button type="button" className="signout" disabled={signingOut} onClick={async()=>{setSigningOut(true);try{const destination=await signOutSession(api,user?.authProvider);sessionStorage.removeItem("espresso_guest");if(user?.authProvider==="pin"){window.dispatchEvent(new Event("espresso-pin-signedout"))}else window.location.assign(destination)}catch(e){setError((e as Error).message);setSigningOut(false)}}}><LogOut size={18}/>{signingOut ? "Signing out…" : "Sign out"}</button>
                    </div>
                  )}
                </div>
              )}
              {route === "addresses" && (
                <div className="page-content narrow">
                  <PageTitle
                    title="Saved addresses"
                    onBack={() => navigate("profile")}
                  />
                  {!user ? (
                    loginPanel()
                  ) : (
                    <>
                      {addresses.map((a) => (
                        <article className="address-card" key={a.id}>
                          <MapPin size={22} />
                          <div>
                            <strong>{a.label}</strong>
                            <p>{a.address}</p>
                          </div>
                          <button
                            className="icon-button"
                            aria-label={"Remove " + a.label}
                            onClick={async () => {
                              try {
                                await api("addresses/" + a.id, "DELETE");
                                setAddresses((old) =>
                                  old.filter((i) => i.id !== a.id),
                                );
                              } catch (e: any) {
                                setError(e.message);
                              }
                            }}
                          >
                            <Trash2 size={18} />
                          </button>
                        </article>
                      ))}
                      <form
                        className="form-card"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          const f = e.currentTarget,
                            b = new FormData(f);
                          setBusy(true);
                          try {
                            const a = await api("addresses", "POST", {
                              label: b.get("label"),
                              address: b.get("address"),
                            });
                            setAddresses((old) => [...old, a]);
                            f.reset();
                            notify("Address saved");
                          } catch (e: any) {
                            setError(e.message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        <h2>Add an address</h2>
                        <label>
                          Label
                          <input
                            name="label"
                            placeholder="Home, work…"
                            required
                            maxLength={50}
                          />
                        </label>
                        <label>
                          Full address
                          <textarea name="address" required maxLength={1000} />
                        </label>
                        <button className="primary" disabled={busy}>
                          Save address
                        </button>
                      </form>
                    </>
                  )}
                </div>
              )}
              {route === "suggest" && (
                <div className="page-content narrow">
                  <PageTitle
                    title="Your ideas, on the menu"
                    onBack={() => navigate("profile")}
                  />
                  {!user ? (
                    loginPanel()
                  ) : (
                    <>
                      <form
                        className="form-card"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          setBusy(true);
                          try {
                            await api("suggestions", "POST", suggestion);
                            setSuggestions(
                              (await api("suggestions")).suggestions,
                            );
                            setSuggestion({
                              name: "",
                              category: "",
                              description: "",
                              notes: "",
                              image: "",
                            });
                            notify("Suggestion sent for café review");
                          } catch (e: any) {
                            setError(e.message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        <p>
                          Have something delicious in mind? Send it to the café
                          team for review.
                        </p>
                        <label>
                          Product name
                          <input
                            required
                            maxLength={150}
                            value={suggestion.name}
                            onChange={(e) =>
                              setSuggestion({
                                ...suggestion,
                                name: e.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          Category
                          <input
                            maxLength={100}
                            value={suggestion.category}
                            onChange={(e) =>
                              setSuggestion({
                                ...suggestion,
                                category: e.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          Description
                          <textarea
                            maxLength={2000}
                            value={suggestion.description}
                            onChange={(e) =>
                              setSuggestion({
                                ...suggestion,
                                description: e.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          Additional notes
                          <textarea
                            maxLength={1000}
                            value={suggestion.notes}
                            onChange={(e) =>
                              setSuggestion({
                                ...suggestion,
                                notes: e.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          Reference image (optional)
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              try {
                                const f = new FormData();
                                f.set("file", file);
                                const b = await api("upload", "POST", f);
                                setSuggestion({ ...suggestion, image: b.url });
                                notify("Reference image uploaded");
                              } catch (e: any) {
                                setError(e.message);
                              }
                            }}
                          />
                        </label>
                        <button className="primary" disabled={busy}>
                          {busy ? "Sending…" : "Send suggestion"}
                        </button>
                        <small>
                          Suggestions stay private until reviewed. Approval
                          creates a draft for the café team.
                        </small>
                      </form>
                      {suggestions.map((s) => (
                        <article className="address-card" key={s.id}>
                          <Lightbulb size={22} />
                          <div>
                            <strong>{s.name}</strong>
                            <p>{s.description}</p>
                            <span className="status">{s.status}</span>
                          </div>
                        </article>
                      ))}
                    </>
                  )}
                </div>
              )}
              {(route === "subscriptions" || route === "packs") && (
                <div className="page-content narrow">
                  <PageTitle title="Coffee subscriptions" />
                  <CoffeeSubscriptions onMenu={() => navigate("menu")} />
                </div>
              )}
              {route === "pay" && (
                <div className="page-content narrow">
                  <PageTitle title="Pay in store" />
                  <UpiScanner/>
                </div>
              )}
            </>
          )}
        </main>
        {!["cart", "checkout"].includes(route) && (
          <MovableCart ref={floatingCartRef} onOpen={() => navigate("cart")} label={`Open cart, ${qty} ${qty === 1 ? "item" : "items"}`}>
            <ShoppingCart key={cartArrival} className={cartArrival ? "cart-arrival" : ""} size={25} />
            {qty > 0 && <span className="cart-count" aria-live="polite">{qty}</span>}
          </MovableCart>
        )}
        <nav className="bottom-nav" aria-label="Main navigation">
          {[
            { r: "home", name: "Home", icon: House },
            { r: "menu", name: "Menu", icon: BookOpen },
            { r: "pay", name: "Pay in Store", icon: ScanLine },
            { r: "subscriptions", name: "Subscriptions", icon: ShoppingBag },
            { r: "profile", name: "Profile", icon: UserRound },
          ].map((n) => (
            <button
              key={n.r}
              className={
                (route === n.r ? "active " : "") +
                (n.r === "pay" ? "pay-nav" : "")
              }
              onClick={() => navigate(n.r)}
              aria-current={route === n.r ? "page" : undefined}
            >
              <span className="nav-icon">
                <n.icon size={23} strokeWidth={route === n.r ? 2.4 : 1.6} />
              </span>
              <span>{n.name}</span>
            </button>
          ))}
        </nav>
      </div>
      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <section
            className={"product-modal " + (!selected.available || selected.inventory === 0 ? "product-out-of-stock" : "")}
            role="dialog"
            aria-modal="true"
            aria-label={selected.name}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              autoFocus
              aria-label="Close product details"
              onClick={() => setSelected(null)}
            >
              <X size={23} />
            </button>
            <ProductImage product={selected} className="detail-image" />
            <div className="modal-content">
              {(!selected.available || selected.inventory === 0) && <span className="stock-unavailable"><HeartCrack size={16} aria-hidden="true" /> Out of stock</span>}
              <span className="eyebrow">
                {
                  categories.find((c: any) => c.id === selected.categoryId)
                    ?.name
                }
              </span>
              <h2>{selected.name}</h2>
              <p>
                {selected.description ||
                  "Ask the café team for ingredients and product details."}
              </p>
              <section className="item-nutrition" aria-label="Nutrition information">
                <h3>Nutrition <span>per serving</span></h3>
                {selected.nutrition?.status === "estimated" ? (
                  <>
                    <dl>
                      {([['fat', 'Fat'], ['fibre', 'Fibre'], ['sugar', 'Total sugar'], ['protein', 'Protein']] as const).map(([key, label]) => (
                        <div key={key}><dt>{label}</dt><dd>~{selected.nutrition.grams[key].toFixed(1)}<small> g</small></dd></div>
                      ))}
                    </dl>
                    <p className="nutrition-note">Estimated for the recipe serving, before customisations. Brands and preparation may vary.</p>
                    <a href="https://fdc.nal.usda.gov/download-datasets/" target="_blank" rel="noreferrer">Ingredient data: USDA FoodData Central</a>
                  </>
                ) : (
                  <p className="nutrition-note">Fat, fibre, total sugar and protein: not available yet. Recipe quantities or ingredient nutrition need confirmation.</p>
                )}
              </section>
              {selected.ingredients?.length > 0 && (
                <section className="item-ingredients" aria-label="Ingredients">
                  <h3>Ingredients</h3>
                  <ul>
                    {selected.ingredients.map((ingredient: string) => (
                      <li key={ingredient}>{ingredient}</li>
                    ))}
                  </ul>
                </section>
              )}
              {selected.dietary?.length > 0 && (
                <div className="dietary-tags">
                  {selected.dietary.map((d: string) => (
                    <span key={d}>{d}</span>
                  ))}
                </div>
              )}
              {selected.variants?.length > 0 && (
                <fieldset>
                  <legend>Choose a variant</legend>
                  {selected.variants.map((v: any) => (
                    <label className="option-row" key={v.id}>
                      <input
                        type="radio"
                        name="variant"
                        checked={selection.variantId === v.id}
                        onChange={() =>
                          setSelection({ ...selection, variantId: v.id })
                        }
                      />
                      {v.name}
                      <span>+{money(v.price, settings.currency)}</span>
                    </label>
                  ))}
                </fieldset>
              )}
              {selected.addons?.length > 0 && (
                <fieldset>
                  <legend>Make it yours</legend>
                  {selected.addons.map((a: any) => (
                    <label className="option-row" key={a.id}>
                      <input
                        type="checkbox"
                        checked={selection.addonIds.includes(a.id)}
                        onChange={(e) =>
                          setSelection({
                            ...selection,
                            addonIds: e.target.checked
                              ? [...selection.addonIds, a.id]
                              : selection.addonIds.filter((i) => i !== a.id),
                          })
                        }
                      />
                      {a.name}
                      <span>+{money(a.price, settings.currency)}</span>
                    </label>
                  ))}
                </fieldset>
              )}
              <label>
                Special instructions
                <textarea
                  maxLength={300}
                  value={selection.instructions}
                  onChange={(e) =>
                    setSelection({ ...selection, instructions: e.target.value })
                  }
                  placeholder="Anything the café should know?"
                />
              </label>
              <div className="detail-bottom">
                <div className="quantity">
                  <button
                    aria-label="Decrease quantity"
                    disabled={selection.quantity <= 1}
                    onClick={() =>
                      setSelection({
                        ...selection,
                        quantity: selection.quantity - 1,
                      })
                    }
                  >
                    <Minus size={17} />
                  </button>
                  <span>{selection.quantity}</span>
                  <button
                    aria-label="Increase quantity"
                    disabled={selection.quantity >= 99}
                    onClick={() =>
                      setSelection({
                        ...selection,
                        quantity: selection.quantity + 1,
                      })
                    }
                  >
                    <Plus size={17} />
                  </button>
                </div>
                <button
                  className="primary"
                  disabled={
                    selected.price === null ||
                    !selected.available ||
                    selected.inventory === 0
                  }
                  onClick={(event) => add(selection, event.currentTarget)}
                >
                  {selected.price === null
                    ? "Awaiting café pricing"
                    : !selected.available || selected.inventory === 0
                      ? "Out of stock"
                      : `Add · ${money((unit(selection) || 0) * selection.quantity, settings.currency)}`}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
      {info && (
        <div className="modal-backdrop" onClick={() => setInfo("")}>
          <section
            className="info-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Café information"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              autoFocus
              onClick={() => setInfo("")}
              aria-label="Close"
            >
              <X size={22} />
            </button>
            <Coffee size={35} />
            <h2>{settings.brand}</h2>
            <p>{info}</p>
            {!user && (
              <a
                className="primary"
                target="_self"
          onClick={(event) => {
            if (process.env.NODE_ENV === "development") {
              event.preventDefault();
              window.location.assign(event.currentTarget.href);
            }
          }}
                href={
                  "/tester-login?return_to=" +
                  encodeURIComponent("/#" + route)
                }
              >
                Start testing
              </a>
            )}
          </section>
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          {notice}
        </div>
      )}
      {splash && (
        <div className="splash" role="status" aria-label="Welcome to Espressoulster Coffee">
          <div className="launch-intro"><h2>Espressoulster<span>COFFEE</span></h2><p>Order your favourites.<em>Freshly prepared.</em></p><div className="intro-line" /></div>
          <div className="launch-scene">
            <img src="/images/launch-coffee.webp" alt="Fresh coffee and pastries in the sunlight" />
            <div className="launch-brand"><h2>Espressoulster<span>COFFEE</span></h2><p>Order your favourites.<em>Freshly prepared.</em></p></div>
            <div className="launch-caption">
              <div className="launch-food" aria-label="Preparing your café experience">
                <div className="food-icon-cycle" aria-hidden="true">
                  <Coffee className="food-icon food-coffee" strokeWidth={1.5} />
                  <Croissant className="food-icon food-pastry" strokeWidth={1.5} />
                  <Sandwich className="food-icon food-sandwich" strokeWidth={1.5} />
                  <Cookie className="food-icon food-cookie" strokeWidth={1.5} />
                  <span className="food-baseline" />
                </div>
                <span className="orbit-copy">Loading your menu</span>
                <small>ESPRESSOULSTER COFFEE</small>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
function PageTitle({
  title,
  onBack,
  extra,
}: {
  title: string;
  onBack?: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="page-title">
      {onBack && (
        <button className="icon-button" onClick={onBack} aria-label="Go back">
          <ChevronLeft size={24} />
        </button>
      )}
      <h1>{title}</h1>
      {extra}
    </div>
  );
}
function Empty({
  icon,
  title,
  text,
  action,
  onAction,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="empty-state">
      {icon}
      <h2>{title}</h2>
      <p>{text}</p>
      <button className="primary" onClick={onAction}>
        {action}
      </button>
    </div>
  );
}
