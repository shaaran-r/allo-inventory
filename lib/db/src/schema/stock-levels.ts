import { pgTable, text, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";
import { warehousesTable } from "./warehouses";

export const stockLevelsTable = pgTable("stock_levels", {
  id: text("id").primaryKey(),
  productId: text("product_id").notNull().references(() => productsTable.id),
  warehouseId: text("warehouse_id").notNull().references(() => warehousesTable.id),
  totalUnits: integer("total_units").notNull().default(0),
  reservedUnits: integer("reserved_units").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("stock_levels_product_warehouse_unique").on(table.productId, table.warehouseId),
]);

export const insertStockLevelSchema = createInsertSchema(stockLevelsTable);
export type InsertStockLevel = z.infer<typeof insertStockLevelSchema>;
export type StockLevel = typeof stockLevelsTable.$inferSelect;
