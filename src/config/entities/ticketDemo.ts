import type { EntityDemoData } from "@/agents/DemoEntityAgent";
import type { EntitySnapshot } from "@/types/EntityQuickUpdate";

/** Tickets for the demo (#/demo/ticket). The demo user is associate 1 (Per Hansen). */

function ticket(id: number, ownerId: number, title: string, values: EntitySnapshot["values"]) {
  return {
    id,
    ownerId,
    title,
    subtitle: `Sak #${id}`,
    meta: `#${id}`,
    updatedAt: "2026-10-01T08:00:00",
    updatedBy: "Per Hansen",
    values: { title, ownedBy: ownerId, categoryId: 1, x_product: null, ...values }
  };
}

export const TICKET_DEMO: EntityDemoData = {
  currentAssociateId: 1,
  options: {
    associate: [
      { id: 1, name: "Per Hansen" },
      { id: 2, name: "Kari Nordmann" },
      { id: 3, name: "Ola Nordmann" }
    ],
    ejcategory: [
      { id: 1, name: "Support" },
      { id: 2, name: "Integrasjon" },
      { id: 3, name: "Faktura" }
    ],
    "extra:y_product": [
      { id: 1, name: "SuperOffice" },
      { id: 2, name: "Visma Net" },
      { id: 3, name: "Tripletex" },
      { id: 4, name: "Business NXT" },
      { id: 5, name: "Microsoft 365" }
    ]
  },
  records: [
    ticket(48213, 1, "Bilag synker ikke fra Visma Net", { categoryId: 2 }),
    ticket(48220, 1, "Kan ikke logge inn i SuperOffice", { x_product: 1 }),
    ticket(48231, 2, "Feil MVA-kode i Tripletex-eksport", { categoryId: 2 }),
    ticket(48240, 1, "Ny bruker i Microsoft 365", { x_product: 5 }),
    ticket(48244, 3, "Faktura mangler KID", { categoryId: 3 })
  ],
  selections: [
    { id: 41, name: "Saker uten produkt", recordIds: [48213, 48231, 48244] },
    { id: 42, name: "Åpne integrasjonssaker", recordIds: [48213, 48231] }
  ],
  udefs: []
};
