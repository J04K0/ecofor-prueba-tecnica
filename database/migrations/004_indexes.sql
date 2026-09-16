-- Índices para filtros, paginación y relaciones.
-- CONCURRENTLY evita bloquear las escrituras durante
-- la construcción de índices en tablas grandes.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_created_at_id
ON orders (created_at DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_status_created_at_id
ON orders (status, created_at DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_customer_id
ON orders (customer_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_items_order_id
ON order_items (order_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_items_product_id
ON order_items (product_id);

-- Extensión necesaria para búsqueda parcial eficiente
-- case-insensitive sobre el nombre del cliente.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_full_name_trgm
ON customers USING GIN (full_name gin_trgm_ops);