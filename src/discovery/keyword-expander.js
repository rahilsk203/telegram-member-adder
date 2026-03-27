import { llmRouter, TaskType } from '../llm-providers.js';
import { logger } from '../utils.js';

/**
 * Smart Keyword Expander
 * Dynamically generates and expands keywords based on niche and search results
 */
export class SmartKeywordExpander {
    constructor(niche) {
        this.niche = niche;
        this.keywordHistory = new Set();
        this.relatedTerms = new Map();
        this.learnedPatterns = [];
    }

    /**
     * Generate initial smart keywords from niche
     */
    async generateInitialKeywords(count = 12) {
        logger.info(`🔍 Generating smart keywords for niche: "${this.niche}"`);

        const prompt = `You are a Telegram group discovery expert specializing in finding communities.

NICHE: "${this.niche}"

Your task: Generate a JSON array of ${count} highly effective search keywords to find relevant Telegram groups.

Requirements:
1. Include BROAD terms (general topic searches)
2. Include SPECIFIC terms (niche subtopics)
3. Include TRENDING terms (what people search for now)
4. Include VARIATIONS (singular/plural, synonyms)
5. Include LOCAL/CULTURAL terms (regional variations if applicable)
6. Include EMERGING terms (new trends, tools, technologies)
7. Include COMMUNITY-focused terms (group naming patterns)
8. Include PROBLEM/SOLUTION terms (what users look for)

DO NOT include '#' symbols.

Return ONLY a valid JSON array of strings, nothing else.
Example: ["artificial intelligence", "chatgpt", "machine learning tools", "ai community"]`;

        try {
            const response = await llmRouter.getResponse(TaskType.GENERAL, prompt);
            const keywords = this.parseJSONArray(response);

            if (keywords && keywords.length > 0) {
                keywords.forEach(k => this.keywordHistory.add(k.toLowerCase()));
                logger.success(`✨ Generated ${keywords.length} smart keywords`);
                return keywords;
            }
        } catch (error) {
            logger.error("Error generating keywords:", error.message);
        }

        // Fallback
        return [this.niche.toLowerCase()];
    }

    /**
     * Expand keywords based on search results
     */
    async expandFromResults(groups, searchTerm) {
        if (!groups || groups.length === 0) return [];

        const groupNames = groups.map(g => g.title || g.username).join(', ');

        const prompt = `You are analyzing Telegram search results to discover new keyword patterns.

SEARCHED TERM: "${searchTerm}"
FOUND GROUPS: ${groupNames}

Analyze these results and return NEW keywords that might find even MORE relevant groups:

1. Extract TOPIC VARIATIONS from group names
2. Identify NAMING PATTERNS (how admins name similar groups)
3. Find RELATED SUBTOPICS that appear in titles
4. Suggest GEOGRAPHIC/LANGUAGE variations
5. Identify TRENDING TOOLS or TERMS mentioned

Return ONLY a valid JSON array of 5-8 new keywords to try, different from what we searched.
DO NOT include '#' symbols.
Example: ["ai tools free", "chatgpt alternatives", "gpt4 community"]`;

        try {
            const response = await llmRouter.getResponse(TaskType.GENERAL, prompt);
            const newKeywords = this.parseJSONArray(response);

            const filtered = newKeywords.filter(k =>
                !this.keywordHistory.has(k.toLowerCase())
            );

            filtered.forEach(k => this.keywordHistory.add(k.toLowerCase()));
            logger.info(`📈 Expanded ${filtered.length} new keywords from results`);

            return filtered;
        } catch (error) {
            logger.error("Error expanding keywords:", error.message);
            return [];
        }
    }

    /**
     * Generate semantic variations of a keyword
     */
    async generateVariations(keyword, count = 5) {
        const prompt = `Generate ${count} semantic variations of this search keyword: "${keyword}"

Return ONLY a valid JSON array of strings with variations that:
1. Use different but related words
2. Include common typos/misspellings
3. Include alternative phrasings
4. Include abbreviated forms
5. Include plural/singular variations

DO NOT include '#' symbols.
Example for "ai tools": ["artificial intelligence resources", "ai software", "ai apps", "ai utilities"]`;

        try {
            const response = await llmRouter.getResponse(TaskType.GENERAL, prompt);
            return this.parseJSONArray(response) || [];
        } catch (error) {
            logger.error("Error generating variations:", error.message);
            return [];
        }
    }

