const express = require('express');
const path = require('path');
const fs = require('fs');
const Papa = require('papaparse');
const app = express();
const port = 3000;

// Serve static files
app.use(express.static('public'));

// Helper function to determine CSV format
function determineCSVFormat(headers) {
    // Check for exact column header matches
    if (headers.includes('Date(UTC+1 28 Jan 2024 - 28 Jan 2025)')) {
        return 'new';
    }
    if (headers.includes('Date(UTC+-5 21 Jan 2025 - 27 Jan 2025)')) {
        return 'old';
    }
    return 'unknown';
}

// Helper function to normalize trade data
function normalizeTrade(row, format) {
    const trade = {};
    
    if (format === 'new') {
        trade.timestamp = row['Date(UTC+1 28 Jan 2024 - 28 Jan 2025)'];
        trade.symbol = row['Symbol'];
        trade.side = row['Side'];
        trade.price = parseFloat(row['Fill Price']) || 0;
        trade.quantity = parseFloat(row['Filled (crypto amount)']) || 0;
        trade.total = parseFloat(row['Total']) || 0;
        trade.fee = parseFloat(row['Fee']) || 0;
        trade.realizedPnL = parseFloat(row['Realized PnL']) || 0;
        trade.contractSize = parseFloat(row['Contract Size']) || 0;
    } else if (format === 'old') {
        trade.timestamp = row['Date(UTC+-5 21 Jan 2025 - 27 Jan 2025)'];
        trade.symbol = row['Symbol'];
        trade.side = row['Side'];
        trade.price = parseFloat(row['Fill Price']) || 0;
        trade.quantity = parseFloat(row['Filled (USDT)']) || 0;
        trade.total = parseFloat(row['Total']) || 0;
        trade.fee = parseFloat(row['Fee']) || 0;
        trade.realizedPnL = parseFloat(row['Realized PnL']) || 0;
        trade.contractSize = parseFloat(row['Contract Size']) || 0;
    }

    // Debug log to check the data
    if (!trade.price || !trade.quantity) {
        console.log('Warning: Invalid trade data:', {
            format,
            original: row,
            normalized: trade
        });
    }

    return trade;
}

// Route to get trade data
app.get('/api/trades', (req, res) => {
    try {
        const fileContent = fs.readFileSync('tradeHistory.csv', 'utf8');
        Papa.parse(fileContent, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                if (results.errors.length > 0) {
                    console.error('CSV parsing errors:', results.errors);
                }

                const format = determineCSVFormat(results.meta.fields);
                console.log('Detected format:', format);
                console.log('Headers:', results.meta.fields);

                const normalizedTrades = results.data
                    .filter(row => Object.keys(row).length > 1) // Filter out empty rows
                    .map(row => normalizeTrade(row, format));

                // Debug log
                console.log('Sample normalized trade:', normalizedTrades[0]);
                
                const metrics = calculateMetrics(normalizedTrades);
                res.json(metrics);
            },
            error: (error) => {
                console.error('Error parsing CSV:', error);
                res.status(500).json({ error: 'Failed to parse trade data' });
            }
        });
    } catch (error) {
        console.error('Error reading file:', error);
        res.status(500).json({ error: 'Failed to read trade data' });
    }
});

