msg.livePart="influx";
msg.livePartPayload=Array.isArray(msg.payload)?msg.payload:[];
return msg;