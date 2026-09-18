import AppIntents
internal import SystemIntegration

struct CherryAgent: AppEntity {
  static var typeDisplayRepresentation: TypeDisplayRepresentation = "Agent"
  static var defaultQuery = CherryAgentQuery()
  var id: String
  var name: String
  var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)") }
}

struct CherryAgentQuery: EntityQuery {
  func entities(for identifiers: [String]) async throws -> [CherryAgent] {
    try await suggestedEntities().filter { identifiers.contains($0.id) }
  }
  func suggestedEntities() async throws -> [CherryAgent] {
    CherrySystemIntents.agents().compactMap { item in
      guard let id = item["id"], let name = item["name"] else { return nil }
      return CherryAgent(id: id, name: name)
    }
  }
}

struct CherryNewChatIntent: AppIntent {
  static var title: LocalizedStringResource = "New Cherry chat"
  static var description = IntentDescription("Open a new chat with your selected Agent.")
  static var openAppWhenRun = true
  @Parameter(title: "Agent") var agent: CherryAgent?
  func perform() async throws -> some IntentResult {
    CherrySystemIntents.openChat(agentId: agent?.id)
    return .result()
  }
}

struct CherryAskIntent: AppIntent {
  static var title: LocalizedStringResource = "Ask Cherry"
  static var description = IntentDescription("Open Cherry, send a question to an Agent, and return its answer. The conversation is saved in Cherry. Tool permissions still require approval in the app.")
  static var openAppWhenRun = true
  @Parameter(title: "Question") var question: String
  @Parameter(title: "Agent") var agent: CherryAgent?
  func perform() async throws -> some IntentResult & ReturnsValue<String> {
    let answer = try await CherrySystemIntents.ask(question, agentId: agent?.id)
    return .result(value: answer)
  }
}

struct CherryTranslateIntent: AppIntent {
  static var title: LocalizedStringResource = "Translate with Cherry"
  static var description = IntentDescription("Translate text with the translation model selected in Cherry. Cherry does not save a translation record.")
  @Parameter(title: "Text") var text: String
  @Parameter(title: "Target language", description: "A language code such as en-US or zh-CN. Leave empty to use Cherry’s default.") var targetLanguage: String?
  func perform() async throws -> some IntentResult & ReturnsValue<String> {
    let translated = try await CherrySystemIntents.translate(text, targetLanguage: targetLanguage)
    return .result(value: translated)
  }
}

struct CherryAppShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(intent: CherryNewChatIntent(), phrases: ["New chat in \(.applicationName)"], shortTitle: "New chat", systemImageName: "bubble.left.and.bubble.right")
    AppShortcut(intent: CherryAskIntent(), phrases: ["Ask \(.applicationName)"], shortTitle: "Ask Cherry", systemImageName: "sparkles")
    AppShortcut(intent: CherryTranslateIntent(), phrases: ["Translate with \(.applicationName)"], shortTitle: "Translate", systemImageName: "translate")
  }
}
