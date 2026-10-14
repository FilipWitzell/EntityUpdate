import { SuperOfficeAgent, restApiDefaultHeaders } from "@/agents/SuperOfficeAgent";
import { LayoutPreferences } from "@/agents/LayoutPreferences";
import { fetchMDOList, fetchUdefColumns } from "@/agents/superOfficeLists";
import { EntityChangedError } from "@/agents/EntityChangedError";
import { optionListKey, readValues, writeValues } from "@/config/entityValues";
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
    const entity = await this.fetchEntity(id);
    return {
      id,
      title: this.config.titleOf(entity),
      subtitle: this.config.subtitleOf(entity),
      values: readValues(entity, this.config.fields),
      ...this.savedBy(entity)
    };
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
    const lists = await Promise.all(
      fields.map(([, field]) => (field.extraTable ? this.fetchExtraTableRows(field.extraTable) : fetchMDOList(this.agent, field.mdoList!)))
    );
    return Object.fromEntries(fields.map(([key], index) => [key, lists[index]!]));
  }

  async GetUdefDefinitions(): Promise<EntityFieldDefinition[]> {
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

  private async fetchEntity(id: number): Promise<RestEntity> {
    return (await this.agent.GetEntityById({ entity: this.config.restEntity, id })) as RestEntity;
  }

  /** When and by whom the entity was last saved. An entity without these properties is never seen as changed. */
  private savedBy(entity: RestEntity): { updatedAt: string; updatedBy: string } {
    const at = entity[this.config.updatedAtProperty ?? "UpdatedDate"];
    const by = entity[this.config.updatedByProperty ?? "UpdatedBy"] as { FullName?: string } | null | undefined;
    return { updatedAt: typeof at === "string" ? at : "", updatedBy: by?.FullName ?? "" };
  }

  /**
   * The rows of an extra table, through the dynamic archive: id and the field shown, sorted by it.
   * The archive names its columns "<table>.<field>"; a plain "<field>" is read too.
   */
  private async fetchExtraTableRows(extraTable: { table: string; displayField: string }): Promise<ListItem[]> {
    const { table, displayField } = extraTable;
    const rows = await this.agent.QueryEntities({
      entity: "Archive/dynamic",
      select: `${table}.id,${table}.${displayField}`,
      orderBy: `${table}.${displayField} asc`,
      top: 1000
    });
    return rows
      .map((row) => ({ id: Number(row[`${table}.id`] ?? row.id), name: String(row[`${table}.${displayField}`] ?? row[displayField] ?? "") }))
      .filter((row) => row.id > 0);
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
