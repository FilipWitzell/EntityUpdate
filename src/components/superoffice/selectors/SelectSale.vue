<template>
  <el-select
    v-model="model"
    value-key="saleId"
    filterable
    remote
    clearable
    :remote-method="search"
    :multiple="multiple"
    :placeholder="placeholder"
    :no-data-text="localNoDataText"
    :style="{ 'min-width': minWidth }"
  >
    <el-option v-for="sale in sales" :key="sale.saleId" :label="getFormattedLabel(sale)" :value="sale"> </el-option>
  </el-select>
</template>

<script lang="ts" setup>
  import { onMounted, ref } from "vue";
  import { SuperOfficeAgent } from "@/agents/SuperOfficeAgent";
  import type { SuperOfficeObject } from "@/types/SuperOfficeObject";
  import { intialValueToNumericIds } from "@/services/utils";

  /** Any properties in requiredFields should be set here. */
  interface Sale extends SuperOfficeObject {
    saleId: number;
    heading: string;
    contactId: number;
    contactName: string;
    contactDepartment: string;
  }

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
      default: "Søk etter salg..."
    },
    noDataText: {
      type: String,
      default: "Ingen funnet"
    },
    minWidth: String
  });

  // Refs
  const model = defineModel({ type: [Array<Object>, Object, String] }); // Contains the selected sale
  const sales = ref<Sale[]>([]);
  const localNoDataText = ref<string>(props.noDataText);

  // Other variables
  const requiredFields: string[] = ["saleId", "heading", "contactId"]; // Required fields for component to work.
  const allFields: string[] = [...requiredFields, ...props.additionalFields]; // All fields to fetch from SuperOffice.

  // Methods
  // Formats the selected label for a sale, with or without contact name
  const getFormattedLabel = (sale: Sale): string => {
    if (sale.contactName) return `${sale.heading} (${sale.contactName})`;
    return sale.heading;
  };

  /**
   * Returns an array of unique contact IDs from a given array of sales objects.
   * Duplicates are filtered out.
   */
  const extractUniqueContactIds = (saleData: Sale[]): number[] => {
    const uniqueContactIdsSet: Set<number> = new Set();
    saleData.forEach((sale) => {
      if (sale.contactId <= 0) return;
      uniqueContactIdsSet.add(sale.contactId);
    });

    return Array.from(uniqueContactIdsSet);
  };

  /**
   * Takes an array of sales, and fetches and adds contactId, contact name and department to each sale.
   * Returns the saleData array with added properties.
   */
  const addContactDataToSales = async (saleData: Sale[]): Promise<Sale[]> => {
    if (!saleData || saleData.length <= 0) return saleData;

    // Extract all contactIds from the sales in order to get their contact names.
    const uniqueContactIds: number[] = extractUniqueContactIds(saleData);
    if (uniqueContactIds.length <= 0) return saleData;

    // Fetch all the relevant contacts from SuperOffice
    const superOfficeAgent = new SuperOfficeAgent();
    const contactData = (await superOfficeAgent.QueryEntities({
      entity: "Contact",
      select: "contactId,name,department",
      filter: `contactId in(${uniqueContactIds.toString()})`,
      top: 500
    })) as Contact[];

    // Create a map of all the contactId's to make lookups more efficient
    // Key: Contact ID, Value: Contact object
    const contactMap = new Map(contactData.map((contact) => [contact.contactId, contact]));

    // Insert contact name and department into each sale object, keyed by contactId
    saleData.forEach((sale) => {
      const contact: Contact | undefined = contactMap.get(sale.contactId);
      if (!contact) return;

      // Insert values into sale
      sale.contactName = contact.name;
      sale.contactDepartment = contact.department;
    });

    return saleData;
  };

  /** Searches for sale by heading and adds fetched data to dropdown. */
  const search = async (saleHeading: string) => {
    if (saleHeading.length <= 2) return;

    try {
      const superOfficeAgent = new SuperOfficeAgent();
      let saleData = (await superOfficeAgent.QueryEntities({
        entity: "Sale",
        select: allFields.toString(),
        filter: `heading contains '${saleHeading}'`,
        top: 500
      })) as Sale[];

      // Fetch and add contact data to array
      saleData = await addContactDataToSales(saleData);

      // Set data fetched from SuperOffice to dropdown list.
      sales.value = saleData;
    } catch {
      localNoDataText.value = "Feilmelding: Kunne ikke hente data.";
    }
  };

  /** Finds and sets the initial value provided by prop on mount. */
  const setInitialValue = async (saleIds: number[]) => {
    if (saleIds.length <= 0) return;

    try {
      const superOfficeAgent = new SuperOfficeAgent();
      let saleData = (await superOfficeAgent.QueryEntities({
        entity: "Sale",
        select: allFields.toString(),
        filter: `saleId in (${saleIds.toString()})`,
        top: 500
      })) as Sale[];

      // Fetch and add contact data to array
      saleData = await addContactDataToSales(saleData);

      // Set data fetched from SuperOffice to dropdown list.
      sales.value = saleData;

      // Set model value
      if (props.multiple) model.value = saleData;
      else model.value = saleData[0];
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
