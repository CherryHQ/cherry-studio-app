# Provider Credentials Link

`index.ts` exports `ProviderCredentialsLink`, a settings row that opens an existing model Provider.
File tools, search and voice settings use it to explain their shared credential source. It owns no
Provider state, credentials or capability configuration.
