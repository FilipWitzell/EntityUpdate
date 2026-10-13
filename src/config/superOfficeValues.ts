import type { FieldValue, SaleFieldDefinition } from "@/types/SaleQuickUpdate";

/**
 * How SuperOffice writes values and names, kept apart from the agents so it can be tested on its own.
 */

/**
 * SuperOffice keeps user-defined values as encoded strings: text as is, "[I:5]" for whole numbers
 * and checkboxes, "[F:1.5]" for decimals and "[DT:MM/dd/yyyy HH:mm:ss.fffffff]" for dates, where
 * year 0001 means no date.
 */
export function decodeUdefValue(raw: string | null | undefined): FieldValue {
  if (raw === null || raw === undefined || raw === "") return null;
  const date = raw.match(/^\[DT:(\d{2})\/(\d{2})\/(\d{4})/);
  if (date) return date[3] === "0001" ? null : `${date[3]}-${date[1]}-${date[2]}`;
  const number = raw.match(/^\[(?:I|F|D):(-?[\d.]+)\]$/);
  if (number) return Number(number[1]);
  return raw;
}

export function encodeUdefValue(definition: SaleFieldDefinition, value: FieldValue): string {
  if (definition.kind === "date") {
    if (!value) return "[DT:01/01/0001 00:00:00.0000000]";
    const [year, month, day] = String(value).split("-");
    return `[DT:${month}/${day}/${year} 00:00:00.0000000]`;
  }
  if (definition.kind === "checkbox") return `[I:${value ? 1 : 0}]`;
  if (definition.kind === "number") {
    if (value === null || value === "") return "";
    return definition.udef?.numberType === "decimal" ? `[F:${Number(value)}]` : `[I:${Math.round(Number(value))}]`;
  }
  return value === null ? "" : String(value);
}

/** "KOSTSTED" -> "Koststed"; labels written in mixed case are kept. */
export function tidyLabel(label: string): string {
  const letters = label.replace(/[^\p{L}]/gu, "");
  if (letters && letters === letters.toUpperCase()) return label.charAt(0) + label.slice(1).toLowerCase();
  return label;
}

/**
 * List items can carry one name per language: 'NO:"Utleie";EN:"Rental";'. Picks the Norwegian
 * name, else the first one. A plain name is returned as it is.
 */
export function tidyListName(name: string, language = "NO"): string {
  const parts = [...name.matchAll(/([A-Z]{2}):"([^"]*)";/g)];
  if (parts.length === 0) return name;
  return (parts.find((part) => part[1] === language) ?? parts[0])![2]!;
}
