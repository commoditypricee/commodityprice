/**
 * COMMODITY PRICE TRACKER - DIRECT API VERSION (NO CLOUDFLARE)
 * Fault Tolerant & Debug Ready
 */

// 1. API CONFIGURATION
const API_KEY = "86Nedf4EOs5jHyEMnpZR3eXTeRfhSZhu"; // <-- Kendi şifreni buraya yapıştır
const BASE_URL = "https://financialmodelingprep.com/api/v3";

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

// ============================================================================
// 2. INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    if (API_KEY === "86Nedf4EOs5jHyEMnpZR3eXTeRfhSZhuBURAYA_ALDIĞIN_FMP_API_ANAHTARINI_YAZ" || API_KEY === "") {
        alert("🚨 Lütfen script.js dosyasının en üstüne kendi API anahtarınızı ekleyin!");
    }

    console.log("🚀 Application started. Initializing...");
    initApp();
    setupEventListeners();
    
    setInterval(() => {
        console.log("⏰ Timer triggered: Syncing live prices...");
        syncLivePrices();
    }, 15 * 60 * 1000);
});

async function initApp() {
    try {
        await syncLivePrices(); 
        await loadChartData(currentCommodity, currentPeriod); 
    } catch (error) {
        console.error("❌ initApp caught a fatal error:", error);
    }
}

// ============================================================================
// 3. DATA FETCHING (WITH DIRECT API KEY)
// ============================================================================

async function syncLivePrices() {
    const symbols = commodities.map(c => c.ticker).join(',');
    // URL sonuna ?apikey= ekledik
    const endpoint = `${BASE_URL}/quote/${symbols}?apikey=${API_KEY}`;
    
    console.log(`📡 Fetching live quotes...`);

    try {
        const response = await fetch(endpoint);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${data["Error Message"] || "API Blocked Request"}`);
        }

        if (!Array.isArray(data)) {
            throw new Error(data["Error Message"] || "Invalid data format received from API");
        }

        if (data.length === 0) {
            throw new Error("API returned an empty array.");
        }

        updateTableDOM(data);
        
        const activeLiveData = data.find(item => item.symbol === currentCommodity.ticker);
        if (activeLiveData) {
            updateLiveChartPoint(activeLiveData.price);
        }

        updateTimestamp();

    } catch (error) {
        console.error("❌ syncLivePrices failed:", error.message);
        document.getElementById('table-body').innerHTML = `<tr><td colspan="3" style="text-align:center; color:red;">Error loading live prices: ${error.message}</td></tr>`;
        document.getElementById('last-update-time').innerText = "Update Failed";
    }
}

async function getHistoricalData(ticker, period) {
    if (chartCache[ticker] && chartCache[ticker][period]) {
        console.log(`📦 Loaded ${period} data for ${ticker} from CACHE`);
        return chartCache[ticker][period];
    }

    // URL sonuna ?apikey= ekledik
    let endpoint = period === '1D' 
        ? `${BASE_URL}/historical-chart/15min/${ticker}?apikey=${API_KEY}` 
        : `${BASE_URL}/historical-price-full/${ticker}?apikey=${API_KEY}`;

    console.log(`📡 Fetching historical data for ${period}...`);

    try {
        const response = await fetch(endpoint);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${data["Error Message"] || "API Blocked Request"}`);
        }

        let rawData = [];
        if (period === '1D') {
            if (!Array.isArray(data)) throw new Error(data["Error Message"] || "Intraday data is not an array");
            rawData = data.slice(0, 40);
        } else {
            if (!data.historical || !Array.isArray(data.historical)) {
                throw new Error(data["Error Message"] || "Historical data is missing");
            }
            let limit = period === '1M' ? 22 : period === '3M' ? 65 : period === '6M' ? 130 : period === '1Y' ? 252 : period === '3Y' ? 756 : 1260;
            rawData = data.historical.slice(0, limit);
        }

        rawData.reverse(); // Eskiden yeniye sırala

        const labels = rawData.map(item => {
            const dateObj = new Date(item.date);
            if (period === '1D') return `${dateObj.getHours().toString().padStart(2, '0')}:${dateObj.getMinutes().toString().padStart(2, '0')}`;
            if (period === '1Y' || period === '3Y' || period === '5Y') return `${dateObj.toLocaleString('en-US', { month: 'short' })} '${dateObj.getFullYear().toString().substr(-2)}`;
            return `${dateObj.getDate()} ${dateObj.toLocaleString('en-US', { month: 'short' })}`;
        });

        const prices = rawData.map(item => item.close);

        if (!chartCache[ticker]) chartCache[ticker] = {};
        chartCache[ticker][period] = { labels, prices };

        return chartCache[ticker][period];

    } catch (error) {
        console.error(`❌ getHistoricalData failed:`, error.message);
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
    
    document.getElementById('chart-title').innerText = `Loading data for ${commodity.name}...`;
    await syncLivePrices(); 
    await loadChartData(currentCommodity, currentPeriod);
}

async function loadChartData(commodity, period) {
    const titleEl = document.getElementById('chart-title');
    titleEl.innerText = `Loading data for ${commodity.name}...`;
    
    try {
        const chartData = await getHistoricalData(commodity.ticker, period);
        titleEl.innerText = `${commodity.name} (${commodity.ticker})`;
        renderChart([...chartData.labels], [...chartData.prices]);
    } catch (error) {
        titleEl.innerHTML = `<span style="color: red;">Failed to load chart: ${error.message}</span>`;
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
