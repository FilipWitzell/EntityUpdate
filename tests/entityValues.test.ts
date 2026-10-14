import { test } from "node:test";
import assert from "node:assert/strict";
import { readValues, writeValues } from "../src/config/entityValues.ts";

const definitions = [
  { key: "name", property: "Name", label: "Navn", kind: "text", group: "Nøkkelinfo" },
  { key: "categoryId", property: "Category", mdoList: "category", label: "Kategori", kind: "select", group: "Nøkkelinfo" },
  {
    key: "associateId",
    property: "Associate",
    idField: "AssociateId",
    mdoList: "associate",
    label: "Vår kontakt",
    kind: "select",
    group: "Nøkkelinfo"
  },
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
  const entity = {
    Name: "Gammelt navn",
    Category: { Id: 3 },
    Associate: { AssociateId: 7 },
    CustomFields: {},
    UserDefinedFields: { "SuperOffice:1": "" }
  };
  writeValues(entity, { categoryId: null, associateId: 9, "udef:SuperOffice:1": 12 }, definitions);
  assert.equal(entity.Name, "Gammelt navn");
  assert.deepEqual(entity.Category, { Id: 0 });
  assert.deepEqual(entity.Associate, { AssociateId: 9 });
  assert.equal(entity.CustomFields["SuperOffice:1"], "[I:12]");
  assert.equal(entity.UserDefinedFields["SuperOffice:1"], "[I:12]");
});

const product = {
  key: "x_product",
  customField: "x_product",
  extraTable: { table: "y_product", displayField: "x_product_name" },
  label: "Produkt",
  kind: "select",
  group: "Klassifisering"
};

test("a relation to an extra table is read as the row id, and 0 as no row", () => {
  assert.equal(readValues({ CustomFields: { x_product: "[I:4]" } }, [product]).x_product, 4);
  assert.equal(readValues({ CustomFields: { x_product: "[I:0]" } }, [product]).x_product, null);
});

test("a relation is written as a whole number in CustomFields and in the old ExtraFields", () => {
  const entity = { CustomFields: { x_product: "[I:0]" }, ExtraFields: { x_product: "[I:0]" } };
  writeValues(entity, { x_product: 2 }, [product]);
  assert.equal(entity.CustomFields.x_product, "[I:2]");
  assert.equal(entity.ExtraFields.x_product, "[I:2]");
  writeValues(entity, { x_product: null }, [product]);
  assert.equal(entity.CustomFields.x_product, "[I:0]");
});
