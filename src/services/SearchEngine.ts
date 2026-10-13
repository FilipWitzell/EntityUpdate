import { SuperOfficeAgent } from "@/agents/SuperOfficeAgent";
import type { QueryEntitiesOptions } from "@/types/QueryEntitiesOptions";
import type { SuperOfficeObject } from "@/types/SuperOfficeObject";

/**
 * Used to store information about a criterion before the query is built.
 * Used internally by the SearchEngine class only.
 */
interface Criterion {
  field: string;
  odataOperator: string;
  formattedValue: string;
  rowOperator?: string;
  priority?: number;
}

/**
 * SearchEngine 💖
 * A TypeScript implementation of CRMScript's SearchEngine. Calls a dynamic archive query to SuperOffice REST API using odata query language.
 * Espen Steen, Cloud Connection AS, December 2024
 *
 * Some important distinctions between CRMSCript and this implementation:
 * 1. Instead of accessing fields pointed to with a method called getField(), you get the entire result set with getResult(). This returns an array of objects.
 *    You can then loop through the result directly when expecting multiple rows using, or when expecting a single row: getResult()[0].
 * 2. Both strings, numbers and booleans are valid types for the value parameter in the addCriteria() method, not just strings.
 * 3. The result is an array of objects with properties of different types, not just strings.
 */
export class SearchEngine {
  private superOfficeAgent: SuperOfficeAgent;
  private criteria: Criterion[] = [];
  private fields: string[] = [];
  private order: string[] = [];
  private limit?: number;
  private distinctField?: string;
  private hasResult: boolean = false; // To distinguish between an empty result set and a result that has not been fetched yet.
  private result: SuperOfficeObject[] = [];

  constructor() {
    this.superOfficeAgent = new SuperOfficeAgent();
  }

  /** Adds a field to the query. */
  addField(field: string) {
    this.fields.push(field);
  }

  /**
   * Converts operator to OData operator.
   * We accept most of the traditional CRMScript operators, but also normal OData operators.
   */
  private getODataOperator(operator: string): string {
    // Key: Acceptable input operators, Value: OData operator we use in the REST API query
    const operatorMap: Record<string, string> = {
      operatorequals: "eq",
      equals: "eq",
      eq: "eq",
      operatornotequals: "ne",
      notequals: "ne",
      ne: "ne",
      operatorlt: "lt",
      lt: "lt",
      operatorlte: "le",
      lte: "le",
      le: "le",
      operatorgt: "gt",
      gt: "gt",
      operatorgte: "ge",
      gte: "ge",
      ge: "ge",
      operatorcontains: "contains",
      contains: "contains",
      operatorbeginswith: "startswith",
      beginswith: "startswith",
      startswith: "startswith",
      operatorendswith: "endswith",
      endswith: "endswith",
      in: "in"
    };

    const normalizedOperator: string = operator.toLowerCase();
    const odataOperator: string | undefined = operatorMap[normalizedOperator];
    if (!odataOperator) throw new Error(`Unsupported operator: ${operator}`);

    return odataOperator;
  }

  /**
   * Formats and validates rowOperator.
   * For implementation simplicity we are not supporting notand and notor.
   */
  private formatRowOperator(rowOperator: string): string {
    const validRowOperators: string[] = ["and", "or"];

    const normalizedRowOperator: string = rowOperator.toLowerCase();
    if (!validRowOperators.includes(normalizedRowOperator)) throw new Error(`Unsupported rowOperator: ${rowOperator}`);

    return normalizedRowOperator;
  }

  /**
   * Formats value based on type for OData query
   */
  private formatValue(odataOperator: string, value: string | number | boolean): string {
    // Special handling of in operator
    if (odataOperator === "in") {
      value = value.toString();

      // Wrap in parantheses unless it already is.
      // Can't be wrapped in single quotes
      if (!value.startsWith("(")) return `(${value})`;
      return value;
    }

    // Other operators:
    // Strings are wrapped in single quotes
    if (typeof value === "string") return `'${value}'`;

    // Numbers and booleans are not wrapped in single quotes
    return value.toString();
  }

  /**
   * Adds a criterion on a database field to the database query.
   * Note that the value parameter is of type string, number or boolean instead of always being a string as in CRMScript.
   */
  addCriteria(field: string, compOperator: string, value: string | number | boolean, rowOperator?: string, priority?: number) {
    // Format the operator and value correctly before storing
    const odataOperator: string = this.getODataOperator(compOperator);
    const formattedValue: string = this.formatValue(odataOperator, value);

    // Set default values for priority and rowOperator if they weren't provided
    if (!priority) priority = 0;
    if (!rowOperator) rowOperator = "and";

    // Format and validate rowOperator
    rowOperator = this.formatRowOperator(rowOperator);

    // Add the criterion to the array
    const criterion: Criterion = { field, odataOperator, formattedValue, rowOperator, priority };
    this.criteria.push(criterion);
  }

