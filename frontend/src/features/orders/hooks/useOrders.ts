import { useEffect, useState } from "react";

import { getOrders } from "../services/order.api";

import type {
  Order,
  OrderStatus,
} from "../types/order.types";

export function useOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] =
    useState<OrderStatus | "">("");

  const [customer, setCustomer] = useState("");

  const [nextCursor, setNextCursor] =
    useState<string | null>(null);

  const [hasNextPage, setHasNextPage] =
    useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchOrders() {
      try {
        const response = await getOrders({
          status: status || undefined,
          customer: customer || undefined,
          pageSize: 20,
        });

        if (cancelled) return;

        setOrders(response.data);
        setNextCursor(
          response.pagination.next_cursor
        );
        setHasNextPage(
          response.pagination.has_next_page
        );
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

    void fetchOrders();

    return () => {
      cancelled = true;
    };
  }, [status, customer]);

  const loadNextPage = async () => {
    if (!nextCursor) return;

    try {
      setLoading(true);
      setError(null);

      const response = await getOrders({
        status: status || undefined,
        customer: customer || undefined,
        cursor: nextCursor,
        pageSize: 20,
      });

      setOrders((current) => [
        ...current,
        ...response.data,
      ]);

      setNextCursor(
        response.pagination.next_cursor
      );

      setHasNextPage(
        response.pagination.has_next_page
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
    orders,
    loading,
    error,

    status,
    setStatus,

    customer,
    setCustomer,

    hasNextPage,
    loadNextPage,
  };
}