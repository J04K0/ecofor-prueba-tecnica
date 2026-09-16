import { useEffect, useState } from "react";

import { getOrderById } from "../services/order.api";

import type {
  OrderDetail,
} from "../types/order.types";

export function useOrderDetail(
  orderId: string | null
) {
  const [order, setOrder] =
    useState<OrderDetail | null>(null);

  const [loading, setLoading] = useState(
    orderId !== null
  );

  const [error, setError] =
    useState<string | null>(null);

  useEffect(() => {
    if (!orderId) return;

    let cancelled = false;

    async function fetchOrder() {
      try {
        const response =
          await getOrderById(orderId!);

        if (cancelled) return;

        setOrder(response);
        setError(null);
      } catch (error) {
        if (cancelled) return;

        setError(
          error instanceof Error
            ? error.message
            : "Ocurrió un error"
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void fetchOrder();

    return () => {
      cancelled = true;
    };
  }, [orderId]);

  return {
    order,
    loading,
    error,
  };
}