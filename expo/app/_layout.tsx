// template
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import ErrorBoundary from "@/components/ErrorBoundary";
import { DocumentProvider } from "@/contexts/DocumentContext";
import { SettingsProvider } from "@/contexts/SettingsContext";

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    const errorMessage = event.error?.message || event.message || '';
    if (errorMessage.toLowerCase().includes('keep awake') || errorMessage.toLowerCase().includes('keepawake')) {
      console.log('[Info] Keep-awake is not supported on web (this is expected)');
      event.preventDefault();
      event.stopPropagation();
      return;
    }
  });
  
  window.addEventListener('unhandledrejection', (event) => {
    const errorMessage = event.reason?.message || String(event.reason) || '';
    if (errorMessage.toLowerCase().includes('keep awake') || errorMessage.toLowerCase().includes('keepawake')) {
      console.log('[Info] Keep-awake promise rejection suppressed (not supported on web)');
      event.preventDefault();
      return;
    }
  });
}

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: "Back" }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="reader" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ title: "Settings" }} />
    </Stack>
  );
}

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') {
      const style = document.createElement('style');
      style.textContent = `
        * {
          -webkit-user-select: none;
          -moz-user-select: none;
          -ms-user-select: none;
          user-select: none;
        }
        input, textarea {
          -webkit-user-select: text;
          -moz-user-select: text;
          -ms-user-select: text;
          user-select: text;
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SettingsProvider>
          <DocumentProvider>
            <ErrorBoundary>
              <RootLayoutNav />
            </ErrorBoundary>
          </DocumentProvider>
        </SettingsProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
