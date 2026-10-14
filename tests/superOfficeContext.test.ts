import { test } from "node:test";
import assert from "node:assert/strict";
import { contextFromIds, parseSuperOfficeAddress, resolveCardContext } from "../src/services/superOfficeContext.ts";

const TENANT = "https://app.superoffice.com/Cust30460/default.aspx?";

test("the card is read from the SuperOffice address", () => {
  assert.deepEqual(parseSuperOfficeAddress(`${TENANT}ticket.main.saleupdate?ticket_id=39&selection_id=808`), { entity: "ticket", id: 39 });
  assert.deepEqual(parseSuperOfficeAddress(`${TENANT}sale.selection.board.saleupdate?sale_id=8&selection_id=808`), { entity: "sale", id: 8 });
  assert.deepEqual(parseSuperOfficeAddress(`${TENANT}contact.main.salearchive.saleupdate?contact_id=341`), { entity: "contact", id: 341 });
});

test("an address that is not a card with a record gives nothing", () => {
  assert.equal(parseSuperOfficeAddress(`${TENANT}selection.main?selection_id=808`), null);
  assert.equal(parseSuperOfficeAddress(`${TENANT}contact.main`), null);
  assert.equal(parseSuperOfficeAddress(`${TENANT}contact.main?contact_id=0`), null);
  assert.equal(parseSuperOfficeAddress("https://app.superoffice.com/Cust30460/CS/scripts/blogic.fcgi?action=doScript"), null);
});

test("the address wins over the ids SuperOffice filled in", () => {
  // On a ticket, <cuid> and <said> are filled too - the address says it is the ticket.
  const params = new URLSearchParams("contactId=341&saleId=8&ticketId=39");
  assert.deepEqual(resolveCardContext(params, `${TENANT}contact.main?contact_id=341`), { entity: "contact", id: 341, source: "address" });
});

test("without an address, the most specific id is used and empty variables are skipped", () => {
  assert.deepEqual(contextFromIds(new URLSearchParams("contactId=341&personId=&saleId=0&ticketId=39")), { entity: "ticket", id: 39, source: "ids" });
  assert.deepEqual(contextFromIds(new URLSearchParams("contactId=341&personId=12&ticketId=")), { entity: "person", id: 12, source: "ids" });
  assert.deepEqual(resolveCardContext(new URLSearchParams("contactId=341"), null), { entity: "contact", id: 341, source: "ids" });
  assert.equal(contextFromIds(new URLSearchParams("contactId=<cuid>")), null);
});
