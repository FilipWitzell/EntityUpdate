import { test } from "node:test";
import assert from "node:assert/strict";
import { readNames, readValues, writeValues } from "../src/config/entityValues.ts";

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

test("a relation that comes as a plain number is read as the row id", () => {
  assert.equal(readValues({ CustomFields: { x_product: 2 } }, [product]).x_product, 2);
  assert.equal(readValues({ CustomFields: { x_product: "2" } }, [product]).x_product, 2);
  assert.equal(readValues({ CustomFields: { x_product: 0 } }, [product]).x_product, null);
  assert.equal(readValues({ CustomFields: {} }, [product]).x_product, null);
});

test("a relation that came as a plain number is written back as one", () => {
  const entity = { CustomFields: { x_product: 2 }, ExtraFields: { x_product: "2" } };
  writeValues(entity, { x_product: 3 }, [product]);
  assert.equal(entity.CustomFields.x_product, 3);
  assert.equal(entity.ExtraFields.x_product, "3");
  writeValues(entity, { x_product: null }, [product]);
  assert.equal(entity.CustomFields.x_product, 0);
});

test("a relation is written as a whole number in CustomFields and in the old ExtraFields", () => {
  const entity = { CustomFields: { x_product: "[I:0]" }, ExtraFields: { x_product: "[I:0]" } };
  writeValues(entity, { x_product: 2 }, [product]);
  assert.equal(entity.CustomFields.x_product, "[I:2]");
  assert.equal(entity.ExtraFields.x_product, "[I:2]");
  writeValues(entity, { x_product: null }, [product]);
  assert.equal(entity.CustomFields.x_product, "[I:0]");
});

const extra = (key: string, kind: string, more: Record<string, unknown> = {}) => ({
  key,
  customField: key,
  label: key,
  kind,
  group: "Ekstrafelt",
  ...more
});

test("extra fields of every kind are read, whatever form REST hands them over in", () => {
  const fields = [
    extra("x_text", "text"),
    extra("x_count", "number"),
    extra("x_rate", "number"),
    extra("x_done", "checkbox"),
    extra("x_flag", "checkbox"),
    extra("x_due", "date"),
    extra("x_start", "date"),
    extra("x_choice", "select", { choices: [{ id: "BNXT", name: "BNXT" }] })
  ];
  const entity = {
    CustomFields: {
      x_text: "Hei",
      x_count: "[I:7]",
      x_rate: 1.5,
      x_done: true,
      x_flag: "[I:0]",
      x_due: "[D:2026.10.14]",
      x_start: "2026-11-01T00:00:00",
      x_choice: "BNXT"
    }
  };
  assert.deepEqual(readValues(entity, fields), {
    x_text: "Hei",
    x_count: 7,
    x_rate: 1.5,
    x_done: 1,
    x_flag: 0,
    x_due: "2026-10-14",
    x_start: "2026-11-01",
    x_choice: "BNXT"
  });
});

test("extra fields are written back in the form they came in", () => {
  const fields = [extra("x_count", "number"), extra("x_done", "checkbox"), extra("x_due", "date"), extra("x_start", "date"), extra("x_text", "text")];
  const entity = { CustomFields: { x_count: "[I:7]", x_done: true, x_due: "[D:2026.10.14]", x_start: null, x_text: "Hei" } };
  writeValues(entity, { x_count: 8, x_done: 0, x_due: "2026-12-24", x_start: "2027-01-02", x_text: null }, fields);
  assert.deepEqual(entity.CustomFields, {
    x_count: "[I:8]",
    x_done: false,
    x_due: "[D:2026.12.24]",
    x_start: "2027-01-02T00:00:00",
    x_text: ""
  });
});

test("extra fields are not also read as user-defined fields", () => {
  const values = readValues({ CustomFields: { x_product: 2, "SuperOffice:1": "Hei" } }, [product]);
  assert.deepEqual(Object.keys(values).sort(), ["udef:SuperOffice:1", "x_product"]);
});

const ticketFields = [
  {
    key: "categoryId",
    property: "Category",
    idField: "TicketCategoryId",
    mdoList: "ejcategory",
    label: "Kategori",
    kind: "select",
    group: "Klassifisering"
  },
  { key: "personId", property: "Person", idField: "PersonId", nameField: "FullName", label: "Kontaktperson", kind: "person", group: "Nøkkelinfo" },
  { key: "deadline", property: "Deadline", label: "Frist", kind: "datetime", group: "Oppfølging" }
];

