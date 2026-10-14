/** Formatos das respostas das funções do banco usados nos testes. */
export type Row = Record<string, unknown>;
export interface OpenSession { session_token: string; table_number: number }
export interface CustomerState { tab: { id: string; status: string }; totals: { total: string; balance: string } }
export interface OrderRow {
  id: string; status: string; source: string; subtotal: string;
  delivered_by: string | null; cancelled_by: string | null; cancel_authorized_by: string | null; cancel_reason: string | null;
}
export interface IdRow { id: string; status?: string }
export interface TabRow { id: string; status: string }
export interface TotalsRow { subtotal: string; total: string; paid: string; balance: string }
export interface PaymentResult { payment: { id: string; change_amount: string }; totals: TotalsRow; duplicate: boolean }
export interface CloseResult { tab: { status: string; forced_close_authorized_by: string | null } }
export interface CashSessionRow { expected_cash: string; difference: string }
export interface ReportRow { revenue: string; includes_demo_data: boolean; top_products: unknown[] }
export interface LiveRow { tables_total: number }
export interface PinResult { ok: boolean; locked?: boolean; remaining?: number; message?: string }
export interface TabSummaryRow { tab_id: string; total: string; balance: string }
