import {
    Router,
    Request,
    Response,
    NextFunction,
  } from "express";
import { body,query, param,validationResult } from "express-validator";
import { applyDiscountsController } from "../controllers/discounts.controller.js";
import { createOrderController, listOrdersController, getOrderByIdController } from "../controllers/orders.controller.js";

const router = Router();
router.get(
    "/",
    [
      query("status")
        .optional()
        .isIn(["pending", "paid", "shipped", "cancelled"])
        .withMessage("status no es válido"),
  
      query("from")
        .optional()
        .isISO8601()
        .withMessage("from debe ser una fecha ISO 8601"),
  
      query("to")
        .optional()
        .isISO8601()
        .withMessage("to debe ser una fecha ISO 8601"),
  
      query("customer")
        .optional()
        .isString()
        .trim()
        .notEmpty()
        .withMessage("customer no puede estar vacío"),
  
      query("page_size")
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage("page_size debe estar entre 1 y 100")
        .toInt(),
  
      query("cursor")
        .optional()
        .isString()
        .withMessage("cursor debe ser válido"),
    ],
  
    (req: Request, res: Response, next: NextFunction) => {
      const errors = validationResult(req);
  
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: "Parámetros inválidos",
          details: errors.array(),
        });
        return;
      }
  
      next();
    },
  
    listOrdersController
  );

  router.post(
    "/:id/apply-discounts",
    [
      param("id")
        .isInt({ min: 1 })
        .withMessage(
          "El id de la orden debe ser un entero positivo"
        )
        .toInt(),
  
      body("coupons")
        .isArray({ max: 30 })
        .withMessage(
          "coupons debe ser un arreglo de máximo 30 elementos"
        ),
  
      body("coupons.*.code")
        .isString()
        .trim()
        .notEmpty()
        .withMessage("code es obligatorio"),
  
      body("coupons.*.type")
        .isIn([
          "percentage",
          "fixed_amount",
          "n_for_m",
        ])
        .withMessage("type no es válido"),
  
      body("coupons.*.stackable")
        .isBoolean()
        .withMessage("stackable debe ser boolean"),
  
      body("coupons.*.min_amount")
        .optional()
        .isFloat({ min: 0 })
        .withMessage(
          "min_amount debe ser mayor o igual a 0"
        )
        .toFloat(),
  
      body("coupons.*.applicable_skus")
        .optional()
        .isArray()
        .withMessage(
          "applicable_skus debe ser un arreglo"
        ),
  
      body("coupons.*.applicable_skus.*")
        .optional()
        .isString()
        .withMessage(
          "Cada SKU debe ser un texto"
        ),
  
      body("coupons.*")
        .custom((coupon) => {
          if (
            coupon.type === "percentage" &&
            (
              typeof coupon.value !== "number" ||
              coupon.value < 0 ||
              coupon.value > 100
            )
          ) {
            throw new Error(
              "percentage requiere value entre 0 y 100"
            );
          }
  
          if (
            coupon.type === "fixed_amount" &&
            (
              typeof coupon.value !== "number" ||
              coupon.value < 0
            )
          ) {
            throw new Error(
              "fixed_amount requiere value mayor o igual a 0"
            );
          }
  
          if (coupon.type === "n_for_m") {
            if (
              typeof coupon.sku !== "string" ||
              !coupon.sku.trim()
            ) {
              throw new Error(
                "n_for_m requiere sku"
              );
            }
  
            if (
              !Number.isInteger(coupon.n) ||
              !Number.isInteger(coupon.m) ||
              coupon.n <= 0 ||
              coupon.m < 0 ||
              coupon.m >= coupon.n
            ) {
              throw new Error(
                "n_for_m requiere n > 0 y 0 <= m < n"
              );
            }
          }
  
          return true;
        }),
    ],
  
    (req: Request, res: Response, next: NextFunction) => {
      const errors = validationResult(req);
  
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: "Datos inválidos",
          details: errors.array(),
        });
        return;
      }
  
      next();
    },
  
    applyDiscountsController
  );

  router.get(
    "/:id",
    [
      param("id")
        .isInt({ min: 1 })
        .withMessage("El id de la orden debe ser un entero positivo")
        .toInt(),
    ],
  
    (req: Request, res: Response, next: NextFunction) => {
      const errors = validationResult(req);
  
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: "Parámetros inválidos",
          details: errors.array(),
        });
        return;
      }
  
      next();
    },
  
    getOrderByIdController
  );
router.post(
  "/",
  [
    body("customer_id")
      .isInt({ min: 1 })
      .withMessage("customer_id debe ser un número entero positivo")
      .toInt(),

    body("items")
      .isArray({ min: 1 })
      .withMessage("items debe contener al menos un producto"),

    body("items.*.product_id")
      .isInt({ min: 1 })
      .withMessage("product_id debe ser un número entero positivo")
      .toInt(),

    body("items.*.quantity")
      .isInt({ min: 1 })
      .withMessage("quantity debe ser un número entero mayor a 0")
      .toInt(),
  ],

  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
  
    if (!errors.isEmpty()) {
      res.status(400).json({
        error: "Datos inválidos",
        details: errors.array(),
      });
      return;
    }
  
    next();
  },

  createOrderController
);

export default router;