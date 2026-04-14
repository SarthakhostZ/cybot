/**
 * src/__tests__/screens/LoginScreen.test.tsx
 *
 * Tests for LoginScreen (email + password only):
 *   - renders logo, inputs, and action buttons
 *   - alerts when submitted with empty fields
 *   - calls signInWithEmail with trimmed credentials
 *   - alerts on sign-in error
 *   - navigates to ForgotPassword
 *   - navigates to SignUp
 */

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import LoginScreen from "@/screens/auth/LoginScreen";

const mockSignInWithEmail = jest.fn();

jest.mock("@/contexts/AuthContext", () => ({
  useAuthContext: () => ({
    signInWithEmail: mockSignInWithEmail,
  }),
}));

function makeNavigation() {
  return { navigate: jest.fn() } as any;
}

describe("LoginScreen", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders logo, email and password inputs", () => {
    const { getByText, getByPlaceholderText } = render(
      <LoginScreen navigation={makeNavigation()} />
    );
    expect(getByText("Cybot")).toBeTruthy();
    expect(getByPlaceholderText("Email")).toBeTruthy();
    expect(getByPlaceholderText("Password")).toBeTruthy();
    expect(getByText("Sign In")).toBeTruthy();
  });

  it("alerts when submitted with empty fields", () => {
    const alertSpy = jest.spyOn(Alert, "alert");
    const { getByText } = render(<LoginScreen navigation={makeNavigation()} />);
    fireEvent.press(getByText("Sign In"));
    expect(alertSpy).toHaveBeenCalledWith("Missing fields", expect.any(String));
    expect(mockSignInWithEmail).not.toHaveBeenCalled();
  });

  it("calls signInWithEmail with trimmed email and password", async () => {
    mockSignInWithEmail.mockResolvedValue(undefined);
    const { getByPlaceholderText, getByText } = render(
      <LoginScreen navigation={makeNavigation()} />
    );
    fireEvent.changeText(getByPlaceholderText("Email"), "  user@example.com  ");
    fireEvent.changeText(getByPlaceholderText("Password"), "secret123");
    fireEvent.press(getByText("Sign In"));
    await waitFor(() =>
      expect(mockSignInWithEmail).toHaveBeenCalledWith("user@example.com", "secret123")
    );
  });

  it("shows error alert when signInWithEmail rejects", async () => {
    mockSignInWithEmail.mockRejectedValue(new Error("Invalid login credentials."));
    const alertSpy = jest.spyOn(Alert, "alert");
    const { getByPlaceholderText, getByText } = render(
      <LoginScreen navigation={makeNavigation()} />
    );
    fireEvent.changeText(getByPlaceholderText("Email"), "user@example.com");
    fireEvent.changeText(getByPlaceholderText("Password"), "wrongpass");
    fireEvent.press(getByText("Sign In"));
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith("Sign-in failed", expect.any(String))
    );
  });

  it("navigates to ForgotPassword when 'Forgot password?' is pressed", () => {
    const navigation = makeNavigation();
    const { getByText } = render(<LoginScreen navigation={navigation} />);
    fireEvent.press(getByText("Forgot password?"));
    expect(navigation.navigate).toHaveBeenCalledWith("ForgotPassword");
  });

  it("navigates to SignUp when sign-up link is pressed", () => {
    const navigation = makeNavigation();
    const { getByText } = render(<LoginScreen navigation={navigation} />);
    fireEvent.press(getByText(/Create one/));
    expect(navigation.navigate).toHaveBeenCalledWith("SignUp");
  });
});
