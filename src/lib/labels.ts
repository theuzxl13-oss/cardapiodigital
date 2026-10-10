import type { AppRole, OrderStatus, PaymentMethod, TabStatus } from "./types";

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Administrador",
  manager: "Gerente",
  cashier: "Caixa",
  waiter: "Garçom",
  kitchen: "Cozinha",
};

export const ROLE_HOME: Record<AppRole, string> = {
  admin: "/admin",
  manager: "/admin",
  cashier: "/caixa",
  waiter: "/garcom",
  kitchen: "/cozinha",
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  received: "Pedido recebido",
  preparing: "Em preparação",
  ready: "Pronto para servir",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

export const ORDER_STATUS_COLOR: Record<OrderStatus, string> = {
  received: "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-800",
  preparing: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800",
  ready: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800",
  delivered: "bg-stone-100 text-stone-700 border-stone-200 dark:bg-stone-800 dark:text-stone-200 dark:border-stone-700",
  cancelled: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950 dark:text-rose-200 dark:border-rose-800",
};

export const TAB_STATUS_LABEL: Record<TabStatus, string> = {
  open: "Aberta",
  closing: "Fechamento solicitado",
  closed: "Encerrada",
  cancelled: "Cancelada",
};

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  cash: "Dinheiro",
  pix: "PIX",
  debit: "Débito",
  credit: "Crédito",
};
