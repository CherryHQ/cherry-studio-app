import { StackNavigationProp } from '@react-navigation/stack'

export type RootStackParamList = {
  WelcomeScreen: undefined
  HomeScreen: undefined
  ChatScreen: { topicId: string }
  SettingsScreen: undefined
  DataSettingsScreen: undefined
  BasicDataSettingsScreen: undefined
  LandropSettingsScreen: undefined
  WebDavScreen: undefined
  WebDavConfigScreen: undefined
  NutstoreLoginScreen: undefined
  NotionSettingsScreen: undefined
  YuqueSettingsScreen: undefined
  JoplinSettingsScreen: undefined
  ObsidianSettingsScreen: undefined
  SiyuanSettingsScreen: undefined
  AssistantSettingsScreen: undefined
  ProvidersScreen: undefined
  AboutScreen: undefined
  GeneralSettingsScreen: undefined
  ThemeSettingsScreen: undefined
  LanguageChangeScreen: undefined
  WebSearchSettingsScreen: undefined
  ProviderListScreen: undefined
  ProviderSettingsScreen: { providerId: string }
  ManageModelsScreen: { providerId: string }
  ApiServiceScreen: { providerId: string }
  TopicScreen: undefined
  AssistantScreen: undefined
  AssistantDetailScreen: { assistantId: string }
  AssistantMarketScreen: undefined
  WebSearchProviderSettingsScreen: { providerId: string }
  TestScreen: undefined
}
export type NavigationProps = StackNavigationProp<RootStackParamList>
