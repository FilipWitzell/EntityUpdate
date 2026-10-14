<template>
  <div class="worklist">
    <el-select :model-value="kind" size="small" class="kind-select" @change="(value: ScopeKind) => changeKind(value)">
      <el-option :label="config.currentLabel" value="current" />
      <el-option :label="config.mineLabel" value="mine" />
      <el-option label="Utvalg" value="selection" :disabled="selections.length === 0" />
      <el-option :label="config.othersLabel" value="associate" />
    </el-select>

    <el-select
      v-if="kind === 'selection'"
      :model-value="targetId ?? undefined"
      size="small"
      filterable
      class="target-select"
      placeholder="Velg utvalg..."
      no-data-text="Ingen utvalg"
      no-match-text="Ingen treff"
      @change="(id: number) => changeTarget(id)"
    >
      <el-option v-for="selection in selections" :key="selection.id" :label="selection.name" :value="selection.id" />
    </el-select>

    <el-select
      v-if="kind === 'associate'"
      :model-value="targetId ?? undefined"
      size="small"
      filterable
      class="target-select"
      placeholder="Velg bruker..."
      no-data-text="Ingen brukere"
      no-match-text="Ingen treff"
      @change="(id: number) => changeTarget(id)"
    >
      <el-option v-for="associate in otherAssociates" :key="associate.id" :label="associate.name" :value="Number(associate.id)" />
    </el-select>

    <span v-if="kind === 'current'" class="current-item" :title="activeLabel">{{ activeLabel }}</span>

    <!-- Mine: on the same line. Selection/user: on its own line, under the picker of which one. -->
    <div v-if="showNavigator" class="navigator" :class="{ 'own-line': kind === 'selection' || kind === 'associate' }">
      <el-button size="small" circle :disabled="loadingList || index <= 0" title="Forrige" aria-label="Forrige" @click="step(-1)">
        <PhCaretLeft :size="14" weight="bold" />
      </el-button>

      <el-select
        :model-value="selectedId"
        size="small"
        filterable
        class="item-select"
        popper-class="entity-worklist-popper"
        :loading="loadingList"
        :placeholder="loadingList ? 'Henter...' : items.length === 0 ? 'Ingen treff' : 'Velg...'"
        no-data-text="Ingen treff"
        no-match-text="Ingen treff"
        @change="(id: number) => selectItem(id)"
      >
        <el-option v-for="item in items" :key="item.id" :label="item.title" :value="item.id">
          <div class="item-option">
            <span class="item-option-title">{{ item.title }}</span>
            <span v-if="item.meta" class="item-option-meta">{{ item.meta }}</span>
          </div>
        </el-option>
      </el-select>

      <el-button
        size="small"
        circle
        :disabled="loadingList || index < 0 || index >= items.length - 1"
        title="Neste"
        aria-label="Neste"
        @click="step(1)"
      >
        <PhCaretRight :size="14" weight="bold" />
      </el-button>

      <span class="position">{{ positionText }}</span>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed, onMounted, ref, type ComputedRef, type Ref } from "vue";
  import { ElMessage } from "element-plus";
  import { PhCaretLeft, PhCaretRight } from "@phosphor-icons/vue";
  import type { ListItem } from "@/types/Fields";
  import type { EntityDataSource, EntityName, WorklistConfig, WorklistItem } from "@/types/EntityQuickUpdate";

  type ScopeKind = "current" | "mine" | "selection" | "associate";

  const props = defineProps<{
    entity: EntityName;
    config: WorklistConfig;
    dataSource: EntityDataSource;
    /** The record shown in the panel right now. */
    activeId: number;
    /** The record SuperOffice has open on the card. */
    contextId: number;
    /** The title of the record shown, for the line next to the picker. */
    activeLabel: string;
    /** Asked before switching record, so unsaved changes are not lost by accident. */
    beforeChange: () => Promise<boolean>;
  }>();

  const emit = defineEmits<{ select: [id: number] }>();

  /** What to work through, and for "selection"/"associate" which one. */
  const kind: Ref<ScopeKind> = ref("current");
  const targetId: Ref<number | null> = ref(null);
  const items: Ref<WorklistItem[]> = ref([]);
  const loadingList: Ref<boolean> = ref(false);
  const currentAssociateId: Ref<number | null> = ref(null);
  const associates: Ref<ListItem[]> = ref([]);
  const selections: Ref<ListItem[]> = ref([]);

  const selectedId: ComputedRef<number | undefined> = computed(() =>
    items.value.some((item) => item.id === props.activeId) ? props.activeId : undefined
  );
  const index: ComputedRef<number> = computed(() => items.value.findIndex((item) => item.id === props.activeId));
  const otherAssociates: ComputedRef<ListItem[]> = computed(() => associates.value.filter((associate) => associate.id !== currentAssociateId.value));

  /** The navigator shows once there is a list to work through. */
  const showNavigator: ComputedRef<boolean> = computed(() => kind.value === "mine" || targetId.value !== null);

  const positionText: ComputedRef<string> = computed(() => {
    if (loadingList.value) return "";
    if (items.value.length === 0) return "0 treff";
    return index.value >= 0 ? `${index.value + 1} av ${items.value.length}` : `${items.value.length} i listen`;
  });

  /**
   * The chosen list is remembered in this browser tab, per entity: SuperOffice reloads the side panel
   * when the card moves to another record, and the user should land back in the same list.
   * Stored as "current", "mine", "selection:<id>" or "associate:<id>".
   */
  const scopeStorageKey = computed(() => `entityUpdate.worklistScope.${props.entity}`);

  onMounted(async () => {
    // Selections and users first, so a remembered list has its name to show.
    [selections.value, associates.value, currentAssociateId.value] = await Promise.all([
      props.dataSource.GetSelections().catch((e) => {
        console.error("Could not fetch selections:", e);
        return [];
      }),
      props.dataSource.GetAssociates().catch((e) => {
        console.error("Could not fetch users:", e);
        return [];
      }),
      props.dataSource.GetCurrentAssociateId().catch(() => null)
    ]);

    const saved = parseScope(readSavedScope());
    if (saved.kind === "current") return;
    kind.value = saved.kind;
    targetId.value = saved.targetId;
    if (showNavigator.value) await loadList(false);
  });

  async function changeKind(value: ScopeKind) {
    // Picking "Utvalg" or someone else's list only opens the second picker - nothing changes until one is chosen.
    if (value === "selection" || value === "associate") {
      kind.value = value;
      targetId.value = null;
      items.value = [];
      return;
    }

    if (!(await props.beforeChange())) return;
    kind.value = value;
    targetId.value = null;
    saveScope(value);

    if (value === "current") {
      items.value = [];
      emit("select", props.contextId);
      return;
    }

    await loadList(true);
  }

  async function changeTarget(id: number) {
    if (!(await props.beforeChange())) return;
    targetId.value = id;
    saveScope(`${kind.value}:${id}`);
    await loadList(true);
  }

  /** Loads the chosen list. With selectFirst, jumps to the top of the list if the record shown is not in it. */
  async function loadList(selectFirst: boolean) {
    loadingList.value = true;
    try {
      items.value = await fetchItems();
      const first = items.value[0];
      if (selectFirst && first && index.value < 0) emit("select", first.id);
    } catch (e) {
      ElMessage.error("Kunne ikke hente listen.");
      console.error(e);
    } finally {
      loadingList.value = false;
    }
  }

  async function fetchItems(): Promise<WorklistItem[]> {
    if (kind.value === "mine") return props.dataSource.GetOwnedBy(await fetchCurrentAssociateId());
    if (kind.value === "selection") return props.dataSource.GetSelectionItems(Number(targetId.value));
    return props.dataSource.GetOwnedBy(Number(targetId.value));
  }

  async function fetchCurrentAssociateId(): Promise<number> {
    if (currentAssociateId.value === null) currentAssociateId.value = await props.dataSource.GetCurrentAssociateId();
    return currentAssociateId.value;
  }

  function parseScope(value: string | null): { kind: ScopeKind; targetId: number | null } {
    if (value === "mine") return { kind: "mine", targetId: null };
    const [savedKind, id] = (value ?? "").split(":");
    if ((savedKind === "selection" || savedKind === "associate") && Number(id) > 0) return { kind: savedKind, targetId: Number(id) };
    return { kind: "current", targetId: null };
  }

  function readSavedScope(): string | null {
    try {
      return sessionStorage.getItem(scopeStorageKey.value);
    } catch {
      return null;
    }
  }

  function saveScope(value: string) {
    try {
      sessionStorage.setItem(scopeStorageKey.value, value);
    } catch {
      // Storage can be blocked (private mode, iframe rules) - the list then simply is not remembered.
    }
  }

  async function selectItem(id: number) {
    if (id === props.activeId) return;
    if (!(await props.beforeChange())) return;
    emit("select", id);
  }

  /** For "Lagre og neste": whether there is a next record in the list, and moving to it. */
  const hasNext: ComputedRef<boolean> = computed(() => showNavigator.value && index.value >= 0 && index.value < items.value.length - 1);
  defineExpose({ hasNext, goNext: () => step(1) });

  function step(direction: number) {
    const next = items.value[index.value + direction];
    if (next) selectItem(next.id);
  }
