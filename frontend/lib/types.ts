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
  sold_quantity: number;
  created_at: string;
  updated_at: string;
};

/** One client profile returned by `GET /api/clients`. */
export type Client = {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string;
  social_handle: string | null;
  notes: string | null;
  is_walk_in: boolean;
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
  client_id: string;
  client_name: string;
  // A plain date, "YYYY-MM-DD" — no time, no timezone.
  sale_date: string;
  payment_method: PaymentMethod;
  total_amount: string;
  total_cost: string;
  created_at: string;
  items: SaleItem[];
};

/** How often a fiado installment falls due — the backend's `Frequency` enum. */
export type FiadoFrequency = "weekly" | "biweekly" | "monthly";

/**
 * The state of a fiado, as the backend derives it — never stored anywhere.
 *
 * It is computed per request from `next_due_date` and `remaining_balance`
 * against today in São Paulo, which is why it arrives from the API instead of
 * being worked out here: "today" in the store's timezone is the server's call,
 * and the rule must not exist in two places.
 */
export type FiadoStatus = "overdue" | "due_soon" | "current" | "paid_off";

/** One row of `GET /api/fiado` — the backend's `FiadoRead`. */
export type Fiado = {
  id: string;
  sale_id: string;
  client_id: string;
  client_name: string;
  frequency: FiadoFrequency;
  installments_count: number;
  installment_amount: string;
  agreed_settlement_date: string;
  next_due_date: string;
  remaining_balance: string;
  status: FiadoStatus;
  created_at: string;
  updated_at: string;
};

/** One line of the sale behind a fiado — the backend's `FiadoDetailItemRead`. */
export type FiadoDetailItem = {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_sale_price: string;
};

/**
 * `GET /api/fiado/{id}` — a fiado plus the sale it came from.
 *
 * Extends `Fiado` for the same reason the Python schema does: the detail screen
 * shows everything the list shows, and then what the person took.
 */
export type FiadoDetail = Fiado & {
  sale_date: string;
  sale_total: string;
  items: FiadoDetailItem[];
};

/** One overdue fiado row in `GET /api/dashboard`. */
export type DashboardOverdueFiado = {
  id: string;
  client_name: string;
  next_due_date: string;
  remaining_balance: string;
  days_overdue: number;
};

/** One due-soon fiado row in `GET /api/dashboard`. */
export type DashboardDueSoonFiado = {
  id: string;
  client_name: string;
  next_due_date: string;
  remaining_balance: string;
};

/** One low-stock product row in `GET /api/dashboard`. */
export type DashboardLowStockProduct = {
  id: string;
  name: string;
  stock_quantity: number;
};

/** The complete `GET /api/dashboard` response. */
export type Dashboard = {
  overdue: DashboardOverdueFiado[];
  due_soon: DashboardDueSoonFiado[];
  low_stock: DashboardLowStockProduct[];
};

/** One product line in a client's purchase history. */
export type ClientSaleItem = {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_sale_price: string;
};

/** One sale in a client's purchase history. */
export type ClientSale = {
  id: string;
  sale_date: string;
  payment_method: PaymentMethod;
  total_amount: string;
  items: ClientSaleItem[];
};

/** `GET /api/clients/{id}` — profile, purchases, and open fiado total. */
export type ClientDetail = Client & {
  sales_history: ClientSale[];
  outstanding_fiado_balance: string;
};

/** The complete `GET /api/summary` response. */
export type Summary = {
  total_sold: string;
  total_cost: string;
  total_profit: string;
  received: string;
  to_receive: string;
};
