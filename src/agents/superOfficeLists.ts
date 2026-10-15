import { restApiDefaultHeaders, type SuperOfficeAgent } from "@/agents/SuperOfficeAgent";
import { tidyLabel, tidyListName } from "@/config/superOfficeValues";
import type { FieldKind, ListItem } from "@/types/Fields";

/** Lists and field metadata every panel reads the same way. */

export interface MDOListItem {
  Id: number;
  Name: string;
  Deleted?: boolean;
}

/** The items of an MDO list (category, business, associate...), without deleted ones and the empty item. */
export async function fetchMDOList(agent: SuperOfficeAgent, listName: string): Promise<ListItem[]> {
  const response = await agent.Request({
    method: "GET",
    endpoint: `/api/v1/MDOList/${listName}`,
    urlParams: new URLSearchParams({ flat: "true" }),
    headers: restApiDefaultHeaders()
  });
  const items = (await response.json()) as MDOListItem[];
  return items.filter((item) => item.Id > 0 && !item.Deleted).map((item) => ({ id: item.Id, name: tidyListName(item.Name) }));
}

/** Archive column types of user-defined fields the panel can edit. */
const UDEF_KINDS: Record<string, { kind: FieldKind; numberType?: "int" | "decimal" } | undefined> = {
  string: { kind: "text" },
  int: { kind: "number", numberType: "int" },
  decimal: { kind: "number", numberType: "decimal" },
  date: { kind: "date" },
  checkbox: { kind: "checkbox" }
};

export interface UdefColumn {
  progId: string;
  label: string;
  kind: FieldKind;
  numberType?: "int" | "decimal";
}

/**
 * An extra field (x_...) as /api/v1/<Entity>/CustomField describes it. The base is FieldInfoBase; the
 * rest comes with the field's own type (FieldInfoRelation, FieldInfoListText, FieldInfoMdoList, ...).
 */
export interface ExtraFieldInfo {
  FieldName: string;
  FieldType: string;
  DisplayName: string;
  HideField?: boolean;
  IsReadOnly?: boolean;
  Rank?: number;
  /** Relations: the table the field points to, e.g. "y_product" or "contact". */
  TargetTable?: string;
  /** "Select from list" text fields: the values to pick from. */
  Choices?: string[];
  /** List fields: the MDO list the values come from. */
  MdoListName?: string;
}

/**
 * The extra fields on an entity, in SuperOffice's order. The same call also lists published user-defined
 * fields; those are read from the archive (fetchUdefColumns), so only x_ fields are kept here.
 */
export async function fetchExtraFields(agent: SuperOfficeAgent, restEntity: string): Promise<ExtraFieldInfo[]> {
  const response = await agent.Request({
    method: "GET",
    endpoint: `/api/v1/${restEntity}/CustomField`,
    headers: restApiDefaultHeaders()
  });
  const fields = (await response.json()) as ExtraFieldInfo[];
  return fields
    .filter((field) => field.FieldName.startsWith("x_") && !field.HideField)
    .sort((a, b) => (a.Rank ?? 0) - (b.Rank ?? 0));
}

/** The field an extra table shows its rows by (its "Visningsfelt"), e.g. "x_product_name" for y_product. */
export async function fetchExtraTableDisplayField(agent: SuperOfficeAgent, table: string): Promise<string> {
  const response = await agent.Request({
    method: "POST",
    endpoint: "/api/v1/Agents/CustomObject/GetCustomObjectDefinition",
    body: { DefinitionName: table },
    headers: restApiDefaultHeaders()
  });
  const definition = (await response.json()) as { DisplayField?: string };
  if (!definition.DisplayField) throw new Error(`${table} har ikke noe visningsfelt.`);
  return definition.DisplayField;
}

/**
 * The rows of an extra table, through the dynamic archive: id and the field shown, sorted by id as
 * SuperOffice does. The archive names its columns "<table>.<field>"; a plain "<field>" is read too.
 */
export async function fetchExtraTableRows(agent: SuperOfficeAgent, table: string, displayField: string): Promise<ListItem[]> {
  const rows = await agent.QueryEntities({
    entity: "Archive/dynamic",
    select: `${table}.id,${table}.${displayField}`,
    orderBy: `${table}.id asc`,
    top: 1000
  });
  return rows
    .map((row) => ({ id: Number(row[`${table}.id`] ?? row.id), name: String(row[`${table}.${displayField}`] ?? row[displayField] ?? "") }))
    .filter((row) => row.id > 0);
}

/**
 * User-defined fields, read from an archive provider's columns (e.g. contactUdef/<progId> in FindContact),
 * which carry each field's label and type. List fields are left out for now.
 */
export async function fetchUdefColumns(agent: SuperOfficeAgent, provider: string, columnPrefix: string): Promise<UdefColumn[]> {
  const response = await agent.Request({
    method: "POST",
    endpoint: "/api/v1/Agents/Archive/GetAvailableColumns",
    body: { ProviderName: provider },
    headers: restApiDefaultHeaders()
  });
  const columns = (await response.json()) as { Name: string; DisplayName: string; DisplayType: string }[];
  return columns
    .filter((column) => column.Name.startsWith(columnPrefix) && UDEF_KINDS[column.DisplayType])
    .map((column) => {
      const { kind, numberType } = UDEF_KINDS[column.DisplayType]!;
      return { progId: column.Name.substring(columnPrefix.length), label: tidyLabel(column.DisplayName), kind, numberType };
    });
}

/** The persons on a company, by name. */
export async function fetchPersonsOnContact(agent: SuperOfficeAgent, contactId: number): Promise<ListItem[]> {
  if (!contactId) return [];
  const persons = await agent.QueryEntities({
    entity: "Person",
    select: "personId,fullName",
    filter: `contactId eq ${contactId}`,
    orderBy: "fullName asc",
    top: 500
  });
  return persons.map((person) => ({ id: Number(person.personId), name: String(person.fullName ?? "") }));
}

/** Persons on any company whose name contains the query. */
export async function searchPersons(agent: SuperOfficeAgent, query: string): Promise<ListItem[]> {
  const persons = await agent.QueryEntities({
    entity: "Person",
    select: "personId,fullName",
    filter: `fullName contains '${query.replace(/'/g, "''")}'`,
    orderBy: "fullName asc",
    top: 50
  });
  return persons.map((person) => ({ id: Number(person.personId), name: String(person.fullName ?? "") }));
}
