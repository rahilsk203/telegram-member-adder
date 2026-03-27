import { SmartKeywordExpander } from './keyword-expander.js';
import { MultiHopDiscovery } from './multi-hop-discovery.js';
import { PredictiveQualityScorer } from '../intelligence/predictor.js';
import { AdaptiveLearner } from '../intelligence/adaptive-learner.js';
import { searchPublicGroups } from '../telegram-actions.js';
import { logger, randomDelay } from '../utils.js';
import { config } from '../config.js';

/**
 * Smart Discovery Engine
 * Combines all advanced discovery strategies into one unified system
 */
export class SmartDiscoveryEngine {
    constructor(client, niche) {
        this.client = client;
        this.niche = niche;

        // Initialize components
        this.keywordExpander = new SmartKeywordExpander(niche);
        this.multiHopDiscovery = new MultiHopDiscovery(client);
        this.qualityScorer = new PredictiveQualityScorer(niche);
        this.learner = new AdaptiveLearner();

        // Discovery settings
        this.maxGroupsPerCycle = config.searchGroupsLimit;
        this.minQualityThreshold = config.minQualityScore;
        this.discoveryStats = {
            keywordsTried: 0,
            groupsFound: 0,
            groupsScored: 0,
            groupsRecommended: 0
        };
    }

    /**
     * Run comprehensive discovery cycle
     */
    async runDiscoveryCycle() {
        logger.info(`🚀 Starting Smart Discovery for: "${this.niche}"`);

        const allGroups = [];

        // Phase 1: Smart Keyword Generation
        logger.info("📊 Phase 1: Generating smart keywords...");
        const initialKeywords = await this.keywordExpander.generateInitialKeywords(15);
        this.discoveryStats.keywordsTried += initialKeywords.length;

        // Generate comprehensive strategy
        const strategy = await this.keywordExpander.generateComprehensiveStrategy(initialKeywords);
        logger.info(`✨ Strategy: ${strategy.all.length} keywords to try`);

        // Phase 2: Multi-Strategy Search
        logger.info("🔍 Phase 2: Multi-strategy group search...");

        // Search with primary keywords
        for (const keyword of strategy.primary) {
            const groups = await this.searchWithKeyword(keyword);
            allGroups.push(...groups.map(g => ({ ...g, keywordSource: keyword })));
            await randomDelay(2000, 4000);
        }

        // Search with variations
        for (const keyword of strategy.variations.slice(0, 5)) {
            const groups = await this.searchWithKeyword(keyword);
            allGroups.push(...groups.map(g => ({ ...g, keywordSource: keyword })));
            await randomDelay(2000, 4000);
        }

        // Also try multi-language keywords
        for (const keyword of strategy.multiLang.slice(0, 3)) {
            const groups = await this.searchWithKeyword(keyword);
            allGroups.push(...groups.map(g => ({ ...g, keywordSource: keyword })));
            await randomDelay(2000, 4000);
        }

        // Phase 3: Multi-Hop Discovery from top groups
        logger.info("🌐 Phase 3: Multi-hop discovery...");
        const topGroups = allGroups
            .sort((a, b) => (b.members || 0) - (a.members || 0))
            .slice(0, 10);

        if (topGroups.length > 0) {
            const relatedGroups = await this.multiHopDiscovery.discover(topGroups, 30);
            allGroups.push(...relatedGroups.map(g => ({ ...g, keywordSource: 'multi-hop' })));
        }

        // Phase 4: Deduplicate
        logger.info("🧹 Phase 4: Deduplicating groups...");
        const uniqueGroups = this.deduplicateGroups(allGroups);
        this.discoveryStats.groupsFound = uniqueGroups.length;
        logger.info(`📋 Found ${uniqueGroups.length} unique groups`);

        // Phase 5: Quality Scoring
        logger.info("⭐ Phase 5: Quality scoring...");
        const scoredGroups = await this.qualityScorer.scoreGroups(uniqueGroups);
        this.discoveryStats.groupsScored = scoredGroups.length;

        // Phase 6: Filter and Rank
        logger.info("🎯 Phase 6: Filtering and ranking...");
        const recommendedGroups = scoredGroups
            .filter(g => g.qualityScore >= this.minQualityThreshold)
            .filter(g => !this.shouldSkipGroup(g.username))
            .sort((a, b) => b.qualityScore - a.qualityScore)
            .slice(0, this.maxGroupsPerCycle);

        this.discoveryStats.groupsRecommended = recommendedGroups.length;

        // Log top recommendations
        logger.success(`✨ Top ${recommendedGroups.length} recommended groups:`);
        recommendedGroups.slice(0, 5).forEach((g, i) => {
            logger.info(`  ${i + 1}. ${g.username} (Score: ${g.qualityScore.toFixed(1)}) - ${g.recommendation}`);
        });

        return {
            groups: recommendedGroups,
            stats: this.discoveryStats,
            allScored: scoredGroups
        };
    }

