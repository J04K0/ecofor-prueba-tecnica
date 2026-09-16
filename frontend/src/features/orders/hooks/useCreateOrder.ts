import { useState } from "react";
import { createOrder } from "../services/order.api";

export function useCreateOrder() {
  const [loading, setLoading] = useState(false);
  const [error, setError] =
    useState<string | null>(null);
  const [success, setSuccess] =
    useState<string | null>(null);

  const submitOrder = async (
    customerId: number,
    productId: number,
    quantity: number
  ) => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      const response = await createOrder({
        customer_id: customerId,
        items: [
          {
            product_id: productId,
            quantity,
          },
        ],
      });

      setSuccess(
        `Orden ${response.data.order_ref} creada correctamente`
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Ocurrió un error"
      );
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    error,
    success,
    submitOrder,
  };
}