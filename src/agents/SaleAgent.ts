import { SuperOfficeAgent, restApiDefaultHeaders } from "@/agents/SuperOfficeAgent";
import { reasonListFor, SALE_STATUSES } from "@/config/saleFields";
import type { SuperOfficeObject } from "@/types/SuperOfficeObject";
import { decodeUdefValue, encodeUdefValue, tidyListName } from "@/config/superOfficeValues";
import { LayoutPreferences } from "@/agents/LayoutPreferences";
import { dateOrNull } from "@/config/entityValues";
import { fetchMDOList, fetchUdefColumns, type MDOListItem } from "@/agents/superOfficeLists";
import { SaleChangedError } from "@/agents/SaleChangedError";
import type {
  FieldValue,
  FieldLayouts,
  LayoutLevel,
  ListItem,
  ListName,
  NextActivity,
  SaleDataSource,
  SaleFieldDefinition,
  SaleListItem,
  SaleSelection,
  SaleOptions,
  SaleSnapshot,
  SaleStatus,
  SavedLayout,
  SaleValues
} from "@/types/SaleQuickUpdate";

/** The parts of the REST SaleEntity this panel reads and writes. */
interface SaleEntity {
  SaleId: number;
  Heading: string;
  Amount: number;
  Saledate: string;
  Probability: number;
  Status: SaleStatus;
  Currency?: { Value?: string } | null;
  Contact?: { ContactId?: number; Name?: string } | null;
  Person?: { PersonId: number; FullName?: string } | null;
  ReopenDate?: string | null;
  Earning?: number;
  EarningPercent?: number;
  SaleText?: string | null;
  Associate?: { AssociateId: number } | null;
  SaleType?: { Id: number } | null;
  Source?: { Id: number } | null;
  Competitor?: { Id: number } | null;
  /** The sale stage. NetServer calls it Rating for historical reasons. */
  Rating?: { Id: number } | null;
  Reason?: { Id: number } | null;
  ReasonSold?: { Id: number } | null;
  ReasonStalled?: { Id: number } | null;
  Project?: { ProjectId: number; Name: string } | null;
  UpdatedDate?: string;
  UpdatedBy?: { FullName?: string } | null;
  /** User-defined and extra fields by ProgId, values in SuperOffice's encoded form ("[I:5]", "[DT:...]"). */
  CustomFields?: Record<string, string>;
  UserDefinedFields?: Record<string, string>;
  [key: string]: unknown;
}

interface MDOListItemWithExtraInfo extends MDOListItem {
  ExtraInfo?: string;
}

/** MDO list names in SuperOffice for each list the panel uses. */
const MDO_LISTS: Record<Exclude<ListName, "stage" | "status">, string> = {
  associate: "associate",
  saleType: "saletype",
  source: "source",
  competitor: "comptr",
  reasonSold: "reasonsold",
  reasonLost: "reason",
  reasonStalled: "reasonstalled"
};

/** Reads and updates a sale through the SuperOffice REST API, as the logged in user. */
export class SaleAgent implements SaleDataSource {
  private agent = new SuperOfficeAgent();
  private layouts = new LayoutPreferences(this.agent, LAYOUT_PREFERENCE, () => this.GetCurrentAssociateId());

  async GetSale(saleId: number): Promise<SaleSnapshot> {
    const sale = await this.fetchSaleEntity(saleId);

    const reasonByStatus: Record<SaleStatus, { Id: number } | null | undefined> = {
      Open: null,
      Sold: sale.ReasonSold,
      Lost: sale.Reason,
      Stalled: sale.ReasonStalled
    };

    const values: SaleValues = {
      heading: sale.Heading ?? "",
      amount: sale.Amount ?? 0,
      stageId: idOrNull(sale.Rating?.Id),
      probability: sale.Probability ?? 0,
      associateId: idOrNull(sale.Associate?.AssociateId),
      saledate: sale.Saledate ? sale.Saledate.substring(0, 10) : null,
      saleTypeId: idOrNull(sale.SaleType?.Id),
      sourceId: idOrNull(sale.Source?.Id),
      competitorId: idOrNull(sale.Competitor?.Id),
      status: sale.Status ?? "Open",
      reasonId: idOrNull(reasonByStatus[sale.Status]?.Id),
      projectId: idOrNull(sale.Project?.ProjectId),
      contactId: idOrNull(sale.Contact?.ContactId),
      personId: idOrNull(sale.Person?.PersonId),
      reopenDate: dateOrNull(sale.ReopenDate),
      earning: sale.Earning ?? 0,
      saleText: sale.SaleText ?? ""
    };
    for (const [progId, raw] of Object.entries(sale.CustomFields ?? {})) {
      if (!progId.endsWith(":org")) values[`udef:${progId}`] = decodeUdefValue(raw);
    }

    return {
      saleId: sale.SaleId,
      heading: sale.Heading ?? "",
      currency: sale.Currency?.Value ?? "",
      contactName: sale.Contact?.Name ?? "",
      values,
      project: sale.Project?.ProjectId ? { id: sale.Project.ProjectId, name: sale.Project.Name } : null,
      contactId: sale.Contact?.ContactId ?? 0,
      person: sale.Person?.PersonId ? { id: sale.Person.PersonId, name: sale.Person.FullName ?? "" } : null,
      updatedAt: sale.UpdatedDate ?? "",
      updatedBy: sale.UpdatedBy?.FullName ?? ""
    };
  }

