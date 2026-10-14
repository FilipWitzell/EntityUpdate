import { CONTACT } from "@/config/entities/contact";
import { CONTACT_DEMO } from "@/config/entities/contactDemo";
import { PERSON } from "@/config/entities/person";
import { PERSON_DEMO } from "@/config/entities/personDemo";
import { PROJECT } from "@/config/entities/project";
import { PROJECT_DEMO } from "@/config/entities/projectDemo";
import { TICKET } from "@/config/entities/ticket";
import { TICKET_DEMO } from "@/config/entities/ticketDemo";
import type { EntityDemoData } from "@/agents/DemoEntityAgent";
import type { EntityConfig, EntityName } from "@/types/EntityQuickUpdate";

/** Every entity the generic panel handles. A new entity is a config file here, plus its route. */
export const ENTITIES: Record<EntityName, EntityConfig> = {
  contact: CONTACT,
  person: PERSON,
  project: PROJECT,
  ticket: TICKET
};

export const ENTITY_DEMOS: Record<EntityName, EntityDemoData> = {
  contact: CONTACT_DEMO,
  person: PERSON_DEMO,
  project: PROJECT_DEMO,
  ticket: TICKET_DEMO
};

export function isEntityName(name: string): name is EntityName {
  return Object.hasOwn(ENTITIES, name);
}
