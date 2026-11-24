type OrderPayment = {
  fulfillment: string;
  checkout_payment_method?: string | null;
};

export function paysAtCafe(order: OrderPayment) {
  const method = order.checkout_payment_method;
  if (method) return method === "pay_at_pickup" || method === "pay_at_counter";
  // Older orders did not store checkout selection. Treat pickup and dine-in as café collection.
  return order.fulfillment === "pickup" || order.fulfillment === "dine_in";
}
