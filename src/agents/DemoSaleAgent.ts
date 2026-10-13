import { SALE_STATUSES } from "@/config/saleFields";
import { decodeLayout, encodeLayout } from "@/config/fieldLayout";
import type {
  FieldLayouts,
  LayoutLevel,
  ListItem,
  NextActivity,
  SaleDataSource,
  SaleFieldDefinition,
  SaleListItem,
  SaleOptions,
  SaleSelection,
  SaleSnapshot,
  SaleValues,
  SavedLayout
} from "@/types/SaleQuickUpdate";

/**
 * Demo data for showing the panel without a SuperOffice tenant (route #/demo).
 * Changes are kept in memory until the page is reloaded.
 */
const DEMO_OPTIONS: SaleOptions = {
  stage: [
    { id: 1, name: "Lead", probability: 10 },
    { id: 2, name: "Første møte", probability: 20 },
    { id: 3, name: "Behovsanalyse", probability: 40 },
    { id: 4, name: "Tilbud sendt", probability: 60 },
    { id: 5, name: "Forhandling", probability: 80 },
    { id: 6, name: "Muntlig aksept", probability: 90 }
  ],
  associate: [
    { id: 1, name: "Per Hansen" },
    { id: 2, name: "Kari Nordmann" },
    { id: 3, name: "Ola Nordmann" }
  ],
  saleType: [
    { id: 1, name: "Annet" },
    { id: 2, name: "Ny kunde" },
    { id: 3, name: "Mersalg" },
    { id: 4, name: "Lisens" },
    { id: 5, name: "Konsulenttjenester" }
  ],
  source: [
    { id: 1, name: "Nettside" },
    { id: 2, name: "Messe" },
    { id: 3, name: "Telefon" },
    { id: 4, name: "Anbefaling" },
    { id: 5, name: "Kampanje" }
  ],
  competitor: [
    { id: 1, name: "Konkurrent A" },
    { id: 2, name: "Konkurrent B" },
    { id: 3, name: "Ingen konkurrent" }
  ],
  status: SALE_STATUSES,
  reasonSold: [
    { id: 1, name: "Beste løsning" },
    { id: 2, name: "Beste pris" },
    { id: 3, name: "God relasjon" }
  ],
  reasonLost: [
    { id: 1, name: "Pris" },
    { id: 2, name: "Valgte konkurrent" },
    { id: 3, name: "Ingen budsjett" },
    { id: 4, name: "Feil timing" }
  ],
  // "Lisens" (4) only uses a few stages, so the stage list can be seen to follow the sale type.
  stagesBySaleType: {
    "4": [
      { id: 1, name: "Lead", probability: 10 },
      { id: 4, name: "Tilbud sendt", probability: 70 },
      { id: 6, name: "Muntlig aksept", probability: 95 }
    ]
  },
  reasonStalled: [
    { id: 1, name: "Venter på budsjett" },
    { id: 2, name: "Kunden har satt prosjektet på vent" }
  ]
};

const DEMO_PROJECTS: ListItem[] = [
  { id: 1, name: "Låsbytte Quinu 2026" },
  { id: 2, name: "Sikkerhetsoppgradering hovedkontor" },
  { id: 3, name: "Rammeavtale 2027" },
  { id: 4, name: "Adgangskontroll lager" }
];

/** The demo user is associate 1 (Per Hansen). */
const DEMO_CURRENT_ASSOCIATE_ID = 1;

/** The demo companies and the persons on them, for the contact person picker. */
const DEMO_CONTACT_IDS: Record<string, number> = { Quinu: 1, Topicblab: 2, Agivu: 3 };
const DEMO_PERSONS: Record<number, ListItem[]> = {
  1: [
    { id: 11, name: "Ingrid Berg" },
    { id: 12, name: "Jonas Lie" }
  ],
  2: [{ id: 21, name: "Mari Dahl" }],
  3: [
    { id: 31, name: "Erik Strand" },
    { id: 32, name: "Sofie Moen" }
  ]
};

