export function adminSection(value: unknown) {
  return value === "subscriptions" || value === "advertising" || value === "orders" ? value : undefined;
}

export function adminOrderLink(value: unknown) {
  return typeof value === "string" && /^CH-[A-F0-9]{8}$/.test(value) ? value : undefined;
}

export const sampleCarouselPreview = "sample-carousel";

export function adminSectionPath(params: URLSearchParams) {
  const section = adminSection(params.get("section"));
  const preview = section === "advertising" && params.get("preview") === sampleCarouselPreview;
  const order = section === "orders" ? adminOrderLink(params.get("order")) : undefined;
  return section ? `/admin?section=${section}${preview ? `&preview=${sampleCarouselPreview}` : ""}${order ? `&order=${order}` : ""}` : "/admin";
}
