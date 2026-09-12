-- Mobile has no OAuth sign-in. Rows left behind by the removed flow keep their
-- minted API keys (real, working credentials) and fall back to the api-key
-- auth surface; the stale oauth auth_config and display fields are dropped.
UPDATE `user_provider`
SET `auth_config` = NULL
WHERE json_extract(`auth_config`, '$.type') = 'oauth';--> statement-breakpoint
UPDATE `user_provider`
SET `provider_settings` = json_remove(`provider_settings`, '$.oauthAvatar', '$.oauthUsername')
WHERE `provider_settings` IS NOT NULL;
