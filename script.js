/**
 * COMMODITY PRICE TRACKER - CLEAN LIGHT DASHBOARD
 * Features: Dynamic Title, Perfect DOM Mapping, Grid Performance, Weekend Gap Logic
 */

// ============================================================================
// 1. SETTINGS & DATA
// ============================================================================
const WORKER_URL = "https://yahoo-proxy.commodityprice.workers.dev"; 
const PROXY_SECRET = "CommoditySecure2026"; 

const commodities = [
    { id: 'gold', name: 'Gold', icon: '🥇', ticker: 'GC=F', initPrice: 4752.00, initChange: 67.30, initChangePct: 1.44 },
    { id: 'silver', name: 'Silver', icon: '🥈', ticker: 'SI=F', initPrice: 74.48, initChange: 2.49, initChangePct: 3.46 },
    { id: 'copper', name: 'Copper', icon: '🥉', ticker: 'HG=F', initPrice: 5.76, initChange: 0.19, initChangePct: 3.50 },
    { id: 'brent', name: 'Brent Oil', icon: '🛢️', ticker: 'BZ=F', initPrice: 96.15, initChange: -13.12, initChangePct: -12.01 },
    { id: 'natgas', name: 'Natural Gas', icon: '💨', ticker: 'NG=F', initPrice: 2.73, initChange: -0.14, initChangePct: -4.74 }
];

let currentCommodity = commodities[0];
let currentPeriod = '1D';
let chartInstance = null;
const chartCache = {}; 
let livePricesMap = {}; 

const fetchOptions = {
    method: 'GET',
    headers: {
        'x-proxy-secret': PROXY_SECRET,
        'Content-Type': 'application/json'
    }
};

// ============================================================================
// 2. INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    startLiveClock(); 
    initApp();
    setupEventListeners();
    
    // Auto-sync every 15 minutes
    setInterval(() => {
        syncLivePrices();
    }, 15 * 60 * 1000);
});

function startLiveClock() {
    const clockEl = document.getElementById('live-clock');
    if (!clockEl) return;
    
    function updateTime() {
        const now = new Date();
        const dateOptions = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
        const dateStr = now.toLocaleDateString('en-US', dateOptions);
        const timeStr = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        clockEl.innerText = `${dateStr} | ${timeStr}`;
    }
    
    updateTime(); 
    setInterval(updateTime, 1000); 
}

function renderInitialValues() {
    commodities.forEach(c => {
        livePricesMap[c.ticker] = {
            price: c.initPrice,
            change: c.initChange,
            changePercent: c.initChangePct
        };
    });

    updateTableDOM();
    updatePerformanceTable(currentCommodity);
}

async function initApp() {
    try {
        renderInitialValues(); 
        await loadChartData(currentCommodity, currentPeriod); 
        await syncLivePrices(); 
    } catch (error) {
        console.error("Init error:", error);
    }
}

// ============================================================================
// 3. DATA FETCHING & 1D WEEKEND LOGIC
// ============================================================================

async function syncLivePrices() {
    const symbols = commodities.map(c => c.ticker).join(',');
    const endpoint = `${WORKER_URL}/v7/finance/quote?symbols=${symbols}`;
    
    try {
        const response = await fetch(endpoint, fetchOptions);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        const results = data?.quoteResponse?.result;
        
        if (!Array.isArray(results) || results.length === 0) return;

        results.forEach(item => {
            livePricesMap[item.symbol] = {
                price: item.regularMarketPrice,
                change: item.regularMarketChange,
                changePercent: item.regularMarketChangePercent
            };
        });

        updateTableDOM();
        updatePerformanceTable(currentCommodity);

    } catch (error) {
        console.error("Live sync failed:", error.message);
    }
}

