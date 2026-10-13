<template>
  <el-select
    v-model="model"
    value-key="projectId"
    filterable
    remote
    clearable
    :remote-method="search"
    :multiple="multiple"
    :placeholder="placeholder"
    :no-data-text="localNoDataText"
    :style="{ 'min-width': minWidth }"
  >
    <el-option v-for="project in projects" :key="project.projectId" :label="project.name" :value="project"> </el-option>
  </el-select>
</template>

<script lang="ts" setup>
  import { onMounted, ref } from "vue";
  import { SuperOfficeAgent } from "@/agents/SuperOfficeAgent";
  import type { SuperOfficeObject } from "@/types/SuperOfficeObject";
  import { intialValueToNumericIds } from "@/services/utils";

  /** Any properties in requiredFields should be set here. */
  interface Project extends SuperOfficeObject {
    projectId: number;
    name: string;
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
      default: "Søk etter prosjekt..."
    },
    noDataText: {
      type: String,
      default: "Ingen funnet"
    },
    minWidth: String
  });

  // Refs
  const model = defineModel({ type: [Array<Object>, Object, String] }); // Contains the selected project
  const projects = ref<Project[]>([]);
  const localNoDataText = ref<string>(props.noDataText);

  // Other variables
  const requiredFields: string[] = ["projectId", "name"]; // Required fields for component to work.
  const allFields: string[] = [...requiredFields, ...props.additionalFields]; // All fields to fetch from SuperOffice.

  // Methods
  /** Searches for contact by name and adds fetched data to dropdown. */
  const search = async (projectName: string) => {
    if (projectName.length <= 2) return;

    try {
      const superOfficeAgent = new SuperOfficeAgent();
      const projectData = (await superOfficeAgent.QueryEntities({
        entity: "Project",
        select: allFields.toString(),
        filter: `name contains '${projectName}'`,
        top: 500
      })) as Project[];

      // Set data fetched from SuperOffice to dropdown list.
      projects.value = projectData;
    } catch {
      localNoDataText.value = "Feilmelding: Kunne ikke hente data.";
    }
  };

  /** Finds and sets the initial value provided by prop on mount. */
  const setInitialValue = async (projectIds: number[]) => {
    if (projectIds.length <= 0) return;

    try {
      const superOfficeAgent = new SuperOfficeAgent();
      const projectData = (await superOfficeAgent.QueryEntities({
        entity: "Project",
        select: allFields.toString(),
        filter: `projectId in (${projectIds.toString()})`,
        top: 500
      })) as Project[];

      // Set data fetched from SuperOffice to dropdown list.
      projects.value = projectData;

      // Set model value
      if (props.multiple) model.value = projectData;
      else model.value = projectData[0];
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
