export type OrderType = 'dine_in' | 'pickup' | 'delivery';

export type OrderTypeSettings = {
  dineInEnabled?: boolean;
  pickupEnabled?: boolean;
  deliveryEnabled?: boolean;
};

export function enabledOrderTypes(settings: OrderTypeSettings): OrderType[] {
  const modes: OrderType[] = [];
  if (settings.dineInEnabled) modes.push('dine_in');
  if (settings.pickupEnabled) modes.push('pickup');
  if (settings.deliveryEnabled) modes.push('delivery');
  return modes;
}

export function resolveOrderType(saved: unknown, settings: OrderTypeSettings, fromTableQr = false): OrderType {
  const enabled = enabledOrderTypes(settings);
  if (fromTableQr && enabled.includes('dine_in')) return 'dine_in';
  if (enabled.includes(saved as OrderType)) return saved as OrderType;
  return enabled.includes('pickup') ? 'pickup' : enabled[0] || 'pickup';
}

export function orderTypeStorageKey(customerId: string) {
  return `espresso-order-type:${encodeURIComponent(customerId || 'guest')}`;
}
