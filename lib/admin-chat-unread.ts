export async function adminChatUnread(database: any, staffId: string) {
  const { results } = await database.prepare(`
    SELECT m.order_id AS orderId, o.order_number AS orderNumber,
      COUNT(*) AS unread, MAX(m.id) AS latestId,
      SUM(COUNT(*)) OVER () AS totalUnread
    FROM order_chat_messages m JOIN orders o ON o.id=m.order_id
    LEFT JOIN admin_order_chat_reads r ON r.order_id=m.order_id AND r.staff_id=?
    WHERE m.sender_role='customer' AND m.id>COALESCE(r.last_message_id,0)
    GROUP BY m.order_id ORDER BY MAX(m.id) DESC LIMIT 200
  `).bind(staffId).all();
  return { total: Number(results[0]?.totalUnread ?? 0), orders: results.map(({ totalUnread, ...row }: any) => row) };
}

// Acknowledge only a customer message actually fetched by the open thread.
// Never use MAX(id) here: a new message may arrive while this request is in flight.
export async function markAdminChatRead(database: any, staffId: string, orderId: string, messageId: number) {
  if (!Number.isSafeInteger(messageId) || messageId <= 0) return false;
  const result = await database.prepare(`
    INSERT INTO admin_order_chat_reads(staff_id,order_id,last_message_id)
    SELECT ?,order_id,id FROM order_chat_messages WHERE id=? AND order_id=? AND sender_role='customer'
    ON CONFLICT(staff_id,order_id) DO UPDATE
      SET last_message_id=MAX(admin_order_chat_reads.last_message_id,excluded.last_message_id)
  `).bind(staffId,messageId,orderId).run();
  return result.meta.changes > 0;
}
