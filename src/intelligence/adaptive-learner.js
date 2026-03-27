import { logger } from '../utils.js';

/**
 * Adaptive Learning System
 * Learns from posting results to improve future decisions
 */
export class AdaptiveLearner {
    constructor() {
        this.groupPerformance = new Map();
        this.keywordPerformance = new Map();
        this.strategyPerformance = new Map();
        this.learningHistory = [];
        this.minSamplesForInsight = 3;
    }

    /**
     * Record a posting result
     */
    recordPostResult(group, success, metrics = {}) {
        const entry = {
            groupUsername: group.username,
            groupNiche: group.niche || 'unknown',
            groupSize: group.members || 0,
            success,
            metrics,
            timestamp: Date.now(),
            dayOfWeek: new Date().getDay(),
            hourOfDay: new Date().getHours()
        };

        // Update group performance
        this.updateGroupPerformance(entry);

        // Update learning history
        this.learningHistory.push(entry);

        // Keep last 500 entries
        if (this.learningHistory.length > 500) {
            this.learningHistory.shift();
        }

        logger.info(`📊 Recorded post result: ${group.username} - ${success ? 'SUCCESS' : 'FAIL'}`);
    }

    /**
     * Update group performance tracking
     */
    updateGroupPerformance(entry) {
        const existing = this.groupPerformance.get(entry.groupUsername) || {
            username: entry.groupUsername,
            attempts: 0,
            successes: 0,
            failures: 0,
            totalEngagement: 0,
            lastResult: null,
            avgScore: 5
        };

        existing.attempts++;
        if (entry.success) {
            existing.successes++;
        } else {
            existing.failures++;
        }

        if (entry.metrics.engagement) {
            existing.totalEngagement += entry.metrics.engagement;
        }

        existing.lastResult = entry.success;
        existing.avgScore = (existing.successes / existing.attempts) * 10;
        existing.lastAttempt = entry.timestamp;

        this.groupPerformance.set(entry.groupUsername, existing);
    }

    /**
     * Record keyword effectiveness
     */
    recordKeywordEffectiveness(keywords, group, success) {
        for (const keyword of keywords) {
            const existing = this.keywordPerformance.get(keyword) || {
                keyword,
                uses: 0,
                successRate: 0,
                avgGroupQuality: 0,
                totalSuccesses: 0
            };

            existing.uses++;
            if (success) existing.totalSuccesses++;
            existing.successRate = existing.totalSuccesses / existing.uses;

            if (group.qualityScore) {
                existing.avgGroupQuality = (
                    (existing.avgGroupQuality * (existing.uses - 1) + group.qualityScore)
                    / existing.uses
                );
            }

            this.keywordPerformance.set(keyword, existing);
        }
    }

    /**
     * Get best performing keywords
     */
    getBestKeywords(count = 5) {
        return [...this.keywordPerformance.values()]
            .filter(k => k.uses >= this.minSamplesForInsight)
            .sort((a, b) => b.successRate - a.successRate)
            .slice(0, count)
            .map(k => k.keyword);
    }

    /**
     * Get best performing group characteristics
     */
    getBestGroupCharacteristics() {
        const successfulGroups = this.learningHistory.filter(e => e.success);
        const failedGroups = this.learningHistory.filter(e => !e.success);

        return {
            optimalSize: this.analyzeOptimalSize(successfulGroups, failedGroups),
            optimalTiming: this.analyzeOptimalTiming(successfulGroups),
            nicheMatch: this.analyzeNicheMatch(successfulGroups)
        };
    }

    /**
     * Analyze optimal group size
     */
    analyzeOptimalSize(successful, failed) {
        const ranges = {
            '100-1000': { success: 0, total: 0 },
            '1000-5000': { success: 0, total: 0 },
            '5000-20000': { success: 0, total: 0 },
            '20000-50000': { success: 0, total: 0 },
            '50000+': { success: 0, total: 0 }
        };

        const all = [...successful, ...failed];
        for (const entry of all) {
            const size = entry.groupSize;
            let range;
            if (size < 1000) range = '100-1000';
            else if (size < 5000) range = '1000-5000';
            else if (size < 20000) range = '5000-20000';
            else if (size < 50000) range = '20000-50000';
            else range = '50000+';

            ranges[range].total++;
            if (successful.find(s => s.groupUsername === entry.groupUsername)) {
                ranges[range].success++;
            }
        }

        // Find best range
        let bestRange = '5000-20000';
        let bestRate = 0;
        for (const [range, data] of Object.entries(ranges)) {
            if (data.total >= 2) {
                const rate = data.success / data.total;
                if (rate > bestRate) {
                    bestRate = rate;
                    bestRange = range;
                }
            }
        }

        return { range: bestRange, rate: bestRate };
    }

