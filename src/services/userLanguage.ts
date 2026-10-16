/**
 * The language the panel asks SuperOffice's REST API for. Without it, REST gives English names for
 * fields, lists and legal bases.
 *
 * The panel's own texts are Norwegian, so SuperOffice's names are asked for in Norwegian too, to match.
 * SuperOffice does not tell the user's own language: its page says lang="en" whatever the user has,
 * and the current principal has no language.
 */
export const PANEL_LANGUAGE = "no";

/** The headers that ask SuperOffice for a language (iso2, e.g. "no"). */
export function languageHeaders(language: string = PANEL_LANGUAGE): Record<string, string> {
  return { "SO-Language": language, "Accept-Language": language };
}
