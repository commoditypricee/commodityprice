/**
 * COMMODITY PRICE TRACKER - FULL COMPATIBILITY FIX
 * All DOM Selectors match index.html perfectly.
 */

// 1. AYARLAR & DATA
const WORKER_URL = "https://yahoo-proxy.commodityprice.workers.dev";
const PROXY_SECRET = "CommoditySecure2026"; 

const commodities = [
    { id: 'gold', name: 'Gold', icon: '🥇', ticker: 'GC=F', initPrice: 4752.00, initChangePct: 1.44 },
    { id: 'silver', name: 'Silver', icon: '🥈', ticker: 'SI=F', initPrice: 74.48, initChangePct: 3.46 },
    { id: 'copper', name: 'Copper', icon: '🥉', ticker: 'HG=F', initPrice: 5.76, initChangePct: 3.50 },
    { id: 'brent', name: 'Brent Oil', icon: '🛢️', ticker: 'BZ=F', initPrice: 96.15, initChangePct: -12.01 },
    { id: 'natgas', name: 'Natural Gas', icon: '💨', ticker: 'NG=F', initPrice: 2.73, initChangePct: -4.74 }
];

let currentCommodity = commodities[0];
let currentPeriod = '1D';
let chartInstance = null;
const chartCache = {}; 
let livePricesMap = {}; 

const fetchOptions = {
    method: 'GET',
    headers: { 'x-proxy-secret': PROXY_SECRET, 'Content-Type': 'application/json' }
};

// 2. INITIALIZATION
document.addEventListener('DOMContentLoaded', () => {
    startLiveClock(); 
    initApp();
    setupEventListeners();
    
    // 15 dakikada bir otomatik senkronizasyon
    setInterval(() => syncLivePrices(), 15 * 60 * 1000);
});

function startLiveClock() {
    const clockEl = document.getElementById('live-clock');
    if (!clockEl) return;
    
    function updateTime() {
        const now = new Date();
        const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
        const dateStr = now.toLocaleDateString('en-US', options);
        const timeStr = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        clockEl.innerText = `${dateStr} | ${timeStr}`;
    }
    updateTime(); 
    setInterval(updateTime, 1000); 
}

function renderInitialValues() {
    commodities.forEach(c => {
        livePricesMap[c.ticker] = { price: c.initPrice, change: 0, changePercent: c.initChangePct };
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
        console.error("Fatal Init Error:", error);
    }
}

// 3. DATA FETCHING (HAFTA SONU MANTIĞI DAHİL)
async function syncLivePrices() {
    const symbols = commodities.map(c => c.ticker).join(',');
    const endpoint = `${WORKER_URL}/v7/finance/quote?symbols=${symbols}`;
    
    try {
        const response = await fetch(endpoint, fetchOptions);
        const data = await response.json();
        const results = data?.quoteResponse?.result;
        
        if (!Array.isArray(results)) return;

        results.forEach(item => {
            livePricesMap[item.symbol] = {
                price: item.regularMarketPrice,
                change: item.regularMarketChange,
                changePercent: item.regularMarketChangePercent
            };
        });

        updateTableDOM();
        updatePerformanceTable(currentCommodity);
    } catch (e) { console.error("Live Sync Error:", e); }
}

async function getHistoricalData(ticker, period) {
    if (chartCache[ticker] && chartCache[ticker][period]) return chartCache[ticker][period];

    let range = '5d'; // Hafta sonu boşluğu için 1D seçildiğinde bile 5d çekiyoruz
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
        const data = await response.json();
        const result = data?.chart?.result?.[0];

        if (!result) throw new Error("No result");

        let rawTs = result.timestamp;
        let rawPrices = result.indicators.quote[0].close;
        
        // 1D Periyodu İçin Hafta Sonu Filtreleme
        if (period === '1D') {
            const lastDateStr = new Date(rawTs[rawTs.length - 1] * 1000).toDateString();
            const filteredTs = [];
            const filteredPr = [];
            for(let i=0; i<rawTs.length; i++) {
                if(new Date(rawTs[i]*1000).toDateString() === lastDateStr) {
                    filteredTs.push(rawTs[i]);
                    filteredPr.push(rawPrices[i]);
                }
            }
            rawTs = filteredTs; rawPrices = filteredPr;
        }

        const labels = rawTs.map(t => {
            const d = new Date(t * 1000);
            return (period === '1D' || period === '1W') ? 
                   `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}` : 
                   `${d.getDate()} ${d.toLocaleString('en-US', {month:'short'})}`;
        });

        const cleanPrices = rawPrices.filter(p => p !== null);
        chartCache[ticker] = chartCache[ticker] || {};
        chartCache[ticker][period] = { labels, prices: cleanPrices };
        return chartCache[ticker][period];
    } catch (e) { throw e; }
}

