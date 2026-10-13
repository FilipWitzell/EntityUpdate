<template>
  <el-alert v-if="errorMessage" type="error" :title="errorMessage" />
  <el-container v-loading="pageIsLoading">
    <el-row>
      <el-col :span="24">
        <el-text size="large">A Vue.js app by Cloud Connection</el-text>
      </el-col>
    </el-row>
  </el-container>
</template>

<script lang="ts" setup>
  /**
   * A starting point for a SuperOffice Vue app.
   *
   * Pro tip: If your app is using SuperOffice styling, make all your el-buttons round!
   * Like: <el-button round>Click me</el-button>
   */
  import { onMounted, ref, type Ref } from "vue";

  // Refs
  const pageIsLoading: Ref<boolean> = ref(true);
  const errorMessage: Ref<string> = ref("");

  // Lifecycle hooks
  onMounted(async () => {
    // Get URL parameters, load data, etc..

    pageIsLoading.value = false;
  });

  // Methods
  /** Displays an error message in el-alert component. */
  function displayError(message: string) {
    errorMessage.value = message;
  }
</script>

<style scoped></style>
