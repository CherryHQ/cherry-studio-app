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

struct CherryAppShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(intent: CherryNewChatIntent(), phrases: ["New chat in \(.applicationName)"], shortTitle: "New chat", systemImageName: "bubble.left.and.bubble.right")
    AppShortcut(intent: CherryAskIntent(), phrases: ["Ask \(.applicationName)"], shortTitle: "Ask Cherry", systemImageName: "sparkles")
  }
}
