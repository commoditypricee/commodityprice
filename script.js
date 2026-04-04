/**
 * COMMODITY PRICE TRACKER
 * Full-stack vanilla JS implementation.
 */

// 1. COMMODITY CONFIGURATION
const commodities = [
    { id: 'gold', name: 'Gold', symbol: 'XAU/USD', basePrice: 2350 },
    { id: 'silver', name: 'Silver', symbol: 'XAG/USD', basePrice: 28 },
    { id: 'copper', name: 'Copper', symbol: 'HG/USD', basePrice: 4.5 },
    { id: 'brent', name: 'Brent Oil', symbol: 'BZ/USD', basePrice: 85 },
    { id: 'natgas', name: 'Natural Gas', symbol: 'NG/USD', basePrice: 2.2 }
];

// Global State
let currentCommodity = commodities[0]; // Default to Gold
let currentPeriod = '1D'; // Default to 1 Day
let chartInstance = null;

// ============================================================================
// 2. MOCK API SERVICE (To simulate real backend/API fetching without limits)
// Replace this section with real fetch endpoints when you get an API key.
// ============================================================================
class MockAPI {
    static async fetchData(commodityId, period) {
        // Simulating network delay
        await new Promise(resolve => setTimeout(resolve, 300));

        const commodity = commodities.find(c => c.id === commodityId);
        if (!commodity) throw new Error("Commodity not found");

        const dataPoints = this.getPointsForPeriod(period);
        const labels = [];
        const prices = [];
        
        let currentSimPrice = commodity.basePrice;
        
        // Volatility multiplier based on period
        const volatility = period.includes('Y') ? 0.05 : 0.005; 

        // Generate mock historical data backwards
        const now = new Date();
        for (let i = dataPoints; i >= 0; i--) {
            // Determine time subtraction based on period
            let dateObj = new Date(now);
            if (period === '1D') dateObj.setHours(now.getHours() - i);
            else if (period === '1M' || period === '3M' || period === '6M') dateObj.setDate(now.getDate() - i);
            else dateObj.setMonth(now.getMonth() - i); // Years

            // Format label
            labels.push(this.formatDateLabel(dateObj, period));

            // Random walk logic for price
            const change = currentSimPrice * (Math.random() * volatility * 2 - volatility);
            currentSimPrice = currentSimPrice + change;
            prices.push(currentSimPrice.toFixed(2));
        }

        // Return standard API response structure
        return {
            symbol: commodity.symbol,
            latestPrice: parseFloat(prices[prices.length - 1]),
            previousClose: parseFloat(prices[prices.length - Math.min(24, prices.length)]), // Rough 24h ago
            history: {
                labels: labels,
                prices: prices.map(p => parseFloat(p))
            }
        };
    }

    static getPointsForPeriod(period) {
        switch(period) {
            case '1D': return 24; // 24 hours
            case '1M': return 30; // 30 days
            case '3M': return 90; // 90 days
            case '6M': return 180; // 180 days
            case '1Y': return 12; // 12 months
            case '3Y': return 36; // 36 months
            case '5Y': return 60; // 60 months
            default: return 30;
        }
    }

    static formatDateLabel(date, period) {
        if (period === '1D') {
            return `${date.getHours().toString().padStart(2, '0')}:00`;
        } else if (period === '1Y' || period === '3Y' || period === '5Y') {
            return `${date.toLocaleString('default', { month: 'short' })} '${date.getFullYear().toString().substr(-2)}`;
        } else {
            return `${date.getDate()} ${date.toLocaleString('default', { month: 'short' })}`;
        }
    }
}

// ============================================================================
// 3. UI RENDERING & LOGIC
// ============================================================================

// Main initialization
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    setupEventListeners();
    
    // Auto-update every 15 minutes (15 * 60 * 1000 milliseconds)
    setInterval(() => {
        console.log("15 min timer triggered. Refreshing data...");
        initApp();
    }, 15 * 60 * 1000);
});

