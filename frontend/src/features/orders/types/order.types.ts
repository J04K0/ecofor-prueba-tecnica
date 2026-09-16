export type OrderStatus =
  | "pending"
  | "paid"
  | "shipped"
  | "cancelled";

export interface OrderCustomer {
  id: string;
  full_name: string;
}

export interface Order {
  id: string;
  order_ref: string;
  status: OrderStatus;
  created_at: string;
  channel: string;
  customer: OrderCustomer;
  amount: string;
}

export interface OrdersPagination {
  page_size: number;
  has_next_page: boolean;
  next_cursor: string | null;
}

export interface OrdersResponse {
  data: Order[];
  pagination: OrdersPagination;
}

export interface CreateOrderItem {
    product_id: number;
    quantity: number;
  }
  
  export interface CreateOrderRequest {
    customer_id: number;
    items: CreateOrderItem[];
  }
  
  export interface CreateOrderResponse {
    message: string;
    data: {
      id: string;
      order_ref: string;
      customer_id: string;
      status: OrderStatus;
      created_at: string;
      channel: string;
      items: {
        product_id: number;
        name: string;
        quantity: number;
        unit_price: string;
      }[];
    };
  }

  export interface OrderDetailItem {
    product_id: string;
    sku: string;
    name: string;
    quantity: number;
    unit_price: string;
    line_total: string;
  }
  
  export interface OrderDetail {
    id: string;
    order_ref: string;
    status: OrderStatus;
    created_at: string;
    channel: string;
  
    customer: {
      id: string;
      full_name: string;
      email: string;
      city: string;
    };
  
    items: OrderDetailItem[];
    amount: string;
  }