async function getHistoricalData(ticker, period) {
    if (chartCache[ticker] && chartCache[ticker][period]) {
        return chartCache[ticker][period];
    }

    let range = '5d'; 
    let interval = '15m';
    
    switch(period) {
        case '1W': range = '5d'; interval = '15m'; break;
        case '1M': range = '1mo'; interval = '1d'; break;
        case '3M': range = '3mo'; interval = '1d'; break;
        case '6M': range = '6mo'; interval = '1d'; break;
        case '1Y': range = '1y'; interval = '1d'; break;
        case '5Y': range = '5y'; interval = '1wk'; break;
    }

    const endpoint = `${WORKER_URL}/v8/finance/chart/${ticker}?range=${range}&interval=${interval}`;

    try {
        const response = await fetch(endpoint, fetchOptions);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        const result = data?.chart?.result?.[0];

        if (!result || !result.timestamp || !result.indicators?.quote?.[0]?.close) {
            throw new Error("Historical data is missing");
        }

        const rawTimestamps = result.timestamp;
        const rawPrices = result.indicators.quote[0].close;
        
        let targetTimestamps = rawTimestamps;
        let targetPrices = rawPrices;

        // 1D Weekend Gap Fix Logic
        if (period === '1D' && rawTimestamps.length > 0) {
            const lastTs = rawTimestamps[rawTimestamps.length - 1];
            const lastDateString = new Date(lastTs * 1000).toDateString();
            
            targetTimestamps = [];
            targetPrices = [];

            for (let i = 0; i < rawTimestamps.length; i++) {
                const currentDateObj = new Date(rawTimestamps[i] * 1000);
                if (currentDateObj.toDateString() === lastDateString) {
                    targetTimestamps.push(rawTimestamps[i]);
                    targetPrices.push(rawPrices[i]);
                }
            }
        }

        const labels = [];
        const prices = [];

        for (let i = 0; i < targetPrices.length; i++) {
            if (targetPrices[i] !== null) {
                const dateObj = new Date(targetTimestamps[i] * 1000);
                
                if (period === '1D' || period === '1W') {
                    labels.push(`${dateObj.getHours().toString().padStart(2, '0')}:${dateObj.getMinutes().toString().padStart(2, '0')}`);
                } else {
                    labels.push(`${dateObj.getDate()} ${dateObj.toLocaleString('en-US', { month: 'short' })} ${dateObj.getFullYear()}`);
                }
                
                prices.push(targetPrices[i]);
            }
        }

        if (prices.length === 0) throw new Error("No data points");

        if (!chartCache[ticker]) chartCache[ticker] = {};
        chartCache[ticker][period] = { labels, prices };

        return chartCache[ticker][period];

    } catch (error) {
        throw error; 
    }
}

// ============================================================================
// 4. UI DOM UPDATES
// ============================================================================

function updateTableDOM() {
    const listContainer = document.getElementById('commodity-list');
    if (!listContainer) return;
    
    listContainer.innerHTML = ''; 

    commodities.forEach(comm => {
        const liveData = livePricesMap[comm.ticker];
        if (!liveData) return;

        const currentPrice = liveData.price || 0;
        const changePercent = liveData.changePercent || 0;
        const isPositive = changePercent >= 0;

        const itemDiv = document.createElement('div');
        itemDiv.className = `overview-item ${currentCommodity.id === comm.id ? 'active' : ''}`;
        itemDiv.onclick = () => selectCommodity(comm);

        itemDiv.innerHTML = `
            <div class="comm-left">
                <span class="comm-icon">${comm.icon}</span>
                <div class="comm-text">
                    <h3>${comm.name}</h3>
                    <span>${comm.ticker}</span>
                </div>
            </div>
            <div class="comm-right">
                <div class="price-val">$${currentPrice.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                <div class="badge ${isPositive ? 'badge-up' : 'badge-down'}">
                    ${isPositive ? '+' : ''}${changePercent.toFixed(2)}%
                </div>
            </div>
        `;
        listContainer.appendChild(itemDiv);
    });
}

async function updatePerformanceTable(commodity) {
    const titleEl = document.getElementById('perf-title');
    if (titleEl) {
        titleEl.innerText = `${commodity.name} Performance`;
    }

    const fetchPeriods = ['1D', '1W', '1M', '3M', '6M', '1Y', '5Y'];
    const displayNames = ['Today', '1 Week', '1 Month', '3 Months', '6 Months', '1 Year', '5 Years']; 
    
    const container = document.getElementById('perf-cards-container');
    if (!container) return;
    
    container.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:20px; color:var(--text-muted); font-weight:500;">Analyzing data...</div>';

    try {
        const liveData = livePricesMap[commodity.ticker];
        if (!liveData) return;

        const histDataArray = await Promise.all(
            fetchPeriods.map(p => getHistoricalData(commodity.ticker, p).catch(e => null))
        );

        container.innerHTML = ''; 
        
        fetchPeriods.forEach((period, index) => {
            const data = histDataArray[index];
            const displayName = displayNames[index];
            
            const card = document.createElement('div');
            card.className = 'perf-stat-card';
            
            if (period === '1D') {
                const change = liveData.change;
                const changePct = liveData.changePercent;
                const isPositive = change >= 0;
                const sign = isPositive ? '+' : '';

                card.innerHTML = `
                    <div class="perf-period">${displayName}</div>
                    <div class="perf-values">
                        <span class="perf-change-amount">${sign}$${Math.abs(change).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                        <span style="align-self: flex-start" class="badge ${isPositive ? 'badge-up' : 'badge-down'}">${sign}${Math.abs(changePct).toFixed(2)}%</span>
                    </div>
                `;
            } else {
                if (!data || data.prices.length === 0) {
                    card.innerHTML = `
                        <div class="perf-period">${displayName}</div>
                        <div class="perf-values">
                            <span class="perf-unavailable">Data unavailable</span>
                        </div>
                    `;
                } else {
                    const oldPrice = data.prices[0];
                    const change = liveData.price - oldPrice;
                    const changePct = (change / oldPrice) * 100;
                    
                    const isPositive = change >= 0;
                    const sign = isPositive ? '+' : '';

                    card.innerHTML = `
                        <div class="perf-period">${displayName}</div>
                        <div class="perf-values">
                            <span class="perf-change-amount">${sign}$${Math.abs(change).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                            <span style="align-self: flex-start" class="badge ${isPositive ? 'badge-up' : 'badge-down'}">${sign}${Math.abs(changePct).toFixed(2)}%</span>
                        </div>
                    `;
                }
            }
            container.appendChild(card);
        });
    } catch (error) {
        container.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding:20px; color:var(--color-down); font-weight:500;">Failed to load performance metrics</div>`;
    }
}

