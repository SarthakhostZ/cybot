/**
 * src/__tests__/hooks/usePrivacyAudits.test.ts
 *
 * Tests for the usePrivacyAudits hook:
 *   - loads audits on mount (correct endpoint + page param)
 *   - sets error state on API failure
 *   - refresh resets to page 1
 *   - loadMore is ignored when hasNext is false
 *   - loadMore fetches the next page when hasNext is true
 *   - prepend inserts a new audit at the front without fetching
 */

import { renderHook, act, waitFor } from "@testing-library/react-native";
import { usePrivacyAudits, type AuditRecord } from "@/hooks/usePrivacyAudits";
import { api } from "@/services/api";

const mockApi = api as jest.Mocked<typeof api>;

const SAMPLE_AUDIT: AuditRecord = {
  id: "a1",
  user_id: "u1",
  email_scanned: "user@example.com",
  breach_count: 2,
  paste_count: 0,
  risk_level: "MEDIUM",
  data_classes: ["Email addresses", "Passwords"],
  recommendations: ["Use a password manager"],
  raw_breaches: [],
  created_at: "2024-02-01T00:00:00Z",
};

function mockSuccess(audits = [SAMPLE_AUDIT], hasNext = false) {
  mockApi.get.mockResolvedValueOnce({
    data: {
      data: audits,
      meta: { page: 1, per_page: 10, total: audits.length, has_next: hasNext, offset: 0 },
    },
  } as any);
}

function mockError(message = "Server error") {
  mockApi.get.mockRejectedValueOnce({ response: { data: { error: message } } });
}

describe("usePrivacyAudits", () => {
  beforeEach(() => jest.clearAllMocks());

  it("loads audits on mount with correct endpoint", async () => {
    mockSuccess();
    const { result } = renderHook(() => usePrivacyAudits());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.audits).toHaveLength(1);
    expect(mockApi.get).toHaveBeenCalledWith(
      "/privacy/audit/",
      expect.objectContaining({ params: expect.objectContaining({ page: "1" }) }),
    );
  });

  it("sets error state on API failure", async () => {
    mockError("Audit service down");
    const { result } = renderHook(() => usePrivacyAudits());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Audit service down");
    expect(result.current.audits).toHaveLength(0);
  });

  it("uses fallback error message when response has no error field", async () => {
    mockApi.get.mockRejectedValueOnce({});
    const { result } = renderHook(() => usePrivacyAudits());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Failed to load audit history");
  });

  it("refresh calls API a second time and resets list", async () => {
    mockSuccess();
    const { result } = renderHook(() => usePrivacyAudits());
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockSuccess([{ ...SAMPLE_AUDIT, id: "a2" }]);
    act(() => { result.current.refresh(); });
    await waitFor(() => expect(result.current.refreshing).toBe(false));

    expect(mockApi.get).toHaveBeenCalledTimes(2);
    // List is reset — only the new result
    expect(result.current.audits[0].id).toBe("a2");
    expect(result.current.audits).toHaveLength(1);
  });

  it("loadMore does nothing when hasNext is false", async () => {
    mockSuccess([SAMPLE_AUDIT], false);
    const { result } = renderHook(() => usePrivacyAudits());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => { result.current.loadMore(); });

    // Only the initial call; loadMore was skipped
    expect(mockApi.get).toHaveBeenCalledTimes(1);
  });

  it("loadMore fetches page 2 and appends results when hasNext is true", async () => {
    const audit2: AuditRecord = { ...SAMPLE_AUDIT, id: "a2" };
    mockSuccess([SAMPLE_AUDIT], true);   // page 1 — hasNext = true
    const { result } = renderHook(() => usePrivacyAudits());
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockSuccess([audit2], false);        // page 2
    act(() => { result.current.loadMore(); });
    await waitFor(() => expect(result.current.audits).toHaveLength(2));

    expect(mockApi.get).toHaveBeenCalledTimes(2);
    expect(mockApi.get).toHaveBeenLastCalledWith(
      "/privacy/audit/",
      expect.objectContaining({ params: expect.objectContaining({ page: "2" }) }),
    );
    expect(result.current.audits[1].id).toBe("a2");
  });

  it("prepend inserts audit at front without an extra API call", async () => {
    mockSuccess([SAMPLE_AUDIT]);
    const { result } = renderHook(() => usePrivacyAudits());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const newAudit: AuditRecord = { ...SAMPLE_AUDIT, id: "new" };
    act(() => { result.current.prepend(newAudit); });

    expect(result.current.audits[0].id).toBe("new");
    expect(result.current.audits).toHaveLength(2);
    expect(mockApi.get).toHaveBeenCalledTimes(1); // no extra fetch
  });
});
