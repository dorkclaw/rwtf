/**
 * Prediction Evaluation Script
 * 
 * Run with: npx ts-node evaluate_predictions.ts
 * 
 * Tests how well each prediction method performs at different
 * time horizons (2h, 4h, 6h, 8h of known data).
 */

import { getConnection } from "./database.js";
import {
    makeClosestLine,
    makeAverageLine,
    makeDayOfWeekLine,
    GymDataWeek,
    GymDataPiece
} from "./gym_math.js";

interface TestResult {
    horizonHours: number;
    method: string;
    mae: number;      // Mean Absolute Error
    mape: number;     // Mean Absolute Percentage Error  
    rmse: number;     // Root Mean Square Error
    count: number;
}

interface MethodStats {
    mae: number;
    mape: number;
    rmse: number;
    count: number;
}

interface HorizonResults {
    horizonHours: number;
    methods: { [method: string]: MethodStats };
    bestMethod: string;
}

// Get all gym data within a date range
async function getGymData(startDate: Date, endDate: Date): Promise<GymDataPiece[]> {
    const conn = await getConnection();
    try {
        const rows = await conn.query(
            `SELECT auslastung, created_at 
             FROM rwth_gym 
             WHERE created_at >= ? AND created_at <= ?
             ORDER BY created_at`,
            [startDate, endDate]
        );
        return rows as GymDataPiece[];
    } finally {
        conn.end();
    }
}

// Get data for a specific day, grouped by hour
async function getDayData(date: Date): Promise<GymDataPiece[]> {
    const conn = await getConnection();
    try {
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);
        
        const rows = await conn.query(
            `SELECT AVG(auslastung) as auslastung, 
                    DATE_FORMAT(created_at, '%Y-%m-%d %H:00') as hour
             FROM rwth_gym 
             WHERE created_at >= ? AND created_at <= ?
             GROUP BY hour
             ORDER BY hour`,
            [startOfDay, endOfDay]
        );
        
        return (rows as any[]).map(r => ({
            auslastung: r.auslastung,
            created_at: r.hour
        }));
    } finally {
        conn.end();
    }
}

// Get weeks of historical data (excluding today)
async function getHistoricalWeeks(weeksBack: number = 4): Promise<GymDataWeek[]> {
    const conn = await getConnection();
    try {
        const result: GymDataWeek[] = [];
        const today = new Date();
        
        for (let w = 1; w <= weeksBack; w++) {
            const weekStart = new Date(today.getTime() - w * 7 * 24 * 60 * 60 * 1000);
            const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
            
            const rows = await conn.query(
                `SELECT AVG(auslastung) as auslastung,
                        DATE_FORMAT(created_at, '%Y-%m-%d %H:00') as hour
                 FROM rwth_gym 
                 WHERE created_at >= ? AND created_at <= ?
                 GROUP BY hour
                 ORDER BY hour`,
                [weekStart, weekEnd]
            ) as any[];
            
            result.push({
                data: rows.map(r => ({
                    auslastung: r.auslastung,
                    created_at: r.hour
                })),
                weight: 1 / w
            });
        }
        
        return result;
    } finally {
        conn.end();
    }
}

// Test predictions for a single day
async function testDay(
    date: Date,
    historicalWeeks: GymDataWeek[],
    knownHours: number
): Promise<{ [method: string]: TestResult[] }> {
    const todayData = await getDayData(date);
    if (todayData.length < knownHours + 2) {
        return {}; // Not enough data
    }
    
    const knownData = todayData.filter(d => {
        const hour = new Date(d.created_at).getHours();
        return hour <= knownHours;
    });
    
    const actualData = todayData.filter(d => {
        const hour = new Date(d.created_at).getHours();
        return hour > knownHours && hour <= 22;
    });
    
    if (knownData.length === 0 || actualData.length === 0) {
        return {};
    }
    
    const dayOfWeek = date.getDay();
    const todayWeek: GymDataWeek = { data: knownData, weight: 1 };
    
    // Get predictions for each method
    const predictions: { [method: string]: GymDataPiece[] } = {
        closest: makeClosestLine([todayWeek, ...historicalWeeks], knownData),
        average: makeAverageLine([todayWeek, ...historicalWeeks]),
        median: makeAverageLine([todayWeek, ...historicalWeeks], true),
        dayofweek: makeDayOfWeekLine(historicalWeeks, dayOfWeek)
    };
    
    const results: { [method: string]: TestResult[] } = {};
    
    for (const [method, predictedData] of Object.entries(predictions)) {
        results[method] = [];
        
        for (const actual of actualData) {
            const actualTime = new Date(actual.created_at);
            const actualHour = actualTime.getHours();
            
            // Find closest prediction
            let closest = predictedData[0];
            let minDiff = Infinity;
            for (const p of predictedData) {
                const predTime = new Date(p.created_at);
                const predHour = predTime.getHours();
                const diff = Math.abs(predHour - actualHour);
                if (diff < minDiff) {
                    minDiff = diff;
                    closest = p;
                }
            }
            
            if (closest) {
                const error = actual.auslastung - closest.auslastung;
                results[method].push({
                    horizonHours: knownHours,
                    method,
                    mae: Math.abs(error),
                    mape: actual.auslastung > 5 ? (Math.abs(error) / actual.auslastung) * 100 : 0,
                    rmse: error * error,
                    count: 1
                });
            }
        }
    }
    
    return results;
}

