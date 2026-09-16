import { OrderDetailView } from "../components/OrderDetailView";
import { useOrderDetail } from "../hooks/useOrderDetail";

interface OrderDetailContainerProps {
  orderId: string;
  onBack: () => void;
}

export function OrderDetailContainer({
  orderId,
  onBack,
}: OrderDetailContainerProps) {
  const {
    order,
    loading,
    error,
  } = useOrderDetail(orderId);

  if (loading) {
    return <p>Cargando detalle...</p>;
  }

  if (error) {
    return (
      <div>
        <div className="error-message">
          {error}
        </div>

        <button
          type="button"
          onClick={onBack}
        >
          Volver
        </button>
      </div>
    );
  }

  if (!order) {
    return <p>Orden no encontrada.</p>;
  }

  return (
    <OrderDetailView
      order={order}
      onBack={onBack}
    />
  );
}