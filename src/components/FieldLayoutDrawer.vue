<template>
  <el-drawer :model-value="modelValue" title="Tilpass felter" size="100%" :append-to-body="true" @update:model-value="close" @open="startEditing">
    <div class="layout-editor">
      <el-radio-group v-if="canEditStandard" v-model="level" size="small" @change="startEditing">
        <el-radio-button value="personal">Mitt oppsett</el-radio-button>
        <el-radio-button value="standard">Standard for alle</el-radio-button>
      </el-radio-group>

      <p class="layout-hint">{{ hint }}</p>
      <p v-if="standardMinimum" class="layout-hint standard-legend">
        <PhStar :size="14" weight="fill" class="standard-star" /> = satt i standardoppsettet. Det kan du ikke endre, men du kan vise flere felt.
      </p>
      <el-alert
        v-if="level === 'standard' && layouts.personal"
        type="warning"
        :closable="false"
        show-icon
        title="Du har eget oppsett, så endringer her vises ikke for deg før du trykker «Bruk standard» under Mitt oppsett."
      />

      <div class="activity-setting">
        <span class="activity-setting-label">Neste aktivitet viser</span>
        <el-select v-model="activityDisplay" size="small" class="activity-setting-select" aria-label="Neste aktivitet viser">
          <el-option v-for="option in ACTIVITY_OPTIONS" :key="option.value" :value="option.value" :label="option.label" />
        </el-select>
      </div>

      <div class="layout-grid layout-grid-header">
        <span>Rekkefølge</span>
        <span>Felt</span>
        <span class="center">Vis</span>
        <span class="center">Blokker lagring</span>
      </div>

      <template v-for="(entry, index) in entries" :key="entry.key">
        <div v-if="index === 0 || groupOf(entry.key) !== groupOf(entries[index - 1]!.key)" class="layout-group">
          <span class="move-buttons">
            <el-button
              size="small"
              circle
              :disabled="groupOrder.indexOf(groupOf(entry.key)) === 0"
              :aria-label="`Flytt gruppen ${groupOf(entry.key)} opp`"
              @click="moveGroup(groupOf(entry.key), -1)"
            >
              <PhArrowUp :size="12" weight="bold" />
            </el-button>
            <el-button
              size="small"
              circle
              :disabled="groupOrder.indexOf(groupOf(entry.key)) === groupOrder.length - 1"
              :aria-label="`Flytt gruppen ${groupOf(entry.key)} ned`"
              @click="moveGroup(groupOf(entry.key), 1)"
            >
              <PhArrowDown :size="12" weight="bold" />
            </el-button>
          </span>
          <span>{{ groupOf(entry.key) }}</span>
        </div>
        <div class="layout-grid layout-row" :class="{ hidden: !entry.visible }">
          <span class="move-buttons">
            <el-button size="small" circle :disabled="!canMove(index, -1)" :aria-label="`Flytt ${labelOf(entry.key)} opp`" @click="move(index, -1)">
              <PhArrowUp :size="12" weight="bold" />
            </el-button>
            <el-button size="small" circle :disabled="!canMove(index, 1)" :aria-label="`Flytt ${labelOf(entry.key)} ned`" @click="move(index, 1)">
              <PhArrowDown :size="12" weight="bold" />
            </el-button>
          </span>
          <span class="field-name">{{ labelOf(entry.key) }}</span>
          <!-- What the standard sets is shown as a star, not a checkbox: only what the user can change is a checkbox. -->
          <span class="center">
            <PhStar
              v-if="requiredBy(entry.key).visible"
              :size="16"
              weight="fill"
              class="standard-star"
              role="img"
              :aria-label="`${labelOf(entry.key)} vises i standardoppsettet`"
              title="Vises i standardoppsettet"
            />
            <el-checkbox v-else v-model="entry.visible" :aria-label="`Vis ${labelOf(entry.key)}`" />
          </span>
          <span class="center">
            <PhStar
              v-if="requiredBy(entry.key).important"
              :size="16"
              weight="fill"
              class="standard-star"
              role="img"
              :aria-label="`${labelOf(entry.key)} blokkerer lagring i standardoppsettet`"
              title="Blokkerer lagring i standardoppsettet"
            />
            <el-checkbox
              v-else
              v-model="entry.important"
              :disabled="!entry.visible"
              :title="entry.visible ? 'Salget kan ikke lagres før feltet er fylt ut' : 'Feltet må vises først'"
              :aria-label="`${labelOf(entry.key)} blokkerer lagring`"
            />
          </span>
        </div>
      </template>
    </div>

    <template #footer>
      <div class="layout-footer">
        <el-button round :disabled="saving || !hasSavedLayout" @click="emit('save', level, null)">{{ resetText }}</el-button>
        <el-button round :disabled="saving" @click="close">Avbryt</el-button>
        <el-button type="primary" round :loading="saving" @click="emit('save', level, { fields: entries, activityDisplay })">Lagre</el-button>
      </div>
    </template>
  </el-drawer>
