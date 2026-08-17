import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'veda_dev_access_token';

let cachedToken: string | null | undefined;

export async function loadToken(): Promise<string | null> {
  if (cachedToken !== undefined) return cachedToken;
  cachedToken = await AsyncStorage.getItem(TOKEN_KEY);
  return cachedToken;
}

export async function setToken(token: string): Promise<void> {
  cachedToken = token;
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  cachedToken = null;
  await AsyncStorage.removeItem(TOKEN_KEY);
}
