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
