<template>
  <el-select
    v-model="model"
    value-key="personId"
    filterable
    remote
    clearable
    :remote-method="search"
    :multiple="multiple"
    :placeholder="placeholder"
    :no-data-text="localNoDataText"
    :style="{ 'min-width': minWidth }"
  >
    <el-option v-for="person in persons" :key="person.personId" :label="person.fullNameWithContact" :value="person"> </el-option>
  </el-select>
</template>

<script lang="ts" setup>
  import { onMounted, ref } from "vue";
  import { SuperOfficeAgent } from "@/agents/SuperOfficeAgent";
  import type { SuperOfficeObject } from "@/types/SuperOfficeObject";
  import { intialValueToNumericIds } from "@/services/utils";

  /** Any properties in requiredFields should be set here. */
  interface Person extends SuperOfficeObject {
    personId: number;
    fullNameWithContact: string;
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
      default: "Søk etter person..."
    },
    noDataText: {
      type: String,
      default: "Ingen funnet"
    },
    minWidth: String
  });

  // Refs
  const model = defineModel({ type: [Array<Object>, Object, String] }); // Contains the selected person
  const persons = ref<Person[]>([]);
  const localNoDataText = ref<string>(props.noDataText);

  // Other variables
  const requiredFields: string[] = ["personId", "fullNameWithContact"]; // Required fields for component to work.
  const allFields: string[] = [...requiredFields, ...props.additionalFields]; // All fields to fetch from SuperOffice.

  // Methods
  /** Searches for person by name and adds fetched data to dropdown. */
  const search = async (personName: string) => {
    if (personName.length <= 2) return;

    try {
      const superOfficeAgent = new SuperOfficeAgent();
      const personData = (await superOfficeAgent.QueryEntities({
        entity: "Person",
        select: allFields.toString(),
        filter: `fullName contains '${personName}'`,
        top: 500
      })) as Person[];

      // Set data fetched from SuperOffice to dropdown list.
      persons.value = personData;
    } catch {
      localNoDataText.value = "Feilmelding: Kunne ikke hente data.";
    }
  };

  /** Finds and sets the initial value when provided by prop on mount. */
  const setInitialValue = async (personIds: number[]) => {
    if (personIds.length <= 0) return;

    try {
      const superOfficeAgent = new SuperOfficeAgent();
      const personData = (await superOfficeAgent.QueryEntities({
        entity: "Person",
        select: allFields.toString(),
        filter: `personId in (${personIds.toString()})`,
        top: 500
      })) as Person[];

      // Set data fetched from SuperOffice to dropdown list.
      persons.value = personData;

      // Set model value from prop.
      if (props.multiple) model.value = personData;
      else model.value = personData[0];
    } catch {
      localNoDataText.value = "Feilmelding: Kunne ikke hente data.";
    }
  };

  // Lifecycle hooks
  // Parent component can provide a initial value to set on mount.
  onMounted(() => {
    if (!props.initialValue) return;

    // Set initial value.
    // Should come from prop as array of strings/numbers when component is "multiple", and when component is not "multiple": String or number.
    const numericIds: number[] = intialValueToNumericIds(props.initialValue as string | Array<string | number>);
    setInitialValue(numericIds);
  });
</script>

<style scoped></style>
