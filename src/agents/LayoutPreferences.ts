import { restApiDefaultHeaders, type SuperOfficeAgent } from "@/agents/SuperOfficeAgent";
import { decodeLayout, encodeLayout } from "@/config/fieldLayout";
import type { FieldLayouts, LayoutLevel, SavedLayout } from "@/types/Fields";

/** Where a panel keeps its field layouts among the SuperOffice preferences. */
export interface LayoutPreferenceKeys {
  section: string;
  standardKey: string;
  personalKey: string;
}

/**
 * Reads and saves a panel's field layouts. The standard layout is a database-level preference, the
 * user's own an individual one - each on its own key.
 */
export class LayoutPreferences {
  constructor(
    private agent: SuperOfficeAgent,
    private keys: LayoutPreferenceKeys,
    private currentAssociateId: () => Promise<number>
  ) {}

  /**
   * Reading a preference at a given level needs preference administrator rights, so ordinary users
   * read the value that applies to them. With separate keys that value is the one asked for: nobody
   * saves an individual value on the standard's key, and nobody a database value on the user's key.
   */
  async get(): Promise<FieldLayouts> {
    // Read one by one: a layout that can not be read must not take the other one with it.
    const [standard, personal] = await Promise.all([
      this.read(this.keys.standardKey, "Database").catch((e) => {
        console.error("Could not read the standard layout:", e);
        return null;
      }),
      this.read(this.keys.personalKey, "Individual").catch((e) => {
        console.error("Could not read the personal layout:", e);
        return null;
      })
    ]);
    return { standard: decodeLayout(standard), personal: decodeLayout(personal) };
  }

  /**
   * An empty value stands for "no layout": the personal one then falls back to the standard.
   * SavePreferenceEntity needs preference administrator rights, so it is only used for the standard.
   * The user's own layout goes through SavePreferences, which any user may call for themselves.
   */
  async save(level: LayoutLevel, layout: SavedLayout | null): Promise<void> {
    const rawValue = layout ? encodeLayout(layout) : "";
    if (level === "standard") {
      await this.agent.Request({
        method: "POST",
        endpoint: "/api/v1/Agents/Preference/SavePreferenceEntity",
        body: {
          Preference: {
            Level: "Database",
            RawValue: rawValue,
            Specification: { Section: this.keys.section, Key: this.keys.standardKey },
            TargetId: 0
          },
          RemoveLowerLevels: false
        },
        headers: restApiDefaultHeaders()
      });
      return;
    }
    await this.agent.Request({
      method: "POST",
      endpoint: "/api/v1/Agents/Preference/SavePreferences",
      body: {
        Preferences: [
          {
            Level: "Individual",
            RawValue: rawValue,
            Specification: { Section: this.keys.section, Key: this.keys.personalKey },
            TargetId: await this.currentAssociateId()
          }
        ]
      },
      headers: restApiDefaultHeaders()
    });
  }

  /**
   * The value saved on the expected level ("Undefined" = nothing saved). Administrators may ask for the
   * level itself; for everyone else that is refused, and the value that applies to them is read instead.
   */
  private async read(key: string, level: "Database" | "Individual"): Promise<string | null> {
    const read = async (prefLevel?: string) => {
      const response = await this.agent.Request({
        method: "POST",
        endpoint: "/api/v1/Agents/Preference/GetPreferenceByName",
        body: { PrefSection: this.keys.section, PrefKey: key, PrefLevel: prefLevel ?? "Undefined" },
        headers: restApiDefaultHeaders()
      });
      const preference = (await response.json()) as { Level: string; RawValue: string | null };
      return preference.Level === level ? preference.RawValue : null;
    };
    try {
      return await read(level);
    } catch {
      return read();
    }
  }
}
