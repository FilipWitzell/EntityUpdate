// Relative, so the tests can load this module straight from node.
import { decodeUdefValue, encodeUdefValue } from "./superOfficeValues.ts";
import type { EntityFieldDefinition, EntityValues, RestEntity } from "@/types/EntityQuickUpdate";
import type { FieldValue, ListItem } from "@/types/Fields";

/**
 * Reading and writing field values on a REST entity, driven by the field definitions. Kept apart from
 * the agent so it can be tested on its own.
 */

/** Where a field's values are picked from: an MDO list ("category") or an extra table ("extra:y_product"). */
export function optionListKey(definition: EntityFieldDefinition): string | null {
  if (definition.extraTable) return `extra:${definition.extraTable.table}`;
  return definition.mdoList ?? null;
}

/** The value of one field on the entity, in the panel's form (ids, ISO dates, 1/0). */
export function readField(entity: RestEntity, definition: EntityFieldDefinition): FieldValue {
  if (definition.udef) return decodeUdefValue(asText(entity.CustomFields?.[definition.udef.progId]));
  if (definition.customField) return readExtraValue(entity.CustomFields?.[definition.customField], definition);
  if (!definition.property) return null;

  const raw = entity[definition.property];
  if (holdsObject(definition)) {
    const id = (raw as Record<string, unknown> | null | undefined)?.[definition.idField ?? "Id"];
    return typeof id === "number" && id > 0 ? id : null;
  }
  if (definition.kind === "date") return dateOrNull(raw as string | null | undefined);
  if (definition.kind === "datetime") return dateTimeOrNull(raw as string | null | undefined);
  if (definition.kind === "checkbox") return raw ? 1 : 0;
  if (raw === null || raw === undefined) return null;
  return raw as string | number;
}

/** Every field's value, plus every user-defined value the entity carries (extra fields are read by their definition). */
export function readValues(entity: RestEntity, definitions: EntityFieldDefinition[]): EntityValues {
  const values: EntityValues = {};
  for (const definition of definitions) values[definition.key] = readField(entity, definition);
  for (const [progId, raw] of Object.entries(entity.CustomFields ?? {})) {
    if (!progId.endsWith(":org") && !progId.startsWith("x_")) values[`udef:${progId}`] = decodeUdefValue(asText(raw));
  }
  return values;
}

