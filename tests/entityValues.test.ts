import { test } from "node:test";
import assert from "node:assert/strict";
import { readValues, writeValues } from "../src/config/entityValues.ts";

const definitions = [
  { key: "name", property: "Name", label: "Navn", kind: "text", group: "Nøkkelinfo" },
  { key: "categoryId", property: "Category", mdoList: "category", label: "Kategori", kind: "select", group: "Nøkkelinfo" },
  { key: "associateId", property: "Associate", idField: "AssociateId", mdoList: "associate", label: "Vår kontakt", kind: "select", group: "Nøkkelinfo" },
  { key: "udef:SuperOffice:1", label: "ERP", kind: "number", group: "Egendefinerte felt", udef: { progId: "SuperOffice:1", numberType: "int" } }
];

test("values are read from properties, list objects and user-defined fields", () => {
  const entity = {
    Name: "Drammen Elektro AS",
    Category: { Id: 3, Value: "Kunde" },
    Associate: { AssociateId: 0 },
    CustomFields: { "SuperOffice:1": "[I:5]", "SuperOffice:1:org": "5" }
  };
  assert.deepEqual(readValues(entity, definitions), { name: "Drammen Elektro AS", categoryId: 3, associateId: null, "udef:SuperOffice:1": 5 });
});

test("only changed values are written, each in SuperOffice's form", () => {
  const entity = { Name: "Gammelt navn", Category: { Id: 3 }, Associate: { AssociateId: 7 }, CustomFields: {}, UserDefinedFields: { "SuperOffice:1": "" } };
  writeValues(entity, { categoryId: null, associateId: 9, "udef:SuperOffice:1": 12 }, definitions);
  assert.equal(entity.Name, "Gammelt navn");
  assert.deepEqual(entity.Category, { Id: 0 });
  assert.deepEqual(entity.Associate, { AssociateId: 9 });
  assert.equal(entity.CustomFields["SuperOffice:1"], "[I:12]");
  assert.equal(entity.UserDefinedFields["SuperOffice:1"], "[I:12]");
});
