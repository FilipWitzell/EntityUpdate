import type { EntityDemoData } from "@/agents/DemoEntityAgent";
import type { EntitySnapshot } from "@/types/EntityQuickUpdate";

/** Companies for the demo (#/demo/contact). The demo user is associate 1 (Per Hansen). */

function company(id: number, ownerId: number, name: string, orgNr: string | null, values: EntitySnapshot["values"]) {
  return {
    id,
    ownerId,
    title: name,
    subtitle: ["Firma", orgNr].filter(Boolean).join(" · "),
    meta: orgNr ?? "",
    updatedAt: "2026-10-01T08:00:00",
    updatedBy: "Per Hansen",
    values: { name, department: null, orgNr, associateId: ownerId, "udef:demo:erp": null, ...values }
  };
}

export const CONTACT_DEMO: EntityDemoData = {
  currentAssociateId: 1,
  options: {
    associate: [
      { id: 1, name: "Per Hansen" },
      { id: 2, name: "Kari Nordmann" },
      { id: 3, name: "Ola Nordmann" }
    ],
    category: [
      { id: 1, name: "Kunde" },
      { id: 2, name: "Prospekt" },
      { id: 3, name: "Partner" },
      { id: 4, name: "Leverandør" }
    ],
    business: [
      { id: 1, name: "Elektro" },
      { id: 2, name: "IT" },
      { id: 3, name: "Bygg" },
      { id: 4, name: "Regnskap" }
    ]
  },
  records: [
    company(2001, 1, "Drammen Elektro AS", "912345678", { categoryId: 2, businessId: 1 }),
    company(2002, 1, "Lier Regnskap AS", "923456789", { categoryId: 1, businessId: 4, "udef:demo:erp": "Tripletex" }),
    company(2003, 2, "Buskerud Bygg AS", "934567890", { categoryId: 1, businessId: 3 }),
    company(2004, 1, "Kongsberg IT AS", "945678901", { categoryId: 3, businessId: 2, "udef:demo:erp": "Business NXT" }),
    company(2005, 3, "Hokksund VVS AS", null, { categoryId: null, businessId: 3 })
  ],
  selections: [
    { id: 1, name: "Kunder uten ERP-system", recordIds: [2001, 2003, 2005] },
    { id: 2, name: "Prospekter Buskerud", recordIds: [2001, 2005] },
    { id: 3, name: "Partnere", recordIds: [2004] }
  ],
  udefs: [
    { key: "udef:demo:erp", label: "ERP-system", kind: "text", group: "Egendefinerte felt", hiddenByDefault: true, udef: { progId: "demo:erp" } }
  ]
};
