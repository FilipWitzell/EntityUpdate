import type { EntityConfig } from "@/types/EntityQuickUpdate";

/**
 * The project (prosjekt) panel. To add, remove or reorder fields, edit the list - the panel builds itself from it.
 * important: true marks the field in red when it has no value.
 */
export const PROJECT: EntityConfig = {
  name: "project",
  noun: { indefinite: "prosjekt", definite: "prosjektet", plural: "prosjektene" },
  restEntity: "Project",
  // SuperOffice's own field labels, in the user's language, come from this archive's columns.
  labelProvider: "FindProject",
  beforeSaveEvent: "SalesBeforeSaveProject",
  cardProtocol: (id) => `project.main?project_id=${id}`,
  titleOf: (project) => String(project.Name ?? ""),
  subtitleOf: (project) => ["Prosjekt", project.ProjectNumber].filter(Boolean).join(" · "),
  fields: [
    { key: "name", archiveColumn: "name", property: "Name", label: "Navn", kind: "text", group: "Nøkkelinfo" },
    { key: "projectNumber", archiveColumn: "number", property: "ProjectNumber", label: "Prosjektnummer", kind: "text", group: "Nøkkelinfo" },
    {
      key: "associateId",
      property: "Associate",
      idField: "AssociateId",
      mdoList: "associate",
      label: "Ansvarlig",
      kind: "select",
      group: "Nøkkelinfo",
      important: true
    },
    {
      key: "projectTypeId",
      archiveColumn: "type",
      property: "ProjectType",
      mdoList: "projecttype",
      label: "Type",
      kind: "select",
      group: "Klassifisering"
    },
    {
      key: "projectStatusId",
      archiveColumn: "status",
      property: "ProjectStatus",
      mdoList: "projectstatus",
      label: "Status",
      kind: "select",
      group: "Klassifisering",
      important: true
    },
    // In the field picker, off until someone turns them on.
    {
      key: "endDate",
      archiveColumn: "endDate",
      property: "EndDate",
      label: "Sluttdato",
      kind: "date",
      group: "Klassifisering",
      hiddenByDefault: true
    },
    {
      key: "completed",
      archiveColumn: "completed",
      property: "Completed",
      label: "Ferdig",
      kind: "checkbox",
      group: "Klassifisering",
      hiddenByDefault: true
    },
    {
      key: "description",
      archiveColumn: "description",
      property: "Description",
      label: "Beskrivelse",
      kind: "longtext",
      group: "Beskrivelse",
      hiddenByDefault: true
    },
    { key: "postit", property: "Postit", label: "Notat", kind: "longtext", group: "Beskrivelse", hiddenByDefault: true }
  ],
  udef: { provider: "Project", columnPrefix: "projectUdef/" },
  worklist: {
    currentLabel: "Prosjektet du står på",
    mineLabel: "Mine prosjekter",
    othersLabel: "Andres prosjekter",
    archive: "Project",
    idColumn: "projectId",
    titleColumn: "name",
    metaColumns: ["projectNumber"],
    orderBy: "name asc",
    ownedBy: (associateId) => `associateId eq ${associateId}`,
    selectionTable: 11
  }
};
