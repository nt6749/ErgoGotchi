/**
 * Safe backend configuration and probe client for the Onboarding Wizard and Settings tab.
 * Implements strict AbortController timeouts to prevent infinite UI freezes,
 * and proxies webhook/Gemini tests through the backend to avoid browser CORS failures.
 */

export interface BackendConfigStatus {
  online: boolean;
  storage?: string;
  gemini_configured: boolean;
  gemini_model?: string;
  webhook_configured: boolean;
  webhook_preview?: string;
}

const API_BASE =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
  'http://localhost:8000';

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 3500): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** 1. Auto-detect backend health & whether .env already has keys configured. */
export async function probeBackendStatus(): Promise<BackendConfigStatus> {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/config/status`, {}, 2000);
    if (!res.ok) return { online: false, gemini_configured: false, webhook_configured: false };
    const data = await res.json();
    return { online: true, ...data };
  } catch {
    return { online: false, gemini_configured: false, webhook_configured: false };
  }
}

/** 2. Test either 'gemini' or 'webhook' via backend proxy (avoids browser CORS issues and enforces SSRF allowlist). */
export async function testIntegration(
  target: 'gemini' | 'webhook',
  value: string
): Promise<{ ok: boolean; message: string }> {
  try {
    const body =
      target === 'gemini'
        ? { target: 'gemini', gemini_api_key: value.trim() }
        : { target: 'webhook', webhook_url: value.trim() };
    const res = await fetchWithTimeout(
      `${API_BASE}/config/test`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      4500
    );
    if (!res.ok) {
      return { ok: false, message: `Server returned status ${res.status}.` };
    }
    return await res.json();
  } catch {
    return {
      ok: false,
      message: 'Backend offline — running in 100% local Edge Companion Mode.',
    };
  }
}

/** 3. Save non-empty overrides or clear them without wiping server .env defaults. */
export async function saveIntegrationConfig(
  geminiApiKey: string,
  webhookUrl: string,
  clearWebhook: boolean = false,
  clearGeminiKey: boolean = false
): Promise<{ updated: boolean; error?: string }> {
  const cleanKey = geminiApiKey.trim();
  const cleanUrl = webhookUrl.trim();

  if (clearGeminiKey) {
    localStorage.removeItem('ergogotchi.geminiApiKey');
  } else if (cleanKey) {
    localStorage.setItem('ergogotchi.geminiApiKey', cleanKey);
  }

  if (clearWebhook) {
    localStorage.removeItem('ergogotchi.webhookUrl');
  } else if (cleanUrl) {
    localStorage.setItem('ergogotchi.webhookUrl', cleanUrl);
  }

  if (!cleanKey && !cleanUrl && !clearWebhook && !clearGeminiKey) {
    return { updated: true };
  }

  try {
    const res = await fetchWithTimeout(
      `${API_BASE}/config`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(cleanKey ? { gemini_api_key: cleanKey } : {}),
          ...(cleanUrl ? { webhook_url: cleanUrl } : {}),
          ...(clearWebhook ? { clear_webhook: true } : {}),
          ...(clearGeminiKey ? { clear_gemini_key: true } : {}),
        }),
      },
      3500
    );
    if (!res.ok) {
      try {
        const errJson = await res.json();
        return { updated: false, error: errJson.error || errJson.detail || `Server error (${res.status})` };
      } catch {
        return { updated: false, error: `Server error (${res.status})` };
      }
    }
    return await res.json();
  } catch {
    // Edge mode fallback: continues seamlessly
    return { updated: true };
  }
}
