import { useState } from "react";

interface CreateOrderFormProps {
  loading: boolean;
  error: string | null;
  success: string | null;

  onSubmit: (
    customerId: number,
    productId: number,
    quantity: number
  ) => Promise<void>;
}

export function CreateOrderForm({
  loading,
  error,
  success,
  onSubmit,
}: CreateOrderFormProps) {
  const [customerId, setCustomerId] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");

  const handleSubmit = async (
    event: React.FormEvent
  ) => {
    event.preventDefault();

    await onSubmit(
      Number(customerId),
      Number(productId),
      Number(quantity)
    );
  };

  return (
    <form
      className="create-order-form"
      onSubmit={handleSubmit}
    >
      <h2>Crear nueva orden</h2>

      <label>
        ID del cliente
        <input
          type="number"
          min="1"
          required
          value={customerId}
          onChange={(event) =>
            setCustomerId(event.target.value)
          }
        />
      </label>

      <label>
        ID del producto
        <input
          type="number"
          min="1"
          required
          value={productId}
          onChange={(event) =>
            setProductId(event.target.value)
          }
        />
      </label>

      <label>
        Cantidad
        <input
          type="number"
          min="1"
          required
          value={quantity}
          onChange={(event) =>
            setQuantity(event.target.value)
          }
        />
      </label>

      <button type="submit" disabled={loading}>
        {loading ? "Creando..." : "Crear orden"}
      </button>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {success && (
        <div className="success-message">
          {success}
        </div>
      )}
    </form>
  );
}