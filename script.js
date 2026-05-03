/**
 * THE COMMODITY JOURNAL - MASTER SCRIPT
 * Features: Sparklines, Dynamic Titles, Live Clock (HH:MM:SS), Market Status, Skeleton & Gradient Chart.
 */

// 1. SETTINGS & DATA
const WORKER_URL = "https://yahoo-proxy.commodityprice.workers.dev";
const PROXY_SECRET = "CommoditySecure2026"; 

const commodities = [
    { id: 'gold', name: 'Gold', icon: '🥇', ticker: 'GC=F', initPrice: 4752.00, initChange: 67.30, initChangePct: 1.44 },
    { id: 'silver', name: 'Silver', icon: '🥈', ticker: 'SI=F', initPrice: 74.48, initChange: 2.49, initChangePct: 3.46 },
    { id: 'copper', name: 'Copper', icon: '🥉', ticker: 'HG=F', initPrice: 5.76, initChange: 0.19, initChangePct: 3.50 },
    { id: 'brent', name: 'Brent Crude', icon: '🛢️', ticker: 'BZ=F', initPrice: 96.15, initChange: -13.12, initChangePct: -12.01 },
    { id: 'natgas', name: 'Natural Gas', icon: '💨', ticker: 'NG=F', initPrice: 2.73, initChange: -0.14, initChangePct: -4.74 }
];

let currentCommodity = commodities[0];
let currentPeriod = '1D';
let chartInstance = null;
const chartCache = {}; 
let livePricesMap = {}; 
let sparklineInstances = {};

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
    const dotEl = document.getElementById('market-status-dot');
    if (!clockEl) return;
    
    function updateTime() {
        const now = new Date();
        const dateOptions = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
        const dateStr = now.toLocaleDateString('en-US', dateOptions).toUpperCase();
        const timeStr = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        clockEl.innerText = `${dateStr} | ${timeStr}`;
        if (dotEl) {
            const day = now.getDay();
            const isWeekend = (day === 0 || day === 6);
            dotEl.className = isWeekend ? 'live-dot market-closed' : 'live-dot market-open';
        }
    }
    updateTime(); 
    setInterval(updateTime, 1000); 
}

async function initApp() {
    commodities.forEach(c => {
        livePricesMap[c.ticker] = { price: c.initPrice, change: c.initChange, changePercent: c.initChangePct };
    });
    updateTableDOM();
    updatePerformanceTable(currentCommodity);
    await loadChartData(currentCommodity, currentPeriod);
    await syncLivePrices();
}

// 3. FETCHING & LOGIC
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
    } catch (e) { console.error("Sync Error", e); }
}

