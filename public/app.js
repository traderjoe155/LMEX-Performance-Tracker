Chart.defaults.color = '#e0e0e0';
Chart.defaults.borderColor = '#404040';

async function fetchTradeData() {
    try {
        const response = await fetch('/api/trades');
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to fetch trade data');
        }
        const data = await response.json();
        console.log('Received trade data:', data);
        updateDashboard(data);
    } catch (error) {
        console.error('Error fetching trade data:', error);
        document.querySelectorAll('.metric-card p, .stats-table td').forEach(el => {
            el.textContent = 'Error loading data';
        });
    }
}

function updateDashboard(data) {
    try {
        // Update main metrics
        updateMetricWithTrend('totalPnL', data.totalPnL || 0);
        updateMetricWithTrend('todayPnL', data.todayPnL || 0);
        document.getElementById('totalVolume').textContent = formatCurrency(data.totalVolume || 0);
        document.getElementById('totalFees').textContent = formatCurrency(data.totalFees || 0);
        document.getElementById('winRate').textContent = `${(data.winRate || 0).toFixed(2)}%`;
        document.getElementById('profitFactor').textContent = (data.profitFactor || 0).toFixed(2);
        document.getElementById('avgWinLossRatio').textContent = (data.avgWinLossRatio || 0).toFixed(2);
        document.getElementById('maxDrawdown').textContent = `${(data.maxDrawdown || 0).toFixed(2)}%`;

        // Update statistics table
        document.getElementById('totalTrades').textContent = data.totalTrades || 0;
        document.getElementById('avgPositionSize').textContent = formatCurrency(data.avgPositionSize || 0);
        document.getElementById('longShortRatio').textContent = (data.longShortRatio || 0).toFixed(2);
        document.getElementById('tradingPairs').textContent = (data.tradedPairs || []).length;
        document.getElementById('bestTrade').textContent = formatCurrency(data.bestTrade?.pnl || 0);
        document.getElementById('worstTrade').textContent = formatCurrency(data.worstTrade?.pnl || 0);
        document.getElementById('sharpeRatio').textContent = (data.sharpeRatio || 0).toFixed(2);

        // Update average trade duration
        document.getElementById('avgTradeDuration').textContent = data.avgTradeDurationFormatted || 'N/A';

        // Update additional metrics
        document.getElementById('longestWinStreak').textContent = data.consecutiveStats.longestWinStreak;
        document.getElementById('longestLossStreak').textContent = data.consecutiveStats.longestLossStreak;
        document.getElementById('avgWinSize').textContent = formatCurrency(data.riskMetrics.avgWinSize);
        document.getElementById('avgLossSize').textContent = formatCurrency(data.riskMetrics.avgLossSize);
        document.getElementById('largestTrade').textContent = `${formatCurrency(data.largestTrade.volume)} (${data.largestTrade.side})`;
        document.getElementById('profitDrawdownRatio').textContent = data.riskMetrics.profitToDrawdownRatio.toFixed(2);
        
        // Calculate and display best time of day
        const bestTime = getBestTimeOfDay(data.timeOfDayPerformance);
        document.getElementById('bestTimeOfDay').textContent = `${bestTime} (${formatCurrency(data.timeOfDayPerformance[bestTime].pnl)})`;
        
        // Display current streak
        const streakText = `${data.consecutiveStats.currentStreak} ${data.consecutiveStats.currentStreakType}`;
        document.getElementById('currentStreak').textContent = streakText;

        // Create charts
        if (data.dailyPnL) createMonthlyPnLChart(data.dailyPnL);
        if (data.tradesByPair) createPairsChart(data.tradesByPair);
        if (data.cumulativePnL) createCumulativePnLChart(data.cumulativePnL);
        if (data.tradeSizeDistribution) createTradeSizeChart(data.tradeSizeDistribution);
        if (data.hourlyDistribution) createHourlyDistributionChart(data.hourlyDistribution);
        if (data.timeOfDayPerformance) createTimeOfDayPerformanceChart(data.timeOfDayPerformance);
        createWinLossDistributionChart(data);

    } catch (error) {
        console.error('Error updating dashboard:', error);
    }
}

function updateMetricWithTrend(elementId, value) {
    const element = document.getElementById(elementId);
    const trendElement = document.getElementById(`${elementId}Trend`);
    element.textContent = formatCurrency(value);
    
    if (trendElement) {
        const trendClass = value >= 0 ? 'positive' : 'negative';
        const trendSymbol = value >= 0 ? '↑' : '↓';
        trendElement.className = `trend ${trendClass}`;
        trendElement.textContent = `${trendSymbol} ${Math.abs(value).toFixed(2)}%`;
    }
}

function formatCurrency(value) {
    try {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(value);
    } catch (error) {
        console.error('Error formatting currency:', error);
        return '$0.00';
    }
}