  async GetOptions(): Promise<SaleOptions> {
    const [stage, associate, saleType, source, competitor, reasonSold, reasonLost, reasonStalled] = await Promise.all([
      this.fetchSaleStages(),
      fetchMDOList(this.agent, MDO_LISTS.associate),
      fetchMDOList(this.agent, MDO_LISTS.saleType),
      fetchMDOList(this.agent, MDO_LISTS.source),
      fetchMDOList(this.agent, MDO_LISTS.competitor),
      fetchMDOList(this.agent, MDO_LISTS.reasonSold),
      fetchMDOList(this.agent, MDO_LISTS.reasonLost),
      fetchMDOList(this.agent, MDO_LISTS.reasonStalled)
    ]);

    const stagesBySaleType = await this.fetchStagesBySaleType(saleType);
    return { stage, associate, saleType, source, competitor, status: SALE_STATUSES, reasonSold, reasonLost, reasonStalled, stagesBySaleType };
  }

  /** User-defined fields on sales, from the Sale archive's columns (saleUdef/<progId>). List fields are left out for now. */
  async GetUdefDefinitions(): Promise<SaleFieldDefinition[]> {
    const columns = await fetchUdefColumns(this.agent, "Sale", "saleUdef/");
    return columns.map((column) => ({
      key: `udef:${column.progId}` as const,
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

  /** Only general administrators (the admin-all function right) may set the standard layout for everyone. */
  async CanEditStandardLayout(): Promise<boolean> {
    const rights = (await this.fetchPrincipal()).FunctionRights ?? [];
    return rights.includes("admin-all");
  }

  async GetFieldLayouts(): Promise<FieldLayouts> {
    return this.layouts.get();
  }

  async SaveFieldLayout(level: LayoutLevel, layout: SavedLayout | null): Promise<void> {
    return this.layouts.save(level, layout);
  }

  /** Open sales owned by an associate, earliest sale date first. saleStatus 1 is Open. */
  async GetOpenSales(associateId: number): Promise<SaleListItem[]> {
    const sales = await this.agent.QueryEntities({
      entity: "Sale",
      select: SALE_LIST_FIELDS,
      filter: `associateId eq ${associateId} and saleStatus eq 1`,
      orderBy: "date asc",
      top: 500
    });
    return sales.map(toSaleListItem);
  }

  /** Selections of sales (targetTableNumber 13 is the sale table). */
  async GetSaleSelections(): Promise<SaleSelection[]> {
    const selections = await this.agent.QueryEntities({
      entity: "Selection",
      select: "selectionId,name",
      filter: "targetTableNumber eq 13",
      orderBy: "name asc",
      top: 500
    });
    return selections.map((selection) => ({ id: Number(selection.selectionId), name: String(selection.name ?? "") }));
  }

  /**
   * The sales in a selection. Each selection names the archive provider that lists its members
   * (SaleDynamicSelectionV2, SaleStaticSelectionV2, ...), so it works for every kind of selection.
   */
  async GetSelectionSales(selectionId: number): Promise<SaleListItem[]> {
    const selection = (await this.agent.GetEntityById({ entity: "Selection", id: selectionId })) as { MainProviderName: string };
    const sales = await this.agent.QueryEntities({
      entity: `Archive/${selection.MainProviderName}`,
      select: SALE_LIST_FIELDS,
      filter: `selectionId eq ${selectionId}`,
      orderBy: "date asc",
      top: 500
    });
    return sales.map(toSaleListItem);
  }

  async SearchProjects(query: string): Promise<ListItem[]> {
    const projects = await this.agent.QueryEntities({
      entity: "Project",
      select: "projectId,name",
      filter: `name contains '${query.replace(/'/g, "''")}'`,
      orderBy: "name asc",
      top: 50
    });
    return projects.map((project) => ({ id: Number(project.projectId), name: String(project.name) }));
  }

  async SearchContacts(query: string): Promise<ListItem[]> {
    const contacts = await this.agent.QueryEntities({
      entity: "Contact",
      select: "contactId,name,department",
      filter: `name contains '${query.replace(/'/g, "''")}'`,
      orderBy: "name asc",
      top: 50
    });
    return contacts.map((contact) => ({
      id: Number(contact.contactId),
      name: [contact.name, contact.department].filter(Boolean).join(", ")
    }));
  }

  async GetPersons(contactId: number): Promise<ListItem[]> {
    if (!contactId) return [];
    const persons = await this.agent.QueryEntities({
      entity: "Person",
      select: "personId,fullName",
      filter: `contactId eq ${contactId}`,
      orderBy: "fullName asc",
      top: 500
    });
    return persons.map((person) => ({ id: Number(person.personId), name: String(person.fullName ?? "") }));
  }

  /** The earliest activity on the sale that is not completed - an overdue one counts, it still needs doing. */
  async GetNextActivity(saleId: number): Promise<NextActivity | null> {
    const [activity] = await this.agent.QueryEntities({
      entity: "Appointment",
      select: "appointmentId,date,type,text",
      filter: `saleId eq ${saleId} and completed eq 0`,
      orderBy: "date asc",
      top: 1
    });
    if (!activity) return null;
    return {
      appointmentId: Number(activity.appointmentId),
      date: String(activity.date ?? ""),
      type: String(activity.type ?? ""),
      text: String(activity.text ?? "")
    };
  }

  /** Fetches the whole sale, applies the changes and saves it back (REST PUT needs the full entity). */
  async UpdateSale(saleId: number, changes: SaleValues, definitions: SaleFieldDefinition[], expectedUpdatedAt?: string): Promise<void> {
    const sale = await this.fetchSaleEntity(saleId);
    if (expectedUpdatedAt !== undefined && (sale.UpdatedDate ?? "") !== expectedUpdatedAt) {
      throw new SaleChangedError(sale.UpdatedBy?.FullName ?? "", sale.UpdatedDate ?? "");
    }

    // Sold and lost go through SuperOffice's own SetAsSold/SetAsLost after the other fields are
    // saved, so its business logic for closing a sale runs. Open and stalled are plain fields.
    const newStatus = "status" in changes ? (changes.status as SaleStatus) : sale.Status;
    const closeAs = newStatus !== sale.Status && (newStatus === "Sold" || newStatus === "Lost") ? newStatus : null;

    for (const definition of definitions) {
      if (!definition.udef || !(definition.key in changes)) continue;
      const encoded = encodeUdefValue(definition, changes[definition.key] ?? null);
      sale.CustomFields = { ...sale.CustomFields, [definition.udef.progId]: encoded };
      if (sale.UserDefinedFields && definition.udef.progId in sale.UserDefinedFields) {
        sale.UserDefinedFields = { ...sale.UserDefinedFields, [definition.udef.progId]: encoded };
      }
    }

    if ("heading" in changes) sale.Heading = String(changes.heading ?? "");
    if ("amount" in changes) sale.Amount = Number(changes.amount ?? 0);
    if ("earning" in changes) {
      // The earning percent follows the earning and the (possibly new) amount, as on the sale card.
      sale.Earning = Number(changes.earning ?? 0);
      sale.EarningPercent = sale.Amount ? (sale.Earning / sale.Amount) * 100 : 0;
    }
    if ("saleText" in changes) sale.SaleText = String(changes.saleText ?? "");
    if ("contactId" in changes && changes.contactId) sale.Contact = { ContactId: Number(changes.contactId) };
    if ("personId" in changes) sale.Person = changes.personId ? { PersonId: Number(changes.personId) } : null;
    if ("reopenDate" in changes) sale.ReopenDate = changes.reopenDate ? `${changes.reopenDate}T00:00:00` : null;
    if ("probability" in changes) sale.Probability = Number(changes.probability ?? 0);
    if ("saledate" in changes && changes.saledate) sale.Saledate = `${changes.saledate}T00:00:00`;
    if ("status" in changes && !closeAs) sale.Status = changes.status as SaleStatus;
    // The stage is the Rating property on SaleEntity.
    if ("stageId" in changes) sale.Rating = { Id: Number(changes.stageId ?? 0) };
    if ("associateId" in changes) sale.Associate = { AssociateId: Number(changes.associateId ?? 0) };
    if ("saleTypeId" in changes) sale.SaleType = { Id: Number(changes.saleTypeId ?? 0) };
    if ("sourceId" in changes) sale.Source = { Id: Number(changes.sourceId ?? 0) };
    if ("competitorId" in changes) sale.Competitor = { Id: Number(changes.competitorId ?? 0) };
    if ("projectId" in changes) sale.Project = changes.projectId ? { ProjectId: Number(changes.projectId), Name: "" } : null;

    if ("reasonId" in changes && !closeAs) {
      const reason = { Id: Number(changes.reasonId ?? 0) };
      const reasonList = reasonListFor(sale.Status);
      if (reasonList === "reasonSold") sale.ReasonSold = reason;
      if (reasonList === "reasonLost") sale.Reason = reason;
      if (reasonList === "reasonStalled") sale.ReasonStalled = reason;
    }

    await this.agent.Request({
      method: "PUT",
      endpoint: `/api/v1/Sale/${saleId}`,
      body: sale,
      headers: restApiDefaultHeaders()
    });

    if (closeAs) await this.closeSale(saleId, closeAs, Number(changes.reasonId ?? 0));
  }

  /** SetAsSold / SetAsLost, with the reason when one is given. */
  private async closeSale(saleId: number, status: "Sold" | "Lost", reasonId: number): Promise<void> {
    const method = status === "Sold" ? "SetAsSold" : "SetAsLost";
    await this.agent.Request({
      method: "POST",
      endpoint: `/api/v1/Agents/Sale/${method}${reasonId > 0 ? "WithReason" : ""}`,
      body: reasonId > 0 ? { SaleIds: [saleId], ReasonId: reasonId } : { SaleIds: [saleId] },
      headers: restApiDefaultHeaders()
    });
  }

  private async fetchSaleEntity(saleId: number): Promise<SaleEntity> {
    return (await this.agent.GetEntityById({ entity: "Sale", id: saleId })) as SaleEntity;
  }

  private principal: Promise<{ AssociateId: number; FunctionRights?: string[] }> | null = null;

  /** The logged in user - fetched once, it does not change while the panel is open. */
  private fetchPrincipal(): Promise<{ AssociateId: number; FunctionRights?: string[] }> {
    this.principal ??= this.agent
      .Request({ method: "GET", endpoint: "/api/v1/User/currentPrincipal", headers: restApiDefaultHeaders() })
      .then((response) => response.json());
    return this.principal;
  }

  /**
   * Sale stages, with each stage's default probability read from ExtraInfo ("...&Probability=20&...").
   * Ids below 1 are the built-in sold/lost stages, which are set through status instead.
   */
  private async fetchSaleStages(): Promise<ListItem[]> {
    const response = await this.agent.Request({
      method: "GET",
      endpoint: "/api/v1/MDOList/salestage",
      urlParams: new URLSearchParams({ flat: "true" }),
      headers: restApiDefaultHeaders()
    });
    const stages = (await response.json()) as MDOListItemWithExtraInfo[];
    return stages
      .filter((stage) => stage.Id > 0 && !stage.Deleted)
      .map((stage) => {
        const probability = new URLSearchParams(stage.ExtraInfo ?? "").get("Probability");
        return { id: stage.Id, name: tidyListName(stage.Name), probability: probability === null ? undefined : Number(probability) };
      });
  }

  /**
   * The stages linked to each sale type (Selected), with the type's probability for each (ExtraInfo).
   * A type with no stages linked is left out, so every stage can be used for it.
   */
  private async fetchStagesBySaleType(saleTypes: ListItem[]): Promise<Record<string, ListItem[]>> {
    const entries = await Promise.all(
      saleTypes.map(async (saleType) => {
        const response = await this.agent.Request({
          method: "GET",
          endpoint: `/api/v1/List/SaleType/Items/${saleType.id}`,
          headers: restApiDefaultHeaders()
        });
        const entity = (await response.json()) as { Stages?: (MDOListItemWithExtraInfo & { Selected?: boolean })[] };
        const stages = (entity.Stages ?? [])
          .filter((stage) => stage.Selected && !stage.Deleted)
          .map((stage) => ({ id: stage.Id, name: tidyListName(stage.Name), probability: stage.ExtraInfo ? Number(stage.ExtraInfo) : undefined }));
        return [String(saleType.id), stages] as const;
      })
    );
    return Object.fromEntries(entries.filter(([, stages]) => stages.length > 0));
  }
}

function idOrNull(id: number | undefined): number | null {
  return id && id > 0 ? id : null;
}

/** Where the field layouts are kept among the SuperOffice preferences - the same keys as the SaleUpdate app, so saved layouts carry over. */
const LAYOUT_PREFERENCE = { section: "SaleUpdate", standardKey: "FieldLayout", personalKey: "MyFieldLayout" };

/** Archive fields read for sale lists (my open sales, selections). */
const SALE_LIST_FIELDS = "saleId,heading,amount,date,contact/name";

function toSaleListItem(sale: SuperOfficeObject): SaleListItem {
  return {
    saleId: Number(sale.saleId),
    heading: String(sale.heading ?? ""),
    contactName: String(sale["contact/name"] ?? ""),
    amount: Number(sale.amount ?? 0),
    saledate: sale.date ? String(sale.date).substring(0, 10) : null
  };
}
