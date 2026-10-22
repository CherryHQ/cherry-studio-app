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
Health Records entitlement or clinical usage description. The reply for the next build states
that removal rather than answering the four questions.

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

## Suggested App Review Notes

Cherry Studio uses Apple Health for AI-assisted health and fitness analysis of the categories
selected by the user, including activity, sleep, body measurements, symptoms, reproductive health,
hearing, vision and medications. The app does not use the Clinical Health Records API. Public type
discovery reads no personal data; every personal-data read still requires sharing approval. The
default Agent created on first launch has Health enabled; for
other Agents, open Agents, edit the Agent and enable Health in its capabilities. Read access can
be requested from Settings > System permissions > Health or on first use.

In a chat with that Agent, ask "Summarize my activity and sleep over the last seven days." The app
requests read access in the system sheet if needed, then shows the requested metrics, date range
and a sharing disclosure naming the selected AI service. Denying the call prevents its health read
and sharing. Automatic tool approval does not bypass this confirmation. Apple Health records are
never written or modified. Empty values may indicate no records or denied read access; they are
not presented as measured zero. AI responses are not medical advice.

Attach a physical-device recording showing the Health permission row, the Agent capability,
system authorization, and both denial and approval of an AI analysis request. Keep screenshots
and store copy consistent with the submitted binary. The earlier 2.5.4 background-audio finding
is independent and this health change does not reintroduce background audio.
