import { describe, it, expect, beforeEach } from "vitest";
import { useNotificationStore } from "../notificationStore";

beforeEach(() => {
  useNotificationStore.setState({ notifications: [], unreadCount: 0 });
});

function pushN(n: number) {
  for (let i = 0; i < n; i++) {
    useNotificationStore.getState().push({
      title: `Notification ${i}`,
      message: `message ${i}`,
      severity: "info",
      category: "system",
    });
  }
}

describe("notificationStore", () => {
  it("caps at 100 notifications and recomputes unreadCount (#621)", () => {
    pushN(101);

    const { notifications, unreadCount } = useNotificationStore.getState();
    // Pushing 101 unread notifications must be capped at 100.
    expect(notifications.length).toBe(100);
    // All 100 retained notifications are unread.
    expect(unreadCount).toBe(100);
  });

  it("holds exactly 100 notifications at the cap (#621)", () => {
    pushN(100);

    const { notifications, unreadCount } = useNotificationStore.getState();
    expect(notifications.length).toBe(100);
    expect(unreadCount).toBe(100);
  });
});
