/**
 * COMMODITY PRICE TRACKER - SECURE CLOUDFLARE PROXY ARCHITECTURE
 * Senior UI/UX Refactor: Premium Light Theme, Synchronized Dynamic Headers, Crisp Grids
 */

// ============================================================================
// 1. AYARLAR (PROXY YAPISI KESİNLİKLE KORUNDU)
// ============================================================================
const WORKER_URL = "https://yahoo-proxy.commodityprice.workers.dev"; // Kendi URL'ni ekle
const PROXY_SECRET = "CommoditySecure2026"; 

const commodities = [
    { id: 'gold', name: 'Gold', icon: '🥇', ticker: 'GC=F' },
    { id: 'silver', name: 'Silver', icon: '🥈', ticker: 'SI=F' },
    { id: 'copper', name: 'Copper', icon: '🥉', ticker: 'HG=F' },
    { id: 'brent', name: 'Brent Oil', icon: '🛢️', ticker: 'BZ=F' },
    { id: 'natgas', name: 'Natural Gas', icon: '💨', ticker: 'NG=F' }
];

let currentCommodity = commodities[0];
let currentPeriod = '1D';
let chartInstance = null;
const chartCache = {}; 
let livePricesMap = {}; // Fiyat ve Değişim Senkronizasyon Hafızası

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
        alert("🚨 Lütfen script.js dosyasındaki WORKER_URL kısmına kendi Cloudflare adresinizi ekleyin.");
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
        const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const dateStr = now.toLocaleDateString('en-US', dateOptions);
        const timeStr = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        clockEl.innerText = `${dateStr} | ${timeStr}`;
    }
    
    updateTime(); 
    setInterval(updateTime, 1000); 
}

async function initApp() {
    try {
        await syncLivePrices(); 
        await loadChartData(currentCommodity, currentPeriod); 
    } catch (error) {
        console.error("❌ initApp fatal error:", error);
    }
}

// ============================================================================
// 3. SECURE DATA FETCHING (DOKUNULMADI)
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
            updateChartHeaderStats(activeLiveData); // Dinamik Grafik Başlığı Güncellemesi
        }
        
        updatePerformanceTable(currentCommodity);

    } catch (error) {
        console.error("❌ Live sync failed:", error.message);
        const tbody = document.getElementById('table-body');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:#EF4444; font-weight:bold;">Error loading live prices.</td></tr>`;
        }
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
        
        const labels = [];
        const prices = [];

        for (let i = 0; i < rawPrices.length; i++) {
            if (rawPrices[i] !== null) {
                const dateObj = new Date(rawTimestamps[i] * 1000);
                
                if (period === '1D') {
                    labels.push(`${dateObj.getHours().toString().padStart(2, '0')}:${dateObj.getMinutes().toString().padStart(2, '0')}`);
                } else {
                    labels.push(`${dateObj.getDate()} ${dateObj.toLocaleString('en-US', { month: 'short' })} ${dateObj.getFullYear()}`);
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
// 4. UI & PERFORMANCE TABLE UPDATES (DOM Manüpilasyonu)
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

// GÜNCELLEME: Grafik Başlığına Dinamik Fiyat ve Yüzde Ekleme
function updateChartHeaderStats(liveData) {
    const statsContainer = document.getElementById('chart-current-stats');
    if (!statsContainer || !liveData) return;

    const isPositive = liveData.regularMarketChange >= 0;
    const colorClass = isPositive ? 'positive' : 'negative';
    const sign = isPositive ? '+' : '';

    statsContainer.innerHTML = `
        <span class="stat-price">$${liveData.regularMarketPrice.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
        <span class="stat-change ${colorClass}">${sign}${liveData.regularMarketChangePercent.toFixed(2)}%</span>
    `;
}

async function updatePerformanceTable(commodity) {
    const titleEl = document.getElementById('perf-title');
    if (titleEl) titleEl.innerText = `${commodity.name} Performance`;

    const fetchPeriods = ['1D', '1M', '6M', '1Y', '5Y'];
    const displayNames = ['Today', '1 Month', '6 Months', '1 Year', '5 Years']; 
    const tbody = document.getElementById('perf-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color: #64748B; padding: 20px;">Analyzing data...</td></tr>';

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
            
            // "Today" Satırı: 24h Change ile tıpatıp eşleniyor.
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
    
    const chartTitleEl = document.getElementById('chart-title');
    if (chartTitleEl) chartTitleEl.innerText = `Loading ${commodity.name}...`;
    
    syncLivePrices(); 
    loadChartData(currentCommodity, currentPeriod);
}

// ============================================================================
// 5. CHART.JS RENDERING (Crisp Grids, Slate Blue Line, Bold Ticks)
// ============================================================================

async function loadChartData(commodity, period) {
    const titleEl = document.getElementById('chart-title');
    if (titleEl) titleEl.innerText = `Loading ${commodity.name}...`;
    
    try {
        const chartData = await getHistoricalData(commodity.ticker, period);
        if (titleEl) titleEl.innerText = `${commodity.name} Price`;
        renderChart([...chartData.labels], [...chartData.prices]);
    } catch (error) {
        if (titleEl) titleEl.innerHTML = `<span style="color: #EF4444;">Data unavailable</span>`;
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
    chartInstance.update(); 
}

function renderChart(labels, dataPoints) {
    const canvas = document.getElementById('commodityChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (chartInstance) chartInstance.destroy();

    // Chart Bounding Box Eklentisi (Kusursuz Çerçeve)
    const boundingBoxPlugin = {
        id: 'chartBoundingBox',
        beforeDraw(chart) {
            const { ctx, chartArea } = chart;
            if (!chartArea) return;
            ctx.save();
            ctx.strokeStyle = '#CBD5E1'; // Slate 300 (Keskin sınır)
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
                borderColor: '#3B82F6', // Slate Blue (Professional tek renk)
                backgroundColor: 'transparent',
                borderWidth: 2.5, 
                pointRadius: 0,
                pointHoverRadius: 6,
                fill: false, // Alan taraması tamamen kaldırıldı
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
                    backgroundColor: 'rgba(15, 23, 42, 0.95)', // Slate 900
                    titleFont: { family: 'Inter', size: 13, weight: '500' }, 
                    bodyFont: { family: 'Inter', size: 14, weight: '700' },
                    padding: 12,
                    displayColors: false, 
                    callbacks: {
                        label: function(context) {
                            return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(context.parsed.y);
                        }
                    }
                }
            },
            interaction: { mode: 'nearest', axis: 'x', intersect: false },
            scales: {
                x: { 
                    grid: { display: true, color: '#CBD5E1', drawBorder: false }, // Belirgin kılavuz çizgileri
                    ticks: { 
                        color: '#334155', // Bold & High contrast Slate 700
                        font: { family: 'Inter', size: 12, weight: '700' },
                        maxTicksLimit: 6, 
                        maxRotation: 0, 
                        autoSkip: true,
                        callback: function(val, index) {
                            let label = this.getLabelForValue(val);
                            if (['6M', '1Y', '5Y'].includes(currentPeriod)) {
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
                        font: { family: 'Inter', size: 12, weight: '700' }, // Bold Y axis
                        callback: function(value) { return '$' + value; } 
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
