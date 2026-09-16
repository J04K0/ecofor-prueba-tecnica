import { useState } from "react";

import { OrdersContainer } from "./features/orders/containers/OrdersContainer";
import { CreateOrderContainer } from "./features/orders/containers/CreateOrderContainer";
import { OrderDetailContainer } from "./features/orders/containers/OrderDetailContainer";

import "./App.css";

type View = "orders" | "create" | "detail";

function App() {
  const [view, setView] = useState<View>("orders");

  const [selectedOrderId, setSelectedOrderId] =
    useState<string | null>(null);

  const handleSelectOrder = (orderId: string) => {
    setSelectedOrderId(orderId);
    setView("detail");
  };

  const handleBackToOrders = () => {
    setSelectedOrderId(null);
    setView("orders");
  };

  return (
    <main className="app">
      <nav className="navigation">
        <button
          type="button"
          className={view === "orders" ? "active" : ""}
          onClick={handleBackToOrders}
        >
          Órdenes
        </button>

        <button
          type="button"
          className={view === "create" ? "active" : ""}
          onClick={() => setView("create")}
        >
          Nueva orden
        </button>
      </nav>

      {view === "orders" && (
        <OrdersContainer
          onSelectOrder={handleSelectOrder}
        />
      )}

      {view === "create" && (
        <CreateOrderContainer />
      )}

      {view === "detail" && selectedOrderId && (
        <OrderDetailContainer
          orderId={selectedOrderId}
          onBack={handleBackToOrders}
        />
      )}
    </main>
  );
}

export default App;