/** Field types shared by every entity the panel can update. */

/** How a field is edited in the panel. */
export type FieldKind = "text" | "longtext" | "amount" | "number" | "percent" | "date" | "checkbox" | "select" | "project" | "contact" | "person";

/** Ids for list values, ISO date (YYYY-MM-DD) for dates, 1/0 for checkboxes, plain text/number otherwise. */
export type FieldValue = string | number | null;

export interface ListItem {
  id: number | string;
  name: string;
  /** Only on sale stages: the default probability for the stage. */
  probability?: number;
}

/** What every field in the panel has, whatever entity it belongs to. */
export interface FieldDefinition {
  /** A built-in field's own key, or "udef:<progId>" for a user-defined field (e.g. "udef:SuperOffice:3"). */
  key: string;
  label: string;
  kind: FieldKind;
  /** Which group the field is shown under in the panel. */
  group: string;
  /** Important fields are marked in red when they have no value, so they get maintained. */
  important?: boolean;
  /** Hidden until someone turns it on in the field picker. */
  hiddenByDefault?: boolean;
  /** Only on user-defined fields: how SuperOffice stores the value. */
  udef?: { progId: string; numberType?: "int" | "decimal" };
}

/** A field's place in a layout: shown or not, marked important or not, in list order. */
export interface FieldLayoutEntry {
  key: string;
  visible: boolean;
  important: boolean;
}

export type FieldLayout = FieldLayoutEntry[];

/** How much of the sale's next activity the panel shows: the date, the date and type, or date, type and description. */
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