  /** Sets the limit for the query. */
  setLimit(limit: number) {
    this.limit = limit;
  }

  /** Sets the distinct field for the query. There will only be one entry with the same value in the given field. Very useful with many to many relations.*/
  setDistinct(field: string) {
    this.distinctField = field;
  }

  /** Adds an order to the query. */
  addOrder(field: string, ascending: boolean) {
    const order: string = `${field} ${ascending ? "asc" : "desc"}`;
    this.order.push(order);
  }

  /** Returns the result set. */
  getResult(): SuperOfficeObject[] {
    if (!this.hasResult) throw new Error("No result set. Call select() first.");
    return this.result;
  }

  /**
   * Builds the criteria string for the REST API call. */
  private buildFilterQuery(): string {
    // Add parantheses around all criteria with same priority.
    // The rowOperator is between two criteria, regardless of priority.

    if (this.criteria.length === 0) return "";

    let query: string = "";
    const maxPriority: number = Math.max(...this.criteria.map((criterion) => criterion.priority!));

    // All criteria have a priority and a rowOperator, since we set a default value in addCriteria()
    // Add criteria to the query string by doing one priority at a time:
    for (let priority = 0; priority <= maxPriority; priority++) {
      // Begin group of criteria wrapped in parantheses
      let paranthesesGroup: string = "(";

      // Find all criteria with the current priority
      // Using filter(), the order of the criteria is of criteria is preserved
      const samePriorityCriteria: Criterion[] = this.criteria.filter((criterion) => criterion.priority === priority);
      let lastRowOperator: string = "";

      // Add each criterion to the group
      for (const criterion of samePriorityCriteria) {
        let criterionString: string = `${criterion.field} ${criterion.odataOperator} ${criterion.formattedValue}`;

        // Add rowOperator after the current criterion.
        // If it's the last criterion, we preserve it to outside the loop so we can add it after the parantheses group.
        const isLastCriterion: boolean = criterion === samePriorityCriteria[samePriorityCriteria.length - 1];
        if (isLastCriterion) lastRowOperator = criterion.rowOperator!;
        else criterionString += ` ${criterion.rowOperator} `;

        paranthesesGroup += criterionString;
      }

      paranthesesGroup += ")";
      query += paranthesesGroup;

      // Add rowOperator after the parantheses, taken from the last criterion in the group, unless it's the last priority
      const isLastPriority: boolean = priority === maxPriority;
      if (!isLastPriority) query += " " + lastRowOperator + " ";
    }

    return query;
  }

  /** Builds and returns the query options for the REST API call. */
  private buildQueryOptions(): QueryEntitiesOptions {
    const options: QueryEntitiesOptions = { entity: "archive/dynamic" };

    if (this.fields.length > 0) {
      options.select = this.fields.join(",");
    }

    if (this.criteria.length > 0) {
      options.filter = this.buildFilterQuery();
    }

    if (this.order.length > 0) {
      options.orderBy = this.order.join(",");
    }

    if (this.limit) {
      options.top = this.limit;
    } else {
      // Highest possible int32 number to avoid being limited to 1000 rows.
      options.top = 2147483647;
    }

    return options;
  }

  /**
   * Filters out duplicate entries from a result set based on distinctField.
   * Returns the unique result set.
   */
  private filterDistinct(result: SuperOfficeObject[]): SuperOfficeObject[] {
    // Return result "as is" if result is empty or if no distinct field is set
    if (result.length === 0 || !this.distinctField) return result;

    // Return result "as is" if distinct field doesn't exist in result items
    if (!Object.prototype.hasOwnProperty.call(result[0], this.distinctField)) return result;

    // Filter out duplicate entries based on distinct field
    const seen = new Set();
    const uniqueRows: SuperOfficeObject[] = [];

    for (const item of result) {
      const value = item[this.distinctField];

      // Skip if we've seen this value before
      if (seen.has(value)) continue;

      seen.add(value);
      uniqueRows.push(item);
    }

    return uniqueRows;
  }

  /** Does the select-query and returns the size of the result set. */
  async select(): Promise<number> {
    if (this.fields.length === 0 && this.criteria.length === 0) {
      throw new Error("Either fields or criteria must be provided");
    }

    const options: QueryEntitiesOptions = this.buildQueryOptions();
    this.result = await this.superOfficeAgent.QueryEntities(options);
    this.result = this.filterDistinct(this.result);

    this.hasResult = true;
    return this.result.length;
  }
}
