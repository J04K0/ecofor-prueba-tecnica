import { Request, Response } from "express";
import {
  applyDiscounts,
  CouponInput,
} from "../service/discounts.service.js";

interface ServiceError {
  status?: number;
  message?: string;
}

export async function applyDiscountsController(
  req: Request,
  res: Response
) {
  try {
    const orderId = Number(req.params.id);
    const coupons = req.body.coupons as CouponInput[];

    const result = await applyDiscounts(
      orderId,
      coupons
    );

    res.status(200).json(result);
  } catch (error) {
    const serviceError = error as ServiceError;

    console.error("Error al aplicar descuentos:", error);

    res.status(serviceError.status ?? 500).json({
      error:
        serviceError.message ??
        "Error interno del servidor",
    });
  }
}