/**
 * COMMODITY PRO - SECURE CLOUDFLARE PROXY ARCHITECTURE
 * Live Simulation: Micro-fluctuations, Smooth Scrolling, Anchor Sync
 */

// ============================================================================
// 1. AYARLAR (PROXY YAPISI KORUNDU)
// ============================================================================
const WORKER_URL = "https://yahoo-proxy.commodityprice.workers.dev";
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
let livePricesMap = {}; 

// CANLI SİMÜLASYON DEĞİŞKENLERİ
let simulationInterval = null;
let lastRealPrice = 0;   // API'den gelen son gerçek fiyat (Çıpa)
let currentSimPrice = 0; // Ekranda saniyelik dalgalanan sahte fiyat

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
    
    // Asıl 15 dakikalık gerçek veri döngüsü
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
// 3. SECURE DATA FETCHING & SYNC
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

        // Tablolar gerçek API verisiyle güncellenir (Simülasyondan etkilenmez)
        updateTableDOM(results);
        updatePerformanceTable(currentCommodity);
        
        const activeLiveData = results.find(item => item.symbol === currentCommodity.ticker);
        if (activeLiveData && activeLiveData.regularMarketPrice) {
            updateLiveChartPoint(activeLiveData.regularMarketPrice);
        }

    } catch (error) {
        console.error("❌ Live sync failed:", error.message);
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
                <div class="commodity-name"><span style="font-size: 1.2rem;">${comm.icon}</span> ${comm.name}</div>
                <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px;">${comm.ticker}</div>
            </td>
            <td class="price text-right">$${currentPrice.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td class="change text-right ${isPositive ? 'positive' : 'negative'}">
                ${isPositive ? '+' : ''}${changeValue.toFixed(2)}<br>
                <span style="font-size: 0.8rem; opacity: 0.8;">${isPositive ? '+' : ''}${changePercent.toFixed(2)}%</span>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function updatePerformanceTable(commodity) {
    const titleEl = document.getElementById('perf-title');
    if (titleEl) titleEl.innerText = `${commodity.name} Price Performance`;

    const fetchPeriods = ['1D', '1M', '6M', '1Y', '5Y'];
    const displayNames = ['Today', '1 Month', '6 Months', '1 Year', '5 Years']; 
    const tbody = document.getElementById('perf-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color: #6b7280; padding: 20px;">Analyzing data...</td></tr>';

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
                    <td class="price text-right ${colorClass}">${sign}$${Math.abs(change).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                    <td class="change text-right ${colorClass}">${sign}${Math.abs(changePct).toFixed(2)}%</td>
                `;
            } else {
                if (!data || data.prices.length === 0) {
                    tr.innerHTML = `<td><strong>${displayName}</strong></td><td colspan="2" class="text-right" style="color:#6b7280">Data unavailable</td>`;
                } else {
                    const oldPrice = data.prices[0];
                    const change = liveData.price - oldPrice;
                    const changePct = (change / oldPrice) * 100;
                    
                    const isPositive = change >= 0;
                    const colorClass = isPositive ? 'positive' : 'negative';
                    const sign = isPositive ? '+' : '';

                    tr.innerHTML = `
                        <td><strong>${displayName}</strong></td>
                        <td class="price text-right ${colorClass}">${sign}$${Math.abs(change).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                        <td class="change text-right ${colorClass}">${sign}${Math.abs(changePct).toFixed(2)}%</td>
                    `;
                }
            }
            tbody.appendChild(tr);
        });
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:#ef4444;">Failed to load performance metrics</td></tr>`;
    }
}

async function selectCommodity(commodity) {
    if (currentCommodity.id === commodity.id) return;
    currentCommodity = commodity;
    
    const chartTitleEl = document.getElementById('chart-title');
    if (chartTitleEl) chartTitleEl.innerText = `Loading ${commodity.name} Price...`;
    
    syncLivePrices(); 
    loadChartData(currentCommodity, currentPeriod);
}

// ============================================================================
// 5. CHART.JS RENDERING & LIVE SIMULATION
// ============================================================================

async function loadChartData(commodity, period) {
    const titleEl = document.getElementById('chart-title');
    if (titleEl) titleEl.innerText = `Loading ${commodity.name} Price...`;
    
    // Simülasyonu geçici olarak durdur
    if (simulationInterval) clearInterval(simulationInterval);
    
    try {
        const chartData = await getHistoricalData(commodity.ticker, period);
        if (titleEl) titleEl.innerText = `${commodity.name} Price`;
        
        // Simülasyon çıpalarını (anchor) ayarla
        if (chartData.prices.length > 0) {
            lastRealPrice = livePricesMap[commodity.ticker] ? livePricesMap[commodity.ticker].price : chartData.prices[chartData.prices.length - 1];
            currentSimPrice = lastRealPrice;
        }

        renderChart([...chartData.labels], [...chartData.prices]);
        
        // Veri yüklendikten sonra simülasyonu başlat
        startLiveSimulation();

    } catch (error) {
        if (titleEl) titleEl.innerHTML = `<span style="color: #ef4444;">Data unavailable for ${commodity.name} (${period})</span>`;
        if (chartInstance) {
            chartInstance.destroy();
            chartInstance = null;
        }
    }
}

// 15 Dakikada bir çalışan GERÇEK API eşitlemesi
function updateLiveChartPoint(newRealPrice) {
    lastRealPrice = newRealPrice; // Çıpayı güncelle
    currentSimPrice = newRealPrice; // Simülasyonu yeni gerçek fiyata lastikle çek
    
    if (!chartInstance || currentPeriod !== '1D') return;

    const dataPoints = chartInstance.data.datasets[0].data;
    const labels = chartInstance.data.labels;
    
    dataPoints.push(newRealPrice);
    const now = new Date();
    labels.push(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`);
    
    if (dataPoints.length > 60) {
        dataPoints.shift();
        labels.shift();
    }
    
    chartInstance.update('active'); 
}

// YENİ: 2.5 Saniyede bir çalışan CANLI SİMÜLASYON (Micro-fluctuations)
function startLiveSimulation() {
    if (simulationInterval) clearInterval(simulationInterval);
    
    // Simülasyon sadece Günlük (1D) görünümde çalışsın
    if (currentPeriod !== '1D') return;

    simulationInterval = setInterval(() => {
        if (!chartInstance) return;

        const dataPoints = chartInstance.data.datasets[0].data;
        const labels = chartInstance.data.labels;
        
        if (dataPoints.length === 0) return;

        // Fiyatın ortalama 10 binde 1'i kadar rastgele dalgalanma (Volatility)
        const volatility = lastRealPrice * 0.0001; 
        const change = (Math.random() - 0.5) * volatility;
        currentSimPrice += change;

        // Lastik Bant Etkisi: Simülasyon gerçek fiyattan %0.05'ten fazla koparsa merkeze çek
        const maxDeviation = lastRealPrice * 0.0005;
        if (currentSimPrice > lastRealPrice + maxDeviation) {
            currentSimPrice -= Math.abs(change) * 2;
        } else if (currentSimPrice < lastRealPrice - maxDeviation) {
            currentSimPrice += Math.abs(change) * 2;
        }

        // Sahte veriyi diziye ekle
        dataPoints.push(currentSimPrice);
        
        // Saniyeli saat formatında yeni etiket ekle
        const now = new Date();
        labels.push(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`);

        // Akıcı kaydırma için (Smooth Scroll) baştaki verileri sil (Maksimum 60 nokta barındırır)
        if (dataPoints.length > 60) {
            dataPoints.shift();
            labels.shift();
        }

        // Grafiği yumuşak bir animasyonla güncelle
        chartInstance.update({
            duration: 800,
            easing: 'linear'
        });
        
    }, 2500); // 2.5 saniyede bir tetiklenir
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
                borderColor: '#007bff', 
                backgroundColor: 'transparent',
                borderWidth: 3.5, 
                pointRadius: 0,
                pointHoverRadius: 6,
                fill: false, 
                tension: 0.15
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            // Animasyon ayarları yumuşatıldı
            animation: {
                duration: 500,
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(17, 24, 39, 0.9)',
                    titleFont: { family: 'Inter', size: 14, weight: '600' }, 
                    bodyFont: { family: 'Inter', size: 14, weight: 'bold' },
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
                    grid: { display: true, color: '#000000', drawBorder: true },
                    ticks: { 
                        color: '#333333', 
                        font: { family: 'Inter', weight: '500' },
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
                    border: { display: false },
                    grid: { display: true, color: '#000000', drawBorder: true },
                    ticks: { 
                        color: '#333333', 
                        font: { family: 'Inter', weight: '600' }, 
                        callback: function(value) { return '$' + value; } 
                    }
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
