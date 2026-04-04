/**
 * COMMODITY PRICE TRACKER - SECURE CLOUDFLARE PROXY ARCHITECTURE
 * Synchronized Authorization & Yahoo Finance Crumb Bypass
 */

// 1. AYARLAR
const WORKER_URL = "https://yahoo-proxy.commodityprice.workers.dev"; // Kendi URL'ni yaz (Sonunda '/' olmasın)
const PROXY_SECRET = "CommoditySecure2026"; // Worker'daki şifre ile aynı olmak zorunda

const commodities = [
    { id: 'gold', name: 'Gold', ticker: 'GC=F' },
    { id: 'silver', name: 'Silver', ticker: 'SI=F' },
    { id: 'copper', name: 'Copper', ticker: 'HG=F' },
    { id: 'brent', name: 'Brent Oil', ticker: 'BZ=F' },
    { id: 'natgas', name: 'Natural Gas', ticker: 'NG=F' }
];

let currentCommodity = commodities[0];
let currentPeriod = '1D';
let chartInstance = null;
const chartCache = {}; 

// Proxy'e gönderilecek standart güvenlik başlıkları
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
    if(WORKER_URL.includes("SENIN-KULLANICI-ADIN")) {
        alert("🚨 Lütfen script.js dosyasındaki WORKER_URL kısmını kendi Cloudflare adresinizle değiştirin.");
    }

    initApp();
    setupEventListeners();
    
    setInterval(() => {
        syncLivePrices();
    }, 15 * 60 * 1000);
});

async function initApp() {
    try {
        await syncLivePrices(); 
        await loadChartData(currentCommodity, currentPeriod); 
    } catch (error) {
        console.error("❌ initApp fatal error:", error);
    }
}

// ============================================================================
// 3. SECURE DATA FETCHING
// ============================================================================

async function syncLivePrices() {
    const symbols = commodities.map(c => c.ticker).join(',');
    const endpoint = `${WORKER_URL}/v7/finance/quote?symbols=${symbols}`;
    
    try {
        const response = await fetch(endpoint, fetchOptions); // Şifreli başlıklar eklendi
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        const results = data?.quoteResponse?.result;
        
        if (!Array.isArray(results) || results.length === 0) {
            throw new Error("Invalid live data format from API");
        }

        updateTableDOM(results);
        
        const activeLiveData = results.find(item => item.symbol === currentCommodity.ticker);
        if (activeLiveData && activeLiveData.regularMarketPrice) {
            updateLiveChartPoint(activeLiveData.regularMarketPrice);
        }
        updateTimestamp();

    } catch (error) {
        console.error("❌ Live sync failed:", error.message);
        document.getElementById('table-body').innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--danger-color); font-weight:bold;">Error loading live prices. Trying again later.</td></tr>`;
    }
}

async function getHistoricalData(ticker, period) {
    if (chartCache[ticker] && chartCache[ticker][period]) {
        return chartCache[ticker][period];
    }

    let range = '1d';
    let interval = '15m';
    
    switch(period) {
        case '1M': range = '1mo'; interval = '1d'; break;
        case '3M': range = '3mo'; interval = '1d'; break;
        case '6M': range = '6mo'; interval = '1d'; break;
        case '1Y': range = '1y'; interval = '1d'; break;
        case '3Y': range = '3y'; interval = '1wk'; break;
        case '5Y': range = '5y'; interval = '1wk'; break;
    }

    const endpoint = `${WORKER_URL}/v8/finance/chart/${ticker}?range=${range}&interval=${interval}`;

    try {
        const response = await fetch(endpoint, fetchOptions); // Şifreli başlıklar eklendi
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        const result = data?.chart?.result?.[0];

        if (!result || !result.timestamp || !result.indicators?.quote?.[0]?.close) {
            throw new Error("Historical data is missing or malformed");
        }

        const rawTimestamps = result.timestamp;
        const rawPrices = result.indicators.quote[0].close;
        
        const labels = [];
        const prices = [];

        for (let i = 0; i < rawPrices.length; i++) {
            if (rawPrices[i] !== null) {
                const dateObj = new Date(rawTimestamps[i] * 1000);
                
                if (period === '1D') {
                    labels.push(`${dateObj.getHours().toString().padStart(2, '0')}:${dateObj.getMinutes().toString().padStart(2, '0')}`);
                } else if (period === '1Y' || period === '3Y' || period === '5Y') {
                    labels.push(`${dateObj.toLocaleString('en-US', { month: 'short' })} '${dateObj.getFullYear().toString().substr(-2)}`);
                } else {
                    labels.push(`${dateObj.getDate()} ${dateObj.toLocaleString('en-US', { month: 'short' })}`);
                }
                
                prices.push(rawPrices[i]);
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
// 4. UI UPDATES
// ============================================================================

function updateTableDOM(apiDataArray) {
    const tbody = document.getElementById('table-body');
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
                <div class="commodity-name">${comm.name}</div>
                <div style="font-size: 0.8rem; color: var(--text-secondary)">${comm.ticker}</div>
            </td>
            <td class="price">$${currentPrice.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td class="change ${isPositive ? 'positive' : 'negative'}">
                ${isPositive ? '+' : ''}${changeValue.toFixed(2)} (${isPositive ? '+' : ''}${changePercent.toFixed(2)}%)
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function selectCommodity(commodity) {
    if (currentCommodity.id === commodity.id) return;
    currentCommodity = commodity;
    
    document.getElementById('chart-title').innerText = `Loading data for ${commodity.name}...`;
    await loadChartData(currentCommodity, currentPeriod);
    syncLivePrices(); 
}

async function loadChartData(commodity, period) {
    const titleEl = document.getElementById('chart-title');
    titleEl.innerText = `Loading data for ${commodity.name}...`;
    
    try {
        const chartData = await getHistoricalData(commodity.ticker, period);
        titleEl.innerText = `${commodity.name} (${commodity.ticker})`;
        renderChart([...chartData.labels], [...chartData.prices]);
    } catch (error) {
        titleEl.innerHTML = `<span style="color: var(--danger-color);">Data unavailable for ${commodity.name} (${period})</span>`;
        if (chartInstance) {
            chartInstance.destroy();
            chartInstance = null;
        }
    }
}

function updateLiveChartPoint(newPrice) {
    if (!chartInstance) return;
    const dataPoints = chartInstance.data.datasets[0].data;
    dataPoints[dataPoints.length - 1] = newPrice;

    const startPrice = dataPoints[0];
    const isPositive = newPrice >= startPrice;
    
    chartInstance.data.datasets[0].borderColor = isPositive ? '#198754' : '#dc3545';
    chartInstance.data.datasets[0].backgroundColor = isPositive ? 'rgba(25, 135, 84, 0.1)' : 'rgba(220, 53, 69, 0.1)';
    chartInstance.update(); 
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
