import { ref } from "vue";
import { useToast } from "./useToast.js";
export function useNotifications() {
  const permission = ref(Notification.permission);
  const isSupported = "Notification" in window;
  const { toast } = useToast();
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
      console.warn("Не удалось воспроизвести звук:", error);
    }
  };
  const requestPermission = async () => {
    if (!isSupported) {
      console.warn("Браузер не поддерживает уведомления");
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
      console.error("Ошибка запроса разрешения на уведомления:", error);
      return false;
    }
  };
  const showNotification = async (title, options = {}) => {
    if (!isSupported) {
      console.warn("Браузер не поддерживает уведомления");
      return;
    }
    if (permission.value !== "granted") {
      const granted = await requestPermission();
      if (!granted) {
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
      console.error("Ошибка отображения уведомления:", error);
    }
  };
  const showNewOrderNotification = (order) => {
    const type = order.type === "delivery" ? "Доставка" : "Самовывоз";
    const title = `🔔 Новый заказ #${order.order_number}`;
    const body = `${type} • ${order.total.toLocaleString("ru-RU")}₽\n${order.branch?.name || ""}`;
    playSound();
    return showNotification(title, {
      body,
      tag: `order-${order.id}`,
      requireInteraction: true,
      data: { orderId: order.id },
    });
  };
  const showErrorNotification = (message) => {
    return toast({
      title: "Ошибка",
      description: message,
      variant: "error",
    });
  };
  const showSuccessNotification = (message) => {
    return toast({
      title: "Успешно",
      description: message,
      variant: "success",
    });
  };
  return {
    permission,
    isSupported,
    requestPermission,
    showNotification,
    showNewOrderNotification,
    showErrorNotification,
    showSuccessNotification,
    playSound,
  };
}