async function initApp() {
    try {
        await updateTable();
        await loadChartData(currentCommodity, currentPeriod);
        updateTimestamp();
    } catch (error) {
        console.error("Error fetching data:", error);
    }
}

async function updateTable() {
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = ''; // Clear table

    for (const comm of commodities) {
        // Note: In a real app with API limits, you'd fetch a single "latest prices" endpoint here.
        // We are using our simulated API fetch.
        const data = await MockAPI.fetchData(comm.id, '1D');
        
        const changeValue = data.latestPrice - data.previousClose;
        const changePercent = (changeValue / data.previousClose) * 100;
        const isPositive = changeValue >= 0;

        const tr = document.createElement('tr');
        if (currentCommodity.id === comm.id) tr.classList.add('active-row');
        
        tr.onclick = () => selectCommodity(comm);

        tr.innerHTML = `
            <td>
                <div class="commodity-name">${comm.name}</div>
                <div style="font-size: 0.8rem; color: var(--text-secondary)">${comm.symbol}</div>
            </td>
            <td class="price">$${data.latestPrice.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td class="change ${isPositive ? 'positive' : 'negative'}">
                ${isPositive ? '+' : ''}${changeValue.toFixed(2)} (${isPositive ? '+' : ''}${changePercent.toFixed(2)}%)
            </td>
        `;
        tbody.appendChild(tr);
    }
}

async function selectCommodity(commodity) {
    if (currentCommodity.id === commodity.id) return; // Already selected
    currentCommodity = commodity;
    
    // Highlight active row in table
    initApp(); // Refresh table to move highlight and reload chart
}

// ============================================================================
// 4. CHART.JS INTEGRATION
// ============================================================================

async function loadChartData(commodity, period) {
    // 1. Fetch the data representing the chosen commodity and period
    const data = await MockAPI.fetchData(commodity.id, period);
    
    // 2. Update chart title
    document.getElementById('chart-title').innerText = `${commodity.name} (${commodity.symbol})`;

    // 3. Render the chart
    renderChart(data.history.labels, data.history.prices);
}

function renderChart(labels, dataPoints) {
    const ctx = document.getElementById('commodityChart').getContext('2d');

    // Destroy existing chart if it exists so we can draw a new one
    if (chartInstance) {
        chartInstance.destroy();
    }

    // Determine line color based on start and end price
    const startPrice = dataPoints[0];
    const endPrice = dataPoints[dataPoints.length - 1];
    const lineColor = endPrice >= startPrice ? '#198754' : '#dc3545'; // Green if up, Red if down
    const gradientColor = endPrice >= startPrice ? 'rgba(25, 135, 84, 0.1)' : 'rgba(220, 53, 69, 0.1)';

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Price (USD)',
                data: dataPoints,
                borderColor: lineColor,
                backgroundColor: gradientColor,
                borderWidth: 2,
                pointRadius: 0, // Hide points for clean look
                pointHoverRadius: 6,
                fill: true,
                tension: 0.1 // Slight curve
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false // Hide default legend
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.parsed.y !== null) {
                                label += new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(context.parsed.y);
                            }
                            return label;
                        }
                    }
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            },
            scales: {
                x: {
                    grid: {
                        display: false // Clean x-axis
                    }
                },
                y: {
                    border: {
                        display: false
                    },
                    grid: {
                        color: '#e9ecef'
                    },
                    ticks: {
                        callback: function(value) {
                            return '$' + value;
                        }
                    }
                }
            }
        }
    });
}

// ============================================================================
// 5. EVENT LISTENERS & UTILITIES
// ============================================================================

function setupEventListeners() {
    const buttons = document.querySelectorAll('.filter-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Remove active class from all
            buttons.forEach(b => b.classList.remove('active'));
            // Add to clicked
            e.target.classList.add('active');
            
            // Update state and fetch new data
            currentPeriod = e.target.getAttribute('data-period');
            loadChartData(currentCommodity, currentPeriod);
        });
    });
}

function updateTimestamp() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    document.getElementById('last-update-time').innerText = timeString;
}
