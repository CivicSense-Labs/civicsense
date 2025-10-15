# Security Policy

## 🔒 Supported Versions

We release security updates for the following versions of CivicSense:

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | ✅ Active support |
| < 1.0   | ❌ Not supported  |

## 🛡️ Security Measures

CivicSense implements several security measures to protect user data and system integrity:

### Data Protection
- **Phone Number Hashing**: All phone numbers are SHA-256 hashed before storage
- **No PII Storage**: Personal identifiable information is minimized and encrypted
- **Rate Limiting**: 5 reports per phone number per day to prevent abuse
- **OTP Verification**: Required before submitting first report

### Input Validation
- **Zod Schema Validation**: All inputs validated with strict schemas
- **SQL Injection Prevention**: Parameterized queries and ORM protection
- **XSS Protection**: Input sanitization and output encoding
- **CORS Configuration**: Properly configured for production domains

### Infrastructure Security
- **Row Level Security (RLS)**: Database-level access controls
- **API Authentication**: Service-role key protection for sensitive operations
- **Environment Variables**: All secrets stored in environment variables
- **HTTPS Enforcement**: All production traffic encrypted in transit

### Access Controls
- **Least Privilege**: Minimal permissions for each component
- **Service Isolation**: Separate credentials for different services
- **Webhook Validation**: Twilio signature verification
- **API Rate Limiting**: Per-endpoint rate limiting

## 🚨 Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue, please follow these steps:

### 1. **DO NOT** open a public issue

Public disclosure of security vulnerabilities can put users at risk. Instead, please report privately.

### 2. Email our security team

**Email**: security@civicsense.dev

**Subject**: [SECURITY] Brief description of the vulnerability

### 3. Include the following information

- **Description**: Clear description of the vulnerability
- **Steps to reproduce**: Detailed steps to reproduce the issue
- **Impact**: Potential impact and affected components
- **Proof of concept**: If applicable, include PoC (non-destructive)
- **Suggested fix**: If you have ideas for fixing the issue

### 4. Provide your contact information

Include your name, email, and preferred method of communication for follow-up.

## 🔄 Response Process

### Timeline

| Action | Timeframe |
|--------|-----------|
| Initial response | Within 24 hours |
| Vulnerability assessment | Within 72 hours |
| Fix development | 1-14 days (depending on severity) |
| Security release | As soon as fix is ready |
| Public disclosure | 30 days after fix release |

### Severity Classification

We classify vulnerabilities using the following criteria:

#### 🔴 Critical (CVSS 9.0-10.0)
- Remote code execution
- SQL injection with data access
- Authentication bypass
- Mass data exposure

**Response**: Immediate hotfix within 24-48 hours

#### 🟠 High (CVSS 7.0-8.9)
- Privilege escalation
- Sensitive data exposure
- Cross-site scripting (stored)
- Denial of service

**Response**: Fix within 7 days

#### 🟡 Medium (CVSS 4.0-6.9)
- Information disclosure
- Cross-site request forgery
- Reflected XSS
- Rate limiting bypass

**Response**: Fix within 14 days

#### 🟢 Low (CVSS 0.1-3.9)
- Information leakage
- Missing security headers
- Weak cryptography (non-critical)

**Response**: Fix in next regular release

## 🏆 Responsible Disclosure

We believe in responsible disclosure and will work with security researchers to:

1. **Confirm and reproduce** the vulnerability
2. **Develop and test** a fix
3. **Coordinate disclosure** timeline
4. **Credit researchers** (if desired) in release notes and security advisories
5. **Consider bug bounties** for significant findings (when program is available)

## 🛠️ Security Configuration

### Environment Variables

Ensure these security-related environment variables are properly configured:

```bash
# Required security settings
ENCRYPTION_KEY=your-32-character-key
DATABASE_URL=postgresql://secure-connection
SUPABASE_SERVICE_ROLE_KEY=secure-key

# Rate limiting
MAX_REPORTS_PER_DAY=5
OTP_EXPIRY_MINUTES=10

# Production settings
NODE_ENV=production
BASE_URL=https://your-secure-domain.com
```

### Supabase Security

```sql
-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Example policy for service role access
CREATE POLICY "service_role_all_access" ON users
  FOR ALL USING (auth.role() = 'service_role');
```

### Twilio Security

- **Webhook Validation**: Always validate Twilio signatures
- **HTTPS Endpoints**: Use HTTPS for all webhook URLs
- **Credential Rotation**: Regularly rotate API keys

## 🔍 Security Auditing

### Regular Security Practices

- **Dependency Scanning**: Automated vulnerability scanning with Snyk
- **Code Analysis**: Static analysis with ESLint security rules
- **Penetration Testing**: Regular security assessments
- **Access Reviews**: Quarterly access permission reviews

### Security Monitoring

We monitor for:
- **Unusual API usage** patterns
- **Failed authentication** attempts
- **Rate limiting** violations
- **Database access** anomalies
- **Error rate** spikes

## 📚 Security Resources

### Developer Guidelines

- **OWASP Top 10**: Follow OWASP security guidelines
- **Secure Coding**: Use secure coding practices
- **Dependency Management**: Keep dependencies updated
- **Secrets Management**: Never commit secrets to version control

### External Resources

- [OWASP Application Security Guidelines](https://owasp.org/www-project-application-security-verification-standard/)
- [Node.js Security Checklist](https://blog.risingstack.com/node-js-security-checklist/)
- [Supabase Security Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [Twilio Security Best Practices](https://www.twilio.com/docs/usage/security)

## 📝 Security Updates

Security updates and advisories are published:

- **GitHub Security Advisories**: For vulnerability disclosures
- **Release Notes**: Security fixes included in release notes
- **Email Notifications**: For critical security updates (if subscribed)
- **Security Blog**: Detailed security analysis and improvements

## 🤝 Security Community

We welcome security-focused contributions:

- **Security improvements** via pull requests
- **Security documentation** enhancements
- **Security testing** and validation
- **Security tool** integration

## 📞 Contact

For security-related inquiries:

- **Security Team**: security@civicsense.dev
- **General Questions**: security-questions@civicsense.dev
- **PGP Key**: Available upon request

---

**Your security is our priority. Thank you for helping keep CivicSense secure! 🛡️**