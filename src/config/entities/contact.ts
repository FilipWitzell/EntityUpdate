import type { EntityConfig } from "@/types/EntityQuickUpdate";

/**
 * The company (firma) panel. To add, remove or reorder fields, edit the list - the panel builds itself from it.
 * important: true marks the field in red when it has no value.
 */
export const CONTACT: EntityConfig = {
  name: "contact",
  noun: { indefinite: "firma", definite: "firmaet", plural: "firmaene" },
  restEntity: "Contact",
  beforeSaveEvent: "SalesBeforeSaveContact",
  cardProtocol: (id) => `contact.main?contact_id=${id}`,
  titleOf: (contact) => [contact.Name, contact.Department].filter(Boolean).join(", "),
  subtitleOf: (contact) => ["Firma", contact.OrgNr].filter(Boolean).join(" · "),
  fields: [
    { key: "name", property: "Name", label: "Navn", kind: "text", group: "Nøkkelinfo" },
    { key: "department", property: "Department", label: "Avdeling", kind: "text", group: "Nøkkelinfo", hiddenByDefault: true },
    { key: "categoryId", property: "Category", mdoList: "category", label: "Kategori", kind: "select", group: "Nøkkelinfo", important: true },
    {
      key: "associateId",
      property: "Associate",
      idField: "AssociateId",
      mdoList: "associate",
      label: "Vår kontakt",
      kind: "select",
      group: "Nøkkelinfo",
      important: true
    },
    { key: "businessId", property: "Business", mdoList: "business", label: "Bransje", kind: "select", group: "Klassifisering" },
    { key: "orgNr", property: "OrgNr", label: "Org.nr", kind: "text", group: "Klassifisering" },
    // In the field picker, off until someone turns them on.
    { key: "number1", property: "Number1", label: "Kode", kind: "text", group: "Klassifisering", hiddenByDefault: true },
    { key: "number2", property: "Number2", label: "Nummer", kind: "text", group: "Klassifisering", hiddenByDefault: true },
    {
      key: "countryId",
      property: "Country",
      idField: "CountryId",
      mdoList: "country",
      label: "Land",
      kind: "select",
      group: "Klassifisering",
      hiddenByDefault: true
    },
    {
      key: "supportAssociateId",
      property: "SupportAssociate",
      idField: "AssociateId",
      mdoList: "associate",
      label: "Supportkontakt",
      kind: "select",
      group: "Klassifisering",
      hiddenByDefault: true
    },
    { key: "noMailing", property: "NoMailing", label: "Ingen utsendelser", kind: "checkbox", group: "Klassifisering", hiddenByDefault: true },
    { key: "stop", property: "Xstop", label: "Stopp", kind: "checkbox", group: "Klassifisering", hiddenByDefault: true },
    { key: "description", property: "Description", label: "Notat", kind: "longtext", group: "Notat", hiddenByDefault: true }
  ],
  udef: { provider: "FindContact", columnPrefix: "contactUdef/" },
  worklist: {
    currentLabel: "Firmaet du står på",
    mineLabel: "Mine firma",
    othersLabel: "Andres firma",
    archive: "Contact",
    idColumn: "contactId",
    titleColumn: "name",
    metaColumns: ["department", "orgnr"],
    orderBy: "name asc",
    ownedBy: (associateId) => `associateId eq ${associateId}`,
    selectionTable: 5
  }
};
