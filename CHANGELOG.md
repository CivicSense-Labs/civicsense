# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial project scaffolding
- Multi-agent workflow system with LangGraph-style state management
- SMS and Voice webhook integration via Twilio
- Smart deduplication using vector embeddings and geo-proximity
- Real-time dashboard with Streamlit
- Supabase backend with PostgreSQL and pgVector
- Complete CI/CD pipeline with GitHub Actions
- Comprehensive documentation and contributing guidelines

### Features
- **Intake Agent**: Extracts structured data from SMS/voice reports
- **Geo Validation Agent**: Validates locations with Google Maps API
- **Deduplication Agent**: Finds similar tickets using vector similarity
- **Merge Agent**: Combines duplicate reports under parent tickets
- **Sentiment Agent**: Analyzes emotional tone and urgency
- **Notification Agent**: Sends SMS confirmations and daily digests
- **Real-time Dashboard**: Live metrics and interactive ticket management

### Security
- Phone number hashing (SHA-256)
- OTP verification via Twilio Verify
- Rate limiting (5 reports per phone per day)
- Row Level Security (RLS) policies
- Input validation with Zod schemas

## [1.0.0] - TBD

### Added
- Initial release of CivicSense
- Production-ready multi-agent 311 reporting system
- Complete documentation and deployment guides

---

## Types of Changes
- **Added** for new features
- **Changed** for changes in existing functionality
- **Deprecated** for soon-to-be removed features
- **Removed** for now removed features
- **Fixed** for any bug fixes
- **Security** in case of vulnerabilities