/** The current value's name in the fields that are searched (those with a nameField), by field key. */
export function readNames(entity: RestEntity, definitions: EntityFieldDefinition[]): Record<string, ListItem> {
  const names: Record<string, ListItem> = {};
  for (const definition of definitions) {
    if (!definition.property || !definition.nameField) continue;
    const related = entity[definition.property] as Record<string, unknown> | null | undefined;
    const id = related?.[definition.idField ?? "Id"];
    if (typeof id === "number" && id > 0) names[definition.key] = { id, name: String(related?.[definition.nameField] ?? "") };
  }
  return names;
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

    if (definition.customField) {
      const key = definition.customField;
      entity.CustomFields = { ...entity.CustomFields, [key]: writeExtraValue(entity.CustomFields?.[key], definition, value) };
      // The old ExtraFields collection comes back on the entity too; keep it from holding the previous value.
      if (entity.ExtraFields && key in entity.ExtraFields) {
        entity.ExtraFields = { ...entity.ExtraFields, [key]: writeExtraValue(entity.ExtraFields[key], definition, value) };
      }
      continue;
    }
    if (!definition.property) continue;

    if (definition.kind === "select") {
      // An emptied list value is id 0, which is how SuperOffice stores "none".
      entity[definition.property] = { [definition.idField ?? "Id"]: Number(value ?? 0) };
    } else if (holdsObject(definition)) {
      // A related record (a person, ...) is left empty as null, not as id 0.
      entity[definition.property] = value ? { [definition.idField ?? "Id"]: Number(value) } : null;
    } else if (definition.kind === "date") {
      entity[definition.property] = value ? `${value}T00:00:00` : null;
    } else if (definition.kind === "datetime") {
      entity[definition.property] = value ? String(value) : null;
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

/** Whether a built-in field's property holds an object with the id: a list item, or a related record. */
function holdsObject(definition: EntityFieldDefinition): boolean {
  return ["select", "person", "contact", "project"].includes(definition.kind);
}

/** Whether a field's value is the id of a row or list item (relations, MDO lists), rather than text. */
function holdsId(definition: EntityFieldDefinition): boolean {
  return definition.kind === "select" && Boolean(definition.extraTable || definition.mdoList);
}

/**
 * An extra field's value in the panel's form. REST can hand it over as a plain number or boolean, as
 * text, or encoded ("[I:4]", "[F:1.5]", "[D:2026.10.14]", "[DT:10/14/2026 ...]") - all are read.
 */
export function readExtraValue(raw: ExtraValue | undefined, definition: EntityFieldDefinition): FieldValue {
  if (raw === null || raw === undefined || raw === "") return null;
  if (holdsId(definition)) {
    const id = Number(typeof raw === "string" ? raw.replace(/^\[I:(-?\d+)\]$/, "$1") : raw);
    // No row or list item is stored as 0.
    return Number.isInteger(id) && id > 0 ? id : null;
  }
  if (definition.kind === "checkbox") {
    if (typeof raw === "boolean") return raw ? 1 : 0;
    return ["1", "true", "[I:1]"].includes(String(raw).toLowerCase()) ? 1 : 0;
  }
  if (typeof raw === "boolean") return raw ? 1 : 0;
  if (typeof raw === "number") return raw;
  if (definition.kind === "date") {
    const day = raw.match(/^\[D:(\d{4})\.(\d{2})\.(\d{2})\]$/);
    if (day) return day[1] === "0001" ? null : `${day[1]}-${day[2]}-${day[3]}`;
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return dateOrNull(raw);
  }
  const value = decodeUdefValue(raw);
  if (definition.kind === "number" && typeof value === "string" && value.trim() !== "" && !isNaN(Number(value))) return Number(value);
  return value;
}

/**
 * An extra field's value in the form the entity already carries it in, so it goes back the way it came:
 * a number stays a number, "[I:4]" stays encoded, and so on. A field with no value yet gets a plain value.
 */
export function writeExtraValue(current: ExtraValue | undefined, definition: EntityFieldDefinition, value: FieldValue): ExtraValue {
  if (holdsId(definition) || definition.kind === "checkbox" || definition.kind === "number") {
    // No row, list item or number is 0; a checkbox is 1 or 0.
    const number = definition.kind === "checkbox" ? (Number(value) === 1 ? 1 : 0) : Number(value ?? 0);
    if (typeof current === "boolean") return number === 1;
    if (typeof current === "string") {
      if (current.startsWith("[I:")) return `[I:${Math.round(number)}]`;
      if (current.startsWith("[F:")) return `[F:${number}]`;
      return String(number);
    }
    return number;
  }
  if (definition.kind === "date") {
    const [year, month, day] = value ? String(value).split("-") : ["0001", "01", "01"];
    if (typeof current === "string" && current.startsWith("[D:")) return `[D:${year}.${month}.${day}]`;
    if (typeof current === "string" && current.startsWith("[DT:")) return encodeUdefValue({ kind: "date" }, value);
    return value ? `${value}T00:00:00` : null;
  }
  return value === null ? "" : String(value);
}

/** A value in CustomFields / ExtraFields, in whatever form REST hands it over. */
type ExtraValue = string | number | boolean | null;

function asText(raw: ExtraValue | undefined): string | null | undefined {
  return typeof raw === "number" || typeof raw === "boolean" ? String(raw) : raw;
}

/** "2027-03-01T00:00:00" -> "2027-03-01"; SuperOffice's empty date (year 0001) and none -> null. */
export function dateOrNull(value: string | null | undefined): string | null {
  if (!value || value.startsWith("0001")) return null;
  return value.substring(0, 10);
}

/** "2027-03-01T14:30:00Z" -> "2027-03-01T14:30:00"; SuperOffice's empty date (year 0001) and none -> null. */
export function dateTimeOrNull(value: string | null | undefined): string | null {
  if (!value || value.startsWith("0001")) return null;
  return value.substring(0, 19);
}
