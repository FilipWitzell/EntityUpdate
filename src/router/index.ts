import { createRouter, createWebHashHistory } from "vue-router";
import MainView from "../views/MainView.vue";
import SaleQuickUpdateView from "../views/SaleQuickUpdateView.vue";
import EntityQuickUpdateView from "../views/EntityQuickUpdateView.vue";
import NoCardView from "../views/NoCardView.vue";
import { readSuperOfficeAddress, resolveCardContext } from "@/services/superOfficeContext";

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    {
      /*
       * One web panel URL for every card:
       *   ...&app=entity-update&contactId=<cuid>&personId=<peid>&projectId=<prid>&saleId=<said>&ticketId=<tiid>
       * The card the panel is on is read from the SuperOffice window's address; the ids are the fallback.
       */
      path: "/",
      name: "root",
      component: NoCardView,
      beforeEnter: () => {
        const context = resolveCardContext(new URLSearchParams(window.location.search), readSuperOfficeAddress());
        if (!context) return;
        const id = String(context.id);
        if (context.entity === "sale") return { name: "saleQuickUpdate", params: { saleId: id } };
        if (context.entity === "contact") return { name: "contactQuickUpdate", params: { id } };
        if (context.entity === "ticket") return { name: "ticketQuickUpdate", params: { id } };
        return { name: "noCard", query: { entity: context.entity } };
      }
    },
    {
      // A card the panel has no panel for yet (person, project)
      path: "/no-card",
      name: "noCard",
      component: NoCardView,
      props: (route) => ({ entity: String(route.query.entity ?? "") })
    },
    {
      path: "/main",
      name: "main",
      component: MainView
    },
    {
      // The sale panel: .../#/sale/<said>
      path: "/sale/:saleId",
      name: "saleQuickUpdate",
      component: SaleQuickUpdateView,
      props: true
    },
    {
      // The company panel: .../#/contact/<cuid>
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
      // The ticket panel: .../#/ticket/<tiid>
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
