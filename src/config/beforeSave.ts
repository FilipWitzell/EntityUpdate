import type { EntityFieldDefinition } from "@/types/EntityQuickUpdate";

/**
 * The tenant's own before-save rules. Saving through REST skips the card's triggers, and SuperOffice
 * has no way to run a trigger from outside. So the panel reads the active before-save triggers and
 * leaves the fields they check to the card. Kept apart from the agent so it can be tested on its own.
 */

/** An active before-save trigger, and which of the panel's fields it reads. */
export interface SaveRule {
  name: string;
  /** Keys of the panel's fields the trigger reads. */
  fieldKeys: string[];
  /** The trigger reads no input value by name (e.g. all its code is in an #include), so what it checks is unknown. */
  unknownFields: boolean;
}

/** The input values a trigger reads by name: getInputValue("ContactEntity.OrgNr") gives "ContactEntity.OrgNr". */
export function inputNamesIn(source: string): string[] {
  return [...source.matchAll(/getInputValue\s*\(\s*"([^"]+)"\s*\)/g)].map((match) => match[1]!);
}

/**
 * The fields an input value is about. "ContactEntity.OrgNr" and "contact.orgnr" are about the field
 * whose property is OrgNr, "TicketEntity.Category.Id" about Category, and "ContactEntity.CustomFields.x_product"
 * about the extra field x_product. Names are matched without regard to casing.
 */
export function fieldsReadBy(inputNames: string[], definitions: EntityFieldDefinition[]): string[] {
  const keys = new Set<string>();
  for (const inputName of inputNames) {
    const segments = inputName.split(".").map((segment) => segment.toLowerCase());
    // The entity comes first ("ContactEntity", "contact"); the field follows. A custom field may come last.
    const field = segments.length > 1 ? segments[1] : segments[0];
    const last = segments[segments.length - 1];
    for (const definition of definitions) {
      const names = [definition.property, definition.customField, definition.udef?.progId].map((name) => name?.toLowerCase());
      if (names.includes(field) || (definition.customField && names.includes(last))) keys.add(definition.key);
    }
  }
  return [...keys];
}

/**
 * A trigger as a save rule: the fields it reads, or that what it checks is unknown - when it reads no
 * input value by name, or only an id (it may load the record and check any field).
 */
export function toSaveRule(name: string, source: string, definitions: EntityFieldDefinition[]): SaveRule {
  const inputNames = inputNamesIn(source);
  const fieldKeys = fieldsReadBy(inputNames, definitions);
  const readsOnlyIds = fieldKeys.length === 0 && inputNames.some((inputName) => /id$/i.test(inputName));
  return { name, fieldKeys, unknownFields: inputNames.length === 0 || readsOnlyIds };
}
