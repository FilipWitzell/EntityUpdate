/** Options for the SuperOfficeAgent.QueryEntities() method. */
export interface QueryEntitiesOptions {
  entity: string;
  select?: string;
  filter?: string;
  orderBy?: string;
  top?: number;
  skip?: number;
  mode?: string;
  providerOptions?: string;
  context?: string;
  format?: string;
  jsonSafe?: boolean;
  output?: string;
  metadata?: string;
}
