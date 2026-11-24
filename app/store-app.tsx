"use client";
import {isSandboxProvider, isSandboxPayment, hostedCheckoutUrl, hostedPaymentMethod, sandboxLabel} from '../lib/sandbox-checkout';
import {disableOrderNotifications} from '../lib/enable-order-notifications';
import HomeLiveOrders from './home-live-orders';
import { activeCafeOrders, liveOrderLabel } from '../lib/live-order-status';
import HomeGreeting from './home-greeting';
import OrderTypeSelector from './order-type-selector';
import {enabledOrderTypes, orderTypeStorageKey, resolveOrderType} from '../lib/order-type';
import ProfileGenderField from './profile-gender-field';
import OrderStatusScreen from './order-status-screen';
import { bottomNavOutline } from "../lib/bottom-nav-glass";
import OrderChat from './order-chat';
import {onLiveUpdate, useLiveUpdates} from './use-live-updates';
import OrderDetailsSheet from './order-details-sheet';
import CoffeeShowcase from './coffee-showcase';
import {rememberPinPhone} from '../lib/remembered-pin-phone';
import MenuRecipeDetails from './menu-recipe-details';
import AppPermissionSetup from './app-permission-setup';
import AddressForm from './address-form';
import BookingNotifications from './booking-notifications';
import TableBooking from './table-booking';
import CustomerAvatar from './customer-avatar';
import {MobileMotion} from './coffee-motion';
import BottomNavRefreshWave from "./bottom-nav-refresh-wave";
import { HomePullRefresh } from './home-pull-refresh';
import {PersonalHome,Pairings,OrderAlerts} from './mobile-experience';
import {prepareReorder,mergeOrderUpdates,cartItemKey} from '../lib/mobile-experience';
import {defaultHomeDesign,defaultHomeDesignRevision,type HomeDesign} from '../lib/home-design';
import CoffeeClub,{ClubShortcuts} from './coffee-club';
import TableQrScanner from './table-qr-scanner';
import {unlockCelebrationAudio,celebrationSound} from '../lib/celebration-audio';
import MovableCart from "./movable-cart";
import PromotionBanners from "./promotion-banners";
import HomeAdvertisement from "./launch-advertisement";
import type { AdvertisementDestination } from "../lib/launch-advertisement";
import FavouriteCelebration from "./favourite-celebration";
import CategoryIcon from "./category-icon";
import {filterMenu} from "../lib/menu-filters";

