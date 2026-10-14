import type { EntityDemoData } from "@/agents/DemoEntityAgent";
import type { EntitySnapshot } from "@/types/EntityQuickUpdate";

/** Projects for the demo (#/demo/project). The demo user is associate 1 (Per Hansen). */

function project(id: number, ownerId: number, name: string, projectNumber: string, values: EntitySnapshot["values"]) {
  return {
    id,
    ownerId,
    title: name,
    subtitle: `Prosjekt · ${projectNumber}`,
    meta: projectNumber,
    updatedAt: "2026-10-01T08:00:00",
    updatedBy: "Per Hansen",
    values: { name, projectNumber, associateId: ownerId, projectTypeId: null, projectStatusId: null, description: null, ...values }
  };
}

export const PROJECT_DEMO: EntityDemoData = {
  currentAssociateId: 1,
  options: {
    associate: [
      { id: 1, name: "Per Hansen" },
      { id: 2, name: "Kari Nordmann" },
      { id: 3, name: "Ola Nordmann" }
    ],
    projecttype: [
      { id: 1, name: "Implementering" },
      { id: 2, name: "Integrasjon" },
      { id: 3, name: "Internt" }
    ],
    projectstatus: [
      { id: 1, name: "Planlagt" },
      { id: 2, name: "Pågår" },
      { id: 3, name: "Fullført" }
    ]
  },
  records: [
    project(4001, 1, "SuperOffice for Drammen Elektro", "P-1001", { projectTypeId: 1, projectStatusId: 2 }),
    project(4002, 1, "Visma Net-integrasjon Lier Regnskap", "P-1002", { projectTypeId: 2 }),
    project(4003, 2, "Ny intranettløsning", "P-1003", { projectTypeId: 3, projectStatusId: 1 }),
    project(4004, 1, "Business NXT for Kongsberg IT", "P-1004", { projectTypeId: 2, projectStatusId: 3 })
  ],
  selections: [
    { id: 61, name: "Prosjekter uten status", recordIds: [4002] },
    { id: 62, name: "Integrasjoner", recordIds: [4002, 4004] }
  ],
  customFields: []
};