function demoSale(
  saleId: number,
  heading: string,
  contactName: string,
  values: Partial<SaleSnapshot["values"]>
): SaleSnapshot {
  return {
    saleId,
    heading,
    currency: "NOK",
    contactName,
    project: null,
    contactId: DEMO_CONTACT_IDS[contactName] ?? 0,
    person: null,
    updatedAt: "2026-10-01T08:00:00",
    updatedBy: "Per Hansen",
    values: {
      heading,
      amount: 0,
      stageId: 2,
      probability: 20,
      associateId: DEMO_CURRENT_ASSOCIATE_ID,
      saledate: "2026-10-21",
      saleTypeId: 1,
      sourceId: null,
      competitorId: null,
      status: "Open",
      reasonId: null,
      projectId: null,
      contactId: DEMO_CONTACT_IDS[contactName] ?? null,
      personId: null,
      reopenDate: null,
      earning: 0,
      saleText: "",
      "udef:demo:koststed": null,
      "udef:demo:timer": null,
      ...values
    }
  };
}

const demoSales: SaleSnapshot[] = [
  demoSale(10080, "Ny lås", "Quinu", { amount: 1750 }),
  demoSale(10081, "Adgangskontroll lager", "Quinu", { amount: 48000, stageId: 4, probability: 60, saledate: "2026-11-05" }),
  demoSale(10082, "Serviceavtale 2027", "Topicblab", { amount: 120000, stageId: 3, probability: 40, saledate: "2026-12-01", saleTypeId: 4 }),
  demoSale(10083, "Nøkkelsystem nytt bygg", "Agivu", { amount: 265000, stageId: 5, probability: 80, saledate: "2026-10-30", sourceId: 2 }),
  demoSale(10084, "Kameraovervåking", "Topicblab", { amount: 89000, associateId: 2, stageId: 1, probability: 10, saledate: "2027-01-15" }),
  demoSale(10085, "Rammeavtale låser", "Agivu", { amount: 410000, associateId: 2, stageId: 4, probability: 60, saledate: "2026-11-20" }),
  demoSale(10086, "Oppgradering dørautomatikk", "Quinu", { amount: 37500, associateId: 3, stageId: 2, probability: 20, saledate: "2026-12-12" })
];

const DEMO_SELECTIONS: (SaleSelection & { saleIds: number[] })[] = [
  { id: 1, name: "Salg: Avsluttes denne måneden", saleIds: [10080, 10083, 10086] },
  { id: 2, name: "Salg: Store muligheter", saleIds: [10082, 10083, 10085] }
];

function toSortedList(sales: SaleSnapshot[]): SaleListItem[] {
  return [...sales]
    .sort((a, b) => String(a.values.saledate).localeCompare(String(b.values.saledate)))
    .map((sale) => ({
      saleId: sale.saleId,
      heading: sale.heading,
      contactName: sale.contactName,
      amount: Number(sale.values.amount ?? 0),
      saledate: sale.values.saledate as string | null
    }));
}

