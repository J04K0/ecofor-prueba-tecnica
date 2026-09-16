import { pool } from "../db/index.js";
import { randomUUID } from "crypto";

interface OrderItemInput {
  product_id: number;
  quantity: number;
}

interface CreateOrderInput {
  customer_id: number;
  items: OrderItemInput[];
}

interface ProductRow{
    id: number;
    name: string;
    price: string;
    stock: number;
}

export async function createOrder(data: CreateOrderInput) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const customerResult = await client.query(
      "SELECT id FROM customers WHERE id = $1",
      [data.customer_id]
    );

    if (customerResult.rowCount === 0) {
      throw {
        status: 404,
        message: "Cliente no encontrado",
      };
    }

    const quantities = new Map<number, number>();

    for (const item of data.items) {
      quantities.set(
        item.product_id,
        (quantities.get(item.product_id) ?? 0) + item.quantity
      );
    }

    const productIds = Array.from(quantities.keys()).sort(
      (a, b) => a - b
    );

    const productsResult = await client.query<ProductRow>(
      `
      SELECT id, name, price, stock
      FROM products
      WHERE id = ANY($1::bigint[])
      ORDER BY id
      FOR UPDATE
      `,
      [productIds]
    );

    if (productsResult.rows.length !== productIds.length) {
      throw {
        status: 404,
        message: "Uno o más productos no existen",
      };
    }

    // 4. Comprobar stock mientras las filas están bloqueadas
    for (const product of productsResult.rows) {
      const requestedQuantity = quantities.get(Number(product.id))!;

      if (product.stock < requestedQuantity) {
        throw {
          status: 409,
          message: `Stock insuficiente para el producto ${product.name}`,
        };
      }
    }

    const orderRef = randomUUID();

    const orderResult = await client.query(
      `
      INSERT INTO orders (
        order_ref,
        customer_id,
        status,
        created_at
      )
      VALUES ($1, $2, 'pending', NOW())
      RETURNING
        id,
        order_ref,
        customer_id,
        status,
        created_at,
        channel
      `,
      [orderRef, data.customer_id]
    );

    const order = orderResult.rows[0];

    for (const product of productsResult.rows) {
      const quantity = quantities.get(Number(product.id))!;

      await client.query(
        `
        UPDATE products
        SET stock = stock - $1
        WHERE id = $2
        `,
        [quantity, product.id]
      );

      await client.query(
        `
        INSERT INTO order_items (
          order_id,
          product_id,
          quantity,
          unit_price
        )
        VALUES ($1, $2, $3, $4)
        `,
        [
          order.id,
          product.id,
          quantity,
          product.price,
        ]
      );
    }

    await client.query("COMMIT");

    return {
      ...order,
      items: productsResult.rows.map((product) => ({
        product_id: Number(product.id),
        name: product.name,
        quantity: quantities.get(Number(product.id)),
        unit_price: Number(product.price).toFixed(2),
      })),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

interface ListOrdersFilters {
  status?: string;
  from?: string;
  to?: string;
  customer?: string;
  pageSize?: number;
  cursor?: string;
}

interface OrderCursor {
  created_at: string;
  id: string;
}

function encodeCursor(cursor: OrderCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeCursor(cursor: string): OrderCursor {
  try {
    const decoded = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8")
    );

    if (!decoded.created_at || !decoded.id) {
      throw new Error();
    }

    return decoded;
  } catch {
    throw {
      status: 400,
      message: "Cursor inválido",
    };
  }
}

export async function listOrders(filters: ListOrdersFilters) {
  const pageSize = Math.min(filters.pageSize ?? 20, 100);

  const conditions: string[] = [];
  const values: unknown[] = [];

  if (filters.status) {
    values.push(filters.status);
    conditions.push(`o.status = $${values.length}`);
  }

  if (filters.from) {
    values.push(filters.from);
    conditions.push(`o.created_at >= $${values.length}::timestamptz`);
  }

  if (filters.to) {
    values.push(filters.to);
    conditions.push(`o.created_at <= $${values.length}::timestamptz`);
  }

  if (filters.customer) {
    values.push(`%${filters.customer}%`);
    conditions.push(`c.full_name ILIKE $${values.length}`);
  }

  if (filters.cursor) {
    const cursor = decodeCursor(filters.cursor);

    values.push(cursor.created_at);
    const datePosition = values.length;

    values.push(cursor.id);
    const idPosition = values.length;

    conditions.push(`
      (o.created_at, o.id) <
      ($${datePosition}::timestamptz, $${idPosition}::bigint)
    `);
  }

  const where =
    conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

  // Solicitamos uno adicional para saber si existe otra página.
  values.push(pageSize + 1);
  const limitPosition = values.length;

  const result = await pool.query(
    `
    WITH page AS (
      SELECT
        o.id,
        o.order_ref,
        o.status,
        o.created_at,
        o.channel,
        o.customer_id,
        c.full_name
      FROM orders o
      JOIN customers c
        ON c.id = o.customer_id
      ${where}
      ORDER BY o.created_at DESC, o.id DESC
      LIMIT $${limitPosition}
    )
    SELECT
      p.id,
      p.order_ref,
      p.status,
      p.created_at,
      p.channel,
      p.customer_id,
      p.full_name,
      COALESCE(
        SUM(oi.quantity * oi.unit_price),
        0
      )::numeric(14,2)::text AS amount
    FROM page p
    LEFT JOIN order_items oi
      ON oi.order_id = p.id
    GROUP BY
      p.id,
      p.order_ref,
      p.status,
      p.created_at,
      p.channel,
      p.customer_id,
      p.full_name
    ORDER BY p.created_at DESC, p.id DESC
    `,
    values
  );

  const hasNextPage = result.rows.length > pageSize;
  const rows = result.rows.slice(0, pageSize);

  const lastOrder = rows[rows.length - 1];

  const nextCursor =
    hasNextPage && lastOrder
      ? encodeCursor({
          created_at: lastOrder.created_at.toISOString(),
          id: String(lastOrder.id),
        })
      : null;

  return {
    data: rows.map((order) => ({
      id: order.id,
      order_ref: order.order_ref,
      status: order.status,
      created_at: order.created_at,
      channel: order.channel,
      customer: {
        id: order.customer_id,
        full_name: order.full_name,
      },
      amount: order.amount,
    })),

    pagination: {
      page_size: pageSize,
      has_next_page: hasNextPage,
      next_cursor: nextCursor,
    },
  };
}
export async function getOrderById(orderId: number) {
  const orderResult = await pool.query(
    `
    SELECT
      o.id,
      o.order_ref,
      o.status,
      o.created_at,
      o.channel,
      c.id AS customer_id,
      c.full_name,
      c.email,
      c.city,
      COALESCE(
        SUM(oi.quantity * oi.unit_price),
        0
      )::numeric(14,2)::text AS amount
    FROM orders o
    JOIN customers c
      ON c.id = o.customer_id
    LEFT JOIN order_items oi
      ON oi.order_id = o.id
    WHERE o.id = $1
    GROUP BY
      o.id,
      o.order_ref,
      o.status,
      o.created_at,
      o.channel,
      c.id,
      c.full_name,
      c.email,
      c.city
    `,
    [orderId]
  );

  if (orderResult.rowCount === 0) {
    throw {
      status: 404,
      message: "Orden no encontrada",
    };
  }

  const itemsResult = await pool.query(
    `
    SELECT
      oi.product_id,
      p.sku,
      p.name,
      oi.quantity,
      oi.unit_price::numeric(12,2)::text AS unit_price,
      (oi.quantity * oi.unit_price)::numeric(14,2)::text AS line_total
    FROM order_items oi
    JOIN products p
      ON p.id = oi.product_id
    WHERE oi.order_id = $1
    ORDER BY oi.id
    `,
    [orderId]
  );

  const order = orderResult.rows[0];

  return {
    id: order.id,
    order_ref: order.order_ref,
    status: order.status,
    created_at: order.created_at,
    channel: order.channel,

    customer: {
      id: order.customer_id,
      full_name: order.full_name,
      email: order.email,
      city: order.city,
    },

    items: itemsResult.rows.map((item) => ({
      product_id: item.product_id,
      sku: item.sku,
      name: item.name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      line_total: item.line_total,
    })),

    amount: order.amount,
  };
}