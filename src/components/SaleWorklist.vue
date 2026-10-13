<template>
  <div class="worklist">
    <el-select :model-value="kind" size="small" class="kind-select" @change="(value: ScopeKind) => changeKind(value)">
      <el-option label="Salget du står på" value="current" />
      <el-option label="Mine åpne salg" value="mine" />
      <el-option label="Utvalg" value="selection" :disabled="selections.length === 0" />
      <el-option label="Andres åpne salg" value="associate" />
    </el-select>

    <el-select
      v-if="kind === 'selection'"
      :model-value="targetId ?? undefined"
      size="small"
      filterable
      class="target-select"
      placeholder="Velg utvalg..."
      no-data-text="Ingen salgsutvalg"
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

    <span v-if="kind === 'current'" class="current-sale" :title="activeSaleLabel">{{ activeSaleLabel }}</span>

    <!-- Mine: on the same line. Selection/user: on its own line, under the picker of which one. -->
    <div v-if="showNavigator" class="navigator" :class="{ 'own-line': kind === 'selection' || kind === 'associate' }">
      <el-button size="small" circle :disabled="loadingList || index <= 0" title="Forrige salg" aria-label="Forrige salg" @click="step(-1)">
        <PhCaretLeft :size="14" weight="bold" />
      </el-button>

      <el-select
        :model-value="selectedSaleId"
        size="small"
        filterable
        class="sale-select"
        popper-class="sale-worklist-popper"
        :loading="loadingList"
        :placeholder="loadingList ? 'Henter salg...' : sales.length === 0 ? 'Ingen salg' : 'Velg salg...'"
        no-data-text="Ingen salg"
        no-match-text="Ingen treff"
        @change="(saleId: number) => selectSale(saleId)"
      >
        <el-option v-for="sale in sales" :key="sale.saleId" :label="`${sale.heading} · ${sale.contactName}`" :value="sale.saleId">
          <div class="sale-option">
            <span class="sale-option-heading">{{ sale.heading }}</span>
            <span class="sale-option-meta">{{ optionMeta(sale) }}</span>
          </div>
        </el-option>
      </el-select>

      <el-button
        size="small"
        circle
        :disabled="loadingList || index < 0 || index >= sales.length - 1"
        title="Neste salg"
        aria-label="Neste salg"
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
  import type { ListItem, SaleDataSource, SaleListItem, SaleSelection } from "@/types/SaleQuickUpdate";

  type ScopeKind = "current" | "mine" | "selection" | "associate";

  const props = defineProps<{
    dataSource: SaleDataSource;
    associates: ListItem[];
    /** The sale shown in the panel right now. */
    activeSaleId: number;
    /** The sale SuperOffice has open on the sale card. */
    contextSaleId: number;
    /** "Heading · Company" of the sale shown, for the line under the picker. */
    activeSaleLabel: string;
    /** Asked before switching sale, so unsaved changes are not lost by accident. */
    beforeChange: () => Promise<boolean>;
  }>();

  const emit = defineEmits<{ select: [saleId: number] }>();

  /** What to work through, and for "selection"/"associate" which one. */
  const kind: Ref<ScopeKind> = ref("current");
  const targetId: Ref<number | null> = ref(null);
  const sales: Ref<SaleListItem[]> = ref([]);
  const loadingList: Ref<boolean> = ref(false);
  const currentAssociateId: Ref<number | null> = ref(null);
  const selections: Ref<SaleSelection[]> = ref([]);

  const selectedSaleId: ComputedRef<number | undefined> = computed(() =>
    sales.value.some((sale) => sale.saleId === props.activeSaleId) ? props.activeSaleId : undefined
  );
  const index: ComputedRef<number> = computed(() => sales.value.findIndex((sale) => sale.saleId === props.activeSaleId));
  const otherAssociates: ComputedRef<ListItem[]> = computed(() => props.associates.filter((associate) => associate.id !== currentAssociateId.value));

  /** The navigator shows once there is a list to work through. */
  const showNavigator: ComputedRef<boolean> = computed(() => kind.value === "mine" || targetId.value !== null);

  const positionText: ComputedRef<string> = computed(() => {
    if (loadingList.value) return "";
    if (sales.value.length === 0) return "0 salg";
    return index.value >= 0 ? `${index.value + 1} av ${sales.value.length}` : `${sales.value.length} salg`;
  });

  /**
   * The chosen list is remembered in this browser tab: SuperOffice reloads the side panel when the
   * sale card moves to another sale, and the user should land back in the same list, not start over.
   * Stored as "current", "mine", "selection:<id>" or "associate:<id>".
   */
  const SCOPE_STORAGE_KEY = "saleUpdate.worklistScope";

  onMounted(async () => {
    // Selections first, so a remembered selection has its name to show.
    selections.value = await fetchSelections();

    const saved = parseScope(readSavedScope());
    if (saved.kind === "current") return;
    kind.value = saved.kind;
    targetId.value = saved.targetId;
    if (showNavigator.value) await loadList(false);
  });

  /** A panel without selections still works, so a failure here only disables the choice. */
  async function fetchSelections(): Promise<SaleSelection[]> {
    try {
      return await props.dataSource.GetSaleSelections();
    } catch (e) {
      console.error("Could not fetch sale selections:", e);
      return [];
    }
  }

  async function changeKind(value: ScopeKind) {
    // Picking "Utvalg" or "Andres åpne salg" only opens the second picker - nothing changes until one is chosen.
    if (value === "selection" || value === "associate") {
      kind.value = value;
      targetId.value = null;
      sales.value = [];
      return;
    }

    if (!(await props.beforeChange())) return;
    kind.value = value;
    targetId.value = null;
    saveScope(value);

    if (value === "current") {
      sales.value = [];
      emit("select", props.contextSaleId);
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

  /** Loads the sales for the chosen list. With selectFirst, jumps to the top of the list if the sale shown is not in it. */
  async function loadList(selectFirst: boolean) {
    loadingList.value = true;
    try {
      sales.value = await fetchListSales();
      const first = sales.value[0];
      if (selectFirst && first && index.value < 0) emit("select", first.saleId);
    } catch (e) {
      ElMessage.error("Kunne ikke hente salgene.");
      console.error(e);
    } finally {
      loadingList.value = false;
    }
  }

  async function fetchListSales(): Promise<SaleListItem[]> {
    if (kind.value === "mine") return props.dataSource.GetOpenSales(await fetchCurrentAssociateId());
    if (kind.value === "selection") return props.dataSource.GetSelectionSales(Number(targetId.value));
    return props.dataSource.GetOpenSales(Number(targetId.value));
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
      return sessionStorage.getItem(SCOPE_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  function saveScope(value: string) {
    try {
      sessionStorage.setItem(SCOPE_STORAGE_KEY, value);
    } catch {
      // Storage can be blocked (private mode, iframe rules) - the list then simply is not remembered.
    }
  }

  async function selectSale(saleId: number) {
    if (saleId === props.activeSaleId) return;
    if (!(await props.beforeChange())) return;
    emit("select", saleId);
  }

  /** For "Lagre og neste": whether there is a next sale in the list, and moving to it. */
  const hasNext: ComputedRef<boolean> = computed(() => showNavigator.value && index.value >= 0 && index.value < sales.value.length - 1);
  defineExpose({ hasNext, goNext: () => step(1) });

  function step(direction: number) {
    const next = sales.value[index.value + direction];
    if (next) selectSale(next.saleId);
  }

  function optionMeta(sale: SaleListItem): string {
    const amount = sale.amount.toLocaleString("nb-NO", { maximumFractionDigits: 0 });
    const date = sale.saledate ? new Date(sale.saledate).toLocaleDateString("nb-NO", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";
    return [sale.contactName, amount, date].filter(Boolean).join(" · ");
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

  .sale-select {
    flex: 1;
    min-width: 0;
  }

  .worklist :deep(.el-button + .el-button),
  .worklist :deep(.el-button) {
    margin-left: 0;
  }

  .current-sale {
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

  /* Narrow side panel: a slimmer list picker leaves room for the sale. */
  @container sale-panel (max-width: 560px) {
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

  .sale-option {
    display: flex;
    flex-direction: column;
    line-height: 1.25;
    padding: 4px 0;
  }

  .sale-option-heading {
    font-size: 13px;
    font-weight: 700;
  }

  .sale-option-meta {
    font-size: 11px;
    color: #7a7a7a;
  }
</style>

<style>
  /* The dropdown is teleported to body, so its taller two-line options are styled globally. */
  .sale-worklist-popper .el-select-dropdown__item {
    height: auto;
    line-height: normal;
  }
</style>
