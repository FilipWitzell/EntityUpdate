import { createRouter, createWebHashHistory } from "vue-router";
import MainView from "../views/MainView.vue";
import SaleQuickUpdateView from "../views/SaleQuickUpdateView.vue";
import EntityQuickUpdateView from "../views/EntityQuickUpdateView.vue";

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    {
      // Web panel URL with ...&saleId=<said> opens the panel for the sale the user is on
      path: "/",
      name: "root",
      component: MainView,
      beforeEnter: () => {
        const params = new URLSearchParams(window.location.search);
        const saleId = params.get("saleId");
        if (saleId) return { name: "saleQuickUpdate", params: { saleId } };
        const contactId = params.get("contactId");
        if (contactId) return { name: "contactQuickUpdate", params: { id: contactId } };
        const ticketId = params.get("ticketId");
        if (ticketId) return { name: "ticketQuickUpdate", params: { id: ticketId } };
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
      // Web panel on the company card: ...&contactId=<cuid>, or .../#/contact/<cuid>
      path: "/contact/:id",
      name: "contactQuickUpdate",
      component: EntityQuickUpdateView,
      props: (route) => ({ entity: "contact", id: String(route.params.id) })
    },
    {
      // The company panel with demo data
      path: "/demo/contact",
      name: "contactQuickUpdateDemo",
      component: EntityQuickUpdateView,
      props: { entity: "contact", id: "2001", demo: true }
    },
    {
      // Web panel on the ticket: ...&ticketId=<tiid>, or .../#/ticket/<tiid>
      path: "/ticket/:id",
      name: "ticketQuickUpdate",
      component: EntityQuickUpdateView,
      props: (route) => ({ entity: "ticket", id: String(route.params.id) })
    },
    {
      // The ticket panel with demo data
      path: "/demo/ticket",
      name: "ticketQuickUpdateDemo",
      component: EntityQuickUpdateView,
      props: { entity: "ticket", id: "48213", demo: true }
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
