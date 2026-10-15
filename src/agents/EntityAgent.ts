import { SuperOfficeAgent, restApiDefaultHeaders } from "@/agents/SuperOfficeAgent";
import { LayoutPreferences } from "@/agents/LayoutPreferences";
import {
  fetchExtraFields,
  fetchExtraTableDisplayField,
  fetchExtraTableRows,
  fetchMDOList,
  fetchPersonsOnContact,
  fetchUdefColumns,
  searchContacts,
  searchPersons,
  type ExtraFieldInfo
} from "@/agents/superOfficeLists";
import { tidyLabel, tidyListName } from "@/config/superOfficeValues";
import { EntityChangedError } from "@/agents/EntityChangedError";
import { toSaveRule, type SaveRule } from "@/config/beforeSave";
import { optionListKey, readNames, readValues, writeValues } from "@/config/entityValues";
import type { SuperOfficeObject } from "@/types/SuperOfficeObject";
import type { FieldLayouts, LayoutLevel, ListItem, SavedLayout } from "@/types/Fields";
import type {
  EntityConfig,
  EntityDataSource,
  EntityFieldDefinition,
  EntitySnapshot,
  EntityValues,
  RestEntity,
  WorklistItem
} from "@/types/EntityQuickUpdate";

/** Reads and updates one kind of entity through the SuperOffice REST API, as the logged in user, driven by its config. */
export class EntityAgent implements EntityDataSource {
  private agent = new SuperOfficeAgent();
  private layouts: LayoutPreferences;

  constructor(private config: EntityConfig) {
    this.layouts = new LayoutPreferences(
      this.agent,
      { section: "EntityUpdate", standardKey: `FieldLayout.${config.name}`, personalKey: `MyFieldLayout.${config.name}` },
      () => this.GetCurrentAssociateId()
    );
  }

  async Get(id: number): Promise<EntitySnapshot> {
    // Extra fields are read by their definition, so the record waits for them (they are fetched once).
    const [entity, custom] = await Promise.all([this.fetchEntity(id), this.GetCustomFieldDefinitions()]);
    return {
      id,
      title: this.config.titleOf(entity),
      subtitle: this.config.subtitleOf(entity),
      values: readValues(entity, [...this.config.fields, ...custom]),
      names: readNames(entity, this.config.fields),
      contactId: this.config.contactIdOf?.(entity),
      ...this.savedBy(entity)
    };
  }

  GetPersons(contactId: number): Promise<ListItem[]> {
    return fetchPersonsOnContact(this.agent, contactId);
  }

  SearchPersons(query: string): Promise<ListItem[]> {
    return searchPersons(this.agent, query);
  }

  SearchContacts(query: string): Promise<ListItem[]> {
    return searchContacts(this.agent, query);
  }

  /** Every list the fields pick from: MDO lists, and rows of extra tables. Read once per panel. */
  async GetOptions(): Promise<Record<string, ListItem[]>> {
    const fields = [
      ...new Map(
        this.config.fields.flatMap((field) => {
          const key = optionListKey(field);
          return key ? [[key, field] as const] : [];
        })
      ).entries()
    ];
    // A list that can't be read (e.g. a list name this tenant does not have) leaves only its own field empty.
    const lists = await Promise.all(
      fields.map(([key, field]) =>
        (field.extraTable
          ? fetchExtraTableRows(this.agent, field.extraTable.table, field.extraTable.displayField)
          : fetchMDOList(this.agent, field.mdoList!)
        ).catch((e) => {
          console.error(`Could not read the list ${key}:`, e);
          return [] as ListItem[];
        })
      )
    );
    return Object.fromEntries(fields.map(([key], index) => [key, lists[index]!]));
  }

  private customDefinitions: Promise<EntityFieldDefinition[]> | null = null;

  /**
   * The user-defined fields, then the extra fields - fetched once, they do not change while the panel is
   * open. If one kind can't be read, the other is still shown.
   */
  GetCustomFieldDefinitions(): Promise<EntityFieldDefinition[]> {
    this.customDefinitions ??= this.fetchCustomFieldDefinitions();
    return this.customDefinitions;
  }

  private async fetchCustomFieldDefinitions(): Promise<EntityFieldDefinition[]> {
    const [udefs, extras] = await Promise.all([
      this.fetchUdefDefinitions().catch((e) => {
        console.error("Could not fetch user-defined fields:", e);
        return [];
      }),
      this.fetchExtraFieldDefinitions().catch((e) => {
        console.error("Could not fetch extra fields:", e);
        return [];
      })
    ]);
    return [...udefs, ...extras];
  }

