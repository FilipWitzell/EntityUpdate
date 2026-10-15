import { test } from "node:test";
import assert from "node:assert/strict";
import { inputNamesIn, toSaveRule } from "../src/config/beforeSave.ts";

const fields = [
  { key: "name", property: "Name", label: "Navn", kind: "text", group: "Nøkkelinfo" },
  { key: "orgNr", property: "OrgNr", label: "Org.nr", kind: "text", group: "Klassifisering" },
  {
    key: "categoryId",
    property: "Category",
    idField: "TicketCategoryId",
    mdoList: "ejcategory",
    label: "Kategori",
    kind: "select",
    group: "Klassifisering"
  },
  { key: "x_product", customField: "x_product", label: "Product", kind: "select", group: "Ekstrafelt" }
];

test("the input values a trigger reads are found in its code", () => {
  const source = `EventData ed = getEventData();\nString orgNr = ed.getInputValue("ContactEntity.OrgNr");\nString id = ed.getInputValue( "ContactEntity.ContactId" );`;
  assert.deepEqual(inputNamesIn(source), ["ContactEntity.OrgNr", "ContactEntity.ContactId"]);
});

test("a trigger guards the fields it reads, whatever the casing", () => {
  const source = `ed.getInputValue("contact.orgnr"); ed.getInputValue("TicketEntity.Category.Id"); ed.getInputValue("TicketEntity.CustomFields.x_product");`;
  assert.deepEqual(toSaveRule("Regel", source, fields), { name: "Regel", fieldKeys: ["orgNr", "categoryId", "x_product"], unknownFields: false });
});

test("a trigger that reads no field by name, or only an id, checks something unknown", () => {
  assert.equal(toSaveRule("Include", `#include "orgnr-validering";`, fields).unknownFields, true);
  assert.equal(toSaveRule("Laster firma", `ed.getInputValue("ContactEntity.ContactId");`, fields).unknownFields, true);
  assert.equal(toSaveRule("Telefon", `ed.getInputValue("ContactEntity.Phone");`, fields).unknownFields, false);
});

test("the org.nr trigger in Cust30460 guards the org.nr", () => {
  const source = `#setLanguageLevel 3;
EventData ed = getEventData();
String orgNr = ed.getInputValue("ContactEntity.OrgNr");
Bool block = false;
if (orgNr.isEmpty()) {
  ed.setMessage("Org.nr mangler. Fyll inn et 9-sifret organisasjonsnummer.");
  block = true;
}
ed.setBlockExecution(block);`;
  assert.deepEqual(toSaveRule("Org nummer", source, fields), { name: "Org nummer", fieldKeys: ["orgNr"], unknownFields: false });
});
