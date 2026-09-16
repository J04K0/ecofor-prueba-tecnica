-- Migración segura para agregar channel a orders.
-- PostgreSQL 15+.
--
-- Se utiliza DEFAULT constante ('web'), que PostgreSQL puede manejar
-- sin reescribir físicamente las filas existentes.
-- lock_timeout evita esperar indefinidamente por el lock requerido
-- para el cambio de esquema.

SET lock_timeout = '5s';

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS channel VARCHAR(50) DEFAULT 'web';

-- Validamos NOT NULL de forma progresiva.
-- NOT VALID evita validar inmediatamente todas las filas.
ALTER TABLE orders
ADD CONSTRAINT orders_channel_not_null
CHECK (channel IS NOT NULL) NOT VALID;

-- La validación se realiza separadamente y permite que continúen
-- las operaciones normales sobre la tabla.
ALTER TABLE orders
VALIDATE CONSTRAINT orders_channel_not_null;

-- Una vez validado, PostgreSQL puede establecer NOT NULL
-- utilizando la restricción ya comprobada.
ALTER TABLE orders
ALTER COLUMN channel SET NOT NULL;

ALTER TABLE orders
DROP CONSTRAINT orders_channel_not_null;

RESET lock_timeout;