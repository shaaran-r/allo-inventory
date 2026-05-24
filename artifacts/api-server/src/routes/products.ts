import { Router } from "express";
import { db } from "@workspace/db";
import { productsTable, stockLevelsTable, warehousesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/products", async (req, res) => {
  try {
    const products = await db.select().from(productsTable).orderBy(productsTable.createdAt);

    const stockLevels = await db
      .select({
        productId: stockLevelsTable.productId,
        warehouseId: stockLevelsTable.warehouseId,
        warehouseName: warehousesTable.name,
        warehouseLocation: warehousesTable.location,
        totalUnits: stockLevelsTable.totalUnits,
        reservedUnits: stockLevelsTable.reservedUnits,
      })
      .from(stockLevelsTable)
      .innerJoin(warehousesTable, eq(stockLevelsTable.warehouseId, warehousesTable.id));

    const stockByProduct = new Map<string, typeof stockLevels>();
    for (const sl of stockLevels) {
      const existing = stockByProduct.get(sl.productId) ?? [];
      existing.push(sl);
      stockByProduct.set(sl.productId, existing);
    }

    const result = products.map((product) => ({
      id: product.id,
      name: product.name,
      sku: product.sku,
      description: product.description,
      createdAt: product.createdAt.toISOString(),
      stockLevels: (stockByProduct.get(product.id) ?? []).map((sl) => ({
        warehouseId: sl.warehouseId,
        warehouseName: sl.warehouseName,
        warehouseLocation: sl.warehouseLocation,
        totalUnits: sl.totalUnits,
        reservedUnits: sl.reservedUnits,
        availableUnits: Math.max(0, sl.totalUnits - sl.reservedUnits),
      })),
    }));

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to list products");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
