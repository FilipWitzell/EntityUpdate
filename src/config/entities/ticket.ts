import type { EntityConfig } from "@/types/EntityQuickUpdate";

/**
 * The ticket (sak) panel. To add, remove or reorder fields, edit the list - the panel builds itself from it.
 * important: true marks the field in red when it has no value.
 */
export const TICKET: EntityConfig = {
  name: "ticket",
  noun: { indefinite: "sak", definite: "saken", plural: "sakene" },
  restEntity: "Ticket",
  cardProtocol: (id) => `ticket.main?ticket_id=${id}`,
  titleOf: (ticket) => String(ticket.Title ?? ""),
  subtitleOf: (ticket) => `Sak #${ticket.TicketId}`,
  fields: [
    { key: "title", property: "Title", label: "Tittel", kind: "text", group: "Nøkkelinfo" },
    {
      key: "ownedBy",
      property: "OwnedBy",
      idField: "AssociateId",
      mdoList: "associate",
      label: "Eier",
      kind: "select",
      group: "Nøkkelinfo",
      important: true
    },
    { key: "categoryId", property: "Category", mdoList: "ejcategory", label: "Kategori", kind: "select", group: "Klassifisering" }
  ],
  // Tickets have extra fields (x_...), not user-defined fields. The panel finds them in SuperOffice, e.g.
  // x_product, a relation to the extra table y_product.
  udef: null,
  worklist: {
    currentLabel: "Saken du står på",
    mineLabel: "Mine saker",
    othersLabel: "Andres saker",
    archive: "Ticket",
    idColumn: "ticketId",
    titleColumn: "title",
    metaColumns: ["ticketId"],
    orderBy: "ticketId desc",
    ownedBy: (associateId) => `ownedBy eq ${associateId}`,
    selectionTable: 262
  }
};
