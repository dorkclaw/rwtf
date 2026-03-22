/**
 * Prediction Method Testing Framework
 * 
 * Tests forecasting methods against historical data to determine which method
 * performs best at different times of day / different amounts of known data.
 */

import { makeClosestLine, makeAverageLine, makeDayOfWeekLine, GymDataWeek, GymDataPiece } from "./gym_math.js";

// This would be imported from gym_math.js in a real setup
// For now, we'll define the methods here for standalone testing

interface GymDataPiece {
    auslastung: number;
    created_at: string;
}

interface GymDataWeek {
    data: GymDataPiece[];
    weight: number;
}

interface PredictionResult {
    method: string;
    predicted: number;
    actual: number;
    error: number;
    absoluteError: number;
    squaredError: number;
}

interface TimeHorizonResult {
    horizonHours: number;
    methodResults: {
        [method: string]: {
            mae: number;      // Mean Absolute Error
            mape: number;     // Mean Absolute Percentage Error (%)
            rmse: number;    // Root Mean Square Error
            count: number;    // Number of predictions made
        };
    };
    bestMethod: string;
}

interface DayResult {
    date: string;
    actualData: GymDataPiece[];
    predictions: {
        [method: string]: GymDataPiece[];
    };
}

// Simulated data for testing (in reality, this would come from the database)
function getHistoricalData(days: number = 30): GymDataWeek[] {
    // This would query the actual database
    // For now, generate realistic synthetic data
    const weeks: GymDataWeek[] = [];
    const now = new Date();
    
    for (let w = 1; w <= 4; w++) {
        const weekData: GymDataPiece[] = [];
        const weekStart = new Date(now.getTime() - w * 7 * 24 * 60 * 60 * 1000);
        
        for (let h = 6; h <= 22; h += 0.25) { // Every 15 minutes, 6am to 10pm
            const time = new Date(weekStart);
            time.setHours(Math.floor(h), (h % 1) * 60, 0, 0);
            
            // Simulate realistic gym pattern:
            // - Low in early morning (6-8)
            // - Peak around lunch (12-13) and evening (17-19)
            // - Lower on weekends
            const dayOfWeek = time.getDay();
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            const weekendFactor = isWeekend ? 0.6 : 1.0;
            
            let baseUtil = 20; // Base 20%
            
            // Morning rush
            if (h >= 7 && h <= 9) baseUtil = 40 * weekendFactor;
            // Late morning dip
            else if (h >= 9 && h <= 11) baseUtil = 30 * weekendFactor;
            // Lunch rush
            else if (h >= 12 && h <= 14) baseUtil = 70 * weekendFactor;
            // Afternoon
            else if (h >= 14 && h <= 17) baseUtil = 45 * weekendFactor;
            // Evening peak
            else if (h >= 17 && h <= 20) baseUtil = 75 * weekendFactor;
            // Late evening
            else if (h >= 20 && h <= 22) baseUtil = 40 * weekendFactor;
            
            // Add some random noise
            const noise = (Math.random() - 0.5) * 20;
            const utilization = Math.max(0, Math.min(100, baseUtil + noise));
            
            weekData.push({
                auslastung: utilization,
                created_at: time.toISOString()
            });
        }
        
        weeks.push({ data: weekData, weight: 1 / w }); // Recent weeks weighted more
    }
    
    return weeks;
}

function makeAverageLine(gym_hist: GymDataWeek[], useMedian = false): GymDataPiece[] {
    // Simplified version for testing
    return gym_hist[0]?.data || [];
}

function makeClosestLine(gym_hist: GymDataWeek[], todayData: GymDataPiece[]): GymDataPiece[] {
    // Simplified version for testing
    return gym_hist[0]?.data || [];
}

function makeDayOfWeekLine(gym_hist: GymDataWeek[], dayOfWeek: number): GymDataPiece[] {
    // Simplified version for testing
    return gym_hist[0]?.data || [];
}

// Test a specific method against actual data
function testMethod(
    method: 'closest' | 'average' | 'median' | 'dayofweek',
    knownData: GymDataPiece[],
    actualData: GymDataPiece[],
    dayOfWeek: number
): PredictionResult[] {
    const results: PredictionResult[] = [];
    const weeks = getHistoricalData();
    
    // Create "today" week with only known data
    const todayWeek: GymDataWeek = { data: knownData, weight: 1 };
    
    // Get prediction based on method
    let predicted: GymDataPiece[] = [];
    switch (method) {
        case 'closest':
            predicted = makeClosestLine([todayWeek, ...weeks], knownData);
            break;
        case 'average':
            predicted = makeAverageLine([todayWeek, ...weeks]);
            break;
        case 'median':
            predicted = makeAverageLine([todayWeek, ...weeks], true);
            break;
        case 'dayofweek':
            predicted = makeDayOfWeekLine(weeks, dayOfWeek);
            break;
    }
    
    // Compare predictions with actual data
    for (const actual of actualData) {
        const actualTime = new Date(actual.created_at);
        const actualHour = actualTime.getHours() + actualTime.getMinutes() / 60;
        
        // Find closest prediction
        let closest = predicted[0];
        let minDiff = Infinity;
        for (const p of predicted) {
            const predTime = new Date(p.created_at);
            const predHour = predTime.getHours() + predTime.getMinutes() / 60;
            const diff = Math.abs(predHour - actualHour);
            if (diff < minDiff) {
                minDiff = diff;
                closest = p;
            }
        }
        
        if (closest) {
            const error = actual.auslastung - closest.auslastung;
            results.push({
                method,
                predicted: closest.auslastung,
                actual: actual.auslastung,
                error,
                absoluteError: Math.abs(error),
                squaredError: error * error
            });
        }
    }
    
    return results;
}

