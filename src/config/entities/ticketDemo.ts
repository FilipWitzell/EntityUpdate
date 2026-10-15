import type { EntityDemoData } from "@/agents/DemoEntityAgent";
import type { EntitySnapshot } from "@/types/EntityQuickUpdate";
import type { ListItem } from "@/types/Fields";

/** Tickets for the demo (#/demo/ticket). The demo user is associate 1 (Per Hansen). */

/** The demo companies' persons, by company id. */
const PERSONS: Record<number, ListItem[]> = {
  101: [
    { id: 1001, name: "Anne Berg" },
    { id: 1002, name: "Jonas Lie" }
  ],
  102: [
    { id: 1011, name: "Marte Dahl" },
    { id: 1012, name: "Sindre Moe" }
  ],
  103: [{ id: 1021, name: "Ingrid Solberg" }]
};

function ticket(id: number, ownerId: number, title: string, contactId: number, personId: number, values: EntitySnapshot["values"]) {
  const person = PERSONS[contactId]?.find((item) => item.id === personId);
  return {
    id,
    ownerId,
    title,
    subtitle: `Sak #${id}`,
    meta: `#${id}`,
    updatedAt: "2026-10-01T08:00:00",
    updatedBy: "Per Hansen",
    contactId,
    names: (person ? { personId: person } : {}) as Record<string, ListItem>,
    values: {
      title,
      ownedBy: ownerId,
      personId,
      categoryId: 1,
      priorityId: 2,
      statusId: 1,
      ticketTypeId: 1,
      deadline: null,
      x_product: null,
      ...values
    }
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
    ticketpriority: [
      { id: 1, name: "Lav" },
      { id: 2, name: "Normal" },
      { id: 3, name: "Høy" }
    ],
    ticketstatus: [
      { id: 1, name: "Åpen" },
      { id: 2, name: "Lukket" },
      { id: 3, name: "Utsatt" }
    ],
    tickettype: [
      { id: 1, name: "Standard" },
      { id: 2, name: "Bestilling" }
    ]
  },
  persons: PERSONS,
  records: [
    ticket(48213, 1, "Bilag synker ikke fra Visma Net", 101, 1001, { categoryId: 2, deadline: "2026-10-20T12:00:00" }),
    ticket(48220, 1, "Kan ikke logge inn i SuperOffice", 102, 1011, { x_product: 1, priorityId: 3 }),
    ticket(48231, 2, "Feil MVA-kode i Tripletex-eksport", 101, 1002, { categoryId: 2 }),
    ticket(48240, 1, "Ny bruker i Microsoft 365", 103, 1021, { x_product: 5, ticketTypeId: 2 }),
    ticket(48244, 3, "Faktura mangler KID", 102, 1012, { categoryId: 3 })
  ],
  selections: [
    { id: 41, name: "Saker uten produkt", recordIds: [48213, 48231, 48244] },
    { id: 42, name: "Åpne integrasjonssaker", recordIds: [48213, 48231] }
  ],
  // The extra fields SuperOffice would report for tickets.
  customFields: [
    {
      key: "x_product",
      customField: "x_product",
      extraTable: { table: "y_product", displayField: "x_product_name" },
      label: "Product",
      kind: "select",
      group: "Ekstrafelt",
      choices: [
        { id: 1, name: "SuperOffice" },
        { id: 2, name: "Visma Net" },
        { id: 3, name: "Tripletex" },
        { id: 4, name: "Business NXT" },
        { id: 5, name: "Microsoft 365" }
      ]
    }
  ]
};
