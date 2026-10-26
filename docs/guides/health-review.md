# Health Feature App Review

Apple reviewed version 0.1.0 (34) on October 1, 2026 and rejected the HealthKit integration under
Guideline 2.5.1 because the binary included HealthKit while no primary health or fitness feature
was apparent. The record is in [App Store Connect](https://appstoreconnect.apple.com/apps/6809783714/distribution/reviewsubmissions/details/60bc61c3-a844-4654-a356-f3ee7bca99d7).
The integration was removed for the initial release in [PR #1163](https://github.com/CherryHQ/cherry-studio-app/pull/1163).

Apple then held version 0.4.0 (44) under Guideline 2.1 (Information Needed) with four questions
about the Clinical Health Records API: how it is integrated and where and how often data is
uploaded, which features use the data and how users enable or disable it, any other uses, and
where the data is stored and who can access it. The record is in
[App Store Connect](https://appstoreconnect.apple.com/apps/6809783714/distribution/reviewsubmissions/details/f3353daf-756b-4ed3-aee3-c4e0ccd5370b).
Clinical records are available only through providers in a few regions, so they serve almost
no Cherry Studio users while carrying the strictest review and privacy obligations. The app
therefore reads no clinical records, CDA documents or verifiable health records and declares no
Health Records entitlement or clinical usage description. Build 46 and its review notes documented
that removal.

Apple reviewed 0.4.0 (46) on October 23, 2026 on an iPad Air 11-inch (M3). The latest response in
the same submission asks for a general explanation of HealthKit usage under Guideline 2.1. It
also rejects the pre-permission "Allow access" button under 5.1.1(iv) and the calendar, reminders
and location purpose strings under 5.1.1(ii). The planned 0.4.1 correction uses "Continue" in all
UI languages for every button that leads to a system permission request, including in-chat tool
approvals that precede one on first use. It also adds concrete examples and the selected AI recipient to those native
descriptions in every supported UI language; see [Internationalization](./internationalization.md)
for the keys covered and native language selection. A new iOS binary is required; changing review
notes or publishing an OTA is insufficient.

Health remains a system permission plus built-in Agent tools; the app adds no separate health
page. The feature is Agent health and fitness analysis: read-only authorization, explicit consent
for every personal-health read, and health enabled for the Agent created during first-run onboarding.
Approval is never promoted by automatic approval mode. The submission must make that feature
apparent through store metadata, review notes and a recording rather than through extra UI. See
Apple's [2.5.1, 5.1.2 and 5.1.3 requirements](https://developer.apple.com/app-store/review/guidelines/).
Approval still belongs to Apple; if this submission is rejected again, reply in Resolution Center
with the notes and recording before changing the product shape.

A native development build and authorized device acceptance must precede store submission.
JavaScript updates cannot install the HealthKit bridge. The store description must name the Apple
Health integration and the AI analysis it supports. The privacy policy and App Privacy disclosures
must accurately cover the health categories read, the selected AI services, conversation
retention and any user-directed export. Do not claim the feature is approved based on source
changes. Personal health information must not be stored in iCloud; review conversation
backup/export and OS backup behavior before distribution.

## Suggested App Review Notes For 0.4.1

Use these notes with the actual submitted binary and provider configuration. Record its build
number and authorized device evidence before stating that the changes were verified.

Cherry Studio uses HealthKit for user-requested health and fitness analysis in chat on supported
iPhone and iPad devices. For example, a user can ask for a summary of steps, activity and sleep over
the last seven days, or compare workout records. AI responses are not medical advice, diagnosis
or treatment. There is no separate health dashboard: the feature is available through an Agent
with Health enabled.

Depending on the device, OS version, available records and read access selected in Apple's system
sheet, tools can read activity, sleep, heart metrics, workouts, body measurements, nutrition,
symptoms, reproductive health, hearing, vision, ECG and medications. Record details can include
workout routes, ECG measurements and attachments when requested. The app does not use the Clinical
Health Records API, CDA documents or verifiable health records. It never writes or modifies Apple
Health records. Public type discovery reads no personal data.

The default Agent created on first launch has Health enabled; for other Agents, open Agents, edit
the Agent and enable Health in its capabilities. This capability does not grant system permission.
Read access can be requested from Settings > System permissions > Health > Continue or on first use.
Users select the permitted data in Apple's authorization sheet and can change access in Apple
Health. They can also turn off the Agent's Health capability to stop future health tool calls.

In a chat with that Agent, ask "Summarize my activity and sleep over the last seven days." Before
each personal-health tool call, the app shows its requested parameters and a sharing disclosure
naming the selected AI service. Denying the call prevents that read and sharing. If the user
chooses Continue, the app requests any required system read access before executing the query.
Automatic tool approval does not bypass health confirmation, and background notifications offer no
health decision; the user confirms it in the app. Approval is unavailable if the receiving AI
service cannot be identified. Empty values may indicate no records or denied read access; they
are not presented as measured zero.

Approved tool results and relevant conversation context are sent from the device to the user's
selected AI service to generate the response. Reads happen in response to approved tool calls;
the integration does not register periodic HealthKit background delivery. Results and replies are
stored in local conversation history and can be included in later messages to the AI services
selected for that conversation, as disclosed before approval. Users can delete the conversation
to remove its local history; this does not delete information already processed by a third-party
provider, whose retention is governed by its own policy. Revoking Health access prevents future
reads and does not erase existing conversation history.

Attach a physical-device recording showing the Health permission row, the Agent capability,
system authorization, and both denial and approval of an AI analysis request. Keep screenshots
and store copy consistent with the submitted binary. The earlier 2.5.4 background-audio finding
is independent and this health change does not reintroduce background audio.
