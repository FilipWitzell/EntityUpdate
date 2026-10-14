import type { ActivityDisplay, FieldDefinition, FieldLayout, SavedLayout } from "@/types/Fields";

/** What the next activity row shows when no layout says otherwise. */
export const DEFAULT_ACTIVITY_DISPLAY: ActivityDisplay = "type";

const ACTIVITY_DISPLAYS: ActivityDisplay[] = ["date", "type", "full"];
const ACTIVITY_TOKEN = "@activity=";

/**
 * A layout is stored as one short line in a SuperOffice preference, so it stays well inside the
 * preference value's length: the field keys in display order, comma separated, "-" in front of a
 * hidden field and "!" after an important one. Settings follow as "@name=value".
 * Example: "heading,amount!,-competitorId,udef:SuperOffice:3!,@activity=type".
 */
export function encodeLayout(layout: SavedLayout): string {
  const tokens = layout.fields.map((entry) => `${entry.visible ? "" : "-"}${entry.key}${entry.important ? "!" : ""}`);
  if (layout.activityDisplay) tokens.push(ACTIVITY_TOKEN + layout.activityDisplay);
  return tokens.join(",");
}

export function decodeLayout(raw: string | null | undefined): SavedLayout | null {
  if (!raw || !raw.trim()) return null;
  const tokens = raw
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);

  const activityValue = tokens.find((token) => token.startsWith(ACTIVITY_TOKEN))?.substring(ACTIVITY_TOKEN.length);
  const fields = tokens
    .filter((token) => !token.startsWith("@"))
    .map((token) => {
      const visible = !token.startsWith("-");
      const important = token.endsWith("!");
      const key = token.replace(/^-/, "").replace(/!$/, "");
      return { key, visible, important };
    });
  const activityDisplay = ACTIVITY_DISPLAYS.find((display) => display === activityValue) ?? null;
  return { fields, activityDisplay };
}

/** The built-in layout: fields in their defined order, shown unless hidden by default. */
export function defaultLayout(definitions: FieldDefinition[]): FieldLayout {
  return definitions.map((definition) => ({
    key: definition.key,
    visible: !definition.hiddenByDefault,
    important: !!definition.important
  }));
}

/**
 * A complete layout for the fields that exist now: the saved order first, then fields the saved
 * layout does not know yet (new user-defined fields) as they are by default. Keys of fields that no
 * longer exist are dropped.
 */
export function completeLayout(definitions: FieldDefinition[], layout: FieldLayout | null): FieldLayout {
  const defaults = defaultLayout(definitions);
  if (!layout) return defaults;

  const known = new Set(definitions.map((definition) => definition.key));
  const saved = layout.filter((entry) => known.has(entry.key));
  const savedKeys = new Set(saved.map((entry) => entry.key));
  return [...saved, ...defaults.filter((entry) => !savedKeys.has(entry.key))];
}

/** The fields to show, in layout order, with the layout's choice of important fields. */
export function applyLayout<D extends FieldDefinition>(definitions: D[], layout: FieldLayout | null): D[] {
  const byKey = new Map(definitions.map((definition) => [definition.key, definition]));
  return completeLayout(definitions, layout)
    .filter((entry) => entry.visible)
    .flatMap((entry) => {
      const definition = byKey.get(entry.key);
      return definition ? [{ ...definition, important: entry.important }] : [];
    });
}

/**
 * The standard an admin sets is a minimum for the user's own layout: a field the standard shows
 * stays shown, and a field it marks important stays important. The user may show more, mark more
 * and change the order. Both layouts must be complete (see completeLayout).
 */
export function withStandardMinimum(personal: FieldLayout, standard: FieldLayout): FieldLayout {
  const required = new Map(standard.map((entry) => [entry.key, entry]));
  return personal.map((entry) => {
    const minimum = required.get(entry.key);
    if (!minimum) return entry;
    return { ...entry, visible: entry.visible || minimum.visible, important: entry.important || minimum.important };
  });
}
