/** Rotas com identificador (centralizadas para facilitar mudanças de formato). */
export const routes = {
  waiterTable: (tableId: string) => `/garcom/mesa/${tableId}`,
  checkout: (tabId: string) => `/caixa/comanda/${tabId}`,
  receipt: (tabId: string) => `/caixa/comanda/${tabId}/recibo`,
};
