export type OrderReference = {
  id: string;
  order_number?: string | null;
};

export function orderReference(order: OrderReference) {
  return order.order_number || order.id;
}
