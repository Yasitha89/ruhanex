return (function safeError(msg) {
  msg.statusCode = 502;
  msg.headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  msg.payload = { success: false, error: 'Chat service could not complete the request. Check connectivity and server configuration.' };
  delete msg.aiChat;
  delete msg.error;
  return msg;
})(msg, env);