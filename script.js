/**
 * COMMODITY PRICE TRACKER - SECURE CLOUDFLARE PROXY ARCHITECTURE
 * Added 1W and 3M Timeframes
 */

// ============================================================================
// 1. AYARLAR (PROXY YAPISI)
// ============================================================================
const WORKER_URL = "https://yahoo-proxy.commodityprice.workers.dev"; // Kendi URL'nizi girin
const PROXY_SECRET = "CommoditySecure2026"; 

// initValues Kuralı: Site yüklenirken API cevabı gelene kadar boş durmaması için
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
// 2. INITIALIZATION & LIVE CLOCK
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    if (WORKER_URL.includes("SENIN-KULLANICI-ADIN") || WORKER_URL === "") {
        console.warn("Lütfen script.js dosyasındaki WORKER_URL kısmına kendi Cloudflare adresinizi ekleyin.");
    }

    startLiveClock(); 
    initApp();
    setupEventListeners();
    
    // Gerçek veri için 15 dakikalık stabil döngü
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
    const initialData = commodities.map(c => ({
        symbol: c.ticker,
        regularMarketPrice: c.initPrice,
        regularMarketChange: c.initChange,
        regularMarketChangePercent: c.initChangePct
    }));
    
    initialData.forEach(item => {
        livePricesMap[item.symbol] = {
            price: item.regularMarketPrice,
            change: item.regularMarketChange,
            changePercent: item.regularMarketChangePercent
        };
    });

    updateTableDOM(initialData);
    updatePerformanceTable(currentCommodity);
}

async function initApp() {
    try {
        renderInitialValues(); 
        await loadChartData(currentCommodity, currentPeriod); 
        await syncLivePrices(); 
    } catch (error) {
        console.error("❌ initApp fatal error:", error);
    }
}

// ============================================================================
// 3. SECURE DATA FETCHING & WEEKEND GAP FIX
// ============================================================================

async function syncLivePrices() {
    const symbols = commodities.map(c => c.ticker).join(',');
    const endpoint = `${WORKER_URL}/v7/finance/quote?symbols=${symbols}`;
    
    try {
        const response = await fetch(endpoint, fetchOptions);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        const results = data?.quoteResponse?.result;
        
        if (!Array.isArray(results) || results.length === 0) throw new Error("Invalid live data format from API");

        results.forEach(item => {
            livePricesMap[item.symbol] = {
                price: item.regularMarketPrice,
                change: item.regularMarketChange,
                changePercent: item.regularMarketChangePercent
            };
        });

        updateTableDOM(results);
        
        const activeLiveData = results.find(item => item.symbol === currentCommodity.ticker);
        if (activeLiveData && activeLiveData.regularMarketPrice) {
            updateLiveChartPoint(activeLiveData.regularMarketPrice);
        }
        
        updatePerformanceTable(currentCommodity);

    } catch (error) {
        console.error("❌ Live sync failed:", error.message);
    }
}

async function getHistoricalData(ticker, period) {
    if (chartCache[ticker] && chartCache[ticker][period]) {
        return chartCache[ticker][period];
    }

    let range = '5d'; 
    let interval = '15m';
    
    // YENİ EKLENEN 1W VE 3M PERİYOTLARI
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
            throw new Error("Historical data is missing or malformed");
        }

        const rawTimestamps = result.timestamp;
        const rawPrices = result.indicators.quote[0].close;
        
        let targetTimestamps = rawTimestamps;
        let targetPrices = rawPrices;

        // Hafta sonu boşluğu çözümü
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
                
                if (period === '1D') {
                    labels.push(`${dateObj.getHours().toString().padStart(2, '0')}:${dateObj.getMinutes().toString().padStart(2, '0')}`);
                } else {
                    labels.push(`${dateObj.getDate()} ${dateObj.toLocaleString('en-US', { month: 'short' })} ${dateObj.getFullYear()}`);
                }
                
                prices.push(targetPrices[i]);
            }
        }

        if (prices.length === 0) throw new Error("No valid data points found.");

        if (!chartCache[ticker]) chartCache[ticker] = {};
        chartCache[ticker][period] = { labels, prices };

        return chartCache[ticker][period];

    } catch (error) {
        console.error(`❌ Historical data failed for ${period}:`, error.message);
        throw error; 
    }
}

// ============================================================================
// 4. UI & PERFORMANCE TABLE UPDATES
// ============================================================================

