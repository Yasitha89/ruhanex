msg.collection="floorStocks";
msg.mode="collection";
msg.operation="find";
msg.payload=[{}, {sort:{_id:-1},limit:1}];
return msg;