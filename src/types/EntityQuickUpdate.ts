import type { FieldDefinition, FieldLayouts, FieldValue, LayoutLevel, ListItem, SavedLayout } from "@/types/Fields";

/** The entities the generic panel updates. Sales have their own panel, with sale-specific logic. */
export type EntityName = "contact" | "ticket";

export type EntityValues = Record<string, FieldValue>;

/** The REST entity as it comes from and goes back to SuperOffice - read and written by property name. */
export type RestEntity = Record<string, unknown> & {
  CustomFields?: Record<string, string>;
  UserDefinedFields?: Record<string, string>;
  ExtraFields?: Record<string, string>;
};

export interface EntityFieldDefinition extends FieldDefinition {
  /**
   * The property on the REST entity that holds the value, e.g. "Name". For list values the property
   * holds an object with the id, e.g. Category: { Id: 3 }. Left out on user-defined fields.
   */
  property?: string;
  /** For kind "select": the MDO list the values are picked from, e.g. "category". */
  mdoList?: string;
  /** For list values: the id's name inside the property object. Default "Id" (Associate uses "AssociateId"). */
  idField?: string;
  /** An extra field (x_...), kept in CustomFields under this name, e.g. "x_product". */
  customField?: string;
  /**
   * For a relation to an extra table: the table the values are picked from and the field shown,
   * e.g. { table: "y_product", displayField: "x_product_name" }. The value is the row's id.
   */
  extraTable?: { table: string; displayField: string };
}

/** Everything that makes one entity's panel: where its data lives, its fields and its work lists. */
export interface EntityConfig {
  name: EntityName;
  /** Words for the entity in messages: "firma" / "firmaet" / "firmaene". */
  noun: { indefinite: string; definite: string; plural: string };
  /** The REST entity, as in /api/v1/<restEntity>/{id}. */
  restEntity: string;
  /**
   * The properties that say when and by whom the entity was last saved, used to notice someone else's
   * save. Default UpdatedDate and UpdatedBy (an associate with FullName).
   */
  updatedAtProperty?: string;
  updatedByProperty?: string;
  /** The SoProtocol that opens the entity's card, for an id. */
  cardProtocol: (id: number) => string;
  /** The panel's heading and the line under it. */
  titleOf: (entity: RestEntity) => string;
  subtitleOf: (entity: RestEntity) => string;
  fields: EntityFieldDefinition[];
  /** Where the user-defined fields are listed: an archive provider and its column prefix. */
  udef: { provider: string; columnPrefix: string } | null;
  worklist: WorklistConfig;
}

/** How the work lists (mine, someone else's, a selection) are read for an entity. */
export interface WorklistConfig {
  /** Labels in the picker: "Firmaet du står på", "Mine firma", "Andres firma". */
  currentLabel: string;
  mineLabel: string;
  othersLabel: string;
  /** The OData entity the lists are read from, and the columns: id, title and the details under it. */
  archive: string;
  idColumn: string;
  titleColumn: string;
  metaColumns: string[];
  orderBy: string;
  /** The filter for one user's list ("mine", or someone else's). */
  ownedBy: (associateId: number) => string;
  /** The SuperOffice table number selections of this entity target (contact 5, project 11, sale 13). */
  selectionTable: number;
}

/** An entity as the panel sees it: the values plus what is needed to display them. */
export interface EntitySnapshot {
  id: number;
  title: string;
  subtitle: string;
  values: EntityValues;
  /** When and by whom the entity was last saved - used to notice changes made by someone else meanwhile. */
  updatedAt: string;
  updatedBy: string;
}

/** One entry in a work list. */
export interface WorklistItem {
  id: number;
  title: string;
  meta: string;
}

/** Where the panel reads and writes an entity - SuperOffice REST API, or demo data. */
export interface EntityDataSource {
  Get(id: number): Promise<EntitySnapshot>;
  /** The values of every list the fields use, by optionListKey() of the field. */
  GetOptions(): Promise<Record<string, ListItem[]>>;
  /** The user-defined fields on the entity, as field definitions. */
  GetUdefDefinitions(): Promise<EntityFieldDefinition[]>;
  GetCurrentAssociateId(): Promise<number>;
  /** The users, for picking whose list to work through. */
  GetAssociates(): Promise<ListItem[]>;
  /** Whether the user may change the standard layout for everyone. */
  CanEditStandardLayout(): Promise<boolean>;
  GetFieldLayouts(): Promise<FieldLayouts>;
  /** Saves a layout. null removes it (personal: back to the standard; standard: back to the built-in one). */
  SaveFieldLayout(level: LayoutLevel, layout: SavedLayout | null): Promise<void>;
  GetOwnedBy(associateId: number): Promise<WorklistItem[]>;
  GetSelections(): Promise<ListItem[]>;
  GetSelectionItems(selectionId: number): Promise<WorklistItem[]>;
  /**
   * definitions: the fields being changed, so each value is written where and how SuperOffice expects.
   * expectedUpdatedAt: the entity's updatedAt when it was loaded. If someone saved it since, an
   * EntityChangedError is thrown and nothing is saved. Left out, the entity is saved regardless.
   */
  Update(id: number, changes: EntityValues, definitions: EntityFieldDefinition[], expectedUpdatedAt?: string): Promise<void>;
}
