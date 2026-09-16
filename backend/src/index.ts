import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { pool } from "./db/index.js";
import ordersRoutes from "./routes/orders.routes.js";
import reportRoutes from "./routes/reports.routes.js";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());
app.use("/orders", ordersRoutes);
app.use("/reports", reportRoutes);

app.get("/", (_req, res) => {
  res.status(200).json({
    status: "ok",
    message: "API funcionando",
  });
});

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");

    res.status(200).json({
      status: "ok",
      database: "connected",
    });
  } catch (error) {
    console.error("Error de conexión:", error);

    res.status(500).json({
      status: "error",
      database: "disconnected",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
});