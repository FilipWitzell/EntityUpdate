import type { EntityConfig } from "@/types/EntityQuickUpdate";

/**
 * The company (firma) panel. To add, remove or reorder fields, edit the list - the panel builds itself from it.
 * important: true marks the field in red when it has no value.
 */
export const CONTACT: EntityConfig = {
  name: "contact",
  noun: { indefinite: "firma", definite: "firmaet", plural: "firmaene" },
  restEntity: "Contact",
  // SuperOffice's own field labels, in the user's language, come from this archive's columns.
  labelProvider: "FindContact",
  beforeSaveEvent: "SalesBeforeSaveContact",
  cardProtocol: (id) => `contact.main?contact_id=${id}`,
  titleOf: (contact) => [contact.Name, contact.Department].filter(Boolean).join(", "),
  subtitleOf: (contact) => ["Firma", contact.OrgNr].filter(Boolean).join(" · "),
  fields: [
    { key: "name", archiveColumn: "name", property: "Name", label: "Navn", kind: "text", group: "Nøkkelinfo" },
    {
      key: "department",
      archiveColumn: "department",
      property: "Department",
      label: "Avdeling",
      kind: "text",
      group: "Nøkkelinfo",
      hiddenByDefault: true
    },
    {
      key: "categoryId",
      archiveColumn: "category",
      property: "Category",
      mdoList: "category",
      label: "Kategori",
      kind: "select",
      group: "Nøkkelinfo",
      important: true
    },
    {
      key: "associateId",
      archiveColumn: "associateId",
      property: "Associate",
      idField: "AssociateId",
      mdoList: "associate",
      label: "Vår kontakt",
      kind: "select",
      group: "Nøkkelinfo",
      important: true
    },
    {
      key: "businessId",
      archiveColumn: "business",
      property: "Business",
      mdoList: "business",
      label: "Bransje",
      kind: "select",
      group: "Klassifisering"
    },
    { key: "orgNr", archiveColumn: "orgnr", property: "OrgNr", label: "Org.nr", kind: "text", group: "Klassifisering" },
    // In the field picker, off until someone turns them on.
    { key: "number1", archiveColumn: "code", property: "Number1", label: "Kode", kind: "text", group: "Klassifisering", hiddenByDefault: true },
    { key: "number2", archiveColumn: "number", property: "Number2", label: "Nummer", kind: "text", group: "Klassifisering", hiddenByDefault: true },
    {
      key: "countryId",
      archiveColumn: "country",
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
      archiveColumn: "supportAssociate",
      property: "SupportAssociate",
      idField: "AssociateId",
      mdoList: "associate",
      label: "Supportkontakt",
      kind: "select",
      group: "Klassifisering",
      hiddenByDefault: true
    },
    {
      key: "noMailing",
      archiveColumn: "contactNoMail",
      property: "NoMailing",
      label: "Ingen utsendelser",
      kind: "checkbox",
      group: "Klassifisering",
      hiddenByDefault: true
    },
    { key: "stop", archiveColumn: "stop", property: "Xstop", label: "Stopp", kind: "checkbox", group: "Klassifisering", hiddenByDefault: true },
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
