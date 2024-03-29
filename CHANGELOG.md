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
