// Only the Element Plus parts the app uses are registered, so the bundle stays small in the side panel.
// A new <el-...> component in a template must be added to the list below, or it will not render.
import {
  ElAlert,
  ElButton,
  ElCheckbox,
  ElCol,
  ElContainer,
  ElDatePicker,
  ElDrawer,
  ElForm,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElLoading,
  ElOption,
  ElRadio,
  ElRadioButton,
  ElRadioGroup,
  ElRow,
  ElSelect,
  ElSwitch,
  ElText
} from "element-plus";
//import "element-plus/dist/index.css" // Original ElementPlus styles
import "./assets/superOfficeStyles.css"; // SuperOffice ElementPlus styles
import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";

// The loader script titles the page after the app's technical name (sale-update) - show the real name instead.
document.title = "Salgsoppdatering";

const app = createApp(App);

app.use(router);

const elementPlusParts = [
  ElAlert,
  ElButton,
  ElCheckbox,
  ElCol,
  ElContainer,
  ElDatePicker,
  ElDrawer,
  ElForm,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElLoading,
  ElOption,
  ElRadio,
  ElRadioButton,
  ElRadioGroup,
  ElRow,
  ElSelect,
  ElSwitch,
  ElText
];
for (const part of elementPlusParts) app.use(part);

app.mount("#app");
