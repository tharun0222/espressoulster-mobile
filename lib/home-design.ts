export const homeSections = {
  greeting: "Greeting",
  outlet: "Café location",
  ordering: "Dine-in and takeaway",
  showcase: "Featured drinks",
  discovery: "Menu search and categories",
  recentOrder: "Order again",
  shortcuts: "Café shortcuts",
  bookings: "Table bookings",
  promotions: "Home banners",
  offers: "Offers",
} as const;

export type HomeSection = keyof typeof homeSections;

const defaultCopy = {
  greeting: "",
  greetingSubtitle: "",
  outletAction: "View café",
  dineInLabel: "Dine in",
  takeAwayLabel: "Take away",
  searchPlaceholder: "Search coffee & food",
  heroImage: "",
  heroTitle: "",
  heroAction: "Explore the menu",
};

export type HomeDesign = {
  sections: { id: HomeSection; visible: boolean }[];
  copy: typeof defaultCopy;
};

const sectionIds = Object.keys(homeSections) as HomeSection[];
export const defaultHomeDesign: HomeDesign = {
  sections: sectionIds.map(id => ({ id, visible: true })),
  copy: defaultCopy,
};

export function parseHomeDesign(input: unknown): HomeDesign | null {
  if (typeof input !== "object" || input === null) return null;
  const { sections, copy } = input as Partial<HomeDesign>;
  if (!Array.isArray(sections) || sections.length !== sectionIds.length || !copy || typeof copy !== "object") return null;
  const seen = new Set<HomeSection>();
  const layout: HomeDesign["sections"] = [];
  for (const section of sections) {
    if (!section || !sectionIds.includes(section.id) || seen.has(section.id) ||
      typeof section.visible !== "boolean") return null;
    seen.add(section.id);
    layout.push({ id: section.id, visible: section.visible });
  }
  const content = { ...defaultCopy };
  for (const key of Object.keys(defaultCopy) as (keyof typeof defaultCopy)[]) {
    const value = copy[key];
    const limit = key === "heroImage" ? 512 : key === "greetingSubtitle" ? 150 : 60;
    if (typeof value !== "string" || value.length > limit) return null;
    content[key] = value.trim() || defaultCopy[key];
  }
  if (content.heroImage && !/^\/(?:api\/images|images)\/[A-Za-z0-9_.\/-]+$/.test(content.heroImage)) return null;
  return { sections: layout, copy: content };
}

export const defaultHomeDesignRevision = "default";

export async function readHomeDesign(db: Pick<D1Database, "prepare">, currentRevision?: string) {
  const row = await db.prepare("SELECT data FROM settings WHERE id='home-design'").first<{ data: string }>();
  const saved = row ? JSON.parse(row.data) : null;
  const revision = typeof saved?.revision === "string" ? saved.revision : defaultHomeDesignRevision;
  return {
    revision,
    design: revision === currentRevision ? null : parseHomeDesign(saved?.design) ?? defaultHomeDesign,
  };
}
