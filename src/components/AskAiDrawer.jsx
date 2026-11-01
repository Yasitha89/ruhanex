import { useEffect, useRef, useState } from "react";
import { Alert, Button, Drawer, Grid, Input, Popover, Spin } from "antd";
import { SendOutlined, CloseOutlined } from "@ant-design/icons";
import { useLocation } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { sendAiMessage } from "../api/aiChatApi";
import AiChatCharts from "./AiChatCharts";
import "./AskAiDrawer.css";

const LINE_PAGES = {
  "/keda1": "Keda 1",
  "/keda2": "Keda 2",
  "/keda3": "Keda 3",
  "/kiln1": "Kiln 1",
  "/kiln2": "Kiln 2",
  "/gl1": "Glaze Line 1",
  "/gl3": "Glaze Line 3",
};

function RuhanaAvatar({ alt = "" }) {
  return <span className="ruhana-avatar"><img src="/ruhana-avatar.png" alt={alt} /></span>;
}

function RuhanaProfileCard() {
  return (
    <div className="ruhana-profile-card">
      <RuhanaAvatar alt="Ruhana" />
      <strong>Hi, I'm Ruhana!</strong>
      <p>Ask me anything about your production efficiency, downtime, energy consumption, or line performance.</p>
    </div>
  );
}

function RuhanaProfile({ label = "Ruhana" }) {
  return (
    <Popover content={<RuhanaProfileCard />} trigger={["hover", "click", "focus"]} placement="bottomLeft">
      <button type="button" className="ruhana-profile-trigger" aria-label="About Ruhana">
        <RuhanaAvatar />
        <span>{label}</span>
      </button>
    </Popover>
  );
}

