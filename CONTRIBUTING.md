# Contributing to CivicSense 🤝

Thank you for your interest in contributing to CivicSense! This document provides guidelines and information for contributors.

## 🌟 Ways to Contribute

- 🐛 **Bug Reports**: Help us identify and fix issues
- 🚀 **Feature Requests**: Suggest new functionality
- 💻 **Code Contributions**: Submit pull requests
- 📚 **Documentation**: Improve docs, tutorials, examples
- 🧪 **Testing**: Write tests, test new features
- 🎨 **Design**: UI/UX improvements for the dashboard
- 🌍 **Translation**: Help make CivicSense accessible globally

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+
- **Python** 3.8+ (for dashboard)
- **Supabase CLI** ([install guide](https://supabase.com/docs/guides/cli))
- **Git** for version control

### Development Setup

1. **Fork the repository** on GitHub
2. **Clone your fork**:
   ```bash
   git clone https://github.com/YOUR-USERNAME/civicsense.git
   cd civicsense
   ```

3. **Add upstream remote**:
   ```bash
   git remote add upstream https://github.com/ORIGINAL-OWNER/civicsense.git
   ```

4. **Set up development environment**:
   ```bash
   # Copy environment template
   cp .env.example .env.local
   # Edit .env.local with your API keys

   # One-command setup
   make demo
   ```

5. **Start development servers**:
   ```bash
   make dev
   ```

## 🔄 Development Workflow

### Branching Strategy

We use **GitHub Flow** with these branch naming conventions:

- `main` - Production-ready code
- `develop` - Integration branch for features
- `feature/description` - New features
- `bugfix/description` - Bug fixes
- `hotfix/description` - Critical production fixes
- `docs/description` - Documentation updates

### Making Changes

1. **Create a feature branch**:
   ```bash
   git checkout -b feature/amazing-new-feature
   ```

2. **Make your changes** following our coding standards

3. **Test your changes**:
   ```bash
   make test           # Run all tests
   make lint           # Check code style
   make type-check     # TypeScript validation
   ```

4. **Commit your changes**:
   ```bash
   git add .
   git commit -m "feat: add amazing new feature"
   ```

5. **Push to your fork**:
   ```bash
   git push origin feature/amazing-new-feature
   ```

6. **Create a Pull Request** on GitHub

### Commit Message Format

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

**Types:**
- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**
```
feat(agents): add sentiment analysis agent
fix(sms): resolve webhook validation issue
docs: update API documentation
test(workflow): add end-to-end tests
```

## 📋 Code Standards

### TypeScript/JavaScript

- **Strict TypeScript**: All code must pass `npm run type-check`
- **ESLint**: Follow the project's ESLint configuration
- **Prettier**: Code must be formatted with Prettier
- **No `any` types**: Use proper typing
- **Function documentation**: Add JSDoc comments for public functions

**Example:**
```typescript
/**
 * Process an SMS report through the agent workflow
 * @param input - The SMS webhook payload
 * @returns Promise resolving to workflow result
 */
export async function processIntakeWorkflow(
  input: WorkflowInput
): Promise<WorkflowResult> {
  // Implementation...
}
```

### Python (Dashboard)

- **PEP 8**: Follow Python style guidelines
- **Type hints**: Use type annotations where possible
- **Docstrings**: Document functions and classes
- **Imports**: Group and order imports correctly

### Database

- **Migrations**: All schema changes must have migrations
- **Naming**: Use snake_case for tables and columns
- **Comments**: Document complex queries and schemas
- **RLS**: Ensure Row Level Security is properly configured

## 🧪 Testing

### Running Tests

```bash
# All tests
make test

# Specific test suites
npm test -- --testPathPattern=agents
npm test -- --testPathPattern=utils

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

### Writing Tests

- **Unit tests**: Test individual functions and classes
- **Integration tests**: Test component interactions
- **End-to-end tests**: Test complete workflows
- **Test coverage**: Aim for >80% coverage on new code

**Example test:**
```typescript
describe('Intake Agent', () => {
  it('should extract structured data from SMS', async () => {
    const result = await intakeAgent('Pothole at Broad & Market', mockState);

    expect(result.success).toBe(true);
    expect(result.data?.category).toBe('pothole');
    expect(result.data?.cross_street).toContain('Broad');
  });
});
```

## 📚 Documentation

### Code Documentation

- **README**: Keep the main README updated
- **API docs**: Document all public APIs
- **Code comments**: Explain complex logic
- **Type definitions**: Maintain accurate TypeScript types

### Writing Style

- **Clear and concise**: Use simple, direct language
- **Examples**: Include code examples where helpful
- **Structure**: Use consistent formatting and organization
- **Links**: Link to relevant resources and documentation

## 🐛 Bug Reports

When reporting bugs, please include:

1. **Clear description** of the issue
2. **Steps to reproduce** the problem
3. **Expected vs actual behavior**
4. **Environment details** (OS, Node.js version, etc.)
5. **Relevant logs or error messages**
6. **Screenshots** if applicable

Use our [bug report template](.github/ISSUE_TEMPLATE/bug_report.yml).

## 🚀 Feature Requests

For feature requests, please provide:

1. **Problem statement**: What problem does this solve?
2. **Proposed solution**: How should it work?
3. **Use case**: When would you use this feature?
4. **Alternatives considered**: What other approaches did you think about?

Use our [feature request template](.github/ISSUE_TEMPLATE/feature_request.yml).

## 🔍 Pull Request Process

### Before Submitting

- [ ] **Tests pass**: `make test` succeeds
- [ ] **Linting passes**: `make lint` succeeds
- [ ] **Types check**: `make type-check` succeeds
- [ ] **Documentation updated**: README, API docs, etc.
- [ ] **Changelog entry**: Add entry if needed

### PR Description Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing completed

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] Tests added/updated
```

### Review Process

1. **Automated checks** must pass (CI/CD pipeline)
2. **Code review** by maintainers
3. **Testing** in development environment
4. **Approval** from at least one maintainer
5. **Merge** to target branch

## 🏗️ Architecture Guidelines

### Agent Design

- **Single responsibility**: Each agent has one clear purpose
- **Stateless**: Agents should not maintain internal state
- **Error handling**: Graceful failure with helpful error messages
- **Logging**: Comprehensive logging for debugging

### API Design

- **RESTful**: Follow REST conventions
- **Validation**: Input validation with Zod schemas
- **Error responses**: Consistent error format
- **Documentation**: OpenAPI/Swagger documentation

### Database Design

- **Normalization**: Properly normalized schema
- **Indexes**: Appropriate indexes for performance
- **Constraints**: Foreign keys and check constraints
- **Security**: RLS policies for data protection

## 🔒 Security Guidelines

### Sensitive Data

- **Never commit**: API keys, passwords, tokens
- **Environment variables**: Use `.env.local` for secrets
- **Encryption**: Encrypt PII in database
- **Hashing**: Hash phone numbers, don't store plaintext

### Input Validation

- **Sanitize inputs**: Validate all user inputs
- **SQL injection**: Use parameterized queries
- **Rate limiting**: Implement appropriate rate limits
- **CORS**: Configure CORS for production

## 📋 Release Process

### Version Numbers

We use [Semantic Versioning](https://semver.org/):
- `MAJOR.MINOR.PATCH`
- Breaking changes increment MAJOR
- New features increment MINOR
- Bug fixes increment PATCH

### Release Steps

1. **Update version** in `package.json`
2. **Update CHANGELOG.md** with release notes
3. **Create release tag**: `git tag v1.2.3`
4. **Push tag**: `git push origin v1.2.3`
5. **GitHub Actions** handles the rest automatically

## 💬 Community

### Communication Channels

- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: General questions and ideas
- **Pull Requests**: Code review and collaboration

### Code of Conduct

We follow the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). Please read and follow these guidelines to ensure a welcoming environment for all contributors.

### Getting Help

- **Documentation**: Check the [Wiki](https://github.com/your-org/civicsense/wiki)
- **Issues**: Search existing issues before creating new ones
- **Discussions**: Use GitHub Discussions for questions
- **Email**: Contact maintainers at contribute@civicsense.dev

## 🙏 Recognition

Contributors are recognized in:
- **Contributors section** of README
- **Release notes** for significant contributions
- **GitHub contributors** page
- **Special thanks** in project documentation

## 📝 License

By contributing to CivicSense, you agree that your contributions will be licensed under the same [MIT License](LICENSE) that covers the project.

---

**Thank you for contributing to CivicSense! 🏛️❤️**

Every contribution, no matter how small, helps make municipal services more accessible and efficient for everyone.