// Relative, so the tests can load this module straight from node.
import { decodeUdefValue, encodeUdefValue } from "./superOfficeValues.ts";
import type { EntityFieldDefinition, EntityValues, RestEntity } from "@/types/EntityQuickUpdate";
import type { FieldValue } from "@/types/Fields";

/**
 * Reading and writing field values on a REST entity, driven by the field definitions. Kept apart from
 * the agent so it can be tested on its own.
 */

/** The value of one field on the entity, in the panel's form (ids, ISO dates, 1/0). */
export function readField(entity: RestEntity, definition: EntityFieldDefinition): FieldValue {
  if (definition.udef) return decodeUdefValue(entity.CustomFields?.[definition.udef.progId]);
  if (!definition.property) return null;

  const raw = entity[definition.property];
  if (definition.kind === "select") {
    const id = (raw as Record<string, unknown> | null | undefined)?.[definition.idField ?? "Id"];
    return typeof id === "number" && id > 0 ? id : null;
  }
  if (definition.kind === "date") return dateOrNull(raw as string | null | undefined);
  if (definition.kind === "checkbox") return raw ? 1 : 0;
  if (raw === null || raw === undefined) return null;
  return raw as string | number;
}

/** Every built-in field's value, plus every user-defined value the entity carries. */
export function readValues(entity: RestEntity, definitions: EntityFieldDefinition[]): EntityValues {
  const values: EntityValues = {};
  for (const definition of definitions) values[definition.key] = readField(entity, definition);
  for (const [progId, raw] of Object.entries(entity.CustomFields ?? {})) {
    if (!progId.endsWith(":org")) values[`udef:${progId}`] = decodeUdefValue(raw);
  }
  return values;
}

/** Writes the changed values onto the entity, in the form SuperOffice expects. Returns the same entity. */
export function writeValues(entity: RestEntity, changes: EntityValues, definitions: EntityFieldDefinition[]): RestEntity {
  for (const definition of definitions) {
    if (!(definition.key in changes)) continue;
    const value = changes[definition.key] ?? null;

    if (definition.udef) {
      const encoded = encodeUdefValue(definition, value);
      entity.CustomFields = { ...entity.CustomFields, [definition.udef.progId]: encoded };
      if (entity.UserDefinedFields && definition.udef.progId in entity.UserDefinedFields) {
        entity.UserDefinedFields = { ...entity.UserDefinedFields, [definition.udef.progId]: encoded };
      }
      continue;
    }
    if (!definition.property) continue;

    if (definition.kind === "select") {
      // An emptied list value is id 0, which is how SuperOffice stores "none".
      entity[definition.property] = { [definition.idField ?? "Id"]: Number(value ?? 0) };
    } else if (definition.kind === "date") {
      entity[definition.property] = value ? `${value}T00:00:00` : null;
    } else if (definition.kind === "checkbox") {
      entity[definition.property] = Number(value) === 1;
    } else if (definition.kind === "number" || definition.kind === "amount" || definition.kind === "percent") {
      entity[definition.property] = Number(value ?? 0);
    } else {
      entity[definition.property] = value === null ? "" : String(value);
    }
  }
  return entity;
}

/** "2027-03-01T00:00:00" -> "2027-03-01"; SuperOffice's empty date (year 0001) and none -> null. */
export function dateOrNull(value: string | null | undefined): string | null {
  if (!value || value.startsWith("0001")) return null;
  return value.substring(0, 10);
}
