import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import AvatarUploader from "@/components/AvatarUploader";
import * as storage from "@/services/storage";

// Mock the storage service
jest.mock("@/services/storage", () => ({
  uploadAvatar: jest.fn(),