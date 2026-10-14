<template>
  <el-alert v-if="error" type="error" :title="error" :description="errorDetail" :closable="false" />
  <div v-loading="loading" class="panel">
    <template v-if="snapshot">
      <header class="entity-header">
        <div class="header-bar">
          <EntityWorklist
            ref="worklist"
            :entity="config.name"
            :config="config.worklist"
            :data-source="dataSource"
            :active-id="activeId"
            :context-id="contextId"
            :active-label="snapshot.title"
            :before-change="confirmLeave"
            @select="switchRecord"
          />
          <span v-if="demo" class="pill pill-demo" title="Demo med testdata"
            ><PhFlask :size="12" weight="bold" /><span class="pill-text">Demo</span></span
          >
          <span v-else-if="IN_DEV_MODE" class="pill pill-connected" :title="`Koblet til ${tenantName}`">
            <PhPlugsConnected :size="12" weight="bold" /><span class="pill-text">{{ tenantName }}</span>
          </span>
          <span v-if="readOnly" class="pill pill-readonly" title="Lesemodus - ingenting lagres"
            ><PhLock :size="12" weight="bold" /><span class="pill-text">Lesemodus</span></span
          >
          <el-button size="small" circle title="Tilpass felter" aria-label="Tilpass felter" @click="layoutOpen = true">
            <PhGearSix :size="14" weight="bold" />
          </el-button>
          <el-button size="small" circle title="Last inn på nytt" aria-label="Last inn på nytt" :disabled="posting" @click="reload">
            <PhArrowsClockwise :size="14" weight="bold" />
          </el-button>
        </div>
      </header>

      <section class="field-card">
        <div class="field-grid field-grid-header">
          <span class="cell-label">Felt</span>
          <span class="cell-current">Nåværende verdi</span>
          <span class="center cell-switch">Oppdater</span>
          <span class="cell-editor">Ny verdi</span>
        </div>

        <template v-for="group in groups" :key="group.name">
          <button type="button" class="group-row" @click="toggleGroup(group.name)">
            <PhCaretDown :size="14" weight="bold" class="group-caret" :class="{ collapsed: collapsedGroups.has(group.name) }" />
            <span class="group-name">{{ group.name }}</span>
            <span class="group-count">{{ group.rows.length }} felt</span>
            <span class="group-badges">
              <span v-if="group.missing > 0" class="group-missing">{{ group.missing }} mangler</span>
              <span v-if="group.changed > 0" class="group-changed">{{ group.changed }} endret</span>
            </span>
          </button>

          <template v-if="!collapsedGroups.has(group.name)">
            <div
              v-for="row in group.rows"
              :key="row.definition.key"
              class="field-grid field-row"
              :class="{
                changed: row.shouldUpdate,
                missing: isMissing(row),
                attention: isMissing(row) && attentionPulse,
                longtext: row.definition.kind === 'longtext'
              }"
            >
              <span class="field-label cell-label">
                {{ row.definition.label }}
              </span>
              <span class="field-current cell-current" :class="{ strong: row.definition.kind === 'amount' }">
                <span v-if="isMissing(row)" class="missing-tag" title="Må fylles ut før du kan lagre">
                  <PhWarningCircle :size="12" weight="bold" /> Mangler
                </span>
                <template v-else>{{ formatValue(row, row.current) }}</template>
              </span>
              <span class="center cell-switch">
                <el-switch
                  :model-value="row.shouldUpdate"
                  :disabled="!row.shouldUpdate && row.next === row.current"
                  @change="(on: string | number | boolean) => onToggle(row, Boolean(on))"
                />
              </span>
              <FieldEditor
                class="cell-editor"
                :model-value="row.next"
                :kind="row.definition.kind"
                :options="optionsFor(row)"
                @update:model-value="(value: FieldValue | undefined) => onEdit(row, value ?? null)"
              />
            </div>
          </template>
        </template>
      </section>

      <footer class="summary">
        <el-alert v-if="saveBlocked && missingText" type="error" :title="missingText" show-icon class="summary-alert" @close="saveBlocked = false" />

        <div v-if="showChanges && changedRows.length > 0" class="change-list">
          <div v-for="row in changedRows" :key="row.definition.key" class="change-line">
            <span class="change-label">{{ row.definition.label }}</span>
            <span class="change-values">
              <span class="change-from">{{ formatValue(row, row.current) }}</span>
              <PhArrowRight :size="13" weight="bold" class="change-arrow" />
              <span class="change-to">{{ formatValue(row, row.next) }}</span>
            </span>
          </div>
        </div>

        <div class="summary-bar">
          <div class="summary-text">
            <span class="summary-line">
              <span class="summary-count">{{ changeCountText }}</span>
              <button v-if="changedRows.length > 0" type="button" class="changes-toggle" @click="showChanges = !showChanges">
                · {{ showChanges ? "Skjul" : "Vis endringer" }}
                <PhCaretDown :size="11" weight="bold" class="changes-caret" :class="{ open: showChanges }" />
              </button>
            </span>
            <span v-if="readOnly" class="summary-hint">Lagring er skrudd av i lesemodus</span>
          </div>
          <el-button round title="Avbryt" aria-label="Avbryt" :disabled="changedRows.length === 0 || posting" @click="reset">
            <PhArrowCounterClockwise :size="14" weight="bold" /><span class="button-text">&nbsp;Avbryt</span>
          </el-button>
          <el-button type="primary" round :disabled="readOnly || changedRows.length === 0 || posting" :loading="posting" @click="save()">
            <PhCheck v-if="!posting" :size="14" weight="bold" />&nbsp;Oppdater {{ config.noun.definite }}
          </el-button>
          <el-button
            v-if="worklist?.hasNext"
            type="primary"
            plain
            round
            title="Lagre og gå til neste i listen"
            aria-label="Lagre og gå til neste"
            :disabled="readOnly || changedRows.length === 0 || posting"
            @click="save('next')"
          >
            <span class="button-text">Lagre og neste&nbsp;</span><PhArrowRight :size="14" weight="bold" />
          </el-button>
        </div>
      </footer>

      <FieldLayoutDrawer
        v-model="layoutOpen"
        :definitions="allDefinitions"
        :layouts="layouts"
        :can-edit-standard="canEditStandard"
        :entity-definite="capitalize(config.noun.definite)"
        :saving="savingLayout"
        @save="saveLayout"
      />
    </template>
  </div>
