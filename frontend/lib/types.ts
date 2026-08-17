/**
 * Shapes returned by the FastAPI backend, mirroring the Pydantic Read schemas.
 *
 * Every money field is a `string`, not a `number`, and that is deliberate: the
 * columns are NUMERIC, the schemas type them as `Decimal`, and Pydantic
 * serialises a Decimal to a JSON *string* ("49.90") so no value is mangled by a
 * float on the way out. Convert only at the moment of display.
 */

/** One row of `GET /api/products` — the backend's `ProductRead`. */
export type Product = {
  id: string;
  name: string;
  cost_price: string;
  sale_price: string;
  stock_quantity: number;
  created_at: string;
  updated_at: string;
};

/** The payment methods the backend accepts (its `PaymentMethod` enum). */
export type PaymentMethod = "dinheiro" | "pix" | "cartao" | "fiado";

/** One line of a recorded sale — the backend's `SaleItemRead`. */
export type SaleItem = {
  id: string;
  product_id: string;
  // Resolved server-side so a sales list can render item names without
  // fetching every product to look them up.
  product_name: string;
  quantity: number;
  unit_sale_price: string;
  unit_cost_price: string;
};

/** One recorded sale — the backend's `SaleRead`. */
export type Sale = {
  id: string;
  // A plain date, "YYYY-MM-DD" — no time, no timezone.
  sale_date: string;
  payment_method: PaymentMethod;
  total_amount: string;
  total_cost: string;
  created_at: string;
  items: SaleItem[];
};
