import { API_BASE } from "./api-config";

export async function quizApi(endpoint: string, body: Record<string, any>) {
  const res = await fetch(`${API_BASE}/quiz/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "API Error");
  return data;
}

export async function quizGet(endpoint: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `${API_BASE}/quiz/${endpoint}${qs ? `?${qs}` : ""}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "API Error");
  return data;
}
