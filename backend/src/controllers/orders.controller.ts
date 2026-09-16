import { Request, Response } from "express";
import { createOrder, listOrders, getOrderById } from "../service/orders.service.js";


interface ServiceError {
  status?: number;
  message?: string;
}

export async function createOrderController(
  req: Request,
  res: Response
) {
  try {
    const order = await createOrder({
      customer_id: req.body.customer_id,
      items: req.body.items,
    });

    return res.status(201).json({
      message: "Orden creada correctamente",
      data: order,
    });
  } catch (error) {
    const serviceError = error as ServiceError;

    console.error("Error al crear orden:", error);

    return res.status(serviceError.status ?? 500).json({
      error: serviceError.message ?? "Error interno del servidor",
    });
  }
}

export async function listOrdersController(
  req: Request,
  res: Response
) {
  try {
    const result = await listOrders({
      status: req.query.status as string | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
      customer: req.query.customer as string | undefined,
      pageSize: req.query.page_size
        ? Number(req.query.page_size)
        : undefined,
      cursor: req.query.cursor as string | undefined,
    });

    res.status(200).json(result);
  } catch (error) {
    const serviceError = error as ServiceError;

    console.error("Error al listar órdenes:", error);

    res.status(serviceError.status ?? 500).json({
      error: serviceError.message ?? "Error interno del servidor",
    });
  }
}

export async function getOrderByIdController(
  req: Request,
  res: Response
) {
  try {
    const orderId = Number(req.params.id);

    const order = await getOrderById(orderId);

    res.status(200).json({
      data: order,
    });
  } catch (error) {
    const serviceError = error as ServiceError;

    console.error("Error al obtener orden:", error);

    res.status(serviceError.status ?? 500).json({
      error: serviceError.message ?? "Error interno del servidor",
    });
  }
}