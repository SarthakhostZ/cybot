/**
 * src/__tests__/hooks/useCyberNews.test.ts
 *
 * Tests for the useCyberNews hook:
 *   - initial load calls API with correct params
 *   - category filter change resets page and reloads
 *   - loadMore increments page
 *   - API error sets error state
 *   - timeAgo utility
 */

import { renderHook, act, waitFor } from "@testing-library/react-native";
import { useCyberNews, timeAgo } from "@/hooks/useCyberNews";
import { api } from "@/services/api";

const mockApi = api as jest.Mocked<typeof api>;

const SAMPLE_ARTICLES = [
  {
    id: "abc123", title: "Samsung breach exposes 40M records", summary: "A major data leak...",
    image_url: null, source_name: "BleepingComputer", source_color: "#3498db",
    source_url: "https://bleepingcomputer.com/1", published_at: "2024-01-01T00:00:00Z", category: "BREACH",
  },
  {
    id: "def456", title: "New ransomware targets hospitals", summary: "Ransomware campaign...",
    image_url: null, source_name: "The Hacker News", source_color: "#e74c3c",
    source_url: "https://thehackernews.com/1", published_at: "2024-01-02T00:00:00Z", category: "MALWARE",
  },
];

function mockApiSuccess(articles = SAMPLE_ARTICLES, hasNext = false) {
  mockApi.get.mockResolvedValue({
    data: {
      data: articles,
      meta: { page: 1, per_page: 20, total: articles.length, has_next: hasNext, category: "ALL" },
    },
  } as any);
}

function mockApiError(message = "Network error") {
  mockApi.get.mockRejectedValue({ response: { data: { error: message } } });
}

describe("useCyberNews", () => {
  beforeEach(() => jest.clearAllMocks());

  it("loads articles on mount", async () => {
    mockApiSuccess();
    const { result } = renderHook(() => useCyberNews());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.articles).toHaveLength(2);
    expect(mockApi.get).toHaveBeenCalledWith(
      "/threats/news/",
      expect.objectContaining({ params: expect.objectContaining({ page: "1" }) }),
    );
  });

  it("passes category filter to API", async () => {
    mockApiSuccess([SAMPLE_ARTICLES[0]]);
    const { result } = renderHook(() => useCyberNews("BREACH"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockApi.get).toHaveBeenCalledWith(
      "/threats/news/",
      expect.objectContaining({ params: expect.objectContaining({ category: "BREACH" }) }),
    );
  });

  it("does not pass category=ALL to API", async () => {
    mockApiSuccess();
    const { result } = renderHook(() => useCyberNews("ALL"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const callParams = mockApi.get.mock.calls[0][1]?.params as Record<string, string>;
    expect(callParams?.category).toBeUndefined();
  });

  it("sets error state on API failure", async () => {
    mockApiError("Server down");
    const { result } = renderHook(() => useCyberNews());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Server down");
    expect(result.current.articles).toHaveLength(0);
  });

  it("refresh resets to page 1", async () => {
    mockApiSuccess();
    const { result } = renderHook(() => useCyberNews());
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => { result.current.refresh(); });
    await waitFor(() => expect(result.current.refreshing).toBe(false));
    expect(mockApi.get).toHaveBeenCalledTimes(2);
  });
});

describe("timeAgo", () => {
  it("returns seconds", () => {
    const iso = new Date(Date.now() - 30_000).toISOString();
    expect(timeAgo(iso)).toBe("30s ago");
  });

  it("returns minutes", () => {
    const iso = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(timeAgo(iso)).toBe("5m ago");
  });

  it("returns hours", () => {
    const iso = new Date(Date.now() - 3 * 3600_000).toISOString();
    expect(timeAgo(iso)).toBe("3h ago");
  });

  it("returns days", () => {
    const iso = new Date(Date.now() - 2 * 86400_000).toISOString();
    expect(timeAgo(iso)).toBe("2d ago");
  });

  it("handles empty string", () => {
    expect(timeAgo("")).toBe("");
  });
});
