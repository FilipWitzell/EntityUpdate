import type { EntityDemoData } from "@/agents/DemoEntityAgent";
import type { EntitySnapshot } from "@/types/EntityQuickUpdate";

/** Persons for the demo (#/demo/person). The demo user is associate 1 (Per Hansen). */

function person(id: number, ownerId: number, firstname: string, lastname: string, company: string, values: EntitySnapshot["values"]) {
  return {
    id,
    ownerId,
    title: `${firstname} ${lastname}`,
    subtitle: `Person · ${company}`,
    meta: company,
    updatedAt: "2026-10-01T08:00:00",
    updatedBy: "Per Hansen",
    values: {
      firstname,
      lastname,
      title: null,
      positionId: null,
      retired: 0,
      emarketing: 1,
      "consent:EMARKET": null,
      "consent:STORE": 6,
      ...values
    }
  };
}

export const PERSON_DEMO: EntityDemoData = {
  currentAssociateId: 1,
  options: {
    associate: [
      { id: 1, name: "Per Hansen" },
      { id: 2, name: "Kari Nordmann" },
      { id: 3, name: "Ola Nordmann" }
    ],
    legalbase: [
      { id: 1, name: "Samtykke" },
      { id: 6, name: "Berettiget interesse" },
      { id: 7, name: "Trukket tilbake" }
    ],
    perspos: [
      { id: 1, name: "Daglig leder" },
      { id: 2, name: "Økonomisjef" },
      { id: 3, name: "IT-ansvarlig" },
      { id: 4, name: "Salgssjef" }
    ]
  },
  records: [
    person(3001, 1, "Anne", "Berg", "Drammen Elektro AS", { title: "CEO", positionId: 1 }),
    person(3002, 1, "Jonas", "Lie", "Lier Regnskap AS", { positionId: 2 }),
    person(3003, 2, "Sara", "Holm", "Buskerud Bygg AS", { title: "Innkjøper" }),
    person(3004, 1, "Erik", "Moen", "Kongsberg IT AS", { positionId: 3 })
  ],
  selections: [
    { id: 51, name: "Personer uten stilling", recordIds: [3003] },
    { id: 52, name: "Nyhetsbrev", recordIds: [3001, 3002, 3004] }
  ],
  customFields: []
};
