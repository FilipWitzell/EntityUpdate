import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeUdefValue, encodeUdefValue, tidyLabel, tidyListName } from "../src/config/superOfficeValues.ts";

const textField = { key: "udef:SuperOffice:3", label: "Koststed", kind: "text", group: "Egendefinerte felt" };
const dateField = { key: "udef:SuperOffice:5", label: "Dato reservert", kind: "date", group: "Egendefinerte felt" };
const intField = { key: "udef:SuperOffice:6", label: "Ant. timer", kind: "number", group: "Egendefinerte felt", udef: { progId: "SuperOffice:6", numberType: "int" } };
const decimalField = { ...intField, udef: { progId: "SuperOffice:6", numberType: "decimal" } };
const checkboxField = { key: "udef:SuperOffice:7", label: "Godkjent", kind: "checkbox", group: "Egendefinerte felt" };

test("dates: SuperOffice's month/day/year, and year 0001 as no date", () => {
  assert.equal(decodeUdefValue("[DT:01/28/2027 00:00:00.0000000]"), "2027-01-28");
  assert.equal(decodeUdefValue("[DT:01/01/0001 00:00:00.0000000]"), null);
  assert.equal(encodeUdefValue(dateField, "2027-01-28"), "[DT:01/28/2027 00:00:00.0000000]");
  assert.equal(encodeUdefValue(dateField, null), "[DT:01/01/0001 00:00:00.0000000]");
});

test("numbers and checkboxes", () => {
  assert.equal(decodeUdefValue("[I:42]"), 42);
  assert.equal(decodeUdefValue("[F:1.5]"), 1.5);
  assert.equal(encodeUdefValue(intField, 7.6), "[I:8]");
  assert.equal(encodeUdefValue(decimalField, 7.5), "[F:7.5]");
  assert.equal(encodeUdefValue(intField, null), "");
  assert.equal(encodeUdefValue(checkboxField, 1), "[I:1]");
  assert.equal(encodeUdefValue(checkboxField, 0), "[I:0]");
});

test("text is kept as it is, empty as no value", () => {
  assert.equal(decodeUdefValue("Oslo"), "Oslo");
  assert.equal(decodeUdefValue(""), null);
  assert.equal(encodeUdefValue(textField, "Oslo"), "Oslo");
  assert.equal(encodeUdefValue(textField, null), "");
});

test("labels written in capitals are tidied, mixed case is kept", () => {
  assert.equal(tidyLabel("KOSTSTED"), "Koststed");
  assert.equal(tidyLabel("ANT. TIMER"), "Ant. timer");
  assert.equal(tidyLabel("🔗ERP Order Number"), "🔗ERP Order Number");
});

test("list names with one name per language", () => {
  assert.equal(tidyListName('NO:"Utleie";'), "Utleie");
  assert.equal(tidyListName('EN:"Rental";NO:"Utleie";'), "Utleie");
  assert.equal(tidyListName('EN:"Rental";SV:"Uthyrning";'), "Rental");
  assert.equal(tidyListName("Annet"), "Annet");
});
