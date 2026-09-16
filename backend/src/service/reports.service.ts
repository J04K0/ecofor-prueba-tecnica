import { pool } from "../db/index.js";

export async function getTopCustomers(asOf?: string) {
  const result = await pool.query(
    `
    WITH params AS (
      SELECT COALESCE(
        $1::timestamptz,
        NOW()
      ) AS as_of
    ),
    order_totals AS (
      SELECT
        o.id,
        o.customer_id,
        SUM(oi.quantity * oi.unit_price) AS total
      FROM orders o
      JOIN order_items oi
        ON oi.order_id = o.id
      CROSS JOIN params p
      WHERE o.status <> 'cancelled'
        AND o.created_at >= p.as_of - INTERVAL '30 days'
        AND o.created_at <= p.as_of
      GROUP BY
        o.id,
        o.customer_id
    )
    SELECT
      c.id AS customer_id,
      c.full_name,
      ROUND(SUM(ot.total), 2)::text AS total_amount,
      COUNT(*)::int AS order_count,
      ROUND(AVG(ot.total), 2)::text AS average_ticket
    FROM order_totals ot
    JOIN customers c
      ON c.id = ot.customer_id
    GROUP BY
      c.id,
      c.full_name
    ORDER BY
      SUM(ot.total) DESC,
      c.id
    LIMIT 10
    `,
    [asOf ?? null]
  );

  return {
    as_of: asOf ?? new Date().toISOString(),
    period_days: 30,
    data: result.rows.map((customer) => ({
      customer_id: customer.customer_id,
      full_name: customer.full_name,
      total_amount: customer.total_amount,
      order_count: customer.order_count,
      average_ticket: customer.average_ticket,
    })),
  };
}