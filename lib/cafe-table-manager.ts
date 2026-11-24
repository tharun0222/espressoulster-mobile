import { bookingsOverlap } from './table-booking.ts';

type TimeRange = { start_at: number; end_at: number };
type Reservation = TimeRange & { id: string; table_ids: string };
type CafeTable = { id: string; seats: number };

export const tableUnavailableMessage = 'This table is no longer available. Choose another table or ask the café team.';
export function isCafeTableConflict(error: unknown) {
  return /Cafe table (conflict|unavailable|is allocated|visit in progress)/.test(String(error));
}

export function reservedCafeTableIds(reservations: Reservation[], range: TimeRange, exceptId?: string) {
  return new Set(reservations.filter(row => row.id !== exceptId && bookingsOverlap(row, range))
    .flatMap(row => JSON.parse(row.table_ids || '[]') as string[]));
}

export async function freeCafeBookingTables(db: Pick<D1Database, 'prepare'>, range: TimeRange) {
  const tables = await db.prepare(`
    SELECT t.id,t.seats FROM cafe_tables t WHERE t.enabled=1
      AND NOT EXISTS (SELECT 1 FROM live_cafe_table_schedule s WHERE s.table_id=t.id AND s.start_at<? AND s.end_at>?)
    ORDER BY t.id
  `).bind(range.end_at, range.start_at).all<CafeTable>();
  return tables.results;
}

export async function cafeSeatsForTime(db: Pick<D1Database, 'prepare'>, range: TimeRange) {
  return (await freeCafeBookingTables(db, range)).reduce((seats, table) => seats + table.seats, 0);
}

export function fitCafeTables(tables: CafeTable[], guests: number) {
  const bySeats = new Map<number, string[]>([[0, []]]);
  for (const table of tables) {
    for (const [count, chosen] of [...bySeats]) {
      const seats = count + table.seats;
      if (!bySeats.has(seats) || bySeats.get(seats)!.length > chosen.length + 1) {
        bySeats.set(seats, [...chosen, table.id]);
      }
    }
  }
  const fits = [...bySeats].filter(([seats]) => seats >= guests);
  return fits.sort(([seatsA, a], [seatsB, b]) => seatsA - seatsB || a.length - b.length)[0]?.[1] ?? [];
}

const availableForDineIn = `(
 EXISTS (SELECT 1 FROM live_cafe_table_schedule v WHERE v.table_id=chosen.id AND v.kind='visit'
   AND v.customer_id=orders.user_id)
 OR NOT EXISTS (
   SELECT 1 FROM live_cafe_table_schedule s WHERE s.table_id=chosen.id
    AND (
      (s.kind IN ('visit','scan') AND s.customer_id<>orders.user_id)
      OR (s.kind IN ('booking','hold')
           AND NOT (s.kind='booking' AND s.customer_id=orders.user_id AND s.start_at<=unixepoch())
           AND s.start_at<COALESCE(
             (SELECT own.end_at FROM live_cafe_table_schedule own
                WHERE own.table_id=chosen.id AND own.customer_id=orders.user_id AND own.start_at<=unixepoch()
                  AND own.kind IN ('booking','scan') ORDER BY CASE own.kind WHEN 'scan' THEN 0 ELSE 1 END LIMIT 1),
             unixepoch()+5400))
    )
 )
)`;

export async function dineInTableOptions(db: Pick<D1Database, 'prepare'>, orderIds: string[]) {
  const options: Record<string, string[]> = Object.fromEntries(orderIds.map(id => [id, []]));
  if (!orderIds.length) return options;
  const placeholders = orderIds.map(() => '?').join(',');
  const rows = await db.prepare(`
    SELECT orders.id AS order_id, chosen.id AS table_id
    FROM orders CROSS JOIN cafe_tables chosen
    WHERE orders.id IN (${placeholders}) AND orders.fulfillment='dine_in'
      AND orders.status NOT IN ('cancelled','completed') AND chosen.enabled=1
      AND ${availableForDineIn}
    ORDER BY chosen.id
  `).bind(...orderIds).all<{ order_id: string; table_id: string }>();
  for (const row of rows.results) options[row.order_id].push(row.table_id);
  return options;
}
