/**
 * Works out which card the panel is shown on, so one web panel URL serves every card.
 *
 * SuperOffice fills every template variable in the URL from what is current, not from the card the
 * panel is on: on a ticket, <cuid> holds the ticket's company and <said> may hold a sale opened
 * earlier. So the ids alone can not tell the card. The SuperOffice window's own address can:
 *   .../default.aspx?ticket.main.saleupdate?ticket_id=39&selection_id=808
 *   .../default.aspx?sale.selection.board.saleupdate?sale_id=8&selection_id=808
 *   .../default.aspx?contact.main.salearchive.saleupdate?contact_id=341
 * The first part names the screen, and its <entity>_id the record on it.
 */

export type CardEntity = "contact" | "person" | "project" | "sale" | "ticket";

export interface CardContext {
  entity: CardEntity;
  id: number;
  /** "address": read from the SuperOffice window. "ids": guessed from the ids in the panel URL. */
  source: "address" | "ids";
}

const CARD_ENTITIES: CardEntity[] = ["contact", "person", "project", "sale", "ticket"];

/** The panel URL's parameter for each entity, filled by its template variable (<cuid>, <tiid>...). */
const ID_PARAMS: Record<CardEntity, string> = {
  contact: "contactId",
  person: "personId",
  project: "projectId",
  sale: "saleId",
  ticket: "ticketId"
};

/** When the address can not be read: the most specific card first, the company last - it is filled almost everywhere. */
const ID_PRIORITY: CardEntity[] = ["ticket", "sale", "project", "person", "contact"];

/** The card in a SuperOffice address, or null when the address is not a SuperOffice card with a record. */
export function parseSuperOfficeAddress(address: string): { entity: CardEntity; id: number } | null {
  const marker = "default.aspx?";
  const start = address.indexOf(marker);
  if (start === -1) return null;

  // "ticket.main.saleupdate?ticket_id=39&selection_id=808", without any #fragment
  const rest = address.substring(start + marker.length).split("#")[0]!;
  const questionMark = rest.indexOf("?");
  const screen = questionMark === -1 ? rest : rest.substring(0, questionMark);
  const query = questionMark === -1 ? "" : rest.substring(questionMark + 1);

  const entity = screen.split(".")[0]?.toLowerCase() as CardEntity;
  if (!CARD_ENTITIES.includes(entity)) return null;

  const id = Number(new URLSearchParams(query).get(`${entity}_id`));
  return Number.isInteger(id) && id > 0 ? { entity, id } : null;
}

/** The first entity, in priority order, with a real id in the panel URL. Empty or unfilled variables are skipped. */
export function contextFromIds(params: URLSearchParams): CardContext | null {
  for (const entity of ID_PRIORITY) {
    const id = Number(params.get(ID_PARAMS[entity]));
    if (Number.isInteger(id) && id > 0) return { entity, id, source: "ids" };
  }
  return null;
}

/**
 * The card the panel is on: from the SuperOffice window's address when it can be read (the panel is
 * served from the same tenant, so it normally can), else from the ids in the panel URL.
 */
export function resolveCardContext(params: URLSearchParams, superOfficeAddress: string | null): CardContext | null {
  const fromAddress = superOfficeAddress ? parseSuperOfficeAddress(superOfficeAddress) : null;
  if (fromAddress) return { ...fromAddress, source: "address" };
  return contextFromIds(params);
}

/**
 * The SuperOffice window's address. The top window is read directly when it is on the same origin;
 * otherwise the referrer - the page that loaded the panel - is the best there is.
 */
export function readSuperOfficeAddress(): string | null {
  try {
    const href = window.top?.location.href;
    if (href) return href;
  } catch {
    // Another origin: the browser does not let the panel read it.
  }
  return document.referrer || null;
}
