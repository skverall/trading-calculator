import React, { useState, useEffect, memo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';

// Функция для Монте-Карло симуляции торговых результатов
const runMonteCarloSimulation = (
  initialDeposit,
  tradingPairs,
  months,
  iterations = 1000
) => {
  // Результаты всех итераций
  const results = [];

  // Для каждой итерации
  for (let i = 0; i < iterations; i++) {
    let deposit = initialDeposit;
    let monthlyResults = [];

    // Для каждого месяца
    for (let month = 0; month < months; month++) {
      // Текущий процент риска
      const riskPercent = calculateRiskPercent(deposit);
      const totalRiskAmount = (deposit * riskPercent) / 100;

      // Только активные пары
      const activePairs = tradingPairs.filter(pair => pair.active);

      // Общее EV
      const totalEV = activePairs.reduce((sum, pair) => sum + pair.ev, 0);

      // Прибыль за месяц
      let monthProfit = 0;

      // Для каждой пары генерируем случайные результаты сделок
      activePairs.forEach(pair => {
        // Распределение риска
        const allocationPercent = (pair.ev / totalEV) * 100;
        const riskAmount = (allocationPercent / 100) * totalRiskAmount;

        // Количество сделок за месяц
        const trades = pair.monthlyTrades;

        // Вероятность выигрыша
        const winProbability = pair.winrate / 100;

        // Симулируем каждую сделку
        for (let t = 0; t < trades; t++) {
          // Случайное число от 0 до 1
          const random = Math.random();

          // Определяем исход сделки
          if (random < winProbability) {
            // Выигрышная сделка
            monthProfit += riskAmount * pair.rr;
          } else {
            // Проигрышная сделка
            monthProfit -= riskAmount;
          }
        }
      });

      // Добавляем комиссии и проскальзывания (упрощенно)
      const totalTrades = activePairs.reduce((sum, pair) => sum + pair.monthlyTrades, 0);
      const avgTradeSize = totalRiskAmount / activePairs.length;
      const avgRR = activePairs.reduce((sum, pair) => sum + pair.rr, 0) / activePairs.length;
      const totalVolume = totalTrades * avgTradeSize * (1 + avgRR) / 2;
      const fees = totalVolume * 0.005; // 0.5% от оборота

      // Чистая прибыль
      const netProfit = monthProfit - fees;

      // Обновляем депозит
      deposit += netProfit;

      // Сохраняем результат месяца
      monthlyResults.push({
        month: month + 1,
        deposit,
        profit: netProfit,
        riskPercent
      });
    }

    // Добавляем результат итерации
    results.push({
      finalDeposit: deposit,
      monthlyResults,
      roi: (deposit / initialDeposit - 1) * 100,
      cagr: (Math.pow(deposit / initialDeposit, 1 / (months / 12)) - 1) * 100
    });
  }

  // Сортируем результаты по финальному депозиту
  results.sort((a, b) => a.finalDeposit - b.finalDeposit);

  // Вычисляем персентили
  const percentiles = {
    worst: results[0],
    p10: results[Math.floor(iterations * 0.1)],
    p25: results[Math.floor(iterations * 0.25)],
    p50: results[Math.floor(iterations * 0.5)], // медиана
    p75: results[Math.floor(iterations * 0.75)],
    p90: results[Math.floor(iterations * 0.9)],
    best: results[iterations - 1]
  };

  // Рассчитываем среднее значение
  const avgFinalDeposit = results.reduce((sum, result) => sum + result.finalDeposit, 0) / iterations;

  return {
    percentiles,
    avgFinalDeposit,
    iterations,
    allResults: results
  };
};

// Функция для расчёта комиссий и проскальзывания
const calculateFeesAndSlippage = (trades, avgPositionSize, avgRR) => {
  // Средний размер отложенного ордера
  const avgOrderSize = avgPositionSize;

  // Комиссия по сделкам (0.1% для Binance)
  const entryFeeRate = 0.001;
  const exitFeeRate = 0.001;

  // Расчет комиссий для победных и проигрышных сделок
  const winTrades = Math.round(trades * 0.4); // примерный процент выигрышных сделок
  const lossTrades = trades - winTrades;

  // Размер позиции при закрытии (среднее)
  const avgWinSize = avgOrderSize * avgRR;
  const avgLossSize = avgOrderSize;

  // Комиссии
  const entryFees = trades * avgOrderSize * entryFeeRate;
  const winExitFees = winTrades * avgWinSize * exitFeeRate;
  const lossExitFees = lossTrades * avgLossSize * exitFeeRate;

  // Оценка проскальзывания (0.1-0.3% от оборота)
  const slippageRate = 0.002;
  const totalVolume = (trades * avgOrderSize) + (winTrades * avgWinSize) + (lossTrades * avgLossSize);
  const slippage = totalVolume * slippageRate;

  return entryFees + winExitFees + lossExitFees + slippage;
};

// Расчет риска в зависимости от размера депозита - вынесен за пределы компонента
const calculateRiskPercent = (deposit) => {
  if (deposit < 1000) return 10.0;
  if (deposit < 2000) return 8.0;
  if (deposit < 3000) return 7.0;
  if (deposit < 5000) return 6.0;
  if (deposit < 10000) return 5.0;
  if (deposit < 20000) return 4.0;
  if (deposit < 50000) return 3.5;
  if (deposit < 75000) return 3.0;
  return 2.5;
};

// Оптимизированный компонент таблицы проекции
const ProjectionTable = memo(({ projectionResults, tradingPairs, formatCurrency, formatNumber, getRiskColor, calculateRiskAllocation }) => {
  if (!projectionResults) return <div className="text-center">Введите параметры для расчета</div>;

  return (
    <div className="table-container">
      <table className="table">
        <thead>
          <tr>
            <th className="sticky-header">Месяц</th>
            <th>Депозит</th>
            <th>Риск (%)</th>
            <th>Риск ($)</th>
            {tradingPairs.filter(p => p.active).map(pair => (
              <th key={pair.pair} style={{backgroundColor: pair.color}}>
                {pair.pair}
              </th>
            ))}
            <th>Сделок</th>
            <th>Прибыль</th>
            <th>Комиссии</th>
            <th>Рост</th>
          </tr>
        </thead>
        <tbody>
          {projectionResults.monthlyData.map((month, index) => {
            const riskClass = getRiskColor(month.riskPercent);
            const rowClass = index % 2 === 0 ? "row-even" : "row-odd";
            const growthPercent = index > 0
              ? ((month.deposit / projectionResults.monthlyData[index-1].deposit - 1) * 100).toFixed(1)
              : 0;

            // Распределение риска между парами
            const allocatedPairs = calculateRiskAllocation(month.deposit, tradingPairs);

            return (
              <tr key={index} className={rowClass}>
                <td className="font-bold sticky-cell">{month.month}</td>
                <td className="font-bold">{formatCurrency(month.deposit)}</td>
                <td className={`${riskClass} font-bold`}>{month.riskPercent.toFixed(1)}%</td>
                <td>{formatCurrency(month.riskAmount)}</td>
                {allocatedPairs.filter(p => p.active).map(pair => (
                  <td key={pair.pair} style={{backgroundColor: `${pair.color}20`}}>
                    {formatCurrency(pair.riskAmount)}
                  </td>
                ))}
                <td>{formatNumber(month.trades)}</td>
                <td className={`font-bold ${month.profit >= 0 ? 'text-success' : 'text-danger'}`}>
                  {formatCurrency(month.profit)}
                </td>
                <td className="text-danger">-{formatCurrency(month.fees)}</td>
                <td className={`font-bold ${growthPercent > 0 ? 'text-success' : 'text-danger'}`}>
                  {growthPercent > 0 ? '+' : ''}{growthPercent}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});

// Оптимизированный компонент для графика
const GrowthChart = memo(({ growthChartData, formatYAxis, formatCurrency, targetDeposit }) => {
  if (!growthChartData || growthChartData.length === 0) return null;

  return (
    <div className="card chart-container">
      <h3 className="chart-title">Прогноз роста депозита</h3>
      <div className="chart-body">
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={growthChartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" label={{ value: 'Месяц', position: 'insideBottomRight', offset: -10 }} />
            <YAxis tickFormatter={formatYAxis} scale={targetDeposit > 10000 ? 'log' : 'auto'} domain={['auto', 'auto']} />
            <Tooltip formatter={(value) => [formatCurrency(value), 'Депозит']} labelFormatter={(label) => `Месяц ${label}`} />
            <Legend />
            <Area
              type="monotone"
              dataKey="deposit"
              name="Депозит"
              stroke="#8884d8"
              fill="url(#colorDeposit)"
              strokeWidth={2}
              activeDot={{ r: 8 }}
            />
            <defs>
              <linearGradient id="colorDeposit" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#8884d8" stopOpacity={0.1}/>
              </linearGradient>
            </defs>
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});

// Компонент для результатов Монте-Карло
const MonteCarloResults = memo(({ mcResults, formatCurrency, formatYAxis, initialDeposit }) => {
  if (!mcResults) return null;

  const { percentiles, avgFinalDeposit } = mcResults;

  // Данные для графика персентилей
  const percentileChartData = [
    { name: 'Худший', value: percentiles.worst.finalDeposit },
    { name: '10%', value: percentiles.p10.finalDeposit },
    { name: '25%', value: percentiles.p25.finalDeposit },
    { name: 'Медиана', value: percentiles.p50.finalDeposit },
    { name: '75%', value: percentiles.p75.finalDeposit },
    { name: '90%', value: percentiles.p90.finalDeposit },
    { name: 'Лучший', value: percentiles.best.finalDeposit }
  ];

  // Данные для графика-веера (выбираем репрезентативные итерации)
  const fanChartData = [
    percentiles.p10,
    percentiles.p25,
    percentiles.p50,
    percentiles.p75,
    percentiles.p90
  ].map(percentile => percentile.monthlyResults);

  return (
    <div className="monte-carlo-results">
      <h3 className="section-title">Результаты Монте-Карло симуляции</h3>

      <div className="stats-grid">
        <div className="stat-card">
          <h3 className="stat-title">Распределение конечных результатов</h3>
          <div className="chart-body">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={percentileChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis tickFormatter={formatYAxis} />
                <Tooltip formatter={(value) => [formatCurrency(value), 'Депозит']} />
                <Bar dataKey="value" name="Финальный депозит" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="stat-card">
          <h3 className="stat-title">Вероятностные показатели</h3>
          <div className="stat-content">
            <div className="stat-item">
              <span>Среднее значение:</span>
              <span className="item-value">{formatCurrency(avgFinalDeposit)}</span>
            </div>
            <div className="stat-item">
              <span>Медиана:</span>
              <span className="item-value">{formatCurrency(percentiles.p50.finalDeposit)}</span>
            </div>
            <div className="stat-item">
              <span>90% вероятность ≥</span>
              <span className="item-value">{formatCurrency(percentiles.p10.finalDeposit)}</span>
            </div>
            <div className="stat-item">
              <span>Средняя ROI:</span>
              <span className="item-value">{percentiles.p50.roi.toFixed(1)}%</span>
            </div>
            <div className="stat-item">
              <span>Шанс удвоения:</span>
              <span className="item-value">
                {(mcResults.allResults.filter(r => r.finalDeposit >= initialDeposit * 2).length / mcResults.iterations * 100).toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="chart-container">
        <h3 className="chart-title">Веер вероятностных сценариев</h3>
        <div className="chart-body">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" type="number" domain={[1, fanChartData[0].length]} label={{ value: 'Месяц', position: 'insideBottomRight', offset: -10 }} />
              <YAxis tickFormatter={formatYAxis} />
              <Tooltip formatter={(value) => [formatCurrency(value), 'Депозит']} />
              <Legend />

              {/* 10-й процентиль */}
              <Line
                data={fanChartData[0]}
                type="monotone"
                dataKey="deposit"
                name="10% сценарий"
                stroke="#ff0000"
                dot={false}
                strokeWidth={1}
              />

              {/* 25-й процентиль */}
              <Line
                data={fanChartData[1]}
                type="monotone"
                dataKey="deposit"
                name="25% сценарий"
                stroke="#ff8042"
                dot={false}
                strokeWidth={1.5}
              />

              {/* Медиана */}
              <Line
                data={fanChartData[2]}
                type="monotone"
                dataKey="deposit"
                name="Медианный сценарий"
                stroke="#8884d8"
                dot={false}
                strokeWidth={2}
              />

              {/* 75-й процентиль */}
              <Line
                data={fanChartData[3]}
                type="monotone"
                dataKey="deposit"
                name="75% сценарий"
                stroke="#82ca9d"
                dot={false}
                strokeWidth={1.5}
              />

              {/* 90-й процентиль */}
              <Line
                data={fanChartData[4]}
                type="monotone"
                dataKey="deposit"
                name="90% сценарий"
                stroke="#00c49f"
                dot={false}
                strokeWidth={1}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
});

// Основной компонент приложения
const App = () => {
  // Состояния калькулятора
  const [initialDeposit, setInitialDeposit] = useState(400);
  const [targetDeposit, setTargetDeposit] = useState(100000);
  const [initialRiskPercent, setInitialRiskPercent] = useState(10);
  const [activeTab, setActiveTab] = useState('calculator');
  const [scenarioType, setScenarioType] = useState('realistic');
  const [monthlyDeposit, setMonthlyDeposit] = useState(0); // Новое состояние для ежемесячного пополнения

  // Состояния для управления тикерами
  const [pairsExpanded, setPairsExpanded] = useState(false); // Список пар свернут по умолчанию
  const [newPair, setNewPair] = useState({
    pair: '',
    ev: 0,
    winrate: 40,
    rr: 2,
    monthlyTrades: 60,
    color: '#' + Math.floor(Math.random()*16777215).toString(16) // Случайный цвет
  });

  // Состояния торговых пар
  const [tradingPairs, setTradingPairs] = useState([
    { pair: 'XAIUSDT', active: true, ev: 0.575, winrate: 31.5, rr: 4, allocationPercent: 31.3, monthlyTrades: 42, color: '#FF8042' },
    { pair: 'PEOPLEUSDT', active: true, ev: 0.528, winrate: 38.2, rr: 3, allocationPercent: 28.8, monthlyTrades: 51, color: '#00C49F' },
    { pair: 'SPXUSDT', active: true, ev: 0.401, winrate: 46.7, rr: 2, allocationPercent: 21.9, monthlyTrades: 61, color: '#0088FE' },
    { pair: 'AI16ZUSDT', active: true, ev: 0.29, winrate: 43, rr: 2, allocationPercent: 15.8, monthlyTrades: 61, color: '#FFBB28' },
    { pair: 'ATOMUSDT', active: true, ev: 0.041, winrate: 69.4, rr: 0.5, allocationPercent: 2.2, monthlyTrades: 242, color: '#FF0000' }
  ]);

  // Состояния для Монте-Карло симуляции
  const [monteCarloResults, setMonteCarloResults] = useState(null);
  const [showMonteCarlo, setShowMonteCarlo] = useState(false);

  // Результаты расчетов
  const [projectionResults, setProjectionResults] = useState(null);
  const [growthChartData, setGrowthChartData] = useState([]);
  const [pairPerformanceData, setPairPerformanceData] = useState([]);
  const [milestones, setMilestones] = useState([]);

  // Функция расчета распределения риска
  const calculateRiskAllocation = (deposit, pairsState) => {
    const activePairs = pairsState.filter(pair => pair.active);
    if (activePairs.length === 0) return [];

    const riskPercent = calculateRiskPercent(deposit);
    const totalRiskAmount = (deposit * riskPercent) / 100;

    // Рассчитаем общее EV для активных пар
    const totalEV = activePairs.reduce((sum, pair) => sum + pair.ev, 0);

    // Распределим риск пропорционально EV
    return pairsState.map(pair => {
      if (!pair.active) return { ...pair, riskAmount: 0 };

      const allocationPercent = (pair.ev / totalEV) * 100;
      const riskAmount = (allocationPercent / 100) * totalRiskAmount;

      return {
        ...pair,
        allocationPercent: parseFloat(allocationPercent.toFixed(1)),
        riskAmount: parseFloat(riskAmount.toFixed(2))
      };
    });
  };

  // Расчет ожидаемой прибыли для одной пары
  const calculatePairProfit = (pair, deposit, scenarioMultiplier = 1) => {
    if (!pair.active || pair.riskAmount <= 0) return { ...pair, profit: 0, trades: 0 };

    const winTradesPercent = pair.winrate / 100 * scenarioMultiplier;
    const lossTradesPercent = 1 - winTradesPercent;

    const monthlyTrades = pair.monthlyTrades;
    const winTrades = Math.round(monthlyTrades * winTradesPercent);
    const lossTrades = monthlyTrades - winTrades;

    const profitPerWin = pair.riskAmount * pair.rr;
    const lossPerLoss = pair.riskAmount;

    const grossProfit = winTrades * profitPerWin;
    const grossLoss = lossTrades * lossPerLoss;
    const netProfit = grossProfit - grossLoss;

    return {
      ...pair,
      winTrades,
      lossTrades,
      trades: monthlyTrades,
      grossProfit: parseFloat(grossProfit.toFixed(2)),
      grossLoss: parseFloat(grossLoss.toFixed(2)),
      profit: parseFloat(netProfit.toFixed(2))
    };
  };

  // Генерация данных проекции по месяцам с учетом новых функций
  const generateProjection = (startDeposit, target, pairsState, monthsToProject = 24) => {
    let currentDeposit = startDeposit;
    let months = 0;
    let projection = [];
    let pairResults = pairsState.map(pair => ({
      ...pair,
      totalProfit: 0,
      totalTrades: 0,
      contributionPercent: 0
    }));

    // Определяем мультипликатор для сценария
    let scenarioMultiplier = 1;
    if (scenarioType === 'optimistic') scenarioMultiplier = 1.2;
    if (scenarioType === 'pessimistic') scenarioMultiplier = 0.8;

    // Создаем промежуточные цели
    const milestoneTargets = [1000, 5000, 10000, 25000, 50000, 75000, 100000].filter(t => t > startDeposit && t <= target);
    let milestoneResults = [];

    // Переменные для отслеживания просадки
    let peakValue = startDeposit;
    let maxDrawdown = 0;
    let currentDrawdownPercent = 0;

    while (currentDeposit < target && months < monthsToProject) {
      // Добавляем ежемесячное пополнение депозита (если есть)
      if (monthlyDeposit > 0) {
        currentDeposit += monthlyDeposit;
      }

      const allocatedPairs = calculateRiskAllocation(currentDeposit, pairsState);

      // Рассчитываем прибыль за месяц
      let monthProfit = 0;
      let pairsWithProfit = allocatedPairs.map(pair => {
        const result = calculatePairProfit(pair, currentDeposit, scenarioMultiplier);
        monthProfit += result.profit;

        // Обновляем общие результаты для пары
        const pairIndex = pairResults.findIndex(p => p.pair === pair.pair);
        if (pairIndex >= 0) {
          pairResults[pairIndex].totalProfit += result.profit;
          pairResults[pairIndex].totalTrades += result.trades;
        }

        return result;
      });

      // Улучшенный расчет комиссий и проскальзывания
      const totalTrades = pairsWithProfit.reduce((sum, pair) => sum + pair.trades, 0);
      const averageTradeSize = currentDeposit * calculateRiskPercent(currentDeposit) / 100 / pairsState.filter(p => p.active).length;
      const avgRR = pairsState.reduce((avg, pair) => avg + (pair.active ? pair.rr : 0), 0) / pairsState.filter(p => p.active).length;

      const feesAndSlippage = calculateFeesAndSlippage(totalTrades, averageTradeSize, avgRR);

      // Чистая прибыль с учетом комиссий
      const netMonthProfit = monthProfit - feesAndSlippage;
      currentDeposit += netMonthProfit;

      // Отслеживание просадки
      if (currentDeposit > peakValue) {
        peakValue = currentDeposit;
        currentDrawdownPercent = 0;
      } else {
        currentDrawdownPercent = (peakValue - currentDeposit) / peakValue * 100;
        if (currentDrawdownPercent > maxDrawdown) {
          maxDrawdown = currentDrawdownPercent;
        }
      }

      // Добавляем месяц в проекцию
      projection.push({
        month: months + 1,
        deposit: parseFloat(currentDeposit.toFixed(2)),
        profit: parseFloat(netMonthProfit.toFixed(2)),
        riskPercent: calculateRiskPercent(currentDeposit),
        riskAmount: parseFloat((currentDeposit * calculateRiskPercent(currentDeposit) / 100).toFixed(2)),
        trades: totalTrades,
        fees: parseFloat(feesAndSlippage.toFixed(2)),
        drawdown: parseFloat(currentDrawdownPercent.toFixed(2))
      });

      // Проверяем достижение промежуточных целей
      for (let i = 0; i < milestoneTargets.length; i++) {
        if (milestoneResults.findIndex(m => m.target === milestoneTargets[i]) === -1 && currentDeposit >= milestoneTargets[i]) {
          milestoneResults.push({
            target: milestoneTargets[i],
            months: months + 1,
            days: Math.ceil((months + 1) * 30.5),
            date: new Date(Date.now() + (months + 1) * 30.5 * 24 * 60 * 60 * 1000).toLocaleDateString()
          });
        }
      }

      months++;
    }

    // Рассчитываем процент вклада каждой пары
    const totalProfit = pairResults.reduce((sum, pair) => sum + pair.totalProfit, 0);
    pairResults = pairResults.map(pair => ({
      ...pair,
      contributionPercent: totalProfit > 0 ? parseFloat(((pair.totalProfit / totalProfit) * 100).toFixed(1)) : 0
    }));

    // Добавляем финальный результат, если еще не достигнут
    if (currentDeposit < target && months === monthsToProject) {
      milestoneResults.push({
        target: parseFloat(currentDeposit.toFixed(2)),
        months: months,
        days: Math.ceil(months * 30.5),
        date: new Date(Date.now() + months * 30.5 * 24 * 60 * 60 * 1000).toLocaleDateString(),
        note: 'Конец прогноза'
      });
    }

    return {
      finalDeposit: currentDeposit,
      months: months,
      days: Math.ceil(months * 30.5),
      monthlyData: projection,
      pairResults: pairResults,
      milestones: milestoneResults,
      targetReached: currentDeposit >= target,
      targetDate: currentDeposit >= target
        ? new Date(Date.now() + months * 30.5 * 24 * 60 * 60 * 1000).toLocaleDateString()
        : 'Не достигнуто за ' + monthsToProject + ' месяцев',
      maxDrawdown: parseFloat(maxDrawdown.toFixed(2))
    };
  };

  // Рассчитываем все при изменении параметров
  useEffect(() => {
    if (initialDeposit > 0 && targetDeposit > initialDeposit) {
      const results = generateProjection(initialDeposit, targetDeposit, tradingPairs);
      setProjectionResults(results);
      setGrowthChartData(results.monthlyData);
      setPairPerformanceData(results.pairResults);
      setMilestones(results.milestones);
    }
  }, [initialDeposit, targetDeposit, initialRiskPercent, tradingPairs, scenarioType, monthlyDeposit]);

  // Переключение активности пары
  const togglePairActive = (pairName) => {
    const updatedPairs = tradingPairs.map(pair =>
      pair.pair === pairName ? { ...pair, active: !pair.active } : pair
    );
    setTradingPairs(updatedPairs);
  };

  // Функции для управления торговыми парами
  const addNewPair = () => {
    if (!newPair.pair.trim()) {
      alert('Пожалуйста, введите название пары');
      return;
    }

    // Проверка на дубликаты
    if (tradingPairs.some(p => p.pair === newPair.pair)) {
      alert('Пара с таким названием уже существует');
      return;
    }

    // Расчет EV если не указан
    let ev = newPair.ev;
    if (ev === 0) {
      ev = (newPair.winrate / 100 * newPair.rr) - (1 - newPair.winrate / 100);
    }

    const newPairComplete = {
      ...newPair,
      active: true,
      ev: parseFloat(ev.toFixed(3)),
      allocationPercent: 0
    };

    setTradingPairs([...tradingPairs, newPairComplete]);

    // Сброс формы
    setNewPair({
      pair: '',
      ev: 0,
      winrate: 40,
      rr: 2,
      monthlyTrades: 60,
      color: '#' + Math.floor(Math.random()*16777215).toString(16)
    });
  };

  const removePair = (pairName) => {
    if (tradingPairs.length <= 1) {
      alert('Должна остаться хотя бы одна торговая пара');
      return;
    }

    const updatedPairs = tradingPairs.filter(pair => pair.pair !== pairName);
    setTradingPairs(updatedPairs);
  };

  // Форма для добавления новой пары
  const renderAddPairForm = () => (
    <div className="add-pair-form">
      <h4 className="form-section-title">Добавить новую торговую пару</h4>

      <div className="form-labels-row">
        <div className="form-label-item">Название пары</div>
        <div className="form-label-item">Процент выигрышных сделок (%)</div>
        <div className="form-label-item">Соотношение риск/прибыль</div>
        <div className="form-label-item">Сделок в месяц</div>
        <div className="form-label-item">Цвет</div>
      </div>

      <div className="form-inputs-row">
        <div className="form-input-item">
          <input
            type="text"
            value={newPair.pair}
            onChange={(e) => setNewPair({...newPair, pair: e.target.value.toUpperCase()})}
            placeholder="Например: BTCUSDT"
            className="input"
          />
        </div>
        <div className="form-input-item">
          <input
            type="number"
            min="1"
            max="99"
            value={newPair.winrate}
            onChange={(e) => setNewPair({...newPair, winrate: Number(e.target.value)})}
            className="input"
          />
        </div>
        <div className="form-input-item">
          <input
            type="number"
            min="0.1"
            step="0.1"
            value={newPair.rr}
            onChange={(e) => setNewPair({...newPair, rr: Number(e.target.value)})}
            className="input"
          />
        </div>
        <div className="form-input-item">
          <input
            type="number"
            min="1"
            max="1000"
            value={newPair.monthlyTrades}
            onChange={(e) => setNewPair({...newPair, monthlyTrades: Number(e.target.value)})}
            className="input"
          />
        </div>
        <div className="form-input-item">
          <input
            type="color"
            value={newPair.color}
            onChange={(e) => setNewPair({...newPair, color: e.target.value})}
            className="color-input"
          />
        </div>
      </div>

      <div className="form-button-container">
        <button onClick={addNewPair} className="button button-primary">Добавить пару</button>
      </div>
    </div>
  );

  // Функции для импорта/экспорта настроек
  const exportSettings = () => {
    const settings = {
      initialDeposit,
      targetDeposit,
      initialRiskPercent,
      tradingPairs,
      scenarioType,
      monthlyDeposit
    };

    const dataStr = JSON.stringify(settings);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);

    const exportFileDefaultName = 'trading-calculator-settings.json';

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const importSettings = (event) => {
    if (!event.target.files || !event.target.files[0]) return;

    const fileReader = new FileReader();
    fileReader.readAsText(event.target.files[0], "UTF-8");
    fileReader.onload = e => {
      try {
        const settings = JSON.parse(e.target.result);
        if (settings.initialDeposit) setInitialDeposit(settings.initialDeposit);
        if (settings.targetDeposit) setTargetDeposit(settings.targetDeposit);
        if (settings.initialRiskPercent) setInitialRiskPercent(settings.initialRiskPercent);
        if (settings.tradingPairs) setTradingPairs(settings.tradingPairs);
        if (settings.scenarioType) setScenarioType(settings.scenarioType);
        if (settings.monthlyDeposit) setMonthlyDeposit(settings.monthlyDeposit);

        // Показать сообщение об успешном импорте
        alert("Настройки успешно импортированы");
      } catch (error) {
        console.error("Ошибка при импорте настроек:", error);
        alert("Неверный формат файла настроек");
      }
    };

    // Сбросить значение input для возможности повторного импорта того же файла
    event.target.value = '';
  };

  // Форматирование для чисел
  const formatNumber = (num) => {
    return new Intl.NumberFormat('ru-RU').format(num);
  };

  const formatCurrency = (num) => {
    return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num);
  };

  // Форматирование для осей графиков
  const formatYAxis = (value) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
    return `$${value}`;
  };

  // Выбор цвета в зависимости от уровня риска
  const getRiskColor = (riskPercent) => {
    if (riskPercent <= 3) return 'text-success';
    if (riskPercent <= 5) return 'text-warning';
    if (riskPercent <= 7) return 'text-orange';
    return 'text-danger';
  };

  // Рендер таблицы с ключевыми этапами
  const renderMilestonesTable = () => {
    if (!milestones || milestones.length === 0) return <div className="text-center">Недостаточно данных для отображения этапов</div>;

    return (
      <div className="table-container">
        <table className="table milestone-table">
          <thead>
            <tr>
              <th>Целевой депозит</th>
              <th>Месяцев</th>
              <th>Дней</th>
              <th>Ожидаемая дата</th>
              <th>Примечание</th>
            </tr>
          </thead>
          <tbody>
            {milestones.map((milestone, index) => (
              <tr key={index} className={index % 2 === 0 ? "milestone-even" : "milestone-odd"}>
                <td className="font-bold">{formatCurrency(milestone.target)}</td>
                <td>{milestone.months}</td>
                <td className="font-bold">{milestone.days}</td>
                <td className="milestone-date">{milestone.date}</td>
                <td>{milestone.note || (milestone.target === targetDeposit ? 'Целевой депозит достигнут!' : '')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // Рендер дашборда с основными показателями
  const renderDashboard = () => {
    if (!projectionResults) return null;

    return (
      <div className="dashboard-grid">
        <div className="dashboard-card blue-gradient">
          <h3>Прогноз достижения цели</h3>
          <div className="value">
            {projectionResults.targetReached ? `${projectionResults.months} месяцев` : 'Не достигается'}
          </div>
          <div className="subtext">
            {projectionResults.targetReached
              ? `Приблизительно ${projectionResults.days} дней`
              : `За ${projectionResults.months} месяцев, достигнут: ${formatCurrency(projectionResults.finalDeposit)}`}
          </div>
          <div className="small-text">
            Ожидаемая дата: {projectionResults.targetDate}
          </div>
        </div>

        <div className="dashboard-card green-gradient">
          <h3>Средний месячный рост</h3>
          <div className="value">
            {projectionResults.monthlyData.length > 0
              ? `${((Math.pow(projectionResults.finalDeposit / initialDeposit, 1/projectionResults.months) - 1) * 100).toFixed(1)}%`
              : '0%'}
          </div>
          <div className="subtext">
            Первый месяц: +{((projectionResults.monthlyData[0]?.deposit / initialDeposit - 1) * 100).toFixed(1)}%
          </div>
          <div className="small-text">
            Среднемесячная прибыль: ~{formatCurrency(projectionResults.monthlyData.reduce((sum, month) => sum + month.profit, 0) / projectionResults.monthlyData.length)}
          </div>
        </div>

        <div className="dashboard-card purple-gradient">
          <h3>Статистика сделок</h3>
          <div className="value">
            {formatNumber(projectionResults.monthlyData.reduce((sum, month) => sum + month.trades, 0))}
          </div>
          <div className="subtext">
            Средний размер позиции: ~{formatCurrency(projectionResults.monthlyData[Math.floor(projectionResults.monthlyData.length / 2)]?.riskAmount || 0)}
          </div>
          <div className="small-text">
            Макс. просадка: {projectionResults.maxDrawdown}%
          </div>
        </div>
      </div>
    );
  };

  // Рендер графика вклада каждой пары
  const renderPairContributionChart = () => {
    if (!pairPerformanceData || pairPerformanceData.length === 0) return null;

    // Отфильтруем только активные пары
    const activePairsData = pairPerformanceData.filter(pair => pair.active && pair.totalProfit > 0);

    return (
      <div className="charts-grid">
        <div className="card chart-container">
          <h3 className="chart-title">Вклад каждой пары в прибыль</h3>
          <div className="chart-body">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={activePairsData}
                  cx="50%"
                  cy="50%"
                  labelLine={true}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="totalProfit"
                  nameKey="pair"
                >
                  {activePairsData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [formatCurrency(value), 'Прибыль']} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card chart-container">
          <h3 className="chart-title">Сравнение эффективности пар</h3>
          <div className="chart-body">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart
                data={activePairsData}
                margin={{ top: 20, right: 30, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="pair" />
                <YAxis yAxisId="left" orientation="left" stroke="#8884d8" />
                <YAxis yAxisId="right" orientation="right" stroke="#82ca9d" />
                <Tooltip formatter={(value, name) => {
                  if (name === 'totalProfit') return [formatCurrency(value), 'Прибыль'];
                  if (name === 'totalTrades') return [formatNumber(value), 'Сделок'];
                  return [value, name];
                }} />
                <Legend />
                <Bar yAxisId="left" dataKey="totalProfit" name="Прибыль" fill="#8884d8" />
                <Bar yAxisId="right" dataKey="totalTrades" name="Количество сделок" fill="#82ca9d" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="container">
      <div className="header">
        <h2 className="title">Расширенная панель анализа торговой стратегии</h2>
        <p className="subtitle">Прогнозируйте рост депозита, анализируйте риски и оптимизируйте распределение средств</p>
      </div>

      <div className="card">
        <div className="form-grid">
          <div className="form-group">
            <label className="label">Начальный депозит ($)</label>
            <input
              type="number"
              min="100"
              value={initialDeposit}
              onChange={(e) => setInitialDeposit(Number(e.target.value))}
              className="input"
            />
          </div>

          <div className="form-group">
            <label className="label">Целевой депозит ($)</label>
            <input
              type="number"
              min={initialDeposit + 100}
              value={targetDeposit}
              onChange={(e) => setTargetDeposit(Number(e.target.value))}
              className="input"
            />
          </div>

          <div className="form-group">
            <label className="label">Начальный риск (%)</label>
            <input
              type="number"
              min="1"
              max="20"
              step="0.1"
              value={initialRiskPercent}
              onChange={(e) => setInitialRiskPercent(Number(e.target.value))}
              className="input"
            />
          </div>

          <div className="form-group">
            <label className="label">Ежемесячное пополнение ($)</label>
            <input
              type="number"
              min="0"
              step="10"
              value={monthlyDeposit}
              onChange={(e) => setMonthlyDeposit(Number(e.target.value))}
              className="input"
            />
          </div>
        </div>

        <div className="form-group import-export">
          <div className="import-export-buttons">
            <button onClick={exportSettings} className="button button-secondary">
              <span className="button-icon">💾</span> Экспорт настроек
            </button>
            <label className="file-input-label">
              <span className="button-icon">📂</span> Импорт настроек
              <input type="file" accept=".json" onChange={importSettings} className="file-input" />
            </label>
          </div>
        </div>

        <div className="form-group">
          <label className="label">Сценарий рынка</label>
          <div className="scenario-options">
            <div
              onClick={() => setScenarioType('pessimistic')}
              className={`scenario-option ${scenarioType === 'pessimistic' ? 'active' : ''}`}
            >
              <div className="option-title">Пессимистичный</div>
              <div className="option-desc">-20% к винрейту</div>
            </div>
            <div
              onClick={() => setScenarioType('realistic')}
              className={`scenario-option ${scenarioType === 'realistic' ? 'active' : ''}`}
            >
              <div className="option-title">Реалистичный</div>
              <div className="option-desc">Стандартный</div>
            </div>
            <div
              onClick={() => setScenarioType('optimistic')}
              className={`scenario-option ${scenarioType === 'optimistic' ? 'active' : ''}`}
            >
              <div className="option-title">Оптимистичный</div>
              <div className="option-desc">+20% к винрейту</div>
            </div>
          </div>
        </div>

        {/* Торговые пары со свертыванием/развертыванием */}
        <div className="form-group">
          <div className="section-header" onClick={() => setPairsExpanded(!pairsExpanded)}>
            <label className="label">Торговые пары</label>
            <span className="expand-icon">{pairsExpanded ? '▼' : '▶'}</span>
          </div>

          {pairsExpanded && (
            <>
              <div className="pairs-grid">
                {tradingPairs.map((pair, index) => (
                  <div
                    key={index}
                    className={`pair-card ${pair.active ? 'active' : ''}`}
                    style={{ borderLeftColor: pair.color, borderLeftWidth: '5px' }}
                  >
                    <div className="pair-header">
                      <span className="pair-name">{pair.pair}</span>
                      <div className="pair-actions">
                        <span
                          className={`pair-status ${pair.active ? 'active-status' : 'inactive-status'}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePairActive(pair.pair);
                          }}
                        >
                          {pair.active ? 'Активна' : 'Отключена'}
                        </span>
                        <button
                          className="remove-button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removePair(pair.pair);
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    <div className="pair-stats" onClick={() => togglePairActive(pair.pair)}>
                      <div>WR: <span className="stat-value">{pair.winrate}%</span></div>
                      <div>RR: <span className="stat-value">{pair.rr}</span></div>
                      <div>EV: <span className="stat-value">{pair.ev.toFixed(3)}</span></div>
                      <div>Доля: <span className="stat-value">{pair.allocationPercent}%</span></div>
                    </div>
                  </div>
                ))}
              </div>

              {renderAddPairForm()}
            </>
          )}
        </div>

        <div className="form-group monte-carlo-section">
          <button
            className="button button-primary monte-carlo-button"
            onClick={() => {
              const results = runMonteCarloSimulation(initialDeposit, tradingPairs, 24);
              setMonteCarloResults(results);
              setShowMonteCarlo(true);
            }}
          >
            <span className="button-icon">📊</span> Запустить Монте-Карло симуляцию
          </button>
        </div>
      </div>

      {projectionResults && (
        <>
          {renderDashboard()}

          <div className="milestone-section">
            <div className="milestone-header">
              Ключевые этапы достижения цели
            </div>
            {renderMilestonesTable()}
          </div>

          <div className="chart-section">
            <GrowthChart
              growthChartData={growthChartData}
              formatYAxis={formatYAxis}
              formatCurrency={formatCurrency}
              targetDeposit={targetDeposit}
            />
          </div>

          {renderPairContributionChart()}

          {showMonteCarlo && monteCarloResults && (
            <MonteCarloResults
              mcResults={monteCarloResults}
              formatCurrency={formatCurrency}
              formatYAxis={formatYAxis}
              initialDeposit={initialDeposit}
            />
          )}

          <div className="card tabs-container">
            <div className="tabs">
              <div
                className={`tab ${activeTab === 'calculator' ? 'active' : ''}`}
                onClick={() => setActiveTab('calculator')}
              >
                Калькулятор
              </div>
              <div
                className={`tab ${activeTab === 'projection' ? 'active' : ''}`}
                onClick={() => setActiveTab('projection')}
              >
                Детальная проекция
              </div>
            </div>

            <div className="tab-content">
              {activeTab === 'calculator' ? (
                <div>
                  <div className="info-box">
                    <h3 className="info-title">Ключевые выводы и рекомендации</h3>
                    <ul className="info-list">
                      <li><span className="highlight">Оптимальное распределение риска:</span> Сконцентрируйтесь на парах с высоким мат. ожиданием (XAIUSDT, PEOPLEUSDT)</li>
                      <li><span className="highlight">Ступенчатое снижение риска:</span> По мере роста капитала снижайте процент риска согласно таблице</li>
                      <li><span className="highlight">Контроль просадки:</span> При серии из 3+ убыточных сделок снизьте размер позиции на 30-50%</li>
                      <li><span className="highlight">Реинвестирование:</span> До достижения $10,000 реинвестируйте 100% прибыли</li>
                      <li><span className="highlight">Мониторинг эффективности:</span> Еженедельно анализируйте эффективность каждой пары и корректируйте стратегию</li>
                    </ul>
                  </div>

                  <div className="stats-grid">
                    <div className="stat-card">
                      <h3 className="stat-title">Распределение риска</h3>
                      <div className="stat-content">
                        {tradingPairs.filter(p => p.active).map(pair => (
                          <div key={pair.pair} className="stat-item">
                            <div className="item-name">
                              <span className="color-indicator" style={{backgroundColor: pair.color}}></span>
                              <span>{pair.pair}</span>
                            </div>
                            <span className="item-value">{pair.allocationPercent}%</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="stat-card">
                      <h3 className="stat-title">Месячный рост по сценариям</h3>
                      <div className="stat-content">
                        <div className="stat-item">
                          <span>Пессимистичный:</span>
                          <span className="text-danger">+{((Math.pow(projectionResults.finalDeposit / initialDeposit, 1/projectionResults.months) - 1) * 100 * 0.8).toFixed(1)}%</span>
                        </div>
                        <div className="stat-item">
                          <span>Реалистичный:</span>
                          <span className="text-primary">+{((Math.pow(projectionResults.finalDeposit / initialDeposit, 1/projectionResults.months) - 1) * 100).toFixed(1)}%</span>
                        </div>
                        <div className="stat-item">
                          <span>Оптимистичный:</span>
                          <span className="text-success">+{((Math.pow(projectionResults.finalDeposit / initialDeposit, 1/projectionResults.months) - 1) * 100 * 1.2).toFixed(1)}%</span>
                        </div>
                      </div>
                    </div>

                    <div className="stat-card">
                      <h3 className="stat-title">Статистика проекции</h3>
                      <div className="stat-content">
                        <div className="stat-item">
                          <span>Общее количество сделок:</span>
                          <span className="item-value">{formatNumber(projectionResults.monthlyData.reduce((sum, month) => sum + month.trades, 0))}</span>
                        </div>
                        <div className="stat-item">
                          <span>Средний месячный доход:</span>
                          <span className="item-value">{formatCurrency(projectionResults.monthlyData.reduce((sum, month) => sum + month.profit, 0) / projectionResults.monthlyData.length)}</span>
                        </div>
                        <div className="stat-item">
                          <span>Максимальный риск:</span>
                          <span className="item-value">{formatCurrency(Math.max(...projectionResults.monthlyData.map(m => m.riskAmount)))}</span>
                        </div>
                        <div className="stat-item">
                          <span>Максимальная просадка:</span>
                          <span className="item-value text-danger">{projectionResults.maxDrawdown}%</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="warning-box">
                    <h3 className="warning-title">Важные замечания</h3>
                    <div className="warning-content">
                      <ul className="warning-list">
                        <li>Расчеты основаны на исторических данных и не гарантируют будущих результатов</li>
                        <li>Учтены примерные комиссии (0.5% от торгового оборота)</li>
                        <li>При достижении стоп-лоссов необходимо временно снизить размер позиции</li>
                        <li>Рыночные условия могут меняться, что влияет на эффективность стратегии</li>
                      </ul>
                      <ul className="warning-list">
                        <li>Риск рассчитан с использованием ступенчатой системы снижения</li>
                        <li>Стратегия может требовать активной корректировки параметров</li>
                        <li>Убедитесь в правильности настройки торгового бота и мониторинга сделок</li>
                        <li>Не забывайте о психологических аспектах управления капиталом</li>
                      </ul>
                    </div>
                  </div>
                </div>
              ) : (
                <ProjectionTable
                  projectionResults={projectionResults}
                  tradingPairs={tradingPairs}
                  formatCurrency={formatCurrency}
                  formatNumber={formatNumber}
                  getRiskColor={getRiskColor}
                  calculateRiskAllocation={calculateRiskAllocation}
                />
              )}
            </div>
          </div>
        </>
      )}

      {/* Стили для нового функционала */}
      <style jsx="true">{`
        /* Стили для сворачивания/разворачивания */
        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
          padding: 0.5rem 0;
          border-bottom: 1px solid #eee;
          margin-bottom: 1rem;
        }

        .expand-icon {
          font-size: 1.2rem;
          transition: transform 0.3s ease;
        }

        /* Стили для карточек пар */
        .pair-actions {
          display: flex;
          align-items: center;
        }

        .remove-button {
          background: none;
          border: none;
          color: #ff4d4f;
          cursor: pointer;
          font-size: 1rem;
          margin-left: 0.5rem;
          opacity: 0.7;
          transition: opacity 0.2s ease;
        }

        .pair-card:hover .remove-button {
          opacity: 1;
        }

        /* Стили для формы добавления новой пары */
        .add-pair-form {
          margin-top: 1rem;
          padding: 1rem;
          background-color: rgba(0, 0, 0, 0.03);
          border-radius: 0.5rem;
        }

        .form-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 0.75rem;
        }

        .color-input {
          width: 100%;
          height: 38px;
          padding: 0.25rem;
          border: 1px solid #d9d9d9;
          border-radius: 4px;
          cursor: pointer;
        }

        .button-primary {
          background-color: #1890ff;
          color: white;
          padding: 0.5rem 1rem;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          margin-top: 1rem;
          font-weight: 500;
        }

        .button-primary:hover {
          background-color: #40a9ff;
        }

        .button-secondary {
          background-color: #6c757d;
          color: white;
          padding: 0.5rem 1rem;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 500;
        }

        .import-export {
          display: flex;
          gap: 1rem;
          margin-top: 1rem;
        }

        .file-input-label {
          display: inline-block;
          background-color: #28a745;
          color: white;
          padding: 0.5rem 1rem;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 500;
        }

        .file-input {
          display: none;
        }

        .monte-carlo-section {
          margin-top: 1rem;
          border-top: 1px solid #eee;
          padding-top: 1rem;
        }

        /* Стили для результатов Монте-Карло */
        .monte-carlo-results {
          margin-top: 2rem;
          padding: 1rem;
          background-color: #f9f9f9;
          border-radius: 0.5rem;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .section-title {
          font-size: 1.5rem;
          margin-bottom: 1rem;
          color: #333;
          text-align: center;
        }
      `}</style>
    </div>
  );
};

export default App;