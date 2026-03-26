# Advanced Telegram Post Agent 🚀

A powerful, AI-powered Telegram bot that automatically discovers high-quality groups, joins them, and posts content intelligently.

## Features ✨

### 🤖 Intelligent Group Discovery
- **AI-Powered Search**: Uses LLM to generate smart keywords for finding relevant groups
- **Quality Scoring**: Automatically scores groups 1-10 based on relevance, activity, and posting potential
- **Smart Filtering**: Filters by member count (500-100k) and quality threshold

### 📤 Advanced Posting
- **Smart Retry Logic**: Exponential backoff (5s → 10s → 20s) for failed posts
- **Duplicate Prevention**: Never posts the same message twice to the same group
- **Custom Messages**: Optionally customizes content per group for better engagement
- **Batch Processing**: Posts to multiple groups efficiently

### 🧹 Auto-Cleanup
- **Restricted Group Detection**: Automatically detects and leaves restricted groups
- **Quality Tracking**: Monitors group performance and removes low-quality groups
- **Health Maintenance**: Keeps your account clean and healthy

### ⚡ Account Safety
- **Flood Wait Protection**: Detects Telegram limits and rotates accounts
- **Random Delays**: Human-like delays between actions (15-60 seconds)
- **Daily Limits**: Respects posting limits to avoid bans
- **Multi-Account Support**: Rotates through multiple sessions automatically

## Quick Start 🚀

### 1. Installation

```bash
# Clone or navigate to project
cd telegram-member-adder

# Install dependencies
npm install

# Copy environment file
cp .env.example .env
```

### 2. Configure Environment

Edit `.env` file:

```env
API_ID=12345678
API_HASH=your_api_hash_here
SOURCE_CHANNEL=-1003899699628
NICHE=Technology and AI Tools
LLM_MODEL=grok-3-auto
```

### 3. Run the Agent

```bash
# Run once (daily job)
npm start

# Run in agent mode (continuous)
npm run agent

# Test posting
npm run test:post
```

## Configuration ⚙️

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `API_ID` | ✅ | - | Telegram API ID |
| `API_HASH` | ✅ | - | Telegram API Hash |
| `SOURCE_CHANNEL` | ✅ | -1003899699628 | Channel to get posts from |
| `NICHE` | ✅ | Technology | Your content niche |
| `LLM_MODEL` | ❌ | grok-3-auto | LLM model to use |

### Advanced Settings (config.js)

```javascript
{
    dailyPostLimit: 50,          // Max posts per day
    searchGroupsLimit: 15,       // Groups to find per search
    minQualityScore: 5.0,         // Minimum quality to join (1-10)
    minGroupMembers: 500,        // Minimum members required
    maxGroupMembers: 100000,     // Maximum members (avoid huge groups)
    delayBetweenPostsMin: 20000,  // Min delay between posts (ms)
    delayBetweenPostsMax: 45000,  // Max delay between posts (ms)
    maxRetriesPerGroup: 3,       // Retry attempts per group
    cleanupEnabled: true,         // Auto-cleanup restricted groups
    useQualityScoring: true,      // Enable LLM quality scoring
}
```

## How It Works 🔄

### Agent Mode (Recommended)

The agent runs in a continuous loop:

```
1. Initialize → Get latest posts from source
2. Analyze State → Check what's been posted, limits
3. Make Decision → LLM decides next action:
   - searchGroups: Find new groups
   - searchAndPost: Find + join + post in one go
   - postToGroups: Post to already-joined groups
   - cleanupGroups: Remove restricted groups
   - wait: Cooldown if needed
   - finishTask: Stop when done
4. Execute Action → Perform the decided action
5. Repeat → Until daily limit reached
```

### Daily Job Mode

Single execution mode:

```
1. Get latest message from source channel
2. Discover new groups using LLM keywords
3. Score groups by quality (1-10)
4. Join and post to best groups
5. Cleanup restricted/low-quality groups
6. Report statistics
```

## Agent Tools 🛠️

### Available Actions

| Tool | Description | When to Use |
|------|-------------|-------------|
| `searchGroups` | Find new groups by keyword | Need to discover fresh groups |
| `joinGroup` | Join a specific group | Found a promising group |
| `postToGroups` | Post to joined groups | Post content to existing groups |
| `searchAndPost` | Find, join, and post | Comprehensive posting (recommended) |
| `cleanupGroups` | Leave restricted groups | Periodic maintenance |
| `wait` | Wait for cooldown | Flood wait detected |
| `finishTask` | Stop the agent | Daily work complete |

### Example Decisions

```json
{
  "thought": "Need to expand reach. Will search for new AI-related groups.",
  "action": "searchAndPost",
  "args": { "keywords": ["ai tools", "chatgpt", "productivity"] }
}
```

## Database 📊

The agent maintains a SQLite database (`data.db`) with:

- **Post History**: Tracks what's been posted where
- **Group Quality**: Scores and stats for each group
- **Restricted Groups**: Blacklist of blocked groups
- **Agent History**: Logs of agent decisions and actions

### View Statistics

```javascript
import { getDailyStats, getTopQualityGroups } from './storage.js';

// Today's stats
const stats = getDailyStats();
console.log(`Posts: ${stats.postsToday}, Groups: ${stats.groupsPosted}`);

// Top quality groups
const topGroups = getTopQualityGroups(10);
console.log(topGroups);
```

## Safety & Best Practices 🛡️

### Recommended Settings

- **Daily Limit**: 30-50 posts (start conservative)
- **Delays**: 20-60 seconds between posts
- **Quality Threshold**: 5.0+ (don't join low-quality groups)
- **Cleanup**: Enable automatic cleanup

### What NOT to Do

- ❌ Don't set daily limit too high (>100)
- ❌ Don't use very short delays (<10s)
- ❌ Don't join groups with <100 members
- ❌ Don't ignore flood wait errors

### Handling Errors

The agent handles these errors automatically:

| Error | Response |
|-------|----------|
| `FLOOD_WAIT` | Wait and retry, or rotate account |
| `PEER_FLOOD` | Rotate to next account |
| `FORBIDDEN` | Leave group, add to blacklist |
| Network Error | Retry with backoff |

## Architecture 🏗️

```
src/
├── agent.js          # Main agent logic
├── daily-job.js      # Batch posting job
├── telegram-actions.js # Telegram API calls
├── llm.js            # LLM integration
├── storage.js        # Database operations
├── config.js         # Configuration
├── client.js         # Telegram client setup
└── utils.js          # Utilities
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed architecture.

## Troubleshooting 🔧

### Common Issues

**Agent not posting**
- Check API credentials
- Verify SOURCE_CHANNEL exists and has messages
- Check daily limit not reached

**Too many flood waits**
- Increase delays in config
- Reduce daily post limit
- Use multiple accounts

**Groups not being found**
- Increase `searchGroupsLimit`
- Improve `NICHE` description
- Try different keywords

### Debug Mode

```bash
# Run with verbose logging
DEBUG=* npm start

# Test specific functions
npm run test:post
npm run test:llm
```

## Changelog 📝

### v2.0.0 - Advanced Post Agent (Current)
- ✅ Removed member adding functionality
- ✅ Added intelligent group discovery
- ✅ Added quality scoring (1-10)
- ✅ Added smart retry logic
- ✅ Added automatic cleanup
- ✅ Added content customization
- ✅ Enhanced error handling

### v1.0.0 - Original Member Adder
- Member scraping and adding
- Basic posting
- Simple retry logic

## License 📄

MIT - Use freely, modify as needed.

## Support 💬

For issues or feature requests, please open an issue on GitHub.
