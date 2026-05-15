# Changelog

## [1.12.0](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/compare/v1.11.2...v1.12.0) (2026-05-15)


### Features

* Add agentNameOverride support to agent custom naming ([#54](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/issues/54)) ([c493877](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/c4938777a440cdf9134bd34103b6632e5e405f9d))
* Add API swagger documentation to chatbot controller ([f9c89e5](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/f9c89e5fa086aa38bccf470c80de829201d26631))
* Add complete flow authentication ([2a2e602](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/2a2e602a126c046767e567f882d682325d6670f0))
* Add Helm chart for hologram welcome ai agent ([#6](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/issues/6)) ([b927d7d](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/b927d7d6271b9015c9c9d3b27d7c209db71bb9b7))
* Add integration with vs-agent with service-agent-nestjs-client ([3b9ee6d](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/3b9ee6d84816d6ba2c823aace6a10ef5184db766))
* Add new enviroments to appConfig ([2a68986](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/2a68986791c5f646f6be3976d6c3502443547975))
* add Pinecone and Redis support to LangchainRagService ([a0c4db4](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/a0c4db426ebb8c01c89886d2faeb557636a15003))
* Add select model openia to enviroment variable ([d870e9f](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/d870e9f84ed02309a4ca50762059372f0d523067))
* add support for loading and indexing CSV , MD documents as context sources ([d819440](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/d8194406edbdd1c59db265cddd8406faa2fc6f2f))
* Add tool authentication access, update docs and improve language detection ([cff1d84](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/cff1d84a5d1bcb34bac6f4f77ee9943a8840adeb))
* **broadcast:** fan-out BroadcastService + LiveFeedCallbackHandler + 23 tests ([5a76b81](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/5a76b812e0f34b239ff581df72e278ab356661dd))
* **core:** workspace state machine integration + observer guard + 7 integration tests ([9dd8f07](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/9dd8f07bc12561c090d4441c0d7774ceb5ec4f19))
* enable embedding backend selection via ConfigService LLM_PROVIDER ([66d1cf2](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/66d1cf217a67139c8f7a76bb10a2e570d3e32dca))
* enable loading environment variables from .env file ([a90bd94](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/a90bd94c571ab355aa86bfbdf1f2f457550d1d8b))
* enable stats module for vs-agent-nestjs integration ([739a92d](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/739a92dd26fc1ec769941a4c1efc3c05432aaadc))
* Enhance RAG ingestion with remote caching, configurable chunking vector ([#36](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/issues/36)) ([96d1753](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/96d17532046a2c3ad46016df84a9365ac4536614))
* Generate sendStats to new connection and include artemis and  stats module docker compose ([4aa4064](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/4aa40647467bb336aed12bbef6c98dee2581144e))
* generic AI agent via configurable agent packs ([#40](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/issues/40)) ([e062bf0](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/e062bf0b72910ecaf5eedb45d60bdbf774459e27))
* implement RBAC and approval workflow ([#70](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/issues/70)) ([bb9a56b](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/bb9a56be7a6c6a3abaaab8aa21385b790f681500))
* improve document ingestion to RAG service. ([00910cb](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/00910cb679287c15805d1067aad621da6e396cf9))
* Improvement about core.module and integration with chatbot ia. ([68b399c](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/68b399c5f9cc7aae90def8d7f2083efaa9e072b9))
* Initial commit Hologram  welcome AI agent ([5df57e1](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/5df57e111b8234a8d7eb3866cb7ef5c20f4ea1bf))
* Initial commit Hologram welcome AI agent ([e4aae28](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/e4aae28eb0483e728a3e9f096fe6003f4c327fc3))
* Integrate stats module with dedicate tools statistics_fetcher ([748ba55](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/748ba5528a59c24f79e4b576e6c8d4c1b8a6d99b))
* **llm,chatbot:** workspace-keyed memory + LiveFeed callback + speaker tags ([7ae0409](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/7ae04097b63cb92df4fbaab7339951e7378e0abc))
* Make chunk size configurable via env var to avoid token limit docs ([#17](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/issues/17)) ([cb9e55f](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/cb9e55f1cb52ba599198eb7a6f92d4ed2e97c3a4))
* MCP support, admin mode, and more ([#60](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/issues/60)) ([adb4d9a](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/adb4d9afa6bc6c84857e9ba1ac577aae5660bf1f))
* **mcp,auth:** port upstream MCP auto-reconnect + credential-gated invitation ([23658b8](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/23658b8056e64a5ac83fc1f9c90d5a3392682b78))
* **mcp:** runtime addServer/removeServer for BYOMCP ([26b1499](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/26b1499ee70f74d286c714236d8ba75d8d2cc374))
* rebranding hologram-generic-ai-agents ([#44](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/issues/44)) ([39bdc43](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/39bdc439bdb2d829a75cbab123aa764a5c629459))
* **state:** add HoloClaw workspace state steps + session + agent-pack schema ([b307715](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/b307715a91d743cc1f6e6839c1135a32ac44be05))
* **stt:** port voice-to-text transcription from upstream ([37e687d](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/37e687d793d6787f7be2870ca2daa9cdea83ac60))
* support OpenAI-compatible API providers via OPENAI_BASE_URL ([#74](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/issues/74)) ([c2baf68](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/c2baf68ec3f142b10535d04e8507b1f5353c84c1))
* Support tpl for env vars + CD refactor with stable release standard ([#22](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/issues/22)) ([48bbb4c](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/48bbb4ce2f0d629bb21fe91cd6f0601ac2a0bdbb))
* Update charts with vs-agent 1.7.0 ([#56](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/issues/56)) ([c908e48](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/c908e486b11cba9cc232369795d2b1eb93bdd756))
* Update documentation and version app ([8925035](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/8925035c83c1b683ba195a247a48aa2333cd22ad))
* Update documentation and version app ([716f466](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/716f46677659ec59d62b5e8444ad611fa38fec7f))
* Update Generic AI Agent chart to use VS Agent 1.5.6 ([#50](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/issues/50)) ([659da07](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/659da0744182573c69bbb5f9669fe98b3ebac9a3))
* Update new version Vs-Agent 1.5.3 ([#38](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/issues/38)) ([1657aaf](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/1657aaf360b2a1acfa71c8c6e1dce7601bd01c77))
* Update to use vs-agent-nestjs-client library ([#11](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/issues/11)) ([03f25ac](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/03f25acb0f22795fafcfed43c77dc6dc7824fd27))
* Upgrade vs-agent dependencies charts v1.4.0 ([#33](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/issues/33)) ([9760116](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/976011634c17d386415fed0ed725c182cc2c9692))
* **workspace:** entities, services, BYOMCP runtime + 42 unit tests ([7c15f02](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/7c15f02be29d00ba07bcb0d0f0bb00ce0121e243))


### Bug Fixes

* fix:  ([81e2f5f](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/81e2f5f1fa0b85f4b56d69c9d8f1531320b6743c))
* Add type to agentExcuteor definition ([be75046](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/be750463b2c21d5ebde9d5a14de0a2d31a4074a0))
* **app:** expose WorkspaceModule + BroadcastModule to EventsModule scope ([92ada57](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/92ada572231061f7ce372a84b4a1e14321aea542))
* Auth hide menu when no auth option exists ([#47](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/issues/47)) ([e4972cc](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/e4972cc6c32435c57e22a5d1d3146c65eb54fbcd))
* bump to vs-agent 1.6.0-dev ([c1e95d5](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/c1e95d5deee2fff1895e0b39e2d28044a736ae52))
* bump vs-agent dependency to 1.5.7 ([#52](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/issues/52)) ([4d592dc](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/4d592dc1fb76d7441ecf46170fb31123f79ebdf6))
* bump vs-agent to 1.6.0 stable ([090ecc7](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/090ecc71e989c3dc76fd83d8bf8fbfa5c252039b))
* bump vs-agent version ([6a395c9](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/6a395c929a89218531748098952d61ad22035f38))
* change send objetc content only message to chatbot ia ([ba933c5](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/ba933c5e15b75e7f8bf71e3a1dbfebc88df1f0b3))
* charts update vs agent image ([#57](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/issues/57)) ([ed1e45b](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/ed1e45b582531797a81c4c9ed22f360095f013b9))
* **chart:** update vs agent and enable extern secrets ([#58](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/issues/58)) ([fe375f3](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/fe375f3c1bcc68628583cacbc58db51b5d4e141b))
* clean up lint issues and improve type to core,llm, memory, rag modules ([87b90b4](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/87b90b4a92b203afc5cdd4860f47f59a017fc437))
* correct unsafe enum comparisons with Cmd in session actions ([105c3f7](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/105c3f7b77c3502919ae3e3333aa3493b041bfab))
* Description api language ([569ecb8](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/569ecb82ebf6d73ced979d5b18539634dad83f0b))
* **docker:** include agent-packs in runtime image ([1ffe02d](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/1ffe02d70daed0f92f2f56421754c4d964e381a8))
* ensure safe config access and log interpolation ([691fdb5](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/691fdb513fa7e908c0bc48f0ad8601d192fab897))
* fix check-types isssues ([4bf0eca](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/4bf0eca1a6c81927d24e0872f07ad200ebc484bf))
* fix ESLint and TypeScript errors across codebase ([a41028c](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/a41028cfd148257d6a864de6c3ee4023ada90879))
* Fix example credential definition with did:web ([1997a75](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/1997a755dba3a50444e5ac8f7e1469cf054af361))
* fix image chatbot template ([#25](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/issues/25)) ([199fd07](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/199fd0783a28c37f75ba5ba6e67164856c9fa46d))
* Fix image name to hologram-generic-ai-agent in stable-release  ([#46](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/issues/46)) ([8802a5a](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/8802a5af56b2f6a47d801d8df616023a2c74e28d))
* increase request limit to 5MB ([#28](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/issues/28)) ([8187aea](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/8187aeab953e0803c1bc714a82710a974dcb9fa9))
* inject StatProducerService via EventsModule ([#13](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/issues/13)) ([5e0fec1](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/5e0fec1e5c04c57ec4b74298698a2755e8a45b85))
* prefix secret names with release fullname to avoid namespace collisions ([#63](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/issues/63)) ([a9014c4](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/a9014c43b7f4c83e2c7d80b92d845c6b700d4aba))
* proactively connect user-controlled MCP servers before LLM runs ([#66](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/issues/66)) ([c97e577](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/c97e5779a6cc4524709b3102b482f10166b45545))
* Remove comment ([888f604](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/888f604152f000a4d451b6792549414c66afda4a))
* remove unused variables flagged by eslint ([#73](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/issues/73)) ([436feaf](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/436feaf64a58ca17cbe7996ea6e615a15e2b9b23))
* update stats ([3caf1dd](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/3caf1dda40239792e740ba0c92e8627024f9e352))
* update stats ([350ad57](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/350ad57ef7deb8ac34590962ed37577400e4c045))
* Use dynamic date in agent system prompt (LLM prompt now reflects current date) ([#15](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/issues/15)) ([1e1c871](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/1e1c871be495f18ab78aa34a432116d72d99e362))
* use root context ($) for include calls inside range loops ([#64](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/issues/64)) ([365dae9](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/365dae945f908c916f626909fd750c9b06a309ff))
* user-friendly message when LLM service is unavailable ([#30](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/issues/30)) ([bf1283d](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/bf1283df17e73a6ea509e3870351f881050c83f3))
* wrap stats deployment in enabled condition ([#62](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/issues/62)) ([c3e104d](https://github.com/AirKyzzZ/hologram-holoclaw-bot-vs/commit/c3e104d955dfc9e770277d0127e21a6cc88a4182))

## [1.11.2](https://github.com/2060-io/hologram-generic-ai-agent-vs/compare/v1.11.1...v1.11.2) (2026-04-10)


### Bug Fixes

* proactively connect user-controlled MCP servers before LLM runs ([#66](https://github.com/2060-io/hologram-generic-ai-agent-vs/issues/66)) ([904d775](https://github.com/2060-io/hologram-generic-ai-agent-vs/commit/904d775c46cc1f906557af97494e7513dbad6c92))

## [1.11.1](https://github.com/2060-io/hologram-generic-ai-agent-vs/compare/v1.11.0...v1.11.1) (2026-04-10)


### Bug Fixes

* use root context ($) for include calls inside range loops ([#64](https://github.com/2060-io/hologram-generic-ai-agent-vs/issues/64)) ([779ae69](https://github.com/2060-io/hologram-generic-ai-agent-vs/commit/779ae698fdf8e878d98073a00bdd620bb799add3))

## [1.11.0](https://github.com/2060-io/hologram-generic-ai-agent-vs/compare/v1.10.1...v1.11.0) (2026-04-10)


### Features

* MCP support, admin mode, and more ([#60](https://github.com/2060-io/hologram-generic-ai-agent-vs/issues/60)) ([2c4add6](https://github.com/2060-io/hologram-generic-ai-agent-vs/commit/2c4add6a92529843b69046395149e0cfbc798185))


### Bug Fixes

* prefix secret names with release fullname to avoid namespace collisions ([#63](https://github.com/2060-io/hologram-generic-ai-agent-vs/issues/63)) ([c197f7e](https://github.com/2060-io/hologram-generic-ai-agent-vs/commit/c197f7e336485834709964aafc6e940de418cdf5))
* wrap stats deployment in enabled condition ([#62](https://github.com/2060-io/hologram-generic-ai-agent-vs/issues/62)) ([a0cfa12](https://github.com/2060-io/hologram-generic-ai-agent-vs/commit/a0cfa12da96562b546f4bcb7138536d768b0104d))

## [1.10.1](https://github.com/2060-io/hologram-generic-ai-agent-vs/compare/v1.10.0...v1.10.1) (2026-04-07)


### Bug Fixes

* **chart:** update vs agent and enable extern secrets ([#58](https://github.com/2060-io/hologram-generic-ai-agent-vs/issues/58)) ([7805f0b](https://github.com/2060-io/hologram-generic-ai-agent-vs/commit/7805f0b58f00b98f743289aa120a971394d37320))

## [1.10.0](https://github.com/2060-io/hologram-generic-ai-agent-vs/compare/v1.9.1...v1.10.0) (2026-02-28)


### Features

* Add agentNameOverride support to agent custom naming ([#54](https://github.com/2060-io/hologram-generic-ai-agent-vs/issues/54)) ([1c79b7d](https://github.com/2060-io/hologram-generic-ai-agent-vs/commit/1c79b7dc5912321f032bc7752907ef3541e2644b))
* Update charts with vs-agent 1.7.0 ([#56](https://github.com/2060-io/hologram-generic-ai-agent-vs/issues/56)) ([811fa01](https://github.com/2060-io/hologram-generic-ai-agent-vs/commit/811fa0123936bbb79ddbadb668384f55c32facaf))


### Bug Fixes

* charts update vs agent image ([#57](https://github.com/2060-io/hologram-generic-ai-agent-vs/issues/57)) ([49ece1d](https://github.com/2060-io/hologram-generic-ai-agent-vs/commit/49ece1def09e4c8c10288f10cc91f350a4d2c5f0))

## [1.9.1](https://github.com/2060-io/hologram-generic-ai-agent-vs/compare/v1.9.0...v1.9.1) (2026-01-13)


### Bug Fixes

* bump to vs-agent 1.6.0-dev ([fd1f450](https://github.com/2060-io/hologram-generic-ai-agent-vs/commit/fd1f450682f937dc5806ec829267e31eed5acf7f))
* bump vs-agent dependency to 1.5.7 ([#52](https://github.com/2060-io/hologram-generic-ai-agent-vs/issues/52)) ([028633f](https://github.com/2060-io/hologram-generic-ai-agent-vs/commit/028633f44e7b39e7608d651b33ceeac9434f2f5a))
* bump vs-agent to 1.6.0 stable ([cf7b5e6](https://github.com/2060-io/hologram-generic-ai-agent-vs/commit/cf7b5e6d99e7d8d409c1ed7fcda1771661db290a))
* bump vs-agent version ([65c0599](https://github.com/2060-io/hologram-generic-ai-agent-vs/commit/65c0599c13a9c2a7a287fdccddf8e5baee6aac96))

## [1.9.0](https://github.com/2060-io/hologram-generic-ai-agent-vs/compare/v1.8.1...v1.9.0) (2026-01-06)


### Features

* generic AI agent via configurable agent packs ([#40](https://github.com/2060-io/hologram-generic-ai-agent-vs/issues/40)) ([d9ea4c5](https://github.com/2060-io/hologram-generic-ai-agent-vs/commit/d9ea4c5cfd6d5e1eaf8611770305bb562955562f))
* Update Generic AI Agent chart to use VS Agent 1.5.6 ([#50](https://github.com/2060-io/hologram-generic-ai-agent-vs/issues/50)) ([d730f80](https://github.com/2060-io/hologram-generic-ai-agent-vs/commit/d730f8046a51c7503ecd1dc09bb644600adb7f50))

## [1.8.1](https://github.com/2060-io/hologram-generic-ai-agent-vs/compare/v1.8.0...v1.8.1) (2025-12-03)


### Bug Fixes

* Auth hide menu when no auth option exists ([#47](https://github.com/2060-io/hologram-generic-ai-agent-vs/issues/47)) ([4e6ceee](https://github.com/2060-io/hologram-generic-ai-agent-vs/commit/4e6ceeea9766c6e184d19e8da85df2d4388ccda8))
* Fix image name to hologram-generic-ai-agent in stable-release  ([#46](https://github.com/2060-io/hologram-generic-ai-agent-vs/issues/46)) ([681b78b](https://github.com/2060-io/hologram-generic-ai-agent-vs/commit/681b78b23f7031b55fd1498da945f15008afc6d5))

## [1.8.0](https://github.com/2060-io/hologram-generic-ai-agent-vs/compare/v1.7.0...v1.8.0) (2025-11-20)

### Features

* Enhance RAG ingestion with remote caching, configurable chunking vector ([#36](https://github.com/2060-io/hologram-generic-ai-agent-vs/issues/36)) ([5107a27](https://github.com/2060-io/hologram-generic-ai-agent-vs/commit/5107a27b21f7c9c2421056c0c9a60c9c1ee330a2))
* rebranding hologram-generic-ai-agents ([#44](https://github.com/2060-io/hologram-generic-ai-agent-vs/issues/44)) ([841120b](https://github.com/2060-io/hologram-generic-ai-agent-vs/commit/841120ba221f8165fda9687c1dfccc9767975d1a))

## [1.7.0](https://github.com/2060-io/hologram-welcome-ai-agent-vs/compare/v1.6.3...v1.7.0) (2025-10-22)


### Features

* Update new version Vs-Agent 1.5.3 ([#38](https://github.com/2060-io/hologram-welcome-ai-agent-vs/issues/38)) ([3209e4a](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/3209e4ac61062bdd1964d3fa8b7340d82a222083))
* Upgrade vs-agent dependencies charts v1.4.0 ([#33](https://github.com/2060-io/hologram-welcome-ai-agent-vs/issues/33)) ([b0e0fe1](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/b0e0fe1f9512ab657cd9e874dc622399ed51b64b))

## [1.6.3](https://github.com/2060-io/hologram-welcome-ai-agent-vs/compare/v1.6.2...v1.6.3) (2025-09-01)


### Bug Fixes

* user-friendly message when LLM service is unavailable ([#30](https://github.com/2060-io/hologram-welcome-ai-agent-vs/issues/30)) ([5e490b9](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/5e490b9ef04243d113e929ffc72898ad64fd3da4))

## [1.6.2](https://github.com/2060-io/hologram-welcome-ai-agent-vs/compare/v1.6.1...v1.6.2) (2025-07-17)


### Bug Fixes

* increase request limit to 5MB ([#28](https://github.com/2060-io/hologram-welcome-ai-agent-vs/issues/28)) ([3c927d4](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/3c927d4cbaadaa7b4bd9f714c7a015ef2b2f13ba))

## [1.6.1](https://github.com/2060-io/hologram-welcome-ai-agent-vs/compare/v1.6.0...v1.6.1) (2025-07-04)


### Bug Fixes

* fix image chatbot template ([#25](https://github.com/2060-io/hologram-welcome-ai-agent-vs/issues/25)) ([111b116](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/111b11632ab56c0b6e0c0f125f94e5bc9837899a))

## [1.6.0](https://github.com/2060-io/hologram-welcome-ai-agent-vs/compare/v1.5.0...v1.6.0) (2025-07-03)


### Features

* Support tpl for env vars + CD refactor with stable release standard ([#22](https://github.com/2060-io/hologram-welcome-ai-agent-vs/issues/22)) ([5c876f5](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/5c876f55938f8ffd8188a189dbe8fbd6c650ba92))

## [1.5.0](https://github.com/2060-io/hologram-welcome-ai-agent-vs/compare/v1.4.0...v1.5.0) (2025-07-01)


### Features

* Add API swagger documentation to chatbot controller ([24584b7](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/24584b72a4e7adf2d51c5c1c593e4d3bcdd7ddaa))
* Add complete flow authentication ([4d0ff28](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/4d0ff287504af398159268ce85f04dcc677969ec))
* Add Helm chart for hologram welcome ai agent ([#6](https://github.com/2060-io/hologram-welcome-ai-agent-vs/issues/6)) ([9290594](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/9290594322f795bdba3bd456ffad459b43cf5e87))
* Add integration with vs-agent with service-agent-nestjs-client ([37cc925](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/37cc9258274252edc0aaacbc609cdd1422dba0aa))
* Add new enviroments to appConfig ([432f232](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/432f232439b6af9e80dc2b2239ec96fbefed8311))
* add Pinecone and Redis support to LangchainRagService ([2a3a217](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/2a3a217a7fb6afa2ea429f0d6d24b44149d79b07))
* Add select model openia to enviroment variable ([cccabea](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/cccabea271c856e46b1d1f7fc1ad329000ab4137))
* add support for loading and indexing CSV , MD documents as context sources ([8b9f49d](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/8b9f49d279dae5125af0951c457e509ea7c7b92a))
* Add tool authentication access, update docs and improve language detection ([910ee79](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/910ee7978351dc02cb7e133f80f5870ad6da32e4))
* enable embedding backend selection via ConfigService LLM_PROVIDER ([b1e0cb5](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/b1e0cb5979806f55fdf8879c11857c2e2564f79d))
* enable loading environment variables from .env file ([208f8b1](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/208f8b1156f2f5f9ce4bbe332224f19217eb6767))
* enable stats module for vs-agent-nestjs integration ([77fb69c](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/77fb69c008e87c7aadc7a0c9910e474f8b68edaf))
* Generate sendStats to new connection and include artemis and  stats module docker compose ([a422913](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/a4229136959e4a298f2ba153b3bf05a0318232aa))
* improve document ingestion to RAG service. ([bc259f2](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/bc259f2b62752ba05c3ea295817c5a1c3ddfe2a0))
* Improvement about core.module and integration with chatbot ia. ([7345d1d](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/7345d1dc623f95b067a4f13e1d4beea3605b3096))
* Initial commit Hologram  welcome AI agent ([007fb3e](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/007fb3e4374716f50da30bd265dc4128471cfd76))
* Initial commit Hologram welcome AI agent ([3189c9a](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/3189c9ae7f7844b48404369f13483e0653409bf2))
* Integrate stats module with dedicate tools statistics_fetcher ([f663a54](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/f663a54ce2a70147cc6f4ff5e669f24af0b4a537))
* Make chunk size configurable via env var to avoid token limit docs ([#17](https://github.com/2060-io/hologram-welcome-ai-agent-vs/issues/17)) ([f21f3e1](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/f21f3e13a92cd2c372a98649f469c64807b20ad1))
* Update documentation and version app ([36b366c](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/36b366c1c3b0ee5a67d8851c216ed559f62e85fc))
* Update documentation and version app ([68720e4](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/68720e461a0b7ebba2312fee12b965eb4fc5e69b))
* Update to use vs-agent-nestjs-client library ([#11](https://github.com/2060-io/hologram-welcome-ai-agent-vs/issues/11)) ([48e76c3](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/48e76c36d516412bf792f78a5611027c00362ec1))


### Bug Fixes

* fix:  ([597c545](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/597c54534d3a20465236c6abc52c8c02acc818b4))
* Add type to agentExcuteor definition ([d116889](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/d11688910b70041dcf0b6d5de31478a901ee18ff))
* change send objetc content only message to chatbot ia ([eb18d19](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/eb18d1991a0f1676d0ca5727efe8bdfd88739538))
* clean up lint issues and improve type to core,llm, memory, rag modules ([0fec74c](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/0fec74c2c3ab23a60e7058754f777b3280dd579f))
* correct unsafe enum comparisons with Cmd in session actions ([f808138](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/f8081384752db0a52368520f2f6b2a5736c72fbe))
* Description api language ([9807479](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/9807479994c4b763484dcedd14f8b1a739234a1a))
* ensure safe config access and log interpolation ([ab4ba49](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/ab4ba4931b64dcbc5f41b71e7669531c78606bb6))
* fix check-types isssues ([abfae89](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/abfae89de0e71f97f8abdc67772e22ebd322614f))
* fix ESLint and TypeScript errors across codebase ([3b8712a](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/3b8712a96efd7d8ff97ca7a6c0018f49cf5e8d48))
* Fix example credential definition with did:web ([83e43d8](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/83e43d8c2249abf4f5479cf0e3d78c7b22ad84d9))
* inject StatProducerService via EventsModule ([#13](https://github.com/2060-io/hologram-welcome-ai-agent-vs/issues/13)) ([6728d63](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/6728d63c7d287dd3a17f953785524b715ce2bdb5))
* Remove comment ([e26a6a6](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/e26a6a6b126dd29089a67ffaa6f0f70cf6003d1e))
* update stats ([6d6c248](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/6d6c2483d6b6b2c7b2cb480b7a97dbf30f3913f3))
* update stats ([094e05c](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/094e05c1b723235133ec8f4a788064a099273743))
* Use dynamic date in agent system prompt (LLM prompt now reflects current date) ([#15](https://github.com/2060-io/hologram-welcome-ai-agent-vs/issues/15)) ([e99b02f](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/e99b02f8f4de59cacd8077704f1174b3bb3612fe))

## [1.4.0](https://github.com/2060-io/hologram-welcome-ai-agent-vs/compare/v1.3.1...v1.4.0) (2025-07-01)


### Features

* Add Helm chart for hologram welcome ai agent ([#6](https://github.com/2060-io/hologram-welcome-ai-agent-vs/issues/6)) ([9290594](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/9290594322f795bdba3bd456ffad459b43cf5e87))
* Make chunk size configurable via env var to avoid token limit docs ([#17](https://github.com/2060-io/hologram-welcome-ai-agent-vs/issues/17)) ([f21f3e1](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/f21f3e13a92cd2c372a98649f469c64807b20ad1))


### Bug Fixes

* Use dynamic date in agent system prompt (LLM prompt now reflects current date) ([#15](https://github.com/2060-io/hologram-welcome-ai-agent-vs/issues/15)) ([e99b02f](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/e99b02f8f4de59cacd8077704f1174b3bb3612fe))

## [1.4.0](https://github.com/2060-io/hologram-welcome-ai-agent-vs/compare/v1.3.2...v1.4.0) (2025-06-18)


### Features

* Make chunk size configurable via env var to avoid token limit docs ([#17](https://github.com/2060-io/hologram-welcome-ai-agent-vs/issues/17)) ([f21f3e1](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/f21f3e13a92cd2c372a98649f469c64807b20ad1))

## [1.3.2](https://github.com/2060-io/hologram-welcome-ai-agent-vs/compare/v1.3.1...v1.3.2) (2025-06-17)


### Bug Fixes

* Use dynamic date in agent system prompt (LLM prompt now reflects current date) ([#15](https://github.com/2060-io/hologram-welcome-ai-agent-vs/issues/15)) ([e99b02f](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/e99b02f8f4de59cacd8077704f1174b3bb3612fe))

## [1.3.1](https://github.com/2060-io/hologram-welcome-ai-agent-vs/compare/v1.3.0...v1.3.1) (2025-06-12)


### Bug Fixes

* inject StatProducerService via EventsModule ([#13](https://github.com/2060-io/hologram-welcome-ai-agent-vs/issues/13)) ([6728d63](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/6728d63c7d287dd3a17f953785524b715ce2bdb5))

## [1.3.0](https://github.com/2060-io/hologram-welcome-ai-agent-vs/compare/v1.2.0...v1.3.0) (2025-06-12)


### Features

* Update to use vs-agent-nestjs-client library ([#11](https://github.com/2060-io/hologram-welcome-ai-agent-vs/issues/11)) ([48e76c3](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/48e76c36d516412bf792f78a5611027c00362ec1))

## [1.2.0](https://github.com/2060-io/hologram-welcome-ai-agent-vs/compare/v1.1.0...v1.2.0) (2025-06-11)


### Features

* Add API swagger documentation to chatbot controller ([24584b7](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/24584b72a4e7adf2d51c5c1c593e4d3bcdd7ddaa))
* Add complete flow authentication ([4d0ff28](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/4d0ff287504af398159268ce85f04dcc677969ec))
* Add integration with vs-agent with service-agent-nestjs-client ([37cc925](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/37cc9258274252edc0aaacbc609cdd1422dba0aa))
* Add new enviroments to appConfig ([432f232](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/432f232439b6af9e80dc2b2239ec96fbefed8311))
* add Pinecone and Redis support to LangchainRagService ([2a3a217](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/2a3a217a7fb6afa2ea429f0d6d24b44149d79b07))
* Add select model openia to enviroment variable ([cccabea](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/cccabea271c856e46b1d1f7fc1ad329000ab4137))
* add support for loading and indexing CSV , MD documents as context sources ([8b9f49d](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/8b9f49d279dae5125af0951c457e509ea7c7b92a))
* Add tool authentication access, update docs and improve language detection ([910ee79](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/910ee7978351dc02cb7e133f80f5870ad6da32e4))
* enable embedding backend selection via ConfigService LLM_PROVIDER ([b1e0cb5](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/b1e0cb5979806f55fdf8879c11857c2e2564f79d))
* enable loading environment variables from .env file ([208f8b1](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/208f8b1156f2f5f9ce4bbe332224f19217eb6767))
* enable stats module for vs-agent-nestjs integration ([77fb69c](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/77fb69c008e87c7aadc7a0c9910e474f8b68edaf))
* Generate sendStats to new connection and include artemis and  stats module docker compose ([a422913](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/a4229136959e4a298f2ba153b3bf05a0318232aa))
* improve document ingestion to RAG service. ([bc259f2](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/bc259f2b62752ba05c3ea295817c5a1c3ddfe2a0))
* Improvement about core.module and integration with chatbot ia. ([7345d1d](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/7345d1dc623f95b067a4f13e1d4beea3605b3096))
* Initial commit Hologram  welcome AI agent ([007fb3e](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/007fb3e4374716f50da30bd265dc4128471cfd76))
* Initial commit Hologram welcome AI agent ([3189c9a](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/3189c9ae7f7844b48404369f13483e0653409bf2))
* Integrate stats module with dedicate tools statistics_fetcher ([f663a54](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/f663a54ce2a70147cc6f4ff5e669f24af0b4a537))
* Update documentation and version app ([36b366c](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/36b366c1c3b0ee5a67d8851c216ed559f62e85fc))
* Update documentation and version app ([68720e4](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/68720e461a0b7ebba2312fee12b965eb4fc5e69b))


### Bug Fixes

* fix:  ([597c545](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/597c54534d3a20465236c6abc52c8c02acc818b4))
* Add type to agentExcuteor definition ([d116889](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/d11688910b70041dcf0b6d5de31478a901ee18ff))
* change send objetc content only message to chatbot ia ([eb18d19](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/eb18d1991a0f1676d0ca5727efe8bdfd88739538))
* clean up lint issues and improve type to core,llm, memory, rag modules ([0fec74c](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/0fec74c2c3ab23a60e7058754f777b3280dd579f))
* correct unsafe enum comparisons with Cmd in session actions ([f808138](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/f8081384752db0a52368520f2f6b2a5736c72fbe))
* Description api language ([9807479](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/9807479994c4b763484dcedd14f8b1a739234a1a))
* ensure safe config access and log interpolation ([ab4ba49](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/ab4ba4931b64dcbc5f41b71e7669531c78606bb6))
* fix check-types isssues ([abfae89](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/abfae89de0e71f97f8abdc67772e22ebd322614f))
* fix ESLint and TypeScript errors across codebase ([3b8712a](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/3b8712a96efd7d8ff97ca7a6c0018f49cf5e8d48))
* Fix example credential definition with did:web ([83e43d8](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/83e43d8c2249abf4f5479cf0e3d78c7b22ad84d9))
* Remove comment ([e26a6a6](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/e26a6a6b126dd29089a67ffaa6f0f70cf6003d1e))
* update stats ([6d6c248](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/6d6c2483d6b6b2c7b2cb480b7a97dbf30f3913f3))
* update stats ([094e05c](https://github.com/2060-io/hologram-welcome-ai-agent-vs/commit/094e05c1b723235133ec8f4a788064a099273743))