test("a ticket's category, contact person and deadline are read, with the person's name", () => {
  const entity = {
    Category: { TicketCategoryId: 4, Name: "Bestilling" },
    Person: { PersonId: 1001, FullName: "Anne Berg", ContactId: 500 },
    Deadline: "2026-10-20T12:30:00Z"
  };
  assert.deepEqual(readValues(entity, ticketFields), { categoryId: 4, personId: 1001, deadline: "2026-10-20T12:30:00" });
  assert.deepEqual(readNames(entity, ticketFields), { personId: { id: 1001, name: "Anne Berg" } });
});

test("no contact person and SuperOffice's empty date are read as no value", () => {
  const entity = { Category: { TicketCategoryId: 0 }, Person: null, Deadline: "0001-01-01T00:00:00" };
  assert.deepEqual(readValues(entity, ticketFields), { categoryId: null, personId: null, deadline: null });
  assert.deepEqual(readNames(entity, ticketFields), {});
});

test("a new contact person and deadline are written; an emptied person is null", () => {
  const entity = { Person: { PersonId: 1001, FullName: "Anne Berg" }, Deadline: null };
  writeValues(entity, { personId: 1012, deadline: "2026-11-01T09:00:00" }, ticketFields);
  assert.deepEqual(entity.Person, { PersonId: 1012 });
  assert.equal(entity.Deadline, "2026-11-01T09:00:00");
  writeValues(entity, { personId: null, deadline: null }, ticketFields);
  assert.equal(entity.Person, null);
  assert.equal(entity.Deadline, null);
});

test("the company picker on a ticket is read from the contact person, and never written", () => {
  const fields = [
    {
      key: "contactId",
      property: "Person",
      idField: "ContactId",
      nameField: "ContactName",
      label: "Firma",
      kind: "contact",
      group: "Nøkkelinfo",
      personsFor: "personId"
    },
    { key: "personId", property: "Person", idField: "PersonId", nameField: "FullName", label: "Kontaktperson", kind: "person", group: "Nøkkelinfo" }
  ];
  const entity = { Person: { PersonId: 1001, FullName: "Anne Berg", ContactId: 500, ContactName: "Agimba" } };
  assert.deepEqual(readValues(entity, fields), { contactId: 500, personId: 1001 });
  assert.deepEqual(readNames(entity, fields), { contactId: { id: 500, name: "Agimba" }, personId: { id: 1001, name: "Anne Berg" } });
  writeValues(entity, { contactId: 600, personId: 1012 }, fields);
  assert.deepEqual(entity.Person, { PersonId: 1012 });
});

test("a person's consents are read by purpose, and never written", () => {
  const fields = [
    { key: "consent:EMARKET", consentPurpose: "EMARKET", readOnly: true, label: "E-markedsføring", kind: "text", group: "Personvern" },
    { key: "consent:STORE", consentPurpose: "STORE", readOnly: true, label: "Salg og kundeservice", kind: "text", group: "Personvern" }
  ];
  const entity = { Consents: [{ ConsentPurposeKey: "STORE", LegalBaseId: 6, LegalBaseName: "Legitimate interest" }] };
  assert.deepEqual(readValues(entity, fields), { "consent:EMARKET": null, "consent:STORE": 6 });
  const emarketing = { Consents: [{ ConsentPurposeKey: "EMARKETING", LegalBaseId: 1 }] };
  assert.equal(readValues(emarketing, fields)["consent:EMARKET"], 1);
  writeValues(entity, { "consent:STORE": 1 }, fields);
  assert.deepEqual(entity.Consents, [{ ConsentPurposeKey: "STORE", LegalBaseId: 6, LegalBaseName: "Legitimate interest" }]);
});

test("an inverted checkbox is on when its property is false", () => {
  const fields = [{ key: "emarketing", property: "NoMailing", inverted: true, label: "E-markedsføring", kind: "checkbox", group: "Personvern" }];
  assert.deepEqual(readValues({ NoMailing: false }, fields), { emarketing: 1 });
  assert.deepEqual(readValues({ NoMailing: true }, fields), { emarketing: 0 });
  const entity = { NoMailing: true };
  writeValues(entity, { emarketing: 1 }, fields);
  assert.equal(entity.NoMailing, false);
});
