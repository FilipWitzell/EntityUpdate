<template>
  <el-alert v-if="error" type="error" :title="error" :description="errorDetail" :closable="false" />
  <div v-loading="loading" class="panel">
    <template v-if="sale">
      <header class="sale-header">
        <div class="header-bar">
          <SaleWorklist
            ref="worklist"
            v-if="options"
            :data-source="dataSource"
            :associates="options.associate"
            :active-sale-id="activeSaleId"
            :context-sale-id="contextSaleId"
            :active-sale-label="activeSaleLabel"
            :before-change="confirmLeave"
            @select="switchSale"
          />
          <span v-if="demo" class="pill pill-demo" title="Demo med testdata"><PhFlask :size="12" weight="bold" /><span class="pill-text">Demo</span></span>
          <span v-else-if="IN_DEV_MODE" class="pill pill-connected" :title="`Koblet til ${tenantName}`">
            <PhPlugsConnected :size="12" weight="bold" /><span class="pill-text">{{ tenantName }}</span>
          </span>
          <span v-if="readOnly" class="pill pill-readonly" title="Lesemodus - ingenting lagres"><PhLock :size="12" weight="bold" /><span class="pill-text">Lesemodus</span></span>
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
            <template v-for="row in group.rows" :key="row.definition.key">
              <div
                class="field-grid field-row"
                :class="{ changed: row.shouldUpdate, missing: isMissing(row), attention: isMissing(row) && attentionPulse, longtext: row.definition.kind === 'longtext' }"
              >
                <span class="field-label cell-label">
                  {{ row.definition.label }}
                </span>
                <span class="field-current cell-current" :class="{ strong: row.definition.kind === 'amount' }">
                  <span v-if="isMissing(row)" class="missing-tag" title="Må fylles ut før du kan lagre">
                    <PhWarningCircle :size="12" weight="bold" /> Mangler
                  </span>
                  <template v-else>{{ formatValue(row, row.current, currentStatus) }}</template>
                </span>
                <span class="center cell-switch">
                  <el-switch
                    :model-value="row.shouldUpdate"
                    :disabled="isSwitchDisabled(row)"
                    @change="(on: string | number | boolean) => onToggle(row, Boolean(on))"
                  />
                </span>
                <SaleFieldEditor
                  class="cell-editor"
                  :model-value="row.next"
                  :kind="row.definition.kind"
                  :options="optionsFor(row, effectiveStatus)"
                  :disabled="isDisabled(row)"
                  :search="searchFor(row)"
                  @update:model-value="(value: FieldValue | undefined) => onEdit(row, value ?? null)"
                  @found="(items: ListItem[]) => addSearchResults(row, items)"
                />
              </div>

              <!-- Next activity sits under the sale date: an open sale should have one, before the sale date. -->
              <div v-if="row.definition.key === 'saledate'" class="field-grid field-row activity-row" :class="`activity-${activityCheck.level}`">
                <span class="field-label cell-label">Neste aktivitet</span>
                <span class="field-current cell-current activity-current" :title="activityTitle">
                  <template v-if="nextActivity === undefined">-</template>
                  <template v-else-if="nextActivity">
                    <span class="activity-date">{{ formatDate(nextActivity.date) }}</span>
                    <span v-if="activityDetails" class="activity-text">{{ activityDetails }}</span>
                  </template>
                  <span v-if="activityCheck.label" class="activity-tag">
                    <PhWarningCircle :size="12" weight="bold" /> {{ activityCheck.label }}
                  </span>
                </span>
                <span class="cell-editor activity-action">
                  <el-button size="small" title="Ny aktivitet på salget" aria-label="Ny aktivitet på salget" @click="createActivity">
                    <PhCalendarPlus :size="14" weight="bold" />&nbsp;Ny aktivitet
                  </el-button>
                </span>
              </div>
            </template>
          </template>
        </template>
      </section>

      <footer class="summary">
        <el-alert v-if="missingReason" type="warning" :title="missingReason" :closable="false" show-icon class="summary-alert" />
        <el-alert
          v-if="saveBlocked && missingText"
          type="error"
          :title="missingText"
          show-icon
          class="summary-alert"
          @close="saveBlocked = false"
        />

        <div v-if="showChanges && changedRows.length > 0" class="change-list">
          <div v-for="row in changedRows" :key="row.definition.key" class="change-line">
            <span class="change-label">{{ row.definition.label }}</span>
            <span class="change-values">
              <span class="change-from">{{ formatValue(row, row.current, currentStatus) }}</span>
              <PhArrowRight :size="13" weight="bold" class="change-arrow" />
              <span class="change-to">{{ formatValue(row, row.next, effectiveStatus) }}</span>
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
          <el-button
            type="primary"
            round
            :disabled="readOnly || changedRows.length === 0 || !!missingReason || posting"
            :loading="posting"
            @click="save()"
          >
            <PhCheck v-if="!posting" :size="14" weight="bold" />&nbsp;Oppdater salget
          </el-button>
          <el-button
            v-if="worklist?.hasNext"
            type="primary"
            plain
            round
            title="Lagre og gå til neste salg i listen"
            aria-label="Lagre og gå til neste salg"
            :disabled="readOnly || changedRows.length === 0 || !!missingReason || posting"
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
        :saving="savingLayout"
        @save="saveLayout"
      />
    </template>
  </div>
