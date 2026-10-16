import type { EntityConfig } from "@/types/EntityQuickUpdate";

/**
 * The person panel. To add, remove or reorder fields, edit the list - the panel builds itself from it.
 * important: true marks the field in red when it has no value.
 */
export const PERSON: EntityConfig = {
  name: "person",
  noun: { indefinite: "person", definite: "personen", plural: "personene" },
  restEntity: "Person",
  // SuperOffice's own field labels, in the user's language, come from this archive's columns.
  labelProvider: "Person",
  beforeSaveEvent: "SalesBeforeSavePerson",
  cardProtocol: (id) => `person.main?person_id=${id}`,
  titleOf: (person) => [person.Firstname, person.MiddleName, person.Lastname].filter(Boolean).join(" "),
  subtitleOf: (person) => ["Person", (person.Contact as { Name?: string } | null | undefined)?.Name].filter(Boolean).join(" · "),
  fields: [
    { key: "firstname", archiveColumn: "firstName", property: "Firstname", label: "Fornavn", kind: "text", group: "Nøkkelinfo" },
    { key: "lastname", archiveColumn: "lastName", property: "Lastname", label: "Etternavn", kind: "text", group: "Nøkkelinfo" },
    { key: "title", archiveColumn: "title", property: "Title", label: "Tittel", kind: "text", group: "Nøkkelinfo" },
    {
      key: "positionId",
      archiveColumn: "position",
      property: "Position",
      mdoList: "perspos",
      label: "Posisjon",
      kind: "select",
      group: "Nøkkelinfo"
    },
    // No "Vår kontakt": a person's follows the company's.
    {
      key: "retired",
      archiveColumn: "retired",
      property: "Retired",
      label: "Sluttet",
      kind: "checkbox",
      group: "Klassifisering",
      hiddenByDefault: true
    },
    // Personvern: the legal base of each consent, shown only - consents are changed on the card.
    // The E-markedsføring switch on the card's Interesser tab: on when the person gets mailings.
    { key: "emarketing", property: "NoMailing", inverted: true, readOnly: true, label: "E-markedsføring", kind: "checkbox", group: "Personvern" },
    {
      key: "consent:EMARKET",
      archiveColumn: "legalBaseEmarketing",
      consentPurpose: "EMARKET",
      mdoList: "legalbase",
      readOnly: true,
      emptyText: "Ikke registrert",
      label: "Hjemmel - E-markedsføring",
      kind: "select",
      group: "Personvern"
    },
    {
      key: "consent:STORE",
      archiveColumn: "legalBaseStore",
      consentPurpose: "STORE",
      mdoList: "legalbase",
      readOnly: true,
      emptyText: "Ikke registrert",
      label: "Hjemmel - Salg og kundeservice",
      kind: "select",
      group: "Personvern"
    },
    // In the field picker, off until someone turns them on.
    {
      key: "middleName",
      archiveColumn: "middleName",
      property: "MiddleName",
      label: "Mellomnavn",
      kind: "text",
      group: "Nøkkelinfo",
      hiddenByDefault: true
    },
    {
      key: "categoryId",
      archiveColumn: "personCategory",
      property: "Category",
      mdoList: "category",
      label: "Kategori",
      kind: "select",
      group: "Klassifisering",
      hiddenByDefault: true
    },
    {
      key: "businessId",
      archiveColumn: "personBusiness",
      property: "Business",
      mdoList: "business",
      label: "Bransje",
      kind: "select",
      group: "Klassifisering",
      hiddenByDefault: true
    },
    {
      key: "countryId",
      archiveColumn: "personCountry",
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
      key: "personNumber",
      archiveColumn: "personNumber",
      property: "PersonNumber",
      label: "Nummer",
      kind: "text",
      group: "Klassifisering",
      hiddenByDefault: true
    },
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
