# Changelog

All notable changes to this package are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-10-15

### Changed
- Minimum Node.js version raised to 22. Node.js 20 reached end of life in April 2026,
  and every supported version is now covered by CI.

### Added
- Releases are published from GitHub Actions with npm provenance.

## [0.1.0] - 2026-10-14

### Added
- Client for all 12 endpoints of the Tezga Fiscal API, written against the official
  [OpenAPI contract](https://tezgafiskal.com/api/openapi.json) (1.6.0).
- Webhook signature verification (`verifyWebhookSignature`, `parseWebhook`) and typed
  webhook events.
- `TezgaError` with the API's `error` message, per-field problems and a `retryable` flag.
- Request timeout, 30 seconds by default (`timeoutMs`).

[Unreleased]: https://github.com/GoSimple-agency/tezga-sdk-js/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/GoSimple-agency/tezga-sdk-js/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/GoSimple-agency/tezga-sdk-js/releases/tag/v0.1.0
