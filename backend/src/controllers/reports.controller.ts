import { Request, Response } from "express";
import { getTopCustomers } from "../service/reports.service.js";

export async function getTopCustomersController(
  req: Request,
  res: Response
) {
  try {
    const asOf = req.query.as_of as string | undefined;

    const result = await getTopCustomers(asOf);

    res.status(200).json(result);
  } catch (error) {
    console.error("Error al generar reporte:", error);

    res.status(500).json({
      error: "Error interno del servidor",
    });
  }
}