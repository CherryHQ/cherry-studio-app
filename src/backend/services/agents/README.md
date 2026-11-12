# Agent profile and avatar workflows

`createAgentProfiles` coordinates database-owned Agent metadata with SOUL files owned by
`agentMemory`. The Data API and Agent management tools share it. The existing API `instructions`
field is a read/write projection of SOUL, never a second persisted prompt. Reads include
`instructionsVersion`; editor writes carry `expectedInstructionsVersion`. Native file operations
stay out of the data-service layer. Initial persona failure hides the newly created definition;
failed updates must be reread before retrying because metadata and file writes are separate.
Profile mutations join memory storage admission before metadata work starts, so backups cannot
capture an unfinished initial persona and host teardown drains the complete workflow.

The Agent editor keeps its existing text field and autosave ordering. It displays Persona (SOUL)
and preserves the document version across queued edits. Agent management tools expose explicit
SOUL/USER documents and versions, keeping another Agent's memory out of the caller's trusted
identity section. The legacy column is handled only by the startup migration in `agentMemory`.

`createAgentAvatars` owns image selection, replacement and read-time URI projection through
`agentAvatarStorage`. Bootstrap composes SOUL projection into avatar responses too, so changing an
avatar cannot erase the persona in the frontend cache.
