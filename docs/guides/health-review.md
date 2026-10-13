# Health Feature App Review

Apple reviewed version 0.1.0 (34) on October 1, 2026 and rejected the HealthKit integration under
Guideline 2.5.1 because the binary included HealthKit while no primary health or fitness feature
was apparent. The record is in [App Store Connect](https://appstoreconnect.apple.com/apps/6809783714/distribution/reviewsubmissions/details/60bc61c3-a844-4654-a356-f3ee7bca99d7).
The integration was removed for the initial release in [PR #1163](https://github.com/CherryHQ/cherry-studio-app/pull/1163).

The restored feature includes a visible Health & Fitness sidebar destination, a device-local
seven-day overview, read-only authorization, and optional Agent analysis that requires explicit
consent for every health tool call. Approval is never promoted by automatic approval mode.
See Apple's [2.5.1, 5.1.2 and 5.1.3 requirements](https://developer.apple.com/app-store/review/guidelines/).
These changes address the cited visibility/use-case problem; approval still belongs to Apple.

A native development build and authorized device acceptance must precede store submission.
JavaScript updates cannot install the HealthKit bridge. Store description, privacy policy and App
Privacy disclosures must accurately cover the health categories read, the selected AI services,
conversation retention and any user-directed export. Do not claim the feature is approved based on
source changes. Personal health information must not be stored in iCloud; review conversation
backup/export and OS backup behavior before distribution.

## Suggested App Review Notes

Cherry Studio includes a Health & Fitness feature for reviewing activity, sleep and heart-rate
data from Apple Health. Open the sidebar and choose Health & Fitness to view the last seven days
locally. Tap the authorization button to select the read access you permit in the system sheet.
Apple Health records are never written or modified. Empty values may indicate no records or denied
read access; we do not present them as measured zero.

Optional AI health and fitness analysis is enabled for the Agent created during first-run
onboarding. For other Agents, enable Health in their capabilities and ask, for example,
"Summarize my activity and sleep over the last seven days." Each health
tool call shows the requested metrics/date range and a sharing disclosure naming the selected
AI service. Denying a call prevents its health read and sharing. Automatic tool approval does not
bypass this confirmation. AI responses are not medical advice.

Attach a physical-device recording showing the sidebar entry, system authorization, local
overview, and both denial and approval of an AI analysis request. Keep screenshots and store copy
consistent with the submitted binary. The earlier 2.5.4 background-audio finding is independent
and this health change does not reintroduce background audio.