function updateTableDOM(apiDataArray) {
    const tbody = document.getElementById('table-body');
    if (!tbody) return;
    
    tbody.innerHTML = ''; 

    commodities.forEach(comm => {
        const apiData = apiDataArray.find(item => item.symbol === comm.ticker);
        if (!apiData) return;

        const currentPrice = apiData.regularMarketPrice || 0;
        const changeValue = apiData.regularMarketChange || 0;
        const changePercent = apiData.regularMarketChangePercent || 0;
        const isPositive = changeValue >= 0;

        const tr = document.createElement('tr');
        if (currentCommodity.id === comm.id) tr.classList.add('active-row');
        
        tr.onclick = () => selectCommodity(comm);

        tr.innerHTML = `
            <td>
                <div class="comm-info">
                    <span class="comm-icon">${comm.icon}</span>
                    <div class="comm-text">
                        <h3>${comm.name}</h3>
                        <span>${comm.ticker}</span>
                    </div>
                </div>
            </td>
            <td class="price-val text-right">$${currentPrice.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td class="change-val text-right ${isPositive ? 'positive' : 'negative'}">
                ${isPositive ? '+' : ''}${changeValue.toFixed(2)}
                <span>${isPositive ? '+' : ''}${changePercent.toFixed(2)}%</span>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function updatePerformanceTable(commodity) {
    const titleEl = document.getElementById('perf-title');
    if (titleEl) titleEl.innerText = `${commodity.name} Performance`;

    // YENİ EKLENEN 1W VE 3M PERİYOTLARI
    const fetchPeriods = ['1D', '1W', '1M', '3M', '6M', '1Y', '5Y'];
    const displayNames = ['Today', '1 Week', '1 Month', '3 Months', '6 Months', '1 Year', '5 Years']; 
    
    const tbody = document.getElementById('perf-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color: var(--text-muted); padding: 20px;">Analyzing data...</td></tr>';

    try {
        const liveData = livePricesMap[commodity.ticker];
        if (!liveData) return;

        const histDataArray = await Promise.all(
            fetchPeriods.map(p => getHistoricalData(commodity.ticker, p).catch(e => null))
        );

        tbody.innerHTML = ''; 
        
        fetchPeriods.forEach((period, index) => {
            const data = histDataArray[index];
            const displayName = displayNames[index];
            const tr = document.createElement('tr');
            
            if (period === '1D') {
                const change = liveData.change;
                const changePct = liveData.changePercent;
                const isPositive = change >= 0;
                const colorClass = isPositive ? 'positive' : 'negative';
                const sign = isPositive ? '+' : '';

                tr.innerHTML = `
                    <td><strong>${displayName}</strong></td>
                    <td class="text-right ${colorClass}">${sign}$${Math.abs(change).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                    <td class="text-right ${colorClass}">${sign}${Math.abs(changePct).toFixed(2)}%</td>
                `;
            } else {
                if (!data || data.prices.length === 0) {
                    tr.innerHTML = `<td><strong>${displayName}</strong></td><td colspan="2" class="text-right" style="color:#64748B">Data unavailable</td>`;
                } else {
                    const oldPrice = data.prices[0];
                    const change = liveData.price - oldPrice;
                    const changePct = (change / oldPrice) * 100;
                    
                    const isPositive = change >= 0;
                    const colorClass = isPositive ? 'positive' : 'negative';
                    const sign = isPositive ? '+' : '';

                    tr.innerHTML = `
                        <td><strong>${displayName}</strong></td>
                        <td class="text-right ${colorClass}">${sign}$${Math.abs(change).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                        <td class="text-right ${colorClass}">${sign}${Math.abs(changePct).toFixed(2)}%</td>
                    `;
                }
            }
            tbody.appendChild(tr);
        });
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:#EF4444;">Failed to load performance metrics</td></tr>`;
    }
}

async function selectCommodity(commodity) {
    if (currentCommodity.id === commodity.id) return;
    currentCommodity = commodity;
    
    loadChartData(currentCommodity, currentPeriod);
    syncLivePrices(); 
}

// ============================================================================
// 5. CHART.JS RENDERING & ERROR OVERLAY
// ============================================================================

async function loadChartData(commodity, period) {
    const titleEl = document.getElementById('chart-title');
    const container = document.querySelector('.chart-container');
    
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

function updateLiveChartPoint(newPrice) {
    if (!chartInstance) return;
    const dataPoints = chartInstance.data.datasets[0].data;
    dataPoints[dataPoints.length - 1] = newPrice;
    chartInstance.update(); 
}

function renderChart(labels, dataPoints) {
    const canvas = document.getElementById('commodityChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (chartInstance) chartInstance.destroy();

    const boundingBoxPlugin = {
        id: 'chartBoundingBox',
        beforeDraw(chart) {
            const { ctx, chartArea } = chart;
            if (!chartArea) return;
            ctx.save();
            ctx.strokeStyle = '#CBD5E1'; 
            ctx.lineWidth = 1;
            ctx.strokeRect(chartArea.left, chartArea.top, chartArea.right - chartArea.left, chartArea.bottom - chartArea.top);
            ctx.restore();
        }
    };

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
                    grid: { display: true, color: '#CBD5E1', drawBorder: false }, 
                    ticks: { 
                        color: '#334155', 
                        font: { family: 'Inter', size: 12, weight: '700' },
                        maxTicksLimit: 6, 
                        maxRotation: 0, 
                        autoSkip: true,
                        callback: function(val, index) {
                            let label = this.getLabelForValue(val);
                            // YENİ EKLENEN 3M KONTROLÜ
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
                    grid: { display: true, color: '#CBD5E1', drawBorder: false },
                    ticks: { 
                        color: '#334155', 
                        font: { family: 'Inter', size: 12, weight: '700' }, 
                        callback: function(value) { 
                            return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
                        } 
                    }
                }
            }
        },
        plugins: [boundingBoxPlugin]
    });
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
