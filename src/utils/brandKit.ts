
export interface BrandKitData {
  brandName: string;
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  logo: string | null;
}

export const getBrandKit = (): BrandKitData | null => {
  const saved = localStorage.getItem('lumina_brand_kit');
  if (!saved) return null;
  try {
    return JSON.parse(saved);
  } catch (e) {
    return null;
  }
};
