/**
 * Base interface for what will be returned from SuperOffice REST API on OData queries.
 */
export interface SuperOfficeObject {
  PrimaryKey: number;
  EntityName: string;
  [key: string]: unknown; // Can be any number of properties with different types.
}
