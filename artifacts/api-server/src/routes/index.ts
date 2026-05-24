import { Router, type IRouter } from "express";
import healthRouter from "./health";
import productsRouter from "./products";
import warehousesRouter from "./warehouses";
import reservationsRouter from "./reservations";

const router: IRouter = Router();

router.use(healthRouter);
router.use(productsRouter);
router.use(warehousesRouter);
router.use(reservationsRouter);

export default router;
