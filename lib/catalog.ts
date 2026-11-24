import outlet from "./outlet-menu.json" with {type:"json"};
import { koramangalaAddress } from "./cafe-routing.ts";
import { defaultCafeOpeningTime } from "./cafe-order-day.ts";
export const sourceUrl="https://espressoulster-coffee.nagendra80.chatgpt.site/";
export const categorySeed=[...outlet.categories,...[{"id": "coffee", "name": "Coffee", "position": 100}, {"id": "food", "name": "Food", "position": 101}, {"id": "more", "name": "More drinks", "position": 102}]];
export const catalogSeed=outlet.products;
export const defaultSettings = {
  brand: "Espressoulster Coffee",
  currency: "INR",
  taxBps: 0,
  contact: "+91 89043 97434",
  location: "Pickup at the café",
  address: koramangalaAddress,
  openingHours: "Contact the café for opening hours",
  orderDayOpeningTime: defaultCafeOpeningTime,
  pickupEnabled: true,
  dineInEnabled: true,
  deliveryEnabled: false,
  deliveryFee: 0,
  cancelPending: true,
  bannerTitle: "YOUR DAILY\nCOFFEE RITUAL",
  bannerSubtitle: "Find your coffee soul.",
  offers: [],
  promotionBanners: [],
  packs: [],
  onlinePayments: false,
};
