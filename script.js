// ... (İlk 3 bölüm - Fetch mantığı, değişkenler ve cache aynı kalıyor) ...

// ============================================================================
// 4. UI & PERFORMANCE TABLE UPDATES (MODERN SAAS REDESIGN)
// ============================================================================

function updateTableDOM(apiDataArray) {
    const listContainer = document.getElementById('commodity-list');
    if (!listContainer) return;
    
    listContainer.innerHTML = ''; 

    commodities.forEach(comm => {
        const apiData = apiDataArray.find(item => item.symbol === comm.ticker);
        if (!apiData) return;

        const currentPrice = apiData.regularMarketPrice || 0;
        const changeValue = apiData.regularMarketChange || 0;
        const changePercent = apiData.regularMarketChangePercent || 0;
        const isPositive = changeValue >= 0;

        const itemDiv = document.createElement('div');
        itemDiv.className = `overview-item ${currentCommodity.id === comm.id ? 'active' : ''}`;
        itemDiv.onclick = () => selectCommodity(comm);

        // Modern Kart Görünümü ve Rozet (Badge) Kullanımı
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
    if (titleEl) titleEl.innerText = `${commodity.name} Performance`;

    const fetchPeriods = ['1D', '1W', '1M', '3M', '6M', '1Y', '5Y'];
    const displayNames = ['Today', '1 Week', '1 Month', '3 Months', '6 Months', '1 Year', '5 Years']; 
    
    const container = document.getElementById('perf-cards-container');
    if (!container) return;
    
    container.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:20px; color:var(--text-muted); font-weight:600;">Analyzing data...</div>';

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
                        <span class="perf-change-amount ${isPositive ? 'positive' : 'negative'}">${sign}$${Math.abs(change).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                        <span style="align-self: flex-start" class="badge ${isPositive ? 'badge-up' : 'badge-down'}">${sign}${Math.abs(changePct).toFixed(2)}%</span>
                    </div>
                `;
            } else {
                if (!data || data.prices.length === 0) {
                    card.classList.add('disabled');
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
                            <span class="perf-change-amount ${isPositive ? 'positive' : 'negative'}">${sign}$${Math.abs(change).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                            <span style="align-self: flex-start" class="badge ${isPositive ? 'badge-up' : 'badge-down'}">${sign}${Math.abs(changePct).toFixed(2)}%</span>
                        </div>
                    `;
                }
            }
            container.appendChild(card);
        });
    } catch (error) {
        container.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding:20px; color:var(--color-down); font-weight:600;">Failed to load performance metrics</div>`;
    }
}

// ... (Bölüm 5 Grafik ayarları kısmı aynen kalıyor) ...
