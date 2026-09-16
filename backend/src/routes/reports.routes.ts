import {
    Router,
    Request,
    Response,
    NextFunction,
  } from "express";
  
  import {
    query,
    validationResult,
  } from "express-validator";
  
  import {
    getTopCustomersController,
  } from "../controllers/reports.controller.js";
  
  const router = Router();
  
  router.get(
    "/top-customers",
    [
      query("as_of")
        .optional()
        .isISO8601()
        .withMessage("as_of debe ser una fecha ISO 8601"),
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
  
    getTopCustomersController
  );
  
  export default router;