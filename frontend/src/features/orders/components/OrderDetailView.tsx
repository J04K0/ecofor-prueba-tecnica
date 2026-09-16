import type {
    OrderDetail,
  } from "../types/order.types";
  
  interface OrderDetailViewProps {
    order: OrderDetail;
    onBack: () => void;
  }
  
  export function OrderDetailView({
    order,
    onBack,
  }: OrderDetailViewProps) {
    return (
      <div className="order-detail">
        <button
          type="button"
          className="back-button"
          onClick={onBack}
        >
          ← Volver
        </button>
  
        <div className="detail-header">
          <div>
            <h1>Detalle de orden</h1>
            <p>{order.order_ref}</p>
          </div>
  
          <span className="status-badge">
            {order.status}
          </span>
        </div>
  
        <div className="detail-grid">
          <div>
            <strong>Cliente</strong>
            <p>{order.customer.full_name}</p>
          </div>
  
          <div>
            <strong>Email</strong>
            <p>{order.customer.email}</p>
          </div>
  
          <div>
            <strong>Ciudad</strong>
            <p>{order.customer.city}</p>
          </div>
  
          <div>
            <strong>Canal</strong>
            <p>{order.channel}</p>
          </div>
  
          <div>
            <strong>Fecha</strong>
            <p>
              {new Date(
                order.created_at
              ).toLocaleString()}
            </p>
          </div>
        </div>
  
        <h2>Productos</h2>
  
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Producto</th>
                <th>Cantidad</th>
                <th>Precio</th>
                <th>Total</th>
              </tr>
            </thead>
  
            <tbody>
              {order.items.map((item) => (
                <tr key={item.product_id}>
                  <td>{item.sku}</td>
                  <td>{item.name}</td>
                  <td>{item.quantity}</td>
  
                  <td>
                    $
                    {Number(
                      item.unit_price
                    ).toLocaleString("es-CL", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
  
                  <td>
                    $
                    {Number(
                      item.line_total
                    ).toLocaleString("es-CL", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
  
        <div className="order-total">
          Total: $
          {Number(order.amount).toLocaleString(
            "es-CL",
            {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }
          )}
        </div>
      </div>
    );
  }