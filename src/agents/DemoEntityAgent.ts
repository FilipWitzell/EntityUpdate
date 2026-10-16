import { decodeLayout, encodeLayout } from "@/config/fieldLayout";
import type { SaveRule } from "@/config/beforeSave";
import type { FieldLayouts, LayoutLevel, ListItem, SavedLayout } from "@/types/Fields";
import type { EntityDataSource, EntityFieldDefinition, EntitySnapshot, EntityValues, WorklistItem } from "@/types/EntityQuickUpdate";

/** Demo data for one entity: the records, the lists their values come from, and the selections. */
export interface EntityDemoData {
  /** The values of each MDO list the fields use, by list name. Must hold "associate". */
  options: Record<string, ListItem[]>;
  currentAssociateId: number;
  records: (EntitySnapshot & { ownerId: number; meta: string })[];
  selections: (ListItem & { recordIds: number[] })[];
  /** The user-defined and extra fields, as SuperOffice would report them. */
  customFields: EntityFieldDefinition[];
  /** The persons on each company, by company id, for the person fields. */
  persons?: Record<number, ListItem[]>;
  /** The companies the persons belong to, for the company picker. */
  contacts?: ListItem[];
  /** Before-save triggers, as the panel would read them from SuperOffice. */
  saveRules?: SaveRule[];
}

/**
 * Demo data for showing a panel without a SuperOffice tenant (routes #/demo/<entity>).
 * Changes are kept in memory until the page is reloaded; layouts in this browser.
 */
export class DemoEntityAgent implements EntityDataSource {
  constructor(
    private entityName: string,
    private data: EntityDemoData
  ) {}

  async Get(id: number): Promise<EntitySnapshot> {
    await pause();
    const record = this.data.records.find((item) => item.id === id);
    if (!record) throw new Error(`Fant ikke ${id} i demodataene.`);
    return structuredClone({ ...record, values: { ...record.values } });
  }

  async GetOptions(): Promise<Record<string, ListItem[]>> {
    return this.data.options;
  }

  async GetCustomFieldDefinitions(): Promise<EntityFieldDefinition[]> {
    return this.data.customFields;
  }

  /** The demo keeps the labels in the configs. */
  async GetFieldLabels(): Promise<Record<string, string>> {
    return {};
  }

  async GetCurrentAssociateId(): Promise<number> {
    return this.data.currentAssociateId;
  }

  async GetAssociates(): Promise<ListItem[]> {
    return this.data.options.associate ?? [];
  }

  /** In the demo, anyone may try the standard layout. */
  async CanEditStandardLayout(): Promise<boolean> {
    return true;
  }

  async GetFieldLayouts(): Promise<FieldLayouts> {
    return { standard: decodeLayout(this.readLayout("standard")), personal: decodeLayout(this.readLayout("personal")) };
  }

  async SaveFieldLayout(level: LayoutLevel, layout: SavedLayout | null): Promise<void> {
    try {
      const key = this.layoutKey(level);
      if (layout) localStorage.setItem(key, encodeLayout(layout));
      else localStorage.removeItem(key);
    } catch {
      // Storage can be blocked - the demo layout then lasts until the page is reloaded.
    }
  }

  async GetOwnedBy(associateId: number): Promise<WorklistItem[]> {
    await pause();
    return this.data.records.filter((record) => record.ownerId === associateId).map(toWorklistItem);
  }

  async GetSelections(): Promise<ListItem[]> {
    return this.data.selections.map(({ id, name }) => ({ id, name }));
  }

  async GetSelectionItems(selectionId: number): Promise<WorklistItem[]> {
    await pause();
    const ids = this.data.selections.find((selection) => selection.id === selectionId)?.recordIds ?? [];
    return ids.flatMap((id) => this.data.records.filter((record) => record.id === id)).map(toWorklistItem);
  }

  async GetPersons(contactId: number): Promise<ListItem[]> {
    await pause();
    return this.data.persons?.[contactId] ?? [];
  }

  async SearchPersons(query: string): Promise<ListItem[]> {
    await pause();
    const lowerQuery = query.toLowerCase();
    return Object.values(this.data.persons ?? {})
      .flat()
      .filter((person) => person.name.toLowerCase().includes(lowerQuery));
  }

  async SearchContacts(query: string): Promise<ListItem[]> {
    await pause();
    const lowerQuery = query.toLowerCase();
    return (this.data.contacts ?? []).filter((contact) => contact.name.toLowerCase().includes(lowerQuery));
  }

  async GetSaveRules(): Promise<SaveRule[]> {
    return this.data.saveRules ?? [];
  }

  async Update(id: number, changes: EntityValues, definitions: EntityFieldDefinition[]): Promise<void> {
    await pause();
    const record = this.data.records.find((item) => item.id === id);
    if (!record) throw new Error(`Fant ikke ${id} i demodataene.`);
    Object.assign(record.values, changes);
    // A new person is named the way SuperOffice would name it, so the panel can show it after the save.
    const persons = Object.values(this.data.persons ?? {}).flat();
    for (const definition of definitions.filter((field) => field.nameField && field.key in changes)) {
      const person = persons.find((item) => item.id === changes[definition.key]);
      record.names = { ...record.names };
      if (person) record.names[definition.key] = person;
      else delete record.names[definition.key];
      // The company follows the person, as on a ticket.
      const company = this.data.contacts?.find((contact) => this.data.persons?.[Number(contact.id)]?.some((item) => item.id === person?.id));
      if (company && "contactId" in record.values) {
        record.contactId = Number(company.id);
        record.values.contactId = company.id;
        record.names.contactId = company;
      }
    }
    record.updatedAt = new Date().toISOString();
  }

  private layoutKey(level: LayoutLevel): string {
    return `entityUpdate.demoLayout.${this.entityName}.${level}`;
  }

  private readLayout(level: LayoutLevel): string | null {
    try {
      return localStorage.getItem(this.layoutKey(level));
    } catch {
      return null;
    }
  }
}

function toWorklistItem(record: { id: number; title: string; meta: string }): WorklistItem {
  return { id: record.id, title: record.title, meta: record.meta };
}

/** A short wait, so loading states can be seen in the demo. */
function pause(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 150));
}
