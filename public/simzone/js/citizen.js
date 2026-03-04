import { CONFIG } from './config.js';

export class Citizen {
    constructor(id, x, y) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.homeX = x;
        this.homeY = y;
        this.workX = -1;
        this.workY = -1;

        // Economic Status
        this.cash = 0;
        this.savings = 0;
        this.debt = 0;
        this.income = 0; // Daily
        this.expenses = 0; // Daily fixed

        // State
        this.employed = false;
        this.homeless = false;
        this.happiness = 50; // 0-100

        this.initializeStats();
    }

    initializeStats() {
        // Randomize initial state based on a rough bell curve
        const rand = Math.random();

        if (rand < 0.2) {
            // Low income
            this.income = (CONFIG.MIN_WAGE / 30) * (0.8 + Math.random() * 0.4);
            this.savings = Math.random() * 500;
        } else if (rand < 0.8) {
            // Middle income
            this.income = (CONFIG.MIN_WAGE / 30) * (1.5 + Math.random() * 2);
            this.savings = 1000 + Math.random() * 5000;
        } else {
            // High income
            this.income = (CONFIG.MIN_WAGE / 30) * (5 + Math.random() * 10);
            this.savings = 10000 + Math.random() * 50000;
        }

        this.employed = true;
        this.cash = this.savings * 0.1; // Keep some cash on hand
    }

    updateDaily(economy) {
        // 1. Receive Income
        let dailyIncome = this.employed ? this.income : 0;

        // Apply Tax
        const tax = dailyIncome * economy.taxRate;
        const netIncome = dailyIncome - tax;
        economy.collectTax(tax);

        // Receive Welfare/UBI
        const benefits = economy.ubi;

        // 2. Pay Expenses
        let dailyExpenses = CONFIG.FOOD_COST_DAILY + CONFIG.TRANSPORT_COST_DAILY;

        // Rent/Housing
        let housingCost = 0;
        if (!this.homeless) {
            // Simplified: Rent is proportional to income for now, or fixed based on zone
            // For now, let's say rent is 30% of expected income
            housingCost = this.income * 0.3;
        }

        const totalDailyChange = netIncome + benefits - dailyExpenses - housingCost;

        this.cash += totalDailyChange;

        // 3. Check Solvency
        if (this.cash < 0) {
            if (this.savings > -this.cash) {
                // Dip into savings
                this.savings += this.cash; // cash is negative
                this.cash = 0;
            } else {
                // Debt / Homelessness
                this.debt += -this.cash;
                this.cash = 0;

                if (this.debt > this.income * 60) { // 2 months income debt limit
                    this.becomeHomeless();
                }
            }
        } else {
            // Save excess cash
            if (this.cash > this.income * 2) {
                const toSave = this.cash - this.income;
                this.savings += toSave;
                this.cash -= toSave;
            }
        }
    }

    becomeHomeless() {
        if (!this.homeless) {
            this.homeless = true;
            this.happiness -= 20;
            // Move to random spot or stay put?
        }
    }

    get netWorth() {
        return this.cash + this.savings - this.debt;
    }
}
