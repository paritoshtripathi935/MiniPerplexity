// Add API host from environment variable
const API_HOST = import.meta.env.VITE_API_HOST || 'http://127.0.0.1:8000';

/**
 * `getToken` matches the signature returned by Clerk's `useAuth()` hook
 * (`@clerk/clerk-react`). When provided, every request gets an
 * `Authorization: Bearer <jwt>` header so the backend can identify the user.
 *
 * Pass `undefined` for guest/anonymous flows — the backend treats missing
 * tokens as anonymous, which matches the "Continue as guest" UX.
 */
export type GetToken = (() => Promise<string | null>) | null | undefined;

async function authHeaders(getToken: GetToken): Promise<Record<string, string>> {
  if (!getToken) return {};
  try {
    const token = await getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

/**
 * Perform a search with the given query and session ID.
 *
 * `campaignId` anchors a brand-new session to the active campaign in the
 * URL (post-#79 follow-up: tool routes live under
 * /projects/:p/c/:c/...). Ignored server-side once the session exists.
 */
export async function performSearch(
  query: string,
  sessionId: string,
  previousQueries: string[] = [],
  customUrl?: string,
  onProgress?: (url: string) => void,
  getToken?: GetToken,
  campaignId?: string | null,
) {
  const qp = new URLSearchParams({ custom_url: customUrl || '' });
  if (campaignId) qp.set('campaign_id', campaignId);
  const queryParams = qp.toString();
  const response = await fetch(`${API_HOST}/api/v1/search/${sessionId}?${queryParams}`, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'Content-Type': 'application/json',
      ...(await authHeaders(getToken)),
    },
    body: JSON.stringify({
      query,
      previous_queries: previousQueries
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to perform search: ${response.status} ${response.statusText}`);
  }

  const searchResults = await response.json();

  if (onProgress && searchResults) {
    // Stagger the progress callbacks so the live "Reading sources" list in
    // the chat fills in rather than appearing all at once. Kept short so we
    // don't artificially slow down the path to the /answer call below.
    for (const result of searchResults) {
      onProgress(result.url);
      await new Promise(resolve => setTimeout(resolve, 80));
    }
  }

  return searchResults;
}

/**
 * Payload emitted on the final `done` SSE event from /answer/stream.
 * Carries everything the JSON /answer endpoint returned, minus the
 * `answer` body itself (which the client already accumulated from tokens).
 */
export interface StreamDoneEvent {
  message_id: string;
  latency_ms: number;
  citations: string[];
  search_results: any[];
}

interface StreamAnswerArgs {
  query: string;
  sessionId: string;
  searchResults: any[];
  previousQueries?: string[];
  playId?: string;
  /** Active-campaign anchor for new-session creation. Ignored server-side
   *  once the session exists (project/campaign are snapshotted at create). */
  campaignId?: string | null;
  onToken: (text: string) => void;
  onDone: (event: StreamDoneEvent) => void;
  onError?: (detail: string) => void;
  getToken?: GetToken;
  signal?: AbortSignal;
}

/**
 * POST /answer/{session_id}/stream and dispatch token / done / error
 * events as they arrive.
 *
 * Manual SSE parsing because EventSource is GET-only and the answer
 * request has a JSON body. The wire format is the standard SSE one —
 * `event: <name>\ndata: <json>\n\n` — so the parser stays small. We
 * buffer across reads in case a network packet splits a frame.
 */
export async function streamAnswer(args: StreamAnswerArgs): Promise<void> {
  const qpParams = new URLSearchParams();
  if (args.playId) qpParams.set('play_id', args.playId);
  if (args.campaignId) qpParams.set('campaign_id', args.campaignId);
  const qp = qpParams.toString() ? `?${qpParams.toString()}` : '';
  const response = await fetch(
    `${API_HOST}/api/v1/answer/${args.sessionId}/stream${qp}`,
    {
      method: 'POST',
      headers: {
        'accept': 'text/event-stream',
        'Content-Type': 'application/json',
        ...(await authHeaders(args.getToken)),
      },
      body: JSON.stringify({
        query: args.query,
        search_results: args.searchResults,
        previous_queries: args.previousQueries ?? [],
      }),
      signal: args.signal,
    }
  );

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => response.statusText);
    throw new Error(`Failed to start stream: ${detail || response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  const handleFrame = (frame: string) => {
    let eventName = 'message';
    const dataLines: string[] = [];
    for (const raw of frame.split('\n')) {
      if (raw.startsWith('event:')) eventName = raw.slice(6).trim();
      else if (raw.startsWith('data:')) dataLines.push(raw.slice(5).trim());
    }
    if (dataLines.length === 0) return;
    let payload: any;
    try {
      payload = JSON.parse(dataLines.join('\n'));
    } catch {
      return;
    }
    if (eventName === 'token' && typeof payload?.text === 'string') {
      args.onToken(payload.text);
    } else if (eventName === 'done') {
      args.onDone(payload as StreamDoneEvent);
    } else if (eventName === 'error') {
      args.onError?.(String(payload?.detail ?? 'stream error'));
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // Frames are separated by a blank line (CRLF tolerant). Process every
    // complete frame in the buffer and keep the trailing partial.
    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      if (frame.trim()) handleFrame(frame);
    }
  }
  // Drain any trailing complete-but-unterminated frame.
  if (buffer.trim()) handleFrame(buffer);
}

/**
 * Deletes a user session.
 */
export async function clearSession(sessionId: string, getToken?: GetToken) {
  const response = await fetch(`${API_HOST}/api/v1/session/${sessionId}`, {
    method: 'DELETE',
    headers: { ...(await authHeaders(getToken)) },
  });

  if (!response.ok) {
    throw new Error(`Failed to clear session: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Gets the chat history for a session.
 */
export async function getSessionHistory(sessionId: string, getToken?: GetToken) {
  const response = await fetch(`${API_HOST}/api/v1/session/${sessionId}/history`, {
    headers: { ...(await authHeaders(getToken)) },
  });

  if (!response.ok) {
    throw new Error(`Failed to get session history: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

export interface UserProfile {
  id: string;
  clerk_user_id: string | null;
  email: string | null;
  display_name: string | null;
  image_url: string | null;
  /** Chosen chat-model slug. Always populated — backend substitutes its
   * default when the user hasn't picked one. */
  preferred_chat_model: string;
}

/**
 * Fetch the current user's profile. Requires a valid Clerk token.
 */
export async function getMe(getToken: GetToken): Promise<UserProfile> {
  const response = await fetch(`${API_HOST}/api/v1/me`, {
    headers: { ...(await authHeaders(getToken)) },
  });
  if (!response.ok) {
    throw new Error(`Failed to load profile: ${response.status} ${response.statusText}`);
  }
  return await response.json();
}

// ---------- Chat model catalog -------------------------------------------

export interface ChatModelOption {
  id: string;
  label: string;
  description: string;
  recommended: boolean;
}

/** Public — no auth required. Populates the model selector dropdown. */
export async function listChatModels(): Promise<{
  models: ChatModelOption[];
  default: string;
}> {
  const response = await fetch(`${API_HOST}/api/v1/models`);
  if (!response.ok) throw new Error(`Failed to load models: ${response.status}`);
  return await response.json();
}

/** Persist the user's chat-model preference. */
export async function setPreferredChatModel(
  modelId: string,
  getToken: GetToken,
): Promise<{ preferred_chat_model: string }> {
  const response = await fetch(`${API_HOST}/api/v1/me/preferred-model`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders(getToken)) },
    body: JSON.stringify({ model_id: modelId }),
  });
  if (!response.ok) throw new Error(`Failed to save model preference: ${response.status}`);
  return await response.json();
}

// ---------- History features (signed-in only) -----------------------------

export interface SessionListItem {
  id: string;
  title: string | null;
  created_at: string;
  last_accessed_at: string;
  is_archived: boolean;
  message_count: number;
  /** Short trimmed preview of the most recent message in the session. */
  last_message_excerpt: string | null;
  /** Active-campaign scoping anchor; nullable for legacy rows. */
  campaign_id: string | null;
  project_id: string | null;
}

export interface SearchHit {
  session_id: string;
  message_id: string;
  role: 'user' | 'assistant' | 'system';
  title: string | null;
  snippet: string;            // contains <mark>…</mark> highlights
  rank: number;
  matched_at: string;
  last_accessed_at: string;
}

export async function listSessions(
  getToken: GetToken,
  opts: {
    includeArchived?: boolean;
    limit?: number;
    offset?: number;
    /** Narrow to the active campaign (operator-tool scope). */
    campaignId?: string | null;
    /** Broader: all of a project's work across campaigns. Ignored when
     *  campaignId is also set. */
    projectId?: string | null;
  } = {}
): Promise<{ sessions: SessionListItem[] }> {
  const qp = new URLSearchParams();
  if (opts.includeArchived) qp.set('include_archived', 'true');
  if (opts.limit !== undefined) qp.set('limit', String(opts.limit));
  if (opts.offset !== undefined) qp.set('offset', String(opts.offset));
  if (opts.campaignId) qp.set('campaign_id', opts.campaignId);
  else if (opts.projectId) qp.set('project_id', opts.projectId);
  const url = `${API_HOST}/api/v1/sessions${qp.toString() ? `?${qp}` : ''}`;
  const response = await fetch(url, { headers: { ...(await authHeaders(getToken)) } });
  if (!response.ok) throw new Error(`Failed to list sessions: ${response.status}`);
  return await response.json();
}

export async function patchSession(
  sessionId: string,
  payload: { title?: string; is_archived?: boolean },
  getToken: GetToken
) {
  const response = await fetch(`${API_HOST}/api/v1/session/${sessionId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders(getToken)),
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Failed to update session: ${response.status}`);
  return await response.json();
}

/**
 * Trigger a browser download of the session's markdown export.
 */
export async function downloadSessionExport(sessionId: string, getToken?: GetToken) {
  const response = await fetch(`${API_HOST}/api/v1/session/${sessionId}/export`, {
    headers: { ...(await authHeaders(getToken)) },
  });
  if (!response.ok) throw new Error(`Failed to export session: ${response.status}`);

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `miniperplexity-${sessionId}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function searchHistory(
  q: string,
  getToken: GetToken,
  limit: number = 20
): Promise<{ query: string; results: SearchHit[] }> {
  const qp = new URLSearchParams({ q, limit: String(limit) });
  const response = await fetch(`${API_HOST}/api/v1/search?${qp}`, {
    headers: { ...(await authHeaders(getToken)) },
  });
  if (!response.ok) throw new Error(`Failed to search: ${response.status}`);
  return await response.json();
}

// ---------- Brand profile (PaidPilot V1) ----------------------------------

export interface BrandProfile {
  user_id: string;
  company_name: string | null;
  website: string | null;
  icp_description: string | null;
  primary_channels: string[];
  target_cac: number | null;
  target_roas: number | null;
  voice_guidelines: string | null;
  current_campaigns_summary: string | null;
  onboarding_completed: boolean;
}

export type BrandProfileUpdate = Partial<Omit<BrandProfile, 'user_id' | 'onboarding_completed'>> & {
  mark_completed?: boolean;
};

export async function getBrandProfile(getToken: GetToken): Promise<BrandProfile> {
  const response = await fetch(`${API_HOST}/api/v1/brand-profile`, {
    headers: { ...(await authHeaders(getToken)) },
  });
  if (!response.ok) throw new Error(`Failed to load brand profile: ${response.status}`);
  return await response.json();
}

export async function putBrandProfile(
  payload: BrandProfileUpdate,
  getToken: GetToken
): Promise<BrandProfile> {
  const response = await fetch(`${API_HOST}/api/v1/brand-profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders(getToken)) },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Failed to save brand profile: ${response.status}`);
  return await response.json();
}

// ---------- Plays catalog -------------------------------------------------

export interface PlayInput {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'number';
  required?: boolean;
  placeholder?: string;
  options?: string[];
}

export interface Play {
  id: string;
  title: string;
  category: string;
  description: string;
  icon?: string;
  inputs: PlayInput[];
}

export async function listPlays(): Promise<{ plays: Play[] }> {
  const response = await fetch(`${API_HOST}/api/v1/plays`);
  if (!response.ok) throw new Error(`Failed to load plays: ${response.status}`);
  return await response.json();
}

// ---------- Next-step suggestions ----------------------------------------

/**
 * Generate or fetch cached follow-up suggestions for an assistant message.
 * The backend persists the result on `messages.next_steps` so subsequent
 * loads of the same conversation are free.
 */
export async function getNextSteps(
  messageId: string,
  getToken?: GetToken,
): Promise<{ items: string[] }> {
  const response = await fetch(`${API_HOST}/api/v1/messages/${messageId}/next-steps`, {
    method: 'POST',
    headers: { ...(await authHeaders(getToken)) },
  });
  if (!response.ok) throw new Error(`Failed to load next steps: ${response.status}`);
  return await response.json();
}

// ---------- Projects + Campaigns ------------------------------------------

export interface ProjectSummary {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  /** Live (non-archived) campaign count. Populated on GET /projects;
   *  zero on POST/PATCH responses that don't carry the aggregation. */
  campaign_count: number;
  /** Live (non-archived) session count owned by this project. */
  session_count: number;
  /** Most recent session activity in this project, or null if no
   *  sessions exist yet. */
  last_session_at: string | null;
}

export interface CampaignSummary {
  id: string;
  project_id: string;
  name: string;
  objective: string | null;
  starts_on: string | null;
  ends_on: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface CampaignInput {
  name: string;
  objective?: string | null;
  starts_on?: string | null;
  ends_on?: string | null;
}

async function jsonRequest<T>(
  url: string,
  init: RequestInit,
  getToken: GetToken,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
      ...(await authHeaders(getToken)),
    },
  });
  if (!response.ok) {
    let detail: string | undefined;
    try {
      const body = await response.json();
      detail = typeof body?.detail === 'string' ? body.detail : undefined;
    } catch {
      // ignore
    }
    const err = new Error(detail || `${response.status} ${response.statusText}`);
    (err as any).status = response.status;
    throw err;
  }
  return (await response.json()) as T;
}

export async function listProjects(
  getToken: GetToken,
  opts: { includeArchived?: boolean } = {},
): Promise<ProjectSummary[]> {
  const qs = opts.includeArchived ? '?include_archived=true' : '';
  return jsonRequest<ProjectSummary[]>(
    `${API_HOST}/api/v1/projects${qs}`,
    { method: 'GET' },
    getToken,
  );
}

export async function createProject(
  name: string,
  getToken: GetToken,
): Promise<ProjectSummary> {
  return jsonRequest<ProjectSummary>(
    `${API_HOST}/api/v1/projects`,
    { method: 'POST', body: JSON.stringify({ name }) },
    getToken,
  );
}

export async function renameProject(
  projectId: string,
  name: string,
  getToken: GetToken,
): Promise<ProjectSummary> {
  return jsonRequest<ProjectSummary>(
    `${API_HOST}/api/v1/projects/${projectId}`,
    { method: 'PATCH', body: JSON.stringify({ name }) },
    getToken,
  );
}

export async function archiveProject(
  projectId: string,
  getToken: GetToken,
): Promise<ProjectSummary> {
  return jsonRequest<ProjectSummary>(
    `${API_HOST}/api/v1/projects/${projectId}/archive`,
    { method: 'POST' },
    getToken,
  );
}

export async function unarchiveProject(
  projectId: string,
  getToken: GetToken,
): Promise<ProjectSummary> {
  return jsonRequest<ProjectSummary>(
    `${API_HOST}/api/v1/projects/${projectId}/unarchive`,
    { method: 'POST' },
    getToken,
  );
}

export async function listCampaigns(
  projectId: string,
  getToken: GetToken,
  opts: { includeArchived?: boolean } = {},
): Promise<CampaignSummary[]> {
  const qs = opts.includeArchived ? '?include_archived=true' : '';
  return jsonRequest<CampaignSummary[]>(
    `${API_HOST}/api/v1/projects/${projectId}/campaigns${qs}`,
    { method: 'GET' },
    getToken,
  );
}

export async function createCampaign(
  projectId: string,
  payload: CampaignInput,
  getToken: GetToken,
): Promise<CampaignSummary> {
  return jsonRequest<CampaignSummary>(
    `${API_HOST}/api/v1/projects/${projectId}/campaigns`,
    { method: 'POST', body: JSON.stringify(payload) },
    getToken,
  );
}

export async function updateCampaign(
  projectId: string,
  campaignId: string,
  payload: Partial<CampaignInput>,
  getToken: GetToken,
): Promise<CampaignSummary> {
  return jsonRequest<CampaignSummary>(
    `${API_HOST}/api/v1/projects/${projectId}/campaigns/${campaignId}`,
    { method: 'PATCH', body: JSON.stringify(payload) },
    getToken,
  );
}

export async function archiveCampaign(
  projectId: string,
  campaignId: string,
  getToken: GetToken,
): Promise<CampaignSummary> {
  return jsonRequest<CampaignSummary>(
    `${API_HOST}/api/v1/projects/${projectId}/campaigns/${campaignId}/archive`,
    { method: 'POST' },
    getToken,
  );
}

export async function unarchiveCampaign(
  projectId: string,
  campaignId: string,
  getToken: GetToken,
): Promise<CampaignSummary> {
  return jsonRequest<CampaignSummary>(
    `${API_HOST}/api/v1/projects/${projectId}/campaigns/${campaignId}/unarchive`,
    { method: 'POST' },
    getToken,
  );
}

// Per-project brand profile (richer surface than the legacy
// `/brand-profile` route, which only addresses the user's default project).

export interface ProjectBrandProfile {
  project_id: string;
  company_name: string | null;
  website: string | null;
  icp_description: string | null;
  primary_channels: string[];
  target_cac: number | null;
  target_roas: number | null;
  voice_guidelines: string | null;
  current_campaigns_summary: string | null;
  onboarding_completed: boolean;
}

export type ProjectBrandProfileUpdate = Partial<
  Omit<ProjectBrandProfile, 'project_id' | 'onboarding_completed'>
> & { mark_completed?: boolean };

export async function getProjectBrandProfile(
  projectId: string,
  getToken: GetToken,
): Promise<ProjectBrandProfile> {
  return jsonRequest<ProjectBrandProfile>(
    `${API_HOST}/api/v1/projects/${projectId}/brand-profile`,
    { method: 'GET' },
    getToken,
  );
}

export async function putProjectBrandProfile(
  projectId: string,
  payload: ProjectBrandProfileUpdate,
  getToken: GetToken,
): Promise<ProjectBrandProfile> {
  return jsonRequest<ProjectBrandProfile>(
    `${API_HOST}/api/v1/projects/${projectId}/brand-profile`,
    { method: 'PUT', body: JSON.stringify(payload) },
    getToken,
  );
}

// ---------- Plays history -------------------------------------------------

export interface PlayHistoryItem {
  play_id: string;
  last_run_at: string;
  run_count: number;
}

export async function getPlaysHistory(
  getToken: GetToken,
  opts: { campaignId?: string | null } = {},
): Promise<{ items: PlayHistoryItem[] }> {
  const qp = opts.campaignId ? `?campaign_id=${encodeURIComponent(opts.campaignId)}` : '';
  const response = await fetch(`${API_HOST}/api/v1/plays/history${qp}`, {
    headers: { ...(await authHeaders(getToken)) },
  });
  if (!response.ok) throw new Error(`Failed to load plays history: ${response.status}`);
  return await response.json();
}

