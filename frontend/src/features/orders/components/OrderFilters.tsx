import type { OrderStatus } from "../types/order.types";

interface OrderFiltersProps {
  status: OrderStatus | "";
  customer: string;
  onStatusChange: (status: OrderStatus | "") => void;
  onCustomerChange: (customer: string) => void;
}

export function OrderFilters({
  status,
  customer,
  onStatusChange,
  onCustomerChange,
}: OrderFiltersProps) {
  return (
    <div className="filters">
      <input
        type="text"
        placeholder="Buscar cliente..."
        value={customer}
        onChange={(event) =>
          onCustomerChange(event.target.value)
        }
      />

      <select
        value={status}
        onChange={(event) =>
          onStatusChange(
            event.target.value as OrderStatus | ""
          )
        }
      >
        <option value="">Todos los estados</option>
        <option value="pending">Pendiente</option>
        <option value="paid">Pagada</option>
        <option value="shipped">Enviada</option>
        <option value="cancelled">Cancelada</option>
      </select>
    </div>
  );
}