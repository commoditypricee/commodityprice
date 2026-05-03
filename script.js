/**
 * COMMODITY PRICE TRACKER - EDITORIAL JOURNAL EDITION
 */

// 1. DATA & CONFIG
const WORKER_URL = "https://yahoo-proxy.commodityprice.workers.dev";
const PROXY_SECRET = "CommoditySecure2026";

const commodities = [
    { id: 'gold', name: 'Gold', icon: '🥇', ticker: 'GC=F', initPrice: 4752.00, initChgPct: 1.44 },
    { id: 'silver', name: 'Silver', icon: '🥈', ticker: 'SI=F', initPrice: 74.48, initChgPct: 3.46 },
    { id: 'copper', name: 'Copper', icon: '🥉', ticker: 'HG=F', initPrice: 5.76, initChgPct: 3.50 },
    { id: 'brent', name: 'Brent Crude', icon: '🛢️', ticker: 'BZ=F', initPrice: 96.15, initChgPct: -12.01 },
    { id: 'natgas', name: 'Natural Gas', icon: '💨', ticker: 'NG=F', initPrice: 2.73, initChgPct: -4.74 }
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
    setInterval(() => syncLivePrices(), 15 * 60 * 1000);
});

function startLiveClock() {
    const clockEl = document.getElementById('live-clock');
    if (!clockEl) return;
    function updateTime() {
        const now = new Date();
        const opts = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
        const dStr = now.toLocaleDateString('en-US', opts).toUpperCase();
        const tStr = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
        clockEl.innerText = `${dStr} | ${tStr}`;
    }
    updateTime();
    setInterval(updateTime, 1000);
}

async function initApp() {
    commodities.forEach(c => {
        livePricesMap[c.ticker] = { price: c.initPrice, change: 0, changePercent: c.initChgPct };
    });
    updateTableDOM();
    updatePerformanceTable(currentCommodity);
    await loadChartData(currentCommodity, currentPeriod);
    await syncLivePrices();
}

// 3. FETCHING & 1D WEEKEND LOGIC
async function syncLivePrices() {
    const symbols = commodities.map(c => c.ticker).join(',');
    const endpoint = `${WORKER_URL}/v7/finance/quote?symbols=${symbols}`;
    try {
        const res = await fetch(endpoint, fetchOptions);
        const data = await res.json();
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
    } catch (e) { console.error("Live Sync Error", e); }
}

async function getHistoricalData(ticker, period) {
    if (chartCache[ticker] && chartCache[ticker][period]) return chartCache[ticker][period];
    let range = '5d', interval = '15m'; // Default for 1D weekend fix
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
        const res = await fetch(endpoint, fetchOptions);
        const data = await res.json();
        const result = data?.chart?.result?.[0];
        if (!result) throw new Error("No data");
        let ts = result.timestamp, pr = result.indicators.quote[0].close;
        
        // 1D Periyodu İçin Hafta Sonu Filtreleme
        if (period === '1D') {
            const lastD = new Date(ts[ts.length - 1] * 1000).toDateString();
            const fTs = [], fPr = [];
            ts.forEach((t, i) => {
                if (new Date(t * 1000).toDateString() === lastD) {
                    fTs.push(t); fPr.push(pr[i]);
                }
            });
            ts = fTs; pr = fPr;
        }

        const labels = ts.map(t => {
            const d = new Date(t * 1000);
            return (period === '1D' || period === '1W') ? 
                   `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}` : 
                   `${d.getDate()} ${d.toLocaleString('en-US', {month:'short'})}`;
        });
        const prices = pr.filter(p => p !== null);
        chartCache[ticker] = chartCache[ticker] || {};
        chartCache[ticker][period] = { labels, prices };
        return chartCache[ticker][period];
    } catch (e) { throw e; }
}

// 4. CHART & UI UPDATES
function renderChart(labels, prices) {
    const ctx = document.getElementById('commodityChart').getContext('2d');
    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                data: prices, borderColor: '#0F172A', borderWidth: 2.5, pointRadius: 0, tension: 0.1, fill: false
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { 
                    grid: { display: false }, 
                    ticks: { size: 13, weight: 700, color: '#0F172A', maxTicksLimit: 7 } 
                },
                y: { 
                    ticks: { size: 13, weight: 700, color: '#0F172A', callback: v => '$' + v.toLocaleString() } 
                }
            }
        }
    });
}

