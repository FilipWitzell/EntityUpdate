import type { EntityConfig } from "@/types/EntityQuickUpdate";

/**
 * The ticket (sak) panel. The list holds every built-in field worth editing; those with hiddenByDefault
 * wait in the field picker until someone turns them on. important: true marks the field in red when it
 * has no value. Property and id names follow TicketEntity in the REST API (e.g. Category.TicketCategoryId).
 */
export const TICKET: EntityConfig = {
  name: "ticket",
  noun: { indefinite: "sak", definite: "saken", plural: "sakene" },
  restEntity: "Ticket",
  updatedAtProperty: "LastChanged",
  cardProtocol: (id) => `ticket.main?ticket_id=${id}`,
  titleOf: (ticket) => String(ticket.Title ?? ""),
  subtitleOf: (ticket) => `Sak #${ticket.TicketId}`,
  // The contact person's company: its persons are offered first when the contact person is changed.
  contactIdOf: (ticket) => Number((ticket.Person as { ContactId?: number } | null)?.ContactId ?? 0),
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
    { key: "personId", property: "Person", idField: "PersonId", nameField: "FullName", label: "Kontaktperson", kind: "person", group: "Nøkkelinfo" },
    {
      key: "categoryId",
      property: "Category",
      idField: "TicketCategoryId",
      mdoList: "ejcategory",
      label: "Kategori",
      kind: "select",
      group: "Klassifisering"
    },
    {
      key: "priorityId",
      property: "Priority",
      idField: "TicketPriorityId",
      mdoList: "ticketpriority",
      label: "Prioritet",
      kind: "select",
      group: "Klassifisering",
      hiddenByDefault: true
    },
    {
      key: "statusId",
      property: "Status",
      idField: "TicketStatusId",
      mdoList: "ticketstatus",
      label: "Status",
      kind: "select",
      group: "Klassifisering",
      hiddenByDefault: true
    },
    {
      key: "ticketTypeId",
      property: "TicketType",
      idField: "TicketTypeId",
      mdoList: "tickettype",
      label: "Sakstype",
      kind: "select",
      group: "Klassifisering",
      hiddenByDefault: true
    },
    { key: "deadline", property: "Deadline", label: "Frist", kind: "datetime", group: "Oppfølging", hiddenByDefault: true }
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