/** An ISO date and time some days from today, so overdue demo activities stay overdue. */
function daysFromToday(days: number, time = "09:00:00"): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${time}`;
}

/** One sale of each kind: overdue, on time, none planned, and on the sale date itself. */
const DEMO_NEXT_ACTIVITIES: Record<number, NextActivity | null> = {
  10080: { appointmentId: 1, date: daysFromToday(-3), type: "Telefon ut", text: "Ringe om tilbudet" },
  10081: { appointmentId: 2, date: daysFromToday(4, "13:00:00"), type: "Møte ute", text: "Gjennomgang av løsning" },
  10082: null,
  10083: { appointmentId: 3, date: "2026-10-30T10:00:00", type: "Oppfølging", text: "Følge opp signering" },
  10084: { appointmentId: 4, date: daysFromToday(10), type: "Møte inne", text: "Behovsavklaring" },
  10085: { appointmentId: 5, date: daysFromToday(2, "11:30:00"), type: "Oppfølging", text: "Sende revidert tilbud" },
  10086: { appointmentId: 6, date: daysFromToday(7), type: "Telefon ut", text: "Avklare budsjett" }
};

const DEMO_UDEFS: SaleFieldDefinition[] = [
  { key: "udef:demo:koststed", label: "Koststed", kind: "text", group: "Egendefinerte felt", hiddenByDefault: true, udef: { progId: "demo:koststed" } },
  { key: "udef:demo:timer", label: "Ant. timer", kind: "number", group: "Egendefinerte felt", hiddenByDefault: true, udef: { progId: "demo:timer", numberType: "int" } }
];

function readDemoLayout(level: LayoutLevel): string | null {
  try {
    return localStorage.getItem(`saleUpdate.demoLayout.${level}`);
  } catch {
    return null;
  }
}

/** Simulates a short network delay so loading states are visible in the demo. */
function delay<T>(value: T, ms = 400): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(structuredClone(value)), ms));
}

function findDemoSale(saleId: number): SaleSnapshot {
  const sale = demoSales.find((item) => item.saleId === saleId);
  if (!sale) throw new Error(`Demo sale ${saleId} not found`);
  return sale;
}

export class DemoSaleAgent implements SaleDataSource {
  async GetSale(saleId: number): Promise<SaleSnapshot> {
    return delay(findDemoSale(saleId));
  }

  async GetOptions(): Promise<SaleOptions> {
    return delay(DEMO_OPTIONS);
  }

  async GetUdefDefinitions(): Promise<SaleFieldDefinition[]> {
    return DEMO_UDEFS;
  }

  async GetCurrentAssociateId(): Promise<number> {
    return DEMO_CURRENT_ASSOCIATE_ID;
  }

  /** The demo user is an admin, so both layouts can be tried. "#/demo?admin=0" shows the panel as an ordinary user. */
  async CanEditStandardLayout(): Promise<boolean> {
    return new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("admin") !== "0";
  }

  /** Demo layouts are kept in this browser, standing in for SuperOffice preferences. */
  async GetFieldLayouts(): Promise<FieldLayouts> {
    return { standard: decodeLayout(readDemoLayout("standard")), personal: decodeLayout(readDemoLayout("personal")) };
  }

  async SaveFieldLayout(level: LayoutLevel, layout: SavedLayout | null): Promise<void> {
    try {
      localStorage.setItem(`saleUpdate.demoLayout.${level}`, layout ? encodeLayout(layout) : "");
    } catch {
      // Storage can be blocked - the demo layout then lasts until the page is reloaded.
    }
    await delay(null, 300);
  }

  async GetOpenSales(associateId: number): Promise<SaleListItem[]> {
    return delay(toSortedList(demoSales.filter((sale) => sale.values.associateId === associateId && sale.values.status === "Open")), 250);
  }

  async GetSaleSelections(): Promise<SaleSelection[]> {
    return delay(DEMO_SELECTIONS.map(({ id, name }) => ({ id, name })), 200);
  }

  async GetSelectionSales(selectionId: number): Promise<SaleListItem[]> {
    const saleIds = DEMO_SELECTIONS.find((selection) => selection.id === selectionId)?.saleIds ?? [];
    return delay(toSortedList(demoSales.filter((sale) => saleIds.includes(sale.saleId))), 250);
  }

  async SearchContacts(query: string): Promise<ListItem[]> {
    const lowerQuery = query.toLowerCase();
    const contacts = Object.entries(DEMO_CONTACT_IDS).map(([name, id]) => ({ id, name }));
    return delay(contacts.filter((contact) => contact.name.toLowerCase().includes(lowerQuery)), 150);
  }

  async GetPersons(contactId: number): Promise<ListItem[]> {
    return delay(DEMO_PERSONS[contactId] ?? [], 150);
  }

  async SearchProjects(query: string): Promise<ListItem[]> {
    const lowerQuery = query.toLowerCase();
    return delay(
      DEMO_PROJECTS.filter((project) => project.name.toLowerCase().includes(lowerQuery)),
      200
    );
  }

  async GetNextActivity(saleId: number): Promise<NextActivity | null> {
    return delay(DEMO_NEXT_ACTIVITIES[saleId] ?? null, 300);
  }

  async UpdateSale(saleId: number, changes: SaleValues): Promise<void> {
    const sale = findDemoSale(saleId);
    sale.values = { ...sale.values, ...changes };
    sale.heading = String(sale.values.heading ?? "");
    sale.project = DEMO_PROJECTS.find((project) => project.id === sale.values.projectId) ?? null;
    sale.updatedAt = new Date().toISOString().substring(0, 19);
    await delay(null, 600);
  }
}
