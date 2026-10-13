import {
  CRMSCRIPT_ENDPOINT,
  CRMSCRIPT_ENDPOINT_ACTION,
  XSRF_TOKEN,
  SUPEROFFICE_URL,
  SUPEROFFICE_SERVICE_URL
} from "@/superoffice-config/superoffice-config";

import type { SuperOfficeObject } from "@/types/SuperOfficeObject";
import type { QueryEntitiesOptions } from "@/types/QueryEntitiesOptions";

/** Returns default headers for REST API requests (for when calling REST API from inside SuperOffice) */
export const restApiDefaultHeaders = (): HeadersInit => ({
  "X-XSRF-TOKEN": XSRF_TOKEN,
  Accept: "application/json",
  "Content-Type": "application/json",
  PartnerOrigin: "Cloud Connection" // Non-mandatory field, but added to identify ourselves to SuperOffice.
});

/**
 * An agent for interacting with SuperOffice, via REST API or via calling CRMScript web services.
 */
export class SuperOfficeAgent {
  /**
   * A generic request method to send requests to Superoffice.
   * Can be used to send requests to any URL appended to SuperOffice URL.
   * If using with REST API, remember to use restApiDefaultHeaders().
   */
  async Request(options: {
    method: string;
    endpoint: string;
    urlParams?: URLSearchParams;
    body?: unknown;
    headers?: HeadersInit;
  }): Promise<Response> {
    const { method, endpoint, urlParams = new URLSearchParams(), body = null, headers = {} } = options;

    // Construct URL, omitting '?' if no URL params have been provided
    const urlParamsString = urlParams.toString();
    const url = urlParamsString ? `${SUPEROFFICE_URL}${endpoint}?${urlParamsString}` : `${SUPEROFFICE_URL}${endpoint}`;

    try {
      const response = await fetch(url, {
        method: method,
        headers: headers,
        body: body !== null && body !== undefined ? JSON.stringify(body) : null
      });

      if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
      return response;
    } catch (error) {
      console.error(`${method} request failed:`, error);
      throw error;
    }
  }

  /**
   * Fetches entities from SuperOffice using OData query options via the REST API.
   * Returns an array of SuperOfficeObjects.
   *
   * Can be used to fetch entities such as:
   * - Standard entities: "Contact", "Person", "Contact/{id}/Activities", etc.
   * - Archive providers: "archive/Appointment", "archive/CustomObject", etc.
   *
   * Docs:
   * - OData queries: https://docs.superoffice.com/en/api/netserver/search/odata/index.html
   * - Available entity types: https://docs.superoffice.com/en/api/reference/restful/rest/index.html
   * - Available archive provider types: https://docs.superoffice.com/en/api/netserver/archive-providers/reference/index.html
   */
  async QueryEntities(options: QueryEntitiesOptions): Promise<SuperOfficeObject[]> {
    const urlParams = new URLSearchParams();
    if (options.select) urlParams.append("$select", options.select);
    if (options.filter) urlParams.append("$filter", options.filter);
    if (options.orderBy) urlParams.append("$orderby", options.orderBy);
    if (options.top) urlParams.append("$top", options.top.toString());
    if (options.skip) urlParams.append("$skip", options.skip.toString());
    if (options.mode) urlParams.append("$mode", options.mode);
    if (options.providerOptions) urlParams.append("$options", options.providerOptions);
    if (options.context) urlParams.append("$context", options.context);
    if (options.format) urlParams.append("$format", options.format);
    if (options.jsonSafe !== undefined && options.jsonSafe !== null) urlParams.append("$jsonSafe", options.jsonSafe.toString());
    if (options.output) urlParams.append("$output", options.output);

    try {
      const response = await this.Request({
        method: "GET",
        endpoint: `/api/v1/${options.entity}`,
        urlParams,
        headers: restApiDefaultHeaders()
      });
      const jsonResponse = await response.json();
      return jsonResponse.value;
    } catch (error) {
      console.error(`Failed to query ${options.entity} with options:`, options, error);
      throw error;
    }
  }

  /**
   * Fetches a single entity by its ID.
   * Example doc for contacts: https://docs.superoffice.com/en/api/reference/restful/rest/Contact/v1ContactEntity_GetContactEntity.html
   */
  async GetEntityById(options: { entity: string; id: number; select?: string; fk?: boolean }): Promise<object> {
    const { entity, id, select, fk } = options;

    const urlParams = new URLSearchParams();
    if (select) urlParams.append("$select", select);
    if (fk !== undefined) urlParams.append("fk", fk.toString());

    try {
      const response = await this.Request({
        method: "GET",
        endpoint: `/api/v1/${entity}/${id}`,
        urlParams,
        headers: restApiDefaultHeaders()
      });
      return await response.json();
    } catch (error) {
      console.error(`Failed to fetch ${entity} with id ${id}:`, error);
      throw error;
    }
  }

