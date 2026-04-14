// jest.setup.js — global mocks for React Native / Expo modules

// Mock expo-secure-store
jest.mock("expo-secure-store", () => ({
  getItemAsync:    jest.fn(() => Promise.resolve(null)),
  setItemAsync:    jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

// Mock expo-notifications
jest.mock("expo-notifications", () => ({
  getExpoPushTokenAsync:         jest.fn(() => Promise.resolve({ data: "ExpoToken[test]" })),
  requestPermissionsAsync:       jest.fn(() => Promise.resolve({ status: "granted" })),
  getPermissionsAsync:           jest.fn(() => Promise.resolve({ status: "granted" })),
  setNotificationChannelAsync:   jest.fn(() => Promise.resolve()),
  addNotificationReceivedListener:  jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));

// Mock expo-device
jest.mock("expo-device", () => ({
  isDevice: true,
  modelName: "Mock Device",
}));

// Mock expo-linking
jest.mock("expo-linking", () => ({
  createURL:   jest.fn((path) => `cybot://${path}`),
  getInitialURL: jest.fn(() => Promise.resolve(null)),
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
}));

// Mock @supabase/supabase-js
jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    auth: {
      getSession:        jest.fn(() => Promise.resolve({ data: { session: null }, error: null })),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
      signOut:           jest.fn(() => Promise.resolve({ error: null })),
    },
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq:     jest.fn().mockReturnThis(),
      order:  jest.fn().mockReturnThis(),
      limit:  jest.fn().mockReturnThis(),
      single: jest.fn(() => Promise.resolve({ data: null, error: null })),
    })),
    channel:       jest.fn(() => ({ on: jest.fn().mockReturnThis(), subscribe: jest.fn() })),
    removeChannel: jest.fn(),
    storage:       { from: jest.fn(() => ({ upload: jest.fn(), getPublicUrl: jest.fn() }) ) },
  })),
}));

// Mock axios
jest.mock("axios", () => {
  const instance = {
    get:          jest.fn(() => Promise.resolve({ data: {} })),
    post:         jest.fn(() => Promise.resolve({ data: {} })),
    interceptors: {
      request:  { use: jest.fn() },
      response: { use: jest.fn() },
    },
    defaults: { headers: { common: {} } },
  };
  return {
    create:   jest.fn(() => instance),
    default:  instance,
    ...instance,
  };
});

// Silence console.warn in tests
global.console.warn  = jest.fn();
global.console.error = jest.fn();
