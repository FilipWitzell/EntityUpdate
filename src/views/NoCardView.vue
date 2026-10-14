<template>
  <div class="no-card">
    <el-alert :type="entity ? 'info' : 'warning'" :title="title" :description="description" :closable="false" show-icon />
  </div>
</template>

<script lang="ts" setup>
  import { computed } from "vue";

  /** Shown when the panel is on a card it has no panel for yet, or can not tell which card it is on. */
  const props = defineProps<{ entity?: string }>();

  const NAMES: Record<string, string> = { person: "personkortet", project: "prosjektkortet" };

  const title = computed(() =>
    props.entity ? `Hurtigoppdatering finnes ikke for ${NAMES[props.entity] ?? props.entity} ennå` : "Fant ikke hvilket kort panelet står på"
  );

  const description = computed(() =>
    props.entity
      ? "Panelet virker foreløpig på firma, salg og sak."
      : "Web panel-URL-en må ha med contactId=<cuid>, saleId=<said> og ticketId=<tiid>, eller panelet må åpnes fra et kort i SuperOffice."
  );
</script>

<style scoped>
  .no-card {
    padding: 12px;
  }
</style>
