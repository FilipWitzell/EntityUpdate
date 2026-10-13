<template>
  <el-select
    v-model="model"
    value-key="contactId"
    filterable
    remote
    clearable
    :remote-method="search"
    :multiple="multiple"
    :placeholder="placeholder"
    :no-data-text="localNoDataText"
    :style="{ 'min-width': minWidth }"
  >
    <el-option
      v-for="contact in contacts"
      :key="contact.contactId"
      :label="contact.department ? `${contact.name} (${contact.department})` : contact.name"
      :value="contact"
    >
      <el-row class="contact-row">
        <el-col :span="18">{{ contact.name }}</el-col>
        <el-col :span="6" class="contact-department">{{ contact.department }}</el-col>
      </el-row>
    </el-option>
  </el-select>
</template>

<script lang="ts" setup>
  import { onMounted, ref } from "vue";
  import { SuperOfficeAgent } from "@/agents/SuperOfficeAgent";
  import type { SuperOfficeObject } from "@/types/SuperOfficeObject";
  import { intialValueToNumericIds } from "@/services/utils";

  /** Any properties in requiredFields should be set here. */
  interface Contact extends SuperOfficeObject {
    contactId: number;
    name: string;
    department: string;
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
      default: "Søk etter firma..."
    },
    noDataText: {
      type: String,
      default: "Ingen funnet"
    },
    minWidth: String
  });

  // Refs
  const model = defineModel({ type: [Array<Object>, Object, String] }); // Contains the selected contact
  const contacts = ref<Contact[]>([]);
  const localNoDataText = ref<string>(props.noDataText);

  // Other variables
  const requiredFields: string[] = ["contactId", "name", "department"]; // Required fields for component to work.
  const allFields: string[] = [...requiredFields, ...props.additionalFields]; // All fields to fetch from SuperOffice.

  // Methods
  /** Searches for contact by name and adds fetched data to dropdown. */
  const search = async (contactName: string) => {
    if (contactName.length <= 2) return;

    try {
      const superOfficeAgent = new SuperOfficeAgent();
      const contactData = (await superOfficeAgent.QueryEntities({
        entity: "Contact",
        select: allFields.toString(),
        filter: `name contains '${contactName}'`,
        top: 500
      })) as Contact[];

      // Set data fetched from SuperOffice to dropdown list.
      contacts.value = contactData;
    } catch {
      localNoDataText.value = "Feilmelding: Kunne ikke hente data.";
    }
  };

  /** Finds and sets the initial value provided by prop on mount. */
  const setInitialValue = async (contactIds: number[]) => {
    if (contactIds.length <= 0) return;

    try {
      const superOfficeAgent = new SuperOfficeAgent();
      const contactData = (await superOfficeAgent.QueryEntities({
        entity: "Contact",
        select: allFields.toString(),
        filter: `contactId in (${contactIds.toString()})`,
        top: 500
      })) as Contact[];

      // Set data fetched from SuperOffice to dropdown list.
      contacts.value = contactData;

      // Set model value
      if (props.multiple) model.value = contactData;
      else model.value = contactData[0];
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

<style scoped>
  .contact-row {
    align-items: center;
    margin: 0;
  }

  .contact-department {
    text-align: right;
    color: #8492a6;
  }
</style>
