<template>
  <el-select
    v-model="model"
    value-key="associateDbId"
    filterable
    remote
    clearable
    :remote-method="search"
    :multiple="multiple"
    :placeholder="placeholder"
    :no-data-text="localNoDataText"
    :style="{ 'min-width': minWidth }"
  >
    <el-option v-for="associate in associates" :key="associate.associateDbId" :label="associate.fullName" :value="associate"></el-option>
  </el-select>
</template>

<script lang="ts" setup>
  import { onMounted, ref } from "vue";
  import { intialValueToNumericIds } from "@/services/utils";
  import { SuperOfficeAgent } from "@/agents/SuperOfficeAgent";
  import type { SuperOfficeObject } from "@/types/SuperOfficeObject";

  /** Any properties in requiredFields should be set here. */
  interface Associate extends SuperOfficeObject {
    associateDbId: number;
    fullName: string;
  }

  const props = defineProps({
    initialValue: {
      type: [Number, String, Array],
      validator(value, props) {
        // When prop 'multiple' is set, initialValue must be array of numbers.
        // When prop 'multiple' is not set, initialValue must be string or number.
        if (props.multiple && !Array.isArray(props.initialValue)) return false;
        if (!props.multiple && typeof props.initialValue !== "number" && typeof props.initialValue !== "string") return false;
        return true;
      }
    },
    additionalFields: {
      type: Array as () => string[],
      default: () => []
    },
    multiple: Boolean,
    placeholder: {
      type: String,
      default: "Søk etter medarbeider..."
    },
    noDataText: {
      type: String,
      default: "Ingen funnet"
    },
    minWidth: String
  });

  // Refs
  const model = defineModel({ type: [Array<Object>, Object, String] }); // Contains the selected associate
  const associates = ref<Associate[]>([]);
  const localNoDataText = ref<string>(props.noDataText);

  // Other variables
  const requiredFields: string[] = ["associateDbId", "fullName"]; // Required fields for component to work.
  const allFields: string[] = [...requiredFields, ...props.additionalFields]; // All fields to fetch from SuperOffice.

  // Methods
  /** Searches for associates by name, and adds fetched data to dropdown. */
  const search = async (associateName: string) => {
    // Search by associate name unless parameter is empty, in which case we will get all associates.
    let filterParam: string = `assocType eq 'Associate'`;
    if (associateName) filterParam = filterParam + ` and fullName contains '${associateName}'`;

    try {
      const superOfficeAgent = new SuperOfficeAgent();
      const associateData = (await superOfficeAgent.QueryEntities({
        entity: "User",
        select: allFields.toString(),
        orderBy: "fullName",
        filter: filterParam
      })) as Associate[];

      // Set data fetched from SuperOffice to dropdown list.
      associates.value = associateData;
    } catch {
      localNoDataText.value = "Feilmelding: Kunne ikke hente data.";
    }
  };

  /** Sets the initial value provided by prop on mount. */
  const setInitialValue = (associateIds: number[]) => {
    if (props.multiple) {
      // For multiple selection, filter associates that match any of the provided IDs
      model.value = associates.value.filter((a) => associateIds.includes(a.associateDbId));
    } else {
      // For single selection, find the first associate that matches the provided ID
      const associate = associates.value.find((a) => a.associateDbId === associateIds[0]);
      if (associate) model.value = associate;
    }
  };

  // Hooks
  onMounted(async () => {
    // Start by getting all associates
    await search("");

    if (props.initialValue) {
      // Set initial value.
      // Should come from prop as array of strings/numbers when component is "multiple", and when component is not "multiple": String or number.
      const numericIds: number[] = intialValueToNumericIds(props.initialValue as string | Array<string | number>);
      setInitialValue(numericIds);
    }
  });
</script>

<style scoped></style>