</script>

<style scoped>
  /* One line that wraps only when the side panel is too narrow for it. */
  .worklist {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    min-width: 0;
    flex: 1;
  }

  .kind-select {
    width: 150px;
    flex: none;
  }

  .target-select {
    flex: 1 1 160px;
    min-width: 0;
  }

  .navigator {
    flex: 1 1 240px;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .navigator.own-line {
    flex-basis: 100%;
  }

  .item-select {
    flex: 1;
    min-width: 0;
  }

  .worklist :deep(.el-button + .el-button),
  .worklist :deep(.el-button) {
    margin-left: 0;
  }

  .current-item {
    flex: 1 1 160px;
    min-width: 0;
    box-sizing: border-box;
    height: 24px;
    line-height: 22px;
    padding: 0 10px;
    font-size: 12px;
    border: 1px solid #ececec;
    border-radius: 4px;
    background: #f7f7f7;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Narrow side panel: a slimmer list picker leaves room for the record. */
  @container entity-panel (max-width: 560px) {
    .kind-select {
      width: 128px;
    }
  }

  .position {
    flex: none;
    font-size: 12px;
    color: #7a7a7a;
    white-space: nowrap;
  }

  .item-option {
    display: flex;
    flex-direction: column;
    line-height: 1.25;
    padding: 4px 0;
  }

  .item-option-title {
    font-size: 13px;
    font-weight: 700;
  }

  .item-option-meta {
    font-size: 11px;
    color: #7a7a7a;
  }
</style>

<style>
  /* The dropdown is teleported to body, so its taller two-line options are styled globally. */
  .entity-worklist-popper .el-select-dropdown__item {
    height: auto;
    line-height: normal;
  }
</style>
