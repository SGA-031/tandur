import { q } from "../db/index.ts";
/** SMS gateway mock: production sends via the operator's SMS provider; here it lands in the farmer's in-app inbox. */
export async function notifyFarmer(farmerId: string, body: string, at?: Date) {
  await q(`INSERT INTO notifications (farmer_id, channel, body, created_at) VALUES ($1,'sms',$2,$3)`, [farmerId, body, at ?? new Date()]);
}