    /**
     * Generate multi-language keywords
     */
    async generateMultiLanguage(count = 6) {
        const prompt = `For the niche "${this.niche}", generate ${count} search keywords in multiple languages/regions that Telegram users might use.

Consider:
- English variations
- Regional/language-specific terms
- Local community naming conventions

Return ONLY a valid JSON array of strings.
Example: ["ai tools", "herramientas ia", "inteligencia artificial", "tools ia"]`;

        try {
            const response = await llmRouter.getResponse(TaskType.GENERAL, prompt);
            const keywords = this.parseJSONArray(response);

            const filtered = keywords.filter(k =>
                !this.keywordHistory.has(k.toLowerCase())
            );

            filtered.forEach(k => this.keywordHistory.add(k.toLowerCase()));
            return filtered;
        } catch (error) {
            logger.error("Error generating multi-language keywords:", error.message);
            return [];
        }
    }

    /**
     * Generate trend-based keywords
     */
    async generateTrendKeywords() {
        const prompt = `For the niche "${this.niche}", suggest 5 trending or emerging search terms that are gaining popularity recently.

Focus on:
- New tools or platforms
- Emerging technologies
- Viral topics
- Seasonal trends
- New feature releases

Return ONLY a valid JSON array of strings with current trend terms.
DO NOT include '#' symbols.
Example: ["gpt-4", "claude ai", "midjourney v6"]`;

        try {
            const response = await llmRouter.getResponse(TaskType.GENERAL, prompt);
            const keywords = this.parseJSONArray(response);

            const filtered = keywords.filter(k =>
                !this.keywordHistory.has(k.toLowerCase())
            );

            filtered.forEach(k => this.keywordHistory.add(k.toLowerCase()));
            return filtered;
        } catch (error) {
            logger.error("Error generating trend keywords:", error.message);
            return [];
        }
    }

    /**
     * Learn from posting success
     */
    learnFromSuccess(successfulKeywords, engagementScore) {
        this.learnedPatterns.push({
            keywords: successfulKeywords,
            score: engagementScore,
            timestamp: Date.now()
        });

        // Keep last 50 patterns
        if (this.learnedPatterns.length > 50) {
            this.learnedPatterns.shift();
        }
    }

    /**
     * Get best performing keywords from history
     */
    getBestKeywords(count = 5) {
        const sorted = [...this.learnedPatterns]
            .filter(p => p.score > 0)
            .sort((a, b) => b.score - a.score);

        const topKeywords = sorted.slice(0, count).flatMap(p => p.keywords);
        return [...new Set(topKeywords)].slice(0, count);
    }

    /**
     * Generate comprehensive keyword strategy
     */
    async generateComprehensiveStrategy(initialKeywords) {
        const strategy = {
            primary: initialKeywords.slice(0, 5),
            variations: [],
            multiLang: [],
            trends: [],
            related: []
        };

        // Generate variations for top keywords
        for (const keyword of initialKeywords.slice(0, 3)) {
            const variations = await this.generateVariations(keyword, 3);
            strategy.variations.push(...variations);
        }

        // Generate multi-language
        strategy.multiLang = await this.generateMultiLanguage(4);

        // Generate trends
        strategy.trends = await this.generateTrendKeywords();

        // Add related terms from map
        for (const [term, related] of this.relatedTerms) {
            if (related.length > 0) {
                strategy.related.push(...related.slice(0, 2));
            }
        }

        // Dedupe and limit
        const all = [
            ...strategy.primary,
            ...strategy.variations,
            ...strategy.multiLang,
            ...strategy.trends,
            ...strategy.related
        ];

        const unique = [...new Set(all.map(k => k.toLowerCase()))].slice(0, 30);
        strategy.all = unique;

        return strategy;
    }

    /**
     * Parse JSON array from response
     */
    parseJSONArray(text) {
        try {
            // Try direct parse
            try {
                return JSON.parse(text);
            } catch (e) { }

            // Try regex extraction
            const match = text.match(/\[[\s\S]*?\]/);
            if (match) {
                return JSON.parse(match[0]);
            }

            // Try splitting lines
            const lines = text.split('\n')
                .map(l => l.trim())
                .filter(l => l.length > 2)
                .filter(l => !l.startsWith('[') && !l.startsWith(']'));

            return lines.map(l => l.replace(/^["']|["']$/g, '').trim());
        } catch (e) {
            return null;
        }
    }
}
