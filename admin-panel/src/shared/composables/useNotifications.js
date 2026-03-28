import { ref } from "vue";
import { toast } from "vue-sonner";
import { devError, devWarn } from "@/shared/utils/logger";
import { formatCurrency } from "@/shared/utils/format";
export function useNotifications() {
  const isSupported = typeof window !== "undefined" && "Notification" in window;
  const permission = ref(isSupported ? Notification.permission : "denied");
  const normalizeMessage = (message, fallback) => {
    if (typeof message === "string" && message.trim().length > 0) {
      return message.trim();
    }
    if (message?.message && typeof message.message === "string") {
      return message.message.trim();
    }
    return fallback;
  };
  const playSound = () => {
    try {
      const context = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = context.createOscillator();
      const gainNode = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 880;
      gainNode.gain.value = 0.1;
      oscillator.connect(gainNode);
      gainNode.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.2);
    } catch (error) {
      devWarn("Не удалось воспроизвести звук:", error);
    }
  };
  const requestPermission = async () => {
    if (!isSupported) {
      devWarn("Браузер не поддерживает уведомления");
      return false;
    }
    if (permission.value === "granted") {
      return true;
    }
    try {
      const result = await Notification.requestPermission();
      permission.value = result;
      return result === "granted";
    } catch (error) {
      devError("Ошибка запроса разрешения на уведомления:", error);
      return false;
    }
  };
  const showNotification = async (title, options = {}) => {
    if (!isSupported) {
      devWarn("Браузер не поддерживает уведомления");
      toast.message(title, { description: options.body || "" });
      return;
    }
    if (permission.value !== "granted") {
      const granted = await requestPermission();
      if (!granted) {
        toast.message(title, { description: options.body || "" });
        return;
      }
    }
    try {
      const notification = new Notification(title, {
        icon: "/favicon.ico",
        badge: "/favicon.ico",
        ...options,
      });
      setTimeout(() => notification.close(), 5000);
      return notification;
    } catch (error) {
      devError("Ошибка отображения уведомления:", error);
      toast.message(title, { description: options.body || "" });
    }
  };
  const showNewOrderNotification = (order) => {
    const type = order.type === "delivery" ? "Доставка" : "Самовывоз";
    const title = `🔔 Новый заказ #${order.order_number}`;
    const body = `${type} • ${formatCurrency(order.total)}\n${order.branch?.name || ""}`;
    playSound();
    toast.message(title, { description: body });
    return showNotification(title, {
      body,
      tag: `order-${order.id}`,
      requireInteraction: true,
      data: { orderId: order.id },
    });
  };
  const showErrorNotification = (message) => {
    return toast.error("Ошибка", {
      description: normalizeMessage(message, "Произошла ошибка"),
    });
  };
  const showWarningNotification = (message) => {
    return toast.warning("Внимание", {
      description: normalizeMessage(message, "Проверьте данные"),
    });
  };
  const showSuccessNotification = (message) => {
    return toast.success("Успешно", {
      description: normalizeMessage(message, "Операция выполнена"),
    });
  };
  return {
    permission,
    isSupported,
    requestPermission,
    showNotification,
    showNewOrderNotification,
    showErrorNotification,
    showWarningNotification,
    showSuccessNotification,
    playSound,
  };
}