// 4. UI RENDERING (MODERN CARDS)
function updateTableDOM() {
    const list = document.getElementById('commodity-list');
    if (!list) return;
    list.innerHTML = '';

    commodities.forEach(comm => {
        const live = livePricesMap[comm.ticker];
        if (!live) return;
        const isPos = live.changePercent >= 0;

        const div = document.createElement('div');
        div.className = `overview-item ${currentCommodity.id === comm.id ? 'active' : ''}`;
        div.onclick = () => selectCommodity(comm);
        div.innerHTML = `
            <div class="comm-left">
                <span class="comm-icon">${comm.icon}</span>
                <div class="comm-text">
                    <h3>${comm.name}</h3>
                    <span>${comm.ticker}</span>
                </div>
            </div>
            <div class="comm-right">
                <div class="price-val">$${live.price.toLocaleString(undefined,{minimumFractionDigits:2})}</div>
                <div class="badge ${isPos ? 'badge-up' : 'badge-down'}">${isPos?'+':''}${live.changePercent.toFixed(2)}%</div>
            </div>
        `;
        list.appendChild(div);
    });
}

async function updatePerformanceTable(commodity) {
    const title = document.getElementById('perf-title');
    const container = document.getElementById('perf-cards-container');
    if (title) title.innerText = `${commodity.name} Performance`;
    if (!container) return;

    const periods = ['1D', '1W', '1M', '3M', '6M', '1Y', '5Y'];
    const names = ['Today', '1 Week', '1 Month', '3 Months', '6 Months', '1 Year', '5 Years'];
    
    container.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px;">Analyzing...</div>';

    try {
        const live = livePricesMap[commodity.ticker];
        const historicals = await Promise.all(periods.map(p => getHistoricalData(commodity.ticker, p).catch(() => null)));
        
        container.innerHTML = '';
        periods.forEach((p, i) => {
            const data = historicals[i];
            const card = document.createElement('div');
            card.className = 'perf-stat-card';
            
            let amount = "N/A", pct = "0.00%", isPos = true;

            if (p === '1D') {
                amount = live.change >= 0 ? `+$${live.change.toFixed(2)}` : `-$${Math.abs(live.change).toFixed(2)}`;
                pct = `${live.changePercent.toFixed(2)}%`;
                isPos = live.changePercent >= 0;
            } else if (data) {
                const diff = live.price - data.prices[0];
                const dPct = (diff / data.prices[0]) * 100;
                amount = diff >= 0 ? `+$${diff.toFixed(2)}` : `-$${Math.abs(diff).toFixed(2)}`;
                pct = `${dPct.toFixed(2)}%`;
                isPos = dPct >= 0;
            }

            card.innerHTML = `
                <div class="perf-period">${names[i]}</div>
                <div class="perf-values">
                    <span class="perf-change-amount">$${amount.replace(/^[+-]\$/,'')}</span>
                    <span style="align-self:flex-start" class="badge ${isPos?'badge-up':'badge-down'}">${isPos?'+':''}${pct}</span>
                </div>
            `;
            container.appendChild(card);
        });
    } catch (e) { container.innerHTML = 'Error loading metrics.'; }
}

// 5. CHART & ERROR HANDLING
async function loadChartData(commodity, period) {
    const title = document.getElementById('chart-title');
    const container = document.getElementById('chart-container');
    
    const oldOverlay = container.querySelector('.chart-error-overlay');
    if (oldOverlay) oldOverlay.remove();
    if (title) title.innerText = `Loading ${commodity.name}...`;

    try {
        const data = await getHistoricalData(commodity.ticker, period);
        if (title) title.innerText = `${commodity.name} Price`;
        renderChart(data.labels, data.prices);
    } catch (e) {
        if (title) title.innerText = `${commodity.name} Price`;
        if (chartInstance) chartInstance.destroy();
        
        const overlay = document.createElement('div');
        overlay.className = 'chart-error-overlay';
        overlay.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <h3>Market Closed / Data Unavailable</h3>
            <p>No active trading data found for this period.</p>
        `;
        container.appendChild(overlay);
    }
}

function renderChart(labels, prices) {
    const ctx = document.getElementById('commodityChart').getContext('2d');
    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                data: prices, borderColor: '#3B82F6', borderWidth: 3, pointRadius: 0, tension: 0.1, fill: false
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false }, ticks: { maxTicksLimit: 7, font: { weight: '600' } } },
                y: { ticks: { callback: v => '$' + v.toLocaleString() } }
            }
        }
    });
}

function selectCommodity(comm) {
    currentCommodity = comm;
    updateTableDOM();
    loadChartData(currentCommodity, currentPeriod);
    updatePerformanceTable(currentCommodity);
}

function setupEventListeners() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentPeriod = e.target.dataset.period;
            loadChartData(currentCommodity, currentPeriod);
        });
    });
}
