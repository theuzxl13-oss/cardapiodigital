/** Demonstração estática: páginas com identificador usam parâmetro de consulta (?id=). */
export const routes = {
  waiterTable: (tableId: string) => `/garcom/mesa?id=${tableId}`,
  checkout: (tabId: string) => `/caixa/comanda?id=${tabId}`,
  receipt: (tabId: string) => `/caixa/comanda/recibo?id=${tabId}`,
};