// Run full evaluation
async function evaluatePredictions() {
    console.log("=".repeat(70));
    console.log("RWTF Prediction Method Evaluation");
    console.log("=".repeat(70));
    console.log();
    
    // Get historical data
    console.log("Loading historical data...");
    const historicalWeeks = await getHistoricalWeeks(4);
    console.log(`Loaded ${historicalWeeks.length} weeks of data`);
    console.log();
    
    // Test days in the last 2 weeks
    const testDays: Date[] = [];
    const today = new Date();
    for (let d = 1; d <= 14; d++) {
        const date = new Date(today.getTime() - d * 24 * 60 * 60 * 1000);
        // Skip weekends for cleaner results
        if (date.getDay() !== 0 && date.getDay() !== 6) {
            testDays.push(date);
        }
    }
    console.log(`Testing on ${testDays.length} weekdays...`);
    console.log();
    
    const horizons = [2, 4, 6, 8, 10, 12];
    const allResults: { [horizon: number]: { [method: string]: TestResult[] } } = {};
    
    for (const h of horizons) {
        allResults[h] = { closest: [], average: [], median: [], dayofweek: [] };
    }
    
    // Run tests
    for (const day of testDays) {
        console.log(`Testing ${day.toISOString().split('T')[0]}...`);
        for (const h of horizons) {
            const dayResults = await testDay(day, historicalWeeks, h);
            for (const [method, results] of Object.entries(dayResults)) {
                allResults[h][method].push(...(results as any));
            }
        }
    }
    
    console.log();
    console.log("Results:");
    console.log("=".repeat(70));
    console.log();
    
    // Calculate and display results
    const horizonResults: HorizonResults[] = [];
    
    for (const h of horizons) {
        const methods: { [method: string]: MethodStats } = {};
        let bestMAE = Infinity;
        let bestMethod = 'closest';
        
        for (const method of ['closest', 'average', 'median', 'dayofweek']) {
            const results = allResults[h][method];
            if (results.length === 0) continue;
            
            const mae = results.reduce((s, r) => s + r.mae, 0) / results.length;
            const mape = results.reduce((s, r) => s + r.mape, 0) / results.length;
            const rmse = Math.sqrt(results.reduce((s, r) => s + r.rmse, 0) / results.length);
            
            methods[method] = { mae, mape, rmse, count: results.length };
            
            if (mae < bestMAE) {
                bestMAE = mae;
                bestMethod = method;
            }
        }
        
        horizonResults.push({ horizonHours: h, methods, bestMethod });
        
        console.log(`With first ${h}h known:`);
        console.log(`  ${"Method".padEnd(12)} ${"MAE".padEnd(10)} ${"MAPE".padEnd(10)} ${"RMSE".padEnd(10)} ${"Count".padEnd(8)}`);
        console.log(`  ${"-".repeat(50)}`);
        
        for (const [method, stats] of Object.entries(methods)) {
            const marker = method === bestMethod ? " ←BEST" : "";
            console.log(
                `  ${method.padEnd(12)} ` +
                `${stats.mae.toFixed(2).padEnd(10)} ` +
                `${stats.mape.toFixed(2).padEnd(10)} ` +
                `${stats.rmse.toFixed(2).padEnd(10)} ` +
                `${stats.count.toString().padEnd(8)}${marker}`
            );
        }
        console.log();
    }
    
    // Summary
    console.log("=".repeat(70));
    console.log("SUMMARY");
    console.log("=".repeat(70));
    console.log();
    
    // Count wins
    const wins: { [method: string]: number } = {};
    for (const r of horizonResults) {
        wins[r.bestMethod] = (wins[r.bestMethod] || 0) + 1;
    }
    
    console.log("Best method by time horizon:");
    for (const r of horizonResults) {
        console.log(`  ${r.horizonHours}h known → ${r.bestMethod} (MAE: ${r.methods[r.bestMethod].mae.toFixed(2)}%)`);
    }
    console.log();
    
    console.log("Overall wins:");
    for (const [method, count] of Object.entries(wins)) {
        console.log(`  ${method}: ${count}/${horizonResults.length}`);
    }
    console.log();
    
    // Recommendation
    const overallBest = Object.entries(wins).sort((a, b) => b[1] - a[1])[0];
    console.log(`RECOMMENDATION: Use "${overallBest[0]}" as the default prediction method.`);
    console.log();
    
    // Usage notes
    console.log("Usage notes:");
    console.log("  • Early in the day (2-4h known): 'closest' finds similar patterns");
    console.log("  • Later in the day (8+h known): 'average' or 'dayofweek' may be better");
    console.log("  • 'median' is robust to outliers but may be conservative");
    console.log("  • Consider using different methods for different use cases");
}

// Export for use in other files
export { evaluatePredictions, testDay, getHistoricalWeeks };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    evaluatePredictions().catch(console.error);
}
