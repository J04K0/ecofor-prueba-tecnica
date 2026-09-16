import type {
    OrdersResponse,
    OrderStatus,
    CreateOrderRequest,
    CreateOrderResponse,
    OrderDetail,
  } from "../types/order.types";
  
  const API_URL = "http://localhost:3000";
  
  export interface GetOrdersParams {
    status?: OrderStatus;
    customer?: string;
    cursor?: string;
    pageSize?: number;
  }
  
  export async function getOrders(
    params: GetOrdersParams = {}
  ): Promise<OrdersResponse> {
    const searchParams = new URLSearchParams();
  
    if (params.status) {
      searchParams.set("status", params.status);
    }
  
    if (params.customer) {
      searchParams.set("customer", params.customer);
    }
  
    if (params.cursor) {
      searchParams.set("cursor", params.cursor);
    }
  
    searchParams.set(
      "page_size",
      String(params.pageSize ?? 20)
    );
  
    const response = await fetch(
      `${API_URL}/orders?${searchParams.toString()}`
    );
  
    if (!response.ok) {
      throw new Error(
        "No se pudieron obtener las órdenes"
      );
    }
  
    return response.json();
  }

  export async function createOrder(
    data: CreateOrderRequest
  ): Promise<CreateOrderResponse> {
    const response = await fetch(
      `${API_URL}/orders`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      }
    );
  
    const result = await response.json();
  
    if (!response.ok) {
      throw new Error(
        result.error ?? "No se pudo crear la orden"
      );
    }
  
    return result;
  }

  export async function getOrderById(
    id: string
  ): Promise<OrderDetail> {
    const response = await fetch(
      `${API_URL}/orders/${id}`
    );
  
    const result = await response.json();
  
    if (!response.ok) {
      throw new Error(
        result.error ?? "No se pudo obtener la orden"
      );
    }
  
    return result.data;
  }