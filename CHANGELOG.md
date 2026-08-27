# [1.3.0-beta.2](https://github.com/apimatic/apimatic-cli/compare/v1.3.0-beta.1...v1.3.0-beta.2) (2026-08-27)


### Bug Fixes

* cold start and missing docs links ([#331](https://github.com/apimatic/apimatic-cli/issues/331)) ([591c10e](https://github.com/apimatic/apimatic-cli/commit/591c10ebe3df0035b8a5da744374f7b979187f39)), closes [#328](https://github.com/apimatic/apimatic-cli/issues/328) [#329](https://github.com/apimatic/apimatic-cli/issues/329)

# [1.3.0-beta.1](https://github.com/apimatic/apimatic-cli/compare/v1.2.0...v1.3.0-beta.1) (2026-08-24)


### Bug Fixes

* clarify CLI messages for plugin generation and publishing setup ([#325](https://github.com/apimatic/apimatic-cli/issues/325)) ([711fc39](https://github.com/apimatic/apimatic-cli/commit/711fc39f6aff0b817daf5ec887db928d5eb53122))
* fail when --expand-* flags cannot be honoured without a spec ([c1e826c](https://github.com/apimatic/apimatic-cli/commit/c1e826c9bb2308333b00dfa4d02f80a816f2e345))
* guard the 401 body parse on the transformation error path ([0871f65](https://github.com/apimatic/apimatic-cli/commit/0871f65b599225221634a04b0a265de781b6c169))
* name the build directory correctly in the empty spec error ([d73c5c3](https://github.com/apimatic/apimatic-cli/commit/d73c5c37e9c521d5fe069433de4dcad06152ee92))
* point the auth hint at the command that accepts the key ([2ad98cd](https://github.com/apimatic/apimatic-cli/commit/2ad98cd7be0193455bf31d7a9e3a1f470cf63e46))
* poll for publish completion in interactive sdk publish ([#315](https://github.com/apimatic/apimatic-cli/issues/315)) ([68b5660](https://github.com/apimatic/apimatic-cli/commit/68b566015955d278de9646c341fabaa2701daad9)), closes [#312](https://github.com/apimatic/apimatic-cli/issues/312) [#313](https://github.com/apimatic/apimatic-cli/issues/313)
* report a rejected auth key accurately on login ([8bb35eb](https://github.com/apimatic/apimatic-cli/commit/8bb35eb59b17a0ecf3d9f1bb2a3080c1c03b0099))
* report every validation error and extract shared generation status polling ([#307](https://github.com/apimatic/apimatic-cli/issues/307)) ([e823b4d](https://github.com/apimatic/apimatic-cli/commit/e823b4d25411608080eec0384a197697f4db3775))
* report logged-out state correctly in auth status ([2993889](https://github.com/apimatic/apimatic-cli/commit/2993889c62306eefc14ed539cb3b37dcc580fa2f))
* report the build directory in the toc spec errors ([9a56786](https://github.com/apimatic/apimatic-cli/commit/9a5678677939fd495f550a72b30bef4f0fbf67bd))
* require a spec directory for portal toc new ([8432629](https://github.com/apimatic/apimatic-cli/commit/843262989f389ee090d4c3a4d710a65be8fc13f9))
* surface actionable auth hint on validate, transform and publishing errors ([a1ab840](https://github.com/apimatic/apimatic-cli/commit/a1ab84045a389544fe73866286dd0acc9bd39c16))
* surface TOC extraction failures instead of writing a partial toc.yml ([5332a99](https://github.com/apimatic/apimatic-cli/commit/5332a99740edf011c171b208613e71965a7a13d9))


### Features

* add `apimatic plugin generate`, and share one bounded generation poll ([#314](https://github.com/apimatic/apimatic-cli/issues/314)) ([8f00d76](https://github.com/apimatic/apimatic-cli/commit/8f00d7667b68b0da503c18d56e7222aca3566c00)), closes [apimatic/apimatic-docs#829](https://github.com/apimatic/apimatic-docs/issues/829)
* add apimatic plugin publish ([#321](https://github.com/apimatic/apimatic-cli/issues/321)) ([31a233a](https://github.com/apimatic/apimatic-cli/commit/31a233a942e830bae47898bc13b3b1d1a453167e))
* AI-first messaging and Copilot-aware portal quickstart next steps ([177de58](https://github.com/apimatic/apimatic-cli/commit/177de586e303f5a7e3534f2e9efb4f2d60956c8f))
* create and maintain plugin-config.json from sdk publish and plugin generate ([#318](https://github.com/apimatic/apimatic-cli/issues/318)) ([4d2ecd7](https://github.com/apimatic/apimatic-cli/commit/4d2ecd7d384d972dba558a846b5e8175679798ca))
* lead with Context Plugins in quickstart and portal messaging ([e522c1c](https://github.com/apimatic/apimatic-cli/commit/e522c1ce4c11a251f146852415aa06a0c592d240))
* **quickstart:** prune build file to subscription before generating ([#294](https://github.com/apimatic/apimatic-cli/issues/294)) ([5d50968](https://github.com/apimatic/apimatic-cli/commit/5d509682696513d5fdd1de51b1b507b24dd8cd18))
* sdk publish v4 ([#317](https://github.com/apimatic/apimatic-cli/issues/317)) ([9ce977f](https://github.com/apimatic/apimatic-cli/commit/9ce977f5c1b3bf26aea1b311cee6e2b19ab63aac))
* surface API 401 error message with login suggestion in portal generation ([adaa8ae](https://github.com/apimatic/apimatic-cli/commit/adaa8aebd2a10bea57eec2e62a4409180be23ca4))
* tell the user how to try the generated plugin in Claude Code ([#326](https://github.com/apimatic/apimatic-cli/issues/326)) ([c7bff42](https://github.com/apimatic/apimatic-cli/commit/c7bff4232f32ff9024b3a4c610a41774a3acca68))

# [1.2.0](https://github.com/apimatic/apimatic-cli/compare/v1.1.0...v1.2.0) (2026-07-14)


### Features

* **quickstart:** prune build file to subscription before generating ([#294](https://github.com/apimatic/apimatic-cli/issues/294)) ([#296](https://github.com/apimatic/apimatic-cli/issues/296)) ([5f90b2a](https://github.com/apimatic/apimatic-cli/commit/5f90b2a57d47f3e2934f62f5994d3e4489fd1ba8))

# [1.1.0](https://github.com/apimatic/apimatic-cli/compare/v1.0.0...v1.1.0) (2026-07-02)


### Features

* graduate APIMatic CLI to first stable release ([#293](https://github.com/apimatic/apimatic-cli/issues/293)) ([7e92410](https://github.com/apimatic/apimatic-cli/commit/7e924107f8cf7ca6da67b9ab5f433be1404a51d3))

# [1.1.0-beta.19](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-beta.18...v1.1.0-beta.19) (2026-06-24)


### Features

* **portal:** prefer port 23513 and auto-configure API Copilot in quickstart ([#290](https://github.com/apimatic/apimatic-cli/issues/290)) ([45cc0e6](https://github.com/apimatic/apimatic-cli/commit/45cc0e69517892ecba33b8f6caf6770032bb42ba)), closes [#291](https://github.com/apimatic/apimatic-cli/issues/291)

# [1.1.0-beta.18](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-beta.17...v1.1.0-beta.18) (2026-06-11)


### Bug Fixes

* prevent portal generate hang on Node 22+ by extracting with adm-zip ([#283](https://github.com/apimatic/apimatic-cli/issues/283)) ([#284](https://github.com/apimatic/apimatic-cli/issues/284)) ([e3bac3e](https://github.com/apimatic/apimatic-cli/commit/e3bac3e6589f6580dd4fc74240c675b7c9550490))

# [1.1.0-beta.17](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-beta.16...v1.1.0-beta.17) (2026-05-15)


### Features

* add support for generation of v4 sdks ([#282](https://github.com/apimatic/apimatic-cli/issues/282)) ([8ad0138](https://github.com/apimatic/apimatic-cli/commit/8ad013806642ec3807dcd740a16d40b2f3b3e418))

# [1.1.0-beta.16](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-beta.15...v1.1.0-beta.16) (2026-05-13)


### Bug Fixes

* resolve sdk publishing for ruby and python ([#279](https://github.com/apimatic/apimatic-cli/issues/279)) ([21ad18a](https://github.com/apimatic/apimatic-cli/commit/21ad18a6cf13431fbb01cafabef2242b5407edae))

# [1.1.0-beta.15](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-beta.14...v1.1.0-beta.15) (2026-05-08)


### Features

* add container and input models in toc using new toc command ([#276](https://github.com/apimatic/apimatic-cli/issues/276)) ([3ae4374](https://github.com/apimatic/apimatic-cli/commit/3ae43743585c2c843bebdec936698e72c44c94a7))

# [1.1.0-beta.14](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-beta.13...v1.1.0-beta.14) (2026-04-28)


### Bug Fixes

* pass package settings directory only when package settings applied ([#274](https://github.com/apimatic/apimatic-cli/issues/274)) ([f178c20](https://github.com/apimatic/apimatic-cli/commit/f178c204bd2f1fbf5913af832549ce45aaaae6ee))

# [1.1.0-beta.13](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-beta.12...v1.1.0-beta.13) (2026-04-27)


### Bug Fixes

* resolve package-publishing api url ([#273](https://github.com/apimatic/apimatic-cli/issues/273)) ([99badc4](https://github.com/apimatic/apimatic-cli/commit/99badc4fb5b68eb118c8ba7c26a612e366e79039))

# [1.1.0-beta.12](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-beta.11...v1.1.0-beta.12) (2026-04-27)


### Features

* add sdk publish and publishing profile list commands ([#271](https://github.com/apimatic/apimatic-cli/issues/271)) ([71d0d75](https://github.com/apimatic/apimatic-cli/commit/71d0d75e16ee071b0dbd064a18cf95a11ad58c1a))

# [1.1.0-beta.11](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-beta.10...v1.1.0-beta.11) (2026-04-15)


### Features

* add sdk save-changes command for applying sdk customizations ([#270](https://github.com/apimatic/apimatic-cli/issues/270)) ([e170f61](https://github.com/apimatic/apimatic-cli/commit/e170f613ea2a1b95bad6c8a6c6d26a238c2cf062))

# [1.1.0-beta.10](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-beta.9...v1.1.0-beta.10) (2026-03-25)


### Bug Fixes

* simplify portal serve caching logic and fix debounce scheduling ([#253](https://github.com/apimatic/apimatic-cli/issues/253)) ([6c28da7](https://github.com/apimatic/apimatic-cli/commit/6c28da782e788b25ada8ad362c42b9cbdf186ba9))

# [1.1.0-beta.9](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-beta.8...v1.1.0-beta.9) (2026-03-11)


### Features

* add api-version flag in sdk generate ([#250](https://github.com/apimatic/apimatic-cli/issues/250)) ([2b007e1](https://github.com/apimatic/apimatic-cli/commit/2b007e17a05fba784b487646dc02bdbded3247a3)), closes [#249](https://github.com/apimatic/apimatic-cli/issues/249)

# [1.1.0-beta.8](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-beta.7...v1.1.0-beta.8) (2026-03-09)


### Bug Fixes

* update sdk quickstart to create minimal build ([#247](https://github.com/apimatic/apimatic-cli/issues/247)) ([9e54611](https://github.com/apimatic/apimatic-cli/commit/9e546110e3db251e0bc5d5a6747b31fa7b0d90b5)), closes [#246](https://github.com/apimatic/apimatic-cli/issues/246)

# [1.1.0-beta.7](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-beta.6...v1.1.0-beta.7) (2026-03-05)


### Features

* update sdk generate to accept build input instead of a spec file ([#243](https://github.com/apimatic/apimatic-cli/issues/243)) ([ea8e088](https://github.com/apimatic/apimatic-cli/commit/ea8e0888f5cbbf71c3a1d7dcb64e7e360546e804))

# [1.1.0-beta.6](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-beta.5...v1.1.0-beta.6) (2026-01-02)


### Features

* update status response handling for portal generation ([#232](https://github.com/apimatic/apimatic-cli/issues/232)) ([703b14d](https://github.com/apimatic/apimatic-cli/commit/703b14d1b32be37075bb780ed9a6a390a276b1a6))

# [1.1.0-beta.5](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-beta.4...v1.1.0-beta.5) (2025-11-25)


### Bug Fixes

* broken quickstart sample flow and empty events in toc ([#227](https://github.com/apimatic/apimatic-cli/issues/227)) ([acd2837](https://github.com/apimatic/apimatic-cli/commit/acd2837548179a4c46fe4b39ef020b345d8c2115))

# [1.1.0-beta.4](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-beta.3...v1.1.0-beta.4) (2025-11-10)


### Bug Fixes

* failing pruning api call ([#224](https://github.com/apimatic/apimatic-cli/issues/224)) ([04110e6](https://github.com/apimatic/apimatic-cli/commit/04110e618fd68b89797e2d8d376c3e918a66dede))

# [1.1.0-beta.3](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-beta.2...v1.1.0-beta.3) (2025-11-07)


### Features

* add support for spec pruning and webhooks callbacks flags in toc command  ([#220](https://github.com/apimatic/apimatic-cli/issues/220)) ([241d4be](https://github.com/apimatic/apimatic-cli/commit/241d4bed12dc705cdc10584cb91b08317b91e583))
* portal quickstart http multiselect ([#214](https://github.com/apimatic/apimatic-cli/issues/214)) ([0ee9f50](https://github.com/apimatic/apimatic-cli/commit/0ee9f5035f97803035fcc319718fe9e6c672d022))

# [1.1.0-beta.2](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-beta.1...v1.1.0-beta.2) (2025-09-19)


### Bug Fixes

* **readme:** remove portal quickstart references ([#212](https://github.com/apimatic/apimatic-cli/issues/212)) ([0840e19](https://github.com/apimatic/apimatic-cli/commit/0840e19c502d2b493c5d14ac0ffb16fc5a65ce28))

# [1.1.0-beta.1](https://github.com/apimatic/apimatic-cli/compare/v1.0.0-beta.1...v1.1.0-beta.1) (2025-09-19)


### Features

* add sdk quickstart flow and other various improvements ([#210](https://github.com/apimatic/apimatic-cli/issues/210)) ([2750491](https://github.com/apimatic/apimatic-cli/commit/2750491d68f53979d8bf7651f6e14568e57d2476))

# 1.0.0-beta.1 (2025-09-08)


### Bug Fixes

* add missing content header to telemetry api call ([#139](https://github.com/apimatic/apimatic-cli/issues/139)) ([f2b0e64](https://github.com/apimatic/apimatic-cli/commit/f2b0e64826d987ca844b285d8862ebf25e0fe286))
* **documentation:** improve messages for each command ([a2c0bfb](https://github.com/apimatic/apimatic-cli/commit/a2c0bfbd5c1867302cf27170dc3b2d3ca5bd64ca))
* **feature:** add force flag and change sdk version and package ([38db116](https://github.com/apimatic/apimatic-cli/commit/38db116b65b94f01a15c7c2d6351401a60ee1393))
* **help inconsistent:** fix help being inconsistent with actual platforms supported in sdk generate ([23b6e6d](https://github.com/apimatic/apimatic-cli/commit/23b6e6da15a073afa71962458c825ba54bcd5f50))
* **package:** change version in package file ([903c619](https://github.com/apimatic/apimatic-cli/commit/903c6196ef5e37fbffd8d6b744d6eedcdd7167f5))
* **path:** resolve paths to absolute ([f68bdde](https://github.com/apimatic/apimatic-cli/commit/f68bdde7e8c927602ea87e07d0e558b699082154))
* **portal:** override authkey not working if user is never logged in ever ([fb5d188](https://github.com/apimatic/apimatic-cli/commit/fb5d1884e7dc12917387903e5292e50367190162))
* quickstart fails for zipped specs ([#107](https://github.com/apimatic/apimatic-cli/issues/107)) ([49b403c](https://github.com/apimatic/apimatic-cli/commit/49b403c2b18fee6f203e9f0193531927fb47ca56))
* **readme & bug fix:** update readme, fix bugs ([141f1a9](https://github.com/apimatic/apimatic-cli/commit/141f1a9ad53b80fdb91d39ca87f61b6cdfc7d700))
* **refactor:** move print validation logic to utils file as common function and pretty the code ([05dbe41](https://github.com/apimatic/apimatic-cli/commit/05dbe41c875c70e4a2e6183e647c6fea1e10ad83))
* **refactor:** refactor code ([d7cb486](https://github.com/apimatic/apimatic-cli/commit/d7cb4863bcfd44f297f0525e0c7eae7ecef12695))
* **release:** add lock file to gitignore restore check_build workflow ([2eb959a](https://github.com/apimatic/apimatic-cli/commit/2eb959afc2a7ee2317959fc8525930acde2989dc))
* remove ignore flag from portal serve ([#140](https://github.com/apimatic/apimatic-cli/issues/140)) ([336f5b7](https://github.com/apimatic/apimatic-cli/commit/336f5b750997dd6d1a8b5a1da4f85137283bb3ad))
* remove simple-git dependency ([#151](https://github.com/apimatic/apimatic-cli/issues/151)) ([04d4669](https://github.com/apimatic/apimatic-cli/commit/04d466994722c116422d7e0d281a308c5c7dc355))
* removed existing spec in quickstart when providing spec explicitly ([#147](https://github.com/apimatic/apimatic-cli/issues/147)) ([126318f](https://github.com/apimatic/apimatic-cli/commit/126318f0c497fc105a51ede3febe07731c09b41f))
* resolve bug in unarchive method ([#144](https://github.com/apimatic/apimatic-cli/issues/144)) ([e70b7d2](https://github.com/apimatic/apimatic-cli/commit/e70b7d2c03069297a1c0fba1cf7529a74eadd2bd))
* resolve multiple visual issues and minor fixes  ([#136](https://github.com/apimatic/apimatic-cli/issues/136)) ([4589a6e](https://github.com/apimatic/apimatic-cli/commit/4589a6e988f0cddfa49fb9e7a995f41912c9451d))
* resolved import for filetype to conform with esm ([#106](https://github.com/apimatic/apimatic-cli/issues/106)) ([234d00f](https://github.com/apimatic/apimatic-cli/commit/234d00f2eeae0b7ff89f2386108d951b7658d1eb))
* **sdk & transform:** Fix bugs related to content and corner cases in transform and sdk generate ([e08ba51](https://github.com/apimatic/apimatic-cli/commit/e08ba51d6fc98e991f06f910702fd6b106868fbc))
* **sdk package:** get sdk package from npm ([4c8e178](https://github.com/apimatic/apimatic-cli/commit/4c8e1787eb21f04d81cab95b5a58e3133a61f7af))
* **types:** Add graphql type in destination format of schema ([019aed3](https://github.com/apimatic/apimatic-cli/commit/019aed39c8a9cb8425f2d46d1b9b58f6b8c69475))
* update user-agent format in api calls ([#135](https://github.com/apimatic/apimatic-cli/issues/135)) ([b16e374](https://github.com/apimatic/apimatic-cli/commit/b16e3747f9f62851c4d4b0cc975bfecdd7076d5d))
* updated dependency version of apimatic/sdk ([#90](https://github.com/apimatic/apimatic-cli/issues/90)) ([8efd8f8](https://github.com/apimatic/apimatic-cli/commit/8efd8f810b9d71914e1ffc762d2ab4b65a9040f9))
* **version:** update sdk and cli versions ([75cc181](https://github.com/apimatic/apimatic-cli/commit/75cc18146f2ec198ca7e82189f2d16281dce80f8))


### Features

* add better error messaging for sdk generation failures ([bac2b62](https://github.com/apimatic/apimatic-cli/commit/bac2b623a2a3efd2a78c711c731cb6c2764913cd))
* add new prompt framework ([#189](https://github.com/apimatic/apimatic-cli/issues/189)) ([1181f9e](https://github.com/apimatic/apimatic-cli/commit/1181f9ec60bacb634b585ce5ff0a482e9654778b))
* add responses for generate-via-file ([#143](https://github.com/apimatic/apimatic-cli/issues/143)) ([386be66](https://github.com/apimatic/apimatic-cli/commit/386be66c7f24df2b0fe9a9456bf23c998f9c00c3))
* add tracking events and improve messaging ([#171](https://github.com/apimatic/apimatic-cli/issues/171)) ([20c45de](https://github.com/apimatic/apimatic-cli/commit/20c45deed7a10cceb5d587290e4e31905e69c552))
* adds user-agent and various other improvements for serve, quickstart and recipe commands ([#110](https://github.com/apimatic/apimatic-cli/issues/110)) ([5eecf75](https://github.com/apimatic/apimatic-cli/commit/5eecf754b366015edf6a20f5ee354f9aec814abd))
* **auth-key in authorization flow:** add authorization in auth flow ([7522c43](https://github.com/apimatic/apimatic-cli/commit/7522c4340043958e4e8b3eb6ff8a45fc249bf524))
* **environment:** now cli will use production environment, make subscription messages more readable ([7868f76](https://github.com/apimatic/apimatic-cli/commit/7868f76f36af65f1bf774711c888d5d365a9094a))
* improve copilot prompts and messages ([#137](https://github.com/apimatic/apimatic-cli/issues/137)) ([a0906a6](https://github.com/apimatic/apimatic-cli/commit/a0906a641f631f7d9f4043eb27935122c16b52af))
* **login command:** implement login command ([47a9fca](https://github.com/apimatic/apimatic-cli/commit/47a9fca890c2ac30030761ca6c419259fff2c743))
* **portal:** adds portal quickstart and serve commands ([#33](https://github.com/apimatic/apimatic-cli/issues/33)) ([ab2da9a](https://github.com/apimatic/apimatic-cli/commit/ab2da9a0bcea520abcb92bba7e0d75b7dce6af60)), closes [#10](https://github.com/apimatic/apimatic-cli/issues/10)
* **portal:** adds portal:new:toc command and other various improvements ([#93](https://github.com/apimatic/apimatic-cli/issues/93)) ([cfae452](https://github.com/apimatic/apimatic-cli/commit/cfae452b26f2ebf393b22afb82740e5b18c78738)), closes [#55](https://github.com/apimatic/apimatic-cli/issues/55) [#56](https://github.com/apimatic/apimatic-cli/issues/56) [#72](https://github.com/apimatic/apimatic-cli/issues/72) [#73](https://github.com/apimatic/apimatic-cli/issues/73)
* **portal:** adds portal:recipe:new command for api recipes and migrates codebase to esm from commonjs ([#103](https://github.com/apimatic/apimatic-cli/issues/103)) ([adb6d0d](https://github.com/apimatic/apimatic-cli/commit/adb6d0dfdf878744fe744f6cee70acbecf8b269d)), closes [#62](https://github.com/apimatic/apimatic-cli/issues/62)
* rename portal:new:toc command to portal:toc:new ([#99](https://github.com/apimatic/apimatic-cli/issues/99)) ([1a6b1c4](https://github.com/apimatic/apimatic-cli/commit/1a6b1c4aa42aa23bf5439f473f8176f2733f41bf))
* restructure working directory usage across all portal commands ([#123](https://github.com/apimatic/apimatic-cli/issues/123)) ([a842d8f](https://github.com/apimatic/apimatic-cli/commit/a842d8ff05d198a35e0630d8dd3971e4f39ebabd))
* update apimatic.io base url with new subdomain base url ([a8796cd](https://github.com/apimatic/apimatic-cli/commit/a8796cd84f4f3b415e094b1af93f3e144272626b))
* update apimatic.io sdk ([1c4c576](https://github.com/apimatic/apimatic-cli/commit/1c4c576ed933e95362f198372f258782e5f4788a))
* update input directory structure for most commands and device login flow ([#134](https://github.com/apimatic/apimatic-cli/issues/134)) ([e172aa8](https://github.com/apimatic/apimatic-cli/commit/e172aa80c7978aa5b20591befceb09f70198f9a6)), closes [#111](https://github.com/apimatic/apimatic-cli/issues/111) [#113](https://github.com/apimatic/apimatic-cli/issues/113) [#116](https://github.com/apimatic/apimatic-cli/issues/116) [#117](https://github.com/apimatic/apimatic-cli/issues/117) [#119](https://github.com/apimatic/apimatic-cli/issues/119) [#124](https://github.com/apimatic/apimatic-cli/issues/124) [#125](https://github.com/apimatic/apimatic-cli/issues/125) [#126](https://github.com/apimatic/apimatic-cli/issues/126) [#130](https://github.com/apimatic/apimatic-cli/issues/130) [#129](https://github.com/apimatic/apimatic-cli/issues/129) [#127](https://github.com/apimatic/apimatic-cli/issues/127)
* update tslib dependency version to match apimatic sdk ([be06f73](https://github.com/apimatic/apimatic-cli/commit/be06f735eafdd93204800efeebc2d85f5c0e8613))
* **usage tracking:** update sdk to send cli user agent for tracking ([768c60b](https://github.com/apimatic/apimatic-cli/commit/768c60b14a7fac3b824d4178697971ecf9d431b2))

# [1.1.0-alpha.22](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-alpha.21...v1.1.0-alpha.22) (2025-09-05)


### Features

* add new prompt framework ([#189](https://github.com/apimatic/apimatic-cli/issues/189)) ([1181f9e](https://github.com/apimatic/apimatic-cli/commit/1181f9ec60bacb634b585ce5ff0a482e9654778b))

# [1.1.0-alpha.21](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-alpha.20...v1.1.0-alpha.21) (2025-08-18)


### Features

* add tracking events and improve messaging ([#171](https://github.com/apimatic/apimatic-cli/issues/171)) ([20c45de](https://github.com/apimatic/apimatic-cli/commit/20c45deed7a10cceb5d587290e4e31905e69c552))

# [1.1.0-alpha.20](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-alpha.19...v1.1.0-alpha.20) (2025-08-11)


### Bug Fixes

* remove simple-git dependency ([#151](https://github.com/apimatic/apimatic-cli/issues/151)) ([04d4669](https://github.com/apimatic/apimatic-cli/commit/04d466994722c116422d7e0d281a308c5c7dc355))

# [1.1.0-alpha.19](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-alpha.18...v1.1.0-alpha.19) (2025-08-06)


### Bug Fixes

* add missing content header to telemetry api call ([#139](https://github.com/apimatic/apimatic-cli/issues/139)) ([f2b0e64](https://github.com/apimatic/apimatic-cli/commit/f2b0e64826d987ca844b285d8862ebf25e0fe286))
* remove ignore flag from portal serve ([#140](https://github.com/apimatic/apimatic-cli/issues/140)) ([336f5b7](https://github.com/apimatic/apimatic-cli/commit/336f5b750997dd6d1a8b5a1da4f85137283bb3ad))
* removed existing spec in quickstart when providing spec explicitly ([#147](https://github.com/apimatic/apimatic-cli/issues/147)) ([126318f](https://github.com/apimatic/apimatic-cli/commit/126318f0c497fc105a51ede3febe07731c09b41f))
* resolve bug in unarchive method ([#144](https://github.com/apimatic/apimatic-cli/issues/144)) ([e70b7d2](https://github.com/apimatic/apimatic-cli/commit/e70b7d2c03069297a1c0fba1cf7529a74eadd2bd))


### Features

* add better error messaging for sdk generation failures ([bac2b62](https://github.com/apimatic/apimatic-cli/commit/bac2b623a2a3efd2a78c711c731cb6c2764913cd))
* add responses for generate-via-file ([#143](https://github.com/apimatic/apimatic-cli/issues/143)) ([386be66](https://github.com/apimatic/apimatic-cli/commit/386be66c7f24df2b0fe9a9456bf23c998f9c00c3))

# [1.1.0-alpha.18](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-alpha.17...v1.1.0-alpha.18) (2025-08-03)


### Features

* improve copilot prompts and messages ([#137](https://github.com/apimatic/apimatic-cli/issues/137)) ([a0906a6](https://github.com/apimatic/apimatic-cli/commit/a0906a641f631f7d9f4043eb27935122c16b52af))

# [1.1.0-alpha.17](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-alpha.16...v1.1.0-alpha.17) (2025-08-01)


### Bug Fixes

* resolve multiple visual issues and minor fixes  ([#136](https://github.com/apimatic/apimatic-cli/issues/136)) ([4589a6e](https://github.com/apimatic/apimatic-cli/commit/4589a6e988f0cddfa49fb9e7a995f41912c9451d))

# [1.1.0-alpha.16](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-alpha.15...v1.1.0-alpha.16) (2025-08-01)


### Bug Fixes

* update user-agent format in api calls ([#135](https://github.com/apimatic/apimatic-cli/issues/135)) ([b16e374](https://github.com/apimatic/apimatic-cli/commit/b16e3747f9f62851c4d4b0cc975bfecdd7076d5d))

# [1.1.0-alpha.15](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-alpha.14...v1.1.0-alpha.15) (2025-08-01)


### Features

* update input directory structure for most commands and device login flow ([#134](https://github.com/apimatic/apimatic-cli/issues/134)) ([e172aa8](https://github.com/apimatic/apimatic-cli/commit/e172aa80c7978aa5b20591befceb09f70198f9a6)), closes [#111](https://github.com/apimatic/apimatic-cli/issues/111) [#113](https://github.com/apimatic/apimatic-cli/issues/113) [#116](https://github.com/apimatic/apimatic-cli/issues/116) [#117](https://github.com/apimatic/apimatic-cli/issues/117) [#119](https://github.com/apimatic/apimatic-cli/issues/119) [#124](https://github.com/apimatic/apimatic-cli/issues/124) [#125](https://github.com/apimatic/apimatic-cli/issues/125) [#126](https://github.com/apimatic/apimatic-cli/issues/126) [#130](https://github.com/apimatic/apimatic-cli/issues/130) [#129](https://github.com/apimatic/apimatic-cli/issues/129) [#127](https://github.com/apimatic/apimatic-cli/issues/127)

# [1.1.0-alpha.14](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-alpha.13...v1.1.0-alpha.14) (2025-07-25)


### Features

* restructure working directory usage across all portal commands ([#123](https://github.com/apimatic/apimatic-cli/issues/123)) ([a842d8f](https://github.com/apimatic/apimatic-cli/commit/a842d8ff05d198a35e0630d8dd3971e4f39ebabd))

# [1.1.0-alpha.13](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-alpha.12...v1.1.0-alpha.13) (2025-07-11)


### Features

* adds user-agent and various other improvements for serve, quickstart and recipe commands ([#110](https://github.com/apimatic/apimatic-cli/issues/110)) ([5eecf75](https://github.com/apimatic/apimatic-cli/commit/5eecf754b366015edf6a20f5ee354f9aec814abd))

# [1.1.0-alpha.12](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-alpha.11...v1.1.0-alpha.12) (2025-07-04)


### Bug Fixes

* quickstart fails for zipped specs ([#107](https://github.com/apimatic/apimatic-cli/issues/107)) ([49b403c](https://github.com/apimatic/apimatic-cli/commit/49b403c2b18fee6f203e9f0193531927fb47ca56))

# [1.1.0-alpha.11](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-alpha.10...v1.1.0-alpha.11) (2025-07-04)


### Bug Fixes

* resolved import for filetype to conform with esm ([#106](https://github.com/apimatic/apimatic-cli/issues/106)) ([234d00f](https://github.com/apimatic/apimatic-cli/commit/234d00f2eeae0b7ff89f2386108d951b7658d1eb))

# [1.1.0-alpha.10](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-alpha.9...v1.1.0-alpha.10) (2025-07-03)


### Features

* **portal:** adds portal:recipe:new command for api recipes and migrates codebase to esm from commonjs ([#103](https://github.com/apimatic/apimatic-cli/issues/103)) ([adb6d0d](https://github.com/apimatic/apimatic-cli/commit/adb6d0dfdf878744fe744f6cee70acbecf8b269d)), closes [#62](https://github.com/apimatic/apimatic-cli/issues/62)

# [1.1.0-alpha.9](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-alpha.8...v1.1.0-alpha.9) (2025-06-26)


### Features

* rename portal:new:toc command to portal:toc:new ([#99](https://github.com/apimatic/apimatic-cli/issues/99)) ([1a6b1c4](https://github.com/apimatic/apimatic-cli/commit/1a6b1c4aa42aa23bf5439f473f8176f2733f41bf))

# [1.1.0-alpha.8](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-alpha.7...v1.1.0-alpha.8) (2025-06-24)


### Features

* **portal:** adds portal:new:toc command and other various improvements ([#93](https://github.com/apimatic/apimatic-cli/issues/93)) ([cfae452](https://github.com/apimatic/apimatic-cli/commit/cfae452b26f2ebf393b22afb82740e5b18c78738)), closes [#55](https://github.com/apimatic/apimatic-cli/issues/55) [#56](https://github.com/apimatic/apimatic-cli/issues/56) [#72](https://github.com/apimatic/apimatic-cli/issues/72) [#73](https://github.com/apimatic/apimatic-cli/issues/73)

# [1.1.0-alpha.7](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-alpha.6...v1.1.0-alpha.7) (2025-06-20)


### Bug Fixes

* updated dependency version of apimatic/sdk ([#90](https://github.com/apimatic/apimatic-cli/issues/90)) ([8efd8f8](https://github.com/apimatic/apimatic-cli/commit/8efd8f810b9d71914e1ffc762d2ab4b65a9040f9))

# [1.1.0-alpha.6](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-alpha.5...v1.1.0-alpha.6) (2025-03-17)


### Features

* **portal:** adds portal quickstart and serve commands ([#33](https://github.com/apimatic/apimatic-cli/issues/33)) ([ab2da9a](https://github.com/apimatic/apimatic-cli/commit/ab2da9a0bcea520abcb92bba7e0d75b7dce6af60)), closes [#10](https://github.com/apimatic/apimatic-cli/issues/10)

# [1.1.0-alpha.5](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-alpha.4...v1.1.0-alpha.5) (2023-09-28)


### Features

* update tslib dependency version to match apimatic sdk ([be06f73](https://github.com/apimatic/apimatic-cli/commit/be06f735eafdd93204800efeebc2d85f5c0e8613))

# [1.1.0-alpha.4](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-alpha.3...v1.1.0-alpha.4) (2023-09-28)


### Features

* update apimatic.io base url with new subdomain base url ([a8796cd](https://github.com/apimatic/apimatic-cli/commit/a8796cd84f4f3b415e094b1af93f3e144272626b))
* update apimatic.io sdk ([1c4c576](https://github.com/apimatic/apimatic-cli/commit/1c4c576ed933e95362f198372f258782e5f4788a))

# [1.1.0-alpha.3](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-alpha.2...v1.1.0-alpha.3) (2022-01-19)


### Features

* **usage tracking:** update sdk to send cli user agent for tracking ([768c60b](https://github.com/apimatic/apimatic-cli/commit/768c60b14a7fac3b824d4178697971ecf9d431b2))

# [1.1.0-alpha.2](https://github.com/apimatic/apimatic-cli/compare/v1.1.0-alpha.1...v1.1.0-alpha.2) (2022-01-06)


### Bug Fixes

* **help inconsistent:** fix help being inconsistent with actual platforms supported in sdk generate ([23b6e6d](https://github.com/apimatic/apimatic-cli/commit/23b6e6da15a073afa71962458c825ba54bcd5f50))

# [1.1.0-alpha.1](https://github.com/apimatic/apimatic-cli/compare/v1.0.2-alpha.2...v1.1.0-alpha.1) (2022-01-05)


### Features

* **environment:** now cli will use production environment, make subscription messages more readable ([7868f76](https://github.com/apimatic/apimatic-cli/commit/7868f76f36af65f1bf774711c888d5d365a9094a))

## [1.0.2-alpha.2](https://github.com/apimatic/apimatic-cli/compare/v1.0.2-alpha.1...v1.0.2-alpha.2) (2021-12-24)


### Bug Fixes

* **portal:** override authkey not working if user is never logged in ever ([fb5d188](https://github.com/apimatic/apimatic-cli/commit/fb5d1884e7dc12917387903e5292e50367190162))

## [1.0.1-alpha.11](https://github.com/apimatic/apimatic-cli/compare/v1.0.1-alpha.10...v1.0.1-alpha.11) (2021-12-24)


### Bug Fixes

* **portal:** bug in when generating portal before logging in ever with authkey ([82043f8](https://github.com/apimatic/apimatic-cli/commit/82043f8fb6658c153bdf168ef1e02801ffccdea2))

# [0.0.0-alpha.4](https://github.com/apimatic/apimatic-cli/compare/v0.0.0-alpha.3...v0.0.0-alpha.4) (2021-12-15)


### Bug Fixes

* **portal:** override auth key not working for first time user ([a30e224](https://github.com/apimatic/apimatic-cli/commit/a30e224bd192e0951ec2716c31749df8c7df0b0b))

# [0.0.0-alpha.3](https://github.com/apimatic/apimatic-cli/compare/v0.0.0-alpha.2...v0.0.0-alpha.3) (2021-12-09)


### Bug Fixes

* **refactor:** move print validation logic to utils file as common function and pretty the code ([05dbe41](https://github.com/apimatic/apimatic-cli/commit/05dbe41c875c70e4a2e6183e647c6fea1e10ad83))

# [0.0.0-alpha.2](https://github.com/apimatic/apimatic-cli/compare/v0.0.0-alpha.1...v0.0.0-alpha.2) (2021-12-08)


### Bug Fixes

* **documentation:** improve messages for each command ([a2c0bfb](https://github.com/apimatic/apimatic-cli/commit/a2c0bfbd5c1867302cf27170dc3b2d3ca5bd64ca))
* **feature:** add force flag and change sdk version and package ([38db116](https://github.com/apimatic/apimatic-cli/commit/38db116b65b94f01a15c7c2d6351401a60ee1393))
* **package:** change version in package file ([903c619](https://github.com/apimatic/apimatic-cli/commit/903c6196ef5e37fbffd8d6b744d6eedcdd7167f5))
* **path:** resolve paths to absolute ([f68bdde](https://github.com/apimatic/apimatic-cli/commit/f68bdde7e8c927602ea87e07d0e558b699082154))
* **readme & bug fix:** update readme, fix bugs ([141f1a9](https://github.com/apimatic/apimatic-cli/commit/141f1a9ad53b80fdb91d39ca87f61b6cdfc7d700))
* **refactor:** refactor code ([d7cb486](https://github.com/apimatic/apimatic-cli/commit/d7cb4863bcfd44f297f0525e0c7eae7ecef12695))
* **sdk & transform:** Fix bugs related to content and corner cases in transform and sdk generate ([e08ba51](https://github.com/apimatic/apimatic-cli/commit/e08ba51d6fc98e991f06f910702fd6b106868fbc))
* **sdk package:** get sdk package from npm ([4c8e178](https://github.com/apimatic/apimatic-cli/commit/4c8e1787eb21f04d81cab95b5a58e3133a61f7af))
* **types:** Add graphql type in destination format of schema ([019aed3](https://github.com/apimatic/apimatic-cli/commit/019aed39c8a9cb8425f2d46d1b9b58f6b8c69475))
* **version:** update sdk and cli versions ([75cc181](https://github.com/apimatic/apimatic-cli/commit/75cc18146f2ec198ca7e82189f2d16281dce80f8))

## [1.0.1-alpha.10](https://github.com/apimatic/apimatic-cli/compare/v1.0.1-alpha.9...v1.0.1-alpha.10) (2021-12-06)


### Bug Fixes

* **types:** Add graphql type in destination format of schema ([019aed3](https://github.com/apimatic/apimatic-cli/commit/019aed39c8a9cb8425f2d46d1b9b58f6b8c69475))

## [1.0.1-alpha.9](https://github.com/apimatic/apimatic-cli/compare/v1.0.1-alpha.8...v1.0.1-alpha.9) (2021-12-06)


### Bug Fixes

* **sdk & transform:** Fix bugs related to content and corner cases in transform and sdk generate ([e08ba51](https://github.com/apimatic/apimatic-cli/commit/e08ba51d6fc98e991f06f910702fd6b106868fbc))

## [1.0.1-alpha.8](https://github.com/apimatic/apimatic-cli/compare/v1.0.1-alpha.7...v1.0.1-alpha.8) (2021-12-06)


### Bug Fixes

* **package:** change version in package file ([903c619](https://github.com/apimatic/apimatic-cli/commit/903c6196ef5e37fbffd8d6b744d6eedcdd7167f5))

## [1.0.1-alpha.7](https://github.com/apimatic/apimatic-cli/compare/v1.0.1-alpha.6...v1.0.1-alpha.7) (2021-12-06)


### Bug Fixes

* **readme & bug fix:** update readme, fix bugs ([141f1a9](https://github.com/apimatic/apimatic-cli/commit/141f1a9ad53b80fdb91d39ca87f61b6cdfc7d700))

## [1.0.1-alpha.6](https://github.com/apimatic/apimatic-cli/compare/v1.0.1-alpha.5...v1.0.1-alpha.6) (2021-12-02)


### Bug Fixes

* **path:** resolve paths to absolute ([f68bdde](https://github.com/apimatic/apimatic-cli/commit/f68bdde7e8c927602ea87e07d0e558b699082154))

## [1.0.1-alpha.5](https://github.com/apimatic/apimatic-cli/compare/v1.0.1-alpha.4...v1.0.1-alpha.5) (2021-12-02)


### Bug Fixes

* **feature:** add force flag and change sdk version and package ([38db116](https://github.com/apimatic/apimatic-cli/commit/38db116b65b94f01a15c7c2d6351401a60ee1393))

## [1.0.1-alpha.4](https://github.com/apimatic/apimatic-cli/compare/v1.0.1-alpha.3...v1.0.1-alpha.4) (2021-12-01)


### Bug Fixes

* **documentation:** improve messages for each command ([a2c0bfb](https://github.com/apimatic/apimatic-cli/commit/a2c0bfbd5c1867302cf27170dc3b2d3ca5bd64ca))

## [1.0.1-alpha.3](https://github.com/apimatic/apimatic-cli/compare/v1.0.1-alpha.2...v1.0.1-alpha.3) (2021-12-01)


### Bug Fixes

* **sdk package:** get sdk package from npm ([4c8e178](https://github.com/apimatic/apimatic-cli/commit/4c8e1787eb21f04d81cab95b5a58e3133a61f7af))

## [1.0.1-alpha.2](https://github.com/apimatic/apimatic-cli/compare/v1.0.1-alpha.1...v1.0.1-alpha.2) (2021-11-30)


### Bug Fixes

* **refactor:** refactor code ([d7cb486](https://github.com/apimatic/apimatic-cli/commit/d7cb4863bcfd44f297f0525e0c7eae7ecef12695))

## [1.0.1-alpha.1](https://github.com/apimatic/apimatic-cli/compare/v1.0.0...v1.0.1-alpha.1) (2021-11-26)


### Bug Fixes

* **release:** add lock file to gitignore restore check_build workflow ([2eb959a](https://github.com/apimatic/apimatic-cli/commit/2eb959afc2a7ee2317959fc8525930acde2989dc))