  private async fetchUdefDefinitions(): Promise<EntityFieldDefinition[]> {
    if (!this.config.udef) return [];
    const columns = await fetchUdefColumns(this.agent, this.config.udef.provider, this.config.udef.columnPrefix);
    return columns.map((column) => ({
      key: `udef:${column.progId}`,
      label: column.label,
      kind: column.kind,
      group: "Egendefinerte felt",
      hiddenByDefault: true,
      udef: { progId: column.progId, numberType: column.numberType }
    }));
  }

  /**
   * Every extra field (x_...) on the entity that the panel can edit, with the values to pick from.
   * Fields built into the config are left out here, so they are not shown twice.
   */
  private async fetchExtraFieldDefinitions(): Promise<EntityFieldDefinition[]> {
    const builtIn = new Set(this.config.fields.map((field) => field.customField));
    const fields = (await fetchExtraFields(this.agent, this.config.restEntity)).filter((field) => !builtIn.has(field.FieldName));
    const definitions = await Promise.all(fields.map((field) => this.toExtraFieldDefinition(field)));
    return definitions.filter((definition) => definition !== null);
  }

  private async toExtraFieldDefinition(field: ExtraFieldInfo): Promise<EntityFieldDefinition | null> {
    const base = { key: field.FieldName, customField: field.FieldName, label: tidyLabel(tidyListName(field.DisplayName)), group: "Ekstrafelt" };
    switch (field.FieldType) {
      case "ShortText":
      case "LongText":
        return { ...base, kind: field.FieldType === "LongText" ? "longtext" : "text" };
      case "Integer":
      case "Decimal":
        return { ...base, kind: "number" };
      case "Date":
        return { ...base, kind: "date" };
      case "Checkbox":
        return { ...base, kind: "checkbox" };
      case "ListText":
        return { ...base, kind: "select", choices: (field.Choices ?? []).map((choice) => ({ id: choice, name: choice })) };
      case "MdoList":
        if (!field.MdoListName) return null;
        return { ...base, kind: "select", mdoList: field.MdoListName, choices: await fetchMDOList(this.agent, field.MdoListName) };
      case "RelationTo": {
        // Relations to SuperOffice's own tables (contact, person...) need a search, not a list; not yet.
        const table = field.TargetTable;
        if (!table?.startsWith("y_")) return null;
        try {
          const displayField = await fetchExtraTableDisplayField(this.agent, table);
          const choices = await fetchExtraTableRows(this.agent, table, displayField);
          return { ...base, kind: "select", extraTable: { table, displayField }, choices };
        } catch (e) {
          console.error(`Could not read the rows of ${table} for ${field.FieldName}:`, e);
          return null;
        }
      }
      // Date and time, time spans, attachments and dynamic links are left out for now.
      default:
        return null;
    }
  }

  async GetCurrentAssociateId(): Promise<number> {
    return (await this.fetchPrincipal()).AssociateId;
  }

  async GetAssociates(): Promise<ListItem[]> {
    return fetchMDOList(this.agent, "associate");
  }

  /** Only general administrators (the admin-all function right) may set the standard layout for everyone. */
  async CanEditStandardLayout(): Promise<boolean> {
    const rights = (await this.fetchPrincipal()).FunctionRights ?? [];
    return rights.includes("admin-all");
  }

  GetFieldLayouts(): Promise<FieldLayouts> {
    return this.layouts.get();
  }

  SaveFieldLayout(level: LayoutLevel, layout: SavedLayout | null): Promise<void> {
    return this.layouts.save(level, layout);
  }

  async GetOwnedBy(associateId: number): Promise<WorklistItem[]> {
    const { worklist } = this.config;
    const items = await this.agent.QueryEntities({
      entity: worklist.archive,
      select: this.worklistColumns(),
      filter: worklist.ownedBy(associateId),
      orderBy: worklist.orderBy,
      top: 500
    });
    return items.map((item) => this.toWorklistItem(item));
  }

  async GetSelections(): Promise<ListItem[]> {
    const selections = await this.agent.QueryEntities({
      entity: "Selection",
      select: "selectionId,name",
      filter: `targetTableNumber eq ${this.config.worklist.selectionTable}`,
      orderBy: "name asc",
      top: 500
    });
    return selections.map((selection) => ({ id: Number(selection.selectionId), name: String(selection.name ?? "") }));
  }

  /**
   * The members of a selection. Each selection names the archive provider that lists its members
   * (ContactStaticSelectionV2, ...), so it works for every kind of selection.
   */
  async GetSelectionItems(selectionId: number): Promise<WorklistItem[]> {
    const selection = (await this.agent.GetEntityById({ entity: "Selection", id: selectionId })) as { MainProviderName: string };
    const items = await this.agent.QueryEntities({
      entity: `Archive/${selection.MainProviderName}`,
      select: this.worklistColumns(),
      filter: `selectionId eq ${selectionId}`,
      orderBy: this.config.worklist.orderBy,
      top: 500
    });
    return items.map((item) => this.toWorklistItem(item));
  }

