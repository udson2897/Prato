import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const useSecure = Platform.OS === 'ios' || Platform.OS === 'android';

export const storage = {
  async get(key: string): Promise<string | null> {
    if (useSecure) return SecureStore.getItemAsync(key);
    return AsyncStorage.getItem(key);
  },
  async set(key: string, value: string): Promise<void> {
    if (useSecure) return SecureStore.setItemAsync(key, value);
    return AsyncStorage.setItem(key, value);
  },
  async remove(key: string): Promise<void> {
    if (useSecure) return SecureStore.deleteItemAsync(key);
    return AsyncStorage.removeItem(key);
  },
};