function createMonthlyPnLChart(dailyPnL) {
    try {
        const ctx = document.getElementById('monthlyPnLChart').getContext('2d');
        
        // Get daily P&L data
        const labels = Object.keys(dailyPnL || {}).sort();
        const pnlData = labels.map(day => dailyPnL[day] || 0);

        // Create color array based on whether the P&L is positive or negative
        const colors = pnlData.map(value => 
            value >= 0 ? 'rgba(75, 192, 192, 0.8)' : 'rgba(255, 99, 132, 0.8)'
        );

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels.map(date => new Date(date).toLocaleDateString()),
                datasets: [{
                    label: 'Daily P&L',
                    data: pnlData,
                    backgroundColor: colors,
                    borderColor: colors,
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: '#2d2d2d',
                        titleColor: '#e0e0e0',
                        bodyColor: '#e0e0e0',
                        borderColor: '#404040',
                        borderWidth: 1
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: '#404040'
                        },
                        ticks: {
                            maxRotation: 45,
                            minRotation: 45
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: '#404040'
                        },
                        ticks: {
                            callback: function(value) {
                                return formatCurrency(value);
                            }
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error creating daily P&L chart:', error);
    }
}

function createCumulativePnLChart(cumulativePnL) {
    try {
        const ctx = document.getElementById('cumulativePnLChart').getContext('2d');
        const data = cumulativePnL.map(point => ({
            x: new Date(point.timestamp),
            y: point.value
        }));

        new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [{
                    label: 'Cumulative P&L',
                    data: data,
                    borderColor: 'rgb(54, 162, 235)',
                    tension: 0.1,
                    fill: false
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'top',
                    }
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'day',
                            displayFormats: {
                                day: 'MMM d, yyyy'
                            }
                        },
                        title: {
                            display: true,
                            text: 'Date'
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: '#404040'
                        },
                        title: {
                            display: true,
                            text: 'Cumulative P&L ($)'
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error creating cumulative P&L chart:', error);
    }
}

function createTradeSizeChart(distribution) {
    try {
        const ctx = document.getElementById('tradeSizeChart').getContext('2d');
        const labels = ['Minimum', 'Q1', 'Median', 'Q3', 'Maximum'];
        const data = [
            distribution.min,
            distribution.quartiles.q1,
            distribution.median,
            distribution.quartiles.q3,
            distribution.max
        ];

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Trade Size Distribution',
                    data: data,
                    backgroundColor: 'rgb(153, 102, 255)',
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error creating trade size chart:', error);
    }
}

function createPairsChart(tradesByPair) {
    try {
        const ctx = document.getElementById('pairsChart').getContext('2d');
        const pairs = Object.keys(tradesByPair || {});
        const pnlData = pairs.map(pair => (tradesByPair[pair] || {}).pnl || 0);

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: pairs,
                datasets: [{
                    label: 'P&L by Trading Pair',
                    data: pnlData,
                    backgroundColor: 'rgb(54, 162, 235)',
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: '#404040'
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error creating pairs chart:', error);
    }
}

function getBestTimeOfDay(timeData) {
    return Object.entries(timeData)
        .reduce((best, [time, data]) => 
            data.pnl > (best.pnl || -Infinity) ? {time, pnl: data.pnl} : best, {})
        .time;
}

function createHourlyDistributionChart(hourlyData) {
    try {
        const ctx = document.getElementById('hourlyDistributionChart').getContext('2d');
        const hours = Array.from({length: 24}, (_, i) => i);
        const data = hours.map(hour => hourlyData[hour] || 0);

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: hours.map(h => `${h}:00`),
                datasets: [{
                    label: 'Number of Trades',
                    data: data,
                    backgroundColor: 'rgba(54, 162, 235, 0.8)',
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Hour of Day'
                        }
                    },
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Number of Trades'
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error creating hourly distribution chart:', error);
    }
}

function createTimeOfDayPerformanceChart(timeData) {
    try {
        const ctx = document.getElementById('timeOfDayChart').getContext('2d');
        const periods = Object.keys(timeData);
        const pnlData = periods.map(period => timeData[period].pnl);
        const tradesData = periods.map(period => timeData[period].trades);

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: periods.map(p => p.charAt(0).toUpperCase() + p.slice(1)),
                datasets: [{
                    label: 'P&L',
                    data: pnlData,
                    backgroundColor: pnlData.map(value => 
                        value >= 0 ? 'rgba(75, 192, 192, 0.8)' : 'rgba(255, 99, 132, 0.8)'
                    ),
                    yAxisID: 'y'
                }, {
                    label: 'Number of Trades',
                    data: tradesData,
                    type: 'line',
                    borderColor: 'rgb(54, 162, 235)',
                    yAxisID: 'y1'
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        type: 'linear',
                        position: 'left',
                        title: {
                            display: true,
                            text: 'P&L ($)'
                        }
                    },
                    y1: {
                        type: 'linear',
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Number of Trades'
                        },
                        grid: {
                            drawOnChartArea: false
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error creating time of day performance chart:', error);
    }
}

function createWinLossDistributionChart(data) {
    try {
        const ctx = document.getElementById('winLossDistributionChart').getContext('2d');
        
        const metrics = [
            {label: 'Win Rate', value: data.winRate},
            {label: 'Avg Win', value: data.riskMetrics.avgWinSize},
            {label: 'Avg Loss', value: Math.abs(data.riskMetrics.avgLossSize)},
            {label: 'Best Trade', value: data.bestTrade.pnl},
            {label: 'Worst Trade', value: Math.abs(data.worstTrade.pnl)}
        ];

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: metrics.map(m => m.label),
                datasets: [{
                    data: metrics.map(m => m.value),
                    backgroundColor: [
                        'rgba(75, 192, 192, 0.8)',
                        'rgba(54, 162, 235, 0.8)',
                        'rgba(255, 99, 132, 0.8)',
                        'rgba(75, 192, 192, 0.8)',
                        'rgba(255, 99, 132, 0.8)'
                    ]
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const value = context.raw;
                                return context.label.includes('Rate') 
                                    ? `${value.toFixed(2)}%`
                                    : formatCurrency(value);
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return formatCurrency(value);
                            }
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error creating win/loss distribution chart:', error);
    }
}

// Initialize dashboard
fetchTradeData(); 