    /**
     * Analyze optimal posting timing
     */
    analyzeOptimalTiming(successful) {
        const hourCounts = {};

        for (const entry of successful) {
            const hour = entry.hourOfDay;
            hourCounts[hour] = (hourCounts[hour] || 0) + 1;
        }

        const bestHour = Object.entries(hourCounts)
            .sort((a, b) => b[1] - a[1])[0];

        return {
            bestHour: bestHour ? parseInt(bestHour[0]) : 12,
            hourDistribution: hourCounts
        };
    }

    /**
     * Analyze niche matching
     */
    analyzeNicheMatch(successful) {
        const nicheCounts = {};

        for (const entry of successful) {
            const niche = entry.groupNiche;
            nicheCounts[niche] = (nicheCounts[niche] || 0) + 1;
        }

        return {
            topNiches: Object.entries(nicheCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([niche, count]) => ({ niche, count }))
        };
    }

    /**
     * Generate strategy recommendations
     */
    generateRecommendations() {
        const recommendations = [];
        const characteristics = this.getBestGroupCharacteristics();

        // Size recommendation
        if (characteristics.optimalSize.rate > 0.6) {
            recommendations.push({
                type: 'SIZE',
                message: `Target groups with ${characteristics.optimalSize.range} members (${Math.round(characteristics.optimalSize.rate * 100)}% success rate)`,
                priority: 'HIGH'
            });
        }

        // Timing recommendation
        if (characteristics.optimalTiming.bestHour) {
            recommendations.push({
                type: 'TIMING',
                message: `Best posting time around ${characteristics.optimalTiming.bestHour}:00 (based on ${this.learningHistory.filter(e => e.success).length} successful posts)`,
                priority: 'MEDIUM'
            });
        }

        // Keyword recommendation
        const bestKeywords = this.getBestKeywords(3);
        if (bestKeywords.length > 0) {
            recommendations.push({
                type: 'KEYWORDS',
                message: `Top performing keywords: ${bestKeywords.join(', ')}`,
                priority: 'HIGH'
            });
        }

        // Strategy adjustments
        const successRate = this.getOverallSuccessRate();
        if (successRate < 0.4) {
            recommendations.push({
                type: 'QUALITY',
                message: 'Consider increasing quality threshold - success rate is below 40%',
                priority: 'HIGH'
            });
        } else if (successRate > 0.7) {
            recommendations.push({
                type: 'VOLUME',
                message: 'Success rate is high! Consider increasing daily post limit.',
                priority: 'MEDIUM'
            });
        }

        return recommendations;
    }

    /**
     * Get overall success rate
     */
    getOverallSuccessRate() {
        if (this.learningHistory.length === 0) return 0.5;
        const successes = this.learningHistory.filter(e => e.success).length;
        return successes / this.learningHistory.length;
    }

    /**
     * Get group quality prediction
     */
    predictGroupPerformance(username) {
        const data = this.groupPerformance.get(username);
        if (!data) return null;

        return {
            predictedSuccess: data.avgScore / 10,
            confidence: Math.min(1, data.attempts / 10),
            recommendation: data.avgScore >= 7 ? 'JOIN' : 'SKIP'
        };
    }

    /**
     * Get top performing groups
     */
    getTopPerformingGroups(count = 10) {
        return [...this.groupPerformance.values()]
            .filter(g => g.attempts >= 2)
            .sort((a, b) => b.avgScore - a.avgScore)
            .slice(0, count);
    }

    /**
     * Get underperforming groups to avoid
     */
    getUnderperformingGroups(count = 10) {
        return [...this.groupPerformance.values()]
            .filter(g => g.attempts >= 2 && g.avgScore < 3)
            .sort((a, b) => a.avgScore - b.avgScore)
            .slice(0, count)
            .map(g => g.username);
    }

    /**
     * Export learning data for persistence
     */
    exportLearningData() {
        return {
            groupPerformance: Object.fromEntries(this.groupPerformance),
            keywordPerformance: Object.fromEntries(this.keywordPerformance),
            learningHistory: this.learningHistory.slice(-100) // Last 100 entries
        };
    }

    /**
     * Import learning data
     */
    importLearningData(data) {
        if (data.groupPerformance) {
            this.groupPerformance = new Map(Object.entries(data.groupPerformance));
        }
        if (data.keywordPerformance) {
            this.keywordPerformance = new Map(Object.entries(data.keywordPerformance));
        }
        if (data.learningHistory) {
            this.learningHistory = data.learningHistory;
        }
        logger.info("📚 Loaded learning data successfully");
    }

    /**
     * Get statistics summary
     */
    getStats() {
        return {
            totalPosts: this.learningHistory.length,
            successfulPosts: this.learningHistory.filter(e => e.success).length,
            successRate: this.getOverallSuccessRate(),
            uniqueGroups: this.groupPerformance.size,
            topKeywords: this.getBestKeywords(5),
            recommendations: this.generateRecommendations()
        };
    }
}
