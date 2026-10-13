import { createRouter, createWebHashHistory } from "vue-router";
import MainView from "../views/MainView.vue";
import SaleQuickUpdateView from "../views/SaleQuickUpdateView.vue";

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    {
      // Web panel URL with ...&saleId=<said> opens the panel for the sale the user is on
      path: "/",
      name: "root",
      component: MainView,
      beforeEnter: () => {
        const saleId = new URLSearchParams(window.location.search).get("saleId");
        if (saleId) return { name: "saleQuickUpdate", params: { saleId } };
      }
    },
    {
      path: "/main",
      name: "main",
      component: MainView
    },
    {
      // Web panel on the sale card: .../#/sale/<said>
      path: "/sale/:saleId",
      name: "saleQuickUpdate",
      component: SaleQuickUpdateView,
      props: true
    },
    {
      // Same panel with demo data, for showing it without a SuperOffice tenant
      path: "/demo",
      name: "saleQuickUpdateDemo",
      component: SaleQuickUpdateView,
      props: { saleId: "10080", demo: true }
    }
  ]
});

export default router;
