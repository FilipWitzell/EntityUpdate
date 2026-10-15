import type { EntityConfig } from "@/types/EntityQuickUpdate";

/**
 * The person panel. To add, remove or reorder fields, edit the list - the panel builds itself from it.
 * important: true marks the field in red when it has no value.
 */
export const PERSON: EntityConfig = {
  name: "person",
  noun: { indefinite: "person", definite: "personen", plural: "personene" },
  restEntity: "Person",
  beforeSaveEvent: "SalesBeforeSavePerson",
  cardProtocol: (id) => `person.main?person_id=${id}`,
  titleOf: (person) => [person.Firstname, person.MiddleName, person.Lastname].filter(Boolean).join(" "),
  subtitleOf: (person) => ["Person", (person.Contact as { Name?: string } | null | undefined)?.Name].filter(Boolean).join(" · "),
  fields: [
    { key: "firstname", property: "Firstname", label: "Fornavn", kind: "text", group: "Nøkkelinfo" },
    { key: "lastname", property: "Lastname", label: "Etternavn", kind: "text", group: "Nøkkelinfo" },
    { key: "title", property: "Title", label: "Tittel", kind: "text", group: "Nøkkelinfo" },
    { key: "positionId", property: "Position", mdoList: "perspos", label: "Stilling", kind: "select", group: "Nøkkelinfo" },
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
    { key: "retired", property: "Retired", label: "Sluttet", kind: "checkbox", group: "Klassifisering", hiddenByDefault: true },
    // In the field picker, off until someone turns them on.
    { key: "middleName", property: "MiddleName", label: "Mellomnavn", kind: "text", group: "Nøkkelinfo", hiddenByDefault: true },
    {
      key: "categoryId",
      property: "Category",
      mdoList: "category",
      label: "Kategori",
      kind: "select",
      group: "Klassifisering",
      hiddenByDefault: true
    },
    {
      key: "businessId",
      property: "Business",
      mdoList: "business",
      label: "Bransje",
      kind: "select",
      group: "Klassifisering",
      hiddenByDefault: true
    },
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
    { key: "personNumber", property: "PersonNumber", label: "Nummer", kind: "text", group: "Klassifisering", hiddenByDefault: true },
    { key: "description", property: "Description", label: "Notat", kind: "longtext", group: "Notat", hiddenByDefault: true }
  ],
  udef: { provider: "Person", columnPrefix: "personUdef/" },
  worklist: {
    currentLabel: "Personen du står på",
    mineLabel: "Mine personer",
    othersLabel: "Andres personer",
    archive: "Person",
    idColumn: "personId",
    titleColumn: "fullName",
    metaColumns: ["title"],
    orderBy: "fullName asc",
    ownedBy: (associateId) => `associateId eq ${associateId}`,
    selectionTable: 6
  }
};
