import type { Order } from "../types/order.types";

interface OrdersTableProps {
  orders: Order[];
  onSelectOrder: (orderId: string) => void;
}

export function OrdersTable({
  orders,
  onSelectOrder,
}: OrdersTableProps) {
  if (orders.length === 0) {
    return <p>No se encontraron órdenes.</p>;
  }

  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Referencia</th>
            <th>Cliente</th>
            <th>Estado</th>
            <th>Fecha</th>
            <th>Canal</th>
            <th>Monto</th>
            <th>Acción</th>
          </tr>
        </thead>

        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td>{order.id}</td>
              <td>{order.order_ref}</td>
              <td>{order.customer.full_name}</td>
              <td>{order.status}</td>

              <td>
                {new Date(
                  order.created_at
                ).toLocaleString()}
              </td>

              <td>{order.channel}</td>

              <td>
                $
                {Number(order.amount).toLocaleString(
                  "es-CL",
                  {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  }
                )}
              </td>

              <td>
                <button
                  type="button"
                  className="detail-button"
                  onClick={() =>
                    onSelectOrder(order.id)
                  }
                >
                  Ver detalle
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}