  /** Fetches the whole entity, applies the changes and saves it back (REST PUT needs the full entity). */
  async Update(id: number, changes: EntityValues, definitions: EntityFieldDefinition[], expectedUpdatedAt?: string): Promise<void> {
    const entity = await this.fetchEntity(id);
    const saved = this.savedBy(entity);
    if (expectedUpdatedAt !== undefined && saved.updatedAt !== expectedUpdatedAt) {
      throw new EntityChangedError(saved.updatedBy, saved.updatedAt);
    }
    await this.agent.Request({
      method: "PUT",
      endpoint: `/api/v1/${this.config.restEntity}/${id}`,
      body: writeValues(entity, changes, definitions),
      headers: restApiDefaultHeaders()
    });
  }

  private saveRules: Promise<SaveRule[]> | null = null;

  /**
   * The active before-save triggers on the entity (see EntityConfig.beforeSaveEvent) and the fields they
   * read - read once, they do not change while the panel is open.
   */
  GetSaveRules(): Promise<SaveRule[]> {
    this.saveRules ??= this.fetchSaveRules().catch((e) => {
      // Look again next time, the failure may pass.
      this.saveRules = null;
      throw e;
    });
    return this.saveRules;
  }

  private async fetchSaveRules(): Promise<SaveRule[]> {
    const event = this.config.beforeSaveEvent;
    if (!event) return [];
    const list = await this.getJson<TriggerRow[] | { value?: TriggerRow[] }>("/api/v1/TriggerScript");
    const rows = Array.isArray(list) ? list : (list.value ?? []);
    // The list leaves out the code and shows the event and "enabled" as display text, so each trigger
    // is read on its own and picked by its own ScreenType and Enabled.
    const [definitions, triggers] = await Promise.all([
      this.GetCustomFieldDefinitions(),
      Promise.all(rows.map((row) => this.getJson<TriggerRow>(`/api/v1/TriggerScript/${column(row, "PrimaryKey")}`)))
    ]);
    const rules = triggers
      .filter((trigger) => column(trigger, "ScreenType") === event && column(trigger, "Enabled") === true)
      .map((trigger) =>
        toSaveRule(String(column(trigger, "Name") ?? ""), String(column(trigger, "Source") ?? ""), [...this.config.fields, ...definitions])
      );
    console.info(`Before-save rules (${event}):`, rules);
    return rules;
  }

  private async getJson<T>(endpoint: string): Promise<T> {
    const response = await this.agent.Request({ method: "GET", endpoint, headers: restApiDefaultHeaders() });
    return (await response.json()) as T;
  }

  private async fetchEntity(id: number): Promise<RestEntity> {
    return (await this.agent.GetEntityById({ entity: this.config.restEntity, id })) as RestEntity;
  }

  /** When and by whom the entity was last saved. An entity without these properties is never seen as changed. */
  private savedBy(entity: RestEntity): { updatedAt: string; updatedBy: string } {
    const at = entity[this.config.updatedAtProperty ?? "UpdatedDate"];
    const by = entity[this.config.updatedByProperty ?? "UpdatedBy"] as { FullName?: string } | null | undefined;
    return { updatedAt: typeof at === "string" ? at : "", updatedBy: by?.FullName ?? "" };
  }

  private worklistColumns(): string {
    const { idColumn, titleColumn, metaColumns } = this.config.worklist;
    return [idColumn, titleColumn, ...metaColumns].join(",");
  }

  private toWorklistItem(item: SuperOfficeObject): WorklistItem {
    const { idColumn, titleColumn, metaColumns } = this.config.worklist;
    return {
      id: Number(item[idColumn]),
      title: String(item[titleColumn] ?? ""),
      meta: metaColumns
        .map((column) => item[column])
        .filter((value) => value !== null && value !== undefined && value !== "")
        .join(" · ")
    };
  }

  private principal: Promise<{ AssociateId: number; FunctionRights?: string[] }> | null = null;

  /** The logged in user - fetched once, it does not change while the panel is open. */
  private fetchPrincipal(): Promise<{ AssociateId: number; FunctionRights?: string[] }> {
    this.principal ??= this.agent
      .Request({ method: "GET", endpoint: "/api/v1/User/currentPrincipal", headers: restApiDefaultHeaders() })
      .then((response) => response.json());
    return this.principal;
  }
}

type TriggerRow = Record<string, unknown>;

/** A column of a REST row, whatever its casing (screenType, ScreenType...). */
function column(row: Record<string, unknown>, name: string): unknown {
  const key = Object.keys(row).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  return key === undefined ? undefined : row[key];
}
