import { reactive } from "vue";
const state = reactive({
  toasts: [],
});
let toastId = 0;
function dismiss(id) {
  const index = state.toasts.findIndex((toast) => toast.id === id);
  if (index !== -1) {
    state.toasts.splice(index, 1);
  }
}
function toast(options) {
  const id = toastId++;
  const { title, description = "", variant = "default", duration = 4000 } = options || {};
  state.toasts.push({
    id,
    title,
    description,
    variant,
  });
  if (duration > 0) {
    setTimeout(() => dismiss(id), duration);
  }
  return id;
}
export function useToast() {
  return {
    toasts: state.toasts,
    toast,
    dismiss,
  };
}
