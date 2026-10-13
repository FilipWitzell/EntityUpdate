/** Keys for the built-in sale values the quick update panel can show and change. */
export type SaleFieldKey =
  | "heading"
  | "amount"
  | "stageId"
  | "probability"
  | "associateId"
  | "saledate"
  | "saleTypeId"
  | "sourceId"
  | "competitorId"
  | "status"
  | "reasonId"
  | "projectId"
  | "contactId"
  | "personId"
  | "reopenDate"
  | "earning"
  | "saleText";

/** A built-in field, or a user-defined field on the sale: "udef:<progId>" (e.g. "udef:SuperOffice:3"). */
export type FieldKey = SaleFieldKey | `udef:${string}`;

/** How a field is edited in the panel. */
export type FieldKind = "text" | "longtext" | "amount" | "number" | "percent" | "date" | "checkbox" | "select" | "project" | "contact" | "person";

/** The lists the panel loads in the background so values can be picked quickly. */
export type ListName = "stage" | "associate" | "saleType" | "source" | "competitor" | "status" | "reasonSold" | "reasonLost" | "reasonStalled";

export type SaleStatus = "Open" | "Sold" | "Lost" | "Stalled";

/** Ids for list values, ISO date (YYYY-MM-DD) for dates, 1/0 for checkboxes, plain text/number otherwise. */
export type FieldValue = string | number | null;

export type SaleValues = Record<string, FieldValue>;

export interface ListItem {
  id: number | string;
  name: string;
  /** Only on sale stages: the default probability for the stage. */
  probability?: number;
}

export type SaleOptions = Record<ListName, ListItem[]> & {
  /**
   * The stages each sale type uses, by sale type id, each with the type's probability for it.
   * A type with no stages linked is left out - every stage can be used for it.
   */
  stagesBySaleType: Record<string, ListItem[]>;
};

export interface SaleFieldDefinition {
  key: FieldKey;
  label: string;
  kind: FieldKind;
  /** Which group the field is shown under in the panel. */
  group: string;
  /** Important fields are marked in red when they have no value, so they get maintained. */
  important?: boolean;
  /** Hidden until someone turns it on in the field picker. */
  hiddenByDefault?: boolean;
  /** Which list the values are picked from, for kind "select". */
  list?: ListName;
  /** Shown only while the sale has (or is set to) this status - e.g. the reopen date for stalled sales. */
  showWhenStatus?: SaleStatus;
  /** Only on user-defined fields: how SuperOffice stores the value. */
  udef?: { progId: string; numberType?: "int" | "decimal" };
}

/** A field's place in a layout: shown or not, marked important or not, in list order. */
export interface FieldLayoutEntry {
  key: FieldKey;
  visible: boolean;
  important: boolean;
}

export type FieldLayout = FieldLayoutEntry[];

/** How much of the next activity the panel shows: the date, the date and type, or date, type and description. */
export type ActivityDisplay = "date" | "type" | "full";

/** A saved layout: the fields, and the panel settings kept with them. null means "not chosen here". */
export interface SavedLayout {
  fields: FieldLayout;
  activityDisplay: ActivityDisplay | null;
}

/** The two layouts: the standard an admin sets for everyone, and the user's own. */
export interface FieldLayouts {
  standard: SavedLayout | null;
  personal: SavedLayout | null;
}

export type LayoutLevel = "standard" | "personal";

/** A sale as the panel sees it: the values plus what is needed to display them. */
export interface SaleSnapshot {
  saleId: number;
  heading: string;
  currency: string;
  contactName: string;
  values: SaleValues;
  /** The linked project, so its name can be shown without searching. */
  project: ListItem | null;
  /** The company the sale belongs to, and the contact person on it - for the contact person picker. */
  contactId: number;
  person: ListItem | null;
  /** When and by whom the sale was last saved - used to notice changes made by someone else meanwhile. */
  updatedAt: string;
  updatedBy: string;
}

/** One row in the panel table. */
export interface SaleFieldRow {
  definition: SaleFieldDefinition;
  current: FieldValue;
  next: FieldValue;
  shouldUpdate: boolean;
}

/** The sale's next activity: the earliest one not yet completed, which may be overdue. */
export interface NextActivity {
  appointmentId: number;
  /** ISO date and time, e.g. "2026-10-12T09:00:00". */
  date: string;
  type: string;
  text: string;
}

/** One sale in a work list (my open sales, someone else's open sales). */
export interface SaleListItem {
  saleId: number;
  heading: string;
  contactName: string;
  amount: number;
  saledate: string | null;
}

/** A SuperOffice selection (utvalg) of sales. */
export interface SaleSelection {
  id: number;
  name: string;
}

/** Where the panel reads and writes sale data - SuperOffice REST API, or demo data. */
export interface SaleDataSource {
  GetSale(saleId: number): Promise<SaleSnapshot>;
  GetOptions(): Promise<SaleOptions>;
  /** The user-defined fields on sales, as field definitions. */
  GetUdefDefinitions(): Promise<SaleFieldDefinition[]>;
  GetCurrentAssociateId(): Promise<number>;
  /** Whether the user may change the standard layout for everyone. */
  CanEditStandardLayout(): Promise<boolean>;
  GetFieldLayouts(): Promise<FieldLayouts>;
  /** Saves a layout. null removes it (personal: back to the standard; standard: back to the built-in one). */
  SaveFieldLayout(level: LayoutLevel, layout: SavedLayout | null): Promise<void>;
  GetOpenSales(associateId: number): Promise<SaleListItem[]>;
  GetSaleSelections(): Promise<SaleSelection[]>;
  GetSelectionSales(selectionId: number): Promise<SaleListItem[]>;
  SearchProjects(query: string): Promise<ListItem[]>;
  /** Companies by name, for the company picker. */
  SearchContacts(query: string): Promise<ListItem[]>;
  /** The persons on a company, for the contact person picker. */
  GetPersons(contactId: number): Promise<ListItem[]>;
  /** The sale's earliest activity that is not completed, or null when it has none. */
  GetNextActivity(saleId: number): Promise<NextActivity | null>;
  /**
   * definitions: the fields being changed, so user-defined values are stored the way SuperOffice expects.
   * expectedUpdatedAt: the sale's updatedAt when it was loaded. If someone saved it since, a
   * SaleChangedError is thrown and nothing is saved. Left out, the sale is saved regardless.
   */
  UpdateSale(saleId: number, changes: SaleValues, definitions: SaleFieldDefinition[], expectedUpdatedAt?: string): Promise<void>;
}