function calculateMetrics(trades) {
    const metrics = {
        totalPnL: 0,
        todayPnL: 0,
        tradedPairs: new Set(),
        totalVolume: 0,
        totalFees: 0,
        profitableTrades: 0,
        lossTrades: 0,
        tradesByPair: {},
        monthlyPnL: {},
        dailyPnL: {},
        longTrades: 0,
        shortTrades: 0,
        bestTrade: { pnl: -Infinity, timestamp: null },
        worstTrade: { pnl: Infinity, timestamp: null },
        totalWinAmount: 0,
        totalLossAmount: 0,
        tradeSizes: [],
        cumulativePnL: [],
        dailyReturns: {},
        positionDurations: [],
        volumeByDirection: {
            buy: 0,
            sell: 0
        },
        avgTradeVolume: {
            buy: 0,
            sell: 0
        },
        largestTrade: {
            volume: 0,
            timestamp: null,
            side: null
        },
        hourlyDistribution: {},
        timeOfDayPerformance: {
            morning: {pnl: 0, trades: 0},
            afternoon: {pnl: 0, trades: 0},
            evening: {pnl: 0, trades: 0},
            night: {pnl: 0, trades: 0}
        },
        consecutiveStats: {
            currentStreak: 0,
            longestWinStreak: 0,
            longestLossStreak: 0,
            currentStreakType: null
        },
        riskMetrics: {
            avgWinSize: 0,
            avgLossSize: 0,
            largestDrawdownDuration: 0,
            recoveryFactor: 0,
            profitToDrawdownRatio: 0
        }
    };

    let runningPnL = 0;
    const today = new Date().toISOString().split('T')[0];

    // Create a map to track open positions
    const openPositions = new Map();

    // Sort trades by timestamp to ensure correct order
    const sortedTrades = [...trades].sort((a, b) => 
        new Date(a.timestamp) - new Date(b.timestamp)
    );

    sortedTrades.forEach(trade => {
        if (!trade.timestamp || !trade.symbol) return;

        // Calculate actual PnL based on format
        const pnl = trade.realizedPnL;
        const volume = trade.quantity * trade.price; // Calculate actual volume in USDT
        const tradeDate = new Date(trade.timestamp);
        
        // Basic metrics
        metrics.totalPnL += pnl;
        runningPnL += pnl;
        metrics.cumulativePnL.push({ timestamp: trade.timestamp, value: runningPnL });
        
        if (tradeDate.toISOString().split('T')[0] === today) {
            metrics.todayPnL += pnl;
        }

        metrics.tradedPairs.add(trade.symbol);
        metrics.totalVolume += volume;
        metrics.totalFees += trade.fee;
        metrics.tradeSizes.push(volume);

        // Count trades by direction
        if (trade.side === 'Buy') {
            metrics.longTrades++;
            metrics.volumeByDirection.buy += volume;
        } else if (trade.side === 'Sell') {
            metrics.shortTrades++;
            metrics.volumeByDirection.sell += volume;
        }

        // Profit/Loss tracking
        if (pnl > 0) {
            metrics.profitableTrades++;
            metrics.totalWinAmount += pnl;
            if (pnl > metrics.bestTrade.pnl) {
                metrics.bestTrade = { pnl, timestamp: trade.timestamp };
            }
            if (metrics.consecutiveStats.currentStreakType === 'win') {
                metrics.consecutiveStats.currentStreak++;
            } else {
                metrics.consecutiveStats.currentStreakType = 'win';
                metrics.consecutiveStats.currentStreak = 1;
            }
            metrics.longestWinStreak = Math.max(metrics.consecutiveStats.currentStreak, metrics.longestWinStreak);
        } else if (pnl < 0) {
            metrics.lossTrades++;
            metrics.totalLossAmount += Math.abs(pnl);
            if (pnl < metrics.worstTrade.pnl) {
                metrics.worstTrade = { pnl, timestamp: trade.timestamp };
            }
            if (metrics.consecutiveStats.currentStreakType === 'loss') {
                metrics.consecutiveStats.currentStreak++;
            } else {
                metrics.consecutiveStats.currentStreakType = 'loss';
                metrics.consecutiveStats.currentStreak = 1;
            }
            metrics.longestLossStreak = Math.max(metrics.consecutiveStats.currentStreak, metrics.longestLossStreak);
        }

        // Group by pair
        if (!metrics.tradesByPair[trade.symbol]) {
            metrics.tradesByPair[trade.symbol] = {
                totalTrades: 0,
                volume: 0,
                pnl: 0,
                fees: 0
            };
        }
        metrics.tradesByPair[trade.symbol].totalTrades++;
        metrics.tradesByPair[trade.symbol].volume += volume;
        metrics.tradesByPair[trade.symbol].pnl += pnl;
        metrics.tradesByPair[trade.symbol].fees += trade.fee;

        // Daily P&L calculation
        const dailyKey = tradeDate.toISOString().split('T')[0];
        metrics.dailyPnL[dailyKey] = (metrics.dailyPnL[dailyKey] || 0) + pnl;

        // Daily returns for Sharpe ratio
        const dateKey = tradeDate.toISOString().split('T')[0];
        metrics.dailyReturns[dateKey] = (metrics.dailyReturns[dateKey] || 0) + pnl;

        // Track position duration
        const key = trade.symbol;
        if (trade.side === 'Buy') {
            if (!openPositions.has(key)) {
                openPositions.set(key, []);
            }
            openPositions.get(key).push({
                timestamp: new Date(trade.timestamp),
                quantity: trade.quantity
            });
        } else if (trade.side === 'Sell' && openPositions.has(key)) {
            const buyTrades = openPositions.get(key);
            if (buyTrades.length > 0) {
                const buyTrade = buyTrades.shift(); // Get the earliest buy trade
                const duration = (new Date(trade.timestamp) - buyTrade.timestamp) / (1000 * 60); // Duration in minutes
                metrics.positionDurations.push(duration);
            }
            if (buyTrades.length === 0) {
                openPositions.delete(key);
            }
        }

        if (volume > metrics.largestTrade.volume) {
            metrics.largestTrade = {
                volume,
                timestamp: trade.timestamp,
                side: trade.side
            };
        }

        const hour = new Date(trade.timestamp).getHours();
        metrics.hourlyDistribution[hour] = (metrics.hourlyDistribution[hour] || 0) + 1;

        // Categorize by time of day
        if (hour >= 6 && hour < 12) {
            metrics.timeOfDayPerformance.morning.pnl += pnl;
            metrics.timeOfDayPerformance.morning.trades++;
        } else if (hour >= 12 && hour < 18) {
            metrics.timeOfDayPerformance.afternoon.pnl += pnl;
            metrics.timeOfDayPerformance.afternoon.trades++;
        } else if (hour >= 18 && hour < 24) {
            metrics.timeOfDayPerformance.evening.pnl += pnl;
            metrics.timeOfDayPerformance.evening.trades++;
        } else {
            metrics.timeOfDayPerformance.night.pnl += pnl;
            metrics.timeOfDayPerformance.night.trades++;
        }
    });

    // Calculate derived metrics
    metrics.tradedPairs = Array.from(metrics.tradedPairs);
    metrics.totalTrades = trades.length;
    metrics.winRate = (metrics.profitableTrades / metrics.totalTrades) * 100;
    
    metrics.avgPositionSize = metrics.totalVolume / metrics.totalTrades;
    
    metrics.longShortRatio = metrics.shortTrades > 0 ? metrics.longTrades / metrics.shortTrades : 0;
    
    metrics.profitFactor = metrics.totalWinAmount / (metrics.totalLossAmount || 1);
    
    const avgWin = metrics.totalWinAmount / (metrics.profitableTrades || 1);
    const avgLoss = metrics.totalLossAmount / (metrics.lossTrades || 1);
    metrics.avgWinLossRatio = avgWin / (avgLoss || 1);

    let peak = -Infinity;
    let maxDrawdown = 0;
    metrics.cumulativePnL.forEach(point => {
        if (point.value > peak) peak = point.value;
        if (peak > 0) {
            const drawdown = ((peak - point.value) / Math.abs(peak)) * 100;
            if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        }
    });
    metrics.maxDrawdown = maxDrawdown;

    // Sharpe Ratio calculation
    const returns = Object.values(metrics.dailyReturns);
    if (returns.length > 1) {
        const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
        const stdDev = Math.sqrt(
            returns.reduce((sq, n) => sq + Math.pow(n - avgReturn, 2), 0) / (returns.length - 1)
        );
        metrics.sharpeRatio = stdDev !== 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0; // Annualized
    } else {
        metrics.sharpeRatio = 0;
    }

    // Add trade size distribution
    metrics.tradeSizeDistribution = calculateDistribution(metrics.tradeSizes);

    // Calculate average trade duration (in minutes)
    metrics.avgTradeDuration = metrics.positionDurations.length > 0
        ? metrics.positionDurations.reduce((a, b) => a + b, 0) / metrics.positionDurations.length
        : 0;

    // Format the duration into a readable string
    metrics.avgTradeDurationFormatted = formatDuration(metrics.avgTradeDuration);

    // Calculate averages for volume
    if (metrics.longTrades > 0) {
        metrics.avgTradeVolume.buy = metrics.volumeByDirection.buy / metrics.longTrades;
    }
    if (metrics.shortTrades > 0) {
        metrics.avgTradeVolume.sell = metrics.volumeByDirection.sell / metrics.shortTrades;
    }

    // Calculate risk metrics
    if (metrics.profitableTrades > 0) {
        metrics.riskMetrics.avgWinSize = metrics.totalWinAmount / metrics.profitableTrades;
    }
    if (metrics.lossTrades > 0) {
        metrics.riskMetrics.avgLossSize = metrics.totalLossAmount / metrics.lossTrades;
    }

    // Calculate after processing trades
    metrics.riskMetrics.profitToDrawdownRatio = metrics.totalPnL / (metrics.maxDrawdown || 1);

    return metrics;
}

function calculateDistribution(values) {
    const sorted = values.sort((a, b) => a - b);
    return {
        min: sorted[0],
        max: sorted[sorted.length - 1],
        median: sorted[Math.floor(sorted.length / 2)],
        quartiles: {
            q1: sorted[Math.floor(sorted.length / 4)],
            q3: sorted[Math.floor(3 * sorted.length / 4)]
        }
    };
}

function formatDuration(minutes) {
    if (minutes < 1) {
        return `${Math.round(minutes * 60)} seconds`;
    } else if (minutes < 60) {
        return `${Math.round(minutes)} minutes`;
    } else if (minutes < 1440) { // less than 24 hours
        const hours = Math.floor(minutes / 60);
        const mins = Math.round(minutes % 60);
        return `${hours}h ${mins}m`;
    } else {
        const days = Math.floor(minutes / 1440);
        const hours = Math.floor((minutes % 1440) / 60);
        return `${days}d ${hours}h`;
    }
}

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
