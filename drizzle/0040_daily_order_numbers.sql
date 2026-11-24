ALTER TABLE orders ADD COLUMN order_number TEXT;
CREATE UNIQUE INDEX idx_orders_order_number ON orders(order_number);

CREATE TABLE cafe_order_sequences (
  business_day TEXT PRIMARY KEY NOT NULL,
  last_number INTEGER NOT NULL CONSTRAINT positive_cafe_order_sequence CHECK (last_number > 0)
);