</template>

<script lang="ts" setup>
  import { computed, ref, type ComputedRef, type Ref } from "vue";
  import { PhArrowDown, PhArrowUp, PhStar } from "@phosphor-icons/vue";
  import { completeLayout, DEFAULT_ACTIVITY_DISPLAY, withStandardMinimum } from "@/config/fieldLayout";
  import type { ActivityDisplay, FieldKey, FieldLayout, FieldLayouts, LayoutLevel, SaleFieldDefinition, SavedLayout } from "@/types/SaleQuickUpdate";

  const ACTIVITY_OPTIONS: { value: ActivityDisplay; label: string }[] = [
    { value: "date", label: "Bare dato" },
    { value: "type", label: "Dato og type" },
    { value: "full", label: "Dato, type og beskrivelse" }
  ];

  const props = defineProps<{
    modelValue: boolean;
    definitions: SaleFieldDefinition[];
    layouts: FieldLayouts;
    canEditStandard: boolean;
    saving: boolean;
  }>();

  const emit = defineEmits<{
    "update:modelValue": [open: boolean];
    /** layout null removes the saved layout on that level. */
    save: [level: LayoutLevel, layout: SavedLayout | null];
  }>();

  const level: Ref<LayoutLevel> = ref("personal");
  /** A working copy - nothing is saved until "Lagre". */
  const entries: Ref<FieldLayout> = ref([]);
  const activityDisplay: Ref<ActivityDisplay> = ref(DEFAULT_ACTIVITY_DISPLAY);

  const hasSavedLayout: ComputedRef<boolean> = computed(() => (level.value === "personal" ? !!props.layouts.personal : !!props.layouts.standard));

  const resetText: ComputedRef<string> = computed(() => (level.value === "personal" ? "Bruk standard" : "Bruk innebygd"));

  const hint: ComputedRef<string> = computed(() => {
    if (level.value === "standard") return "Gjelder alle brukere som ikke har laget sitt eget oppsett.";
    if (props.layouts.personal) return "Ditt eget oppsett. «Bruk standard» går tilbake til oppsettet admin har satt.";
    return "Gjelder bare deg. Du starter fra standardoppsettet.";
  });

  /**
   * Starts from the saved layout on the chosen level (personal falls back to the standard).
   * The panel shows fields group by group, so they are listed the same way here, groups in the
   * order they first appear.
   */
  function startEditing() {
    const saved = level.value === "personal" ? (props.layouts.personal ?? props.layouts.standard) : props.layouts.standard;
    const own = completeLayout(props.definitions, saved?.fields ?? null);
    const layout = standardMinimum.value ? withStandardMinimum(own, standardMinimum.value) : own;
    activityDisplay.value =
      (level.value === "personal" ? props.layouts.personal?.activityDisplay : null) ?? props.layouts.standard?.activityDisplay ?? DEFAULT_ACTIVITY_DISPLAY;
    const groupOrder = [...new Set(layout.map((entry) => groupOf(entry.key)))];
    entries.value = groupOrder.flatMap((group) => layout.filter((entry) => groupOf(entry.key) === group).map((entry) => ({ ...entry })));
  }

  /** Fields move within their group - that is the order the panel shows. */
  function canMove(index: number, direction: number): boolean {
    const neighbour = entries.value[index + direction];
    const entry = entries.value[index];
    return !!neighbour && !!entry && groupOf(neighbour.key) === groupOf(entry.key);
  }

  function move(index: number, direction: number) {
    if (!canMove(index, direction)) return;
    const next = [...entries.value];
    [next[index], next[index + direction]] = [next[index + direction]!, next[index]!];
    entries.value = next;
  }

  /**
   * On "Mitt oppsett", the standard - the least the user's own layout must show. Until an admin has
   * saved one, the built-in layout is the standard.
   */
  const standardMinimum = computed(() =>
    level.value === "personal" ? completeLayout(props.definitions, props.layouts.standard?.fields ?? null) : null
  );

  /** What the standard requires of a field: shown, and/or important. */
  function requiredBy(key: FieldKey): { visible: boolean; important: boolean } {
    const entry = standardMinimum.value?.find((item) => item.key === key);
    return { visible: !!entry?.visible, important: !!entry?.important };
  }

  /** The groups in the order they are listed - the order the panel shows them in. */
  const groupOrder = computed(() => [...new Set(entries.value.map((entry) => groupOf(entry.key)))]);

  /** Moves a whole group, with all its fields, one step up or down. */
  function moveGroup(group: string, direction: number) {
    const order = [...groupOrder.value];
    const index = order.indexOf(group);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target]!, order[index]!];
    entries.value = order.flatMap((name) => entries.value.filter((entry) => groupOf(entry.key) === name));
  }

  function labelOf(key: FieldKey): string {
    return props.definitions.find((definition) => definition.key === key)?.label ?? key;
  }

  function groupOf(key: FieldKey): string {
    return props.definitions.find((definition) => definition.key === key)?.group ?? "";
  }

  function close() {
    emit("update:modelValue", false);
  }
