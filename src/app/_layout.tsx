import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts as usePromptFonts, Prompt_400Regular, Prompt_500Medium, Prompt_600SemiBold, Prompt_700Bold, Prompt_800ExtraBold } from '@expo-google-fonts/prompt';
import { useFonts as useSymbolFonts, MaterialSymbols_400Regular } from '@expo-google-fonts/material-symbols';

import { AuthProvider } from '@/providers/auth-provider';
import { InstitutionProvider } from '@/providers/institution-provider';

export default function RootLayout() {
  const [promptLoaded] = usePromptFonts({Prompt_400Regular, Prompt_500Medium, Prompt_600SemiBold, Prompt_700Bold, Prompt_800ExtraBold});
  const [symbolsLoaded] = useSymbolFonts({MaterialSymbols_400Regular});
  if (!promptLoaded || !symbolsLoaded) return null;
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <InstitutionProvider>
          <ThemeProvider value={DefaultTheme}>
            <Stack screenOptions={{ headerShown: false }} />
            <StatusBar style="dark" />
          </ThemeProvider>
        </InstitutionProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
