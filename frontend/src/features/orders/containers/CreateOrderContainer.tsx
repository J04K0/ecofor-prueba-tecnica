import { CreateOrderForm } from "../components/CreateOrderForm";
import { useCreateOrder } from "../hooks/useCreateOrder";

export function CreateOrderContainer() {
  const {
    loading,
    error,
    success,
    submitOrder,
  } = useCreateOrder();

  return (
    <section>
      <CreateOrderForm
        loading={loading}
        error={error}
        success={success}
        onSubmit={submitOrder}
      />
    </section>
  );
}