// ============================================================================
// 5. CHART & ERROR OVERLAY
// ============================================================================

async function loadChartData(commodity, period) {
    const titleEl = document.getElementById('chart-title');
    const container = document.getElementById('chart-container');
    
    const existingOverlay = container.querySelector('.chart-error-overlay');
    if (existingOverlay) existingOverlay.remove();

    if (titleEl) titleEl.innerText = `Loading ${commodity.name}...`;
    
    try {
        const chartData = await getHistoricalData(commodity.ticker, period);
        if (titleEl) titleEl.innerText = `${commodity.name} Price`;
        renderChart([...chartData.labels], [...chartData.prices]);
    } catch (error) {
        if (titleEl) titleEl.innerText = `${commodity.name} Price`;
        
        if (chartInstance) {
            chartInstance.destroy();
            chartInstance = null;
        }

        const overlay = document.createElement('div');
        overlay.className = 'chart-error-overlay';
        overlay.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <h3>Market Closed / Data Unavailable</h3>
            <p>No active trading data found for this period.</p>
        `;
        container.appendChild(overlay);
    }
}

function renderChart(labels, dataPoints) {
    const canvas = document.getElementById('commodityChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels, 
            datasets: [{
                label: 'Price',
                data: dataPoints,
                borderColor: '#3B82F6', 
                backgroundColor: 'transparent',
                borderWidth: 2.5, 
                pointRadius: 0,
                pointHoverRadius: 6,
                fill: false, 
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
                    backgroundColor: 'rgba(15, 23, 42, 0.95)', 
                    titleFont: { family: 'Inter', size: 13, weight: '500' }, 
                    bodyFont: { family: 'Inter', size: 14, weight: '700' },
                    padding: 12,
                    displayColors: false, 
                    callbacks: {
                        label: function(context) {
                            return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(context.parsed.y);
                        }
                    }
                }
            },
            interaction: { mode: 'nearest', axis: 'x', intersect: false },
            scales: {
                x: { 
                    grid: { display: true, color: 'rgba(0,0,0,0.05)', drawBorder: false }, 
                    ticks: { 
                        color: '#64748B', 
                        font: { family: 'Inter', size: 12, weight: '600' },
                        maxTicksLimit: 6, 
                        maxRotation: 0, 
                        autoSkip: true,
                        callback: function(val, index) {
                            let label = this.getLabelForValue(val);
                            if (['3M', '6M', '1Y', '5Y'].includes(currentPeriod)) {
                                let parts = label.split(' '); 
                                if (parts.length === 3) {
                                    return parts[1] + ' ' + parts[2]; 
                                }
                            }
                            return label;
                        }
                    }
                },
                y: {
                    grid: { display: true, color: 'rgba(0,0,0,0.05)', drawBorder: false },
                    ticks: { 
                        color: '#64748B', 
                        font: { family: 'Inter', size: 12, weight: '600' }, 
                        callback: function(value) { 
                            return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
                        } 
                    }
                }
            }
        }
    });
}

function selectCommodity(commodity) {
    if (currentCommodity.id === commodity.id) return;
    currentCommodity = commodity;
    
    updateTableDOM();
    loadChartData(currentCommodity, currentPeriod);
    updatePerformanceTable(currentCommodity);
}

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
