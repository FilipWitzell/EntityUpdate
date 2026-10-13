import { test } from "node:test";
import assert from "node:assert/strict";
import { applyLayout, completeLayout, decodeLayout, defaultLayout, encodeLayout, withStandardMinimum } from "../src/config/fieldLayout.ts";

const definitions = [
  { key: "heading", label: "Tittel", kind: "text", group: "Salget" },
  { key: "amount", label: "Sum", kind: "amount", group: "Salget", important: true },
  { key: "sourceId", label: "Kilde", kind: "select", group: "Klassifisering", important: true },
  { key: "udef:SuperOffice:3", label: "Koststed", kind: "text", group: "Egendefinerte felt", hiddenByDefault: true }
];

test("encode and decode give back the same layout", () => {
  const layout = [
    { key: "amount", visible: true, important: true },
    { key: "heading", visible: false, important: false },
    { key: "udef:SuperOffice:3", visible: true, important: true }
  ];
  const encoded = encodeLayout({ fields: layout, activityDisplay: null });
  assert.equal(encoded, "amount!,-heading,udef:SuperOffice:3!");
  assert.deepEqual(decodeLayout(encoded), { fields: layout, activityDisplay: null });
});

test("the next activity setting is kept with the layout", () => {
  const layout = { fields: [{ key: "amount", visible: true, important: true }], activityDisplay: "full" };
  const encoded = encodeLayout(layout);
  assert.equal(encoded, "amount!,@activity=full");
  assert.deepEqual(decodeLayout(encoded), layout);
  // An unknown value counts as not chosen, so the standard or the built-in choice applies.
  assert.equal(decodeLayout("amount,@activity=everything")?.activityDisplay, null);
});

test("an empty preference means no layout", () => {
  assert.equal(decodeLayout(""), null);
  assert.equal(decodeLayout("   "), null);
  assert.equal(decodeLayout(null), null);
});

test("the built-in layout follows the definitions", () => {
  assert.deepEqual(defaultLayout(definitions), [
    { key: "heading", visible: true, important: false },
    { key: "amount", visible: true, important: true },
    { key: "sourceId", visible: true, important: true },
    { key: "udef:SuperOffice:3", visible: false, important: false }
  ]);
});

test("a saved layout keeps its order, drops unknown fields and adds new ones by default", () => {
  const saved = decodeLayout("sourceId,amount,udef:Gone:1,heading");
  const keys = completeLayout(definitions, saved?.fields ?? null).map((entry) => entry.key);
  assert.deepEqual(keys, ["sourceId", "amount", "heading", "udef:SuperOffice:3"]);
});

test("applyLayout shows only visible fields, with the layout's choice of important", () => {
  const shown = applyLayout(definitions, decodeLayout("amount,-heading,sourceId!,udef:SuperOffice:3!")?.fields ?? null);
  assert.deepEqual(
    shown.map((definition) => [definition.key, definition.important]),
    [
      ["amount", false],
      ["sourceId", true],
      ["udef:SuperOffice:3", true]
    ]
  );
});

test("the standard is a minimum for the user's own layout", () => {
  const standard = completeLayout(definitions, decodeLayout("heading,amount!,sourceId,-udef:SuperOffice:3")?.fields ?? null);
  const personal = completeLayout(definitions, decodeLayout("sourceId,-heading,amount,udef:SuperOffice:3!")?.fields ?? null);
  assert.deepEqual(withStandardMinimum(personal, standard), [
    // The user's order is kept.
    { key: "sourceId", visible: true, important: false },
    // Shown in the standard: can not be hidden.
    { key: "heading", visible: true, important: false },
    // Important in the standard: stays important.
    { key: "amount", visible: true, important: true },
    // Hidden in the standard: the user may still show it and mark it.
    { key: "udef:SuperOffice:3", visible: true, important: true }
  ]);
});