</template>

<script lang="ts" setup>
  import { computed, nextTick, onMounted, ref, type ComputedRef, type Ref } from "vue";
  import { ElMessage, ElMessageBox } from "element-plus";
  import {
    PhArrowCounterClockwise,
    PhArrowRight,
    PhArrowsClockwise,
    PhCaretDown,
    PhCheck,
    PhFlask,
    PhGearSix,
    PhLock,
    PhPlugsConnected,
    PhWarningCircle
  } from "@phosphor-icons/vue";
  import EntityWorklist from "@/components/EntityWorklist.vue";
  import FieldEditor from "@/components/FieldEditor.vue";
  import FieldLayoutDrawer from "@/components/FieldLayoutDrawer.vue";
  import { EntityAgent } from "@/agents/EntityAgent";
  import { DemoEntityAgent } from "@/agents/DemoEntityAgent";
  import { EntityChangedError } from "@/agents/EntityChangedError";
  import { ENTITIES, ENTITY_DEMOS } from "@/config/entities";
  import { applyLayout, completeLayout, withStandardMinimum } from "@/config/fieldLayout";
  import { optionListKey } from "@/config/entityValues";
  import { jumpTo, refreshSuperOffice } from "@/services/so-cross-messaging";
  import { cardIsBusy, readCardState } from "@/services/superOfficeCard";
  import { IN_DEV_MODE, SUPEROFFICE_URL } from "@/superoffice-config/superoffice-config";
  import { DEV_SUPEROFFICE_URL } from "@/superoffice-config/superoffice-url";
  import type { FieldLayouts, FieldValue, LayoutLevel, ListItem, SavedLayout } from "@/types/Fields";
  import type { EntityDataSource, EntityFieldDefinition, EntityName, EntitySnapshot, EntityValues } from "@/types/EntityQuickUpdate";

  type FieldRow = { definition: EntityFieldDefinition; current: FieldValue; next: FieldValue; shouldUpdate: boolean };
  type FieldGroup = { name: string; rows: FieldRow[]; changed: number; missing: number };

  const props = defineProps<{ entity: EntityName; id: string; demo?: boolean }>();

  const config = ENTITIES[props.entity];
  const dataSource: EntityDataSource = props.demo ? new DemoEntityAgent(props.entity, ENTITY_DEMOS[props.entity]) : new EntityAgent(config);

  /** Saving to SuperOffice stays off until VITE_ALLOW_SAVE=true is set. Demo data can always be saved. */
  const readOnly: boolean = !props.demo && import.meta.env.VITE_ALLOW_SAVE !== "true";

  /** Which tenant the panel talks to, e.g. "Cust30460", shown in the header so it is never in doubt. */
  const tenantName: string = (IN_DEV_MODE ? DEV_SUPEROFFICE_URL : SUPEROFFICE_URL).match(/Cust\d+/)?.[0] ?? "";

  const loading: Ref<boolean> = ref(true);
  const posting: Ref<boolean> = ref(false);
  const error: Ref<string> = ref("");
  /** Technical detail shown under the error, so problems can be diagnosed from a screenshot. */
  const errorDetail: Ref<string> = ref("");

  /** The record SuperOffice has open on the card (from the URL, then wherever the panel moved it), and the one shown in the panel. */
  const contextId: Ref<number> = ref(Number(props.id));
  const activeId: Ref<number> = ref(contextId.value);

  const snapshot: Ref<EntitySnapshot | null> = ref(null);
  const options: Ref<Record<string, ListItem[]> | null> = ref(null);
  const rows: Ref<FieldRow[]> = ref([]);
  const collapsedGroups: Ref<Set<string>> = ref(new Set());

  const udefDefinitions: Ref<EntityFieldDefinition[]> = ref([]);
  const layouts: Ref<FieldLayouts> = ref({ standard: null, personal: null });
  const canEditStandard: Ref<boolean> = ref(false);
  const layoutOpen: Ref<boolean> = ref(false);
  const savingLayout: Ref<boolean> = ref(false);
  /** The record picker - it knows the list being worked through, for "Lagre og neste". */
  const worklist = ref<InstanceType<typeof EntityWorklist> | null>(null);
  /** The from → to list under the summary. Closed by default so it does not crowd a short side panel. */
  const showChanges: Ref<boolean> = ref(false);

  /** Every field the panel can show: the built-in ones and the entity's user-defined fields. */
  const allDefinitions: ComputedRef<EntityFieldDefinition[]> = computed(() => [...config.fields, ...udefDefinitions.value]);

  /**
   * The fields shown: the user's own layout, else the standard, else the built-in one. The standard is a
   * minimum for the user's own layout, also for one saved before the standard was changed.
   */
  const visibleDefinitions: ComputedRef<EntityFieldDefinition[]> = computed(() => {
    const { personal, standard } = layouts.value;
    if (!personal) return applyLayout(allDefinitions.value, standard?.fields ?? null);
    const own = completeLayout(allDefinitions.value, personal.fields);
    return applyLayout(allDefinitions.value, withStandardMinimum(own, completeLayout(allDefinitions.value, standard?.fields ?? null)));
  });

  const changedRows: ComputedRef<FieldRow[]> = computed(() => rows.value.filter((row) => row.shouldUpdate));

  /** Rows grouped in the order the groups first appear. */
  const groups: ComputedRef<FieldGroup[]> = computed(() => {
    const byName = new Map<string, FieldGroup>();
    for (const row of rows.value) {
      const group = byName.get(row.definition.group) ?? { name: row.definition.group, rows: [], changed: 0, missing: 0 };
      group.rows.push(row);
      if (row.shouldUpdate) group.changed++;
      if (isMissing(row)) group.missing++;
      byName.set(group.name, group);
    }
    return [...byName.values()];
  });

  const missingRows: ComputedRef<FieldRow[]> = computed(() => rows.value.filter(isMissing));

  /** Important fields must have a value before the record can be saved - this says which. */
  const missingText: ComputedRef<string> = computed(() => {
    const labels = missingRows.value.map((row) => row.definition.label);
    if (labels.length === 0) return "";
    if (labels.length <= 3) return `Ikke lagret – fyll ut: ${labels.join(", ")}`;
    return `Ikke lagret – fyll ut ${labels.length} felt`;
  });

  /** Set when a save was stopped by missing fields; the message then shows until they are filled in. */
  const saveBlocked: Ref<boolean> = ref(false);
  const attentionPulse: Ref<boolean> = ref(false);

  const changeCountText: ComputedRef<string> = computed(() => {
    const count = changedRows.value.length;
    if (count === 0) return "Ingen endringer";
    return count === 1 ? "1 endring" : `${count} endringer`;
  });

  onMounted(async () => {
    try {
      await Promise.all([load(), loadFieldSettings()]);
      // The record may arrive before the layout - build the rows again with the layout in place.
      if (snapshot.value) rows.value = buildRows(snapshot.value);
    } catch (e) {
      error.value = "Noe gikk galt. Vennligst kontakt systemadministrator om det gjentar seg.";
      errorDetail.value = `Detaljer: ${e instanceof Error ? e.message : String(e)} (${config.noun.indefinite} nr: "${activeId.value}", fra URL: "${props.id}")`;
      console.error(e);
    } finally {
      loading.value = false;
    }
  });

  async function load() {
    const id = activeId.value;
    if (!id || id <= 0) throw new Error(`Fant ikke noe gyldig nummer for ${config.noun.indefinite} i URL-en.`);

    // The lists are the same for every record, so they are fetched once.
    const [loaded, lists] = await Promise.all([dataSource.Get(id), options.value ?? dataSource.GetOptions()]);
    snapshot.value = loaded;
    options.value = lists;
    rows.value = buildRows(loaded);
  }

  async function reload() {
    loading.value = true;
    try {
      await load();
    } catch (e) {
      ElMessage.error(`Kunne ikke laste ${config.noun.definite} på nytt.`);
      console.error(e);
    } finally {
      loading.value = false;
    }
  }

  function buildRows(loaded: EntitySnapshot): FieldRow[] {
    return visibleDefinitions.value.map((definition) => ({
      definition,
      current: loaded.values[definition.key] ?? null,
      next: loaded.values[definition.key] ?? null,
      shouldUpdate: false
    }));
  }

  /** The layout's fields after a layout change, keeping changes already made in fields that stay. */
  function rebuildRows(loaded: EntitySnapshot): FieldRow[] {
    const existing = new Map(rows.value.map((row) => [row.definition.key, row]));
    return buildRows(loaded).map((row) => {
      const kept = existing.get(row.definition.key);
      return kept ? { ...kept, definition: row.definition } : row;
    });
  }

  /** Field settings: the user-defined fields, both layouts and whether this user may change the standard. */
  async function loadFieldSettings() {
    const [udefs, savedLayouts, mayEditStandard] = await Promise.all([
      dataSource.GetCustomFieldDefinitions().catch((e) => {
        console.error("Could not fetch user-defined and extra fields:", e);
        return [] as EntityFieldDefinition[];
      }),
      dataSource.GetFieldLayouts().catch((e) => {
        console.error("Could not fetch field layouts:", e);
        ElMessage.warning("Kunne ikke hente feltoppsettet - viser innebygd oppsett.");
        return { standard: null, personal: null } as FieldLayouts;
      }),
      dataSource.CanEditStandardLayout().catch(() => false)
    ]);
    udefDefinitions.value = udefs;
    layouts.value = savedLayouts;
    canEditStandard.value = mayEditStandard;
  }

  async function saveLayout(level: LayoutLevel, layout: SavedLayout | null) {
    savingLayout.value = true;
    try {
      // Only sales show the next activity, so no setting for it is kept here.
      await dataSource.SaveFieldLayout(level, layout ? { ...layout, activityDisplay: null } : null);
    } catch (e) {
      ElMessage.error("Kunne ikke lagre feltoppsettet.");
      console.error(e);
      savingLayout.value = false;
      return;
    }
    try {
      // Read back what SuperOffice now holds, so the panel shows what was really saved.
      layouts.value = await dataSource.GetFieldLayouts();
      if (snapshot.value) rows.value = rebuildRows(snapshot.value);
      layoutOpen.value = false;
      if (level === "standard" && layouts.value.personal) {
        // Easy to miss: the user's own layout still wins over the standard they just saved.
        ElMessage({ type: "warning", message: "Lagret for alle. Du ser fortsatt ditt eget oppsett.", duration: 6000, showClose: true });
      } else {
        ElMessage.success(level === "standard" ? "Standardoppsettet er lagret for alle" : "Feltoppsettet ditt er lagret");
      }
    } catch (e) {
      ElMessage.warning("Lagret, men kunne ikke lese oppsettet tilbake. Lukk og åpne panelet.");
      console.error(e);
    } finally {
      savingLayout.value = false;
    }
  }

  /** An important field with no value (an amount of 0 counts as no value) - after the change, if one is pending. */
  function isMissing(row: FieldRow): boolean {
    if (!row.definition.important) return false;
    const value = row.shouldUpdate ? row.next : row.current;
    if (row.definition.kind === "amount") return !Number(value);
    return value === null || value === "";
  }

  function optionsFor(row: FieldRow): ListItem[] {
    if (row.definition.choices) return row.definition.choices;
    const key = optionListKey(row.definition);
    return key ? (options.value?.[key] ?? []) : [];
  }

  /** A new value switches the row on automatically - unless it is set back to the current value. */
  function onEdit(row: FieldRow, value: FieldValue) {
    row.next = value;
    row.shouldUpdate = value !== row.current;
  }

  /** Switching a row off means "keep the current value", so the new value is reset. */
  function onToggle(row: FieldRow, on: boolean) {
    if (on) {
      row.shouldUpdate = true;
      return;
    }
    row.next = row.current;
    row.shouldUpdate = false;
  }

  /** Opens the group of the first field that is missing a value and scrolls it into view. */
  async function scrollToMissing() {
    const first = missingRows.value[0];
    if (!first) return;
    if (collapsedGroups.value.has(first.definition.group)) toggleGroup(first.definition.group);
    await nextTick();
    document.querySelector(".field-row.missing")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function toggleGroup(name: string) {
    const next = new Set(collapsedGroups.value);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    collapsedGroups.value = next;
  }

  /** Asks before unsaved changes are thrown away by switching record. */
  async function confirmLeave(): Promise<boolean> {
    const count = changedRows.value.length;
    if (count === 0) return true;
    try {
      await ElMessageBox.confirm(
        count === 1 ? "Du har 1 endring som ikke er lagret." : `Du har ${count} endringer som ikke er lagret.`,
        `Bytte ${config.noun.indefinite}?`,
        { confirmButtonText: "Forkast og bytt", cancelButtonText: "Bli her", type: "warning" }
      );
      return true;
    } catch {
      return false;
    }
  }

  /** Shows another record in the panel, and moves the SuperOffice card along so both show the same one. */
  async function switchRecord(id: number) {
    activeId.value = id;
    if (!props.demo && id !== contextId.value) openCard(id);
    await reload();
  }

  function reset() {
    if (snapshot.value) rows.value = buildRows(snapshot.value);
  }

  /** Saves; returns true when the record was saved. "next" moves on to the next record in the list afterwards. */
  async function save(after: "stay" | "next" = "stay"): Promise<boolean> {
    if (!snapshot.value) return false;
    // The card shows this record with unsaved changes of its own: saving here would cross them.
    if (!props.demo && snapshot.value.id === contextId.value && readCardState().editing) {
      ElMessage.warning(`${capitalize(config.noun.definite)} har ulagrede endringer i SuperOffice. Lagre eller avbryt dem der først.`);
      return false;
    }
    // Important fields without a value stop the save: say which, and show where they are.
    if (missingText.value) {
      saveBlocked.value = true;
      scrollToMissing();
      attentionPulse.value = false;
      await nextTick();
      attentionPulse.value = true;
      setTimeout(() => (attentionPulse.value = false), 1600);
      return false;
    }
    saveBlocked.value = false;
    posting.value = true;

    const id = snapshot.value.id;
    const changes: EntityValues = Object.fromEntries(changedRows.value.map((row) => [row.definition.key, row.next]));
    const definitions = changedRows.value.map((row) => row.definition);

    try {
      try {
        await dataSource.Update(id, changes, definitions, snapshot.value.updatedAt);
      } catch (e) {
        if (!(e instanceof EntityChangedError)) throw e;
        // Someone saved the record after it was opened here - let the user decide.
        const choice = await askAboutChangedRecord(e);
        if (choice === "reload") await reload();
        if (choice !== "overwrite") {
          posting.value = false;
          return false;
        }
        await dataSource.Update(id, changes, definitions);
      }
    } catch (e) {
      ElMessage.error(`Kunne ikke lagre ${config.noun.definite}. Sjekk at du har tilgang til å endre det.`);
      console.error(e);
      posting.value = false;
      return false;
    }

    ElMessage.success(`${capitalize(config.noun.definite)} er oppdatert`);
    posting.value = false;
    if (after === "next" && worklist.value?.hasNext) {
      // The changes are saved, so moving on must not ask about unsaved changes.
      reset();
      worklist.value.goNext();
      return true;
    }
    if (!props.demo) showSavedOnCard(id);
    await reload();
    return true;
  }

  /**
   * Makes the SuperOffice card show the saved values. The card already showing this record is reloaded,
   * like pressing F5 - opening it again through SoProtocol does not reload a ticket card. Any other record
   * is opened on the card. Failures are only logged: the save has already succeeded.
   */
  function showSavedOnCard(id: number) {
    if (id !== contextId.value) {
      openCard(id);
      return;
    }
    if (cardIsBusy()) {
      ElMessage.info("Kortet er ikke lastet på nytt, fordi noe er under arbeid der. Trykk Oppdater i SuperOffice når du er klar.");
      return;
    }
    try {
      refreshSuperOffice();
    } catch (e) {
      console.warn("Could not refresh the card:", e);
    }
  }

  /**
   * The save found the record saved by someone else since it was opened. Saving anyway keeps their
   * changes in every field except the ones changed here.
   */
  async function askAboutChangedRecord(e: EntityChangedError): Promise<"overwrite" | "reload" | "keep"> {
    const who = e.updatedBy || "Noen andre";
    const when = e.updatedAt ? " kl. " + new Date(e.updatedAt).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" }) : "";
    try {
      await ElMessageBox.confirm(
        `${who} har lagret ${config.noun.definite}${when} etter at du åpnet det. Lagrer du likevel, beholdes endringene deres – bortsett fra i feltene du selv har endret.`,
        `${capitalize(config.noun.definite)} er endret`,
        { confirmButtonText: "Lagre likevel", cancelButtonText: "Last inn på nytt", distinguishCancelAndClose: true, type: "warning" }
      );
      return "overwrite";
    } catch (action) {
      return action === "cancel" ? "reload" : "keep";
    }
  }

  /**
   * Opens a record on its SuperOffice card through SoProtocol.
   * Failures are only logged: a save has already succeeded when this runs after saving.
   */
  function openCard(id: number) {
    // Moving the card on would throw away what is being written or changed there; the panel moves on alone.
    if (cardIsBusy()) {
      ElMessage.info("Kortet i SuperOffice er ikke flyttet, fordi noe er under arbeid der.");
      return;
    }
    try {
      jumpTo(config.cardProtocol(id));
      contextId.value = id;
    } catch (e) {
      console.warn("Could not open the card:", e);
    }
  }

  function formatNumber(value: FieldValue): string {
    return Number(value ?? 0).toLocaleString("nb-NO", { maximumFractionDigits: 2 });
  }

  function formatValue(row: FieldRow, value: FieldValue): string {
    if (value === null || value === "") return "-";

    switch (row.definition.kind) {
      case "amount":
      case "number":
        return formatNumber(value);
      case "checkbox":
        return Number(value) === 1 ? "Ja" : "Nei";
      case "percent":
        return `${value} %`;
      case "date":
        return new Date(String(value)).toLocaleDateString("nb-NO", { day: "2-digit", month: "2-digit", year: "numeric" });
      case "select":
        return optionsFor(row).find((item) => item.id === value)?.name ?? "-";
      case "longtext":
        // One line in the table and the summary - the whole text is in the field itself.
        return String(value).replace(/\s+/g, " ").trim();
      default:
        return String(value);
    }
  }

  function capitalize(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
</script>

<style scoped>
  .panel {
    --accent: var(--el-color-primary);
    --accent-soft: #e8f2ef;
    --line: #ececec;
    --group-bg: #f4f5f3;
    --text: rgb(61, 61, 61);
    --muted: #7a7a7a;

    container-type: inline-size;
    container-name: entity-panel;

    min-height: 100vh;
    padding: 6px;
    box-sizing: border-box;
    background: #f5f5f5;
    color: var(--text);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  /* ---------- Header ---------- */
  .entity-header {
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 6px 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  }

  .header-bar {
    display: flex;
    align-items: flex-start;
    gap: 6px;
  }

  .pill {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    padding: 1px 7px;
    border-radius: 12px;
    border: 1px solid transparent;
  }
  .pill-connected {
    color: var(--accent);
    background: var(--accent-soft);
    border-color: #c8e0d9;
  }
  .pill-demo {
    color: #a65a00;
    background: #fff4e5;
    border-color: #f3d9b5;
  }
  .pill-readonly {
    color: #555;
    background: #f1f1f1;
    border-color: #e1e1e1;
  }

  /* ---------- Field table ---------- */
  .field-card {
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 10px;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  }

  .field-grid {
    display: grid;
    grid-template-columns: 104px minmax(0, 1fr) 64px minmax(150px, 1.25fr);
    grid-template-areas: "label current switch editor";
    align-items: center;
    column-gap: 10px;
    padding: 0 12px;
  }

  .cell-label {
    grid-area: label;
  }
  .cell-current {
    grid-area: current;
  }
  .cell-switch {
    grid-area: switch;
  }
  .cell-editor {
    grid-area: editor;
  }

  /* Long text (the description) takes the full width under its label. */
  .field-row.longtext {
    grid-template-areas:
      "label current switch switch"
      "editor editor editor editor";
    row-gap: 6px;
    padding-top: 6px;
    padding-bottom: 8px;
  }

  /*
   * A narrow side panel: the current value moves under the field name, so the new value gets the
   * room. Measured on the panel itself, so it follows the side panel's width, not the screen's.
   */
  @container entity-panel (max-width: 560px) {
    /* The badges keep only their icon (the full text is in the tooltip). */
    .pill-text {
      display: none;
    }

    .pill {
      padding: 3px 5px;
    }

    /* Avbryt keeps only its icon, so the buttons stay on the line with the summary. */
    .button-text {
      display: none;
    }

    .summary-bar :deep(.el-button + .el-button) {
      margin-left: 0;
    }

    .change-line {
      grid-template-columns: 84px minmax(0, 1fr);
    }

    .field-grid-header {
      font-size: 11px;
    }

    .field-grid {
      grid-template-columns: minmax(0, 1fr) 56px minmax(0, 1.3fr);
      grid-template-areas:
        "label switch editor"
        "current switch editor";
      column-gap: 8px;
    }

    .field-grid-header {
      grid-template-areas: "label switch editor";
    }

    .field-row.longtext {
      grid-template-areas:
        "label switch switch"
        "current current current"
        "editor editor editor";
    }

    .field-grid-header .cell-current {
      display: none;
    }

    .field-row {
      padding-top: 5px;
      padding-bottom: 5px;
    }

    .field-row .cell-current {
      font-size: 11px;
      color: var(--muted);
    }

    .field-row .cell-current.strong {
      font-weight: 700;
    }
  }

  .field-grid-header {
    padding-top: 7px;
    padding-bottom: 7px;
    font-size: 12px;
    font-weight: 700;
    color: var(--text);
    border-bottom: 2px solid var(--line);
  }

  .center {
    text-align: center;
  }

  .group-row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    border: 0;
    border-bottom: 1px solid var(--line);
    background: var(--group-bg);
    font: inherit;
    color: var(--text);
    cursor: pointer;
    text-align: left;
  }
  .group-row:hover {
    background: #eceeeb;
  }

  .group-caret {
    color: var(--muted);
    transition: transform 0.15s ease;
  }
  .group-caret.collapsed {
    transform: rotate(-90deg);
  }

  .group-name {
    font-size: 13px;
    font-weight: 700;
  }

  .group-count {
    font-size: 12px;
    color: var(--muted);
  }

  .group-changed {
    font-size: 11px;
    font-weight: 700;
    color: #fff;
    background: var(--accent);
    padding: 1px 8px;
    border-radius: 10px;
  }

  .field-row {
    min-height: 38px;
    border-bottom: 1px solid var(--line);
    border-left: 3px solid transparent;
    padding-left: 9px;
    transition: background 0.15s ease;
  }
  .field-row:hover {
    background: #fafbfa;
  }
  .field-row.changed {
    background: var(--accent-soft);
    border-left-color: var(--accent);
  }

  .field-label {
    font-size: 13px;
    color: var(--muted);
  }
  .field-hint {
    display: block;
    font-size: 11px;
    color: var(--muted);
    font-weight: 400;
  }

  .field-row.missing {
    background: #fdf1f0;
    border-left-color: #d64541;
  }
  .field-row.missing .field-label {
    color: #b42a27;
    font-weight: 700;
  }

  .field-row.attention {
    animation: missing-pulse 0.8s ease-in-out 2;
  }

  @keyframes missing-pulse {
    50% {
      background: #f9d3d1;
    }
  }

  .missing-tag {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 11px;
    font-weight: 700;
    color: #b42a27;
    background: #fde5e4;
    padding: 1px 7px;
    border-radius: 10px;
  }

  .group-badges {
    margin-left: auto;
    display: flex;
    gap: 4px;
  }

  .group-missing {
    font-size: 11px;
    font-weight: 700;
    color: #fff;
    background: #d64541;
    padding: 1px 8px;
    border-radius: 10px;
  }

  .summary-missing {
    color: #b42a27;
    font-weight: 700;
  }

  .field-row.changed .field-label {
    color: var(--accent);
    font-weight: 700;
  }

  .field-current {
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .field-current.strong {
    font-weight: 700;
  }

  /* ---------- Summary ---------- */
  .summary {
    position: sticky;
    z-index: 10;
    bottom: 0;
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 8px 10px;
    box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.06);
  }

  .summary-alert {
    margin-bottom: 10px;
  }

  /* Capped, so a long list scrolls inside the summary instead of covering the fields. */
  .change-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 120px;
    overflow-y: auto;
    padding-bottom: 6px;
    margin-bottom: 6px;
    border-bottom: 1px solid var(--line);
  }

  .change-line {
    display: grid;
    grid-template-columns: 104px minmax(0, 1fr);
    align-items: center;
    column-gap: 8px;
    font-size: 12px;
  }

  .change-values {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px 6px;
    min-width: 0;
  }

  .change-label {
    color: var(--muted);
  }

  .change-from {
    color: var(--muted);
    text-decoration: line-through;
  }

  .change-arrow {
    color: var(--accent);
  }

  .change-to {
    font-weight: 700;
    color: var(--accent);
  }

  .summary-bar {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .summary-text {
    margin-right: auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }

  .summary-count {
    font-size: 13px;
    font-weight: 700;
  }

  .changes-toggle {
    display: inline-flex;
    margin-left: 4px;
    align-items: center;
    gap: 3px;
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    font-size: 12px;
    color: var(--accent);
    cursor: pointer;
  }
  .changes-toggle:hover {
    text-decoration: underline;
  }

  .changes-caret {
    transition: transform 0.15s ease;
  }
  .changes-caret.open {
    transform: rotate(180deg);
  }

  .summary-hint {
    font-size: 12px;
    color: var(--muted);
  }
</style>