import { useState, useEffect, useCallback, useRef, useLayoutEffect, useMemo, Fragment } from "react";
import {
  Coffee,
  CalendarDays,
  Pencil,
  Gift,
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
  CirclePause,
  LockKeyhole,
} from "lucide-react";
import {singleFlight} from '../lib/customer-flow';
import {publicMessage} from '../lib/public-message';
import { signOutSession } from "../lib/sign-out";
import { useDialogAccessibility } from "../lib/dialog";
import CoffeeSubscriptions from "./coffee-subscriptions";
import {paymentRequest} from "../lib/payment-request";
import { defaultSettings } from "../lib/catalog";
import CafeDetails, { cafeOutletLabel } from "./cafe-details";
import SearchField from "./search-field";
import { isKoramangala } from "../lib/cafe-routing";
import { cafeOffDutyMessage } from "../lib/cafe-order-intake";
import { orderReference } from "../lib/order-reference";
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
  signal?: AbortSignal,
): Promise<any> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", cancel, {once:true});
  const upload = method === "POST" && (path === "upload" || path === "admin/upload");
  const timer = setTimeout(cancel, upload ? 120000 : 15000);
  try {
    const binaryBody = data instanceof FormData || (typeof Blob !== "undefined" && data instanceof Blob);
    let body = data === undefined ? undefined : binaryBody ? data : JSON.stringify(data);
    if (upload && typeof Blob !== "undefined" && data instanceof Blob) {
      if (!data.size || data.size > 5000000) throw new Error("Choose an image up to 5 MB.");
      let bytes;
      try { bytes = new Uint8Array(await data.arrayBuffer()); }
      catch { throw new Error("This image could not be opened. Choose the image again."); }
      // Android pickers can return a file without a MIME type or a temporary URI.
      // Read it once while access is available. The server also validates the bytes.
      const imageType = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71
        ? "image/png" : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        ? "image/jpeg" : String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
          String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP" ? "image/webp" : "";
      if (!imageType) throw new Error("Choose a PNG, JPG or WebP image.");
      body = new Blob([bytes], {type:imageType});
    }
    const options: RequestInit = {
      method,
      signal: controller.signal,
      headers: binaryBody ? undefined : { "Content-Type": "application/json" },
      body,
    };
    const safeRead = method === "GET" && [
      "bootstrap", "admin/advertisement", "admin/subscription-advertisements",
    ].includes(path);
    for (let attempt = 0; ; attempt++) {
      let response: Response;
      let result: any;
      try {
        response = await fetch("/api/" + path, options);
        if (response.headers.get("Content-Type")?.includes("application/json")) {
          result = await response.json();
        } else {
          throw new Error(response.status === 413 ? "This file is too large to upload." : "The café is temporarily unavailable. Please try again.");
        }
      } catch (error) {
        if (controller.signal.aborted) throw error;
        const kind = (error as Error)?.name;
        if (kind === "SyntaxError") throw new Error("The café sent an incomplete response. Please try again.");
        if (kind !== "TypeError" && kind !== "NetworkError") throw error;
        if (safeRead && attempt === 0 && (typeof navigator === "undefined" || navigator.onLine !== false)) continue;
        if (upload) throw new Error("The image upload could not be confirmed. Check your connection and choose the image again.");
        if (method === "GET") throw new Error("Couldn’t load this page. Check your connection and try again.");
        throw new Error("The connection was interrupted. Check whether your change was saved before trying again.");
      }
      if (!response.ok) throw new Error(publicMessage(result?.error, "Something went wrong. Please try again."));
      return result;
    }
  } catch (error) {
    if (signal?.aborted) {const cancelled=new Error("Request cancelled");cancelled.name="AbortError";throw cancelled;}
    if (controller.signal.aborted) throw new Error(upload ? "The image upload timed out. Check your connection and choose the image again." : "The request timed out. Check your connection and try again.");
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
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
const itemKey = cartItemKey;
const bottomTabs = [
  { r: "home", name: "Home", icon: House },
  { r: "menu", name: "Menu", icon: BookOpen },
  { r: "pay", name: "Scan to order", icon: ScanLine },
  { r: "subscriptions", name: "Subscriptions", icon: ShoppingBag },
  { r: "profile", name: "Profile", icon: UserRound },
];
const customerPages = new Set([
  'home', 'menu', 'pay', 'packs', 'subscriptions', 'profile', 'cart', 'checkout', 'orders',
  'favorites', 'suggest', 'addresses', 'offers', 'cafes', 'referrals', 'birthday', 'rewards', 'bookings',
]);
export default function StoreApp({ previewDesign, requestBootstrap }: {
  previewDesign?: HomeDesign;
  requestBootstrap?: () => Promise<any>;
} = {}) {
  const previewingHome = previewDesign !== undefined;
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const profilePhotoInput = useRef<HTMLInputElement>(null);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [profileGender, setProfileGender] = useState('');
  const profileBusyRef = useRef(false);
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
    [selected, setSelected] = useState<any>(null),
    [editIndex, setEditIndex] = useState(-1),
    [selection, setSelection] = useState<Item>(initialItem("")),
    [orders, setOrders] = useState<any[]>([]),
    [trackingOrderId, setTrackingOrderId] = useState<string|null>(null),
    [moreOrders, setMoreOrders] = useState(false),
    [addresses, setAddresses] = useState<any[]>([]),
    [suggestions, setSuggestions] = useState<any[]>([]),
    [quote, setQuote] = useState<any>(null),
    [code, setCode] = useState(""),
    [fulfillment, setFulfillment] = useState("pickup"),
    [confirmation, setConfirmation] = useState(""),

    [info, setInfo] = useState<string | { kind: "cafe-contact" }>("");
  const [onlineConfig,setOnlineConfig]=useState<any>({enabled:false});
  const [payOnline,setPayOnline]=useState(false);
  const [acceptingOrders, setAcceptingOrders] = useState(true);
  const [dineInTable, setDineInTable] = useState("");
  const [openedFromTableQr, setOpenedFromTableQr] = useState(false);
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
  const accountOwner = useRef<string|null>(null);
  const favoriteRequests = useRef(new Set<string>());
  const cartOwner = useRef("");
  const favoritesOwner = useRef("");
  const initialLoad = useRef<Promise<boolean>|null>(null);
  const bootstrapRequest = useRef<(()=>Promise<any>)|null>(null);
  if(!bootstrapRequest.current)bootstrapRequest.current=singleFlight(requestBootstrap ?? (()=>api("bootstrap")));
  function flushCart(items?: Item[]): Promise<void> {
    if (cartSaveTimer.current) clearTimeout(cartSaveTimer.current);
    if (items) pendingCart.current = items;
    if (!cartSerial.current) {
      cartSerial.current = Promise.resolve().then(async () => {
        while (pendingCart.current) {
          const owner = accountOwner.current;
        const next = pendingCart.current;
          pendingCart.current = null;
          const signature = JSON.stringify(next);
          if (signature === savedCart.current) continue;
          try {
            await api("cart", "PUT", {items: next});
            if(accountOwner.current===owner)savedCart.current = signature;
          } catch (error) {
            // Keep the latest unsaved state for an explicit checkout retry.
            if(accountOwner.current!==owner)continue;
          if (!pendingCart.current) pendingCart.current = next;
            throw error;
          }
        }
      }).finally(() => { cartSerial.current = null; });
    }
    return cartSerial.current;
  }
  const settings = data?.settings || defaultSettings, user = data?.user;
  useLiveUpdates("customer", !previewingHome && Boolean(user?.userId));
  const products = data?.products || [];
  const categories = useMemo(() => {
    const stockedCategoryIds = new Set(data?.products?.filter((p: any) => !p.archived).map((p: any) => p.categoryId));
    return data?.categories?.filter((c: any) => c.enabled && stockedCategoryIds.has(c.id)) || [];
  }, [data?.categories, data?.products]);
  const showcaseProducts = useMemo(() => {
    const visibleCategoryIds = new Set(categories.map((category: any) => category.id));
    return products.filter((product: any) => visibleCategoryIds.has(product.categoryId));
  }, [categories, products]);
  const headerLogo = settings.logo || (route === "home" ? "/icon-192.png" : null);
  const homeDesign: HomeDesign = previewDesign ?? data?.homeDesign ?? defaultHomeDesign;
  const homeCopy = homeDesign.copy;
  const homeShowsBookings = homeDesign.sections.some(section => section.id === "bookings" && section.visible);
  const homeDataReady = Boolean(data);
  const homeRevision = useRef(defaultHomeDesignRevision);
  const seenOpeningAds = useRef(new Set<string>());
  const openingAdViewer = user?.userId || "guest";
  const openingAdKey = `${openingAdViewer}:${data?.homeAdvertisement?.id ?? ""}`;
  const watchesOrderIntake = !previewingHome && (route === "home" || (route === "checkout" && Boolean(user)));
  useEffect(() => {
    if (!watchesOrderIntake) return;
    const controller = new AbortController();
    let checking = false;
    async function checkOrderIntake() {
      if (checking || document.visibilityState === "hidden") return;
      checking = true;
      try {
        const path = route === "home" ? "cafe/order-intake?homeDesignRevision=" + encodeURIComponent(homeRevision.current) : "cafe/order-intake";
        const result = await api(path, "GET", undefined, controller.signal);
        if (!controller.signal.aborted && typeof result.acceptingOrders === "boolean") {
          setAcceptingOrders(result.acceptingOrders);
          if (result.homeDesign && typeof result.homeDesignRevision === "string" && homeDataReady) {
            homeRevision.current = result.homeDesignRevision;
            setData((previous: any) => previous ? { ...previous, homeDesign: result.homeDesign } : previous);
          }
        }
      } catch {
        // Keep the last known state. The order request also verifies availability.
      } finally {
        checking = false;
      }
    }
    void checkOrderIntake();
    const timer = window.setInterval(checkOrderIntake, 4000);
    const stopLiveUpdates = onLiveUpdate(["intake"], () => void checkOrderIntake());
    document.addEventListener("visibilitychange", checkOrderIntake);
    return () => {
      controller.abort();
      stopLiveUpdates();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", checkOrderIntake);
    };
  }, [watchesOrderIntake, route, homeDataReady]);
  const dineInTables: string[] = data?.dineInTables || [];
  const validTable = dineInTables.includes(dineInTable);
  const checkoutTable = fulfillment === "dine_in" && validTable ? dineInTable : undefined;
  const liveCheckout = onlineConfig.provider === "cashfree" && onlineConfig.mode === "live" && settings.testMode !== true;
  const checkoutMode = liveCheckout ? "live" : "test";
  const checkoutProvider = liveCheckout || (onlineConfig.mode === "test" && isSandboxProvider(onlineConfig.provider)) ? onlineConfig.provider : null;
  const onlineCheckoutEnabled = checkoutProvider !== null && onlineConfig.enabled === true;
  const useOnlineCheckout = onlineCheckoutEnabled && payOnline;
  const checkoutLabel = checkoutProvider === "cashfree" && onlineConfig.mode === "live" ? "Cashfree" : sandboxLabel(checkoutProvider);
  const checkoutPaymentNotice = !acceptingOrders ? "The café has paused new orders."
    : useOnlineCheckout && quote && quote.total < (onlineConfig.minimumAmount || 50)
      ? `${checkoutLabel} requires a total of at least ${money(onlineConfig.minimumAmount || 50, settings.currency)}.`
      : null;
  const hasCheckoutForm = route === "checkout" && Boolean(user) && cart.length > 0;
  const clearTableSelection = useCallback(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("table")) {
      url.searchParams.delete("table");
      window.history.replaceState(window.history.state, "", url);
    }
    setDineInTable("");
    setOpenedFromTableQr(false);
  }, []);
  const cartHadItems = useRef(false);
  useEffect(() => {
    if (cartHadItems.current && cart.length === 0) clearTableSelection();
    cartHadItems.current = cart.length > 0;
  }, [cart.length, clearTableSelection]);

  function chooseFulfillment(value: string) {
    if (!enabledOrderTypes(settings).includes(value as 'dine_in' | 'pickup' | 'delivery')) return;
    if (value === fulfillment) return;
    setFulfillment(value);
    if (!previewingHome) {
      try { sessionStorage.setItem(orderTypeStorageKey(String(user?.userId || '')), value); } catch { /* The selection still works when browser storage is unavailable. */ }
    }
    keyRef.current = "";
    if (value !== "dine_in") clearTableSelection();
  }
  function testerReturnPath() {
    const query = openedFromTableQr && /^T[0-9]{2}$/.test(dineInTable) ? "?table=" + dineInTable : "";
    return "/" + query + "#" + route;
  }
  const menuProductsRef = useRef<HTMLElement>(null);
  const categoryPositions = useRef<Record<string, {top:number}>>({});
  const selectMenuCategory = (next:string) => {
    if (next === category) return;
    categoryPositions.current[category] = {top:menuProductsRef.current?.scrollTop || 0};
    setCategory(next);
  };
  useLayoutEffect(() => {
    if (menuProductsRef.current) menuProductsRef.current.scrollTop = categoryPositions.current[category]?.top || 0;
  }, [category]);
  function openHomeMenu(nextCategory: string, replace = false) {
    setSearch("");
    setCategory(nextCategory);
    setDiet("all");
    setPriceRange("all");
    navigate("menu", replace);
  }
  const qty = cart.reduce((s, i) => s + i.quantity, 0);
  const previousRoute = useRef("home");
  const scanReturnRoute = useRef("home");
  const bottomNav = useRef<HTMLElement>(null);
  const cafeReturnRoute = useRef("profile");
  const cafeDialog = useRef<HTMLDialogElement>(null);
  const [cafeDialogOpen, setCafeDialogOpen] = useState(false);
  const outletLabel = cafeOutletLabel(settings);
  const cafeContactOpen = typeof info !== "string";
  const cafeContact = String(settings.contact ?? "").trim();
  const hasKoramangalaContact = isKoramangala(settings.address || "");
  const cafePhone = cafeContact.match(/(?:\+?91[\s.-]?)?[6-9]\d{4}[\s.-]?\d{5}|(?:\+91[\s.-]?)?0?80[\s.-]?\d{4}[\s.-]?\d{4}/)?.[0]
    ?? (hasKoramangalaContact ? "+91 89043 97434" : "");
  const cafeEmail = cafeContact.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i)?.[0]
    ?? (hasKoramangalaContact ? "minfo@maxburn.in" : "");
  const profileActiveOrders = route === "profile" ? activeCafeOrders(orders) : [];
  const homeHasActiveOrders = route === "home" && Boolean(user) && activeCafeOrders(orders).length > 0;
  const profileOrderDetail = profileActiveOrders.length === 1
    ? liveOrderLabel(profileActiveOrders[0])
    : profileActiveOrders.length > 1 ? `${profileActiveOrders.length} active orders` : "Order history";
  const [chatOrderId, setChatOrderId] = useState<string | null>(null);
  const [detailsOrderId, setDetailsOrderId] = useState<string | null>(null);
  const [pageDirection, setPageDirection] = useState("forward");
  useEffect(() => {
    const nav = bottomNav.current;
    const shell = nav?.closest(".app-shell");
    if (!nav || !shell) return;
    let idle: ReturnType<typeof setTimeout>;

    function showNav() {
      clearTimeout(idle);
      nav?.removeAttribute("data-scrolling");
    }

    function hideWhileScrolling(event: Event) {
      const target = event.target;
      if (target !== document && (target !== window && !(target instanceof Element && shell?.contains(target) && target.scrollHeight > target.clientHeight))) return;
      nav?.setAttribute("data-scrolling", "");
      clearTimeout(idle);
      idle = setTimeout(showNav, 500);
    }

    window.addEventListener("scroll", hideWhileScrolling, { capture: true, passive: true });
    window.addEventListener("keydown", showNav);
    return () => {
      showNav();
      window.removeEventListener("scroll", hideWhileScrolling, true);
      window.removeEventListener("keydown", showNav);
    };
  }, [route]);
  const applyRoute = useCallback((r: string) => {
    const nextIndex = bottomTabs.findIndex((tab) => tab.r === r);
    const previousIndex = bottomTabs.findIndex((tab) => tab.r === previousRoute.current);
    setPageDirection(nextIndex < previousIndex ? "backward" : "forward");
    previousRoute.current = r;
    setRoute(r);
    setError("");
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);
  const navigate = useCallback((r: string, replace = false) => {
    const from = previousRoute.current;
    if (r !== from) {
      if (replace) window.history.replaceState(window.history.state, "", "#" + r);
      else window.history.pushState({ ...window.history.state, espressoBackRoute: from }, "", "#" + r);
    }
    applyRoute(r);
  }, [applyRoute]);
  function goBack(fallback: string) {
    if (window.history.state?.espressoBackRoute) window.history.back();
    else navigate(fallback, true);
  }
  function openProfileEditor() {
    if (!user || busy) return;
    setProfilePhoto(null);
    setProfileGender(user.profile?.gender ?? "");
    setError("");
    setContact({ ...contact, name: user.profile?.name || user.fullName || "", phone: user.profile?.phone || "" });
    setProfileEditorOpen(true);
  }

  function openAdvertisementDestination(destination: AdvertisementDestination) {
    switch (destination) {
      case "menu": return openHomeMenu("all");
      case "contact": return setInfo({ kind: "cafe-contact" });
      case "order-alerts": window.dispatchEvent(new Event("espresso-open-permissions")); return;
      case "edit-profile": navigate("profile"); openProfileEditor(); return;
      case "pay": scanReturnRoute.current = route; break;
      case "cafes": cafeReturnRoute.current = route; break;
    }
    navigate(destination);
  }
  useEffect(() => {
    if (!user?.userId) return;
    let stopped = false, running = false, queued = false, timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      if (stopped) return;
      if (running) { queued = true; return; }
      running = true;
      clearTimeout(timer);
      if (document.visibilityState === 'visible') {
        try {
          const response = await api('orders');
          if (!stopped) setOrders(previous => mergeOrderUpdates(previous, response.orders));
        } catch { /* Retain the last verified order status during network failures. */ }
      }
      running = false;
      if (queued && !stopped) { queued = false; void refresh(); }
      else if (!stopped) timer = setTimeout(refresh, trackingOrderId ? 3000 : route === 'home' ? 5000 : 15000);
    };
    const stopLiveUpdates = onLiveUpdate(["orders"], () => void refresh());
    if (trackingOrderId || route === "home") void refresh();
    else timer = setTimeout(refresh, 15000);
    return () => { stopped = true; clearTimeout(timer); stopLiveUpdates(); };
  }, [user?.userId, trackingOrderId, route]);

  useEffect(()=>{
    const id=new URLSearchParams(window.location.search).get('trackOrder');
    if(id&&/^CH-[A-F0-9]{8}$/.test(id)&&orders.some(order=>order.id===id)){
      setTrackingOrderId(id);
      const url=new URL(window.location.href);url.searchParams.delete('trackOrder');window.history.replaceState(window.history.state,'',url.toString());
    }
  },[orders]);
  const notify = (s: string) => {
    setNotice(s);
    setTimeout(() => setNotice(""), 4000);
  };
  function acceptBootstrap(snapshot:any){
    const owner=String(snapshot.user?.userId||"");
    if(accountOwner.current!==owner){
      accountOwner.current=owner;cartOwner.current="";favoritesOwner.current="";
      pendingCart.current=null;savedCart.current="";keyRef.current="";
      setCart([]);setFavoriteIds([]);setQuote(null);setCartReady(!owner);setTrackingOrderId(null);setChatOrderId(null);setDetailsOrderId(null);setOrders([]);
      let savedOrderType: string | null = null;
      if (!previewingHome) {
        try { savedOrderType = sessionStorage.getItem(orderTypeStorageKey(owner)); } catch { /* Use the enabled default without browser storage. */ }
      }
      const fromTableQr = !previewingHome && new URL(window.location.href).searchParams.has('table');
      setFulfillment(resolveOrderType(savedOrderType, snapshot.settings || defaultSettings, fromTableQr));
    }
    homeRevision.current = snapshot.homeDesignRevision ?? defaultHomeDesignRevision;
    setData(snapshot);
    return owner;
  }
  const load = useCallback(():Promise<boolean> => {
    if(initialLoad.current)return initialLoad.current;
    initialLoad.current=(async()=>{
      try {
        setError("");
        const b=await bootstrapRequest.current!();
        if (previewingHome) {
          acceptBootstrap({ ...b, user: null, homeAdvertisement: null });
          return true;
        }
        const owner=acceptBootstrap(b);
        if (b.authentication === "pin") rememberPinPhone(b.user?.profile?.phone);
        if(b.user){
          const needsCart=cartOwner.current!==owner;
          const needsFavorites=favoritesOwner.current!==owner;
          if(needsCart)setCartReady(false);
          const [c,f]=await Promise.allSettled([
            needsCart?api("cart"):Promise.resolve(null),
            needsFavorites?api("favorites"):Promise.resolve(null),
          ]);
          if(accountOwner.current!==owner)return false;
          const failures:string[]=[];
          if(c.status==='fulfilled'){
            if(c.value){
              savedCart.current=JSON.stringify(c.value.items);
              setCart(c.value.items);
              cartOwner.current=owner;
              setContact((v:any)=>({...v,name:b.user.profile?.name||b.user.fullName||"",phone:b.user.profile?.phone||""}));
            }
            setCartReady(true);
          }else failures.push("Your cart could not be loaded. Retry before adding items.");
          if(f.status==='fulfilled'){
            if(f.value){setFavoriteIds(f.value.ids);favoritesOwner.current=owner;}
          }else failures.push("Your favourites could not be loaded.");
          if(failures.length){setError(failures.join(" "));return false;}
        }else{
          cartOwner.current="";favoritesOwner.current="";
          savedCart.current="";pendingCart.current=null;
          setCart([]);setFavoriteIds([]);setCartReady(true);
        }
        return true;
      }catch(e:any){setError(e.message);return false;}
    })().finally(()=>{initialLoad.current=null;});
    return initialLoad.current;
  }, [previewingHome]);
  async function retryLoad(){
    try{
      // A failed save must be retried before fetching a server snapshot.
      if(pendingCart.current)await flushCart();
      return await load();
    }catch(e:any){setError("Cart could not be saved. "+e.message);return false;}
  }

  useEffect(() => {
    load();
    if (previewingHome) return;
    const url = new URL(window.location.href);
    const table = url.searchParams.get("table");
    if (table !== null) {
      setOpenedFromTableQr(true);
      setDineInTable(/^T[0-9]{2}$/.test(table) ? table : "");
      setFulfillment("dine_in");
      if (!url.hash) {
        url.hash = "menu";
        window.history.replaceState(window.history.state, "", url);
      }
    }
    const r = url.hash.slice(1);
    if (customerPages.has(r)) applyRoute(r);
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, [load, previewingHome, applyRoute]);
  useEffect(() => {
    if (previewingHome) return;
    const restoreRoute = () => {
      const next = location.hash.slice(1) || 'home';
      if (customerPages.has(next) && next !== previousRoute.current) applyRoute(next);
    };
    window.addEventListener('popstate', restoreRoute);
    window.addEventListener('hashchange', restoreRoute);
    return () => {
      window.removeEventListener('popstate', restoreRoute);
      window.removeEventListener('hashchange', restoreRoute);
    };
  }, [applyRoute, previewingHome]);
  useEffect(() => {
    if (previewingHome) return;
    let active=true;
    const refresh=singleFlight(async()=>{
      if(document.visibilityState!=="visible")return;
      try{
        const fresh=await bootstrapRequest.current!();
        if(!active)return;
        if(String(fresh.user?.userId||"")!==accountOwner.current){
          acceptBootstrap(fresh);
          await initialLoad.current;
          if(active&&fresh.user)await load();
          return;
        }
        homeRevision.current = fresh.homeDesignRevision ?? defaultHomeDesignRevision;
        setData(fresh);
        setSelected((current:any)=>current?fresh.products.find((p:any)=>p.id===current.id)||null:null);
      }catch{/* Keep the last loaded catalog during a connection interruption. */}
    });
    const timer=setInterval(refresh,30000);
    window.addEventListener("focus",refresh);
    return()=>{active=false;clearInterval(timer);window.removeEventListener("focus",refresh);};
  }, [previewingHome]);

  useEffect(() => {
    if (data && openedFromTableQr && !settings.dineInEnabled) {
      setFulfillment(settings.pickupEnabled ? "pickup" : "delivery");
    }
  }, [data, openedFromTableQr, settings.dineInEnabled, settings.pickupEnabled]);

  useEffect(() => {
    if (!data) return;
    const enabled = enabledOrderTypes(settings);
    if (enabled.length && !enabled.includes(fulfillment as 'dine_in' | 'pickup' | 'delivery')) {
      chooseFulfillment(resolveOrderType(null, settings));
    }
  }, [data, fulfillment, settings.dineInEnabled, settings.pickupEnabled, settings.deliveryEnabled]);

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
    const controller=new AbortController();
    setQuote(null);
    const timer=setTimeout(()=>{
      api("quote", "POST", { items: cart, code, fulfillment },controller.signal)
        .then(b=>{if(active)setQuote(b);})
        .catch(e=>{if(active)setError(e.message);});
    },250);
    return()=>{active=false;clearTimeout(timer);controller.abort();};
  }, [route, cart, code, fulfillment, user?.userId]);
  useEffect(() => {
    if (!user) return;
    const ordersOwner = String(user.userId);
    if (["home", "orders", "profile"].includes(route))
      api("orders")
        .then((b) => {
          if (accountOwner.current !== ordersOwner) return;
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
    if (previewingHome) return;
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
  }, [navigate, previewingHome]);
  useEffect(() => { categoryPositions.current = {}; if (menuProductsRef.current) menuProductsRef.current.scrollTop = 0; }, [search, diet, sort, priceRange]);
  profileBusyRef.current = busy;
  function closeProfileEditor() {
    if (profileBusyRef.current) return;
    setProfileEditorOpen(false);
    setProfilePhoto(null);
    setError("");
  }
  useDialogAccessibility(!!selected || !!info || profileEditorOpen, () => {
    closeProfileEditor();
    setSelected(null);
    setInfo("");
  });
  useEffect(() => {
    const back = (event: Event) => {
      if (chatOrderId) setChatOrderId(null);
      else if (detailsOrderId) setDetailsOrderId(null);
      else if (trackingOrderId) setTrackingOrderId(null);
      else if (cafeDialogOpen) cafeDialog.current?.close();
      else if (profileEditorOpen) {
        if (!profileBusyRef.current) {
          setProfileEditorOpen(false);
          setProfilePhoto(null);
          setError('');
        }
      }
      else if (selected) setSelected(null);
      else if (info) setInfo('');
      else if (showFilters) setShowFilters(false);
      else return;
      event.preventDefault();
    };
    window.addEventListener('espresso-android-back', back);
    return () => window.removeEventListener('espresso-android-back', back);
  }, [chatOrderId, detailsOrderId, trackingOrderId, cafeDialogOpen, profileEditorOpen, selected, info, showFilters]);
  function authRequired() {
    if (!user) {
      setInfo("Sign in to save your cart, favourites, and orders.");
      return true;
    }
    return false;
  }
  function add(item: Item, origin?: HTMLElement) {
    if (authRequired()) return;
    if(!cartReady){setError("Your cart is still loading. Please retry before adding items.");return;}
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
  function reorder(order:any){if(authRequired())return;if(!cartReady){setError("Your cart is still loading. Please retry before adding items.");return;}try{const items=prepareReorder(order,products);const totals=new Map<string,number>();for(const i of [...cart,...items])totals.set(i.productId,(totals.get(i.productId)||0)+i.quantity);for(const [id,n] of totals){const p=products.find((p:any)=>p.id===id);if(n>Math.min(99,p?.inventory??99))throw Error('Your cart would exceed available stock. Adjust quantities first.');}setCart(previous=>{const merged=[...previous];for(const item of items){const index=merged.findIndex(i=>itemKey(i)===itemKey(item));if(index<0)merged.push(item);else merged[index]={...merged[index],quantity:merged[index].quantity+item.quantity};}return merged});keyRef.current='';navigate('cart');notify('Added again. Review current prices before checkout.');}catch(e){setError((e as Error).message)}}
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
  const openProduct = useCallback((p: any) => {
    setEditIndex(-1);
    setSelected(p);
    setSelection({
      ...initialItem(p.id),
      variantId: p.variants?.[0]?.id || "",
    });
  }, []);
  const openShowcaseProduct = useCallback((id: string) => {
    const product = products.find((item: any) => item.id === id);
    if (product) openProduct(product);
  }, [openProduct, products]);
  async function favorite(id: string) {
    if(authRequired())return;
    const owner=accountOwner.current,key=owner+":"+id;
    if(favoriteRequests.current.has(key))return;
    favoriteRequests.current.add(key);
    try{
      const remove=favoriteIds.includes(id);
      await api("favorites","POST",{productId:id,remove});
      if(accountOwner.current!==owner)return;
      setFavoriteIds(old=>remove?old.filter(item=>item!==id):old.includes(id)?old:[...old,id]);
      if(!remove)setFavouriteCelebration(event=>event+1);
      notify(remove?"Removed from favourites":"Saved to favourites");
    }catch(e:any){if(accountOwner.current===owner)setError(e.message);}
    finally{favoriteRequests.current.delete(key);}
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
    if (busy || !quote || !acceptingOrders) return;
    unlockCelebrationAudio();
    if(useOnlineCheckout&&quote.total<(onlineConfig.minimumAmount||50)){setError(checkoutLabel+" needs an order of at least "+money(onlineConfig.minimumAmount||50,settings.currency));return;}
    setBusy(true);
    setError("");
    try {
      await flushCart(cart);
      if (!keyRef.current) keyRef.current = crypto.randomUUID();
      const b = await api("orders", "POST", {
        items: cart,
        code,
        fulfillment,
        contact: { ...contact, table: checkoutTable },
        paymentMethod: useOnlineCheckout && checkoutProvider ? hostedPaymentMethod(checkoutProvider, checkoutMode) :
          fulfillment === "dine_in" ? "pay_at_counter" : fulfillment === "pickup" ? "pay_at_pickup" : "cash_on_delivery",
        expectedTotal: quote.total,
        idempotencyKey: keyRef.current,
      });
      if (useOnlineCheckout) {
        const checkout = await paymentRequest(b.id + "/start", {});
        if (checkout.paid) { window.location.assign("/payment-return?order=" + b.id); return; }
        if (checkout.providerState === "EXPIRED") {
          keyRef.current = "";
          throw Error("This checkout expired. Start a new checkout.");
        }
        window.location.assign(hostedCheckoutUrl(checkout.provider, checkout.mode, checkout.redirectUrl));
        return;
      }
      celebrationSound("order");
      setConfirmation(orderReference(b));
      clearTableSelection();
      keyRef.current = "";
      setCart([]);
      navigate("orders");
      notify("Order received. Follow its progress in My orders.");
    } catch (e: any) {
      if (e.message === cafeOffDutyMessage) setAcceptingOrders(false);
      else {
        if (e.message === "This checkout expired. Start a new checkout.") keyRef.current = "";
        setError(e.message);
      }
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
            "/tester-login?return_to=" + encodeURIComponent(testerReturnPath())
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
  if (route === "pay" && data) {
    return (
      <TableQrScanner onClose={() => goBack(scanReturnRoute.current)} onVerifyTable={async (table, signal) => {
        if (!settings.dineInEnabled) throw Error("Dine-in ordering is currently unavailable.");
        if (!dineInTables.includes(table)) throw Error("This table is unavailable. Ask the café team for help.");
        if (!user) throw Error("Sign in before scanning a table.");
        await api("table-visits/scan", "POST", { table }, signal);
      }} onOpenTable={table => {
        const url = new URL(window.location.href);
        url.searchParams.set("table", table);
        window.history.replaceState(window.history.state, "", url);
        setOpenedFromTableQr(true);
        setDineInTable(table);
        setFulfillment("dine_in");
        keyRef.current = "";
        openHomeMenu("all", true);
      }} />
    );
  }
  return (
    <>
      <FavouriteCelebration event={favouriteCelebration} />
      <div className="cart-flight-layer" aria-hidden="true">
        {cartFlights.map(flight => <div key={flight.id} className="cart-flight" style={{left: flight.x, top: flight.y, "--flight-x": `${flight.dx}px`, "--flight-y": `${flight.dy}px`, "--arc-x": `${flight.dx * .4}px`, "--arc-y": `${Math.min(flight.dy * .4, 0) - 85}px`} as React.CSSProperties}><ProductImage product={flight.product} /></div>)}
      </div>
      <div className="app-shell dribbble-theme reel-theme">
        {route === "home" && !previewingHome && <HomePullRefresh onRefresh={retryLoad} bottomNav={bottomNav} />}
        <header className={"header " + (route === "home" ? "home-header" : "")}>
          <div className="header-inner">
            <div className={route === 'home' ? 'brand-row' : 'brand-row brand-row-actions-only'}>
              {route === 'home' && <button type="button" className="brand" aria-label={settings.brand} onClick={() => navigate("home")}>
                {headerLogo ? (
                  <img src={headerLogo} className={route === "home" ? "home-brand-icon" : "brand-logo"} alt="" />
                ) : null}
                <span>{settings.brand}</span>
              </button>}
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
              <>
                {!acceptingOrders && (
                  <div className="home-duty-notice" role="status">
                    <span className="home-duty-icon"><CirclePause size={20} aria-hidden="true" /></span>
                    <div>
                      <strong>Café orders are paused</strong>
                      <p>You can still browse the menu.</p>
                    </div>
                  </div>
                )}
                <dialog
                  ref={cafeDialog}
                  className="cafe-sheet"
                  aria-labelledby="cafe-sheet-title"
                  onClose={() => setCafeDialogOpen(false)}
                  onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}
                >
                  <div className="cafe-sheet-content">
                    <div className="cafe-sheet-header">
                      <h2 id="cafe-sheet-title">Our café</h2>
                      <button type="button" className="icon-button" aria-label="Close café details" onClick={() => cafeDialog.current?.close()}>
                        <X size={20} aria-hidden="true" />
                      </button>
                    </div>
                    {cafeDialogOpen && <CafeDetails settings={settings} />}
                  </div>
                </dialog>
              </>
            )}

          </div>
        </header>

        {!previewingHome && <MobileMotion route={route}/>}{user&&<AppPermissionSetup/>}
        {route === "home" && user && !user.admin && data?.homeAdvertisement && !selected && !info && !cafeDialogOpen && !trackingOrderId && !chatOrderId && (
          <HomeAdvertisement key={openingAdKey}
            advertisement={data.homeAdvertisement} seen={seenOpeningAds.current.has(openingAdViewer)}
            onShown={() => { seenOpeningAds.current.add(openingAdViewer); }}
            onAction={openAdvertisementDestination} />
        )}
        <main key={`${user?.userId || "guest"}:${route}`} data-direction={pageDirection} className={"main page-enter route-" + route}>
          {error && !hasCheckoutForm && (
            <div className="error" role="alert">
              <span>{error}</span>
              <button
                onClick={() => {
                  setError("");
                  retryLoad();
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
              <button className="primary" onClick={retryLoad}>
                Try again
              </button>
            </div>
          ) : (
            <>
              {route === "home" && (
                <>
                  <div className="home-content customer-home-design">
                    {homeDesign.sections.filter(section => section.visible).map(({ id }) => (
                      <Fragment key={id}>
                        {id === "greeting" && (
                          <div className="home-design-greeting">
                            <HomeGreeting gender={user?.profile?.gender} userId={user?.userId}
                              dateOfBirth={user?.profile?.date_of_birth} title={homeCopy.greeting} />
                            {homeCopy.greetingSubtitle && <p>{homeCopy.greetingSubtitle}</p>}
                          </div>
                        )}
                        {id === "outlet" && (
                          <button
                            type="button"
                            className="home-cafe-card"
                            aria-haspopup="dialog"
                            onClick={() => {
                              cafeDialog.current?.showModal();
                              setCafeDialogOpen(true);
                            }}
                          >
                            <span className="cafe-card-pin"><MapPin size={20} aria-hidden="true" /></span>
                            <span className="cafe-card-copy"><strong>{outletLabel}</strong><small>{homeCopy.outletAction}</small></span>
                            <ChevronRight size={20} aria-hidden="true" />
                          </button>
                        )}
                        {id === "showcase" && (
                          <div className="home-design-showcase">
                            {homeCopy.heroImage ? (
                              <button type="button" className="home-design-hero" onClick={() => openHomeMenu("all")}>
                                <img src={homeCopy.heroImage} alt="" />
                                <span>{homeCopy.heroTitle && <strong>{homeCopy.heroTitle}</strong>}
                                  <span>{homeCopy.heroAction} <ChevronRight size={17} aria-hidden="true" /></span>
                                </span>
                              </button>
                            ) : (
                              <CoffeeShowcase currency={settings.currency}
                                products={showcaseProducts}
                                onSelect={openShowcaseProduct} />
                            )}
                          </div>
                        )}
                        {id === "discovery" && <>
                          <div className="theme-discovery">
                            <form role="search" className="theme-home-search" onSubmit={event => {
                              event.preventDefault();
                              setCategory("all");
                              navigate("menu");
                            }}>
                              <Search size={18} aria-hidden="true" />
                              <input aria-label="Search coffee and food" inputMode="search" enterKeyHint="search"
                                placeholder={homeCopy.searchPlaceholder} value={search} onChange={event => setSearch(event.target.value)} />
                              <button type="submit" aria-label="Search the menu"><ChevronRight size={18} /></button>
                            </form>
                          </div>
                          <div className="home-category-rail" role="group" aria-label="Menu categories">
                            {categories.map((entry: any) => {
                              const example = products.find((product: any) => !product.archived && product.categoryId === entry.id);
                              return (
                                <button type="button" key={entry.id} onClick={() => openHomeMenu(entry.id)}>
                                  <span className="home-category-photo" aria-hidden="true">
                                    {entry.image ? <img src={entry.image} alt="" loading="lazy" /> : <ProductImage product={example} />}
                                  </span>
                                  <span>{entry.name}</span>
                                </button>
                              );
                            })}
                          </div>
                        </>}
                        {id === "recentOrder" && <PersonalHome orders={orders} onReorder={reorder} onNavigate={navigate} />}
                        {id === "shortcuts" && <ClubShortcuts onNavigate={(destination) => {
                          if (destination === "cafes") cafeReturnRoute.current = "home";
                          navigate(destination);
                        }} />}
                        {id === "bookings" && <TableBooking user={user} />}
                        {id === "promotions" && <PromotionBanners banners={settings.promotionBanners || []} onAction={banner => {
                          if (banner.destination === "subscriptions") { navigate("subscriptions"); return; }
                          setSearch(banner.search || "");
                          setCategory("all");
                          setDiet("all");
                          setPriceRange("all");
                          navigate("menu");
                        }} />}
                        {id === "offers" && (settings.offers || []).some((o: any) => o.enabled) && <section className="offers-section">
                          <div className="section-heading">
                            <h2>OFFERS &amp; LITTLE EXTRAS</h2>
                            <span>A little treat</span>
                          </div>
                          <div className="offers-row">
                            {(settings.offers || []).filter((o: any) => o.enabled).map((o: any) => (
                              <button key={o.code} className="offer-card" onClick={() => {
                                setCode(o.code);
                                navigate("cart");
                              }}>
                                <strong>{o.title || "Café offer"}</strong>
                                <span>CODE <b>{o.code}</b></span>
                                <small>{o.expires ? "Valid until " + o.expires : "See offer at checkout"}</small>
                              </button>
                            ))}
                          </div>
                        </section>}
                      </Fragment>
                    ))}
                  </div>
                </>
              )}
              {route === "bookings" && <div className="page-content">
                <PageTitle title="Table bookings" onBack={() => goBack("profile")} />
                <TableBooking user={user} />
              </div>}
              {route === "menu" && (
                <>
                  {(openedFromTableQr || (fulfillment === "dine_in" && cart.length > 0)) && (
                    <div className="dine-in-menu-note" role="status">
                      <MapPin size={18} aria-hidden="true" />
                      <span>{!settings.dineInEnabled ? "Dine-in is currently unavailable." : <>
                        <strong>Dine in{validTable ? ` · Table ${dineInTable}` : ""}</strong>
                        {!validTable && <small>The café team will assign your table.</small>}
                      </>}</span>
                    </div>
                  )}
                  <div className="menu-toolbar">
                    <SearchField label="Search menu" placeholder="Search coffee and food"
                      value={search} onChange={setSearch} />
                    <button
                      type="button"
                      className={showFilters ? "filter-button active" : "filter-button"}
                      aria-label="Menu filters"
                      aria-expanded={showFilters}
                      aria-controls={showFilters ? "menu-filters" : undefined}
                      onClick={() => setShowFilters((open) => !open)}
                    >
                      <SlidersHorizontal size={19} />
                    </button>
                  </div>
                  {showFilters && (
                    <div className="filters menu-filters" id="menu-filters">
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
                        {filtered.map((p: any) => card(p))}
                      </div>
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

                    </section>
                  </div>
                </>
              )}
              {route === "favorites" && (
                <div className="page-content">
                  <PageTitle
                    title="Your favourites"
                    onBack={() => goBack("profile")}
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
                    onBack={() => goBack("menu")}
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
                          className="text-button cart-add-more"
                          type="button"
                          onClick={() => navigate("menu")}
                        >
                          <Plus size={18} aria-hidden="true" />
                          Add more items
                        </button>
                      </section>
                      <aside className="order-summary cart-order-summary" aria-labelledby="cart-order-title">
                        <h2 id="cart-order-title">Your order</h2>
                        <label className="cart-offer-code">
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
                        <div className="cart-order-pricing" aria-live="polite">
                          {quote ? totals() : <p>Checking your order…</p>}
                        </div>
                        <button
                          className="primary wide"
                          disabled={!quote}
                          onClick={() => navigate("checkout")}
                        >
                          Continue to checkout
                        </button>

                        <Pairings products={products} categories={categories} cart={cart} onSelect={p=>openProduct(p)}/>
                      </aside>
                    </div>
                  )}
                </div>
              )}
              {route === "checkout" && (
                <div className="page-content">
                  <PageTitle title="Checkout" onBack={() => goBack("cart")} />
                  {user && cart.length > 0 && !acceptingOrders && (
                    <p className="checkout-duty-notice" role="status">{cafeOffDutyMessage}</p>
                  )}
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
                    <form className="checkout-grid checkout-form" onSubmit={submitOrder}>
                      <section className="form-card">
                        <h2>Confirm your order type</h2>
                        <div className="checkout-cafe">
                          <MapPin size={19} aria-hidden="true" />
                          <span><strong>{settings.brand}</strong>{outletLabel !== settings.brand && <small>{outletLabel}</small>}</span>
                        </div>
                        <p className="fine-print">Check dine-in or take-away before placing your order. You can change your selection here.</p>
                        <OrderTypeSelector value={fulfillment} settings={settings} onChange={chooseFulfillment} illustrated
                          label="Confirm order type" dineInLabel={homeCopy.dineInLabel} takeAwayLabel={homeCopy.takeAwayLabel}/>
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
                            pattern={String.raw`[+0-9 \(\)\-]{7,25}`}
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
                      <aside className="order-summary" aria-labelledby="checkout-summary-title">
                        <h2 id="checkout-summary-title">Order summary</h2>
                        <ul className="checkout-items">
                          {cart.map((item, index) => {
                            const priced = quote?.items[index];
                            const product = products.find((p: any) => p.id === item.productId);
                            const options = [priced?.selections.variant?.name, ...(priced?.selections.addons ?? []).map((addon: { name: string }) => addon.name)].filter(Boolean);
                            return (
                              <li key={itemKey(item)}>
                                <span className="checkout-item-quantity" aria-label={`Quantity ${item.quantity}`}>{item.quantity}×</span>
                                <div>
                                  <strong>{priced?.name ?? product?.name ?? "Unavailable item"}</strong>
                                  {options.length > 0 && <small>{options.join(" · ")}</small>}
                                </div>
                                {priced && <span className="checkout-item-price">{money(priced.unitPrice * priced.quantity, quote.currency)}</span>}
                              </li>
                            );
                          })}
                        </ul>
                        {quote ? totals() : <p className="fine-print" role="status">Checking your order…</p>}
                        <p className="billing-order-type"><strong>Order type</strong><span>{fulfillment === "dine_in" ? "Dine in" : fulfillment === "pickup" ? "Take away" : "Delivery"}{checkoutTable ? ` · Table ${checkoutTable}` : ""}</span></p>
                        {fulfillment === "dine_in" && !checkoutTable && <p className="fine-print">The café team will assign your table.</p>}
                        <fieldset className="sandbox-payment-options" disabled={busy}><legend>Payment method</legend>
                          <label><input type="radio" name="paymentChoice" checked={!useOnlineCheckout} onChange={()=>setPayOnline(false)}/><span><strong>Pay at the café</strong><small>{fulfillment==="dine_in"?"Pay at the counter":"Pay when you collect your order"}</small></span></label>
                          {checkoutProvider && <label><input type="radio" name="paymentChoice" disabled={!onlineCheckoutEnabled} checked={useOnlineCheckout} onChange={()=>setPayOnline(true)}/><span><strong>Pay now</strong>{!onlineCheckoutEnabled&&<small>Online checkout is being set up</small>}</span></label>}
                        </fieldset>
                        {error ? (
                          <div className="error checkout-action-message" id="checkout-action-message" role="alert">
                            <span>{error}</span>
                            <button type="button" onClick={() => setError("")} aria-label="Dismiss error"><X size={18} /></button>
                          </div>
                        ) : checkoutPaymentNotice && (
                          <p className="checkout-action-message" id="checkout-action-message" role="status">{checkoutPaymentNotice}</p>
                        )}
                        <button
                          className="primary wide"
                          disabled={busy || !quote || Boolean(checkoutPaymentNotice)}
                          aria-describedby={error || checkoutPaymentNotice ? "checkout-action-message" : undefined}
                        >
                          {busy ? (useOnlineCheckout?"Opening payment…":"Placing your order…") : useOnlineCheckout?"Pay now":"Place order"}
                        </button>
                        <Pairings products={products} categories={categories} cart={cart} onSelect={p=>openProduct(p)}/>
                      </aside>
                    </form>
                  )}
                </div>
              )}
              {route === "orders" && (
                <div className="page-content">
                  <PageTitle
                    title="My orders"
                    onBack={() => goBack("profile")}
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
                          Track your order or message the café.
                        </p>
                      </div>
                    </div>
                  )}
                  {!user ? (
                    loginPanel()
                  ) : orders.length ? (
                    <div className="orders-list">
                      {orders.map((o) => (
                        <article key={o.id} className="order-card order-ticket-card">
                          <div className="order-top">
                            <div>
                              <strong>{orderReference(o)}</strong>
                              <small>
                                {new Date(o.created_at + "Z").toLocaleString()}
                              </small>
                            </div>
                            <span className={"status " + o.status}>
                              {o.status.replaceAll("_", " ")}
                            </span>
                          </div>
                          <div className="order-card-actions">
                            {!['completed','cancelled'].includes(o.status) ? <>
                              <button type="button" className="secondary" onClick={() => setTrackingOrderId(o.id)}>View order status</button>
                              <button type="button" className="secondary" onClick={() => setChatOrderId(o.id)}>Chat with the café</button>
                            </> : o.items?.length > 0 && <button type="button" className="secondary" onClick={() => reorder(o)}>Order again</button>}
                          </div>
                          <button type="button" className="order-details-ticket" aria-haspopup="dialog" onClick={()=>setDetailsOrderId(o.id)}>Order details<ChevronRight size={16} aria-hidden="true"/></button>
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
                    <button type="button" className="avatar profile-avatar" aria-label="Edit profile" aria-haspopup="dialog" disabled={!user || busy} onClick={openProfileEditor}>
                      <CustomerAvatar src={profilePhoto ?? user?.profile?.avatar} name={user?.profile?.name||user?.fullName}/>
                      {user && <span className="avatar-edit"><Pencil size={13}/></span>}
                    </button>
                    <h1>
                      {user?.profile?.name || user?.fullName || "Coffee lover"}
                    </h1>
                    <p>{user?.email && !/@(?:tester|phone|pin)\.invalid$/.test(user.email) ? user.email : "Manage your profile"}</p>
                  </section>
                  <button className="permission-settings-link secondary" onClick={()=>window.dispatchEvent(new Event("espresso-open-permissions"))}><Settings size={17}/>Notification settings</button>
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
                      <h2 className="profile-preview-links-title">Your account</h2>
                      <div className="profile-links">
                        {[
                          { icon: Package, name: "My orders", r: "orders", detail: profileOrderDetail },
                          { icon: MapPin, name: "Our café", r: "cafes", detail: outletLabel },
                          { icon: CalendarDays, name: "Table bookings", r: "bookings" },
                          { icon: Coffee, name: "Coffee subscriptions", r: "subscriptions", detail: "Plans and credits" },
                          {
                            icon: Heart,
                            name: "My favourites",
                            r: "favorites",
                            detail: favoriteIds.length ? `${favoriteIds.length} saved` : undefined,
                          },
                          {
                            icon: MapPin,
                            name: "Saved addresses",
                            r: "addresses",
                            detail: "Delivery locations",
                          },
                          {
                            icon: Lightbulb,
                            name: "Suggest something delicious",
                            r: "suggest",
                            detail: "Share a menu idea",
                          },
                        ].map((l) => (
                          <button key={l.r} aria-label={l.name} aria-describedby={l.detail ? `profile-shortcut-${l.r}` : undefined} onClick={() => {
                            if (l.r === "cafes") cafeReturnRoute.current = "profile";
                            navigate(l.r);
                          }}>
                            <l.icon size={20} />
                            <span>{l.name}{l.detail && <small className="profile-shortcut-detail" id={`profile-shortcut-${l.r}`}>{l.detail}</small>}</span>
                            <ChevronRight size={19} />
                          </button>
                        ))}
                        <button type="button" onClick={() => setInfo({ kind: "cafe-contact" })}>
                          <Phone size={20} />
                          <span>Contact the café</span>
                          <ChevronRight size={19} />
                        </button>
                      </div>

                      {user.canSeeStaffPanel === true && <a className="profile-staff-link" href="/admin">
                        <LockKeyhole size={18} aria-hidden="true" />
                        <span>Admin panel<small>Staff access</small></span>
                        <ChevronRight size={16} aria-hidden="true" />
                      </a>}
                      <button type="button" className="signout" disabled={signingOut} onClick={async()=>{setSigningOut(true);try{await disableOrderNotifications();const destination=await signOutSession(api,user?.authProvider);sessionStorage.removeItem("espresso_guest");if(user?.authProvider==="pin"){window.dispatchEvent(new Event("espresso-pin-signedout"))}else window.location.assign(destination)}catch(e){setError((e as Error).message);setSigningOut(false)}}}><LogOut size={18}/>{signingOut ? "Signing out…" : "Sign out"}</button>
                    </div>
                  )}
                </div>
              )}
              {route === "addresses" && (
                <div className="page-content narrow">
                  <PageTitle
                    title="Saved addresses"
                    onBack={() => goBack("profile")}
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
                            <p>{a.address}</p>{a.location&&<small className="address-pin-label">Location pinned</small>}
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
                      <AddressForm request={api} onSaved={a=>{setAddresses(old=>[...old,a]);notify('Address saved')}}/>
                    </>
                  )}
                </div>
              )}
              {route === "suggest" && (
                <div className="page-content narrow">
                  <PageTitle
                    title="Your ideas, on the menu"
                    onBack={() => goBack("profile")}
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
                                const b = await api("upload", "POST", file);
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
                  <CoffeeSubscriptions onMenu={() => navigate("menu")} />
                </div>
              )}
              {route === "cafes" && (
                <div className="page-content narrow">
                  <PageTitle title="Our café" onBack={() => goBack(cafeReturnRoute.current)} />
                  <CafeDetails settings={settings} />
                </div>
              )}
              {["offers","referrals","birthday"].includes(route) && <div className="page-content narrow"><CoffeeClub view={route} settings={settings} onNavigate={navigate}/></div>}
              {route === "rewards" && (
                <div className="page-content narrow">
                  <PageTitle title="Rewards & Gifts" onBack={() => goBack("home")} />
                  <div className="empty-state">
                    <Gift size={36} aria-hidden="true" />
                    <h2>Coming soon</h2>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
        <div className={homeHasActiveOrders ? "home-commerce-dock" : undefined}>
          {qty > 0 && !["cart", "checkout"].includes(route) && (
            <MovableCart ref={floatingCartRef} avoidOrderRail={homeHasActiveOrders} onOpen={() => navigate("cart")} label={`Open cart, ${qty} ${qty === 1 ? "item" : "items"}`}>
              <ShoppingCart key={cartArrival} className={cartArrival ? "cart-arrival" : ""} size={25} />
              <span className="cart-count" aria-live="polite">{qty}</span>
            </MovableCart>
          )}
          {homeHasActiveOrders && <HomeLiveOrders orders={orders} onOpen={setTrackingOrderId} />}
        </div>
        {user&&<div className="mobile-order-alerts"><OrderAlerts orders={orders} userId={user.userId} onNavigate={navigate} onOpen={setTrackingOrderId}/></div>}
        <nav ref={bottomNav} className="bottom-nav glass-tab-bar" aria-label="Main navigation"
          style={{ "--glass-tab-index": Math.max(0, bottomTabs.findIndex(tab => tab.r === route)) } as React.CSSProperties}>
          <span className="bottom-nav-glass" aria-hidden="true" />
          <svg className="bottom-nav-shape" viewBox="0 0 380 64" preserveAspectRatio="none" aria-hidden="true" focusable="false">
            <defs>
              <clipPath id="bottom-nav-glass-clip" clipPathUnits="objectBoundingBox">
                <use href="#bottom-nav-outline" transform="scale(.002631579 .015625)" />
              </clipPath>
            </defs>
            <path id="bottom-nav-outline" d={bottomNavOutline} vectorEffect="non-scaling-stroke" />
            <BottomNavRefreshWave outline="bottom-nav-outline"
              onEnd={() => bottomNav.current?.removeAttribute("data-refresh-impact")} />
          </svg>
          <span className="glass-tab-selection" aria-hidden="true" />
          {bottomTabs.map((n) => (
            <button
              key={n.r}
              data-scan-to-order={n.r === "pay" ? "" : undefined}
              className={route === n.r ? "active" : undefined}
              onClick={() => {
                if (n.r === "pay") scanReturnRoute.current = route;
                navigate(n.r);
              }}
              aria-current={route === n.r ? "page" : undefined}
            >
              <span className="nav-icon">
                {n.r === "profile" && user?.profile?.avatar ? (
                  <CustomerAvatar src={user.profile.avatar} decorative />
                ) : (
                  <n.icon size={23} strokeWidth={route === n.r ? 2.2 : 1.7} aria-hidden="true" />
                )}
              </span>
              <span className="bottom-nav-label">{n.name}</span>
            </button>
          ))}
        </nav>
      </div>
      {profileEditorOpen && user && (
        <div className="modal-backdrop" onClick={closeProfileEditor}>
          <section className="profile-editor-modal" role="dialog" aria-modal="true" aria-labelledby="profile-editor-title" onClick={event=>event.stopPropagation()}>
                      <form
                        className="form-card profile-details-form"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          setBusy(true);
                          try {
                            await api("profile", "PUT", {...contact, gender: profileGender, ...(profilePhoto !== null ? {avatar: profilePhoto} : {})});
                            if (profilePhoto !== null) {
                              setData((current: any) => current?.user?.userId === user.userId
                                ? { ...current, user: { ...current.user, profile: { ...current.user.profile, avatar: profilePhoto } } }
                                : current);
                            }
                            setProfilePhoto(null);
                            await load();
                            setProfileEditorOpen(false);
                            notify("Profile saved");
                          } catch (e: any) {
                            setError(e.message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        <div className="profile-editor-heading"><h2 id="profile-editor-title">Edit profile</h2><button type="button" className="icon-button" aria-label="Close profile editor" disabled={busy} onClick={closeProfileEditor}><X size={22}/></button></div>
                        {error && <p role="alert" className="error-banner">{error}</p>}
                        <div className="profile-photo-controls">
                          <label>Display picture
                            <input ref={profilePhotoInput} type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={async event=>{const file=event.target.files?.[0];if(!file)return;if(file.size>5000000){setError("Choose an image smaller than 5 MB.");return;}setBusy(true);try{const result=await api("upload","POST",file);setProfilePhoto(result.url);notify("Photo ready. Save your profile to apply it.");}catch(error){setError((error as Error).message);}finally{setBusy(false);event.target.value="";}}}/>
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
                          Contact phone (does not change sign-in number)
                          <input
                            type="tel"
                            maxLength={25}
                            value={contact.phone}
                            onChange={(e) =>
                              setContact({ ...contact, phone: e.target.value })
                            }
                          />
                        </label>
                        <ProfileGenderField value={profileGender} onChange={setProfileGender} disabled={busy} editProfile/>
                        {user.authProvider==='pin'&&<p className="fine-print">Your sign-in number is {user.loginPhone||'the number used to create your account'}. Contact the café to change account access securely.</p>}
                        <button className="secondary" disabled={busy}>
                          Save profile
                        </button>
                      </form>
          </section>
        </div>
      )}
      {trackingOrderId && orders.some(order => order.id === trackingOrderId) && <OrderStatusScreen backLabel={route === "home" ? "Back to Home" : "Back to orders"} order={orders.find(order => order.id === trackingOrderId)!} onClose={() => setTrackingOrderId(null)} onChat={() => setChatOrderId(trackingOrderId)} />}
      {user && detailsOrderId && orders.some(order=>order.id===detailsOrderId) && <OrderDetailsSheet key={detailsOrderId} order={orders.find(order=>order.id===detailsOrderId)} onClose={()=>setDetailsOrderId(null)}/>}
      {user && chatOrderId && <OrderChat key={chatOrderId} orderId={chatOrderId}
        orderNumber={orders.find((order) => order.id === chatOrderId)?.order_number}
        request={api} onClose={() => setChatOrderId(null)} />}
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
              <MenuRecipeDetails product={selected}/>

              {selected.dietary?.length > 0 && (
                <div className="dietary-tags">
                  {selected.dietary.map((d: string) => (
                    <span key={d}>{d}</span>
                  ))}
                </div>
              )}
              {selected.variants?.length > 0 && (
                <fieldset>
                  <legend>Choose your size / option</legend>
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
                              ? [...selection.addonIds.filter(id=>!a.group||selected.addons.find((option:any)=>option.id===id)?.group!==a.group), a.id]
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
              <div className="preference-chips"><span>Preparation requests</span>{['Less sweet','No added sugar','Extra hot'].map(request=><button type="button" key={request} aria-pressed={selection.instructions.includes(request)} onClick={()=>setSelection({...selection,instructions:selection.instructions.includes(request)?selection.instructions.split('; ').filter(t=>t!==request).join('; '):[selection.instructions,request].filter(Boolean).join('; ').slice(0,300)})}>{request}</button>)}<small>Requests are subject to the recipe and café confirmation. Priced sizes, milk options and extra shots appear above when configured.</small></div><label>
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
            aria-label={cafeContactOpen ? "Contact the café" : "Café information"}
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
            {cafeContactOpen ? (
              <div className="cafe-contact-actions">
                <p>{outletLabel}</p>
                {cafePhone && <a className="primary" href={`tel:${cafePhone.replace(/[^+\d]/g, "")}`}><Phone size={17} aria-hidden="true" /> Call {cafePhone}</a>}
                {cafeEmail && <a className="secondary" href={`mailto:${cafeEmail}`}><Mail size={17} aria-hidden="true" /> Email the café</a>}
                {cafeContact && !cafePhone && !cafeEmail && <p>{cafeContact}</p>}
                {!cafeContact && !cafePhone && !cafeEmail && <p>Contact details are unavailable for this outlet.</p>}
              </div>
            ) : <p>{info}</p>}
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
                  encodeURIComponent(testerReturnPath())
                }
              >
                Start testing
              </a>
            )}
          </section>
        </div>
      )}
      {user && <BookingNotifications userId={user.userId} onView={()=>{sessionStorage.setItem('espresso-open-bookings','1');navigate(homeShowsBookings ? 'home' : 'bookings');window.dispatchEvent(new Event('espresso-open-bookings'));}}/>}
      {notice && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          {notice}
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