export default function AskAiDrawer() {
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState({});
  const [threads, setThreads] = useState({});
  const [pending, setPending] = useState({});
  const [errors, setErrors] = useState({});
  const requests = useRef(new Map());
  const scrollArea = useRef(null);
  const { pathname } = useLocation();
  const screens = Grid.useBreakpoint();
  const line = LINE_PAGES[pathname];
  const energyPage = pathname.includes("energy");
  const subject = line || (energyPage ? "energy" : "production");
  const heading = `Ask Ruhana about ${subject}`;
  const draft = drafts[pathname] || "";
  const messages = threads[pathname] || [];
  const sending = Boolean(pending[pathname]);
  const error = errors[pathname];
  const setDraft = (value) => setDrafts((previous) => ({ ...previous, [pathname]: value }));
  useEffect(() => () => {
    for (const controller of requests.current.values()) controller.abort();
    requests.current.clear();
  }, []);
  useEffect(() => {
    if (open && scrollArea.current) scrollArea.current.scrollTop = scrollArea.current.scrollHeight;
  }, [open, pathname, threads, pending]);

  const send = async () => {
    const question = draft.trim();
    const page = pathname;
    if (!question || requests.current.has(page)) return;
    const controller = new AbortController();
    requests.current.set(page, controller);
    setPending((previous) => ({ ...previous, [page]: question }));
    setErrors((previous) => ({ ...previous, [page]: "" }));
    try {
      const result = await sendAiMessage({
        message: question,
        line,
        history: messages.slice(-20).map(({ role, content }) => ({ role, content: content.slice(0, 4000) })),
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setThreads((previous) => ({ ...previous, [page]: [
        ...(previous[page] || []),
        { role: "user", content: question },
        { role: "assistant", content: result.answer, asOf: result.asOf, sources: result.sources, charts: result.charts, chartWarnings: result.chartWarnings },
      ] }));
      setDrafts((previous) => ({ ...previous, [page]: "" }));
    } catch (err) {
      if (controller.signal.aborted) return;
      const status = err.response?.status;
      const description = status === 401 || status === 403
        ? "Chat access was denied. The server must authenticate your session and forward the private chat credential."
        : err.code === "ECONNABORTED"
          ? "The request timed out. Try a smaller date range."
          : err.response?.data?.error || err.message || "Unable to send your question. Please try again.";
      setErrors((previous) => ({ ...previous, [page]: description }));
    } finally {
      if (!controller.signal.aborted) {
        requests.current.delete(page);
        setPending((previous) => ({ ...previous, [page]: null }));
      }
    }
  };
  const prompts = energyPage ? [
    "Compare CEB and generator energy usage last month",
    "Which days had the highest electricity usage this month?",
    "Compare energy consumption over the last three months",
  ] : [
    `Compare ${line || "factory"} production this month with last month`,
    `What caused the most downtime on ${line || "the production lines"} last week?`,
    `Show historical production trends for ${line || "all lines"}`,
  ];

  return (
    <>
      {!open && (
        <Popover content={<RuhanaProfileCard />} trigger={["hover", "focus"]} placement="topRight">
        <Button
          type="primary"
          size="large"
          icon={<RuhanaAvatar />}
          className="ask-ai-launcher"
          onClick={() => setOpen(true)}
          aria-label={heading}
          aria-haspopup="dialog"
        >
          Ask Ruhana
        </Button>
        </Popover>
      )}
      <Drawer
        title={<span className="ask-ai-drawer-title"><RuhanaProfile label={heading} /></span>}
        placement="right"
        size={screens.md ? 460 : "100%"}
        open={open}
        onClose={() => setOpen(false)}
        className="ask-ai-drawer"
        styles={{ body: { padding: 0, display: "flex", flexDirection: "column" } }}
      >
        <div className="ask-ai-content" ref={scrollArea}>
          {!messages.length && !sending && <>
          <div className="ask-ai-welcome">
            <div className="ask-ai-welcome-icon"><RuhanaAvatar alt="Ruhana, your AI assistant" /></div>
            <div className="ask-ai-welcome-text">
              <h3>Hi, I’m Ruhana</h3>
              <p>Ask me anything about your production efficiency, downtime, energy consumption, or line performance.</p>
            </div>
          </div>
          <div className="ask-ai-prompts" aria-label="Suggested questions">
            {prompts.map((prompt) => (
              <button key={prompt} type="button" onClick={() => setDraft(prompt)}>{prompt}</button>
            ))}
          </div>
          </>}
          <div className="ask-ai-messages" role="log" aria-label="Conversation with Ruhana" aria-live="polite">
            {messages.map((item, index) => (
              <div key={index} className={`ask-ai-message ask-ai-message-${item.role}`}>
                <div className="ask-ai-message-author">{item.role === "assistant" ? <RuhanaProfile /> : <strong>You</strong>}</div>
                <div className={`ask-ai-message-text${item.role === "assistant" ? " ask-ai-markdown" : ""}`}>
                  {item.role === "assistant" ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml disallowedElements={["img"]}>{item.content}</ReactMarkdown>
                  ) : item.content}
                </div>
                {item.role === "assistant" && <AiChatCharts key={`${pathname}-${index}`} charts={item.charts} warnings={item.chartWarnings} />}
                {item.role === "assistant" && item.asOf && Number.isFinite(Date.parse(item.asOf)) && (
                  <small>Answered {new Date(item.asOf).toLocaleString("en-GB", { timeZone: "Asia/Colombo" })}</small>
                )}
              </div>
            ))}
            {sending && <>
              <div className="ask-ai-message ask-ai-message-user"><strong>You</strong><div className="ask-ai-message-text">{pending[pathname]}</div></div>
              <div className="ask-ai-thinking"><Spin size="small" /> Analysing your data…</div>
            </>}
          </div>
        </div>
        <div className="ask-ai-composer">
          {error && <Alert type="error" showIcon title={error} />}
          <Input.TextArea
            aria-label="Your question for Ruhana"
            placeholder={`Ask Ruhana about ${subject}…`}
            value={draft}
            disabled={sending}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                send();
              }
            }}
            onChange={(event) => setDraft(event.target.value)}
            autoSize={{ minRows: 3, maxRows: 7 }}
            maxLength={4000}
            showCount
          />
          <div className="ask-ai-composer-actions">
            <Button type="text" icon={<CloseOutlined />} disabled={!draft || sending} onClick={() => setDraft("")}>Clear</Button>
            <Button type="primary" icon={<SendOutlined />} loading={sending} disabled={!draft.trim() || sending} onClick={send}>{error ? "Retry" : "Send"}</Button>
          </div>
        </div>
      </Drawer>
    </>
  );
}
