export const launchAdvertisementKey = "launch-advertisement";

export const launchAdvertisementDestinations = [
  { value: "home", label: "Home" },
  { value: "menu", label: "Menu" },
  { value: "pay", label: "Scan to order" },
  { value: "cart", label: "Cart" },
  { value: "checkout", label: "Checkout" },
  { value: "orders", label: "My orders" },
  { value: "subscriptions", label: "Subscriptions" },
  { value: "favorites", label: "My favourites" },
  { value: "offers", label: "Offers" },
  { value: "rewards", label: "Rewards & Gifts" },
  { value: "referrals", label: "Share a coffee" },
  { value: "birthday", label: "Your birthday treat" },
  { value: "cafes", label: "Our café" },
  { value: "bookings", label: "Table bookings" },
  { value: "contact", label: "Contact the café" },
  { value: "suggest", label: "Suggest something delicious" },
  { value: "profile", label: "Profile" },
  { value: "edit-profile", label: "Edit profile" },
  { value: "addresses", label: "Saved addresses" },
  { value: "order-alerts", label: "Order alerts" },
] as const;

export type AdvertisementDestination = (typeof launchAdvertisementDestinations)[number]["value"];

export function isAdvertisementDestination(value: unknown): value is AdvertisementDestination {
  return launchAdvertisementDestinations.some(destination => destination.value === value);
}

export type AdvertisementDraft = {
  title: string;
  image: string;
  destination: AdvertisementDestination | null;
};

export type LaunchAdvertisement = { id: string; banners: AdvertisementDraft[] };
type SavedBanner = AdvertisementDraft & { action?: string };

export async function readLaunchAdvertisement(db: Pick<D1Database, "prepare">) {
  const row = await db.prepare("SELECT data FROM settings WHERE id=?")
    .bind(launchAdvertisementKey).first<{ data: string }>();
  if (!row) return null;
  const saved = JSON.parse(row.data) as { id: string; banners: SavedBanner[] } | (SavedBanner & { id: string });
  const banners = "banners" in saved ? saved.banners : [saved];
  return {
    id: saved.id,
    banners: banners.map(({ title, image, destination, action }) => ({
      title,
      image,
      destination: isAdvertisementDestination(destination) && (action === undefined || (typeof action === "string" && action.trim()))
        ? destination : null,
    })),
  };
}
