export function isPrepaidCheckoutId(value: string | null): value is string {
  return /^PC-[A-F0-9]{32}$/.test(value || "");
}
