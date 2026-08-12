export const FONT_SIZE_STEPS = [0, 1, 2] as const;

export type FontSizeStep = (typeof FONT_SIZE_STEPS)[number];

export type MobilePreferenceSchema = {
  'chat.tools.provider_configuration.enabled': boolean;
  'ui.font_size_step': FontSizeStep;
};

export const MobileDefaultPreferences = {
  'chat.tools.provider_configuration.enabled': true,
  'ui.font_size_step': 0,
} satisfies MobilePreferenceSchema;
