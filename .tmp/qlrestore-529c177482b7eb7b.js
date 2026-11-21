const ready =
    global.get("settingsReady") === true &&
    global.get("counterConfigReady") === true;

if (!ready) {
    node.status({fill:"yellow", shape:"ring", text:"waiting for config"});
    return null;
}

// Both Mongo queries enter this node. Trigger the expensive Influx/Mongo
// runtime restore only once.
if (flow.get("startupConfigTriggered") === true) {
    return null;
}

flow.set("startupConfigTriggered", true);
node.status({fill:"green", shape:"dot", text:"config ready"});

msg.payload = null;
return msg;