function updateTableDOM() {
    const list = document.getElementById('commodity-list');
    if (!list) return;
    list.innerHTML = '';
    commodities.forEach(c => {
        const live = livePricesMap[c.ticker];
        const isPos = live.changePercent >= 0;
        const div = document.createElement('div');
        div.className = `market-item ${currentCommodity.id === c.id ? 'active' : ''}`;
        div.onclick = () => selectCommodity(c);
        div.innerHTML = `
            <div class="item-info">
                <div class="item-name">${c.icon} ${c.name}</div>
                <div class="item-ticker">${c.ticker}</div>
            </div>
            <div style="text-align: right">
                <div class="item-price">$${live.price.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                <div class="item-change ${isPos?'pos':'neg'}">${isPos?'+':''}${live.changePercent.toFixed(2)}%</div>
            </div>
        `;
        list.appendChild(div);
    });
}

async function updatePerformanceTable(commodity) {
    document.getElementById('perf-title').innerText = `${commodity.name} Performance`;
    const container = document.getElementById('perf-cards-container');
    const periods = ['1D', '1W', '1M', '3M', '6M', '1Y', '5Y'];
    const names = ['Today', '1 Week', '1 Month', '3 Months', '6 Months', '1 Year', '5 Years'];
    container.innerHTML = '<div style="grid-column: 1/-1; text-align:center;">Analyzing...</div>';
    try {
        const live = livePricesMap[commodity.ticker];
        const hists = await Promise.all(periods.map(p => getHistoricalData(commodity.ticker, p).catch(() => null)));
        container.innerHTML = '';
        periods.forEach((p, i) => {
            const data = hists[i];
            const block = document.createElement('div');
            block.className = 'perf-block';
            let amt = "N/A", pct = "0.00%", isPos = true;
            if (p === '1D') {
                amt = live.change >= 0 ? `+${live.change.toFixed(2)}` : `${live.change.toFixed(2)}`;
                pct = `${live.changePercent.toFixed(2)}%`; isPos = live.changePercent >= 0;
            } else if (data && data.prices.length > 0) {
                const diff = live.price - data.prices[0];
                const dPct = (diff / data.prices[0]) * 100;
                amt = diff >= 0 ? `+${diff.toFixed(2)}` : `${diff.toFixed(2)}`;
                pct = `${dPct.toFixed(2)}%`; isPos = dPct >= 0;
            }
            block.innerHTML = `
                <div class="perf-label">${names[i]}</div>
                <div class="perf-val">$${amt.replace(/[+-]/, '')}</div>
                <div class="perf-pct ${isPos?'pos':'neg'}">${isPos?'+':''}${pct}</div>
            `;
            container.appendChild(block);
        });
    } catch (e) { container.innerHTML = 'Error loading metrics.'; }
}

async function loadChartData(commodity, period) {
    const title = document.getElementById('chart-title');
    const container = document.getElementById('chart-container');
    container.querySelectorAll('.chart-error-overlay').forEach(e => e.remove());
    title.innerText = `Loading ${commodity.name}...`;
    try {
        const data = await getHistoricalData(commodity.ticker, period);
        title.innerText = `${commodity.name} Price`;
        renderChart(data.labels, data.prices);
    } catch (e) {
        if (chartInstance) chartInstance.destroy();
        const overlay = document.createElement('div');
        overlay.className = 'chart-error-overlay';
        overlay.innerHTML = `<div class="error-box"><h3>Market Closed</h3><p>Data unavailable for this period.</p></div>`;
        container.appendChild(overlay);
    }
}

function selectCommodity(c) {
    currentCommodity = c;
    updateTableDOM();
    loadChartData(c, currentPeriod);
    updatePerformanceTable(c);
}

function setupEventListeners() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentPeriod = e.target.dataset.period;
            loadChartData(currentCommodity, currentPeriod);
        });
    });
}