async function getHistoricalData(ticker, period) {
    if (chartCache[ticker] && chartCache[ticker][period]) return chartCache[ticker][period];
    let range = '5d', interval = '15m'; 
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
        if (!result || !result.timestamp) throw new Error("No data");
        
        let ts = result.timestamp, pr = result.indicators.quote[0].close;
        if (period === '1D') {
            const lastActiveDate = new Date(ts[ts.length - 1] * 1000).toDateString();
            const fTs = [], fPr = [];
            ts.forEach((t, i) => { if (new Date(t * 1000).toDateString() === lastActiveDate) { fTs.push(t); fPr.push(pr[i]); } });
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

// 4. UI: SPARKLINE & TABLE
async function updateTableDOM() {
    const list = document.getElementById('commodity-list');
    if (!list) return;
    list.innerHTML = '';

    for (const c of commodities) {
        const live = livePricesMap[c.ticker];
        const isPos = live.changePercent >= 0;
        const div = document.createElement('div');
        div.className = `market-item ${currentCommodity.id === c.id ? 'active' : ''}`;
        div.onclick = () => selectCommodity(c);
        
        div.innerHTML = `
            <div class="item-left">
                <span class="item-icon">${c.icon}</span>
                <div class="item-info">
                    <span class="item-name">${c.name}</span>
                    <span class="item-ticker">${c.ticker}</span>
                </div>
            </div>
            <div class="sparkline-container">
                <canvas id="spark-${c.id}"></canvas>
            </div>
            <div class="item-right">
                <span class="item-price">$${live.price.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                <span class="item-change ${isPos?'color-up':'color-down'}">${isPos?'+':''}${live.changePercent.toFixed(2)}%</span>
            </div>
        `;
        list.appendChild(div);
        
        // Draw Sparkline
        try {
            const sparkData = await getHistoricalData(c.ticker, '1D');
            renderSparkline(`spark-${c.id}`, sparkData.prices, isPos);
        } catch (e) { console.warn("Sparkline failed for", c.id); }
    }
}

function renderSparkline(canvasId, data, isPositive) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (sparklineInstances[canvasId]) sparklineInstances[canvasId].destroy();
    
    sparklineInstances[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map((_, i) => i),
            datasets: [{
                data: data,
                borderColor: isPositive ? '#386641' : '#BC4749',
                borderWidth: 1.5,
                pointRadius: 0,
                tension: 0.3,
                fill: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            scales: { x: { display: false }, y: { display: false } },
            interaction: { enabled: false }
        }
    });
}

// 5. MAIN UI & CHART
async function updatePerformanceTable(commodity) {
    document.getElementById('perf-title').innerText = `${commodity.name} Performance`;
    const container = document.getElementById('perf-cards-container');
    const periods = ['1D', '1W', '1M', '3M', '6M', '1Y', '5Y'];
    const names = ['Today', '1 Week', '1 Month', '3 Months', '6 Months', '1 Year', '5 Years'];
    
    container.innerHTML = '';
    periods.forEach((_, i) => {
        const block = document.createElement('div');
        block.className = 'perf-block';
        block.innerHTML = `<div class="perf-label">${names[i]}</div><div class="skeleton" style="width: 70%; height: 24px; margin-top: 4px; border-radius: 4px;"></div><div class="skeleton" style="width: 45%; height: 18px; margin-top: 4px; border-radius: 4px;"></div>`;
        container.appendChild(block);
    });

    try {
        const live = livePricesMap[commodity.ticker];
        const hists = await Promise.all(periods.map(p => getHistoricalData(commodity.ticker, p).catch(() => null)));
        container.innerHTML = '';
        periods.forEach((p, i) => {
            const data = hists[i];
            const block = document.createElement('div');
            block.className = 'perf-block';
            let amt = "—", pct = "0.00%", isPos = true;
            if (p === '1D') {
                amt = live.change >= 0 ? `+${live.change.toFixed(2)}` : `${live.change.toFixed(2)}`;
                pct = `${live.changePercent.toFixed(2)}%`; isPos = live.changePercent >= 0;
            } else if (data && data.prices.length > 0) {
                const diff = live.price - data.prices[0];
                const dPct = (diff / data.prices[0]) * 100;
                amt = diff >= 0 ? `+${diff.toFixed(2)}` : `${diff.toFixed(2)}`;
                pct = `${dPct.toFixed(2)}%`; isPos = dPct >= 0;
            }
            block.innerHTML = `<div class="perf-label">${names[i]}</div><div class="perf-val">$${amt.replace(/[+-]/, '')}</div><div class="perf-pct ${isPos?'color-up':'color-down'}">${isPos?'+':''}${pct}</div>`;
            container.appendChild(block);
        });
    } catch (e) { container.innerHTML = '<div style="grid-column: 1/-1; color: var(--terra-red);">Data failure.</div>'; }
}

async function loadChartData(commodity, period) {
    const title = document.getElementById('chart-title');
    const container = document.getElementById('chart-container');
    container.querySelectorAll('.chart-error-overlay').forEach(e => e.remove());
    title.innerHTML = `<div class="skeleton" style="width: 200px; height: 32px; border-radius: 4px; display: inline-block;"></div>`;
    try {
        const data = await getHistoricalData(commodity.ticker, period);
        title.innerText = `${commodity.name} Price`;
        renderChart(data.labels, data.prices);
    } catch (e) {
        if (chartInstance) chartInstance.destroy();
        title.innerText = `${commodity.name} Price`;
        const overlay = document.createElement('div');
        overlay.className = 'chart-error-overlay';
        overlay.innerHTML = `<div class="overlay-box"><h3>Market Closed</h3><p>Data unavailable for this period.</p></div>`;
        container.appendChild(overlay);
    }
}

function renderChart(labels, prices) {
    const canvas = document.getElementById('commodityChart');
    const ctx = canvas.getContext('2d');
    if (chartInstance) chartInstance.destroy();

    let gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(15, 23, 42, 0.12)'); 
    gradient.addColorStop(1, 'rgba(15, 23, 42, 0)');

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                data: prices, borderColor: '#0F172A', borderWidth: 2, pointRadius: 0, tension: 0.1, fill: true, backgroundColor: gradient
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { 
                legend: { display: false },
                tooltip: {
                    enabled: true,
                    backgroundColor: '#0F172A',
                    titleFont: { family: 'Inter', size: 12, weight: '500' },
                    bodyFont: { family: 'Roboto Mono', size: 13, weight: '600' },
                    padding: 10,
                    cornerRadius: 4,
                    displayColors: false,
                    callbacks: { label: (ctx) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(ctx.parsed.y) }
                }
            },
            scales: {
                x: { grid: { display: false }, ticks: { font: { weight: 700, size: 13 }, color: '#0F172A', maxTicksLimit: 7 } },
                y: { ticks: { font: { weight: 700, size: 13 }, color: '#0F172A', callback: v => '$' + v.toLocaleString() } }
            }
        }
    });
}

function selectCommodity(c) {
    if (currentCommodity.id === c.id) return;
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
