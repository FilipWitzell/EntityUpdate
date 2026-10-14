<template>
  <el-input v-if="kind === 'text'" v-model="model" size="small" :disabled="disabled" />

  <!-- Long text grows with what is typed, up to 8 lines, then scrolls. -->
  <el-input
    v-else-if="kind === 'longtext'"
    v-model="model"
    type="textarea"
    :autosize="{ minRows: 2, maxRows: 8 }"
    resize="none"
    :disabled="disabled"
    class="full-width"
  />

  <el-input
    v-else-if="kind === 'amount'"
    v-model="amountModel"
    size="small"
    inputmode="decimal"
    :formatter="formatAmount"
    :parser="parseAmount"
    :disabled="disabled"
    class="full-width amount-input"
  />

  <el-input-number
    v-else-if="kind === 'number'"
    v-model="numberModel"
    size="small"
    :controls="false"
    :disabled="disabled"
    class="full-width"
  />

  <el-checkbox v-else-if="kind === 'checkbox'" v-model="checkboxModel" size="small" :disabled="disabled">Ja</el-checkbox>

  <el-input-number
    v-else-if="kind === 'percent'"
    v-model="numberModel"
    size="small"
    :min="0"
    :max="100"
    :step="10"
    :disabled="disabled"
    class="full-width"
  />

  <el-date-picker
    v-else-if="kind === 'date'"
    v-model="model"
    type="date"
    size="small"
    format="DD.MM.YYYY"
    value-format="YYYY-MM-DD"
    :clearable="false"
    :style="{ width: '100%' }"
    :disabled="disabled"
    class="full-width"
  />

  <!-- Projects and companies are searched as you type. A sale always has a company, so it can not be cleared. -->
  <el-select
    v-else-if="kind === 'project' || kind === 'contact'"
    v-model="model"
    size="small"
    filterable
    remote
    :clearable="kind === 'project'"
    :placeholder="kind === 'contact' ? 'Søk etter firma...' : 'Søk etter prosjekt...'"
    no-data-text="Ingen funnet"
    no-match-text="Ingen treff"
    :remote-method="runSearch"
    :loading="searching"
    :disabled="disabled"
    class="full-width"
  >
    <el-option v-for="item in options" :key="item.id" :label="item.name" :value="item.id" />
  </el-select>

  <el-select
    v-else
    v-model="model"
    size="small"
    filterable
    clearable
    :placeholder="disabled ? '-' : 'Velg...'"
    no-data-text="Ingen verdier"
    no-match-text="Ingen treff"
    :disabled="disabled"
    class="full-width"
  >
    <el-option v-for="item in options" :key="item.id" :label="item.name" :value="item.id" />
  </el-select>
</template>

<script lang="ts" setup>
  import { computed, ref } from "vue";
  import type { FieldKind, FieldValue, ListItem } from "@/types/Fields";

  const props = defineProps<{
    kind: FieldKind;
    options: ListItem[];
    disabled?: boolean;
    /** Only used by the searched kinds, "project" and "contact". */
    search?: (query: string) => Promise<ListItem[]>;
  }>();

  const emit = defineEmits<{ found: [items: ListItem[]] }>();

  const model = defineModel<FieldValue>();
  const searching = ref(false);

  /** el-input-number wants number | undefined, not null. */
  const numberModel = computed({
    get: () => (model.value === null || model.value === undefined ? undefined : Number(model.value)),
    set: (value: number | undefined) => (model.value = value ?? null)
  });

  /** Amounts are typed as "450 000" or "1 750,50" and kept as a number. */
  const amountModel = computed({
    get: () => (model.value === null || model.value === undefined ? "" : String(model.value)),
    set: (text: string) => (model.value = text === "" ? null : Number(text))
  });

  /** "450000.5" -> "450 000,5": spaces between thousands, Norwegian decimal comma. */
  function formatAmount(value: string): string {
    const [whole = "", decimals] = String(value).split(".");
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return decimals === undefined ? grouped : `${grouped},${decimals}`;
  }

  /** Back from what is typed to a plain number string: no spaces, a dot for decimals, digits only. */
  function parseAmount(text: string): string {
    const cleaned = text.replace(/\s/g, "").replace(",", ".").replace(/[^\d.]/g, "");
    const [whole = "", ...rest] = cleaned.split(".");
    return rest.length > 0 ? `${whole}.${rest.join("").slice(0, 2)}` : whole;
  }

  /** Checkboxes are stored as 1/0. */
  const checkboxModel = computed({
    get: () => Number(model.value) === 1,
    set: (checked: boolean) => (model.value = checked ? 1 : 0)
  });

  async function runSearch(query: string) {
    if (!props.search || query.length < 2) return;
    searching.value = true;
    try {
      emit("found", await props.search(query));
    } finally {
      searching.value = false;
    }
  }
</script>

<style scoped>
  .full-width {
    width: 100%;
  }

  .amount-input :deep(input) {
    text-align: right;
  }
</style>
