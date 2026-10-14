import type { EntityConfig } from "@/types/EntityQuickUpdate";

/**
 * The person panel. To add, remove or reorder fields, edit the list - the panel builds itself from it.
 * important: true marks the field in red when it has no value.
 */
export const PERSON: EntityConfig = {
  name: "person",
  noun: { indefinite: "person", definite: "personen", plural: "personene" },
  restEntity: "Person",
  cardProtocol: (id) => `person.main?person_id=${id}`,
  titleOf: (person) => [person.Firstname, person.MiddleName, person.Lastname].filter(Boolean).join(" "),
  subtitleOf: (person) => ["Person", (person.Contact as { Name?: string } | null | undefined)?.Name].filter(Boolean).join(" · "),
  fields: [
    { key: "firstname", property: "Firstname", label: "Fornavn", kind: "text", group: "Nøkkelinfo" },
    { key: "lastname", property: "Lastname", label: "Etternavn", kind: "text", group: "Nøkkelinfo" },
    { key: "title", property: "Title", label: "Tittel", kind: "text", group: "Nøkkelinfo" },
    { key: "positionId", property: "Position", mdoList: "position", label: "Stilling", kind: "select", group: "Nøkkelinfo" },
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
    { key: "retired", property: "Retired", label: "Sluttet", kind: "checkbox", group: "Klassifisering", hiddenByDefault: true }
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
