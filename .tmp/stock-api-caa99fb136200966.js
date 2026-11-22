msg.statusCode=500;
msg.payload={success:false,error:"Unable to calculate live floor stock",detail:String(msg.error?.message||"Database query failed")};
return msg;