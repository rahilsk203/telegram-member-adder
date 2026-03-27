# Super Advanced Telegram Agent

An intelligent, self-learning Telegram posting agent with advanced group discovery capabilities.

## Features

### 1. Smart Keyword Expansion
- **Dynamic keyword generation** using LLM
- **Semantic variations** of search terms
- **Multi-language keyword support** for global reach
- **Trend-based keyword discovery** for emerging topics
- **Learning from results** - improves over time

### 2. Multi-Hop Group Discovery
- **Chain discovery** - find groups through related groups
- **Link extraction** from group descriptions and pinned messages
- **Similar name pattern matching**
- **Topic-based expansion**

### 3. Predictive Quality Scoring
- **Pre-join quality assessment** before wasting joins
- **Multi-factor scoring:**
  - Relevance to niche
  - Quality indicators
  - Engagement potential
  - Safety/acceptance probability
- **Content-group matching**

### 4. Adaptive Learning System
- **Tracks posting results** automatically
- **Learns successful patterns:**
  - Best keywords
  - Optimal group sizes
  - Best posting times
  - Niche preferences
- **Performance prediction** for future groups

## Architecture

```
src/
├── discovery/
│   ├── keyword-expander.js      # Smart keyword generation
│   ├── multi-hop-discovery.js   # Chain group discovery
│   └── smart-discovery.js       # Unified discovery engine
├── intelligence/
│   ├── predictor.js            # Quality scoring
│   └── adaptive-learner.js     # Learning system
└── super-agent.js              # Main agent
```

## Quick Start

### Run the Super Agent

```bash
npm run super
```

### Test Components

```bash
# Test providers
npm run test:providers

# Test LLM functions
npm run test:llm

# Test standard agent
npm run test:agent
```

## How It Works

### Discovery Cycle

1. **Smart Keyword Generation**
   - Analyze niche
   - Generate 15+ relevant keywords
   - Create variations and trends

2. **Multi-Strategy Search**
   - Search with primary keywords
   - Expand with variations
   - Multi-hop discovery from results

3. **Quality Scoring**
   - Score all discovered groups
   - Filter by quality threshold
   - Rank by predicted success

4. **Adaptive Learning**
   - Record posting results
   - Update keyword effectiveness
   - Adjust strategy

### Agent Decisions

The agent uses LLM to decide:
- **smartDiscover** - Full discovery cycle
- **quickDiscover** - Fast discovery with learned keywords
- **joinQualityGroup** - Join scored group
- **postWithTracking** - Post with result tracking
- **cleanupRestricted** - Remove bad groups
- **getInsights** - Show learning insights

## Configuration

### Environment Variables

```env
API_ID=12345678
API_HASH=your_api_hash
SOURCE_CHANNEL=-1003899699628
NICHE="AI and Tech Tools"
LLM_MODEL=grok-3-auto
```

### Advanced Settings (config.js)

```javascript
{
    dailyPostLimit: 50,          // Max posts per day
    searchGroupsLimit: 15,       // Groups per search
    minQualityScore: 6.0,        // Minimum score to join
    minGroupMembers: 500,         // Minimum members
}
```

## Learning System

### What It Tracks

- **Group Performance**
  - Success rate per group
  - Engagement metrics
  - Post attempts

- **Keyword Effectiveness**
  - Success rate per keyword
  - Group quality from keyword
  - Usage count

- **Optimal Conditions**
  - Best group size range
  - Best posting time
  - Niche match quality

### How It Improves

1. Records every posting result
2. Updates keyword effectiveness scores
3. Learns successful patterns
4. Adjusts strategy recommendations
5. Predicts future group performance

## Output Example

```
SUPER ADVANCED AGENT ACTIVATED!
Daily post limit: 50
Target niche: AI and Tech Tools

Strategy Insights:
  [HIGH] Target groups with 5000-20000 members (75% success rate)
  [MEDIUM] Best posting time around 14:00

--- Super Agent Cycle 1/50 ---
Posted: 0/50 | Groups: 0

Running Smart Discovery Cycle...
Smart Discovery complete!
   Groups found: 45
   Groups scored: 45
   Groups recommended: 12

Top 5 Recommended Groups:
   1. aitoolscommunity - Score: 8.7
   2. chatgptdevelopers - Score: 8.5
   3. aiplugins - Score: 8.2
   4. techaihub - Score: 7.9
   5. gpt4users - Score: 7.6
```

## Benefits vs Standard Agent

| Feature | Standard | Super Agent |
|---------|---------|-------------|
| Keywords | Static list | Dynamic + LLM |
| Discovery | Single search | Multi-hop |
| Quality | Post-join only | Pre-join scoring |
| Learning | None | Full tracking |
| Adaptation | None | Self-improving |

## Tips

1. **First Run** - Let it discover groups for 2-3 cycles
2. **Monitor Insights** - Check `getInsights` for recommendations
3. **Daily Use** - Learning improves over time
4. **Quality Threshold** - Adjust based on success rate

## Troubleshooting

**No groups found?**
- Check API credentials
- Verify SOURCE_CHANNEL has messages
- Try different NICHE

**Low success rate?**
- Lower quality threshold
- Check content relevance
- Review insights for adjustments

**Flood waits?**
- Increase delays in config
- Use multiple accounts
- Reduce daily limit
