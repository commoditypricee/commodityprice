/**
 * COMMODITY PRICE TRACKER - FULLY OPTIMIZED
 * Featuring Batch Requests, Memory Caching, and Live Chart Mutation
 */

// 1. API CONFIGURATION
const API_KEY = "86Nedf4EOs5jHyEMnpZR3eXTeRfhSZhu"; 
const BASE_URL = "https://financialmodelingprep.com/api/v3";

const commodities = [
    { id: 'gold', name: 'Gold', ticker: 'GC=F' },
    { id: 'silver', name: 'Silver', ticker: 'SI=F' },
    { id: 'copper', name: 'Copper', ticker: 'HG=F' },
    { id: 'brent', name: 'Brent Oil', ticker: 'BZ=F' },
    { id: 'natgas', name: 'Natural Gas', ticker: 'NG=F' }
];

// 2. GLOBAL STATE & CACHE
let currentCommodity = commodities[0];
let currentPeriod = '1D';
let chartInstance = null;

// Memory Cache to store historical data and save API calls
// Structure: { 'GC=F': { '1D': {labels, prices}, '1M': {labels, prices} } }
const chartCache = {}; 

// ============================================================================
// 3. INITIALIZATION & TIMER
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    initApp();
    setupEventListeners();
    
    // Auto-update every 15 minutes
    setInterval(() => {
        console.log("Timer triggered: Syncing live prices efficiently...");
        syncLivePrices();
    }, 15 * 60 * 1000);
});

async function initApp() {
    await syncLivePrices(); // Loads initial table data
    await loadChartData(currentCommodity, currentPeriod); // Loads initial chart
}

// ============================================================================
// 4. DATA FETCHING & SYNCING
// ============================================================================

// Fetches batch quotes and updates both the table and the live chart endpoint
async function syncLivePrices() {
    const symbols = commodities.map(c => c.ticker).join(',');
    const endpoint = `${BASE_URL}/quote/${symbols}?apikey=${API_KEY}`;
    
    try {
        const response = await fetch(endpoint);
        const data = await response.json();

        if (!Array.isArray(data)) throw new Error("API Limit reached or Invalid Data");

        updateTableDOM(data);
        
        // Find the newly fetched live price for the currently selected commodity
        const activeLiveData = data.find(item => item.symbol === currentCommodity.ticker);
        if (activeLiveData) {
            updateLiveChartPoint(activeLiveData.price);
        }

        updateTimestamp();
    } catch (error) {
        console.error("Live sync failed:", error);
    }
}

// Fetches historical data ONLY if it's not in the cache
async function getHistoricalData(ticker, period) {
    // 1. Check Cache
    if (chartCache[ticker] && chartCache[ticker][period]) {
        console.log(`Loaded ${period} data for ${ticker} from CACHE`);
        return chartCache[ticker][period];
    }

    // 2. If not in cache, fetch from API
    console.log(`Fetching ${period} data for ${ticker} from API...`);
    let endpoint = '';
    let dataPointsLimit = 0;

    if (period === '1D') {
        endpoint = `${BASE_URL}/historical-chart/15min/${ticker}?apikey=${API_KEY}`;
        dataPointsLimit = 40;
    } else {
        endpoint = `${BASE_URL}/historical-price-full/${ticker}?apikey=${API_KEY}`;
        switch(period) {
            case '1M': dataPointsLimit = 22; break;
            case '3M': dataPointsLimit = 65; break;
            case '6M': dataPointsLimit = 130; break;
            case '1Y': dataPointsLimit = 252; break;
            case '3Y': dataPointsLimit = 756; break;
            case '5Y': dataPointsLimit = 1260; break;
            default: dataPointsLimit = 30;
        }
    }

    const response = await fetch(endpoint);
    const data = await response.json();

    let rawData = period === '1D' ? data.slice(0, dataPointsLimit) : (data.historical ? data.historical.slice(0, dataPointsLimit) : []);
    rawData.reverse(); // API gives newest first, we need oldest first for chart

    const labels = rawData.map(item => {
        const dateObj = new Date(item.date);
        if (period === '1D') return `${dateObj.getHours().toString().padStart(2, '0')}:${dateObj.getMinutes().toString().padStart(2, '0')}`;
        if (period === '1Y' || period === '3Y' || period === '5Y') return `${dateObj.toLocaleString('en-US', { month: 'short' })} '${dateObj.getFullYear().toString().substr(-2)}`;
        return `${dateObj.getDate()} ${dateObj.toLocaleString('en-US', { month: 'short' })}`;
    });

    const prices = rawData.map(item => item.close);

    // 3. Save to Cache
    if (!chartCache[ticker]) chartCache[ticker] = {};
    chartCache[ticker][period] = { labels, prices };

    return chartCache[ticker][period];
}

