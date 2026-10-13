# Health And Fitness

The iOS sidebar opens `/health`. This page presents seven-day activity and sleep totals and
average heart-rate metrics through `Backend.health`, without invoking AI. Its query has no disk
persistence, no retry loop, and no retained cache after its last observer unmounts. Returning from
Apple Health refreshes the overview through the shared application focus policy.

Read authorization is user-triggered. Unavailable clients explain that a native update is needed;
missing data stays distinct from a measured zero. Permission management opens the existing Apple
Health permission page. Agent setup remains with the Agent editor, and AI sharing consent belongs
to the conversation approval sheet.
