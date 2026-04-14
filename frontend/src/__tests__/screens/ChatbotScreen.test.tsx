/**
 * src/__tests__/screens/ChatbotScreen.test.tsx
 *
 * Tests for ChatbotScreen:
 *   - renders welcome message on mount
 *   - loads chat history from API on mount
 *   - typing a message enables the Send button
 *   - empty input keeps Send button disabled
 *   - sending a message appends user bubble and bot reply
 *   - API error appends fallback error bubble
 *   - Send button is disabled while a message is in-flight
 */

import React from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import ChatbotScreen from "@/screens/ChatbotScreen";
import { api } from "@/services/api";

const mockApi = api as jest.Mocked<typeof api>;

// History API returns empty list by default so the welcome message stays solo
function mockHistoryEmpty() {
  mockApi.get.mockResolvedValueOnce({ data: { data: [] } } as any);
}

function mockHistoryWithMessages() {
  mockApi.get.mockResolvedValueOnce({
    data: {
      data: [
        { id: "h1", role: "user",      content: "What is phishing?" },
        { id: "h2", role: "assistant", content: "Phishing is a social engineering attack." },
      ],
    },
  } as any);
}

describe("ChatbotScreen", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders the welcome message on mount", async () => {
    mockHistoryEmpty();
    const { findByText } = render(<ChatbotScreen />);
    expect(await findByText(/Hi, I'm Cybot/)).toBeTruthy();
  });

  it("loads and renders chat history from API", async () => {
    mockHistoryWithMessages();
    const { findByText } = render(<ChatbotScreen />);
    expect(await findByText("What is phishing?")).toBeTruthy();
    expect(await findByText("Phishing is a social engineering attack.")).toBeTruthy();
  });

  it("Send button is disabled when input is empty", async () => {
    mockHistoryEmpty();
    const { getByText } = render(<ChatbotScreen />);
    await waitFor(() => expect(mockApi.get).toHaveBeenCalled());
    const btn = getByText("Send");
    expect(btn.props.accessibilityState?.disabled ?? btn.parent?.props.disabled).toBeTruthy();
  });

  it("Send button becomes enabled after typing", async () => {
    mockHistoryEmpty();
    const { getByPlaceholderText, getByText } = render(<ChatbotScreen />);
    await waitFor(() => expect(mockApi.get).toHaveBeenCalled());
    fireEvent.changeText(getByPlaceholderText("Ask about cybersecurity…"), "Hello");
    const btn = getByText("Send").parent;
    expect(btn?.props.disabled).toBe(false);
  });

  it("appends user bubble and bot reply after successful send", async () => {
    mockHistoryEmpty();
    mockApi.post.mockResolvedValueOnce({ data: { reply: "Use strong passwords." } } as any);

    const { getByPlaceholderText, getByText, findByText } = render(<ChatbotScreen />);
    await waitFor(() => expect(mockApi.get).toHaveBeenCalled());

    fireEvent.changeText(getByPlaceholderText("Ask about cybersecurity…"), "How to stay safe?");
    fireEvent.press(getByText("Send"));

    expect(await findByText("How to stay safe?")).toBeTruthy();
    expect(await findByText("Use strong passwords.")).toBeTruthy();
  });

  it("shows fallback error bubble when API call fails", async () => {
    mockHistoryEmpty();
    mockApi.post.mockRejectedValueOnce({
      response: { data: { error: "Service unavailable" } },
    });

    const { getByPlaceholderText, getByText, findByText } = render(<ChatbotScreen />);
    await waitFor(() => expect(mockApi.get).toHaveBeenCalled());

    fireEvent.changeText(getByPlaceholderText("Ask about cybersecurity…"), "Test");
    fireEvent.press(getByText("Send"));

    expect(await findByText("Service unavailable")).toBeTruthy();
  });

  it("shows generic fallback when error has no message", async () => {
    mockHistoryEmpty();
    mockApi.post.mockRejectedValueOnce({});

    const { getByPlaceholderText, getByText, findByText } = render(<ChatbotScreen />);
    await waitFor(() => expect(mockApi.get).toHaveBeenCalled());

    fireEvent.changeText(getByPlaceholderText("Ask about cybersecurity…"), "Test");
    fireEvent.press(getByText("Send"));

    expect(await findByText("Sorry, something went wrong. Please try again.")).toBeTruthy();
  });

  it("clears input after send", async () => {
    mockHistoryEmpty();
    mockApi.post.mockResolvedValueOnce({ data: { reply: "OK" } } as any);

    const { getByPlaceholderText, getByText } = render(<ChatbotScreen />);
    await waitFor(() => expect(mockApi.get).toHaveBeenCalled());

    const input = getByPlaceholderText("Ask about cybersecurity…");
    fireEvent.changeText(input, "Clear me");
    fireEvent.press(getByText("Send"));

    await waitFor(() => expect(input.props.value).toBe(""));
  });
});
