import { CONTACT } from "@/config/entities/contact";
import { CONTACT_DEMO } from "@/config/entities/contactDemo";
import type { EntityDemoData } from "@/agents/DemoEntityAgent";
import type { EntityConfig, EntityName } from "@/types/EntityQuickUpdate";

/** Every entity the generic panel handles. A new entity is a config file here, plus its route. */
export const ENTITIES: Record<EntityName, EntityConfig> = {
  contact: CONTACT
};

export const ENTITY_DEMOS: Record<EntityName, EntityDemoData> = {
  contact: CONTACT_DEMO
};

export function isEntityName(name: string): name is EntityName {
  return Object.hasOwn(ENTITIES, name);
}
