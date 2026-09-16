CREATE TABLE IF NOT EXISTS staging_customers (
    email TEXT,
    full_name TEXT,
    city TEXT
);

CREATE TABLE IF NOT EXISTS staging_products (
    sku TEXT,
    name TEXT,
    price NUMERIC(12,2),
    stock INTEGER
);

CREATE TABLE IF NOT EXISTS staging_orders (
    order_ref TEXT,
    customer_email TEXT,
    status TEXT,
    created_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS staging_order_items (
    order_ref TEXT,
    sku TEXT,
    quantity INTEGER,
    unit_price NUMERIC(12,2)
);