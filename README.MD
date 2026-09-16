# Sistema de gestión de pedidos

Prueba técnica full stack construida con **PostgreSQL 15+**, **Node.js 20+**, **Express**, **express-validator**, **React 19** y **TypeScript**.

El sistema importa cuatro datasets masivos, expone una API HTTP para crear, consultar y analizar pedidos, resuelve descuentos y ofrece un cliente web organizado por features.

## Contenido

- [Requisitos](#requisitos)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Configuración y ejecución](#configuración-y-ejecución)
- [Modelo de datos](#modelo-de-datos)
- [Ingesta idempotente](#ingesta-idempotente)
- [Migración de `channel` sobre 50 millones de filas](#migración-de-channel-sobre-50-millones-de-filas)
- [Índices](#índices)
- [API HTTP](#api-http)
- [Consultas y decisiones técnicas por endpoint](#consultas-y-decisiones-técnicas-por-endpoint)
- [Concurrencia de stock](#concurrencia-de-stock)
- [Descuentos](#descuentos)
- [Frontend](#frontend)
- [Pruebas realizadas](#pruebas-realizadas)
- [Uso de inteligencia artificial](#uso-de-inteligencia-artificial)

## Requisitos

- Node.js 20 o superior.
- npm.
- PostgreSQL 15 o superior.
- `psql` disponible en la terminal.
- Permisos para crear una base de datos y habilitar la extensión `pg_trgm`.
- Los cuatro CSV dentro de `data/`, codificados en UTF-8, separados por comas y con cabecera:
  - `customers.csv`: 50.000 filas.
  - `products.csv`: 10.000 filas.
  - `orders.csv`: 1.000.000 filas.
  - `order_items.csv`: 3.000.000 filas.

## Estructura del proyecto

```text
.
├── ai-sessions/
├── backend/
│   ├── scripts/
│   │   └── concurrency-test.ts
│   └── src/
│       ├── controllers/
│       ├── db/
│       ├── routes/
│       ├── services/
│       └── index.ts
├── data/
│   ├── customers.csv
│   ├── products.csv
│   ├── orders.csv
│   └── order_items.csv
├── database/
│   ├── ingestion/
│   │   └── import.sql
│   └── migrations/
│       ├── 001_initial_schema.sql
│       ├── 002_add_order_channel.sql
│       ├── 003_staging.sql
│       └── 004_indexes.sql
├── frontend/
│   └── src/
│       └── features/
│           └── orders/
│               ├── components/
│               ├── containers/
│               ├── hooks/
│               ├── services/
│               └── types/
└── README.md
```

## Configuración y ejecución

Todos los comandos de esta sección se ejecutan desde la raíz del repositorio, salvo que se indique lo contrario.

## Antes de ejecutar

Es necesario añadir a la carpeta "data" los datasets manualmente, ya que no dejaba cargar tanto peso en github

### 1. Crear la base de datos

```bash
createdb prueba_tecnica
```

Alternativamente:

```bash
psql postgres -c "CREATE DATABASE prueba_tecnica;"
```

### 2. Ejecutar las migraciones e importar los datos

El orden recomendado reproduce el escenario real de una tabla `orders` ya poblada antes de agregar `channel`:

```bash
psql -v ON_ERROR_STOP=1 -d prueba_tecnica \
  -f database/migrations/001_initial_schema.sql

psql -v ON_ERROR_STOP=1 -d prueba_tecnica \
  -f database/migrations/003_staging.sql

psql -v ON_ERROR_STOP=1 -d prueba_tecnica \
  -f database/ingestion/import.sql

psql -v ON_ERROR_STOP=1 -d prueba_tecnica \
  -f database/migrations/002_add_order_channel.sql

psql -v ON_ERROR_STOP=1 -d prueba_tecnica \
  -f database/migrations/004_indexes.sql
```

`004_indexes.sql` usa `CREATE INDEX CONCURRENTLY`: debe ejecutarse directamente con `psql` y **no** dentro de `BEGIN ... COMMIT`.

El script de ingesta utiliza rutas relativas como `data/customers.csv`; por eso debe invocarse desde la raíz del repositorio.

### 3. Configurar el backend

Crear `backend/.env`:

```env
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=prueba_tecnica
DB_USER=tu_usuario_postgresql
DB_PASSWORD=tu_contraseña_postgresql
```

No se debe versionar este archivo.

Instalar, compilar y ejecutar:

```bash
cd backend
npm install
npm run build
npm run dev
```

La API queda disponible en `http://localhost:3000`.

Comprobación rápida:

```bash
curl http://localhost:3000/health
```

Respuesta esperada:

```json
{
  "status": "ok",
  "database": "connected"
}
```

### 4. Configurar el frontend

En otra terminal:

```bash
cd frontend
npm install
npm run build
npm run lint
npm run dev
```

El cliente queda disponible en `http://localhost:5173` y consume la API en `http://localhost:3000` mediante `fetch` nativo.

## Modelo de datos

```text
customers 1 ──────< orders 1 ──────< order_items >────── 1 products
```

### `customers`

- `id BIGSERIAL PRIMARY KEY`
- `email VARCHAR(255) NOT NULL UNIQUE`
- `full_name VARCHAR(255) NOT NULL`
- `city VARCHAR(255) NOT NULL`

### `products`

- `id BIGSERIAL PRIMARY KEY`
- `sku VARCHAR(100) NOT NULL UNIQUE`
- `name VARCHAR(255) NOT NULL`
- `price NUMERIC(12,2) NOT NULL`
- `stock INTEGER NOT NULL CHECK (stock >= 0)`

### `orders`

- `id BIGSERIAL PRIMARY KEY`
- `order_ref VARCHAR(100) NOT NULL UNIQUE`
- `customer_id BIGINT NOT NULL REFERENCES customers(id)`
- `status VARCHAR(20) NOT NULL`
- `created_at TIMESTAMPTZ NOT NULL`
- `channel VARCHAR(50) NOT NULL DEFAULT 'web'`, agregado por la migración `002`.
- Restricción de estado: `pending`, `paid`, `shipped` o `cancelled`.

### `order_items`

- `id BIGSERIAL PRIMARY KEY`
- `order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE`
- `product_id BIGINT NOT NULL REFERENCES products(id)`
- `quantity INTEGER NOT NULL CHECK (quantity > 0)`
- `unit_price NUMERIC(12,2) NOT NULL`

`unit_price` se guarda en el ítem para preservar el precio vigente en el momento de la compra. El monto de una línea es `quantity * unit_price` y el monto de un pedido es la suma de sus líneas.

Se utiliza `TIMESTAMPTZ` para conservar correctamente los instantes UTC de los CSV y `NUMERIC(...,2)` para evitar errores binarios en valores monetarios persistidos.

## Ingesta idempotente

El archivo `database/ingestion/import.sql` carga primero los CSV en tablas de staging sin restricciones de unicidad o claves foráneas:

```text
CSV → staging → validación/deduplicación → tablas del dominio
```

Esta estrategia permite procesar los errores intencionales de los datasets sin desactivar la integridad del modelo final.

### Comportamiento

1. Vacía las cuatro tablas de staging con `TRUNCATE`.
2. Usa `\copy`, adecuado para millones de filas y más eficiente que ejecutar un `INSERT` por registro.
3. Deduplica clientes por `email` y productos por `sku` con `DISTINCT ON`.
4. Inserta o actualiza clientes, productos y pedidos con `ON CONFLICT ... DO UPDATE`.
5. Solo inserta pedidos cuyo cliente existe.
6. Solo inserta ítems cuyo pedido y producto existen.
7. Como el CSV de ítems no trae un identificador único, elimina previamente los ítems pertenecientes a las órdenes presentes en el dataset y los vuelve a insertar. Así, repetir la carga no duplica líneas.
8. Imprime conteos finales y registros descartados.

### Resultado observado

| Entidad | Filas del CSV | Filas válidas finales | Motivo principal de descarte |
|---|---:|---:|---|
| Clientes | 50.000 | 48.900 | Emails duplicados |
| Productos | 10.000 | 9.800 | SKU duplicados |
| Pedidos | 1.000.000 | 990.000 | 10.000 referencias a clientes inexistentes |
| Ítems | 3.000.000 | 2.955.028 | 44.972 referencias a pedidos descartados |

No se encontraron ítems con SKU inexistente ni con cantidad/precio inválido. El monto agregado observado en los ítems válidos fue `314267219179.70`.

La ingesta se ejecutó dos veces. En la segunda ejecución se eliminaron y reinsertaron exactamente `2.955.028` ítems, y los conteos finales permanecieron iguales, verificando la idempotencia.

## Migración de `channel` sobre 50 millones de filas

La migración `002_add_order_channel.sql` agrega `channel VARCHAR(50) NOT NULL DEFAULT 'web'` sin realizar un `UPDATE` masivo ni detener deliberadamente el servicio:

```sql
SET lock_timeout = '5s';

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS channel VARCHAR(50) DEFAULT 'web';

ALTER TABLE orders
ADD CONSTRAINT orders_channel_not_null
CHECK (channel IS NOT NULL) NOT VALID;

ALTER TABLE orders
VALIDATE CONSTRAINT orders_channel_not_null;

ALTER TABLE orders
ALTER COLUMN channel SET NOT NULL;

ALTER TABLE orders
DROP CONSTRAINT orders_channel_not_null;

RESET lock_timeout;
```

### Justificación

- Desde PostgreSQL 11, agregar una columna con un `DEFAULT` constante puede resolverse mediante metadatos, sin reescribir físicamente las 50 millones de filas. Las filas existentes se leen como `web`.
- `CHECK ... NOT VALID` registra la regla sin recorrer de inmediato toda la tabla.
- `VALIDATE CONSTRAINT` realiza la comprobación en una fase separada y permite que continúen las lecturas y escrituras normales.
- Una vez validada la regla, `SET NOT NULL` puede aprovechar la restricción ya comprobada y evita un escaneo completo adicional.
- `lock_timeout = '5s'` evita que la migración espere indefinidamente por los bloqueos breves de catálogo. Si existe contención, falla y puede reintentarse en una ventana menos ocupada.
- Se evita expresamente `UPDATE orders SET channel = 'web'`, porque generaría una reescritura masiva, WAL, bloat y presión de I/O.

En producción, el procedimiento se ejecutaría con monitoreo, primero en una réplica o entorno de volumen equivalente, y con capacidad para reintentar los pasos que requieren bloqueos breves. Aunque no se planifica una interrupción, ningún DDL puede prometer ausencia absoluta de espera: el objetivo es mantenerla acotada mediante el diseño y `lock_timeout`.

La verificación sobre la base cargada confirmó que las `990.000` órdenes existentes quedaron con `channel = 'web'`.

## Índices

`database/migrations/004_indexes.sql` contiene:

```sql
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

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_full_name_trgm
ON customers USING GIN (full_name gin_trgm_ops);
```

`CONCURRENTLY` mantiene disponibles las escrituras mientras se construyen los índices de las tablas grandes. PostgreSQL no permite ejecutar estas sentencias dentro de una transacción explícita.

### Justificación por índice

| Índice | Uso |
|---|---|
| `orders(created_at DESC, id DESC)` | Orden global y paginación keyset estable de `GET /orders`; también ayuda a acotar rangos de fechas. |
| `orders(status, created_at DESC, id DESC)` | Filtro por estado conservando el mismo orden del cursor. |
| `orders(customer_id)` | Relaciones, búsquedas de pedidos por cliente y agregaciones del reporte. |
| `order_items(order_id)` | Detalle de pedido, cálculo del monto del listado, descuentos y reporte. Evita recorrer millones de ítems para una orden. |
| `order_items(product_id)` | Relación inversa y consultas por producto. |
| `GIN (full_name gin_trgm_ops)` | Acelera `ILIKE '%texto%'`, que un B-tree convencional no resuelve eficientemente cuando el patrón comienza con `%`. |

Las claves primarias y las restricciones `UNIQUE` de `customers.email`, `products.sku` y `orders.order_ref` crean además sus propios índices B-tree.

No se agregaron índices para cada posible combinación de filtros: aumentan espacio, costo de escritura y mantenimiento. Se priorizaron los patrones exigidos y medidos. Como optimización futura, si el reporte dominara la carga, se evaluaría un índice parcial por fecha/cliente excluyendo `cancelled`, siempre validándolo con `EXPLAIN (ANALYZE, BUFFERS)` sobre datos representativos.

## API HTTP

Todas las respuestas son JSON. Las entradas se validan con `express-validator` y los montos se serializan con dos decimales.

### Resumen

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/health` | Comprueba API y PostgreSQL. |
| `POST` | `/orders` | Crea una orden y descuenta stock de forma transaccional. |
| `GET` | `/orders` | Lista y filtra órdenes con paginación keyset. |
| `GET` | `/orders/:id` | Devuelve orden, cliente, ítems y monto. |
| `GET` | `/reports/top-customers` | Devuelve los 10 clientes con mayor monto en 30 días. |
| `POST` | `/orders/:id/apply-discounts` | Calcula la mejor combinación de cupones sin modificar la orden. |

### `POST /orders`

Payload:

```json
{
  "customer_id": 2747,
  "items": [
    { "product_id": 3600, "quantity": 2 }
  ]
}
```

Los productos repetidos en el payload se agrupan antes de validar y descontar stock. La orden se crea con `status = pending`, `created_at = NOW()`, `channel = web` y el precio vigente del producto como `unit_price`.

Códigos principales:

- `201 Created`: orden creada.
- `400 Bad Request`: payload inválido.
- `404 Not Found`: cliente o producto inexistente.
- `409 Conflict`: stock insuficiente.
- `500 Internal Server Error`: error inesperado.

### `GET /orders`

Parámetros opcionales:

- `status`: `pending`, `paid`, `shipped` o `cancelled`.
- `from`: instante ISO 8601 inclusivo.
- `to`: instante ISO 8601 inclusivo.
- `customer`: coincidencia parcial, insensible a mayúsculas/minúsculas, sobre `full_name`.
- `page_size`: 20 por defecto; mínimo 1 y máximo 100.
- `cursor`: cursor opaco entregado por la respuesta anterior.

Ejemplo:

```bash
curl "http://localhost:3000/orders?status=paid&customer=Manuel&page_size=20"
```

Respuesta:

```json
{
  "data": [
    {
      "id": "835191",
      "order_ref": "ORD-06C232F7E5",
      "status": "paid",
      "created_at": "2026-09-09T11:59:57.000Z",
      "channel": "web",
      "customer": {
        "id": "10592",
        "full_name": "Antonia García Martínez"
      },
      "amount": "115654.66"
    }
  ],
  "pagination": {
    "page_size": 20,
    "has_next_page": true,
    "next_cursor": "..."
  }
}
```

### `GET /orders/:id`

Devuelve la orden, el cliente, sus ítems con SKU y nombre de producto, el total de cada línea y el monto del pedido. Responde `400` ante un ID inválido y `404` si la orden no existe.

### `GET /reports/top-customers`

Acepta `as_of` como fecha ISO 8601 opcional; por defecto utiliza el instante actual. Incluye órdenes en el intervalo inclusivo `[as_of - 30 días, as_of]`, excluye `cancelled` y retorna los 10 clientes con mayor monto acumulado.

```bash
curl "http://localhost:3000/reports/top-customers?as_of=2026-09-10T00:00:00Z"
```

Cada resultado contiene `customer_id`, `full_name`, `total_amount`, `order_count` y `average_ticket`.

### `POST /orders/:id/apply-discounts`

Ejemplo:

```json
{
  "coupons": [
    {
      "code": "PROMO10",
      "type": "percentage",
      "stackable": true,
      "value": 10,
      "min_amount": 100,
      "applicable_skus": ["SKU-422982"]
    },
    {
      "code": "3X2-ABC",
      "type": "n_for_m",
      "stackable": true,
      "sku": "ABC",
      "n": 3,
      "m": 2
    }
  ]
}
```

Más de 30 cupones responde `400`. Una orden inexistente responde `404`. El cálculo no modifica la orden ni sus ítems.

## Consultas y decisiones técnicas por endpoint

Todas las consultas reciben valores mediante parámetros posicionales; no se interpolan valores del usuario en SQL.

### Creación de pedidos

1. Verificar el cliente:

```sql
SELECT id
FROM customers
WHERE id = $1;
```

Se consulta únicamente la PK requerida. La alternativa de insertar primero y depender solo del error de FK produciría un error menos claro para la API.

2. Bloquear los productos en orden estable:

```sql
SELECT id, name, price, stock
FROM products
WHERE id = ANY($1::bigint[])
ORDER BY id
FOR UPDATE;
```

`FOR UPDATE` serializa las modificaciones de las mismas filas. `ORDER BY id` hace que órdenes con varios productos adquieran los bloqueos en el mismo orden y reduce el riesgo de deadlocks. La cantidad de filas recuperadas también permite detectar IDs inexistentes.

3. Crear la orden:

```sql
INSERT INTO orders (
  order_ref,
  customer_id,
  status,
  created_at
)
VALUES ($1, $2, 'pending', NOW())
RETURNING id, order_ref, customer_id, status, created_at, channel;
```

`order_ref` se genera como UUID. Se usa `RETURNING` para evitar otra consulta. `channel` toma su valor por defecto.

4. Por cada producto bloqueado, descontar stock e insertar el ítem:

```sql
UPDATE products
SET stock = stock - $1
WHERE id = $2;
```

```sql
INSERT INTO order_items (
  order_id,
  product_id,
  quantity,
  unit_price
)
VALUES ($1, $2, $3, $4);
```

Toda la secuencia se ejecuta entre `BEGIN` y `COMMIT`; cualquier error produce `ROLLBACK`. Se descartó validar stock fuera de la transacción porque dos peticiones podrían observar la misma disponibilidad y sobre-vender.

### Listado de pedidos

La consulta sigue esta forma:

```sql
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
  JOIN customers c ON c.id = o.customer_id
  WHERE
    -- filtros presentes, construidos con parámetros:
    -- o.status = $n
    -- o.created_at >= $n::timestamptz
    -- o.created_at <= $n::timestamptz
    -- c.full_name ILIKE $n
    -- (o.created_at, o.id) < ($n::timestamptz, $n::bigint)
  ORDER BY o.created_at DESC, o.id DESC
  LIMIT $n
)
SELECT
  p.id,
  p.order_ref,
  p.status,
  p.created_at,
  p.channel,
  p.customer_id,
  p.full_name,
  COALESCE(SUM(oi.quantity * oi.unit_price), 0)::numeric(14,2)::text AS amount
FROM page p
LEFT JOIN order_items oi ON oi.order_id = p.id
GROUP BY
  p.id,
  p.order_ref,
  p.status,
  p.created_at,
  p.channel,
  p.customer_id,
  p.full_name
ORDER BY p.created_at DESC, p.id DESC;
```

La página de órdenes se determina antes de agregar los ítems; así la suma no altera el límite ni multiplica órdenes. Se solicita `page_size + 1`: el registro adicional solo determina `has_next_page` y no se entrega al cliente.

El cursor codifica en Base64 URL-safe el par `(created_at, id)`. `created_at` proporciona el orden requerido e `id` desempata fechas iguales. La comparación por tupla mantiene exactamente el orden del índice.

Se descartó `OFFSET` porque `OFFSET 900000` obliga a PostgreSQL a recorrer y descartar una gran cantidad de filas, empeora a medida que avanza la navegación y puede producir saltos/inconsistencias ante inserciones concurrentes. La paginación keyset mantiene un costo proporcional al tamaño de página y soporta cardinalidades superiores a un millón.

### Detalle de pedido

Cabecera, cliente y monto:

```sql
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
  COALESCE(SUM(oi.quantity * oi.unit_price), 0)::numeric(14,2)::text AS amount
FROM orders o
JOIN customers c ON c.id = o.customer_id
LEFT JOIN order_items oi ON oi.order_id = o.id
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
  c.city;
```

Ítems:

```sql
SELECT
  oi.product_id,
  p.sku,
  p.name,
  oi.quantity,
  oi.unit_price::numeric(12,2)::text AS unit_price,
  (oi.quantity * oi.unit_price)::numeric(14,2)::text AS line_total
FROM order_items oi
JOIN products p ON p.id = oi.product_id
WHERE oi.order_id = $1
ORDER BY oi.id;
```

Se usan dos consultas porque evita duplicar todos los campos de la cabecera en cada ítem y permite construir una respuesta anidada con claridad. El índice `order_items(order_id)` hace que la segunda consulta lea únicamente las líneas de esa orden. Una alternativa sería `json_agg` en SQL; se descartó para mantener la composición de la respuesta en el servicio y simplificar el manejo de una orden sin ítems.

### Reporte de mejores clientes

```sql
WITH params AS (
  SELECT COALESCE($1::timestamptz, NOW()) AS as_of
),
order_totals AS (
  SELECT
    o.id,
    o.customer_id,
    SUM(oi.quantity * oi.unit_price) AS total
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
  CROSS JOIN params p
  WHERE o.status <> 'cancelled'
    AND o.created_at >= p.as_of - INTERVAL '30 days'
    AND o.created_at <= p.as_of
  GROUP BY o.id, o.customer_id
)
SELECT
  c.id AS customer_id,
  c.full_name,
  ROUND(SUM(ot.total), 2)::text AS total_amount,
  COUNT(*)::int AS order_count,
  ROUND(AVG(ot.total), 2)::text AS average_ticket
FROM order_totals ot
JOIN customers c ON c.id = ot.customer_id
GROUP BY c.id, c.full_name
ORDER BY SUM(ot.total) DESC, c.id
LIMIT 10;
```

Primero se obtiene un total por pedido y después se agregan pedidos por cliente. De este modo, `AVG(ot.total)` es el ticket promedio real; promediar directamente `order_items` daría el promedio de líneas, no de pedidos. El desempate por `c.id` hace determinista el resultado.

### Descuentos

Primero se verifica la existencia de la orden:

```sql
SELECT id
FROM orders
WHERE id = $1;
```

Luego se recuperan sus ítems:

```sql
SELECT
  oi.product_id,
  p.sku,
  oi.quantity,
  oi.unit_price::numeric(12,2)::text AS unit_price
FROM order_items oi
JOIN products p ON p.id = oi.product_id
WHERE oi.order_id = $1
ORDER BY oi.id;
```

El cálculo se realiza en memoria porque la entrada está acotada a 30 cupones y 100 ítems, no requiere persistencia y contiene reglas por tipo que son más claras en TypeScript. Se descartó resolver combinaciones mediante SQL dinámico y también la fuerza bruta de todos los subconjuntos: con 30 cupones implicaría hasta `2^30` combinaciones.

## Concurrencia de stock

`POST /orders` utiliza una única transacción y bloqueos de fila:

```text
BEGIN
  verificar cliente
  agrupar IDs repetidos
  SELECT productos ORDER BY id FOR UPDATE
  validar existencia y stock
  INSERT order
  UPDATE stock + INSERT items
COMMIT
```

Mientras una transacción mantiene el bloqueo de un producto, las solicitudes competidoras esperan. Al obtenerlo, vuelven a leer el stock actualizado y las que ya no tienen disponibilidad responden `409`. El stock nunca se valida mediante una lectura sin bloqueo.

Se conserva `backend/scripts/concurrency-test.ts` como prueba reproducible. Con un producto de stock inicial `10`, se lanzaron 100 solicitudes simultáneas de una unidad:

```text
Solicitudes totales: 100
Órdenes creadas (201): 10
Sin stock (409): 90
Otros errores: 0
Tiempo total del lote: 301.663 ms
Stock final: 0
```

El tiempo corresponde al lote completo de 100 solicitudes y no al requisito de 200 ms del endpoint de descuentos.

Para repetir la prueba, ajustar en el script un `PRODUCT_ID` con stock `10` y un `CUSTOMER_ID` válido, levantar el backend y ejecutar:

```bash
cd backend
npx tsx scripts/concurrency-test.ts
```

## Descuentos

Tipos soportados:

- `percentage`: porcentaje entre 0 y 100 sobre los ítems elegibles.
- `fixed_amount`: monto fijo total distribuido entre los ítems elegibles sin superar su valor.
- `n_for_m`: para un SKU, por cada `n` unidades se pagan `m`; el descuento corresponde a las unidades gratuitas de cada grupo completo.

Condiciones comunes:

- `min_amount`: se evalúa contra el subtotal original.
- `applicable_skus`: limita los ítems elegibles; si se omite, aplica a todos.
- `stackable = false`: el cupón debe evaluarse solo.

### Estrategia de maximización

La semántica permite reducir el problema a estas candidatas:

1. Todos los cupones válidos con `stackable = true` aplicados juntos.
2. Cada cupón válido con `stackable = false` aplicado por separado.

Se elige la candidata con mayor descuento total. No es necesario explorar todos los subconjuntos porque los acumulables compatibles no se excluyen entre sí y cada no acumulable solo puede competir individualmente.

Cada cupón calcula su descuento desde los importes originales. Los descuentos se redondean a dos decimales, se suman por ítem y se topan en el monto original del ítem; el total nunca supera el subtotal del pedido. Un cupón solo aparece como aplicado si produjo un descuento efectivo.

La complejidad es `O(cupones × ítems)`: como máximo 30 × 100 evaluaciones por candidata acumulable, más la evaluación lineal de los no acumulables. El endpoint solo lee dos conjuntos pequeños desde PostgreSQL y no modifica datos.

### Pruebas funcionales y de rendimiento

Se comprobaron, entre otros casos:

- Porcentaje.
- Monto fijo total sobre uno y varios ítems.
- Combinación de porcentaje y monto fijo acumulables.
- Selección de un cupón no acumulable cuando ofrece el mayor descuento.
- `min_amount` cumplido y no cumplido.
- Restricción `applicable_skus`.
- Promoción `n_for_m`/2x1.
- Tope del descuento por ítem y por pedido.
- 30 cupones aceptados.
- 31 cupones rechazados con `400`.

Medición registrada sobre la orden `1980001`, de subtotal `12517.30`, con 30 cupones porcentuales acumulables del 1%:

```text
Status: 200
Tiempo: 111.89 ms
Descuento: 3755.10
```

El descuento resulta de redondear cada cupón de forma independiente a dos decimales (`125.17 × 30`). Esta medición local está por debajo de 200 ms. La orden usada en esa medición tenía un ítem; la implementación y la validación admiten pedidos de hasta 100 ítems según la cota del enunciado.

Los tiempos dependen del hardware, la carga y la configuración de PostgreSQL; el resultado anterior debe interpretarse como una medición reproducible del entorno de desarrollo, no como un SLA universal.

## Frontend

El cliente utiliza:

- React 19 y TypeScript.
- Vite.
- `fetch` nativo; no se usa Axios ni otro cliente HTTP.
- Estado local de React.
- CSS base.

Se eligió estado local porque las tres vistas comparten poca información y no necesitan una caché global compleja. Reduce dependencias y hace explícitos los estados de carga, error, filtros, cursor y orden seleccionada. Redux Toolkit o TanStack Query aportarían valor en una aplicación con más features, invalidaciones y caché compartida, pero serían complejidad adicional para este alcance.

### Arquitectura por feature

```text
src/features/orders/
├── components/   # Presentación: props y callbacks; sin HTTP ni negocio.
├── containers/   # Conectan hooks con componentes y componen cada vista.
├── hooks/        # Orquestan estado, efectos, filtros y acciones.
├── services/     # Único acceso HTTP mediante fetch.
└── types/        # Contratos TypeScript de la feature.
```

Flujo:

```text
Container → hook orquestador → service/fetch → API
    ↓
componente presentacional
```

Los componentes presentacionales reciben datos y callbacks por props; no acceden a estado global, no llaman a la API y no contienen lógica de negocio.

### Vistas

1. **Listado de órdenes**: búsqueda parcial por cliente, filtro por estado, tabla ordenada y carga de la página siguiente mediante cursor. Cada fila abre el detalle.
2. **Creación de orden**: selección/identificación del cliente, composición de ítems y cantidades, envío a `POST /orders`, y presentación del resultado o del error semántico devuelto por la API.
3. **Detalle de orden**: consume `GET /orders/:id` y muestra referencia, estado, fecha, canal, cliente, productos, cantidades, precios y monto total.

Las respuestas del backend se adaptan en la capa `services`; por ejemplo, el detalle utiliza el objeto contenido en `result.data` antes de entregarlo al hook y al componente.

## Pruebas realizadas

### Base de datos

- Creación de las tablas y restricciones.
- Carga masiva de los cuatro CSV.
- Identificación de duplicados y referencias inexistentes.
- Segunda ejecución completa de la ingesta sin cambios en el estado final.
- Verificación de `channel = web` en las órdenes existentes.
- Verificación de los índices creados.

### API

- `POST /orders`: caso exitoso y decremento exacto de stock.
- `POST /orders`: `400` por cantidad inválida.
- `POST /orders`: `404` por cliente inexistente.
- `POST /orders`: `409` por stock insuficiente, sin cambios parciales.
- Concurrencia: 100 solicitudes, 10 creadas, 90 conflictos y stock final 0.
- `GET /orders`: página inicial, siguiente cursor sin repetidos, filtro por estado y búsqueda parcial por cliente.
- `GET /orders`: `400` con `page_size=500`.
- `GET /orders/:id`: `200`, `404` y `400`.
- `GET /reports/top-customers`: ejecución con fecha por defecto y `as_of` validado.
- Descuentos: tipos, acumulabilidad, condiciones, límites y rendimiento descritos anteriormente.

### Frontend

- Listado, filtros y siguiente página contra la API real.
- Navegación de listado a detalle y regreso.
- Creación y visualización del resultado/error.
- Compilación TypeScript.
- `npm run build` y `npm run lint` sin errores al cierre de la implementación.

## Uso de inteligencia artificial

Durante el desarrollo se utilizó ChatGPT como asistente de IA. La carpeta obligatoria:

```text
ai-sessions/
```

contiene la exportación completa y sin editar de las sesiones utilizadas. Esta carpeta debe permanecer dentro del repositorio y no debe incluirse en `.gitignore`.

## Consideraciones finales

- Los CSV representan datos de entrada y no sustituyen a la base de datos en tiempo de ejecución.
- Los secretos se mantienen en `backend/.env`, fuera de Git.
- Los montos persistidos usan `NUMERIC` y las respuestas monetarias se serializan con dos decimales.
- El cálculo de descuentos es de solo lectura.
- La consistencia del stock depende de la transacción y de los bloqueos de fila, no de verificaciones en el cliente web.
- La paginación usa un cursor opaco y estable, no números de página basados en `OFFSET`.
