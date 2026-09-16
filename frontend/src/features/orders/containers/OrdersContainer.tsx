import { OrderFilters } from "../components/OrderFilters";
import { OrdersTable } from "../components/OrdersTable";
import { useOrders } from "../hooks/useOrders";

interface OrdersContainerProps {
  onSelectOrder: (orderId: string) => void;
}

export function OrdersContainer({
  onSelectOrder,
}: OrdersContainerProps) {
  const {
    orders,
    loading,
    error,

    status,
    setStatus,

    customer,
    setCustomer,

    hasNextPage,
    loadNextPage,
  } = useOrders();

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Gestión de órdenes</h1>
          <p>
            Consulta y filtra las órdenes registradas.
          </p>
        </div>
      </div>

      <OrderFilters
        status={status}
        customer={customer}
        onStatusChange={setStatus}
        onCustomerChange={setCustomer}
      />

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {loading && orders.length === 0 ? (
        <p>Cargando órdenes...</p>
      ) : (
        <OrdersTable
          orders={orders}
          onSelectOrder={onSelectOrder}
        />
      )}

      {hasNextPage && (
        <div className="pagination">
          <button
            type="button"
            onClick={() => void loadNextPage()}
            disabled={loading}
          >
            {loading
              ? "Cargando..."
              : "Cargar más"}
          </button>
        </div>
      )}
    </section>
  );
}