import type { ListItem, SaleFieldDefinition, SaleStatus } from "@/types/SaleQuickUpdate";

/**
 * The fields shown in the panel, in display order.
 * To add, remove or reorder fields, edit this list - the panel builds itself from it.
 * important: true marks the field in red when it has no value.
 */
export const SALE_FIELDS: SaleFieldDefinition[] = [
  { key: "heading", label: "Tittel", kind: "text", group: "Nøkkelinfo" },
  { key: "amount", label: "Sum", kind: "amount", group: "Nøkkelinfo", important: true },
  { key: "earning", label: "Fortjeneste", kind: "amount", group: "Nøkkelinfo", hiddenByDefault: true },
  { key: "saledate", label: "Salgsdato", kind: "date", group: "Nøkkelinfo", important: true },
  { key: "associateId", label: "Eier", kind: "select", list: "associate", group: "Nøkkelinfo", important: true },
  { key: "saleTypeId", label: "Salgstype", kind: "select", list: "saleType", group: "Nøkkelinfo", important: true },
  { key: "stageId", label: "Fase", kind: "select", list: "stage", group: "Fase og status", important: true },
  { key: "probability", label: "Sannsynlighet", kind: "percent", group: "Fase og status" },
  { key: "status", label: "Status", kind: "select", list: "status", group: "Fase og status" },
  { key: "reasonId", label: "Grunn", kind: "select", group: "Fase og status" }, // List depends on status, see reasonListFor()
  { key: "reopenDate", label: "Gjenåpningsdato", kind: "date", group: "Fase og status", showWhenStatus: "Stalled" },
  { key: "sourceId", label: "Kilde", kind: "select", list: "source", group: "Klassifisering", important: true },
  { key: "competitorId", label: "Konkurrent", kind: "select", list: "competitor", group: "Klassifisering" },
  { key: "projectId", label: "Prosjekt", kind: "project", group: "Klassifisering" },
  { key: "contactId", label: "Firma", kind: "contact", group: "Klassifisering" },
  { key: "personId", label: "Kontaktperson", kind: "person", group: "Klassifisering" }
];

/**
 * Fields placed after the user-defined fields, at the very bottom of the panel. The description
 * can hold a lot of text, so it gets the last spot and the full width.
 */
export const TRAILING_FIELDS: SaleFieldDefinition[] = [
  { key: "saleText", label: "Beskrivelse", kind: "longtext", group: "Beskrivelse", hiddenByDefault: true }
];

export const SALE_STATUSES: ListItem[] = [
  { id: "Open", name: "Åpen" },
  { id: "Sold", name: "Solgt" },
  { id: "Lost", name: "Tapt" },
  { id: "Stalled", name: "Stoppet" }
];

/** Which reason list belongs to a status. Open sales have no reason. */
export function reasonListFor(status: SaleStatus | null): "reasonSold" | "reasonLost" | "reasonStalled" | null {
  if (status === "Sold") return "reasonSold";
  if (status === "Lost") return "reasonLost";
  if (status === "Stalled") return "reasonStalled";
  return null;
}
