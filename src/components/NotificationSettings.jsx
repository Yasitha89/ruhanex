import { useEffect, useState } from "react";
import { Alert, Button, Space, Typography, message } from "antd";
import { testPush } from "../api/authApi";
import { disablePush, enablePush, getPushState } from "../services/pushNotifications";

const descriptions = {
  loading: "Checking this browser…",
  enabled: "Notifications are enabled for your account on this browser.",
  disabled: "Notifications are disabled on this browser.",
  blocked: "Notifications are blocked. Allow them in your browser's site settings to enable them here.",
  unsupported: "Push notifications are unavailable in this browser. Use a supported browser over HTTPS.",
  "other-account": "This browser receives notifications for another account. Enabling here transfers notifications to your account.",
  unconfirmed: "This browser has a subscription whose account could not be confirmed. Enable to link it to your account, or disable your account's server subscription.",
  error: "Unable to check notification settings. Try enabling notifications again.",
};
export default function NotificationSettings({ user }) {
  const [status, setStatus] = useState("loading");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const refresh = () => getPushState(user.username).then(value => { if (active) setStatus(value); }).catch(() => { if (active) setStatus("error"); });
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    return () => { active = false; window.removeEventListener("focus", refresh); window.removeEventListener("storage", refresh); };
  }, [user.username]);
  const run = async action => {
    setBusy(action); setError("");
    try {
      if (action === "enable") { await enablePush(user.username); message.success("Notifications enabled on this browser."); }
      if (action === "disable") { await disablePush(user.username); message.success("Your notifications are disabled on this browser."); }
      if (action === "test") {
        const result = await testPush();
        if (result.accepted) message.success(`Test accepted for ${result.accepted} device(s). Check your notifications.${result.failed ? ` ${result.failed} device(s) could not be reached.` : ""}`);
        else throw new Error(result.expired ? "Your subscription expired. Enable notifications again." : result.failed ? "The push service could not accept the test. Please try again later." : "No registered devices found. Enable notifications first.");
      }
    } catch (err) { setError(err.response?.data?.error || err.message); }
    finally { setBusy(""); setStatus(await getPushState(user.username).catch(() => "error")); }
  };
  const unavailable = user.mustChangePassword || ["loading", "unsupported"].includes(status);
  return <section aria-label="Push notifications" style={{ marginTop: 24 }}>
    <Typography.Title level={4}>Notifications</Typography.Title>
    <Typography.Paragraph>{descriptions[status]}</Typography.Paragraph>
    <Typography.Paragraph type="secondary">Alerts continue after you close the app, sign out, or your session expires. Disable them here on this device when you no longer want alerts. Opening protected pages still requires sign-in.</Typography.Paragraph>
    {user.mustChangePassword && <Alert type="info" title="Change your initial password before enabling notifications." style={{ marginBottom: 12 }} />}
    {error && <Alert type="error" title={error} role="alert" style={{ marginBottom: 12 }} />}
    <Space wrap>
      <Button type="primary" onClick={() => run("enable")} loading={busy === "enable"} disabled={Boolean(busy) || unavailable || status === "blocked"}>Enable notifications</Button>
      <Button onClick={() => run("disable")} loading={busy === "disable"} disabled={Boolean(busy) || unavailable || !["enabled", "unconfirmed", "blocked"].includes(status)}>Disable notifications</Button>
      <Button onClick={() => run("test")} loading={busy === "test"} disabled={Boolean(busy) || unavailable || status !== "enabled"}>Send test notification</Button>
    </Space>
    <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>The test sends to your registered devices. Allow one minute between tests.</Typography.Paragraph>
  </section>;
}