</script>

<style scoped>
  .layout-editor {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .layout-hint {
    margin: 0;
    font-size: 12px;
    color: #7a7a7a;
  }

  .activity-setting {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border: 1px solid #ececec;
    border-radius: 8px;
  }

  .activity-setting-label {
    font-size: 13px;
    font-weight: 700;
  }

  .activity-setting-select {
    margin-left: auto;
    width: 210px;
  }

  .layout-grid {
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr) 48px 64px;
    align-items: center;
    column-gap: 8px;
    padding: 0 8px;
  }

  .layout-grid-header {
    padding-top: 6px;
    padding-bottom: 6px;
    font-size: 12px;
    font-weight: 700;
    border-bottom: 2px solid #ececec;
  }

  .layout-row {
    min-height: 40px;
    border-bottom: 1px solid #ececec;
  }

  .layout-row.hidden .field-name {
    color: #9a9a9a;
  }

  .move-buttons {
    display: flex;
    gap: 4px;
  }

  .move-buttons :deep(.el-button + .el-button) {
    margin-left: 0;
  }

  .field-name {
    font-size: 13px;
  }

  .layout-group {
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr);
    align-items: center;
    column-gap: 8px;
    margin-top: 6px;
    padding: 6px 8px;
    font-size: 13px;
    font-weight: 700;
    background: #f4f5f3;
    border-bottom: 1px solid #ececec;
  }

  .center {
    text-align: center;
  }

  .layout-grid-header .center {
    line-height: 1.2;
  }

  /* The panel's own green - no new colours. */
  .standard-star {
    color: var(--el-color-primary);
    vertical-align: middle;
  }

  .standard-legend {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .layout-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .layout-footer :deep(.el-button + .el-button) {
    margin-left: 0;
  }
</style>