</template>

<script lang="ts" setup>
  import { computed, nextTick, onMounted, onUnmounted, ref, watch, type ComputedRef, type Ref } from "vue";
  import { ElMessage, ElMessageBox } from "element-plus";
  import {
    PhArrowCounterClockwise,
    PhArrowRight,
    PhArrowsClockwise,
    PhCalendarPlus,
    PhCaretDown,
    PhCheck,
    PhFlask,
    PhGearSix,
    PhLock,
    PhPlugsConnected,
    PhWarningCircle
  } from "@phosphor-icons/vue";
  import SaleWorklist from "@/components/SaleWorklist.vue";
  import SaleFieldEditor from "@/components/SaleFieldEditor.vue";
  import { SaleAgent } from "@/agents/SaleAgent";
  import { DemoSaleAgent } from "@/agents/DemoSaleAgent";
  import { reasonListFor, SALE_FIELDS, SALE_STATUSES, TRAILING_FIELDS } from "@/config/saleFields";
  import { jumpTo } from "@/services/so-cross-messaging";
  import { IN_DEV_MODE, SUPEROFFICE_URL } from "@/superoffice-config/superoffice-config";
  import { DEV_SUPEROFFICE_URL } from "@/superoffice-config/superoffice-url";
  import FieldLayoutDrawer from "@/components/FieldLayoutDrawer.vue";
  import { SaleChangedError } from "@/agents/SaleChangedError";
  import { applyLayout, completeLayout, DEFAULT_ACTIVITY_DISPLAY, withStandardMinimum } from "@/config/fieldLayout";
  import type {
    ActivityDisplay,
    FieldKey,
    FieldLayouts,
    FieldValue,
    LayoutLevel,
    ListItem,
    NextActivity,
    SaleDataSource,
    SaleFieldDefinition,
    SaleFieldRow,
    SaleOptions,
    SaleSnapshot,
    SaleStatus,
    SaleValues,
    SavedLayout
  } from "@/types/SaleQuickUpdate";

  type FieldGroup = { name: string; rows: SaleFieldRow[]; changed: number; missing: number };

  const props = defineProps<{ saleId: string; demo?: boolean }>();

  const dataSource: SaleDataSource = props.demo ? new DemoSaleAgent() : new SaleAgent();

  /** Saving to SuperOffice stays off until VITE_ALLOW_SAVE=true is set. Demo data can always be saved. */
  const readOnly: boolean = !props.demo && import.meta.env.VITE_ALLOW_SAVE !== "true";

  /** Which tenant the panel talks to, e.g. "Cust30460", shown in the header so it is never in doubt. */
  const tenantName: string = (IN_DEV_MODE ? DEV_SUPEROFFICE_URL : SUPEROFFICE_URL).match(/Cust\d+/)?.[0] ?? "";

  const loading: Ref<boolean> = ref(true);
  const posting: Ref<boolean> = ref(false);
  const error: Ref<string> = ref("");
  /** Technical detail shown under the error, so problems can be diagnosed from a screenshot. */
  const errorDetail: Ref<string> = ref("");

  /** The sale SuperOffice has open on the sale card (from the URL, then wherever the panel moved it), and the one shown in the panel. */
  const contextSaleId: Ref<number> = ref(Number(props.saleId));
  const activeSaleId: Ref<number> = ref(contextSaleId.value);

  const sale: Ref<SaleSnapshot | null> = ref(null);
  const options: Ref<SaleOptions | null> = ref(null);
  const rows: Ref<SaleFieldRow[]> = ref([]);
  const projectOptions: Ref<ListItem[]> = ref([]);
  const contactOptions: Ref<ListItem[]> = ref([]);
  const collapsedGroups: Ref<Set<string>> = ref(new Set());
  const personOptions: Ref<ListItem[]> = ref([]);

  const udefDefinitions: Ref<SaleFieldDefinition[]> = ref([]);
  const layouts: Ref<FieldLayouts> = ref({ standard: null, personal: null });
  const canEditStandard: Ref<boolean> = ref(false);
  const layoutOpen: Ref<boolean> = ref(false);
  /** The sale picker - it knows the list being worked through, for "Lagre og neste". */
  const worklist = ref<InstanceType<typeof SaleWorklist> | null>(null);
  /** True while the stage was picked by the panel because of a sale type change, not by the user. */
  const stageFollowsType: Ref<boolean> = ref(false);
  /** The from → to list under the summary. Closed by default so it does not crowd a short side panel. */
  const showChanges: Ref<boolean> = ref(false);
  const savingLayout: Ref<boolean> = ref(false);
  /** The sale's next activity: null when it has none, undefined when it could not be read. */
  const nextActivity: Ref<NextActivity | null | undefined> = ref(undefined);

  /**
   * An open sale is under control when its next activity is ahead of us and before the sale date.
   * Follows the sale date being edited, so moving the date shows the result before saving.
   */
  const activityCheck: ComputedRef<{ level: "ok" | "warning" | "danger"; label: string }> = computed(() => {
    const activity = nextActivity.value;
    if (activity === undefined || effectiveStatus.value !== "Open") return { level: "ok", label: "" };
    if (activity === null) return { level: "danger", label: "Ingen planlagt aktivitet" };

    const activityDay = activity.date.substring(0, 10);
    const daysAgo = daysBetween(activityDay, todayIso());
    if (daysAgo > 0) return { level: "danger", label: daysAgo === 1 ? "Passert i går" : `Passert for ${daysAgo} dager siden` };
    const saledate = effectiveValue("saledate");
    if (saledate && activityDay === saledate) return { level: "warning", label: "Samme dag som salgsdato" };
    if (saledate && activityDay > String(saledate)) return { level: "warning", label: "Etter salgsdato" };
    return { level: "ok", label: "" };
  });

  /** How much of the activity the row shows - the user's own choice, else the standard's. */
  const activityDisplay: ComputedRef<ActivityDisplay> = computed(
    () => layouts.value.personal?.activityDisplay ?? layouts.value.standard?.activityDisplay ?? DEFAULT_ACTIVITY_DISPLAY
  );

  const activityDetails: ComputedRef<string> = computed(() => {
    const activity = nextActivity.value;
    if (!activity || activityDisplay.value === "date") return "";
    if (activityDisplay.value === "type") return activity.type;
    return [activity.type, activity.text].filter(Boolean).join(" · ");
  });

  /** The tooltip always holds the whole activity, and why the row is marked. */
  const activityTitle: ComputedRef<string> = computed(() => {
    if (nextActivity.value === undefined) return "Kunne ikke hente aktivitetene på salget";
    const details = [nextActivity.value?.type, nextActivity.value?.text].filter(Boolean).join(" · ");
    const { level } = activityCheck.value;
    if (level === "danger" && !nextActivity.value) return "Salget har ingen planlagt aktivitet – opprett en for å holde salget i gang";
    if (level === "danger") return `${details}\nAktiviteten er passert – salget er ikke under kontroll`;
    if (level === "warning") return `${details}\nAktiviteten bør ligge før salgsdatoen – ellers er ikke salget under kontroll`;
    return details;
  });

  /** Every field the panel can show: the built-in ones and the sale's user-defined fields. */
  const allDefinitions: ComputedRef<SaleFieldDefinition[]> = computed(() => [...SALE_FIELDS, ...udefDefinitions.value, ...TRAILING_FIELDS]);
  /**
   * The fields shown: the user's own layout, else the standard, else the built-in one. The standard is a
   * minimum for the user's own layout, also for one saved before the standard was changed.
   */
  const visibleDefinitions: ComputedRef<SaleFieldDefinition[]> = computed(() => {
    const { personal, standard } = layouts.value;
    if (!personal) return applyLayout(allDefinitions.value, standard?.fields ?? null);
    // The standard (or, before an admin has saved one, the built-in layout) is the least a user's own layout shows.
    const own = completeLayout(allDefinitions.value, personal.fields);
    return applyLayout(allDefinitions.value, withStandardMinimum(own, completeLayout(allDefinitions.value, standard?.fields ?? null)));
  });

  const changedRows: ComputedRef<SaleFieldRow[]> = computed(() => rows.value.filter((row) => row.shouldUpdate));
  const activeSaleLabel: ComputedRef<string> = computed(() => [sale.value?.heading, sale.value?.contactName].filter(Boolean).join(" · "));
  const currentStatus: ComputedRef<SaleStatus | null> = computed(() => (sale.value?.values.status as SaleStatus) ?? null);
  const effectiveStatus: ComputedRef<SaleStatus | null> = computed(() => effectiveValue("status") as SaleStatus | null);

  /** Rows grouped in the order the groups first appear in SALE_FIELDS. */
  const groups: ComputedRef<FieldGroup[]> = computed(() => {
    const byName = new Map<string, FieldGroup>();
    for (const row of rows.value.filter(isRowShown)) {
      const group = byName.get(row.definition.group) ?? { name: row.definition.group, rows: [], changed: 0, missing: 0 };
      group.rows.push(row);
      if (row.shouldUpdate) group.changed++;
      if (isMissing(row)) group.missing++;
      byName.set(group.name, group);
    }
    return [...byName.values()];
  });

  const missingRows: ComputedRef<SaleFieldRow[]> = computed(() => rows.value.filter((row) => isRowShown(row) && isMissing(row)));
  const missingCount: ComputedRef<number> = computed(() => missingRows.value.length);

  /** Important fields must have a value before the sale can be saved - this says which. */
  const missingText: ComputedRef<string> = computed(() => {
    const labels = missingRows.value.map((row) => row.definition.label);
    if (labels.length === 0) return "";
    if (labels.length <= 3) return `Ikke lagret – fyll ut: ${labels.join(", ")}`;
    return `Ikke lagret – fyll ut ${labels.length} felt`;
  });

  /** Set when a save was stopped by missing fields; the message then shows until they are filled in. */
  const saveBlocked: Ref<boolean> = ref(false);
  const attentionPulse: Ref<boolean> = ref(false);
  watch(missingCount, (count) => {
    if (count === 0) saveBlocked.value = false;
  });

  const changeCountText: ComputedRef<string> = computed(() => {
    const count = changedRows.value.length;
    if (count === 0) return "Ingen endringer";
    return count === 1 ? "1 endring" : `${count} endringer`;
  });

  /** Sold/lost/stalled needs a reason when the status is changed - unless the customer has no reasons set up. */
  const missingReason: ComputedRef<string> = computed(() => {
    const statusRow = findRow("status");
    // A reason that is hidden by the layout can not be picked, so it can not be asked for either.
    if (!findRow("reasonId")) return "";
    const reasonList = reasonListFor(effectiveStatus.value);
    if (!statusRow?.shouldUpdate || !reasonList || !options.value?.[reasonList].length) return "";
    if (effectiveValue("reasonId") !== null) return "";
    return `Velg en grunn når salget settes til ${statusName(effectiveStatus.value).toLowerCase()}.`;
  });

  onMounted(async () => {
    try {
      await Promise.all([load(), loadFieldSettings()]);
      // The sale may arrive before the layout - build the rows again with the layout in place.
      if (sale.value) rows.value = buildRows(sale.value);
    } catch (e) {
      error.value = "Noe gikk galt. Vennligst kontakt systemadministrator om det gjentar seg.";
      errorDetail.value = `Detaljer: ${e instanceof Error ? e.message : String(e)} (salgsnummer: "${activeSaleId.value}", fra URL: "${props.saleId}")`;
      console.error(e);
    } finally {
      loading.value = false;
    }
  });

  async function load() {
    const saleId = activeSaleId.value;
    if (!saleId || saleId <= 0) throw new Error("Fant ikke noe gyldig salgsnummer i URL-en (forventet saleId=<said>).");

    // The lists (stages, sources, users...) are the same for every sale, so they are fetched once.
    const [snapshot, saleOptions] = await Promise.all([dataSource.GetSale(saleId), options.value ?? dataSource.GetOptions()]);
    sale.value = snapshot;
    options.value = saleOptions;
    rows.value = buildRows(snapshot);
    stageFollowsType.value = false;
    projectOptions.value = snapshot.project ? [snapshot.project] : [];
    contactOptions.value = snapshot.contactId ? [{ id: snapshot.contactId, name: snapshot.contactName }] : [];
    personOptions.value = snapshot.person ? [snapshot.person] : [];
    loadPersons(snapshot.contactId, snapshot.person);
    loadNextActivity();
  }

  /** The persons on the sale's company. Read on its own, so a failure only leaves the current person. */
  async function loadPersons(contactId: number, current: ListItem | null) {
    const saleId = activeSaleId.value;
    try {
      const persons = await dataSource.GetPersons(contactId);
      // Ignore an answer that comes back after the sale or the company was changed again.
      if (saleId !== activeSaleId.value || Number(effectiveValue("contactId") ?? contactId) !== contactId) return;
      personOptions.value = current && !persons.some((person) => person.id === current.id) ? [current, ...persons] : persons;
    } catch (e) {
      console.error("Could not fetch the persons on the company:", e);
    }
  }

  /** Read on its own, so a failure here never stops the sale from being shown. */
  async function loadNextActivity() {
    const saleId = activeSaleId.value;
    try {
      const activity = await dataSource.GetNextActivity(saleId);
      if (saleId === activeSaleId.value) nextActivity.value = activity;
    } catch (e) {
      console.error("Could not fetch the next activity:", e);
      if (saleId === activeSaleId.value) nextActivity.value = undefined;
    }
  }

  // An activity made in SuperOffice's own dialog shows up when the user comes back to the panel.
  onMounted(() => window.addEventListener("focus", onPanelFocus));
  onUnmounted(() => window.removeEventListener("focus", onPanelFocus));
  function onPanelFocus() {
    if (sale.value && !loading.value) loadNextActivity();
  }

  /** Opens SuperOffice's new activity dialog with the sale (and its company) filled in. */
  function createActivity() {
    if (!sale.value) return;
    if (props.demo) {
      ElMessage.info("I SuperOffice åpnes dialogen for ny aktivitet, koblet til dette salget.");
      return;
    }
    try {
      jumpTo(`appointment.main[new=true]?appointment_id=0&usesalecurrent=true&sale_id=${sale.value.saleId}`);
    } catch (e) {
      ElMessage.error("Kunne ikke åpne dialogen for ny aktivitet.");
      console.error(e);
    }
  }

  async function reload() {
    loading.value = true;
    try {
      await load();
    } catch (e) {
      ElMessage.error("Kunne ikke laste salget på nytt.");
      console.error(e);
    } finally {
      loading.value = false;
    }
  }

  function buildRows(snapshot: SaleSnapshot): SaleFieldRow[] {
    return visibleDefinitions.value.map((definition) => ({
      definition,
      current: snapshot.values[definition.key] ?? null,
      next: snapshot.values[definition.key] ?? null,
      shouldUpdate: false
    }));
  }

  /** The layout's fields after a layout change, keeping changes already made in fields that stay. */
  function rebuildRows(snapshot: SaleSnapshot): SaleFieldRow[] {
    const existing = new Map(rows.value.map((row) => [row.definition.key, row]));
    return buildRows(snapshot).map((row) => {
      const kept = existing.get(row.definition.key);
      return kept ? { ...kept, definition: row.definition } : row;
    });
  }

  /** Field settings: the user-defined fields, both layouts and whether this user may change the standard. */
  async function loadFieldSettings() {
    const [udefs, savedLayouts, mayEditStandard] = await Promise.all([
      dataSource.GetUdefDefinitions().catch((e) => {
        console.error("Could not fetch user-defined fields:", e);
        return [] as SaleFieldDefinition[];
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
      await dataSource.SaveFieldLayout(level, layout);
    } catch (e) {
      ElMessage.error("Kunne ikke lagre feltoppsettet.");
      console.error(e);
      savingLayout.value = false;
      return;
    }
    try {
      // Read back what SuperOffice now holds, so the panel shows what was really saved.
      layouts.value = await dataSource.GetFieldLayouts();
      if (sale.value) rows.value = rebuildRows(sale.value);
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

  function findRow(key: FieldKey): SaleFieldRow | undefined {
    return rows.value.find((row) => row.definition.key === key);
  }

  /** An important field with no value (a sum of 0 counts as no value) - after the change, if one is pending. */
  function isMissing(row: SaleFieldRow): boolean {
    if (!row.definition.important) return false;
    const value = row.shouldUpdate ? row.next : row.current;
    if (row.definition.kind === "amount") return !Number(value);
    return value === null || value === "";
  }

  /**
   * The value the sale will have after saving: the new value if the row is switched on, otherwise the current.
   * A field hidden by the layout keeps the sale's value.
   */
  function effectiveValue(key: FieldKey): FieldValue {
    const row = findRow(key);
    if (!row) return sale.value?.values[key] ?? null;
    return row.shouldUpdate ? row.next : row.current;
  }

  /**
   * The values a field can be set to. Stages follow the sale type; forDisplay gives every stage, so a
   * current stage outside the new type's stages still shows its name.
   */
  function optionsFor(row: SaleFieldRow, status: SaleStatus | null, forDisplay = false): ListItem[] {
    if (!options.value) return [];
    if (row.definition.kind === "project") return projectOptions.value;
    if (row.definition.kind === "contact") return contactOptions.value;
    if (row.definition.kind === "person") return personOptions.value;
    if (row.definition.key === "reasonId") {
      const reasonList = reasonListFor(status);
      return reasonList ? options.value[reasonList] : [];
    }
    if (row.definition.key === "stageId" && !forDisplay) return stagesFor(effectiveValue("saleTypeId"));
    return row.definition.list ? options.value[row.definition.list] : [];
  }

  /** The stages a sale type uses, each with the type's probability. A type with none linked uses them all. */
  function stagesFor(saleTypeId: FieldValue): ListItem[] {
    if (!options.value) return [];
    return options.value.stagesBySaleType[String(saleTypeId)] ?? options.value.stage;
  }

  /** The update switch only turns on once there is a new value to save - no "- → -" rows. */
  function isSwitchDisabled(row: SaleFieldRow): boolean {
    return isDisabled(row) || (!row.shouldUpdate && row.next === row.current);
  }

  /** A field tied to one status (the reopen date for stalled sales) only shows while the sale has it. */
  function isRowShown(row: SaleFieldRow): boolean {
    // The reason only means something for a sold, lost or stalled sale - hidden until the status is one of them.
    if (row.definition.key === "reasonId") return reasonListFor(effectiveStatus.value) !== null;
    return !row.definition.showWhenStatus || effectiveStatus.value === row.definition.showWhenStatus;
  }

  /** Reason can only be set when the sale is (or will be) sold, lost or stalled. */
  function isDisabled(row: SaleFieldRow): boolean {
    return row.definition.key === "reasonId" && reasonListFor(effectiveStatus.value) === null;
  }

  function setRow(row: SaleFieldRow, next: FieldValue, shouldUpdate: boolean) {
    row.next = next;
    row.shouldUpdate = shouldUpdate;
  }

  /** A new value switches the row on automatically - unless it is set back to the current value. */
  function onEdit(row: SaleFieldRow, value: FieldValue) {
    if (row.definition.key === "stageId") stageFollowsType.value = false;
    setRow(row, value, value !== row.current);
    applyDependencies(row);
  }

  /** Switching a row off means "keep the current value", so the new value is reset. */
  function onToggle(row: SaleFieldRow, on: boolean) {
    if (row.definition.key === "stageId") stageFollowsType.value = false;
    if (on) row.shouldUpdate = true;
    else setRow(row, row.current, false);
    applyDependencies(row);
  }

  /** Fields that follow other fields: probability follows stage, reason follows status. */
  function applyDependencies(row: SaleFieldRow) {
    const key = row.definition.key;

    if (key === "stageId" && row.shouldUpdate) {
      const probability = stagesFor(effectiveValue("saleTypeId")).find((stage) => stage.id === row.next)?.probability;
      const probabilityRow = findRow("probability");
      if (probabilityRow && probability !== undefined) setRow(probabilityRow, probability, probability !== probabilityRow.current);
    }

    // A new sale type may not use the stage. Back to the sale's own stage if the type allows it,
    // otherwise the type's stage closest in probability (the lower one on a tie).
    if (key === "saleTypeId") {
      const stageRow = findRow("stageId");
      const allowed = stagesFor(effectiveValue("saleTypeId"));
      if (!stageRow || allowed.length === 0) return;

      // A stage picked for an earlier sale type goes back to the sale's own stage once the type allows it.
      if (stageFollowsType.value && allowed.some((item) => item.id === stageRow.current)) {
        setRow(stageRow, stageRow.current, false);
        const probabilityRow = findRow("probability");
        if (probabilityRow) setRow(probabilityRow, probabilityRow.current, false);
        stageFollowsType.value = false;
        return;
      }
      if (allowed.some((item) => item.id === effectiveValue("stageId"))) return;

      if (allowed.some((item) => item.id === stageRow.current)) {
        setRow(stageRow, stageRow.current, false);
        const probabilityRow = findRow("probability");
        if (probabilityRow) setRow(probabilityRow, probabilityRow.current, false);
        return;
      }

      const reference = Number(effectiveValue("probability") ?? 0);
      const closest = [...allowed].sort((a, b) => {
        const distance = Math.abs((a.probability ?? 0) - reference) - Math.abs((b.probability ?? 0) - reference);
        return distance !== 0 ? distance : (a.probability ?? 0) - (b.probability ?? 0);
      })[0]!;
      setRow(stageRow, closest.id, closest.id !== stageRow.current);
      stageFollowsType.value = true;
      applyDependencies(stageRow);
    }

    // A new company has other persons: the contact person is emptied, and comes back with the company.
    if (key === "contactId") {
      const personRow = findRow("personId");
      const backToOwnCompany = !row.shouldUpdate || row.next === row.current;
      if (personRow) {
        if (backToOwnCompany) setRow(personRow, personRow.current, false);
        else setRow(personRow, null, personRow.current !== null);
      }
      const contactId = Number(effectiveValue("contactId") ?? 0);
      if (!backToOwnCompany) personOptions.value = [];
      loadPersons(contactId, backToOwnCompany ? (sale.value?.person ?? null) : null);
    }

    if (key === "status") {
      const reopenRow = findRow("reopenDate");
      if (reopenRow && !isRowShown(reopenRow)) setRow(reopenRow, reopenRow.current, false);
      const reasonRow = findRow("reasonId");
      if (!reasonRow) return;
      const statusChanged = row.shouldUpdate && row.next !== row.current;
      if (statusChanged) setRow(reasonRow, null, reasonListFor(row.next as SaleStatus) !== null);
      else setRow(reasonRow, reasonRow.current, false);
    }
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

  /** The search behind the searched pickers: projects and companies. */
  function searchFor(row: SaleFieldRow): ((query: string) => Promise<ListItem[]>) | undefined {
    if (row.definition.kind === "project") return (query) => dataSource.SearchProjects(query);
    if (row.definition.kind === "contact") return (query) => dataSource.SearchContacts(query);
    return undefined;
  }

  function addSearchResults(row: SaleFieldRow, items: ListItem[]) {
    const target = row.definition.kind === "contact" ? contactOptions : projectOptions;
    const known = new Set(target.value.map((item) => item.id));
    target.value = [...target.value, ...items.filter((item) => !known.has(item.id))];
  }

  /** Asks before unsaved changes are thrown away by switching sale. */
  async function confirmLeave(): Promise<boolean> {
    const count = changedRows.value.length;
    if (count === 0) return true;
    try {
      await ElMessageBox.confirm(
        count === 1 ? "Du har 1 endring som ikke er lagret." : `Du har ${count} endringer som ikke er lagret.`,
        "Bytte salg?",
        { confirmButtonText: "Forkast og bytt", cancelButtonText: "Bli her", type: "warning" }
      );
      return true;
    } catch {
      return false;
    }
  }

  /** Shows another sale in the panel, and moves the SuperOffice sale card along so both show the same sale. */
  async function switchSale(saleId: number) {
    activeSaleId.value = saleId;
    if (!props.demo && saleId !== contextSaleId.value) openSaleCard(saleId);
    await reload();
  }

  function reset() {
    stageFollowsType.value = false;
    if (sale.value) rows.value = buildRows(sale.value);
  }

  /** Saves; returns true when the sale was saved. "next" moves on to the next sale in the list afterwards. */
  async function save(after: "stay" | "next" = "stay"): Promise<boolean> {
    if (!sale.value) return false;
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
    posting.value = true;

    const saleId = sale.value.saleId;
    const changes: SaleValues = Object.fromEntries(changedRows.value.map((row) => [row.definition.key, row.next]));
    const definitions = changedRows.value.map((row) => row.definition);

    try {
      try {
        await dataSource.UpdateSale(saleId, changes, definitions, sale.value.updatedAt);
      } catch (e) {
        if (!(e instanceof SaleChangedError)) throw e;
        // Someone saved the sale after it was opened here - let the user decide.
        const choice = await askAboutChangedSale(e);
        if (choice === "reload") await reload();
        if (choice !== "overwrite") {
          posting.value = false;
          return false;
        }
        await dataSource.UpdateSale(saleId, changes, definitions);
      }
    } catch (e) {
      ElMessage.error("Kunne ikke lagre salget. Sjekk at du har tilgang til å endre det.");
      console.error(e);
      posting.value = false;
      return false;
    }

    ElMessage.success("Salget er oppdatert");
    posting.value = false;
    if (after === "next" && worklist.value?.hasNext) {
      // The changes are saved, so moving on must not ask about unsaved changes.
      reset();
      // Moving on opens the next sale on the card and in the panel.
      worklist.value.goNext();
      return true;
    }
    // Reopen the sale card so it shows the saved values, like pressing F5.
    if (!props.demo) openSaleCard(saleId);
    await reload();
    return true;
  }

  /**
   * The save found the sale saved by someone else since it was opened. Saving anyway keeps their
   * changes in every field except the ones changed here.
   */
  async function askAboutChangedSale(e: SaleChangedError): Promise<"overwrite" | "reload" | "keep"> {
    const who = e.updatedBy || "Noen andre";
    const when = e.updatedAt ? " kl. " + new Date(e.updatedAt).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" }) : "";
    try {
      await ElMessageBox.confirm(
        who + " har lagret salget" + when + " etter at du åpnet det. Lagrer du likevel, beholdes endringene deres – bortsett fra i feltene du selv har endret.",
        "Salget er endret",
        { confirmButtonText: "Lagre likevel", cancelButtonText: "Last inn på nytt", distinguishCancelAndClose: true, type: "warning" }
      );
      return "overwrite";
    } catch (action) {
      return action === "cancel" ? "reload" : "keep";
    }
  }

  /**
   * Opens a sale on the SuperOffice sale card through SoProtocol.
   * Failures are only logged: a save has already succeeded when this runs after saving.
   */
  function openSaleCard(saleId: number) {
    try {
      jumpTo(`sale.main?sale_id=${saleId}`);
      contextSaleId.value = saleId;
    } catch (e) {
      console.warn("Could not open the sale card:", e);
    }
  }

  function statusName(status: SaleStatus | null): string {
    return SALE_STATUSES.find((item) => item.id === status)?.name ?? "";
  }

  function formatNumber(value: FieldValue): string {
    return Number(value ?? 0).toLocaleString("nb-NO", { maximumFractionDigits: 2 });
  }

  function formatValue(row: SaleFieldRow, value: FieldValue, status: SaleStatus | null): string {
    if (value === null || value === "") return "-";

    switch (row.definition.kind) {
      case "amount":
        return `${formatNumber(value)} ${sale.value?.currency ?? ""}`.trim();
      case "number":
        return formatNumber(value);
      case "checkbox":
        return Number(value) === 1 ? "Ja" : "Nei";
      case "percent":
        return `${value} %`;
      case "date":
        return formatDate(String(value));
      case "select":
      case "project":
      case "contact":
      case "person":
        return optionsFor(row, status, true).find((item) => item.id === value)?.name ?? "-";
      case "longtext":
        // One line in the table and the summary - the whole text is in the field itself.
        return String(value).replace(/\s+/g, " ").trim();
      default:
        return String(value);
    }
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString("nb-NO", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  /** Today as YYYY-MM-DD in local time, comparable with the sale's dates. */
  function todayIso(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  /** Whole days from one YYYY-MM-DD to another (negative when "to" is earlier). */
  function daysBetween(from: string, to: string): number {
    return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
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
    container-name: sale-panel;

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
  .sale-header {
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
  @container sale-panel (max-width: 560px) {
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

    /* Next activity has no switch or editor: the button goes beside the name, the activity gets the full width under it. */
    .field-grid.activity-row {
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas:
        "label action"
        "current current";
      row-gap: 2px;
    }

    .activity-row .activity-action {
      grid-area: action;
    }

    .activity-row .cell-current {
      font-size: 12px;
      color: var(--text);
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

  /* ---------- Next activity ---------- */
  .activity-current {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .activity-date {
    flex: none;
    font-weight: 700;
  }

  .activity-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .activity-tag {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 11px;
    font-weight: 700;
    padding: 1px 7px;
    border-radius: 10px;
  }

  /* The action sits in the switch and editor columns, so it lines up with the editors above. */
  .activity-action {
    grid-column: switch / editor;
    justify-self: end;
  }

  .field-row.activity-danger {
    background: #fdf1f0;
    border-left-color: #d64541;
  }
  .activity-danger .field-label,
  .activity-danger .activity-date {
    color: #b42a27;
  }
  .activity-danger .activity-tag {
    color: #b42a27;
    background: #fde5e4;
  }

  .field-row.activity-warning {
    background: #fff8ec;
    border-left-color: #e6a23c;
  }
  .activity-warning .field-label,
  .activity-warning .activity-date {
    color: #a65a00;
  }
  .activity-warning .activity-tag {
    color: #a65a00;
    background: #fdecd2;
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