  /**
   * Fetches a single custom object by its ID.
   */
  async GetCustomObjectById(tableName: string, id: number): Promise<object> {
    return this.GetEntityById({ entity: `Table/${tableName}`, id });
  }

  /**
   * Fetches custom objects from SuperOffice using OData query options via Archive/CustomObject in REST API.
   */
  async QueryCustomObjects(
    tableName: string,
    options: {
      select?: string;
      filter?: string;
      orderBy?: string;
      top?: number;
      skip?: number;
    } = {}
  ): Promise<SuperOfficeObject[]> {
    const { select, filter, orderBy, top, skip } = options;
    return this.QueryEntities({
      entity: `Archive/CustomObject:${tableName}`,
      select,
      filter,
      orderBy,
      top,
      skip
    });
  }

  /**
   * Inserts a new custom object row.
   * Expects properties in object body with names like "x_property_name".
   * Returns the ID of the new row.
   */
  async InsertCustomObjectRow(tableName: string, object: object): Promise<number> {
    if (!tableName) throw new Error("No table name provided");

    const response = await this.Request({
      method: "POST",
      endpoint: `/api/v1/Table/${tableName}`,
      body: object,
      headers: restApiDefaultHeaders()
    });
    const responseText: string = await response.text();
    return parseInt(responseText);
  }

  /**
   * Updates an existing custom object row.
   * Expects properties in object body with names like "x_property_name".
   * Returns true if update was successful.
   */
  async UpdateCustomObjectRow(tableName: string, id: number, object: object): Promise<boolean> {
    if (!tableName) throw new Error("No table name provided");

    const response = await this.Request({
      method: "PUT",
      endpoint: `/api/v1/Table/${tableName}/${id}`,
      body: object,
      headers: restApiDefaultHeaders()
    });
    return response.ok;
  }

  /**
   * Inserts or updates an existing custom object row.
   * Expects properties in object body with names like "x_property_name".
   * If provided ID is 0, does an insert, otherwise an update.
   * Returns the ID of the object.
   */
  async UpsertCustomObjectRow(tableName: string, id: number, object: object): Promise<number> {
    // Insert
    if (id <= 0) return this.InsertCustomObjectRow(tableName, object);

    // Update
    const updated: boolean = await this.UpdateCustomObjectRow(tableName, id, object);
    if (!updated) throw new Error("Could not update object with ID: " + id);
    return id;
  }

  /**
   * Deletes a custom object row.
   * Returns true if deletion was successful.
   */
  async DeleteCustomObjectRow(tableName: string, id: number): Promise<boolean> {
    if (!tableName) throw new Error("No table name provided");
    if (id <= 0) throw new Error("Invalid ID provided");

    const response = await this.Request({
      method: "DELETE",
      endpoint: `/api/v1/Table/${tableName}/${id}`,
      headers: restApiDefaultHeaders()
    });
    return response.ok;
  }

  /**
   * Calls a CRMScript web service.
   * Uses customer.fcgi when in development mode, and blogic.fcgi when in production mode.
   */
  async CallCRMScriptWebService(options: {
    method: string;
    includeId: string;
    key: string;
    additionalUrlParams?: URLSearchParams;
    body?: unknown;
    headers?: Record<string, string>;
  }): Promise<unknown> {
    const { method, includeId, key, additionalUrlParams = new URLSearchParams(), body = null, headers = {} } = options;

    // Ensure required parameters are in the urlParams
    const urlParams = new URLSearchParams(additionalUrlParams);
    urlParams.set("action", CRMSCRIPT_ENDPOINT_ACTION);
    urlParams.set("includeId", includeId);
    urlParams.set("key", key);

    const url = `${SUPEROFFICE_SERVICE_URL}scripts/${CRMSCRIPT_ENDPOINT}?${urlParams.toString()}`;

    try {
      const response = await fetch(url, {
        method,
        headers: {
          ...headers,
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body: body ? JSON.stringify(body) : null
      });

      if (!response.ok) {
        const errorText = await response.text(); // Get the error message from the response
        throw new Error(errorText || `HTTP error! Status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error calling CRMScript web service:", error);
      throw error;
    }
  }
}
