// Server-only engine adapter — the single choke point to the judgment SDK.
// Credentials and endpoint come from server env (see SECURITY MODEL in
// app/api/solve/route.ts). Nothing here may be imported by client code.
import { TypeSafeClient, choice, noul, score } from "jev-engine";

export { choice, noul, score };

export function getEngineClient(): TypeSafeClient | null {
  return process.env.JEV_ENGINE_API_KEY
    ? new TypeSafeClient({
        apiKey: process.env.JEV_ENGINE_API_KEY,
        baseURL: process.env.JEV_ENGINE_BASE_URL,
      })
    : null;
}
