export type AppRole = "admin" | "manager" | "cashier" | "waiter" | "kitchen";
export type TabStatus = "open" | "closing" | "closed" | "cancelled";
export type OrderStatus = "received" | "preparing" | "ready" | "delivered" | "cancelled";
export type PaymentMethod = "cash" | "pix" | "debit" | "credit";
export type ServiceRequestType = "call_waiter" | "request_bill";

export interface Restaurant {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  logo_url: string | null;
  cover_url: string | null;
  address: string | null;
  phone: string | null;
  timezone: string;
  service_fee_pct: number;
  max_discount_pct: number;
  allow_customer_open_tab: boolean;
  customer_session_hours: number;
  kitchen_sound_enabled: boolean;
  kitchen_late_minutes: number;
  receipt_footer: string | null;
  is_demo: boolean;
}

export interface Profile {
  id: string;
  restaurant_id: string;
  full_name: string;
  email: string | null;
  role: AppRole;
  active: boolean;
  created_at?: string;
}

export interface Category {
  id: string;
  restaurant_id: string;
  name: string;
  slug: string;
  icon: string | null;
  sort_order: number;
  active: boolean;
}

export interface ModifierOption {
  id: string;
  group_id: string;
  name: string;
  price_delta: number;
  active: boolean;
  sort_order: number;
}

export interface ModifierGroup {
  id: string;
  product_id: string;
  name: string;
  min_select: number;
  max_select: number;
  sort_order: number;
  modifier_options: ModifierOption[];
}

export interface Product {
  id: string;
  restaurant_id: string;
  category_id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  ingredients: string | null;
  allergens: string[];
  tags: string[];
  prep_minutes: number | null;
  serves: number | null;
  available: boolean;
  active: boolean;
  featured: boolean;
  sort_order: number;
  model_glb_url: string | null;
  model_usdz_url: string | null;
  model_is_illustrative: boolean;
  model_credit: string | null;
  deleted_at: string | null;
  modifier_groups?: ModifierGroup[];
}

export interface DiningTable {
  id: string;
  restaurant_id: string;
  number: number;
  label: string | null;
  seats: number;
  qr_token: string;
  active: boolean;
}

export interface Tab {
  id: string;
  restaurant_id: string;
  table_id: string;
  number: number;
  status: TabStatus;
  customer_count: number | null;
  opened_by: string | null;
  opened_at: string;
  closing_requested_at: string | null;
  closed_at: string | null;
  closed_by: string | null;
  service_fee_enabled: boolean;
  service_fee_pct: number;
  discount_amount: number;
  discount_reason: string | null;
  forced_close_reason: string | null;
  /** Preenchido quando a comanda foi unida a outra ("Juntar mesas"). */
  merged_into_tab_id: string | null;
  is_demo: boolean;
}

export interface OrderItemModifier {
  option_id: string;
  group: string;
  name: string;
  price_delta: number;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  modifiers: OrderItemModifier[];
  modifiers_total: number;
  notes: string | null;
  line_total: number;
}

export interface Order {
  id: string;
  restaurant_id: string;
  tab_id: string;
  table_id: string;
  number: number;
  source: "customer" | "waiter";
  created_by: string | null;
  status: OrderStatus;
  priority: boolean;
  notes: string | null;
  subtotal: number;
  created_at: string;
  started_at: string | null;
  ready_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  is_demo: boolean;
  order_items?: OrderItem[];
}

export interface ServiceRequest {
  id: string;
  tab_id: string;
  table_id: string;
  type: ServiceRequestType;
  status: "open" | "acknowledged" | "done";
  note: string | null;
  created_at: string;
}

export interface TabTotals {
  subtotal: number;
  service_fee: number;
  discount: number;
  total: number;
  paid: number;
  balance: number;
}

export interface Payment {
  id: string;
  tab_id: string;
  cash_session_id: string;
  method: PaymentMethod;
  amount: number;
  received_amount: number;
  change_amount: number;
  payer_label: string | null;
  created_by: string;
  created_at: string;
  voided_at: string | null;
  void_reason: string | null;
}

export interface CashSession {
  id: string;
  operator_id: string;
  status: "open" | "closed";
  opening_amount: number;
  opened_at: string;
  closed_at: string | null;
  expected_cash: number | null;
  counted_cash: number | null;
  difference: number | null;
  closing_notes: string | null;
  is_demo: boolean;
}

export interface Ingredient {
  id: string;
  name: string;
  unit: "g" | "kg" | "ml" | "l" | "un";
  current_qty: number;
  min_qty: number;
  cost_per_unit: number;
  active: boolean;
}

/** Item do carrinho (cliente e garçom). Preços são apenas exibição: o servidor recalcula. */
export interface CartItem {
  key: string;
  product_id: string;
  name: string;
  unit_price: number;
  quantity: number;
  modifiers: { id: string; name: string; group: string; price_delta: number }[];
  notes: string;
}