// Run tests for a specific time horizon
function testTimeHorizon(knownHours: number): TimeHorizonResult {
    const weeks = getHistoricalData();
    const methodResults: TimeHorizonResult['methodResults'] = {
        closest: { mae: 0, mape: 0, rmse: 0, count: 0 },
        average: { mae: 0, mape: 0, rmse: 0, count: 0 },
        median: { mae: 0, mape: 0, rmse: 0, count: 0 },
        dayofweek: { mae: 0, mape: 0, rmse: 0, count: 0 }
    };
    
    for (const week of weeks) {
        const knownData: GymDataPiece[] = [];
        const actualData: GymDataPiece[] = [];
        
        for (const point of week.data) {
            const time = new Date(point.created_at);
            const hour = time.getHours() + time.getMinutes() / 60;
            
            if (hour <= knownHours) {
                knownData.push(point);
            } else {
                actualData.push(point);
            }
        }
        
        if (knownData.length === 0 || actualData.length === 0) continue;
        
        const dayOfWeek = new Date(knownData[0].created_at).getDay();
        
        for (const method of ['closest', 'average', 'median', 'dayofweek'] as const) {
            const results = testMethod(method, knownData, actualData, dayOfWeek);
            
            for (const r of results) {
                methodResults[method].mae += r.absoluteError;
                methodResults[method].mape += r.actual > 5 ? (r.absoluteError / r.actual) * 100 : 0; // Skip near-zero actuals
                methodResults[method].rmse += r.squaredError;
                methodResults[method].count++;
            }
        }
    }
    
    // Calculate averages
    for (const method of Object.keys(methodResults) as (keyof typeof methodResults)[]) {
        const m = methodResults[method];
        if (m.count > 0) {
            m.mae /= m.count;
            m.mape /= m.count;
            m.rmse = Math.sqrt(m.rmse / m.count);
        }
    }
    
    // Find best method (lowest MAE)
    let bestMethod = 'closest';
    let bestMAE = Infinity;
    for (const method of Object.keys(methodResults) as (keyof typeof methodResults)[]) {
        if (methodResults[method].mae < bestMAE) {
            bestMAE = methodResults[method].mae;
            bestMethod = method;
        }
    }
    
    return { horizonHours: knownHours, methodResults, bestMethod };
}

// Run full test suite
function runPredictionTests() {
    console.log("=".repeat(60));
    console.log("RWTF Prediction Method Evaluation");
    console.log("=".repeat(60));
    console.log();
    
    const horizons = [2, 4, 6, 8, 10, 12]; // hours of known data
    
    for (const h of horizons) {
        console.log(`Testing with first ${h}h known...`);
    }
    
    console.log();
    console.log("Time Horizon Analysis:");
    console.log("-".repeat(60));
    console.log("| Hours | Closest MAE | Average MAE | Median MAE | DayOfWeek MAE | Best |");
    console.log("-".repeat(60));
    
    const results: TimeHorizonResult[] = [];
    for (const h of horizons) {
        const result = testTimeHorizon(h);
        results.push(result);
        
        const r = result.methodResults;
        console.log(
            `| ${h.toString().padEnd(5)} | ` +
            `${r.closest.mae.toFixed(2).padEnd(12)} | ` +
            `${r.average.mae.toFixed(2).padEnd(12)} | ` +
            `${r.median.mae.toFixed(2).padEnd(11)} | ` +
            `${r.dayofweek.mae.toFixed(2).padEnd(13)} | ` +
            `${result.bestMethod.padEnd(4)} |`
        );
    }
    
    console.log("-".repeat(60));
    console.log();
    console.log("Summary:");
    console.log("=".repeat(60));
    
    // Find which method wins most often
    const methodWins: { [k: string]: number } = {};
    for (const r of results) {
        methodWins[r.bestMethod] = (methodWins[r.bestMethod] || 0) + 1;
    }
    
    let overallBest = 'closest';
    let maxWins = 0;
    for (const [method, wins] of Object.entries(methodWins)) {
        console.log(`  ${method}: won ${wins}/${results.length} horizons`);
        if (wins > maxWins) {
            maxWins = wins;
            overallBest = method;
        }
    }
    
    console.log();
    console.log(`Overall recommendation: ${overallBest}`);
    console.log();
    
    // Specific insights
    console.log("Insights:");
    console.log("-".repeat(60));
    
    const earlyResult = results.find(r => r.horizonHours === 2);
    const lateResult = results.find(r => r.horizonHours === 8);
    
    if (earlyResult && lateResult) {
        console.log(`  With 2h known: ${earlyResult.bestMethod} works best (MAE: ${earlyResult.methodResults[earlyResult.bestMethod].mae.toFixed(2)}%)`);
        console.log(`  With 8h known: ${lateResult.bestMethod} works best (MAE: ${lateResult.methodResults[lateResult.bestMethod].mae.toFixed(2)}%)`);
    }
    
    console.log();
    console.log("Method Descriptions:");
    console.log("  closest:   Finds most similar historical weeks");
    console.log("  average:   Weighted average of all weeks");
    console.log("  median:    Robust average (ignores outliers)");
    console.log("  dayofweek: Averages only same day of week");
    console.log();
    console.log("Metrics:");
    console.log("  MAE:  Mean Absolute Error (lower is better)");
    console.log("  MAPE: Mean Absolute Percentage Error");
    console.log("  RMSE: Root Mean Square Error");
}

// Run if called directly
runPredictionTests();
