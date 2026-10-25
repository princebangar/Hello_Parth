// Bundled font files: the same families and weights Frontend/index.html loads from Google Fonts (no italics).
// Generated list; static require() calls so Metro bundles exactly these files.
import { DEFAULT_FONT } from './index';

export const fontAssets = {
  Poppins_300Light: require('@expo-google-fonts/poppins/300Light/Poppins_300Light.ttf'),
  Poppins_400Regular: require('@expo-google-fonts/poppins/400Regular/Poppins_400Regular.ttf'),
  Poppins_500Medium: require('@expo-google-fonts/poppins/500Medium/Poppins_500Medium.ttf'),
  Poppins_600SemiBold: require('@expo-google-fonts/poppins/600SemiBold/Poppins_600SemiBold.ttf'),
  Poppins_700Bold: require('@expo-google-fonts/poppins/700Bold/Poppins_700Bold.ttf'),
  Poppins_800ExtraBold: require('@expo-google-fonts/poppins/800ExtraBold/Poppins_800ExtraBold.ttf'),
  Outfit_300Light: require('@expo-google-fonts/outfit/300Light/Outfit_300Light.ttf'),
  Outfit_400Regular: require('@expo-google-fonts/outfit/400Regular/Outfit_400Regular.ttf'),
  Outfit_500Medium: require('@expo-google-fonts/outfit/500Medium/Outfit_500Medium.ttf'),
  Outfit_600SemiBold: require('@expo-google-fonts/outfit/600SemiBold/Outfit_600SemiBold.ttf'),
  Outfit_700Bold: require('@expo-google-fonts/outfit/700Bold/Outfit_700Bold.ttf'),
  Outfit_800ExtraBold: require('@expo-google-fonts/outfit/800ExtraBold/Outfit_800ExtraBold.ttf'),
  Outfit_900Black: require('@expo-google-fonts/outfit/900Black/Outfit_900Black.ttf'),
  Inter_300Light: require('@expo-google-fonts/inter/300Light/Inter_300Light.ttf'),
  Inter_400Regular: require('@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'),
  Inter_500Medium: require('@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf'),
  Inter_600SemiBold: require('@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf'),
  Inter_700Bold: require('@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf'),
  Inter_800ExtraBold: require('@expo-google-fonts/inter/800ExtraBold/Inter_800ExtraBold.ttf'),
  Inter_900Black: require('@expo-google-fonts/inter/900Black/Inter_900Black.ttf'),
  PlusJakartaSans_300Light: require('@expo-google-fonts/plus-jakarta-sans/300Light/PlusJakartaSans_300Light.ttf'),
  PlusJakartaSans_400Regular: require('@expo-google-fonts/plus-jakarta-sans/400Regular/PlusJakartaSans_400Regular.ttf'),
  PlusJakartaSans_500Medium: require('@expo-google-fonts/plus-jakarta-sans/500Medium/PlusJakartaSans_500Medium.ttf'),
  PlusJakartaSans_600SemiBold: require('@expo-google-fonts/plus-jakarta-sans/600SemiBold/PlusJakartaSans_600SemiBold.ttf'),
  PlusJakartaSans_700Bold: require('@expo-google-fonts/plus-jakarta-sans/700Bold/PlusJakartaSans_700Bold.ttf'),
  PlusJakartaSans_800ExtraBold: require('@expo-google-fonts/plus-jakarta-sans/800ExtraBold/PlusJakartaSans_800ExtraBold.ttf'),
  NunitoSans_500Medium: require('@expo-google-fonts/nunito-sans/500Medium/NunitoSans_500Medium.ttf'),
  NunitoSans_600SemiBold: require('@expo-google-fonts/nunito-sans/600SemiBold/NunitoSans_600SemiBold.ttf'),
  NunitoSans_700Bold: require('@expo-google-fonts/nunito-sans/700Bold/NunitoSans_700Bold.ttf'),
  NunitoSans_800ExtraBold: require('@expo-google-fonts/nunito-sans/800ExtraBold/NunitoSans_800ExtraBold.ttf'),
  Sora_600SemiBold: require('@expo-google-fonts/sora/600SemiBold/Sora_600SemiBold.ttf'),
  Sora_700Bold: require('@expo-google-fonts/sora/700Bold/Sora_700Bold.ttf'),
  Caveat_600SemiBold: require('@expo-google-fonts/caveat/600SemiBold/Caveat_600SemiBold.ttf'),
  Caveat_700Bold: require('@expo-google-fonts/caveat/700Bold/Caveat_700Bold.ttf'),
  Pacifico_400Regular: require('@expo-google-fonts/pacifico/400Regular/Pacifico_400Regular.ttf'),
};

const AVAILABLE = {"Poppins":[[300,"Poppins_300Light"],[400,"Poppins_400Regular"],[500,"Poppins_500Medium"],[600,"Poppins_600SemiBold"],[700,"Poppins_700Bold"],[800,"Poppins_800ExtraBold"]],"Outfit":[[300,"Outfit_300Light"],[400,"Outfit_400Regular"],[500,"Outfit_500Medium"],[600,"Outfit_600SemiBold"],[700,"Outfit_700Bold"],[800,"Outfit_800ExtraBold"],[900,"Outfit_900Black"]],"Inter":[[300,"Inter_300Light"],[400,"Inter_400Regular"],[500,"Inter_500Medium"],[600,"Inter_600SemiBold"],[700,"Inter_700Bold"],[800,"Inter_800ExtraBold"],[900,"Inter_900Black"]],"Plus Jakarta Sans":[[300,"PlusJakartaSans_300Light"],[400,"PlusJakartaSans_400Regular"],[500,"PlusJakartaSans_500Medium"],[600,"PlusJakartaSans_600SemiBold"],[700,"PlusJakartaSans_700Bold"],[800,"PlusJakartaSans_800ExtraBold"]],"Nunito Sans":[[500,"NunitoSans_500Medium"],[600,"NunitoSans_600SemiBold"],[700,"NunitoSans_700Bold"],[800,"NunitoSans_800ExtraBold"]],"Sora":[[600,"Sora_600SemiBold"],[700,"Sora_700Bold"]],"Pacifico":[[400,"Pacifico_400Regular"]],"Caveat":[[600,"Caveat_600SemiBold"],[700,"Caveat_700Bold"]]};

const normalizeWeight = (weight) => {
  if (weight === 'bold') return 700;
  if (weight === 'normal' || weight == null) return 400;
  const n = Number(weight);
  return Number.isFinite(n) ? n : 400;
};

/** ('Outfit', '700') -> 'Outfit_700Bold'; the closest bundled weight when that exact one is not bundled. */
export function resolveFont(family, weight) {
  const list = AVAILABLE[family] || AVAILABLE[DEFAULT_FONT];
  const w = normalizeWeight(weight);
  let best = list[0];
  for (const entry of list) if (Math.abs(entry[0] - w) < Math.abs(best[0] - w)) best = entry;
  return best[1];
}

export const isKnownFamily = (family) => Boolean(family && AVAILABLE[family]);
