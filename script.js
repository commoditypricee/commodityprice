/**
 * COMMODITY PRO - SECURE CLOUDFLARE PROXY ARCHITECTURE
 * Advanced UI, Performance Table, Black Grids & Deep Caching
 */

// 1. AYARLAR (PROXY YAPISI KESİNLİKLE KORUNDU)
const WORKER_URL = "https://yahoo-proxy.commodityprice.workers.dev"; // Kendi URL'ni buraya yaz!
const PROXY_SECRET = "CommoditySecure2026"; 

// Emojilerle zenginleştirilmiş data (Sadece UI için)
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
let livePricesMap = {}; // Performans tablosu hesaplamaları için global canlı fiyat hafızası

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
    
    // Yalnızca arkaplanda veriyi günceller (Saat yazısı silindi)
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
        const response = await fetch(endpoint, fetchOptions);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        const results = data?.quoteResponse?.result;
        
        if (!Array.isArray(results) || results.length === 0) throw new Error("Invalid live data format from API");

        // Fiyatları global hafızaya al (Performans tablosu için lazım olacak)
        results.forEach(item => {
            livePricesMap[item.symbol] = item.regularMarketPrice;
        });

        updateTableDOM(results);
        
        const activeLiveData = results.find(item => item.symbol === currentCommodity.ticker);
        if (activeLiveData && activeLiveData.regularMarketPrice) {
            updateLiveChartPoint(activeLiveData.regularMarketPrice);
        }
        
        // Fiyatlar güncellendiği için Performans tablosunu da arka planda tazele
        updatePerformanceTable(currentCommodity);

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
// 4. UI & PERFORMANCE TABLE UPDATES
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

        // İkonlar buraya eklendi
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

// YENİ: Dinamik Performans Tablosu Algoritması
async function updatePerformanceTable(commodity) {
    const periods = ['1D', '1M', '3M', '6M', '1Y', '3Y', '5Y'];
    const tbody = document.getElementById('perf-table-body');
    
    // Tabloyu yükleme moduna al
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color: var(--text-secondary); padding: 30px;">Analyzing performance data...</td></tr>';

    try {
        const currentPrice = livePricesMap[commodity.ticker];
        if (!currentPrice) return;

        // Tüm periyotların geçmiş verilerini eşzamanlı (hızlı) çek veya önbellekten al
        const histDataArray = await Promise.all(
            periods.map(p => getHistoricalData(commodity.ticker, p).catch(e => null))
        );

        tbody.innerHTML = ''; // Yükleme yazısını sil
        
        periods.forEach((period, index) => {
            const data = histDataArray[index];
            const tr = document.createElement('tr');
            
            if (!data || data.prices.length === 0) {
                tr.innerHTML = `<td><strong>${period}</strong></td><td colspan="2" class="text-right" style="color:var(--text-secondary)">Data unavailable</td>`;
            } else {
                // Fiyat hesaplamaları (Güncel fiyat ile o periyodun en eski fiyatını karşılaştır)
                const oldPrice = data.prices[0];
                const change = currentPrice - oldPrice;
                const changePct = (change / oldPrice) * 100;
                
                const isPositive = change >= 0;
                const colorClass = isPositive ? 'positive' : 'negative';
                const sign = isPositive ? '+' : '';

                tr.innerHTML = `
                    <td><strong>${period}</strong></td>
                    <td class="price text-right ${colorClass}">${sign}$${Math.abs(change).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                    <td class="change text-right ${colorClass}">${sign}${Math.abs(changePct).toFixed(2)}%</td>
                `;
            }
            tbody.appendChild(tr);
        });
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--danger-color);">Failed to load performance metrics</td></tr>`;
    }
}

async function selectCommodity(commodity) {
    if (currentCommodity.id === commodity.id) return;
    currentCommodity = commodity;
    
    document.getElementById('chart-title').innerText = `Loading ${commodity.name}...`;
    
    // Grafiği, sol menüyü ve yeni Performans Tablosunu eşzamanlı güncelle
    syncLivePrices(); 
    loadChartData(currentCommodity, currentPeriod);
}

// ============================================================================
// 5. CHART CHART.JS RENDERING (Black Grids & Pure Titles)
// ============================================================================

async function loadChartData(commodity, period) {
    const titleEl = document.getElementById('chart-title');
    titleEl.innerText = `Loading ${commodity.name}...`;
    
    try {
        const chartData = await getHistoricalData(commodity.ticker, period);
        // Sadece Emtia adını yazdır (Ticker, İkon vs yok)
        titleEl.innerText = `${commodity.name}`;
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
    
    chartInstance.data.datasets[0].borderColor = isPositive ? '#10b981' : '#ef4444';
    chartInstance.data.datasets[0].backgroundColor = isPositive ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)';
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
                borderColor: isPositive ? '#10b981' : '#ef4444',
                backgroundColor: isPositive ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)',
                borderWidth: 2.5,
                pointRadius: 0,
                pointHoverRadius: 6,
                fill: true,
                tension: 0.15
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
                    backgroundColor: 'rgba(17, 24, 39, 0.9)',
                    titleFont: { family: 'Inter', size: 13 },
                    bodyFont: { family: 'Inter', size: 14, weight: 'bold' },
                    padding: 12,
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
                    grid: { 
                        display: true, 
                        color: '#000000', // Siyah dikey çizgiler
                        drawBorder: true
                    },
                    ticks: { font: { family: 'Inter' } }
                },
                y: {
                    border: { display: false },
                    grid: { 
                        display: true,
                        color: '#000000', // Siyah yatay çizgiler
                        drawBorder: true
                    },
                    ticks: { 
                        font: { family: 'Inter', weight: '500' },
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