    /**
     * Search with a single keyword
     */
    async searchWithKeyword(keyword) {
        try {
            logger.info(`Searching: "${keyword}"`);
            const groups = await searchPublicGroups(this.client, keyword);
            logger.info(`Found ${groups.length} groups for "${keyword}"`);

            if (groups.length > 0) {
                // Expand with similar keywords
                const newKeywords = await this.keywordExpander.expandFromResults(groups, keyword);
                this.discoveryStats.keywordsTried += newKeywords.length;
            }

            return groups;
        } catch (error) {
            logger.warn(`Search failed for "${keyword}":`, error.message);
            return [];
        }
    }

    /**
     * Check if group should be skipped
     */
    shouldSkipGroup(username) {
        // Check learner history
        const prediction = this.learner.predictGroupPerformance(username);
        if (prediction && prediction.predictedSuccess < 0.3) {
            return true;
        }

        // Check underperforming list
        const underperforming = this.learner.getUnderperformingGroups();
        if (underperforming.includes(username)) {
            return true;
        }

        return false;
    }

    /**
     * Get next best groups to target
     */
    async getNextBestGroups(count = 10) {
        // Use learned keywords
        const learnedKeywords = this.learner.getBestKeywords(5);

        if (learnedKeywords.length > 0) {
            logger.info(`Using learned keywords: ${learnedKeywords.join(', ')}`);
            const groups = [];
            for (const keyword of learnedKeywords.slice(0, 3)) {
                const results = await this.searchWithKeyword(keyword);
                groups.push(...results);
                await randomDelay(2000, 4000);
            }

            // Score and rank
            const scored = await this.qualityScorer.scoreGroups(groups);
            return scored
                .filter(g => g.qualityScore >= this.minQualityThreshold)
                .slice(0, count);
        }

        // Fallback to fresh discovery
        const result = await this.runDiscoveryCycle();
        return result.groups.slice(0, count);
    }

    /**
     * Record posting result for learning
     */
    recordPostResult(group, success, metrics = {}) {
        // Record in learner
        this.learner.recordPostResult(group, success, metrics);

        // Record keyword effectiveness
        if (group.keywordSource) {
            this.learner.recordKeywordEffectiveness([group.keywordSource], group, success);
        }

        // Update keyword expander
        if (success && group.keywordSource) {
            this.keywordExpander.learnFromSuccess([group.keywordSource], metrics.engagement || 5);
        }

        // Learn from quality scoring
        this.qualityScorer.learnFromResult(group.username, success);
    }

    /**
     * Get discovery statistics
     */
    getStats() {
        return {
            discovery: this.discoveryStats,
            learner: this.learner.getStats(),
            keywords: {
                total: this.keywordExpander.keywordHistory.size,
                best: this.keywordExpander.getBestKeywords(5)
            }
        };
    }

    /**
     * Generate strategy recommendations
     */
    getRecommendations() {
        return this.learner.generateRecommendations();
    }

    /**
     * Export all learning data
     */
    exportData() {
        return {
            learner: this.learner.exportLearningData(),
            keywords: {
                history: [...this.keywordExpander.keywordHistory],
                patterns: this.keywordExpander.learnedPatterns
            },
            stats: this.discoveryStats
        };
    }

    /**
     * Import learning data
     */
    importData(data) {
        if (data.learner) {
            this.learner.importLearningData(data.learner);
        }
        if (data.keywords) {
            data.keywords.history?.forEach(k => this.keywordExpander.keywordHistory.add(k));
            if (data.keywords.patterns) {
                this.keywordExpander.learnedPatterns.push(...data.keywords.patterns);
            }
        }
        logger.info("📚 Discovery engine data loaded");
    }

    /**
     * Deduplicate groups
     */
    deduplicateGroups(groups) {
        const seen = new Map();

        for (const group of groups) {
            if (!group.username) continue;

            const existing = seen.get(group.username);
            if (!existing) {
                seen.set(group.username, group);
            } else {
                // Keep the one with more members
                if ((group.members || 0) > (existing.members || 0)) {
                    seen.set(group.username, group);
                }
            }
        }

        return Array.from(seen.values());
    }
}
