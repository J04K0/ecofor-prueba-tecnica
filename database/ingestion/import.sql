-- =========================================================
-- INGESTA IDEMPOTENTE
-- Ejecutar desde la raíz del proyecto con:
-- psql -d prueba_tecnica -f database/ingestion/import.sql
-- =========================================================

\echo '=== Iniciando ingesta ==='

-- 1. Limpiar staging
TRUNCATE staging_customers;
TRUNCATE staging_products;
TRUNCATE staging_orders;
TRUNCATE staging_order_items;

-- 2. Cargar CSV originales a staging
\echo 'Cargando customers.csv...'
\copy staging_customers(email, full_name, city) FROM 'data/customers.csv' WITH (FORMAT csv, HEADER true);

\echo 'Cargando products.csv...'
\copy staging_products(sku, name, price, stock) FROM 'data/products.csv' WITH (FORMAT csv, HEADER true);

\echo 'Cargando orders.csv...'
\copy staging_orders(order_ref, customer_email, status, created_at) FROM 'data/orders.csv' WITH (FORMAT csv, HEADER true);

\echo 'Cargando order_items.csv...'
\copy staging_order_items(order_ref, sku, quantity, unit_price) FROM 'data/order_items.csv' WITH (FORMAT csv, HEADER true);


-- =========================================================
-- 3. CLIENTES
-- Deduplicamos por email.
-- =========================================================

\echo 'Procesando clientes...'

INSERT INTO customers (email, full_name, city)
SELECT DISTINCT ON (email)
       email,
       full_name,
       city
FROM staging_customers
WHERE email IS NOT NULL
ORDER BY email
ON CONFLICT (email) DO UPDATE
SET
    full_name = EXCLUDED.full_name,
    city = EXCLUDED.city;


-- =========================================================
-- 4. PRODUCTOS
-- Deduplicamos por SKU.
-- =========================================================

\echo 'Procesando productos...'

INSERT INTO products (sku, name, price, stock)
SELECT DISTINCT ON (sku)
       sku,
       name,
       price,
       stock
FROM staging_products
WHERE sku IS NOT NULL
  AND price >= 0
  AND stock >= 0
ORDER BY sku
ON CONFLICT (sku) DO UPDATE
SET
    name = EXCLUDED.name,
    price = EXCLUDED.price,
    stock = EXCLUDED.stock;


-- =========================================================
-- 5. PEDIDOS
-- Solo cargamos pedidos cuyo cliente existe.
-- =========================================================

\echo 'Procesando pedidos...'

INSERT INTO orders (
    order_ref,
    customer_id,
    status,
    created_at
)
SELECT DISTINCT ON (so.order_ref)
       so.order_ref,
       c.id,
       so.status,
       so.created_at
FROM staging_orders so
JOIN customers c
    ON c.email = so.customer_email
WHERE so.order_ref IS NOT NULL
  AND so.created_at IS NOT NULL
  AND so.status IN ('pending', 'paid', 'shipped', 'cancelled')
ORDER BY so.order_ref
ON CONFLICT (order_ref) DO UPDATE
SET
    customer_id = EXCLUDED.customer_id,
    status = EXCLUDED.status,
    created_at = EXCLUDED.created_at;


-- =========================================================
-- 6. ORDER ITEMS
--
-- No existe un identificador único del item en el CSV.
-- Para hacer la carga repetible eliminamos solamente los
-- items pertenecientes a las órdenes del dataset y luego
-- los reconstruimos desde staging.
-- =========================================================

\echo 'Reemplazando items correspondientes al dataset...'

DELETE FROM order_items oi
USING orders o
WHERE oi.order_id = o.id
  AND EXISTS (
      SELECT 1
      FROM staging_orders so
      WHERE so.order_ref = o.order_ref
  );


\echo 'Procesando order items...'

INSERT INTO order_items (
    order_id,
    product_id,
    quantity,
    unit_price
)
SELECT
    o.id,
    p.id,
    soi.quantity,
    soi.unit_price
FROM staging_order_items soi
JOIN orders o
    ON o.order_ref = soi.order_ref
JOIN products p
    ON p.sku = soi.sku
WHERE soi.quantity > 0
  AND soi.unit_price >= 0;


-- =========================================================
-- 7. RESUMEN
-- =========================================================

\echo '=== Resultado de la ingesta ==='

SELECT COUNT(*) AS customers FROM customers;
SELECT COUNT(*) AS products FROM products;
SELECT COUNT(*) AS orders FROM orders;
SELECT COUNT(*) AS order_items FROM order_items;

\echo '=== Registros descartados ==='

SELECT COUNT(*) AS orders_without_customer
FROM staging_orders so
LEFT JOIN customers c
    ON c.email = so.customer_email
WHERE c.id IS NULL;

SELECT COUNT(*) AS items_without_order
FROM staging_order_items soi
LEFT JOIN orders o
    ON o.order_ref = soi.order_ref
WHERE o.id IS NULL;

SELECT COUNT(*) AS items_without_product
FROM staging_order_items soi
LEFT JOIN products p
    ON p.sku = soi.sku
WHERE p.id IS NULL;

\echo '=== Ingesta finalizada ==='