// ============================================================================
// 5. DOM & CHART UPDATES
// ============================================================================

function updateTableDOM(apiDataArray) {
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = ''; 

    commodities.forEach(comm => {
        const apiData = apiDataArray.find(item => item.symbol === comm.ticker);
        if (!apiData) return;

        const isPositive = apiData.change >= 0;
        const tr = document.createElement('tr');
        if (currentCommodity.id === comm.id) tr.classList.add('active-row');
        
        tr.onclick = () => selectCommodity(comm);

        tr.innerHTML = `
            <td>
                <div class="commodity-name">${comm.name}</div>
                <div style="font-size: 0.8rem; color: var(--text-secondary)">${comm.ticker}</div>
            </td>
            <td class="price">$${apiData.price.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td class="change ${isPositive ? 'positive' : 'negative'}">
                ${isPositive ? '+' : ''}${apiData.change.toFixed(2)} (${isPositive ? '+' : ''}${apiData.changesPercentage.toFixed(2)}%)
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function selectCommodity(commodity) {
    if (currentCommodity.id === commodity.id) return;
    currentCommodity = commodity;
    
    // Refresh table immediately to update the highlighted row, then load chart
    syncLivePrices(); 
    loadChartData(currentCommodity, currentPeriod);
}

async function loadChartData(commodity, period) {
    document.getElementById('chart-title').innerText = `Loading data for ${commodity.name}...`;
    
    const chartData = await getHistoricalData(commodity.ticker, period);
    
    document.getElementById('chart-title').innerText = `${commodity.name} (${commodity.ticker})`;
    
    // We clone the arrays because Chart.js mutates them, which would corrupt our cache
    renderChart([...chartData.labels], [...chartData.prices]);
}

// Mutates the existing chart dynamically without a page reload or API call
function updateLiveChartPoint(newPrice) {
    if (!chartInstance) return;

    const dataPoints = chartInstance.data.datasets[0].data;
    
    // Replace the very last historical point with the live price
    dataPoints[dataPoints.length - 1] = newPrice;

    // Recalculate color dynamically (Green if overall trend is up, Red if down)
    const startPrice = dataPoints[0];
    const isPositive = newPrice >= startPrice;
    
    chartInstance.data.datasets[0].borderColor = isPositive ? '#198754' : '#dc3545';
    chartInstance.data.datasets[0].backgroundColor = isPositive ? 'rgba(25, 135, 84, 0.1)' : 'rgba(220, 53, 69, 0.1)';

    chartInstance.update(); // Smoothly animates the new data point!
}

function renderChart(labels, dataPoints) {
    const ctx = document.getElementById('commodityChart').getContext('2d');

    if (chartInstance) chartInstance.destroy();

    const startPrice = dataPoints[0];
    const endPrice = dataPoints[dataPoints.length - 1];
    const isPositive = endPrice >= startPrice;

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Price',
                data: dataPoints,
                borderColor: isPositive ? '#198754' : '#dc3545',
                backgroundColor: isPositive ? 'rgba(25, 135, 84, 0.1)' : 'rgba(220, 53, 69, 0.1)',
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 6,
                fill: true,
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(context.parsed.y);
                        }
                    }
                }
            },
            interaction: { mode: 'nearest', axis: 'x', intersect: false },
            scales: {
                x: { grid: { display: false } },
                y: {
                    border: { display: false },
                    grid: { color: '#e9ecef' },
                    ticks: { callback: function(value) { return '$' + value; } }
                }
            }
        }
    });
}

// ============================================================================
// 6. EVENT LISTENERS & UTILITIES
// ============================================================================

function setupEventListeners() {
    const buttons = document.querySelectorAll('.filter-btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            buttons.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            currentPeriod = e.target.getAttribute('data-period');
            loadChartData(currentCommodity, currentPeriod);
        });
    });
}

function updateTimestamp() {
    const now = new Date();
    document.getElementById('last-update-time').innerText = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
